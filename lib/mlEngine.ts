/* =============================================================================
 * MOTOR ANALÍTICO DO BUSCASML
 * Funções puras (sem I/O), usadas pelo backend (app/api/ml/route.ts) e pelo
 * frontend (app/page.tsx):
 *   - estimativa de vendas a partir da faixa pública ("+100 vendidos");
 *   - giro e faturamento diário, semanal e mensal;
 *   - alerta por idade do anúncio;
 *   - comissão e taxa fixa por faixa de preço (Clássico e Premium);
 *   - calculadora de custo total, margem de contribuição e preço sugerido;
 *   - extrator de palavras-chave de títulos.
 * ============================================================================= */

export type ListingTypeId = 'gold_special' | 'gold_pro';
export const LISTING_TYPES: ListingTypeId[] = ['gold_special', 'gold_pro'];
export const LISTING_TYPE_LABEL: Record<ListingTypeId, string> = {
  gold_special: 'Clássico',
  gold_pro: 'Premium',
};

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 30.44;

function finite(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(value: number, min: number, max: number | null): number {
  return max !== null ? Math.min(Math.max(value, min), max) : Math.max(value, min);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function daysBetween(fromIso: string | null | undefined, now: Date = new Date()): number | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/* =============================================================================
 * VENDAS: leitura do marcador público e estimativa por faixa
 * ============================================================================= */

/** Faixas oficiais de "vendidos" exibidas pelo Mercado Livre. */
export const SALES_TIERS = [1, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 10000, 20000, 50000, 100000, 250000];
/** Até este valor o ML mostra o número exato ("3 vendidos"). */
export const EXACT_PUBLIC_MAX = 4;
/** Vendas por avaliação usadas na ponderação. */
export const SALES_PER_REVIEW = 15;

/** "+5 mil vendidos" -> 5000 ; "+100 vendidos" -> 100 ; "1 vendido" -> 1 */
export function parseSoldText(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.trim().match(/\+?\s*(\d[\d.,]*)\s*(mil|m)?\s*vendid[oa]s?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  const mult = unit === 'mil' ? 1e3 : unit === 'm' ? 1e6 : 1;
  return Math.round(n * mult);
}

function tierFloor(value: number): number | null {
  let found: number | null = null;
  for (const t of SALES_TIERS) if (value >= t) found = t;
  return found;
}

function nextTier(tier: number): number | null {
  const i = SALES_TIERS.indexOf(tier);
  return i < 0 || i >= SALES_TIERS.length - 1 ? null : SALES_TIERS[i + 1];
}

/** Ajuste por maturidade: anúncios novos aceleram, anúncios antigos desaceleram. */
export function ageAdjustment(months: number): number {
  if (months < 6) return 0.15;
  if (months <= 12) return 0;
  return -0.25;
}

export type SalesEstimateInput = {
  soldText: string | null;
  reviewsCount: number | null;
  createdAt: string | null;
  listingTypeId: string | null;
  now?: Date;
};

export type SalesEstimate = {
  publicValue: number;
  tier: number;
  nextTier: number | null;
  minSales: number;
  maxSales: number | null;
  rangeCenter: number;
  rangeCenterAdjusted: number;
  reviewsEstimate: number | null;
  reviewsEstimateAdjusted: number | null;
  consolidated: number;
  final: number;
  ageDays: number | null;
  ageMonths: number | null;
  ageAdjustment: number | null;
  monthlyPace: number | null;
  explanation: string[];
};

export type SalesEstimateResult =
  | ({ status: 'ok' } & SalesEstimate)
  | { status: 'unavailable'; reason: 'no_sold_text' | 'invalid_tier' };

/**
 * Estima o total de vendas quando o ML mostra apenas a faixa pública.
 *  1. Faixa: mínimo = patamar, máximo = próximo patamar - 1 (até 4 o número é exato).
 *  2. Centro da faixa ajustado pela idade (meses = dias / 30,44).
 *  3. Estimativa por avaliações (avaliações × 15), limitada à faixa e ajustada pela idade.
 *  4. Consolidação 0,6 × avaliações + 0,4 × faixa; Premium × 1,15; resultado limitado à faixa.
 *  5. Ritmo mensal atual = 0,4 × estimativa / (meses / 3).
 */
export function estimateSales(input: SalesEstimateInput): SalesEstimateResult {
  const now = input.now ?? new Date();
  if (!input.soldText?.trim()) return { status: 'unavailable', reason: 'no_sold_text' };
  const value = parseSoldText(input.soldText);
  if (value === null) return { status: 'unavailable', reason: 'invalid_tier' };

  let tier: number;
  let min: number;
  let max: number | null;
  if (Number.isInteger(value) && value >= 1 && value <= EXACT_PUBLIC_MAX) {
    const floor = tierFloor(value);
    if (floor === null) return { status: 'unavailable', reason: 'invalid_tier' };
    tier = floor;
    min = value;
    max = value;
  } else {
    if (!SALES_TIERS.includes(value)) return { status: 'unavailable', reason: 'invalid_tier' };
    tier = value;
    const next = nextTier(tier);
    min = tier;
    max = next !== null ? next - 1 : tier === 250000 ? 499999 : null;
  }
  const next = nextTier(tier);
  const center = max !== null ? Math.round((min + max) / 2) : min;

  let ageDays: number | null = null;
  let ageMonths: number | null = null;
  let adj: number | null = null;
  const created = input.createdAt ? Date.parse(input.createdAt) : NaN;
  if (!Number.isNaN(created)) {
    ageDays = Math.max(0, Math.floor((now.getTime() - created) / DAY_MS));
    ageMonths = ageDays / DAYS_PER_MONTH;
    adj = ageAdjustment(ageMonths);
  }

  const centerAdjusted = clamp(adj !== null ? center * (1 + adj) : center, min, max);

  let reviewsEstimate: number | null = null;
  let reviewsAdjusted: number | null = null;
  if (finite(input.reviewsCount) && input.reviewsCount > 0) {
    reviewsEstimate = clamp(input.reviewsCount * SALES_PER_REVIEW, min, max);
    reviewsAdjusted = adj !== null ? clamp(reviewsEstimate * (1 + adj), min, max) : reviewsEstimate;
  }

  const consolidated = Math.round(
    reviewsAdjusted !== null ? 0.6 * reviewsAdjusted + 0.4 * centerAdjusted : centerAdjusted,
  );
  const premium = input.listingTypeId === 'gold_pro';
  let final = premium ? Math.round(1.15 * consolidated) : consolidated;
  final = Math.round(clamp(Math.max(0, final), min, max));

  let monthlyPace: number | null = null;
  if (ageMonths !== null && ageMonths > 0 && final > 0) {
    const quarters = ageMonths / 3;
    monthlyPace = quarters > 0 ? Math.round((0.4 * final) / quarters) : null;
  }

  const fmt = (n: number) => n.toLocaleString('pt-BR');
  const range = max === null ? `≥ ${fmt(min)}` : min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  const explanation = [
    value <= EXACT_PUBLIC_MAX
      ? `Contagem pública exata do ML (1–${EXACT_PUBLIC_MAX}): ${fmt(min)} vendas.`
      : `Faixa oficial de vendidos: ${range}.`,
    reviewsEstimate !== null
      ? `Avaliações: ${fmt(input.reviewsCount as number)} (× ${SALES_PER_REVIEW} vendas por avaliação).`
      : 'Avaliações ausentes: estimativa apenas pela faixa.',
    ageMonths !== null
      ? `Idade do anúncio: ~${Math.round(ageMonths)} meses (ajuste ${((adj ?? 0) * 100).toFixed(0)}%).`
      : 'Data de criação ausente: sem ajuste por maturidade.',
    premium ? 'Premium: +15% na estimativa final.' : 'Clássico ou tipo desconhecido: sem multiplicador.',
  ];

  return {
    status: 'ok',
    publicValue: value,
    tier,
    nextTier: next,
    minSales: min,
    maxSales: max,
    rangeCenter: center,
    rangeCenterAdjusted: centerAdjusted,
    reviewsEstimate,
    reviewsEstimateAdjusted: reviewsAdjusted,
    consolidated,
    final,
    ageDays,
    ageMonths,
    ageAdjustment: adj,
    monthlyPace,
    explanation,
  };
}

/* =============================================================================
 * GIRO E FATURAMENTO (diário, semanal, mensal e total)
 * ============================================================================= */

export type Periods = { total: number; monthly: number; weekly: number; daily: number };

/** Média de vendas por período. Anúncios com menos de 7/30 dias usam o total no período. */
export function salesVelocity(sold: number | null, days: number | null): Periods | null {
  if (!finite(sold) || !finite(days) || days <= 0 || sold < 0) return null;
  const daily = sold / days;
  return {
    total: sold,
    monthly: days < 30 ? sold : daily * 30,
    weekly: days < 7 ? sold : daily * 7,
    daily,
  };
}

export function revenueFromVelocity(price: number | null, v: Periods | null): Periods | null {
  if (!finite(price) || v === null) return null;
  return {
    total: price * v.total,
    monthly: price * v.monthly,
    weekly: price * v.weekly,
    daily: price * v.daily,
  };
}

/* =============================================================================
 * IDADE DO ANÚNCIO
 * ============================================================================= */

export type AgeAlert = 'ok' | 'warning' | 'danger';

export function ageAlert(days: number | null): AgeAlert | null {
  if (!finite(days)) return null;
  if (days > 365) return 'danger';
  if (days > 180) return 'warning';
  return 'ok';
}

export const AGE_ALERT_LABEL: Record<AgeAlert, string> = {
  ok: 'Anúncio recente (até 180 dias)',
  warning: 'Atenção: mais de 180 dias no ar',
  danger: 'Perigo: mais de 1 ano no ar',
};

/* =============================================================================
 * COMISSÃO E TAXA FIXA POR FAIXA DE PREÇO
 * ============================================================================= */

/** Percentual de comissão por tipo de anúncio, em cada faixa de preço. */
export type RangeFees = Partial<Record<ListingTypeId, number>>;
export type CategoryFees = {
  range_16?: RangeFees; // preço < 29
  range_32?: RangeFees; // preço < 50
  range_64?: RangeFees; // preço < 79
  range_128?: RangeFees; // preço >= 79
};

/** Percentuais padrão usados quando a categoria não informou a tabela real. */
export const DEFAULT_COMMISSION_PCT: Record<ListingTypeId, number> = { gold_special: 12, gold_pro: 17 };

export const DEFAULT_CATEGORY_FEES: CategoryFees = {
  range_16: { ...DEFAULT_COMMISSION_PCT },
  range_32: { ...DEFAULT_COMMISSION_PCT },
  range_64: { ...DEFAULT_COMMISSION_PCT },
  range_128: { ...DEFAULT_COMMISSION_PCT },
};

/** Faixa de comissão que vale para um preço (mesmos cortes usados pelo ML). */
export function feeRangeKey(price: number): keyof CategoryFees {
  if (price < 29) return 'range_16';
  if (price < 50) return 'range_32';
  if (price < 79) return 'range_64';
  return 'range_128';
}

/** Taxa fixa por unidade vendida, por faixa de preço. */
export function fixedFeeFor(price: number, isSupermarket: boolean): number {
  if (isSupermarket) {
    if (price < 30) return 1;
    if (price < 50) return 2;
    if (price < 100) return 4;
    if (price < 199) return 6;
    return 0;
  }
  if (price < 29) return 6.25;
  if (price < 50) return 6.5;
  if (price < 79) return 6.75;
  return 0;
}

export type Commission = {
  percentage: number;
  fixed: number;
  amount: number;
  effectivePct: number;
  sellerReceive: number;
};

/**
 * Comissão do ML para um preço:
 *   - abaixo de R$ 12,50: custo de 50% do preço, sem taxa fixa;
 *   - demais faixas: percentual da categoria + taxa fixa (6,25 / 6,50 / 6,75 / 0);
 *   - supermercado: taxa fixa própria (1 / 2 / 4 / 6 / 0).
 */
export function commissionAt(
  price: number,
  listingTypeId: ListingTypeId,
  fees: CategoryFees | null,
  isSupermarket = false,
): Commission | null {
  if (!finite(price) || price <= 0) return null;
  let percentage: number;
  let fixed: number;
  if (price < 12.5) {
    percentage = 50;
    fixed = 0;
  } else {
    const table = fees ?? DEFAULT_CATEGORY_FEES;
    const pct = table[feeRangeKey(price)]?.[listingTypeId] ?? DEFAULT_COMMISSION_PCT[listingTypeId];
    percentage = pct;
    fixed = price < 29 ? 6.25 : price < 50 ? 6.5 : price < 79 ? 6.75 : 0;
  }
  if (isSupermarket) fixed = fixedFeeFor(price, true);
  const amount = price * (percentage / 100) + fixed;
  return {
    percentage,
    fixed,
    amount,
    effectivePct: (amount / price) * 100,
    sellerReceive: price - amount,
  };
}

/* =============================================================================
 * CALCULADORA (custo total, margem de contribuição e preço sugerido)
 * ============================================================================= */

/** Acima deste preço o frete grátis é obrigatório e o custo (list_cost) é do vendedor. */
export const FREE_SHIPPING_THRESHOLD = 79;
export const MAX_PRICE_ITERATIONS = 10;

export type CalculatorInput = {
  price: number;
  productCost: number;
  extraCost: number;
  /** Alíquota em fração (0,06 = 6%). */
  taxRate: number;
  shippingCost: number;
  /** Quando true, o ML cobre o frete e ele entra como zero. */
  mlCoversShipping: boolean;
  /** Cobra o frete mesmo abaixo de R$ 79 (anúncio com frete grátis por opção do vendedor). */
  shippingBelowThreshold: boolean;
  isSupermarket: boolean;
  fees: CategoryFees | null;
  marginMode: 'pct' | 'brl';
  /** Margem desejada: fração (modo pct) ou reais (modo brl). */
  marginTarget: number;
};

export type CalculatorBreakdown = {
  listingTypeId: ListingTypeId;
  price: number;
  commissionPct: number;
  commission: number;
  fixedFee: number;
  shipping: number;
  tax: number;
  productCost: number;
  extraCost: number;
  totalCost: number;
  contribution: number;
  contributionPct: number;
  netReceive: number;
};

export type SuggestedPrice = {
  listingTypeId: ListingTypeId;
  price: number | null;
  iterations: number;
  converged: boolean;
  breakdown: CalculatorBreakdown | null;
};

function shippingAt(price: number, input: CalculatorInput): number {
  if (input.mlCoversShipping) return 0;
  if (price < FREE_SHIPPING_THRESHOLD && !input.shippingBelowThreshold) return 0;
  return Math.max(0, input.shippingCost);
}

/**
 * Custo total = comissão% × P + taxa fixa + frete + custo + extra + imposto × P
 * Margem de contribuição = P - custo total ; MC% = MC / P
 * Valor líquido a receber = P - comissão - taxa fixa - frete (repasse do ML).
 */
export function breakdownAt(price: number, listingTypeId: ListingTypeId, input: CalculatorInput): CalculatorBreakdown {
  const p = Math.max(0, price);
  const c = commissionAt(p, listingTypeId, input.fees, input.isSupermarket);
  const pct = c ? c.percentage / 100 : 0;
  const fixed = c ? c.fixed : 0;
  const shipping = p > 0 ? shippingAt(p, input) : 0;
  const commission = pct * p;
  const tax = input.taxRate * p;
  const totalCost = roundMoney(commission + fixed + shipping + input.productCost + input.extraCost + tax);
  const contribution = p - totalCost;
  return {
    listingTypeId,
    price: p,
    commissionPct: pct * 100,
    commission: roundMoney(commission),
    fixedFee: fixed,
    shipping: roundMoney(shipping),
    tax: roundMoney(tax),
    productCost: input.productCost,
    extraCost: input.extraCost,
    totalCost,
    contribution: roundMoney(contribution),
    contributionPct: p > 0 ? contribution / p : 0,
    netReceive: roundMoney(p - commission - fixed - shipping),
  };
}

/**
 * Preço sugerido para atingir a margem desejada.
 * Como comissão, taxa fixa e frete mudam com a faixa de preço, o cálculo é
 * repetido (até 10 vezes) até a diferença entre duas rodadas ficar abaixo de R$ 0,01:
 *   margem em %:  P = (custo + extra + fixa + frete) / (1 - imposto - comissão% - margem%)
 *   margem em R$: P = (custo + extra + fixa + frete + margem) / (1 - imposto - comissão%)
 */
export function suggestPrice(listingTypeId: ListingTypeId, input: CalculatorInput): SuggestedPrice {
  const base = input.productCost + input.extraCost;
  let price = base + (input.marginMode === 'brl' ? input.marginTarget : 0);
  if (price <= 0) price = 1;
  let previous = Number.NaN;
  let iterations = 0;
  let feasible = true;

  while (iterations < MAX_PRICE_ITERATIONS && !(Math.abs(price - previous) < 0.01)) {
    previous = price;
    const c = commissionAt(price, listingTypeId, input.fees, input.isSupermarket);
    const pct = c ? c.percentage / 100 : 0;
    const fixed = c ? c.fixed : 0;
    const costs = base + fixed + shippingAt(price, input);
    const denominator =
      input.marginMode === 'pct' ? 1 - input.taxRate - pct - input.marginTarget : 1 - input.taxRate - pct;
    iterations++;
    if (denominator <= 0) {
      feasible = false;
      break;
    }
    price = input.marginMode === 'pct' ? costs / denominator : (costs + input.marginTarget) / denominator;
  }

  if (!feasible || !Number.isFinite(price) || price <= 0) {
    return { listingTypeId, price: null, iterations, converged: false, breakdown: null };
  }
  const rounded = roundMoney(price);
  return {
    listingTypeId,
    price: rounded,
    iterations,
    converged: Math.abs(price - previous) < 0.01,
    breakdown: breakdownAt(rounded, listingTypeId, input),
  };
}

/* =============================================================================
 * EXTRATOR DE PALAVRAS-CHAVE
 * ============================================================================= */

const STOPWORDS = new Set(
  (
    'a o e de da do das dos em no na nos nas um uma uns umas para pra por com sem que se ao aos as os ' +
    'sua seu suas seus mais muito kit novo nova original promocao oferta frete gratis envio ' +
    'imediato pronta entrega cor cores tam unid unidade unidades pecas peca pcs un x'
  ).split(/\s+/),
);

function normalizeToken(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export type KeywordStat = { term: string; count: number; share: number };

/**
 * Conta termos (1 e 2 palavras) pelo número de títulos em que aparecem.
 * Ignora palavras vazias, números puros e termos com menos de 3 letras.
 */
export function extractKeywords(titles: string[], limit = 20): { words: KeywordStat[]; phrases: KeywordStat[] } {
  const wordDocs = new Map<string, { label: string; docs: number }>();
  const phraseDocs = new Map<string, { label: string; docs: number }>();
  const valid = titles.filter((t) => typeof t === 'string' && t.trim() !== '');

  for (const title of valid) {
    const raw = title.split(/[^0-9A-Za-zÀ-ÿ]+/).filter(Boolean);
    const tokens = raw
      .map((w) => ({ label: w.toLowerCase(), key: normalizeToken(w) }))
      .filter((t) => t.key.length >= 3 && !/^\d+$/.test(t.key) && !STOPWORDS.has(t.key));
    const seenWords = new Set<string>();
    for (const t of tokens) {
      if (seenWords.has(t.key)) continue;
      seenWords.add(t.key);
      const cur = wordDocs.get(t.key) ?? { label: t.label, docs: 0 };
      cur.docs++;
      wordDocs.set(t.key, cur);
    }
    const seenPhrases = new Set<string>();
    for (let i = 0; i < tokens.length - 1; i++) {
      const key = `${tokens[i].key} ${tokens[i + 1].key}`;
      if (seenPhrases.has(key)) continue;
      seenPhrases.add(key);
      const cur = phraseDocs.get(key) ?? { label: `${tokens[i].label} ${tokens[i + 1].label}`, docs: 0 };
      cur.docs++;
      phraseDocs.set(key, cur);
    }
  }

  const total = Math.max(1, valid.length);
  const rank = (m: Map<string, { label: string; docs: number }>, minDocs: number): KeywordStat[] =>
    [...m.values()]
      .filter((v) => v.docs >= minDocs)
      .sort((a, b) => b.docs - a.docs || a.label.localeCompare(b.label))
      .slice(0, limit)
      .map((v) => ({ term: v.label, count: v.docs, share: v.docs / total }));

  return { words: rank(wordDocs, 1), phrases: rank(phraseDocs, valid.length > 1 ? 2 : 1) };
}

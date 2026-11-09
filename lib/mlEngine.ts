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

/** Média de vendas por período (função Bc da JoomPulse). Se dias for 0 ou ausente, usa janela de 30 dias. */
export function salesVelocity(sold: number | null, days: number | null): Periods | null {
  if (!finite(sold) || sold < 0) return null;
  const d = finite(days) && days > 0 ? days : 30;
  const daily = sold / d;
  return {
    total: sold,
    monthly: d < 30 ? sold : daily * 30,
    weekly: d < 7 ? sold : daily * 7,
    daily,
  };
}

/** Mapeia uma estimativa base ao maior patamar oficial de vendas do ML ("+100 vendidos", etc.). */
export function tierMarkerFromBase(base: number): string {
  const n = Math.max(1, Math.round(base));
  if (n <= EXACT_PUBLIC_MAX) return `${n} vendidos`;
  const floor = tierFloor(n) ?? SALES_TIERS[0];
  return `+${floor.toLocaleString('pt-BR')} vendidos`;
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

/** Taxa fixa por unidade vendida, por faixa de preço (R$ 6,50 abaixo de R$ 79). */
export function fixedFeeFor(price: number, isSupermarket: boolean): number {
  if (isSupermarket) {
    if (price < 30) return 1;
    if (price < 50) return 2;
    if (price < 100) return 4;
    if (price < 199) return 6;
    return 0;
  }
  if (price < 12.5) return 0;
  if (price < 79) return 6.5;
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
 *   - R$ 12,50 até R$ 78,99: percentual da categoria + taxa fixa de R$ 6,50;
 *   - a partir de R$ 79,00: percentual da categoria, sem taxa fixa (frete grátis);
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
    fixed = price < 79 ? 6.5 : 0;
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

/* =============================================================================
 * ANÁLISE DE QUALIDADE DA LISTAGEM (Auditor SEO & Conversão 0 a 100)
 * Pesos oficiais mapeados: Título (20), Fotos (20), Vídeo/Clipes (15),
 * Ficha Técnica & Descrição (20), Logística (15), Modalidade & Reputação (10)
 * ============================================================================= */

export type ListingQualityStatus = 'ok' | 'warning' | 'missing';
export type ListingQualityLevel = 'Great' | 'Good' | 'NeedAttention' | 'Critical';
export type ListingQualityCriterionId =
  | 'title'
  | 'photos'
  | 'video'
  | 'specs'
  | 'logistics'
  | 'modality';

export type ListingQualityCriterion = {
  id: ListingQualityCriterionId;
  label: string;
  score: number;
  maxScore: number;
  percentage: number;
  status: ListingQualityStatus;
  currentValue: string;
  recommendation: string;
};

export type ListingQualityReport = {
  score: number;
  maxScore: 100;
  level: ListingQualityLevel;
  levelLabel: string;
  summary: string;
  passedCount: number;
  warningCount: number;
  criticalCount: number;
  totalCriteria: 6;
  potentialGain: number;
  conversionSignal: string;
  reputationSignal: string;
  actionPlan: string[];
  criteria: ListingQualityCriterion[];
};

export type ListingQualityInput = {
  title: string | null;
  brand: string | null;
  model: string | null;
  imagesCount: number;
  videosCount: number;
  attributesCount: number;
  descriptionLength: number;
  fulfillment: boolean;
  freeShipping: boolean;
  listingTypeId: string | null;
  listingTypeLabel: string | null;
  price: number | null;
  sellerMedal: string | null;
  reputationLevel: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  dailySales?: number | null;
};

export function evaluateListingQuality(input: ListingQualityInput): ListingQualityReport {
  const cleanTitle = (input.title ?? '')
    .replace(/\s*\|\s*Mercado\s*Li[vb]re.*$/i, '')
    .replace(/\s*-\s*R\$\s*[\d.,]+.*$/i, '')
    .replace(/\s*\|\s*Frete\s+gr[áa]tis.*$/i, '')
    .trim();
  const titleLen = cleanTitle.length;
  const titleWords = cleanTitle.split(/\s+/).filter((w) => w.length >= 2).length;
  const hasSpamSymbols = /[!?*]{2,}|[\u{1F300}-\u{1FAFF}]/u.test(cleanTitle);

  // 1. Título Otimizado — Régua oficial de 60 caracteres (0 a 20 pts)
  let titleScore = 4;
  let titleStatus: ListingQualityStatus = 'missing';
  let titleRec = 'Amplie o título para 50–60 caracteres estruturando: Produto + Marca + Modelo + Especificação Principal.';
  if (titleLen >= 48 && titleLen <= 65 && titleWords >= 6 && !hasSpamSymbols) {
    titleScore = 20;
    titleStatus = 'ok';
    titleRec = `Título calibrado na régua ideal de 60 caracteres (${titleLen}/60) com alta densidade semântica para o buscador.`;
  } else if (titleLen > 65) {
    titleScore = 15;
    titleStatus = 'warning';
    titleRec = `Título acima do limite recomendado de 60 caracteres (${titleLen}/60). Enxugue termos redundantes para evitar corte no mobile.`;
  } else if (titleLen >= 35 && titleWords >= 4) {
    titleScore = hasSpamSymbols ? 11 : 14;
    titleStatus = 'warning';
    titleRec = hasSpamSymbols
      ? 'Remova emojis/pontuação repetida e aproveite até 60 caracteres com termos reais de busca do comprador.'
      : `Faltam ~${Math.max(4, 58 - titleLen)} caracteres para o teto ideal de 60 (${titleLen}/60). Adicione cor, medida, material ou aplicação.`;
  } else if (titleLen >= 20) {
    titleScore = 8;
    titleStatus = 'missing';
    titleRec = 'Título curto desperdiça tráfego orgânico de cauda longa. Expanda para 50–60 caracteres sem repetir palavras.';
  }

  // 2. Galeria de Fotos e Resolução HD (0 a 20 pts — >= 6 fotos: 20; 4..5: 15; 2..3: 10; 1: 5; 0: 0)
  const imgs = Math.max(0, Math.round(input.imagesCount));
  let photoScore = 0;
  let photoStatus: ListingQualityStatus = 'missing';
  let photoRec = 'Suba ao menos 6 imagens em alta resolução (1200x1200px), sendo a 1ª em fundo branco puro.';
  if (imgs >= 6) {
    photoScore = 20;
    photoStatus = 'ok';
    photoRec = `Galeria completa (${imgs} fotos em alta definição). Mantenha capa limpa, foto ambientada e tabela de medidas.`;
  } else if (imgs >= 4) {
    photoScore = 15;
    photoStatus = 'warning';
    photoRec = `Boa galeria (${imgs} fotos), mas adicionar mais ${6 - imgs} imagem(ns) (detalhes, medidas e embalagem) garante nota máxima.`;
  } else if (imgs >= 2) {
    photoScore = 10;
    photoStatus = 'warning';
    photoRec = `Apenas ${imgs} fotos cadastradas. Suba para 6–10 imagens HD (1200x1200px) para elevar a taxa de conversão.`;
  } else if (imgs >= 1) {
    photoScore = 5;
    photoStatus = 'missing';
    photoRec = `Crítico: apenas ${imgs} foto(s). Compradores evitam anúncios sem ângulos reais, medidas e conteúdo da caixa.`;
  }

  // 3. Vídeo / Clipe no Anúncio (0 a 15 pts — com vídeo/clip: 15; sem vídeo: 0)
  const vids = Math.max(0, Math.round(input.videosCount));
  const videoScore = vids >= 1 ? 15 : 0;
  const videoStatus: ListingQualityStatus = vids >= 1 ? 'ok' : 'missing';
  const videoRec =
    vids >= 1
      ? 'Anúncio possui vídeo/clipe ativo, destravando distribuição gratuita na aba Clips e maior retenção no anúncio.'
      : 'Sem vídeo/clipe (-15 pts). Publique um vídeo vertical de 15s a 60s demonstrando o produto em uso no ML Clips.';

  // 4. Ficha Técnica Estruturada & Descrição (0 a 20 pts — >= 8 attrs + desc: 20; 5..7: 14; 2..4: 8; < 2: 3)
  const hasRealBrand = Boolean(input.brand && !/^(gen[eé]rica|linha\s)/i.test(input.brand));
  const hasRealModel = Boolean(input.model && input.model.trim().length >= 2);
  const attrCount = Math.max(
    0,
    Math.round(input.attributesCount) +
      (input.attributesCount === 0 ? (hasRealBrand ? 1 : 0) + (hasRealModel ? 1 : 0) : 0),
  );
  const hasDesc = input.descriptionLength >= 100;
  let specsScore = 3;
  let specsStatus: ListingQualityStatus = 'missing';
  let specsRec = 'Preencha ao menos 8 atributos da Ficha Técnica (Marca, Modelo, EAN/GTIN, dimensões, material) e descrição completa.';
  if (attrCount >= 8 && hasDesc) {
    specsScore = 20;
    specsStatus = 'ok';
    specsRec = 'Ficha técnica completa (8+ atributos) aliada à descrição detalhada, indexando o anúncio nos filtros laterais.';
  } else if (attrCount >= 8 || (attrCount >= 5 && hasDesc)) {
    specsScore = 16;
    specsStatus = 'ok';
    specsRec = hasDesc
      ? 'Boa cobertura técnica! Revise campos opcionais como código universal (EAN/GTIN) e garantia.'
      : 'Atributos preenchidos, mas a descrição textual está curta — adicione benefícios, modo de uso e itens inclusos.';
  } else if (attrCount >= 5 || (attrCount >= 3 && hasDesc)) {
    specsScore = 14;
    specsStatus = 'warning';
    specsRec = `Complete mais ${Math.max(2, 8 - attrCount)} atributos na Ficha Técnica para aparecer quando o comprador filtrar especificações.`;
  } else if (attrCount >= 2 || hasDesc) {
    specsScore = 8;
    specsStatus = 'missing';
    specsRec = 'Ficha técnica incompleta reduz drasticamente o alcance orgânico. Preencha Marca, Modelo, EAN e medidas exatas.';
  }

  // 5. Logística Competitiva (0 a 15 pts — Full + Frete Grátis: 15; só Full ou só Frete Grátis: 10; frete pago padrão: 3)
  let logScore = 3;
  let logStatus: ListingQualityStatus = 'missing';
  let logValue = 'Envio padrão (frete pago pelo comprador)';
  let logRec = 'Anúncio sem Full e sem Frete Grátis perde prioridade de exposição. Avalie envio ao Full ou kits acima de R$ 79.';
  if (input.fulfillment && input.freeShipping) {
    logScore = 15;
    logStatus = 'ok';
    logValue = 'Mercado Envios Full + Frete Grátis';
    logRec = 'Configuração logística máxima! Selo Full + Frete Grátis garante máxima conversão e prioridade no BuyBox.';
  } else if (input.fulfillment) {
    logScore = 11;
    logStatus = 'ok';
    logValue = 'Mercado Envios Full (ticket < R$ 79)';
    logRec = 'Estoque no Full entrega rápido e converte bem; teste variação em kit ≥ R$ 79 para destravar Frete Grátis.';
  } else if (input.freeShipping) {
    logScore = 10;
    logStatus = 'warning';
    logValue = 'Frete Grátis (Coleta / Agência)';
    logRec = 'Oferece Frete Grátis, mas migrar os SKUs campeões para o Mercado Envios Full multiplica a exposição orgânica.';
  }

  // 6. Modalidade & Reputação (0 a 10 pts — Premium ou Clássico com reputação verde: 8–10; básico: 4)
  const isPremium = input.listingTypeId === 'gold_pro' || /premium/i.test(input.listingTypeLabel ?? '');
  const medalTxt = input.sellerMedal ?? '';
  const hasTopRep =
    /platinum|gold|l[ií]der|loja oficial|verde/i.test(medalTxt) ||
    input.reputationLevel === '5_green' ||
    input.reputationLevel === '4_light_green';
  let modScore = 4;
  let modStatus: ListingQualityStatus = 'missing';
  const modLabel = isPremium ? 'Premium (Sem juros)' : 'Clássico';
  let modRec = 'Recupere o termômetro verde entregando no prazo e avalie modalidade Premium para tickets acima de R$ 100.';
  if (isPremium && hasTopRep) {
    modScore = 10;
    modStatus = 'ok';
    modRec = 'Exposição máxima Premium com parcelamento sem juros combinada com reputação verde do vendedor.';
  } else if (!isPremium && hasTopRep) {
    modScore = input.price !== null && input.price < 100 ? 9 : 8;
    modStatus = input.price !== null && input.price < 100 ? 'ok' : 'warning';
    modRec =
      input.price !== null && input.price < 100
        ? 'Modalidade Clássico bem ajustada ao ticket acessível com termômetro verde.'
        : 'Termômetro forte no Clássico; avalie espelhar o item no Premium para capturar compradores que buscam 10x–12x sem juros.';
  } else if (isPremium) {
    modScore = 7;
    modStatus = 'warning';
    modRec = 'Modalidade Premium ativa, porém a reputação da conta precisa atingir verde escuro para destravar todo o tráfego.';
  }

  const criteria: ListingQualityCriterion[] = [
    {
      id: 'title',
      label: 'Título & Palavras-Chave (SEO)',
      score: titleScore,
      maxScore: 20,
      percentage: Math.round((titleScore / 20) * 100),
      status: titleStatus,
      currentValue: `${titleLen}/60 caracteres · ${titleWords} palavras`,
      recommendation: titleRec,
    },
    {
      id: 'photos',
      label: 'Galeria de Fotos & Resolução',
      score: photoScore,
      maxScore: 20,
      percentage: Math.round((photoScore / 20) * 100),
      status: photoStatus,
      currentValue: `${imgs} ${imgs === 1 ? 'foto em alta definição' : 'fotos em alta definição'}`,
      recommendation: photoRec,
    },
    {
      id: 'video',
      label: 'Vídeo / Clipe Demonstrativo',
      score: videoScore,
      maxScore: 15,
      percentage: Math.round((videoScore / 15) * 100),
      status: videoStatus,
      currentValue: vids >= 1 ? `${vids} vídeo/clipe publicado` : 'Ausente (sem vídeo/clipe)',
      recommendation: videoRec,
    },
    {
      id: 'specs',
      label: 'Ficha Técnica & Descrição',
      score: specsScore,
      maxScore: 20,
      percentage: Math.round((specsScore / 20) * 100),
      status: specsStatus,
      currentValue:
        attrCount > 0
          ? `${attrCount} atributo(s)${hasDesc ? ` · Descrição (${input.descriptionLength} caract.)` : ' · Descrição curta'}`
          : hasDesc
            ? `Poucos atributos · Descrição (${input.descriptionLength} caract.)`
            : 'Ficha técnica incompleta',
      recommendation: specsRec,
    },
    {
      id: 'logistics',
      label: 'Logística & Frete',
      score: logScore,
      maxScore: 15,
      percentage: Math.round((logScore / 15) * 100),
      status: logStatus,
      currentValue: logValue,
      recommendation: logRec,
    },
    {
      id: 'modality',
      label: 'Modalidade & Reputação',
      score: modScore,
      maxScore: 10,
      percentage: Math.round((modScore / 10) * 100),
      status: modStatus,
      currentValue: `${modLabel}${medalTxt ? ` · ${medalTxt}` : ''}`,
      recommendation: modRec,
    },
  ];

  const rawScore = criteria.reduce((sum, c) => sum + c.score, 0);
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));
  const passedCount = criteria.filter((c) => c.status === 'ok').length;
  const warningCount = criteria.filter((c) => c.status === 'warning').length;
  const criticalCount = criteria.filter((c) => c.status === 'missing').length;
  const potentialGain = Math.max(0, 100 - score);

  const actionPlan = criteria
    .filter((c) => c.status !== 'ok')
    .sort((a, b) => (b.maxScore - b.score) - (a.maxScore - a.score))
    .map((c) => `(+${c.maxScore - c.score} pts em ${c.label}) ${c.recommendation}`);

  const daily = input.dailySales ?? null;
  const ratingAvg = input.ratingAverage ?? null;
  const ratingCnt = input.ratingCount ?? 0;
  const conversionSignal =
    daily !== null && daily >= 3
      ? `Conversão forte (~${daily.toFixed(1).replace('.', ',')} vendas/dia)`
      : daily !== null && daily >= 0.5
        ? `Conversão moderada (~${daily.toFixed(1).replace('.', ',')} vendas/dia)`
        : (ratingCnt ?? 0) >= 25 && (ratingAvg ?? 0) >= 4.6
          ? `Boa prova social (${ratingCnt} avaliações · nota ${ratingAvg?.toFixed(1).replace('.', ',')})`
          : 'Baixa tração/prova social — priorize melhorias visuais, preço competitivo e Ads inicial';

  const reputationSignal = hasTopRep
    ? `Conta saudável (${medalTxt || 'Termômetro Verde'})`
    : 'Atenção à reputação do vendedor — atrasos e reclamações penalizam o posicionamento orgânico';

  let level: ListingQualityLevel = 'Critical';
  let levelLabel = 'Crítico';
  let summary = 'Anúncio com falhas críticas de cadastro, mídia ou logística que travam impressões e vendas.';
  if (score >= 85) {
    level = 'Great';
    levelLabel = 'Excelente';
    summary = 'Anúncio altamente otimizado nos 6 pilares de SEO e conversão do Mercado Livre.';
  } else if (score >= 70) {
    level = 'Good';
    levelLabel = 'Bom';
    summary = 'Estrutura competitiva! Corrigir os pontos pendentes abaixo pode elevar o anúncio acima de 90 pontos.';
  } else if (score >= 50) {
    level = 'NeedAttention';
    levelLabel = 'Requer Atenção';
    summary = 'Anúncio perde cliques e posições para concorrentes mais completos. Siga o plano de ação prioritário.';
  }

  return {
    score,
    maxScore: 100,
    level,
    levelLabel,
    summary,
    passedCount,
    warningCount,
    criticalCount,
    totalCriteria: 6,
    potentialGain,
    conversionSignal,
    reputationSignal,
    actionPlan,
    criteria,
  };
}

/* =============================================================================
 * ESTADOS BRASILEIROS (UF) — NORMALIZAÇÃO PARA PRODUTOS LOCAIS
 * ============================================================================= */

export const BRAZIL_UFS: { code: string; name: string; region: string }[] = [
  { code: 'SP', name: 'São Paulo', region: 'Sudeste' },
  { code: 'PR', name: 'Paraná', region: 'Sul' },
  { code: 'SC', name: 'Santa Catarina', region: 'Sul' },
  { code: 'MG', name: 'Minas Gerais', region: 'Sudeste' },
  { code: 'RJ', name: 'Rio de Janeiro', region: 'Sudeste' },
  { code: 'RS', name: 'Rio Grande do Sul', region: 'Sul' },
  { code: 'GO', name: 'Goiás', region: 'Centro-Oeste' },
  { code: 'ES', name: 'Espírito Santo', region: 'Sudeste' },
  { code: 'BA', name: 'Bahia', region: 'Nordeste' },
  { code: 'PE', name: 'Pernambuco', region: 'Nordeste' },
  { code: 'CE', name: 'Ceará', region: 'Nordeste' },
  { code: 'DF', name: 'Distrito Federal', region: 'Centro-Oeste' },
  { code: 'MT', name: 'Mato Grosso', region: 'Centro-Oeste' },
  { code: 'MS', name: 'Mato Grosso do Sul', region: 'Centro-Oeste' },
  { code: 'PB', name: 'Paraíba', region: 'Nordeste' },
  { code: 'RN', name: 'Rio Grande do Norte', region: 'Nordeste' },
  { code: 'PA', name: 'Pará', region: 'Norte' },
  { code: 'AM', name: 'Amazonas', region: 'Norte' },
  { code: 'AL', name: 'Alagoas', region: 'Nordeste' },
  { code: 'SE', name: 'Sergipe', region: 'Nordeste' },
  { code: 'MA', name: 'Maranhão', region: 'Nordeste' },
  { code: 'PI', name: 'Piauí', region: 'Nordeste' },
  { code: 'RO', name: 'Rondônia', region: 'Norte' },
  { code: 'TO', name: 'Tocantins', region: 'Norte' },
  { code: 'AC', name: 'Acre', region: 'Norte' },
  { code: 'AP', name: 'Amapá', region: 'Norte' },
  { code: 'RR', name: 'Roraima', region: 'Norte' },
];

const UF_CODE_SET = new Set(BRAZIL_UFS.map((u) => u.code));
const UF_BY_NORMALIZED_NAME = new Map<string, string>(
  BRAZIL_UFS.map((u) => [
    u.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
    u.code,
  ]),
);

/** Normaliza "BR-SP", "São Paulo", "SP", etc. para a sigla oficial de 2 letras ("SP"). */
export function normalizeUf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^BR[-_\s]/i, '').trim();
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (UF_CODE_SET.has(upper)) return upper;
  const normName = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return UF_BY_NORMALIZED_NAME.get(normName) ?? null;
}

/* =============================================================================
 * PESO FÍSICO vs. PESO CUBADO (CALCULADORA DE MARGEM EXPANDIDA)
 * ============================================================================= */

export type ShippingWeightAnalysis = {
  physicalWeightGrams: number;
  volumetricWeightGrams: number;
  billableWeightGrams: number;
  weightType: 'físico' | 'cubado';
  suggestedMeliShippingBrl: number;
};

/**
 * Calcula Peso Cubado = (C × L × A em cm) / 6000 (em kg) -> gramas
 * e retorna o peso faturável (maior entre físico e cubado) + estimativa de frete Mercado Envios (Líder/Verde).
 */
export function computeShippingWeight(
  physicalWeightGrams: number,
  lengthCm: number,
  widthCm: number,
  heightCm: number,
): ShippingWeightAnalysis {
  const phys = Math.max(0, Math.round(physicalWeightGrams));
  const hasDims = lengthCm > 0 && widthCm > 0 && heightCm > 0;
  const volKg = hasDims ? (lengthCm * widthCm * heightCm) / 6000 : 0;
  const volGrams = Math.max(0, Math.round(volKg * 1000));
  const billable = Math.max(phys, volGrams);
  const weightType: 'físico' | 'cubado' = volGrams > phys ? 'cubado' : 'físico';

  // Tabela de referência Mercado Envios (50% desconto reputação verde/Líder em itens ≥ R$ 79)
  let suggested = 21.45;
  if (billable <= 300) suggested = 18.95;
  else if (billable <= 500) suggested = 19.95;
  else if (billable <= 1000) suggested = 21.45;
  else if (billable <= 2000) suggested = 23.45;
  else if (billable <= 5000) suggested = 28.95;
  else if (billable <= 9000) suggested = 42.9;
  else if (billable <= 13000) suggested = 63.9;
  else suggested = 84.9;

  return {
    physicalWeightGrams: phys,
    volumetricWeightGrams: volGrams,
    billableWeightGrams: billable,
    weightType,
    suggestedMeliShippingBrl: suggested,
  };
}

/* =============================================================================
 * ANÁLISE CONSOLIDADA DE CATEGORIA / NICHO
 * Monopólio (Top 5 Vendedores e Top 5 Marcas), Faixas de Preço e Logística
 * ============================================================================= */

export type CategorySampleInput = {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  monthlySales: number;
  monthlyRevenue: number;
  fulfillment: boolean;
  freeShipping: boolean;
  isCatalog: boolean;
  isInternational: boolean;
  listingTypeId: string | null;
  sellerId: number | null;
  sellerNickname: string | null;
  sellerMedal?: string | null;
  officialStoreId?: number | null;
};

export type CategoryLeaderRow = {
  name: string;
  id: string | null;
  listingsCount: number;
  monthlySales: number;
  monthlyRevenue: number;
  sharePct: number;
};

export type CategoryPriceBucket = {
  label: string;
  min: number;
  max: number;
  count: number;
  sharePct: number;
  revenue: number;
  revenueSharePct: number;
};

export type CategoryMedalDistribution = {
  platinumPct: number;
  goldPct: number;
  silverPct: number;
  officialStorePct: number;
  noMedalPct: number;
};

export type MonopolyLevel = 'Baixo' | 'Médio' | 'Alto';

export type CategoryAnalyticsSummary = {
  sampleSize: number;
  estimatedMonthlyRevenue: number;
  estimatedMonthlySales: number;
  averageTicket: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  uniqueSellersCount: number;
  concentratedSellersCount: number;
  sellerConcentrationRatioPct: number;
  uniqueBrandsCount: number;
  revenuePerSeller: number;
  monopolyIndexPct: number;
  brandConcentrationPct: number;
  monopolyLevel: MonopolyLevel;
  monopolySummary: string;
  medalDistribution: CategoryMedalDistribution;
  topSellers: CategoryLeaderRow[];
  topBrands: CategoryLeaderRow[];
  priceBuckets: CategoryPriceBucket[];
  classicPct: number;
  premiumPct: number;
  fullPct: number;
  standardShippingPct: number;
  freeShippingPct: number;
  catalogPct: number;
  commonPct: number;
  nationalPct: number;
  internationalPct: number;
};

export function computeCategoryAnalytics(items: CategorySampleInput[]): CategoryAnalyticsSummary {
  const valid = items.filter((x) => finite(x.price) && (x.price as number) > 0);
  const n = Math.max(1, valid.length);
  const prices = valid.map((x) => x.price as number).sort((a, b) => a - b);
  const minPrice = prices[0] ?? 0;
  const maxPrice = prices[prices.length - 1] ?? 0;
  const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
  const averageTicket = prices.length > 0 ? roundMoney(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;

  const estimatedMonthlyRevenue = roundMoney(valid.reduce((s, x) => s + Math.max(0, x.monthlyRevenue), 0));
  const estimatedMonthlySales = Math.round(valid.reduce((s, x) => s + Math.max(0, x.monthlySales), 0));
  const revDenom = Math.max(1, estimatedMonthlyRevenue);

  // Agregação por Vendedor (Top 5 Vendedores + Proporção de Concentração)
  const sellerMap = new Map<string, { name: string; id: string | null; count: number; sales: number; rev: number }>();
  for (const it of valid) {
    const rawName = (it.sellerNickname ?? '').trim();
    const key = it.sellerId ? `ID:${it.sellerId}` : rawName ? `NAME:${rawName.toLowerCase()}` : `ANON:${it.id}`;
    const display =
      rawName && !/^lojista|^loja oficial\s*\/\s*mercadol/i.test(rawName)
        ? rawName
        : it.sellerId
          ? `Lojista #${it.sellerId}`
          : rawName || 'Vendedor Mercado Livre';
    const cur = sellerMap.get(key) ?? {
      name: display,
      id: it.sellerId ? String(it.sellerId) : null,
      count: 0,
      sales: 0,
      rev: 0,
    };
    cur.count += 1;
    cur.sales += Math.max(0, it.monthlySales);
    cur.rev += Math.max(0, it.monthlyRevenue);
    sellerMap.set(key, cur);
  }

  const allSellers = [...sellerMap.values()].sort((a, b) => b.rev - a.rev || b.sales - a.sales);
  const uniqueSellersCount = Math.max(1, allSellers.length);

  // Quantos vendedores concentram 75% das vendas/receita do nicho vs. total de vendedores
  let cumSellerSales = 0;
  const totalSalesDenom = Math.max(1, allSellers.reduce((s, x) => s + Math.max(1, x.sales), 0));
  let concentratedSellersCount = 0;
  for (const s of allSellers) {
    concentratedSellersCount += 1;
    cumSellerSales += Math.max(1, s.sales);
    if (cumSellerSales / totalSalesDenom >= 0.75) break;
  }
  concentratedSellersCount = Math.max(1, concentratedSellersCount);
  const sellerConcentrationRatioPct = roundMoney((concentratedSellersCount / uniqueSellersCount) * 100);

  const topSellers: CategoryLeaderRow[] = allSellers.slice(0, 5).map((s) => ({
    name: s.name,
    id: s.id,
    listingsCount: s.count,
    monthlySales: Math.round(s.sales),
    monthlyRevenue: roundMoney(s.rev),
    sharePct: roundMoney((s.rev / revDenom) * 100),
  }));

  // Distribuição de Medalhas (Lojas Oficiais, Platinum, Gold, Líder/Silver, Sem Medalha)
  let officialCnt = 0;
  let platCnt = 0;
  let goldCnt = 0;
  let silverCnt = 0;
  let noMedalCnt = 0;
  for (const it of valid) {
    const medalRaw = (it.sellerMedal ?? '').toLowerCase();
    const nickRaw = (it.sellerNickname ?? '').toLowerCase();
    if (it.officialStoreId || /oficial/.test(medalRaw) || /\boficial\b/.test(nickRaw)) {
      officialCnt++;
    } else if (/platinum/.test(medalRaw)) {
      platCnt++;
    } else if (/gold/.test(medalRaw)) {
      goldCnt++;
    } else if (/silver|l[ií]der/.test(medalRaw)) {
      silverCnt++;
    } else {
      noMedalCnt++;
    }
  }
  const medalDistribution: CategoryMedalDistribution = {
    officialStorePct: roundMoney((officialCnt / n) * 100),
    platinumPct: roundMoney((platCnt / n) * 100),
    goldPct: roundMoney((goldCnt / n) * 100),
    silverPct: roundMoney((silverCnt / n) * 100),
    noMedalPct: roundMoney(
      Math.max(
        0,
        100 -
          roundMoney((officialCnt / n) * 100) -
          roundMoney((platCnt / n) * 100) -
          roundMoney((goldCnt / n) * 100) -
          roundMoney((silverCnt / n) * 100),
      ),
    ),
  };

  // Agregação por Marca (Top 5 Marcas)
  const brandMap = new Map<string, { name: string; count: number; sales: number; rev: number }>();
  for (const it of valid) {
    const rawBrand = (it.brand ?? '').trim();
    const cleanBrand =
      rawBrand && !/^(gen[eé]rica|sem marca|outros|importado|linha\s)/i.test(rawBrand)
        ? rawBrand
        : 'Marca Própria / Genérica';
    const key = cleanBrand.toLowerCase();
    const cur = brandMap.get(key) ?? { name: cleanBrand, count: 0, sales: 0, rev: 0 };
    cur.count += 1;
    cur.sales += Math.max(0, it.monthlySales);
    cur.rev += Math.max(0, it.monthlyRevenue);
    brandMap.set(key, cur);
  }

  const allBrands = [...brandMap.values()].sort((a, b) => b.rev - a.rev || b.sales - a.sales);
  const topBrands: CategoryLeaderRow[] = allBrands.slice(0, 5).map((b) => ({
    name: b.name,
    id: null,
    listingsCount: b.count,
    monthlySales: Math.round(b.sales),
    monthlyRevenue: roundMoney(b.rev),
    sharePct: roundMoney((b.rev / revDenom) * 100),
  }));

  const top3SellerRev = topSellers.slice(0, 3).reduce((s, r) => s + r.monthlyRevenue, 0);
  const top5BrandRev = topBrands
    .filter((b) => b.name !== 'Marca Própria / Genérica')
    .reduce((s, r) => s + r.monthlyRevenue, 0);

  // Índice real de monopolização combinando a razão de vendedores concentradores vs total + share Top 3
  const top3SharePct = valid.length > 0 ? (top3SellerRev / revDenom) * 100 : 0;
  const monopolyIndexPct =
    valid.length > 0
      ? Math.min(100, Math.max(5, roundMoney(top3SharePct * 0.65 + (100 - sellerConcentrationRatioPct) * 0.35)))
      : 0;
  const brandConcentrationPct =
    valid.length > 0 ? Math.min(100, roundMoney((top5BrandRev / revDenom) * 100)) : 0;

  let monopolyLevel: MonopolyLevel = 'Médio';
  let monopolySummary = `${concentratedSellersCount} de ${uniqueSellersCount} vendedores concentram 75% das vendas (${roundMoney(top3SharePct)}% nos Top 3). Há espaço para competir com boa ficha técnica e Full.`;
  if (monopolyIndexPct < 42 || sellerConcentrationRatioPct >= 62) {
    monopolyLevel = 'Baixo';
    monopolySummary = `Nicho pulverizado: ${concentratedSellersCount} de ${uniqueSellersCount} vendedores dividem 75% das vendas — excelente janela de entrada para novos sellers.`;
  } else if (monopolyIndexPct > 65 || (uniqueSellersCount >= 5 && sellerConcentrationRatioPct <= 30)) {
    monopolyLevel = 'Alto';
    monopolySummary = `Monopólio elevado: apenas ${concentratedSellersCount} de ${uniqueSellersCount} vendedores concentram 75% do giro. Exige diferenciação clara (kits, marca própria, Full ou preço agressivo).`;
  }

  // Distribuição em 4 faixas dinâmicas de preço
  const priceBuckets: CategoryPriceBucket[] = [];
  if (prices.length > 0) {
    const span = Math.max(20, maxPrice - minPrice);
    const step = span / 4;
    const cuts = [
      minPrice,
      roundMoney(minPrice + step),
      roundMoney(minPrice + step * 2),
      roundMoney(minPrice + step * 3),
      maxPrice,
    ];
    for (let i = 0; i < 4; i++) {
      const bMin = cuts[i];
      const bMax = cuts[i + 1];
      const inBucket = valid.filter((it) => {
        const p = it.price as number;
        return i === 3 ? p >= bMin && p <= bMax + 0.01 : p >= bMin && p < bMax;
      });
      const bRev = inBucket.reduce((s, x) => s + Math.max(0, x.monthlyRevenue), 0);
      priceBuckets.push({
        label: `R$ ${Math.round(bMin)} – R$ ${Math.round(bMax)}`,
        min: bMin,
        max: bMax,
        count: inBucket.length,
        sharePct: roundMoney((inBucket.length / n) * 100),
        revenue: roundMoney(bRev),
        revenueSharePct: roundMoney((bRev / revDenom) * 100),
      });
    }
  }

  const premiumCount = valid.filter((x) => x.listingTypeId === 'gold_pro').length;
  const fullCount = valid.filter((x) => x.fulfillment).length;
  const freeCount = valid.filter((x) => x.freeShipping).length;
  const catalogCount = valid.filter((x) => x.isCatalog).length;
  const intlCount = valid.filter((x) => x.isInternational).length;

  const premiumPct = roundMoney((premiumCount / n) * 100);
  const classicPct = roundMoney(Math.max(0, 100 - premiumPct));
  const fullPct = roundMoney((fullCount / n) * 100);
  const standardShippingPct = roundMoney(Math.max(0, 100 - fullPct));
  const freeShippingPct = roundMoney((freeCount / n) * 100);
  const catalogPct = roundMoney((catalogCount / n) * 100);
  const commonPct = roundMoney(Math.max(0, 100 - catalogPct));
  const internationalPct = roundMoney((intlCount / n) * 100);
  const nationalPct = roundMoney(Math.max(0, 100 - internationalPct));

  const uniqueBrandsCount = Math.max(1, allBrands.length);

  return {
    sampleSize: valid.length,
    estimatedMonthlyRevenue,
    estimatedMonthlySales,
    averageTicket,
    medianPrice,
    minPrice,
    maxPrice,
    uniqueSellersCount,
    concentratedSellersCount,
    sellerConcentrationRatioPct,
    uniqueBrandsCount,
    revenuePerSeller: roundMoney(estimatedMonthlyRevenue / uniqueSellersCount),
    monopolyIndexPct,
    brandConcentrationPct,
    monopolyLevel,
    monopolySummary,
    medalDistribution,
    topSellers,
    topBrands,
    priceBuckets,
    classicPct,
    premiumPct,
    fullPct,
    standardShippingPct,
    freeShippingPct,
    catalogPct,
    commonPct,
    nationalPct,
    internationalPct,
  };
}

/* =============================================================================
 * RAIO-X DE VENDEDOR — PORTFÓLIO, MARCAS, TENDÊNCIA E CURVA ABC (80 / 15 / 5)
 * ============================================================================= */

export type AbcClass = 'A' | 'B' | 'C';
export type SellerSalesTrend = 'Em Alta' | 'Estável' | 'Em Queda';

export type SellerPortfolioItemInput = {
  id: string;
  productId: string | null;
  title: string;
  brand: string | null;
  image: string | null;
  price: number | null;
  soldQuantity: number;
  monthlySales: number;
  monthlyRevenue: number;
  fulfillment: boolean;
  freeShipping: boolean;
  isCatalog: boolean;
  listingTypeId: string | null;
  listingType: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  daysOnAir: number | null;
  permalink: string | null;
};

export type SellerPortfolioItem = SellerPortfolioItemInput & {
  rank: number;
  abcClass: AbcClass;
  revenueSharePct: number;
  cumulativeSharePct: number;
};

export type SellerBrandSummary = {
  name: string;
  count: number;
  sharePct: number;
  monthlyRevenue: number;
};

export type SellerPortfolioAnalytics = {
  portfolioSampleCount: number;
  estimatedMonthlyRevenue: number;
  estimatedMonthlySales: number;
  averageTicket: number;
  abcCounts: { A: number; B: number; C: number };
  abcRevenue: { A: number; B: number; C: number };
  fullPct: number;
  freeShippingPct: number;
  premiumPct: number;
  classicPct: number;
  catalogPct: number;
  salesTrend: SellerSalesTrend;
  salesTrendReason: string;
  topBrands: SellerBrandSummary[];
  items: SellerPortfolioItem[];
};

const KNOWN_BRAND_TOKENS = [
  'Samsung', 'Apple', 'Xiaomi', 'Motorola', 'LG', 'Sony', 'JBL', 'Logitech', 'AMD', 'Ryzen',
  'Intel', 'Kingston', 'SanDisk', 'Mondial', 'WAP', 'Britânia', 'Philco', 'Electrolux', 'Arno',
  'Oster', 'Tramontina', 'Vonder', 'Bosch', 'Makita', 'DeWalt', 'Stanley', '3M', 'Nike', 'Adidas',
  'Puma', 'Olympikus', 'Havaianas', 'Lupo', 'Boticário', 'Natura', 'Eudora', 'L’Oréal', 'Nivea',
  'Growth', 'Max Titanium', 'Integralmedica', 'Brastemp', 'Consul', 'Midea', 'Gree', 'Elgin',
  'Multilaser', 'Positivo', 'Dell', 'Lenovo', 'Asus', 'Acer', 'HP', 'Epson', 'Canon',
];

function inferBrandFromItem(brand: string | null, title: string, fallbackStoreName?: string | null): string {
  const b = (brand ?? '').trim();
  if (b && !/^(gen[eé]rica|sem marca|outros|importado|linha\s)/i.test(b)) {
    return b;
  }
  const lowerTitle = ` ${title.toLowerCase()} `;
  for (const kb of KNOWN_BRAND_TOKENS) {
    if (lowerTitle.includes(` ${kb.toLowerCase()} `)) return kb;
  }
  if (fallbackStoreName && !/^lojista/i.test(fallbackStoreName)) {
    return `${fallbackStoreName} (Linha Própria)`;
  }
  return 'Marca Própria / Importação';
}

export function computeSellerPortfolioAnalytics(
  rawItems: SellerPortfolioItemInput[],
  sellerContext?: {
    nickname?: string | null;
    reputationLevel?: string | null;
    claimsRate?: number | null;
    cancellationRate?: number | null;
    completedSales?: number | null;
  },
): SellerPortfolioAnalytics {
  const sorted = [...rawItems].sort(
    (a, b) => b.monthlyRevenue - a.monthlyRevenue || b.soldQuantity - a.soldQuantity,
  );
  const n = Math.max(1, sorted.length);
  const totalRev = sorted.reduce((s, x) => s + Math.max(0, x.monthlyRevenue), 0);
  const totalSales = sorted.reduce((s, x) => s + Math.max(0, x.monthlySales), 0);
  const validPrices = sorted.map((x) => x.price).filter((p): p is number => finite(p) && p > 0);
  const averageTicket =
    validPrices.length > 0 ? roundMoney(validPrices.reduce((s, p) => s + p, 0) / validPrices.length) : 0;

  const revDenom = Math.max(1, totalRev);
  let cumulative = 0;
  const abcCounts = { A: 0, B: 0, C: 0 };
  const abcRevenue = { A: 0, B: 0, C: 0 };

  const items: SellerPortfolioItem[] = sorted.map((item, idx) => {
    const prevCumPct = (cumulative / revDenom) * 100;
    cumulative += Math.max(0, item.monthlyRevenue);
    const cumPct = Math.min(100, (cumulative / revDenom) * 100);
    const sharePct = (Math.max(0, item.monthlyRevenue) / revDenom) * 100;

    let abcClass: AbcClass = 'C';
    if (idx === 0 || prevCumPct < 80) abcClass = 'A';
    else if (prevCumPct < 95) abcClass = 'B';

    abcCounts[abcClass] += 1;
    abcRevenue[abcClass] = roundMoney(abcRevenue[abcClass] + Math.max(0, item.monthlyRevenue));

    const resolvedBrand = inferBrandFromItem(item.brand, item.title, sellerContext?.nickname);

    return {
      ...item,
      brand: item.brand ?? resolvedBrand,
      rank: idx + 1,
      abcClass,
      revenueSharePct: roundMoney(sharePct),
      cumulativeSharePct: roundMoney(cumPct),
    };
  });

  const fullPct = roundMoney((sorted.filter((x) => x.fulfillment).length / n) * 100);
  const freeShippingPct = roundMoney((sorted.filter((x) => x.freeShipping).length / n) * 100);
  const premiumPct = roundMoney((sorted.filter((x) => x.listingTypeId === 'gold_pro').length / n) * 100);
  const classicPct = roundMoney(Math.max(0, 100 - premiumPct));
  const catalogPct = roundMoney((sorted.filter((x) => x.isCatalog).length / n) * 100);

  const bMap = new Map<string, { name: string; count: number; rev: number }>();
  for (const x of items) {
    const resolved = inferBrandFromItem(x.brand, x.title, sellerContext?.nickname);
    const k = resolved.toLowerCase();
    const cur = bMap.get(k) ?? { name: resolved, count: 0, rev: 0 };
    cur.count += 1;
    cur.rev += Math.max(0, x.monthlyRevenue);
    bMap.set(k, cur);
  }
  const topBrands: SellerBrandSummary[] = [...bMap.values()]
    .sort((a, b) => b.rev - a.rev || b.count - a.count)
    .slice(0, 6)
    .map((b) => ({
      name: b.name,
      count: b.count,
      sharePct: roundMoney((b.count / n) * 100),
      monthlyRevenue: roundMoney(b.rev),
    }));

  // Cálculo de Tendência de Vendas (Em Alta | Estável | Em Queda)
  const avgMonthlyPerListing = sorted.length > 0 ? totalSales / sorted.length : 0;
  const recentActiveShare =
    sorted.length > 0
      ? sorted.filter((x) => (x.daysOnAir ?? 120) <= 210 && x.monthlySales >= 8).length / sorted.length
      : 0;
  const rep = (sellerContext?.reputationLevel ?? '5_green').toLowerCase();
  const highClaims = (sellerContext?.claimsRate ?? 0) > 0.025 || (sellerContext?.cancellationRate ?? 0) > 0.02;

  let salesTrend: SellerSalesTrend = 'Estável';
  let salesTrendReason = 'Ritmo consistente de giro nos SKUs líderes com reputação controlada.';

  if (rep.startsWith('1') || rep.startsWith('2') || highClaims || (sorted.length > 0 && avgMonthlyPerListing < 3)) {
    salesTrend = 'Em Queda';
    salesTrendReason = highClaims || rep.startsWith('1') || rep.startsWith('2')
      ? 'Pressão no termômetro / reclamações reduzindo exposição orgânica do portfólio.'
      : 'Baixa velocidade mensal por anúncio ativo na vitrine atual.';
  } else if (
    avgMonthlyPerListing >= 18 ||
    fullPct >= 40 ||
    recentActiveShare >= 0.35 ||
    ((sellerContext?.completedSales ?? 0) >= 1000 && avgMonthlyPerListing >= 8)
  ) {
    salesTrend = 'Em Alta';
    salesTrendReason = `Giro aquecido (~${Math.round(avgMonthlyPerListing)} vendas/mês por SKU amostrado) sustentado por ${fullPct >= 30 ? 'operação Full e ' : ''}termômetro verde.`;
  }

  return {
    portfolioSampleCount: sorted.length,
    estimatedMonthlyRevenue: roundMoney(totalRev),
    estimatedMonthlySales: Math.round(totalSales),
    averageTicket,
    abcCounts,
    abcRevenue,
    fullPct,
    freeShippingPct,
    premiumPct,
    classicPct,
    catalogPct,
    salesTrend,
    salesTrendReason,
    topBrands,
    items,
  };
}

/* =============================================================================
 * INSIGHTS DE AVALIAÇÕES (EXTRAÇÃO AUTOMÁTICA DE ELOGIOS E PONTOS DE ATENÇÃO)
 * ============================================================================= */

export type ReviewInsightTrait = {
  term: string;
  count: number;
  sharePct: number;
  sentiment: 'positive' | 'negative';
  sampleQuote: string | null;
};

export type ReviewCitedWord = {
  word: string;
  count: number;
  sentiment: 'positive' | 'negative' | 'neutral';
};

export type ReviewInsightsSummary = {
  analyzedCommentsCount: number;
  positiveTraits: ReviewInsightTrait[];
  negativeTraits: ReviewInsightTrait[];
  topCitedWords: ReviewCitedWord[];
  summary: string;
};

const POSITIVE_ASPECT_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'Qualidade', regex: /\b(qualidade|[oó]tima qualidade|boa qualidade|excelente material)\b/i },
  { label: 'Beleza / Design', regex: /\b(lind[ao]s?|bonit[ao]s?|maravilhos[ao]s?|perfeit[ao]s?|delicad[ao]s?|elegante)\b/i },
  { label: 'Brilho & Acabamento', regex: /\b(brilh[oa]|acabamento|detalhes|strass|bem feit[ao]|capricho)\b/i },
  { label: 'Custo-benefício', regex: /\b(custo[\s-]*benef[ií]cio|vale a pena|pre[çc]o bom|[oó]timo pre[çc]o|barat[ao])\b/i },
  { label: 'Resistência / Firmeza', regex: /\b(resistente|firme|forte|dur[áa]vel|segur[ao])\b/i },
  { label: 'Tamanho & Encaixe', regex: /\b(tamanho [oó]timo|tamanho ideal|serviu|encaix[ea]|confort[áa]vel|leve)\b/i },
  { label: 'Fiel às fotos', regex: /\b(igual [àa] foto|id[êe]ntic[ao]|como na foto|fiel ao an[úu]ncio)\b/i },
  { label: 'Entrega & Embalagem', regex: /\b(r[áa]pid[ao]|chegou antes|bem embalad[ao]|no prazo)\b/i },
];

const NEGATIVE_ASPECT_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'Frágil / Delicado', regex: /\b(fr[áa]gil|fr[áa]geis|fin[ao] demais|parece quebrar|entorta|fraco)\b/i },
  { label: 'Tamanho menor / Medidas', regex: /\b(pequen[ao]|menor que|apertad[ao]|curt[ao]|grande demais|tamanho)\b/i },
  { label: 'Avaria / Pedra solta', regex: /\b(quebrad[ao]|amassad[ao]|solt[ao]u?|caiu|faltando|defeito|riscad[ao]|tort[ao])\b/i },
  { label: 'Conforto / Peso', regex: /\b(machuca|aperta|pesad[ao]|incomoda|escorrega)\b/i },
  { label: 'Diferença de cor / Foto', regex: /\b(diferente da foto|cor diferente|desbotad[ao]|oxid[ao]u|escureceu)\b/i },
  { label: 'Embalagem / Transporte', regex: /\b(mal embalad[ao]|caixa amassada|atras[ao]u|demorou)\b/i },
];

const REVIEW_WORD_STOP = new Set(
  (
    'para com sem por uma uns umas das dos que mais muito pelo pela pelos pelas como ' +
    'mas porem contudo foi era sao estao tem tinha veio comprei comprar produto mercadoria ' +
    'mercado livre super bem tudo todos toda todas meu minha meus minhas ela ele eles elas ' +
    'isso essa esse este esta nao sim ainda sobre entre mesmo mesma pois porque quando onde ' +
    'achei gostei recomendo'
  ).split(/\s+/),
);

const POS_WORDS = new Set([
  'qualidade', 'linda', 'lindo', 'bonita', 'bonito', 'perfeita', 'perfeito', 'otima', 'otimo',
  'excelente', 'brilho', 'brilha', 'acabamento', 'resistente', 'firme', 'delicada', 'delicado',
  'confortavel', 'rapido', 'rapida', 'embalado', 'embalada', 'barato', 'preco', 'maravilhosa',
  'maravilhoso', 'elegante', 'amei', 'adorei', 'funciona', 'potente', 'pratico', 'pratica',
]);

const NEG_WORDS = new Set([
  'fragil', 'quebrou', 'quebrada', 'quebrado', 'pequena', 'pequeno', 'amassada', 'amassado',
  'defeito', 'fraco', 'fraca', 'ruim', 'pessimo', 'pessima', 'soltou', 'caiu', 'torta', 'torto',
  'machuca', 'aperta', 'atrasou', 'diferente', 'menor', 'pesada', 'pesado',
]);

export function extractReviewInsights(
  comments: { title?: string | null; content: string; rating: number }[],
): ReviewInsightsSummary {
  const valid = comments.filter((c) => typeof c.content === 'string' && c.content.trim().length >= 3);
  const total = valid.length;
  if (total === 0) {
    return {
      analyzedCommentsCount: 0,
      positiveTraits: [],
      negativeTraits: [],
      topCitedWords: [],
      summary: 'Ainda não há comentários textuais suficientes para extrair padrões recorrentes.',
    };
  }

  const posMap = new Map<string, { count: number; quote: string | null }>();
  const negMap = new Map<string, { count: number; quote: string | null }>();
  const wordCounts = new Map<string, { display: string; count: number; ratingSum: number }>();

  for (const c of valid) {
    const fullText = `${c.title ?? ''}. ${c.content}`.trim();
    const snippet = c.content.trim().slice(0, 110);
    const hasContrast = /\b(mas|por[ée]m|entretanto|contudo|infelizmente|s[oó] que|pena que)\b/i.test(fullText);

    if (c.rating >= 4) {
      for (const p of POSITIVE_ASPECT_PATTERNS) {
        if (p.regex.test(fullText)) {
          const cur = posMap.get(p.label) ?? { count: 0, quote: null };
          cur.count += 1;
          cur.quote ??= snippet;
          posMap.set(p.label, cur);
        }
      }
    }

    if (c.rating <= 3 || hasContrast) {
      for (const nPat of NEGATIVE_ASPECT_PATTERNS) {
        if (nPat.regex.test(fullText)) {
          const cur = negMap.get(nPat.label) ?? { count: 0, quote: null };
          cur.count += 1;
          cur.quote ??= snippet;
          negMap.set(nPat.label, cur);
        }
      }
    } else {
      // Mesmo em 4★–5★ sem conjunção adversativa explícita, captura alertas diretos como "frágil" ou "soltou"
      for (const nPat of NEGATIVE_ASPECT_PATTERNS) {
        if (nPat.label !== 'Tamanho menor / Medidas' && nPat.regex.test(fullText)) {
          const cur = negMap.get(nPat.label) ?? { count: 0, quote: null };
          cur.count += 1;
          cur.quote ??= snippet;
          negMap.set(nPat.label, cur);
        }
      }
    }

    const seenInComment = new Set<string>();
    const rawWords = fullText.split(/[^0-9A-Za-zÀ-ÿ]+/).filter(Boolean);
    for (const rw of rawWords) {
      const norm = normalizeToken(rw);
      if (norm.length < 4 || /^\d+$/.test(norm) || REVIEW_WORD_STOP.has(norm)) continue;
      if (seenInComment.has(norm)) continue;
      seenInComment.add(norm);
      const cur = wordCounts.get(norm) ?? { display: rw.toLowerCase(), count: 0, ratingSum: 0 };
      cur.count += 1;
      cur.ratingSum += c.rating;
      wordCounts.set(norm, cur);
    }
  }

  const positiveTraits: ReviewInsightTrait[] = [...posMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([term, v]) => ({
      term,
      count: v.count,
      sharePct: Math.round((v.count / total) * 100),
      sentiment: 'positive',
      sampleQuote: v.quote,
    }));

  const negativeTraits: ReviewInsightTrait[] = [...negMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([term, v]) => ({
      term,
      count: v.count,
      sharePct: Math.round((v.count / total) * 100),
      sentiment: 'negative',
      sampleQuote: v.quote,
    }));

  const topCitedWords: ReviewCitedWord[] = [...wordCounts.entries()]
    .filter(([, v]) => v.count >= (total >= 6 ? 2 : 1))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([norm, v]) => {
      const avgR = v.ratingSum / v.count;
      const sentiment: 'positive' | 'negative' | 'neutral' = NEG_WORDS.has(norm) || avgR <= 3.2
        ? 'negative'
        : POS_WORDS.has(norm) || avgR >= 4.4
          ? 'positive'
          : 'neutral';
      return {
        word: v.display,
        count: v.count,
        sentiment,
      };
    });

  const topPos = positiveTraits.slice(0, 2).map((p) => p.term.toLowerCase()).join(' e ');
  const topNeg = negativeTraits.slice(0, 2).map((n) => n.term.toLowerCase()).join(' e ');
  const summary =
    topPos && topNeg
      ? `Em ${total} opiniões analisadas, compradores destacam positivamente ${topPos}, enquanto os principais pontos de atenção envolvem ${topNeg}.`
      : topPos
        ? `Em ${total} opiniões analisadas, a aprovação concentra-se em ${topPos}, sem reclamações recorrentes críticas.`
        : `Padrões extraídos de ${total} comentários reais verificados no anúncio.`;

  return {
    analyzedCommentsCount: total,
    positiveTraits,
    negativeTraits,
    topCitedWords,
    summary,
  };
}



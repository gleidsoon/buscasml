'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BarChart3,
  Boxes,
  Calculator,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  ExternalLink,
  Hash,
  Info,
  Key,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Search,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  AGE_ALERT_LABEL,
  DEFAULT_COMMISSION_PCT,
  FREE_SHIPPING_THRESHOLD,
  MAX_PRICE_ITERATIONS,
  breakdownAt,
  extractKeywords,
  suggestPrice,
  type AgeAlert,
  type CalculatorBreakdown,
  type CalculatorInput,
  type CategoryFees,
  type Commission,
  type KeywordStat,
  type Periods,
  type SalesEstimate,
  type SuggestedPrice,
} from '@/lib/mlEngine';
import type { PageSignals } from '@/lib/pageState';

/* =============================================================================
 * TIPOS (espelham as respostas de app/api/ml/route.ts)
 * ============================================================================= */

type SellerInfo = {
  id: number | null;
  nickname: string | null;
  registrationDate: string | null;
  accountYears: number | null;
  city: string | null;
  state: string | null;
  medal: string;
  reputationLevel: string | null;
  completedSales: number | null;
  canceledSales: number | null;
  cancellationRate: number | null;
  claimsRate: number | null;
  delayedHandlingRate: number | null;
  positiveRatingPct: number | null;
  officialStoreId: number | null;
};

type FeeSnapshot = {
  categoryId: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  categoryFees: CategoryFees;
  classic: Commission | null;
  premium: Commission | null;
  current: Commission | null;
  shippingListCost: number | null;
  freeShippingByMeli: boolean;
  shippingSource: string;
  feeSource: string;
};

type CompetitorRow = {
  itemId: string;
  price: number | null;
  sellerId: number | null;
  sellerNickname: string | null;
  sellerMedal: string | null;
  fulfillment: boolean;
  freeShipping: boolean;
  listingType: string | null;
};

type ProductSummary = {
  productId: string | null;
  itemId: string | null;
  categoryId: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  image: string | null;
  price: number | null;
  originalPrice: number | null;
  soldQuantity: number | null;
  soldText: string | null;
  soldSource: string;
  salesEstimate: SalesEstimate | null;
  velocity: Periods | null;
  revenue: Periods | null;
  availableQuantity: number | null;
  listingType: string | null;
  listingTypeId: string | null;
  fulfillment: boolean;
  freeShipping: boolean;
  isSupermarket: boolean;
  isSponsored: boolean;
  createdAt: string | null;
  createdSource: string;
  daysOnAir: number | null;
  ageAlert: AgeAlert | null;
  firstPhotoDate: string | null;
  seller: SellerInfo | null;
  permalink: string | null;
};

type Dossier = {
  origin: string;
  productId: string | null;
  itemId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  permalink: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  images: string[];
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  currency: string;
  listingType: string | null;
  listingTypeId: string | null;
  isSupermarket: boolean;
  availableQuantity: number | null;
  stockText: string | null;
  stockSource: string;
  soldValue: number | null;
  soldLabel: string;
  soldSource: string;
  salesEstimate: SalesEstimate | null;
  velocity: Periods | null;
  revenue: Periods | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  fulfillment: boolean;
  freeShipping: boolean;
  logisticType: string | null;
  createdAt: string | null;
  createdSource: string;
  daysOnAir: number | null;
  ageAlert: AgeAlert | null;
  ageAlertLabel: string | null;
  firstPhotoDate: string | null;
  firstPhotoSource: string;
  seller: SellerInfo | null;
  competitors: CompetitorRow[];
  fees: FeeSnapshot;
  keywords: { words: KeywordStat[]; phrases: KeywordStat[] };
  pageSignals: PageSignals | null;
  notes: string[];
  raw: Record<string, unknown>;
};

type CategoryTrend = {
  keyword: string;
  url: string;
};

type CategoryChild = {
  id: string;
  name: string;
  totalItems: number | null;
};

type CategoryOverview = {
  id: string;
  name: string;
  path: string;
  totalItems: number | null;
  childrenCategories: CategoryChild[];
  trends: CategoryTrend[];
  fees: FeeSnapshot;
};

type SearchMode = 'auto' | 'termo' | 'anuncio' | 'categoria';

type KeywordAnalysis = {
  mode: 'keyword';
  query: string;
  products: ProductSummary[];
  keywords?: { words: KeywordStat[]; phrases: KeywordStat[] };
  category?: CategoryOverview | null;
  note: string | null;
};
type DossierAnalysis = { mode: 'dossier'; dossier: Dossier };
type Analysis = KeywordAnalysis | DossierAnalysis;

type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  userId: number | null;
  scope: string | null;
};

type StoredSession = { tokens: OAuthTokens; savedAt: number };

type StatusEnvelope = {
  ok: true;
  secretConfigured: boolean;
  appTokenActive: boolean;
};

type SearchEnvelope = { ok: true; data: Analysis };
type TokenEnvelope = { ok: true; tokens: OAuthTokens };

type ListingKind = 'classico' | 'premium';
type AgeFilter = 'todos' | '30' | '60' | '90' | '180';
type LogisticFilter = 'todos' | 'full' | 'frete';
type SortKey = 'relevancia' | 'menor_preco' | 'maior_preco' | 'mais_vendidos' | 'mais_recentes';
type ViewMode = 'grid' | 'table';
type TabKey = 'busca' | 'calculadora';

type FilterState = { age: AgeFilter; logistic: LogisticFilter; sort: SortKey; view: ViewMode };

type CalcForm = {
  title: string;
  categoryLabel: string;
  salePrice: string;
  supplierCost: string;
  packagingCost: string;
  taxPct: string;
  classicPct: string;
  premiumPct: string;
  listing: ListingKind;
  shippingCost: string;
  mlCoversShipping: boolean;
  shippingBelowThreshold: boolean;
  isSupermarket: boolean;
  marginMode: 'pct' | 'brl';
  marginTarget: string;
};

type Notice = { kind: 'ok' | 'erro' | 'aviso'; text: string };

type ChipOption = { value: string; label: string };

/* =============================================================================
 * CONSTANTES
 * ============================================================================= */

const SESSION_KEY = 'buscasml.oauth.v1';
const USER_TOKEN_HEADER = 'x-ml-user-token';
const ML_CLIENT_ID = '8353552938244269';
const REFRESH_AHEAD_MS = 5 * 60 * 1000;
const HIDDEN = 'Oculto no anúncio';

const AGE_OPTIONS: { value: AgeFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: '30', label: 'Até 30 dias' },
  { value: '60', label: 'Até 60 dias' },
  { value: '90', label: 'Até 90 dias' },
  { value: '180', label: 'Até 180 dias' },
];

const LOGISTIC_OPTIONS: { value: LogisticFilter; label: string }[] = [
  { value: 'todos', label: 'Todas' },
  { value: 'full', label: 'Full' },
  { value: 'frete', label: 'Frete grátis' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevancia', label: 'Relevância' },
  { value: 'menor_preco', label: 'Menor preço' },
  { value: 'maior_preco', label: 'Maior preço' },
  { value: 'mais_vendidos', label: 'Mais vendidos' },
  { value: 'mais_recentes', label: 'Anúncios mais novos' },
];

const DEFAULT_FILTERS: FilterState = { age: 'todos', logistic: 'todos', sort: 'relevancia', view: 'grid' };

const INITIAL_CALC: CalcForm = {
  title: '',
  categoryLabel: '',
  salePrice: '',
  supplierCost: '',
  packagingCost: '',
  taxPct: '6',
  classicPct: String(DEFAULT_COMMISSION_PCT.gold_special),
  premiumPct: String(DEFAULT_COMMISSION_PCT.gold_pro),
  listing: 'classico',
  shippingCost: '22,90',
  mlCoversShipping: false,
  shippingBelowThreshold: false,
  isSupermarket: false,
  marginMode: 'pct',
  marginTarget: '18',
};

const EXAMPLES = [
  'Coroa tiara strass noiva',
  'Parafusadeira Vonder',
  'Creatina Growth 250g',
  'Pote hermético tempero',
  'Jogo 6 taças diamante',
  'Cadeira gamer reclinável',
];

const AD_CODE_EXAMPLES = [
  { code: 'MLB5625506238', label: 'MLB5625506238 (Anúncio)' },
  { code: 'MLBU3375028575', label: 'MLBU3375028575 (Catálogo UP)' },
  { code: 'MLB45458519', label: 'MLB45458519 (Catálogo)' },
];

const CATEGORY_EXAMPLES = [
  { code: 'MLB190433', label: 'MLB190433 · Arcos e Tiaras' },
  { code: 'MLB1051', label: 'MLB1051 · Celulares e Telefones' },
  { code: 'MLB1648', label: 'MLB1648 · Informática' },
  { code: 'MLB1276', label: 'MLB1276 · Esportes e Fitness' },
  { code: 'MLB1430', label: 'MLB1430 · Calçados, Roupas e Bolsas' },
  { code: 'MLB1574', label: 'MLB1574 · Casa, Móveis e Decoração' },
];

const SEARCH_MODE_OPTIONS: { value: SearchMode; label: string; placeholder: string; hint: string }[] = [
  {
    value: 'auto',
    label: 'Detecção Automática',
    placeholder: 'Palavra-chave, link, código de anúncio (MLB5625506238 / MLBU...) ou categoria (MLB190433)',
    hint: 'Diferencia automaticamente termos, links, códigos de anúncio (8–12 dígitos / MLBU) e códigos de categoria (4–7 dígitos).',
  },
  {
    value: 'termo',
    label: 'Termo / Link',
    placeholder: 'Ex.: Coroa tiara strass noiva ou https://produto.mercadolivre.com.br/...',
    hint: 'Pesquise por palavra-chave de nicho ou cole o link direto do anúncio / catálogo (mercadolivre.com.br ou meli.la).',
  },
  {
    value: 'anuncio',
    label: 'Código MLB Anúncio',
    placeholder: 'Ex.: MLB5625506238, MLB-5625506238, MLBU3375028575 ou MLB45458519',
    hint: 'Abre direto o Raio-X analítico completo do anúncio ou produto de catálogo.',
  },
  {
    value: 'categoria',
    label: 'Código MLB Categoria',
    placeholder: 'Ex.: MLB190433 ou nome da categoria (Arcos, Tiaras e Faixas)',
    hint: 'Consulta os anúncios da categoria, árvore completa (/categories/MLB...), tendências (/trends/MLB/...) e taxas Clássico/Premium.',
  },
];

const INPUT_CLASS =
  'w-full rounded-xl border border-white/10 bg-[#070b14] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-[#3b82f6]';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#3b82f6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60';
const BTN_SM_BLUE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#3b82f6] px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_SM_YELLOW =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 px-3 py-2 text-xs font-semibold text-[#facc15] transition hover:bg-[#facc15]/20 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_GHOST =
  'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50';

const PILL_TONES = {
  slate: 'border-white/10 bg-[#0b1220] text-slate-300',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  yellow: 'border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15]',
  blue: 'border-[#3b82f6]/30 bg-[#3b82f6]/10 text-blue-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};
type PillTone = keyof typeof PILL_TONES;

/* =============================================================================
 * FORMATAÇÃO E ENTRADA NUMÉRICA
 * ============================================================================= */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const integer = new Intl.NumberFormat('pt-BR');

function formatBRL(value: number | null | undefined, fallback: string = HIDDEN): string {
  return typeof value === 'number' && Number.isFinite(value) ? brl.format(value) : fallback;
}

function formatInt(value: number | null | undefined, fallback: string = HIDDEN): string {
  return typeof value === 'number' && Number.isFinite(value) ? integer.format(Math.round(value)) : fallback;
}

function formatDecimal(value: number | null | undefined, digits = 1, fallback: string = HIDDEN): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits).replace('.', ',')
    : fallback;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return HIDDEN;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return HIDDEN;
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDaysOnAir(days: number | null): string {
  if (days === null) return HIDDEN;
  if (days === 0) return 'Criado hoje';
  return days === 1 ? '1 dia no ar' : `${integer.format(days)} dias no ar`;
}

function formatAccountAge(years: number | null): string {
  if (years === null) return 'Idade oculta';
  return years === 1 ? '1 ano de conta' : `${integer.format(years)} anos de conta`;
}

function formatRating(value: number | null): string {
  return value === null ? HIDDEN : value.toFixed(1).replace('.', ',');
}

function formatPercent(value: number | null | undefined, fallback: string = HIDDEN): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1).replace('.', ',')}%`
    : fallback;
}

function formatInputNumber(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Aceita "1.599,90", "1599,9", "1.599" e "1599.90". Campo vazio vira zero. */
function parseInputNumber(raw: string): number {
  const t = raw.trim();
  if (t === '') return 0;
  let normalized: string;
  if (t.includes(',')) normalized = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normalized = t.replace(/\./g, '');
  else normalized = t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function kindFromLabel(label: string | null): ListingKind | null {
  if (!label) return null;
  if (/premium|gold_pro/i.test(label)) return 'premium';
  if (/cl[aá]ssico|gold_special/i.test(label)) return 'classico';
  return null;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/* =============================================================================
 * MOTOR DA CALCULADORA (Classe Ee da Avantpro)
 * ============================================================================= */

type EeOutput = {
  input: CalculatorInput;
  classic: CalculatorBreakdown;
  premium: CalculatorBreakdown;
  suggestedClassic: SuggestedPrice;
  suggestedPremium: SuggestedPrice;
};

function buildCategoryFees(classicPct: number, premiumPct: number): CategoryFees {
  const c = classicPct > 0 ? classicPct : DEFAULT_COMMISSION_PCT.gold_special;
  const p = premiumPct > 0 ? premiumPct : DEFAULT_COMMISSION_PCT.gold_pro;
  const row = { gold_special: c, gold_pro: p };
  return {
    range_16: { ...row },
    range_32: { ...row },
    range_64: { ...row },
    range_128: { ...row },
  };
}

function computeEeCalculator(form: CalcForm): EeOutput {
  const price = Math.max(0, parseInputNumber(form.salePrice));
  const productCost = Math.max(0, parseInputNumber(form.supplierCost));
  const extraCost = Math.max(0, parseInputNumber(form.packagingCost));
  const taxRate = Math.max(0, parseInputNumber(form.taxPct)) / 100;
  const shippingCost = Math.max(0, parseInputNumber(form.shippingCost));
  const classicPct = Math.max(0, parseInputNumber(form.classicPct));
  const premiumPct = Math.max(0, parseInputNumber(form.premiumPct));
  const rawTarget = Math.max(0, parseInputNumber(form.marginTarget));
  const marginTarget = form.marginMode === 'pct' ? rawTarget / 100 : rawTarget;

  const fees = buildCategoryFees(classicPct, premiumPct);
  const input: CalculatorInput = {
    price,
    productCost,
    extraCost,
    taxRate,
    shippingCost,
    mlCoversShipping: form.mlCoversShipping,
    shippingBelowThreshold: form.shippingBelowThreshold,
    isSupermarket: form.isSupermarket,
    fees,
    marginMode: form.marginMode,
    marginTarget,
  };

  return {
    input,
    classic: breakdownAt(price, 'gold_special', input),
    premium: breakdownAt(price, 'gold_pro', input),
    suggestedClassic: suggestPrice('gold_special', input),
    suggestedPremium: suggestPrice('gold_pro', input),
  };
}

/* =============================================================================
 * FILTROS E ORDENAÇÃO
 * ============================================================================= */

function nullsLast(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

function applyFilters(
  products: ProductSummary[],
  age: AgeFilter,
  logistic: LogisticFilter,
  sort: SortKey,
): ProductSummary[] {
  const maxDays = age === 'todos' ? null : Number(age);
  const filtered = products.filter((p) => {
    if (maxDays !== null && (p.daysOnAir === null || p.daysOnAir > maxDays)) return false;
    if (logistic === 'full' && !p.fulfillment) return false;
    if (logistic === 'frete' && !p.freeShipping) return false;
    return true;
  });

  const sorted = [...filtered];
  if (sort === 'menor_preco') sorted.sort((a, b) => nullsLast(a.price, b.price, 1));
  else if (sort === 'maior_preco') sorted.sort((a, b) => nullsLast(a.price, b.price, -1));
  else if (sort === 'mais_vendidos') sorted.sort((a, b) => nullsLast(a.soldQuantity, b.soldQuantity, -1));
  else if (sort === 'mais_recentes') sorted.sort((a, b) => nullsLast(a.daysOnAir, b.daysOnAir, 1));
  return sorted;
}

/* =============================================================================
 * SESSÃO OAUTH (localStorage)
 * ============================================================================= */

function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.tokens || typeof parsed.tokens.accessToken !== 'string') return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Armazenamento bloqueado ou cheio.
  }
}

function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nada a fazer.
  }
}

function needsRefresh(tokens: OAuthTokens): boolean {
  return tokens.expiresAt - Date.now() < REFRESH_AHEAD_MS;
}

function buildAuthorizeUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ML_CLIENT_ID,
    redirect_uri: redirectUri,
  });
  return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
}

/* =============================================================================
 * CLIENTE DA API (/api/ml)
 * ============================================================================= */

async function readEnvelope<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  const env = body as { ok?: unknown; error?: unknown } | null;
  if (!res.ok || !env || env.ok !== true) {
    const message =
      typeof env?.error === 'string' ? env.error : `Falha na requisição (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return body as T;
}

function authHeaders(bearer: string | null): Record<string, string> {
  return bearer ? { [USER_TOKEN_HEADER]: bearer } : {};
}

async function requestAnalysis(
  input: string,
  bearer: string | null,
  mode: SearchMode = 'auto',
): Promise<Analysis> {
  const params = new URLSearchParams({ q: input, mode });
  const res = await fetch(`/api/ml?${params.toString()}`, {
    headers: authHeaders(bearer),
    cache: 'no-store',
  });
  const env = await readEnvelope<SearchEnvelope>(res);
  return env.data;
}

async function requestStatus(): Promise<StatusEnvelope> {
  const res = await fetch('/api/ml?action=status', { cache: 'no-store' });
  return readEnvelope<StatusEnvelope>(res);
}

async function requestTokenAction(body: Record<string, unknown>): Promise<OAuthTokens> {
  const res = await fetch('/api/ml', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const env = await readEnvelope<TokenEnvelope>(res);
  return env.tokens;
}

function requestExchange(code: string, redirectUri: string): Promise<OAuthTokens> {
  return requestTokenAction({ action: 'exchange', code, redirectUri });
}

function requestRefresh(refreshToken: string): Promise<OAuthTokens> {
  return requestTokenAction({ action: 'refresh', refreshToken });
}

/* =============================================================================
 * PRIMITIVOS DE INTERFACE
 * ============================================================================= */

function Banner({
  kind,
  children,
  onClose,
}: {
  kind: Notice['kind'];
  children: ReactNode;
  onClose?: () => void;
}) {
  const tone =
    kind === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : kind === 'erro'
        ? 'border-red-500/30 bg-red-500/10 text-red-200'
        : 'border-[#facc15]/30 bg-[#facc15]/10 text-yellow-100';
  const Icon = kind === 'ok' ? Check : kind === 'erro' ? AlertCircle : Info;
  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar aviso"
          className="shrink-0 rounded p-0.5 opacity-70 transition hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90vh] w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} overflow-y-auto rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: PillTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

function AgeAlertBadge({ alert, days }: { alert: AgeAlert | null; days: number | null }) {
  if (!alert || days === null) return null;
  if (alert === 'danger') {
    return (
      <Pill tone="red">
        <AlertTriangle size={11} /> {days}d · Perigo (&gt;365d)
      </Pill>
    );
  }
  if (alert === 'warning') {
    return (
      <Pill tone="amber">
        <AlertTriangle size={11} /> {days}d · Aviso (&gt;180d)
      </Pill>
    );
  }
  return <Pill tone="green">{days}d · Recente</Pill>;
}

function Stat({
  label,
  value,
  hint,
  icon,
  valueClass = 'text-slate-100',
}: {
  label: string;
  value: string;
  hint?: string | null;
  icon?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0b1220] p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <p className={`mt-2 break-words text-lg font-semibold ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-[#0b1220] p-2">
      <p className="text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-slate-200">{value}</p>
      {sub && <p className="truncate text-slate-400">{sub}</p>}
    </div>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? 'bg-[#3b82f6] text-white' : 'text-slate-300 hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ChipOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-400">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`rounded-full px-3 py-1 text-xs transition ${
            o.value === value ? 'bg-[#3b82f6] text-white' : 'bg-[#070b14] text-slate-300 hover:bg-white/10'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SafeImage({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-slate-500">
        Sem foto oficial
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const total = images.length;

  if (total === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl border border-white/5 bg-white text-sm text-slate-500">
        Sem foto oficial disponível
      </div>
    );
  }

  const current = Math.min(index, total - 1);
  const step = (delta: number) => setIndex((i) => (i + delta + total) % total);

  return (
    <div className="rounded-2xl border border-white/5 bg-[#111827] p-3">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white">
        <SafeImage src={images[current]} alt={title} className="max-h-full max-w-full object-contain p-6" />
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Próxima foto"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
            >
              <ChevronRight size={18} />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
              {current + 1}/{total}
            </span>
          </>
        )}
      </div>
      {total > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Foto ${i + 1}`}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition ${
                i === current ? 'border-[#facc15]' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/5 bg-[#111827] p-6 text-sm text-slate-300">
      <Loader2 size={20} className="animate-spin text-[#3b82f6]" />
      {label}
    </div>
  );
}

function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-[#111827] p-8 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

function Onboarding() {
  const items: { icon: ReactNode; title: string; text: string }[] = [
    {
      icon: <Search size={18} />,
      title: 'Palavra-chave, Link ou Código MLB',
      text: 'Pesquise por termo, link do ML (meli.la, /p/MLB, /up/MLBU) ou código de anúncio (MLB5625506238, MLBU3375028575) abrindo direto o Raio-X.',
    },
    {
      icon: <Layers size={18} />,
      title: 'Raio-X de Categoria & Tendências',
      text: 'Consulte qualquer código de categoria (ex.: MLB190433) para ver árvore completa, tendências oficiais (/trends/MLB) e taxas Clássico/Premium.',
    },
    {
      icon: <Calculator size={18} />,
      title: 'Calculadora Classe Ee (10 iterações)',
      text: 'Simule custo total, repasse líquido, margem de contribuição e preço sugerido em % ou R$ para Clássico e Premium.',
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="rounded-2xl border border-white/5 bg-[#111827] p-5">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#3b82f6]/15 text-[#3b82f6]">
            {item.icon}
          </div>
          <h3 className="font-semibold text-slate-100">{item.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

function ExamplesRow({
  onPickTerm,
  onPickAdCode,
  onPickCategory,
}: {
  onPickTerm: (text: string) => void;
  onPickAdCode: (code: string) => void;
  onPickCategory: (categoryId: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-white/5 bg-[#111827] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-400">Termos de busca:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onPickTerm(ex)}
            className="rounded-full border border-white/10 bg-[#0b1220] px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
          >
            {ex}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-400">Códigos de Anúncio / Catálogo:</span>
        {AD_CODE_EXAMPLES.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => onPickAdCode(item.code)}
            className="rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-1 text-xs text-blue-200 transition hover:bg-[#3b82f6]/20"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-400">Códigos de Categoria:</span>
        {CATEGORY_EXAMPLES.map((cat) => (
          <button
            key={cat.code}
            type="button"
            onClick={() => onPickCategory(cat.code)}
            className="rounded-full border border-[#facc15]/30 bg-[#facc15]/10 px-3 py-1 text-xs text-[#facc15] transition hover:bg-[#facc15]/20"
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryOverviewPanel({
  category,
  onSelectCategory,
  onPickTrend,
  onUseCategoryFees,
}: {
  category: CategoryOverview;
  onSelectCategory: (categoryId: string) => void;
  onPickTrend: (keyword: string) => void;
  onUseCategoryFees: (category: CategoryOverview) => void;
}) {
  const r64 = category.fees.categoryFees.range_64;
  const r128 = category.fees.categoryFees.range_128;
  const classicSample = category.fees.classic;
  const premiumSample = category.fees.premium;

  return (
    <div className="space-y-4 rounded-2xl border border-[#facc15]/25 bg-[#111827] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="yellow">Categoria {category.id}</Pill>
            {category.totalItems !== null && (
              <Pill tone="blue">{formatInt(category.totalItems)} anúncios na categoria</Pill>
            )}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">{category.name}</h3>
          {category.path && (
            <p className="mt-1 text-xs text-slate-400">
              Árvore da categoria: <span className="text-slate-200">{category.path}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onUseCategoryFees(category)} className={BTN_SM_YELLOW}>
            <Calculator size={14} /> Simular Taxas da Categoria
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/5 bg-[#0b1220] p-3 text-xs">
          <p className="font-medium text-slate-400">Comissão Clássico (gold_special)</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {r128?.gold_special !== undefined
              ? `${formatDecimal(r128.gold_special, 1)}%`
              : classicSample
                ? `${formatDecimal(classicSample.percentage, 1)}%`
                : HIDDEN}
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-[#0b1220] p-3 text-xs">
          <p className="font-medium text-slate-400">Comissão Premium (gold_pro)</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {r128?.gold_pro !== undefined
              ? `${formatDecimal(r128.gold_pro, 1)}%`
              : premiumSample
                ? `${formatDecimal(premiumSample.percentage, 1)}%`
                : HIDDEN}
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-[#0b1220] p-3 text-xs">
          <p className="font-medium text-slate-400">Faixa &lt; R$ 79 (/listing_prices)</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            Clássico: {r64?.gold_special !== undefined ? `${formatDecimal(r64.gold_special, 1)}%` : HIDDEN} · Premium:{' '}
            {r64?.gold_pro !== undefined ? `${formatDecimal(r64.gold_pro, 1)}%` : HIDDEN}
          </p>
        </div>
      </div>

      {category.trends.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
            <Sparkles size={13} className="text-[#facc15]" /> Tendências Oficiais da Categoria (/trends/MLB/{category.id})
          </p>
          <div className="flex flex-wrap gap-2">
            {category.trends.slice(0, 18).map((t) => (
              <button
                key={t.keyword}
                type="button"
                onClick={() => onPickTrend(t.keyword)}
                className="rounded-xl border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-2.5 py-1 text-xs text-blue-200 transition hover:bg-[#3b82f6]/20"
              >
                {t.keyword}
              </button>
            ))}
          </div>
        </div>
      )}

      {category.childrenCategories.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Subcategorias de {category.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {category.childrenCategories.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectCategory(ch.id)}
                className="rounded-xl border border-white/10 bg-[#0b1220] px-2.5 py-1 text-xs text-slate-200 transition hover:border-[#facc15]/40 hover:text-[#facc15]"
              >
                {ch.name} <span className="text-slate-500">({ch.id})</span>
                {ch.totalItems !== null ? ` · ${formatInt(ch.totalItems)}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =============================================================================
 * EXTRATOR DE PALAVRAS-CHAVE DOS TÍTULOS
 * ============================================================================= */

function KeywordsPanel({
  keywords,
  onPickTerm,
  title = 'Extrator de Palavras-Chave dos Títulos',
}: {
  keywords: { words: KeywordStat[]; phrases: KeywordStat[] };
  onPickTerm?: (term: string) => void;
  title?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  if (keywords.words.length === 0 && keywords.phrases.length === 0) return null;

  const copyTerm = (term: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(term);
      setCopied(term);
      setTimeout(() => setCopied((c) => (c === term ? null : c)), 1500);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-[#111827] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Hash size={16} className="text-[#facc15]" /> {title}
        </p>
        <span className="text-xs text-slate-400">
          Clique para copiar ou buscar termos recorrentes nos anúncios
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-slate-400">
            Termos individuais mais usados
          </p>
          <div className="flex flex-wrap gap-2">
            {keywords.words.slice(0, 14).map((w) => {
              const pct = Math.round(w.share * 100);
              return (
                <div
                  key={w.term}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0b1220] px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <button
                    type="button"
                    onClick={() => (onPickTerm ? onPickTerm(w.term) : copyTerm(w.term))}
                    className="font-medium hover:text-[#facc15]"
                    title="Pesquisar ou copiar termo"
                  >
                    {w.term}
                  </button>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {w.count}x · {pct}%
                  </span>
                  <button
                    type="button"
                    onClick={() => copyTerm(w.term)}
                    aria-label={`Copiar ${w.term}`}
                    className="text-slate-500 hover:text-slate-200"
                  >
                    {copied === w.term ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-slate-400">
            Expressões compostas (cauda longa)
          </p>
          {keywords.phrases.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma combinação repetida entre os títulos analisados.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {keywords.phrases.slice(0, 12).map((p) => {
                const pct = Math.round(p.share * 100);
                return (
                  <div
                    key={p.term}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#3b82f6]/25 bg-[#3b82f6]/10 px-2.5 py-1.5 text-xs text-blue-200"
                  >
                    <button
                      type="button"
                      onClick={() => (onPickTerm ? onPickTerm(p.term) : copyTerm(p.term))}
                      className="font-medium hover:text-[#facc15]"
                    >
                      {p.term}
                    </button>
                    <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-blue-300">
                      {p.count}x · {pct}%
                    </span>
                    <button
                      type="button"
                      onClick={() => copyTerm(p.term)}
                      aria-label={`Copiar ${p.term}`}
                      className="text-blue-300/70 hover:text-white"
                    >
                      {copied === p.term ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
 * LISTAGEM DE PRODUTOS (cards, tabela e filtros)
 * ============================================================================= */

function ProductCard({
  p,
  onOpen,
  onSimulate,
  onOpenCategory,
}: {
  p: ProductSummary;
  onOpen: (p: ProductSummary) => void;
  onSimulate: (p: ProductSummary) => void;
  onOpenCategory?: (categoryId: string) => void;
}) {
  const code = p.itemId ?? p.productId;
  const borderClass =
    p.ageAlert === 'danger'
      ? 'border-red-500/30 hover:border-red-500/50'
      : p.ageAlert === 'warning'
        ? 'border-amber-500/30 hover:border-amber-500/50'
        : 'border-white/5 hover:border-white/10';

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-[#111827] transition ${borderClass}`}
    >
      <div className="flex h-56 items-center justify-center bg-white p-4">
        <SafeImage src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {p.listingType && <Pill tone="blue">{p.listingType}</Pill>}
          {p.fulfillment && <Pill tone="green">Full</Pill>}
          {p.freeShipping && <Pill tone="yellow">Frete grátis</Pill>}
          {p.isSponsored && <Pill tone="amber">Patrocinado</Pill>}
          {p.categoryId && onOpenCategory && (
            <button
              type="button"
              onClick={() => onOpenCategory(p.categoryId as string)}
              className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-[#facc15]"
              title={`Analisar categoria ${p.categoryId}`}
            >
              Cat: {p.categoryId}
            </button>
          )}
          <AgeAlertBadge alert={p.ageAlert} days={p.daysOnAir} />
        </div>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-slate-100">{p.title}</h3>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-[#facc15]">{formatBRL(p.price)}</p>
          {p.originalPrice !== null && p.price !== null && p.originalPrice > p.price && (
            <span className="text-xs text-slate-500 line-through">{formatBRL(p.originalPrice)}</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Mini label="Criado em" value={formatDate(p.createdAt)} sub={formatDaysOnAir(p.daysOnAir)} />
          <Mini
            label="Vendas"
            value={formatInt(p.soldQuantity)}
            sub={
              p.velocity
                ? `${formatDecimal(p.velocity.daily, 1)}/dia · ${formatInt(p.velocity.monthly)}/mês`
                : p.soldSource
            }
          />
          <Mini
            label="Faturamento 30d"
            value={p.revenue ? formatBRL(p.revenue.monthly) : HIDDEN}
            sub={p.seller?.nickname ?? HIDDEN}
          />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <button type="button" onClick={() => onOpen(p)} disabled={!code} className={BTN_SM_BLUE}>
            <Search size={14} /> Abrir Raio-X
          </button>
          <button type="button" onClick={() => onSimulate(p)} className={BTN_SM_YELLOW}>
            <Calculator size={14} /> Simular Margem
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductTable({
  items,
  onOpen,
  onSimulate,
}: {
  items: ProductSummary[];
  onOpen: (p: ProductSummary) => void;
  onSimulate: (p: ProductSummary) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5 bg-[#111827]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#0b1220] text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Produto</th>
            <th className="px-4 py-3 font-medium">Preço</th>
            <th className="px-4 py-3 font-medium">Idade / Alerta</th>
            <th className="px-4 py-3 font-medium">Vendas / Giro</th>
            <th className="px-4 py-3 font-medium">Receita 30d</th>
            <th className="px-4 py-3 font-medium">Vendedor</th>
            <th className="px-4 py-3 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => {
            const code = p.itemId ?? p.productId;
            return (
              <tr
                key={`${code ?? 'sem-codigo'}-${i}`}
                className="border-t border-white/5 align-middle transition hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3">
                  <div className="flex min-w-[250px] items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                      <SafeImage src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-medium text-slate-100">{p.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{code ?? HIDDEN}</span>
                        {p.fulfillment && <Pill tone="green">Full</Pill>}
                        {p.listingType && <Pill tone="blue">{p.listingType}</Pill>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-[#facc15]">{formatBRL(p.price)}</td>
                <td className="px-4 py-3">
                  <p className="text-slate-200">{formatDate(p.createdAt)}</p>
                  <div className="mt-1">
                    <AgeAlertBadge alert={p.ageAlert} days={p.daysOnAir} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-200">{formatInt(p.soldQuantity)}</p>
                  <p className="text-xs text-slate-400">
                    {p.velocity ? `${formatDecimal(p.velocity.daily, 1)}/dia` : p.soldSource}
                  </p>
                </td>
                <td className="px-4 py-3 font-medium text-emerald-400">
                  {p.revenue ? formatBRL(p.revenue.monthly) : HIDDEN}
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-200">{p.seller?.nickname ?? HIDDEN}</p>
                  <p className="text-xs text-slate-400">{p.seller?.medal ?? HIDDEN}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => onOpen(p)} disabled={!code} className={BTN_SM_BLUE}>
                      <Search size={14} /> Raio-X
                    </button>
                    <button type="button" onClick={() => onSimulate(p)} className={BTN_SM_YELLOW}>
                      <Calculator size={14} /> Margem
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KeywordView({
  result,
  filters,
  onFilters,
  onOpen,
  onSimulate,
  onPickTerm,
  onOpenCategory,
  onUseCategoryFees,
}: {
  result: KeywordAnalysis;
  filters: FilterState;
  onFilters: (patch: Partial<FilterState>) => void;
  onOpen: (p: ProductSummary) => void;
  onSimulate: (p: ProductSummary) => void;
  onPickTerm: (term: string) => void;
  onOpenCategory: (categoryId: string) => void;
  onUseCategoryFees: (category: CategoryOverview) => void;
}) {
  const visible = useMemo(
    () => applyFilters(result.products, filters.age, filters.logistic, filters.sort),
    [result.products, filters.age, filters.logistic, filters.sort],
  );

  const keywords = useMemo(
    () => result.keywords ?? extractKeywords(result.products.map((p) => p.title)),
    [result.keywords, result.products],
  );

  const summaryMetrics = useMemo(() => {
    const prices = visible.map((p) => p.price).filter((x): x is number => x !== null && x > 0);
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const totalSold = visible.reduce((acc, p) => acc + (p.soldQuantity ?? 0), 0);
    const totalRev30 = visible.reduce((acc, p) => acc + (p.revenue?.monthly ?? 0), 0);
    const fullCount = visible.filter((p) => p.fulfillment).length;
    return { avgPrice, totalSold, totalRev30, fullCount };
  }, [visible]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Resultados para</p>
          <h2 className="text-lg font-semibold text-slate-100">&ldquo;{result.query}&rdquo;</h2>
          <p className="text-sm text-slate-400">
            Mostrando {visible.length} de {result.products.length} anúncios
          </p>
        </div>
        <div className="flex rounded-xl bg-[#111827] p-1">
          <ToggleButton
            active={filters.view === 'grid'}
            onClick={() => onFilters({ view: 'grid' })}
            icon={<LayoutGrid size={15} />}
            label="Cards"
          />
          <ToggleButton
            active={filters.view === 'table'}
            onClick={() => onFilters({ view: 'table' })}
            icon={<List size={15} />}
            label="Tabela"
          />
        </div>
      </div>

      {result.note && <Banner kind="aviso">{result.note}</Banner>}

      {result.category && (
        <CategoryOverviewPanel
          category={result.category}
          onSelectCategory={onOpenCategory}
          onPickTrend={onPickTerm}
          onUseCategoryFees={onUseCategoryFees}
        />
      )}

      {visible.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={<Tag size={14} />}
            label="Preço médio da página"
            value={formatBRL(summaryMetrics.avgPrice)}
            valueClass="text-[#facc15]"
          />
          <Stat
            icon={<TrendingUp size={14} />}
            label="Vendas acumuladas (amostra)"
            value={formatInt(summaryMetrics.totalSold)}
          />
          <Stat
            icon={<BarChart3 size={14} />}
            label="Receita mensal estimada (30d)"
            value={summaryMetrics.totalRev30 > 0 ? formatBRL(summaryMetrics.totalRev30) : HIDDEN}
            valueClass="text-emerald-400"
          />
          <Stat
            icon={<Truck size={14} />}
            label="Anúncios no Full"
            value={`${summaryMetrics.fullCount} de ${visible.length}`}
          />
        </div>
      )}

      <KeywordsPanel keywords={keywords} onPickTerm={onPickTerm} />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-[#111827] p-3">
        <ChipGroup
          label="Idade"
          options={AGE_OPTIONS}
          value={filters.age}
          onChange={(v) => onFilters({ age: v as AgeFilter })}
        />
        <ChipGroup
          label="Logística"
          options={LOGISTIC_OPTIONS}
          value={filters.logistic}
          onChange={(v) => onFilters({ logistic: v as LogisticFilter })}
        />
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          Ordenar
          <select
            value={filters.sort}
            onChange={(e) => onFilters({ sort: e.target.value as SortKey })}
            className="rounded-lg border border-white/10 bg-[#070b14] px-2 py-1.5 text-sm text-slate-100 outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {result.products.length === 0 ? (
        <EmptyBox>Nenhum anúncio encontrado para esta busca. Tente outra palavra-chave.</EmptyBox>
      ) : visible.length === 0 ? (
        <EmptyBox>Nenhum anúncio atende aos filtros atuais.</EmptyBox>
      ) : filters.view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p, i) => (
            <ProductCard
              key={`${p.itemId ?? p.productId ?? 'sem-codigo'}-${i}`}
              p={p}
              onOpen={onOpen}
              onSimulate={onSimulate}
              onOpenCategory={onOpenCategory}
            />
          ))}
        </div>
      ) : (
        <ProductTable items={visible} onOpen={onOpen} onSimulate={onSimulate} />
      )}
    </section>
  );
}

/* =============================================================================
 * RAIO-X: PAINÉIS ANALÍTICOS JOOMPULSE / AVANTPRO
 * ============================================================================= */

function VelocityRevenuePanel({
  velocity,
  revenue,
  soldSource,
}: {
  velocity: Periods | null;
  revenue: Periods | null;
  soldSource: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#111827] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <BarChart3 size={16} className="text-[#10b981]" /> Giro de Vendas &amp; Faturamento (Métricas JoomPulse Bc / Uc)
        </p>
        <Pill tone="blue">{soldSource}</Pill>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Giro Diário"
          value={velocity ? `${formatDecimal(velocity.daily, 2)} un./dia` : HIDDEN}
          hint={revenue ? `Receita: ${formatBRL(revenue.daily)}/dia` : 'Requer vendas e data de criação'}
          valueClass="text-slate-100"
        />
        <Stat
          label="Giro Semanal (7d)"
          value={velocity ? `${formatInt(velocity.weekly)} un./sem` : HIDDEN}
          hint={revenue ? `Receita: ${formatBRL(revenue.weekly)}/sem` : undefined}
          valueClass="text-slate-100"
        />
        <Stat
          label="Giro Mensal (30d)"
          value={velocity ? `${formatInt(velocity.monthly)} un./mês` : HIDDEN}
          hint={revenue ? `Receita 30d: ${formatBRL(revenue.monthly)}` : undefined}
          valueClass="text-[#10b981]"
        />
        <Stat
          label="Faturamento Total"
          value={revenue ? formatBRL(revenue.total) : HIDDEN}
          hint={velocity ? `${formatInt(velocity.total)} unidades acumuladas` : undefined}
          valueClass="text-[#facc15]"
        />
      </div>
    </div>
  );
}

function SalesEstimatePanel({
  est,
  soldLabel,
  soldSource,
}: {
  est: SalesEstimate | null;
  soldLabel: string;
  soldSource: string;
}) {
  if (!est) return null;
  const rangeStr =
    est.maxSales === null
      ? `≥ ${formatInt(est.minSales)}`
      : est.minSales === est.maxSales
        ? formatInt(est.minSales)
        : `${formatInt(est.minSales)} – ${formatInt(est.maxSales)}`;

  return (
    <div className="rounded-2xl border border-white/5 bg-[#111827] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sparkles size={16} className="text-[#facc15]" /> Motor de Vendas (Módulo 98069 Avantpro)
        </p>
        <Pill tone="yellow">{soldLabel}</Pill>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Faixa pública ML"
          value={rangeStr}
          hint={`Centro da faixa: ${formatInt(est.rangeCenter)}`}
        />
        <Stat
          label="Centro ajustado (w)"
          value={formatInt(est.rangeCenterAdjusted)}
          hint={
            est.ageMonths !== null
              ? `Idade ~${formatDecimal(est.ageMonths, 1)} meses (${((est.ageAdjustment ?? 0) * 100).toFixed(0)}%)`
              : 'Sem ajuste por idade'
          }
        />
        <Stat
          label="Por avaliações (A)"
          value={est.reviewsEstimateAdjusted !== null ? formatInt(est.reviewsEstimateAdjusted) : 'Sem opiniões'}
          hint={
            est.reviewsEstimate !== null
              ? `Base bruta (×15): ${formatInt(est.reviewsEstimate)}`
              : 'Ponderação 100% na faixa'
          }
        />
        <Stat
          label="Estimativa Final"
          value={formatInt(est.final)}
          hint={`Consolidada (0,6·A + 0,4·w): ${formatInt(est.consolidated)}`}
          valueClass="text-[#facc15]"
        />
        <Stat
          label="Ritmo Atual / Mês"
          value={est.monthlyPace !== null ? `${formatInt(est.monthlyPace)} un./mês` : HIDDEN}
          hint="Fórmula 0,4·C / (meses / 3)"
          valueClass="text-[#10b981]"
        />
      </div>

      <ul className="mt-3 grid gap-1.5 text-xs text-slate-400 sm:grid-cols-2">
        {est.explanation.map((line, i) => (
          <li key={i}>• {line}</li>
        ))}
        <li>• Fonte ativa para o dossiê: {soldSource}</li>
      </ul>
    </div>
  );
}

function FeesAndSignalsPanel({
  fees,
  signals,
  isSupermarket,
}: {
  fees: FeeSnapshot;
  signals: PageSignals | null;
  isSupermarket: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/5 bg-[#111827] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Layers size={16} className="text-[#3b82f6]" /> Tarifas Reais da Categoria &amp; Frete
          </p>
          {isSupermarket && <Pill tone="yellow">Supermercado</Pill>}
        </div>
        <p className="mb-3 text-xs text-slate-400">
          Categoria: <span className="text-slate-200">{fees.categoryPath ?? fees.categoryId ?? HIDDEN}</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Clássico (gold_special)"
            value={fees.classic ? formatBRL(fees.classic.amount) : HIDDEN}
            hint={
              fees.classic
                ? `${formatDecimal(fees.classic.percentage, 1)}% + fixa ${formatBRL(fees.classic.fixed)}`
                : undefined
            }
          />
          <Stat
            label="Premium (gold_pro)"
            value={fees.premium ? formatBRL(fees.premium.amount) : HIDDEN}
            hint={
              fees.premium
                ? `${formatDecimal(fees.premium.percentage, 1)}% + fixa ${formatBRL(fees.premium.fixed)}`
                : undefined
            }
          />
          <Stat
            label="Frete (list_cost)"
            value={
              fees.freeShippingByMeli
                ? 'R$ 0,00 (coberto ML)'
                : fees.shippingListCost !== null
                  ? formatBRL(fees.shippingListCost)
                  : 'Simular na aba'
            }
            hint={fees.shippingSource}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Origem das taxas: {fees.feeSource}</p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#111827] p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Code size={16} className="text-[#facc15]" /> Estado da Página Capturado
        </p>
        {signals && signals.sources.length > 0 ? (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-1.5">
              {signals.sources.map((src) => (
                <Pill key={src} tone="blue">
                  {src}
                </Pill>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Mini label="Tipo de página" value={signals.pageType} />
              <Mini label="start_time" value={formatDate(signals.startTime)} sub={signals.startTimeSource ?? undefined} />
              <Mini
                label="tracks.sold_quantity"
                value={signals.soldExact !== null ? formatInt(signals.soldExact) : signals.soldText ?? HIDDEN}
              />
              <Mini
                label="Estoque no DOM"
                value={signals.availableQuantity !== null ? formatInt(signals.availableQuantity) : HIDDEN}
                sub={signals.stockText ?? undefined}
              />
              <Mini
                label="Vendedores catálogo"
                value={signals.catalogSellers !== null ? formatInt(signals.catalogSellers) : HIDDEN}
              />
              <Mini label="Polycards lidos" value={formatInt(signals.polycards.length)} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Dados carregados diretamente da API Oficial do Mercado Livre.
          </p>
        )}
      </div>
    </div>
  );
}

function SellerPanel({ seller }: { seller: SellerInfo | null }) {
  if (!seller) return <EmptyBox>Vendedor oculto no anúncio.</EmptyBox>;
  const location =
    seller.city && seller.state
      ? `${seller.city} - ${seller.state}`
      : (seller.city ?? seller.state ?? HIDDEN);
  return (
    <div className="rounded-2xl border border-white/5 bg-[#111827] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Store size={16} className="text-[#10b981]" /> Reputação do Vendedor
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="yellow">
            <Award size={12} /> {seller.medal}
          </Pill>
          {seller.reputationLevel && <Pill tone="green">Nível {seller.reputationLevel}</Pill>}
          {seller.officialStoreId && <Pill tone="blue">Loja Oficial #{seller.officialStoreId}</Pill>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Loja" value={seller.nickname ?? HIDDEN} hint={seller.id ? `ID #${seller.id}` : undefined} />
        <Stat
          label="Conta criada em"
          value={formatDate(seller.registrationDate)}
          hint={formatAccountAge(seller.accountYears)}
        />
        <Stat label="Localização" value={location} />
        <Stat
          label="Vendas concluídas"
          value={formatInt(seller.completedSales)}
          hint={
            seller.positiveRatingPct !== null
              ? `${formatDecimal(seller.positiveRatingPct, 1)}% avaliações positivas`
              : undefined
          }
          valueClass="text-[#10b981]"
        />
      </div>
      {(seller.claimsRate !== null ||
        seller.cancellationRate !== null ||
        seller.delayedHandlingRate !== null) && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Mini
            label="Taxa de reclamações"
            value={
              seller.claimsRate !== null ? formatPercent(seller.claimsRate * 100) : HIDDEN
            }
          />
          <Mini
            label="Taxa de cancelamento"
            value={
              seller.cancellationRate !== null ? formatPercent(seller.cancellationRate * 100) : HIDDEN
            }
          />
          <Mini
            label="Envio com atraso"
            value={
              seller.delayedHandlingRate !== null
                ? formatPercent(seller.delayedHandlingRate * 100)
                : HIDDEN
            }
          />
        </div>
      )}
    </div>
  );
}

function CompetitorList({ rows }: { rows: CompetitorRow[] }) {
  if (rows.length === 0) {
    return <EmptyBox>Nenhuma oferta concorrente retornada para este catálogo.</EmptyBox>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5 bg-[#111827]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#0b1220] text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Anúncio</th>
            <th className="px-4 py-3 font-medium">Preço</th>
            <th className="px-4 py-3 font-medium">Vendedor</th>
            <th className="px-4 py-3 font-medium">Logística</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId} className="border-t border-white/5">
              <td className="px-4 py-3">
                <p className="text-slate-200">{r.itemId}</p>
                {r.listingType && <p className="text-xs text-slate-500">{r.listingType}</p>}
              </td>
              <td className="px-4 py-3 font-semibold text-[#facc15]">{formatBRL(r.price)}</td>
              <td className="px-4 py-3">
                <p className="text-slate-200">{r.sellerNickname ?? HIDDEN}</p>
                <p className="text-xs text-slate-500">{r.sellerMedal ?? HIDDEN}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {r.fulfillment && <Pill tone="green">Full</Pill>}
                  {r.freeShipping && <Pill tone="yellow">Frete grátis</Pill>}
                  {!r.fulfillment && !r.freeShipping && <span className="text-xs text-slate-500">Padrão</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DossierView({
  d,
  canGoBack,
  onBack,
  onSimulate,
  onPickTerm,
  onOpenCategory,
}: {
  d: Dossier;
  canGoBack: boolean;
  onBack: () => void;
  onSimulate: () => void;
  onPickTerm: (term: string) => void;
  onOpenCategory: (categoryId: string) => void;
}) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const ratingCountText =
    d.ratingCount === null ? 'Opiniões ocultas' : `${formatInt(d.ratingCount)} opiniões`;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {canGoBack ? (
          <button type="button" onClick={onBack} className={BTN_GHOST}>
            <ChevronLeft size={14} /> Voltar à lista
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setJsonOpen(true)} className={BTN_GHOST}>
            <Code size={14} /> Ver JSON Puro da API
          </button>
          <button type="button" onClick={onSimulate} className={BTN_SM_YELLOW}>
            <Calculator size={14} /> Simular na Calculadora Ee
          </button>
          {d.permalink && (
            <a href={d.permalink} target="_blank" rel="noreferrer" className={BTN_GHOST}>
              <ExternalLink size={14} /> Abrir anúncio
            </a>
          )}
        </div>
      </div>

      {d.ageAlert && d.ageAlert !== 'ok' && (
        <Banner kind={d.ageAlert === 'danger' ? 'erro' : 'aviso'}>
          <strong>{d.ageAlertLabel ?? AGE_ALERT_LABEL[d.ageAlert]}:</strong> este anúncio está no ar há{' '}
          {formatDaysOnAir(d.daysOnAir)} (criado em {formatDate(d.createdAt)}).
        </Banner>
      )}

      <div className="flex flex-wrap gap-2">
        <Pill>Fonte: {d.origin}</Pill>
        {d.itemId && <Pill tone="blue">Anúncio: {d.itemId}</Pill>}
        {d.productId && <Pill tone="blue">Catálogo: {d.productId}</Pill>}
        {d.categoryId && (
          <button
            type="button"
            onClick={() => onOpenCategory(d.categoryId as string)}
            className="inline-flex items-center gap-1 rounded-md border border-[#facc15]/30 bg-[#facc15]/10 px-2 py-0.5 text-xs font-medium text-[#facc15] transition hover:bg-[#facc15]/20"
            title="Clique para abrir o Raio-X e tendências desta categoria"
          >
            <Layers size={12} /> Categoria: {d.categoryId}
          </button>
        )}
        {d.listingType && <Pill tone="yellow">{d.listingType}</Pill>}
        {d.fulfillment && <Pill tone="green">Full</Pill>}
        {d.freeShipping && <Pill tone="green">Frete grátis</Pill>}
        {d.isSupermarket && <Pill tone="amber">Supermercado</Pill>}
        <AgeAlertBadge alert={d.ageAlert} days={d.daysOnAir} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Gallery key={d.itemId ?? d.productId ?? d.title} images={d.images} title={d.title} />
        </div>

        <div className="space-y-5 lg:col-span-3">
          <div>
            <h2 className="text-xl font-semibold leading-snug text-slate-100">{d.title}</h2>
            <p className="mt-1 text-sm text-slate-400">
              Marca: {d.brand ?? HIDDEN} · Modelo: {d.model ?? HIDDEN}
              {d.categoryPath ? ` · ${d.categoryPath}` : ''}
            </p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#111827] p-5">
            <div className="flex flex-wrap items-end gap-3">
              <p className="text-4xl font-bold text-[#facc15]">{formatBRL(d.price)}</p>
              {d.originalPrice !== null && (
                <p className="pb-1 text-sm text-slate-500 line-through">{formatBRL(d.originalPrice)}</p>
              )}
              {d.discountPct !== null && d.discountPct > 0 && <Pill tone="green">{d.discountPct}% OFF</Pill>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <span className="flex items-center gap-1.5">
                <Star size={14} className="text-[#facc15]" />
                {formatRating(d.ratingAverage)}
              </span>
              <span>{ratingCountText}</span>
              {d.fees.current && (
                <span className="text-xs text-slate-400">
                  Comissão estimada: {formatBRL(d.fees.current.amount)} ({formatDecimal(d.fees.current.percentage, 1)}%)
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={<Calendar size={14} />}
              label="Criação do anúncio"
              value={formatDate(d.createdAt)}
              hint={`${formatDaysOnAir(d.daysOnAir)} · ${d.createdSource}`}
              valueClass={
                d.ageAlert === 'danger'
                  ? 'text-red-400'
                  : d.ageAlert === 'warning'
                    ? 'text-amber-300'
                    : 'text-slate-100'
              }
            />
            <Stat
              icon={<Boxes size={14} />}
              label="Estoque disponível"
              value={formatInt(d.availableQuantity)}
              hint={d.stockText ? `${d.stockText} · ${d.stockSource}` : d.stockSource}
            />
            <Stat
              icon={<TrendingUp size={14} />}
              label="Volume de vendas"
              value={d.soldLabel}
              hint={d.soldSource}
              valueClass="text-[#10b981]"
            />
            <Stat
              icon={<Camera size={14} />}
              label="1ª foto (assinatura)"
              value={d.firstPhotoDate ?? HIDDEN}
              hint={d.firstPhotoSource}
            />
          </div>

          <SellerPanel seller={d.seller} />
        </div>
      </div>

      <VelocityRevenuePanel velocity={d.velocity} revenue={d.revenue} soldSource={d.soldSource} />

      <SalesEstimatePanel est={d.salesEstimate} soldLabel={d.soldLabel} soldSource={d.soldSource} />

      <FeesAndSignalsPanel fees={d.fees} signals={d.pageSignals} isSupermarket={d.isSupermarket} />

      <KeywordsPanel keywords={d.keywords} onPickTerm={onPickTerm} />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Ofertas concorrentes no catálogo</h3>
        <CompetitorList rows={d.competitors} />
      </div>

      {d.notes.length > 0 && (
        <ul className="space-y-1.5 rounded-2xl border border-white/5 bg-[#111827] p-4 text-xs leading-relaxed text-slate-400">
          {d.notes.map((note, i) => (
            <li key={i}>• {note}</li>
          ))}
        </ul>
      )}

      {jsonOpen && (
        <Modal title="JSON puro da API e Estado da Página" onClose={() => setJsonOpen(false)} wide>
          <p className="mb-3 text-xs text-slate-400">
            Resposta completa combinando API oficial, estado da página e cálculos do Módulo 98069.
          </p>
          <pre className="max-h-[65vh] overflow-auto rounded-xl bg-[#070b14] p-4 text-xs leading-relaxed text-slate-300">
            {JSON.stringify(d.raw, null, 2)}
          </pre>
        </Modal>
      )}
    </section>
  );
}

/* =============================================================================
 * CALCULADORA COMPLETA DA CLASSE "Ee" (custo total, MC, líquido e preço sugerido)
 * ============================================================================= */

function BreakdownCard({
  title,
  badge,
  active,
  b,
  suggested,
  marginMode,
  marginTargetRaw,
  onApplySuggested,
}: {
  title: string;
  badge: string;
  active: boolean;
  b: CalculatorBreakdown;
  suggested: SuggestedPrice;
  marginMode: 'pct' | 'brl';
  marginTargetRaw: string;
  onApplySuggested: (price: number) => void;
}) {
  const hasPrice = b.price > 0;
  const mcPositive = b.contribution >= 0;

  return (
    <div
      className={`space-y-4 rounded-2xl border p-5 ${
        active ? 'border-[#facc15]/40 bg-[#111827]' : 'border-white/5 bg-[#111827]/90'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <p className="text-xs text-slate-400">{badge}</p>
        </div>
        {active && <Pill tone="yellow">Modalidade selecionada</Pill>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Margem de Contribuição (R$)"
          value={hasPrice ? formatBRL(b.contribution) : 'Informe o preço'}
          valueClass={!hasPrice ? 'text-slate-400' : mcPositive ? 'text-emerald-400' : 'text-red-400'}
        />
        <Stat
          label="Margem de Contribuição (%)"
          value={hasPrice ? formatPercent(b.contributionPct * 100) : 'Informe o preço'}
          valueClass={!hasPrice ? 'text-slate-400' : mcPositive ? 'text-emerald-400' : 'text-red-400'}
        />
        <Stat
          label="Valor Líquido a Receber (ML)"
          value={hasPrice ? formatBRL(b.netReceive) : 'Informe o preço'}
          hint="Preço − comissão − taxa fixa − frete"
          valueClass="text-[#3b82f6]"
        />
        <Stat
          label="Custo Total da Operação"
          value={hasPrice ? formatBRL(b.totalCost) : 'Informe o preço'}
          hint="Comissão + fixa + frete + produto + extra + imposto"
        />
      </div>

      <div className="space-y-2 rounded-xl border border-white/5 bg-[#0b1220] p-4 text-xs">
        <p className="mb-1 font-semibold uppercase tracking-wide text-slate-400">
          Decomposição no preço {hasPrice ? formatBRL(b.price) : 'R$ 0,00'}
        </p>
        <div className="flex justify-between text-slate-300">
          <span>Comissão ML ({formatDecimal(b.commissionPct, 1)}%)</span>
          <span>{formatBRL(b.commission, 'R$ 0,00')}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Taxa fixa por faixa</span>
          <span>{formatBRL(b.fixedFee, 'R$ 0,00')}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Frete considerado</span>
          <span>{formatBRL(b.shipping, 'R$ 0,00')}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Imposto NF</span>
          <span>{formatBRL(b.tax, 'R$ 0,00')}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Custo do produto + embalagem</span>
          <span>{formatBRL(b.productCost + b.extraCost, 'R$ 0,00')}</span>
        </div>
      </div>

      <div className="rounded-xl border border-[#facc15]/25 bg-[#facc15]/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#facc15]">
              Preço Sugerido ({marginMode === 'pct' ? `Meta ${marginTargetRaw || '0'}%` : `Meta R$ ${marginTargetRaw || '0'}`})
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-100">
              {suggested.price !== null ? formatBRL(suggested.price) : 'Meta inatingível'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {suggested.price !== null
                ? `Convergiu em ${suggested.iterations}/${MAX_PRICE_ITERATIONS} iterações (|ΔP| < R$ 0,01) · MC resultante: ${
                    suggested.breakdown
                      ? `${formatBRL(suggested.breakdown.contribution)} (${formatPercent(suggested.breakdown.contributionPct * 100)})`
                      : '-'
                  }`
                : 'A soma de imposto + comissão + margem desejada ultrapassa 100%.'}
            </p>
          </div>
          {suggested.price !== null && (
            <button
              type="button"
              onClick={() => onApplySuggested(suggested.price as number)}
              className={BTN_SM_YELLOW}
            >
              Aplicar preço
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CalculatorView({
  calc,
  onChange,
  ee,
}: {
  calc: CalcForm;
  onChange: (patch: Partial<CalcForm>) => void;
  ee: EeOutput;
}) {
  const applySuggested = (price: number) => {
    onChange({ salePrice: formatInputNumber(price) });
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/5 bg-[#111827] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Calculator size={18} className="text-[#facc15]" /> Calculadora de Precificação &amp; Margem (Classe Ee Avantpro)
            </h2>
            <p className="text-xs text-slate-400">
              Regras de comissão e taxa fixa por faixa (&lt;R$ 12,50 → 50%; &lt;R$ 29 → R$ 6,25; &lt;R$ 50 → R$ 6,50; &lt;R$ 79 → R$ 6,75; ≥R$ 79 → isento) e cálculo iterativo de até {MAX_PRICE_ITERATIONS} repetições.
            </p>
          </div>
          {calc.categoryLabel && <Pill tone="blue">Categoria: {calc.categoryLabel}</Pill>}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Produto analisado" className="md:col-span-2">
            <input
              className={INPUT_CLASS}
              value={calc.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Ex.: Creatina Growth 250g"
            />
          </Field>
          <Field label="Preço de venda atual (R$)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.salePrice}
              onChange={(e) => onChange({ salePrice: e.target.value })}
              placeholder="0,00"
            />
          </Field>
          <Field label="Modalidade em destaque">
            <select
              className={INPUT_CLASS}
              value={calc.listing}
              onChange={(e) => onChange({ listing: e.target.value as ListingKind })}
            >
              <option value="classico">Clássico (gold_special)</option>
              <option value="premium">Premium (gold_pro)</option>
            </select>
          </Field>

          <Field label="Custo do produto (R$)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.supplierCost}
              onChange={(e) => onChange({ supplierCost: e.target.value })}
              placeholder="0,00"
            />
          </Field>
          <Field label="Custo extra / embalagem (R$)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.packagingCost}
              onChange={(e) => onChange({ packagingCost: e.target.value })}
              placeholder="0,00"
            />
          </Field>
          <Field label="Imposto NF (%)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.taxPct}
              onChange={(e) => onChange({ taxPct: e.target.value })}
              placeholder="6"
            />
          </Field>
          <Field label="Custo de frete list_cost (R$)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.shippingCost}
              onChange={(e) => onChange({ shippingCost: e.target.value })}
              placeholder="22,90"
            />
          </Field>

          <Field label="Comissão Clássico (%)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.classicPct}
              onChange={(e) => onChange({ classicPct: e.target.value })}
              placeholder="12"
            />
          </Field>
          <Field label="Comissão Premium (%)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.premiumPct}
              onChange={(e) => onChange({ premiumPct: e.target.value })}
              placeholder="17"
            />
          </Field>
          <Field label="Modo da Margem Desejada">
            <select
              className={INPUT_CLASS}
              value={calc.marginMode}
              onChange={(e) => onChange({ marginMode: e.target.value as 'pct' | 'brl' })}
            >
              <option value="pct">Em percentual (%)</option>
              <option value="brl">Em reais (R$)</option>
            </select>
          </Field>
          <Field
            label={
              calc.marginMode === 'pct'
                ? 'Margem de Contribuição Desejada (%)'
                : 'Margem de Contribuição Desejada (R$)'
            }
          >
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.marginTarget}
              onChange={(e) => onChange({ marginTarget: e.target.value })}
              placeholder={calc.marginMode === 'pct' ? '18' : '25,00'}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-5 border-t border-white/5 pt-4 text-xs text-slate-300">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={calc.mlCoversShipping}
              onChange={(e) => onChange({ mlCoversShipping: e.target.checked })}
              className="h-4 w-4 accent-[#3b82f6]"
            />
            Mercado Livre cobre o frete (entra como R$ 0,00)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={calc.shippingBelowThreshold}
              onChange={(e) => onChange({ shippingBelowThreshold: e.target.checked })}
              className="h-4 w-4 accent-[#3b82f6]"
            />
            Manter frete grátis por conta do vendedor mesmo abaixo de R$ {FREE_SHIPPING_THRESHOLD}
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={calc.isSupermarket}
              onChange={(e) => onChange({ isSupermarket: e.target.checked })}
              className="h-4 w-4 accent-[#3b82f6]"
            />
            Regra Supermercado (taxa fixa: &lt;30 R$1 · &lt;50 R$2 · &lt;100 R$4 · &lt;199 R$6)
          </label>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="Anúncio Clássico (gold_special)"
          badge={`Taxa base: ${calc.classicPct || '12'}%`}
          active={calc.listing === 'classico'}
          b={ee.classic}
          suggested={ee.suggestedClassic}
          marginMode={calc.marginMode}
          marginTargetRaw={calc.marginTarget}
          onApplySuggested={applySuggested}
        />
        <BreakdownCard
          title="Anúncio Premium (gold_pro)"
          badge={`Taxa base: ${calc.premiumPct || '17'}% (parcelamento sem juros)`}
          active={calc.listing === 'premium'}
          b={ee.premium}
          suggested={ee.suggestedPremium}
          marginMode={calc.marginMode}
          marginTargetRaw={calc.marginTarget}
          onApplySuggested={applySuggested}
        />
      </div>
    </section>
  );
}

/* =============================================================================
 * MODAL OAUTH
 * ============================================================================= */

function OAuthModal({
  session,
  onClose,
  onDisconnect,
}: {
  session: StoredSession | null;
  onClose: () => void;
  onDisconnect: () => void;
}) {
  const origin = window.location.origin;
  return (
    <Modal title="Autorizar Conta ML (OAuth)" onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-300">
        <p>
          Ao autorizar, o Mercado Livre libera as rotas privadas da sua conta. O client secret continua somente no
          servidor.
        </p>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">redirect_uri desta aplicação</p>
          <code className="block break-all rounded-lg bg-[#070b14] px-3 py-2 text-xs text-[#facc15]">{origin}</code>
          <p className="mt-2 text-xs text-slate-500">
            Cadastre exatamente este endereço no DevCenter, sem barra final.
          </p>
        </div>

        {session ? (
          <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="flex items-center gap-2 font-medium text-emerald-200">
              <Check size={16} /> Conta conectada
            </p>
            <p className="text-xs text-slate-300">ID do usuário: {session.tokens.userId ?? HIDDEN}</p>
            <p className="text-xs text-slate-300">
              Token válido até {new Date(session.tokens.expiresAt).toLocaleString('pt-BR')}. Ele é renovado
              automaticamente.
            </p>
            <button type="button" onClick={onDisconnect} className={BTN_GHOST}>
              <LogOut size={14} /> Desconectar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              window.location.href = buildAuthorizeUrl(origin);
            }}
            className={`${BTN_PRIMARY} w-full`}
          >
            <Key size={16} /> Ir para o Mercado Livre
          </button>
        )}
      </div>
    </Modal>
  );
}

/* =============================================================================
 * COMPONENTE PRINCIPAL
 * ============================================================================= */

export default function BuscasMLPro() {
  const [tab, setTab] = useState<TabKey>('busca');
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('auto');
  const [loading, setLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [keywordResult, setKeywordResult] = useState<KeywordAnalysis | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [calc, setCalc] = useState<CalcForm>(INITIAL_CALC);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [envStatus, setEnvStatus] = useState<StatusEnvelope | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const sessionRef = useRef<StoredSession | null>(null);
  const refreshRef = useRef<Promise<string | null> | null>(null);
  const exchangeStartedRef = useRef(false);
  const searchSeqRef = useRef(0);

  const ee = useMemo(() => computeEeCalculator(calc), [calc]);

  /* ---------- sessão ---------- */

  const persistSession = useCallback((next: StoredSession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) writeSession(next);
    else clearSession();
  }, []);

  const getBearer = useCallback(async (): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    const { tokens } = current;

    if (!needsRefresh(tokens)) return tokens.accessToken;

    if (!tokens.refreshToken) {
      if (tokens.expiresAt > Date.now()) return tokens.accessToken;
      persistSession(null);
      setNotice({ kind: 'aviso', text: 'Sua autorização do Mercado Livre expirou. Autorize a conta novamente.' });
      return null;
    }

    let pending = refreshRef.current;
    if (!pending) {
      const refreshToken = tokens.refreshToken;
      pending = requestRefresh(refreshToken)
        .then((fresh) => {
          persistSession({ tokens: fresh, savedAt: Date.now() });
          return fresh.accessToken;
        })
        .catch(() => {
          persistSession(null);
          setNotice({
            kind: 'erro',
            text: 'Não foi possível renovar a autorização. Conecte a conta novamente.',
          });
          return null;
        })
        .finally(() => {
          refreshRef.current = null;
        });
      refreshRef.current = pending;
    }
    return pending;
  }, [persistSession]);

  useEffect(() => {
    const stored = readSession();
    if (stored) {
      sessionRef.current = stored;
      setSession(stored);
    }
  }, []);

  useEffect(() => {
    if (exchangeStartedRef.current) return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const oauthError = url.searchParams.get('error');
    if (!code && !oauthError) return;

    exchangeStartedRef.current = true;
    ['code', 'state', 'error', 'error_description'].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

    if (oauthError || !code) {
      setNotice({ kind: 'erro', text: 'O Mercado Livre não concluiu a autorização. Tente novamente.' });
      return;
    }

    setLoading('Concluindo a autorização com o Mercado Livre...');
    requestExchange(code, window.location.origin)
      .then((tokens) => {
        persistSession({ tokens, savedAt: Date.now() });
        setNotice({
          kind: 'ok',
          text: 'Conta do Mercado Livre autorizada. As rotas privadas já estão liberadas.',
        });
      })
      .catch((err: unknown) => {
        setNotice({ kind: 'erro', text: errorMessage(err, 'Falha ao trocar o código de autorização.') });
      })
      .finally(() => setLoading(null));
  }, [persistSession]);

  useEffect(() => {
    let active = true;
    requestStatus()
      .then((s) => {
        if (active) setEnvStatus(s);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  /* ---------- buscas ---------- */

  const applyAnalysis = useCallback((a: Analysis) => {
    if (a.mode === 'keyword') {
      setKeywordResult(a);
      setDossier(null);
    } else {
      setDossier(a.dossier);
    }
  }, []);

  const runAnalysis = useCallback(
    async (input: string, label: string, modeOverride?: SearchMode) => {
      const seq = ++searchSeqRef.current;
      const effectiveMode = modeOverride ?? searchMode;
      setLoading(label);
      setNotice(null);
      try {
        const bearer = await getBearer();
        const analysis = await requestAnalysis(input, bearer, effectiveMode);
        if (seq === searchSeqRef.current) applyAnalysis(analysis);
      } catch (err) {
        if (seq === searchSeqRef.current) {
          setNotice({ kind: 'erro', text: errorMessage(err, 'Falha na consulta. Tente novamente.') });
        }
      } finally {
        if (seq === searchSeqRef.current) setLoading(null);
      }
    },
    [applyAnalysis, getBearer, searchMode],
  );

  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = query.trim();
    if (!input) {
      setNotice({
        kind: 'aviso',
        text: 'Digite uma palavra-chave, um código de anúncio (MLB/MLBU), um código de categoria (ex.: MLB190433) ou um link do Mercado Livre.',
      });
      return;
    }
    const label =
      searchMode === 'anuncio'
        ? `Abrindo Raio-X do anúncio ${input}...`
        : searchMode === 'categoria'
          ? `Consultando categoria ${input}...`
          : 'Consultando o Mercado Livre...';
    void runAnalysis(input, label, searchMode);
  };

  const runExampleTerm = (text: string) => {
    setQuery(text);
    setSearchMode('termo');
    void runAnalysis(text, `Buscando "${text}"...`, 'termo');
  };

  const runExampleAdCode = (code: string) => {
    setQuery(code);
    setSearchMode('anuncio');
    void runAnalysis(code, `Abrindo Raio-X de ${code}...`, 'anuncio');
  };

  const openCategory = (categoryId: string) => {
    setQuery(categoryId);
    setSearchMode('categoria');
    void runAnalysis(categoryId, `Consultando categoria ${categoryId}...`, 'categoria');
  };

  const openProduct = (p: ProductSummary) => {
    const code = p.itemId ?? p.productId;
    if (!code) {
      setNotice({ kind: 'aviso', text: 'Este anúncio não tem código para abrir o Raio-X.' });
      return;
    }
    setQuery(code);
    setSearchMode('anuncio');
    void runAnalysis(code, 'Abrindo o Raio-X...', 'anuncio');
  };

  /* ---------- calculadora e filtros ---------- */

  const simulateFromSummary = (src: ProductSummary) => {
    setCalc((prev) => ({
      ...prev,
      title: src.title,
      categoryLabel: src.categoryId ?? '',
      salePrice: src.price !== null ? formatInputNumber(src.price) : '',
      listing: kindFromLabel(src.listingType ?? src.listingTypeId) ?? 'classico',
      isSupermarket: src.isSupermarket,
      mlCoversShipping: false,
    }));
    setTab('calculadora');
  };

  const simulateFromDossier = (d: Dossier) => {
    const cPct =
      d.fees.categoryFees.range_128?.gold_special ?? DEFAULT_COMMISSION_PCT.gold_special;
    const pPct = d.fees.categoryFees.range_128?.gold_pro ?? DEFAULT_COMMISSION_PCT.gold_pro;
    setCalc((prev) => ({
      ...prev,
      title: d.title,
      categoryLabel: d.categoryPath ?? d.categoryId ?? '',
      salePrice: d.price !== null ? formatInputNumber(d.price) : '',
      listing: kindFromLabel(d.listingType ?? d.listingTypeId) ?? 'classico',
      classicPct: String(cPct).replace('.', ','),
      premiumPct: String(pPct).replace('.', ','),
      shippingCost:
        d.fees.shippingListCost !== null
          ? formatInputNumber(d.fees.shippingListCost)
          : prev.shippingCost,
      mlCoversShipping: d.fees.freeShippingByMeli,
      isSupermarket: d.isSupermarket,
    }));
    setTab('calculadora');
  };

  const simulateCategoryFees = (category: CategoryOverview) => {
    const cf = category.fees.categoryFees;
    const cPct =
      cf.range_128?.gold_special ??
      cf.range_64?.gold_special ??
      category.fees.classic?.percentage ??
      DEFAULT_COMMISSION_PCT.gold_special;
    const pPct =
      cf.range_128?.gold_pro ??
      cf.range_64?.gold_pro ??
      category.fees.premium?.percentage ??
      DEFAULT_COMMISSION_PCT.gold_pro;
    setCalc((prev) => ({
      ...prev,
      title: prev.title || `Simulação · ${category.name}`,
      categoryLabel: `${category.id} · ${category.path}`,
      classicPct: String(cPct).replace('.', ','),
      premiumPct: String(pPct).replace('.', ','),
    }));
    setTab('calculadora');
  };

  const patchCalc = useCallback((patch: Partial<CalcForm>) => {
    setCalc((c) => ({ ...c, ...patch }));
  }, []);

  const patchFilters = useCallback((patch: Partial<FilterState>) => {
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  const disconnect = () => {
    persistSession(null);
    setAuthOpen(false);
    setNotice({
      kind: 'aviso',
      text: 'Conta desconectada. As rotas privadas ficam indisponíveis até nova autorização.',
    });
  };

  const dossierKey = dossier ? (dossier.itemId ?? dossier.productId ?? dossier.title) : '';
  const activeModeMeta =
    SEARCH_MODE_OPTIONS.find((m) => m.value === searchMode) ?? SEARCH_MODE_OPTIONS[0];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#070b14]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#facc15] text-sm font-black text-[#070b14]">
              ML
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">
                BuscasML <span className="text-[#facc15]">Pro</span>
              </p>
              <p className="text-[11px] leading-tight text-slate-500">Motor Analítico Avantpro + JoomPulse</p>
            </div>
          </div>

          <nav className="flex rounded-xl bg-[#111827] p-1">
            <ToggleButton
              active={tab === 'busca'}
              onClick={() => setTab('busca')}
              icon={<Search size={15} />}
              label="Busca & Raio-X"
            />
            <ToggleButton
              active={tab === 'calculadora'}
              onClick={() => setTab('calculadora')}
              icon={<Calculator size={15} />}
              label="Calculadora Classe Ee"
            />
          </nav>

          <div className="flex items-center gap-2">
            {session && <Pill tone="green">Conta conectada</Pill>}
            <button type="button" onClick={() => setAuthOpen(true)} className={BTN_SM_YELLOW}>
              <Key size={14} /> Autorizar Conta ML (OAuth)
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {envStatus && !envStatus.secretConfigured && (
          <Banner kind="erro">
            ML_CLIENT_SECRET não configurado na Vercel. Sem ele, as buscas não funcionam.
          </Banner>
        )}
        {notice && (
          <Banner kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.text}
          </Banner>
        )}

        {tab === 'busca' ? (
          <>
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Busca &amp; Raio-X Analítico</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">
                Extração de estado da página (<code>__PRELOADED_STATE__</code>, <code>_n.ctx.r</code>,{' '}
                <code>melidata</code>, <code>ld+json</code>), vendas estimadas pelo Módulo 98069, giro JoomPulse e
                tarifas reais de categoria.
              </p>
            </div>

            <form onSubmit={submitSearch} className="space-y-3 rounded-2xl border border-white/5 bg-[#111827] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {SEARCH_MODE_OPTIONS.map((opt) => {
                    const active = searchMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSearchMode(opt.value)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? 'bg-[#3b82f6] text-white'
                            : 'border border-white/10 bg-[#0b1220] text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] text-slate-400">
                  Detecção automática diferencia categorias (4–7 dígitos, ex.: MLB190433) e anúncios (8–12 dígitos, ex.: MLB5625506238)
                </span>
              </div>

              <div className="flex flex-col gap-3 md:flex-row">
                <select
                  value={searchMode}
                  onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                  aria-label="Tipo de busca"
                  className="rounded-xl border border-white/10 bg-[#070b14] px-3 py-3 text-xs font-medium text-slate-200 outline-none focus:border-[#3b82f6] md:w-56"
                >
                  {SEARCH_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={activeModeMeta.placeholder}
                    aria-label="Pesquisa no Mercado Livre"
                    className={`${INPUT_CLASS} py-3 pl-10`}
                  />
                </div>

                <button type="submit" disabled={loading !== null} className={BTN_PRIMARY}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Buscar
                </button>
              </div>

              {searchMode === 'anuncio' && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-slate-400">Exemplos de códigos de anúncio/catálogo:</span>
                  {AD_CODE_EXAMPLES.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => runExampleAdCode(item.code)}
                      className="rounded-lg border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-2.5 py-1 text-blue-200 transition hover:bg-[#3b82f6]/20"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              {searchMode === 'categoria' && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-slate-400">Categorias populares do ML:</span>
                  {CATEGORY_EXAMPLES.map((cat) => (
                    <button
                      key={cat.code}
                      type="button"
                      onClick={() => openCategory(cat.code)}
                      className="rounded-lg border border-[#facc15]/30 bg-[#facc15]/10 px-2.5 py-1 text-[#facc15] transition hover:bg-[#facc15]/20"
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}
            </form>

            {loading && <LoadingBlock label={loading} />}

            {dossier ? (
              <DossierView
                key={dossierKey}
                d={dossier}
                canGoBack={keywordResult !== null}
                onBack={() => setDossier(null)}
                onSimulate={() => simulateFromDossier(dossier)}
                onPickTerm={runExampleTerm}
                onOpenCategory={openCategory}
              />
            ) : keywordResult ? (
              <KeywordView
                result={keywordResult}
                filters={filters}
                onFilters={patchFilters}
                onOpen={openProduct}
                onSimulate={simulateFromSummary}
                onPickTerm={runExampleTerm}
                onOpenCategory={openCategory}
                onUseCategoryFees={simulateCategoryFees}
              />
            ) : loading ? null : (
              <>
                <Onboarding />
                <ExamplesRow
                  onPickTerm={runExampleTerm}
                  onPickAdCode={runExampleAdCode}
                  onPickCategory={openCategory}
                />
              </>
            )}
          </>
        ) : (
          <CalculatorView calc={calc} onChange={patchCalc} ee={ee} />
        )}
      </main>

      {authOpen && (
        <OAuthModal session={session} onClose={() => setAuthOpen(false)} onDisconnect={disconnect} />
      )}
    </div>
  );
}

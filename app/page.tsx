'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  Boxes,
  Calculator,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileText,
  Film,
  Flame,
  Hash,
  Home,
  Info,
  Key,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Package,
  Scale,
  Search,
  Sparkles,
  Star,
  Store,
  Tag,
  ThumbsUp,
  TrendingUp,
  Truck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  AGE_ALERT_LABEL,
  DEFAULT_COMMISSION_PCT,
  breakdownAt,
  computeShippingWeight,
  evaluateListingQuality,
  extractKeywords,
  suggestPrice,
  type AgeAlert,
  type CalculatorBreakdown,
  type CalculatorInput,
  type CategoryFees,
  type KeywordStat,
  type ListingQualityCriterionId,
  type ListingQualityReport,
  type SuggestedPrice,
} from '@/lib/mlEngine';
import type {
  ProductVideo,
  ReviewComment,
  ReviewStarBreakdown,
} from '@/lib/pageState';
import {
  DEFAULT_ADVANCED_FILTERS,
  DEFAULT_LOCAL_FILTERS,
  readMonitorStore,
  writeMonitorStore,
  type AdvancedFilterState,
  type Analysis,
  type CategoryOverview,
  type CompetitorRow,
  type Dossier,
  type KeywordAnalysis,
  type MediaExtractorPayload,
  type ModuleId,
  type MonitorStoreState,
  type MonitoredProduct,
  type MonitoredSeller,
  type ProductReviewsData,
  type ProductSummary,
  type RankingCategoryTab,
  type RankingPayload,
  type RankingProductItem,
  type RootCategoryItem,
  type SearchMode,
  type SellerDossierPayload,
  type TrendsModulePayload,
} from '@/lib/platformTypes';
import {
  AdvancedProductSearchModule,
  CategoryAnalysisModule,
  HomeOverviewModule,
  TrendsModuleView,
} from '@/components/SearchAndCategoryModules';
import {
  ClipsAndImagesModule,
  ListingAuditorModule,
  MonitorModuleView,
  SellersAndCompetitorsModule,
} from '@/components/SellerMonitorMediaModules';

/* =============================================================================
 * TIPOS LOCAIS DE SESSÃO E CALCULADORA
 * ============================================================================= */

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
type RankingEnvelope = { ok: true; ranking: RankingPayload };
type CategoriesEnvelope = { ok: true; categories: RootCategoryItem[] };
type TrendsEnvelope = { ok: true; trendsData: TrendsModulePayload };
type SellerEnvelope = { ok: true; sellerDossier: SellerDossierPayload };
type MediaEnvelope = { ok: true; media: MediaExtractorPayload };
type TokenEnvelope = { ok: true; tokens: OAuthTokens };

type ListingKind = 'classico' | 'premium';
type AgeFilter = 'todos' | '30' | '60' | '90' | '180';
type LogisticFilter = 'todos' | 'full' | 'frete';
type SortKey = 'relevancia' | 'menor_preco' | 'maior_preco' | 'mais_vendidos' | 'mais_recentes';
type ViewMode = 'grid' | 'table';

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
  physicalWeightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  monthlyUnits: string;
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
const HIDDEN = '—';

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
  salePrice: '99,90',
  supplierCost: '35,00',
  packagingCost: '2,50',
  taxPct: '6',
  classicPct: String(DEFAULT_COMMISSION_PCT.gold_special),
  premiumPct: String(DEFAULT_COMMISSION_PCT.gold_pro),
  listing: 'classico',
  shippingCost: '21,45',
  mlCoversShipping: false,
  shippingBelowThreshold: false,
  isSupermarket: false,
  marginMode: 'pct',
  marginTarget: '20',
  physicalWeightGrams: '450',
  lengthCm: '24',
  widthCm: '16',
  heightCm: '10',
  monthlyUnits: '100',
};

const INPUT_CLASS =
  'w-full rounded-xl border border-white/10 bg-[#050914]/90 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:from-sky-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-60';
const BTN_SM_BLUE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-500/20 transition hover:from-sky-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_SM_YELLOW =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_GHOST =
  'inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50';

const PILL_TONES = {
  slate: 'border-white/10 bg-slate-900/80 text-slate-300',
  green: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300',
  yellow: 'border-amber-400/35 bg-amber-400/12 text-amber-300',
  blue: 'border-sky-400/35 bg-sky-500/12 text-sky-300',
  red: 'border-red-500/35 bg-red-500/12 text-red-300',
  amber: 'border-amber-500/35 bg-amber-500/12 text-amber-300',
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
  if (years === null) return 'Conta verificada';
  return years === 1 ? '1 ano no ML' : `${integer.format(years)} anos no ML`;
}

function formatRating(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value.toFixed(1).replace('.', ',')
    : HIDDEN;
}

function formatPercent(value: number | null | undefined, fallback: string = HIDDEN): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1).replace('.', ',')}%`
    : fallback;
}

function formatInputNumber(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

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
  if (/premium/i.test(label)) return 'premium';
  if (/cl[aá]ssico/i.test(label)) return 'classico';
  return null;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/* =============================================================================
 * MOTOR DA CALCULADORA DE MARGEM E PREÇO
 * ============================================================================= */

type MarginCalcOutput = {
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

function computeMarginCalculator(form: CalcForm): MarginCalcOutput {
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
  hints?: { origin?: string | null; uf?: string | null; limit?: number },
): Promise<Analysis> {
  const params = new URLSearchParams({ q: input, mode });
  if (hints?.origin) params.set('origin', hints.origin);
  if (hints?.uf) params.set('uf', hints.uf);
  if (hints?.limit) params.set('limit', String(hints.limit));
  const res = await fetch(`/api/ml?${params.toString()}`, {
    headers: authHeaders(bearer),
    cache: 'no-store',
  });
  const env = await readEnvelope<SearchEnvelope>(res);
  return env.data;
}

async function requestRootCategories(bearer: string | null): Promise<RootCategoryItem[]> {
  const res = await fetch('/api/ml?action=categories', {
    headers: authHeaders(bearer),
    cache: 'no-store',
  });
  const env = await readEnvelope<CategoriesEnvelope>(res);
  return env.categories;
}

async function requestTrendsModule(
  category: string,
  bearer: string | null,
): Promise<TrendsModulePayload> {
  const params = new URLSearchParams({ action: 'trends', category });
  const res = await fetch(`/api/ml?${params.toString()}`, {
    headers: authHeaders(bearer),
    cache: 'no-store',
  });
  const env = await readEnvelope<TrendsEnvelope>(res);
  return env.trendsData;
}

async function requestSellerDossier(
  q: string,
  bearer: string | null,
): Promise<SellerDossierPayload> {
  const params = new URLSearchParams({ action: 'seller', q });
  const res = await fetch(`/api/ml?${params.toString()}`, {
    headers: authHeaders(bearer),
    cache: 'no-store',
  });
  const env = await readEnvelope<SellerEnvelope>(res);
  return env.sellerDossier;
}

async function requestMediaExtractor(
  q: string,
  bearer: string | null,
): Promise<MediaExtractorPayload> {
  const params = new URLSearchParams({ action: 'media', q });
  const res = await fetch(`/api/ml?${params.toString()}`, {
    headers: authHeaders(bearer),
    cache: 'no-store',
  });
  const env = await readEnvelope<MediaEnvelope>(res);
  return env.media;
}

type ReviewsFetchEnvelope = {
  ok: true;
  comments: ReviewComment[];
  customerPhotos: string[];
  ratingAverage: number | null;
  totalReviews: number | null;
  distribution: ReviewStarBreakdown[];
  hasMore: boolean;
  objectId: string | null;
  isItem: boolean;
};

async function requestReviewsPage(opts: {
  itemId?: string | null;
  upId?: string | null;
  catalogId?: string | null;
  objectId?: string | null;
  isItem?: boolean;
  rating?: string | null;
  offset?: number;
  limit?: number;
  bearer?: string | null;
}): Promise<ReviewsFetchEnvelope> {
  const params = new URLSearchParams({ action: 'reviews' });
  if (opts.itemId) params.set('itemId', opts.itemId);
  if (opts.upId) params.set('upId', opts.upId);
  if (opts.catalogId) params.set('catalogId', opts.catalogId);
  if (opts.objectId) params.set('objectId', opts.objectId);
  if (opts.isItem !== undefined) params.set('isItem', String(opts.isItem));
  if (opts.rating) params.set('rating', opts.rating);
  params.set('offset', String(opts.offset ?? 0));
  params.set('limit', String(opts.limit ?? 15));
  const res = await fetch(`/api/ml?${params.toString()}`, {
    headers: authHeaders(opts.bearer ?? null),
    cache: 'no-store',
  });
  return readEnvelope<ReviewsFetchEnvelope>(res);
}

async function requestRanking(
  category: string,
  bearer: string | null,
): Promise<RankingPayload> {
  const params = new URLSearchParams({ action: 'ranking', category });
  const res = await fetch(`/api/ml?${params.toString()}`, {
    headers: authHeaders(bearer),
    cache: 'no-store',
  });
  const env = await readEnvelope<RankingEnvelope>(res);
  return env.ranking;
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
      ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200'
      : kind === 'erro'
        ? 'border-red-500/35 bg-red-500/12 text-red-200'
        : 'border-amber-400/35 bg-amber-400/12 text-amber-100';
  const Icon = kind === 'ok' ? Check : kind === 'erro' ? AlertCircle : Info;
  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm backdrop-blur ${tone}`}>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`glass-panel max-h-[90vh] w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} overflow-y-auto rounded-2xl p-6`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
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
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${PILL_TONES[tone]}`}
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
        <AlertTriangle size={11} /> {days}d no ar
      </Pill>
    );
  }
  if (alert === 'warning') {
    return (
      <Pill tone="amber">
        <AlertTriangle size={11} /> {days}d no ar
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
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <p className={`mt-1.5 break-words text-lg font-bold ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-slate-200">{value}</p>
      {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
    </div>
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
      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20'
          : 'text-slate-300 hover:bg-white/5 hover:text-white'
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
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            o.value === value
              ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30'
              : 'border border-white/10 bg-slate-950/70 text-slate-300 hover:bg-white/10'
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
      <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-slate-400">
        Imagem indisponível
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

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  const full = Math.round(Math.min(5, Math.max(0, rating)));
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= full ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}
        />
      ))}
    </span>
  );
}

function Gallery({
  images,
  videos = [],
  title,
}: {
  images: string[];
  videos?: ProductVideo[];
  title: string;
}) {
  type MediaSlide =
    | { kind: 'image'; src: string }
    | { kind: 'video'; video: ProductVideo };

  const slides: MediaSlide[] = useMemo(
    () => [
      ...images.map((src): MediaSlide => ({ kind: 'image', src })),
      ...videos.map((video): MediaSlide => ({ kind: 'video', video })),
    ],
    [images, videos],
  );

  const [index, setIndex] = useState(0);
  const total = slides.length;

  if (total === 0) {
    return (
      <div className="glass-panel flex aspect-square items-center justify-center rounded-2xl text-sm text-slate-400">
        Imagem oficial indisponível
      </div>
    );
  }

  const current = Math.min(index, total - 1);
  const activeSlide = slides[current];
  const step = (delta: number) => setIndex((i) => (i + delta + total) % total);

  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium text-slate-300">
          Galeria Oficial do Produto ({images.length} {images.length === 1 ? 'foto' : 'fotos'}
          {videos.length > 0 ? ` · ${videos.length} ${videos.length === 1 ? 'vídeo' : 'vídeos'}` : ''})
        </span>
        {activeSlide.kind === 'video' && <Pill tone="yellow">▶ Vídeo Oficial</Pill>}
      </div>

      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-white shadow-inner">
        {activeSlide.kind === 'image' ? (
          <SafeImage src={activeSlide.src} alt={title} className="max-h-full max-w-full object-contain p-6" />
        ) : activeSlide.video.mimeType === 'embed' && /youtube\.com\/embed/i.test(activeSlide.video.url) ? (
          <iframe
            src={activeSlide.video.url}
            title={activeSlide.video.title ?? title}
            className="h-full w-full bg-black"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-black">
            <video
              key={activeSlide.video.url}
              src={activeSlide.video.url}
              poster={activeSlide.video.thumbnail ?? images[0] ?? undefined}
              controls
              playsInline
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Mídia anterior"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/75 p-2.5 text-white shadow-lg transition hover:bg-slate-900"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Próxima mídia"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/75 p-2.5 text-white shadow-lg transition hover:bg-slate-900"
            >
              <ChevronRight size={18} />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/80 px-2.5 py-1 text-xs font-semibold text-white">
              {current + 1}/{total}
            </span>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
          {slides.map((slide, i) => {
            const key = slide.kind === 'image' ? `img-${slide.src}-${i}` : `vid-${slide.video.url}-${i}`;
            const thumbSrc = slide.kind === 'image' ? slide.src : (slide.video.thumbnail ?? images[0] ?? '');
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={slide.kind === 'image' ? `Foto ${i + 1}` : `Vídeo ${i + 1}`}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white p-1 transition ${
                  i === current
                    ? 'border-amber-400 shadow-md shadow-amber-400/25'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                {thumbSrc ? (
                  <img
                    src={thumbSrc}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-slate-900 text-[10px] font-bold text-amber-400">
                    VÍDEO
                  </span>
                )}
                {slide.kind === 'video' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-bold text-amber-400">
                    ▶ VÍDEO
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="glass-panel flex items-center justify-center gap-3 rounded-2xl p-7 text-sm font-medium text-slate-200">
      <Loader2 size={22} className="animate-spin text-sky-400" />
      {label}
    </div>
  );
}

function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl border-dashed p-8 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

/* =============================================================================
 * RANKING: MAIS VENDIDOS & BUSCAS EM ALTA NO MOMENTO (TELA INICIAL)
 * ============================================================================= */

function BestSellersRankingSection({
  ranking,
  loadingRanking,
  selectedCat,
  onSelectCategory,
  onAnalyzeItem,
  onAnalyzeTerm,
}: {
  ranking: RankingPayload | null;
  loadingRanking: boolean;
  selectedCat: string;
  onSelectCategory: (catId: string) => void;
  onAnalyzeItem: (item: RankingProductItem) => void;
  onAnalyzeTerm: (keyword: string) => void;
}) {
  const categories: RankingCategoryTab[] = ranking?.categories ?? [
    { id: 'all', name: 'Mais Vendidos no Geral', shortName: 'Todos', icon: '🔥' },
    { id: 'MLB1051', name: 'Celulares e Smartwatches', shortName: 'Celulares', icon: '📱' },
    { id: 'MLB1000', name: 'Eletrônicos, Áudio e Vídeo', shortName: 'Eletrônicos', icon: '🎧' },
    { id: 'MLB1574', name: 'Casa, Móveis e Decoração', shortName: 'Casa e Móveis', icon: '🏠' },
    { id: 'MLB1276', name: 'Esportes e Fitness', shortName: 'Esportes', icon: '🏋️' },
    { id: 'MLB1246', name: 'Beleza e Cuidado Pessoal', shortName: 'Beleza', icon: '💄' },
    { id: 'MLB1430', name: 'Calçados, Roupas e Bolsas', shortName: 'Moda', icon: '👟' },
    { id: 'MLB263532', name: 'Ferramentas', shortName: 'Ferramentas', icon: '🛠️' },
    { id: 'MLB1648', name: 'Informática', shortName: 'Informática', icon: '💻' },
  ];

  const rankBadgeStyle = (pos: number) => {
    if (pos === 1) {
      return 'border-amber-300/60 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/30';
    }
    if (pos === 2) {
      return 'border-slate-200/50 bg-gradient-to-r from-slate-200 to-slate-400 text-slate-950 shadow-md';
    }
    if (pos === 3) {
      return 'border-amber-600/50 bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-md';
    }
    return 'border-sky-400/30 bg-slate-900/90 text-sky-300';
  };

  return (
    <section className="space-y-6">
      <div className="glass-panel rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-orange-500/20 text-amber-300 ring-1 ring-amber-400/30">
              <Flame size={22} />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                🔥 Ranking: Mais Vendidos &amp; Buscas em Alta no Momento
              </h2>
              <p className="text-xs text-slate-400">
                Produtos líderes de vendas e termos em ascensão agora no Mercado Livre — clique em qualquer item para abrir o Raio-X completo
              </p>
            </div>
          </div>

          {loadingRanking && (
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
              <Loader2 size={13} className="animate-spin" /> Atualizando ranking...
            </span>
          )}
        </div>

        {/* Filtro de Categorias Principais */}
        <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => {
            const active = selectedCat === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-amber-400/40 hover:text-white'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.shortName}</span>
              </button>
            );
          })}
        </div>

        {/* Buscas em Alta Numeradas (#1, #2, #3...) */}
        {ranking && ranking.trends.length > 0 && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <TrendingUp size={14} /> Termos Mais Buscados Agora ({ranking.selectedCategory.shortName})
              </p>
              <span className="text-[11px] text-slate-400">Clique para pesquisar o nicho</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ranking.trends.slice(0, 14).map((t) => (
                <button
                  key={`${t.position}-${t.keyword}`}
                  type="button"
                  onClick={() => onAnalyzeTerm(t.keyword)}
                  className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/15 hover:text-white"
                >
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                      t.position <= 3
                        ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40'
                        : 'bg-white/10 text-sky-300'
                    }`}
                  >
                    #{t.position}
                  </span>
                  <span className="font-medium">{t.keyword}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Grid de Produtos Mais Vendidos (#1 a #12) */}
        {loadingRanking && !ranking ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60 p-4"
              />
            ))}
          </div>
        ) : ranking && ranking.items.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ranking.items.map((item) => (
              <article
                key={`${item.position}-${item.id}`}
                onClick={() => onAnalyzeItem(item)}
                className="glass-card group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl"
              >
                {/* Badge de posição no Ranking (#1, #2, #3...) */}
                <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-black ${rankBadgeStyle(
                      item.position,
                    )}`}
                  >
                    {item.position === 1
                      ? '🥇 #1 MAIS VENDIDO'
                      : item.position === 2
                        ? '🥈 #2 MAIS VENDIDO'
                        : item.position === 3
                          ? '🥉 #3 MAIS VENDIDO'
                          : `#${item.position} EM ALTA`}
                  </span>
                </div>

                <div className="absolute right-3 top-3 z-10">
                  <Pill tone="slate">{item.categoryName}</Pill>
                </div>

                <div className="flex h-48 items-center justify-center bg-white p-5 transition group-hover:scale-[1.02]">
                  <SafeImage
                    src={item.image}
                    alt={item.title}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>

                <div className="flex flex-1 flex-col gap-2.5 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone="green">{item.soldLabel}</Pill>
                    {item.fulfillment && <Pill tone="yellow">⚡ FULL</Pill>}
                    {item.freeShipping && <Pill tone="blue">Frete grátis</Pill>}
                  </div>

                  <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-slate-100 group-hover:text-amber-300">
                    {item.title}
                  </h3>

                  {/* Nome Real do Vendedor em Destaque */}
                  <div className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-slate-950/60 px-2.5 py-1.5 text-[11px] text-slate-300">
                    <Store size={12} className="shrink-0 text-emerald-400" />
                    <span className="truncate">
                      Vendido por{' '}
                      <strong className="font-semibold text-white">
                        {item.sellerNickname ?? 'Loja Oficial ML'}
                      </strong>
                    </span>
                    {item.sellerCompletedSales !== null && item.sellerCompletedSales > 0 && (
                      <span className="ml-auto shrink-0 text-[10px] text-emerald-400">
                        +{formatInt(item.sellerCompletedSales)}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-amber-300">
                        {formatBRL(item.price)}
                      </span>
                      {item.originalPrice !== null &&
                        item.price !== null &&
                        item.originalPrice > item.price && (
                          <span className="text-xs text-slate-500 line-through">
                            {formatBRL(item.originalPrice)}
                          </span>
                        )}
                      {item.discountPct !== null && item.discountPct > 0 && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                          -{item.discountPct}%
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                        <Award size={13} className="text-amber-400" />
                        <span>{item.sellerMedal ?? 'Vendedor Verificado'}</span>
                      </span>

                      <span className="inline-flex items-center gap-1 font-semibold text-sky-400 group-hover:translate-x-0.5 transition">
                        Analisar <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* =============================================================================
 * CATEGORIA & PALAVRAS-CHAVE (usados na busca)
 * ============================================================================= */

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
    <div className="glass-panel space-y-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="yellow">Categoria {category.id}</Pill>
            {category.totalItems !== null && (
              <Pill tone="blue">{formatInt(category.totalItems)} anúncios ativos</Pill>
            )}
          </div>
          <h3 className="mt-2 text-lg font-bold text-white">{category.name}</h3>
          {category.path && (
            <p className="mt-1 text-xs text-slate-400">
              Árvore: <span className="text-slate-200">{category.path}</span>
            </p>
          )}
        </div>
        <button type="button" onClick={() => onUseCategoryFees(category)} className={BTN_SM_YELLOW}>
          <Calculator size={14} /> Simular Taxas da Categoria
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs">
          <p className="font-medium text-slate-400">Anúncio Clássico</p>
          <p className="mt-1 text-base font-bold text-white">
            {r128?.gold_special !== undefined
              ? `${formatDecimal(r128.gold_special, 1)}%`
              : classicSample
                ? `${formatDecimal(classicSample.percentage, 1)}%`
                : HIDDEN}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs">
          <p className="font-medium text-slate-400">Anúncio Premium</p>
          <p className="mt-1 text-base font-bold text-amber-300">
            {r128?.gold_pro !== undefined
              ? `${formatDecimal(r128.gold_pro, 1)}%`
              : premiumSample
                ? `${formatDecimal(premiumSample.percentage, 1)}%`
                : HIDDEN}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs">
          <p className="font-medium text-slate-400">Abaixo de R$ 79</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">
            Clássico: {r64?.gold_special !== undefined ? `${formatDecimal(r64.gold_special, 1)}%` : HIDDEN} · Premium:{' '}
            {r64?.gold_pro !== undefined ? `${formatDecimal(r64.gold_pro, 1)}%` : HIDDEN}
          </p>
        </div>
      </div>

      {category.trends.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
            <Sparkles size={13} /> Tendências da Categoria ({category.id})
          </p>
          <div className="flex flex-wrap gap-2">
            {category.trends.slice(0, 16).map((t, idx) => (
              <button
                key={t.keyword}
                type="button"
                onClick={() => onPickTrend(t.keyword)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-200 transition hover:bg-sky-500/20"
              >
                <span className="font-bold text-amber-300">#{idx + 1}</span> {t.keyword}
              </button>
            ))}
          </div>
        </div>
      )}

      {category.childrenCategories.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Subcategorias de {category.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {category.childrenCategories.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectCategory(ch.id)}
                className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 transition hover:border-amber-400/40 hover:text-amber-300"
              >
                {ch.name} <span className="text-slate-500">({ch.id})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KeywordsPanel({
  keywords,
  onPickTerm,
  title = 'Palavras-Chave Mais Usadas nos Títulos',
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
    <div className="glass-panel rounded-2xl p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-white">
          <Hash size={16} className="text-amber-400" /> {title}
        </p>
        <span className="text-xs text-slate-400">Clique para pesquisar ou copiar tags de SEO</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {keywords.words.slice(0, 12).map((w) => {
          const pct = Math.round(w.share * 100);
          return (
            <div
              key={w.term}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <button
                type="button"
                onClick={() => (onPickTerm ? onPickTerm(w.term) : copyTerm(w.term))}
                className="font-medium hover:text-amber-300"
              >
                {w.term}
              </button>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{pct}%</span>
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
  );
}

/* =============================================================================
 * LISTAGEM DE PRODUTOS (BUSCA POR PALAVRA-CHAVE)
 * ============================================================================= */

function ProductCard({
  p,
  rank,
  onOpen,
  onSimulate,
  onOpenCategory,
}: {
  p: ProductSummary;
  rank: number;
  onOpen: (p: ProductSummary) => void;
  onSimulate: (p: ProductSummary) => void;
  onOpenCategory?: (categoryId: string) => void;
}) {
  const code = p.itemId ?? p.productId ?? p.permalink;
  return (
    <article className="glass-card relative flex flex-col overflow-hidden rounded-2xl">
      <div className="absolute left-3 top-3 z-10">
        <span className="rounded-lg bg-slate-950/85 px-2 py-0.5 text-[11px] font-bold text-amber-300 ring-1 ring-white/10">
          #{rank}
        </span>
      </div>
      <div className="flex h-52 items-center justify-center bg-white p-4">
        <SafeImage src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {p.listingType && <Pill tone="blue">{p.listingType}</Pill>}
          {p.fulfillment && <Pill tone="green">⚡ Full</Pill>}
          {p.freeShipping && <Pill tone="yellow">Frete grátis</Pill>}
          {p.categoryId && onOpenCategory && (
            <button
              type="button"
              onClick={() => onOpenCategory(p.categoryId as string)}
              className="rounded-full border border-white/10 bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-300 transition hover:border-amber-400/40 hover:text-amber-300"
            >
              {p.categoryId}
            </button>
          )}
          <AgeAlertBadge alert={p.ageAlert} days={p.daysOnAir} />
        </div>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-slate-100">
          {p.title}
        </h3>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-950/60 px-2.5 py-1.5 text-[11px] text-slate-300">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <Store size={12} className="shrink-0 text-emerald-400" />
            <span className="truncate">
              Vendido por <strong className="text-white">{p.seller?.nickname ?? 'Loja Oficial ML'}</strong>
            </span>
          </span>
          {p.ratingAverage !== null && (
            <span className="inline-flex shrink-0 items-center gap-1 text-amber-300">
              <Star size={11} className="fill-amber-400 text-amber-400" />
              <span className="font-semibold">{formatRating(p.ratingAverage)}</span>
              {p.ratingCount !== null && p.ratingCount > 0 && (
                <span className="text-slate-400">({formatInt(p.ratingCount)})</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-extrabold text-amber-300">{formatBRL(p.price)}</p>
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
            label="Receita 30d"
            value={p.revenue ? formatBRL(p.revenue.monthly) : HIDDEN}
            sub={p.seller?.nickname ?? HIDDEN}
          />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <button type="button" onClick={() => onOpen(p)} disabled={!code} className={BTN_SM_BLUE}>
            <Search size={14} /> Abrir Produto
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
    <div className="glass-panel overflow-x-auto rounded-2xl">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-950/80 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Produto</th>
            <th className="px-4 py-3 font-medium">Preço</th>
            <th className="px-4 py-3 font-medium">Criação / Idade</th>
            <th className="px-4 py-3 font-medium">Vendas / Giro</th>
            <th className="px-4 py-3 font-medium">Faturamento 30d</th>
            <th className="px-4 py-3 font-medium">Vendedor</th>
            <th className="px-4 py-3 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => {
            const code = p.itemId ?? p.productId ?? p.permalink;
            return (
              <tr
                key={`${code ?? 'item'}-${i}`}
                className="border-t border-white/5 align-middle transition hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3 font-bold text-amber-300">#{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex min-w-[240px] items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                      <SafeImage src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-semibold text-slate-100">{p.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{code ?? HIDDEN}</span>
                        {p.fulfillment && <Pill tone="green">Full</Pill>}
                        {p.listingType && <Pill tone="blue">{p.listingType}</Pill>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-bold text-amber-300">{formatBRL(p.price)}</td>
                <td className="px-4 py-3">
                  <p className="text-slate-200">{formatDate(p.createdAt)}</p>
                  <div className="mt-1">
                    <AgeAlertBadge alert={p.ageAlert} days={p.daysOnAir} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-200">{formatInt(p.soldQuantity)}</p>
                  <p className="text-xs text-slate-400">
                    {p.velocity ? `${formatDecimal(p.velocity.daily, 1)}/dia` : p.soldSource}
                  </p>
                </td>
                <td className="px-4 py-3 font-bold text-emerald-400">
                  {p.revenue ? formatBRL(p.revenue.monthly) : HIDDEN}
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-200">{p.seller?.nickname ?? HIDDEN}</p>
                  <p className="text-xs text-slate-400">{p.seller?.medal ?? HIDDEN}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => onOpen(p)} disabled={!code} className={BTN_SM_BLUE}>
                      <Search size={14} /> Ver Produto
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
  onBackHome,
}: {
  result: KeywordAnalysis;
  filters: FilterState;
  onFilters: (patch: Partial<FilterState>) => void;
  onOpen: (p: ProductSummary) => void;
  onSimulate: (p: ProductSummary) => void;
  onPickTerm: (term: string) => void;
  onOpenCategory: (categoryId: string) => void;
  onUseCategoryFees: (category: CategoryOverview) => void;
  onBackHome: () => void;
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
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBackHome} className={BTN_GHOST}>
            <ChevronLeft size={15} /> Início / Ranking
          </button>
          <div>
            <h2 className="text-lg font-bold text-white">&ldquo;{result.query}&rdquo;</h2>
            <p className="text-xs text-slate-400">
              {visible.length} de {result.products.length} anúncios encontrados
            </p>
          </div>
        </div>
        <div className="glass-panel flex rounded-xl p-1">
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
            label="Ticket Médio"
            value={formatBRL(summaryMetrics.avgPrice)}
            valueClass="text-amber-300"
          />
          <Stat
            icon={<TrendingUp size={14} />}
            label="Volume de Vendas"
            value={formatInt(summaryMetrics.totalSold)}
          />
          <Stat
            icon={<BarChart3 size={14} />}
            label="Faturamento 30d (Nicho)"
            value={summaryMetrics.totalRev30 > 0 ? formatBRL(summaryMetrics.totalRev30) : HIDDEN}
            valueClass="text-emerald-400"
          />
          <Stat
            icon={<Truck size={14} />}
            label="Envio Full"
            value={`${summaryMetrics.fullCount} de ${visible.length} anúncios`}
          />
        </div>
      )}

      <KeywordsPanel keywords={keywords} onPickTerm={onPickTerm} />

      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-3.5">
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
          Ordenar por
          <select
            value={filters.sort}
            onChange={(e) => onFilters({ sort: e.target.value as SortKey })}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-100 outline-none"
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
        <EmptyBox>Nenhum anúncio encontrado para esta busca.</EmptyBox>
      ) : visible.length === 0 ? (
        <EmptyBox>Nenhum anúncio atende aos filtros selecionados.</EmptyBox>
      ) : filters.view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p, i) => (
            <ProductCard
              key={`${p.itemId ?? p.productId ?? 'card'}-${i}`}
              p={p}
              rank={i + 1}
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
 * PÁGINA DO PRODUTO ESTILO "MERCADO LIVRE TURBINADO" + AVALIAÇÕES REAIS
 * ============================================================================= */

type ReviewFilterKey = 'all' | '5' | '4' | '3' | '2' | '1' | 'photos';

function ProductReviewsSection({
  reviews,
  ratingAverage,
  ratingCount,
  itemId,
  upId,
  catalogId,
  getBearer,
}: {
  reviews?: ProductReviewsData;
  ratingAverage: number | null;
  ratingCount: number | null;
  itemId: string | null;
  upId: string | null;
  catalogId: string | null;
  getBearer: () => Promise<string | null>;
}) {
  const [filter, setFilter] = useState<ReviewFilterKey>('all');
  const [comments, setComments] = useState<ReviewComment[]>(() => reviews?.comments ?? []);
  const [customerPhotos, setCustomerPhotos] = useState<string[]>(() => reviews?.customerPhotos ?? []);
  const [liveAvg, setLiveAvg] = useState<number | null>(
    () => reviews?.ratingAverage ?? ratingAverage ?? null,
  );
  const [liveTotal, setLiveTotal] = useState<number | null>(
    () => reviews?.totalReviews ?? ratingCount ?? null,
  );
  const [liveDist, setLiveDist] = useState<ReviewStarBreakdown[]>(
    () => reviews?.distribution ?? [],
  );
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState<boolean>(() => Boolean(reviews?.hasMore));
  const [activeObjectId, setActiveObjectId] = useState<string | null>(
    () => reviews?.objectId ?? null,
  );
  const [activeIsItem, setActiveIsItem] = useState<boolean | undefined>(
    () => reviews?.isItem,
  );
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    setFilter('all');
    setComments(reviews?.comments ?? []);
    setCustomerPhotos(reviews?.customerPhotos ?? []);
    setLiveAvg(reviews?.ratingAverage ?? ratingAverage ?? null);
    setLiveTotal(reviews?.totalReviews ?? ratingCount ?? null);
    setLiveDist(reviews?.distribution ?? []);
    setOffset(0);
    setHasMore(Boolean(reviews?.hasMore));
    setActiveObjectId(reviews?.objectId ?? null);
    setActiveIsItem(reviews?.isItem);
    setLightboxUrl(null);
  }, [itemId, upId, catalogId, reviews, ratingAverage, ratingCount]);

  const allCustomerPhotos = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const url of customerPhotos) {
      if (url && !seen.has(url)) {
        seen.add(url);
        list.push(url);
      }
    }
    for (const c of comments) {
      for (const p of c.photos ?? []) {
        if (p && !seen.has(p)) {
          seen.add(p);
          list.push(p);
        }
      }
    }
    return list;
  }, [customerPhotos, comments]);

  const attributes = reviews?.attributes ?? [];
  const distribution: ReviewStarBreakdown[] = useMemo(() => {
    if (liveDist.length > 0) return liveDist;
    if (liveTotal && liveTotal > 0 && liveAvg !== null) {
      const fivePct = Math.min(95, Math.max(20, Math.round((liveAvg / 5) * 92)));
      const rest = Math.max(0, 100 - fivePct);
      const fourPct = Math.round(rest * 0.6);
      const threePct = Math.round(rest * 0.2);
      const twoPct = Math.round(rest * 0.1);
      const onePct = Math.max(0, 100 - fivePct - fourPct - threePct - twoPct);
      return [
        { stars: 5, count: Math.round((liveTotal * fivePct) / 100), percentage: fivePct },
        { stars: 4, count: Math.round((liveTotal * fourPct) / 100), percentage: fourPct },
        { stars: 3, count: Math.round((liveTotal * threePct) / 100), percentage: threePct },
        { stars: 2, count: Math.round((liveTotal * twoPct) / 100), percentage: twoPct },
        { stars: 1, count: Math.round((liveTotal * onePct) / 100), percentage: onePct },
      ];
    }
    return ([5, 4, 3, 2, 1] as const).map((s) => ({ stars: s, count: 0, percentage: 0 }));
  }, [liveDist, liveTotal, liveAvg]);

  const handleSelectFilter = async (next: ReviewFilterKey) => {
    const resolved: ReviewFilterKey = next === filter && next !== 'all' ? 'all' : next;
    setFilter(resolved);
    if (resolved === 'all' && reviews?.comments && reviews.comments.length > 0) {
      setComments(reviews.comments);
      setOffset(0);
      setHasMore(Boolean(reviews.hasMore));
      return;
    }
    setLoadingFilter(true);
    try {
      const bearer = await getBearer();
      const res = await requestReviewsPage({
        itemId,
        upId,
        catalogId,
        objectId: activeObjectId ?? reviews?.objectId ?? null,
        isItem: activeIsItem ?? reviews?.isItem,
        rating: resolved === 'all' ? null : resolved,
        offset: 0,
        limit: 15,
        bearer,
      });
      setComments(res.comments);
      setOffset(0);
      setHasMore(res.hasMore);
      if (res.objectId) setActiveObjectId(res.objectId);
      setActiveIsItem(res.isItem);
      if (res.customerPhotos.length > 0) {
        setCustomerPhotos((prev) => Array.from(new Set([...prev, ...res.customerPhotos])));
      }
      if (res.ratingAverage !== null && res.ratingAverage > 0) setLiveAvg(res.ratingAverage);
      if (res.totalReviews !== null && res.totalReviews > 0) setLiveTotal(res.totalReviews);
      if (res.distribution.some((d) => d.count > 0 || d.percentage > 0)) {
        setLiveDist(res.distribution);
      }
    } catch {
      // Se falhar a rede, filtra localmente os comentários já carregados
      const base = reviews?.comments ?? [];
      if (resolved === 'photos') {
        setComments(base.filter((c) => (c.photos?.length ?? 0) > 0));
      } else if (resolved !== 'all') {
        setComments(base.filter((c) => Math.round(c.rating) === Number(resolved)));
      }
      setHasMore(false);
    } finally {
      setLoadingFilter(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    const nextOffset = offset + 15;
    setLoadingMore(true);
    try {
      const bearer = await getBearer();
      const res = await requestReviewsPage({
        itemId,
        upId,
        catalogId,
        objectId: activeObjectId ?? reviews?.objectId ?? null,
        isItem: activeIsItem ?? reviews?.isItem,
        rating: filter === 'all' ? null : filter,
        offset: nextOffset,
        limit: 15,
        bearer,
      });
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const extra = res.comments.filter((c) => !seen.has(c.id));
        return [...prev, ...extra];
      });
      setOffset(nextOffset);
      setHasMore(res.hasMore && res.comments.length > 0);
      if (res.objectId) setActiveObjectId(res.objectId);
      if (res.customerPhotos.length > 0) {
        setCustomerPhotos((prev) => Array.from(new Set([...prev, ...res.customerPhotos])));
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const filterButtons: { key: ReviewFilterKey; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: '5', label: '5 ★' },
    { key: '4', label: '4 ★' },
    { key: '3', label: '3 ★' },
    { key: '2', label: '2 ★' },
    { key: '1', label: '1 ★' },
    { key: 'photos', label: '📷 Com Fotos' },
  ];

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <MessageSquare size={18} className="text-amber-400" />
          <h3 className="text-base font-bold text-white">Opiniões Reais sobre o Produto</h3>
        </div>
        <Pill tone="yellow">
          {liveTotal !== null ? `${formatInt(liveTotal)} avaliações reais` : 'Opiniões verificadas'}
        </Pill>
      </div>

      {liveAvg === null && (liveTotal === null || liveTotal === 0) && comments.length === 0 ? (
        <p className="text-xs text-slate-400">
          Este anúncio ainda não possui opiniões públicas registradas pelos compradores.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-12">
            {/* Coluna Nota Média + Barra 5 a 1 estrelas clicável + Atributos */}
            <div className="space-y-5 md:col-span-5">
              <div className="flex items-center gap-4">
                <span className="text-5xl font-black tracking-tight text-amber-300">
                  {liveAvg !== null ? formatDecimal(liveAvg, 1) : '—'}
                </span>
                <div>
                  <StarRow rating={liveAvg ?? 0} size={18} />
                  <p className="mt-1 text-xs text-slate-400">
                    {liveTotal !== null
                      ? `Média entre ${formatInt(liveTotal)} avaliações`
                      : 'Avaliações verificadas'}
                  </p>
                </div>
              </div>

              {/* Barra de distribuição 5 a 1 estrelas (clicável para filtrar) */}
              <div className="space-y-1.5">
                {distribution.map((row) => {
                  const key = String(row.stars) as ReviewFilterKey;
                  const active = filter === key;
                  return (
                    <button
                      key={row.stars}
                      type="button"
                      onClick={() => void handleSelectFilter(key)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-xs transition ${
                        active
                          ? 'bg-amber-400/15 ring-1 ring-amber-400/40'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <span className="w-16 shrink-0 font-medium text-slate-300">
                        {row.stars} ★
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500"
                          style={{ width: `${Math.min(100, Math.max(row.percentage > 0 ? 3 : 0, row.percentage))}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right font-medium text-slate-300">
                        {row.count > 0 ? formatInt(row.count) : `${row.percentage}%`}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Avaliação de características */}
              {attributes.length > 0 && (
                <div className="space-y-2.5 border-t border-white/10 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Avaliação de características
                  </p>
                  {attributes.map((attr) => (
                    <div key={attr.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-200">{attr.name}</span>
                      <div className="flex items-center gap-1.5">
                        <StarRow rating={attr.rating} size={13} />
                        <span className="font-semibold text-amber-300">
                          {formatDecimal(attr.rating, 1)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Coluna Fotos dos Clientes + Filtros + Comentários Reais */}
            <div className="space-y-4 md:col-span-7">
              {/* Galeria de Fotos Reais dos Clientes */}
              {allCustomerPhotos.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3.5">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-300">
                      <Camera size={14} /> Fotos Reais dos Clientes ({allCustomerPhotos.length})
                    </p>
                    <span className="text-[11px] text-slate-400">Clique para ampliar</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {allCustomerPhotos.slice(0, 18).map((photoUrl, idx) => (
                      <button
                        key={`${photoUrl}-${idx}`}
                        type="button"
                        onClick={() => setLightboxUrl(photoUrl)}
                        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-slate-900 transition hover:border-amber-400 hover:scale-105"
                        title="Ampliar foto do cliente"
                      >
                        <SafeImage
                          src={photoUrl}
                          alt={`Foto real de cliente ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Barra Interativa de Filtros por Estrelas / Com Fotos */}
              <div className="flex flex-wrap items-center gap-1.5">
                {filterButtons.map((btn) => {
                  const active = filter === btn.key;
                  return (
                    <button
                      key={btn.key}
                      type="button"
                      disabled={loadingFilter}
                      onClick={() => void handleSelectFilter(btn.key)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-amber-400 bg-amber-400/20 text-amber-200 shadow-sm shadow-amber-400/15'
                          : 'border-white/10 bg-slate-900/75 text-slate-300 hover:border-white/25 hover:bg-white/10'
                      }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>

              {/* Lista de Comentários Reais */}
              {loadingFilter ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 p-5 text-xs text-slate-300">
                  <Loader2 size={15} className="animate-spin text-amber-400" />
                  Carregando opiniões filtradas do Mercado Livre...
                </div>
              ) : comments.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-slate-950/40 p-4 text-xs text-slate-400">
                  Nenhuma opinião encontrada para este filtro específico.
                </p>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <article
                      key={c.id}
                      className="rounded-xl border border-white/10 bg-slate-950/60 p-4 transition hover:border-white/20"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StarRow rating={c.rating} size={13} />
                          {c.title && (
                            <span className="text-xs font-semibold text-slate-100">{c.title}</span>
                          )}
                          {c.variant && <Pill tone="slate">{c.variant}</Pill>}
                        </div>
                        <span className="text-[11px] text-slate-500">{c.date}</span>
                      </div>

                      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-300">
                        {c.content}
                      </p>

                      {/* Fotos anexadas ao comentário */}
                      {c.photos && c.photos.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {c.photos.map((photo, pIdx) => (
                            <button
                              key={`${c.id}-photo-${pIdx}`}
                              type="button"
                              onClick={() => setLightboxUrl(photo)}
                              className="h-14 w-14 overflow-hidden rounded-lg border border-white/15 bg-slate-900 transition hover:border-amber-400"
                              title="Ampliar foto da avaliação"
                            >
                              <SafeImage
                                src={photo}
                                alt="Foto anexada na avaliação"
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check size={11} /> Compra verificada
                        </span>
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <ThumbsUp size={11} /> É útil ({c.likes ?? 0})
                        </span>
                      </div>
                    </article>
                  ))}

                  {hasMore && (
                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        disabled={loadingMore}
                        onClick={() => void handleLoadMore()}
                        className={`${BTN_SM_YELLOW} w-full justify-center py-2.5`}
                      >
                        {loadingMore ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Carregando mais opiniões...
                          </>
                        ) : (
                          <>
                            <MessageSquare size={14} /> Ver mais opiniões
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {lightboxUrl && (
        <Modal title="Foto Real Enviada pelo Comprador" onClose={() => setLightboxUrl(null)} wide>
          <div className="flex flex-col items-center gap-4">
            <div className="flex max-h-[72vh] w-full items-center justify-center overflow-hidden rounded-2xl bg-black/70 p-2">
              <img
                src={lightboxUrl}
                alt="Foto ampliada da avaliação"
                className="max-h-[68vh] w-auto rounded-xl object-contain"
              />
            </div>
            <div className="flex justify-end gap-2 w-full">
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noreferrer"
                className={BTN_GHOST}
              >
                <ExternalLink size={13} /> Abrir imagem original
              </a>
              <button type="button" onClick={() => setLightboxUrl(null)} className={BTN_SM_BLUE}>
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

type CompetitorSortKey =
  | 'menor_preco'
  | 'maior_preco'
  | 'mais_vendidos'
  | 'maior_faturamento'
  | 'melhor_avaliacao';

function CompetitorShowcase({
  rows,
  currentPrice,
  onAnalyzeCompetitor,
}: {
  rows: CompetitorRow[];
  currentPrice: number | null;
  onAnalyzeCompetitor: (itemId: string) => void;
}) {
  const [sortBy, setSortBy] = useState<CompetitorSortKey>('menor_preco');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [onlyFull, setOnlyFull] = useState(false);
  const [onlyFreeShip, setOnlyFreeShip] = useState(false);
  const [onlyIdentical, setOnlyIdentical] = useState(false);
  const [sellerQuery, setSellerQuery] = useState('');

  const nicheStats = useMemo(() => {
    const validPrices = rows
      .map((r) => r.price)
      .filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0);
    const minP = validPrices.length > 0 ? Math.min(...validPrices) : currentPrice;
    const maxP = validPrices.length > 0 ? Math.max(...validPrices) : currentPrice;
    const avgP =
      validPrices.length > 0
        ? validPrices.reduce((acc, v) => acc + v, 0) / validPrices.length
        : currentPrice;
    const cheaperCount =
      currentPrice !== null ? validPrices.filter((p) => p < currentPrice - 0.009).length : 0;
    const totalPool = validPrices.length + (currentPrice !== null ? 1 : 0);
    const currentRank = currentPrice !== null ? cheaperCount + 1 : null;
    const identicalCount = rows.filter((r) => r.matchType === 'identical').length;
    return { minP, avgP, maxP, currentRank, totalPool, identicalCount };
  }, [rows, currentPrice]);

  const filtered = useMemo(() => {
    const minVal = minPrice.trim() ? parseInputNumber(minPrice) : null;
    const maxVal = maxPrice.trim() ? parseInputNumber(maxPrice) : null;
    const q = sellerQuery.trim().toLowerCase();

    const list = rows.filter((r) => {
      if (onlyFull && !r.fulfillment) return false;
      if (onlyFreeShip && !r.freeShipping) return false;
      if (onlyIdentical && r.matchType !== 'identical') return false;
      if (minVal !== null && minVal > 0 && (r.price === null || r.price < minVal)) return false;
      if (maxVal !== null && maxVal > 0 && (r.price === null || r.price > maxVal)) return false;
      if (q) {
        const hay = `${r.sellerNickname ?? ''} ${r.title ?? ''} ${r.itemId} ${r.mlbuId ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      switch (sortBy) {
        case 'menor_preco':
          return nullsLast(a.price, b.price, 1);
        case 'maior_preco':
          return nullsLast(a.price, b.price, -1);
        case 'mais_vendidos':
          return nullsLast(a.soldQuantity, b.soldQuantity, -1);
        case 'maior_faturamento':
          return nullsLast(a.monthlyRevenue, b.monthlyRevenue, -1);
        case 'melhor_avaliacao':
          return (
            nullsLast(a.ratingAverage, b.ratingAverage, -1) ||
            nullsLast(a.ratingCount, b.ratingCount, -1)
          );
      }
    });

    return list;
  }, [rows, sortBy, minPrice, maxPrice, onlyFull, onlyFreeShip, onlyIdentical, sellerQuery]);

  const hasActiveFilter =
    Boolean(minPrice.trim()) ||
    Boolean(maxPrice.trim()) ||
    onlyFull ||
    onlyFreeShip ||
    onlyIdentical ||
    Boolean(sellerQuery.trim());

  const clearFilters = () => {
    setMinPrice('');
    setMaxPrice('');
    setOnlyFull(false);
    setOnlyFreeShip(false);
    setOnlyIdentical(false);
    setSellerQuery('');
  };

  if (rows.length === 0) {
    return (
      <EmptyBox>
        Nenhuma outra oferta concorrente encontrada para este produto no momento.
      </EmptyBox>
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumo de Preços e Posicionamento do Nicho (Estilo AliPrice / 1688) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            Menor Preço
          </p>
          <p className="mt-1 text-xl font-black text-emerald-300">{formatBRL(nicheStats.minP)}</p>
          <p className="text-[11px] text-slate-400">Oferta mais barata ativa</p>
        </div>

        <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
            Preço Médio
          </p>
          <p className="mt-1 text-xl font-black text-white">{formatBRL(nicheStats.avgP)}</p>
          <p className="text-[11px] text-slate-400">Média dos concorrentes</p>
        </div>

        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            Maior Preço
          </p>
          <p className="mt-1 text-xl font-black text-amber-300">{formatBRL(nicheStats.maxP)}</p>
          <p className="text-[11px] text-slate-400">Teto praticado no nicho</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Concorrentes Mapeados
          </p>
          <p className="mt-1 text-xl font-black text-white">
            {filtered.length} <span className="text-xs font-normal text-slate-400">de {rows.length}</span>
          </p>
          <p className="text-[11px] text-emerald-400">
            🎯 {nicheStats.identicalCount} com produto idêntico
          </p>
        </div>

        <div className="rounded-2xl border border-sky-400/30 bg-slate-950/75 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
            Posição deste Anúncio
          </p>
          <p className="mt-1 text-xl font-black text-amber-300">
            {nicheStats.currentRank !== null
              ? `#${nicheStats.currentRank} de ${nicheStats.totalPool}`
              : '—'}
          </p>
          <p className="text-[11px] text-slate-400">Ranking do menor ao maior preço</p>
        </div>
      </div>

      {/* Barra de Controle: Ordenação + Filtros em Tempo Real */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Ordenar Ranking Por
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as CompetitorSortKey)}
              className="w-full rounded-xl border border-white/10 bg-[#050914] px-3 py-2 text-xs font-semibold text-white outline-none focus:border-sky-400"
            >
              <option value="menor_preco">Menor Preço (#1 mais barato)</option>
              <option value="maior_preco">Maior Preço</option>
              <option value="mais_vendidos">Mais Vendidos</option>
              <option value="maior_faturamento">Maior Faturamento 30d</option>
              <option value="melhor_avaliacao">Melhor Avaliação (★)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:col-span-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Preço Mín (R$)
              </label>
              <input
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Ex: 25,00"
                className="w-full rounded-xl border border-white/10 bg-[#050914] px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Preço Máx (R$)
              </label>
              <input
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Ex: 80,00"
                className="w-full rounded-xl border border-white/10 bg-[#050914] px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-400"
              />
            </div>
          </div>

          <div className="lg:col-span-5">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Buscar Vendedor ou Anúncio
            </label>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={sellerQuery}
                onChange={(e) => setSellerQuery(e.target.value)}
                placeholder="Digite o nome da loja/vendedor ou código MLB..."
                className="w-full rounded-xl border border-white/10 bg-[#050914] py-2 pl-8 pr-8 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-400"
              />
              {sellerQuery && (
                <button
                  type="button"
                  onClick={() => setSellerQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Botões Rápidos de Filtro */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyIdentical((v) => !v)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                onlyIdentical
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-white/10 bg-slate-900/75 text-slate-300 hover:border-white/25'
              }`}
            >
              🎯 Apenas Produto Idêntico ({nicheStats.identicalCount})
            </button>

            <button
              type="button"
              onClick={() => setOnlyFull((v) => !v)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                onlyFull
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-white/10 bg-slate-900/75 text-slate-300 hover:border-white/25'
              }`}
            >
              ⚡ Apenas Full
            </button>

            <button
              type="button"
              onClick={() => setOnlyFreeShip((v) => !v)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                onlyFreeShip
                  ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                  : 'border-white/10 bg-slate-900/75 text-slate-300 hover:border-white/25'
              }`}
            >
              🚚 Apenas Frete Grátis
            </button>
          </div>

          {hasActiveFilter && (
            <button type="button" onClick={clearFilters} className={BTN_GHOST}>
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Lista Ranqueada de Concorrentes (#1, #2, #3...) */}
      {filtered.length === 0 ? (
        <EmptyBox>
          Nenhum concorrente corresponde aos filtros selecionados. Clique em &ldquo;Limpar filtros&rdquo; para ver todas as {rows.length} ofertas.
        </EmptyBox>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r, idx) => {
            const computedDiff =
              r.priceDiffPct !== null
                ? r.priceDiffPct
                : currentPrice && currentPrice > 0 && r.price !== null
                  ? ((r.price - currentPrice) / currentPrice) * 100
                  : null;

            const diffBadge =
              computedDiff === null
                ? null
                : Math.abs(computedDiff) < 0.15
                  ? { text: 'Mesmo preço', cls: 'bg-white/10 text-slate-300' }
                  : computedDiff < 0
                    ? {
                        text: `${formatDecimal(computedDiff, 1)}% mais barato`,
                        cls: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30',
                      }
                    : {
                        text: `+${formatDecimal(computedDiff, 1)}% mais caro`,
                        cls: 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30',
                      };

            const targetCode =
              r.mlbuId && r.sellerId
                ? `https://www.mercadolivre.com.br/up/${r.mlbuId}?pdp_filters=seller_id:${r.sellerId}`
                : (r.mlbuId ?? r.itemId);

            return (
              <article
                key={`${r.itemId}-${idx}`}
                className="glass-card flex flex-col justify-between overflow-hidden rounded-2xl p-4"
              >
                <div>
                  {/* Topo do Card: Posição #N + Selo de Match */}
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-lg bg-amber-400/20 px-2 py-0.5 text-xs font-black text-amber-300 ring-1 ring-amber-400/35">
                      #{idx + 1}
                    </span>
                    {r.matchType === 'identical' ? (
                      <Pill tone="green">🎯 Produto Idêntico / Mesma Foto</Pill>
                    ) : (
                      <Pill tone="slate">Produto Similar</Pill>
                    )}
                  </div>

                  {/* Foto + Título */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5">
                      <SafeImage
                        src={r.image}
                        alt={r.title ?? r.itemId}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-semibold leading-snug text-slate-100">
                        {r.title ?? r.itemId}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {r.fulfillment && <Pill tone="green">⚡ Full</Pill>}
                        {r.freeShipping && <Pill tone="blue">🚚 Frete grátis</Pill>}
                        {r.listingType && <Pill tone="slate">{r.listingType}</Pill>}
                      </div>
                    </div>
                  </div>

                  {/* Vendedor Real em Destaque */}
                  <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-[11px]">
                    <p className="flex items-center gap-1.5 truncate text-slate-200">
                      <Store size={12} className="shrink-0 text-emerald-400" />
                      <span className="text-slate-400">Vendido por</span>
                      <strong className="truncate font-bold text-white">
                        {r.sellerNickname ?? 'Loja Oficial / ML'}
                      </strong>
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {r.sellerMedal ?? 'Ativo'}
                      {r.sellerCompletedSales !== null
                        ? ` · +${formatInt(r.sellerCompletedSales)} vendas`
                        : ''}
                      {r.sellerCityState ? ` · ${r.sellerCityState}` : ''}
                    </p>
                  </div>

                  {/* Preço + % Diferença + Volume & Faturamento */}
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                    <div>
                      <p className="text-lg font-extrabold text-amber-300">{formatBRL(r.price)}</p>
                      {diffBadge && (
                        <span
                          className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${diffBadge.cls}`}
                        >
                          {diffBadge.text}
                        </span>
                      )}
                    </div>
                    <div className="text-right text-[11px]">
                      <p className="font-bold text-emerald-400">
                        {r.soldLabel ??
                          (r.soldQuantity !== null ? `${formatInt(r.soldQuantity)} vendidos` : 'Ativo')}
                      </p>
                      <p className="text-slate-300">
                        Fat. 30d:{' '}
                        <strong className="text-amber-200">
                          {r.monthlyRevenue !== null ? formatBRL(r.monthlyRevenue) : '—'}
                        </strong>
                      </p>
                      {r.ratingAverage !== null && (
                        <p className="text-amber-300">
                          ★ {formatDecimal(r.ratingAverage, 1)}
                          {r.ratingCount !== null ? ` (${formatInt(r.ratingCount)})` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="mt-3 flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => onAnalyzeCompetitor(targetCode)}
                    className={`${BTN_SM_BLUE} flex-1`}
                  >
                    <Search size={13} /> Analisar este Anúncio
                  </button>
                  {r.permalink && (
                    <a
                      href={r.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className={BTN_GHOST}
                      title="Abrir anúncio no Mercado Livre"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ListingQualitySection({
  d,
}: {
  d: Dossier;
}) {
  const report = useMemo<ListingQualityReport>(() => {
    if (d.listingQuality) return d.listingQuality;
    return evaluateListingQuality({
      title: d.title,
      brand: d.brand,
      model: d.model,
      imagesCount: d.images.length,
      videosCount: d.videos.length,
      attributesCount: d.attributes?.length ?? d.pageSignals?.specsAttributes?.length ?? 0,
      descriptionLength: d.pageSignals?.descriptionLength ?? 0,
      fulfillment: d.fulfillment,
      freeShipping: d.freeShipping,
      listingTypeId: d.listingTypeId,
      listingTypeLabel: d.listingType,
      price: d.price,
      sellerMedal: d.seller?.medal ?? null,
      reputationLevel: d.seller?.reputationLevel ?? null,
      ratingAverage: d.ratingAverage ?? d.reviewsDetail?.ratingAverage ?? null,
      ratingCount: d.ratingCount ?? d.reviewsDetail?.totalReviews ?? null,
    });
  }, [d]);

  const tone =
    report.level === 'Great'
      ? {
          ring: '#34d399',
          pill: 'green' as PillTone,
          scoreText: 'text-emerald-300',
          border: 'border-emerald-500/30',
        }
      : report.level === 'Good'
        ? {
            ring: '#38bdf8',
            pill: 'blue' as PillTone,
            scoreText: 'text-sky-300',
            border: 'border-sky-400/30',
          }
        : report.level === 'NeedAttention'
          ? {
              ring: '#fbbf24',
              pill: 'yellow' as PillTone,
              scoreText: 'text-amber-300',
              border: 'border-amber-400/35',
            }
          : {
              ring: '#f87171',
              pill: 'red' as PillTone,
              scoreText: 'text-red-400',
              border: 'border-red-500/35',
            };

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, report.score)) / 100) * circumference;

  const criterionIcon = (id: ListingQualityCriterionId) => {
    switch (id) {
      case 'title':
        return <FileText size={15} className="text-sky-400" />;
      case 'photos':
        return <Camera size={15} className="text-amber-400" />;
      case 'video':
        return <Film size={15} className="text-purple-400" />;
      case 'specs':
        return <Boxes size={15} className="text-emerald-400" />;
      case 'logistics':
        return <Truck size={15} className="text-teal-400" />;
      case 'modality':
        return <Award size={15} className="text-yellow-400" />;
    }
  };

  const specsPreview = d.attributes ?? d.pageSignals?.specsAttributes ?? [];

  return (
    <div className={`glass-panel space-y-5 rounded-3xl border p-6 ${tone.border}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-4">
          {/* Medidor Circular 0 a 100 */}
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
            <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 108 108">
              <circle
                cx="54"
                cy="54"
                r={radius}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="9"
                fill="transparent"
              />
              <circle
                cx="54"
                cy="54"
                r={radius}
                stroke={tone.ring}
                strokeWidth="9"
                strokeLinecap="round"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className={`text-2xl font-black leading-none ${tone.scoreText}`}>
                {report.score}
              </span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                / 100
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck size={18} className="text-amber-400" />
              <h3 className="text-base font-bold text-white sm:text-lg">
                Análise de Qualidade da Listagem
              </h3>
              <Pill tone={tone.pill}>{report.levelLabel}</Pill>
            </div>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-300">{report.summary}</p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                <CheckCircle2 size={13} /> {report.passedCount} de {report.totalCriteria} critérios ideais
              </span>
              {report.potentialGain > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-amber-300">
                    +{report.potentialGain} pts disponíveis para otimização
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Checklist de 6 Pilares */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {report.criteria.map((c) => {
          const statusUI =
            c.status === 'ok'
              ? {
                  badge: '✓ Ideal',
                  badgeCls: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
                  barCls: 'bg-gradient-to-r from-emerald-500 to-teal-400',
                  cardBorder: 'border-emerald-500/20',
                }
              : c.status === 'warning'
                ? {
                    badge: '⚠ Atenção',
                    badgeCls: 'border-amber-400/35 bg-amber-400/15 text-amber-300',
                    barCls: 'bg-gradient-to-r from-amber-400 to-yellow-500',
                    cardBorder: 'border-amber-400/25',
                  }
                : {
                    badge: '✕ Pendente',
                    badgeCls: 'border-red-500/35 bg-red-500/15 text-red-300',
                    barCls: 'bg-gradient-to-r from-red-500 to-rose-500',
                    cardBorder: 'border-red-500/25',
                  };

          return (
            <div
              key={c.id}
              className={`flex flex-col justify-between rounded-2xl border bg-slate-950/60 p-4 ${statusUI.cardBorder}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-white">
                    {criterionIcon(c.id)}
                    {c.label}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusUI.badgeCls}`}
                  >
                    {statusUI.badge}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[11px]">
                  <span className="truncate font-semibold text-slate-200">{c.currentValue}</span>
                  <span className="ml-2 shrink-0 font-bold text-slate-300">
                    {c.score}/{c.maxScore} pts
                  </span>
                </div>

                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${statusUI.barCls}`}
                    style={{ width: `${Math.min(100, Math.max(4, c.percentage))}%` }}
                  />
                </div>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{c.recommendation}</p>
            </div>
          );
        })}
      </div>

      {/* Prévia da Ficha Técnica extraída quando disponível */}
      {specsPreview.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-300">
            <Boxes size={13} className="text-emerald-400" /> Atributos Mapeados na Ficha Técnica ({specsPreview.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {specsPreview.slice(0, 12).map((sp) => (
              <span
                key={`${sp.name}-${sp.value}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300"
              >
                <span className="text-slate-400">{sp.name}:</span>
                <strong className="font-semibold text-white">{sp.value}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DossierView({
  d,
  backLabel,
  onBack,
  onSimulate,
  onPickTerm,
  onOpenCategory,
  onAnalyzeCompetitor,
  onInspectSeller,
  onToggleMonitor,
  isMonitored,
  onOpenAuditor,
  onExtractMedia,
  getBearer,
}: {
  d: Dossier;
  backLabel: string;
  onBack: () => void;
  onSimulate: () => void;
  onPickTerm: (term: string) => void;
  onOpenCategory: (categoryId: string) => void;
  onAnalyzeCompetitor: (itemId: string) => void;
  onInspectSeller: (sellerQuery: string) => void;
  onToggleMonitor: () => void;
  isMonitored: boolean;
  onOpenAuditor: () => void;
  onExtractMedia: () => void;
  getBearer: () => Promise<string | null>;
}) {
  const netAfterFees = useMemo(() => {
    if (d.price === null) return null;
    const feeAmt = d.fees.current?.amount ?? d.fees.classic?.amount ?? d.price * 0.12;
    const shipAmt = d.fees.freeShippingByMeli ? 0 : (d.fees.shippingListCost ?? 0);
    return Math.max(0, d.price - feeAmt - shipAmt);
  }, [d.price, d.fees]);

  const location =
    d.seller?.city && d.seller?.state
      ? `${d.seller.city} - ${d.seller.state}`
      : (d.seller?.city ?? d.seller?.state ?? 'Brasil');

  const realRatingAvg = d.ratingAverage ?? d.reviewsDetail?.ratingAverage ?? null;
  const realRatingCount = d.ratingCount ?? d.reviewsDetail?.totalReviews ?? null;
  const sellerQueryKey = d.seller?.id
    ? String(d.seller.id)
    : d.seller?.nickname ?? d.mlbuId ?? d.itemId ?? '';

  return (
    <section className="space-y-6">
      {/* Barra superior de navegação e ações rápidas integradas aos módulos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onBack} className={BTN_GHOST}>
            <ChevronLeft size={15} /> {backLabel}
          </button>
          {d.categoryId && (
            <button
              type="button"
              onClick={() => onOpenCategory(d.categoryId as string)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/20"
            >
              <Layers size={13} /> {d.categoryPath ?? d.categoryName ?? d.categoryId}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleMonitor}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
              isMonitored
                ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-300'
                : 'border-white/15 bg-slate-900/90 text-slate-200 hover:border-amber-400/40 hover:text-amber-300'
            }`}
          >
            {isMonitored ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            {isMonitored ? 'Produto Monitorado' : 'Monitorar Produto'}
          </button>
          <button type="button" onClick={onOpenAuditor} className={BTN_GHOST}>
            <ClipboardCheck size={14} className="text-teal-400" /> Auditor 0–100
          </button>
          <button type="button" onClick={onExtractMedia} className={BTN_GHOST}>
            <Film size={14} className="text-pink-400" /> Clipes &amp; Fotos HD
          </button>
          <button type="button" onClick={onSimulate} className={BTN_SM_YELLOW}>
            <Calculator size={14} /> Simular Margem
          </button>
          {d.permalink && (
            <a href={d.permalink} target="_blank" rel="noreferrer" className={BTN_GHOST}>
              <ExternalLink size={14} /> Ver no ML
            </a>
          )}
        </div>
      </div>

      {d.ageAlert && d.ageAlert !== 'ok' && (
        <Banner kind={d.ageAlert === 'danger' ? 'erro' : 'aviso'}>
          <strong>{d.ageAlertLabel ?? AGE_ALERT_LABEL[d.ageAlert]}:</strong> anúncio no ar há{' '}
          {formatDaysOnAir(d.daysOnAir)} (criado em {formatDate(d.createdAt)}).
        </Banner>
      )}

      {/* Layout Estilo "Mercado Livre Turbinado": Esquerda (Galeria + Avaliações) | Direita (BuyBox + Inteligência) */}
      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* COLUNA ESQUERDA: Galeria Exclusiva + Vídeo + Avaliações Reais */}
        <div className="space-y-6 lg:col-span-7">
          <Gallery
            key={d.itemId ?? d.mlbuId ?? d.productId ?? d.title}
            images={d.images}
            videos={d.videos}
            title={d.title}
          />

          <ProductReviewsSection
            reviews={d.reviewsDetail}
            ratingAverage={d.ratingAverage}
            ratingCount={d.ratingCount}
            itemId={d.itemId}
            upId={d.mlbuId}
            catalogId={d.productId}
            getBearer={getBearer}
          />
        </div>

        {/* COLUNA DIREITA: BuyBox do Produto + Cards Diretos de Inteligência */}
        <div className="space-y-5 lg:col-span-5">
          {/* Card Principal do Produto (Estilo PDP Mercado Livre) */}
          <div className="glass-panel rounded-2xl p-6">
            {/* Destaque Imediato do Vendedor Real no Topo */}
            {d.seller && (
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2 text-xs">
                <button
                  type="button"
                  onClick={() => sellerQueryKey && onInspectSeller(sellerQueryKey)}
                  className="inline-flex flex-wrap items-center gap-1.5 text-left text-slate-200 hover:text-amber-300"
                >
                  <Store size={14} className="text-emerald-400" />
                  <span>Vendido por</span>
                  <strong className="font-bold text-white underline decoration-white/30 underline-offset-2">
                    {d.seller.nickname ?? 'Loja Verificada'}
                  </strong>
                  {d.seller.completedSales !== null && (
                    <span className="font-semibold text-emerald-300">
                      · +{formatInt(d.seller.completedSales)} vendas
                    </span>
                  )}
                </button>
                <span className="text-[11px] font-semibold text-amber-300">{d.seller.medal}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Novo</span>
              <span>·</span>
              <span className="font-semibold text-emerald-400">{d.soldLabel}</span>
              {d.itemId && (
                <>
                  <span>·</span>
                  <span className="font-mono text-sky-300">{d.itemId}</span>
                </>
              )}
              {d.mlbuId && d.mlbuId !== d.itemId && (
                <>
                  <span>·</span>
                  <span className="font-mono text-amber-300">{d.mlbuId}</span>
                </>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {d.listingType && <Pill tone="yellow">{d.listingType}</Pill>}
              {d.fulfillment && <Pill tone="green">⚡ FULL</Pill>}
              {d.freeShipping && <Pill tone="blue">Frete grátis</Pill>}
              {d.isSupermarket && <Pill tone="amber">Supermercado</Pill>}
              <AgeAlertBadge alert={d.ageAlert} days={d.daysOnAir} />
            </div>

            <h1 className="mt-3 text-xl font-bold leading-snug text-white">{d.title}</h1>

            {realRatingAvg !== null && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="font-bold text-amber-300">{formatRating(realRatingAvg)}</span>
                <StarRow rating={realRatingAvg} size={14} />
                {realRatingCount !== null && (
                  <span className="text-slate-400">({formatInt(realRatingCount)} avaliações)</span>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
              <p className="text-4xl font-black tracking-tight text-amber-300">{formatBRL(d.price)}</p>
              {d.originalPrice !== null && d.price !== null && d.originalPrice > d.price && (
                <p className="pb-1 text-sm text-slate-500 line-through">{formatBRL(d.originalPrice)}</p>
              )}
              {d.discountPct !== null && d.discountPct > 0 && (
                <Pill tone="green">{d.discountPct}% OFF</Pill>
              )}
            </div>

            <p className="mt-2 text-xs text-slate-400">
              Marca: <strong className="text-slate-200">{d.brand ?? HIDDEN}</strong> · Modelo:{' '}
              <strong className="text-slate-200">{d.model ?? HIDDEN}</strong>
            </p>
          </div>

          {/* Cards Diretos de Inteligência (Vendas, Giro, Faturamento 30d, Idade) */}
          <div className="glass-panel rounded-2xl p-5">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
              <Zap size={14} className="text-amber-400" /> Inteligência de Vendas &amp; Faturamento
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Stat
                icon={<TrendingUp size={13} className="text-emerald-400" />}
                label="Vendas Totais"
                value={d.soldValue !== null ? `${formatInt(d.soldValue)} un.` : d.soldLabel}
                hint={`Estoque: ${formatInt(d.availableQuantity)} disp.`}
                valueClass="text-emerald-400"
              />
              <Stat
                icon={<BarChart3 size={13} className="text-amber-400" />}
                label="Faturamento 30d"
                value={d.revenue ? formatBRL(d.revenue.monthly) : HIDDEN}
                hint={d.revenue ? `Total: ${formatBRL(d.revenue.total)}` : undefined}
                valueClass="text-amber-300"
              />
              <Stat
                icon={<Sparkles size={13} className="text-sky-400" />}
                label="Giro de Vendas"
                value={d.velocity ? `${formatDecimal(d.velocity.daily, 1)} / dia` : HIDDEN}
                hint={
                  d.velocity
                    ? `${formatInt(d.velocity.weekly)}/sem · ${formatInt(d.velocity.monthly)}/mês`
                    : undefined
                }
              />
              <Stat
                icon={<Calendar size={13} className="text-slate-300" />}
                label="Idade do Anúncio"
                value={formatDate(d.createdAt)}
                hint={`${formatDaysOnAir(d.daysOnAir)} · 1ª foto ${d.firstPhotoDate ?? '-'}`}
              />
            </div>
          </div>

          {/* Card de Taxas e Lucro Rápido */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <Calculator size={14} /> Taxas do ML &amp; Repasse Rápido
              </p>
              <button type="button" onClick={onSimulate} className={BTN_SM_YELLOW}>
                Simular Margem
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="text-slate-400">Anúncio Clássico</p>
                <p className="mt-1 text-sm font-bold text-white">
                  {d.fees.classic ? formatBRL(d.fees.classic.amount) : HIDDEN}
                </p>
                {d.fees.classic && (
                  <p className="text-[11px] text-slate-400">
                    {formatDecimal(d.fees.classic.percentage, 1)}%
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="text-slate-400">Anúncio Premium</p>
                <p className="mt-1 text-sm font-bold text-amber-300">
                  {d.fees.premium ? formatBRL(d.fees.premium.amount) : HIDDEN}
                </p>
                {d.fees.premium && (
                  <p className="text-[11px] text-slate-400">
                    {formatDecimal(d.fees.premium.percentage, 1)}%
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="text-slate-400">Custo de Frete</p>
                <p className="mt-1 text-sm font-bold text-sky-300">
                  {d.fees.freeShippingByMeli
                    ? 'R$ 0,00'
                    : d.fees.shippingListCost !== null
                      ? formatBRL(d.fees.shippingListCost)
                      : 'R$ 21,45'}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {netAfterFees !== null ? `Sobram ${formatBRL(netAfterFees)}` : 'Estimado'}
                </p>
              </div>
            </div>
          </div>

          {/* Card do Vendedor Real + Atalho Raio-X Completo da Loja */}
          {d.seller && (
            <div className="glass-panel rounded-2xl p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  <Store size={14} /> Dados do Vendedor
                </p>
                <Pill tone="yellow">
                  <Award size={12} /> {d.seller.medal}
                </Pill>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-white">{d.seller.nickname ?? 'Loja Verificada'}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {location} · {formatAccountAge(d.seller.accountYears)}
                  </p>
                </div>
                {sellerQueryKey && (
                  <button
                    type="button"
                    onClick={() => onInspectSeller(sellerQueryKey)}
                    className="rounded-xl border border-purple-400/40 bg-purple-500/15 px-3 py-1.5 text-xs font-bold text-purple-200 transition hover:bg-purple-500/25"
                  >
                    Raio-X desta Loja →
                  </button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
                <Mini
                  label="Vendas concluídas"
                  value={formatInt(d.seller.completedSales)}
                  sub={
                    d.seller.positiveRatingPct !== null
                      ? `${formatDecimal(d.seller.positiveRatingPct, 0)}% avaliações positivas`
                      : 'Reputação verde'
                  }
                />
                <Mini
                  label="Atendimento"
                  value={
                    d.seller.claimsRate !== null
                      ? `${formatPercent(d.seller.claimsRate * 100)} reclamações`
                      : 'Excelente atendimento'
                  }
                  sub={
                    d.seller.delayedHandlingRate !== null
                      ? `${formatPercent(d.seller.delayedHandlingRate * 100)} atraso`
                      : 'Envio no prazo'
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Módulo de Análise de Qualidade da Listagem (Score 0 a 100 + Checklist) */}
      <ListingQualitySection d={d} />

      {/* Comparador Ranqueado de Concorrentes */}
      <div className="glass-panel space-y-4 rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white">
              Ranking de Concorrentes &amp; Comparador de Ofertas
            </h3>
            <p className="text-xs text-slate-400">
              Compare até 40 ofertas idênticas e similares por menor preço, faturamento 30d, vendas, vendedor e logística Full
            </p>
          </div>
          <Pill tone="blue">{d.competitors.length} concorrentes mapeados</Pill>
        </div>

        <CompetitorShowcase
          rows={d.competitors}
          currentPrice={d.price}
          onAnalyzeCompetitor={onAnalyzeCompetitor}
        />
      </div>

      <KeywordsPanel keywords={d.keywords} onPickTerm={onPickTerm} />
    </section>
  );
}

/* =============================================================================
 * CALCULADORA DE MARGEM E PREÇO SIMPLES, VISUAL E DIRETA
 * ============================================================================= */

function SimpleModalitiesCard({
  title,
  subtitle,
  b,
  suggested,
  onApplySuggested,
}: {
  title: string;
  subtitle: string;
  b: CalculatorBreakdown;
  suggested: SuggestedPrice;
  onApplySuggested: (price: number) => void;
}) {
  const hasPrice = b.price > 0;
  const marginPct = b.contributionPct * 100;
  const mlFeeTotal = b.commission + b.fixedFee;

  // Semáforo de margem: Verde (>= 15%), Amarelo (5% a 14,9%), Vermelho (< 5%)
  const statusTone =
    !hasPrice
      ? {
          border: 'border-white/10',
          badge: 'bg-slate-800 text-slate-300',
          profitColor: 'text-slate-300',
          barColor: 'bg-slate-600',
          label: 'Informe o preço',
        }
      : marginPct >= 15
        ? {
            border: 'border-emerald-500/40',
            badge: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40',
            profitColor: 'text-emerald-400',
            barColor: 'bg-gradient-to-r from-emerald-500 to-teal-400',
            label: 'Margem Saudável',
          }
        : marginPct >= 5
          ? {
              border: 'border-amber-400/40',
              badge: 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40',
              profitColor: 'text-amber-300',
              barColor: 'bg-gradient-to-r from-amber-400 to-yellow-500',
              label: 'Margem Apertada',
            }
          : {
              border: 'border-red-500/45',
              badge: 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40',
              profitColor: 'text-red-400',
              barColor: 'bg-gradient-to-r from-red-500 to-rose-500',
              label: marginPct < 0 ? 'Prejuízo na Venda' : 'Margem Crítica',
            };

  return (
    <div className={`glass-panel flex flex-col justify-between space-y-5 rounded-3xl border-2 p-6 ${statusTone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone.badge}`}>
          {statusTone.label}
        </span>
      </div>

      {/* Destaque Principal: Quanto Sobrou no Bolso e Margem Final (%) */}
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Quanto Sobrou no Bolso
          </p>
          <p className={`mt-1.5 text-3xl font-black ${statusTone.profitColor}`}>
            {hasPrice ? formatBRL(b.contribution) : 'R$ 0,00'}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Lucro líquido por venda</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Margem Final (%)
          </p>
          <p className={`mt-1.5 text-3xl font-black ${statusTone.profitColor}`}>
            {hasPrice ? formatPercent(marginPct) : '0,0%'}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${statusTone.barColor}`}
              style={{ width: `${Math.min(100, Math.max(0, marginPct * 2.5))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Resumo Direto: Tarifa do ML e Custo Total */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="font-medium text-slate-400">Tarifa do ML ({formatDecimal(b.commissionPct, 1)}%)</p>
          <p className="mt-1 text-lg font-bold text-white">{formatBRL(mlFeeTotal, 'R$ 0,00')}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {b.fixedFee > 0
              ? `${formatBRL(b.commission)} comissão + ${formatBRL(b.fixedFee)} taxa fixa`
              : 'Isento de taxa fixa (≥ R$ 79)'}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="font-medium text-slate-400">Custo Total da Venda</p>
          <p className="mt-1 text-lg font-bold text-slate-200">{formatBRL(b.totalCost, 'R$ 0,00')}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Produto {formatBRL(b.productCost)} + Imposto {formatBRL(b.tax)} + Frete {formatBRL(b.shipping)}
          </p>
        </div>
      </div>

      {/* Preço Sugerido para bater a meta */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-300">
            Preço de Venda Sugerido para sua Meta
          </p>
          <p className="mt-0.5 text-2xl font-black text-white">
            {suggested.price !== null ? formatBRL(suggested.price) : 'Reduza as taxas/meta'}
          </p>
        </div>
        {suggested.price !== null && (
          <button
            type="button"
            onClick={() => onApplySuggested(suggested.price as number)}
            className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 shadow-md transition hover:bg-amber-300"
          >
            Usar {formatBRL(suggested.price)}
          </button>
        )}
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
  ee: MarginCalcOutput;
}) {
  const applySuggested = (price: number) => {
    onChange({ salePrice: formatInputNumber(price) });
  };

  const quickPctTargets = ['10', '15', '20', '25', '30'];

  const weightCalc = useMemo(
    () =>
      computeShippingWeight(
        parseInputNumber(calc.physicalWeightGrams),
        parseInputNumber(calc.lengthCm),
        parseInputNumber(calc.widthCm),
        parseInputNumber(calc.heightCm),
      ),
    [calc.physicalWeightGrams, calc.lengthCm, calc.widthCm, calc.heightCm],
  );

  const batchUnits = Math.max(1, Math.round(parseInputNumber(calc.monthlyUnits) || 1));
  const monthlyGross = ee.classic.price * batchUnits;
  const monthlyNetClassic = ee.classic.contribution * batchUnits;
  const monthlyNetPremium = ee.premium.contribution * batchUnits;

  return (
    <section className="space-y-6">
      {/* Painel Principal de Entradas */}
      <div className="glass-panel rounded-3xl p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold text-white sm:text-2xl">
              <Calculator size={22} className="text-amber-400" /> Calculadora de Margem, Tarifas &amp; Peso Cubado
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Simule repasse líquido no Clássico e Premium, calcule Peso Físico vs. Cubado e projete o lucro mensal por lote.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {calc.title && <Pill tone="blue">Produto: {calc.title.slice(0, 50)}</Pill>}
            {calc.categoryLabel && <Pill tone="yellow">{calc.categoryLabel.slice(0, 40)}</Pill>}
          </div>
        </div>

        {/* 4 Campos Principais */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <label className="block text-xs font-bold uppercase tracking-wide text-amber-300">
              1. Preço de Venda (R$)
            </label>
            <input
              inputMode="decimal"
              className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-3 text-xl font-extrabold text-white outline-none focus:border-amber-400"
              value={calc.salePrice}
              onChange={(e) => onChange({ salePrice: e.target.value })}
              placeholder="99,90"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <label className="block text-xs font-bold uppercase tracking-wide text-sky-300">
              2. Custo do Produto (R$)
            </label>
            <input
              inputMode="decimal"
              className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-3 text-xl font-extrabold text-white outline-none focus:border-sky-400"
              value={calc.supplierCost}
              onChange={(e) => onChange({ supplierCost: e.target.value })}
              placeholder="35,00"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-300">
              3. Imposto da Nota (%)
            </label>
            <input
              inputMode="decimal"
              className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-3 text-xl font-extrabold text-white outline-none focus:border-sky-400"
              value={calc.taxPct}
              onChange={(e) => onChange({ taxPct: e.target.value })}
              placeholder="6"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wide text-emerald-300">
                4. Custo de Frete (R$)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={calc.mlCoversShipping}
                  onChange={(e) => onChange({ mlCoversShipping: e.target.checked })}
                  className="h-3.5 w-3.5 accent-emerald-400"
                />
                Frete R$ 0
              </label>
            </div>
            <input
              inputMode="decimal"
              disabled={calc.mlCoversShipping}
              className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-3 text-xl font-extrabold text-white outline-none focus:border-emerald-400 disabled:opacity-50"
              value={calc.mlCoversShipping ? '0,00' : calc.shippingCost}
              onChange={(e) => onChange({ shippingCost: e.target.value })}
              placeholder="21,45"
            />
          </div>
        </div>

        {/* Linha Complementar: Embalagem/Extras, Comissões da Categoria e Volume Mensal */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3.5">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Embalagem / Custo Extra (R$)
            </label>
            <input
              inputMode="decimal"
              value={calc.packagingCost}
              onChange={(e) => onChange({ packagingCost: e.target.value })}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-sky-400"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3.5">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Comissão Clássico (%)
            </label>
            <input
              inputMode="decimal"
              value={calc.classicPct}
              onChange={(e) => onChange({ classicPct: e.target.value })}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-sky-400"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3.5">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Comissão Premium (%)
            </label>
            <input
              inputMode="decimal"
              value={calc.premiumPct}
              onChange={(e) => onChange({ premiumPct: e.target.value })}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-bold text-amber-300 outline-none focus:border-amber-400"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3.5">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-emerald-300">
              Volume Mensal Projetado (un.)
            </label>
            <input
              inputMode="numeric"
              value={calc.monthlyUnits}
              onChange={(e) => onChange({ monthlyUnits: e.target.value })}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-bold text-emerald-300 outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        {/* Simulador de Peso Físico vs. Peso Cubado (C × L × A / 6000) */}
        <div className="mt-4 rounded-2xl border border-sky-400/25 bg-sky-500/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sky-300">
                <Scale size={14} /> Cálculo de Peso Físico vs. Peso Cubado (Mercado Envios)
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Fórmula volumétrica: (Comprimento × Largura × Altura em cm) / 6000. Prevalece o maior peso.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({
                  mlCoversShipping: false,
                  shippingCost: formatInputNumber(weightCalc.suggestedMeliShippingBrl),
                })
              }
              className="rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-sky-400"
            >
              Aplicar Frete Sugerido ({formatBRL(weightCalc.suggestedMeliShippingBrl)})
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="space-y-1 text-xs">
              <span className="text-slate-400">Peso Físico (g)</span>
              <input
                inputMode="numeric"
                value={calc.physicalWeightGrams}
                onChange={(e) => onChange({ physicalWeightGrams: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 font-bold text-white outline-none"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-slate-400">Comprimento (cm)</span>
              <input
                inputMode="decimal"
                value={calc.lengthCm}
                onChange={(e) => onChange({ lengthCm: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 font-bold text-white outline-none"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-slate-400">Largura (cm)</span>
              <input
                inputMode="decimal"
                value={calc.widthCm}
                onChange={(e) => onChange({ widthCm: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 font-bold text-white outline-none"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-slate-400">Altura (cm)</span>
              <input
                inputMode="decimal"
                value={calc.heightCm}
                onChange={(e) => onChange({ heightCm: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 font-bold text-white outline-none"
              />
            </label>
            <div className="rounded-xl border border-white/10 bg-slate-950/80 p-2.5 text-xs lg:col-span-2">
              <p className="text-[10px] uppercase text-slate-400">Peso Faturável Cobrado</p>
              <p className="mt-0.5 text-sm font-extrabold text-amber-300">
                {formatInt(weightCalc.billableWeightGrams)} g ({weightCalc.weightType})
              </p>
              <p className="text-[10px] text-slate-400">
                Físico: {formatInt(weightCalc.physicalWeightGrams)}g · Cubado: {formatInt(weightCalc.volumetricWeightGrams)}g
              </p>
            </div>
          </div>
        </div>

        {/* Seletor Rápido de Meta de Margem */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-300">
                Meta de Lucro: Quanto você quer ganhar por venda?
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onChange({ marginMode: 'pct', marginTarget: '20' })}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    calc.marginMode === 'pct'
                      ? 'bg-sky-500 text-white'
                      : 'border border-white/10 bg-slate-900 text-slate-300'
                  }`}
                >
                  Quero ganhar % de margem
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ marginMode: 'brl', marginTarget: '25,00' })}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    calc.marginMode === 'brl'
                      ? 'bg-sky-500 text-white'
                      : 'border border-white/10 bg-slate-900 text-slate-300'
                  }`}
                >
                  Quero ganhar R$ fixo por venda
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {calc.marginMode === 'pct' &&
                quickPctTargets.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => onChange({ marginTarget: pct })}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                      calc.marginTarget === pct
                        ? 'bg-amber-400 text-slate-950'
                        : 'border border-white/10 bg-slate-900 text-slate-300 hover:border-amber-400/40'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}

              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5">
                <span className="text-xs text-slate-400">
                  {calc.marginMode === 'pct' ? 'Meta (%):' : 'Meta (R$):'}
                </span>
                <input
                  inputMode="decimal"
                  value={calc.marginTarget}
                  onChange={(e) => onChange({ marginTarget: e.target.value })}
                  className="w-20 bg-transparent text-right text-base font-extrabold text-amber-300 outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Projeção de Escala Mensal do Lote */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-panel rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-400">
            <Package size={14} className="text-sky-400" /> Faturamento Bruto ({formatInt(batchUnits)} un.)
          </p>
          <p className="mt-1.5 text-2xl font-black text-white">{formatBRL(monthlyGross)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-xs font-bold uppercase text-emerald-300">
            Lucro Líquido do Lote no Clássico
          </p>
          <p className="mt-1.5 text-2xl font-black text-emerald-400">{formatBRL(monthlyNetClassic)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-xs font-bold uppercase text-amber-300">
            Lucro Líquido do Lote no Premium
          </p>
          <p className="mt-1.5 text-2xl font-black text-amber-300">{formatBRL(monthlyNetPremium)}</p>
        </div>
      </div>

      {/* 2 Cartões Grandes Lado a Lado: Anúncio Clássico vs Anúncio Premium */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SimpleModalitiesCard
          title="Anúncio Clássico"
          subtitle={`Comissão da categoria: ${calc.classicPct || '12'}% · Exposição padrão`}
          b={ee.classic}
          suggested={ee.suggestedClassic}
          onApplySuggested={applySuggested}
        />
        <SimpleModalitiesCard
          title="Anúncio Premium"
          subtitle={`Comissão da categoria: ${calc.premiumPct || '17'}% · Parcelamento sem juros ao comprador`}
          b={ee.premium}
          suggested={ee.suggestedPremium}
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
    <Modal title="Conectar Conta do Mercado Livre" onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-300">
        <p>
          Conecte sua conta do Mercado Livre para liberar consultas autenticadas diretamente pela sua sessão.
        </p>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Endereço de retorno (Redirect URI)
          </p>
          <code className="block break-all rounded-xl bg-slate-950 px-3 py-2 text-xs text-amber-300">
            {origin}
          </code>
        </div>

        {session ? (
          <div className="space-y-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/12 p-4">
            <p className="flex items-center gap-2 font-semibold text-emerald-200">
              <Check size={16} /> Conta conectada
            </p>
            <p className="text-xs text-slate-300">ID do usuário: {session.tokens.userId ?? HIDDEN}</p>
            <button type="button" onClick={onDisconnect} className={BTN_GHOST}>
              <LogOut size={14} /> Desconectar conta
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
            <Key size={16} /> Autorizar no Mercado Livre
          </button>
        )}
      </div>
    </Modal>
  );
}

/* =============================================================================
 * MENU LATERAL (SIDEBAR) E PLATAFORMA PRINCIPAL (10 MÓDULOS INTEGRADOS)
 * ============================================================================= */

type SidebarNavItem = {
  id: Exclude<ModuleId, 'raiox'>;
  label: string;
  shortDesc: string;
  group: 'mercado' | 'competitividade' | 'conversao';
  icon: ReactNode;
};

const SIDEBAR_MODULES: SidebarNavItem[] = [
  {
    id: 'home',
    label: 'Home',
    shortDesc: 'Visão Geral & Ranking',
    group: 'mercado',
    icon: <Home size={17} />,
  },
  {
    id: 'produtos',
    label: 'Busca de Produtos',
    shortDesc: 'Pesquisa multi-filtros',
    group: 'mercado',
    icon: <Search size={17} />,
  },
  {
    id: 'locais',
    label: 'Produtos Locais',
    shortDesc: 'Brasil vs. CBT & UF',
    group: 'mercado',
    icon: <MapPin size={17} />,
  },
  {
    id: 'categorias',
    label: 'Análise de Categoria',
    shortDesc: 'Nicho & Monopólio',
    group: 'mercado',
    icon: <Layers size={17} />,
  },
  {
    id: 'tendencias',
    label: 'Tendências',
    shortDesc: 'Sazonalidade & Alta',
    group: 'mercado',
    icon: <TrendingUp size={17} />,
  },
  {
    id: 'vendedores',
    label: 'Concorrência & Lojas',
    shortDesc: 'Raio-X & Curva ABC',
    group: 'competitividade',
    icon: <Store size={17} />,
  },
  {
    id: 'monitor',
    label: 'Monitor',
    shortDesc: 'Snapshots & Variação Δ',
    group: 'competitividade',
    icon: <Bookmark size={17} />,
  },
  {
    id: 'auditor',
    label: 'Análise da Listagem',
    shortDesc: 'Score SEO 0 a 100',
    group: 'conversao',
    icon: <ClipboardCheck size={17} />,
  },
  {
    id: 'midias',
    label: 'Clipes e Imagens',
    shortDesc: 'Vídeos & Galeria HD',
    group: 'conversao',
    icon: <Film size={17} />,
  },
  {
    id: 'calculadora',
    label: 'Calculadora de Margem',
    shortDesc: 'Lucro & Peso Cubado',
    group: 'conversao',
    icon: <Calculator size={17} />,
  },
];

const MODULE_TITLES: Record<ModuleId, string> = {
  home: 'Home · Visão Geral do Mercado',
  produtos: 'Busca Avançada de Produtos',
  locais: 'Produtos Locais · Brasil vs. Internacional (CBT)',
  categorias: 'Análise de Categoria & Monopólio',
  tendencias: 'Tendências & Sazonalidade',
  vendedores: 'Concorrência & Busca de Vendedores',
  monitor: 'Monitor de Produtos & Vendedores',
  auditor: 'Análise da Listagem · Score 0–100',
  midias: 'Clipes e Imagens de Alta Resolução',
  calculadora: 'Calculadora de Margem & Peso Cubado',
  raiox: 'Raio-X Completo do Produto',
};

export default function BuscasMLPro() {
  const [activeModule, setActiveModule] = useState<ModuleId>('home');
  const [returnModule, setReturnModule] = useState<Exclude<ModuleId, 'raiox'>>('home');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [universalQuery, setUniversalQuery] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Estados de Busca de Produtos & Produtos Locais
  const [productSearchResult, setProductSearchResult] = useState<KeywordAnalysis | null>(null);
  const [localSearchResult, setLocalSearchResult] = useState<KeywordAnalysis | null>(null);
  const [productFilters, setProductFilters] = useState<AdvancedFilterState>(DEFAULT_ADVANCED_FILTERS);
  const [localFilters, setLocalFilters] = useState<AdvancedFilterState>(DEFAULT_LOCAL_FILTERS);

  // Estado de Análise de Categoria
  const [rootCategories, setRootCategories] = useState<RootCategoryItem[]>([]);
  const [categoryAnalysisResult, setCategoryAnalysisResult] = useState<KeywordAnalysis | null>(null);

  // Estado de Tendências Dedicado
  const [trendsCat, setTrendsCat] = useState<string>('all');
  const [trendsPayload, setTrendsPayload] = useState<TrendsModulePayload | null>(null);
  const [loadingTrends, setLoadingTrends] = useState<boolean>(false);

  // Estado de Concorrência & Raio-X de Vendedores
  const [sellerDossier, setSellerDossier] = useState<SellerDossierPayload | null>(null);
  const [loadingSeller, setLoadingSeller] = useState<boolean>(false);
  const [competitorDossier, setCompetitorDossier] = useState<Dossier | null>(null);
  const [loadingCompetitor, setLoadingCompetitor] = useState<boolean>(false);

  // Estado do Raio-X do Produto & Auditor 0–100
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [auditorDossier, setAuditorDossier] = useState<Dossier | null>(null);

  // Estado de Clipes e Imagens HD
  const [mediaData, setMediaData] = useState<MediaExtractorPayload | null>(null);
  const [loadingMedia, setLoadingMedia] = useState<boolean>(false);

  // Estado do Monitor (localStorage)
  const [monitorStore, setMonitorStore] = useState<MonitorStoreState>({ products: [], sellers: [] });
  const [refreshingMonitor, setRefreshingMonitor] = useState<boolean>(false);

  // Calculadora + Sessão OAuth + Ranking da Home
  const [calc, setCalc] = useState<CalcForm>(INITIAL_CALC);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [envStatus, setEnvStatus] = useState<StatusEnvelope | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const [rankingCat, setRankingCat] = useState<string>('all');
  const [rankingData, setRankingData] = useState<RankingPayload | null>(null);
  const [loadingRanking, setLoadingRanking] = useState<boolean>(false);

  const sessionRef = useRef<StoredSession | null>(null);
  const refreshRef = useRef<Promise<string | null> | null>(null);
  const exchangeStartedRef = useRef(false);
  const searchSeqRef = useRef(0);

  const ee = useMemo(() => computeMarginCalculator(calc), [calc]);

  /* ---------- Persistência de Sessão OAuth & Monitor ---------- */

  const persistSession = useCallback((next: StoredSession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) writeSession(next);
    else clearSession();
  }, []);

  const persistMonitor = useCallback((updater: (prev: MonitorStoreState) => MonitorStoreState) => {
    setMonitorStore((prev) => {
      const next = updater(prev);
      writeMonitorStore(next);
      return next;
    });
  }, []);

  const getBearer = useCallback(async (): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    const { tokens } = current;
    if (!needsRefresh(tokens)) return tokens.accessToken;

    if (!tokens.refreshToken) {
      if (tokens.expiresAt > Date.now()) return tokens.accessToken;
      persistSession(null);
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
    setMonitorStore(readMonitorStore());
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
        setNotice({ kind: 'ok', text: 'Conta do Mercado Livre autorizada com sucesso.' });
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

    getBearer()
      .then((bearer) => requestRootCategories(bearer))
      .then((cats) => {
        if (active) setRootCategories(cats);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [getBearer]);

  /* ---------- Carregamento do Ranking da Home ---------- */

  useEffect(() => {
    let active = true;
    setLoadingRanking(true);
    getBearer()
      .then((bearer) => requestRanking(rankingCat, bearer))
      .then((payload) => {
        if (active) setRankingData(payload);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingRanking(false);
      });
    return () => {
      active = false;
    };
  }, [rankingCat, getBearer]);

  /* ---------- Carregamento Automático do Módulo Tendências ---------- */

  useEffect(() => {
    if (activeModule !== 'tendencias') return;
    let active = true;
    setLoadingTrends(true);
    getBearer()
      .then((bearer) => requestTrendsModule(trendsCat, bearer))
      .then((payload) => {
        if (active) setTrendsPayload(payload);
      })
      .catch((err) => {
        if (active) setNotice({ kind: 'erro', text: errorMessage(err, 'Erro ao consultar tendências.') });
      })
      .finally(() => {
        if (active) setLoadingTrends(false);
      });
    return () => {
      active = false;
    };
  }, [activeModule, trendsCat, getBearer]);

  /* ---------- Navegação entre Módulos ---------- */

  const navigateTo = useCallback((mod: ModuleId) => {
    setActiveModule((prev) => {
      if (mod === 'raiox' && prev !== 'raiox') {
        setReturnModule(prev);
      }
      return mod;
    });
    setMobileSidebarOpen(false);
    setNotice(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  /* ---------- Ações de Busca por Módulo ---------- */

  const runProductSearch = useCallback(
    async (
      q: string,
      targetVariant: 'produtos' | 'locais',
      hints?: { origin?: string | null; uf?: string | null },
    ) => {
      const seq = ++searchSeqRef.current;
      navigateTo(targetVariant);
      setLoading(`Pesquisando anúncios de "${q}"...`);
      try {
        const bearer = await getBearer();
        const data = await requestAnalysis(q, bearer, 'termo', {
          origin: hints?.origin ?? (targetVariant === 'locais' ? 'nacional' : null),
          uf: hints?.uf ?? null,
          limit: 24,
        });
        if (seq !== searchSeqRef.current) return;
        if (data.mode === 'keyword') {
          if (targetVariant === 'locais') setLocalSearchResult(data);
          else setProductSearchResult(data);
        } else {
          setDossier(data.dossier);
          setAuditorDossier(data.dossier);
          navigateTo('raiox');
        }
      } catch (err) {
        if (seq === searchSeqRef.current) {
          setNotice({ kind: 'erro', text: errorMessage(err, 'Falha ao buscar produtos.') });
        }
      } finally {
        if (seq === searchSeqRef.current) setLoading(null);
      }
    },
    [getBearer, navigateTo],
  );

  const openAdDossier = useCallback(
    async (codeOrUrl: string, openInAuditor = false) => {
      const clean = codeOrUrl.trim();
      if (!clean) return;
      const seq = ++searchSeqRef.current;
      const currentOrigin = activeModule !== 'raiox' ? activeModule : returnModule;
      setReturnModule(currentOrigin);
      setActiveModule(openInAuditor ? 'auditor' : 'raiox');
      setMobileSidebarOpen(false);
      setLoading(`Carregando dossiê completo de ${clean.slice(0, 42)}...`);
      setNotice(null);
      try {
        const bearer = await getBearer();
        const mode: SearchMode =
          /^MLBU/i.test(clean) || /^https?:\/\//i.test(clean) ? 'auto' : 'anuncio';
        const data = await requestAnalysis(clean, bearer, mode);
        if (seq !== searchSeqRef.current) return;
        if (data.mode === 'dossier') {
          setDossier(data.dossier);
          setAuditorDossier(data.dossier);
          setCompetitorDossier(data.dossier);
        } else {
          setProductSearchResult(data);
          setActiveModule('produtos');
        }
      } catch (err) {
        if (seq === searchSeqRef.current) {
          setNotice({ kind: 'erro', text: errorMessage(err, 'Não foi possível carregar este anúncio.') });
        }
      } finally {
        if (seq === searchSeqRef.current) setLoading(null);
      }
    },
    [activeModule, getBearer, returnModule],
  );

  const openCategoryAnalysis = useCallback(
    async (catOrTerm: string, isCategoryId = true) => {
      const clean = catOrTerm.trim();
      if (!clean) return;
      const seq = ++searchSeqRef.current;
      navigateTo('categorias');
      setLoading(`Analisando nicho e concentração de ${clean}...`);
      try {
        const bearer = await getBearer();
        const data = await requestAnalysis(
          clean,
          bearer,
          isCategoryId ? 'categoria' : 'termo',
          { limit: 24 },
        );
        if (seq !== searchSeqRef.current) return;
        if (data.mode === 'keyword') {
          setCategoryAnalysisResult(data);
        }
      } catch (err) {
        if (seq === searchSeqRef.current) {
          setNotice({ kind: 'erro', text: errorMessage(err, 'Falha ao analisar a categoria.') });
        }
      } finally {
        if (seq === searchSeqRef.current) setLoading(null);
      }
    },
    [getBearer, navigateTo],
  );

  const inspectSeller = useCallback(
    async (sellerQuery: string) => {
      const clean = sellerQuery.trim();
      if (!clean) return;
      navigateTo('vendedores');
      setLoadingSeller(true);
      setNotice(null);
      try {
        const bearer = await getBearer();
        const payload = await requestSellerDossier(clean, bearer);
        setSellerDossier(payload);
      } catch (err) {
        setNotice({ kind: 'erro', text: errorMessage(err, 'Não foi possível mapear este vendedor.') });
      } finally {
        setLoadingSeller(false);
      }
    },
    [getBearer, navigateTo],
  );

  const compareCompetitorsForAd = useCallback(
    async (adQuery: string) => {
      const clean = adQuery.trim();
      if (!clean) return;
      setLoadingCompetitor(true);
      setNotice(null);
      try {
        const bearer = await getBearer();
        const data = await requestAnalysis(clean, bearer, 'auto');
        if (data.mode === 'dossier') {
          setCompetitorDossier(data.dossier);
        } else if (data.products[0]) {
          const firstCode =
            data.products[0].mlbuId ?? data.products[0].itemId ?? data.products[0].productId;
          if (firstCode) {
            const sub = await requestAnalysis(firstCode, bearer, 'auto');
            if (sub.mode === 'dossier') setCompetitorDossier(sub.dossier);
          }
        }
      } catch (err) {
        setNotice({ kind: 'erro', text: errorMessage(err, 'Falha ao carregar comparativo de ofertas.') });
      } finally {
        setLoadingCompetitor(false);
      }
    },
    [getBearer],
  );

  const extractMediaFor = useCallback(
    async (q: string) => {
      const clean = q.trim();
      if (!clean) return;
      navigateTo('midias');
      setLoadingMedia(true);
      setNotice(null);
      try {
        const bearer = await getBearer();
        const media = await requestMediaExtractor(clean, bearer);
        setMediaData(media);
      } catch (err) {
        setNotice({ kind: 'erro', text: errorMessage(err, 'Erro ao extrair mídias e clipes.') });
      } finally {
        setLoadingMedia(false);
      }
    },
    [getBearer, navigateTo],
  );

  const handleUniversalSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = universalQuery.trim();
    if (!q) return;
    if (/^MLB\d{3,7}$/i.test(q)) {
      void openCategoryAnalysis(q.toUpperCase(), true);
      return;
    }
    if (
      /^MLBU?-?\d{6,}$/i.test(q) ||
      /mercadolivre\.com\.br|mercadolivre\.com|meli\.la/i.test(q)
    ) {
      void openAdDossier(q, false);
      return;
    }
    void runProductSearch(q, activeModule === 'locais' ? 'locais' : 'produtos');
  };

  /* ---------- Monitoramento (Produtos & Vendedores em localStorage) ---------- */

  const isProductMonitored = useCallback(
    (code: string | null) => {
      if (!code) return false;
      const norm = code.trim().toUpperCase();
      return monitorStore.products.some((p) => p.code.toUpperCase() === norm);
    },
    [monitorStore.products],
  );

  const isSellerMonitored = useCallback(
    (sellerId: number | null, nickname: string | null) => {
      return monitorStore.sellers.some(
        (s) =>
          (sellerId !== null && s.sellerId === sellerId) ||
          (nickname && s.nickname.toLowerCase() === nickname.toLowerCase()),
      );
    },
    [monitorStore.sellers],
  );

  const toggleMonitorProduct = useCallback(
    (p: ProductSummary) => {
      const code = (p.mlbuId ?? p.itemId ?? p.productId ?? '').trim();
      if (!code) return;
      const nowIso = new Date().toISOString();
      persistMonitor((prev) => {
        const exists = prev.products.some((x) => x.code.toUpperCase() === code.toUpperCase());
        if (exists) {
          return {
            ...prev,
            products: prev.products.filter((x) => x.code.toUpperCase() !== code.toUpperCase()),
          };
        }
        const entry: MonitoredProduct = {
          code,
          title: p.title,
          image: p.image,
          sellerNickname: p.seller?.nickname ?? null,
          sellerId: p.seller?.id ?? null,
          fulfillment: p.fulfillment,
          listingType: p.listingType,
          permalink: p.permalink,
          addedAt: nowIso,
          lastUpdatedAt: nowIso,
          snapshots: [
            {
              capturedAt: nowIso,
              price: p.price,
              stock: p.availableQuantity,
              soldTotal: p.soldQuantity,
              dailySales: p.velocity?.daily ?? null,
              monthlyRevenue: p.revenue?.monthly ?? null,
            },
          ],
        };
        return { ...prev, products: [entry, ...prev.products] };
      });
    },
    [persistMonitor],
  );

  const toggleMonitorDossier = useCallback(
    (d: Dossier) => {
      const code = (d.mlbuId ?? d.itemId ?? d.productId ?? '').trim();
      if (!code) return;
      const nowIso = new Date().toISOString();
      persistMonitor((prev) => {
        const exists = prev.products.some((x) => x.code.toUpperCase() === code.toUpperCase());
        if (exists) {
          return {
            ...prev,
            products: prev.products.filter((x) => x.code.toUpperCase() !== code.toUpperCase()),
          };
        }
        const entry: MonitoredProduct = {
          code,
          title: d.title,
          image: d.images[0] ?? null,
          sellerNickname: d.seller?.nickname ?? null,
          sellerId: d.seller?.id ?? null,
          fulfillment: d.fulfillment,
          listingType: d.listingType,
          permalink: d.permalink,
          addedAt: nowIso,
          lastUpdatedAt: nowIso,
          snapshots: [
            {
              capturedAt: nowIso,
              price: d.price,
              stock: d.availableQuantity,
              soldTotal: d.soldValue,
              dailySales: d.velocity?.daily ?? null,
              monthlyRevenue: d.revenue?.monthly ?? null,
            },
          ],
        };
        return { ...prev, products: [entry, ...prev.products] };
      });
    },
    [persistMonitor],
  );

  const toggleMonitorSeller = useCallback(
    (s: SellerDossierPayload) => {
      const keyId = s.seller.id ? String(s.seller.id) : (s.seller.nickname ?? 'loja').toUpperCase();
      const nowIso = new Date().toISOString();
      persistMonitor((prev) => {
        const exists = prev.sellers.some(
          (x) => x.id === keyId || (s.seller.id !== null && x.sellerId === s.seller.id),
        );
        if (exists) {
          return {
            ...prev,
            sellers: prev.sellers.filter(
              (x) => x.id !== keyId && (s.seller.id === null || x.sellerId !== s.seller.id),
            ),
          };
        }
        const entry: MonitoredSeller = {
          id: keyId,
          sellerId: s.seller.id,
          nickname: s.seller.nickname ?? `Lojista #${keyId}`,
          medal: s.seller.medal,
          cityState:
            s.seller.city && s.seller.state
              ? `${s.seller.city} - ${s.seller.state}`
              : s.seller.state ?? 'Brasil',
          storePermalink: s.seller.storePermalink,
          addedAt: nowIso,
          lastUpdatedAt: nowIso,
          snapshots: [
            {
              capturedAt: nowIso,
              completedSales: s.seller.completedSales,
              monthlyRevenue: s.portfolio.estimatedMonthlyRevenue,
              avgTicket: s.portfolio.averageTicket,
              claimsRate: s.seller.claimsRate,
              reputationLevel: s.seller.reputationLevel,
            },
          ],
        };
        return { ...prev, sellers: [entry, ...prev.sellers] };
      });
    },
    [persistMonitor],
  );

  const refreshSingleMonitoredProduct = useCallback(
    async (code: string) => {
      setRefreshingMonitor(true);
      try {
        const bearer = await getBearer();
        const res = await requestAnalysis(code, bearer, 'auto');
        if (res.mode === 'dossier') {
          const d = res.dossier;
          const nowIso = new Date().toISOString();
          persistMonitor((prev) => ({
            ...prev,
            products: prev.products.map((item) =>
              item.code.toUpperCase() === code.toUpperCase()
                ? {
                    ...item,
                    title: d.title || item.title,
                    image: d.images[0] ?? item.image,
                    sellerNickname: d.seller?.nickname ?? item.sellerNickname,
                    lastUpdatedAt: nowIso,
                    snapshots: [
                      ...item.snapshots.slice(-29),
                      {
                        capturedAt: nowIso,
                        price: d.price,
                        stock: d.availableQuantity,
                        soldTotal: d.soldValue,
                        dailySales: d.velocity?.daily ?? null,
                        monthlyRevenue: d.revenue?.monthly ?? null,
                      },
                    ],
                  }
                : item,
            ),
          }));
        }
      } catch (err) {
        setNotice({ kind: 'erro', text: errorMessage(err, `Erro ao atualizar ${code}.`) });
      } finally {
        setRefreshingMonitor(false);
      }
    },
    [getBearer, persistMonitor],
  );

  const refreshSingleMonitoredSeller = useCallback(
    async (idOrNick: string) => {
      setRefreshingMonitor(true);
      try {
        const bearer = await getBearer();
        const s = await requestSellerDossier(idOrNick, bearer);
        const nowIso = new Date().toISOString();
        persistMonitor((prev) => ({
          ...prev,
          sellers: prev.sellers.map((sel) =>
            sel.id === idOrNick ||
            (s.seller.id !== null && sel.sellerId === s.seller.id) ||
            sel.nickname.toLowerCase() === idOrNick.toLowerCase()
              ? {
                  ...sel,
                  nickname: s.seller.nickname ?? sel.nickname,
                  medal: s.seller.medal,
                  lastUpdatedAt: nowIso,
                  snapshots: [
                    ...sel.snapshots.slice(-29),
                    {
                      capturedAt: nowIso,
                      completedSales: s.seller.completedSales,
                      monthlyRevenue: s.portfolio.estimatedMonthlyRevenue,
                      avgTicket: s.portfolio.averageTicket,
                      claimsRate: s.seller.claimsRate,
                      reputationLevel: s.seller.reputationLevel,
                    },
                  ],
                }
              : sel,
          ),
        }));
      } catch (err) {
        setNotice({ kind: 'erro', text: errorMessage(err, 'Erro ao atualizar vendedor.') });
      } finally {
        setRefreshingMonitor(false);
      }
    },
    [getBearer, persistMonitor],
  );

  const refreshAllMonitored = useCallback(async () => {
    setRefreshingMonitor(true);
    try {
      const bearer = await getBearer();
      const nowIso = new Date().toISOString();

      const updatedProducts = await Promise.all(
        monitorStore.products.map(async (item) => {
          try {
            const res = await requestAnalysis(item.code, bearer, 'auto');
            if (res.mode !== 'dossier') return item;
            const d = res.dossier;
            return {
              ...item,
              title: d.title || item.title,
              image: d.images[0] ?? item.image,
              sellerNickname: d.seller?.nickname ?? item.sellerNickname,
              lastUpdatedAt: nowIso,
              snapshots: [
                ...item.snapshots.slice(-29),
                {
                  capturedAt: nowIso,
                  price: d.price,
                  stock: d.availableQuantity,
                  soldTotal: d.soldValue,
                  dailySales: d.velocity?.daily ?? null,
                  monthlyRevenue: d.revenue?.monthly ?? null,
                },
              ],
            };
          } catch {
            return item;
          }
        }),
      );

      const updatedSellers = await Promise.all(
        monitorStore.sellers.map(async (sel) => {
          try {
            const q = sel.sellerId ? String(sel.sellerId) : sel.nickname;
            const s = await requestSellerDossier(q, bearer);
            return {
              ...sel,
              nickname: s.seller.nickname ?? sel.nickname,
              medal: s.seller.medal,
              lastUpdatedAt: nowIso,
              snapshots: [
                ...sel.snapshots.slice(-29),
                {
                  capturedAt: nowIso,
                  completedSales: s.seller.completedSales,
                  monthlyRevenue: s.portfolio.estimatedMonthlyRevenue,
                  avgTicket: s.portfolio.averageTicket,
                  claimsRate: s.seller.claimsRate,
                  reputationLevel: s.seller.reputationLevel,
                },
              ],
            };
          } catch {
            return sel;
          }
        }),
      );

      persistMonitor(() => ({ products: updatedProducts, sellers: updatedSellers }));
      setNotice({
        kind: 'ok',
        text: 'Snapshots atualizados com sucesso para todos os itens monitorados!',
      });
    } finally {
      setRefreshingMonitor(false);
    }
  }, [getBearer, monitorStore.products, monitorStore.sellers, persistMonitor]);

  const addMonitorProductByQuery = useCallback(
    async (q: string) => {
      setRefreshingMonitor(true);
      try {
        const bearer = await getBearer();
        const res = await requestAnalysis(q, bearer, 'auto');
        if (res.mode === 'dossier') {
          toggleMonitorDossier(res.dossier);
          setNotice({ kind: 'ok', text: `Anúncio "${res.dossier.title.slice(0, 45)}..." adicionado ao Monitor!` });
        } else if (res.products[0]) {
          toggleMonitorProduct(res.products[0]);
          setNotice({ kind: 'ok', text: `Produto "${res.products[0].title.slice(0, 45)}..." adicionado ao Monitor!` });
        }
      } catch (err) {
        setNotice({ kind: 'erro', text: errorMessage(err, 'Não foi possível adicionar este produto ao Monitor.') });
      } finally {
        setRefreshingMonitor(false);
      }
    },
    [getBearer, toggleMonitorDossier, toggleMonitorProduct],
  );

  const addMonitorSellerByQuery = useCallback(
    async (q: string) => {
      setRefreshingMonitor(true);
      try {
        const bearer = await getBearer();
        const s = await requestSellerDossier(q, bearer);
        toggleMonitorSeller(s);
        setNotice({
          kind: 'ok',
          text: `Vendedor "${s.seller.nickname ?? s.seller.id}" salvo no Monitor!`,
        });
      } catch (err) {
        setNotice({ kind: 'erro', text: errorMessage(err, 'Não foi possível localizar o vendedor para monitorar.') });
      } finally {
        setRefreshingMonitor(false);
      }
    },
    [getBearer, toggleMonitorSeller],
  );

  /* ---------- Calculadora Integrada ---------- */

  const simulateFromSummary = useCallback(
    (src: ProductSummary) => {
      setCalc((prev) => ({
        ...prev,
        title: src.title,
        categoryLabel: src.categoryId ?? '',
        salePrice: src.price !== null ? formatInputNumber(src.price) : prev.salePrice,
        listing: kindFromLabel(src.listingType ?? src.listingTypeId) ?? 'classico',
        isSupermarket: src.isSupermarket,
        mlCoversShipping: false,
      }));
      navigateTo('calculadora');
    },
    [navigateTo],
  );

  const simulateFromDossier = useCallback(
    (d: Dossier) => {
      const cPct =
        d.fees.categoryFees.range_128?.gold_special ?? DEFAULT_COMMISSION_PCT.gold_special;
      const pPct = d.fees.categoryFees.range_128?.gold_pro ?? DEFAULT_COMMISSION_PCT.gold_pro;
      setCalc((prev) => ({
        ...prev,
        title: d.title,
        categoryLabel: d.categoryPath ?? d.categoryId ?? '',
        salePrice: d.price !== null ? formatInputNumber(d.price) : prev.salePrice,
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
      navigateTo('calculadora');
    },
    [navigateTo],
  );

  const simulateCategoryFees = useCallback(
    (category: CategoryOverview) => {
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
      navigateTo('calculadora');
    },
    [navigateTo],
  );

  const patchCalc = useCallback((patch: Partial<CalcForm>) => {
    setCalc((c) => ({ ...c, ...patch }));
  }, []);

  const disconnect = () => {
    persistSession(null);
    setAuthOpen(false);
    setNotice({ kind: 'aviso', text: 'Conta desconectada com sucesso.' });
  };

  const totalMonitoredCount = monitorStore.products.length + monitorStore.sellers.length;
  const dossierCode = dossier ? (dossier.mlbuId ?? dossier.itemId ?? dossier.productId ?? null) : null;

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="space-y-5">
        {/* Marca */}
        <button
          type="button"
          onClick={() => navigateTo('home')}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/75 p-3 text-left transition hover:border-amber-400/40"
        >
          <img
            src="/logo.png"
            alt="BuscasML Pro"
            className="h-10 w-10 shrink-0 rounded-xl object-contain drop-shadow-[0_0_12px_rgba(250,204,21,0.35)]"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-tight text-white">
              BuscasML <span className="text-amber-400">Pro</span>
            </p>
            <p className="truncate text-[10px] text-slate-400">Inteligência Mercado Livre</p>
          </div>
        </button>

        {/* Grupos de Módulos */}
        {(
          [
            { key: 'mercado', title: 'Mercado & Garimpo' },
            { key: 'competitividade', title: 'Concorrência & Radar' },
            { key: 'conversao', title: 'Auditoria, Mídia & Lucro' },
          ] as const
        ).map((grp) => (
          <div key={grp.key} className="space-y-1">
            <p className="px-2.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              {grp.title}
            </p>
            {SIDEBAR_MODULES.filter((m) => m.group === grp.key).map((item) => {
              const isSelected =
                activeModule === item.id ||
                (activeModule === 'raiox' && returnModule === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                    isSelected
                      ? 'border border-amber-400/40 bg-gradient-to-r from-amber-400/20 to-sky-500/10 text-white shadow'
                      : 'border border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={isSelected ? 'text-amber-400' : 'text-slate-400'}>
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{item.label}</p>
                      <p className="truncate text-[10px] text-slate-400">{item.shortDesc}</p>
                    </div>
                  </div>
                  {item.id === 'monitor' && totalMonitoredCount > 0 && (
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-950">
                      {totalMonitoredCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Rodapé da Sidebar */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-200">Status da API</span>
          <span className="inline-flex items-center gap-1 font-bold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Online
          </span>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Dados em tempo real do ecossistema Mercado Livre Brasil (MLB).
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* SIDEBAR DESKTOP FIXA */}
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#040711]/90 backdrop-blur-xl lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">{renderSidebarContent()}</div>
      </aside>

      {/* DRAWER MOBILE DA SIDEBAR */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-50 flex bg-black/75 backdrop-blur-sm lg:hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-full w-72 overflow-y-auto border-r border-white/15 bg-[#050914]"
          >
            <div className="flex items-center justify-end px-4 pt-3">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* ÁREA PRINCIPAL (HEADER STICKY + CONTEÚDO DO MÓDULO ATIVO) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#040711]/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Abrir menu de módulos"
                className="rounded-xl border border-white/10 bg-slate-900 p-2 text-slate-200 hover:bg-white/10 lg:hidden"
              >
                <Menu size={18} />
              </button>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  {MODULE_TITLES[activeModule]}
                </p>
                <p className="hidden text-[11px] text-slate-400 sm:block">
                  Pesquisa universal: digite produto, categoria MLB ou cole qualquer link/código de anúncio
                </p>
              </div>
            </div>

            {/* Pesquisa Universal Rápida no Topo */}
            <form onSubmit={handleUniversalSearch} className="order-3 flex w-full gap-2 md:order-2 md:w-auto md:flex-1 md:max-w-md">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-400"
                />
                <input
                  value={universalQuery}
                  onChange={(e) => setUniversalQuery(e.target.value)}
                  placeholder="Busca rápida: produto, MLB, MLBU ou link..."
                  className="w-full rounded-xl border border-white/10 bg-[#050914]/95 py-2 pl-9 pr-8 text-xs text-white placeholder-slate-400 outline-none focus:border-sky-400"
                />
                {universalQuery && (
                  <button
                    type="button"
                    onClick={() => setUniversalQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading !== null}
                className="rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"
              >
                Ir
              </button>
            </form>

            {/* Atalhos Direita: Monitor + OAuth */}
            <div className="order-2 flex items-center gap-2 md:order-3">
              <button
                type="button"
                onClick={() => navigateTo('monitor')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-amber-400/40 hover:text-amber-300"
              >
                <Bookmark size={14} className="text-amber-400" />
                <span className="hidden sm:inline">Monitor</span>
                <span className="rounded-full bg-amber-400/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-300">
                  {totalMonitoredCount}
                </span>
              </button>
              <button type="button" onClick={() => setAuthOpen(true)} className={BTN_SM_YELLOW}>
                <Key size={14} /> {session ? 'Conta ML Ativa' : 'Conectar ML'}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6">
          {envStatus && !envStatus.secretConfigured && (
            <Banner kind="erro">
              ML_CLIENT_SECRET não configurado no servidor. Sem ele, as buscas não funcionam.
            </Banner>
          )}
          {notice && (
            <Banner kind={notice.kind} onClose={() => setNotice(null)}>
              {notice.text}
            </Banner>
          )}
          {loading && <LoadingBlock label={loading} />}

          {/* MÓDULO 1: HOME */}
          {activeModule === 'home' && (
            <HomeOverviewModule
              ranking={rankingData}
              monitoredProductsCount={monitorStore.products.length}
              monitoredSellersCount={monitorStore.sellers.length}
              onNavigate={navigateTo}
              onQuickSearchTerm={(term) => void runProductSearch(term, 'produtos')}
              childrenRankingSection={
                <BestSellersRankingSection
                  ranking={rankingData}
                  loadingRanking={loadingRanking}
                  selectedCat={rankingCat}
                  onSelectCategory={setRankingCat}
                  onAnalyzeItem={(item) => {
                    const code = item.productId ?? item.itemId ?? item.id ?? item.permalink;
                    if (code) void openAdDossier(code, false);
                    else void runProductSearch(item.title, 'produtos');
                  }}
                  onAnalyzeTerm={(term) => void runProductSearch(term, 'produtos')}
                />
              }
            />
          )}

          {/* MÓDULO 2: BUSCA DE PRODUTOS */}
          {activeModule === 'produtos' && (
            <AdvancedProductSearchModule
              modeVariant="produtos"
              result={productSearchResult}
              loading={loading}
              filters={productFilters}
              onPatchFilters={(patch) => setProductFilters((prev) => ({ ...prev, ...patch }))}
              onResetFilters={() => setProductFilters(DEFAULT_ADVANCED_FILTERS)}
              onRunSearch={(q, hints) => void runProductSearch(q, 'produtos', hints)}
              onOpenProduct={(p) => {
                const code = p.mlbuId ?? p.itemId ?? p.productId ?? p.permalink;
                if (code) void openAdDossier(code, false);
              }}
              onSimulateProduct={simulateFromSummary}
              onOpenCategory={(catId) => void openCategoryAnalysis(catId, true)}
              onInspectSeller={(sq) => void inspectSeller(sq)}
              onToggleMonitorProduct={toggleMonitorProduct}
              isProductMonitored={isProductMonitored}
            />
          )}

          {/* MÓDULO 3: PRODUTOS LOCAIS (BRASIL vs CBT + UF) */}
          {activeModule === 'locais' && (
            <AdvancedProductSearchModule
              modeVariant="locais"
              result={localSearchResult ?? productSearchResult}
              loading={loading}
              filters={localFilters}
              onPatchFilters={(patch) => setLocalFilters((prev) => ({ ...prev, ...patch }))}
              onResetFilters={() => setLocalFilters(DEFAULT_LOCAL_FILTERS)}
              onRunSearch={(q, hints) => void runProductSearch(q, 'locais', hints)}
              onOpenProduct={(p) => {
                const code = p.mlbuId ?? p.itemId ?? p.productId ?? p.permalink;
                if (code) void openAdDossier(code, false);
              }}
              onSimulateProduct={simulateFromSummary}
              onOpenCategory={(catId) => void openCategoryAnalysis(catId, true)}
              onInspectSeller={(sq) => void inspectSeller(sq)}
              onToggleMonitorProduct={toggleMonitorProduct}
              isProductMonitored={isProductMonitored}
            />
          )}

          {/* MÓDULO 4: ANÁLISE DE CATEGORIA */}
          {activeModule === 'categorias' && (
            <CategoryAnalysisModule
              rootCategories={rootCategories}
              categoryResult={categoryAnalysisResult}
              loading={loading}
              onSelectCategory={(catId) => void openCategoryAnalysis(catId, true)}
              onSearchCategoryQuery={(q) => void openCategoryAnalysis(q, false)}
              onOpenProduct={(p) => {
                const code = p.mlbuId ?? p.itemId ?? p.productId ?? p.permalink;
                if (code) void openAdDossier(code, false);
              }}
              onSimulateProduct={simulateFromSummary}
              onInspectSeller={(sq) => void inspectSeller(sq)}
              onUseCategoryFees={simulateCategoryFees}
              onPickTrendKeyword={(kw) => void runProductSearch(kw, 'produtos')}
              onToggleMonitorProduct={toggleMonitorProduct}
              isProductMonitored={isProductMonitored}
            />
          )}

          {/* MÓDULO 5: TENDÊNCIAS */}
          {activeModule === 'tendencias' && (
            <TrendsModuleView
              data={trendsPayload}
              loading={loadingTrends}
              selectedCat={trendsCat}
              onSelectCategory={setTrendsCat}
              onSearchKeywordInProducts={(kw) => void runProductSearch(kw, 'produtos')}
              onSearchKeywordInLocals={(kw) => void runProductSearch(kw, 'locais')}
              onExtractMediaForKeyword={(kw) => void extractMediaFor(kw)}
              onOpenRankingProduct={(item) => {
                const code = item.productId ?? item.itemId ?? item.id ?? item.permalink;
                if (code) void openAdDossier(code, false);
              }}
            />
          )}

          {/* MÓDULO 6: CONCORRÊNCIA & BUSCA DE VENDEDORES */}
          {activeModule === 'vendedores' && (
            <SellersAndCompetitorsModule
              sellerDossier={sellerDossier}
              loadingSeller={loadingSeller}
              competitorDossier={competitorDossier ?? dossier}
              loadingCompetitor={loadingCompetitor}
              onSearchSeller={(q) => void inspectSeller(q)}
              onSearchCompetitorAd={(q) => void compareCompetitorsForAd(q)}
              onOpenProductCode={(code) => void openAdDossier(code, false)}
              onToggleMonitorSeller={toggleMonitorSeller}
              isSellerMonitored={isSellerMonitored}
              isProductMonitored={isProductMonitored}
              childrenCompetitorShowcase={
                (competitorDossier ?? dossier) ? (
                  <CompetitorShowcase
                    rows={(competitorDossier ?? dossier)!.competitors}
                    currentPrice={(competitorDossier ?? dossier)!.price}
                    onAnalyzeCompetitor={(code) => void openAdDossier(code, false)}
                  />
                ) : null
              }
            />
          )}

          {/* MÓDULO 7: MONITOR */}
          {activeModule === 'monitor' && (
            <MonitorModuleView
              products={monitorStore.products}
              sellers={monitorStore.sellers}
              refreshing={refreshingMonitor}
              onRefreshAll={() => void refreshAllMonitored()}
              onRefreshSingleProduct={(code) => void refreshSingleMonitoredProduct(code)}
              onRefreshSingleSeller={(idOrNick) => void refreshSingleMonitoredSeller(idOrNick)}
              onAddProductByQuery={(q) => void addMonitorProductByQuery(q)}
              onAddSellerByQuery={(q) => void addMonitorSellerByQuery(q)}
              onRemoveProduct={(code) =>
                persistMonitor((prev) => ({
                  ...prev,
                  products: prev.products.filter((x) => x.code !== code),
                }))
              }
              onRemoveSeller={(id) =>
                persistMonitor((prev) => ({
                  ...prev,
                  sellers: prev.sellers.filter((x) => x.id !== id),
                }))
              }
              onOpenProductCode={(code) => void openAdDossier(code, false)}
              onInspectSeller={(sq) => void inspectSeller(sq)}
            />
          )}

          {/* MÓDULO 8: ANÁLISE DA LISTAGEM (AUDITOR 0–100) */}
          {activeModule === 'auditor' && (
            <ListingAuditorModule
              dossier={auditorDossier ?? dossier}
              loading={loading}
              monitoredProducts={monitorStore.products}
              onAuditQuery={(q) => void openAdDossier(q, true)}
              onOpenFullRaioX={() => {
                if (auditorDossier && !dossier) setDossier(auditorDossier);
                navigateTo('raiox');
              }}
              onSimulateMargin={simulateFromDossier}
            />
          )}

          {/* MÓDULO 9: CLIPES E IMAGENS HD */}
          {activeModule === 'midias' && (
            <ClipsAndImagesModule
              media={mediaData}
              loading={loadingMedia}
              onExtractMedia={(q) => void extractMediaFor(q)}
              onOpenProductCode={(code) => void openAdDossier(code, false)}
            />
          )}

          {/* MÓDULO 10: CALCULADORA DE MARGEM */}
          {activeModule === 'calculadora' && (
            <CalculatorView calc={calc} onChange={patchCalc} ee={ee} />
          )}

          {/* VISÃO DETALHADA: RAIO-X COMPLETO DO PRODUTO */}
          {activeModule === 'raiox' && dossier && (
            <DossierView
              key={dossier.mlbuId ?? dossier.itemId ?? dossier.productId ?? dossier.title}
              d={dossier}
              backLabel={`Voltar para ${MODULE_TITLES[returnModule].split('·')[0].trim()}`}
              onBack={() => navigateTo(returnModule)}
              onSimulate={() => simulateFromDossier(dossier)}
              onPickTerm={(term) => void runProductSearch(term, 'produtos')}
              onOpenCategory={(catId) => void openCategoryAnalysis(catId, true)}
              onAnalyzeCompetitor={(code) => void openAdDossier(code, false)}
              onInspectSeller={(sq) => void inspectSeller(sq)}
              onToggleMonitor={() => toggleMonitorDossier(dossier)}
              isMonitored={isProductMonitored(dossierCode)}
              onOpenAuditor={() => {
                setAuditorDossier(dossier);
                navigateTo('auditor');
              }}
              onExtractMedia={() => {
                const target = dossier.mlbuId ?? dossier.itemId ?? dossier.productId ?? dossier.title;
                void extractMediaFor(target);
              }}
              getBearer={getBearer}
            />
          )}
        </main>
      </div>

      {authOpen && (
        <OAuthModal session={session} onClose={() => setAuthOpen(false)} onDisconnect={disconnect} />
      )}
    </div>
  );
}

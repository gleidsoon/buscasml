'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import {
  AlertCircle,
  Calculator,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Code,
  ExternalLink,
  Info,
  Key,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Search,
  Star,
  Store,
  Truck,
  TrendingUp,
  X,
} from 'lucide-react';

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
  completedSales: number | null;
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
  title: string;
  brand: string | null;
  model: string | null;
  image: string | null;
  price: number | null;
  soldQuantity: number | null;
  listingType: string | null;
  fulfillment: boolean;
  freeShipping: boolean;
  createdAt: string | null;
  createdSource: string;
  daysOnAir: number | null;
  firstPhotoDate: string | null;
  seller: SellerInfo | null;
  permalink: string | null;
};

type Dossier = {
  origin: string;
  productId: string | null;
  itemId: string | null;
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
  soldValue: number | null;
  soldLabel: string;
  soldSource: string;
  ratingAverage: number | null;
  ratingCount: number | null;
  fulfillment: boolean;
  freeShipping: boolean;
  logisticType: string | null;
  createdAt: string | null;
  createdSource: string;
  daysOnAir: number | null;
  firstPhotoDate: string | null;
  firstPhotoSource: string;
  seller: SellerInfo | null;
  competitors: CompetitorRow[];
  notes: string[];
  raw: Record<string, unknown>;
};

type KeywordAnalysis = { mode: 'keyword'; query: string; products: ProductSummary[]; note: string | null };
type DossierAnalysis = { mode: 'dossier'; dossier: Dossier };
type Analysis = KeywordAnalysis | DossierAnalysis;

type Identified = { query: string; confidence: string; reason: string };

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
  photoSearchConfigured: boolean;
  visionModel: string;
};

type SearchEnvelope = { ok: true; data: Analysis };
type PhotoEnvelope = { ok: true; identified: Identified; data: Analysis };
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
  salePrice: string;
  supplierCost: string;
  packagingCost: string;
  taxPct: string;
  listing: ListingKind;
  freeShipping: boolean;
  shippingCost: string;
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
const MARKER_SOURCE = 'Marcador público da página';

const MARGIN_TARGET_PCT = 18;
const FREE_SHIPPING_MIN = 79;
const FIXED_FEE_VALUE = 6.25;
/** Tipos que pagam a taxa fixa abaixo de R$ 79. Conforme a especificação, somente Premium. */
const FIXED_FEE_TYPES: ListingKind[] = ['premium'];
const COMMISSION_RATE: Record<ListingKind, number> = { classico: 0.12, premium: 0.17 };
const LISTING_LABEL: Record<ListingKind, string> = {
  classico: 'Clássico (12%)',
  premium: 'Premium (17%)',
};

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
  salePrice: '',
  supplierCost: '',
  packagingCost: '',
  taxPct: '',
  listing: 'classico',
  freeShipping: false,
  shippingCost: '',
};

const EXAMPLES = [
  'Coroa tiara strass noiva',
  'Creatina Growth 250g',
  'Pote hermético tempero',
  'Jogo 6 taças diamante',
  'Cadeira gamer reclinável',
  'Parafusadeira Vonder',
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
  return typeof value === 'number' && Number.isFinite(value) ? integer.format(value) : fallback;
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

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? HIDDEN : `${value.toFixed(1).replace('.', ',')}%`;
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
  if (/premium/i.test(label)) return 'premium';
  if (/cl[aá]ssico/i.test(label)) return 'classico';
  return null;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/* =============================================================================
 * CALCULADORA DE MARGEM (estilo Avantpro)
 * Lucro líquido = preço - fornecedor - embalagem - imposto - comissão - taxa fixa - frete.
 * Teto do fornecedor = maior custo que ainda entrega a margem alvo de 18%.
 * ============================================================================= */

type MarginInput = {
  salePrice: number;
  supplierCost: number;
  packagingCost: number;
  taxPct: number;
  listing: ListingKind;
  freeShipping: boolean;
  shippingCost: number;
};

type MarginResult = {
  commission: number;
  fixedFee: number;
  shipping: number;
  tax: number;
  netProfit: number;
  netMarginPct: number;
  maxSupplierCost: number;
};

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeMargin(input: MarginInput): MarginResult {
  const price = nonNegative(input.salePrice);
  const rate = COMMISSION_RATE[input.listing];
  const taxRate = nonNegative(input.taxPct) / 100;
  const packaging = nonNegative(input.packagingCost);
  const supplier = nonNegative(input.supplierCost);

  const commission = price * rate;
  const fixedFee =
    FIXED_FEE_TYPES.includes(input.listing) && price < FREE_SHIPPING_MIN ? FIXED_FEE_VALUE : 0;
  const shipping =
    input.freeShipping && price >= FREE_SHIPPING_MIN ? nonNegative(input.shippingCost) : 0;
  const tax = price * taxRate;

  const deductions = supplier + packaging + tax + commission + fixedFee + shipping;
  const netProfit = price - deductions;
  const netMarginPct = price > 0 ? (netProfit / price) * 100 : 0;

  const maxSupplierCost =
    price > 0
      ? price * (1 - MARGIN_TARGET_PCT / 100 - taxRate - rate) - packaging - fixedFee - shipping
      : 0;

  return {
    commission: roundMoney(commission),
    fixedFee: roundMoney(fixedFee),
    shipping: roundMoney(shipping),
    tax: roundMoney(tax),
    netProfit: roundMoney(netProfit),
    netMarginPct,
    maxSupplierCost: roundMoney(maxSupplierCost),
  };
}

/* =============================================================================
 * FILTROS, ORDENAÇÃO E RECEITA ESTIMADA
 * ============================================================================= */

/** Ordena com valores ausentes sempre no fim, em qualquer direção. */
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

type Revenue = { dailyUnits: number | null; est30: number | null; gross: number | null };

/** Receita derivada apenas de dados reais: média de vendas desde a criação e preço atual. */
function revenueOf(d: Dossier): Revenue {
  const sold = d.soldValue;
  const price = d.price;
  const days = d.daysOnAir;
  const dailyUnits = sold !== null && days !== null && days > 0 ? sold / days : null;
  const est30 = dailyUnits !== null && price !== null ? dailyUnits * 30 * price : null;
  const gross = sold !== null && price !== null ? sold * price : null;
  return { dailyUnits, est30, gross };
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
    // Armazenamento bloqueado ou cheio: a sessão vale só nesta aba.
  }
}

function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nada a fazer se o navegador bloquear o armazenamento.
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

async function requestAnalysis(input: string, bearer: string | null): Promise<Analysis> {
  const res = await fetch(`/api/ml?q=${encodeURIComponent(input)}`, {
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

async function requestPhoto(file: File, bearer: string | null): Promise<PhotoEnvelope> {
  const form = new FormData();
  form.append('image', file, file.name || 'colagem.png');
  const res = await fetch('/api/ml', {
    method: 'POST',
    headers: authHeaders(bearer),
    body: form,
    cache: 'no-store',
  });
  return readEnvelope<PhotoEnvelope>(res);
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
 * ÁREA DE TRANSFERÊNCIA (colagem de print com Ctrl+V)
 * ============================================================================= */

function imageFromDataTransfer(data: DataTransfer | null | undefined): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
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
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
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
      title: 'Palavra-chave',
      text: 'Digite o nome do produto e veja os anúncios encontrados, com foto, preço e vendedor.',
    },
    {
      icon: <LayoutGrid size={18} />,
      title: 'Link ou código MLB',
      text: 'Cole um link do Mercado Livre (meli.la, /p/MLB, /up/MLBU) para abrir o Raio-X completo.',
    },
    {
      icon: <Camera size={18} />,
      title: 'Foto ou print',
      text: 'Clique em Buscar por Foto ou cole um print com Ctrl+V. A IA identifica o produto e faz a pesquisa.',
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

function ExamplesRow({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">Testar:</span>
      {EXAMPLES.map((ex) => (
        <button
          key={ex}
          type="button"
          onClick={() => onPick(ex)}
          className="rounded-full border border-white/10 bg-[#111827] px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
        >
          {ex}
        </button>
      ))}
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
}: {
  p: ProductSummary;
  onOpen: (p: ProductSummary) => void;
  onSimulate: (p: ProductSummary) => void;
}) {
  const code = p.itemId ?? p.productId;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#111827] transition hover:border-white/10">
      <div className="flex h-56 items-center justify-center bg-white p-4">
        <SafeImage src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {p.listingType && <Pill tone="blue">{p.listingType}</Pill>}
          {p.fulfillment && <Pill tone="green">Full</Pill>}
          {p.freeShipping && <Pill tone="yellow">Frete grátis</Pill>}
        </div>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-slate-100">{p.title}</h3>
        <p className="text-2xl font-bold text-[#facc15]">{formatBRL(p.price)}</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Mini label="Criado em" value={formatDate(p.createdAt)} sub={formatDaysOnAir(p.daysOnAir)} />
          <Mini label="Vendas" value={formatInt(p.soldQuantity)} />
          <Mini
            label="Vendedor"
            value={p.seller?.nickname ?? HIDDEN}
            sub={formatAccountAge(p.seller?.accountYears ?? null)}
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
            <th className="px-4 py-3 font-medium">Criação do anúncio</th>
            <th className="px-4 py-3 font-medium">Vendedor</th>
            <th className="px-4 py-3 font-medium">Vendas</th>
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
                  <div className="flex min-w-[260px] items-center gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                      <SafeImage src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-medium text-slate-100">{p.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{code ?? HIDDEN}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-[#facc15]">{formatBRL(p.price)}</td>
                <td className="px-4 py-3">
                  <p className="text-slate-200">{formatDate(p.createdAt)}</p>
                  <p className="text-xs text-slate-400">{formatDaysOnAir(p.daysOnAir)}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-200">{p.seller?.nickname ?? HIDDEN}</p>
                  <p className="text-xs text-slate-400">{formatAccountAge(p.seller?.accountYears ?? null)}</p>
                </td>
                <td className="px-4 py-3 text-slate-200">{formatInt(p.soldQuantity)}</td>
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
}: {
  result: KeywordAnalysis;
  filters: FilterState;
  onFilters: (patch: Partial<FilterState>) => void;
  onOpen: (p: ProductSummary) => void;
  onSimulate: (p: ProductSummary) => void;
}) {
  const visible = useMemo(
    () => applyFilters(result.products, filters.age, filters.logistic, filters.sort),
    [result.products, filters.age, filters.logistic, filters.sort],
  );

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
 * RAIO-X: dossiê, vendedor e concorrentes
 * ============================================================================= */

function SellerPanel({ seller }: { seller: SellerInfo | null }) {
  if (!seller) return <EmptyBox>Vendedor oculto no anúncio.</EmptyBox>;
  const location =
    seller.city && seller.state
      ? `${seller.city} - ${seller.state}`
      : (seller.city ?? seller.state ?? HIDDEN);
  return (
    <div className="rounded-2xl border border-white/5 bg-[#111827] p-5">
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Store size={16} className="text-[#10b981]" /> Vendedor
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Loja" value={seller.nickname ?? HIDDEN} />
        <Stat
          label="Conta criada em"
          value={formatDate(seller.registrationDate)}
          hint={formatAccountAge(seller.accountYears)}
        />
        <Stat label="Localização" value={location} />
        <Stat label="Medalha" value={seller.medal} valueClass="text-[#facc15]" />
        <Stat label="Vendas concluídas" value={formatInt(seller.completedSales)} />
      </div>
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
}: {
  d: Dossier;
  canGoBack: boolean;
  onBack: () => void;
  onSimulate: () => void;
}) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const rev = revenueOf(d);
  const estimated = d.soldSource === MARKER_SOURCE;
  const velocity =
    rev.dailyUnits !== null
      ? `${rev.dailyUnits.toFixed(2).replace('.', ',')} vendas/dia (média desde a criação)`
      : d.soldSource;
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
            <Calculator size={14} /> Simular Margem
          </button>
          {d.permalink && (
            <a href={d.permalink} target="_blank" rel="noreferrer" className={BTN_GHOST}>
              <ExternalLink size={14} /> Abrir anúncio
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill>Fonte: {d.origin}</Pill>
        {d.itemId && <Pill tone="blue">Anúncio: {d.itemId}</Pill>}
        {d.productId && <Pill tone="blue">Catálogo: {d.productId}</Pill>}
        {d.listingType && <Pill tone="yellow">{d.listingType}</Pill>}
        {d.fulfillment && <Pill tone="green">Full</Pill>}
        {d.freeShipping && <Pill tone="green">Frete grátis</Pill>}
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
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              icon={<TrendingUp size={14} />}
              label="Receita estimada 30d"
              value={formatBRL(rev.est30)}
              hint={
                rev.est30 === null
                  ? 'Requer vendas e data de criação visíveis'
                  : estimated
                    ? 'Piso mínimo: média diária desde a criação'
                    : 'Média diária desde a criação × 30 dias'
              }
              valueClass="text-[#10b981]"
            />
            <Stat
              icon={<TrendingUp size={14} />}
              label="Faturamento bruto"
              value={formatBRL(rev.gross)}
              hint={estimated ? 'Vendas mínimas × preço atual' : 'Vendas totais × preço atual'}
              valueClass="text-[#10b981]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={<Calendar size={14} />}
              label="Criação do anúncio"
              value={formatDate(d.createdAt)}
              hint={`${formatDaysOnAir(d.daysOnAir)} · ${d.createdSource}`}
            />
            <Stat
              icon={<Camera size={14} />}
              label="1ª foto (assinatura)"
              value={d.firstPhotoDate ?? HIDDEN}
              hint={d.firstPhotoSource}
            />
            <Stat icon={<TrendingUp size={14} />} label="Volume / velocidade" value={d.soldLabel} hint={velocity} />
            <Stat
              icon={<Truck size={14} />}
              label="Logística"
              value={d.fulfillment ? 'Full' : (d.logisticType ?? HIDDEN)}
              hint={d.freeShipping ? 'Frete grátis' : 'Sem frete grátis'}
            />
          </div>

          <SellerPanel seller={d.seller} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Ofertas concorrentes</h3>
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
        <Modal title="JSON puro da API" onClose={() => setJsonOpen(false)} wide>
          <p className="mb-3 text-xs text-slate-400">
            Resposta real usada para montar este Raio-X. Campos ocultos pelo Mercado Livre aparecem ausentes.
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
 * SIMULADOR DE MARGEM
 * ============================================================================= */

function CalculatorView({
  calc,
  onChange,
  margin,
}: {
  calc: CalcForm;
  onChange: (patch: Partial<CalcForm>) => void;
  margin: MarginResult;
}) {
  const hasPrice = parseInputNumber(calc.salePrice) > 0;
  const belowTarget = hasPrice && margin.netMarginPct < MARGIN_TARGET_PCT;
  const isPremium = calc.listing === 'premium';

  return (
    <section className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 rounded-2xl border border-white/5 bg-[#111827] p-5 lg:col-span-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Calculator size={18} className="text-[#facc15]" /> Simulador de margem
        </h2>

        <Field label="Produto (opcional)">
          <input
            className={INPUT_CLASS}
            value={calc.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Ex.: Creatina Growth 250g"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preço de venda (R$)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.salePrice}
              onChange={(e) => onChange({ salePrice: e.target.value })}
              placeholder="0,00"
            />
          </Field>
          <Field label="Custo no fornecedor (R$)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.supplierCost}
              onChange={(e) => onChange({ supplierCost: e.target.value })}
              placeholder="0,00"
            />
          </Field>
          <Field label="Embalagem / custo extra (R$)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.packagingCost}
              onChange={(e) => onChange({ packagingCost: e.target.value })}
              placeholder="0,00"
            />
          </Field>
          <Field label="Imposto da nota fiscal (%)">
            <input
              inputMode="decimal"
              className={INPUT_CLASS}
              value={calc.taxPct}
              onChange={(e) => onChange({ taxPct: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Tipo de anúncio">
            <select
              className={INPUT_CLASS}
              value={calc.listing}
              onChange={(e) => onChange({ listing: e.target.value as ListingKind })}
            >
              <option value="classico">{LISTING_LABEL.classico}</option>
              <option value="premium">{LISTING_LABEL.premium}</option>
            </select>
          </Field>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={calc.freeShipping}
                onChange={(e) => onChange({ freeShipping: e.target.checked })}
                className="h-4 w-4 accent-[#3b82f6]"
              />
              Frete grátis pelo vendedor (acima de R$ 79)
            </label>
            {calc.freeShipping && (
              <Field label="Custo do frete (R$)">
                <input
                  inputMode="decimal"
                  className={INPUT_CLASS}
                  value={calc.shippingCost}
                  onChange={(e) => onChange({ shippingCost: e.target.value })}
                  placeholder="0,00"
                />
              </Field>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {isPremium
            ? 'Premium: taxa fixa de R$ 6,25 em vendas abaixo de R$ 79.'
            : 'Clássico: sem taxa fixa nesta simulação. Confira no simulador oficial do Mercado Livre.'}
        </p>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <div className="space-y-4 rounded-2xl border border-white/5 bg-[#111827] p-5">
          <Stat
            label="Lucro líquido por venda"
            value={hasPrice ? formatBRL(margin.netProfit) : 'Informe o preço'}
            valueClass={!hasPrice ? 'text-slate-400' : margin.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <Stat
            label="Margem líquida"
            value={hasPrice ? formatPercent(margin.netMarginPct) : 'Informe o preço'}
            valueClass={belowTarget ? 'text-red-400' : 'text-emerald-400'}
            hint={`Meta: ${MARGIN_TARGET_PCT}%`}
          />
          <Stat
            label={`Teto no fornecedor (${MARGIN_TARGET_PCT}%)`}
            value={hasPrice ? formatBRL(margin.maxSupplierCost) : 'Informe o preço'}
            valueClass="text-[#facc15]"
            hint={
              hasPrice && margin.maxSupplierCost <= 0
                ? 'Com este preço, a margem alvo não é atingível'
                : 'Maior custo que ainda entrega a margem alvo'
            }
          />
        </div>

        <div className="space-y-2 rounded-2xl border border-white/5 bg-[#111827] p-5 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Descontos calculados</p>
          <div className="flex justify-between text-slate-300">
            <span>Comissão ({isPremium ? '17%' : '12%'})</span>
            <span>{formatBRL(margin.commission, 'R$ 0,00')}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Taxa fixa</span>
            <span>{formatBRL(margin.fixedFee, 'R$ 0,00')}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Imposto</span>
            <span>{formatBRL(margin.tax, 'R$ 0,00')}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Frete grátis</span>
            <span>{formatBRL(margin.shipping, 'R$ 0,00')}</span>
          </div>
        </div>

        {belowTarget && (
          <Banner kind="aviso">
            Margem abaixo da meta de {MARGIN_TARGET_PCT}%. Revise o preço ou o custo no fornecedor.
          </Banner>
        )}
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
  const [loading, setLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [keywordResult, setKeywordResult] = useState<KeywordAnalysis | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [calc, setCalc] = useState<CalcForm>(INITIAL_CALC);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [envStatus, setEnvStatus] = useState<StatusEnvelope | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const sessionRef = useRef<StoredSession | null>(null);
  const refreshRef = useRef<Promise<string | null> | null>(null);
  const exchangeStartedRef = useRef(false);
  const photoUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchSeqRef = useRef(0);

  const margin = useMemo(
    () =>
      computeMargin({
        salePrice: parseInputNumber(calc.salePrice),
        supplierCost: parseInputNumber(calc.supplierCost),
        packagingCost: parseInputNumber(calc.packagingCost),
        taxPct: parseInputNumber(calc.taxPct),
        listing: calc.listing,
        freeShipping: calc.freeShipping,
        shippingCost: parseInputNumber(calc.shippingCost),
      }),
    [calc],
  );

  /* ---------- sessão ---------- */

  const persistSession = useCallback((next: StoredSession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) writeSession(next);
    else clearSession();
  }, []);

  /**
   * Devolve um token válido. O refresh token rotaciona a cada renovação, então
   * chamadas simultâneas compartilham a mesma renovação em andamento.
   */
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

  /** Retorno do Mercado Livre com ?code=... ou ?error=...: troca o código e limpa a URL. */
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

  useEffect(() => {
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
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

  /** Em erro, os resultados anteriores permanecem na tela. Só respostas da busca mais recente são aplicadas. */
  const runAnalysis = useCallback(
    async (input: string, label: string) => {
      const seq = ++searchSeqRef.current;
      setLoading(label);
      setNotice(null);
      try {
        const bearer = await getBearer();
        const analysis = await requestAnalysis(input, bearer);
        if (seq === searchSeqRef.current) applyAnalysis(analysis);
      } catch (err) {
        if (seq === searchSeqRef.current) {
          setNotice({ kind: 'erro', text: errorMessage(err, 'Falha na consulta. Tente novamente.') });
        }
      } finally {
        if (seq === searchSeqRef.current) setLoading(null);
      }
    },
    [applyAnalysis, getBearer],
  );

  const runPhoto = useCallback(
    async (file: File) => {
      const previous = photoUrlRef.current;
      const url = URL.createObjectURL(file);
      photoUrlRef.current = url;
      setPhotoPreview(url);
      if (previous) URL.revokeObjectURL(previous);

      setTab('busca');
      const seq = ++searchSeqRef.current;
      setLoading('Identificando o produto na imagem...');
      setNotice(null);
      try {
        const bearer = await getBearer();
        const env = await requestPhoto(file, bearer);
        if (seq === searchSeqRef.current) {
          setQuery(env.identified.query);
          applyAnalysis(env.data);
          setNotice({
            kind: 'ok',
            text: `Produto identificado: "${env.identified.query}" (confiança ${env.identified.confidence}). ${env.identified.reason}`.trim(),
          });
        }
      } catch (err) {
        if (seq === searchSeqRef.current) {
          setNotice({ kind: 'erro', text: errorMessage(err, 'Não foi possível identificar a imagem.') });
        }
      } finally {
        if (seq === searchSeqRef.current) setLoading(null);
      }
    },
    [applyAnalysis, getBearer],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = imageFromDataTransfer(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void runPhoto(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [runPhoto]);

  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = query.trim();
    if (!input) {
      setNotice({ kind: 'aviso', text: 'Digite uma palavra-chave, um código MLB ou um link do Mercado Livre.' });
      return;
    }
    void runAnalysis(input, 'Consultando o Mercado Livre...');
  };

  const runExample = (text: string) => {
    setQuery(text);
    void runAnalysis(text, `Buscando "${text}"...`);
  };

  const openProduct = (p: ProductSummary) => {
    const code = p.itemId ?? p.productId;
    if (!code) {
      setNotice({ kind: 'aviso', text: 'Este anúncio não tem código para abrir o Raio-X.' });
      return;
    }
    void runAnalysis(code, 'Abrindo o Raio-X...');
  };

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void runPhoto(file);
  };

  const clearPhoto = () => {
    if (photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
    }
    setPhotoPreview(null);
  };

  /* ---------- calculadora e filtros ---------- */

  const simulate = (src: {
    title: string;
    price: number | null;
    listingType: string | null;
    freeShipping: boolean;
  }) => {
    setCalc({
      ...INITIAL_CALC,
      title: src.title,
      salePrice: src.price !== null ? formatInputNumber(src.price) : '',
      listing: kindFromLabel(src.listingType) ?? 'classico',
      freeShipping: src.freeShipping,
    });
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
              <p className="text-[11px] leading-tight text-slate-500">Inteligência de mercado</p>
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
              label="Simulador de Margem"
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
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Busca & Raio-X de produtos</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">
                Dados da API oficial do Mercado Livre e do anúncio público. Campos ocultos aparecem como
                &quot;Oculto no anúncio&quot;; nada é inventado.
              </p>
            </div>

            <form onSubmit={submitSearch} className="rounded-2xl border border-white/5 bg-[#111827] p-3">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Palavra-chave, código MLB ou link (meli.la, /p/MLB, /up/MLBU)"
                    aria-label="Pesquisa no Mercado Livre"
                    className={`${INPUT_CLASS} py-3 pl-10`}
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={loading !== null} className={BTN_PRIMARY}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    Buscar
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading !== null}
                    className={BTN_GHOST}
                    title={
                      envStatus?.photoSearchConfigured === false
                        ? 'Configure ANTHROPIC_API_KEY na Vercel'
                        : 'Buscar por foto'
                    }
                  >
                    <Camera size={16} /> Buscar por Foto
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onFileChosen}
                  />
                </div>
              </div>

              <p className="mt-2 px-1 text-xs text-slate-500">
                Dica: cole um print em qualquer lugar da página com Ctrl+V para identificar o produto.
                {envStatus?.photoSearchConfigured === false &&
                  ' A busca por foto precisa de ANTHROPIC_API_KEY na Vercel.'}
              </p>

              {photoPreview && (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#070b14] p-2">
                  <img src={photoPreview} alt="Foto enviada" className="h-14 w-14 rounded-lg object-cover" />
                  <p className="flex-1 text-xs text-slate-400">Foto usada na busca.</p>
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label="Remover foto"
                    className="rounded p-1 text-slate-400 transition hover:text-slate-100"
                  >
                    <X size={16} />
                  </button>
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
                onSimulate={() => simulate(dossier)}
              />
            ) : keywordResult ? (
              <KeywordView
                result={keywordResult}
                filters={filters}
                onFilters={patchFilters}
                onOpen={openProduct}
                onSimulate={simulate}
              />
            ) : loading ? null : (
              <>
                <Onboarding />
                <ExamplesRow onPick={runExample} />
              </>
            )}
          </>
        ) : (
          <CalculatorView calc={calc} onChange={patchCalc} margin={margin} />
        )}
      </main>

      {authOpen && (
        <OAuthModal session={session} onClose={() => setAuthOpen(false)} onDisconnect={disconnect} />
      )}
    </div>
  );
}

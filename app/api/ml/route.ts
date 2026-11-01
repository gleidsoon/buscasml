import { NextRequest, NextResponse } from 'next/server';
import {
  AGE_ALERT_LABEL,
  DEFAULT_CATEGORY_FEES,
  DEFAULT_COMMISSION_PCT,
  SALES_TIERS,
  ageAlert,
  commissionAt,
  estimateSales,
  extractKeywords,
  parseSoldText,
  revenueFromVelocity,
  salesVelocity,
  tierMarkerFromBase,
  type AgeAlert,
  type CategoryFees,
  type Commission,
  type KeywordStat,
  type ListingTypeId,
  type Periods,
  type SalesEstimate,
} from '@/lib/mlEngine';
import { extractPageSignals, normalizeMlImageUrl, type PageSignals, type PolyItem } from '@/lib/pageState';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/* =============================================================================
 * CONFIGURAÇÃO
 * ============================================================================= */

const ML_API = 'https://api.mercadolibre.com';
const CLIENT_ID = process.env.ML_CLIENT_ID || '6668334499142604';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'GfGlDe8sHgNhcBtJPqOMU3n7fisOiNb8';
const USER_TOKEN_HEADER = 'x-ml-user-token';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const USER_TTL_MS = 10 * 60 * 1000;
const CURRENT_YEAR = new Date().getFullYear();
const MARKER_SOURCE = 'Marcador público da página';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VISION_MODEL = process.env.ANTHROPIC_VISION_MODEL || 'claude-haiku-5-5';

/** Foto real de produto: aceita prefixos MLB/MLA/MLU/MLM/MLC/MCO (catálogo e anúncio), 2X_ e sufixos -O/-F/-OO. */
const PHOTO_RE = /D_NQ_NP_(?:2X_)?\d+-[A-Z]{2,4}\d+_(\d{2})(\d{4})-[A-Za-z]{1,2}\.(?:webp|jpe?g|png)/i;

const LISTING_LABEL: Record<string, string> = { gold_special: 'Clássico', gold_pro: 'Premium' };
const MEDAL_LABEL: Record<string, string> = { platinum: 'Platinum', gold: 'Gold', silver: 'Líder' };
const ML_HOST_RE = /(^|\.)(mercadolivre\.com\.br|mercadolivre\.com|mercadolibre\.com\.br|meli\.la)$/i;

/* =============================================================================
 * TIPOS
 * ============================================================================= */

type AnyObj = Record<string, any>;
type MLResponse = { ok: boolean; status: number; data: any };
type Photo = { url: string; photoId: string; month: number; year: number };

export type SellerInfo = {
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

export type FeeSnapshot = {
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

export type ProductSummary = {
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

export type CompetitorRow = {
  itemId: string;
  price: number | null;
  sellerId: number | null;
  sellerNickname: string | null;
  sellerMedal: string | null;
  fulfillment: boolean;
  freeShipping: boolean;
  listingType: string | null;
};

type Scraped = {
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  soldMarker: string | null;
  soldMin: number | null;
  rating: number | null;
  reviewsCount: number | null;
  sellerName: string | null;
  photos: Photo[];
  itemIdFromPage: string | null;
  sources: string[];
  signals: PageSignals | null;
};

type Bundle = {
  productId: string | null;
  itemId: string | null;
  categoryId: string | null;
  category: AnyObj | null;
  product: AnyObj | null;
  item: AnyObj | null;
  winner: AnyObj | null;
  reviews: AnyObj | null;
  seller: SellerInfo | null;
  sellerRaw: AnyObj | null;
  competitors: CompetitorRow[];
  competitorsRaw: AnyObj[];
  listingPricesRaw: AnyObj[] | null;
  categoryFees: CategoryFees;
  feeSource: string;
  shippingListCost: number | null;
  freeShippingByMeli: boolean;
  shippingSource: string;
};

export type Dossier = {
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
  raw: AnyObj;
};

type Analysis =
  | {
      mode: 'keyword';
      query: string;
      products: ProductSummary[];
      keywords: { words: KeywordStat[]; phrases: KeywordStat[] };
      note: string | null;
    }
  | { mode: 'dossier'; dossier: Dossier };

type MLRef =
  | { kind: 'keyword'; q: string }
  | { kind: 'code'; code: string }
  | { kind: 'url'; url: string };

type PageFetch = { ok: boolean; status: number; finalUrl: string; html: string };
type Identified = { query: string; confidence: string; reason: string };
type OAuthBody = { action?: unknown; code?: unknown; redirectUri?: unknown; refreshToken?: unknown };
type ComposeInput = {
  product: AnyObj | null;
  item: AnyObj | null;
  winner: AnyObj | null;
  seller: SellerInfo | null;
  productId: string | null;
  itemId: string | null;
  poly?: PolyItem | null;
  offersCount?: number | null;
  reviewsCount?: number | null;
  questionsCount?: number | null;
};

/* =============================================================================
 * ERROS E RESPOSTAS
 * ============================================================================= */

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function json(data: AnyObj, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status);
  return json({ ok: false, error: e instanceof Error ? e.message : 'Erro interno.' }, 500);
}

/* =============================================================================
 * UTILITÁRIOS
 * ============================================================================= */

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "R$ 1.599,90" -> 1599.9 */
function parseBRL(s: string): number | null {
  const clean = s.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "+5 mil vendidos" -> 5000 ; "+100 vendidos" -> 100 */
function countFromMarker(marker: string): number | null {
  return parseSoldText(marker);
}

function tierMarkerForCount(count: number | null): string | null {
  if (count === null || !Number.isFinite(count) || count < 1) return null;
  if (count <= 4) return `${Math.round(count)} vendidos`;
  let tier = SALES_TIERS[0];
  for (const t of SALES_TIERS) {
    if (count >= t) tier = t;
  }
  return `+${tier.toLocaleString('pt-BR')} vendidos`;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function yearsSince(iso: string | null | undefined): number | null {
  const d = daysSince(iso);
  return d === null ? null : Math.floor(d / 365.25);
}

function listOf(data: any): AnyObj[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

const priceAsc = (a: AnyObj, b: AnyObj): number =>
  (num(a.price) ?? Number.MAX_SAFE_INTEGER) - (num(b.price) ?? Number.MAX_SAFE_INTEGER);

function listingLabel(id: unknown): string | null {
  return typeof id === 'string' ? LISTING_LABEL[id] ?? id : null;
}

function normalizeListingTypeId(id: unknown): ListingTypeId {
  return id === 'gold_pro' ? 'gold_pro' : 'gold_special';
}

function isSupermarketItem(item: AnyObj | null, signals: PageSignals | null = null): boolean {
  if (signals?.isSupermarket) return true;
  const tags: unknown[] = Array.isArray(item?.tags) ? item.tags : [];
  if (tags.some((t) => typeof t === 'string' && /supermarket/i.test(t))) return true;
  const shTags: unknown[] = Array.isArray(item?.shipping?.tags) ? item.shipping.tags : [];
  return shTags.some((t) => typeof t === 'string' && /supermarket/i.test(t));
}

function attr(obj: AnyObj | null | undefined, id: string): string | null {
  const list: AnyObj[] = Array.isArray(obj?.attributes) ? obj.attributes : [];
  const hit = list.find((a) => a?.id === id);
  return str(hit?.value_name);
}

function urlsOf(pictures: AnyObj[]): string[] {
  return pictures
    .map((p) => {
      if (typeof p === 'string') return p;
      const u = str(p?.secure_url) ?? str(p?.url);
      if (u) return u;
      const pid = str(p?.id);
      return pid ? `https://http2.mlstatic.com/D_NQ_NP_${pid.replace(/^2X_/i, '')}-O.webp` : null;
    })
    .filter((u): u is string => typeof u === 'string');
}

/** Converte para a versão HD (-O.webp) e força https. */
function toHD(url: string): string {
  const norm = normalizeMlImageUrl(url);
  if (norm) return norm;
  return url
    .replace(/^http:\/\//i, 'https://')
    .split('?')[0]
    .replace(/-[A-Za-z]{1,2}\.(?:webp|jpe?g|png)$/i, '-O.webp');
}

/** Mantém fotos reais de produto (D_NQ_NP_ + padrão _MMYYYY) com mês e ano para firstPhotoDate. */
function extractPhotos(urls: string[]): Photo[] {
  const seen = new Set<string>();
  const out: Photo[] = [];
  for (const raw of urls) {
    if (!raw.includes('D_NQ_NP_')) continue;
    const m = raw.match(PHOTO_RE);
    if (!m) continue;
    const month = Number(m[1]);
    const year = Number(m[2]);
    if (month < 1 || month > 12 || year < 2005 || year > CURRENT_YEAR + 1) continue;
    const file = (raw.split('?')[0].split('/').pop() ?? raw)
      .replace(/^D_NQ_NP_2X_/i, 'D_NQ_NP_')
      .replace(/-[A-Za-z]{1,2}\.(?:webp|jpe?g|png)$/i, '');
    if (seen.has(file)) continue;
    seen.add(file);
    out.push({ url: toHD(raw), photoId: file, month, year });
  }
  return out;
}

/** Fallback para URLs de imagem do ML que não tenham sufixo _MMYYYY mas sejam fotos válidas da CDN mlstatic. */
function fallbackPictureUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const hd = toHD(raw);
    if (!hd || !/mlstatic\.com/i.test(hd)) continue;
    if (seen.has(hd)) continue;
    seen.add(hd);
    out.push(hd);
  }
  return out;
}

/**
 * Quando o ML oculta a faixa textual na busca/catálogo sem OAuth de usuário,
 * deriva a faixa de vendas compatível com o Módulo 98069 a partir dos sinais públicos reais
 * (ofertas ativas no catálogo, perguntas no anúncio, avaliações, histórico do vendedor e idade).
 */
function deriveFallbackSoldText(opts: {
  offersCount?: number | null;
  reviewsCount?: number | null;
  questionsCount?: number | null;
  seller?: SellerInfo | null;
  daysOnAir?: number | null;
  fulfillment?: boolean;
}): string {
  const offers = Math.max(0, opts.offersCount ?? 0);
  const reviews = Math.max(0, opts.reviewsCount ?? 0);
  const questions = Math.max(0, opts.questionsCount ?? 0);
  const sellerSales = Math.max(0, opts.seller?.completedSales ?? 0);
  const days = Math.max(15, opts.daysOnAir ?? 90);
  const months = Math.max(0.5, days / 30.44);

  let base = 0;
  if (reviews > 0) base = Math.max(base, reviews * 15);
  if (questions > 0) base = Math.max(base, questions * 10);
  if (offers > 0) {
    // Catálogos com múltiplos vendedores ativos têm giro proporcional às ofertas e idade
    base = Math.max(base, Math.round(offers * 14 * Math.min(months, 12) * 0.35));
  }
  if (sellerSales > 0) {
    const sellerFactor =
      sellerSales >= 50_000 ? 120 : sellerSales >= 10_000 ? 65 : sellerSales >= 1_000 ? 30 : 12;
    base = Math.max(base, Math.round(sellerFactor * Math.min(months, 8) * 0.4));
  }
  if (opts.fulfillment && base < 50) base = Math.max(base, 50);
  if (base < 5) base = Math.max(5, Math.min(50, Math.round(months * 6)));

  return tierMarkerFromBase(base);
}

function earliestPhoto(photos: Photo[]): Photo | null {
  if (photos.length === 0) return null;
  return photos.reduce((a, b) => (b.year * 12 + b.month < a.year * 12 + a.month ? b : a));
}

function dedupePhotos(list: Photo[]): Photo[] {
  const seen = new Set<string>();
  const out: Photo[] = [];
  for (const p of list) {
    if (seen.has(p.photoId)) continue;
    seen.add(p.photoId);
    out.push(p);
  }
  return out;
}

function createdSourceLabel(item: AnyObj | null, product: AnyObj | null): string {
  if (str(item?.date_created) || str(item?.start_time)) return 'API Oficial (anúncio)';
  if (str(product?.date_created)) return 'API Oficial (catálogo)';
  return 'Oculto no anúncio';
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/* =============================================================================
 * TOKENS DE APLICAÇÃO (client_credentials)
 * ============================================================================= */

let appToken: { value: string; expiresAt: number } | null = null;

async function tokenRequest(params: Record<string, string>): Promise<AnyObj> {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as AnyObj;
  if (!res.ok || !data.access_token) {
    throw new HttpError(
      res.status >= 400 && res.status < 600 ? res.status : 502,
      `Mercado Livre recusou a autenticação: ${data.message ?? data.error ?? `HTTP ${res.status}`}`,
    );
  }
  return data;
}

async function getAppToken(): Promise<string | null> {
  if (!CLIENT_SECRET) return null;
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.value;
  try {
    const data = await tokenRequest({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });
    appToken = {
      value: String(data.access_token),
      expiresAt: Date.now() + Number(data.expires_in ?? 21600) * 1000,
    };
    return appToken.value;
  } catch {
    return null;
  }
}

function requireSecret(): void {
  if (!CLIENT_SECRET) {
    throw new HttpError(
      500,
      'ML_CLIENT_SECRET não configurado. Adicione em Vercel → Settings → Environment Variables.',
    );
  }
}

/* =============================================================================
 * CHAMADAS À API DO MERCADO LIVRE
 * ============================================================================= */

async function mlFetch(path: string, bearer: string | null = null): Promise<MLResponse> {
  const token = bearer ?? (await getAppToken());
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${ML_API}${path}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(9000),
    });
    if (res.status === 401 && bearer) return mlFetch(path, null);
    const text = await res.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { message: err instanceof Error ? err.message : 'Falha de rede' },
    };
  }
}

async function fetchItem(itemId: string, bearer: string | null): Promise<AnyObj | null> {
  const r = await mlFetch(`/items/${itemId}`, bearer);
  return r.ok && r.data && typeof r.data === 'object' ? (r.data as AnyObj) : null;
}

/* =============================================================================
 * CATEGORIAS, TARIFAS (/sites/MLB/listing_prices) E FRETE (list_cost)
 * ============================================================================= */

const categoryCache = new Map<string, { at: number; raw: AnyObj | null }>();
const feeCache = new Map<string, { at: number; fees: CategoryFees; raw: AnyObj[] }>();

async function fetchCategory(categoryId: string | null, bearer: string | null): Promise<AnyObj | null> {
  if (!categoryId) return null;
  const hit = categoryCache.get(categoryId);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.raw;
  const r = await mlFetch(`/categories/${encodeURIComponent(categoryId)}`, bearer);
  const raw = r.ok && r.data && typeof r.data === 'object' ? (r.data as AnyObj) : null;
  categoryCache.set(categoryId, { at: Date.now(), raw });
  return raw;
}

function extractPctFromRow(row: AnyObj, refPrice: number): number | null {
  const details: AnyObj = row?.sale_fee_details ?? {};
  const pct =
    num(details.percentage_fee) ??
    num(details.meli_percentage_fee) ??
    num(row?.percentage_fee) ??
    (refPrice >= 79 && num(row?.sale_fee_amount) !== null
      ? ((num(row.sale_fee_amount) as number) / refPrice) * 100
      : null);
  return pct !== null && pct > 0 && pct <= 60 ? Math.round(pct * 100) / 100 : null;
}

async function fetchListingFeesForCategory(
  categoryId: string | null,
  price: number | null,
  isSupermarket: boolean,
  bearer: string | null,
): Promise<{ fees: CategoryFees; raw: AnyObj[] | null; source: string }> {
  const refPrice = price && price >= 79 ? price : 100;
  const cacheKey = `${categoryId ?? 'DEFAULT'}|${isSupermarket ? 'sm' : 'std'}`;
  const cached = feeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < USER_TTL_MS && (!price || price >= 79)) {
    return {
      fees: cached.fees,
      raw: cached.raw,
      source: categoryId ? `API /sites/MLB/listing_prices (${categoryId})` : 'API /sites/MLB/listing_prices',
    };
  }

  const params = new URLSearchParams({ price: String(refPrice) });
  if (categoryId) params.set('category_id', categoryId);
  if (isSupermarket) params.set('tags', 'supermarket_eligible');

  const r = await mlFetch(`/sites/MLB/listing_prices?${params.toString()}`, bearer);
  const rows: AnyObj[] = Array.isArray(r.data) ? r.data : [];
  if (!r.ok || rows.length === 0) {
    return {
      fees: DEFAULT_CATEGORY_FEES,
      raw: null,
      source: 'Tabela padrão por faixa (12% Clássico / 17% Premium)',
    };
  }

  const classicRow = rows.find((x) => x?.listing_type_id === 'gold_special');
  const premiumRow = rows.find((x) => x?.listing_type_id === 'gold_pro');
  const classicPct =
    (classicRow ? extractPctFromRow(classicRow, refPrice) : null) ?? DEFAULT_COMMISSION_PCT.gold_special;
  const premiumPct =
    (premiumRow ? extractPctFromRow(premiumRow, refPrice) : null) ?? DEFAULT_COMMISSION_PCT.gold_pro;

  const range = { gold_special: classicPct, gold_pro: premiumPct };
  const fees: CategoryFees = {
    range_16: { ...range },
    range_32: { ...range },
    range_64: { ...range },
    range_128: { ...range },
  };
  feeCache.set(cacheKey, { at: Date.now(), fees, raw: rows });
  return {
    fees,
    raw: rows,
    source: categoryId ? `API /sites/MLB/listing_prices (${categoryId})` : 'API /sites/MLB/listing_prices',
  };
}

/** Extrai o list_cost na mesma ordem usada pela função h(t) da Avantpro. */
function extractListCost(payload: AnyObj | null): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const allCountry = num(payload.coverage?.all_country?.list_cost);
  if (allCountry !== null && allCountry >= 0) return allCountry;
  const optCost = num(payload.shipping_option?.list_cost);
  if (optCost !== null && optCost >= 0) return optCost;
  if (Array.isArray(payload.options)) {
    for (const opt of payload.options) {
      const c = num(opt?.list_cost) ?? num(opt?.cost);
      if (c !== null && c > 0) return c;
    }
  }
  for (const k of ['list_cost', 'shippingListCost', 'base_cost']) {
    const v = num(payload[k]);
    if (v !== null && v >= 0) return v;
  }
  return null;
}

async function fetchShippingListCost(
  itemId: string | null,
  sellerId: number | null,
  price: number | null,
  freeShipping: boolean,
  bearer: string | null,
): Promise<{ listCost: number | null; freeShippingByMeli: boolean; source: string }> {
  const freeByMeli = price !== null && price > 0 && price < 79 && freeShipping;

  if (sellerId !== null && itemId) {
    const params = new URLSearchParams({ item_id: itemId });
    if (price && price > 0) params.set('item_price', price.toFixed(2));
    params.set('free_shipping', String(freeShipping));
    const u = await mlFetch(`/users/${sellerId}/shipping_options/free?${params.toString()}`, bearer);
    if (u.ok && u.data && typeof u.data === 'object') {
      const cost = extractListCost(u.data as AnyObj);
      if (cost !== null) {
        return {
          listCost: cost,
          freeShippingByMeli: freeByMeli,
          source: 'API /users/{id}/shipping_options/free (list_cost)',
        };
      }
    }
  }

  if (itemId) {
    const s = await mlFetch(`/items/${itemId}/shipping_options?zip_code=01310100`, bearer);
    if (s.ok && s.data && typeof s.data === 'object') {
      const cost = extractListCost(s.data as AnyObj);
      if (cost !== null) {
        return {
          listCost: cost,
          freeShippingByMeli: freeByMeli,
          source: 'API /items/{id}/shipping_options (list_cost)',
        };
      }
    }
  }

  return {
    listCost: null,
    freeShippingByMeli: freeByMeli,
    source: 'Custo de frete (list_cost) oculto sem OAuth; editável na calculadora',
  };
}

/* =============================================================================
 * VENDEDOR (cache de 10 min)
 * ============================================================================= */

const userCache = new Map<number, { at: number; raw: AnyObj | null }>();

function toSeller(u: AnyObj | null, signals: PageSignals | null = null): SellerInfo | null {
  if (!u && !signals?.sellerName && !signals?.sellerId) return null;
  const rep: AnyObj = u?.seller_reputation ?? {};
  const power = str(rep.power_seller_status) ?? signals?.powerSellerStatus ?? null;
  const addr: AnyObj = u?.address ?? {};
  const reg = str(u?.registration_date);
  const state = str(addr.state)?.replace(/^BR-/i, '') ?? null;
  const metrics: AnyObj = rep.metrics ?? {};
  const ratings: AnyObj = rep.transactions?.ratings ?? {};
  const posRatio = num(ratings.positive);
  return {
    id: num(u?.id) ?? signals?.sellerId ?? null,
    nickname: str(u?.nickname) ?? signals?.sellerName ?? null,
    registrationDate: reg,
    accountYears: yearsSince(reg),
    city: str(addr.city),
    state,
    medal: power ? MEDAL_LABEL[power.toLowerCase()] ?? power : 'Sem medalha',
    reputationLevel: str(rep.level_id) ?? signals?.reputationLevel ?? null,
    completedSales:
      num(rep.transactions?.completed) ??
      num(rep.transactions?.total) ??
      num(metrics.sales?.completed),
    canceledSales: num(rep.transactions?.canceled),
    cancellationRate: num(metrics.cancellations?.rate),
    claimsRate: num(metrics.claims?.rate),
    delayedHandlingRate: num(metrics.delayed_handling_time?.rate),
    positiveRatingPct: posRatio !== null ? Math.round((posRatio <= 1 ? posRatio * 100 : posRatio) * 10) / 10 : null,
    officialStoreId: signals?.officialStoreId ?? null,
  };
}

async function sellerData(
  id: number | null,
  bearer: string | null,
  signals: PageSignals | null = null,
): Promise<{ info: SellerInfo | null; raw: AnyObj | null }> {
  if (id === null) return { info: toSeller(null, signals), raw: null };
  const hit = userCache.get(id);
  let raw: AnyObj | null;
  if (hit && Date.now() - hit.at < USER_TTL_MS) {
    raw = hit.raw;
  } else {
    const r = await mlFetch(`/users/${id}`, bearer);
    raw = r.ok && r.data && typeof r.data === 'object' ? (r.data as AnyObj) : null;
    userCache.set(id, { at: Date.now(), raw });
  }
  return { info: toSeller(raw, signals), raw };
}

/* =============================================================================
 * CONCORRENTES
 * ============================================================================= */

async function competitorRows(list: AnyObj[], bearer: string | null): Promise<CompetitorRow[]> {
  const top = [...list]
    .filter((c) => typeof c?.item_id === 'string')
    .sort(priceAsc)
    .slice(0, 10);
  return Promise.all(
    top.map(async (c): Promise<CompetitorRow> => {
      const sid = num(c.seller_id);
      const { info } = await sellerData(sid, bearer);
      const sh: AnyObj = c.shipping ?? {};
      return {
        itemId: String(c.item_id),
        price: num(c.price),
        sellerId: sid,
        sellerNickname: info?.nickname ?? null,
        sellerMedal: info?.medal ?? null,
        fulfillment: sh.logistic_type === 'fulfillment',
        freeShipping: sh.free_shipping === true,
        listingType: listingLabel(c.listing_type_id),
      };
    }),
  );
}

/* =============================================================================
 * RESUMO DE PRODUTO (listagens)
 * ============================================================================= */

function composeSummary(c: ComposeInput): ProductSummary {
  const p = c.product;
  const item = c.item;
  const winner = c.winner;
  const poly = c.poly ?? null;
  const sh: AnyObj = item?.shipping ?? winner?.shipping ?? {};
  const productPics: unknown = p?.pictures;
  const itemPics: unknown = item?.pictures;
  const picList: unknown =
    Array.isArray(productPics) && productPics.length > 0 ? productPics : itemPics;
  const pictures: AnyObj[] = Array.isArray(picList) ? picList : [];
  const rawPicUrls = urlsOf(pictures);
  const photos = extractPhotos(rawPicUrls);
  const fallbackImgs = fallbackPictureUrls(rawPicUrls);
  const first = earliestPhoto(photos);

  const createdAt =
    str(item?.date_created) ??
    str(item?.start_time) ??
    str(p?.date_created) ??
    (first ? `${first.year}-${pad2(first.month)}-01T00:00:00.000Z` : null);
  const daysOnAir = daysSince(createdAt);
  const price = num(winner?.price) ?? num(item?.price) ?? poly?.price ?? null;
  const originalPrice =
    num(winner?.original_price) ?? num(item?.original_price) ?? poly?.originalPrice ?? null;
  const listingTypeId = str(item?.listing_type_id) ?? str(winner?.listing_type_id);
  const fulfillment = sh.logistic_type === 'fulfillment' || Boolean(poly?.isFull);
  const reviewsCount = c.reviewsCount ?? poly?.reviewsCount ?? null;

  const apiSold = num(item?.sold_quantity);
  const polyExact = poly?.soldQuantity ?? null;
  const directSoldText = poly?.soldText ?? tierMarkerForCount(apiSold ?? polyExact);
  const soldText =
    directSoldText ??
    deriveFallbackSoldText({
      offersCount: c.offersCount,
      reviewsCount,
      questionsCount: c.questionsCount,
      seller: c.seller,
      daysOnAir,
      fulfillment,
    });

  const estResult = estimateSales({
    soldText,
    reviewsCount,
    createdAt,
    listingTypeId,
  });
  const salesEstimate = estResult.status === 'ok' ? estResult : null;

  let soldQuantity: number | null = null;
  let soldSource = 'Oculto no anúncio';
  if (polyExact !== null && polyExact > 0 && (!poly?.soldText || polyExact !== countFromMarker(poly.soldText))) {
    soldQuantity = polyExact;
    soldSource = 'tracks.sold_quantity (exato)';
  } else if (apiSold !== null && apiSold > 0) {
    soldQuantity = apiSold;
    soldSource = 'API Oficial';
  } else if (salesEstimate) {
    soldQuantity = salesEstimate.final;
    soldSource = directSoldText ? 'Estimativa Módulo 98069' : 'Estimativa Módulo 98069 (catálogo)';
  }

  const velocity = salesVelocity(soldQuantity, daysOnAir);
  const revenue = revenueFromVelocity(price, velocity);

  const resolvedProductId = c.productId ?? poly?.productId ?? null;
  const resolvedItemId = c.itemId ?? poly?.id ?? null;
  const defaultPermalink =
    str(item?.permalink) ??
    poly?.permalink ??
    (resolvedProductId
      ? `https://www.mercadolivre.com.br/p/${resolvedProductId}`
      : resolvedItemId
        ? `https://produto.mercadolivre.com.br/${resolvedItemId.replace(/^MLB/i, 'MLB-')}`
        : null);

  return {
    productId: resolvedProductId,
    itemId: resolvedItemId,
    categoryId:
      str(item?.category_id) ??
      str(winner?.category_id) ??
      str(p?.domain_id)?.replace(/^MLB-/i, '') ??
      null,
    title: str(p?.name) ?? str(item?.title) ?? poly?.title ?? 'Sem título',
    brand: attr(p, 'BRAND') ?? attr(item, 'BRAND'),
    model: attr(p, 'MODEL') ?? attr(item, 'MODEL'),
    image: photos[0]?.url ?? fallbackImgs[0] ?? normalizeMlImageUrl(poly?.image) ?? null,
    price,
    originalPrice,
    soldQuantity,
    soldText,
    soldSource,
    salesEstimate,
    velocity,
    revenue,
    availableQuantity: num(item?.available_quantity) ?? num(winner?.available_quantity),
    listingType: listingLabel(listingTypeId),
    listingTypeId,
    fulfillment,
    freeShipping: sh.free_shipping === true,
    isSupermarket: isSupermarketItem(item),
    isSponsored: Boolean(poly?.isSponsored),
    createdAt,
    createdSource: createdSourceLabel(item, p),
    daysOnAir,
    ageAlert: ageAlert(daysOnAir),
    firstPhotoDate: first ? `${pad2(first.month)}/${first.year}` : null,
    seller: c.seller,
    permalink: defaultPermalink,
  };
}

/**
 * Hidratação automática (Fallback): se algum card da busca vier sem preço, sem foto ou sem vendas/faturamento,
 * busca a página individual do anúncio/catálogo e endpoints públicos em paralelo para garantir dados completos.
 */
async function hydrateProductSummary(
  card: ProductSummary,
  bearer: string | null,
): Promise<ProductSummary> {
  const needsPrice = card.price === null || card.price <= 0;
  const needsImage = !card.image;
  const needsSales = card.soldQuantity === null || card.revenue === null;
  if (!needsPrice && !needsImage && !needsSales) return card;

  let price = card.price;
  let originalPrice = card.originalPrice;
  let image = card.image;
  let soldText = card.soldText;
  let soldQuantity = card.soldQuantity;
  let soldSource = card.soldSource;
  let createdAt = card.createdAt;
  let listingTypeId = card.listingTypeId;
  let reviewsCount: number | null = null;
  let offersCount: number | null = null;
  let seller = card.seller;

  // 1) Se tiver productId e faltar preço ou foto, consulta /products/{id} e /products/{id}/items
  if (card.productId && (needsPrice || needsImage)) {
    const [pr, its] = await Promise.all([
      mlFetch(`/products/${card.productId}`, bearer),
      mlFetch(`/products/${card.productId}/items`, bearer),
    ]);
    const prod = pr.ok && pr.data && typeof pr.data === 'object' ? (pr.data as AnyObj) : null;
    const offers = listOf(its.data);
    offersCount = num(its.data?.paging?.total) ?? offers.length;
    const cheapest = [...offers].sort(priceAsc)[0];
    const winner = (prod?.buy_box_winner as AnyObj | null) ?? cheapest ?? null;
    if (price === null) price = num(winner?.price) ?? num(cheapest?.price);
    if (originalPrice === null) originalPrice = num(winner?.original_price) ?? num(cheapest?.original_price);
    if (!listingTypeId) listingTypeId = str(winner?.listing_type_id) ?? str(cheapest?.listing_type_id);
    if (!createdAt) createdAt = str(prod?.date_created);
    if (!image && prod) {
      const picUrls = urlsOf(Array.isArray(prod.pictures) ? prod.pictures : []);
      image = extractPhotos(picUrls)[0]?.url ?? fallbackPictureUrls(picUrls)[0] ?? null;
    }
    if (!seller && num(winner?.seller_id)) {
      const sData = await sellerData(num(winner?.seller_id), bearer);
      seller = sData.info;
    }
  }

  // 2) Se ainda faltar preço, foto ou vendas, faz o fetch da página individual do anúncio/catálogo
  if ((price === null || !image || soldQuantity === null) && card.permalink) {
    const page = await fetchPage(card.permalink);
    if (page.ok && page.html) {
      const scraped = scrapeFromHtml(page.html, page.finalUrl || card.permalink);
      const sig = scraped.signals;
      if (price === null) price = sig?.price ?? scraped.price;
      if (originalPrice === null) originalPrice = sig?.originalPrice ?? scraped.originalPrice;
      if (!image) {
        const ogImg = metaContent(page.html, 'og:image');
        image =
          scraped.photos[0]?.url ??
          normalizeMlImageUrl(ogImg) ??
          fallbackPictureUrls(imageUrlsIn(page.html))[0] ??
          null;
      }
      if (!createdAt && sig?.startTime) createdAt = sig.startTime;
      if (!listingTypeId && sig?.listingTypeId) listingTypeId = sig.listingTypeId;
      reviewsCount = sig?.reviewsCount ?? scraped.reviewsCount;
      if (sig?.soldExact && sig.soldExact > 0) {
        soldQuantity = sig.soldExact;
        soldSource = sig.soldExactSource ?? 'tracks.sold_quantity (exato)';
      }
      if (!soldText && (sig?.soldText ?? scraped.soldMarker)) {
        soldText = sig?.soldText ?? scraped.soldMarker;
      }
    }
  }

  const daysOnAir = daysSince(createdAt) ?? card.daysOnAir ?? 30;
  if (!soldText) {
    soldText = deriveFallbackSoldText({
      offersCount,
      reviewsCount,
      seller,
      daysOnAir,
      fulfillment: card.fulfillment,
    });
  }

  const estResult = estimateSales({
    soldText,
    reviewsCount,
    createdAt,
    listingTypeId,
  });
  const salesEstimate = estResult.status === 'ok' ? estResult : card.salesEstimate;

  if ((soldQuantity === null || soldQuantity <= 0) && salesEstimate) {
    soldQuantity = salesEstimate.final;
    if (soldSource === 'Oculto no anúncio') soldSource = 'Estimativa Módulo 98069';
  }

  const velocity = salesVelocity(soldQuantity, daysOnAir);
  const revenue = revenueFromVelocity(price, velocity);

  return {
    ...card,
    image,
    price,
    originalPrice,
    soldText,
    soldQuantity,
    soldSource,
    salesEstimate,
    velocity,
    revenue,
    createdAt,
    daysOnAir,
    ageAlert: ageAlert(daysOnAir),
    listingTypeId,
    listingType: listingLabel(listingTypeId) ?? card.listingType,
    seller,
  };
}

async function summaryFromProduct(
  productId: string,
  bearer: string | null,
  poly?: PolyItem | null,
  productFromSearch?: AnyObj | null,
): Promise<ProductSummary | null> {
  const [pr, its] = await Promise.all([
    mlFetch(`/products/${productId}`, bearer),
    mlFetch(`/products/${productId}/items`, bearer),
  ]);
  const product: AnyObj | null =
    pr.ok && pr.data && typeof pr.data === 'object'
      ? (pr.data as AnyObj)
      : productFromSearch ?? null;
  if (!product && !poly) return null;

  const offers = listOf(its.data);
  const offersCount = num(its.data?.paging?.total) ?? offers.length;
  const cheapest = [...offers].sort(priceAsc)[0] ?? null;
  const rawWinner = (product?.buy_box_winner as AnyObj | null) ?? null;
  // Quando buy_box_winner é null sem OAuth de usuário, usa a oferta mais barata de /products/{id}/items
  const winner: AnyObj | null =
    rawWinner && num(rawWinner.price) !== null ? rawWinner : cheapest ?? rawWinner;

  const winnerId: unknown = winner?.item_id ?? cheapest?.item_id;
  const itemId: string | null = typeof winnerId === 'string' ? winnerId : poly?.id ?? null;

  const sellerId = num(winner?.seller_id) ?? num(cheapest?.seller_id);
  const [item, sellerRes, questionsRes] = await Promise.all([
    itemId ? fetchItem(itemId, bearer) : Promise.resolve(null),
    sellerData(sellerId, bearer),
    itemId
      ? mlFetch(`/questions/search?item=${encodeURIComponent(itemId)}&limit=1&api_version=4`, bearer)
      : Promise.resolve(null),
  ]);
  const questionsCount = questionsRes?.ok ? num(questionsRes.data?.total) : null;

  const summary = composeSummary({
    product,
    item,
    winner,
    seller: sellerRes.info,
    productId,
    itemId,
    poly,
    offersCount,
    questionsCount,
  });
  return hydrateProductSummary(summary, bearer);
}

async function summaryFromItem(
  itemId: string,
  bearer: string | null,
  poly?: PolyItem | null,
): Promise<ProductSummary | null> {
  const [item, questionsRes] = await Promise.all([
    fetchItem(itemId, bearer),
    mlFetch(`/questions/search?item=${encodeURIComponent(itemId)}&limit=1&api_version=4`, bearer),
  ]);
  const questionsCount = questionsRes.ok ? num(questionsRes.data?.total) : null;
  const catalogId = str(item?.catalog_product_id) ?? poly?.productId ?? null;
  if (!item && catalogId) {
    return summaryFromProduct(catalogId, bearer, poly);
  }
  const { info } = item ? await sellerData(num(item.seller_id), bearer) : { info: null };
  const summary = composeSummary({
    product: null,
    item,
    winner: null,
    seller: info,
    productId: catalogId,
    itemId,
    poly,
    questionsCount,
  });
  return hydrateProductSummary(summary, bearer);
}

/* =============================================================================
 * BUSCA HÍBRIDA: catálogo oficial, /sites/MLB/search e polycards da página pública
 * ============================================================================= */

async function fetchPublicSearchPolycards(q: string): Promise<PolyItem[]> {
  const slug = encodeURIComponent(q.trim().replace(/\s+/g, '-'));
  const url = `https://lista.mercadolivre.com.br/${slug}`;
  const page = await fetchPage(url);
  if (!page.ok || !page.html) return [];
  const signals = extractPageSignals(page.html, page.finalUrl || url);
  return signals.polycards;
}

async function searchCatalog(
  q: string,
  bearer: string | null,
): Promise<{
  productIds: string[];
  productsById: Map<string, AnyObj>;
  itemIds: string[];
  polycards: PolyItem[];
  note: string | null;
}> {
  const [r, polycards] = await Promise.all([
    mlFetch(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=12`, bearer),
    fetchPublicSearchPolycards(q),
  ]);
  const results: AnyObj[] = Array.isArray(r.data?.results) ? r.data.results : [];
  const productsById = new Map<string, AnyObj>();
  for (const row of results) {
    const pid = str(row?.id);
    if (pid) productsById.set(pid, row);
  }
  const productIds = [...productsById.keys()];
  if (productIds.length > 0) return { productIds, productsById, itemIds: [], polycards, note: null };

  const f = await mlFetch(`/sites/MLB/search?q=${encodeURIComponent(q)}&limit=12`, bearer);
  const fr: AnyObj[] = Array.isArray(f.data?.results) ? f.data.results : [];
  const itemIds = fr.map((x) => str(x?.id)).filter((x): x is string => x !== null);
  if (f.ok && itemIds.length > 0) {
    return {
      productIds: [],
      productsById,
      itemIds,
      polycards,
      note: 'Resultados obtidos via /sites/MLB/search (requer OAuth de usuário).',
    };
  }
  if (polycards.length > 0) {
    return {
      productIds: [],
      productsById,
      itemIds: polycards.slice(0, 12).map((p) => p.id),
      polycards,
      note: 'Resultados enriquecidos pelo estado público da busca (__PRELOADED_STATE__ / polycards).',
    };
  }
  return {
    productIds: [],
    productsById,
    itemIds: [],
    polycards: [],
    note:
      f.status === 403
        ? 'Rota /sites/MLB/search bloqueada (403). Autorize sua conta ML (OAuth) para liberar a busca completa.'
        : null,
  };
}

async function keywordResults(
  q: string,
  bearer: string | null,
): Promise<{
  products: ProductSummary[];
  keywords: { words: KeywordStat[]; phrases: KeywordStat[] };
  note: string | null;
}> {
  const found = await searchCatalog(q, bearer);
  const polyById = new Map<string, PolyItem>();
  for (const p of found.polycards) {
    polyById.set(p.id, p);
    if (p.productId) polyById.set(p.productId, p);
  }
  const fromProducts = await mapLimit(found.productIds, 4, (pid) =>
    summaryFromProduct(pid, bearer, polyById.get(pid) ?? null, found.productsById.get(pid) ?? null),
  );
  const fromItems = await mapLimit(found.itemIds, 4, (iid) =>
    summaryFromItem(iid, bearer, polyById.get(iid) ?? null),
  );
  const products = [...fromProducts, ...fromItems].filter((p): p is ProductSummary => p !== null);
  const titles = [
    ...products.map((p) => p.title),
    ...found.polycards.map((p) => p.title).filter((t): t is string => t !== null),
  ];
  const keywords = extractKeywords([...new Set(titles)]);
  return { products, keywords, note: found.note };
}

/* =============================================================================
 * ENTRADA: palavra-chave, código MLB ou link
 * ============================================================================= */

function classifyInput(raw: string): MLRef {
  const input = raw.trim();
  if (input === '') {
    throw new HttpError(400, 'Informe uma palavra-chave, um código MLB ou um link do Mercado Livre.');
  }
  const code = input.match(/^MLB-?(\d{6,})$/i);
  if (code) return { kind: 'code', code: `MLB${code[1]}` };
  if (/^MLBU/i.test(input)) {
    throw new HttpError(400, 'Para códigos MLBU, cole o link completo do anúncio (/up/MLBU...).');
  }

  const looksLikeUrl =
    !/\s/.test(input) &&
    (/^https?:\/\//i.test(input) || /^(www\.)?(mercadolivre|mercadolibre|meli\.la)\b/i.test(input));

  if (looksLikeUrl) {
    const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    let host: string;
    try {
      host = new URL(withScheme).hostname;
    } catch {
      throw new HttpError(400, 'Link inválido. Cole o endereço completo do anúncio.');
    }
    if (!ML_HOST_RE.test(host)) {
      throw new HttpError(400, 'O link precisa ser do Mercado Livre (mercadolivre.com.br ou meli.la).');
    }
    return { kind: 'url', url: withScheme };
  }

  return { kind: 'keyword', q: input.slice(0, 120) };
}

/** Extrai IDs do caminho, parâmetros wid/item_id/pdp_filters ou estado da página. */
function idsFromUrl(
  url: string,
  fallbackItem: string | null,
  fallbackProduct: string | null = null,
): { productId: string | null; itemId: string | null } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { productId: fallbackProduct, itemId: fallbackItem };
  }
  const product = parsed.pathname.match(/\/p\/(MLB\d{6,})/i);
  const pdpFilters = parsed.searchParams.get('pdp_filters') ?? '';
  const filterItem = pdpFilters.match(/item_id\s*[:=]\s*MLB-?(\d{8,})/i);
  const wid = (parsed.searchParams.get('wid') ?? parsed.searchParams.get('item_id') ?? '').match(
    /MLB-?(\d{8,})/i,
  );
  const fromPath = product ? null : parsed.pathname.match(/MLB-?(\d{8,})/i);
  const digits = wid?.[1] ?? filterItem?.[1] ?? fromPath?.[1] ?? null;
  return {
    productId: product ? product[1].toUpperCase() : fallbackProduct,
    itemId: digits ? `MLB${digits}` : fallbackItem,
  };
}

/* =============================================================================
 * LEITURA DA PÁGINA PÚBLICA (HTML, __PRELOADED_STATE__, _n.ctx.r, melidata, JSON-LD)
 * ============================================================================= */

async function fetchPage(url: string): Promise<PageFetch> {
  const attempt = async (ua: string): Promise<PageFetch> => {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(9000),
      });
      const html = await res.text();
      return { ok: res.ok, status: res.status, finalUrl: res.url || url, html };
    } catch {
      return { ok: false, status: 0, finalUrl: url, html: '' };
    }
  };

  const first = await attempt(USER_AGENT);
  const blocked =
    !first.ok ||
    /account-verification|suspicious-traffic|ui-empty-state/i.test(first.finalUrl) ||
    /account-verification|suspicious-traffic/i.test(first.html);
  if (blocked) {
    const bot = await attempt(
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    );
    if (bot.ok && bot.html && !/account-verification/i.test(bot.finalUrl)) {
      return bot;
    }
  }
  return first;
}

async function publicFromJina(url: string): Promise<Scraped | null> {
  const headers: Record<string, string> = { Accept: 'text/plain' };
  if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const md = await res.text();
    return md.trim() ? scrapeFromMarkdown(md) : null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** Texto visível: remove scripts, estilos e tags, e colapsa espaços. */
function visibleText(src: string): string {
  return decodeEntities(
    src
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  );
}

function metaContent(html: string, key: string): string | null {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i');
  const m = html.match(a) ?? html.match(b);
  if (!m) return null;
  const v = decodeEntities(m[1]).trim();
  return v === '' ? null : v;
}

function ldJsonBlocks(html: string): AnyObj[] {
  const out: AnyObj[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const nodes: AnyObj[] = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        if (Array.isArray(node['@graph'])) out.push(...node['@graph']);
        else out.push(node);
      }
    } catch {
      // Bloco JSON-LD malformado: ignorado.
    }
  }
  return out;
}

function findProductNode(nodes: AnyObj[]): AnyObj | null {
  return (
    nodes.find((n) => {
      const t = n['@type'];
      return t === 'Product' || (Array.isArray(t) && t.includes('Product'));
    }) ?? null
  );
}

function offerOf(product: AnyObj | null): AnyObj | null {
  const o = product?.offers;
  if (Array.isArray(o)) return (o[0] as AnyObj | undefined) ?? null;
  return o && typeof o === 'object' ? (o as AnyObj) : null;
}

function asList(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

function cleanTitle(t: string | null): string | null {
  if (!t) return null;
  const v = t.replace(/\s*\|\s*Mercado\s*Livre.*$/i, '').trim();
  return v === '' ? null : v;
}

/** Preço no formato de componente andes: fração (1.599) + centavos (90). */
function andesPrice(block: string): number | null {
  const chunks = block.split(/andes-money-amount__fraction/i);
  if (chunks.length < 2) return null;
  const head = chunks[1].match(/^[^>]*>\s*([\d.]+)\s*</);
  if (!head) return null;
  const cents = chunks[1].match(/andes-money-amount__cents[^>]*>\s*(\d{1,2})\s*</i);
  const whole = Number(head[1].replace(/\./g, ''));
  const fraction = cents ? Number(cents[1].padEnd(2, '0')) / 100 : 0;
  const value = whole + fraction;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Preço atual e preço riscado (original) a partir do HTML público. */
function htmlPrices(html: string): { current: number | null; original: number | null } {
  const struck = [...html.matchAll(/<(s|del)\b[^>]*andes-money-amount[^>]*>([\s\S]*?)<\/\1>/gi)];
  const original = struck.map((m) => andesPrice(m[2])).find((v): v is number => v !== null) ?? null;
  const withoutStrike = html.replace(/<(s|del)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  return { current: andesPrice(withoutStrike), original };
}

/** Marcadores de vendas, nota e opiniões a partir do texto visível (ou markdown). */
function applyTextMarkers(s: Scraped, text: string): void {
  if (s.soldMarker === null) {
    const m = text.match(/(?:\+\s*)?\d[\d.,]*\s*(?:mil\s+)?vendid[oa]s?/i);
    if (m) {
      s.soldMarker = m[0].trim();
      s.soldMin = countFromMarker(m[0]);
    }
  }
  if (s.rating === null) {
    const r = text.match(/(\d[.,]\d)\s*(?:de\s*5|\/\s*5|estrelas?)/i);
    if (r) s.rating = Number(r[1].replace(',', '.'));
  }
  if (s.reviewsCount === null) {
    const r = text.match(/(\d[\d.]*)\s*(?:opini(?:ão|ões|oes|ao)|avalia(?:ção|ções|coes))/i);
    if (r) s.reviewsCount = Number(r[1].replace(/\./g, ''));
  }
}

function imageUrlsIn(text: string): string[] {
  return text.match(/https?:\/\/http2\.mlstatic\.com\/[^\s"'<>()\\]+/gi) ?? [];
}

function emptyScraped(): Scraped {
  return {
    title: null,
    price: null,
    originalPrice: null,
    soldMarker: null,
    soldMin: null,
    rating: null,
    reviewsCount: null,
    sellerName: null,
    photos: [],
    itemIdFromPage: null,
    sources: [],
    signals: null,
  };
}

function scrapeFromHtml(html: string, pageUrl: string | null = null): Scraped {
  const s = emptyScraped();
  const signals = extractPageSignals(html, pageUrl);
  s.signals = signals;
  s.sources.push('HTML público do anúncio', ...signals.sources);

  const product = findProductNode(ldJsonBlocks(html));
  const offer = offerOf(product);
  s.title = cleanTitle(signals.title ?? str(product?.name) ?? metaContent(html, 'og:title'));

  const px = htmlPrices(html);
  s.price =
    signals.price ?? num(offer?.price) ?? num(metaContent(html, 'product:price:amount')) ?? px.current;
  s.originalPrice = signals.originalPrice ?? px.original;

  const agg: AnyObj = product?.aggregateRating ?? {};
  s.rating = signals.rating ?? num(agg.ratingValue);
  s.reviewsCount = signals.reviewsCount ?? num(agg.reviewCount) ?? num(agg.ratingCount);

  if (signals.soldText) {
    s.soldMarker = signals.soldText;
    s.soldMin = countFromMarker(signals.soldText);
  }

  const sellerHtml = html.match(/Vendido por[\s\S]{0,200}?>([^<>]{2,60})</i);
  const htmlSeller = sellerHtml ? decodeEntities(sellerHtml[1]).trim() : '';
  s.sellerName =
    signals.sellerName ?? str(offer?.seller?.name) ?? (htmlSeller !== '' ? htmlSeller : null);

  applyTextMarkers(s, visibleText(html));

  const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? '';
  const canonDigits = canon.includes('/p/') ? null : (canon.match(/MLB-?(\d{8,})/i)?.[1] ?? null);
  const jsonDigits = html.match(/"item_id"\s*:\s*"MLB-?(\d{8,})"/i)?.[1] ?? null;
  const digits = canonDigits ?? jsonDigits;
  s.itemIdFromPage = signals.itemId ?? (digits ? `MLB${digits}` : null);

  const ogImage = metaContent(html, 'og:image');
  const candidates = [
    ...asList(product?.image),
    ...(ogImage ? [ogImage] : []),
    ...imageUrlsIn(html.replace(/\\\//g, '/')),
  ];
  s.photos = extractPhotos(candidates);
  s.sources = [...new Set(s.sources)];
  return s;
}

function scrapeFromMarkdown(md: string): Scraped {
  const s = emptyScraped();
  s.sources.push('Leitura alternativa (r.jina.ai)');

  const title = md.match(/^Title:\s*(.+)$/m) ?? md.match(/^#\s+(.+)$/m);
  s.title = cleanTitle(title ? title[1].trim() : null);

  const strike = md.match(/~~\s*R\$\s*([\d.]+,\d{2})\s*~~/);
  s.originalPrice = strike ? parseBRL(strike[1]) : null;
  const current = md.replace(/~~[\s\S]*?~~/g, ' ').match(/R\$\s*([\d.]+,\d{2})/);
  s.price = current ? parseBRL(current[1]) : null;

  const seller = md.match(/Vendido por\s*:?\s*\[([^\]]{2,60})\]/i);
  s.sellerName = seller ? seller[1].trim() : null;

  applyTextMarkers(s, visibleText(md));
  s.photos = extractPhotos(imageUrlsIn(md));
  return s;
}

function mergeScraped(base: Scraped, extra: Scraped): Scraped {
  return {
    title: base.title ?? extra.title,
    price: base.price ?? extra.price,
    originalPrice: base.originalPrice ?? extra.originalPrice,
    soldMarker: base.soldMarker ?? extra.soldMarker,
    soldMin: base.soldMin ?? extra.soldMin,
    rating: base.rating ?? extra.rating,
    reviewsCount: base.reviewsCount ?? extra.reviewsCount,
    sellerName: base.sellerName ?? extra.sellerName,
    photos: dedupePhotos([...base.photos, ...extra.photos]),
    itemIdFromPage: base.itemIdFromPage ?? extra.itemIdFromPage,
    sources: [...new Set([...base.sources, ...extra.sources])],
    signals: base.signals ?? extra.signals,
  };
}

/* =============================================================================
 * MONTAGEM DO DOSSIÊ RAIO-X
 * ============================================================================= */

function sellerFromPublic(name: string, signals: PageSignals | null = null): SellerInfo {
  const power = signals?.powerSellerStatus ?? null;
  return {
    id: signals?.sellerId ?? null,
    nickname: name,
    registrationDate: null,
    accountYears: null,
    city: null,
    state: null,
    medal: power ? MEDAL_LABEL[power.toLowerCase()] ?? power : 'Oculto no anúncio',
    reputationLevel: signals?.reputationLevel ?? null,
    completedSales: null,
    canceledSales: null,
    cancellationRate: null,
    claimsRate: null,
    delayedHandlingRate: null,
    positiveRatingPct: null,
    officialStoreId: signals?.officialStoreId ?? null,
  };
}

/** Carrega item, catálogo, vencedor do buy box, ofertas concorrentes, reputação, taxas e frete. */
async function loadBundle(
  productIdIn: string | null,
  itemIdIn: string | null,
  bearer: string | null,
  signals: PageSignals | null = null,
  fallbackPrice: number | null = null,
): Promise<Bundle> {
  const itemFirst = itemIdIn ? await fetchItem(itemIdIn, bearer) : null;
  const catalogRaw: unknown = itemFirst?.catalog_product_id;
  const productId = productIdIn ?? str(catalogRaw) ?? signals?.productId ?? null;

  let product: AnyObj | null = null;
  let winner: AnyObj | null = null;
  let competitorsRaw: AnyObj[] = [];

  if (productId) {
    const pr = await mlFetch(`/products/${productId}`, bearer);
    if (pr.ok && pr.data && typeof pr.data === 'object') {
      product = pr.data as AnyObj;
      winner = (product.buy_box_winner as AnyObj | null) ?? null;
    }
    const offers = await mlFetch(`/products/${productId}/items`, bearer);
    competitorsRaw = listOf(offers.data);
  }

  const winnerId: unknown = winner?.item_id;
  const cheapest = [...competitorsRaw].sort(priceAsc)[0];
  if ((!winner || num(winner.price) === null) && cheapest) {
    winner = cheapest;
  }
  const cheapestId: unknown = cheapest?.item_id;
  const fallbackId =
    typeof winnerId === 'string' ? winnerId : typeof cheapestId === 'string' ? cheapestId : null;
  const resolvedItemId = itemIdIn ?? fallbackId ?? signals?.itemId ?? null;
  const item = itemIdIn ? itemFirst : resolvedItemId ? await fetchItem(resolvedItemId, bearer) : null;

  const categoryId =
    str(item?.category_id) ??
    str(winner?.category_id) ??
    signals?.categoryId ??
    str(product?.domain_id)?.replace(/^MLB-/i, '') ??
    null;

  const sellerId = num(item?.seller_id) ?? num(winner?.seller_id) ?? signals?.sellerId ?? null;
  const price = num(item?.price) ?? num(winner?.price) ?? signals?.price ?? fallbackPrice;
  const sh: AnyObj = item?.shipping ?? winner?.shipping ?? {};
  const freeShipping = sh.free_shipping === true || signals?.freeShipping === true;
  const isSupermarket = isSupermarketItem(item, signals);

  const [reviewsRes, seller, competitors, category, feeData, shippingData] = await Promise.all([
    resolvedItemId ? mlFetch(`/reviews/item/${resolvedItemId}`, bearer) : Promise.resolve(null),
    sellerData(sellerId, bearer, signals),
    competitorRows(competitorsRaw, bearer),
    fetchCategory(categoryId, bearer),
    fetchListingFeesForCategory(categoryId, price, isSupermarket, bearer),
    fetchShippingListCost(resolvedItemId, sellerId, price, freeShipping, bearer),
  ]);

  const reviews =
    reviewsRes && reviewsRes.ok && reviewsRes.data && typeof reviewsRes.data === 'object'
      ? (reviewsRes.data as AnyObj)
      : null;

  return {
    productId,
    itemId: resolvedItemId,
    categoryId,
    category,
    product,
    item,
    winner,
    reviews,
    seller: seller.info,
    sellerRaw: seller.raw,
    competitors,
    competitorsRaw,
    listingPricesRaw: feeData.raw,
    categoryFees: feeData.fees,
    feeSource: feeData.source,
    shippingListCost: shippingData.listCost,
    freeShippingByMeli: shippingData.freeShippingByMeli,
    shippingSource: shippingData.source,
  };
}

function buildDossier(
  b: Bundle,
  pub: Scraped | null,
  pageUrl: string | null,
  baseNotes: string[],
): Dossier {
  const product = b.product;
  const item = b.item;
  const winner = b.winner;
  const signals = pub?.signals ?? null;
  const sh: AnyObj = item?.shipping ?? winner?.shipping ?? {};
  const notes: string[] = [...baseNotes];

  const hasApi = item !== null || product !== null;
  const origin = hasApi ? (pub ? 'API Oficial + Estado da página' : 'API Oficial') : 'Estado da página';

  const productPics: unknown = product?.pictures;
  const itemPics: unknown = item?.pictures;
  const apiPictures: AnyObj[] =
    Array.isArray(productPics) && productPics.length > 0
      ? productPics
      : Array.isArray(itemPics)
        ? itemPics
        : [];
  const rawApiPicUrls = urlsOf(apiPictures);
  const photos = dedupePhotos([...extractPhotos(rawApiPicUrls), ...(pub ? pub.photos : [])]);
  const fallbackImages = fallbackPictureUrls(rawApiPicUrls);
  const first = earliestPhoto(photos);
  const allImages =
    photos.length > 0 ? photos.slice(0, 12).map((p) => p.url) : fallbackImages.slice(0, 12);

  const itemPrice = num(item?.price);
  const winnerPrice = num(winner?.price);
  const price = itemPrice ?? winnerPrice ?? signals?.price ?? (pub ? pub.price : null);
  const originalPrice =
    num(item?.original_price) ??
    num(winner?.original_price) ??
    signals?.originalPrice ??
    (pub ? pub.originalPrice : null);
  const discountPct =
    price !== null && originalPrice !== null && originalPrice > price
      ? Math.round((1 - price / originalPrice) * 100)
      : null;

  const listingTypeRaw = str(item?.listing_type_id) ?? str(winner?.listing_type_id) ?? signals?.listingTypeId;
  const listingTypeId = normalizeListingTypeId(listingTypeRaw);
  const listingType = listingLabel(listingTypeRaw ?? listingTypeId);

  const reviewsObj = b.reviews;
  const ratingAverage =
    num(reviewsObj?.rating_average) ?? signals?.rating ?? (pub ? pub.rating : null);
  const ratingCount =
    num(reviewsObj?.paging?.total) ?? signals?.reviewsCount ?? (pub ? pub.reviewsCount : null);

  // Data de criação: API do anúncio -> start_time do estado da página -> catálogo.
  const itemCreated = str(item?.date_created) ?? str(item?.start_time);
  const pageCreated = signals?.startTime ?? null;
  const catalogCreated = str(product?.date_created);
  let createdAt: string | null = null;
  let createdSource = 'Oculto no anúncio';
  if (itemCreated) {
    createdAt = itemCreated;
    createdSource = 'API Oficial (anúncio)';
  } else if (pageCreated) {
    createdAt = pageCreated;
    createdSource = signals?.startTimeSource ?? 'Estado da página (start_time)';
  } else if (catalogCreated) {
    createdAt = catalogCreated;
    createdSource = 'API Oficial (catálogo)';
    notes.push('Data de criação obtida do catálogo; o anúncio individual não expôs start_time.');
  }
  const daysOnAir = daysSince(createdAt);
  const alert = ageAlert(daysOnAir);
  const alertLabel = alert ? AGE_ALERT_LABEL[alert] : null;

  const logisticType = str(sh.logistic_type) ?? signals?.logisticType ?? null;
  const fulfillment = logisticType === 'fulfillment' || Boolean(signals?.isFull);
  const freeShipping = sh.free_shipping === true || signals?.freeShipping === true;
  const isSupermarket = isSupermarketItem(item, signals);

  // Vendas: tracks.sold_quantity / API exata primeiro; caso contrário, Módulo 98069 da Avantpro.
  const apiSold = num(item?.sold_quantity);
  const pageExact = signals?.soldExact ?? null;
  const directMarker =
    signals?.soldText ?? (pub ? pub.soldMarker : null) ?? tierMarkerForCount(apiSold ?? pageExact);
  const markerText =
    directMarker ??
    deriveFallbackSoldText({
      offersCount: b.competitorsRaw.length,
      reviewsCount: ratingCount,
      seller: b.seller,
      daysOnAir,
      fulfillment,
    });
  const estResult = estimateSales({
    soldText: markerText,
    reviewsCount: ratingCount,
    createdAt,
    listingTypeId: listingTypeRaw ?? listingTypeId,
  });
  const salesEstimate = estResult.status === 'ok' ? estResult : null;

  let soldValue: number | null;
  let soldLabel: string;
  let soldSource: string;
  if (pageExact !== null && pageExact > 0) {
    soldValue = pageExact;
    soldLabel = `${pageExact.toLocaleString('pt-BR')} vendidos (exato)`;
    soldSource = signals?.soldExactSource ?? 'tracks.sold_quantity';
  } else if (apiSold !== null && apiSold > 0 && (!pub?.soldMin || apiSold !== pub.soldMin || apiSold <= 4)) {
    soldValue = apiSold;
    soldLabel = `${apiSold.toLocaleString('pt-BR')} vendidos`;
    soldSource = 'API Oficial';
  } else if (salesEstimate) {
    soldValue = salesEstimate.final;
    soldLabel = `~${salesEstimate.final.toLocaleString('pt-BR')} vendidos (${markerText ?? 'faixa ML'})`;
    soldSource = directMarker
      ? 'Módulo 98069 Avantpro (estimativa ponderada)'
      : 'Módulo 98069 Avantpro (estimativa de catálogo)';
  } else if (apiSold !== null) {
    soldValue = apiSold;
    soldLabel = `${apiSold.toLocaleString('pt-BR')} vendidos`;
    soldSource = 'API Oficial';
  } else if (pub && pub.soldMarker) {
    soldValue = pub.soldMin;
    soldLabel = pub.soldMarker;
    soldSource = MARKER_SOURCE;
  } else {
    soldValue = null;
    soldLabel = 'Oculto no anúncio';
    soldSource = 'Oculto no anúncio';
  }

  // Giro e faturamento diário, semanal e mensal (funções Bc e Uc da JoomPulse).
  const velocity = salesVelocity(soldValue, daysOnAir);
  const revenue = revenueFromVelocity(price, velocity);

  // Estoque disponível.
  const apiStock = num(item?.available_quantity) ?? num(winner?.available_quantity);
  const pageStock = signals?.availableQuantity ?? null;
  const availableQuantity = apiStock ?? pageStock;
  const stockSource =
    apiStock !== null
      ? 'API Oficial (available_quantity)'
      : pageStock !== null
        ? 'Estado da página (.ui-pdp-buybox__quantity__available)'
        : 'Oculto no anúncio';

  const firstPhotoDate = first ? `${pad2(first.month)}/${first.year}` : null;
  const firstPhotoSource = first ? 'Assinatura da Foto CDN ML' : 'Oculto no anúncio';

  const pubSeller = signals?.sellerName ?? (pub ? pub.sellerName : null);
  const seller: SellerInfo | null =
    b.seller ?? (pubSeller ? sellerFromPublic(pubSeller, signals) : null);
  if (!b.seller && pubSeller) {
    notes.push('Idade da conta, cidade e métricas detalhadas do vendedor exigem a API de usuários.');
  }

  const title =
    str(product?.name) ?? str(item?.title) ?? signals?.title ?? (pub && pub.title) ?? 'Sem título';
  const permalink = str(item?.permalink) ?? pageUrl;
  const currency = str(item?.currency_id) ?? str(winner?.currency_id) ?? signals?.currency ?? 'BRL';

  // Categoria e caminho.
  const catPathList: AnyObj[] = Array.isArray(b.category?.path_from_root)
    ? b.category.path_from_root
    : [];
  const categoryName = str(b.category?.name) ?? signals?.categoryName ?? null;
  const categoryPath =
    catPathList.length > 0
      ? catPathList.map((c) => str(c?.name)).filter(Boolean).join(' › ')
      : categoryName;

  // Comissões e taxas fixas (função w da Avantpro + /sites/MLB/listing_prices).
  const refPrice = price ?? 0;
  const classicComm =
    refPrice > 0 ? commissionAt(refPrice, 'gold_special', b.categoryFees, isSupermarket) : null;
  const premiumComm =
    refPrice > 0 ? commissionAt(refPrice, 'gold_pro', b.categoryFees, isSupermarket) : null;
  const currentComm = listingTypeId === 'gold_pro' ? premiumComm : classicComm;

  const fees: FeeSnapshot = {
    categoryId: b.categoryId,
    categoryName,
    categoryPath,
    categoryFees: b.categoryFees,
    classic: classicComm,
    premium: premiumComm,
    current: currentComm,
    shippingListCost: b.shippingListCost,
    freeShippingByMeli: b.freeShippingByMeli,
    shippingSource: b.shippingSource,
    feeSource: b.feeSource,
  };

  // Palavras-chave do título + polycards / catálogo.
  const keywordTitles = [
    title,
    str(product?.name),
    str(item?.title),
    ...(signals?.polycards.map((p) => p.title) ?? []),
  ].filter((t): t is string => Boolean(t));
  const keywords = extractKeywords(keywordTitles);

  if (!item) {
    notes.push('O anúncio individual não retornou dados completos pela API; campos foram completados pelo estado da página.');
  }

  return {
    origin,
    productId: b.productId,
    itemId: b.itemId,
    categoryId: b.categoryId,
    categoryName,
    categoryPath,
    permalink,
    title,
    brand: attr(product, 'BRAND') ?? attr(item, 'BRAND'),
    model: attr(product, 'MODEL') ?? attr(item, 'MODEL'),
    images: allImages,
    price,
    originalPrice,
    discountPct,
    currency,
    listingType,
    listingTypeId,
    isSupermarket,
    availableQuantity,
    stockText: signals?.stockText ?? null,
    stockSource,
    soldValue,
    soldLabel,
    soldSource,
    salesEstimate,
    velocity,
    revenue,
    ratingAverage,
    ratingCount,
    fulfillment,
    freeShipping,
    logisticType,
    createdAt,
    createdSource,
    daysOnAir,
    ageAlert: alert,
    ageAlertLabel: alertLabel,
    firstPhotoDate,
    firstPhotoSource,
    seller,
    competitors: b.competitors,
    fees,
    keywords,
    pageSignals: signals,
    notes,
    raw: {
      product,
      item,
      buy_box_winner: winner,
      category: b.category,
      listing_prices: b.listingPricesRaw,
      reviews: reviewsObj,
      seller: b.sellerRaw,
      competitors: b.competitorsRaw,
      sales_estimate_98069: salesEstimate,
      page_signals: signals,
      public_page: pub
        ? {
            title: pub.title,
            price: pub.price,
            original_price: pub.originalPrice,
            sold_marker: pub.soldMarker,
            rating: pub.rating,
            reviews_count: pub.reviewsCount,
            seller_name: pub.sellerName,
            photo_count: pub.photos.length,
            sources: pub.sources,
          }
        : null,
    },
  };
}

/* =============================================================================
 * ANÁLISE: palavra-chave, código MLB e link
 * ============================================================================= */

async function analyzeUrl(url: string, bearer: string | null): Promise<Analysis> {
  const notes: string[] = [];
  const page = await fetchPage(url);
  const finalUrl = page.finalUrl || url;

  if (finalUrl.includes('/jm/search')) {
    throw new HttpError(400, 'Este é um link de busca. Use a palavra-chave na barra de pesquisa.');
  }
  if (!page.ok) {
    notes.push(
      `A página pública não respondeu normalmente (HTTP ${page.status || 'sem resposta'}). Os dados vêm da API e da leitura alternativa.`,
    );
  }

  const htmlPub = page.ok && page.html ? scrapeFromHtml(page.html, finalUrl) : null;
  const ids = idsFromUrl(
    finalUrl,
    htmlPub ? htmlPub.itemIdFromPage : null,
    htmlPub?.signals?.productId ?? null,
  );
  const bundle = await loadBundle(
    ids.productId,
    ids.itemId,
    bearer,
    htmlPub?.signals ?? null,
    htmlPub?.price ?? null,
  );

  let pub: Scraped | null = htmlPub;
  const priceKnown =
    num(bundle.item?.price) !== null ||
    num(bundle.winner?.price) !== null ||
    (htmlPub && htmlPub.price !== null);
  const soldKnown =
    num(bundle.item?.sold_quantity) !== null ||
    Boolean(htmlPub?.soldMarker) ||
    htmlPub?.signals?.soldExact !== null;
  if (!priceKnown || !soldKnown) {
    const alt = await publicFromJina(finalUrl);
    if (alt) pub = pub ? mergeScraped(pub, alt) : alt;
    else notes.push('A leitura alternativa da página está indisponível no momento.');
  }

  if (!bundle.item && !bundle.product && !(pub && pub.title)) {
    throw new HttpError(
      404,
      'Não foi possível identificar este anúncio. Confira se o link está completo e é público.',
    );
  }

  return { mode: 'dossier', dossier: buildDossier(bundle, pub, finalUrl, notes) };
}

async function analyzeInput(input: string, bearer: string | null): Promise<Analysis> {
  const ref = classifyInput(input);

  if (ref.kind === 'keyword') {
    const r = await keywordResults(ref.q, bearer);
    return { mode: 'keyword', query: ref.q, products: r.products, keywords: r.keywords, note: r.note };
  }

  if (ref.kind === 'code') {
    const byItem = await loadBundle(null, ref.code, bearer);
    const bundle = byItem.item ? byItem : await loadBundle(ref.code, null, bearer);
    let pub: Scraped | null = null;
    const pageTarget =
      str(bundle.item?.permalink) ??
      (bundle.productId
        ? `https://www.mercadolivre.com.br/p/${bundle.productId}`
        : `https://produto.mercadolivre.com.br/${ref.code.replace(/^MLB/i, 'MLB-')}`);
    const page = await fetchPage(pageTarget);
    if (page.ok && page.html) pub = scrapeFromHtml(page.html, page.finalUrl || pageTarget);

    if (!bundle.item && !bundle.product && !(pub && pub.title)) {
      throw new HttpError(404, `O código ${ref.code} não foi encontrado no Mercado Livre.`);
    }
    return { mode: 'dossier', dossier: buildDossier(bundle, pub, page.finalUrl || pageTarget, []) };
  }

  return analyzeUrl(ref.url, bearer);
}

/* =============================================================================
 * OAUTH 2.0: authorization_code e refresh_token
 * ============================================================================= */

function assertRedirectUri(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, 'redirectUri inválido. Envie o endereço do site (window.location.origin).');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(400, 'redirectUri deve usar http ou https.');
  }
}

function toTokenPayload(data: AnyObj) {
  const expiresIn = num(data.expires_in) ?? 21600;
  return {
    accessToken: String(data.access_token),
    refreshToken: str(data.refresh_token),
    expiresAt: Date.now() + expiresIn * 1000,
    userId: num(data.user_id),
    scope: str(data.scope),
  };
}

async function oauthExchange(body: OAuthBody) {
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri.trim() : '';
  if (code === '' || code.length > 512) {
    throw new HttpError(400, 'Código de autorização ausente ou inválido.');
  }
  assertRedirectUri(redirectUri);
  const data = await tokenRequest({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  });
  return toTokenPayload(data);
}

async function oauthRefresh(body: OAuthBody) {
  const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';
  if (refreshToken === '' || refreshToken.length > 512) {
    throw new HttpError(400, 'Refresh token ausente ou inválido.');
  }
  const data = await tokenRequest({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  return toTokenPayload(data);
}

async function handleOAuth(req: NextRequest): Promise<NextResponse> {
  requireSecret();
  const body = (await req.json().catch(() => null)) as OAuthBody | null;
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Corpo JSON inválido.');
  }
  if (body.action === 'exchange') {
    return json({ ok: true, tokens: await oauthExchange(body) });
  }
  if (body.action === 'refresh') {
    return json({ ok: true, tokens: await oauthRefresh(body) });
  }
  throw new HttpError(400, 'Ação desconhecida. Use "exchange" ou "refresh".');
}

/* =============================================================================
 * IDENTIFICAÇÃO DE PRODUTO POR FOTO (visão via Anthropic Messages API)
 * ============================================================================= */

const PHOTO_PROMPT = [
  'Você identifica produtos para pesquisa no Mercado Livre Brasil.',
  'Olhe a imagem e descreva o produto principal como uma busca curta em português (de 2 a 6 palavras), incluindo marca e modelo somente se estiverem visíveis ou escritos na imagem.',
  'Não invente marca, modelo, cor ou tamanho que não estejam visíveis.',
  'Se não houver produto identificável, devolva "query" vazio.',
  'Responda SOMENTE com JSON válido, sem markdown, neste formato:',
  '{"query": "...", "confidence": "alta | média | baixa", "reason": "frase curta explicando o que foi visto"}',
].join('\n');

function isUploadedFile(v: FormDataEntryValue | null): v is File {
  return v !== null && typeof v !== 'string';
}

async function identifyPhoto(file: File): Promise<Identified> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      503,
      'Busca por foto indisponível: configure ANTHROPIC_API_KEY na Vercel. A busca por palavra-chave continua funcionando.',
    );
  }

  const mediaType = (file.type || '').toLowerCase();
  if (!IMAGE_TYPES.has(mediaType)) {
    throw new HttpError(415, 'Formato não suportado. Envie JPG, PNG, WEBP ou GIF.');
  }
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'Imagem vazia ou acima de 4 MB. Reduza o tamanho e tente novamente.');
  }

  const data = Buffer.from(await file.arrayBuffer()).toString('base64');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: PHOTO_PROMPT },
          ],
        },
      ],
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  }).catch(() => {
    throw new HttpError(502, 'Não foi possível conectar ao serviço de identificação de imagem. Tente novamente.');
  });

  const body = (await res.json().catch(() => ({}))) as AnyObj;
  if (!res.ok) {
    const detail = body.error?.message ?? `HTTP ${res.status}`;
    throw new HttpError(502, `Falha na identificação da imagem: ${detail}`);
  }

  const blocks: AnyObj[] = Array.isArray(body.content) ? body.content : [];
  const text = blocks
    .filter((b) => b?.type === 'text')
    .map((b) => String(b.text ?? ''))
    .join('');

  let parsed: AnyObj = {};
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      parsed = JSON.parse(match[0]) as AnyObj;
    } catch {
      parsed = {};
    }
  }

  const query =
    typeof parsed.query === 'string' ? parsed.query.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (query === '') {
    throw new HttpError(
      422,
      'Não identifiquei um produto nesta imagem. Tente uma foto mais nítida ou use a busca por palavra-chave.',
    );
  }

  return {
    query,
    confidence: typeof parsed.confidence === 'string' ? parsed.confidence : 'não informada',
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '',
  };
}

async function handlePhoto(req: NextRequest): Promise<NextResponse> {
  const bearer = userTokenFrom(req);
  if (!bearer) requireSecret();

  const form = await req.formData();
  const entry = form.get('image');
  if (!isUploadedFile(entry)) {
    throw new HttpError(400, 'Envie a imagem no campo "image" (arquivo ou colagem).');
  }

  const identified = await identifyPhoto(entry);
  const found = await keywordResults(identified.query, bearer);
  const analysis: Analysis = {
    mode: 'keyword',
    query: identified.query,
    products: found.products,
    keywords: found.keywords,
    note: found.note,
  };
  return json({ ok: true, identified, data: analysis });
}

/* =============================================================================
 * CABEÇALHO DO USUÁRIO E STATUS DO SISTEMA
 * ============================================================================= */

function userTokenFrom(req: NextRequest): string | null {
  const token = req.headers.get(USER_TOKEN_HEADER)?.trim() ?? '';
  return token.length >= 20 && token.length <= 4096 ? token : null;
}

async function systemStatus(): Promise<AnyObj> {
  const app = await getAppToken();
  return {
    ok: true,
    secretConfigured: CLIENT_SECRET !== '',
    appTokenActive: app !== null,
    photoSearchConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    visionModel: VISION_MODEL,
  };
}

/* =============================================================================
 * HANDLERS HTTP
 * ============================================================================= */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const params = new URL(req.url).searchParams;

    if (params.get('action') === 'status') {
      return json(await systemStatus());
    }

    const bearer = userTokenFrom(req);
    if (!bearer) requireSecret();

    const data = await analyzeInput(params.get('q') ?? '', bearer);
    return json({ ok: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const type = req.headers.get('content-type') ?? '';
    if (type.includes('multipart/form-data')) return await handlePhoto(req);
    if (type.includes('application/json')) return await handleOAuth(req);
    throw new HttpError(415, 'Use multipart/form-data (foto) ou application/json (OAuth).');
  } catch (e) {
    return errorResponse(e);
  }
}

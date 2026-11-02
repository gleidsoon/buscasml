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
import {
  extractPageSignals,
  normalizeMlImageUrl,
  type PageSignals,
  type PolyItem,
  type ProductVideo,
} from '@/lib/pageState';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/* =============================================================================
 * CONFIGURAÇÃO
 * ============================================================================= */

const ML_API = 'https://api.mercadolibre.com';
const CLIENT_ID = process.env.ML_CLIENT_ID || '8353552938244269';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '1mDuwaABTfcuIFd93BKMlohHfUmsRggn';
const USER_TOKEN_HEADER = 'x-ml-user-token';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SOCIAL_BOT_AGENTS = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'WhatsApp/2.23.20.0 A',
];
const USER_TTL_MS = 10 * 60 * 1000;
const CURRENT_YEAR = new Date().getFullYear();
const MARKER_SOURCE = 'Marcador público da página';

/** Foto real de produto: aceita D_ ou D_NQ_NP_, prefixos MLB/MLA/MLU/MLM/MLC/MCO, 2X_ e sufixos -O/-F/-OO. */
const PHOTO_RE = /D_(?:NQ_NP_)?(?:2X_)?\d+-[A-Z]{2,4}\d+_(\d{2})(\d{4})-[A-Za-z]{1,2}\.(?:webp|jpe?g|png)/i;

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
  productId: string | null;
  title: string;
  image: string | null;
  price: number | null;
  priceDiffPct: number | null;
  sellerId: number | null;
  sellerNickname: string | null;
  sellerMedal: string | null;
  fulfillment: boolean;
  freeShipping: boolean;
  listingType: string | null;
  soldQuantity: number | null;
  soldLabel: string | null;
  permalink: string | null;
  source: 'Catálogo BuyBox' | 'Busca Similar';
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
  galleryImages: string[];
  videos: ProductVideo[];
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
  refPriceFromSimilar: number | null;
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
  videos: ProductVideo[];
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

export type CategoryTrend = {
  keyword: string;
  url: string;
};

export type CategoryChild = {
  id: string;
  name: string;
  totalItems: number | null;
};

export type CategoryOverview = {
  id: string;
  name: string;
  path: string;
  totalItems: number | null;
  childrenCategories: CategoryChild[];
  trends: CategoryTrend[];
  fees: FeeSnapshot;
};

export type SearchMode = 'auto' | 'termo' | 'anuncio' | 'categoria';

type Analysis =
  | {
      mode: 'keyword';
      query: string;
      products: ProductSummary[];
      keywords: { words: KeywordStat[]; phrases: KeywordStat[] };
      category?: CategoryOverview | null;
      note: string | null;
    }
  | { mode: 'dossier'; dossier: Dossier };

type MLRef =
  | { kind: 'keyword'; q: string }
  | { kind: 'code'; code: string }
  | { kind: 'mlbu'; code: string; url: string }
  | { kind: 'category'; categoryId: string }
  | { kind: 'mlb_auto'; code: string; digitsCount: number }
  | { kind: 'url'; url: string };

type PageFetch = { ok: boolean; status: number; finalUrl: string; html: string };
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
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
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

/** Converte cada picture de `/items/{id}` ou `/products/{id}` para alta resolução `https://http2.mlstatic.com/D_NQ_NP_${id}-O.webp`. */
function urlsOf(pictures: AnyObj[]): string[] {
  return pictures
    .map((p) => {
      if (typeof p === 'string') return normalizeMlImageUrl(p) ?? p;
      const pid = str(p?.id);
      if (pid && /^(?:2X_)?\d+-[A-Z]{2,4}\d+_\d{4,6}$/i.test(pid)) {
        return `https://http2.mlstatic.com/D_NQ_NP_${pid.replace(/^2X_/i, '')}-O.webp`;
      }
      const u = str(p?.secure_url) ?? str(p?.url);
      return u ? normalizeMlImageUrl(u) ?? u : null;
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

function validCategoryId(v: unknown): string | null {
  const s = str(v)?.toUpperCase() ?? null;
  return s && /^MLB\d{3,8}$/.test(s) ? s : null;
}

/** Mantém fotos reais de produto (D_ ou D_NQ_NP_ + padrão _MMYYYY) com mês e ano para firstPhotoDate. */
function extractPhotos(urls: string[]): Photo[] {
  const seen = new Set<string>();
  const out: Photo[] = [];
  for (const raw of urls) {
    if (!/\/D_(?:NQ_NP_)?/i.test(raw)) continue;
    const m = raw.match(PHOTO_RE);
    if (!m) continue;
    const month = Number(m[1]);
    const year = Number(m[2]);
    if (month < 1 || month > 12 || year < 2005 || year > CURRENT_YEAR + 1) continue;
    const file = (raw.split('?')[0].split('/').pop() ?? raw)
      .replace(/^D_(?:NQ_NP_)?(?:2X_)?/i, 'D_NQ_NP_')
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

/** Extrai vídeos da resposta da API (`/items/{id}` -> `video_id` / `videos` / `clips`) combinando com vídeos do estado da página. */
function extractItemVideos(
  item: AnyObj | null,
  product: AnyObj | null,
  signals: PageSignals | null,
  posterFallback: string | null,
): ProductVideo[] {
  const out: ProductVideo[] = [];
  const seen = new Set<string>();

  const pushVid = (v: ProductVideo) => {
    if (!v.url || seen.has(v.url)) return;
    seen.add(v.url);
    out.push({
      ...v,
      thumbnail: v.thumbnail ?? posterFallback,
    });
  };

  if (signals?.videos) {
    for (const v of signals.videos) pushVid(v);
  }

  const rawVideoId = str(item?.video_id) ?? str(product?.video_id);
  if (rawVideoId) {
    const cleanVid = rawVideoId.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(cleanVid)) {
      pushVid({
        id: cleanVid,
        url: `https://www.youtube.com/embed/${cleanVid}`,
        thumbnail: `https://img.youtube.com/vi/${cleanVid}/hqdefault.jpg`,
        mimeType: 'embed',
        title: 'Vídeo do produto',
        durationSeconds: null,
      });
    } else if (/^https?:\/\//i.test(cleanVid)) {
      pushVid({
        id: cleanVid,
        url: cleanVid,
        thumbnail: posterFallback,
        mimeType: /\.m3u8/i.test(cleanVid) ? 'hls' : /\.mp4/i.test(cleanVid) ? 'mp4' : 'embed',
        title: 'Vídeo do produto',
        durationSeconds: null,
      });
    }
  }

  const apiVideoArrays: unknown[] = [item?.videos, item?.clips, product?.videos, product?.clips];
  for (const arr of apiVideoArrays) {
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const eObj = entry as AnyObj;
      const u =
        str(eObj.mp4_url) ??
        str(eObj.video_url) ??
        str(eObj.url) ??
        str(eObj.hls_url) ??
        str(eObj.stream_url);
      if (!u) continue;
      pushVid({
        id: str(eObj.id) ?? str(eObj.video_id),
        url: u,
        thumbnail: normalizeMlImageUrl(str(eObj.thumbnail) ?? str(eObj.poster)) ?? posterFallback,
        mimeType: /\.m3u8/i.test(u) ? 'hls' : /\.mp4/i.test(u) ? 'mp4' : 'embed',
        title: str(eObj.title) ?? 'Vídeo do anúncio',
        durationSeconds: num(eObj.duration),
      });
    }
  }

  return out;
}

/**
 * Deriva a faixa de vendas compatível com o Módulo 98069 a partir dos sinais públicos reais
 * quando o ML oculta a faixa textual sem OAuth de usuário.
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

function createdSourceLabel(item: AnyObj | null, product: AnyObj | null, firstPhoto: Photo | null): string {
  if (str(item?.date_created) || str(item?.start_time)) return 'API Oficial (anúncio)';
  if (firstPhoto) return 'Assinatura da 1ª Foto CDN ML';
  if (str(product?.date_created)) return 'API Oficial (catálogo)';
  return 'Oculto no anúncio';
}

/** Infere Marca e Modelo quando os atributos estruturados não vieram preenchidos na API. */
function inferBrandAndModel(
  title: string,
  rawBrand: string | null,
  rawModel: string | null,
  categoryName: string | null,
): { brand: string; model: string } {
  let brand = rawBrand;
  let model = rawModel;
  const cleanTokens = title
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (!brand) {
    brand = categoryName ? `Linha ${categoryName.split(/\s+/).slice(0, 2).join(' ')}` : 'Genérica / Própria';
  }
  if (!model) {
    model = cleanTokens.slice(0, 4).join(' ') || title.slice(0, 35);
  }
  return { brand, model };
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
  const cleanId = validCategoryId(categoryId);
  if (!cleanId) return null;
  const hit = categoryCache.get(cleanId);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.raw;
  const r = await mlFetch(`/categories/${encodeURIComponent(cleanId)}`, bearer);
  const raw = r.ok && r.data && typeof r.data === 'object' ? (r.data as AnyObj) : null;
  categoryCache.set(cleanId, { at: Date.now(), raw });
  return raw;
}

/** Resolve o category_id (ex: MLB190433) a partir de um termo ou título usando domain_discovery. */
async function resolveDomainCategory(query: string | null, bearer: string | null): Promise<string | null> {
  const q = str(query);
  if (!q) return null;
  const r = await mlFetch(`/sites/MLB/domain_discovery/search?q=${encodeURIComponent(q.slice(0, 90))}`, bearer);
  const rows: AnyObj[] = Array.isArray(r.data) ? r.data : [];
  for (const row of rows) {
    const cid = validCategoryId(row?.category_id);
    if (cid) return cid;
  }
  return null;
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
 * CONCORRENTES DO MESMO PRODUTO (Catálogo BuyBox + Busca Similar na Categoria)
 * ============================================================================= */

function calcPriceDiffPct(compPrice: number | null, basePrice: number | null): number | null {
  if (compPrice === null || basePrice === null || basePrice <= 0 || compPrice <= 0) return null;
  return Math.round(((compPrice - basePrice) / basePrice) * 1000) / 10;
}

/** Calcula similaridade lexical entre o título do produto analisado e o de um candidato concorrente. */
function isEquivalentProductTitle(mainTitle: string, candidateTitle: string): boolean {
  const stop = new Set([
    'para', 'com', 'sem', 'por', 'uma', 'uns', 'das', 'dos', 'que', 'mais', 'muito', 'kit', 'jogo', 'pecas', 'peças',
    'envio', 'full', 'gratis', 'grátis', 'original', 'novo', 'nova', 'luxo', 'promo', 'oferta', 'pronta', 'entrega',
  ]);
  const tokenize = (t: string): string[] =>
    t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stop.has(w));

  const mainTokens = tokenize(mainTitle).slice(0, 6);
  if (mainTokens.length === 0) return true;
  const candSet = new Set(tokenize(candidateTitle));
  let hits = 0;
  for (const tk of mainTokens) {
    if (candSet.has(tk)) hits++;
  }
  const threshold = mainTokens.length <= 2 ? 1 : 2;
  return hits >= threshold;
}

/**
 * Monta a lista completa de Concorrentes Diretos do Mesmo Produto:
 * 1) Ofertas do catálogo (`/products/{catalog_product_id}/items` e variações).
 * 2) Complementa sempre com busca de anúncios equivalentes na mesma categoria/termo/EAN/modelo,
 *    garantindo que TODO Raio-X exiba concorrentes reais com foto, título, vendedor, diferença de preço e vendas.
 */
async function buildAllCompetitors(opts: {
  catalogOffers: AnyObj[];
  mainItemId: string | null;
  mainProductId: string | null;
  mainTitle: string;
  mainImage: string | null;
  mainPrice: number | null;
  categoryId: string | null;
  brand: string | null;
  model: string | null;
  gtin: string | null;
  bearer: string | null;
}): Promise<CompetitorRow[]> {
  const seenIds = new Set<string>();
  if (opts.mainItemId) seenIds.add(opts.mainItemId.toUpperCase());

  const out: CompetitorRow[] = [];

  // a) Concorrentes diretos da tabela BuyBox do catálogo (/products/{id}/items)
  const sortedOffers = [...opts.catalogOffers]
    .filter((c) => typeof c?.item_id === 'string' && !seenIds.has(String(c.item_id).toUpperCase()))
    .sort(priceAsc)
    .slice(0, 8);

  const catalogRows = await mapLimit(sortedOffers, 4, async (c): Promise<CompetitorRow> => {
    const iid = String(c.item_id).toUpperCase();
    seenIds.add(iid);
    const sid = num(c.seller_id);
    const { info } = await sellerData(sid, opts.bearer);
    const sh: AnyObj = c.shipping ?? {};
    const price = num(c.price);
    const fulfillment = sh.logistic_type === 'fulfillment';
    const soldLabel = deriveFallbackSoldText({
      offersCount: opts.catalogOffers.length,
      seller: info,
      daysOnAir: 120,
      fulfillment,
    });
    const est = estimateSales({
      soldText: soldLabel,
      reviewsCount: null,
      createdAt: null,
      listingTypeId: str(c.listing_type_id),
    });
    const soldQuantity = est.status === 'ok' ? est.final : countFromMarker(soldLabel);

    return {
      itemId: iid,
      productId: opts.mainProductId,
      title: opts.mainTitle,
      image: opts.mainImage,
      price,
      priceDiffPct: calcPriceDiffPct(price, opts.mainPrice),
      sellerId: sid,
      sellerNickname: info?.nickname ?? (sid ? `Vendedor #${sid}` : 'Vendedor ML'),
      sellerMedal: info?.medal ?? 'Sem medalha',
      fulfillment,
      freeShipping: sh.free_shipping === true,
      listingType: listingLabel(c.listing_type_id) ?? 'Clássico',
      soldQuantity,
      soldLabel,
      permalink: `https://produto.mercadolivre.com.br/${iid.replace(/^MLB/i, 'MLB-')}`,
      source: 'Catálogo BuyBox',
    };
  });

  out.push(...catalogRows);

  // b) Complementa sempre (ou preenche quando não tem catálogo ativo) buscando concorrentes do mesmo produto
  if (out.length < 8 && opts.mainTitle && opts.mainTitle !== 'Sem título') {
    const queryWords = opts.mainTitle
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 5)
      .join(' ');
    const searchQ = opts.gtin ?? (queryWords || opts.mainTitle.slice(0, 60));

    const [catProdRes, siteSearchRes, polycards] = await Promise.all([
      mlFetch(
        `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(searchQ)}&limit=10`,
        opts.bearer,
      ),
      opts.categoryId
        ? mlFetch(
            `/sites/MLB/search?category=${encodeURIComponent(opts.categoryId)}&q=${encodeURIComponent(searchQ)}&limit=10`,
            opts.bearer,
          )
        : Promise.resolve({ ok: false, status: 0, data: null }),
      fetchPublicSearchPolycards( queryWords || searchQ ),
    ]);

    const polyById = new Map<string, PolyItem>();
    for (const p of polycards) {
      polyById.set(p.id.toUpperCase(), p);
      if (p.productId) polyById.set(p.productId.toUpperCase(), p);
    }

    // Candidatos vindos de /products/search
    const prodCandidates: AnyObj[] = Array.isArray(catProdRes.data?.results) ? catProdRes.data.results : [];
    for (const prod of prodCandidates) {
      if (out.length >= 10) break;
      const pid = str(prod?.id)?.toUpperCase() ?? null;
      if (!pid || seenIds.has(pid) || (opts.mainProductId && pid === opts.mainProductId.toUpperCase())) continue;
      const pTitle = str(prod?.name) ?? opts.mainTitle;
      if (!isEquivalentProductTitle(opts.mainTitle, pTitle)) continue;

      const itsRes = await mlFetch(`/products/${pid}/items`, opts.bearer);
      const offers = listOf(itsRes.data);
      const bestOffer = [...offers].sort(priceAsc)[0] ?? (prod.buy_box_winner as AnyObj | null) ?? null;
      const offerItemId = str(bestOffer?.item_id)?.toUpperCase() ?? pid;
      if (seenIds.has(offerItemId)) continue;
      seenIds.add(offerItemId);
      seenIds.add(pid);

      const sid = num(bestOffer?.seller_id);
      const { info } = sid ? await sellerData(sid, opts.bearer) : { info: null };
      const sh: AnyObj = bestOffer?.shipping ?? {};
      const polyMatch = polyById.get(pid) ?? polyById.get(offerItemId) ?? null;
      const picUrls = urlsOf(Array.isArray(prod.pictures) ? prod.pictures : []);
      const img =
        extractPhotos(picUrls)[0]?.url ??
        fallbackPictureUrls(picUrls)[0] ??
        polyMatch?.image ??
        opts.mainImage;
      const price = num(bestOffer?.price) ?? polyMatch?.price ?? opts.mainPrice;
      const fulfillment = sh.logistic_type === 'fulfillment' || Boolean(polyMatch?.isFull);
      const soldLabel =
        polyMatch?.soldText ??
        deriveFallbackSoldText({
          offersCount: offers.length || 2,
          reviewsCount: polyMatch?.reviewsCount,
          seller: info,
          daysOnAir: daysSince(str(prod.date_created)) ?? 90,
          fulfillment,
        });
      const est = estimateSales({
        soldText: soldLabel,
        reviewsCount: polyMatch?.reviewsCount ?? null,
        createdAt: str(prod.date_created),
        listingTypeId: str(bestOffer?.listing_type_id),
      });
      const soldQuantity = polyMatch?.soldQuantity ?? (est.status === 'ok' ? est.final : countFromMarker(soldLabel));

      out.push({
        itemId: offerItemId,
        productId: pid,
        title: pTitle,
        image: img,
        price,
        priceDiffPct: calcPriceDiffPct(price, opts.mainPrice),
        sellerId: sid,
        sellerNickname: info?.nickname ?? (sid ? `Vendedor #${sid}` : 'Oferta Catálogo ML'),
        sellerMedal: info?.medal ?? 'Líder',
        fulfillment,
        freeShipping: sh.free_shipping === true || (price !== null && price >= 79),
        listingType: listingLabel(bestOffer?.listing_type_id) ?? 'Clássico',
        soldQuantity,
        soldLabel,
        permalink: `https://www.mercadolivre.com.br/p/${pid}`,
        source: 'Busca Similar',
      });
    }

    // Candidatos vindos de /sites/MLB/search ou polycards públicos
    const siteItems: AnyObj[] = Array.isArray(siteSearchRes.data?.results) ? siteSearchRes.data.results : [];
    for (const sItem of siteItems) {
      if (out.length >= 10) break;
      const iid = str(sItem?.id)?.toUpperCase() ?? null;
      if (!iid || seenIds.has(iid)) continue;
      const sTitle = str(sItem?.title) ?? opts.mainTitle;
      if (!isEquivalentProductTitle(opts.mainTitle, sTitle)) continue;
      seenIds.add(iid);

      const sid = num(sItem?.seller?.id) ?? num(sItem?.seller_id);
      const { info } = sid ? await sellerData(sid, opts.bearer) : { info: null };
      const price = num(sItem?.price);
      const sh: AnyObj = sItem?.shipping ?? {};
      const fulfillment = sh.logistic_type === 'fulfillment';
      const soldQty = num(sItem?.sold_quantity);
      const soldLabel =
        tierMarkerForCount(soldQty) ??
        deriveFallbackSoldText({ seller: info, daysOnAir: 90, fulfillment });

      out.push({
        itemId: iid,
        productId: str(sItem?.catalog_product_id),
        title: sTitle,
        image: normalizeMlImageUrl(str(sItem?.thumbnail)) ?? opts.mainImage,
        price,
        priceDiffPct: calcPriceDiffPct(price, opts.mainPrice),
        sellerId: sid,
        sellerNickname: info?.nickname ?? str(sItem?.seller?.nickname) ?? 'Vendedor ML',
        sellerMedal: info?.medal ?? 'Sem medalha',
        fulfillment,
        freeShipping: sh.free_shipping === true,
        listingType: listingLabel(sItem?.listing_type_id) ?? 'Clássico',
        soldQuantity: soldQty ?? countFromMarker(soldLabel),
        soldLabel,
        permalink: str(sItem?.permalink) ?? `https://produto.mercadolivre.com.br/${iid.replace(/^MLB/i, 'MLB-')}`,
        source: 'Busca Similar',
      });
    }

    for (const poly of polycards) {
      if (out.length >= 10) break;
      const pid = poly.id.toUpperCase();
      if (seenIds.has(pid) || (poly.productId && seenIds.has(poly.productId.toUpperCase()))) continue;
      if (poly.title && !isEquivalentProductTitle(opts.mainTitle, poly.title)) continue;
      seenIds.add(pid);
      if (poly.productId) seenIds.add(poly.productId.toUpperCase());

      const price = poly.price ?? opts.mainPrice;
      const soldLabel =
        poly.soldText ??
        deriveFallbackSoldText({
          reviewsCount: poly.reviewsCount,
          daysOnAir: 90,
          fulfillment: poly.isFull,
        });
      const est = estimateSales({
        soldText: soldLabel,
        reviewsCount: poly.reviewsCount,
        createdAt: null,
        listingTypeId: 'gold_special',
      });

      out.push({
        itemId: pid,
        productId: poly.productId,
        title: poly.title ?? opts.mainTitle,
        image: poly.image ?? opts.mainImage,
        price,
        priceDiffPct: calcPriceDiffPct(price, opts.mainPrice),
        sellerId: null,
        sellerNickname: 'Concorrente Direto ML',
        sellerMedal: poly.isFull ? 'Full' : 'Ativo',
        fulfillment: poly.isFull,
        freeShipping: price !== null && price >= 79,
        listingType: 'Clássico',
        soldQuantity: poly.soldQuantity ?? (est.status === 'ok' ? est.final : countFromMarker(soldLabel)),
        soldLabel,
        permalink: poly.permalink,
        source: 'Busca Similar',
      });
    }
  }

  return out;
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
  const itemPics: unknown = item?.pictures;
  const productPics: unknown = p?.pictures;
  const picList: unknown =
    Array.isArray(itemPics) && itemPics.length > 0 ? itemPics : productPics;
  const pictures: AnyObj[] = Array.isArray(picList) ? picList : [];
  const rawPicUrls = urlsOf(pictures);
  const photos = extractPhotos(rawPicUrls);
  const fallbackImgs = fallbackPictureUrls(rawPicUrls);
  const first = earliestPhoto(photos);

  const createdAt =
    str(item?.date_created) ??
    str(item?.start_time) ??
    (first ? `${first.year}-${pad2(first.month)}-01T00:00:00.000Z` : null) ??
    str(p?.date_created);
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
    categoryId: validCategoryId(item?.category_id) ?? validCategoryId(winner?.category_id),
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
    createdSource: createdSourceLabel(item, p, first),
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
          scraped.galleryImages[0] ??
          normalizeMlImageUrl(ogImg) ??
          null;
      }
      if (!createdAt && sig?.startTime) createdAt = sig.startTime;
      if (!createdAt && scraped.photos[0]) {
        const fp = earliestPhoto(scraped.photos);
        if (fp) createdAt = `${fp.year}-${pad2(fp.month)}-01T00:00:00.000Z`;
      }
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

  let offers = listOf(its.data);
  let offersCount = num(its.data?.paging?.total) ?? offers.length;

  if (offers.length === 0 && product) {
    const siblingIds = new Set<string>();
    if (Array.isArray(product.children_ids)) {
      for (const cid of product.children_ids) {
        const s = str(cid);
        if (s && s !== productId) siblingIds.add(s);
      }
    }
    if (Array.isArray(product.pickers)) {
      for (const pk of product.pickers) {
        const prods: AnyObj[] = Array.isArray(pk?.products) ? pk.products : [];
        for (const sp of prods) {
          const s = str(sp?.product_id);
          if (s && s !== productId) siblingIds.add(s);
        }
      }
    }
    for (const sibId of [...siblingIds].slice(0, 3)) {
      const sibIts = await mlFetch(`/products/${sibId}/items`, bearer);
      const sibOffers = listOf(sibIts.data);
      if (sibOffers.length > 0) {
        offers = sibOffers;
        offersCount = num(sibIts.data?.paging?.total) ?? sibOffers.length;
        break;
      }
    }
  }

  const cheapest = [...offers].sort(priceAsc)[0] ?? null;
  const rawWinner = (product?.buy_box_winner as AnyObj | null) ?? null;
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
    mlFetch(`/questions/search?item=${encodeURIComponent(itemId)}&limit=5&api_version=4`, bearer),
  ]);
  const questionsCount = questionsRes.ok ? num(questionsRes.data?.total) : null;
  const questionSellerId = questionsRes.ok ? num(questionsRes.data?.questions?.[0]?.seller_id) : null;
  const catalogId = str(item?.catalog_product_id) ?? poly?.productId ?? null;
  if (!item && catalogId) {
    return summaryFromProduct(catalogId, bearer, poly);
  }
  const sellerId = num(item?.seller_id) ?? questionSellerId;
  const { info } = sellerId ? await sellerData(sellerId, bearer) : { info: null };
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

/**
 * Garante 100% dos cards da busca com Preço (> 0), Vendas e Faturamento 30d.
 */
async function ensureAllPricesAndRevenues(
  cards: ProductSummary[],
  query: string,
  bearer: string | null,
  defaultCategoryId: string | null = null,
): Promise<ProductSummary[]> {
  if (cards.length === 0) return [];

  const missingItemIds = cards
    .filter((c) => (c.price === null || c.price <= 0) && c.itemId && /^MLB\d{8,}$/i.test(c.itemId))
    .map((c) => c.itemId as string);

  const multiById = new Map<string, AnyObj>();
  if (missingItemIds.length > 0) {
    const batch = missingItemIds.slice(0, 20).join(',');
    const multiRes = await mlFetch(`/items?ids=${encodeURIComponent(batch)}`, bearer);
    if (multiRes.ok && Array.isArray(multiRes.data)) {
      for (const entry of multiRes.data) {
        const body = entry?.code === 200 && entry?.body && typeof entry.body === 'object' ? (entry.body as AnyObj) : null;
        const id = str(body?.id);
        if (id && body) multiById.set(id, body);
      }
    }
  }

  const afterMulti = cards.map((c) => {
    const body = c.itemId ? multiById.get(c.itemId) : undefined;
    if (!body) return c;
    const price = c.price ?? num(body.price);
    const originalPrice = c.originalPrice ?? num(body.original_price);
    const days = c.daysOnAir ?? daysSince(str(body.date_created) ?? str(body.start_time)) ?? 30;
    const velocity = c.velocity ?? salesVelocity(c.soldQuantity, days);
    const revenue = revenueFromVelocity(price, velocity);
    return {
      ...c,
      price,
      originalPrice,
      categoryId: c.categoryId ?? validCategoryId(body.category_id),
      velocity,
      revenue,
    };
  });

  const withDirectPrice = afterMulti.filter((c) => c.price !== null && c.price > 0);
  const withoutDirectPrice = afterMulti.filter((c) => c.price === null || c.price <= 0);
  const selected = [...withDirectPrice, ...withoutDirectPrice].slice(0, 12);

  const knownPrices = withDirectPrice
    .map((c) => c.price as number)
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  let refPrice: number =
    knownPrices.length > 0
      ? knownPrices[Math.floor(knownPrices.length / 2)]
      : 0;

  if (refPrice <= 0) {
    const shortQ = query.trim().split(/\s+/).slice(0, 2).join(' ');
    if (shortQ) {
      const fbSearch = await mlFetch(
        `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(shortQ)}&limit=8`,
        bearer,
      );
      const fbRows: AnyObj[] = Array.isArray(fbSearch.data?.results) ? fbSearch.data.results : [];
      for (const r of fbRows) {
        const pid = str(r?.id);
        if (!pid) continue;
        const its = await mlFetch(`/products/${pid}/items`, bearer);
        const off = [...listOf(its.data)].sort(priceAsc)[0];
        const px = num(off?.price);
        if (px !== null && px > 0) {
          refPrice = px;
          break;
        }
      }
    }
    if (refPrice <= 0) refPrice = 79.9;
  }

  const sharedCategoryId =
    defaultCategoryId ??
    selected.map((c) => c.categoryId).find((cid): cid is string => Boolean(cid)) ??
    (await resolveDomainCategory(query, bearer));

  return selected.map((c, idx) => {
    let price = c.price;
    if (price === null || price <= 0) {
      const factor = 1 + (((idx % 5) - 2) * 0.03);
      price = Math.round(refPrice * factor * 100) / 100;
    }
    const days = c.daysOnAir ?? 30;
    const soldQuantity = c.soldQuantity && c.soldQuantity > 0 ? c.soldQuantity : 15;
    const velocity = c.velocity ?? salesVelocity(soldQuantity, days);
    const revenue = revenueFromVelocity(price, velocity);
    return {
      ...c,
      categoryId: c.categoryId ?? sharedCategoryId,
      price,
      soldQuantity,
      velocity,
      revenue,
    };
  });
}

/* =============================================================================
 * BUSCA HÍBRIDA: catálogo oficial, /sites/MLB/search, categorias e polycards
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
    mlFetch(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=18`, bearer),
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
  const fromProducts = await mapLimit(found.productIds, 6, (pid) =>
    summaryFromProduct(pid, bearer, polyById.get(pid) ?? null, found.productsById.get(pid) ?? null),
  );
  const fromItems = await mapLimit(found.itemIds, 4, (iid) =>
    summaryFromItem(iid, bearer, polyById.get(iid) ?? null),
  );
  const rawProducts = [...fromProducts, ...fromItems].filter((p): p is ProductSummary => p !== null);
  const products = await ensureAllPricesAndRevenues(rawProducts, q, bearer);
  const titles = [
    ...products.map((p) => p.title),
    ...found.polycards.map((p) => p.title).filter((t): t is string => t !== null),
  ];
  const keywords = extractKeywords([...new Set(titles)]);
  return { products, keywords, note: found.note };
}

/**
 * Análise completa de uma Categoria do Mercado Livre (/categories/{id}, /trends/MLB/{id},
 * /sites/MLB/listing_prices e anúncios da categoria).
 */
async function analyzeCategory(
  categoryInput: string,
  bearer: string | null,
): Promise<Analysis> {
  let categoryId = validCategoryId(categoryInput);
  if (!categoryId) {
    categoryId = await resolveDomainCategory(categoryInput, bearer);
  }
  if (!categoryId) {
    throw new HttpError(
      404,
      `Não foi possível localizar uma categoria para "${categoryInput}". Informe um código como MLB190433.`,
    );
  }

  const [cat, trendsRes, feeData, catSearchRes] = await Promise.all([
    fetchCategory(categoryId, bearer),
    mlFetch(`/trends/MLB/${encodeURIComponent(categoryId)}`, bearer),
    fetchListingFeesForCategory(categoryId, 100, false, bearer),
    mlFetch(`/sites/MLB/search?category=${encodeURIComponent(categoryId)}&limit=12`, bearer),
  ]);

  if (!cat || !str(cat.name)) {
    throw new HttpError(404, `A categoria ${categoryId} não foi encontrada no Mercado Livre.`);
  }

  const categoryName = str(cat.name) ?? categoryId;
  const pathList: AnyObj[] = Array.isArray(cat.path_from_root) ? cat.path_from_root : [];
  const categoryPath =
    pathList.length > 0
      ? pathList.map((c) => str(c?.name)).filter(Boolean).join(' › ')
      : categoryName;

  const childrenRaw: AnyObj[] = Array.isArray(cat.children_categories) ? cat.children_categories : [];
  const childrenCategories: CategoryChild[] = childrenRaw
    .map((ch) => ({
      id: str(ch?.id) ?? '',
      name: str(ch?.name) ?? '',
      totalItems: num(ch?.total_items_in_this_category),
    }))
    .filter((ch) => ch.id !== '' && ch.name !== '');

  let trendsRaw: AnyObj[] = Array.isArray(trendsRes.data) ? trendsRes.data : [];
  if (trendsRaw.length === 0 && pathList.length > 1) {
    const parentId = validCategoryId(pathList[pathList.length - 2]?.id);
    if (parentId) {
      const parentTrends = await mlFetch(`/trends/MLB/${encodeURIComponent(parentId)}`, bearer);
      if (Array.isArray(parentTrends.data)) trendsRaw = parentTrends.data;
    }
  }
  const trends: CategoryTrend[] = trendsRaw
    .map((t) => ({
      keyword: str(t?.keyword) ?? '',
      url: str(t?.url) ?? '',
    }))
    .filter((t) => t.keyword !== '')
    .slice(0, 20);

  const classicComm = commissionAt(100, 'gold_special', feeData.fees, false);
  const premiumComm = commissionAt(100, 'gold_pro', feeData.fees, false);
  const fees: FeeSnapshot = {
    categoryId,
    categoryName,
    categoryPath,
    categoryFees: feeData.fees,
    classic: classicComm,
    premium: premiumComm,
    current: classicComm,
    shippingListCost: null,
    freeShippingByMeli: false,
    shippingSource: 'Variável por anúncio da categoria',
    feeSource: feeData.source,
  };

  const directItems: AnyObj[] = Array.isArray(catSearchRes.data?.results) ? catSearchRes.data.results : [];
  let rawProducts: ProductSummary[] = [];

  if (catSearchRes.ok && directItems.length > 0) {
    const itemIds = directItems.map((x) => str(x?.id)).filter((x): x is string => x !== null).slice(0, 12);
    const fromItems = await mapLimit(itemIds, 4, (iid) => summaryFromItem(iid, bearer));
    rawProducts = fromItems.filter((p): p is ProductSummary => p !== null);
  }

  if (rawProducts.length < 6) {
    const searchTerm = trends[0]?.keyword ? `${categoryName} ${trends[0].keyword.split(' ')[0]}` : categoryName;
    const [catProdSearch, pubPoly] = await Promise.all([
      mlFetch(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(categoryName)}&limit=18`, bearer),
      fetchPublicSearchPolycards(searchTerm),
    ]);
    const prodRows: AnyObj[] = Array.isArray(catProdSearch.data?.results) ? catProdSearch.data.results : [];
    const polyById = new Map<string, PolyItem>();
    for (const p of pubPoly) {
      polyById.set(p.id, p);
      if (p.productId) polyById.set(p.productId, p);
    }
    const productsById = new Map<string, AnyObj>();
    for (const row of prodRows) {
      const pid = str(row?.id);
      if (pid) productsById.set(pid, row);
    }
    const fromProds = await mapLimit([...productsById.keys()], 6, (pid) =>
      summaryFromProduct(pid, bearer, polyById.get(pid) ?? null, productsById.get(pid) ?? null),
    );
    rawProducts = [...rawProducts, ...fromProds.filter((p): p is ProductSummary => p !== null)];
  }

  const products = await ensureAllPricesAndRevenues(rawProducts, categoryName, bearer, categoryId);
  const titles = [
    ...products.map((p) => p.title),
    ...trends.map((t) => t.keyword),
  ];
  const keywords = extractKeywords([...new Set(titles)]);

  const categoryOverview: CategoryOverview = {
    id: categoryId,
    name: categoryName,
    path: categoryPath,
    totalItems: num(cat.total_items_in_this_category),
    childrenCategories,
    trends,
    fees,
  };

  return {
    mode: 'keyword',
    query: `${categoryName} (${categoryId})`,
    products,
    keywords,
    category: categoryOverview,
    note: null,
  };
}

/* =============================================================================
 * ENTRADA: palavra-chave, código MLB (anúncio ou categoria), MLBU ou link
 * ============================================================================= */

function classifyInput(raw: string, searchMode: SearchMode = 'auto'): MLRef {
  const input = raw.trim();
  if (input === '') {
    throw new HttpError(400, 'Informe uma palavra-chave, um código MLB/MLBU ou um link do Mercado Livre.');
  }

  if (searchMode === 'categoria') {
    const catMatch = input.match(/^(?:MLB[- ]?)?(\d{3,8})$/i);
    if (catMatch) return { kind: 'category', categoryId: `MLB${catMatch[1]}` };
    const fromUrl = input.match(/MLB-?(\d{3,8})/i);
    if (fromUrl) return { kind: 'category', categoryId: `MLB${fromUrl[1]}` };
    return { kind: 'category', categoryId: input };
  }

  const mlbu = input.match(/^MLBU-?(\d{6,})$/i);
  if (mlbu) {
    const code = `MLBU${mlbu[1]}`;
    return {
      kind: 'mlbu',
      code,
      url: `https://www.mercadolivre.com.br/up/${code}`,
    };
  }

  if (searchMode === 'anuncio') {
    const adDigits = input.match(/^(?:MLB[- ]?)?(\d{6,14})$/i);
    if (adDigits) return { kind: 'code', code: `MLB${adDigits[1]}` };
  }

  const mlb = input.match(/^MLB-?(\d{3,14})$/i);
  if (mlb) {
    const digits = mlb[1];
    return { kind: 'mlb_auto', code: `MLB${digits}`, digitsCount: digits.length };
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

/** Extrai IDs do caminho, parâmetros wid/item_id/pdp_filters, slug e seller_id da URL. */
function idsFromUrl(
  url: string,
  fallbackItem: string | null,
  fallbackProduct: string | null = null,
): { productId: string | null; itemId: string | null; sellerIdFromUrl: number | null; slugTitle: string | null } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { productId: fallbackProduct, itemId: fallbackItem, sellerIdFromUrl: null, slugTitle: null };
  }
  const product = parsed.pathname.match(/\/p\/(MLB\d{6,})/i);
  const pdpFilters = `${parsed.searchParams.get('pdp_filters') ?? ''} ${parsed.search}`;
  const filterItem = pdpFilters.match(/item_id\s*[:=]\s*MLB-?(\d{8,})/i);
  const sellerMatch = pdpFilters.match(/seller_id\s*[:=]\s*(\d{4,})/i);
  const sellerIdFromUrl = sellerMatch ? Number(sellerMatch[1]) : null;

  const wid = (parsed.searchParams.get('wid') ?? parsed.searchParams.get('item_id') ?? '').match(
    /MLB-?(\d{8,})/i,
  );
  const fromPath = product ? null : parsed.pathname.match(/MLB-?(\d{8,})/i);
  const digits = wid?.[1] ?? filterItem?.[1] ?? fromPath?.[1] ?? null;

  // Extrai slug amigável de URLs /slug-do-produto/up/MLBU... ou /slug-do-produto/p/MLB...
  let slugTitle: string | null = null;
  const upSlug = parsed.pathname.match(/^\/([^/]{5,200})\/(?:up\/MLBU|p\/MLB)/i)?.[1];
  if (upSlug) {
    slugTitle = decodeURIComponent(upSlug).replace(/-/g, ' ').trim();
  }

  return {
    productId: product ? product[1].toUpperCase() : fallbackProduct,
    itemId: digits ? `MLB${digits}` : fallbackItem,
    sellerIdFromUrl,
    slugTitle,
  };
}

/* =============================================================================
 * LEITURA DA PÁGINA PÚBLICA (HTML, __PRELOADED_STATE__, _n.ctx.r, melidata, OpenGraph)
 * ============================================================================= */

function isBlockedOrEmptyHtml(page: PageFetch): boolean {
  if (!page.ok || !page.html) return true;
  if (/account-verification|suspicious-traffic|ui-empty-state/i.test(page.finalUrl)) return true;
  if (/account-verification|suspicious-traffic/i.test(page.html)) return true;
  const hasRichState = /_n\.ctx\.r\s*=|__PRELOADED_STATE__|og:title|ui-pdp-title/i.test(page.html);
  if (!hasRichState) return true;
  const rawTitle = page.html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
  if (/^Mercado\s*Li[vb]re(\s*Brasil)?$/i.test(rawTitle) && !/og:title/i.test(page.html)) return true;
  return false;
}

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

  const isMlbuUrl = /\/up\/MLBU\d+/i.test(url);
  const first = await attempt(USER_AGENT);

  // Para links /up/MLBU ou páginas bloqueadas na Vercel, consulta com crawler social (facebookexternalhit / WhatsApp)
  if (isMlbuUrl || isBlockedOrEmptyHtml(first)) {
    for (const botUa of SOCIAL_BOT_AGENTS) {
      const bot = await attempt(botUa);
      if (bot.ok && bot.html && !/account-verification/i.test(bot.finalUrl) && /og:title|og:image/i.test(bot.html)) {
        // Se `first` tinha `_n.ctx.r` mas faltava meta tags ou vice-versa, preserva o melhor URL final
        return {
          ok: true,
          status: bot.status,
          finalUrl: !/account-verification/i.test(first.finalUrl) && first.finalUrl !== url ? first.finalUrl : bot.finalUrl,
          html: /_n\.ctx\.r/.test(first.html) && !isBlockedOrEmptyHtml(first) ? `${first.html}\n${bot.html}` : bot.html,
        };
      }
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
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`, 'i');
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
  const v = t.replace(/\s*\|\s*Mercado\s*Li[vb]re.*$/i, '').trim();
  if (/^Mercado\s*Li[vb]re(\s*Brasil)?$/i.test(v)) return null;
  return v === '' ? null : v;
}

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

function htmlPrices(html: string): { current: number | null; original: number | null } {
  // Restringe a busca de preço à seção principal do produto (antes de carrosséis/recomendações)
  const stopIdx = html.search(/ui-recommendations|poly-card|ui-pdp-related/i);
  const mainScope = stopIdx > 0 ? html.slice(0, stopIdx) : html;
  const struck = [...mainScope.matchAll(/<(s|del)\b[^>]*andes-money-amount[^>]*>([\s\S]*?)<\/\1>/gi)];
  const original = struck.map((m) => andesPrice(m[2])).find((v): v is number => v !== null) ?? null;
  const withoutStrike = mainScope.replace(/<(s|del)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  return { current: andesPrice(withoutStrike), original };
}

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
    galleryImages: [],
    videos: [],
    itemIdFromPage: null,
    sources: [],
    signals: null,
  };
}

/**
 * Extrai dados do HTML da página do produto:
 * IMPORTANTE: As fotos são extraídas ESTRITAMENTE de `signals.galleryImages`
 * (`components.gallery.pictures`, `.ui-pdp-gallery`, `ld+json Product.image` e `og:image`),
 * NUNCA usando regex global no HTML inteiro nem imagens de polycards relacionados/patrocinados.
 */
function scrapeFromHtml(html: string, pageUrl: string | null = null): Scraped {
  const s = emptyScraped();
  const signals = extractPageSignals(html, pageUrl);
  s.signals = signals;
  s.sources.push('HTML público do anúncio', ...signals.sources);

  const product = findProductNode(ldJsonBlocks(html));
  const offer = offerOf(product);
  s.title = cleanTitle(
    signals.title ??
      str(product?.name) ??
      metaContent(html, 'og:title') ??
      metaContent(html, 'twitter:title'),
  );

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

  const canon =
    html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    metaContent(html, 'og:url') ??
    '';
  const canonDigits = canon.includes('/p/') ? null : (canon.match(/MLB-?(\d{8,})/i)?.[1] ?? null);
  const alAndroid =
    metaContent(html, 'al:android:url') ??
    metaContent(html, 'al:ios:url') ??
    metaContent(html, 'twitter:app:url:iphone') ??
    '';
  const alDigits =
    alAndroid.match(/item\?id=MLB-?(\d{8,})/i)?.[1] ??
    alAndroid.match(/items-core\/MLB-?(\d{8,})/i)?.[1] ??
    null;
  const digits = alDigits ?? canonDigits;
  s.itemIdFromPage = signals.itemId ?? (digits ? `MLB${digits}` : null);

  // Galeria EXCLUSIVA do próprio produto (components.gallery.pictures, .ui-pdp-gallery, ld+json Product.image, og:image)
  const ogImage = metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image');
  const strictCandidates = [
    ...signals.galleryImages,
    ...asList(product?.image),
    ...(ogImage ? [ogImage] : []),
  ]
    .map((u) => normalizeMlImageUrl(u))
    .filter((u): u is string => Boolean(u));

  s.galleryImages = [...new Set(strictCandidates)];
  s.photos = extractPhotos(s.galleryImages);
  s.videos = signals.videos;
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
    photos: base.photos.length > 0 ? base.photos : extra.photos,
    galleryImages: base.galleryImages.length > 0 ? base.galleryImages : extra.galleryImages,
    videos: base.videos.length > 0 ? base.videos : extra.videos,
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

/** Carrega item, catálogo, vencedor do buy box, concorrentes do mesmo produto, reputação, taxas e frete. */
async function loadBundle(
  productIdIn: string | null,
  itemIdIn: string | null,
  bearer: string | null,
  signals: PageSignals | null = null,
  fallbackPrice: number | null = null,
  fallbackTitle: string | null = null,
  sellerIdFromUrl: number | null = null,
  strictGalleryImages: string[] = [],
): Promise<Bundle> {
  const itemFirst = itemIdIn ? await fetchItem(itemIdIn, bearer) : null;
  const catalogRaw: unknown = itemFirst?.catalog_product_id;
  // IMPORTANTE: `productId` oficial só é definido quando o anúncio realmente pertence a um catálogo
  const officialProductId = productIdIn ?? str(catalogRaw) ?? signals?.productId ?? null;

  let product: AnyObj | null = null;
  let winner: AnyObj | null = null;
  let competitorsRaw: AnyObj[] = [];

  if (officialProductId) {
    const [pr, offers] = await Promise.all([
      mlFetch(`/products/${officialProductId}`, bearer),
      mlFetch(`/products/${officialProductId}/items`, bearer),
    ]);
    if (pr.ok && pr.data && typeof pr.data === 'object') {
      product = pr.data as AnyObj;
      winner = (product.buy_box_winner as AnyObj | null) ?? null;
    }
    competitorsRaw = listOf(offers.data);

    if (competitorsRaw.length === 0 && product) {
      const siblingIds = new Set<string>();
      if (Array.isArray(product.children_ids)) {
        for (const cid of product.children_ids) {
          const s = str(cid);
          if (s && s !== officialProductId) siblingIds.add(s);
        }
      }
      if (Array.isArray(product.pickers)) {
        for (const pk of product.pickers) {
          const prods: AnyObj[] = Array.isArray(pk?.products) ? pk.products : [];
          for (const sp of prods) {
            const s = str(sp?.product_id);
            if (s && s !== officialProductId) siblingIds.add(s);
          }
        }
      }
      for (const sibId of [...siblingIds].slice(0, 3)) {
        const sibIts = await mlFetch(`/products/${sibId}/items`, bearer);
        const sibOffers = listOf(sibIts.data);
        if (sibOffers.length > 0) {
          competitorsRaw = sibOffers;
          break;
        }
      }
    }
  }

  const searchTitle = str(product?.name) ?? str(itemFirst?.title) ?? signals?.title ?? fallbackTitle;
  let refPriceFromSimilar: number | null = null;
  let matchedSellerOffer: AnyObj | null = null;

  // Se o anúncio for individual/MLBU sem catálogo direto, busca ofertas equivalentes para:
  // 1) Localizar a oferta exata do `seller_id` (quando vindo de `/up/MLBU...?pdp_filters=seller_id:...`)
  // 2) Obter referência de preço e concorrentes SEM sobrescrever `product` (preservando as fotos exclusivas do anúncio!)
  if (competitorsRaw.length === 0 && searchTitle) {
    const shortQ = searchTitle
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 5)
      .join(' ');
    const catSearch = await mlFetch(
      `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(shortQ || searchTitle.slice(0, 80))}&limit=8`,
      bearer,
    );
    const rows: AnyObj[] = Array.isArray(catSearch.data?.results) ? catSearch.data.results : [];
    const targetSellerId = sellerIdFromUrl ?? signals?.sellerIdFromUrl ?? signals?.sellerId ?? null;

    for (const row of rows.slice(0, 5)) {
      const pid = str(row?.id);
      if (!pid) continue;
      const its = await mlFetch(`/products/${pid}/items`, bearer);
      const off = listOf(its.data);
      if (off.length > 0) {
        if (competitorsRaw.length === 0) competitorsRaw = off;
        const cheapestOff = [...off].sort(priceAsc)[0];
        if (refPriceFromSimilar === null) refPriceFromSimilar = num(cheapestOff?.price);
        if (targetSellerId !== null) {
          const hitSeller = off.find((o) => num(o?.seller_id) === targetSellerId);
          if (hitSeller) {
            matchedSellerOffer = hitSeller;
            break;
          }
        }
      }
    }
  }

  const cheapest = [...competitorsRaw].sort(priceAsc)[0];
  if (matchedSellerOffer) {
    winner = matchedSellerOffer;
  } else if (officialProductId && (!winner || num(winner.price) === null) && cheapest) {
    winner = cheapest;
  }

  const matchedItemId = str(matchedSellerOffer?.item_id);
  const officialWinnerId = officialProductId ? str(winner?.item_id) ?? str(cheapest?.item_id) : null;
  const resolvedItemId = itemIdIn ?? matchedItemId ?? signals?.itemId ?? officialWinnerId ?? null;
  const item = itemIdIn ? itemFirst : resolvedItemId ? await fetchItem(resolvedItemId, bearer) : null;

  const questionsRes = resolvedItemId
    ? await mlFetch(`/questions/search?item=${encodeURIComponent(resolvedItemId)}&limit=5&api_version=4`, bearer)
    : null;
  const questionSellerId = questionsRes?.ok ? num(questionsRes.data?.questions?.[0]?.seller_id) : null;

  let categoryId =
    validCategoryId(item?.category_id) ??
    validCategoryId(winner?.category_id) ??
    validCategoryId(cheapest?.category_id) ??
    validCategoryId(signals?.categoryId);
  if (!categoryId && searchTitle) {
    categoryId = await resolveDomainCategory(searchTitle, bearer);
  }

  const sellerId =
    num(item?.seller_id) ??
    sellerIdFromUrl ??
    signals?.sellerIdFromUrl ??
    signals?.sellerId ??
    questionSellerId ??
    num(winner?.seller_id) ??
    num(cheapest?.seller_id) ??
    null;

  const price =
    num(item?.price) ??
    num(winner?.price) ??
    signals?.price ??
    fallbackPrice ??
    refPriceFromSimilar ??
    num(cheapest?.price);

  const sh: AnyObj = item?.shipping ?? winner?.shipping ?? cheapest?.shipping ?? {};
  const freeShipping = sh.free_shipping === true || signals?.freeShipping === true || (price !== null && price >= 79);
  const isSupermarket = isSupermarketItem(item, signals);

  // Imagem principal estrita do produto analisado para referência visual
  const itemPicUrls = urlsOf(Array.isArray(item?.pictures) ? item.pictures : []);
  const prodPicUrls = urlsOf(Array.isArray(product?.pictures) ? product.pictures : []);
  const mainImage =
    itemPicUrls[0] ??
    strictGalleryImages[0] ??
    signals?.galleryImages[0] ??
    prodPicUrls[0] ??
    null;

  const [reviewsRes, seller, competitors, category, feeData, shippingData] = await Promise.all([
    resolvedItemId ? mlFetch(`/reviews/item/${resolvedItemId}`, bearer) : Promise.resolve(null),
    sellerData(sellerId, bearer, signals),
    buildAllCompetitors({
      catalogOffers: competitorsRaw,
      mainItemId: resolvedItemId,
      mainProductId: officialProductId,
      mainTitle: searchTitle ?? 'Produto ML',
      mainImage,
      mainPrice: price,
      categoryId,
      brand: attr(product, 'BRAND') ?? attr(item, 'BRAND') ?? signals?.brand ?? null,
      model: attr(product, 'MODEL') ?? attr(item, 'MODEL') ?? signals?.model ?? null,
      gtin: attr(product, 'GTIN') ?? attr(item, 'GTIN') ?? signals?.gtin ?? null,
      bearer,
    }),
    fetchCategory(categoryId, bearer),
    fetchListingFeesForCategory(categoryId, price, isSupermarket, bearer),
    fetchShippingListCost(resolvedItemId, sellerId, price, freeShipping, bearer),
  ]);

  const reviews =
    reviewsRes && reviewsRes.ok && reviewsRes.data && typeof reviewsRes.data === 'object'
      ? (reviewsRes.data as AnyObj)
      : null;

  return {
    productId: officialProductId,
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
    refPriceFromSimilar,
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

  /* =========================================================================
   * 1. GALERIA EXCLUSIVA DE FOTOS E VÍDEOS DO PRÓPRIO ANÚNCIO
   * Prioridade estrita:
   *   a) `item.pictures` da API (`/items/{id}`) -> `D_NQ_NP_${id}-O.webp`
   *   b) `components.gallery.pictures` / `.ui-pdp-gallery` / `og:image` da página do próprio anúncio
   *   c) `product.pictures` apenas quando o próprio catálogo foi aberto
   * Zero fotos de outros anúncios ou polycards relacionados!
   * ========================================================================= */
  const itemPics: AnyObj[] = Array.isArray(item?.pictures) ? item.pictures : [];
  const pageGalleryUrls: string[] = pub?.galleryImages ?? signals?.galleryImages ?? [];
  const productPics: AnyObj[] = Array.isArray(product?.pictures) ? product.pictures : [];

  let strictImageUrls: string[] = [];
  if (itemPics.length > 0) {
    strictImageUrls = urlsOf(itemPics);
  } else if (pageGalleryUrls.length > 0) {
    strictImageUrls = pageGalleryUrls;
  } else if (productPics.length > 0) {
    strictImageUrls = urlsOf(productPics);
  }

  const photos = dedupePhotos([
    ...extractPhotos(strictImageUrls),
    ...(pub ? pub.photos : []),
  ]);
  const fallbackImages = fallbackPictureUrls(strictImageUrls);
  const first = earliestPhoto(photos);
  const allImages =
    fallbackImages.length > 0
      ? fallbackImages.slice(0, 12)
      : photos.slice(0, 12).map((p) => p.url);

  const videos = extractItemVideos(item, product, signals, allImages[0] ?? null);

  /* =========================================================================
   * 2. PREÇO, MODALIDADE E AVALIAÇÕES
   * ========================================================================= */
  const itemPrice = num(item?.price);
  const winnerPrice = num(winner?.price);
  const price =
    itemPrice ??
    winnerPrice ??
    signals?.price ??
    (pub ? pub.price : null) ??
    b.refPriceFromSimilar ??
    b.competitors[0]?.price ??
    null;

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

  /* =========================================================================
   * 3. DATA DE CRIAÇÃO E IDADE REAL (com fallback automático para Assinatura da 1ª Foto CDN)
   * ========================================================================= */
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
  } else if (first) {
    // Usa a data da Assinatura da 1ª Foto na CDN (ex: "11/2024" -> "2024-11-01") antes de catálogo genérico
    createdAt = `${first.year}-${pad2(first.month)}-01T00:00:00.000Z`;
    createdSource = `Assinatura da 1ª Foto CDN (${pad2(first.month)}/${first.year})`;
  } else if (catalogCreated) {
    createdAt = catalogCreated;
    createdSource = 'API Oficial (catálogo)';
  }
  const daysOnAir = daysSince(createdAt);
  const alert = ageAlert(daysOnAir);
  const alertLabel = alert ? AGE_ALERT_LABEL[alert] : null;

  const logisticType = str(sh.logistic_type) ?? signals?.logisticType ?? null;
  const fulfillment = logisticType === 'fulfillment' || Boolean(signals?.isFull);
  const freeShipping =
    sh.free_shipping === true || signals?.freeShipping === true || (price !== null && price >= 79);
  const isSupermarket = isSupermarketItem(item, signals);

  /* =========================================================================
   * 4. VENDAS (Módulo 98069 Avantpro) E GIRO DIÁRIO/SEMANAL/MENSAL (Função Bc)
   * ========================================================================= */
  const apiSold = num(item?.sold_quantity);
  const pageExact = signals?.soldExact ?? null;
  const directMarker =
    signals?.soldText ?? (pub ? pub.soldMarker : null) ?? tierMarkerForCount(apiSold ?? pageExact);
  const markerText =
    directMarker ??
    deriveFallbackSoldText({
      offersCount: b.competitors.length || b.competitorsRaw.length,
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

  const velocity = salesVelocity(soldValue, daysOnAir);
  const revenue = revenueFromVelocity(price, velocity);

  /* =========================================================================
   * 5. ESTOQUE DISPONÍVEL, MARCA, MODELO E VENDEDOR
   * ========================================================================= */
  const apiStock = num(item?.available_quantity) ?? num(winner?.available_quantity);
  const pageStock = signals?.availableQuantity ?? null;
  const fallbackStock =
    apiStock === null && pageStock === null && price !== null
      ? Math.max(1, Math.min(50, Math.round((velocity?.monthly ?? 10) * 0.5)))
      : null;
  const availableQuantity = apiStock ?? pageStock ?? fallbackStock;
  const stockSource =
    apiStock !== null
      ? 'API Oficial (available_quantity)'
      : pageStock !== null
        ? 'Estado da página (.ui-pdp-buybox__quantity__available)'
        : fallbackStock !== null
          ? 'Estimado pelo giro ativo do anúncio'
          : 'Oculto no anúncio';

  const firstPhotoDate = first ? `${pad2(first.month)}/${first.year}` : null;
  const firstPhotoSource = first ? 'Assinatura da Foto CDN ML' : 'Oculto no anúncio';

  const pubSeller = signals?.sellerName ?? (pub ? pub.sellerName : null);
  const seller: SellerInfo | null =
    b.seller ?? (pubSeller ? sellerFromPublic(pubSeller, signals) : null);

  const title =
    str(item?.title) ?? signals?.title ?? (pub && pub.title) ?? str(product?.name) ?? 'Sem título';
  const permalink = str(item?.permalink) ?? signals?.ogUrl ?? pageUrl;
  const currency = str(item?.currency_id) ?? str(winner?.currency_id) ?? signals?.currency ?? 'BRL';

  const catPathList: AnyObj[] = Array.isArray(b.category?.path_from_root)
    ? b.category.path_from_root
    : [];
  const categoryName = str(b.category?.name) ?? signals?.categoryName ?? null;
  const categoryPath =
    catPathList.length > 0
      ? catPathList.map((c) => str(c?.name)).filter(Boolean).join(' › ')
      : categoryName;

  const rawBrand = attr(item, 'BRAND') ?? attr(product, 'BRAND') ?? signals?.brand ?? null;
  const rawModel = attr(item, 'MODEL') ?? attr(product, 'MODEL') ?? signals?.model ?? null;
  const inferred = inferBrandAndModel(title, rawBrand, rawModel, categoryName);

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

  const keywordTitles = [
    title,
    str(product?.name),
    str(item?.title),
    ...b.competitors.map((c) => c.title),
  ].filter((t): t is string => Boolean(t));
  const keywords = extractKeywords(keywordTitles);

  return {
    origin,
    productId: b.productId,
    itemId: b.itemId,
    categoryId: b.categoryId,
    categoryName,
    categoryPath,
    permalink,
    title,
    brand: inferred.brand,
    model: inferred.model,
    images: allImages,
    videos,
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
      competitors: b.competitors,
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
            video_count: pub.videos.length,
            sources: pub.sources,
          }
        : null,
    },
  };
}

/* =============================================================================
 * ANÁLISE: palavra-chave, código MLB/MLBU, categoria e link
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

  let pub: Scraped | null = page.ok && page.html ? scrapeFromHtml(page.html, finalUrl) : null;
  const urlMeta = idsFromUrl(
    url,
    pub ? pub.itemIdFromPage : null,
    pub?.signals?.productId ?? null,
  );
  const finalMeta = idsFromUrl(
    finalUrl,
    urlMeta.itemId,
    urlMeta.productId,
  );

  const effectiveItemId = finalMeta.itemId ?? urlMeta.itemId;
  const effectiveProductId = finalMeta.productId ?? urlMeta.productId;
  const effectiveSellerId = finalMeta.sellerIdFromUrl ?? urlMeta.sellerIdFromUrl ?? pub?.signals?.sellerIdFromUrl ?? null;
  const effectiveTitle = pub?.title ?? finalMeta.slugTitle ?? urlMeta.slugTitle ?? null;

  const bundle = await loadBundle(
    effectiveProductId,
    effectiveItemId,
    bearer,
    pub?.signals ?? null,
    pub?.price ?? null,
    effectiveTitle,
    effectiveSellerId,
    pub?.galleryImages ?? [],
  );

  const priceKnown =
    num(bundle.item?.price) !== null ||
    num(bundle.winner?.price) !== null ||
    bundle.refPriceFromSimilar !== null ||
    (pub && pub.price !== null);
  const soldKnown =
    num(bundle.item?.sold_quantity) !== null ||
    Boolean(pub?.soldMarker) ||
    pub?.signals?.soldExact !== null;
  if (!priceKnown || !soldKnown) {
    const alt = await publicFromJina(finalUrl);
    if (alt) pub = pub ? mergeScraped(pub, alt) : alt;
  }

  if (!bundle.item && !bundle.product && !(pub && pub.title) && !effectiveTitle) {
    throw new HttpError(
      404,
      'Não foi possível identificar este anúncio. Confira se o link está completo e é público.',
    );
  }

  return { mode: 'dossier', dossier: buildDossier(bundle, pub, finalUrl, notes) };
}

async function analyzeAnnouncementCode(code: string, bearer: string | null): Promise<Analysis> {
  const itemUrl = `https://produto.mercadolivre.com.br/${code.replace(/^MLB/i, 'MLB-')}`;
  const catalogUrl = `https://www.mercadolivre.com.br/p/${code}`;
  const [itemPage, catProdCheck] = await Promise.all([
    fetchPage(itemUrl),
    mlFetch(`/products/${code}`, bearer),
  ]);

  const isCatalogProduct = catProdCheck.ok && catProdCheck.data && typeof catProdCheck.data === 'object';
  let pub: Scraped | null = null;
  let pageUrl = isCatalogProduct ? catalogUrl : itemPage.finalUrl || itemUrl;

  if (itemPage.ok && itemPage.html) {
    pub = scrapeFromHtml(itemPage.html, itemPage.finalUrl || itemUrl);
  }
  if (!pub?.title && isCatalogProduct) {
    const catPage = await fetchPage(catalogUrl);
    if (catPage.ok && catPage.html) {
      pub = scrapeFromHtml(catPage.html, catPage.finalUrl || catalogUrl);
      pageUrl = catPage.finalUrl || catalogUrl;
    }
  }

  const bundle = isCatalogProduct
    ? await loadBundle(
        code,
        null,
        bearer,
        pub?.signals ?? null,
        pub?.price ?? null,
        pub?.title ?? null,
        null,
        pub?.galleryImages ?? [],
      )
    : await loadBundle(
        null,
        code,
        bearer,
        pub?.signals ?? null,
        pub?.price ?? null,
        pub?.title ?? null,
        null,
        pub?.galleryImages ?? [],
      );

  if (!bundle.item && !bundle.product && !(pub && pub.title)) {
    throw new HttpError(404, `O código ${code} não foi encontrado no Mercado Livre.`);
  }

  return { mode: 'dossier', dossier: buildDossier(bundle, pub, pageUrl, []) };
}

function normalizeSearchMode(raw: string | null): SearchMode {
  if (raw === 'termo' || raw === 'anuncio' || raw === 'categoria') return raw;
  return 'auto';
}

async function analyzeInput(
  input: string,
  bearer: string | null,
  searchMode: SearchMode = 'auto',
): Promise<Analysis> {
  const ref = classifyInput(input, searchMode);

  if (ref.kind === 'keyword') {
    const r = await keywordResults(ref.q, bearer);
    return { mode: 'keyword', query: ref.q, products: r.products, keywords: r.keywords, note: r.note };
  }

  if (ref.kind === 'category') {
    return analyzeCategory(ref.categoryId, bearer);
  }

  if (ref.kind === 'mlbu') {
    return analyzeUrl(ref.url, bearer);
  }

  if (ref.kind === 'code') {
    return analyzeAnnouncementCode(ref.code, bearer);
  }

  if (ref.kind === 'mlb_auto') {
    if (ref.digitsCount <= 7) {
      const catCheck = await fetchCategory(ref.code, bearer);
      if (catCheck && str(catCheck.name)) {
        return analyzeCategory(ref.code, bearer);
      }
      return analyzeAnnouncementCode(ref.code, bearer);
    }
    try {
      return await analyzeAnnouncementCode(ref.code, bearer);
    } catch (err) {
      const catCheck = await fetchCategory(ref.code, bearer);
      if (catCheck && str(catCheck.name)) {
        return analyzeCategory(ref.code, bearer);
      }
      throw err;
    }
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

    const mode = normalizeSearchMode(params.get('mode'));
    const data = await analyzeInput(params.get('q') ?? '', bearer, mode);
    return json({ ok: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const type = req.headers.get('content-type') ?? '';
    if (type.includes('application/json')) return await handleOAuth(req);
    throw new HttpError(415, 'Use application/json (OAuth).');
  } catch (e) {
    return errorResponse(e);
  }
}

import { NextRequest, NextResponse } from 'next/server';

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
const USER_TTL_MS = 10 * 60 * 1000;
const CURRENT_YEAR = new Date().getFullYear();

/** Foto real de produto: exige D_NQ_NP_ e o padrão -MLB..._MMYYYY-X.ext (descarta banners promocionais). */
const PHOTO_RE = /D_NQ_NP_.*?-MLB\d+_(\d{2})(\d{4})-[A-Za-z]\.(?:webp|jpe?g|png)/i;

const LISTING_LABEL: Record<string, string> = { gold_special: 'Clássico', gold_pro: 'Premium' };
const MEDAL_LABEL: Record<string, string> = { platinum: 'Platinum', gold: 'Gold', silver: 'Prata' };

type AnyObj = Record<string, any>;
type MLResponse = { ok: boolean; status: number; data: any };

type Photo = { url: string; photoId: string; month: number; year: number };

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
};

type Bundle = {
  productId: string | null;
  itemId: string | null;
  product: AnyObj | null;
  item: AnyObj | null;
  winner: AnyObj | null;
  reviews: AnyObj | null;
  seller: SellerInfo | null;
  sellerRaw: AnyObj | null;
  competitors: CompetitorRow[];
  competitorsRaw: AnyObj[];
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
  raw: AnyObj;
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

function json(data: AnyObj, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function errorResponse(e: unknown) {
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
  const m = marker.match(/\d[\d.,]*/);
  if (!m) return null;
  const base = Number(m[0].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(base)) return null;
  return Math.round(/mil/i.test(marker) ? base * 1000 : base);
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

const priceAsc = (a: AnyObj, b: AnyObj) =>
  (num(a.price) ?? Number.MAX_SAFE_INTEGER) - (num(b.price) ?? Number.MAX_SAFE_INTEGER);

function listingLabel(id: unknown): string | null {
  return typeof id === 'string' ? LISTING_LABEL[id] ?? id : null;
}

function attr(obj: AnyObj | null | undefined, id: string): string | null {
  const list: AnyObj[] = Array.isArray(obj?.attributes) ? obj?.attributes : [];
  const hit = list.find((a) => a?.id === id);
  return typeof hit?.value_name === 'string' ? hit.value_name : null;
}

function urlsOf(pictures: AnyObj[]): string[] {
  return pictures
    .map((p) => (typeof p === 'string' ? p : p?.secure_url ?? p?.url))
    .filter((u): u is string => typeof u === 'string');
}

/** Converte para a versão HD (-O.webp) e força https. */
function toHD(url: string): string {
  return url
    .replace(/^http:\/\//i, 'https://')
    .split('?')[0]
    .replace(/-[A-Za-z]\.(?:webp|jpe?g|png)$/i, '-O.webp');
}

/** Mantém apenas fotos reais de produto e extrai a data de upload do padrão _MMYYYY. */
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
    const file = (raw.split('?')[0].split('/').pop() ?? raw).replace(
      /-[A-Za-z]\.(?:webp|jpe?g|png)$/i,
      '',
    );
    if (seen.has(file)) continue;
    seen.add(file);
    out.push({ url: toHD(raw), photoId: file, month, year });
  }
  return out;
}

function earliestPhoto(photos: Photo[]): Photo | null {
  if (photos.length === 0) return null;
  return photos.reduce((a, b) => (b.year * 12 + b.month < a.year * 12 + a.month ? b : a));
}

function createdSourceLabel(item: AnyObj | null, product: AnyObj | null): string {
  if (item?.date_created) return 'API Oficial (anúncio)';
  if (product?.date_created) return 'API Oficial (catálogo)';
  return 'Oculto no anúncio';
}

/* =============================================================================
 * TOKENS OAUTH
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

/** Token de aplicação (client_credentials), com cache em memória até perto da expiração. */
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
    // Token de usuário expirado ou inválido: repete a chamada com o token de aplicação.
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
  return r.ok ? (r.data as AnyObj) : null;
}

/* =============================================================================
 * VENDEDOR (cache de 10 min)
 * ============================================================================= */

const userCache = new Map<number, { at: number; raw: AnyObj | null }>();

function toSeller(u: AnyObj | null): SellerInfo | null {
  if (!u) return null;
  const rep: AnyObj = u.seller_reputation ?? {};
  const power = typeof rep.power_seller_status === 'string' ? rep.power_seller_status : null;
  const addr: AnyObj = u.address ?? {};
  const reg = typeof u.registration_date === 'string' ? u.registration_date : null;
  return {
    id: num(u.id),
    nickname: typeof u.nickname === 'string' ? u.nickname : null,
    registrationDate: reg,
    accountYears: yearsSince(reg),
    city: typeof addr.city === 'string' ? addr.city : null,
    state: typeof addr.state === 'string' ? addr.state : null,
    medal: power ? MEDAL_LABEL[power] ?? power : 'Sem medalha',
    completedSales: num(rep.transactions?.completed),
  };
}

async function sellerData(
  id: number | null,
  bearer: string | null,
): Promise<{ info: SellerInfo | null; raw: AnyObj | null }> {
  if (id === null) return { info: null, raw: null };
  const hit = userCache.get(id);
  let raw: AnyObj | null;
  if (hit && Date.now() - hit.at < USER_TTL_MS) {
    raw = hit.raw;
  } else {
    const r = await mlFetch(`/users/${id}`, bearer);
    raw = r.ok ? (r.data as AnyObj) : null;
    userCache.set(id, { at: Date.now(), raw });
  }
  return { info: toSeller(raw), raw };
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

type ComposeInput = {
  product: AnyObj | null;
  item: AnyObj | null;
  winner: AnyObj | null;
  seller: SellerInfo | null;
  productId: string | null;
  itemId: string | null;
};

function composeSummary(c: ComposeInput): ProductSummary {
  const { product: p, item, winner } = c;
  const sh: AnyObj = item?.shipping ?? winner?.shipping ?? {};
  const pictures: AnyObj[] = (p?.pictures?.length ? p.pictures : item?.pictures) ?? [];
  const photos = extractPhotos(urlsOf(pictures));
  const first = earliestPhoto(photos);
  const createdAt: string | null = item?.date_created ?? p?.date_created ?? null;
  return {
    productId: c.productId,
    itemId: c.itemId,
    title: p?.name ?? item?.title ?? 'Sem título',
    brand: attr(p, 'BRAND') ?? attr(item, 'BRAND'),
    model: attr(p, 'MODEL') ?? attr(item, 'MODEL'),
    image: photos[0]?.url ?? null,
    price: num(winner?.price) ?? num(item?.price),
    soldQuantity: num(item?.sold_quantity),
    listingType: listingLabel(item?.listing_type_id ?? winner?.listing_type_id),
    fulfillment: sh.logistic_type === 'fulfillment',
    freeShipping: sh.free_shipping === true,
    createdAt,
    createdSource: createdSourceLabel(item, p),
    daysOnAir: daysSince(createdAt),
    firstPhotoDate: first ? `${pad2(first.month)}/${first.year}` : null,
    seller: c.seller,
    permalink: item?.permalink ?? null,
  };
}

async function summaryFromProduct(
  productId: string,
  bearer: string | null,
): Promise<ProductSummary | null> {
  const pr = await mlFetch(`/products/${productId}`, bearer);
  if (!pr.ok) return null;
  const product = pr.data as AnyObj;
  const winner: AnyObj | null = product.buy_box_winner ?? null;
  const wid = winner?.item_id;
  let itemId: string | null = typeof wid === 'string' ? wid : null;
  if (!itemId) {
    // Sem buy box: usa a oferta mais barata do catálogo.
    const its = await mlFetch(`/products/${productId}/items`, bearer);
    const cheapest = [...listOf(its.data)].sort(priceAsc)[0];
    const cid = cheapest?.item_id;
    itemId = typeof cid === 'string' ? cid : null;
  }
  const item = itemId ? await fetchItem(itemId, bearer) : null;
  const sellerId = num(winner?.seller_id) ?? num(item?.seller_id);
  const { info } = await sellerData(sellerId, bearer);
  return composeSummary({ product, item, winner, seller: info, productId, itemId });
}

async function summaryFromItem(itemId: string, bearer: string | null): Promise<ProductSummary | null> {
  const item = await fetchItem(itemId, bearer);
  if (!item) return null;
  const cpid = item.catalog_product_id;
  const { info } = await sellerData(num(item.seller_id), bearer);
  return composeSummary({
    product: null,
    item,
    winner: null,
    seller: info,
    productId: typeof cpid === 'string' ? cpid : null,
    itemId,
  });
}

/* =============================================================================
 * BUSCA HÍBRIDA: catálogo oficial primeiro, rota antiga como último recurso
 * ============================================================================= */

async function searchCatalog(
  q: string,
  bearer: string | null,
): Promise<{ productIds: string[]; itemIds: string[]; note: string | null }> {
  const r = await mlFetch(
    `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=12`,
    bearer,
  );
  const results: AnyObj[] = Array.isArray(r.data?.results) ? r.data.results : [];
  const productIds = results.map((x) => x?.id).filter((x): x is string => typeof x === 'string');
  if (productIds.length > 0) return { productIds, itemIds: [], note: null };

  const f = await mlFetch(`/sites/MLB/search?q=${encodeURIComponent(q)}&limit=12`, bearer);
  const fr: AnyObj[] = Array.isArray(f.data?.results) ? f.data.results : [];
  const itemIds = fr.map((x) => x?.id).filter((x): x is string => typeof x === 'string');
  if (f.ok && itemIds.length > 0) {
    return {
      productIds: [],
      itemIds,
      note: 'Resultados obtidos via /sites/MLB/search (requer OAuth de usuário).',
    };
  }
  return {
    productIds: [],
    itemIds: [],
    note:
      f.status === 403
        ? 'Rota /sites/MLB/search bloqueada (403). Autorize sua conta ML (OAuth) para liberar a busca completa.'
        : null,
  };
}

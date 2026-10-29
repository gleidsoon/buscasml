import { NextRequest, NextResponse } from 'next/server';

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
/* =============================================================================
 * ENTRADA: palavra-chave, código MLB ou link
 * ============================================================================= */

type MLRef =
  | { kind: 'keyword'; q: string }
  | { kind: 'code'; code: string }
  | { kind: 'url'; url: string };

type PageFetch = { ok: boolean; status: number; finalUrl: string; html: string };

type Analysis =
  | { mode: 'keyword'; query: string; products: ProductSummary[]; note: string | null }
  | { mode: 'dossier'; dossier: Dossier };

const ML_HOST_RE = /(^|\.)(mercadolivre\.com\.br|mercadolivre\.com|mercadolibre\.com\.br|meli\.la)$/i;

function classifyInput(raw: string): MLRef {
  const input = raw.trim();
  if (input === '') {
    throw new HttpError(400, 'Informe uma palavra-chave, um código MLB ou um link do Mercado Livre.');
  }
  if (/^MLBU/i.test(input)) {
    throw new HttpError(400, 'Para códigos MLBU, cole o link completo do anúncio (/up/MLBU...).');
  }
  const code = input.match(/^MLB-?(\d{6,})$/i);
  if (code) return { kind: 'code', code: `MLB${code[1]}` };

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

/** Extrai IDs do caminho ou do parâmetro wid. Links /p/ são de catálogo; os demais, de anúncio. */
function idsFromUrl(
  url: string,
  fallbackItem: string | null,
): { productId: string | null; itemId: string | null } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { productId: null, itemId: fallbackItem };
  }
  const product = parsed.pathname.match(/\/p\/(MLB\d{6,})/i);
  const wid = (parsed.searchParams.get('wid') ?? parsed.searchParams.get('item_id') ?? '').match(
    /MLB-?(\d{8,})/i,
  );
  const fromPath = product ? null : parsed.pathname.match(/MLB-?(\d{8,})/i);
  const digits = wid?.[1] ?? fromPath?.[1] ?? null;
  return {
    productId: product ? product[1].toUpperCase() : null,
    itemId: digits ? `MLB${digits}` : fallbackItem,
  };
}

/* =============================================================================
 * LEITURA DA PÁGINA PÚBLICA (HTML, JSON-LD, OpenGraph e r.jina.ai)
 * Redirecionamentos de meli.la, /sec/ e /social/ são seguidos pelo fetch.
 * ============================================================================= */

async function fetchPage(url: string): Promise<PageFetch> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
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
      // Bloco JSON-LD malformado: ignorado, os demais metadados continuam válidos.
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
  };
}

function scrapeFromHtml(html: string): Scraped {
  const s = emptyScraped();
  s.sources.push('HTML público do anúncio');

  const product = findProductNode(ldJsonBlocks(html));
  const offer = offerOf(product);
  const sellerObj = offer?.seller;
  const ldSeller = typeof sellerObj?.name === 'string' ? sellerObj.name : null;
  const ldTitle = typeof product?.name === 'string' ? product.name : null;
  s.title = cleanTitle(ldTitle ?? metaContent(html, 'og:title'));

  const px = htmlPrices(html);
  s.price = num(offer?.price) ?? num(metaContent(html, 'product:price:amount')) ?? px.current;
  s.originalPrice = px.original;

  const agg: AnyObj = product?.aggregateRating ?? {};
  s.rating = num(agg.ratingValue);
  s.reviewsCount = num(agg.reviewCount) ?? num(agg.ratingCount);

  const sellerHtml = html.match(/Vendido por[\s\S]{0,200}?>([^<>]{2,60})</i);
  const htmlSeller = sellerHtml ? decodeEntities(sellerHtml[1]).trim() : '';
  s.sellerName = ldSeller ?? (htmlSeller !== '' ? htmlSeller : null);

  applyTextMarkers(s, visibleText(html));

  const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? '';
  const canonDigits = canon.includes('/p/') ? null : (canon.match(/MLB-?(\d{8,})/i)?.[1] ?? null);
  const jsonDigits = html.match(/"item_id"\s*:\s*"MLB-?(\d{8,})"/i)?.[1] ?? null;
  const digits = canonDigits ?? jsonDigits;
  s.itemIdFromPage = digits ? `MLB${digits}` : null;

  const ogImage = metaContent(html, 'og:image');
  const candidates = [
    ...asList(product?.image),
    ...(ogImage ? [ogImage] : []),
    ...imageUrlsIn(html.replace(/\\\//g, '/')),
  ];
  s.photos = extractPhotos(candidates);
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
    sources: [...base.sources, ...extra.sources],
  };
}

/* =============================================================================
 * MONTAGEM DO DOSSIÊ RAIO-X
 * ============================================================================= */

function sellerFromPublic(name: string): SellerInfo {
  return {
    id: null,
    nickname: name,
    registrationDate: null,
    accountYears: null,
    city: null,
    state: null,
    medal: 'Oculto no anúncio',
    completedSales: null,
  };
}

/** Carrega item, catálogo, vencedor do buy box, ofertas concorrentes, reputação e avaliações. */
async function loadBundle(
  productIdIn: string | null,
  itemIdIn: string | null,
  bearer: string | null,
): Promise<Bundle> {
  const itemFirst = itemIdIn ? await fetchItem(itemIdIn, bearer) : null;
  const catalogRaw = itemFirst?.catalog_product_id;
  const productId = productIdIn ?? (typeof catalogRaw === 'string' ? catalogRaw : null);

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

  const winnerIdRaw = winner?.item_id;
  const cheapestIdRaw = [...competitorsRaw].sort(priceAsc)[0]?.item_id;
  const fallbackId =
    typeof winnerIdRaw === 'string'
      ? winnerIdRaw
      : typeof cheapestIdRaw === 'string'
        ? cheapestIdRaw
        : null;
  const resolvedItemId = itemIdIn ?? fallbackId;
  const item = itemIdIn ? itemFirst : resolvedItemId ? await fetchItem(resolvedItemId, bearer) : null;

  let reviews: AnyObj | null = null;
  if (resolvedItemId) {
    const rv = await mlFetch(`/reviews/item/${resolvedItemId}`, bearer);
    if (rv.ok && rv.data && typeof rv.data === 'object') reviews = rv.data as AnyObj;
  }

  const sellerId = num(item?.seller_id) ?? num(winner?.seller_id);
  const seller = await sellerData(sellerId, bearer);
  const competitors = await competitorRows(competitorsRaw, bearer);

  return {
    productId,
    itemId: resolvedItemId,
    product,
    item,
    winner,
    reviews,
    seller: seller.info,
    sellerRaw: seller.raw,
    competitors,
    competitorsRaw,
  };
}

function buildDossier(
  b: Bundle,
  pub: Scraped | null,
  pageUrl: string | null,
  baseNotes: string[],
): Dossier {
  const product: AnyObj | null = b.product;
  const item: AnyObj | null = b.item;
  const winner: AnyObj | null = b.winner;
  const sh: AnyObj = item?.shipping ?? winner?.shipping ?? {};
  const notes: string[] = [...baseNotes];

  const hasApi = item !== null || product !== null;
  const origin = hasApi ? (pub ? 'API Oficial + Página pública' : 'API Oficial') : 'Página pública';

  // Fotos: somente imagens reais de produto (D_NQ_NP_ + padrão _MMYYYY), convertidas para -O.webp.
  const productPics: unknown = product?.pictures;
  const itemPics: unknown = item?.pictures;
  const apiPictures: AnyObj[] =
    Array.isArray(productPics) && productPics.length > 0
      ? productPics
      : Array.isArray(itemPics)
        ? itemPics
        : [];
  const photos = dedupePhotos([...extractPhotos(urlsOf(apiPictures)), ...(pub ? pub.photos : [])]);
  const first = earliestPhoto(photos);

  // Preço: prioriza o anúncio analisado; o buy box vence só se o anúncio não tiver preço.
  const itemPrice = num(item?.price);
  const winnerPrice = num(winner?.price);
  const price = itemPrice ?? winnerPrice ?? (pub ? pub.price : null);
  const originalPrice = num(item?.original_price) ?? (pub ? pub.originalPrice : null);
  const discountPct =
    price !== null && originalPrice !== null && originalPrice > price
      ? Math.round((1 - price / originalPrice) * 100)
      : null;

  // Vendas: API Oficial primeiro; marcador público como piso mínimo; caso contrário, oculto.
  const apiSold = num(item?.sold_quantity);
  let soldValue: number | null;
  let soldLabel: string;
  let soldSource: string;
  if (apiSold !== null) {
    soldValue = apiSold;
    soldLabel = `${apiSold.toLocaleString('pt-BR')} vendidos`;
    soldSource = 'API Oficial';
  } else if (pub && pub.soldMarker) {
    soldValue = pub.soldMin;
    soldLabel = pub.soldMarker;
    soldSource = 'Marcador público da página';
    notes.push(`O marcador "${pub.soldMarker}" é um piso mínimo, não o total exato de vendas.`);
  } else {
    soldValue = null;
    soldLabel = 'Oculto no anúncio';
    soldSource = 'Oculto no anúncio';
  }

  const reviewsObj = b.reviews;
  const ratingAverage = num(reviewsObj?.rating_average) ?? (pub ? pub.rating : null);
  const ratingCount = num(reviewsObj?.paging?.total) ?? (pub ? pub.reviewsCount : null);

  const logisticRaw = sh.logistic_type;
  const logisticType = typeof logisticRaw === 'string' ? logisticRaw : null;
  const fulfillment = logisticType === 'fulfillment';
  const freeShipping = sh.free_shipping === true;

  const createdRaw = item?.date_created;
  const createdAt = typeof createdRaw === 'string' ? createdRaw : null;
  const createdSource = createdAt ? 'API Oficial (anúncio)' : 'Oculto no anúncio';
  const daysOnAir = daysSince(createdAt);
  if (!createdAt && typeof product?.date_created === 'string') {
    notes.push('A data do catálogo está disponível, mas a data de criação deste anúncio está oculta.');
  }

  const firstPhotoDate = first ? `${pad2(first.month)}/${first.year}` : null;
  const firstPhotoSource = first ? 'Assinatura da Foto CDN ML' : 'Oculto no anúncio';

  const pubSeller = pub ? pub.sellerName : null;
  const seller: SellerInfo | null = b.seller ?? (pubSeller ? sellerFromPublic(pubSeller) : null);
  if (!b.seller && pubSeller) {
    notes.push('Idade da conta, cidade e medalha do vendedor exigem a API de usuários; exibindo apenas o nome da página.');
  }

  const productName = product?.name;
  const itemTitle = item?.title;
  const title: string =
    typeof productName === 'string'
      ? productName
      : typeof itemTitle === 'string'
        ? itemTitle
        : (pub?.title ?? 'Sem título');

  const permalinkRaw = item?.permalink;
  const permalink = typeof permalinkRaw === 'string' ? permalinkRaw : pageUrl;

  const curRaw = item?.currency_id ?? winner?.currency_id;
  const currency = typeof curRaw === 'string' ? curRaw : 'BRL';

  if (!item) {
    notes.push('O anúncio individual não retornou dados pela API; alguns campos vêm do catálogo ou da página pública.');
  }
  if (!item && !winner) {
    notes.push('Logística (Full e frete grátis) não disponível sem os dados da API.');
  }
  if (itemPrice === null && winnerPrice === null && pub && pub.price !== null) {
    notes.push('Preço obtido da página pública, pois a API não o retornou.');
  }
  if (b.productId && b.competitors.length === 0) {
    notes.push('Nenhuma oferta concorrente foi retornada para este catálogo.');
  }
  notes.push(
    'A receita dos últimos 30 dias não é pública: exige OAuth do próprio vendedor. A média diária é calculada desde a criação do anúncio.',
  );

  return {
    origin,
    productId: b.productId,
    itemId: b.itemId,
    permalink,
    title,
    brand: attr(product, 'BRAND') ?? attr(item, 'BRAND'),
    model: attr(product, 'MODEL') ?? attr(item, 'MODEL'),
    images: photos.slice(0, 12).map((p) => p.url),
    price,
    originalPrice,
    discountPct,
    currency,
    listingType: listingLabel(item?.listing_type_id ?? winner?.listing_type_id),
    soldValue,
    soldLabel,
    soldSource,
    ratingAverage,
    ratingCount,
    fulfillment,
    freeShipping,
    logisticType,
    createdAt,
    createdSource,
    daysOnAir,
    firstPhotoDate,
    firstPhotoSource,
    seller,
    competitors: b.competitors,
    notes,
    raw: {
      product,
      item,
      buy_box_winner: winner,
      reviews: reviewsObj,
      seller: b.sellerRaw,
      competitors: b.competitorsRaw,
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

async function keywordResults(
  q: string,
  bearer: string | null,
): Promise<{ products: ProductSummary[]; note: string | null }> {
  const found = await searchCatalog(q, bearer);
  const fromProducts = await mapLimit(found.productIds, 4, (pid) => summaryFromProduct(pid, bearer));
  const fromItems = await mapLimit(found.itemIds, 4, (iid) => summaryFromItem(iid, bearer));
  const products = [...fromProducts, ...fromItems].filter((p): p is ProductSummary => p !== null);
  return { products, note: found.note };
}

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

  const htmlPub = page.ok && page.html ? scrapeFromHtml(page.html) : null;
  const ids = idsFromUrl(finalUrl, htmlPub ? htmlPub.itemIdFromPage : null);
  const bundle = await loadBundle(ids.productId, ids.itemId, bearer);

  let pub: Scraped | null = htmlPub;
  const priceKnown = num(bundle.item?.price) !== null || num(bundle.winner?.price) !== null;
  const soldKnown = num(bundle.item?.sold_quantity) !== null;
  if (!priceKnown || !soldKnown) {
    const alt = await publicFromJina(finalUrl);
    if (alt) pub = pub ? mergeScraped(pub, alt) : alt;
    else notes.push('A leitura alternativa da página está indisponível no momento.');
  }

  if (!bundle.item && !bundle.product && !(pub && pub.title)) {
    throw new HttpError(404, 'Não foi possível identificar este anúncio. Confira se o link está completo e é público.');
  }

  return { mode: 'dossier', dossier: buildDossier(bundle, pub, finalUrl, notes) };
}

async function analyzeInput(input: string, bearer: string | null): Promise<Analysis> {
  const ref = classifyInput(input);

  if (ref.kind === 'keyword') {
    const r = await keywordResults(ref.q, bearer);
    return { mode: 'keyword', query: ref.q, products: r.products, note: r.note };
  }

  if (ref.kind === 'code') {
    // Código pode ser de anúncio (item) ou de catálogo (produto): tenta anúncio primeiro.
    const byItem = await loadBundle(null, ref.code, bearer);
    const bundle = byItem.item ? byItem : await loadBundle(ref.code, null, bearer);
    if (!bundle.item && !bundle.product) {
      throw new HttpError(404, `O código ${ref.code} não foi encontrado no Mercado Livre.`);
    }
    return { mode: 'dossier', dossier: buildDossier(bundle, null, null, []) };
  }

  return analyzeUrl(ref.url, bearer);
}
/* =============================================================================
 * OAUTH 2.0: authorization_code e refresh_token
 * O client_secret fica somente no servidor. Os tokens do usuário vão ao navegador
 * (localStorage) e voltam nas requisições pelo cabeçalho x-ml-user-token.
 * ============================================================================= */

type OAuthBody = {
  action?: unknown;
  code?: unknown;
  redirectUri?: unknown;
  refreshToken?: unknown;
};

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
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    expiresAt: Date.now() + expiresIn * 1000,
    userId: num(data.user_id),
    scope: typeof data.scope === 'string' ? data.scope : null,
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
 * Exige ANTHROPIC_API_KEY. Sem ela, retorna erro claro em vez de um palpite.
 * ============================================================================= */

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const PHOTO_PROMPT = [
  'Você identifica produtos para pesquisa no Mercado Livre Brasil.',
  'Olhe a imagem e descreva o produto principal como uma busca curta em português (de 2 a 6 palavras), incluindo marca e modelo somente se estiverem visíveis ou escritos na imagem.',
  'Não invente marca, modelo, cor ou tamanho que não estejam visíveis.',
  'Se não houver produto identificável, devolva "query" vazio.',
  'Responda SOMENTE com JSON válido, sem markdown, neste formato:',
  '{"query": "...", "confidence": "alta | média | baixa", "reason": "frase curta explicando o que foi visto"}',
].join('\n');

type Identified = { query: string; confidence: string; reason: string };

function isUploadedFile(v: FormDataEntryValue | null): v is File {
  return typeof v === 'object' && v !== null && typeof (v as Blob).arrayBuffer === 'function';
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
      model: process.env.ANTHROPIC_VISION_MODEL || 'claude-haiku-5-5',
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
    const detail = body.error?.message ?? 'HTTP ' + res.status;
    throw new HttpError(502, 'Falha na identificação da imagem: ' + detail);
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
    visionModel: process.env.ANTHROPIC_VISION_MODEL || 'claude-haiku-5-5',
  };
}

/* =============================================================================
 * HANDLERS HTTP
 * GET  /api/ml?q=...                  busca por palavra-chave, código MLB ou link
 * GET  /api/ml?action=status          diagnóstico das configurações
 * POST /api/ml (multipart, campo image) identifica o produto na foto e pesquisa
 * POST /api/ml (JSON)                 OAuth: { action: "exchange" | "refresh", ... }
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

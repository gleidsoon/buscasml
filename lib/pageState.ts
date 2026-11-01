/* =============================================================================
 * EXTRAÇÃO DO ESTADO DA PÁGINA DO MERCADO LIVRE (HTML -> sinais estruturados)
 * Fontes, em ordem de prioridade:
 *   1. <script id="__PRELOADED_STATE__">            (initialState)
 *   2. <script id="__NORDIC_RENDERING_CTX__"> _n.ctx.r = {...}  (appProps.pageProps.initialState)
 *   3. melidata("add", "event_data", {...}) e melidata("send", "view", {...})
 *   4. <script type="application/ld+json"> e "start_time" em scripts embutidos
 *   5. Seletores de DOM/CSS mapeados da página de produto e da busca (via regex)
 * ============================================================================= */

type AnyObj = Record<string, any>;

export type PolyItem = {
  id: string;
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  soldQuantity: number | null;
  soldText: string | null;
  rating: number | null;
  reviewsCount: number | null;
  permalink: string | null;
  image: string | null;
  isFull: boolean;
  isSponsored: boolean;
  productId: string | null;
};

export type PageSignals = {
  sources: string[];
  pageType: 'product' | 'catalog' | 'search' | 'category' | 'unknown';
  itemId: string | null;
  productId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  listingTypeId: string | null;
  logisticType: string | null;
  freeShipping: boolean | null;
  isFull: boolean;
  isSupermarket: boolean;
  soldText: string | null;
  soldExact: number | null;
  soldExactSource: string | null;
  availableQuantity: number | null;
  stockText: string | null;
  startTime: string | null;
  startTimeSource: string | null;
  rating: number | null;
  reviewsCount: number | null;
  sellerId: number | null;
  sellerName: string | null;
  powerSellerStatus: string | null;
  reputationLevel: string | null;
  officialStoreId: number | null;
  catalogSellers: number | null;
  polycards: PolyItem[];
};

/** Seletores do PDP e da busca usados na leitura do HTML (classes do ML). */
export const ML_SELECTORS = {
  PRODUCT_HEADER: '.ui-pdp-header',
  PRODUCT_SUBTITLE: '.ui-pdp-subtitle',
  PRODUCT_HEADER_SUBTITLE: '.ui-pdp-header__subtitle',
  BUYBOX_QUANTITY_AVAILABLE: '.ui-pdp-buybox__quantity__available',
  BUYBOX_QUANTITY: '.ui-pdp-buybox__quantity',
  CATALOG_ITEM_ID_INPUT: 'input[name="item_id"]',
  INPUT_NAME_ITEM_ID: 'input[name=itemId]',
  CATALOG_TABLE: '.ui-pdp-table.ui-pdp-s-table',
  CATALOG_SELLER_SUBTITLE: '.ui-pdp-seller__header__subtitle',
  SELLER_DATA: '.ui-seller-data.ui-box-component.ui-box-component-seller-data',
  SELLER_DATA_HEADER_TITLE: '.ui-seller-data-header__title',
  BREADCRUMB_ITEM_NAME: '.andes-breadcrumb__item [itemprop="name"]',
  META_PRICE: 'meta[itemprop="price"]',
  META_RATING: 'meta[itemprop="ratingValue"]',
  META_DATE_PUBLISHED: 'meta[itemprop="datePublished"], meta[property="product:release_date"]',
  TIME_DATETIME: 'time[datetime]',
  POLY_REVIEWS: '.poly-component__reviews, .poly-reviews__amount, .poly-reviews',
  POLY_FULL: 'svg[aria-label*="FULL" i], use[href="#poly_full"]',
  REVIEW_AMOUNT: '.ui-pdp-review__amount',
  REVIEW_RATING: '.ui-pdp-review__rating',
  BADGE_CONTENT: '.andes-badge__content',
} as const;

/* ---------- utilitários ---------- */

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

function obj(v: unknown): AnyObj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as AnyObj) : null;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function textOf(fragment: string): string {
  return decode(fragment.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeMlb(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.toUpperCase().match(/^(MLB[A-Z]*)[- ]?(\d+)$/);
  return m ? `${m[1]}${m[2]}` : null;
}

/** Lê um objeto JSON balanceado a partir da posição de uma chave "{". */
export function balancedJsonAt(text: string, start: number): AnyObj | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let quote = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
    } else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, i + 1));
          return obj(parsed);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function scriptById(html: string, id: string): string | null {
  const re = new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</script>`, 'i');
  return html.match(re)?.[1] ?? null;
}

/** Busca em profundidade a primeira ocorrência de uma chave (limite de nós para segurança). */
function findDeep(root: unknown, key: string, maxNodes = 40_000): unknown {
  const stack: unknown[] = [root];
  let visited = 0;
  while (stack.length > 0 && visited < maxNodes) {
    const cur = stack.pop();
    visited++;
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (let i = cur.length - 1; i >= 0; i--) stack.push(cur[i]);
      continue;
    }
    const o = cur as AnyObj;
    if (Object.prototype.hasOwnProperty.call(o, key) && o[key] !== null && o[key] !== undefined) return o[key];
    for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
  }
  return undefined;
}

function at(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split('.')) {
    const o = obj(cur);
    if (!o) return undefined;
    cur = o[part];
  }
  return cur;
}

/* ---------- 1 e 2: estado inicial da página ---------- */

export function readPreloadedState(html: string): AnyObj | null {
  const raw = scriptById(html, '__PRELOADED_STATE__');
  if (!raw) return null;
  try {
    const parsed = obj(JSON.parse(decode(raw.trim())));
    if (!parsed) return null;
    return (
      obj(parsed.initialState) ??
      obj(at(parsed, 'pageState.initialState')) ??
      obj(at(parsed, 'ctx.r.appProps.initialState')) ??
      parsed
    );
  } catch {
    return null;
  }
}

export function readNordicContext(html: string): AnyObj | null {
  const raw = scriptById(html, '__NORDIC_RENDERING_CTX__') ?? html;
  const m = raw.match(/_n\.ctx\.r\s*=\s*\{/);
  if (!m || m.index === undefined) return null;
  const ctx = balancedJsonAt(raw, m.index + m[0].length - 1);
  if (!ctx) return null;
  return obj(at(ctx, 'appProps.pageProps.initialState')) ?? obj(at(ctx, 'appProps.pageProps')) ?? null;
}

/* ---------- 3: melidata ---------- */

export function readMelidata(html: string): { eventData: AnyObj | null; view: AnyObj | null } {
  const pick = (re: RegExp): AnyObj | null => {
    const m = re.exec(html);
    if (!m || m.index === undefined) return null;
    return balancedJsonAt(html, m.index + m[0].length - 1);
  };
  return {
    eventData: pick(/melidata\(\s*["']add["']\s*,\s*["']event_data["']\s*,\s*\{/),
    view: pick(/melidata\(\s*["']send["']\s*,\s*["']view["']\s*,\s*\{/),
  };
}

/* ---------- 4: JSON-LD e start_time ---------- */

export function readLdJson(html: string): AnyObj[] {
  const out: AnyObj[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(m[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const n of nodes) {
        const o = obj(n);
        if (!o) continue;
        if (Array.isArray(o['@graph'])) out.push(...(o['@graph'] as AnyObj[]));
        else out.push(o);
      }
    } catch {
      // Bloco malformado: ignorado.
    }
  }
  return out;
}

function readStartTime(html: string): string | null {
  const m = html.match(/"start_time"\s*:\s*"([^"]+)"/);
  if (!m) return null;
  return Number.isNaN(Date.parse(m[1])) ? null : m[1];
}

/* ---------- 5: seletores (regex sobre o HTML) ---------- */

function classRegex(cls: string): RegExp {
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `<([a-z0-9]+)[^>]*class=["'][^"']*(?:^|\\s|["'])${esc}(?:\\s|["'])[^>]*>([\\s\\S]{0,800}?)</\\1>`,
    'i',
  );
}

/** Texto visível do primeiro elemento com a classe (ex.: ".ui-pdp-subtitle"). */
export function textByClass(html: string, selector: string): string | null {
  for (const part of selector.split(',')) {
    const cls = part.trim().split(/[\s>]/)[0].split('.').filter(Boolean).pop();
    if (!cls) continue;
    const m = html.match(classRegex(cls));
    if (m) {
      const t = textOf(m[2]);
      if (t) return t;
    }
  }
  return null;
}

function metaItemprop(html: string, prop: string): string | null {
  const a = new RegExp(`<meta[^>]+itemprop=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*itemprop=["']${prop}["']`, 'i');
  return str((html.match(a) ?? html.match(b))?.[1]);
}

function metaProperty(html: string, prop: string): string | null {
  const a = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${prop}["']`, 'i');
  return str((html.match(a) ?? html.match(b))?.[1]);
}

function inputValue(html: string, name: string): string | null {
  const a = new RegExp(`<input[^>]+name=["']?${name}["']?[^>]*value=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<input[^>]+value=["']([^"']*)["'][^>]*name=["']?${name}["']?`, 'i');
  return str((html.match(a) ?? html.match(b))?.[1]);
}

/** "(+50 disponíveis)" -> 50 ; "(3 disponíveis)" -> 3 ; "Último disponível!" -> 1 */
export function parseStockText(text: string | null): number | null {
  if (!text) return null;
  if (/[úu]ltim[oa]\s+dispon/i.test(text)) return 1;
  const m = text.match(/\+?\s*(\d[\d.]*)\s*(mil)?\s*dispon/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ''));
  if (!Number.isFinite(n)) return null;
  return m[2] ? n * 1000 : n;
}

const SOLD_REGEX = /\+?([\d.,]+)\s*(mil|m)?\s*vendidos?/i;

function soldTextIn(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(SOLD_REGEX);
  return m ? m[0].trim() : null;
}

function soldCountFromMatch(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(SOLD_REGEX);
  if (!m) return null;
  const raw = m[1].trim();
  const mult = m[2] ? 1000 : 1;
  const normalized =
    mult > 1
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/\./g, '').replace(/,.*$/, '');
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * mult) : null;
}

/** Normaliza qualquer URL ou ID de imagem do ML para https://http2.mlstatic.com/D_NQ_NP_${id}-O.webp */
export function normalizeMlImageUrl(rawUrlOrId: string | null | undefined): string | null {
  const s = str(rawUrlOrId);
  if (!s || /^data:/i.test(s)) return null;
  // Caso seja apenas o ID (ex.: "963201-MLB78912345_092024" ou "615190-MLA99501602606_112025")
  if (/^(?:2X_)?\d+-[A-Z]{2,4}\d+_\d{4,6}$/i.test(s)) {
    const cleanId = s.replace(/^2X_/i, '');
    return `https://http2.mlstatic.com/D_NQ_NP_${cleanId}-O.webp`;
  }
  const idMatch = s.match(/D_(?:NQ_NP_)?(?:2X_)?(\d+-[A-Z]{2,4}\d+_\d{4,6})/i);
  if (idMatch) {
    return `https://http2.mlstatic.com/D_NQ_NP_${idMatch[1]}-O.webp`;
  }
  if (/mlstatic\.com/i.test(s)) {
    return s
      .replace(/^http:\/\//i, 'https://')
      .split('?')[0]
      .replace(/-[A-Za-z]{1,2}\.(?:webp|jpe?g|png)$/i, '-O.webp');
  }
  return null;
}

/** Extrai o código MLB se estiver presente na URL da imagem ou link. */
function mlbFromImageOrUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const fromCatalog = url.match(/\/p\/(MLB\d{6,})/i);
  if (fromCatalog) return fromCatalog[1].toUpperCase();
  const fromLink = url.match(/MLB-?(\d{8,})/i);
  if (fromLink) return `MLB${fromLink[1]}`;
  return null;
}

/** Extrai foto de tags <img> lendo src, data-src e srcset (incluindo .poly-component__picture e .ui-search-result-image__element). */
export function extractHtmlImage(block: string): string | null {
  const imgTags = [...block.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  // Prioriza imagens com as classes de card da busca (.poly-component__picture e .ui-search-result-image__element)
  const prioritized = [
    ...imgTags.filter((tag) => /poly-component__picture|ui-search-result-image__element/i.test(tag)),
    ...imgTags,
  ];
  for (const tag of prioritized) {
    for (const attrName of ['data-src', 'src', 'srcset', 'data-srcset']) {
      const m = tag.match(new RegExp(`\\b${attrName}=["']([^"']+)["']`, 'i'));
      if (!m) continue;
      const rawVal = decode(m[1].trim());
      // Em srcset pode haver "https://... 1x, https://... 2x"
      const parts = rawVal
        .split(',')
        .map((p) => p.trim().split(/\s+/)[0])
        .filter(Boolean);
      for (const candidate of parts.reverse()) {
        if (/^data:|gif$|placeholder|blank/i.test(candidate)) continue;
        const norm = normalizeMlImageUrl(candidate);
        if (norm) return norm;
      }
    }
  }
  const anyMlStatic = block.match(/https?:\/\/http2\.mlstatic\.com\/D_NQ_NP_[^\s"'<>()\\]+/i);
  return anyMlStatic ? normalizeMlImageUrl(anyMlStatic[0]) : null;
}

/** Converte uma string "1.599,90" ou "207" capturada após R$ em número. */
function parseBrlCapture(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const clean = raw.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Converte fração + centavos de um bloco .andes-money-amount ou regex R$ em número. */
function parseAndesMoneyBlock(fragment: string): number | null {
  const withoutStrike = fragment.replace(
    /<(s|del)\b[^>]*>[\s\S]*?<\/\1>|<span[^>]*andes-money-amount--previous[\s\S]*?<\/span>/gi,
    ' ',
  );
  // 1) .poly-price__current .andes-money-amount__fraction
  // 2) .poly-component__price .andes-money-amount__fraction
  // 3) .andes-money-amount__fraction
  const scopePatterns = [
    /class=["'][^"']*poly-price__current[^"']*["'][^>]*>([\s\S]{0,1200})/i,
    /class=["'][^"']*poly-component__price[^"']*["'][^>]*>([\s\S]{0,1500})/i,
  ];
  for (const pat of scopePatterns) {
    const sm = withoutStrike.match(pat);
    if (sm) {
      const v = extractFractionAndCents(sm[1]);
      if (v !== null) return v;
    }
  }
  const byFraction = extractFractionAndCents(withoutStrike);
  if (byFraction !== null) return byFraction;

  // 4) Fallback via regex /R\$\s*([\d.]+(?:,\d{2})?)/ no HTML/texto bruto do card
  const textClean = textOf(withoutStrike);
  const brlMatch =
    textClean.match(/R\$\s*([\d.]+(?:,\d{2})?)/i) ??
    withoutStrike.match(/R\$\s*([\d.]+(?:,\d{2})?)/i);
  return brlMatch ? parseBrlCapture(brlMatch[1]) : null;
}

function extractFractionAndCents(scope: string): number | null {
  const fracMatch = scope.match(/andes-money-amount__fraction[^>]*>\s*([\d.]+)\s*</i);
  if (!fracMatch) return null;
  const whole = Number(fracMatch[1].replace(/\./g, '').trim());
  if (!Number.isFinite(whole) || whole <= 0) return null;
  const afterFrac = scope.slice((fracMatch.index ?? 0) + fracMatch[0].length, (fracMatch.index ?? 0) + fracMatch[0].length + 350);
  const centsMatch = afterFrac.match(/andes-money-amount__cents[^>]*>\s*(\d{1,2})\s*</i);
  const cents = centsMatch ? Number(centsMatch[1].padEnd(2, '0')) / 100 : 0;
  return Math.round((whole + cents) * 100) / 100;
}

function parseOriginalAndesPrice(fragment: string): number | null {
  const prevMatch =
    fragment.match(/<(?:s|del)\b[^>]*andes-money-amount[^>]*>([\s\S]{0,800}?)<\/(?:s|del)>/i) ??
    fragment.match(/class=["'][^"']*andes-money-amount--previous[^"']*["'][^>]*>([\s\S]{0,800})/i);
  if (!prevMatch) return null;
  return extractFractionAndCents(prevMatch[1]);
}

/* ---------- polycards (busca e listas: JSON e HTML) ---------- */

function polyFromResult(r: AnyObj): PolyItem | null {
  const poly = obj(r.polycard) ?? r;
  const meta = obj(poly.metadata) ?? {};
  const components: AnyObj[] = Array.isArray(poly.components) ? poly.components : [];
  const comp = (type: string): AnyObj | null => obj(components.find((c) => obj(c)?.type === type)) ?? null;

  // Foto: polycard.pictures.pictures[0].id ou componente pictures ou thumbnail
  const pictures: AnyObj[] = Array.isArray(at(poly, 'pictures.pictures'))
    ? (at(poly, 'pictures.pictures') as AnyObj[])
    : Array.isArray(at(comp('pictures'), 'pictures.pictures'))
      ? (at(comp('pictures'), 'pictures.pictures') as AnyObj[])
      : Array.isArray(poly.pictures)
        ? (poly.pictures as AnyObj[])
        : [];
  const picId = str(pictures[0]?.id) ?? str(at(poly, 'pictures.id'));
  const picUrl = str(pictures[0]?.url) ?? str(pictures[0]?.secure_url) ?? str(r.thumbnail) ?? str(r.secure_thumbnail);
  const image = picId
    ? `https://http2.mlstatic.com/D_NQ_NP_${picId.replace(/^2X_/i, '')}-O.webp`
    : normalizeMlImageUrl(picUrl);

  const rawUrl = str(meta.url) ?? str(r.permalink);
  const urlParams = str(meta.url_params) ?? '';
  const fullUrl = rawUrl
    ? `${rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`}${urlParams}`
    : null;

  const productId =
    normalizeMlb(meta.product_id) ??
    normalizeMlb(r.catalog_product_id) ??
    (fullUrl?.match(/\/p\/(MLB\d{6,})/i)?.[1]?.toUpperCase() ?? null);

  const id =
    normalizeMlb(meta.id ?? r.id ?? r.item_id) ??
    mlbFromImageOrUrl(fullUrl) ??
    mlbFromImageOrUrl(image) ??
    productId;
  if (!id) return null;

  const title =
    str(comp('title')?.title?.text) ??
    str(at(poly, 'title.text')) ??
    str(r.title) ??
    str(r.name);

  // Preço: varre polycard.components (current_price.value, price.value, amount) e todo o objeto
  const priceComp = obj(comp('price')?.price) ?? obj(poly.price) ?? {};
  let price: number | null =
    num(at(priceComp, 'current_price.value')) ??
    num(at(priceComp, 'price.value')) ??
    num(priceComp.amount) ??
    num(priceComp.value) ??
    num(r.price) ??
    num(at(r, 'sale_price.amount')) ??
    num(at(r, 'buy_box_winner.price'));

  let originalPrice: number | null =
    num(at(priceComp, 'previous_price.value')) ??
    num(at(priceComp, 'original_price.value')) ??
    num(r.original_price) ??
    num(at(r, 'sale_price.regular_amount'));

  if (price === null) {
    for (const c of components) {
      const co = obj(c);
      if (!co) continue;
      const cand =
        num(at(co, 'price.current_price.value')) ??
        num(at(co, 'current_price.value')) ??
        num(at(co, 'price.value')) ??
        num(at(co, 'price.amount')) ??
        num(co.amount) ??
        num(co.value);
      if (cand !== null && cand > 0) {
        price = cand;
        originalPrice ??=
          num(at(co, 'price.previous_price.value')) ?? num(at(co, 'previous_price.value'));
        break;
      }
    }
  }
  if (price === null) {
    const deepCurrent = obj(findDeep(poly, 'current_price', 4_000));
    price = num(deepCurrent?.value) ?? num(deepCurrent?.amount);
  }
  if (price === null) {
    const rawJson = JSON.stringify(poly);
    const m = rawJson.match(/R\$\s*([\d.]+(?:,\d{2})?)/i);
    if (m) price = parseBrlCapture(m[1]);
  }

  // Vendas e Avaliações: polycard.components (review_compacted.values -> label2 ou "vendido") + tracks.sold_quantity
  const tracks = obj(meta.tracks) ?? obj(at(poly, 'tracks')) ?? {};
  const melidataTrack = obj(at(tracks, 'melidata_track.event_data')) ?? {};
  const exactTrackSold =
    num(tracks.sold_quantity) ??
    num(melidataTrack.sold_quantity) ??
    num(r.sold_quantity);

  const reviewComp = obj(comp('review_compacted')?.review_compacted) ?? obj(comp('review_compacted')) ?? {};
  const values: AnyObj[] = Array.isArray(reviewComp.values) ? (reviewComp.values as AnyObj[]) : [];

  let soldLabel: string | null = null;
  let rating: number | null = num(at(r, 'reviews.rating_average')) ?? num(reviewComp.rating);
  let reviewsCount: number | null = num(at(r, 'reviews.total')) ?? num(reviewComp.total);

  const label2 = str(obj(values.find((v) => obj(v)?.key === 'label2'))?.label?.text);
  if (label2 && SOLD_REGEX.test(label2)) {
    soldLabel = label2;
  }
  for (const val of values) {
    const vObj = obj(val);
    const txt = str(vObj?.label?.text) ?? str(vObj?.text);
    if (!txt) continue;
    if (!soldLabel && SOLD_REGEX.test(txt)) {
      soldLabel = txt;
    } else if (rating === null && /^\d[.,]\d$/.test(txt)) {
      rating = Number(txt.replace(',', '.'));
    } else if (reviewsCount === null && /^\(?\+?\d[\d.]*\s*(?:mil)?\)?$/i.test(txt)) {
      const clean = txt.replace(/[()]/g, '').trim();
      const isMil = /mil/i.test(clean);
      const n = Number(clean.replace(/[^\d]/g, ''));
      if (Number.isFinite(n) && n > 0) reviewsCount = isMil ? n * 1000 : n;
    }
  }

  // Também varre outros componentes de texto/frases por "+X vendidos"
  if (!soldLabel) {
    const dumped = JSON.stringify(components);
    soldLabel = soldTextIn(dumped);
  }

  const soldText = soldTextIn(soldLabel);
  const soldQuantity = exactTrackSold ?? soldCountFromMatch(soldText);

  return {
    id,
    title,
    price,
    originalPrice,
    soldQuantity,
    soldText,
    rating,
    reviewsCount,
    permalink: fullUrl,
    image,
    isFull: JSON.stringify(comp('shipping') ?? r.shipping ?? {}).toLowerCase().includes('full'),
    isSponsored: components.some((c) => obj(c)?.type === 'ads_promotions') || Boolean(r.is_pad),
    productId,
  };
}

export function readPolycards(state: AnyObj | null): PolyItem[] {
  if (!state) return [];
  const candidates: unknown[] = [
    state.results,
    at(state, 'search.results'),
    at(state, 'pageState.initialState.results'),
    findDeep(state, 'polycard', 15_000) ? state.results : null,
  ];
  for (const list of candidates) {
    if (Array.isArray(list) && list.length > 0) {
      const parsed = list
        .map((r) => (obj(r) ? polyFromResult(r as AnyObj) : null))
        .filter((x): x is PolyItem => x !== null);
      if (parsed.length > 0) return parsed;
    }
  }
  return [];
}

/** Extrai cards de busca diretamente do HTML (Polycard / ui-search-layout__item) como fallback ou complemento. */
export function readHtmlPolycards(html: string): PolyItem[] {
  if (!html) return [];
  const blocks: string[] = [];
  const liMatches = [
    ...html.matchAll(
      /<li\b[^>]*class=["'][^"']*ui-search-layout__item[^"']*["'][^>]*>([\s\S]{100,18000}?)<\/li>/gi,
    ),
  ];
  if (liMatches.length > 0) {
    for (const m of liMatches) blocks.push(m[1]);
  } else {
    const divMatches = [
      ...html.matchAll(
        /<div\b[^>]*class=["'][^"']*(?:poly-card|ui-search-result__wrapper)[^"']*["'][^>]*>([\s\S]{100,15000}?)(?=<div\b[^>]*class=["'][^"']*(?:poly-card|ui-search-result__wrapper)|<\/ol>|<\/section>)/gi,
      ),
    ];
    for (const m of divMatches) blocks.push(m[1]);
  }

  const out: PolyItem[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const hrefMatch =
      block.match(/<a\b[^>]*class=["'][^"']*poly-component__title[^"']*["'][^>]*href=["']([^"']+)["']/i) ??
      block.match(/<a\b[^>]*href=["'](https?:\/\/[^"']*mercadoli[vb]re[^"']+)["']/i);
    const rawHref = hrefMatch ? decode(hrefMatch[1].trim()) : null;
    const image = extractHtmlImage(block);

    const productId =
      rawHref?.match(/\/p\/(MLB\d{6,})/i)?.[1]?.toUpperCase() ??
      block.match(/data-product-id=["'](MLB\d+)["']/i)?.[1]?.toUpperCase() ??
      null;

    const itemId =
      mlbFromImageOrUrl(rawHref) ??
      normalizeMlb(block.match(/data-item-id=["'](MLB\d+)["']/i)?.[1]) ??
      mlbFromImageOrUrl(image) ??
      productId;
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);

    const titleRaw =
      textByClass(block, '.poly-component__title, .ui-search-item__title') ??
      block.match(/<a\b[^>]*class=["'][^"']*poly-component__title[^"']*["'][^>]*>([\s\S]{1,300}?)<\/a>/i)?.[1] ??
      block.match(/<img\b[^>]*alt=["']([^"']{5,220})["']/i)?.[1] ??
      null;
    const title = titleRaw ? textOf(titleRaw) : null;

    const price = parseAndesMoneyBlock(block);
    const originalPrice = parseOriginalAndesPrice(block);

    // Vendas: .poly-reviews__total, .poly-phrase-label, .ui-search-item__group__element ou texto geral do card
    const reviewZone =
      textByClass(block, '.poly-reviews__total, .poly-phrase-label, .ui-search-item__group__element, .poly-component__reviews') ??
      textOf(block);
    const soldText = soldTextIn(reviewZone) ?? soldTextIn(textOf(block));
    const soldQuantity = soldCountFromMatch(soldText);

    const ratingTxt = textByClass(block, '.poly-reviews__rating, .ui-search-reviews__rating-number');
    const rating = ratingTxt ? num(ratingTxt.replace(',', '.')) : null;

    const totalTxt = textByClass(block, '.poly-reviews__total, .ui-search-reviews__amount');
    let reviewsCount: number | null = null;
    if (totalTxt && !SOLD_REGEX.test(totalTxt)) {
      const rm = totalTxt.match(/(\d[\d.]*)/);
      if (rm) reviewsCount = Number(rm[1].replace(/\./g, ''));
    }

    const isFull = /poly_full|aria-label=["'][^"']*full[^"']*["']|fulfillment/i.test(block);
    const isSponsored = /patrocinado|poly-component__ads-promotions/i.test(block);

    out.push({
      id: itemId,
      title,
      price,
      originalPrice,
      soldQuantity,
      soldText,
      rating,
      reviewsCount,
      permalink: rawHref,
      image,
      isFull,
      isSponsored,
      productId,
    });
  }

  return out;
}

/* ---------- montagem ---------- */

function emptySignals(): PageSignals {
  return {
    sources: [],
    pageType: 'unknown',
    itemId: null,
    productId: null,
    categoryId: null,
    categoryName: null,
    title: null,
    price: null,
    originalPrice: null,
    currency: null,
    listingTypeId: null,
    logisticType: null,
    freeShipping: null,
    isFull: false,
    isSupermarket: false,
    soldText: null,
    soldExact: null,
    soldExactSource: null,
    availableQuantity: null,
    stockText: null,
    startTime: null,
    startTimeSource: null,
    rating: null,
    reviewsCount: null,
    sellerId: null,
    sellerName: null,
    powerSellerStatus: null,
    reputationLevel: null,
    officialStoreId: null,
    catalogSellers: null,
    polycards: [],
  };
}

function applyEventData(s: PageSignals, ev: AnyObj | null, label: string): void {
  if (!ev) return;
  s.sources.push(label);
  s.itemId ??= normalizeMlb(ev.item_id);
  s.productId ??= normalizeMlb(ev.catalog_product_id);
  s.categoryId ??= str(ev.category_id);
  s.sellerId ??= num(ev.seller_id);
  s.sellerName ??= str(ev.seller_name);
  s.price ??= num(ev.price);
  s.originalPrice ??= num(ev.original_price);
  s.currency ??= str(ev.currency_id);
  s.listingTypeId ??= str(ev.listing_type_id);
  s.logisticType ??= str(ev.logistic_type);
  if (s.freeShipping === null && typeof ev.free_shipping === 'boolean') s.freeShipping = ev.free_shipping;
  s.officialStoreId ??= num(ev.official_store_id);
  s.powerSellerStatus ??= str(ev.power_seller_status);
  s.reputationLevel ??= str(ev.reputation_level);
  if (s.soldExact === null) {
    const sold = num(ev.sold_quantity);
    if (sold !== null) {
      s.soldExact = sold;
      s.soldExactSource = `${label} (sold_quantity)`;
    }
  }
  s.availableQuantity ??= num(ev.available_quantity);
  s.startTime ??= str(ev.start_time);
}

function applyInitialState(s: PageSignals, state: AnyObj | null, label: string): void {
  if (!state) return;
  s.sources.push(label);
  const components = obj(state.components) ?? {};
  applyEventData(s, obj(at(components, 'track.melidata_event.event_data')), `${label} → melidata_event`);

  const layout = str(state.frontend_layout_type);
  if (layout === 'SEARCH') s.pageType = 'search';
  else if (layout === 'CATEGORY') s.pageType = 'category';

  s.categoryId ??= str(at(state, 'analytics_track.dimensions.category_id')) ?? str(state.category_id);
  const header = obj(components.header) ?? {};
  s.title ??= str(header.title);
  const subtitle = str(header.subtitle);
  s.soldText ??= soldTextIn(subtitle);

  const aq = obj(components.available_quantity) ?? {};
  const stockLabel =
    str(at(aq, 'label.text')) ??
    str(at(aq, 'quantity_selector.available_quantity')) ??
    str(JSON.stringify(at(aq, 'quantity_selector.input.subtitles') ?? ''));
  if (s.availableQuantity === null) {
    const picker = num(at(aq, 'picker.max')) ?? num(at(aq, 'quantity_selector.available_quantity'));
    s.availableQuantity = picker ?? parseStockText(stockLabel);
    if (s.availableQuantity !== null) s.stockText = stockLabel;
  }

  const reviews = obj(components.reviews_capability_v3) ?? obj(components.reviews) ?? obj(header.reviews) ?? {};
  s.rating ??= num(reviews.rating) ?? num(reviews.rate) ?? num(at(reviews, 'rating.average'));
  s.reviewsCount ??= num(reviews.amount) ?? num(reviews.count) ?? num(reviews.total);

  const seller = obj(components.seller_data) ?? obj(components.seller) ?? {};
  s.sellerName ??= str(at(seller, 'header.title.text')) ?? str(at(seller, 'title.text')) ?? str(seller.seller_name);

  if (s.startTime === null) {
    const st = str(findDeep(state, 'start_time')) ?? str(findDeep(state, 'date_created'));
    if (st && !Number.isNaN(Date.parse(st))) {
      s.startTime = st;
      s.startTimeSource = `${label} (start_time)`;
    }
  }
  if (s.availableQuantity === null) {
    const q = num(findDeep(state, 'available_quantity'));
    if (q !== null) s.availableQuantity = q;
  }
  if (s.soldExact === null) {
    const sold = num(findDeep(components, 'sold_quantity'));
    if (sold !== null) {
      s.soldExact = sold;
      s.soldExactSource = `${label} (sold_quantity)`;
    }
  }
  const sellers = num(findDeep(components, 'total_sellers')) ?? num(findDeep(components, 'sellers_quantity'));
  s.catalogSellers ??= sellers;

  if (s.polycards.length === 0) s.polycards = readPolycards(state);
}

function applyLdJson(s: PageSignals, nodes: AnyObj[]): void {
  const product = nodes.find((n) => {
    const t = n['@type'];
    return t === 'Product' || (Array.isArray(t) && t.includes('Product'));
  });
  if (!product) return;
  s.sources.push('application/ld+json');
  s.title ??= str(product.name);
  const offers = Array.isArray(product.offers) ? obj(product.offers[0]) : obj(product.offers);
  s.price ??= num(offers?.price);
  s.currency ??= str(offers?.priceCurrency);
  s.sellerName ??= str(offers?.seller?.name);
  const agg = obj(product.aggregateRating) ?? {};
  s.rating ??= num(agg.ratingValue);
  s.reviewsCount ??= num(agg.reviewCount) ?? num(agg.ratingCount);
  if (s.itemId === null) s.itemId = normalizeMlb(product.sku) ?? normalizeMlb(product.productID);
  if (s.startTime === null) {
    const d = str(product.releaseDate) ?? str(product.datePublished);
    if (d && !Number.isNaN(Date.parse(d))) {
      s.startTime = d;
      s.startTimeSource = 'application/ld+json';
    }
  }
}

function applySelectors(s: PageSignals, html: string): void {
  s.sources.push('Seletores DOM/CSS');
  const subtitle =
    textByClass(html, ML_SELECTORS.PRODUCT_SUBTITLE) ?? textByClass(html, ML_SELECTORS.PRODUCT_HEADER_SUBTITLE);
  s.soldText ??= soldTextIn(subtitle);
  if (s.soldText === null) s.soldText = soldTextIn(textByClass(html, ML_SELECTORS.POLY_REVIEWS));

  if (s.availableQuantity === null) {
    const stock = textByClass(html, ML_SELECTORS.BUYBOX_QUANTITY_AVAILABLE) ?? textByClass(html, ML_SELECTORS.BUYBOX_QUANTITY);
    const q = parseStockText(stock);
    if (q !== null) {
      s.availableQuantity = q;
      s.stockText = stock;
    }
  }

  s.itemId ??= normalizeMlb(inputValue(html, 'item_id')) ?? normalizeMlb(inputValue(html, 'itemId'));
  s.price ??= num(metaItemprop(html, 'price')) ?? parseAndesMoneyBlock(html);
  s.originalPrice ??= parseOriginalAndesPrice(html);
  s.rating ??= num(metaItemprop(html, 'ratingValue'));
  if (s.rating === null) {
    const r = textByClass(html, ML_SELECTORS.REVIEW_RATING);
    s.rating = r ? num(r.replace(',', '.')) : null;
  }
  if (s.reviewsCount === null) {
    const amount = textByClass(html, ML_SELECTORS.REVIEW_AMOUNT);
    const m = amount?.match(/(\d[\d.]*)/);
    s.reviewsCount = m ? Number(m[1].replace(/\./g, '')) : null;
  }

  if (s.startTime === null) {
    const meta = metaItemprop(html, 'datePublished') ?? metaProperty(html, 'product:release_date');
    const time = html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] ?? null;
    const d = [meta, time].find((x) => x && !Number.isNaN(Date.parse(x))) ?? null;
    if (d) {
      s.startTime = d;
      s.startTimeSource = meta ? 'meta datePublished' : 'time[datetime]';
    }
  }
  if (s.startTime === null) {
    const st = readStartTime(html);
    if (st) {
      s.startTime = st;
      s.startTimeSource = 'Script embutido (start_time)';
    }
  }

  s.sellerName ??=
    textByClass(html, ML_SELECTORS.SELLER_DATA_HEADER_TITLE) ?? textByClass(html, ML_SELECTORS.CATALOG_SELLER_SUBTITLE);

  if (s.categoryName === null) {
    const crumbs = [...html.matchAll(/andes-breadcrumb__item[\s\S]{0,400}?itemprop=["']name["'][^>]*>([^<]{1,80})</gi)];
    s.categoryName = crumbs.length > 0 ? textOf(crumbs[crumbs.length - 1][1]) : null;
  }

  if (/aria-label=["'][^"']*FULL[^"']*["']|#poly_full|logistic_type["']?\s*:\s*["']fulfillment/i.test(html)) s.isFull = true;
  if (s.listingTypeId === null) {
    const badge = textByClass(html, ML_SELECTORS.BADGE_CONTENT);
    if (badge && /^premium$/i.test(badge)) s.listingTypeId = 'gold_pro';
    else if (badge && /^cl[aá]ssico$/i.test(badge)) s.listingTypeId = 'gold_special';
  }
  if (/ui-pdp-table ui-pdp-s-table/.test(html) && s.pageType === 'unknown') s.pageType = 'catalog';
  s.isSupermarket ||= /supermarket_eligible|"is_supermarket"\s*:\s*true/i.test(html);

  const htmlCards = readHtmlPolycards(html);
  if (s.polycards.length === 0 && htmlCards.length > 0) {
    s.polycards = htmlCards;
  } else if (htmlCards.length > 0) {
    const byId = new Map(htmlCards.map((c) => [c.id, c]));
    s.polycards = s.polycards.map((p) => {
      const h = byId.get(p.id) ?? (p.productId ? byId.get(p.productId) : undefined);
      if (!h) return p;
      return {
        ...p,
        title: p.title ?? h.title,
        price: p.price ?? h.price,
        originalPrice: p.originalPrice ?? h.originalPrice,
        soldQuantity: p.soldQuantity ?? h.soldQuantity,
        soldText: p.soldText ?? h.soldText,
        rating: p.rating ?? h.rating,
        reviewsCount: p.reviewsCount ?? h.reviewsCount,
        image: p.image ?? h.image,
        permalink: p.permalink ?? h.permalink,
      };
    });
  }
}

/** Extrai todos os sinais disponíveis do HTML público de um anúncio, catálogo ou busca. */
export function extractPageSignals(html: string, url: string | null = null): PageSignals {
  const s = emptySignals();
  if (!html) return s;

  if (url) {
    if (/lista\.mercadoli[vb]re/i.test(url)) s.pageType = 'search';
    else if (/\/c\//.test(url)) s.pageType = 'category';
    else if (/\/p\/MLB\d+/i.test(url)) s.pageType = 'catalog';
    else if (/MLB-?\d+|\/up\/MLBU/i.test(url)) s.pageType = 'product';
  }

  applyInitialState(s, readPreloadedState(html), '__PRELOADED_STATE__');
  applyInitialState(s, readNordicContext(html), '__NORDIC_RENDERING_CTX__ (_n.ctx.r)');

  const md = readMelidata(html);
  applyEventData(s, md.eventData, 'melidata event_data');
  if (md.view) {
    s.categoryId ??= str(md.view.category_id);
    s.itemId ??= normalizeMlb(md.view.item_id);
  }
  s.categoryId ??= html.match(/"category_id"\s*:\s*"(MLB\d+)"/)?.[1] ?? null;

  applyLdJson(s, readLdJson(html));
  applySelectors(s, html);

  if (s.logisticType === 'fulfillment') s.isFull = true;
  if (s.startTime && !s.startTimeSource) s.startTimeSource = 'Estado da página (start_time)';
  if (s.pageType === 'unknown' && s.itemId) s.pageType = 'product';
  s.sources = [...new Set(s.sources)];
  return s;
}

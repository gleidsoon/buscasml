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

function soldTextIn(text: string | null): string | null {
  if (!text) return null;
  return text.match(/\+?\s*\d[\d.,]*\s*(?:mil\s*)?vendid[oa]s?/i)?.[0].trim() ?? null;
}

/* ---------- polycards (busca e listas) ---------- */

function polyFromResult(r: AnyObj): PolyItem | null {
  const poly = obj(r.polycard) ?? r;
  const meta = obj(poly.metadata) ?? {};
  const id = normalizeMlb(meta.id ?? r.id);
  if (!id) return null;
  const components: AnyObj[] = Array.isArray(poly.components) ? poly.components : [];
  const comp = (type: string): AnyObj | null => obj(components.find((c) => obj(c)?.type === type)) ?? null;
  const title = str(comp('title')?.title?.text) ?? str(r.title);
  const priceComp = obj(comp('price')?.price) ?? {};
  const price = num(at(priceComp, 'current_price.value')) ?? num(r.price);
  const originalPrice = num(at(priceComp, 'previous_price.value')) ?? num(r.original_price);
  const tracks = obj(meta.tracks) ?? {};
  const soldQuantity = num(tracks.sold_quantity) ?? num(r.sold_quantity);
  const reviews = obj(comp('review_compacted')) ?? {};
  const values: AnyObj[] = Array.isArray(at(reviews, 'review_compacted.values'))
    ? (at(reviews, 'review_compacted.values') as AnyObj[])
    : [];
  const soldLabel =
    str(obj(values.find((v) => obj(v)?.key === 'label2'))?.label?.text) ??
    str(obj(values[3])?.label?.text) ??
    null;
  const pictures: AnyObj[] = Array.isArray(at(poly, 'pictures.pictures')) ? (at(poly, 'pictures.pictures') as AnyObj[]) : [];
  const picId = str(pictures[0]?.id);
  const url = str(meta.url);
  return {
    id,
    title,
    price,
    originalPrice,
    soldQuantity,
    soldText: soldTextIn(soldLabel),
    permalink: url ? (url.startsWith('http') ? url : `https://${url}`) : str(r.permalink),
    image: picId ? `https://http2.mlstatic.com/D_NQ_NP_${picId}-O.webp` : str(r.thumbnail),
    isFull: JSON.stringify(comp('shipping') ?? {}).toLowerCase().includes('full'),
    isSponsored: components.some((c) => obj(c)?.type === 'ads_promotions'),
    productId: normalizeMlb(meta.product_id),
  };
}

export function readPolycards(state: AnyObj | null): PolyItem[] {
  const results = state?.results;
  if (!Array.isArray(results)) return [];
  return results.map((r) => (obj(r) ? polyFromResult(r as AnyObj) : null)).filter((x): x is PolyItem => x !== null);
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
  s.price ??= num(metaItemprop(html, 'price'));
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

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CLIENT_ID = process.env.ML_CLIENT_ID || '8353552938244269';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '1mDuwaABTfcuIFd93BKMlohHfUmsRggn';

let cachedAppToken: any = null;
let cachedUserToken: any = process.env.ML_ACCESS_TOKEN || null;
let cachedRefreshToken: any = process.env.ML_REFRESH_TOKEN || null;
let tokenExpiry = 0;

async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 7500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* 1. Obtém Token Oficial (Prioriza User Token OAuth se autorizado, ou Client Credentials) */
async function getOfficialAccessToken(userTokenFromClient?: string | null) {
  if (userTokenFromClient) {
    return { token: userTokenFromClient, isUserToken: true, error: null };
  }
  if (cachedUserToken) {
    return { token: cachedUserToken, isUserToken: true, error: null };
  }
  if (cachedAppToken && Date.now() < tokenExpiry) {
    return { token: cachedAppToken, isUserToken: false, error: null };
  }

  try {
    const res = await fetchWithTimeout(
      'https://api.mercadolibre.com/oauth/token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      },
      5000
    );

    const data = await res.json();
    if (res.ok && data.access_token) {
      cachedAppToken = data.access_token;
      tokenExpiry = Date.now() + (data.expires_in ? data.expires_in * 1000 - 60000 : 18000000);
      return { token: cachedAppToken, isUserToken: false, error: null };
    }
    return { token: null, isUserToken: false, error: data.message || JSON.stringify(data) };
  } catch (err: any) {
    return {
      token: null,
      isUserToken: false,
      error: (err && err.message) || 'Falha na conexao com oauth/token',
    };
  }
}

function extractReadableSlug(url: string): string {
  try {
    const u = new URL(url);
    const goParam = u.searchParams.get('go');
    const pathUrl = goParam ? new URL(goParam).pathname : u.pathname;

    const segments = pathUrl.split('/').filter(Boolean);
    for (const seg of segments) {
      const lower = seg.toLowerCase();
      const isCode = lower.startsWith('mlb') || lower.startsWith('mlbu');
      const isReserved = ['p', 'up', 'sec', 'social', 'gz'].includes(lower);
      if (seg.length > 8 && seg.includes('-') && !isCode && !isReserved) {
        return seg
          .replace(/^MLB-\d+-/i, '')
          .replace(/-_JM/gi, '')
          .replace(/-/g, ' ')
          .trim();
      }
    }
  } catch {
    /* URL simples */
  }
  return '';
}

async function parseInputQueryOrUrl(rawInput: string) {
  let target = rawInput.trim();

  if (target.includes('meli.la') || target.includes('/sec/') || target.includes('/social/')) {
    try {
      const res = await fetchWithTimeout(target, { redirect: 'manual' }, 3500);
      const loc = res.headers.get('location');
      if (loc) target = loc;
    } catch {
      /* Mantem original */
    }
  }

  const catalogMatch = target.match(/\/p\/(MLB\d{6,14})/i);
  if (catalogMatch) {
    const cId = catalogMatch[1].toUpperCase();
    return {
      catalogId: cId,
      searchQuery: extractReadableSlug(target) || cId,
      resolvedUrl: target,
    };
  }

  const cleanCode = target.replace('-', '').toUpperCase();
  const isMlbCode =
    cleanCode.startsWith('MLB') &&
    cleanCode.length >= 9 &&
    18 > cleanCode.length &&
    !isNaN(Number(cleanCode.slice(3)));

  if (isMlbCode) {
    return {
      catalogId: cleanCode,
      searchQuery: cleanCode,
      resolvedUrl: 'https://www.mercadolivre.com.br/p/' + cleanCode,
    };
  }

  if (target.startsWith('http')) {
    const slugQuery = extractReadableSlug(target);
    return {
      catalogId: null,
      searchQuery: slugQuery || target,
      resolvedUrl: target,
    };
  }

  return {
    catalogId: null,
    searchQuery: target,
    resolvedUrl: '',
  };
}

function extractPhotoUploadDate(photoUrl: string) {
  if (!photoUrl) return null;
  const m = photoUrl.match(/_(\d{2})(20\d{2})-[A-Z]\./i);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (month >= 1 && 12 >= month && year >= 2015 && 2030 >= year) {
      return {
        label: m[1] + '/' + m[2],
        isoDate: new Date(Date.UTC(year, month - 1, 10, 12, 0, 0)).toISOString(),
      };
    }
  }
  return null;
}

/* 2. Consulta dados reais do Vendedor em GET /users/{seller_id} ou por Nickname */
async function fetchOfficialSeller(sellerIdOrNick: any, authHeaders: any) {
  if (!sellerIdOrNick) return null;
  const strVal = String(sellerIdOrNick).trim();
  const isNumericId = /^\d{4,15}$/.test(strVal);

  try {
    let u: any = null;

    if (isNumericId) {
      const res = await fetchWithTimeout(
        'https://api.mercadolibre.com/users/' + strVal,
        { headers: authHeaders },
        4000
      );
      if (res.ok) {
        u = await res.json();
      }
    } else {
      /* Se tivermos o nickname da loja, busca na API por nickname */
      const searchRes = await fetchWithTimeout(
        'https://api.mercadolibre.com/sites/MLB/search?nickname=' + encodeURIComponent(strVal) + '&limit=1',
        { headers: authHeaders },
        4000
      );
      if (searchRes.ok) {
        const sData = await searchRes.json();
        const foundSellerId = sData && sData.seller && sData.seller.id;
        if (foundSellerId) {
          const uRes = await fetchWithTimeout(
            'https://api.mercadolibre.com/users/' + String(foundSellerId),
            { headers: authHeaders },
            3500
          );
          if (uRes.ok) u = await uRes.json();
        }
      }
    }

    if (!u || !u.id) return null;

    return {
      id: u.id,
      nickname: u.nickname || null,
      registration_date: u.registration_date || null,
      city: (u.address && u.address.city) || null,
      state: (u.address && u.address.state) || null,
      user_type: u.user_type || null,
      power_seller_status: (u.seller_reputation && u.seller_reputation.power_seller_status) || null,
      level_id: (u.seller_reputation && u.seller_reputation.level_id) || null,
      completed_transactions:
        u.seller_reputation && u.seller_reputation.transactions
          ? u.seller_reputation.transactions.completed
          : null,
      canceled_transactions:
        u.seller_reputation && u.seller_reputation.transactions
          ? u.seller_reputation.transactions.canceled
          : null,
      total_transactions:
        u.seller_reputation && u.seller_reputation.transactions
          ? u.seller_reputation.transactions.total
          : null,
      permalink: u.permalink || null,
      raw_user_json: u,
    };
  } catch {
    return null;
  }
}

/* 3. Lê Preço, Vendas e Vendedor da página pública (/p/MLB... ou link colado) quando a API ocultar /items */
async function extractLivePageOffer(pageUrl: string) {
  if (!pageUrl) return null;
  try {
    const jinaRes = await fetchWithTimeout(
      'https://r.jina.ai/' + pageUrl,
      { headers: { Accept: 'application/json' } },
      6000
    );
    if (!jinaRes.ok) return null;

    const jinaJson = await jinaRes.json();
    const content = String((jinaJson && jinaJson.data && jinaJson.data.content) || '');
    const title = String((jinaJson && jinaJson.data && jinaJson.data.title) || '');

    if (!content || 150 > content.length) return null;

    /* Preço no título ("... - R$ 39,90") ou no topo da página */
    const mainBlock = content.slice(0, 6000);
    let currentPrice: any = null;
    let originalPrice: any = null;

    const titlePriceMatch = title.match(/R\u0024\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i);
    if (titlePriceMatch) {
      currentPrice = parseFloat(titlePriceMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    const priceRegex = /R\u0024\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g;
    const foundPrices: number[] = [];
    let pm;
    while ((pm = priceRegex.exec(mainBlock)) !== null && 8 > foundPrices.length) {
      const val = parseFloat(pm[1].replace(/\./g, '').replace(',', '.'));
      if (val > 2 && 150000 > val) foundPrices.push(val);
    }

    if (!currentPrice && foundPrices.length !== 0) {
      if (foundPrices.length >= 2 && foundPrices[0] > foundPrices[1] && foundPrices[1] > foundPrices[0] * 0.35) {
        originalPrice = foundPrices[0];
        currentPrice = foundPrices[1];
      } else {
        currentPrice = foundPrices[0];
      }
    } else if (currentPrice && foundPrices.length !== 0) {
      const higher = foundPrices.find((p) => p > currentPrice * 1.05 && currentPrice * 3.5 > p);
      if (higher) originalPrice = higher;
    }

    /* Quantidade vendida ("+100 vendidos", "+5 mil vendidos") */
    let soldQuantity: any = null;
    let soldLabel: any = null;
    const soldMatch = mainBlock.match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(mil\b)?\s*vendidos/i);
    if (soldMatch) {
      const base = parseFloat(soldMatch[1].replace('.', '').replace(',', '.'));
      const mult = soldMatch[2] && soldMatch[2].toLowerCase() === 'mil' ? 1000 : 1;
      soldQuantity = Math.round(base * mult);
      soldLabel = soldMatch[0].trim();
    }

    /* Avaliação e quantidade de opiniões */
    let rating: any = null;
    let reviewsCount: any = null;
    const ratingMatch = mainBlock.match(/(\d[.,]\d)\s*(?:de 5|estrelas|\()/i);
    if (ratingMatch) rating = parseFloat(ratingMatch[1].replace(',', '.'));
    const revMatch = mainBlock.match(/\((\d+(?:\.\d+)?)\s*(?:avaliações|opiniões)?\)/i);
    if (revMatch) reviewsCount = parseInt(revMatch[1].replace(/\./g, ''), 10);

    /* Nome do Vendedor / Loja na página */
    const sellerLinkMatch =
      mainBlock.match(/Vendido por\s*\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/i) ||
      mainBlock.match(/Loja oficial\s*\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/i);
    const sellerTextMatch =
      mainBlock.match(/Vendido por\s*([^\n|[\]]{2,40})/i) ||
      mainBlock.match(/Loja oficial\s*([^\n|[\]]{2,40})/i);

    const sellerNickname = sellerLinkMatch
      ? sellerLinkMatch[1].trim()
      : sellerTextMatch
      ? sellerTextMatch[1].trim()
      : null;

    const sellerSalesMatch = mainBlock.match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(mil\b)?\s*vendas\b/i);
    let sellerCompletedSales: any = null;
    if (sellerSalesMatch) {
      sellerCompletedSales = Math.round(
        parseFloat(sellerSalesMatch[1].replace('.', '').replace(',', '.')) *
          (sellerSalesMatch[2] ? 1000 : 1)
      );
    }

    const isFull = /Enviado pelo\s*Full|Logística\s*Full|\bFull\b/i.test(mainBlock);
    const isFreeShipping = /Frete\s*grátis|Chegará\s*grátis/i.test(mainBlock);
    const isPremium = /sem\s*juros/i.test(mainBlock);
    const itemMlbMatch =
      mainBlock.match(/[?&]wid=(MLB\d{8,14})/i) ||
      mainBlock.match(/-(MLB\d{8,14})_/i);

    return {
      item_id: itemMlbMatch ? itemMlbMatch[1].toUpperCase() : null,
      price: currentPrice,
      original_price: originalPrice,
      sold_quantity: soldQuantity,
      sold_label: soldLabel,
      rating,
      reviews_count: reviewsCount,
      seller_nickname: sellerNickname,
      seller_completed_sales: sellerCompletedSales,
      logistic_type: isFull ? 'fulfillment' : 'padrao',
      free_shipping: isFreeShipping,
      listing_type_id: isPremium ? 'gold_pro' : 'gold_special',
    };
  } catch {
    return null;
  }
}

/* 4. Hidrata o Produto combinando API Oficial (/products/{id}, /items, /users) + Leitura da Página Real */
async function hydrateCatalogProduct(
  productSummary: any,
  authHeaders: any,
  fallbackUserUrl?: string,
  shouldReadLivePage = false
) {
  const productId = String(productSummary.id);

  const [prodDetailRes, prodItemsRes] = await Promise.allSettled([
    fetchWithTimeout('https://api.mercadolibre.com/products/' + productId, { headers: authHeaders }, 4500),
    fetchWithTimeout(
      'https://api.mercadolibre.com/products/' + productId + '/items?limit=10',
      { headers: authHeaders },
      4500
    ),
  ]);

  let fullProduct: any = productSummary;
  if (prodDetailRes.status === 'fulfilled' && prodDetailRes.value.ok) {
    fullProduct = await prodDetailRes.value.json();
  }

  let itemsList: any = [];
  if (prodItemsRes.status === 'fulfilled' && prodItemsRes.value.ok) {
    const itemsJson = await prodItemsRes.value.json();
    if (Array.isArray(itemsJson && itemsJson.results)) {
      itemsList = itemsJson.results;
    } else if (Array.isArray(itemsJson)) {
      itemsList = itemsJson;
    }
  }

  const winnerItem = (fullProduct && fullProduct.buy_box_winner) || itemsList[0] || null;
  let sellerId = (winnerItem && winnerItem.seller_id) || null;

  const rawPictures = (fullProduct && fullProduct.pictures) || (productSummary && productSummary.pictures) || [];
  const pictures = rawPictures.map((p: any) => p.url || p.secure_url).filter(Boolean);

  const rawAttributes =
    (fullProduct && fullProduct.attributes) || (productSummary && productSummary.attributes) || [];
  const attributes = rawAttributes.map((a: any) => ({
    id: a.id,
    name: a.name,
    value: a.value_name,
  }));

  const brandObj = attributes.find((a: any) => a.id === 'BRAND');
  const modelObj = attributes.find((a: any) => a.id === 'MODEL');
  const brandAttr = brandObj ? brandObj.value : null;
  const modelAttr = modelObj ? modelObj.value : null;

  const photoInfo = pictures[0] ? extractPhotoUploadDate(pictures[0]) : null;
  const apiDateCreated =
    (fullProduct && fullProduct.date_created) ||
    (productSummary && productSummary.date_created) ||
    (photoInfo && photoInfo.isoDate) ||
    null;

  let daysOld: any = null;
  if (apiDateCreated) {
    daysOld = Math.max(1, Math.floor((Date.now() - new Date(apiDateCreated).getTime()) / 86400000));
  }

  const permalink =
    (fullProduct && fullProduct.permalink) ||
    (winnerItem && winnerItem.permalink) ||
    'https://www.mercadolivre.com.br/p/' + productId;

  /* Se a API restringiu buy_box_winner / items (por estar sem OAuth de usuário), lê a oferta real na página do produto */
  let liveOffer: any = null;
  if (!winnerItem && shouldReadLivePage) {
    liveOffer = await extractLivePageOffer(permalink);
    if ((!liveOffer || !liveOffer.price) && fallbackUserUrl && fallbackUserUrl.startsWith('http')) {
      const userUrlOffer = await extractLivePageOffer(fallbackUserUrl);
      if (userUrlOffer && userUrlOffer.price) {
        liveOffer = userUrlOffer;
      }
    }
  }

  const sellerData = sellerId
    ? await fetchOfficialSeller(sellerId, authHeaders)
    : liveOffer && liveOffer.seller_nickname
    ? await fetchOfficialSeller(liveOffer.seller_nickname, authHeaders)
    : null;

  const prices = itemsList.map((it: any) => Number(it.price)).filter((p: number) => p > 0);
  const mainPrice =
    winnerItem && winnerItem.price !== undefined
      ? winnerItem.price
      : prices.length !== 0
      ? prices[0]
      : liveOffer && liveOffer.price
      ? liveOffer.price
      : null;

  const minPrice = prices.length !== 0 ? Math.min(...prices) : mainPrice;
  const maxPrice = prices.length !== 0 ? Math.max(...prices) : mainPrice;
  const soldQty =
    (winnerItem && winnerItem.sold_quantity) ?? (liveOffer && liveOffer.sold_quantity) ?? null;

  const dailySales =
    soldQty !== null && daysOld ? Number((soldQty / Math.max(1, daysOld)).toFixed(1)) : null;
  const revenueTotal =
    soldQty !== null && mainPrice ? Number((soldQty * mainPrice).toFixed(2)) : null;

  let sellerObject: any = null;
  if (sellerData) {
    sellerObject = {
      id: sellerData.id,
      nickname: sellerData.nickname,
      registration_date: sellerData.registration_date,
      account_age_years: sellerData.registration_date
        ? Math.max(1, new Date().getFullYear() - new Date(sellerData.registration_date).getFullYear())
        : null,
      city: sellerData.city || null,
      state: sellerData.state || null,
      power_seller_status: sellerData.power_seller_status,
      level_id: sellerData.level_id,
      completed_transactions:
        sellerData.completed_transactions ?? (liveOffer && liveOffer.seller_completed_sales) ?? null,
      permalink: sellerData.permalink,
    };
  } else if (liveOffer && liveOffer.seller_nickname) {
    sellerObject = {
      id: 'ML-STORE',
      nickname: liveOffer.seller_nickname,
      registration_date: null,
      account_age_years: null,
      city: null,
      state: null,
      power_seller_status: null,
      level_id: null,
      completed_transactions: liveOffer.seller_completed_sales || null,
      permalink: permalink,
    };
  }

  return {
    product_id: productId,
    item_id: (winnerItem && winnerItem.item_id) || (liveOffer && liveOffer.item_id) || null,
    title: (fullProduct && fullProduct.name) || (productSummary && productSummary.name) || 'Produto Catalogo ML',
    status: (fullProduct && fullProduct.status) || 'active',
    domain_id: (fullProduct && fullProduct.domain_id) || null,
    permalink,
    thumbnail: pictures[0] || '',
    pictures,
    price: mainPrice,
    min_price: minPrice,
    max_price: maxPrice,
    original_price:
      (winnerItem && winnerItem.original_price) || (liveOffer && liveOffer.original_price) || null,
    currency_id: 'BRL',
    active_sellers_count: itemsList.length || (mainPrice ? 1 : 0),
    sold_quantity: soldQty,
    sold_label: (liveOffer && liveOffer.sold_label) || (soldQty !== null ? String(soldQty) + ' vendidos' : null),
    daily_sales: dailySales,
    total_revenue: revenueTotal,
    rating: (liveOffer && liveOffer.rating) || null,
    reviews_count: (liveOffer && liveOffer.reviews_count) || null,
    date_created: apiDateCreated,
    days_old: daysOld,
    first_photo_month_year: photoInfo ? photoInfo.label : null,
    condition: (winnerItem && winnerItem.condition) || 'new',
    listing_type_id:
      (winnerItem && winnerItem.listing_type_id) || (liveOffer && liveOffer.listing_type_id) || null,
    logistic_type:
      (winnerItem && winnerItem.shipping && winnerItem.shipping.logistic_type) ||
      (liveOffer && liveOffer.logistic_type) ||
      null,
    free_shipping:
      winnerItem && winnerItem.shipping
        ? winnerItem.shipping.free_shipping
        : liveOffer
        ? liveOffer.free_shipping
        : null,
    warranty: (winnerItem && winnerItem.warranty) || null,
    brand: brandAttr,
    model: modelAttr,
    attributes: attributes.slice(0, 10),
    seller: sellerObject,
    competing_offers: itemsList.map((offer: any) => ({
      item_id: offer.item_id,
      seller_id: offer.seller_id,
      price: offer.price,
      condition: offer.condition,
      free_shipping: Boolean(offer.shipping && offer.shipping.free_shipping),
      logistic_type: (offer.shipping && offer.shipping.logistic_type) || 'padrao',
      listing_type_id: offer.listing_type_id,
    })),
    raw_api_proof: {
      endpoint_product: 'https://api.mercadolibre.com/products/' + productId,
      endpoint_items: 'https://api.mercadolibre.com/products/' + productId + '/items',
      endpoint_seller: sellerData ? 'https://api.mercadolibre.com/users/' + String(sellerData.id) : null,
      product_date_created: (fullProduct && fullProduct.date_created) || null,
      photo_upload_month_year: photoInfo ? photoInfo.label : null,
      winner_item: winnerItem,
      live_page_offer: liveOffer,
      seller_response: (sellerData && sellerData.raw_user_json) || null,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || '';
    const userTokenParam = searchParams.get('user_token') || null;

    /* Troca o ?code=... do OAuth pelo Access Token de Usuário Oficial do Mercado Livre */
    if (action === 'exchange_code') {
      const code = searchParams.get('code') || '';
      const redirectUri = searchParams.get('redirect_uri') || '';
      const tokenRes = await fetchWithTimeout(
        'https://api.mercadolibre.com/oauth/token',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
          }),
        },
        5000
      );
      const tokenData = await tokenRes.json();
      if (tokenRes.ok && tokenData.access_token) {
        cachedUserToken = tokenData.access_token;
        cachedRefreshToken = tokenData.refresh_token || null;
        return NextResponse.json({
          ok: true,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          user_id: tokenData.user_id,
        });
      }
      return NextResponse.json(
        { ok: false, error: tokenData.message || 'Falha ao validar codigo OAuth' },
        { status: 400 }
      );
    }

    const rawQuery = (searchParams.get('q') || searchParams.get('input') || '').trim();
    const auth = await getOfficialAccessToken(userTokenParam);

    if (!auth.token) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Falha ao autenticar suas credenciais no Mercado Livre: ' + String(auth.error || ''),
        },
        { status: 401 }
      );
    }

    const authHeaders = {
      Authorization: 'Bearer ' + auth.token,
      Accept: 'application/json',
    };

    if (!rawQuery) {
      return NextResponse.json({
        ok: true,
        status: 'Conectado oficialmente a API do Mercado Livre',
        client_id: CLIENT_ID,
        is_user_oauth: auth.isUserToken,
      });
    }

    const parsed = await parseInputQueryOrUrl(rawQuery);
    const rawCatalogResults: any = [];
    let usedSearchTerm = parsed.searchQuery;

    if (parsed.catalogId) {
      const directRes = await fetchWithTimeout(
        'https://api.mercadolibre.com/products/' + parsed.catalogId,
        { headers: authHeaders },
        4500
      );
      if (directRes.ok) {
        const directProd = await directRes.json();
        if (directProd && directProd.id && directProd.name) {
          rawCatalogResults.push(directProd);
          usedSearchTerm = directProd.name;
        }
      }
    }

    const words = usedSearchTerm.split(/\s+/).filter(Boolean);
    const candidateQueries = Array.from(
      new Set([
        usedSearchTerm,
        words.slice(0, 5).join(' '),
        words.slice(0, 3).join(' '),
        words.slice(0, 2).join(' '),
      ])
    ).filter((q) => q.length >= 2);

    let executedEndpoint = '';

    for (const candidate of candidateQueries) {
      const url =
        'https://api.mercadolibre.com/products/search?status=active&site_id=MLB&q=' +
        encodeURIComponent(candidate) +
        '&limit=12';
      executedEndpoint = url;

      const searchRes = await fetchWithTimeout(url, { headers: authHeaders }, 5500);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (Array.isArray(searchData && searchData.results) && searchData.results.length !== 0) {
          const existingIds = new Set(rawCatalogResults.map((p: any) => p.id));
          for (const item of searchData.results) {
            if (!existingIds.has(item.id)) {
              rawCatalogResults.push(item);
              existingIds.add(item.id);
            }
          }
          break;
        }
      }
    }

    if (rawCatalogResults.length === 0) {
      return NextResponse.json({
        ok: true,
        authenticated_client_id: CLIENT_ID,
        is_user_oauth: auth.isUserToken,
        executed_endpoint: executedEndpoint,
        total: 0,
        items: [],
        message:
          'A API Oficial (/products/search) nao encontrou produtos de catalogo para "' +
          usedSearchTerm +
          '". Tente usar palavras mais curtas (ex: Coroa Noiva, Creatina, Cadeira Gamer).',
      });
    }

    /* Hidrata os produtos (lendo a oferta ao vivo na página para os 4 primeiros caso /items esteja restrito sem OAuth) */
    const hydratedItems = await Promise.all(
      rawCatalogResults
        .slice(0, 10)
        .map((prod: any, index: number) =>
          hydrateCatalogProduct(prod, authHeaders, index === 0 ? parsed.resolvedUrl : '', 4 > index)
        )
    );

    return NextResponse.json({
      ok: true,
      authenticated_client_id: CLIENT_ID,
      is_user_oauth: auth.isUserToken,
      executed_endpoint: executedEndpoint,
      query_used: usedSearchTerm,
      total: hydratedItems.length,
      items: hydratedItems,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Erro na comunicacao com a API Oficial: ' + String((err && err.message) || 'Erro desconhecido'),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, filename } = body;
    let detectedKeyword = '';

    if (imageBase64) {
      try {
        const visionRes = await fetchWithTimeout(
          'https://text.pollinations.ai/openai',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'openai',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Identifique este produto para busca no catalogo do Mercado Livre Brasil. Responda APENAS com 2 a 3 palavras principais do produto em portugues (sem pontuacao). Exemplo: Coroa Noiva Strass ou Creatina Growth.',
                    },
                    {
                      type: 'image_url',
                      image_url: { url: imageBase64 },
                    },
                  ],
                },
              ],
            }),
          },
          6000
        );
        if (visionRes.ok) {
          const visionData = await visionRes.json();
          const reply =
            (visionData &&
              visionData.choices &&
              visionData.choices[0] &&
              visionData.choices[0].message &&
              visionData.choices[0].message.content &&
              visionData.choices[0].message.content.trim()) ||
            '';
          if (reply && reply.length >= 2 && 50 >= reply.length) {
            detectedKeyword = reply.replace(/[."']/g, '');
          }
        }
      } catch {
        /* Fallback pelo nome do arquivo */
      }
    }

    if (!detectedKeyword && filename) {
      const parts = String(filename).split('.');
      const withoutExt = parts.length > 1 ? parts.slice(0, -1).join(' ') : String(filename);
      const cleanName = withoutExt
        .replace(/[-_]/g, ' ')
        .replace(/whatsapp|image|captura|tela|screenshot|print|\d{4,}/gi, '')
        .trim();
      if (cleanName.length >= 3) detectedKeyword = cleanName;
    }

    return NextResponse.json({ keyword: detectedKeyword || 'Creatina' });
  } catch (err: any) {
    return NextResponse.json({ keyword: 'Creatina', error: err && err.message });
  }
}

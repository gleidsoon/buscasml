import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CLIENT_ID = process.env.ML_CLIENT_ID || '8353552938244269';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '1mDuwaABTfcuIFd93BKMlohHfUmsRggn';

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* 1. Gera o Access Token oficial na API do Mercado Livre */
async function getOfficialAccessToken(): Promise<{ token: string | null; error?: string }> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return { token: cachedToken };
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
      cachedToken = data.access_token;
      tokenExpiry = Date.now() + (data.expires_in ? data.expires_in * 1000 - 60000 : 18000000);
      return { token: cachedToken };
    }
    return { token: null, error: data.message || JSON.stringify(data) };
  } catch (err: any) {
    return { token: null, error: err?.message || 'Falha na conexao com oauth/token' };
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

async function parseInputQueryOrUrl(rawInput: string): Promise<{
  catalogId: string | null;
  searchQuery: string;
  resolvedUrl: string;
}> {
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
  if (/^MLB\d{6,14}\$/.test(cleanCode)) {
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

function extractPhotoUploadDate(photoUrl: string): string | null {
  if (!photoUrl) return null;
  const m = photoUrl.match(/_(\d{2})(20\d{2})-[A-Z]\./i);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (month >= 1 && month <= 12 && year >= 2015 && year <= 2030) {
      return m[1] + '/' + m[2];
    }
  }
  return null;
}

/* 2. Consulta a rota OFICIAL /users/{seller_id} para obter dados reais do vendedor */
async function fetchOfficialSeller(sellerId: number | string, authHeaders: Record<string, string>) {
  if (!sellerId) return null;
  try {
    const res = await fetchWithTimeout(
      'https://api.mercadolibre.com/users/' + String(sellerId),
      { headers: authHeaders },
      4000
    );
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || !u.id) return null;

    return {
      id: u.id,
      nickname: u.nickname || null,
      registration_date: u.registration_date || null,
      city: u.address?.city || null,
      state: u.address?.state || null,
      user_type: u.user_type || null,
      power_seller_status: u.seller_reputation?.power_seller_status || null,
      level_id: u.seller_reputation?.level_id || null,
      completed_transactions: u.seller_reputation?.transactions?.completed ?? null,
      canceled_transactions: u.seller_reputation?.transactions?.canceled ?? null,
      total_transactions: u.seller_reputation?.transactions?.total ?? null,
      ratings_positive: u.seller_reputation?.transactions?.ratings?.positive ?? null,
      permalink: u.permalink || null,
      raw_user_json: u,
    };
  } catch {
    return null;
  }
}

/* 3. Consulta as rotas OFICIAIS /products/{id}, /products/{id}/items e /users/{seller_id} */
async function hydrateCatalogProduct(productSummary: any, authHeaders: Record<string, string>) {
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

  let itemsList: any[] = [];
  if (prodItemsRes.status === 'fulfilled' && prodItemsRes.value.ok) {
    const itemsJson = await prodItemsRes.value.json();
    if (Array.isArray(itemsJson?.results)) {
      itemsList = itemsJson.results;
    } else if (Array.isArray(itemsJson)) {
      itemsList = itemsJson;
    }
  }

  const winnerItem = fullProduct?.buy_box_winner || itemsList[0] || null;
  const sellerId = winnerItem?.seller_id || null;

  const sellerData = sellerId ? await fetchOfficialSeller(sellerId, authHeaders) : null;

  const rawPictures = fullProduct?.pictures || productSummary?.pictures || [];
  const pictures: string[] = rawPictures
    .map((p: any) => p.url || p.secure_url)
    .filter(Boolean);

  const rawAttributes = fullProduct?.attributes || productSummary?.attributes || [];
  const attributes = rawAttributes.map((a: any) => ({
    id: a.id,
    name: a.name,
    value: a.value_name,
  }));

  const brandObj = attributes.find((a: any) => a.id === 'BRAND');
  const modelObj = attributes.find((a: any) => a.id === 'MODEL');
  const brandAttr = brandObj ? brandObj.value : null;
  const modelAttr = modelObj ? modelObj.value : null;

  const apiDateCreated = fullProduct?.date_created || productSummary?.date_created || null;
  const firstPhotoUploadMonthYear = pictures[0] ? extractPhotoUploadDate(pictures[0]) : null;

  let daysOld: number | null = null;
  if (apiDateCreated) {
    daysOld = Math.max(1, Math.floor((Date.now() - new Date(apiDateCreated).getTime()) / 86400000));
  }

  const prices = itemsList.map((it: any) => Number(it.price)).filter((p: number) => p > 0);
  const mainPrice = winnerItem?.price ?? (prices.length > 0 ? prices[0] : null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : mainPrice;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : mainPrice;

  const permalink =
    fullProduct?.permalink ||
    winnerItem?.permalink ||
    'https://www.mercadolivre.com.br/p/' + productId;

  let sellerObject: any = null;
  if (sellerData) {
    sellerObject = {
      id: sellerData.id,
      nickname: sellerData.nickname,
      registration_date: sellerData.registration_date,
      account_age_years: sellerData.registration_date
        ? Math.max(1, new Date().getFullYear() - new Date(sellerData.registration_date).getFullYear())
        : null,
      city: sellerData.city || winnerItem?.seller_address?.city?.name || null,
      state: sellerData.state || winnerItem?.seller_address?.state?.id || null,
      power_seller_status: sellerData.power_seller_status,
      level_id: sellerData.level_id,
      completed_transactions: sellerData.completed_transactions,
      canceled_transactions: sellerData.canceled_transactions,
      total_transactions: sellerData.total_transactions,
      ratings_positive: sellerData.ratings_positive,
      permalink: sellerData.permalink,
    };
  } else if (sellerId) {
    sellerObject = {
      id: sellerId,
      nickname: 'ID Vendedor: ' + String(sellerId),
      registration_date: null,
      account_age_years: null,
      city: winnerItem?.seller_address?.city?.name || null,
      state: winnerItem?.seller_address?.state?.id || null,
      power_seller_status: null,
      level_id: null,
      completed_transactions: null,
      canceled_transactions: null,
      total_transactions: null,
      ratings_positive: null,
      permalink: null,
    };
  }

  return {
    product_id: productId,
    item_id: winnerItem?.item_id || null,
    title: fullProduct?.name || productSummary?.name || 'Produto sem titulo na API',
    status: fullProduct?.status || productSummary?.status || 'active',
    domain_id: fullProduct?.domain_id || productSummary?.domain_id || null,
    permalink,
    thumbnail: pictures[0] || '',
    pictures,
    price: mainPrice,
    min_price: minPrice,
    max_price: maxPrice,
    original_price: winnerItem?.original_price || null,
    currency_id: winnerItem?.currency_id || 'BRL',
    active_sellers_count: itemsList.length,
    date_created: apiDateCreated,
    days_old: daysOld,
    first_photo_month_year: firstPhotoUploadMonthYear,
    condition: winnerItem?.condition || 'new',
    listing_type_id: winnerItem?.listing_type_id || null,
    logistic_type: winnerItem?.shipping?.logistic_type || null,
    free_shipping: winnerItem?.shipping?.free_shipping ?? null,
    warranty: winnerItem?.warranty || null,
    item_sold_quantity: winnerItem?.sold_quantity ?? null,
    item_available_quantity: winnerItem?.available_quantity ?? null,
    brand: brandAttr,
    model: modelAttr,
    attributes: attributes.slice(0, 10),
    seller: sellerObject,
    competing_offers: itemsList.map((offer: any) => ({
      item_id: offer.item_id,
      seller_id: offer.seller_id,
      price: offer.price,
      condition: offer.condition,
      free_shipping: offer.shipping?.free_shipping ?? false,
      logistic_type: offer.shipping?.logistic_type || 'padrao',
      listing_type_id: offer.listing_type_id,
      city: offer.seller_address?.city?.name || null,
      state: offer.seller_address?.state?.id || null,
    })),
    raw_api_proof: {
      endpoint_product: 'https://api.mercadolibre.com/products/' + productId,
      endpoint_items: 'https://api.mercadolibre.com/products/' + productId + '/items',
      endpoint_seller: sellerId ? 'https://api.mercadolibre.com/users/' + String(sellerId) : null,
      product_date_created: apiDateCreated,
      winner_item: winnerItem,
      seller_response: sellerData?.raw_user_json || null,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQuery = (searchParams.get('q') || searchParams.get('input') || '').trim();

    const auth = await getOfficialAccessToken();
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
      });
    }

    const parsed = await parseInputQueryOrUrl(rawQuery);
    const rawCatalogResults: any[] = [];
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
        if (Array.isArray(searchData?.results) && searchData.results.length > 0) {
          const existingIds = new Set(rawCatalogResults.map((p) => p.id));
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
        executed_endpoint: executedEndpoint,
        total: 0,
        items: [],
        message:
          'A API Oficial (/products/search) nao encontrou produtos de catalogo para "' +
          usedSearchTerm +
          '". Tente usar palavras mais curtas (ex: Coroa Noiva, Creatina, Cadeira Gamer).',
      });
    }

    const hydratedItems = await Promise.all(
      rawCatalogResults.slice(0, 10).map((prod) => hydrateCatalogProduct(prod, authHeaders))
    );

    return NextResponse.json({
      ok: true,
      authenticated_client_id: CLIENT_ID,
      executed_endpoint: executedEndpoint,
      query_used: usedSearchTerm,
      total: hydratedItems.length,
      items: hydratedItems,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Erro na comunicacao com a API Oficial: ' + String(err?.message || 'Erro desconhecido'),
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
          const reply = visionData?.choices?.[0]?.message?.content?.trim() || '';
          if (reply && reply.length >= 2 && reply.length <= 50) {
            detectedKeyword = reply.replace(/[."']/g, '');
          }
        }
      } catch {
        /* Fallback pelo nome do arquivo */
      }
    }

    if (!detectedKeyword && filename) {
      const cleanName = String(filename)
        .replace(/\.[^/.]+\$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/whatsapp|image|captura|tela|screenshot|print|\d{4,}/gi, '')
        .trim();
      if (cleanName.length >= 3) detectedKeyword = cleanName;
    }

    return NextResponse.json({ keyword: detectedKeyword || 'Creatina' });
  } catch (err: any) {
    return NextResponse.json({ keyword: 'Creatina', error: err?.message });
  }
}

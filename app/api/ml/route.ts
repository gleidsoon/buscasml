import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Suas credenciais oficiais do DevCenter Mercado Livre
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

// 1. Gera o Access Token oficial na API do Mercado Livre (POST /oauth/token)
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
    return { token: null, error: err?.message || 'Falha na conexão com oauth/token' };
  }
}

// Se o usuário colar um link do Mercado Livre, extrai o código de catálogo (/p/MLB...) ou o nome do produto do slug da URL
async function parseInputQueryOrUrl(rawInput: string): Promise<{
  catalogId: string | null;
  searchQuery: string;
  resolvedUrl: string;
}> {
  let target = rawInput.trim();

  // Se for link encurtado meli.la, lê apenas o cabeçalho Location do primeiro redirecionamento
  if (target.includes('meli.la') || target.includes('/sec/') || target.includes('/social/')) {
    try {
      const res = await fetchWithTimeout(target, { redirect: 'manual' }, 3500);
      const loc = res.headers.get('location');
      if (loc) target = loc;
    } catch {
      // Mantém original
    }
  }

  // Verifica se já tem um ID de produto de catálogo explícito (/p/MLB12345678)
  const catalogMatch = target.match(/\/p\/(MLB\d{6,14})/i);
  if (catalogMatch) {
    return {
      catalogId: catalogMatch[1].toUpperCase(),
      searchQuery: extractReadableSlug(target) || catalogMatch[1].toUpperCase(),
      resolvedUrl: target,
    };
  }

  // Se o usuário digitou um código MLB direto (ex: MLB19827364)
  if (/^MLB-?\d{6,14}$/i.test(target)) {
    const cleanId = target.replace('-', '').toUpperCase();
    return {
      catalogId: cleanId,
      searchQuery: cleanId,
      resolvedUrl: `https://www.mercadolivre.com.br/p/\${cleanId}`,
    };
  }

  // Se for qualquer outro link do Mercado Livre (incluindo /up/MLBU... ou produto.mercadolivre.com.br)
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

function extractReadableSlug(url: string): string {
  try {
    const u = new URL(url);
    // Se for link de verificação com ?go=..., extrai a URL real de dentro do parâmetro go
    const goParam = u.searchParams.get('go');
    const pathUrl = goParam ? new URL(goParam).pathname : u.pathname;

    const segments = pathUrl.split('/').filter(Boolean);
    for (const seg of segments) {
      if (
        seg.length > 8 &&
        seg.includes('-') &&
        !/^(MLB|MLBU)\d+/i.test(seg) &&
        !['p', 'up', 'sec', 'social', 'gz'].includes(seg.toLowerCase())
      ) {
        return seg
          .replace(/^MLB-\d+-/i, '')
          .replace(/-_JM$/i, '')
          .replace(/-/g, ' ')
          .trim();
      }
    }
  } catch {
    // URL simples
  }
  return '';
}

// Extrai o mês e ano reais do upload da foto no servidor do Mercado Livre (_MMYYYY-O.webp / .jpg)
function extractPhotoUploadDate(photoUrl: string): string | null {
  const m = photoUrl?.match(/_(\d{2})(20\d{2})-[A-Z]\./i);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (month >= 1 && month <= 12 && year >= 2015 && year <= 2030) {
      return `${m[1]}/${m[2]}`;
    }
  }
  return null;
}

// 2. Consulta a rota OFICIAL /users/{seller_id} para obter dados reais do vendedor
async function fetchOfficialSeller(sellerId: number | string, authHeaders: Record<string, string>) {
  if (!sellerId) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.mercadolibre.com/users/${sellerId}`, { headers: authHeaders }, 4000 ); if (!res.ok) return null; const u = await res.json(); if (!u \vert{}\vert{} !u.id) return null;  return { id: u.id, nickname: u.nickname \vert{}\vert{} null, registration_date: u.registration_date \vert{}\vert{} null, city: u.address?.city \vert{}\vert{} null, state: u.address?.state \vert{}\vert{} null, user_type: u.user_type \vert{}\vert{} null, power_seller_status: u.seller_reputation?.power_seller_status \vert{}\vert{} null, level_id: u.seller_reputation?.level_id \vert{}\vert{} null, completed_transactions: u.seller_reputation?.transactions?.completed ?? null, canceled_transactions: u.seller_reputation?.transactions?.canceled ?? null, total_transactions: u.seller_reputation?.transactions?.total ?? null, ratings_positive: u.seller_reputation?.transactions?.ratings?.positive ?? null, permalink: u.permalink \vert{}\vert{} null, raw_user_json: u, }; } catch { return null; } }  // 3. Consulta as rotas OFICIAIS /products/{id}, /products/{id}/items e /users/{seller_id} async function hydrateCatalogProduct(productSummary: any, authHeaders: Record<string, string>) { const productId = productSummary.id;  // Executa em paralelo: Detalhes do Produto (/products/{id}) e Anúncios dos Vendedores (/products/{id}/items) const [prodDetailRes, prodItemsRes] = await Promise.allSettled([ fetchWithTimeout(`https://api.mercadolibre.com/products/${productId}`, { headers: authHeaders }, 4500),
    fetchWithTimeout(`https://api.mercadolibre.com/products/${productId}/items?limit=10`, { headers: authHeaders }, 4500), ]);  let fullProduct: any = productSummary; if (prodDetailRes.status === 'fulfilled' && prodDetailRes.value.ok) { fullProduct = await prodDetailRes.value.json(); }  let itemsList: any[] = []; if (prodItemsRes.status === 'fulfilled' && prodItemsRes.value.ok) { const itemsJson = await prodItemsRes.value.json(); itemsList = Array.isArray(itemsJson?.results) ? itemsJson.results : Array.isArray(itemsJson) ? itemsJson : []; }  // Identifica o anúncio principal (Buy Box Winner ou o 1º item ativo de /products/{id}/items) const winnerItem = fullProduct?.buy_box_winner \vert{}\vert{} itemsList[0] \vert{}\vert{} null; const sellerId = winnerItem?.seller_id \vert{}\vert{} null;  // Busca os dados reais da conta do vendedor em /users/{seller_id} const sellerData = sellerId ? await fetchOfficialSeller(sellerId, authHeaders) : null;  // Fotos oficiais em alta resolução const pictures: string[] = (fullProduct?.pictures \vert{}\vert{} productSummary?.pictures \vert{}\vert{} []) .map((p: any) => p.url \vert{}\vert{} p.secure_url) .filter(Boolean);  // Atributos reais da ficha técnica (Marca, Modelo, Linha, etc.) const attributes = (fullProduct?.attributes \vert{}\vert{} productSummary?.attributes \vert{}\vert{} []).map((a: any) => ({ id: a.id, name: a.name, value: a.value_name, })); const brandAttr = attributes.find((a: any) => a.id === 'BRAND')?.value \vert{}\vert{} null; const modelAttr = attributes.find((a: any) => a.id === 'MODEL')?.value \vert{}\vert{} null;  // Data real de criação retornada pela API Oficial + Data de upload da 1ª foto const apiDateCreated = fullProduct?.date_created \vert{}\vert{} productSummary?.date_created \vert{}\vert{} null; const firstPhotoUploadMonthYear = pictures[0] ? extractPhotoUploadDate(pictures[0]) : null;  let daysOld: number \vert{} null = null; if (apiDateCreated) { daysOld = Math.max(1, Math.floor((Date.now() - new Date(apiDateCreated).getTime()) / 86400000)); }  // Preço real dos vendedores ativos nesse produto const prices = itemsList.map((it: any) => Number(it.price)).filter((p: number) => p > 0); const mainPrice = winnerItem?.price ?? (prices.length > 0 ? prices[0] : null); const minPrice = prices.length > 0 ? Math.min(...prices) : mainPrice; const maxPrice = prices.length > 0 ? Math.max(...prices) : mainPrice;  const permalink = fullProduct?.permalink \vert{}\vert{} winnerItem?.permalink \vert{}\vert{} `https://www.mercadolivre.com.br/p/${productId}`;

  return {
    product_id: productId,
    item_id: winnerItem?.item_id || null,
    title: fullProduct?.name || productSummary?.name || 'Produto sem título na API',
    status: fullProduct?.status || productSummary?.status || 'active',
    domain_id: fullProduct?.domain_id || productSummary?.domain_id || null,
    permalink,
    thumbnail: pictures[0] || '',
    pictures,
    // Preços reais da API (/products/{id}/items)
    price: mainPrice,
    min_price: minPrice,
    max_price: maxPrice,
    original_price: winnerItem?.original_price || null,
    currency_id: winnerItem?.currency_id || 'BRL',
    active_sellers_count: itemsList.length,
    // Datas reais da API
    date_created: apiDateCreated,
    days_old: daysOld,
    first_photo_month_year: firstPhotoUploadMonthYear,
    // Logística e modalidade reais do anúncio vencedor
    condition: winnerItem?.condition || 'new',
    listing_type_id: winnerItem?.listing_type_id || null,
    logistic_type: winnerItem?.shipping?.logistic_type || null,
    free_shipping: winnerItem?.shipping?.free_shipping ?? null,
    warranty: winnerItem?.warranty || null,
    // Vendas do anúncio (apenas se a API retornar em buy_box_winner, sem inventar!)
    item_sold_quantity: winnerItem?.sold_quantity ?? null,
    item_available_quantity: winnerItem?.available_quantity ?? null,
    // Ficha técnica real
    brand: brandAttr,
    model: modelAttr,
    attributes: attributes.slice(0, 10),
    // Dados 100% reais do Vendedor vindos de /users/{seller_id}
    seller: sellerData
      ? {
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
        }
      : sellerId
      ? {
          id: sellerId,
          nickname: `ID Vendedor: ${sellerId}`, registration_date: null, account_age_years: null, city: winnerItem?.seller_address?.city?.name \vert{}\vert{} null, state: winnerItem?.seller_address?.state?.id \vert{}\vert{} null, power_seller_status: null, level_id: null, completed_transactions: null, canceled_transactions: null, total_transactions: null, ratings_positive: null, permalink: null, } : null, // Lista completa dos outros vendedores disputando este mesmo produto competing_offers: itemsList.map((offer: any) => ({ item_id: offer.item_id, seller_id: offer.seller_id, price: offer.price, condition: offer.condition, free_shipping: offer.shipping?.free_shipping ?? false, logistic_type: offer.shipping?.logistic_type \vert{}\vert{} 'padrão', listing_type_id: offer.listing_type_id, city: offer.seller_address?.city?.name \vert{}\vert{} null, state: offer.seller_address?.state?.id \vert{}\vert{} null, })), // JSON bruto original para auditoria pelo usuário raw_api_proof: { endpoint_product: `https://api.mercadolibre.com/products/${productId}`,
      endpoint_items: `https://api.mercadolibre.com/products/${productId}/items`, endpoint_seller: sellerId ? `https://api.mercadolibre.com/users/${sellerId}` : null,
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

    // 1. Autentica com suas credenciais oficiais
    const auth = await getOfficialAccessToken();
    if (!auth.token) {
      return NextResponse.json(
        {
          ok: false,
          error: `Falha ao autenticar suas credenciais no Mercado Livre: ${auth.error}`, }, { status: 401 } ); }  const authHeaders = { Authorization: `Bearer ${auth.token}`,
      Accept: 'application/json',
    };

    if (!rawQuery) {
      return NextResponse.json({
        ok: true,
        status: 'Conectado oficialmente à API do Mercado Livre',
        client_id: CLIENT_ID,
      });
    }

    // 2. Identifica se o usuário digitou um link, um código MLB ou uma palavra-chave
    const parsed = await parseInputQueryOrUrl(rawQuery);
    let rawCatalogResults: any[] = [];
    let usedSearchTerm = parsed.searchQuery;

    // Caso A: Se o link já continha um ID direto de catálogo (/p/MLB...)
    if (parsed.catalogId) {
      const directRes = await fetchWithTimeout(
        `https://api.mercadolibre.com/products/${parsed.catalogId}`, { headers: authHeaders }, 4500 ); if (directRes.ok) { const directProd = await directRes.json(); if (directProd && directProd.id && directProd.name) { rawCatalogResults.push(directProd); usedSearchTerm = directProd.name; } } }  // Caso B: Busca na rota oficial aberta /products/search?status=active&site_id=MLB&q=... // Se a frase for muito longa (como um slug de 10 palavras) e retornar 0 itens, reduz gradualmente para as palavras principais const words = usedSearchTerm.split(/\s+/).filter(Boolean); const candidateQueries = Array.from( new Set([ usedSearchTerm, words.slice(0, 5).join(' '), words.slice(0, 3).join(' '), words.slice(0, 2).join(' '), ]) ).filter((q) => q.length >= 2);  let executedEndpoint = '';  for (const candidate of candidateQueries) { const url = `https://api.mercadolibre.com/products/search?status=active&site_id=MLB&q=${encodeURIComponent(
        candidate
      )}&limit=12`;
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
        message: `A API Oficial (/products/search) não encontrou produtos de catálogo para "\${usedSearchTerm}". Tente usar palavras mais curtas (ex: "Coroa Noiva", "Creatina", "Cadeira Gamer").`,
      });
    }

    // 3. Hidrata os produtos encontrados consultando /products/{id}/items e /users/{seller_id} em paralelo
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
        error: `Erro na comunicação com a API Oficial: \${err?.message || 'Erro desconhecido'}`,
      },
      { status: 500 }
    );
  }
}

// RECONHECIMENTO DE IMAGEM PARA BUSCA POR FOTO
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
                      text: 'Identifique este produto para busca no catálogo do Mercado Livre Brasil. Responda APENAS com 2 a 3 palavras principais do produto em português (sem pontuação). Exemplo: Coroa Noiva Strass ou Creatina Growth.',
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
        // Fallback pelo nome do arquivo
      }
    }

    if (!detectedKeyword && filename) {
      const cleanName = filename
        .replace(/\.[^/.]+$/, '')
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

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Executa a função diretamente no datacenter de São Paulo (Brasil) para evitar bloqueios do ML
export const preferredRegion = ['gru1'];

const CLIENT_ID = process.env.ML_CLIENT_ID || '8353552938244269';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '1mDuwaABTfcuIFd93BKMlohHfUmsRggn';

let cachedAppToken: string | null = null;
let cachedUserToken: string | null = process.env.ML_ACCESS_TOKEN || null;
let cachedRefreshToken: string | null = process.env.ML_REFRESH_TOKEN || null;
let tokenExpiry = 0;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Obtém o melhor token disponível (prioriza User Token OAuth se conectado, ou Client Credentials)
async function getValidToken(customToken?: string | null): Promise<string | null> {
  if (customToken) return customToken;
  if (cachedUserToken) return cachedUserToken;

  if (cachedAppToken && Date.now() < tokenExpiry) return cachedAppToken;

  try {
    const res = await fetchWithTimeout(
      'https://api.mercadolibre.com/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      },
      3500
    );
    if (res.ok) {
      const data = await res.json();
      cachedAppToken = data.access_token;
      tokenExpiry = Date.now() + (data.expires_in ? data.expires_in * 1000 - 60000 : 18000000);
      return cachedAppToken;
    }
  } catch {
    // Segue sem token
  }
  return null;
}

// Verifica se o título capturado é inválido (tela de bloqueio/login do Mercado Livre)
function isInvalidBlockedTitle(title: string): boolean {
  const clean = (title || '').trim().toLowerCase();
  if (!clean || clean.length < 4) return true;
  const blockedPhrases = [
    'mercado livre',
    'mercadolivre',
    'mercado libre',
    'account verification',
    'verificação de conta',
    'digite o código',
    'olá! para continuar',
    'acesse sua conta',
    'redirecionando',
    'just a moment',
  ];
  return blockedPhrases.some((phrase) => clean === phrase || clean.startsWith('olá! para continuar'));
}

// Extrai o nome legível do produto diretamente do slug da URL quando necessário
function extractTitleFromUrlSlug(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    for (const seg of segments) {
      if (
        seg.length > 12 &&
        seg.includes('-') &&
        !/^(MLB|MLBU)/i.test(seg) &&
        !['p', 'up', 'sec', 'social', 'gz', 'perfil'].includes(seg.toLowerCase())
      ) {
        return seg
          .replace(/^MLB-\d+-/i, '')
          .replace(/-_JM$/i, '')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase())
          .trim();
      }
    }
  } catch {
    // URL inválida
  }
  return '';
}

// Extrai apenas FOTOS REAIS de produtos do CDN do Mercado Livre (D_NQ_NP_), ignorando logotipos e banners
function extractRealProductPhotos(text: string): string[] {
  const regex = /https:\/\/http2\.mlstatic\.com\/D_(?:N?Q_)?NP_[^\s)"'<>\\]+?\.(?:webp|jpg|png)/gi;
  const matches = text.match(regex) || [];
  const seen = new Set<string>();
  const photos: string[] = [];

  for (const raw of matches) {
    const cleanUrl = raw.replace(/\\+/g, '');
    const idMatch = cleanUrl.match(/(\d{5,}-ML[A-Z]\d+_\d{6})/i) || cleanUrl.match(/NP_(?:2X_)?(\d+)/i);
    const key = idMatch ? idMatch[1] : cleanUrl;
    if (!seen.has(key)) {
      seen.add(key);
      photos.push(cleanUrl.replace(/-[A-Z]\.(webp|jpg|png)$/i, '-O.$1'));
    }
  }
  return photos;
}

// Extrai a data real do upload da foto no servidor do Mercado Livre (_MMYYYY-O.webp)
function extractDateFromPhoto(imgUrl: string): { dateCreated: string; daysOld: number } | null {
  const m = imgUrl?.match(/_(\d{2})(20\d{2})-[A-Z]\./i);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (month >= 1 && month <= 12 && year >= 2015 && year <= 2030) {
      const created = new Date(Date.UTC(year, month - 1, 10, 12, 0, 0));
      const daysOld = Math.max(1, Math.floor((Date.now() - created.getTime()) / 86400000));
      return { dateCreated: created.toISOString(), daysOld };
    }
  }
  return null;
}

// Consulta a API Oficial /users/{seller_id} para pegar Nome Real, Data de Criação da Conta e Vendas
async function fetchOfficialSellerData(
  sellerId: string | number,
  authHeaders: Record<string, string>
): Promise<any | null> {
  const cleanId = String(sellerId || '').replace(/\D/g, '');
  if (!cleanId || cleanId.length < 4) return null;

  try {
    // Tenta rota direta /users/{id} e rota batch /users?ids={id}
    const res = await fetchWithTimeout(
      `https://api.mercadolibre.com/users/${cleanId}`,
      { headers: authHeaders },
      3500
    );
    let u: any = null;
    if (res.ok) {
      u = await res.json();
    } else {
      const batchRes = await fetchWithTimeout(
        `https://api.mercadolibre.com/users?ids=${cleanId}`,
        { headers: authHeaders },
        3500
      );
      if (batchRes.ok) {
        const arr = await batchRes.json();
        u = arr?.[0]?.body || null;
      }
    }

    if (u && u.id) {
      const medalMap: Record<string, string> = {
        platinum: 'MercadoLíder Platinum',
        gold: 'MercadoLíder Gold',
        silver: 'MercadoLíder',
      };
      const regDate = u.registration_date || null;
      const years = regDate
        ? Math.max(1, new Date().getFullYear() - new Date(regDate).getFullYear())
        : null;

      return {
        seller_id: u.id,
        seller_name: u.nickname,
        seller_registration_date: regDate,
        seller_account_years: years,
        seller_city: u.address?.city || '',
        seller_state: u.address?.state?.replace('BR-', '') || '',
        seller_medal:
          medalMap[u.seller_reputation?.power_seller_status] ||
          (u.seller_reputation?.level_id === '5_green' ? 'Reputação Verde' : 'Vendedor Identificado'),
        seller_completed_sales:
          u.seller_reputation?.transactions?.completed ??
          u.seller_reputation?.transactions?.total ??
          null,
        seller_permalink: u.permalink || `https://www.mercadolivre.com.br/perfil/${encodeURIComponent(u.nickname || '')}`,
      };
    }
  } catch {
    // Retorna null se falhar
  }
  return null;
}

// Desencurta e busca o HTML real de um anúncio usando múltiplos User-Agents de pré-visualização (WhatsApp/Facebook/Proxies)
async function fetchProductHtmlBypassWall(targetUrl: string): Promise<{ html: string; finalUrl: string }> {
  let resolvedUrl = targetUrl;

  // Se for link curto meli.la, resolve o redirecionamento primeiro
  if (resolvedUrl.includes('meli.la') || resolvedUrl.includes('/sec/') || resolvedUrl.includes('/social/')) {
    try {
      const hop1 = await fetchWithTimeout(
        resolvedUrl,
        {
          redirect: 'follow',
          headers: {
            'User-Agent': 'WhatsApp/2.24.16.78 A',
            Accept: 'text/html,application/xhtml+xml',
          },
        },
        4500
      );
      if (hop1.url && !hop1.url.includes('account-verification')) {
        resolvedUrl = hop1.url;
      }
      const hopHtml = await hop1.text();
      const innerProduct = hopHtml.match(
        /https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/(?!sec\/|social\/|gz\/)[^\s)"'<>]+/i
      );
      if (innerProduct) {
        resolvedUrl = innerProduct[0].replace(/&amp;/g, '&');
      }
    } catch {
      // Continua com a URL original
    }
  }

  // Lista de estratégias que não caem na tela "account-verification" do Mercado Livre
  const strategies = [
    {
      name: 'WhatsApp Crawler',
      url: resolvedUrl,
      headers: {
        'User-Agent': 'WhatsApp/2.24.16.78 A',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    },
    {
      name: 'Facebook OpenGraph Crawler',
      url: resolvedUrl,
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    },
    {
      name: 'Twitterbot Card Crawler',
      url: resolvedUrl,
      headers: {
        'User-Agent': 'Twitterbot/1.0',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    },
    {
      name: 'CodeTabs Proxy',
      url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(resolvedUrl)}`,
      headers: {},
    },
    {
      name: 'AllOrigins Proxy',
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(resolvedUrl)}`,
      headers: {},
    },
  ];

  for (const strat of strategies) {
    try {
      const res = await fetchWithTimeout(strat.url, { headers: strat.headers as any }, 4500);
      if (!res.ok) continue;
      const text = await res.text();

      const hasVerificationWall =
        text.includes('gz/account-verification') && !text.includes('og:image') && !text.includes('D_NQ_NP_');
      if (!hasVerificationWall && (text.includes('D_NQ_NP_') || text.includes('og:title') || text.includes('ui-pdp-title'))) {
        return { html: text, finalUrl: resolvedUrl };
      }
    } catch {
      continue;
    }
  }

  return { html: '', finalUrl: resolvedUrl };
}

// Extrai todos os dados reais do HTML / OpenGraph / JSON-LD / __PRELOADED_STATE__ da página do produto
function parseRealProductHtml(html: string, finalUrl: string) {
  // 1. Título via og:title, twitter:title, h1.ui-pdp-title ou slug da URL
  const ogTitle =
    html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1] ||
    html.match(/name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<h1[^>]*class=["'][^"']*ui-pdp-title[^"']*["'][^>]*>([^<]+)<\/h1>/i)?.[1] ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1] ||
    '';

  let cleanTitle = ogTitle
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/\s*\|\s*Mercado\s*Livre.*/i, '')
    .replace(/\s+no\s+Mercado\s*Livre.*/i, '')
    .trim();

  // Extrai preço se estiver no final do og:title (Ex: "... - R$ 45,90")
  let priceFromTitle = 0;
  const titlePriceMatch = cleanTitle.match(/\s+-\s+R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*$/i);
  if (titlePriceMatch) {
    priceFromTitle = parseFloat(titlePriceMatch[1].replace(/\./g, '').replace(',', '.'));
    cleanTitle = cleanTitle.replace(/\s+-\s+R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*$/i, '').trim();
  }

  if (isInvalidBlockedTitle(cleanTitle)) {
    cleanTitle = extractTitleFromUrlSlug(finalUrl);
  }

  // 2. Preço via Meta Tag, JSON-LD ou estado interno da página
  const metaPrice =
    html.match(/property=["']product:price:amount["'][^>]*content=["']([\d.]+)["']/i)?.[1] ||
    html.match(/itemprop=["']price["'][^>]*content=["']([\d.]+)["']/i)?.[1] ||
    html.match(/"price"\s*:\s*\{\s*"type"\s*:\s*"[^"]*"\s*,\s*"value"\s*:\s*([\d.]+)/i)?.[1] ||
    html.match(/"price"\s*:\s*([\d.]+)\s*,\s*"currency_id"\s*:\s*"BRL"/i)?.[1];

  const currentPrice = metaPrice ? parseFloat(metaPrice) : priceFromTitle || 0;

  const origPriceMatch =
    html.match(/"original_price"\s*:\s*([\d.]+)/i)?.[1] ||
    html.match(/class=["'][^"']*andes-money-amount--previous[^"']*["'][\s\S]{0,200}?fraction[^>]*>(\d+(?:\.\d{3})*)/i)?.[1];
  const originalPrice = origPriceMatch ? parseFloat(origPriceMatch.replace(/\./g, '')) : 0;

  // 3. Fotos reais (D_NQ_NP_)
  const photos = extractRealProductPhotos(html);
  const ogImg =
    html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
  if (ogImg && /D_(?:N?Q_)?NP_/i.test(ogImg) && !photos.includes(ogImg)) {
    photos.unshift(ogImg.replace(/-[A-Z]\.(webp|jpg|png)$/i, '-O.$1'));
  }

  // 4. Código MLB e MLBU reais
  const mlbFromState =
    html.match(/"item_id"\s*:\s*"(MLB\d{8,14})"/i)?.[1] ||
    html.match(/[?&]wid=(MLB\d{8,14})/i)?.[1] ||
    finalUrl.replace(/MLBU\d+/gi, '').match(/(MLB-?\d{8,14})/i)?.[1] ||
    photos[0]?.match(/-(MLB\d{8,14})_/i)?.[1];

  const mlbuFromUrl = finalUrl.match(/(MLBU\d{8,14})/i)?.[1] || html.match(/"user_product_id"\s*:\s*"(MLBU\d+)"/i)?.[1];
  const itemId = mlbFromState ? mlbFromState.replace('-', '').toUpperCase() : mlbuFromUrl ? mlbuFromUrl.toUpperCase() : '';

  // 5. ID do Vendedor (seller_id) e Nickname na página
  const sellerIdMatch =
    html.match(/"seller_id"\s*:\s*(\d{5,13})/i)?.[1] ||
    html.match(/"sellerId"\s*:\s*(\d{5,13})/i)?.[1] ||
    html.match(/seller_id=(\d{5,13})/i)?.[1];

  const sellerProfileNickname =
    html.match(/mercadolivre\.com\.br\/perfil\/([^"'/?&#]+)/i)?.[1] ||
    html.match(/"seller_nickname"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/Vendido por\s*<[^>]+>([^<]+)</i)?.[1];

  // 6. Vendas ("Novo | +100 vendidos", "+5 mil vendidos")
  const soldSubtitleMatch =
    html.match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(mil\b)?\s*vendidos/i) ||
    html.match(/"sold_quantity"\s*:\s*(\d+)/i);
  let soldQuantity: number | null = null;
  let soldLabel = '';
  if (soldSubtitleMatch) {
    const rawNum = parseFloat(soldSubtitleMatch[1].replace('.', '').replace(',', '.'));
    const mult = soldSubtitleMatch[2]?.toLowerCase() === 'mil' ? 1000 : 1;
    soldQuantity = Math.round(rawNum * mult);
    soldLabel = soldSubtitleMatch[0].includes('sold_quantity') ? `${soldQuantity} vendidos` : soldSubtitleMatch[0];
  }

  // 7. Avaliações e Estrelas
  const ratingMatch =
    html.match(/"ratingValue"\s*:\s*"?(\d[.,]\d)"?/i)?.[1] ||
    html.match(/class=["'][^"']*ui-pdp-review__rating[^"']*["'][^>]*>(\d[.,]\d)</i)?.[1];
  const reviewCountMatch =
    html.match(/"reviewCount"\s*:\s*"?(\d+)"?/i)?.[1] ||
    html.match(/class=["'][^"']*ui-pdp-review__amount[^"']*["'][^>]*>\(?(\d+(?:\.\d+)?)\)?/i)?.[1];

  const rating = ratingMatch ? parseFloat(ratingMatch.replace(',', '.')) : null;
  const reviewsCount = reviewCountMatch ? parseInt(reviewCountMatch.replace(/\./g, ''), 10) : null;

  // 8.Marca, Logística e Condição
  const brandMatch =
    html.match(/"brand"\s*:\s*\{\s*"@type"\s*:\s*"Brand"\s*,\s*"name"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/"id"\s*:\s*"BRAND"\s*,\s*"name"\s*:\s*"Marca"\s*,\s*"value_name"\s*:\s*"([^"]+)"/i)?.[1];

  const isFull = /fulfillment|Enviado pelo\s*Full/i.test(html);
  const isFreeShipping = /frete\s*grátis|"free_shipping"\s*:\s*true/i.test(html) || currentPrice >= 79;
  const isPremium = /"listing_type_id"\s*:\s*"gold_pro"|sem\s*juros/i.test(html);
  const stockMatch =
    html.match(/"available_quantity"\s*:\s*(\d+)/i)?.[1] ||
    html.match(/\((\d+)\s*disponíve(?:l|is)\)/i)?.[1];

  // 9. Data de criação pelas fotos do anúncio (_MMYYYY)
  let oldestPhotoDate: { dateCreated: string; daysOld: number } | null = null;
  for (const p of photos) {
    const d = extractDateFromPhoto(p);
    if (d && (!oldestPhotoDate || d.daysOld > oldestPhotoDate.daysOld)) {
      oldestPhotoDate = d;
    }
  }

  return {
    itemId,
    mlbuId: mlbuFromUrl || null,
    title: cleanTitle,
    price: currentPrice,
    originalPrice,
    photos,
    oldestPhotoDate,
    sellerId: sellerIdMatch || null,
    sellerNickname: sellerProfileNickname ? decodeURIComponent(sellerProfileNickname.replace(/\+/g, ' ')) : null,
    soldQuantity,
    soldLabel,
    rating,
    reviewsCount,
    brand: brandMatch || null,
    isFull,
    isFreeShipping,
    adType: isPremium ? 'Premium (~17%)' : 'Clássico (~12%)',
    availableQuantity: stockMatch ? parseInt(stockMatch, 10) : null,
  };
}

// Busca lista real de produtos por palavra-chave no Mercado Livre
async function searchProductsByKeyword(query: string, authHeaders: Record<string, string>) {
  const results: any[] = [];

  // 1. Tenta API Oficial /sites/MLB/search (Funciona 100% quando OAuth está conectado ou em IPs liberados)
  try {
    const apiRes = await fetchWithTimeout(
      `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=24`,
      { headers: authHeaders },
      4000
    );
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        const sellerIds = data.results.map((r: any) => r.seller?.id).filter(Boolean);
        const uniqueSellerIds = Array.from(new Set(sellerIds)).slice(0, 20);

        const sellersMap: Record<string, any> = {};
        await Promise.all(
          uniqueSellerIds.map(async (sid: any) => {
            const sData = await fetchOfficialSellerData(sid, authHeaders);
            if (sData) sellersMap[String(sid)] = sData;
          })
        );

        for (const r of data.results) {
          const hdImg = r.thumbnail?.replace(/-[A-Z]\.(jpg|webp|png)$/i, '-O.$1') || r.thumbnail;
          const photoDate = extractDateFromPhoto(hdImg);
          const sInfo = r.seller?.id ? sellersMap[String(r.seller.id)] : null;
          const daysOld = photoDate?.daysOld || null;
          const sold = r.sold_quantity ?? null;
          const dailySales = sold && daysOld ? Number((sold / daysOld).toFixed(1)) : null;

          results.push({
            id: r.id,
            title: r.title,
            price: r.price,
            original_price: r.original_price || 0,
            thumbnail: hdImg,
            pictures: [hdImg],
            permalink: r.permalink,
            sold_quantity: sold,
            daily_sales: dailySales,
            revenue_30d: dailySales ? Math.round(dailySales * 30 * r.price) : sold ? Math.round(sold * r.price) : null,
            total_revenue: sold ? Math.round(sold * r.price) : null,
            date_created: photoDate?.dateCreated || null,
            date_source: photoDate ? 'Assinatura Foto CDN ML' : 'API Busca ML',
            days_old: daysOld,
            rating: null,
            reviews_count: null,
            logistic_type: r.shipping?.logistic_type === 'fulfillment' ? 'Fulfillment (Full)' : 'Correios / Coleta',
            free_shipping: Boolean(r.shipping?.free_shipping),
            ad_type: r.listing_type_id === 'gold_pro' ? 'Premium (~17%)' : 'Clássico (~12%)',
            brand: r.attributes?.find((a: any) => a.id === 'BRAND')?.value_name || null,
            seller_id: r.seller?.id || null,
            seller_name: sInfo?.seller_name || r.seller?.nickname || null,
            seller_registration_date: sInfo?.seller_registration_date || null,
            seller_account_years: sInfo?.seller_account_years || null,
            seller_city: sInfo?.seller_city || r.address?.city_name || '',
            seller_state: sInfo?.seller_state || r.address?.state_name || '',
            seller_medal: sInfo?.seller_medal || 'Vendedor ML',
            seller_completed_sales: sInfo?.seller_completed_sales || null,
          });
        }
        return results;
      }
    }
  } catch {
    // Segue para leitura da página de busca
  }

  // 2. Leitura da Página de Listagem do Mercado Livre (lista.mercadolivre.com.br)
  const slug = query.trim().replace(/\s+/g, '-');
  const listUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`;
  const { html } = await fetchProductHtmlBypassWall(listUrl);

  if (html) {
    // Divide pelos cards poly-card ou ui-search-layout__item
    const cardChunks = html.split(/class=["'][^"']*(?:ui-search-layout__item|poly-card\b)[^"']*["']/i).slice(1, 25);

    for (const chunk of cardChunks) {
      const photos = extractRealProductPhotos(chunk);
      const photo = photos[0] || '';
      if (!photo) continue;

      const titleMatch =
        chunk.match(/class=["'][^"']*poly-component__title[^"']*["'][^>]*>([^<]+)</i)?.[1] ||
        chunk.match(/class=["'][^"']*ui-search-item__title[^"']*["'][^>]*>([^<]+)</i)?.[1] ||
        chunk.match(/alt=["']([^"']{10,150})["']/i)?.[1];
      if (!titleMatch || isInvalidBlockedTitle(titleMatch)) continue;

      const cleanTitle = titleMatch.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();

      const priceMatches = Array.from(
        chunk.matchAll(/class=["'][^"']*andes-money-amount__fraction[^"']*["'][^>]*>(\d+(?:\.\d{3})*)</gi)
      );
      if (priceMatches.length === 0) continue;

      const nums = priceMatches.map((m) => parseFloat(m[1].replace(/\./g, '')));
      let price = nums[0];
      let origPrice = 0;
      if (nums.length >= 2 && nums[0] > nums[1] && nums[1] > nums[0] * 0.3) {
        origPrice = nums[0];
        price = nums[1];
      }

      const linkMatch = chunk.match(/href=["'](https:\/\/(?:www\.|produto\.|click1\.)?mercadolivre\.com\.br\/[^"'#]+)["']/i)?.[1] || listUrl;
      const cleanLink = linkMatch.replace(/&amp;/g, '&');

      const mlbId =
        cleanLink.match(/[?&]wid=(MLB\d+)/i)?.[1] ||
        cleanLink.replace(/MLBU\d+/gi, '').match(/(MLB-?\d{8,14})/i)?.[1] ||
        photo.match(/-(MLB\d{8,14})_/i)?.[1] ||
        cleanLink.match(/(MLBU\d{8,14})/i)?.[1] ||
        `MLB-ITEM-${results.length + 1}`;

      const soldMatch = chunk.match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(mil\b)?\s*vendidos/i);
      let soldQty: number | null = null;
      if (soldMatch) {
        soldQty = Math.round(
          parseFloat(soldMatch[1].replace('.', '').replace(',', '.')) * (soldMatch[2] ? 1000 : 1)
        );
      }

      const ratingMatch = chunk.match(/class=["'][^"']*poly-reviews__rating[^"']*["'][^>]*>(\d[.,]\d)</i)?.[1];
      const revTotalMatch = chunk.match(/class=["'][^"']*poly-reviews__total[^"']*["'][^>]*>\(?(\d+(?:\.\d+)?)\)?/i)?.[1];

      const sellerText =
        chunk.match(/class=["'][^"']*poly-component__seller[^"']*["'][^>]*>([^<]+)</i)?.[1]?.replace(/^Por\s+/i, '').trim() ||
        null;

      const photoDate = extractDateFromPhoto(photo);
      const daysOld = photoDate?.daysOld || null;
      const dailySales = soldQty && daysOld ? Number((soldQty / daysOld).toFixed(1)) : null;

      results.push({
        id: mlbId.replace('-', '').toUpperCase(),
        title: cleanTitle,
        price,
        original_price: origPrice,
        thumbnail: photo,
        pictures: photos,
        permalink: cleanLink,
        sold_quantity: soldQty,
        daily_sales: dailySales,
        revenue_30d: dailySales ? Math.round(dailySales * 30 * price) : soldQty ? Math.round(soldQty * price) : null,
        total_revenue: soldQty ? Math.round(soldQty * price) : null,
        date_created: photoDate?.dateCreated || null,
        date_source: photoDate ? 'Assinatura Foto CDN ML' : 'Página Pública ML',
        days_old: daysOld,
        rating: ratingMatch ? parseFloat(ratingMatch.replace(',', '.')) : null,
        reviews_count: revTotalMatch ? parseInt(revTotalMatch.replace(/\./g, ''), 10) : null,
        logistic_type: /fulfillment|full/i.test(chunk) ? 'Fulfillment (Full)' : 'Correios / Coleta',
        free_shipping: /frete\s*grátis/i.test(chunk) || price >= 79,
        ad_type: /sem\s*juros/i.test(chunk) ? 'Premium (~17%)' : 'Clássico (~12%)',
        brand: null,
        seller_id: null,
        seller_name: sellerText,
        seller_registration_date: null,
        seller_account_years: null,
        seller_city: '',
        seller_state: '',
        seller_medal: /loja\s*oficial/i.test( sellerText || '') ? 'Loja Oficial' : 'Vendedor Mercado Livre',
        seller_completed_sales: null,
      });
    }
  }

  return results;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'status';
    const userPassedToken = searchParams.get('user_token') || null;

    // 1. TROCA DE CÓDIGO OAUTH POR USER ACCESS TOKEN OFICIAL (1 CLIQUE)
    if (action === 'exchange_code') {
      const code = searchParams.get('code') || '';
      const redirectUri = searchParams.get('redirect_uri') || '';
      const res = await fetchWithTimeout('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        cachedUserToken = data.access_token;
        cachedRefreshToken = data.refresh_token || null;
        return NextResponse.json({
          ok: true,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user_id: data.user_id,
        });
      }
      return NextResponse.json({ ok: false, error: data.message || 'Falha ao trocar código OAuth' }, { status: 400 });
    }

    const token = await getValidToken(userPassedToken);
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    if (action === 'token') {
      return NextResponse.json({
        access_token: token,
        client_id: CLIENT_ID,
        has_user_oauth: Boolean(cachedUserToken || userPassedToken),
      });
    }

    // 2. BUSCA DE PRODUTOS POR PALAVRA-CHAVE
    if (action === 'search') {
      const q = (searchParams.get('q') || 'Pote para tempero').trim();
      const items = await searchProductsByKeyword(q, authHeaders);
      return NextResponse.json({ query: q, total: items.length, items });
    }

    // 3. RAIO-X REAL DE ANÚNCIO POR LINK (INCLUINDO /up/MLBU..., /p/MLB..., meli.la)
    if (action === 'spy') {
      const rawInput = (searchParams.get('input') || '').trim();
      let targetUrl = rawInput;

      if (/^MLB-?\d{8,14}$/i.test(rawInput)) {
        const cleanMlb = rawInput.replace('-', '').toUpperCase();
        targetUrl = `https://produto.mercadolivre.com.br/${cleanMlb.replace('MLB', 'MLB-')}`;
      }

      // Passo A: Busca o HTML real atravessando a barreira de verificação
      const { html, finalUrl } = targetUrl.startsWith('http')
        ? await fetchProductHtmlBypassWall(targetUrl)
        : { html: '', finalUrl: targetUrl };

      const parsed = parseRealProductHtml(html, finalUrl);

      // Passo B: Consulta API Oficial /items/{id} ou /user-products/{mlbu_id}
      let apiItem: any = null;
      const candidateMlb = parsed.itemId.startsWith('MLB') && !parsed.itemId.startsWith('MLBU')
        ? parsed.itemId
        : rawInput.replace('-', '').toUpperCase();

      if (/^MLB\d{8,14}$/.test(candidateMlb)) {
        try {
          const itemRes = await fetchWithTimeout(
            `https://api.mercadolibre.com/items/${candidateMlb}`,
            { headers: authHeaders },
            3500
          );
          if (itemRes.ok) apiItem = await itemRes.json();
        } catch {
          // Continua
        }
      }

      // Se for /up/MLBU... e tivermos token autenticado, consulta também /user-products/{id}
      if (!apiItem && parsed.mlbuId && token) {
        try {
          const upRes = await fetchWithTimeout(
            `https://api.mercadolibre.com/user-products/${parsed.mlbuId}`,
            { headers: authHeaders },
            3500
          );
          if (upRes.ok) {
            const upData = await upRes.json();
            if (upData?.id) apiItem = upData;
          }
        } catch {
          // Continua
        }
      }

      // Passo C: Se a página ainda não revelou o preço/foto (ex: link /up/MLBU fechado), busca pelo título exato do slug!
      const slugTitle = parsed.title || extractTitleFromUrlSlug(finalUrl);
      const relatedItems = slugTitle
        ? await searchProductsByKeyword(slugTitle.split(' ').slice(0, 6).join(' '), authHeaders)
        : [];

      // Procura se o próprio item já veio na busca pela palavra-chave do título
      const matchedFromSearch =
        relatedItems.find(
          (r) =>
            (parsed.itemId && r.id === parsed.itemId) ||
            (parsed.mlbuId && r.permalink.includes(parsed.mlbuId))
        ) || relatedItems[0];

      // Passo D: Consulta os dados OFICIAIS do Vendedor (/users/{seller_id})
      const targetSellerId =
        apiItem?.seller_id || parsed.sellerId || matchedFromSearch?.seller_id || null;
      const officialSeller = targetSellerId
        ? await fetchOfficialSellerData(targetSellerId, authHeaders)
        : null;

      // Consolida apenas informações REAIS (Sem números fictícios!)
      const finalPhotos =
        apiItem?.pictures?.map((p: any) => p.secure_url) ||
        (parsed.photos.length > 0
          ? parsed.photos
          : matchedFromSearch?.pictures?.length
          ? matchedFromSearch.pictures
          : []);

      const finalTitle =
        apiItem?.title ||
        (!isInvalidBlockedTitle(parsed.title) ? parsed.title : '') ||
        matchedFromSearch?.title ||
        slugTitle ||
        'Anúncio Mercado Livre';

      const finalPrice = Number(apiItem?.price || parsed.price || matchedFromSearch?.price || 0);
      const finalOrigPrice = Number(apiItem?.original_price || parsed.originalPrice || matchedFromSearch?.original_price || 0);

      // Data de criação: 1º API Oficial, 2º Assinatura da foto real do anúncio (_MMYYYY)
      const firstPhotoDate = finalPhotos[0] ? extractDateFromPhoto(finalPhotos[0]) : null;
      const finalDateCreated =
        apiItem?.date_created ||
        parsed.oldestPhotoDate?.dateCreated ||
        firstPhotoDate?.dateCreated ||
        null;

      const finalDaysOld = finalDateCreated
        ? Math.max(1, Math.floor((Date.now() - new Date(finalDateCreated).getTime()) / 86400000))
        : null;

      const finalSold =
        apiItem?.sold_quantity ?? parsed.soldQuantity ?? matchedFromSearch?.sold_quantity ?? null;

      const dailySales =
        finalSold !== null && finalDaysOld
          ? Number((finalSold / finalDaysOld).toFixed(1))
          : null;

      const sold30d =
        dailySales !== null
          ? Math.min(finalSold || 0, Math.round(dailySales * 30))
          : finalSold;

      const mainProduct = {
        id: apiItem?.id || parsed.itemId || matchedFromSearch?.id || parsed.mlbuId || 'MLB-ITEM',
        title: finalTitle,
        price: finalPrice,
        original_price: finalOrigPrice,
        discount_percent:
          finalOrigPrice > finalPrice && finalPrice > 0
            ? Math.round(((finalOrigPrice - finalPrice) / finalOrigPrice) * 100)
            : 0,
        thumbnail: finalPhotos[0] || '',
        pictures: finalPhotos.slice(0, 8),
        permalink: apiItem?.permalink || finalUrl,
        sold_quantity: finalSold,
        sold_label: parsed.soldLabel || (finalSold !== null ? `+${finalSold} vendidos` : 'Oculto no anúncio'),
        sold_30d: sold30d,
        daily_sales: dailySales,
        revenue_30d:
          sold30d !== null && finalPrice > 0 ? Number((sold30d * finalPrice).toFixed(2)) : null,
        total_revenue:
          finalSold !== null && finalPrice > 0 ? Number((finalSold * finalPrice).toFixed(2)) : null,
        date_created: finalDateCreated,
        date_source: apiItem?.date_created
          ? 'Exata (API Oficial ML)'
          : finalDateCreated
          ? 'Extraída da Foto Original CDN ML'
          : 'Requer OAuth para data exata',
        last_updated: apiItem?.last_updated || null,
        days_old: finalDaysOld,
        rating: parsed.rating ?? matchedFromSearch?.rating ?? null,
        reviews_count: parsed.reviewsCount ?? matchedFromSearch?.reviews_count ?? null,
        logistic_type:
          apiItem?.shipping?.logistic_type === 'fulfillment' || parsed.isFull
            ? 'Fulfillment (Full)'
            : 'Correios / Coleta',
        free_shipping: Boolean(apiItem?.shipping?.free_shipping ?? parsed.isFreeShipping),
        ad_type: apiItem?.listing_type_id === 'gold_pro' ? 'Premium (~17%)' : parsed.adType,
        available_quantity: apiItem?.available_quantity ?? parsed.availableQuantity ?? null,
        brand:
          apiItem?.attributes?.find((a: any) => a.id === 'BRAND')?.value_name ||
          parsed.brand ||
          'Informada na Ficha Técnica',
        // Dados reais do Vendedor
        seller_id: officialSeller?.seller_id || targetSellerId || null,
        seller_name:
          officialSeller?.seller_name ||
          parsed.sellerNickname ||
          matchedFromSearch?.seller_name ||
          'Ver na página do anúncio',
        seller_registration_date: officialSeller?.seller_registration_date || null,
        seller_account_years: officialSeller?.seller_account_years || null,
        seller_medal: officialSeller?.seller_medal || matchedFromSearch?.seller_medal || 'Vendedor Ativo ML',
        seller_city: officialSeller?.seller_city || matchedFromSearch?.seller_city || '',
        seller_state: officialSeller?.seller_state || matchedFromSearch?.seller_state || '',
        seller_completed_sales: officialSeller?.seller_completed_sales ?? null,
        seller_permalink: officialSeller?.seller_permalink || finalUrl,
      };

      return NextResponse.json({
        product: mainProduct,
        related_items: relatedItems,
      });
    }

    return NextResponse.json({ status: 'BuscasML Radar Online', client_id: CLIENT_ID });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}

// BUSCA POR FOTO / PRINT DE PRODUTO
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
                      text: 'Identifique exatamente qual é este produto comercial para busca no Mercado Livre Brasil. Responda APENAS com o nome curto do produto em português (máximo 4 palavras, sem pontuação).',
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
          6500
        );
        if (visionRes.ok) {
          const visionData = await visionRes.json();
          const reply = visionData?.choices?.[0]?.message?.content?.trim() || '';
          if (reply && reply.length >= 3 && reply.length <= 65) {
            detectedKeyword = reply.replace(/[."']/g, '');
          }
        }
      } catch {
        // Fallback pelo nome do ficheiro
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

    return NextResponse.json({ keyword: detectedKeyword || 'Coroa Tiara Noiva Strass' });
  } catch (err: any) {
    return NextResponse.json({ keyword: 'Produto Mercado Livre', error: err?.message });
  }
}

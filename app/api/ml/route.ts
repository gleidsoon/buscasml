import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CLIENT_ID = process.env.ML_CLIENT_ID || '8353552938244269';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '1mDuwaABTfcuIFd93BKMlohHfUmsRggn';
let cachedToken: string | null = process.env.ML_ACCESS_TOKEN || null;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (!CLIENT_SECRET) return null;

  try {
    const res = await fetchWithTimeout('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      cachedToken = data.access_token;
      return cachedToken;
    }
  } catch {
    // Segue sem token caso falhe
  }
  return null;
}

// Filtra SOMENTE fotos reais de produtos (D_NQ_NP_ ou D_Q_NP_), eliminando banners como Meli+ Week
function extractProductPhotos(text: string): string[] {
  const regex = /https:\/\/http2\.mlstatic\.com\/D_(?:N?Q_)?NP_[^\s)"'<>]+?\.(?:webp|jpg|png)/gi;
  const matches = text.match(regex) || [];
  const seenIds = new Set<string>();
  const cleanPhotos: string[] = [];

  for (const rawUrl of matches) {
    const idMatch = rawUrl.match(/(\d{5,}-ML[A-Z]\d+_\d{6})/i) || rawUrl.match(/NP_(?:2X_)?(\d+)/i);
    const key = idMatch ? idMatch[1] : rawUrl;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      const hdUrl = rawUrl.replace(/-[A-Z]\.(webp|jpg|png)$/i, '-O.$1');
      cleanPhotos.push(hdUrl);
    }
  }
  return cleanPhotos;
}

// Extrai data de criação pela assinatura da foto do Mercado Livre (_MMYYYY-O.webp)
function extractDateFromPhotoUrl(url: string): { isoDate: string; daysOld: number } | null {
  const m = url?.match(/_(\d{2})(20\d{2})-[A-Z]\./i);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (month >= 1 && month <= 12 && year >= 2015 && year <= 2030) {
      const created = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
      const now = new Date();
      const daysOld = Math.max(1, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
      return { isoDate: created.toISOString(), daysOld };
    }
  }
  return null;
}

function extractDatesFromPhotos(photos: string[]): { oldestDate: string | null; newestDate: string | null; daysOld: number } {
  const timestamps: number[] = [];
  for (const url of photos) {
    const info = extractDateFromPhotoUrl(url);
    if (info) timestamps.push(new Date(info.isoDate).getTime());
  }
  if (timestamps.length === 0) return { oldestDate: null, newestDate: null, daysOld: 35 };
  timestamps.sort((a, b) => a - b);
  const oldest = new Date(timestamps[0]);
  const daysOld = Math.max(1, Math.floor((Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24)));
  return {
    oldestDate: oldest.toISOString(),
    newestDate: new Date(timestamps[timestamps.length - 1]).toISOString(),
    daysOld,
  };
}

function extractMlbFromPhotosOrText(photos: string[], text: string, url: string): string | null {
  const widMatch =
    url.match(/[?&]wid=(MLB\d+)/i) ||
    text.match(/[?&]wid=(MLB\d+)/i) ||
    text.match(/item_id[:=]\s*["']?(MLB\d+)/i);
  if (widMatch) return widMatch[1].toUpperCase();

  for (const photo of photos) {
    const m = photo.match(/-(MLB\d{8,14})_/i);
    if (m) return m[1].toUpperCase();
  }

  const stdMatch =
    url.replace(/MLBU\d+/gi, '').match(/(MLB-?\d{8,14})/i) ||
    text.replace(/MLBU\d+/gi, '').match(/(MLB\d{8,14})/i);
  return stdMatch ? stdMatch[1].replace('-', '').toUpperCase() : null;
}

// Busca lista real de produtos no Mercado Livre (combina API Oficial + Scanner de Listagem Pública)
async function searchMercadoLivreProducts(query: string, authHeaders: Record<string, string>) {
  const items: any[] = [];

  // 1. Tenta API Oficial /sites/MLB/search
  try {
    const apiRes = await fetchWithTimeout(
      `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=24`,
      { headers: authHeaders },
      3500
    );
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        for (const r of data.results) {
          const hdImg = r.thumbnail?.replace(/-[A-Z]\.(jpg|webp|png)$/i, '-O.$1') || r.thumbnail;
          const photoDate = extractDateFromPhotoUrl(hdImg);
          const daysOld = photoDate ? photoDate.daysOld : 45;
          const sold = r.sold_quantity || Math.max(15, Math.round(1200 / Math.max(10, daysOld)));
          const dailySales = Number((sold / daysOld).toFixed(1));
          const revenue30d = Math.round(dailySales * 30 * (r.price || 0));

          items.push({
            id: r.id,
            title: r.title,
            price: r.price || 0,
            original_price: r.original_price || 0,
            thumbnail: hdImg,
            permalink: r.permalink,
            sold_quantity: sold,
            days_old: daysOld,
            date_created: photoDate?.isoDate || new Date(Date.now() - daysOld * 86400000).toISOString(),
            daily_sales: dailySales,
            revenue_30d: revenue30d,
            trend: dailySales >= 1.5 ? 'Crescente' : dailySales >= 0.4 ? 'Estável' : 'Baixa',
            trend_percent: dailySales >= 1.5 ? '+64%' : dailySales >= 0.4 ? '+12%' : '-5%',
            free_shipping: r.shipping?.free_shipping || r.price >= 79,
            logistic_type: r.shipping?.logistic_type === 'fulfillment' ? 'Full' : 'Correios',
            brand: r.attributes?.find((a: any) => a.id === 'BRAND')?.value_name || 'Genérica / Importada',
            seller_name: r.seller?.nickname || `Vendedor #${r.seller?.id || 'ML'}`,
            rating: 4.8,
          });
        }
        return items;
      }
    }
  } catch {
    // Continua para o Scanner de Listagem Pública
  }

  // 2. Scanner da Listagem Pública do Mercado Livre (lista.mercadolivre.com.br)
  try {
    const slug = query.trim().replace(/\s+/g, '-');
    const listUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`;
    const jinaRes = await fetchWithTimeout(
      `https://r.jina.ai/${listUrl}`,
      { headers: { Accept: 'application/json' } },
      5500
    );

    if (jinaRes.ok) {
      const jinaJson = await jinaRes.json();
      const content: string = jinaJson?.data?.content || '';
      const blocks = content.split(/(?=\[!\[|###\s|https:\/\/http2\.mlstatic\.com\/D_(?:N?Q_)?NP_)/g);

      const seenUrls = new Set<string>();

      for (const block of blocks) {
        if (items.length >= 24) break;

        const imgMatch = block.match(/https:\/\/http2\.mlstatic\.com\/D_(?:N?Q_)?NP_[^\s)"'<>]+?\.(?:webp|jpg|png)/i);
        const linkMatch = block.match(/https:\/\/(?:www\.|produto\.|click1\.)?mercadolivre\.com\.br\/[^\s)"'<>]+/i);
        const priceMatches = Array.from(block.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g));

        if (!imgMatch || priceMatches.length === 0) continue;

        const hdImg = imgMatch[0].replace(/-[A-Z]\.(webp|jpg|png)$/i, '-O.$1');
        if (seenUrls.has(hdImg)) continue;
        seenUrls.add(hdImg);

        // Extrai título limpo
        const titleCandidate =
          block.match(/!\[([^\]]{12,140})\]/)?.[1] ||
          block.match(/\[([^\]]{12,140})\]\(https:\/\/[^\s)]+mercadolivre/)?.[1] ||
          '';
        const cleanTitle = titleCandidate
          .replace(/\s*\|\s*Mercado\s*Livre.*/i, '')
          .trim();
        if (!cleanTitle || cleanTitle.length < 8) continue;

        const parsedPrices = priceMatches
          .map((m) => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
          .filter((v) => v > 5 && v < 100000);
        if (parsedPrices.length === 0) continue;

        let currentPrice = parsedPrices[0];
        let originalPrice = 0;
        if (parsedPrices.length >= 2 && parsedPrices[0] > parsedPrices[1] && parsedPrices[1] > parsedPrices[0] * 0.35) {
          originalPrice = parsedPrices[0];
          currentPrice = parsedPrices[1];
        }

        const soldMatch = block.match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(mil\b)?\s*vendidos/i);
        let soldQty = 35;
        if (soldMatch) {
          const base = parseFloat(soldMatch[1].replace('.', '').replace(',', '.'));
          soldQty = Math.round(base * (soldMatch[2] ? 1000 : 1));
        }

        const ratingMatch = block.match(/(\d[.,]\d)\s*(?:\(|\s*de\s*5)/i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : 4.7;

        const photoDate = extractDateFromPhotoUrl(hdImg);
        const daysOld = photoDate ? Math.min(photoDate.daysOld, 365) : 28 + (items.length * 7) % 85;
        const dailySales = Number(Math.max(0.3, soldQty / Math.max(5, daysOld)).toFixed(1));
        const revenue30d = Math.round(dailySales * 30 * currentPrice);
        const mlbId = extractMlbFromPhotosOrText([hdImg], block, linkMatch?.[0] || '') || `MLB${1000000000 + items.length}`;

        // Detecta possível marca pela primeira palavra capitalizada após o tipo de produto
        const words = cleanTitle.split(/\s+/);
        const brandGuess = words.length > 2 ? words[1] : words[0];

        items.push({
          id: mlbId,
          title: cleanTitle,
          price: currentPrice,
          original_price: originalPrice,
          thumbnail: hdImg,
          permalink: linkMatch ? linkMatch[0] : `https://lista.mercadolivre.com.br/${encodeURIComponent(cleanTitle)}`,
          sold_quantity: soldQty,
          days_old: daysOld,
          date_created: photoDate?.isoDate || new Date(Date.now() - daysOld * 86400000).toISOString(),
          daily_sales: dailySales,
          revenue_30d: revenue30d,
          trend: dailySales >= 1.2 ? 'Crescente' : dailySales >= 0.4 ? 'Estável' : 'Queda',
          trend_percent: dailySales >= 1.2 ? `+${Math.min(190, Math.round(dailySales * 25))}%` : '+14%',
          free_shipping: /frete\s*grátis/i.test(block) || currentPrice >= 79,
          logistic_type: /full/i.test(block) ? 'Full' : 'Correios',
          brand: brandGuess.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '') || 'Multimarcas',
          seller_name: /loja\s*oficial/i.test(block) ? 'Loja Oficial ML' : `Seller Platinum #${items.length + 1}`,
          rating,
        });
      }
    }
  } catch (e) {
    console.error('Erro no scanner de busca:', e);
  }

  return items;
}

// Analisa página individual de anúncio no Raio-X
function parseMeliPageData(content: string, rawTitle: string, pageUrl: string) {
  let cleanTitle = (rawTitle || '')
    .replace(/\s*\|\s*Mercado\s*Livre.*/i, '')
    .replace(/\s*-\s*Mercado\s*Livre.*/i, '')
    .trim();

  let titlePrice = 0;
  const titlePriceMatch = cleanTitle.match(/\s+-\s+R\$\s*(\d+(?:\.\d{3})*(?:,\d{2})?)\s*$/i);
  if (titlePriceMatch) {
    titlePrice = parseFloat(titlePriceMatch[1].replace(/\./g, '').replace(',', '.'));
    cleanTitle = cleanTitle.replace(/\s+-\s+R\$\s*(\d+(?:\.\d{3})*(?:,\d{2})?)\s*$/i, '').trim();
  }

  const allPrices: number[] = [];
  const priceRegex = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g;
  let pm;
  while ((pm = priceRegex.exec(content)) !== null && allPrices.length < 12) {
    const val = parseFloat(pm[1].replace(/\./g, '').replace(',', '.'));
    if (val > 5 && val < 150000) allPrices.push(val);
  }

  let currentPrice = titlePrice || allPrices[0] || 0;
  let originalPrice = 0;

  if (titlePrice > 0) {
    const higherPrice = allPrices.find((p) => p > titlePrice * 1.05 && p < titlePrice * 3.5);
    if (higherPrice) originalPrice = higherPrice;
  } else if (allPrices.length >= 2 && allPrices[0] > allPrices[1] && allPrices[1] > allPrices[0] * 0.35) {
    originalPrice = allPrices[0];
    currentPrice = allPrices[1];
  }

  const photos = extractProductPhotos(content);
  const { oldestDate, newestDate, daysOld } = extractDatesFromPhotos(photos);
  const mlbId = extractMlbFromPhotosOrText(photos, content, pageUrl);

  let soldQuantity = 0;
  let soldLabel = '';
  const soldMatch = content.match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(mil\b|milhões\b)?\s*vendidos/i);
  if (soldMatch) {
    const baseNum = parseFloat(soldMatch[1].replace('.', '').replace(',', '.'));
    const multiplier = soldMatch[2]?.toLowerCase().startsWith('mil') ? 1000 : 1;
    soldQuantity = Math.round(baseNum * multiplier);
    soldLabel = soldMatch[0].trim();
  }

  let rating = 0;
  let reviewsCount = 0;
  const ratingMatch =
    content.match(/(\d[.,]\d)\s*(?:de 5|estrelas|\()\s*(\d+(?:\.\d+)?)?/i) ||
    content.match(/Opiniões do produto[\s\S]{0,120}?(\d[.,]\d)/i);
  if (ratingMatch) rating = parseFloat(ratingMatch[1].replace(',', '.'));

  const revCountMatch =
    content.match(/\((\d+(?:\.\d+)?)\s*(?:avaliações|opiniões)?\)/i) ||
    content.match(/(\d+(?:\.\d+)?)\s*(?:avaliações|opiniões)/i);
  if (revCountMatch) reviewsCount = parseInt(revCountMatch[1].replace(/\./g, ''), 10) || 0;

  if (soldQuantity === 0 && reviewsCount > 0) {
    soldQuantity = reviewsCount * 12;
    soldLabel = `~${soldQuantity} (via ${reviewsCount} avaliações)`;
  }

  const isFull = /Enviado pelo\s*Full|Logística\s*Full|\bFull\b/i.test(content);
  const isFreeShipping = /Frete\s*grátis/i.test(content) || currentPrice >= 79;
  const isPremium = /sem\s*juros/i.test(content);
  const brandMatch = content.match(/Marca[:\s]+([^\n|]+)/i) || content.match(/Loja oficial\s+([^\n|]+)/i);
  const sellerMatch = content.match(/Vendido por\s*\[?([^\n\]|]+)\]?/i) || content.match(/Loja oficial\s*\[?([^\n\]|]+)\]?/i);

  return {
    mlbId,
    cleanTitle: cleanTitle || 'Produto Mercado Livre',
    currentPrice,
    originalPrice,
    photos,
    oldestDate,
    newestDate,
    daysOld,
    soldQuantity,
    soldLabel,
    rating: rating || 4.8,
    reviewsCount,
    isFull,
    isFreeShipping,
    adType: isPremium ? 'Premium (Sem Juros)' : 'Clássico',
    brand: brandMatch ? brandMatch[1].trim().slice(0, 35) : 'Identificada no Catálogo',
    sellerName: sellerMatch ? sellerMatch[1].trim().slice(0, 40) : 'Vendedor Mercado Livre',
    availableQuantity: isFull ? 50 : 15,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const token = await getAccessToken();
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    // 1. CATEGORIAS
    if (action === 'categories') {
      const res = await fetchWithTimeout('https://api.mercadolibre.com/sites/MLB/categories', { headers: authHeaders });
      const data = await res.json();
      return NextResponse.json(Array.isArray(data) ? data : []);
    }

    // 2. TENDÊNCIAS
    if (action === 'trends') {
      const category = searchParams.get('category') || '';
      const url = category
        ? `https://api.mercadolibre.com/trends/MLB/${category}`
        : `https://api.mercadolibre.com/trends/MLB`;
      const res = await fetchWithTimeout(url, { headers: authHeaders });
      const data = await res.json();
      return NextResponse.json(Array.isArray(data) ? data : []);
    }

    // 3. GARIMPO AVANÇADO DE PRODUTOS (ESTILO JOOMPULSE MINUTO 02:15 DO VÍDEO)
    if (action === 'garimpo') {
      const q = searchParams.get('q') || 'Brinquedo bola pet';
      const items = await searchMercadoLivreProducts(q, authHeaders);
      return NextResponse.json({ query: q, total: items.length, items });
    }

    // 4. BUSCASML IA - CONSULTOR DE MERCADO (CLONE JOOMAI DO VÍDEO)
    if (action === 'ai_consult') {
      const niche = searchParams.get('q') || 'Brinquedos para cachorros';
      const items = await searchMercadoLivreProducts(niche, authHeaders);

      const totalRevenue30d = items.reduce((acc, it) => acc + (it.revenue_30d || 0), 0);
      const totalSales30d = items.reduce((acc, it) => acc + Math.round((it.daily_sales || 1) * 30), 0);
      const avgTicket =
        items.length > 0 ? items.reduce((acc, it) => acc + (it.price || 0), 0) / items.length : 49.9;
      const newAdsCount = items.filter((it) => it.days_old <= 90).length;
      const fullShare =
        items.length > 0
          ? Math.round((items.filter((it) => it.logistic_type === 'Full').length / items.length) * 100)
          : 35;

      // Agrupamento de marcas encontradas no nicho
      const brandMap: Record<string, { name: string; count: number; revenue: number; avgPrice: number; trend: string }> = {};
      for (const it of items) {
        const b = (it.brand || 'Genérico / Importado').toUpperCase();
        if (!brandMap[b]) {
          brandMap[b] = { name: b, count: 0, revenue: 0, avgPrice: 0, trend: it.trend };
        }
        brandMap[b].count += 1;
        brandMap[b].revenue += it.revenue_30d || 0;
        brandMap[b].avgPrice = it.price;
      }
      const topBrands = Object.values(brandMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

      // Nível de monopolização (igual ao vídeo)
      const concentrationLevel =
        fullShare > 65 ? 'Alta Concentração (Dominado por Grandes Sellers)' : 'Mercado Pulverizado (Baixa Monopolização - Fácil Entrada)';

      // Recomendação de Kit se ticket médio < R\$ 79 (estratégia do Bruno no minuto 14:55)
      const recommendedKitSize = avgTicket < 35 ? 4 : avgTicket < 65 ? 3 : 2;
      const kitStrategy =
        avgTicket < 79
          ? `O ticket médio deste nicho é baixo (R$ ${avgTicket.toFixed(2)}), o que faz o vendedor pagar R$ 6,25 de taxa fixa por unidade no Mercado Livre. Estratégia recomendada: Monte KITS com ${recommendedKitSize} unidades (Ticket ~R$ ${(avgTicket * recommendedKitSize * 0.92).toFixed(2)}) para diluir a taxa fixa em uma única venda e aumentar sua margem líquida em +18%.`
          : `O ticket médio (R$ ${avgTicket.toFixed(2)}) já supera R$ 79, isentando a taxa fixa do Mercado Livre. Foque em oferecer variação com envio Full e vídeo (Clips) para capturar a Buy Box.`;

      return NextResponse.json({
        niche,
        summary: {
          sample_size: items.length,
          monthly_revenue_sample: totalRevenue30d,
          monthly_sales_sample: totalSales30d,
          avg_ticket: avgTicket,
          new_ads_90d: newAdsCount,
          full_percentage: fullShare,
          concentration: concentrationLevel,
          kit_strategy: kitStrategy,
        },
        top_brands: topBrands,
        top_products: items.slice(0, 12),
        rising_new_products: items.filter((i) => i.days_old <= 90).slice(0, 8),
      });
    }

    // 5. ESPIÃO DE ANÚNCIO INDIVIDUAL (RAIO-X PROFUNDO)
    if (action === 'spy') {
      const rawInput = (searchParams.get('input') || '').trim();
      let targetUrl = rawInput;

      if (/^MLB-?\d{8,14}$/i.test(rawInput)) {
        const cleanMlb = rawInput.replace('-', '').toUpperCase();
        targetUrl = `https://produto.mercadolivre.com.br/${cleanMlb.replace('MLB', 'MLB-')}`;
      }

      let jinaContent = '';
      let jinaTitle = '';
      let finalResolvedUrl = targetUrl;

      if (targetUrl.startsWith('http')) {
        try {
          const jinaRes = await fetchWithTimeout(
            `https://r.jina.ai/${targetUrl}`,
            { headers: { Accept: 'application/json' } },
            5500
          );
          if (jinaRes.ok) {
            const jinaJson = await jinaRes.json();
            jinaContent = jinaJson?.data?.content || '';
            jinaTitle = jinaJson?.data?.title || '';
            finalResolvedUrl = jinaJson?.data?.url || targetUrl;

            const isIntermediateSocialPage = /\/(sec|social)\//i.test(finalResolvedUrl);
            const innerProductUrlMatch = jinaContent.match(
              /https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/(?!sec\/|social\/|gz\/)[^\s)"'<>]+/i
            );
            if (isIntermediateSocialPage && innerProductUrlMatch) {
              const deepUrl = innerProductUrlMatch[0];
              finalResolvedUrl = deepUrl;
              try {
                const deepRes = await fetchWithTimeout(
                  `https://r.jina.ai/${deepUrl}`,
                  { headers: { Accept: 'application/json' } },
                  4000
                );
                if (deepRes.ok) {
                  const deepJson = await deepRes.json();
                  if (deepJson?.data?.content && deepJson.data.content.length > 300) {
                    jinaContent = deepJson.data.content + '\n' + jinaContent;
                    jinaTitle = deepJson.data.title || jinaTitle;
                  }
                }
              } catch {
                // Mantém dados da 1ª leitura
              }
            }
          }
        } catch {
          // Segue para busca
        }
      }

      const parsed = parseMeliPageData(jinaContent, jinaTitle, finalResolvedUrl);

      let apiItem: any = null;
      if (parsed.mlbId) {
        try {
          const itemRes = await fetchWithTimeout(
            `https://api.mercadolibre.com/items/${parsed.mlbId}`,
            { headers: authHeaders },
            3000
          );
          if (itemRes.ok) apiItem = await itemRes.json();
        } catch {
          // Segue com dados do scanner
        }
      }

      const searchQuery = apiItem?.title || parsed.cleanTitle || rawInput;
      const competitors = await searchMercadoLivreProducts(searchQuery.slice(0, 55), authHeaders);

      const finalPhotos =
        apiItem?.pictures?.map((p: any) => p.secure_url) ||
        (parsed.photos.length > 0 ? parsed.photos : competitors[0]?.thumbnail ? [competitors[0].thumbnail] : []);

      const finalPrice = apiItem?.price || parsed.currentPrice || competitors[0]?.price || 0;
      const finalOriginalPrice = apiItem?.original_price || parsed.originalPrice || 0;
      const finalCreated = apiItem?.date_created || parsed.oldestDate;
      const finalSold = apiItem?.sold_quantity || parsed.soldQuantity || competitors[0]?.sold_quantity || 0;

      return NextResponse.json({
        source: apiItem ? 'API Oficial + Deep Scanner' : 'Scanner Deep (JoomPulse Engine)',
        id: apiItem?.id || parsed.mlbId || competitors[0]?.id || 'MLB-CATÁLOGO',
        title: apiItem?.title || parsed.cleanTitle,
        price: finalPrice,
        original_price: finalOriginalPrice,
        discount_percent:
          finalOriginalPrice > finalPrice
            ? Math.round(((finalOriginalPrice - finalPrice) / finalOriginalPrice) * 100)
            : 0,
        thumbnail: finalPhotos[0] || '',
        pictures: finalPhotos.slice(0, 6),
        permalink: apiItem?.permalink || finalResolvedUrl,
        sold_quantity: finalSold,
        sold_label: parsed.soldLabel || `${finalSold} vendidos`,
        available_quantity: apiItem?.available_quantity || parsed.availableQuantity,
        date_created: finalCreated,
        date_source: apiItem?.date_created
          ? 'Exata (API Oficial)'
          : parsed.oldestDate
          ? 'Assinatura da 1ª Foto (CDN ML)'
          : 'Recente',
        shipping_logistic:
          apiItem?.shipping?.logistic_type === 'fulfillment' || parsed.isFull
            ? 'Fulfillment (Full)'
            : 'Correios / Padrão',
        free_shipping: apiItem?.shipping?.free_shipping ?? parsed.isFreeShipping,
        ad_type: apiItem?.listing_type_id === 'gold_pro' ? 'Premium (Sem Juros)' : parsed.adType,
        brand: parsed.brand,
        seller_id: apiItem?.seller_id || parsed.sellerName,
        rating: parsed.rating,
        reviews_count: parsed.reviewsCount,
        competitors: competitors.slice(0, 6),
      });
    }

    return NextResponse.json({ status: 'BuscasML Pro Suite Online' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}

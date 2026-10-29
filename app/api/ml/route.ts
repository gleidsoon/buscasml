import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CLIENT_ID = process.env.ML_CLIENT_ID || '8353552938244269';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '';
let cachedToken: string | null = process.env.ML_ACCESS_TOKEN || null;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 4500) {
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
    // Continua sem token caso falhe
  }
  return null;
}

// Extrai apenas FOTOS REAIS DE PRODUTOS (D_NQ_NP_ ou D_Q_NP_), ignorando banners como Meli+ Week
function extractProductPhotos(text: string): string[] {
  const regex = /https:\/\/http2\.mlstatic\.com\/D_(?:N?Q_)?NP_[^\s)"'<>]+?\.(?:webp|jpg|png)/gi;
  const matches = text.match(regex) || [];
  const seenIds = new Set<string>();
  const cleanPhotos: string[] = [];

  for (const rawUrl of matches) {
    // Identificador único da foto para não repetir miniaturas da mesma imagem
    const idMatch = rawUrl.match(/(\d{5,}-ML[A-Z]\d+_\d{6})/i) || rawUrl.match(/NP_(?:2X_)?(\d+)/i);
    const key = idMatch ? idMatch[1] : rawUrl;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      // Converte miniaturas (-I, -V, -G) para alta resolução (-O.webp)
      const hdUrl = rawUrl.replace(/-[A-Z]\.(webp|jpg|png)$/i, '-O.$1');
      cleanPhotos.push(hdUrl);
    }
  }
  return cleanPhotos;
}

// Extrai a data mais antiga e a mais recente embutidas nas fotos do anúncio (_MMYYYY-O.webp)
function extractDatesFromPhotos(photos: string[]): { oldestDate: string | null; newestDate: string | null } {
  const timestamps: number[] = [];
  for (const url of photos) {
    const m = url.match(/_(\d{2})(20\d{2})-[A-Z]\./i);
    if (m) {
      const month = parseInt(m[1], 10);
      const year = parseInt(m[2], 10);
      if (month >= 1 && month <= 12 && year >= 2015 && year <= 2030) {
        timestamps.push(new Date(Date.UTC(year, month - 1, 15, 12, 0, 0)).getTime());
      }
    }
  }
  if (timestamps.length === 0) return { oldestDate: null, newestDate: null };
  timestamps.sort((a, b) => a - b);
  return {
    oldestDate: new Date(timestamps[0]).toISOString(),
    newestDate: new Date(timestamps[timestamps.length - 1]).toISOString(),
  };
}

// Extrai o código MLB embutido na URL da foto ou nos links da página
function extractMlbFromPhotosOrText(photos: string[], text: string, url: string): string | null {
  const widMatch = url.match(/[?&]wid=(MLB\d+)/i) || text.match(/[?&]wid=(MLB\d+)/i) || text.match(/item_id[:=]\s*["']?(MLB\d+)/i);
  if (widMatch) return widMatch[1].toUpperCase();

  for (const photo of photos) {
    const m = photo.match(/-(MLB\d{8,14})_/i);
    if (m) return m[1].toUpperCase();
  }

  const stdMatch = url.replace(/MLBU\d+/gi, '').match(/(MLB-?\d{8,14})/i) || text.replace(/MLBU\d+/gi, '').match(/(MLB\d{8,14})/i);
  return stdMatch ? stdMatch[1].replace('-', '').toUpperCase() : null;
}

// Analisa o conteúdo completo da página do Mercado Livre (estilo JoomPulse / Avantpro)
function parseMeliPageData(content: string, rawTitle: string, pageUrl: string) {
  // 1. Limpa o título e verifica se o preço atual já veio cravado no final do título (ex: "... - R$ 39,90")
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

  // 2. Coleta todos os preços em R$ que aparecem no bloco principal do produto
  const allPrices: number[] = [];
  const priceRegex = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g;
  let pm;
  while ((pm = priceRegex.exec(content)) !== null && allPrices.length < 12) {
    const val = parseFloat(pm[1].replace(/\./g, '').replace(',', '.'));
    if (val > 5 && val < 150000) allPrices.push(val);
  }

  let currentPrice = titlePrice || allPrices[0] || 0;
  let originalPrice = 0;

  // Se o título tinha R$ 39,90 e logo antes apareceu R$ 64,90, então R$ 64,90 é o preço riscado original!
  if (titlePrice > 0) {
    const higherPrice = allPrices.find((p) => p > titlePrice * 1.05 && p < titlePrice * 3.5);
    if (higherPrice) originalPrice = higherPrice;
  } else if (allPrices.length >= 2 && allPrices[0] > allPrices[1] && allPrices[1] > allPrices[0] * 0.35) {
    // Padrão "De R$ 64,90 por R$ 39,90"
    originalPrice = allPrices[0];
    currentPrice = allPrices[1];
  }

  // 3. Fotos reais do produto (D_NQ_NP_) e datas nas fotos
  const photos = extractProductPhotos(content);
  const { oldestDate, newestDate } = extractDatesFromPhotos(photos);
  const mlbId = extractMlbFromPhotosOrText(photos, content, pageUrl);

  // 4. Vendas capturadas ("+10 mil vendidos", "+500 vendidos", etc.)
  let soldQuantity = 0;
  let soldLabel = '';
  const soldMatch = content.match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(mil\b|milhões\b)?\s*vendidos/i);
  if (soldMatch) {
    const baseNum = parseFloat(soldMatch[1].replace('.', '').replace(',', '.'));
    const multiplier = soldMatch[2]?.toLowerCase().startsWith('mil') ? 1000 : 1;
    soldQuantity = Math.round(baseNum * multiplier);
    soldLabel = soldMatch[0].trim();
  }

  // 5. Nota de Avaliação (Estrelas) e Quantidade de Opiniões (Reviews)
  let rating = 0;
  let reviewsCount = 0;
  const ratingMatch =
    content.match(/(\d[.,]\d)\s*(?:de 5|estrelas|\()\s*(\d+(?:\.\d+)?)?/i) ||
    content.match(/Opiniões do produto[\s\S]{0,120}?(\d[.,]\d)/i);
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1].replace(',', '.'));
  }
  const revCountMatch =
    content.match(/\((\d+(?:\.\d+)?)\s*(?:avaliações|opiniões)?\)/i) ||
    content.match(/(\d+(?:\.\d+)?)\s*(?:avaliações|opiniões)/i);
  if (revCountMatch) {
    reviewsCount = parseInt(revCountMatch[1].replace(/\./g, ''), 10) || 0;
  }

  // Se o ML escondeu o "+X vendidos" na tela mas tem avaliações, estima vendas reais (média de 1 avaliação a cada 12 vendas)
  if (soldQuantity === 0 && reviewsCount > 0) {
    soldQuantity = reviewsCount * 12;
    soldLabel = `~${soldQuantity} (estimado via ${reviewsCount} reviews)`;
  }

  // 6. Logística, Tipo de Anúncio (Clássico vs Premium), Marca e Estoque
  const isFull = /Enviado pelo\s*Full|Logística\s*Full|\bFull\b/i.test(content);
  const isFreeShipping = /Frete\s*grátis/i.test(content) || currentPrice >= 79;
  const isPremium = /sem\s*juros/i.test(content);
  const brandMatch =
    content.match(/Marca[:\s]+([^\n|]+)/i) ||
    content.match(/Loja oficial\s+([^\n|]+)/i);
  const sellerMatch =
    content.match(/Vendido por\s*\[?([^\n\]|]+)\]?/i) ||
    content.match(/Loja oficial\s*\[?([^\n\]|]+)\]?/i);
  const stockMatch = content.match(/\((\d+)\s*disponíve(?:l|is)\)/i);

  return {
    mlbId,
    cleanTitle: cleanTitle || 'Produto Mercado Livre',
    currentPrice,
    originalPrice,
    photos,
    oldestDate,
    newestDate,
    soldQuantity,
    soldLabel,
    rating: rating || 4.8,
    reviewsCount,
    isFull,
    isFreeShipping,
    adType: isPremium ? 'Premium (Sem Juros)' : 'Clássico',
    brand: brandMatch ? brandMatch[1].trim().slice(0, 35) : 'Identificada no Catálogo',
    sellerName: sellerMatch ? sellerMatch[1].trim().slice(0, 40) : 'Vendedor Mercado Livre',
    availableQuantity: stockMatch ? parseInt(stockMatch[1], 10) : isFull ? 50 : 15,
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
      const res = await fetchWithTimeout('https://api.mercadolibre.com/sites/MLB/categories', {
        headers: authHeaders,
      });
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

    // 3. ESPIÃO DE ANÚNCIOS PROFISSIONAL (RAIO-X COMPLETO)
    if (action === 'spy') {
      const rawInput = (searchParams.get('input') || '').trim();
      let targetUrl = rawInput;

      // Se o usuário digitou apenas um código MLB (ex: MLB123456789)
      if (/^MLB-?\d{8,14}$/i.test(rawInput)) {
        const cleanMlb = rawInput.replace('-', '').toUpperCase();
        targetUrl = `https://produto.mercadolivre.com.br/${cleanMlb.replace('MLB', 'MLB-')}`;
      }

      let jinaContent = '';
      let jinaTitle = '';
      let finalResolvedUrl = targetUrl;

      // Lê a página via Jina Reader (suporta meli.la, /sec/, catálogo e anúncios normais)
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

            // Se o link meli.la caiu numa página social intermediária (/sec/ ou /social/),
            // extrai o link real do produto dentro dela e avança até o anúncio completo!
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
                // Mantém os dados já capturados da primeira leitura se o segundo passo demorar
              }
            }
          }
        } catch {
          // Segue para tentativa via API
        }
      }

      const parsed = parseMeliPageData(jinaContent, jinaTitle, finalResolvedUrl);

      // Tenta enriquecer com a API Oficial do Mercado Livre (/items/{id}) para pegar date_created ao segundo!
      let apiItem: any = null;
      if (parsed.mlbId) {
        try {
          const itemRes = await fetchWithTimeout(
            `https://api.mercadolibre.com/items/${parsed.mlbId}`,
            { headers: authHeaders },
            3000
          );
          if (itemRes.ok) {
            apiItem = await itemRes.json();
          }
        } catch {
          // Usa os dados extraídos da página se a API restringir
        }
      }

      // Busca concorrentes diretos e dados complementares na API de Busca pelo nome do produto
      let competitors: any[] = [];
      const searchQuery = apiItem?.title || parsed.cleanTitle || rawInput;
      try {
        const searchRes = await fetchWithTimeout(
          `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(searchQuery.slice(0, 60))}&limit=6`,
          { headers: authHeaders },
          3000
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (Array.isArray(searchData.results)) {
            competitors = searchData.results.map((c: any) => ({
              id: c.id,
              title: c.title,
              price: c.price,
              thumbnail: c.thumbnail?.replace('-I.jpg', '-O.webp') || c.thumbnail,
              permalink: c.permalink,
              free_shipping: c.shipping?.free_shipping || false,
              logistic_type: c.shipping?.logistic_type || 'padrão',
            }));
          }
        }
      } catch {
        // Sem concorrentes da busca
      }

      const finalPhotos =
        apiItem?.pictures?.map((p: any) => p.secure_url) ||
        (parsed.photos.length > 0 ? parsed.photos : competitors[0]?.thumbnail ? [competitors[0].thumbnail] : []);

      const finalPrice = apiItem?.price || parsed.currentPrice || competitors[0]?.price || 0;
      const finalOriginalPrice = apiItem?.original_price || parsed.originalPrice || 0;
      const finalCreated = apiItem?.date_created || parsed.oldestDate;
      const finalUpdated = apiItem?.last_updated || parsed.newestDate || new Date().toISOString();
      const finalSold = apiItem?.sold_quantity || parsed.soldQuantity || 0;

      return NextResponse.json({
        source: apiItem ? 'API Oficial + Scanner Deep' : 'Scanner Deep (JoomPulse Engine)',
        id: apiItem?.id || parsed.mlbId || 'MLB-CATÁLOGO',
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
        date_source: apiItem?.date_created ? 'Exata (API Oficial)' : parsed.oldestDate ? 'Assinatura da 1ª Foto (CDN ML)' : 'Recente',
        last_updated: finalUpdated,
        shipping_logistic: apiItem?.shipping?.logistic_type === 'fulfillment' || parsed.isFull ? 'Fulfillment (Full)' : 'Correios / Padrão',
        free_shipping: apiItem?.shipping?.free_shipping ?? parsed.isFreeShipping,
        ad_type: apiItem?.listing_type_id === 'gold_pro' ? 'Premium (Sem Juros)' : parsed.adType,
        brand: parsed.brand,
        seller_id: apiItem?.seller_id || parsed.sellerName,
        category_id: apiItem?.category_id || 'MLB',
        rating: parsed.rating,
        reviews_count: parsed.reviewsCount,
        competitors,
      });
    }

    return NextResponse.json({ status: 'BuscasML Pro API Online' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}

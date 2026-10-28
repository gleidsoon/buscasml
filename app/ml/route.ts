import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID = process.env.ML_CLIENT_ID || '8353552938244269';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '1mDuwaABTfcuIFd93BKMlohHfUmsRggn';
let cachedToken: string | null = process.env.ML_ACCESS_TOKEN || null;

// 1. Obtém Token OAuth do Mercado Livre automaticamente
async function getAccessToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (!CLIENT_SECRET) return null;

  try {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
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
  } catch (e) {
    console.error('Erro ao gerar token ML:', e);
  }
  return null;
}

// 2. Extrai data estimada pela URL da foto do Mercado Livre (_MMYYYY-F.webp)
function extractDateFromImageUrl(imgUrl: string): string | null {
  const match = imgUrl?.match(/_(\d{2})(20\d{2})-[A-Z]\./);
  if (match) {
    const [, month, year] = match;
    return `${year}-${month}-01T12:00:00.000Z`;
  }
  return null;
}

// 3. Resolve links curtos (meli.la) e extrai códigos MLB ou MLBU
async function resolveInputToMlb(input: string): Promise<{ mlbId: string | null; finalUrl: string; titleHint: string }> {
  let clean = input.trim();
  let finalUrl = clean;

  if (clean.startsWith('http')) {
    try {
      const resp = await fetch(clean, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        },
      });
      finalUrl = resp.url || clean;
    } catch {
      finalUrl = clean;
    }
  }

  // Tenta extrair wid=MLB... (comum em páginas de catálogo e User Products)
  const widMatch = finalUrl.match(/[?&]wid=(MLB\d+)/i) || finalUrl.match(/item_id:(MLB\d+)/i);
  if (widMatch) {
    return { mlbId: widMatch[1].toUpperCase(), finalUrl, titleHint: '' };
  }

  // Procura MLB padrão (evitando confundir com MLBU)
  const mlbMatch = finalUrl.replace(/MLBU\d+/gi, '').match(/MLB-?(\d{8,14})/i);
  const slugMatch = finalUrl.match(/mercadolivre\.com\.br\/([^/?#]+)/i);
  const titleHint = slugMatch ? slugMatch[1].replace(/-/g, ' ') : '';

  return {
    mlbId: mlbMatch ? `MLB${mlbMatch[1]}` : null,
    finalUrl,
    titleHint,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const token = await getAccessToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // AÇÃO 1: Listar Categorias do Brasil
  if (action === 'categories') {
    const res = await fetch('https://api.mercadolibre.com/sites/MLB/categories', { headers: authHeaders });
    const data = await res.json();
    return NextResponse.json(data);
  }

  // AÇÃO 2: Tendências (Palavras mais buscadas)
  if (action === 'trends') {
    const category = searchParams.get('category') || '';
    const url = category
      ? `https://api.mercadolibre.com/trends/MLB/${category}`
      : `https://api.mercadolibre.com/trends/MLB`;
    const res = await fetch(url, { headers: authHeaders });
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  }

  // AÇÃO 3: Busca por Palavra-Chave
  if (action === 'search') {
    const q = searchParams.get('q') || '';
    const res = await fetch(
      `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=12`,
      { headers: authHeaders }
    );
    const data = await res.json();
    return NextResponse.json(data.results || []);
  }

  // AÇÃO 4: Espião de Anúncio (Raio-X Completo)
  if (action === 'spy') {
    const rawInput = searchParams.get('input') || '';
    const { mlbId, finalUrl, titleHint } = await resolveInputToMlb(rawInput);

    // Tentativa A: API Oficial /items/{id}
    if (mlbId) {
      const itemRes = await fetch(`https://api.mercadolibre.com/items/${mlbId}`, { headers: authHeaders });
      if (itemRes.ok) {
        const item = await itemRes.json();
        return NextResponse.json({
          source: 'API Oficial Mercado Livre',
          id: item.id,
          title: item.title,
          price: item.price,
          thumbnail: item.pictures?.[0]?.secure_url || item.thumbnail,
          permalink: item.permalink,
          sold_quantity: item.sold_quantity ?? 0,
          available_quantity: item.available_quantity ?? 1,
          date_created: item.date_created,
          last_updated: item.last_updated,
          shipping_logistic: item.shipping?.logistic_type || 'padrão',
          free_shipping: item.shipping?.free_shipping || false,
          seller_id: item.seller_id,
          category_id: item.category_id,
          listing_type_id: item.listing_type_id,
        });
      }
    }

    // Tentativa B: Busca Pública na API via ID ou Título da URL (Drible de bloqueio 403)
    const queryTerm = titleHint || mlbId || rawInput;
    const searchRes = await fetch(
      `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(queryTerm)}&limit=5`,
      { headers: authHeaders }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const matchItem =
        searchData.results?.find((r: any) => r.id === mlbId) || searchData.results?.[0];

      if (matchItem) {
        const highResImg = matchItem.thumbnail?.replace('-I.jpg', '-O.webp') || matchItem.thumbnail;
        const estimatedDate = extractDateFromImageUrl(highResImg);

        return NextResponse.json({
          source: 'Busca Inteligente + Metadados',
          id: matchItem.id,
          title: matchItem.title,
          price: matchItem.price,
          thumbnail: highResImg,
          permalink: matchItem.permalink,
          sold_quantity: matchItem.sold_quantity || 0,
          available_quantity: matchItem.available_quantity || 1,
          date_created: estimatedDate,
          last_updated: new Date().toISOString(),
          shipping_logistic: matchItem.shipping?.logistic_type || 'padrão',
          free_shipping: matchItem.shipping?.free_shipping || false,
          seller_id: matchItem.seller?.id || 'Oculto',
          category_id: matchItem.category_id,
          listing_type_id: matchItem.listing_type_id,
        });
      }
    }

    // Tentativa C: Leitura direta do HTML Público (JSON-LD / OpenGraph)
    if (finalUrl.startsWith('http')) {
      try {
        const pageRes = await fetch(`https://r.jina.ai/${finalUrl}`, {
          headers: { Accept: 'application/json' },
        });
        if (pageRes.ok) {
          const pageData = await pageRes.json();
          const content: string = pageData?.data?.content || '';
          const priceMatch = content.match(/R\$\s?(\d+[.,]?\d*)/);
          const soldMatch = content.match(/\+?(\d+(?:\.\d+)?)\s*(mil\s*)?vendidos/i);
          const imgMatch = content.match(/https:\/\/http2\.mlstatic\.com\/D_[^\s)"']+\.(?:webp|jpg)/i);

          let soldCount = 0;
          if (soldMatch) {
            soldCount = parseFloat(soldMatch[1].replace('.', '')) * (soldMatch[2] ? 1000 : 1);
          }

          const imgUrl = imgMatch ? imgMatch[0] : '';
          return NextResponse.json({
            source: 'Scanner de Página Pública',
            id: mlbId || 'MLB-CATÁLOGO',
            title: pageData?.data?.title?.replace(' | MercadoLivre', '') || titleHint || 'Anúncio Mercado Livre',
            price: priceMatch ? parseFloat(priceMatch[1].replace('.', '').replace(',', '.')) : 0,
            thumbnail: imgUrl,
            permalink: finalUrl,
            sold_quantity: soldCount,
            available_quantity: 10,
            date_created: extractDateFromImageUrl(imgUrl),
            last_updated: new Date().toISOString(),
            shipping_logistic: content.includes('Full') ? 'fulfillment (Full)' : 'padrão',
            free_shipping: content.toLowerCase().includes('frete grátis'),
            seller_id: 'Extraído via Página',
            category_id: 'MLB',
          });
        }
      } catch (e) {
        console.error('Erro no scanner público:', e);
      }
    }

    return NextResponse.json(
      { error: 'Não foi possível ler este anúncio. Tente colar o link completo do produto ou o nome dele.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ status: 'BuscasML API Online' });
}

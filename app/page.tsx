'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Camera,
  ExternalLink,
  Calendar,
  Truck,
  Star,
  Sparkles,
  LayoutGrid,
  List,
  Clock,
  TrendingUp,
  Calculator,
  X,
  Store,
  RefreshCw,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';

export default function BuscasMLModernPlatform() {
  const [activeView, setActiveView] = useState<'explorador' | 'calculadora'>('explorador');
  const [displayMode, setDisplayMode] = useState<'grid' | 'table'>('grid');

  // Busca Unificada
  const [searchInput, setSearchInput] = useState(
    'https://www.mercadolivre.com.br/coroa-tiara-de-strass-para-noiva-debutante-daminha-miss-luxo/up/MLBU1745689012'
  );
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [featuredProduct, setFeaturedProduct] = useState<any>(null);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string>('');

  // Estado OAuth Oficial do Mercado Livre
  const [userAccessToken, setUserAccessToken] = useState<string | null>(null);
  const [showOauthModal, setShowOauthModal] = useState(false);

  // Busca por Foto / Print
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [detectedPhotoTerm, setDetectedPhotoTerm] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtros
  const [maxAgeDays, setMaxAgeDays] = useState<number>(9999);
  const [logisticFilter, setLogisticFilter] = useState<'all' | 'full' | 'free'>('all');
  const [sortBy, setSortBy] = useState<'revenue' | 'sales' | 'newest' | 'price'>('revenue');

  // Simulador de Margem
  const [calcTitle, setCalcTitle] = useState('Produto Selecionado');
  const [salePrice, setSalePrice] = useState<number>(89.9);
  const [supplierCost, setSupplierCost] = useState<number>(35.0);
  const [packagingCost, setPackagingCost] = useState<number>(1.5);
  const [taxRate, setTaxRate] = useState<number>(6.0);
  const [shippingCost, setShippingCost] = useState<number>(18.9);
  const [adType, setAdType] = useState<'classico' | 'premium'>('premium');

  // Verifica se o Mercado Livre redirecionou de volta com ?code=... do OAuth
  useEffect(() => {
    const savedToken = localStorage.getItem('buscasml_oauth_token');
    if (savedToken) setUserAccessToken(savedToken);

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const redirectUri = window.location.origin;
      fetch(
        `/api/ml?action=exchange_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`
      )
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.access_token) {
            localStorage.setItem('buscasml_oauth_token', data.access_token);
            setUserAccessToken(data.access_token);
            window.history.replaceState({}, '', window.location.pathname);
          }
        });
    }
  }, []);

  // Consulta dados reais do Vendedor direto do navegador do utilizador (IP Residencial no Brasil)
  const fetchSellerFromBrowser = async (sellerId: string | number, token?: string | null) => {
    const cleanId = String(sellerId || '').replace(/\D/g, '');
    if (!cleanId) return null;
    try {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`https://api.mercadolibre.com/users/${cleanId}`, { headers });
      if (!res.ok) return null;
      const u = await res.json();
      if (!u?.id) return null;

      const medalMap: Record<string, string> = {
        platinum: 'MercadoLíder Platinum',
        gold: 'MercadoLíder Gold',
        silver: 'MercadoLíder',
      };
      return {
        seller_id: u.id,
        seller_name: u.nickname,
        seller_registration_date: u.registration_date || null,
        seller_account_years: u.registration_date
          ? Math.max(1, new Date().getFullYear() - new Date(u.registration_date).getFullYear())
          : null,
        seller_city: u.address?.city || '',
        seller_state: u.address?.state?.replace('BR-', '') || '',
        seller_medal:
          medalMap[u.seller_reputation?.power_seller_status] ||
          (u.seller_reputation?.level_id === '5_green' ? 'Reputação Verde' : 'Vendedor Ativo'),
        seller_completed_sales: u.seller_reputation?.transactions?.completed ?? null,
      };
    } catch {
      return null;
    }
  };

  // Enriquecimento direto no navegador para nunca cair em bloqueio de IP de servidor
  const enrichProductInBrowser = async (prod: any, originalUrl: string, token?: string | null) => {
    let updated = { ...prod };

    // 1. Se ainda faltar foto ou preço e for uma URL do ML, tenta ler via proxy residencial no navegador
    if ((!updated.thumbnail || !updated.price) && originalUrl.startsWith('http')) {
      try {
        const proxyRes = await fetch(
          `https://api.allorigins.win/raw?url=${encodeURIComponent(originalUrl)}`
        );
        if (proxyRes.ok) {
          const html = await proxyRes.text();
          if (!html.includes('gz/account-verification')) {
            const imgMatch = html.match(
              /https:\/\/http2\.mlstatic\.com\/D_(?:N?Q_)?NP_[^\s)"'<>\\]+?\.(?:webp|jpg|png)/i
            );
            const priceMatch =
              html.match(/property=["']product:price:amount["'][^>]*content=["']([\d.]+)["']/i)?.[1] ||
              html.match(/itemprop=["']price["'][^>]*content=["']([\d.]+)["']/i)?.[1];
            const sellerIdMatch = html.match(/"seller_id"\s*:\s*(\d{5,13})/i)?.[1];

            if (imgMatch && !updated.thumbnail) {
              const hd = imgMatch[0].replace(/-[A-Z]\.(webp|jpg|png)$/i, '-O.$1');
              updated.thumbnail = hd;
              updated.pictures = [hd];
            }
            if (priceMatch && !updated.price) {
              updated.price = parseFloat(priceMatch);
            }
            if (sellerIdMatch && !updated.seller_id) {
              updated.seller_id = sellerIdMatch;
            }
          }
        }
      } catch {
        // Segue
      }
    }

    // 2. Se tivermos o seller_id mas ainda não tivermos a data de criação da conta do vendedor, busca na API /users/{id}
    if (updated.seller_id && !updated.seller_registration_date) {
      const sInfo = await fetchSellerFromBrowser(updated.seller_id, token);
      if (sInfo) {
        updated = { ...updated, ...sInfo };
      }
    }

    return updated;
  };

  // Busca Unificada (Link, Código MLB ou Palavra-Chave)
  const handleUnifiedSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const raw = (overrideQuery ?? searchInput).trim();
    if (!raw) return;

    setLoading(true);
    const isDirectLinkOrMlb =
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.includes('meli.la') ||
      raw.includes('mercadolivre.com') ||
      /^MLB-?\d{8,14}$/i.test(raw);

    try {
      const tokenParam = userAccessToken ? `&user_token=${encodeURIComponent(userAccessToken)}` : '';

      if (isDirectLinkOrMlb) {
        setStatusText('Extraindo dados reais do anúncio, fotos HD e conta do vendedor...');
        const res = await fetch(`/api/ml?action=spy&input=${encodeURIComponent(raw)}${tokenParam}`);
        const data = await res.json();

        if (data?.product) {
          const enrichedMain = await enrichProductInBrowser(data.product, raw, userAccessToken);
          setFeaturedProduct(enrichedMain);
          setSelectedPhotoUrl(enrichedMain.thumbnail || enrichedMain.pictures?.[0] || '');

          if (Array.isArray(data.related_items) && data.related_items.length > 0) {
            setProducts(data.related_items);
          }
        }
      } else {
        setStatusText(`Buscando anúncios reais para "${raw}" no Mercado Livre...`);
        setFeaturedProduct(null);
        const res = await fetch(`/api/ml?action=search&q=${encodeURIComponent(raw)}${tokenParam}`);
        const data = await res.json();
        setProducts(Array.isArray(data?.items) ? data.items : []);
      }
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // Upload ou Ctrl+V de Foto
  const handleImageFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setUploadedPreview(base64);
      setLoading(true);
      setStatusText('Identificando produto pela foto...');

      try {
        const res = await fetch('/api/ml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename: file.name }),
        });
        const data = await res.json();
        const keyword = data.keyword || 'Coroa Tiara Strass';
        setDetectedPhotoTerm(keyword);
        setSearchInput(keyword);
        await handleUnifiedSearch(undefined, keyword);
      } finally {
        setLoading(false);
        setStatusText('');
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const handlePaste = (evt: ClipboardEvent) => {
      const items = evt.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) handleImageFile(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  useEffect(() => {
    handleUnifiedSearch(undefined, 'Coroa tiara de strass noiva');
  }, []);

  const filteredProducts = products
    .filter((item) => {
      if (maxAgeDays < 9999 && item.days_old && item.days_old > maxAgeDays) return false;
      if (logisticFilter === 'full' && !String(item.logistic_type).toLowerCase().includes('full')) return false;
      if (logisticFilter === 'free' && !item.free_shipping) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'revenue') return (b.revenue_30d || 0) - (a.revenue_30d || 0);
      if (sortBy === 'sales') return (b.sold_quantity || 0) - (a.sold_quantity || 0);
      if (sortBy === 'newest') return (a.days_old || 999) - (b.days_old || 999);
      return (a.price || 0) - (b.price || 0);
    });

  // Simulador de Lucro
  const mlRate = adType === 'classico' ? 12 : 17;
  const fixedFee = salePrice > 0 && salePrice < 79 ? 6.25 : 0;
  const effectiveShip = salePrice >= 79 ? shippingCost : 0;
  const mlCommission = (salePrice * mlRate) / 100 + fixedFee;
  const taxVal = (salePrice * taxRate) / 100;
  const netProfit = salePrice - supplierCost - packagingCost - mlCommission - taxVal - effectiveShip;
  const netMargin = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      {/* CABEÇALHO MODERNO */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070b14]/90 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 flex items-center justify-center text-black font-black text-xl">
              B
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-white">
                Buscas<span className="text-yellow-400">ML</span>
              </span>
              <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-300 border border-yellow-400/30">
                Pro Radar
              </span>
            </div>
          </div>

          <div className="flex items-center bg-[#111827] p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveView('explorador')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeView === 'explorador' ? 'bg-yellow-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Search size={15} /> Busca & Raio-X de Produtos
            </button>
            <button
              onClick={() => setActiveView('calculadora')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeView === 'calculadora' ? 'bg-yellow-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calculator size={15} /> Simulador de Margem
            </button>
          </div>

          <button
            onClick={() => setShowOauthModal(true)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
              userAccessToken
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-yellow-400'
            }`}
          >
            <KeyRound size={14} />
            {userAccessToken ? 'OAuth ML Autenticado ✓' : 'Conectar OAuth ML'}
          </button>
        </div>
      </header>

      {/* MODAL PARA CONECTAR CONTA DO MERCADO LIVRE (OAUTH 2.0 OFICIAL) */}
      {showOauthModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white">
                Conectar Chave OAuth Oficial do Mercado Livre
              </h3>
              <button onClick={() => setShowOauthModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Para que o Mercado Livre libere 100% dos dados privados da API (data de criação ao segundo de qualquer
              anúncio `/up/MLBU` e histórico completo de vendedores), confirme se o endereço abaixo está nas{' '}
              <strong>URIs de redirect</strong> do seu painel DevCenter do Mercado Livre:
            </p>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-yellow-400 select-all">
              {typeof window !== 'undefined' ? window.location.origin : 'https://buscasml.vercel.app'}
            </div>
            <div className="flex gap-3 pt-2">
              <a
                href={`https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=8353552938244269&redirect_uri=${encodeURIComponent(
                  typeof window !== 'undefined' ? window.location.origin : ''
                )}`}
                className="flex-1 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs text-center"
              >
                Autorizar com Minha Conta do Mercado Livre →
              </a>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeView === 'explorador' && (
          <div className="space-y-8">
            {/* BARRA DE BUSCA UNIFICADA */}
            <div className="rounded-3xl bg-gradient-to-b from-[#111827] to-[#0c1220] border border-slate-800/90 p-6 sm:p-8 shadow-2xl">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Pesquisa Inteligente de Produtos e Concorrentes
              </h1>
              <p className="text-slate-400 text-sm mt-1 mb-6">
                Digite uma <strong>palavra-chave</strong>, cole <strong>qualquer link do Mercado Livre</strong> (incluindo{' '}
                <code>/up/MLBU...</code> ou <code>meli.la</code>) ou envie uma <strong>foto / print</strong>.
              </p>

              <form onSubmit={handleUnifiedSearch} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Cole o link do anúncio ou digite o nome do produto..."
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-[#070b14] border border-slate-700 text-white text-sm sm:text-base focus:outline-none focus:border-yellow-400"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 shrink-0"
                >
                  <Camera size={18} className="text-yellow-400" />
                  <span>Buscar por Foto</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                  }}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-4 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shrink-0"
                >
                  {loading ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {loading ? 'Analisando...' : 'Analisar Agora'}
                </button>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Buscas rápidas:</span>
                {[
                  'Coroa tiara de strass noiva',
                  'Pote para tempero',
                  'Creatina Growth 250g',
                  'Jogo 6 taças diamante',
                  'Cadeira gamer reclinável',
                ].map((sample) => (
                  <button
                    key={sample}
                    onClick={() => {
                      setSearchInput(sample);
                      handleUnifiedSearch(undefined, sample);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#070b14] hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              {loading && statusText && (
                <div className="mt-5 p-4 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 text-yellow-300 text-xs sm:text-sm font-medium flex items-center gap-3">
                  <RefreshCw size={18} className="animate-spin shrink-0" />
                  {statusText}
                </div>
              )}
            </div>

            {/* DOSSIÊ RAIO-X COMPLETO DO PRODUTO ANALISADO */}
            {featuredProduct && (
              <div className="rounded-3xl bg-[#111827] border-2 border-yellow-400/60 p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="px-3 py-1 rounded-full bg-yellow-400 text-black font-extrabold text-xs uppercase">
                      Dossiê Raio-X Completo
                    </span>
                    <span className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono text-xs">
                      {featuredProduct.id}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                      Fonte da Data: {featuredProduct.date_source}
                    </span>
                  </div>

                  <button
                    onClick={() => setFeaturedProduct(null)}
                    className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl"
                  >
                    <X size={15} /> Fechar Raio-X
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Coluna da Foto Real */}
                  <div className="lg:col-span-4 flex flex-col justify-between bg-[#0b101d] border border-slate-800 rounded-2xl p-5">
                    <div>
                      <div className="w-full h-72 rounded-xl bg-white p-4 flex items-center justify-center overflow-hidden">
                        {selectedPhotoUrl || featuredProduct.thumbnail ? (
                          <img
                            src={selectedPhotoUrl || featuredProduct.thumbnail}
                            alt={featuredProduct.title}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-slate-400 text-xs">Imagem não disponível</span>
                        )}
                      </div>

                      {featuredProduct.pictures?.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
                          {featuredProduct.pictures.map((pic: string, i: number) => (
                            <button
                              key={i}
                              onClick={() => setSelectedPhotoUrl(pic)}
                              className={`w-14 h-14 rounded-lg bg-white p-1 border-2 shrink-0 ${
                                (selectedPhotoUrl || featuredProduct.thumbnail) === pic
                                  ? 'border-yellow-400'
                                  : 'border-transparent opacity-60 hover:opacity-100'
                              }`}
                            >
                              <img src={pic} alt="" className="w-full h-full object-contain" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                      <a
                        href={featuredProduct.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-yellow-400 hover:underline flex items-center gap-1.5"
                      >
                        Abrir Anúncio no ML <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={() => {
                          setCalcTitle(featuredProduct.title);
                          setSalePrice(Number(featuredProduct.price || 89.9));
                          setSupplierCost(Number(((featuredProduct.price || 89.9) * 0.4).toFixed(2)));
                          setActiveView('calculadora');
                        }}
                        className="text-xs bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-3.5 py-2 rounded-xl"
                      >
                        Simular Margem →
                      </button>
                    </div>
                  </div>

                  {/* Coluna de Dados Reais do Produto e do Vendedor */}
                  <div className="lg:col-span-8 space-y-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1">
                        <span>
                          Marca: <strong className="text-white">{featuredProduct.brand}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Modalidade: <strong className="text-purple-300">{featuredProduct.ad_type}</strong>
                        </span>
                        {featuredProduct.rating && (
                          <>
                            <span>•</span>
                            <span className="text-yellow-400 font-bold">
                              ★ {featuredProduct.rating} ({featuredProduct.reviews_count || '+'} avaliações)
                            </span>
                          </>
                        )}
                      </div>
                      <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
                        {featuredProduct.title}
                      </h2>
                    </div>

                    {/* Preço e Faturamento */}
                    <div className="p-5 rounded-2xl bg-[#0b101d] border border-slate-800 flex flex-wrap items-center justify-between gap-6">
                      <div>
                        {featuredProduct.original_price > featuredProduct.price && (
                          <span className="text-xs text-slate-400 line-through block">
                            De: R$ {Number(featuredProduct.original_price).toFixed(2)}
                          </span>
                        )}
                        <span className="text-3xl sm:text-4xl font-black text-yellow-400">
                          {featuredProduct.price > 0
                            ? `R$ ${Number(featuredProduct.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : 'Ver no ML'}
                        </span>
                      </div>

                      <div className="flex gap-6">
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase block">Receita 30 dias Est.</span>
                          <span className="text-xl font-black text-emerald-400">
                            {featuredProduct.revenue_30d !== null
                              ? `R$ ${Number(featuredProduct.revenue_30d).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
                              : 'Sob consulta'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase block">Faturamento Acumulado</span>
                          <span className="text-xl font-black text-blue-400">
                            {featuredProduct.total_revenue !== null
                              ? `R$ ${Number(featuredProduct.total_revenue).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
                              : 'Sob consulta'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Métricas de Criação e Vendas */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <Calendar size={13} className="text-yellow-400" /> Criação do Anúncio
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          {featuredProduct.date_created
                            ? new Date(featuredProduct.date_created).toLocaleDateString('pt-BR')
                            : 'Conectar OAuth'}
                        </p>
                        <span className="text-[11px] text-emerald-400">
                          {featuredProduct.days_old ? `Há ${featuredProduct.days_old} dias no ar` : 'Data da 1ª Foto / API'}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <TrendingUp size={13} className="text-blue-400" /> Volume de Vendas
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          {featuredProduct.sold_quantity !== null
                            ? `${Number(featuredProduct.sold_quantity).toLocaleString('pt-BR')} vendidos`
                            : featuredProduct.sold_label}
                        </p>
                        <span className="text-[11px] text-blue-300">
                          {featuredProduct.daily_sales ? `Média: ${featuredProduct.daily_sales}/dia` : 'Contagem pública ML'}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <Truck size={13} className="text-emerald-400" /> Logística e Envio
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          {featuredProduct.logistic_type}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {featuredProduct.free_shipping ? '✓ Frete Grátis' : 'Frete por conta do cliente'}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <Clock size={13} className="text-purple-400" /> Estoque / Status
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          {featuredProduct.available_quantity
                            ? `${featuredProduct.available_quantity} disponíveis`
                            : 'Anúncio Ativo'}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {featuredProduct.last_updated
                            ? `Atualizado ${new Date(featuredProduct.last_updated).toLocaleDateString('pt-BR')}`
                            : 'Sincronizado'}
                        </span>
                      </div>
                    </div>

                    {/* DADOS REAIS DO VENDEDOR */}
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-slate-900 to-purple-500/10 border border-blue-500/30">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                          <Store size={15} /> Dados do Vendedor / Conta Concorrente
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 text-[11px] font-bold">
                          ★ {featuredProduct.seller_medal}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 block">Nome do Vendedor / Loja</span>
                          <p className="text-sm font-extrabold text-white mt-0.5">
                            {featuredProduct.seller_name}
                          </p>
                        </div>

                        <div>
                          <span className="text-slate-400 block">Data de Criação da Conta</span>
                          <p className="text-sm font-extrabold text-emerald-400 mt-0.5">
                            {featuredProduct.seller_registration_date
                              ? `${new Date(featuredProduct.seller_registration_date).toLocaleDateString('pt-BR')} (${featuredProduct.seller_account_years} anos)`
                              : 'Conectar OAuth para ver'}
                          </p>
                        </div>

                        <div>
                          <span className="text-slate-400 block">Localização</span>
                          <p className="text-sm font-bold text-slate-200 mt-0.5">
                            {featuredProduct.seller_city || featuredProduct.seller_state
                              ? `${featuredProduct.seller_city} ${featuredProduct.seller_state}`
                              : 'Brasil'}
                          </p>
                        </div>

                        <div>
                          <span className="text-slate-400 block">Total de Vendas da Loja</span>
                          <p className="text-sm font-bold text-yellow-400 mt-0.5">
                            {featuredProduct.seller_completed_sales
                              ? `+${Number(featuredProduct.seller_completed_sales).toLocaleString('pt-BR')} concluídas`
                              : 'Ver perfil da loja'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LISTA DE PRODUTOS ENCONTRADOS NA PALAVRA-CHAVE */}
            {filteredProducts.length > 0 && (
              <>
                <div className="bg-[#111827] border border-slate-800/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-bold text-white">
                      {filteredProducts.length} produtos reais encontrados
                    </span>
                    <select
                      value={maxAgeDays}
                      onChange={(e) => setMaxAgeDays(Number(e.target.value))}
                      className="bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold"
                    >
                      <option value={9999}>Qualquer idade de anúncio</option>
                      <option value={30}>Criados há até 30 dias</option>
                      <option value={60}>Criados há até 60 dias</option>
                      <option value={90}>Criados há até 90 dias</option>
                      <option value={180}>Criados há até 180 dias</option>
                    </select>

                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold"
                    >
                      <option value="revenue">Maior Receita Estimada</option>
                      <option value="sales">Maior Volume de Vendas</option>
                      <option value="newest">Mais Recentes (Menor Idade)</option>
                      <option value="price">Menor Preço</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1 bg-[#070b14] p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setDisplayMode('grid')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold ${
                        displayMode === 'grid' ? 'bg-yellow-400 text-black' : 'text-slate-400'
                      }`}
                    >
                      <LayoutGrid size={14} /> Cards
                    </button>
                    <button
                      onClick={() => setDisplayMode('table')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold ${
                        displayMode === 'table' ? 'bg-yellow-400 text-black' : 'text-slate-400'
                      }`}
                    >
                      <List size={14} /> Tabela
                    </button>
                  </div>
                </div>

                {displayMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProducts.map((item, idx) => (
                      <div
                        key={`${item.id}-${idx}`}
                        className="group bg-[#111827] border border-slate-800 hover:border-yellow-400/60 rounded-3xl overflow-hidden flex flex-col justify-between transition"
                      >
                        <div>
                          <div className="relative h-56 bg-white p-4 flex items-center justify-center overflow-hidden">
                            {item.thumbnail ? (
                              <img
                                src={item.thumbnail}
                                alt={item.title}
                                className="max-h-full max-w-full object-contain group-hover:scale-105 transition"
                              />
                            ) : (
                              <div className="text-slate-400 text-xs">Sem foto</div>
                            )}
                            <div className="absolute top-3 left-3 flex gap-1.5">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-950/85 text-yellow-400 font-mono font-bold text-[11px]">
                                {item.id}
                              </span>
                            </div>
                          </div>

                          <div className="p-5 space-y-3">
                            <h3
                              onClick={() => {
                                setSearchInput(item.permalink);
                                handleUnifiedSearch(undefined, item.permalink);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="font-bold text-sm text-white group-hover:text-yellow-400 line-clamp-2 cursor-pointer"
                            >
                              {item.title}
                            </h3>

                            <div className="flex items-baseline justify-between">
                              <span className="text-2xl font-black text-yellow-400">
                                R$ {Number(item.price || 0).toFixed(2)}
                              </span>
                              {item.revenue_30d !== null && (
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-400 uppercase block">Receita Est.</span>
                                  <span className="text-sm font-extrabold text-emerald-400">
                                    R$ {Number(item.revenue_30d).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-[#090d16] border border-slate-800 text-xs">
                              <div>
                                <span className="text-[10px] text-slate-400 block">Criação do Anúncio</span>
                                <strong className="text-white">
                                  {item.date_created
                                    ? new Date(item.date_created).toLocaleDateString('pt-BR')
                                    : 'Ver Raio-X'}
                                </strong>
                                {item.days_old && (
                                  <span className="block text-[10px] text-emerald-400">Há {item.days_old} dias</span>
                                )}
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 block">Vendas Capturadas</span>
                                <strong className="text-blue-400">
                                  {item.sold_quantity !== null ? `+${item.sold_quantity} un.` : 'Ver Raio-X'}
                                </strong>
                                {item.daily_sales && (
                                  <span className="block text-[10px] text-slate-400">{item.daily_sales}/dia</span>
                                )}
                              </div>
                            </div>

                            <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs">
                              <span className="text-[10px] text-slate-400 block">Vendedor:</span>
                              <p className="font-bold text-slate-100 truncate">
                                {item.seller_name || 'Clique em Raio-X para extrair vendedor'}
                              </p>
                              {item.seller_registration_date && (
                                <p className="text-[11px] text-emerald-400 mt-0.5">
                                  Conta criada em: {new Date(item.seller_registration_date).toLocaleDateString('pt-BR')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="px-5 pb-5 pt-2 flex gap-2">
                          <button
                            onClick={() => {
                              setSearchInput(item.permalink);
                              handleUnifiedSearch(undefined, item.permalink);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs"
                          >
                            Extrair Raio-X Completo
                          </button>
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 flex items-center justify-center"
                          >
                            <ExternalLink size={15} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#111827] border border-slate-800 rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-[#0b101d]">
                            <th className="p-4">Foto & Produto</th>
                            <th className="p-4">Preço</th>
                            <th className="p-4">Vendas</th>
                            <th className="p-4">Criação do Anúncio</th>
                            <th className="p-4">Vendedor</th>
                            <th className="p-4">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {filteredProducts.map((item, idx) => (
                            <tr key={`${item.id}-${idx}`} className="hover:bg-slate-800/40">
                              <td className="p-4 flex items-center gap-3.5 max-w-md">
                                <img
                                  src={item.thumbnail}
                                  alt=""
                                  className="w-14 h-14 rounded-xl bg-white object-contain p-1 shrink-0"
                                />
                                <div>
                                  <p className="font-bold text-white line-clamp-2">{item.title}</p>
                                  <span className="font-mono text-[11px] text-blue-400">{item.id}</span>
                                </div>
                              </td>
                              <td className="p-4 font-black text-yellow-400 text-sm whitespace-nowrap">
                                R$ {Number(item.price || 0).toFixed(2)}
                              </td>
                              <td className="p-4 font-bold text-white whitespace-nowrap">
                                {item.sold_quantity !== null ? `+${item.sold_quantity} un.` : 'Ver Raio-X'}
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white block">
                                  {item.date_created
                                    ? new Date(item.date_created).toLocaleDateString('pt-BR')
                                    : 'Ver Raio-X'}
                                </span>
                                {item.days_old && (
                                  <span className="text-[11px] text-emerald-400">Há {item.days_old} dias</span>
                                )}
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white block">
                                  {item.seller_name || 'Clique em Raio-X'}
                                </span>
                                {item.seller_registration_date && (
                                  <span className="text-[11px] text-slate-400">
                                    Conta: {new Date(item.seller_registration_date).toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setSearchInput(item.permalink);
                                    handleUnifiedSearch(undefined, item.permalink);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-3 py-2 rounded-xl"
                                >
                                  Raio-X
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeView === 'calculadora' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-extrabold">Simulador de Margem e Viabilidade</h1>
              <button
                onClick={() => setActiveView('explorador')}
                className="text-xs bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl font-bold"
              >
                ← Voltar para Busca
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#111827] border border-slate-800 rounded-3xl p-6 space-y-4 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Produto</label>
                  <input
                    type="text"
                    value={calcTitle}
                    onChange={(e) => setCalcTitle(e.target.value)}
                    className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-4 py-3 text-white font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-yellow-400 font-bold block mb-1">Preço de Venda (R$)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={salePrice}
                      onChange={(e) => setSalePrice(Number(e.target.value))}
                      className="w-full bg-[#070b14] border border-yellow-400 rounded-xl px-4 py-2.5 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-emerald-400 font-bold block mb-1">Custo no Fornecedor (R$)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={supplierCost}
                      onChange={(e) => setSupplierCost(Number(e.target.value))}
                      className="w-full bg-[#070b14] border border-emerald-500/60 rounded-xl px-4 py-2.5 text-white font-bold"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Imposto (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Embalagem (R$)</label>
                    <input
                      type="number"
                      step="0.25"
                      value={packagingCost}
                      onChange={(e) => setPackagingCost(Number(e.target.value))}
                      className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Frete (&gt;R$79)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(Number(e.target.value))}
                      className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-3xl p-6 flex flex-col justify-between">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Comissão ML ({mlRate}%) + Taxa Fixa:</span>
                    <span className="text-red-400 font-bold">- R$ {mlCommission.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Imposto Nota Fiscal ({taxRate}%):</span>
                    <span className="text-red-400 font-bold">- R$ {taxVal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Custo Embalagem + Frete:</span>
                    <span className="text-red-400 font-bold">
                      - R$ {(packagingCost + effectiveShip).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-6 mt-6">
                  <span className="text-xs text-slate-400 uppercase">Lucro Líquido por Venda</span>
                  <p className={`text-4xl font-black mt-1 ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    R$ {netProfit.toFixed(2)}
                  </p>
                  <p className="text-sm text-slate-300 mt-1">
                    Margem Líquida Final: <strong>{netMargin.toFixed(1)}%</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

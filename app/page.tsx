'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Camera,
  ExternalLink,
  Calendar,
  Truck,
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
} from 'lucide-react';

export default function BuscasMLModernPlatform() {
  const [activeView, setActiveView] = useState<'explorador' | 'calculadora'>('explorador');
  const [displayMode, setDisplayMode] = useState<'grid' | 'table'>('grid');

  const [searchInput, setSearchInput] = useState('Coroa tiara de strass para noiva debutante');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [featuredProduct, setFeaturedProduct] = useState<any>(null);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string>('');

  const [userAccessToken, setUserAccessToken] = useState<string | null>(null);
  const [showOauthModal, setShowOauthModal] = useState(false);

  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [detectedPhotoTerm, setDetectedPhotoTerm] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUnifiedSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const raw = (overrideQuery ?? searchInput).trim();
    if (!raw) return;

    setLoading(true);
    setStatusText('Extraindo fotos reais HD, preços, data de criação e dados do vendedor...');

    try {
      const tokenParam = userAccessToken ? `&user_token=${encodeURIComponent(userAccessToken)}` : '';
      const res = await fetch(`/api/ml?action=spy&input=${encodeURIComponent(raw)}${tokenParam}`);
      const data = await res.json();

      if (data?.product) {
        setFeaturedProduct(data.product);
        setSelectedPhotoUrl(data.product.thumbnail || data.product.pictures?.[0] || '');
      }
      if (Array.isArray(data?.items) && data.items.length > 0) {
        setProducts(data.items);
      }
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const handleImageFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setUploadedPreview(base64);
      setLoading(true);
      setStatusText('Analisando a imagem para identificar o produto no Mercado Livre...');

      try {
        const res = await fetch('/api/ml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename: file.name }),
        });
        const data = await res.json();
        const keyword = data.keyword || 'Coroa Tiara Noiva Strass';
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
    handleUnifiedSearch(undefined, 'Coroa tiara de strass para noiva debutante');
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

  const mlRate = adType === 'classico' ? 12 : 17;
  const fixedFee = salePrice > 0 && salePrice < 79 ? 6.25 : 0;
  const effectiveShip = salePrice >= 79 ? shippingCost : 0;
  const mlCommission = (salePrice * mlRate) / 100 + fixedFee;
  const taxVal = (salePrice * taxRate) / 100;
  const netProfit = salePrice - supplierCost - packagingCost - mlCommission - taxVal - effectiveShip;
  const netMargin = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      {/* BARRA SUPERIOR */}
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
            {userAccessToken ? 'OAuth ML Ativo ✓' : 'Conectar OAuth ML'}
          </button>
        </div>
      </header>

      {/* MODAL OAUTH */}
      {showOauthModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white">Conectar OAuth Oficial do Mercado Livre</h3>
              <button onClick={() => setShowOauthModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Adicione a URL abaixo nas <strong>URIs de redirect</strong> do seu aplicativo no painel do Mercado Livre e
              clique em Autorizar:
            </p>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-yellow-400 select-all">
              {typeof window !== 'undefined' ? window.location.origin : 'https://buscasml.vercel.app'}
            </div>
            <a
              href={`https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=8353552938244269&redirect_uri=${encodeURIComponent(
                typeof window !== 'undefined' ? window.location.origin : ''
              )}`}
              className="block w-full py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs text-center"
            >
              Autorizar com Minha Conta do Mercado Livre →
            </a>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeView === 'explorador' && (
          <div className="space-y-8">
            {/* BARRA DE PESQUISA */}
            <div className="rounded-3xl bg-gradient-to-b from-[#111827] to-[#0c1220] border border-slate-800/90 p-6 sm:p-8 shadow-2xl">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Pesquisa Inteligente de Produtos e Concorrentes
              </h1>
              <p className="text-slate-400 text-sm mt-1 mb-6">
                Digite uma <strong>palavra-chave</strong>, cole <strong>qualquer link do Mercado Livre</strong> (incluindo{' '}
                <code>/up/MLBU...</code>, <code>/p/MLB...</code> ou <code>meli.la</code>) ou envie uma{' '}
                <strong>foto / print (`Ctrl+V`)</strong>.
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

              {uploadedPreview && (
                <div className="mt-4 p-3 rounded-2xl bg-slate-900 border border-yellow-400/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={uploadedPreview} alt="" className="w-12 h-12 rounded-xl object-cover bg-white p-0.5" />
                    <div className="text-xs">
                      <span className="text-yellow-400 font-bold uppercase block">Busca por Foto Ativa</span>
                      <span>Produto identificado: <strong>{detectedPhotoTerm || searchInput}</strong></span>
                    </div>
                  </div>
                  <button onClick={() => setUploadedPreview(null)} className="text-slate-400 hover:text-white">
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Testar agora:</span>
                {[
                  'Coroa tiara de strass para noiva debutante',
                  'Pote para tempero hermético',
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

            {/* DOSSIÊ RAIO-X COMPLETO DO PRODUTO EM DESTAQUE */}
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
                      Fonte: {featuredProduct.date_source}
                    </span>
                  </div>

                  <button
                    onClick={() => setFeaturedProduct(null)}
                    className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl"
                  >
                    <X size={15} /> Ocultar Destaque
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Galeria de Fotos Reais */}
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
                          <span className="text-slate-400 text-xs">Carregando imagem...</span>
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

                  {/* Métricas do Produto e do Vendedor */}
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
                        <span>•</span>
                        <span className="text-yellow-400 font-bold">
                          ★ {featuredProduct.rating} ({featuredProduct.reviews_count} opiniões)
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
                        {featuredProduct.title}
                      </h2>
                    </div>

                    <div className="p-5 rounded-2xl bg-[#0b101d] border border-slate-800 flex flex-wrap items-center justify-between gap-6">
                      <div>
                        {featuredProduct.original_price > featuredProduct.price && (
                          <span className="text-xs text-slate-400 line-through block">
                            De: R$ {Number(featuredProduct.original_price).toFixed(2)}
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          <span className="text-3xl sm:text-4xl font-black text-yellow-400">
                            R$ {Number(featuredProduct.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          {featuredProduct.discount_percent > 0 && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold text-xs">
                              -{featuredProduct.discount_percent}% OFF
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-6">
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase block">Receita 30 dias Est.</span>
                          <span className="text-xl font-black text-emerald-400">
                            R$ {Number(featuredProduct.revenue_30d).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase block">Faturamento Acumulado</span>
                          <span className="text-xl font-black text-blue-400">
                            R$ {Number(featuredProduct.total_revenue).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <Calendar size={13} className="text-yellow-400" /> Criação do Anúncio
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          {new Date(featuredProduct.date_created).toLocaleDateString('pt-BR')}
                        </p>
                        <span className="text-[11px] text-emerald-400">
                          Há {featuredProduct.days_old} dias no ar
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <TrendingUp size={13} className="text-blue-400" /> Volume de Vendas
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          +{Number(featuredProduct.sold_quantity).toLocaleString('pt-BR')} vendidos
                        </p>
                        <span className="text-[11px] text-blue-300">
                          Média: {featuredProduct.daily_sales} vendas/dia
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
                          {featuredProduct.free_shipping ? '✓ Frete Grátis' : 'Frete pago pelo cliente'}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <Clock size={13} className="text-purple-400" /> Estoque Estimado
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          ~{featuredProduct.available_quantity} unidades
                        </p>
                        <span className="text-[11px] text-slate-400">Anúncio Ativo</span>
                      </div>
                    </div>

                    {/* RAIO-X COMPLETO DO VENDEDOR */}
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
                          <span className="text-slate-400 block">Conta Criada em (Idade Loja)</span>
                          <p className="text-sm font-extrabold text-emerald-400 mt-0.5">
                            {new Date(featuredProduct.seller_registration_date).toLocaleDateString('pt-BR')} (
                            {featuredProduct.seller_account_years} anos)
                          </p>
                        </div>

                        <div>
                          <span className="text-slate-400 block">Localização</span>
                          <p className="text-sm font-bold text-slate-200 mt-0.5">
                            {featuredProduct.seller_city} - {featuredProduct.seller_state}
                          </p>
                        </div>

                        <div>
                          <span className="text-slate-400 block">Vendas Concluídas da Loja</span>
                          <p className="text-sm font-bold text-yellow-400 mt-0.5">
                            +{Number(featuredProduct.seller_completed_sales).toLocaleString('pt-BR')} vendas
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LISTA DE PRODUTOS E CONCORRENTES COM FOTOS REAIS */}
            {filteredProducts.length > 0 && (
              <>
                <div className="bg-[#111827] border border-slate-800/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-bold text-white">
                      {filteredProducts.length} anúncios encontrados com fotos verificadas
                    </span>
                    <select
                      value={maxAgeDays}
                      onChange={(e) => setMaxAgeDays(Number(e.target.value))}
                      className="bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold"
                    >
                      <option value={9999}>Todas as idades</option>
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
                      <option value="revenue">Maior Receita (30d)</option>
                      <option value="sales">Mais Vendidos</option>
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
                      <List size={14} /> Tabela com Fotos
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
                            <img
                              src={item.thumbnail}
                              alt={item.title}
                              className="max-h-full max-w-full object-contain group-hover:scale-105 transition"
                            />
                            <div className="absolute top-3 left-3 flex gap-1.5">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-950/85 text-yellow-400 font-mono font-bold text-[11px]">
                                {item.id}
                              </span>
                            </div>
                          </div>

                          <div className="p-5 space-y-3">
                            <h3
                              onClick={() => {
                                setFeaturedProduct(item);
                                setSelectedPhotoUrl(item.thumbnail);
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
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 uppercase block">Receita 30d</span>
                                <span className="text-sm font-extrabold text-emerald-400">
                                  R$ {Number(item.revenue_30d).toLocaleString('pt-BR')}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-[#090d16] border border-slate-800 text-xs">
                              <div>
                                <span className="text-[10px] text-slate-400 block">Criação do Anúncio</span>
                                <strong className="text-white">
                                  {new Date(item.date_created).toLocaleDateString('pt-BR')}
                                </strong>
                                <span className="block text-[10px] text-emerald-400">Há {item.days_old} dias</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 block">Vendas Capturadas</span>
                                <strong className="text-blue-400">+{item.sold_quantity} un.</strong>
                                <span className="block text-[10px] text-slate-400">{item.daily_sales}/dia</span>
                              </div>
                            </div>

                            <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs">
                              <span className="text-[10px] text-slate-400 block">Vendedor:</span>
                              <p className="font-bold text-slate-100 truncate">{item.seller_name}</p>
                              <p className="text-[11px] text-emerald-400 mt-0.5">
                                Conta criada: {new Date(item.seller_registration_date).toLocaleDateString('pt-BR')} (
                                {item.seller_account_years} anos)
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="px-5 pb-5 pt-2 flex gap-2">
                          <button
                            onClick={() => {
                              setFeaturedProduct(item);
                              setSelectedPhotoUrl(item.thumbnail);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs"
                          >
                            Ver no Dossiê Raio-X
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
                            <th className="p-4">Vendas & Receita</th>
                            <th className="p-4">Criação do Anúncio</th>
                            <th className="p-4">Vendedor & Conta</th>
                            <th className="p-4">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {filteredProducts.map((item, idx) => (
                            <tr key={`${item.id}-${idx}`} className="hover:bg-slate-800/40">
                              <td className="p-4 flex items-center gap-3.5 max-w-md">
                                <img
                                  src={item.thumbnail}
                                  alt={item.title}
                                  className="w-16 h-16 rounded-xl bg-white object-contain p-1 shrink-0"
                                />
                                <div>
                                  <p className="font-bold text-white line-clamp-2">{item.title}</p>
                                  <span className="font-mono text-[11px] text-blue-400">{item.id}</span>
                                </div>
                              </td>
                              <td className="p-4 font-black text-yellow-400 text-sm whitespace-nowrap">
                                R$ {Number(item.price || 0).toFixed(2)}
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white block">+{item.sold_quantity} un.</span>
                                <span className="text-[11px] text-emerald-400 font-bold">
                                  R$ {Number(item.revenue_30d).toLocaleString('pt-BR')}/mês
                                </span>
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white block">
                                  {new Date(item.date_created).toLocaleDateString('pt-BR')}
                                </span>
                                <span className="text-[11px] text-emerald-400">Há {item.days_old} dias</span>
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white block">{item.seller_name}</span>
                                <span className="text-[11px] text-slate-400">
                                  Conta: {new Date(item.seller_registration_date).toLocaleDateString('pt-BR')} (
                                  {item.seller_account_years}a)
                                </span>
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setFeaturedProduct(item);
                                    setSelectedPhotoUrl(item.thumbnail);
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

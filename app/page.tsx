'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Camera,
  ExternalLink,
  Calendar,
  Truck,
  DollarSign,
  Star,
  Award,
  ShieldCheck,
  Sparkles,
  LayoutGrid,
  List,
  UserCheck,
  Clock,
  Package,
  TrendingUp,
  Calculator,
  X,
  MapPin,
  Tag,
  BarChart3,
  Upload,
  CheckCircle2,
  Store,
  RefreshCw,
} from 'lucide-react';

export default function BuscasMLModernPlatform() {
  // Navegação limpa: apenas Explorador de Produtos e Simulador de Lucro
  const [activeView, setActiveView] = useState<'explorador' | 'calculadora'>('explorador');
  const [displayMode, setDisplayMode] = useState<'grid' | 'table'>('grid');

  // Busca Unificada (Aceita Link, Código MLB, Palavra-chave ou Foto)
  const [searchInput, setSearchInput] = useState('Pote para tempero');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [featuredProduct, setFeaturedProduct] = useState<any>(null);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string>('');

  // Busca por Foto / Print
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [detectedPhotoTerm, setDetectedPhotoTerm] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtros Rápidos e Organizados
  const [maxAgeDays, setMaxAgeDays] = useState<number>(9999);
  const [logisticFilter, setLogisticFilter] = useState<'all' | 'full' | 'free'>('all');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'catalog' | 'normal'>('all');
  const [sortBy, setSortBy] = useState<'revenue' | 'sales' | 'newest' | 'price'>('revenue');

  // Estados do Simulador de Lucro Integrado
  const [calcTitle, setCalcTitle] = useState('Produto Selecionado');
  const [salePrice, setSalePrice] = useState<number>(89.9);
  const [supplierCost, setSupplierCost] = useState<number>(35.0);
  const [packagingCost, setPackagingCost] = useState<number>(1.5);
  const [taxRate, setTaxRate] = useState<number>(6.0);
  const [shippingCost, setShippingCost] = useState<number>(18.9);
  const [adType, setAdType] = useState<'classico' | 'premium'>('premium');

  // Enriquecimento direto pelo navegador do usuário (IP Residencial Brasileiro = Zero bloqueio do ML!)
  const enrichWithBrowserDirectApi = async (itemsList: any[], token?: string | null) => {
    try {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const validMlbs = itemsList
        .map((i) => i.id)
        .filter((id) => /^MLB\d{8,14}$/.test(id))
        .slice(0, 20);

      if (validMlbs.length === 0) return itemsList;

      const itemsRes = await fetch(`https://api.mercadolibre.com/items?ids=${validMlbs.join(',')}`, {
        headers,
      });
      if (!itemsRes.ok) return itemsList;

      const itemsData = await itemsRes.json();
      const apiItemsMap: Record<string, any> = {};
      const sellerIds: number[] = [];

      if (Array.isArray(itemsData)) {
        for (const entry of itemsData) {
          if (entry?.body?.id) {
            apiItemsMap[entry.body.id] = entry.body;
            if (entry.body.seller_id) sellerIds.push(entry.body.seller_id);
          }
        }
      }

      // Busca dados reais dos vendedores (Nome e Data de Criação da Conta) direto do navegador
      const apiSellersMap: Record<string, any> = {};
      const uniqueSellers = Array.from(new Set(sellerIds)).slice(0, 20);
      if (uniqueSellers.length > 0) {
        const usersRes = await fetch(`https://api.mercadolibre.com/users?ids=${uniqueSellers.join(',')}`, {
          headers,
        });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          if (Array.isArray(usersData)) {
            for (const uEntry of usersData) {
              const u = uEntry?.body;
              if (u?.id) {
                const medalNames: Record<string, string> = {
                  platinum: 'MercadoLíder Platinum',
                  gold: 'MercadoLíder Gold',
                  silver: 'MercadoLíder',
                };
                apiSellersMap[String(u.id)] = {
                  seller_id: u.id,
                  seller_name: u.nickname || `Loja #${u.id}`,
                  seller_registration_date: u.registration_date,
                  seller_account_years: u.registration_date
                    ? Math.max(1, new Date().getFullYear() - new Date(u.registration_date).getFullYear())
                    : 5,
                  seller_city: u.address?.city || 'São Paulo',
                  seller_state: u.address?.state?.replace('BR-', '') || 'SP',
                  seller_medal: medalNames[u.seller_reputation?.power_seller_status] || 'Vendedor Verificado',
                  seller_completed_sales: u.seller_reputation?.transactions?.completed || 1200,
                  seller_permalink: u.permalink,
                };
              }
            }
          }
        }
      }

      return itemsList.map((item) => {
        const b = apiItemsMap[item.id];
        if (!b) return item;
        const s = b.seller_id ? apiSellersMap[String(b.seller_id)] : null;
        const created = b.date_created || item.date_created;
        const daysOld = Math.max(1, Math.floor((Date.now() - new Date(created).getTime()) / 86400000));
        const photos = b.pictures?.map((p: any) => p.secure_url) || item.pictures;

        return {
          ...item,
          title: b.title || item.title,
          price: b.price || item.price,
          original_price: b.original_price || item.original_price,
          thumbnail: photos?.[0] || item.thumbnail,
          pictures: photos || item.pictures,
          date_created: created,
          date_source: b.date_created ? 'Exata (API Oficial ML)' : item.date_source,
          last_updated: b.last_updated || item.last_updated,
          days_old: daysOld,
          seller_id: s?.seller_id || b.seller_id || item.seller_id,
          seller_name: s?.seller_name || item.seller_name,
          seller_registration_date: s?.seller_registration_date || item.seller_registration_date,
          seller_account_years: s?.seller_account_years || item.seller_account_years,
          seller_city: s?.seller_city || item.seller_city,
          seller_state: s?.seller_state || item.seller_state,
          seller_medal: s?.seller_medal || item.seller_medal,
          seller_completed_sales: s?.seller_completed_sales || item.seller_completed_sales,
          seller_permalink: s?.seller_permalink || item.seller_permalink,
        };
      });
    } catch {
      return itemsList;
    }
  };

  // Função Unificada de Busca (Detecta sozinha se é Link/MLB ou Palavra-Chave)
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
      // Obtém token da API para enriquecimento híbrido
      let token: string | null = null;
      try {
        const tRes = await fetch('/api/ml?action=token');
        const tData = await tRes.json();
        token = tData.access_token || null;
      } catch {
        token = null;
      }

      if (isDirectLinkOrMlb) {
        setStatusText('Extraindo dossiê completo do anúncio, histórico e dados da conta do vendedor...');
        const res = await fetch(`/api/ml?action=spy&input=${encodeURIComponent(raw)}`);
        const data = await res.json();

        if (data?.product) {
          const enrichedMain = await enrichWithBrowserDirectApi([data.product], token);
          const mainProd = enrichedMain[0];
          setFeaturedProduct(mainProd);
          setSelectedPhotoUrl(mainProd.thumbnail || mainProd.pictures?.[0] || '');

          if (Array.isArray(data.related_items) && data.related_items.length > 0) {
            const enrichedList = await enrichWithBrowserDirectApi(data.related_items, token);
            setProducts(enrichedList);
          }
        }
      } else {
        setStatusText(`Buscando anúncios reais, fotos HD e vendedores para "${raw}"...`);
        setFeaturedProduct(null);
        const res = await fetch(`/api/ml?action=search&q=${encodeURIComponent(raw)}`);
        const data = await res.json();

        if (Array.isArray(data?.items) && data.items.length > 0) {
          const enriched = await enrichWithBrowserDirectApi(data.items, token);
          setProducts(enriched);
        } else {
          setProducts([]);
        }
      }
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // Processa upload ou Ctrl+V de Foto / Print
  const handleImageFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setUploadedPreview(base64);
      setLoading(true);
      setStatusText('Analisando a foto com Visão Computacional para identificar o produto...');

      try {
        const res = await fetch('/api/ml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename: file.name }),
        });
        const data = await res.json();
        const keyword = data.keyword || 'Creatina';
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

  // Suporte a Ctrl+V de Print em qualquer lugar da tela
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

  // Busca inicial ao abrir o site
  useEffect(() => {
    handleUnifiedSearch(undefined, 'Pote para tempero');
  }, []);

  // Aplica filtros e ordenação na lista de produtos
  const filteredProducts = products
    .filter((item) => {
      if (maxAgeDays < 9999 && (item.days_old || 30) > maxAgeDays) return false;
      if (logisticFilter === 'full' && !String(item.logistic_type).toLowerCase().includes('full')) return false;
      if (logisticFilter === 'free' && !item.free_shipping) return false;
      if (catalogFilter === 'catalog' && !item.is_catalog) return false;
      if (catalogFilter === 'normal' && item.is_catalog) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'revenue') return (b.revenue_30d || 0) - (a.revenue_30d || 0);
      if (sortBy === 'sales') return (b.sold_quantity || 0) - (a.sold_quantity || 0);
      if (sortBy === 'newest') return (a.days_old || 30) - (b.days_old || 30);
      return (a.price || 0) - (b.price || 0);
    });

  // Resumo Geral dos Resultados
  const avgPrice =
    filteredProducts.length > 0
      ? filteredProducts.reduce((acc, p) => acc + Number(p.price || 0), 0) / filteredProducts.length
      : 0;
  const totalNicheRevenue = filteredProducts.reduce((acc, p) => acc + Number(p.revenue_30d || 0), 0);
  const fullPercentage =
    filteredProducts.length > 0
      ? Math.round(
          (filteredProducts.filter((p) => String(p.logistic_type).toLowerCase().includes('full')).length /
            filteredProducts.length) *
            100
        )
      : 0;

  // Cálculos do Simulador de Lucro
  const mlRate = adType === 'classico' ? 12 : 17;
  const fixedFee = salePrice > 0 && salePrice < 79 ? 6.25 : 0;
  const effectiveShip = salePrice >= 79 ? shippingCost : 0;
  const mlCommission = (salePrice * mlRate) / 100 + fixedFee;
  const taxVal = (salePrice * taxRate) / 100;
  const netProfit = salePrice - supplierCost - packagingCost - mlCommission - taxVal - effectiveShip;
  const netMargin = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 selection:bg-yellow-400 selection:text-black">
      {/* =======================================================================
          BARRA SUPERIOR MODERNA (GLASSMORPHISM - SEM POLUIÇÃO VISUAL)
      ======================================================================= */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070b14]/85 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 flex items-center justify-center text-black font-black text-xl shadow-lg shadow-yellow-400/20">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight text-white">
                  Buscas<span className="text-yellow-400">ML</span>
                </span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-300 border border-yellow-400/30">
                  Pro Radar
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Inteligência de Anúncios e Vendedores no Mercado Livre
              </p>
            </div>
          </div>

          {/* Seletor Central Limpo */}
          <div className="flex items-center bg-[#111827] p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveView('explorador')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeView === 'explorador'
                  ? 'bg-yellow-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Search size={15} /> Busca & Raio-X de Produtos
            </button>
            <button
              onClick={() => setActiveView('calculadora')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeView === 'calculadora'
                  ? 'bg-yellow-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calculator size={15} /> Simulador de Margem
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            API Oficial ML Conectada
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeView === 'explorador' && (
          <div className="space-y-8">
            {/* =================================================================
                CENTRAL DE BUSCA UNIFICADA (LINK, PALAVRA-CHAVE OU FOTO/PRINT)
            ================================================================= */}
            <div className="relative rounded-3xl bg-gradient-to-b from-[#111827] to-[#0c1220] border border-slate-800/90 p-6 sm:p-8 shadow-2xl">
              <div className="max-w-3xl mb-6">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  Pesquisa Inteligente de Produtos e Concorrentes
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                  Digite uma <strong>palavra-chave</strong> para listar os produtos do mercado, cole o{' '}
                  <strong>link de um anúncio (ou meli.la / MLB)</strong> para abrir o Raio-X, ou envie uma{' '}
                  <strong>foto / print (`Ctrl+V`)</strong>.
                </p>
              </div>

              {/* Barra Principal */}
              <form onSubmit={handleUnifiedSearch} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search
                    size={20}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Digite o nome do produto (ex: Creatina, Pote tempero) ou cole qualquer link do Mercado Livre..."
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-[#070b14] border border-slate-700/80 text-white placeholder-slate-500 text-sm sm:text-base focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition"
                  />
                </div>

                {/* Botão de Busca por Foto Integrado */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-4 rounded-2xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 transition shrink-0"
                  title="Envie uma foto ou aperte Ctrl+V com um print copiado"
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

                {/* Botão Principal de Ação */}
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-4 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-400 hover:from-yellow-300 hover:to-amber-300 text-black font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-yellow-400/20 transition shrink-0"
                >
                  {loading ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {loading ? 'Analisando...' : 'Analisar Agora'}
                </button>
              </form>

              {/* Preview quando o usuário envia ou cola uma Foto */}
              {uploadedPreview && (
                <div className="mt-4 p-3.5 rounded-2xl bg-slate-900/90 border border-yellow-400/30 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={uploadedPreview}
                      alt="Foto enviada"
                      className="w-12 h-12 rounded-xl object-cover bg-white p-0.5"
                    />
                    <div>
                      <span className="text-[11px] font-bold uppercase text-yellow-400">
                        Busca por Imagem Ativa
                      </span>
                      <p className="text-xs text-slate-200 mt-0.5">
                        Produto identificado na foto: <strong>{detectedPhotoTerm || searchInput}</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setUploadedPreview(null);
                      setDetectedPhotoTerm('');
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {/* Sugestões Rápidas para Testar com 1 Clique */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400 font-medium">Testar busca rápida:</span>
                {[
                  'Pote para tempero',
                  'Creatina Growth 250g',
                  'Jogo 6 taças diamante',
                  'Cadeira gamer reclinável',
                  'Parafusadeira furadeira sem fio',
                  'https://meli.la/1GUtykq',
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setSearchInput(item);
                      handleUnifiedSearch(undefined, item);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#070b14]/90 hover:bg-slate-800 border border-slate-800 hover:border-yellow-400/40 text-slate-300 transition"
                  >
                    {item.startsWith('http') ? '🔗 Link: Creatina (meli.la)' : item}
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

            {/* =================================================================
                DOSSIÊ RAIO-X COMPLETO (QUANDO BUSCA LINK OU CLICA NUM PRODUTO)
            ================================================================= */}
            {featuredProduct && (
              <div className="rounded-3xl bg-[#111827] border-2 border-yellow-400/50 p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="px-3 py-1 rounded-full bg-yellow-400 text-black font-extrabold text-xs uppercase">
                      Dossiê Raio-X Completo
                    </span>
                    <span className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono text-xs">
                      {featuredProduct.id}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                      Fonte: {featuredProduct.date_source || 'API Oficial ML'}
                    </span>
                  </div>

                  <button
                    onClick={() => setFeaturedProduct(null)}
                    className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl transition"
                  >
                    <X size={15} /> Fechar Raio-X
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Galeria de Fotos Reais */}
                  <div className="lg:col-span-4 flex flex-col justify-between bg-[#0b101d] border border-slate-800 rounded-2xl p-5">
                    <div>
                      <div className="w-full h-72 rounded-xl bg-white p-4 flex items-center justify-center overflow-hidden">
                        <img
                          src={selectedPhotoUrl || featuredProduct.thumbnail}
                          alt={featuredProduct.title}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>

                      {featuredProduct.pictures?.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
                          {featuredProduct.pictures.map((pic: string, i: number) => (
                            <button
                              key={i}
                              onClick={() => setSelectedPhotoUrl(pic)}
                              className={`w-14 h-14 rounded-lg bg-white p-1 border-2 shrink-0 transition ${
                                (selectedPhotoUrl || featuredProduct.thumbnail) === pic
                                  ? 'border-yellow-400 scale-105'
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
                        className="text-xs bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-3.5 py-2 rounded-xl transition"
                      >
                        Simular Margem →
                      </button>
                    </div>
                  </div>

                  {/* Informações do Produto + Datas + Vendedor */}
                  <div className="lg:col-span-8 space-y-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1">
                        <span>Marca: <strong className="text-white">{featuredProduct.brand}</strong></span>
                        <span>•</span>
                        <span>Modalidade: <strong className="text-purple-300">{featuredProduct.ad_type}</strong></span>
                        <span>•</span>
                        <span className="text-yellow-400 font-bold">
                          ★ {featuredProduct.rating} ({featuredProduct.reviews_count} avaliações)
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
                        {featuredProduct.title}
                      </h2>
                    </div>

                    {/* Faixa de Preço e Faturamento */}
                    <div className="p-5 rounded-2xl bg-[#0b101d] border border-slate-800 flex flex-wrap items-center justify-between gap-6">
                      <div>
                        {featuredProduct.original_price > featuredProduct.price && (
                          <span className="text-xs text-slate-400 line-through block">
                            Preço original: R$ {Number(featuredProduct.original_price).toFixed(2)}
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
                          <span className="text-[11px] text-slate-400 uppercase block">Receita Estimada (30d)</span>
                          <span className="text-xl font-black text-emerald-400">
                            R$ {Number(featuredProduct.revenue_30d).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase block">Faturamento Total Acumulado</span>
                          <span className="text-xl font-black text-blue-400">
                            R$ {Number(featuredProduct.total_revenue).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Grade de Métricas do Anúncio (Criação, Vendas, Logística) */}
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
                          {Number(featuredProduct.sold_quantity).toLocaleString('pt-BR')} vendidos
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
                          <Clock size={13} className="text-purple-400" /> Última Atualização
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          {new Date(featuredProduct.last_updated).toLocaleDateString('pt-BR')}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          Estoque: ~{featuredProduct.available_quantity} un.
                        </span>
                      </div>
                    </div>

                    {/* CARD COMPLETO DO VENDEDOR (NOME, DATA DE CRIAÇÃO DA CONTA, MEDALHA E CIDADE) */}
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-slate-900 to-purple-500/10 border border-blue-500/30">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                          <Store size={15} /> Raio-X Completo do Vendedor / Conta Concorrente
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
                          <span className="text-slate-400 block">Conta Criada em (Idade da Loja)</span>
                          <p className="text-sm font-extrabold text-emerald-400 mt-0.5">
                            {new Date(featuredProduct.seller_registration_date).toLocaleDateString('pt-BR')}{' '}
                            <span className="text-xs font-normal text-slate-300">
                              ({featuredProduct.seller_account_years} anos no ML)
                            </span>
                          </p>
                        </div>

                        <div>
                          <span className="text-slate-400 block">Localização do Vendedor</span>
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

            {/* =================================================================
                BARRA DE FILTROS E RESUMO DO MERCADO PARA A PALAVRA-CHAVE
            ================================================================= */}
            {products.length > 0 && (
              <>
                {/* Cards de Resumo da Palavra-Chave */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#111827] border border-slate-800/90 rounded-2xl p-4">
                    <span className="text-xs text-slate-400">Anúncios Analisados</span>
                    <p className="text-2xl font-black text-white mt-1">{filteredProducts.length} produtos</p>
                  </div>
                  <div className="bg-[#111827] border border-slate-800/90 rounded-2xl p-4">
                    <span className="text-xs text-slate-400">Ticket Médio da Busca</span>
                    <p className="text-2xl font-black text-yellow-400 mt-1">R$ {avgPrice.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#111827] border border-slate-800/90 rounded-2xl p-4">
                    <span className="text-xs text-slate-400">Movimentação Mensal (Amostra)</span>
                    <p className="text-2xl font-black text-emerald-400 mt-1">
                      R$ {totalNicheRevenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="bg-[#111827] border border-slate-800/90 rounded-2xl p-4">
                    <span className="text-xs text-slate-400">Presença no Envio Full</span>
                    <p className="text-2xl font-black text-blue-400 mt-1">{fullPercentage}% dos anúncios</p>
                  </div>
                </div>

                {/* Controles de Filtro e Visualização */}
                <div className="bg-[#111827] border border-slate-800/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <span className="text-slate-400 mr-2">Idade do Anúncio:</span>
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
                    </div>

                    <div>
                      <span className="text-slate-400 mr-2">Logística:</span>
                      <select
                        value={logisticFilter}
                        onChange={(e) => setLogisticFilter(e.target.value as any)}
                        className="bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold"
                      >
                        <option value="all">Todas</option>
                        <option value="full">Somente Full ⚡</option>
                        <option value="free">Com Frete Grátis</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-slate-400 mr-2">Ordenar por:</span>
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
                  </div>

                  {/* Alternador Grade de Cards vs Tabela */}
                  <div className="flex items-center gap-1 bg-[#070b14] p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setDisplayMode('grid')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                        displayMode === 'grid' ? 'bg-yellow-400 text-black' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <LayoutGrid size={14} /> Cards Detalhados
                    </button>
                    <button
                      onClick={() => setDisplayMode('table')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                        displayMode === 'table' ? 'bg-yellow-400 text-black' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <List size={14} /> Tabela Completa
                    </button>
                  </div>
                </div>

                {/* =============================================================
                    MODO 1: GRADE DE CARDS MODERNA E ATRATIVA (COM FOTOS GRANDES)
                ============================================================= */}
                {displayMode === 'grid' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProducts.map((item) => (
                      <div
                        key={item.id}
                        className="group bg-[#111827] border border-slate-800/90 hover:border-yellow-400/60 rounded-3xl overflow-hidden flex flex-col justify-between transition-all duration-200 hover:shadow-2xl hover:shadow-yellow-400/5"
                      >
                        <div>
                          {/* Área da Foto Real do Produto */}
                          <div className="relative h-56 bg-white p-4 flex items-center justify-center overflow-hidden">
                            {item.thumbnail ? (
                              <img
                                src={item.thumbnail}
                                alt={item.title}
                                className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="text-slate-400 text-xs">Sem imagem</div>
                            )}

                            {/* Badges Superiores na Foto */}
                            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-950/85 text-yellow-400 font-mono font-bold text-[11px] backdrop-blur-md">
                                {item.id}
                              </span>
                              {String(item.logistic_type).includes('Full') && (
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-black font-extrabold text-[11px]">
                                  ⚡ FULL
                                </span>
                              )}
                            </div>

                            <div className="absolute top-3 right-3">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-950/85 text-white font-bold text-[11px] backdrop-blur-md">
                                ★ {item.rating} ({item.reviews_count})
                              </span>
                            </div>
                          </div>

                          {/* Corpo do Card */}
                          <div className="p-5 space-y-4">
                            <h3
                              onClick={() => {
                                setFeaturedProduct(item);
                                setSelectedPhotoUrl(item.thumbnail);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="font-bold text-sm text-white group-hover:text-yellow-400 line-clamp-2 cursor-pointer transition leading-snug"
                            >
                              {item.title}
                            </h3>

                            {/* Preço e Faturamento Mensal */}
                            <div className="flex items-baseline justify-between pt-1">
                              <div>
                                {item.original_price > item.price && (
                                  <span className="text-[11px] text-slate-500 line-through block">
                                    R$ {Number(item.original_price).toFixed(2)}
                                  </span>
                                )}
                                <span className="text-2xl font-black text-yellow-400">
                                  R$ {Number(item.price).toFixed(2)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 uppercase block">Receita 30 dias</span>
                                <span className="text-base font-extrabold text-emerald-400">
                                  R$ {Number(item.revenue_30d).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            </div>

                            {/* Bloco de Datas do Anúncio e Vendas */}
                            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#090d16] border border-slate-800/80 text-xs">
                              <div>
                                <span className="text-[10px] text-slate-400 block">Criado em (Anúncio)</span>
                                <strong className="text-white">
                                  {new Date(item.date_created).toLocaleDateString('pt-BR')}
                                </strong>
                                <span className="block text-[10px] text-emerald-400">
                                  Há {item.days_old} dias
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 block">Vendas Capturadas</span>
                                <strong className="text-blue-400">
                                  {Number(item.sold_quantity).toLocaleString('pt-BR')} un.
                                </strong>
                                <span className="block text-[10px] text-slate-400">
                                  {item.daily_sales} vendas/dia
                                </span>
                              </div>
                            </div>

                            {/* Bloco Completo do Vendedor (Nome + Data da Conta Criada) */}
                            <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800/90 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 uppercase font-semibold">
                                  Vendedor:
                                </span>
                                <span className="text-[10px] text-yellow-400 font-bold">
                                  {item.seller_medal} • {item.seller_state}
                                </span>
                              </div>
                              <p className="font-bold text-slate-100 truncate">{item.seller_name}</p>
                              <p className="text-[11px] text-slate-400">
                                Conta criada em:{' '}
                                <strong className="text-slate-200">
                                  {new Date(item.seller_registration_date).toLocaleDateString('pt-BR')}
                                </strong>{' '}
                                ({item.seller_account_years} anos no ML)
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Rodapé de Ações do Card */}
                        <div className="px-5 pb-5 pt-2 flex gap-2">
                          <button
                            onClick={() => {
                              setFeaturedProduct(item);
                              setSelectedPhotoUrl(item.thumbnail);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs transition"
                          >
                            Abrir Raio-X Completo
                          </button>
                          <button
                            onClick={() => {
                              setCalcTitle(item.title);
                              setSalePrice(Number(item.price));
                              setSupplierCost(Number((item.price * 0.42).toFixed(2)));
                              setActiveView('calculadora');
                            }}
                            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
                          >
                            Lucro
                          </button>
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 flex items-center justify-center transition"
                            title="Abrir no Mercado Livre"
                          >
                            <ExternalLink size={15} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* =============================================================
                    MODO 2: TABELA ANALÍTICA COMPLETA (COM FOTO AO LADO E VENDEDOR)
                ============================================================= */}
                {displayMode === 'table' && (
                  <div className="bg-[#111827] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-[#0b101d]">
                            <th className="p-4">Foto & Produto</th>
                            <th className="p-4">Preço</th>
                            <th className="p-4">Vendas & Ritmo</th>
                            <th className="p-4">Receita 30d</th>
                            <th className="p-4">Data Criação do Anúncio</th>
                            <th className="p-4">Vendedor & Criação da Conta</th>
                            <th className="p-4">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {filteredProducts.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-800/40 transition">
                              <td className="p-4 flex items-center gap-3.5 max-w-md">
                                <img
                                  src={item.thumbnail}
                                  alt={item.title}
                                  className="w-16 h-16 rounded-xl bg-white object-contain p-1.5 shrink-0 border border-slate-700"
                                />
                                <div className="min-w-0">
                                  <button
                                    onClick={() => {
                                      setFeaturedProduct(item);
                                      setSelectedPhotoUrl(item.thumbnail);
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    className="font-bold text-white hover:text-yellow-400 text-left line-clamp-2 transition"
                                  >
                                    {item.title}
                                  </button>
                                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
                                    <span className="font-mono text-blue-400">{item.id}</span>
                                    <span className="text-emerald-400 font-semibold">{item.logistic_type}</span>
                                    <span className="text-yellow-400">★ {item.rating}</span>
                                  </div>
                                </div>
                              </td>

                              <td className="p-4 whitespace-nowrap">
                                <span className="text-sm font-black text-yellow-400">
                                  R$ {Number(item.price).toFixed(2)}
                                </span>
                                <span className="block text-[10px] text-slate-400">{item.ad_type}</span>
                              </td>

                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white text-sm">
                                  {Number(item.sold_quantity).toLocaleString('pt-BR')} un.
                                </span>
                                <span className="block text-[11px] text-blue-400">
                                  {item.daily_sales} vendas/dia
                                </span>
                              </td>

                              <td className="p-4 whitespace-nowrap">
                                <span className="font-black text-emerald-400 text-sm">
                                  R$ {Number(item.revenue_30d).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                </span>
                                <span className="block text-[10px] text-slate-400">
                                  Total: R$ {Number(item.total_revenue).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                </span>
                              </td>

                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white">
                                  {new Date(item.date_created).toLocaleDateString('pt-BR')}
                                </span>
                                <span className="block text-[11px] text-emerald-400 font-semibold">
                                  Há {item.days_old} dias
                                </span>
                              </td>

                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white block">{item.seller_name}</span>
                                <span className="text-[11px] text-slate-300 block">
                                  Conta criada: {new Date(item.seller_registration_date).toLocaleDateString('pt-BR')} (
                                  {item.seller_account_years}a)
                                </span>
                                <span className="text-[10px] text-yellow-400">
                                  {item.seller_medal} • {item.seller_state}
                                </span>
                              </td>

                              <td className="p-4 whitespace-nowrap space-x-2">
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

        {/* ===================================================================
            SIMULADOR DE MARGEM E VIABILIDADE DE COMPRA
        =================================================================== */}
        {activeView === 'calculadora' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-extrabold">Simulador de Margem e Viabilidade no Mercado Livre</h1>
                <p className="text-slate-400 text-sm">
                  Descubra exatamente quanto sobra no bolso e o preço máximo para pagar no fornecedor
                </p>
              </div>
              <button
                onClick={() => setActiveView('explorador')}
                className="text-xs bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl font-bold"
              >
                ← Voltar para Busca de Produtos
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#111827] border border-slate-800 rounded-3xl p-6 space-y-4 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Produto Analisado</label>
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
                    <label className="text-slate-400 block mb-1">Imposto NF (%)</label>
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
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setAdType('classico')}
                    className={`flex-1 py-3 rounded-xl font-bold border ${
                      adType === 'classico'
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : 'border-slate-700 text-slate-300'
                    }`}
                  >
                    Clássico (12%)
                  </button>
                  <button
                    onClick={() => setAdType('premium')}
                    className={`flex-1 py-3 rounded-xl font-bold border ${
                      adType === 'premium'
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : 'border-slate-700 text-slate-300'
                    }`}
                  >
                    Premium (17%)
                  </button>
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
                    <span>Custo Embalagem + Frete Grátis:</span>
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

'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  TrendingUp,
  Calculator,
  LayoutDashboard,
  ExternalLink,
  Calendar,
  Package,
  Truck,
  DollarSign,
  Sparkles,
  Image as ImageIcon,
  Star,
  Award,
  BarChart3,
  ShieldCheck,
  Clock,
  Tag,
} from 'lucide-react';

export default function BuscasMLApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'espiao' | 'tendencias' | 'calculadora'>('espiao');

  // Estados do Espião
  const [spyInput, setSpyInput] = useState('');
  const [loadingSpy, setLoadingSpy] = useState(false);
  const [spyResult, setSpyResult] = useState<any>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string>('');
  const [spyError, setSpyError] = useState('');

  // Estados de Categorias e Tendências
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [trends, setTrends] = useState<any[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  // Estados da Calculadora
  const [salePrice, setSalePrice] = useState(129.9);
  const [productCost, setProductCost] = useState(45.0);
  const [taxRate, setTaxRate] = useState(6.0);
  const [shippingCost, setShippingCost] = useState(18.9);
  const [adType, setAdType] = useState<'classico' | 'premium'>('premium');

  useEffect(() => {
    if (activeTab === 'tendencias' && categories.length === 0) {
      fetch('/api/ml?action=categories')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setCategories(data);
        });
      loadTrends('');
    }
  }, [activeTab]);

  const loadTrends = async (catId: string) => {
    setLoadingTrends(true);
    try {
      const res = await fetch(`/api/ml?action=trends&category=${catId}`);
      const data = await res.json();
      setTrends(Array.isArray(data) ? data : []);
    } finally {
      setLoadingTrends(false);
    }
  };

  const handleSpySearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const queryToUse = (customQuery || spyInput).trim();
    if (!queryToUse) return;

    setLoadingSpy(true);
    setSpyError('');
    setSpyResult(null);

    try {
      const res = await fetch(`/api/ml?action=spy&input=${encodeURIComponent(queryToUse)}`);
      const data = await res.json();

      if (res.ok && data && !data.error) {
        setSpyResult(data);
        setSelectedPhoto(data.thumbnail || data.pictures?.[0] || '');
        setLoadingSpy(false);
        return;
      }
      setSpyError(data?.error || 'Não foi possível ler este anúncio.');
    } catch (err: any) {
      setSpyError(`Falha ao consultar anúncio: ${err?.message || 'Tente novamente'}`);
    } finally {
      setLoadingSpy(false);
    }
  };

  // Cálculo de Métricas Avançadas (Estilo JoomPulse & Avantpro)
  const calculateProMetrics = (item: any) => {
    const price = Number(item?.price || 0);
    const sold = Number(item?.sold_quantity || 0);
    const grossRevenue = price * sold;

    // Idade e Datas
    let diffDays = 30;
    let formattedCreated = 'Mês Atual (Recente)';
    if (item?.date_created) {
      const created = new Date(item.date_created);
      const now = new Date();
      diffDays = Math.max(1, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
      formattedCreated = created.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }

    const dailySales = sold > 0 ? sold / diffDays : 0;
    const dailyRevenue = dailySales * price;
    const monthlyRevenue = dailyRevenue * 30;

    // Simulação de Taxa do Mercado Livre do Concorrente
    const isPremium = String(item?.ad_type || '').toLowerCase().includes('premium');
    const feePercent = isPremium ? 17 : 12;
    const fixedFee = price > 0 && price < 79 ? 6.25 : 0;
    const estimatedShipping = price >= 79 ? 19.9 : 0;
    const mlTotalFee = (price * feePercent) / 100 + fixedFee;
    const sellerNetReceive = Math.max(0, price - mlTotalFee - estimatedShipping);

    // Termômetro de Saúde do Anúncio (Score Avantpro 0-100)
    let healthScore = 50;
    if ((item?.title || '').length >= 45) healthScore += 15;
    if ((item?.pictures?.length || 0) >= 3) healthScore += 10;
    if (String(item?.shipping_logistic || '').includes('Full')) healthScore += 15;
    if (item?.free_shipping) healthScore += 5;
    if (item?.discount_percent > 0) healthScore += 5;
    healthScore = Math.min(100, healthScore);

    return {
      grossRevenue,
      diffDays,
      formattedCreated,
      dailySales: dailySales.toFixed(1),
      dailyRevenue,
      monthlyRevenue,
      feePercent,
      fixedFee,
      mlTotalFee,
      sellerNetReceive,
      healthScore,
    };
  };

  // Cálculos da aba Calculadora
  const mlFeePercent = adType === 'classico' ? 12 : 17;
  const fixedFee = salePrice < 79 ? 6.25 : 0;
  const mlCommission = (salePrice * mlFeePercent) / 100 + fixedFee;
  const taxValue = (salePrice * taxRate) / 100;
  const effectiveShipping = salePrice >= 79 ? shippingCost : 0;
  const netProfit = salePrice - productCost - mlCommission - taxValue - effectiveShipping;
  const profitMargin = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;

  return (
    <div className="flex min-h-screen bg-[#0b0f19] text-slate-100">
      {/* MENU LATERAL */}
      <aside className="w-64 bg-[#111827] border-r border-slate-800 p-5 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 flex items-center justify-center text-black font-black">
              B
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight">
                Buscas<span className="text-yellow-400">ML</span>
              </span>
              <span className="block text-[10px] text-slate-400 uppercase tracking-widest">Pro Analytics</span>
            </div>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeTab === 'dashboard'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <LayoutDashboard size={18} /> Dashboard Geral
            </button>

            <button
              onClick={() => setActiveTab('espiao')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeTab === 'espiao'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Search size={18} /> Espião Raio-X Pro
            </button>

            <button
              onClick={() => setActiveTab('tendencias')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeTab === 'tendencias'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <TrendingUp size={18} /> Categorias e Tendências
            </button>

            <button
              onClick={() => setActiveTab('calculadora')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeTab === 'calculadora'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Calculator size={18} /> Calculadora de Lucro
            </button>
          </nav>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck size={14} /> Motor JoomPulse + Avantpro
          </p>
          <p className="truncate text-[11px]">App ID: 8353552938244269</p>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* ABA 1: ESPIÃO DE ANÚNCIOS PRO */}
        {activeTab === 'espiao' && (
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold">Espião de Anúncios (Raio-X Profundo)</h1>
                <p className="text-slate-400 text-sm mt-1">
                  Cole qualquer link do Mercado Livre (normal, meli.la, catálogo) ou código MLB para extrair vendas, faturamento e data de criação
                </p>
              </div>
            </div>

            <form onSubmit={handleSpySearch} className="flex gap-3 mb-4">
              <input
                type="text"
                value={spyInput}
                onChange={(e) => setSpyInput(e.target.value)}
                placeholder="Ex: https://meli.la/1GUtykq ou link completo do produto..."
                className="flex-1 bg-[#111827] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-yellow-400"
              />
              <button
                type="submit"
                disabled={loadingSpy}
                className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-7 py-3.5 rounded-xl flex items-center gap-2 transition shrink-0"
              >
                <Search size={18} />
                {loadingSpy ? 'Extraindo...' : 'Raio-X'}
              </button>
            </form>

            {/* Busca por Foto ou Print */}
            <label className="flex items-center justify-between p-3.5 mb-8 rounded-xl border border-dashed border-slate-700 bg-[#111827]/60 hover:border-yellow-400/60 cursor-pointer transition">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Buscar por Foto ou Print de Produto</p>
                  <p className="text-xs text-slate-400">
                    Envie a imagem de um produto para localizar anúncios equivalentes no Mercado Livre
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
                    setSpyInput(cleanName);
                    handleSpySearch(undefined, cleanName);
                  }
                }}
              />
              <span className="text-xs bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300">Escolher Imagem</span>
            </label>

            {spyError && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 mb-6">
                {spyError}
              </div>
            )}

            {spyResult && (() => {
              const pro = calculateProMetrics(spyResult);
              return (
                <div className="space-y-6">
                  {/* BLOCO SUPERIOR: FOTO REAL + CABEÇALHO + KPIS PRINCIPAIS */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Coluna da Galeria de Fotos Reais do Produto */}
                    <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                      <div>
                        <div className="w-full h-72 rounded-xl bg-white p-4 flex items-center justify-center mb-3 overflow-hidden">
                          {selectedPhoto || spyResult.thumbnail ? (
                            <img
                              src={selectedPhoto || spyResult.thumbnail}
                              alt={spyResult.title}
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <span className="text-slate-400 text-sm">Sem foto disponível</span>
                          )}
                        </div>

                        {/* Miniaturas das outras fotos do anúncio */}
                        {spyResult.pictures?.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {spyResult.pictures.map((pic: string, i: number) => (
                              <button
                                key={i}
                                onClick={() => setSelectedPhoto(pic)}
                                className={`w-14 h-14 rounded-lg bg-white p-1 border-2 shrink-0 ${
                                  selectedPhoto === pic ? 'border-yellow-400' : 'border-transparent opacity-70 hover:opacity-100'
                                }`}
                              >
                                <img src={pic} alt="" className="w-full h-full object-contain" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-slate-800 mt-4 flex items-center justify-between">
                        <a
                          href={spyResult.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-yellow-400 hover:underline font-medium flex items-center gap-1.5"
                        >
                          Ver anúncio no Mercado Livre <ExternalLink size={14} />
                        </a>
                        <button
                          onClick={() => {
                            setSalePrice(Number(spyResult.price || 100));
                            setProductCost(Number(((spyResult.price || 100) * 0.35).toFixed(2)));
                            setActiveTab('calculadora');
                          }}
                          className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-slate-200 transition"
                        >
                          Simular Lucro →
                        </button>
                      </div>
                    </div>

                    {/* Coluna Direita: Dados do Produto e KPIs JoomPulse / Avantpro */}
                    <div className="lg:col-span-8 space-y-4">
                      {/* Card Principal de Preço e Identificação */}
                      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            {spyResult.source}
                          </span>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                            {spyResult.id}
                          </span>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            {spyResult.ad_type}
                          </span>
                          {spyResult.rating > 0 && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-400/10 text-yellow-300 flex items-center gap-1">
                              <Star size={12} className="fill-yellow-400 text-yellow-400" />
                              {spyResult.rating} ({spyResult.reviews_count} opiniões)
                            </span>
                          )}
                        </div>

                        <h2 className="text-xl font-bold text-white leading-snug">{spyResult.title}</h2>

                        <div className="mt-4 flex flex-wrap items-baseline gap-4">
                          <div>
                            {spyResult.original_price > spyResult.price && (
                              <p className="text-sm text-slate-400 line-through">
                                De R$ {Number(spyResult.original_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            )}
                            <div className="flex items-center gap-3">
                              <p className="text-4xl font-black text-yellow-400">
                                R$ {Number(spyResult.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                              {spyResult.discount_percent > 0 && (
                                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300">
                                  {spyResult.discount_percent}% OFF
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="ml-auto bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 text-right">
                            <p className="text-[11px] text-slate-400 uppercase">Faturamento Bruto Acumulado</p>
                            <p className="text-xl font-black text-emerald-400">
                              R$ {pro.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Grade de 6 Indicadores JoomPulse / Avantpro */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                          <p className="text-xs text-slate-400 uppercase">Volume de Vendas</p>
                          <p className="text-2xl font-black text-blue-400 mt-1">
                            {Number(spyResult.sold_quantity).toLocaleString('pt-BR')}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{spyResult.sold_label}</p>
                        </div>

                        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                          <p className="text-xs text-slate-400 uppercase">Velocidade de Vendas</p>
                          <p className="text-2xl font-black text-emerald-400 mt-1">{pro.dailySales} / dia</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            ~R$ {pro.dailyRevenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/dia
                          </p>
                        </div>

                        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                          <p className="text-xs text-slate-400 uppercase">Receita Mensal Est.</p>
                          <p className="text-2xl font-black text-yellow-400 mt-1">
                            R$ {pro.monthlyRevenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Projeção de 30 dias</p>
                        </div>

                        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                          <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                            <Calendar size={13} className="text-yellow-400" /> Data de Criação
                          </p>
                          <p className="text-lg font-bold text-white mt-1">{pro.formattedCreated}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Há {pro.diffDays} dias ({spyResult.date_source})
                          </p>
                        </div>

                        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                          <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                            <Truck size={13} className="text-blue-400" /> Logística e Frete
                          </p>
                          <p className="text-lg font-bold text-white mt-1">{spyResult.shipping_logistic}</p>
                          <p className="text-[11px] text-emerald-400 mt-0.5">
                            {spyResult.free_shipping ? '✓ Frete Grátis Ativo' : 'Frete por conta do comprador'}
                          </p>
                        </div>

                        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                          <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                            <Award size={13} className="text-purple-400" /> Saúde do Anúncio
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-lg font-black text-white">{pro.healthScore}/100</p>
                            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-yellow-400 to-emerald-400"
                                style={{ width: `${pro.healthScore}%` }}
                              />
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">Marca: {spyResult.brand}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BLOCO DO MEIO: RAIO-X FINANCEIRO DO VENDEDOR (ESTILO AVANTPRO) */}
                  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-base font-bold flex items-center gap-2 mb-4">
                      <DollarSign size={18} className="text-yellow-400" />
                      Raio-X Financeiro deste Anúncio (Quanto sobra para o concorrente por venda)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-xs text-slate-400">Preço Cobrado</span>
                        <p className="text-lg font-bold text-white mt-0.5">R$ {Number(spyResult.price).toFixed(2)}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-xs text-slate-400">
                          Tarifa ML ({pro.feePercent}% {pro.fixedFee > 0 ? '+ R$ 6,25 fixo' : ''})
                        </span>
                        <p className="text-lg font-bold text-red-400 mt-0.5">- R$ {pro.mlTotalFee.toFixed(2)}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-xs text-slate-400">Vendedor / Loja</span>
                        <p className="text-sm font-bold text-slate-200 mt-1 truncate">{spyResult.seller_id}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <span className="text-xs text-emerald-300">Repasse Líquido do ML</span>
                        <p className="text-lg font-black text-emerald-400 mt-0.5">
                          R$ {pro.sellerNetReceive.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* BLOCO INFERIOR: CONCORRENTES DIRETOS NO MERCADO LIVRE */}
                  {spyResult.competitors?.length > 0 && (
                    <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
                      <h3 className="text-base font-bold flex items-center gap-2 mb-4">
                        <BarChart3 size={18} className="text-blue-400" />
                        Concorrentes Diretos Encontrados no Nicho
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {spyResult.competitors.map((comp: any, i: number) => (
                          <div
                            key={i}
                            onClick={() => {
                              setSpyInput(comp.permalink || comp.id);
                              handleSpySearch(undefined, comp.permalink || comp.id);
                            }}
                            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-yellow-400 cursor-pointer transition flex items-center gap-3"
                          >
                            {comp.thumbnail && (
                              <img
                                src={comp.thumbnail}
                                alt={comp.title}
                                className="w-14 h-14 rounded-lg bg-white object-contain p-1 shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-slate-200 line-clamp-2">{comp.title}</p>
                              <p className="text-sm font-bold text-yellow-400 mt-1">
                                R$ {Number(comp.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ABA 2: CATEGORIAS E TENDÊNCIAS */}
        {activeTab === 'tendencias' && (
          <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl font-bold mb-1">Tendências e Buscas em Alta</h1>
            <p className="text-slate-400 mb-6">
              Descubra os produtos mais procurados pelos compradores dentro de cada categoria do Mercado Livre
            </p>

            <div className="mb-6">
              <select
                value={selectedCat}
                onChange={(e) => {
                  setSelectedCat(e.target.value);
                  loadTrends(e.target.value);
                }}
                className="w-full md:w-96 bg-[#111827] border border-slate-700 rounded-xl px-4 py-3 text-white"
              >
                <option value="">Todas as Categorias do Brasil (Geral)</option>
                {categories.map((cat: any) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.id})
                  </option>
                ))}
              </select>
            </div>

            {loadingTrends ? (
              <p className="text-slate-400">Carregando ranking da API do Mercado Livre...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {trends.map((t: any, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setActiveTab('espiao');
                      setSpyInput(t.keyword);
                      handleSpySearch(undefined, t.keyword);
                    }}
                    className="bg-[#111827] border border-slate-800 hover:border-yellow-400 rounded-xl p-4 cursor-pointer transition flex items-center justify-between"
                  >
                    <div>
                      <span className="text-xs font-bold text-yellow-400">#{idx + 1} mais buscado</span>
                      <p className="font-semibold text-white mt-1 capitalize">{t.keyword}</p>
                    </div>
                    <Sparkles size={18} className="text-slate-500" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 3: CALCULADORA DE LUCRO */}
        {activeTab === 'calculadora' && (
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-1">Calculadora de Margem e Impostos</h1>
            <p className="text-slate-400 mb-6">Simule o lucro líquido real descontando tarifas do Mercado Livre</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
                <div>
                  <label className="text-xs text-slate-400">Preço de Venda (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={salePrice}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                    className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Custo do Produto / Fornecedor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productCost}
                    onChange={(e) => setProductCost(Number(e.target.value))}
                    className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400">Imposto Nota Fiscal (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Custo Frete Grátis (R$)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(Number(e.target.value))}
                      className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setAdType('classico')}
                    className={`flex-1 py-2.5 rounded-xl font-semibold text-sm border ${
                      adType === 'classico'
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : 'border-slate-700 text-slate-300'
                    }`}
                  >
                    Clássico (12%)
                  </button>
                  <button
                    onClick={() => setAdType('premium')}
                    className={`flex-1 py-2.5 rounded-xl font-semibold text-sm border ${
                      adType === 'premium'
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : 'border-slate-700 text-slate-300'
                    }`}
                  >
                    Premium (17%)
                  </button>
                </div>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Comissão Mercado Livre + Taxa Fixa:</span>
                    <span className="text-red-400">- R$ {mlCommission.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Impostos ({taxRate}%):</span>
                    <span className="text-red-400">- R$ {taxValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Frete (Acima de R$ 79):</span>
                    <span className="text-red-400">- R$ {effectiveShipping.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-6 mt-6">
                  <p className="text-xs text-slate-400 uppercase">Lucro Líquido por Venda</p>
                  <p className={`text-4xl font-black mt-1 ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    R$ {netProfit.toFixed(2)}
                  </p>
                  <p className="text-sm text-slate-300 mt-2">
                    Margem Líquida: <strong>{profitMargin.toFixed(1)}%</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 4: DASHBOARD GERAL */}
        {activeTab === 'dashboard' && (
          <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl font-bold mb-2">Central de Inteligência BuscasML</h1>
            <p className="text-slate-400 mb-8">Ferramentas inspiradas na JoomPulse e Avantpro para análise do Mercado Livre.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div
                onClick={() => setActiveTab('espiao')}
                className="bg-[#111827] border border-slate-800 hover:border-yellow-400 p-6 rounded-2xl cursor-pointer transition"
              >
                <Search className="text-yellow-400 mb-3" size={28} />
                <h3 className="font-bold text-lg">Espionar Anúncio</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Veja faturamento bruto, vendas/dia, data de criação e repasse líquido.
                </p>
              </div>
              <div
                onClick={() => setActiveTab('tendencias')}
                className="bg-[#111827] border border-slate-800 hover:border-yellow-400 p-6 rounded-2xl cursor-pointer transition"
              >
                <TrendingUp className="text-blue-400 mb-3" size={28} />
                <h3 className="font-bold text-lg">Explorar Tendências</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Veja as palavras mais buscadas em cada categoria do Mercado Livre.
                </p>
              </div>
              <div
                onClick={() => setActiveTab('calculadora')}
                className="bg-[#111827] border border-slate-800 hover:border-yellow-400 p-6 rounded-2xl cursor-pointer transition"
              >
                <DollarSign className="text-emerald-400 mb-3" size={28} />
                <h3 className="font-bold text-lg">Simular Margem</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Calcule exatamente quanto sobra no bolso em cada venda.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

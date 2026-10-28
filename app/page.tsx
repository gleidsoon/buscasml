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
} from 'lucide-react';

export default function BuscasMLApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'espiao' | 'tendencias' | 'calculadora'>('espiao');

  // Estados do Espião
  const [spyInput, setSpyInput] = useState('');
  const [loadingSpy, setLoadingSpy] = useState(false);
  const [spyResult, setSpyResult] = useState<any>(null);
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

  // Carrega categorias ao abrir a aba de tendências
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
    const queryToUse = customQuery || spyInput;
    if (!queryToUse.trim()) return;

    setLoadingSpy(true);
    setSpyError('');
    setSpyResult(null);

    try {
      const res = await fetch(`/api/ml?action=spy&input=${encodeURIComponent(queryToUse)}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setSpyError(data.error || 'Erro ao consultar anúncio.');
      } else {
        setSpyResult(data);
      }
    } catch {
      setSpyError('Falha de comunicação com o servidor.');
    } finally {
      setLoadingSpy(false);
    }
  };

  // Cálculo de Idade do Anúncio e Média Diária
  const calculateMetrics = (item: any) => {
    if (!item?.date_created) {
      return { daysOld: null, dailySales: '—', formattedDate: 'Estimada via Catálogo' };
    }
    const created = new Date(item.date_created);
    const now = new Date();
    const diffDays = Math.max(1, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
    const daily = item.sold_quantity ? (item.sold_quantity / diffDays).toFixed(2) : '0.00';
    return {
      daysOld: `${diffDays} dias`,
      dailySales: `${daily} / dia`,
      formattedDate: created.toLocaleDateString('pt-BR'),
    };
  };

  // Cálculos da Calculadora de Lucro
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
      <aside className="w-64 bg-[#111827] border-r border-slate-800 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 flex items-center justify-center text-black font-black">
              B
            </div>
            <span className="text-xl font-bold tracking-tight">
              Buscas<span className="text-yellow-400">ML</span>
            </span>
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
              <Search size={18} /> Espião de Anúncios
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

        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
          <p className="font-semibold text-emerald-400">● API Mercado Livre Ativa</p>
          <p className="mt-1 truncate">App ID: 8353552938244269</p>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* ABA 1: ESPIÃO DE ANÚNCIOS */}
        {activeTab === 'espiao' && (
          <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl font-bold mb-1">Espião de Anúncios (Raio-X)</h1>
            <p className="text-slate-400 mb-6">
              Cole qualquer link do Mercado Livre (normal, meli.la, catálogo) ou digite o nome do produto
            </p>

            <form onSubmit={handleSpySearch} className="flex gap-3 mb-6">
              <input
                type="text"
                value={spyInput}
                onChange={(e) => setSpyInput(e.target.value)}
                placeholder="Cole o link do anúncio, código MLB ou nome do produto (ex: Cadeira Gamer)..."
                className="flex-1 bg-[#111827] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-yellow-400"
              />
              <button
                type="submit"
                disabled={loadingSpy}
                className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-6 py-3.5 rounded-xl flex items-center gap-2 transition"
              >
                <Search size={18} />
                {loadingSpy ? 'Analisando...' : 'Raio-X'}
              </button>
            </form>

            {/* Upload de Foto / Print que extrai o nome e pesquisa */}
            <label className="flex items-center justify-between p-4 mb-8 rounded-xl border border-dashed border-slate-700 bg-[#111827]/60 hover:border-yellow-400/60 cursor-pointer transition">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
                  <ImageIcon size={22} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Buscar por Foto ou Print de Produto</p>
                  <p className="text-xs text-slate-400">
                    Envie a foto de um produto para localizar anúncios equivalentes no Mercado Livre
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
              const metrics = calculateMetrics(spyResult);
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Card da Foto */}
                  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 flex flex-col items-center">
                    {spyResult.thumbnail ? (
                      <img
                        src={spyResult.thumbnail}
                        alt={spyResult.title}
                        className="w-full h-64 object-contain rounded-xl bg-white p-2 mb-4"
                      />
                    ) : (
                      <div className="w-full h-64 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
                        Sem imagem
                      </div>
                    )}
                    <a
                      href={spyResult.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-blue-400 hover:underline flex items-center gap-1"
                    >
                      Abrir anúncio no Mercado Livre <ExternalLink size={14} />
                    </a>
                  </div>

                  {/* Card de Métricas */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Fonte: {spyResult.source}
                      </span>
                      <p className="text-xs text-slate-400 mt-3">{spyResult.id}</p>
                      <h2 className="text-xl font-bold mt-1">{spyResult.title}</h2>
                      <p className="text-3xl font-black text-yellow-400 mt-3">
                        R$ {Number(spyResult.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                        <p className="text-xs text-slate-400 uppercase">Vendas Capturadas</p>
                        <p className="text-2xl font-bold text-blue-400 mt-1">{spyResult.sold_quantity}</p>
                      </div>

                      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                        <p className="text-xs text-slate-400 uppercase">Média Vendas/Dia</p>
                        <p className="text-2xl font-bold text-emerald-400 mt-1">{metrics.dailySales}</p>
                      </div>

                      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                        <p className="text-xs text-slate-400 uppercase">Idade do Anúncio</p>
                        <p className="text-2xl font-bold text-white mt-1">{metrics.daysOld || 'Recente'}</p>
                      </div>

                      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                        <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                          <Calendar size={13} /> Criado em
                        </p>
                        <p className="text-lg font-semibold mt-1">{metrics.formattedDate}</p>
                      </div>

                      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                        <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                          <Truck size={13} /> Logística
                        </p>
                        <p className="text-lg font-semibold mt-1 capitalize">
                          {spyResult.shipping_logistic} {spyResult.free_shipping ? '• Grátis' : ''}
                        </p>
                      </div>

                      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                        <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                          <Package size={13} /> Estoque / Catálogo
                        </p>
                        <p className="text-lg font-semibold mt-1">{spyResult.available_quantity} un.</p>
                      </div>
                    </div>
                  </div>
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
            <h1 className="text-3xl font-bold mb-2">Bem-vindo ao BuscasML</h1>
            <p className="text-slate-400 mb-8">Sua central de inteligência para encontrar produtos campeões.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div
                onClick={() => setActiveTab('espiao')}
                className="bg-[#111827] border border-slate-800 hover:border-yellow-400 p-6 rounded-2xl cursor-pointer transition"
              >
                <Search className="text-yellow-400 mb-3" size={28} />
                <h3 className="font-bold text-lg">Espionar Concorrente</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Veja data de criação, vendas e preço de qualquer anúncio.
                </p>
              </div>
              <div
                onClick={() => setActiveTab('tendencias')}
                className="bg-[#111827] border border-slate-800 hover:border-yellow-400 p-6 rounded-2xl cursor-pointer transition"
              >
                <TrendingUp className="text-blue-400 mb-3" size={28} />
                <h3 className="font-bold text-lg">Explorar Tendências</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Veja o que os brasileiros estão digitando na barra de busca hoje.
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

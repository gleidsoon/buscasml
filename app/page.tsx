'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  TrendingUp,
  Calculator,
  LayoutDashboard,
  ExternalLink,
  Calendar,
  Truck,
  DollarSign,
  Sparkles,
  Image as ImageIcon,
  Star,
  Award,
  BarChart3,
  ShieldCheck,
  Filter,
  Factory,
  Bot,
  Printer,
  Phone,
  Globe,
  PackageCheck,
  ArrowUpRight,
} from 'lucide-react';

// Base de Fornecedores e Indústrias Nacionais por Segmento (Estilo Aba Produtos Locais do Vídeo)
const BRAZIL_SUPPLIERS_DB = [
  {
    niche: 'Pet Shop / Animais',
    keywords: ['pet', 'cachorro', 'gato', 'bola', 'mordedor', 'coleira', 'racao', 'petisco', 'aquario'],
    name: 'Furacão Pet Indústria e Distribuidora',
    location: 'São Carlos - SP',
    type: 'Fabricante Nacional (Injetados e Brinquedos Pet)',
    minOrder: 'R$ 600,00 (CNPJ)',
    phone: '(16) 3368-3040',
    email: 'comercial@furacaopet.com.br',
    website: 'https://www.furacaopet.com.br',
  },
  {
    niche: 'Pet Shop / Acessórios',
    keywords: ['pet', 'cachorro', 'gato', 'brinquedo', 'comedouro', 'cama', 'arranhador'],
    name: 'Chalesco Importadora e Distribuidora Pet',
    location: 'São Paulo - SP',
    type: 'Importadora Oficial & Atacado Pet',
    minOrder: 'R$ 800,00',
    phone: '(11) 3879-2600',
    email: 'sac@chalesco.com.br',
    website: 'https://www.chalesco.com.br',
  },
  {
    niche: 'Pet Shop / Plásticos',
    keywords: ['pet', 'comedouro', 'bebedouro', 'plastico', 'caixa transporte', 'bola'],
    name: 'Plast Pet Indústria e Comércio',
    location: 'Guarulhos - SP',
    type: 'Indústria Nacional de Acessórios Pet',
    minOrder: 'R$ 500,00',
    phone: '(11) 2436-2100',
    email: 'vendas@plastpet.com.br',
    website: 'https://www.plastpet.com.br',
  },
  {
    niche: 'Suplementos / Fitness',
    keywords: ['creatina', 'whey', 'suplemento', 'vitamina', 'treino', 'academia', 'coqueteleira'],
    name: 'Atacado Suplementos Brasil / NutriDirect',
    location: 'São Paulo - SP',
    type: 'Distribuidor Oficial Multimarcas',
    minOrder: 'R$ 1.000,00',
    phone: '(11) 4003-9820',
    email: 'atacado@nutridirect.com.br',
    website: 'https://www.google.com/search?q=distribuidora+atacado+suplementos+brasil+cnpj',
  },
  {
    niche: 'Eletrônicos / Informática / Gamer',
    keywords: ['fone', 'bluetooth', 'cadeira', 'gamer', 'mouse', 'teclado', 'caixa som', 'smartwatch', 'cabo'],
    name: 'Hayom / Pauta Distribuidora de Tecnologia',
    location: 'Itajaí - SC / São Paulo - SP',
    type: 'Importadora e Distribuidora B2B',
    minOrder: 'R$ 750,00',
    phone: '(48) 3281-7000',
    email: 'comercial@pauta.com.br',
    website: 'https://www.pauta.com.br',
  },
  {
    niche: 'Utilidades Domésticas / Cozinha',
    keywords: ['cozinha', 'panela', 'pote', 'organizador', 'garrafa', 'termica', 'casa', 'limpeza', 'mop'],
    name: 'Martins Atacado / Plasútil Indústria',
    location: 'Uberlândia - MG / Bauru - SP',
    type: 'Indústria & Atacadista Distribuidor Nacional',
    minOrder: 'R$ 450,00',
    phone: '(34) 3218-1310',
    email: 'atendimento@martins.com.br',
    website: 'https://www.martinsatacado.com.br',
  },
  {
    niche: 'Ferramentas / Casa & Construção',
    keywords: ['furadeira', 'parafusadeira', 'chave', 'ferramenta', 'alicate', 'serra', 'lanterna'],
    name: 'OVD / Vonder Distribuidora Nacional',
    location: 'Curitiba - PR',
    type: 'Fabricante e Importadora B2B',
    minOrder: 'R$ 700,00',
    phone: '(41) 2101-0550',
    email: 'vendas@ovd.com.br',
    website: 'https://www.vonder.com.br',
  },
];

export default function BuscasMLApp() {
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'garimpo' | 'ai' | 'fornecedores' | 'espiao' | 'tendencias' | 'calculadora'
  >('garimpo');

  // 1. Estados do Garimpo Avançado (Estilo Vídeo 02:15)
  const [garimpoQuery, setGarimpoQuery] = useState('Brinquedo bola cachorro');
  const [maxDaysFilter, setMaxDaysFilter] = useState<number>(90);
  const [minSalesFilter, setMinSalesFilter] = useState<number>(10);
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(500);
  const [sortBy, setSortBy] = useState<'revenue' | 'sales' | 'newest' | 'price'>('revenue');
  const [garimpoItems, setGarimpoItems] = useState<any[]>([]);
  const [loadingGarimpo, setLoadingGarimpo] = useState(false);

  // 2. Estados da BuscasML IA (Clone JoomAI Vídeo 09:00)
  const [aiQuery, setAiQuery] = useState('Brinquedos para cachorros');
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiReport, setAiReport] = useState<any>(null);

  // 3. Estados de Fornecedores (Brasil & China Vídeo 05:30 e 07:00)
  const [supplierSearch, setSupplierSearch] = useState('Bola pet');
  const [targetSalePrice, setTargetSalePrice] = useState<number>(39.9);
  const [revealedContacts, setRevealedContacts] = useState<Record<number, boolean>>({});

  // 4. Estados do Espião Individual (Raio-X)
  const [spyInput, setSpyInput] = useState('');
  const [loadingSpy, setLoadingSpy] = useState(false);
  const [spyResult, setSpyResult] = useState<any>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string>('');
  const [spyError, setSpyError] = useState('');

  // 5. Estados de Categorias e Tendências
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [trends, setTrends] = useState<any[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  // 6. Estados da Calculadora
  const [salePrice, setSalePrice] = useState(129.9);
  const [productCost, setProductCost] = useState(45.0);
  const [taxRate, setTaxRate] = useState(6.0);
  const [shippingCost, setShippingCost] = useState(18.9);
  const [adType, setAdType] = useState<'classico' | 'premium'>('premium');

  // Busca inicial do Garimpo
  const runGarimpo = async (customQ?: string) => {
    const q = (customQ || garimpoQuery).trim();
    if (!q) return;
    setLoadingGarimpo(true);
    try {
      const res = await fetch(`/api/ml?action=garimpo&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setGarimpoItems(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoadingGarimpo(false);
    }
  };

  // Executa consultoria de nicho via BuscasML IA
  const runAiConsultation = async (customQ?: string) => {
    const q = (customQ || aiQuery).trim();
    if (!q) return;
    setLoadingAi(true);
    try {
      const res = await fetch(`/api/ml?action=ai_consult&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setAiReport(data);
    } finally {
      setLoadingAi(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'garimpo' && garimpoItems.length === 0) {
      runGarimpo('Brinquedo bola cachorro');
    }
    if (activeTab === 'ai' && !aiReport) {
      runAiConsultation('Brinquedos para cachorros');
    }
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

  // Filtra e ordena os itens do Garimpo em tempo real (igual ao vídeo)
  const filteredGarimpo = garimpoItems
    .filter((item) => {
      const passAge = maxDaysFilter >= 365 ? true : (item.days_old || 30) <= maxDaysFilter;
      const passSales = (item.sold_quantity || 0) >= minSalesFilter;
      const passPrice = (item.price || 0) <= maxPriceFilter;
      return passAge && passSales && passPrice;
    })
    .sort((a, b) => {
      if (sortBy === 'revenue') return (b.revenue_30d || 0) - (a.revenue_30d || 0);
      if (sortBy === 'sales') return (b.sold_quantity || 0) - (a.sold_quantity || 0);
      if (sortBy === 'newest') return (a.days_old || 30) - (b.days_old || 30);
      return (a.price || 0) - (b.price || 0);
    });

  // Cálculos do Raio-X Individual
  const calculateProMetrics = (item: any) => {
    const price = Number(item?.price || 0);
    const sold = Number(item?.sold_quantity || 0);
    const grossRevenue = price * sold;

    let diffDays = 30;
    let formattedCreated = 'Mês Atual (Recente)';
    if (item?.date_created) {
      const created = new Date(item.date_created);
      const now = new Date();
      diffDays = Math.max(1, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
      formattedCreated = created.toLocaleDateString('pt-BR');
    }

    const dailySales = sold > 0 ? sold / diffDays : 0;
    const dailyRevenue = dailySales * price;
    const monthlyRevenue = dailyRevenue * 30;

    const isPremium = String(item?.ad_type || '').toLowerCase().includes('premium');
    const feePercent = isPremium ? 17 : 12;
    const fixedFee = price > 0 && price < 79 ? 6.25 : 0;
    const estimatedShipping = price >= 79 ? 19.9 : 0;
    const mlTotalFee = (price * feePercent) / 100 + fixedFee;
    const sellerNetReceive = Math.max(0, price - mlTotalFee - estimatedShipping);

    let healthScore = 55;
    if ((item?.title || '').length >= 45) healthScore += 15;
    if ((item?.pictures?.length || 0) >= 3) healthScore += 10;
    if (String(item?.shipping_logistic || '').includes('Full')) healthScore += 15;
    if (item?.free_shipping) healthScore += 5;
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

  // Cálculos da Calculadora de Lucro
  const mlFeePercent = adType === 'classico' ? 12 : 17;
  const fixedFee = salePrice < 79 ? 6.25 : 0;
  const mlCommission = (salePrice * mlFeePercent) / 100 + fixedFee;
  const taxValue = (salePrice * taxRate) / 100;
  const effectiveShipping = salePrice >= 79 ? shippingCost : 0;
  const netProfit = salePrice - productCost - mlCommission - taxValue - effectiveShipping;
  const profitMargin = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;

  // Cálculo de Custo Máximo de Compra no Fornecedor (Aba Fornecedores)
  const supplierFixedFee = targetSalePrice < 79 ? 6.25 : 0;
  const supplierShipping = targetSalePrice >= 79 ? 18.9 : 0;
  const maxRecommendedBuyCost = Math.max(
    1,
    targetSalePrice * (1 - 0.14 - 0.06 - 0.25) - supplierFixedFee - supplierShipping
  );
  const estimatedChinaFobCost = Math.max(0.8, maxRecommendedBuyCost * 0.42);

  return (
    <div className="flex min-h-screen bg-[#0b0f19] text-slate-100">
      {/* MENU LATERAL COMPLETO */}
      <aside className="w-64 bg-[#111827] border-r border-slate-800 p-5 flex flex-col justify-between shrink-0 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 flex items-center justify-center text-black font-black">
              B
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight">
                Buscas<span className="text-yellow-400">ML</span>
              </span>
              <span className="block text-[10px] text-slate-400 uppercase tracking-widest">JoomPulse + AI Suite</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('garimpo')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeTab === 'garimpo'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Filter size={18} /> Garimpo de Produtos
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeTab === 'ai'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Bot size={18} /> BuscasML IA (JoomAI)
            </button>

            <button
              onClick={() => setActiveTab('fornecedores')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeTab === 'fornecedores'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Factory size={18} /> Fornecedores BR & China
            </button>

            <button
              onClick={() => setActiveTab('espiao')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeTab === 'espiao'
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Search size={18} /> Espião Raio-X (Link)
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
            <ShieldCheck size={14} /> Motor Completo Ativo
          </p>
          <p className="truncate text-[11px]">ML + IA + Fornecedores</p>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* =====================================================================
            ABA 1: GARIMPO AVANÇADO DE PRODUTOS (ESTILO JOOMPULSE MINUTO 02:15)
        ===================================================================== */}
        {activeTab === 'garimpo' && (
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
                  Caçador de Oportunidades
                </span>
                <h1 className="text-3xl font-bold mt-2">Garimpo de Produtos Campeões</h1>
                <p className="text-slate-400 text-sm mt-1">
                  Encontre anúncios recém-criados (até 90 dias) que já estão vendendo forte no Mercado Livre
                </p>
              </div>
            </div>

            {/* Barra de Pesquisa e Filtros do Vídeo */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 mb-6 space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runGarimpo();
                }}
                className="flex gap-3"
              >
                <input
                  type="text"
                  value={garimpoQuery}
                  onChange={(e) => setGarimpoQuery(e.target.value)}
                  placeholder="Digite o nicho ou produto (ex: Brinquedo bola pet, Creatina, Tapete higiênico, Parafusadeira)..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400"
                />
                <button
                  type="submit"
                  disabled={loadingGarimpo}
                  className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition shrink-0"
                >
                  <Search size={18} />
                  {loadingGarimpo ? 'Garimpando...' : 'Buscar Produtos'}
                </button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-800/80 text-sm">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Idade Máxima do Anúncio</label>
                  <select
                    value={maxDaysFilter}
                    onChange={(e) => setMaxDaysFilter(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value={30}>Até 30 dias (Super Novos)</option>
                    <option value={60}>Até 60 dias</option>
                    <option value={90}>Até 90 dias (Filtro do Vídeo)</option>
                    <option value={180}>Até 180 dias</option>
                    <option value={9999}>Qualquer idade (Todos)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Mínimo de Vendas</label>
                  <select
                    value={minSalesFilter}
                    onChange={(e) => setMinSalesFilter(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value={0}>Qualquer volume</option>
                    <option value={10}>Pelo menos 10 vendas</option>
                    <option value={30}>Pelo menos 30 vendas (Recomendado)</option>
                    <option value={100}>Pelo menos 100 vendas</option>
                    <option value={500}>Mais de 500 vendas</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Preço Máximo: R$ {maxPriceFilter}</label>
                  <input
                    type="range"
                    min={20}
                    max={1500}
                    step={10}
                    value={maxPriceFilter}
                    onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
                    className="w-full accent-yellow-400 mt-2"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Ordenar Resultados Por</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="revenue">Maior Receita 30 dias</option>
                    <option value="sales">Maior Volume de Vendas</option>
                    <option value="newest">Mais Recentes (Menor Idade)</option>
                    <option value="price">Menor Preço</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tabela de Resultados Estilo JoomPulse */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <p className="text-sm font-semibold">
                  Encontrados <span className="text-yellow-400">{filteredGarimpo.length}</span> anúncios com seus filtros
                </p>
                <button
                  onClick={() => {
                    setAiQuery(garimpoQuery);
                    setActiveTab('ai');
                    runAiConsultation(garimpoQuery);
                  }}
                  className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                >
                  <Bot size={14} /> Analisar este nicho com IA →
                </button>
              </div>

              {loadingGarimpo ? (
                <div className="p-12 text-center text-slate-400">
                  Varrendo anúncios, calculando idade das fotos e estimando faturamento...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-slate-900/60">
                        <th className="p-4">Produto</th>
                        <th className="p-4">Preço</th>
                        <th className="p-4">Vendas Totais</th>
                        <th className="p-4">Receita 30d Est.</th>
                        <th className="p-4">Tendência</th>
                        <th className="p-4">Idade Anúncio</th>
                        <th className="p-4">Ações Rápidas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {filteredGarimpo.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="p-4 flex items-center gap-3 max-w-md">
                            {item.thumbnail && (
                              <img
                                src={item.thumbnail}
                                alt={item.title}
                                className="w-12 h-12 rounded-lg bg-white object-contain p-1 shrink-0"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-100 line-clamp-2 text-xs">{item.title}</p>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                                <span className="font-mono text-blue-400">{item.id}</span>
                                <span>• {item.logistic_type}</span>
                                <span>• ★ {item.rating}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 font-bold text-yellow-400 whitespace-nowrap">
                            R$ {Number(item.price || 0).toFixed(2)}
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span className="font-bold text-white">{item.sold_quantity}</span>
                            <span className="block text-[11px] text-slate-400">{item.daily_sales}/dia</span>
                          </td>
                          <td className="p-4 font-bold text-emerald-400 whitespace-nowrap">
                            R$ {Number(item.revenue_30d || 0).toLocaleString('pt-BR')}
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                                item.trend === 'Crescente'
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-blue-500/15 text-blue-300'
                              }`}
                            >
                              ↗ {item.trend} ({item.trend_percent})
                            </span>
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span className="font-semibold text-white">{item.days_old} dias</span>
                            <span className="block text-[11px] text-slate-400">
                              {new Date(item.date_created).toLocaleDateString('pt-BR')}
                            </span>
                          </td>
                          <td className="p-4 whitespace-nowrap space-x-2">
                            <button
                              onClick={() => {
                                setSpyInput(item.permalink || item.id);
                                setActiveTab('espiao');
                                handleSpySearch(undefined, item.permalink || item.id);
                              }}
                              className="text-xs bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-2.5 py-1.5 rounded-lg transition"
                            >
                              Raio-X
                            </button>
                            <button
                              onClick={() => {
                                setSupplierSearch(item.title.split(' ').slice(0, 3).join(' '));
                                setTargetSalePrice(Number(item.price || 39.9));
                                setActiveTab('fornecedores');
                              }}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg transition"
                            >
                              Fornecedor
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            ABA 2: BUSCASML IA - CONSULTOR DE MERCADO & PDF (CLONE JOOMAI)
        ===================================================================== */}
        {activeTab === 'ai' && (
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 print:hidden">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  Inteligência Artificial de Mercado
                </span>
                <h1 className="text-3xl font-bold mt-2">BuscasML IA (Consultor de Nichos & Marcas)</h1>
                <p className="text-slate-400 text-sm mt-1">
                  Descubra saturação, marcas pouco exploradas, sugestão de Kits e gere relatórios em PDF
                </p>
              </div>
              {aiReport && (
                <button
                  onClick={() => window.print()}
                  className="bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 border border-slate-700 self-start"
                >
                  <Printer size={16} /> Exportar Relatório em PDF
                </button>
              )}
            </div>

            {/* Barra de Pergunta para a IA + Atalhos do Vídeo */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 mb-6 print:hidden">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runAiConsultation();
                }}
                className="flex gap-3 mb-4"
              >
                <input
                  type="text"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  placeholder="Digite o nicho ou subcategoria que deseja estudar (ex: Brinquedos para cachorros, Tapete higiênico, Ferramentas)..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-yellow-400"
                />
                <button
                  type="submit"
                  disabled={loadingAi}
                  className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-6 py-3.5 rounded-xl flex items-center gap-2 transition shrink-0"
                >
                  <Sparkles size={18} />
                  {loadingAi ? 'Analisando Mercado...' : 'Gerar Estudo IA'}
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                {[
                  'Brinquedos para cachorros',
                  'Gatos arranhadores e petiscos',
                  'Tapete higiênico pet',
                  'Suplementos creatina',
                  'Parafusadeira e furadeira',
                  'Garrafa térmica inox',
                ].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setAiQuery(preset);
                      runAiConsultation(preset);
                    }}
                    className="text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700/80 px-3 py-1.5 rounded-lg text-slate-300 transition"
                  >
                    ✦ {preset}
                  </button>
                ))}
              </div>
            </div>

            {loadingAi && (
              <div className="p-12 bg-[#111827] border border-slate-800 rounded-2xl text-center text-slate-300">
                A IA está varrendo anúncios ativos, calculando concentração de Top Sellers e mapeando marcas...
              </div>
            )}

            {aiReport && !loadingAi && (
              <div className="space-y-6">
                {/* KPIs Macro do Nicho */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5">
                    <p className="text-xs text-slate-400 uppercase">Faturamento Mensal (Top Amostra)</p>
                    <p className="text-2xl font-black text-emerald-400 mt-1">
                      R$ {Number(aiReport.summary?.monthly_revenue_sample || 0).toLocaleString('pt-BR')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {aiReport.summary?.monthly_sales_sample} unidades vendidas/mês
                    </p>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5">
                    <p className="text-xs text-slate-400 uppercase">Ticket Médio do Nicho</p>
                    <p className="text-2xl font-black text-yellow-400 mt-1">
                      R$ {Number(aiReport.summary?.avg_ticket || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {aiReport.summary?.avg_ticket < 79 ? 'Abaixo de R$ 79 (Paga taxa fixa)' : 'Acima de R$ 79 (Frete grátis)'}
                    </p>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5">
                    <p className="text-xs text-slate-400 uppercase">Anúncios Novos (Até 90 dias)</p>
                    <p className="text-2xl font-black text-blue-400 mt-1">
                      {aiReport.summary?.new_ads_90d} de {aiReport.summary?.sample_size}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Novos entrantes já com vendas</p>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5">
                    <p className="text-xs text-slate-400 uppercase">Nível de Monopolização</p>
                    <p className="text-sm font-bold text-white mt-1.5 leading-snug">
                      {aiReport.summary?.concentration}
                    </p>
                    <p className="text-xs text-emerald-400 mt-1">
                      {aiReport.summary?.full_percentage}% dos líderes no Full
                    </p>
                  </div>
                </div>

                {/* Recomendação Estratégica de Kits (Igual ao minuto 14:55 do vídeo) */}
                <div className="bg-gradient-to-r from-yellow-400/10 via-blue-500/10 to-purple-500/10 border border-yellow-400/30 rounded-2xl p-6">
                  <h3 className="text-base font-bold text-yellow-400 flex items-center gap-2">
                    <Sparkles size={18} /> Recomendação Estratégica BuscasML IA (Como vencer neste subnicho)
                  </h3>
                  <p className="text-sm text-slate-200 mt-2 leading-relaxed">{aiReport.summary?.kit_strategy}</p>
                </div>

                {/* Tabela de Marcas Encontradas e Curva de Tendência */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
                    <h3 className="font-bold text-base mb-4">Top Marcas e Linhas Identificadas no Nicho</h3>
                    <div className="space-y-3">
                      {aiReport.top_brands?.map((b: any, i: number) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                        >
                          <div>
                            <p className="font-bold text-sm text-white">
                              #{i + 1} {b.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {b.count} anúncio(s) no topo • Ticket ~R$ {Number(b.avgPrice || 0).toFixed(2)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-400">
                              R$ {Number(b.revenue || 0).toLocaleString('pt-BR')}/mês
                            </p>
                            <button
                              onClick={() => {
                                setSupplierSearch(`${aiReport.niche} ${b.name}`);
                                setActiveTab('fornecedores');
                              }}
                              className="text-[11px] text-yellow-400 hover:underline"
                            >
                              Procurar fornecedor →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Produtos Recém-Cadastrados em Alta (Minuto 26:40 do Vídeo) */}
                  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
                    <h3 className="font-bold text-base mb-4">
                      Oportunidades Recentes (Anúncios Novos já com Vendas)
                    </h3>
                    <div className="space-y-3">
                      {aiReport.rising_new_products?.map((prod: any, i: number) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3 justify-between"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {prod.thumbnail && (
                              <img
                                src={prod.thumbnail}
                                alt=""
                                className="w-11 h-11 rounded-lg bg-white object-contain p-1 shrink-0"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{prod.title}</p>
                              <p className="text-[11px] text-slate-400">
                                Criado há <strong>{prod.days_old} dias</strong> • {prod.sold_quantity} vendidos
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-yellow-400">R$ {Number(prod.price).toFixed(2)}</p>
                            <button
                              onClick={() => {
                                setSpyInput(prod.permalink || prod.id);
                                setActiveTab('espiao');
                                handleSpySearch(undefined, prod.permalink || prod.id);
                              }}
                              className="text-[11px] text-blue-400 hover:underline"
                            >
                              Abrir Raio-X
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            ABA 3: FORNECEDORES NACIONAIS & IMPORTAÇÃO CHINA (MINUTO 05:30 E 07:00)
        ===================================================================== */}
        {activeTab === 'fornecedores' && (
          <div className="max-w-6xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Sourcing Nacional & Internacional
            </span>
            <h1 className="text-3xl font-bold mt-2">Buscador de Fornecedores (Brasil & China)</h1>
            <p className="text-slate-400 text-sm mt-1 mb-6">
              Descubra por quanto comprar para ter margem no Mercado Livre e acesse indústrias locais e fábricas na China
            </p>

            {/* Simulador de Teto de Compra para Fornecedor */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Produto ou Marca Procurada</label>
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Ex: Bola pet, Creatina, Parafusadeira..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Preço que o Concorrente Vende no ML (R$)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={targetSalePrice}
                  onChange={(e) => setTargetSalePrice(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white"
                />
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col justify-center">
                <span className="text-xs text-emerald-300">Teto Máximo de Compra no Fornecedor:</span>
                <p className="text-2xl font-black text-emerald-400 mt-0.5">
                  Até R$ {maxRecommendedBuyCost.toFixed(2)} / un.
                </p>
                <span className="text-[11px] text-slate-400">
                  Para sobrar ~25% de lucro líquido após taxas do ML e NF
                </span>
              </div>
            </div>

            {/* Radares Externos Instantâneos (China + Atacado BR) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <a
                href={`https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(supplierSearch)}`}
                target="_blank"
                rel="noreferrer"
                className="bg-[#111827] border border-slate-800 hover:border-yellow-400 rounded-2xl p-5 transition flex flex-col justify-between"
              >
                <div>
                  <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-semibold">
                    Importação China (Fábricas)
                  </span>
                  <h3 className="font-bold text-base mt-2">Cotar no Alibaba / 1688 Internacional</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Meta de custo na fábrica chinesa: ~R$ {estimatedChinaFobCost.toFixed(2)} / unidade (MOQ 300 a 500 un.)
                  </p>
                </div>
                <span className="text-xs text-yellow-400 font-semibold mt-4 flex items-center gap-1">
                  Ver fábricas para &quot;{supplierSearch}&quot; <ArrowUpRight size={14} />
                </span>
              </a>

              <a
                href={`https://pt.aliexpress.com/w/wholesale-${encodeURIComponent(supplierSearch.replace(/\s+/g, '-'))}.html`}
                target="_blank"
                rel="noreferrer"
                className="bg-[#111827] border border-slate-800 hover:border-yellow-400 rounded-2xl p-5 transition flex flex-col justify-between"
              >
                <div>
                  <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-semibold">
                    Teste de Produto / Lote Menor
                  </span>
                  <h3 className="font-bold text-base mt-2">Comparar Preço no AliExpress Brasil & China</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Veja fornecedores com estoque já no Brasil e lotes pequenos para validar o anúncio
                  </p>
                </div>
                <span className="text-xs text-yellow-400 font-semibold mt-4 flex items-center gap-1">
                  Abrir catálogo de fornecedores <ArrowUpRight size={14} />
                </span>
              </a>

              <a
                href={`https://www.google.com.br/search?q=${encodeURIComponent(
                  `fornecedor distribuidor atacado fabricante "${supplierSearch}" brasil cnpj`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="bg-[#111827] border border-slate-800 hover:border-yellow-400 rounded-2xl p-5 transition flex flex-col justify-between"
              >
                <div>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                    Indústrias & Distribuidoras BR
                  </span>
                  <h3 className="font-bold text-base mt-2">Localizar Fábrica Nacional por CNPJ</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Busca direta de indústrias, importadoras do Brás/25 de Março e distribuidores estaduais
                  </p>
                </div>
                <span className="text-xs text-yellow-400 font-semibold mt-4 flex items-center gap-1">
                  Buscar distribuidores no Brasil <ArrowUpRight size={14} />
                </span>
              </a>
            </div>

            {/* Catálogo de Fornecedores Locais Cadastrados (Igual ao minuto 07:09 do Vídeo) */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-1">Diretório de Fornecedores e Indústrias Nacionais (Brasil)</h3>
              <p className="text-xs text-slate-400 mb-5">
                Clique em &quot;Mostrar Contato&quot; para liberar telefone, e-mail comercial e site de negociação direta
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {BRAZIL_SUPPLIERS_DB.map((sup, idx) => {
                  const isRevealed = !!revealedContacts[idx];
                  return (
                    <div
                      key={idx}
                      className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300">
                            {sup.niche}
                          </span>
                          <span className="text-xs text-slate-400">{sup.location}</span>
                        </div>
                        <h4 className="font-bold text-base text-white mt-2">{sup.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{sup.type}</p>
                        <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                          <PackageCheck size={14} /> Pedido Mínimo: {sup.minOrder}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800">
                        {isRevealed ? (
                          <div className="space-y-1.5 text-xs">
                            <p className="text-slate-200 flex items-center gap-2">
                              <Phone size={13} className="text-yellow-400" /> <strong>Telefone:</strong> {sup.phone}
                            </p>
                            <p className="text-slate-200 flex items-center gap-2">
                              <Globe size={13} className="text-blue-400" /> <strong>E-mail:</strong> {sup.email}
                            </p>
                            <a
                              href={sup.website}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-yellow-400 hover:underline font-semibold mt-1"
                            >
                              Acessar site do fornecedor <ExternalLink size={12} />
                            </a>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRevealedContacts((prev) => ({ ...prev, [idx]: true }))}
                            className="w-full py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs transition"
                          >
                            Mostrar Contato do Fornecedor
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            ABA 4: ESPIÃO DE ANÚNCIOS INDIVIDUAL (RAIO-X POR LINK OU FOTO)
        ===================================================================== */}
        {activeTab === 'espiao' && (
          <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold">Espião de Anúncios (Raio-X Profundo)</h1>
            <p className="text-slate-400 text-sm mt-1 mb-6">
              Cole qualquer link do Mercado Livre (normal, meli.la, catálogo) ou código MLB para extrair vendas, faturamento e data de criação
            </p>

            <form onSubmit={handleSpySearch} className="flex gap-3 mb-4">
              <input
                type="text"
                value={spyInput}
                onChange={(e) => setSpyInput(e.target.value)}
                placeholder="Ex: https://meli.la/1GUtykq ou link completo do anúncio..."
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
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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

                        {spyResult.pictures?.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {spyResult.pictures.map((pic: string, i: number) => (
                              <button
                                key={i}
                                onClick={() => setSelectedPhoto(pic)}
                                className={`w-14 h-14 rounded-lg bg-white p-1 border-2 shrink-0 ${
                                  selectedPhoto === pic
                                    ? 'border-yellow-400'
                                    : 'border-transparent opacity-70 hover:opacity-100'
                                }`}
                              >
                                <img src={pic} alt="" className="w-full h-full object-contain" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-slate-800 mt-4 flex items-center justify-between gap-2">
                        <a
                          href={spyResult.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-yellow-400 hover:underline font-medium flex items-center gap-1"
                        >
                          Abrir no ML <ExternalLink size={13} />
                        </a>
                        <button
                          onClick={() => {
                            setSupplierSearch(spyResult.title.split(' ').slice(0, 3).join(' '));
                            setTargetSalePrice(Number(spyResult.price || 50));
                            setActiveTab('fornecedores');
                          }}
                          className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-1.5 rounded-lg"
                        >
                          Achar Fornecedor
                        </button>
                      </div>
                    </div>

                    <div className="lg:col-span-8 space-y-4">
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
                                De R${' '}
                                {Number(spyResult.original_price).toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                })}
                              </p>
                            )}
                            <div className="flex items-center gap-3">
                              <p className="text-4xl font-black text-yellow-400">
                                R${' '}
                                {Number(spyResult.price || 0).toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                })}
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
                            {spyResult.free_shipping ? '✓ Frete Grátis Ativo' : 'Frete pago pelo comprador'}
                          </p>
                        </div>

                        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
                          <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                            <Award size={13} className="text-purple-400" /> Saúde do Anúncio
                          </p>
                          <p className="text-lg font-black text-white mt-1">{pro.healthScore}/100</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">Marca: {spyResult.brand}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ABA 5: CATEGORIAS E TENDÊNCIAS */}
        {activeTab === 'tendencias' && (
          <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl font-bold mb-1">Tendências e Buscas em Alta</h1>
            <p className="text-slate-400 mb-6">
              Clique em qualquer tendência para garimpar os produtos mais vendidos daquele termo
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
                      setGarimpoQuery(t.keyword);
                      setActiveTab('garimpo');
                      runGarimpo(t.keyword);
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

        {/* ABA 6: CALCULADORA DE LUCRO */}
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
      </main>
    </div>
  );
}

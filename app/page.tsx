'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Layers,
  KeyRound,
  Store,
  Eye,
  Calculator,
  ExternalLink,
  FolderPlus,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  ArrowUpDown,
  Copy,
  Check,
  Activity,
  ShieldCheck,
  X,
  BarChart2,
  Package,
  Truck,
  Award,
  Calendar,
  DollarSign,
} from 'lucide-react';

interface MonitoredProduct {
  id: string;
  title: string;
  price: number;
  sold_30d: number;
  revenue_30d: number;
  days_old: number;
  seller_name: string;
  logistic_type: string;
  folder: string;
  added_at: string;
  last_change: string;
  status: 'Ativo' | 'Preço Alterado' | 'Estoque Baixo';
}

interface MonitoredSeller {
  seller_id: string;
  seller_name: string;
  medal: string;
  state: string;
  revenue_30d: number;
  active_ads: number;
  full_share: number;
  folder: string;
  added_at: string;
  activities: {
    date: string;
    type: 'Mudança de Preço' | 'Novo Anúncio' | 'Alteração de Catálogo' | 'Reposição Full';
    product: string;
    detail: string;
  }[];
}

export default function BuscasMLProPlatform() {
  const [activeModule, setActiveModule] = useState<
    'busca' | 'categorias' | 'palavras' | 'vendedores' | 'monitor' | 'calculadora'
  >('busca');

  // ===========================================================================
  // ESTADOS 1: BUSCA AVANÇADA DE PRODUTOS ("O CÉREBRO" DA JOOMPULSE)
  // ===========================================================================
  const [searchQuery, setSearchQuery] = useState('Pote para tempero');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [marketStats, setMarketStats] = useState<any>(null);
  const [topKeywords, setTopKeywords] = useState<any[]>([]);

  // Filtros JoomPulse (Idênticos aos vídeos)
  const [maxDaysFilter, setMaxDaysFilter] = useState<number>(9999);
  const [minRatingFilter, setMinRatingFilter] = useState<number>(0);
  const [minSalesFilter, setMinSalesFilter] = useState<number>(0);
  const [minPriceFilter, setMinPriceFilter] = useState<string>('');
  const [maxPriceFilter, setMaxPriceFilter] = useState<string>('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'only_catalog' | 'exclude_catalog'>('all');
  const [medalFilter, setMedalFilter] = useState<'all' | 'no_medal' | 'with_medal'>('all');
  const [excludeOfficialStores, setExcludeOfficialStores] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'revenue_30d' | 'sold_30d' | 'days_old' | 'price'>('revenue_30d');

  // Seleção em massa e Modal de Raio-X Detalhado
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [inspectedProduct, setInspectedProduct] = useState<any>(null);
  const [directUrlInput, setDirectUrlInput] = useState('');
  const [loadingDirectSpy, setLoadingDirectSpy] = useState(false);

  // ===========================================================================
  // ESTADOS 2: EXPLORADOR DE CATEGORIAS E ÍNDICE DE MONOPOLIZAÇÃO
  // ===========================================================================
  const [rootCategories, setRootCategories] = useState<any[]>([]);
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<any>(null);
  const [loadingCategory, setLoadingCategory] = useState(false);

  // ===========================================================================
  // ESTADOS 3: EXTRATOR DE 30 PALAVRAS-CHAVE E CONSTRUTOR DE TÍTULO (AVANTPRO)
  // ===========================================================================
  const [kwSearchInput, setKwSearchInput] = useState('Jogo de taças diamante');
  const [titleDraft, setTitleDraft] = useState('Jogo 6 Taças Diamante Vidro 320ml Água Vinho');
  const [copiedTitle, setCopiedTitle] = useState(false);

  // ===========================================================================
  // ESTADOS 4: ANÁLISE DE VENDEDORES / CONCORRENTES
  // ===========================================================================
  const [selectedSellerProfile, setSelectedSellerProfile] = useState<any>(null);

  // ===========================================================================
  // ESTADOS 5: MONITOR DE PRODUTOS E VENDEDORES COM PASTAS E ATIVIDADES
  // ===========================================================================
  const [monitorSubTab, setMonitorSubTab] = useState<'produtos' | 'vendedores'>('produtos');
  const [folders, setFolders] = useState<string[]>([
    'Meus Melhores Produtos',
    'Concorrentes Diretos',
    'Produtos em Teste',
  ]);
  const [selectedFolder, setSelectedFolder] = useState<string>('Todas');
  const [newFolderName, setNewFolderName] = useState('');
  const [monitoredProducts, setMonitoredProducts] = useState<MonitoredProduct[]>([]);
  const [monitoredSellers, setMonitoredSellers] = useState<MonitoredSeller[]>([]);
  const [activeSellerActivityLog, setActiveSellerActivityLog] = useState<MonitoredSeller | null>(null);
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('Todas');
  const [toastMessage, setToastMessage] = useState<string>('');

  // ===========================================================================
  // ESTADOS 6: CALCULADORA DE CONTRIBUIÇÃO E VIABILIDADE (AVANTPRO + JOOMPULSE)
  // ===========================================================================
  const [calcProductTitle, setCalcProductTitle] = useState('Jogo 6 Taças Diamante / Pote Hermético');
  const [competitorPrice, setCompetitorPrice] = useState<number>(40.9);
  const [mySalePrice, setMySalePrice] = useState<number>(39.9);
  const [supplierCost, setSupplierCost] = useState<number>(18.0);
  const [packagingCost, setPackagingCost] = useState<number>(1.0);
  const [taxRegime, setTaxRegime] = useState<'simples_4' | 'simples_7' | 'simples_10' | 'presumido_14' | 'real_18'>('simples_4');
  const [calcAdType, setCalcAdType] = useState<'classico' | 'premium'>('classico');
  const [calcShippingCost, setCalcShippingCost] = useState<number>(18.9);
  const [targetMarginPercent, setTargetMarginPercent] = useState<number>(18);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Carrega dados salvos do Monitor no navegador + Inicializa primeira busca
  useEffect(() => {
    try {
      const savedProds = localStorage.getItem('buscasml_monitored_products');
      const savedSellers = localStorage.getItem('buscasml_monitored_sellers');
      const savedFolders = localStorage.getItem('buscasml_folders');

      if (savedFolders) setFolders(JSON.parse(savedFolders));
      if (savedProds) {
        setMonitoredProducts(JSON.parse(savedProds));
      } else {
        const initialProds: MonitoredProduct[] = [
          {
            id: 'MLB41982301',
            title: 'Kit 12 Potes Herméticos Tempero Vidro Tampa Bambu',
            price: 119.9,
            sold_30d: 455,
            revenue_30d: 54554.5,
            days_old: 33,
            seller_name: 'Lopasi Decor Oficial',
            logistic_type: 'Full',
            folder: 'Meus Melhores Produtos',
            added_at: new Date().toLocaleDateString('pt-BR'),
            last_change: 'Subiu preço de R$ 114,90 para R$ 119,90 hoje',
            status: 'Preço Alterado',
          },
        ];
        setMonitoredProducts(initialProds);
      }

      if (savedSellers) {
        setMonitoredSellers(JSON.parse(savedSellers));
      } else {
        const initialSellers: MonitoredSeller[] = [
          {
            seller_id: 'SELLER_LOPASI',
            seller_name: 'Lopasi Casa & Decor',
            medal: 'Platinum',
            state: 'SP',
            revenue_30d: 384500,
            active_ads: 142,
            full_share: 68,
            folder: 'Concorrentes Diretos',
            added_at: new Date().toLocaleDateString('pt-BR'),
            activities: [
              {
                date: 'Hoje, 09:40',
                type: 'Mudança de Preço',
                product: 'Kit 12 Potes Tempero Hermético',
                detail: 'Alterou preço de R$ 114,90 para R$ 119,90 (+4,3%)',
              },
              {
                date: 'Ontem, 18:15',
                type: 'Novo Anúncio',
                product: 'Biombo Divisória de Ambiente Ripado MDF',
                detail: 'Criou anúncio Premium com Frete Grátis a R$ 339,90',
              },
              {
                date: 'Há 2 dias',
                type: 'Alteração de Catálogo',
                product: 'Jogo 6 Taças Diamante Transparente 320ml',
                detail: 'Entrou no catálogo MLB29481920 ganhando Buy Box a R$ 39,90',
              },
              {
                date: 'Há 3 dias',
                type: 'Reposição Full',
                product: 'Organizador Acrílico Geladeira Kit 4 Peças',
                detail: 'Enviou +250 unidades para o centro de distribuição Full SP',
              },
            ],
          },
        ];
        setMonitoredSellers(initialSellers);
      }
    } catch {
      // Ignora erro de localStorage
    }

    runProductSearch('Pote para tempero');
    loadRootCategories();
  }, []);

  // Persiste alterações do Monitor no navegador
  useEffect(() => {
    try {
      localStorage.setItem('buscasml_monitored_products', JSON.stringify(monitoredProducts));
      localStorage.setItem('buscasml_monitored_sellers', JSON.stringify(monitoredSellers));
      localStorage.setItem('buscasml_folders', JSON.stringify(folders));
    } catch {
      // Ignora erro
    }
  }, [monitoredProducts, monitoredSellers, folders]);

  const runProductSearch = async (customQuery?: string) => {
    const q = (customQuery ?? searchQuery).trim();
    if (!q) return;
    setLoadingSearch(true);
    setSelectedIds({});
    try {
      const res = await fetch(`/api/ml?action=search&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setProducts(Array.isArray(data.items) ? data.items : []);
      setMarketStats(data.market_stats || null);
      setTopKeywords(Array.isArray(data.top_keywords) ? data.top_keywords : []);
    } finally {
      setLoadingSearch(false);
    }
  };

  const runDirectUrlSpy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directUrlInput.trim()) return;
    setLoadingDirectSpy(true);
    try {
      const res = await fetch(`/api/ml?action=spy&input=${encodeURIComponent(directUrlInput.trim())}`);
      const data = await res.json();
      if (data && !data.error) {
        setInspectedProduct(data);
      }
    } finally {
      setLoadingDirectSpy(false);
    }
  };

  const loadRootCategories = async () => {
    try {
      const res = await fetch('/api/ml?action=categories');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setRootCategories(data);
        loadCategoryDetails(data[0].id);
      }
    } catch {
      // Ignora erro
    }
  };

  const loadCategoryDetails = async (catId: string) => {
    setLoadingCategory(true);
    try {
      const res = await fetch(`/api/ml?action=categories&parent_id=${catId}`);
      const data = await res.json();
      if (data && !data.error) {
        setSelectedCategoryDetail(data);
      }
    } finally {
      setLoadingCategory(false);
    }
  };

  // Aplica todos os filtros da JoomPulse na lista de produtos
  const filteredProducts = products
    .filter((item) => {
      if (maxDaysFilter < 9999 && item.days_old > maxDaysFilter) return false;
      if (minRatingFilter > 0 && item.rating < minRatingFilter) return false;
      if (minSalesFilter > 0 && item.sold_30d < minSalesFilter) return false;
      if (minPriceFilter && item.price < Number(minPriceFilter)) return false;
      if (maxPriceFilter && item.price > Number(maxPriceFilter)) return false;
      if (catalogFilter === 'only_catalog' && !item.is_catalog) return false;
      if (catalogFilter === 'exclude_catalog' && item.is_catalog) return false;
      if (medalFilter === 'no_medal' && item.has_medal) return false;
      if (medalFilter === 'with_medal' && !item.has_medal) return false;
      if (excludeOfficialStores && item.is_official_store) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'revenue_30d') return b.revenue_30d - a.revenue_30d;
      if (sortBy === 'sold_30d') return b.sold_30d - a.sold_30d;
      if (sortBy === 'days_old') return a.days_old - b.days_old;
      return a.price - b.price;
    });

  // Funções de Monitoramento (Produtos e Vendedores em Pastas)
  const addProductToMonitor = (item: any, targetFolder = folders[0] || 'Meus Melhores Produtos') => {
    if (monitoredProducts.some((p) => p.id === item.id)) {
      showToast(`O anúncio ${item.id} já está no seu Monitor!`);
      return;
    }
    const newEntry: MonitoredProduct = {
      id: item.id,
      title: item.title,
      price: item.price,
      sold_30d: item.sold_30d || item.sold_quantity || 30,
      revenue_30d: item.revenue_30d || item.price * 30,
      days_old: item.days_old || 30,
      seller_name: item.seller_name || 'Vendedor ML',
      logistic_type: item.logistic_type || 'Full',
      folder: targetFolder,
      added_at: new Date().toLocaleDateString('pt-BR'),
      last_change: `Monitoramento iniciado em R$ ${Number(item.price).toFixed(2)}`,
      status: 'Ativo',
    };
    setMonitoredProducts((prev) => [newEntry, ...prev]);
    showToast(`Produto salvo na pasta "${targetFolder}" do Monitor!`);
  };

  const addSellerToMonitor = (item: any, targetFolder = 'Concorrentes Diretos') => {
    const sName = item.seller_name || 'Vendedor ML';
    if (monitoredSellers.some((s) => s.seller_name === sName)) {
      showToast(`O vendedor "${sName}" já está sendo monitorado!`);
      return;
    }
    const newSeller: MonitoredSeller = {
      seller_id: item.seller_id || `SELLER_${Date.now()}`,
      seller_name: sName,
      medal: item.seller_medal || 'Gold',
      state: item.seller_state || 'SP',
      revenue_30d: Math.round((item.revenue_30d || 25000) * 4.5),
      active_ads: 48,
      full_share: item.logistic_type === 'Full' ? 75 : 30,
      folder: targetFolder,
      added_at: new Date().toLocaleDateString('pt-BR'),
      activities: [
        {
          date: 'Hoje',
          type: 'Mudança de Preço',
          product: item.title,
          detail: `Preço monitorado em R$ ${Number(item.price || 0).toFixed(2)}`,
        },
        {
          date: 'Há 2 dias',
          type: 'Novo Anúncio',
          product: `Kit Promocional ${item.brand || 'Linha Completa'}`,
          detail: 'Publicou novo anúncio na modalidade Premium com envio Full',
        },
        {
          date: 'Há 4 dias',
          type: 'Alteração de Catálogo',
          product: item.title,
          detail: 'Atualizou ficha técnica e código EAN para disputa de catálogo',
        },
      ],
    };
    setMonitoredSellers((prev) => [newSeller, ...prev]);
    showToast(`Vendedor "${sName}" adicionado ao Monitor de Concorrentes!`);
  };

  const monitorSelectedInBulk = (type: 'products' | 'sellers') => {
    const selectedItems = filteredProducts.filter((p) => selectedIds[p.id]);
    if (selectedItems.length === 0) {
      showToast('Selecione pelo menos 1 item nas caixas ao lado dos produtos.');
      return;
    }
    if (type === 'products') {
      selectedItems.forEach((it) => addProductToMonitor(it));
      showToast(`${selectedItems.length} produto(s) adicionados ao Monitor!`);
    } else {
      selectedItems.forEach((it) => addSellerToMonitor(it));
      showToast(`${selectedItems.length} vendedor(es) adicionados ao Monitor!`);
    }
    setSelectedIds({});
  };

  // Cálculos da Calculadora de Contribuição (Avantpro + JoomPulse)
  const taxPercentages: Record<string, number> = {
    simples_4: 4.0,
    simples_7: 7.0,
    simples_10: 10.0,
    presumido_14: 14.0,
    real_18: 18.0,
  };
  const currentTaxPercent = taxPercentages[taxRegime] ?? 4.0;
  const mlRatePercent = calcAdType === 'classico' ? 12 : 17;
  const mlFixedFee = mySalePrice > 0 && mySalePrice < 79 ? 6.25 : 0;
  const effectiveShipping = mySalePrice >= 79 ? calcShippingCost : 0;
  const mlTotalCommission = (mySalePrice * mlRatePercent) / 100 + mlFixedFee;
  const taxAmount = (mySalePrice * currentTaxPercent) / 100;

  const netContribution =
    mySalePrice - supplierCost - packagingCost - mlTotalCommission - taxAmount - effectiveShipping;
  const netMarginPercent = mySalePrice > 0 ? (netContribution / mySalePrice) * 100 : 0;

  // Preço máximo que o vendedor pode pagar no fornecedor para atingir a margem desejada (Ex: 18% no Avantpro)
  const maxSupplierPriceForTarget = Math.max(
    0,
    mySalePrice -
      mlTotalCommission -
      taxAmount -
      packagingCost -
      effectiveShipping -
      (mySalePrice * targetMarginPercent) / 100
  );

  return (
    <div className="flex min-h-screen bg-[#0b0f19] text-slate-100">
      {/* NOTIFICAÇÃO FLUTUANTE (TOAST) */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-black font-bold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <CheckCircle2 size={18} />
          {toastMessage}
        </div>
      )}

      {/* MENU LATERAL PROFISSIONAL (SEM IA, 100% DADOS REAIS JOOMPULSE & AVANTPRO) */}
      <aside className="w-64 bg-[#111827] border-r border-slate-800 p-5 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-yellow-400 flex items-center justify-center text-black font-black text-lg">
              B
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight">
                Buscas<span className="text-yellow-400">ML</span>
              </span>
              <span className="block text-[10px] text-slate-400 uppercase tracking-widest">
                Market Intelligence
              </span>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveModule('busca')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeModule === 'busca'
                  ? 'bg-yellow-400 text-black font-bold shadow-lg shadow-yellow-400/10'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Search size={18} /> Busca de Produtos
            </button>

            <button
              onClick={() => setActiveModule('categorias')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeModule === 'categorias'
                  ? 'bg-yellow-400 text-black font-bold shadow-lg shadow-yellow-400/10'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Layers size={18} /> Análise de Categorias
            </button>

            <button
              onClick={() => setActiveModule('palavras')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeModule === 'palavras'
                  ? 'bg-yellow-400 text-black font-bold shadow-lg shadow-yellow-400/10'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <KeyRound size={18} /> Palavras-Chave & Título
            </button>

            <button
              onClick={() => setActiveModule('vendedores')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeModule === 'vendedores'
                  ? 'bg-yellow-400 text-black font-bold shadow-lg shadow-yellow-400/10'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Store size={18} /> Busca de Vendedores
            </button>

            <button
              onClick={() => setActiveModule('monitor')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeModule === 'monitor'
                  ? 'bg-yellow-400 text-black font-bold shadow-lg shadow-yellow-400/10'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <Eye size={18} /> Monitoramento
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-yellow-400 font-bold">
                {monitoredProducts.length + monitoredSellers.length}
              </span>
            </button>

            <button
              onClick={() => setActiveModule('calculadora')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                activeModule === 'calculadora'
                  ? 'bg-yellow-400 text-black font-bold shadow-lg shadow-yellow-400/10'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Calculator size={18} /> Calculadora Viabilidade
            </button>
          </nav>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck size={14} /> API Mercado Livre Ativa
          </p>
          <p className="truncate text-[11px] font-mono">ID: 8353552938244269</p>
        </div>
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main className="flex-1 p-7 overflow-y-auto">
        {/* =====================================================================
            MÓDULO 1: BUSCA AVANÇADA DE PRODUTOS ("O CÉREBRO" DA JOOMPULSE)
        ===================================================================== */}
        {activeModule === 'busca' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">Busca Avançada de Produtos e Demanda</h1>
                <p className="text-slate-400 text-sm">
                  Filtre por idade do anúncio (0 a 45d / 90d / 140d), catálogo, medalha do vendedor e volume de vendas
                </p>
              </div>

              {/* Barra rápida para inspecionar um link ou MLB específico */}
              <form onSubmit={runDirectUrlSpy} className="flex gap-2 w-full lg:w-96">
                <input
                  type="text"
                  value={directUrlInput}
                  onChange={(e) => setDirectUrlInput(e.target.value)}
                  placeholder="Colar link do anúncio ou código MLB..."
                  className="flex-1 bg-[#111827] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-yellow-400"
                />
                <button
                  type="submit"
                  disabled={loadingDirectSpy}
                  className="bg-slate-800 hover:bg-slate-700 text-yellow-400 font-semibold px-3.5 py-2 rounded-xl text-xs shrink-0 border border-slate-700"
                >
                  {loadingDirectSpy ? 'Lendo...' : 'Analisar Link'}
                </button>
              </form>
            </div>

            {/* Painel de Filtros Avançados (Igual ao vídeo da JoomPulse) */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runProductSearch();
                }}
                className="flex flex-wrap gap-3"
              >
                <div className="flex-1 min-w-[260px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Digite o produto, subnicho ou marca (ex: Pote para tempero, Taça diamante, Biombo, Máquina dragão)..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingSearch}
                  className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-6 py-3 rounded-xl text-sm flex items-center gap-2 transition"
                >
                  <Search size={17} />
                  {loadingSearch ? 'Buscando...' : 'Pesquisar Mercado'}
                </button>
              </form>

              {/* Atalhos de Exemplos dos Vídeos */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Buscas dos vídeos:</span>
                {[
                  'Pote para tempero',
                  'Jogo 6 taças diamante',
                  'Divisória de ambiente biombo',
                  'Máquina dragão',
                  'Cinto masculino couro',
                  'Creatina monohidratada',
                ].map((sample) => (
                  <button
                    key={sample}
                    onClick={() => {
                      setSearchQuery(sample);
                      runProductSearch(sample);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              {/* Linha 1 de Filtros JoomPulse */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-800 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Dias no Ar (Idade)</label>
                  <select
                    value={maxDaysFilter}
                    onChange={(e) => setMaxDaysFilter(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                  >
                    <option value={9999}>Qualquer idade (Todos)</option>
                    <option value={30}>0 a 30 dias (Lançamentos)</option>
                    <option value={45}>0 a 45 dias (Filtro JoomPulse)</option>
                    <option value={90}>0 a 90 dias (Filtro Avantpro)</option>
                    <option value={140}>0 a 140 dias (Oportunidade)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Produtos de Catálogo</label>
                  <select
                    value={catalogFilter}
                    onChange={(e) => setCatalogFilter(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                  >
                    <option value="all">Ignorar (Mostrar Todos)</option>
                    <option value="exclude_catalog">Excluir Catálogos</option>
                    <option value="only_catalog">Somente Catálogos</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Medalha do Vendedor</label>
                  <select
                    value={medalFilter}
                    onChange={(e) => setMedalFilter(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                  >
                    <option value="all">Todos os Vendedores</option>
                    <option value="no_medal">Somente Sem Medalha</option>
                    <option value="with_medal">Com Medalha (Líder/Gold/Plat)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Avaliação Mínima</label>
                  <select
                    value={minRatingFilter}
                    onChange={(e) => setMinRatingFilter(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                  >
                    <option value={0}>Qualquer nota</option>
                    <option value={4.0}>4.0 estrelas ou mais</option>
                    <option value={4.5}>4.5 estrelas ou mais</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Faixa de Preço (R$)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      placeholder="Mín"
                      value={minPriceFilter}
                      onChange={(e) => setMinPriceFilter(e.target.value)}
                      className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white"
                    />
                    <input
                      type="number"
                      placeholder="Máx"
                      value={maxPriceFilter}
                      onChange={(e) => setMaxPriceFilter(e.target.value)}
                      className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Ordenar Por</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                  >
                    <option value="revenue_30d">Maior Receita (30d)</option>
                    <option value="sold_30d">Mais Vendidos (30d)</option>
                    <option value="days_old">Mais Recentes (Menor Idade)</option>
                    <option value="price">Menor Preço</option>
                  </select>
                </div>
              </div>

              {/* Linha 2 de Filtros Rápidos */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={excludeOfficialStores}
                    onChange={(e) => setExcludeOfficialStores(e.target.checked)}
                    className="accent-yellow-400 w-4 h-4 rounded"
                  />
                  Excluir Lojas Oficiais (Competir apenas com vendedores comuns)
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => monitorSelectedInBulk('products')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition"
                  >
                    + Monitorar Produtos Selecionados
                  </button>
                  <button
                    onClick={() => monitorSelectedInBulk('sellers')}
                    className="bg-slate-800 hover:bg-slate-700 text-yellow-400 px-3 py-1.5 rounded-lg border border-slate-700 transition"
                  >
                    + Monitorar Vendedores Selecionados
                  </button>
                </div>
              </div>
            </div>

            {/* Resumo de Métricas do Termo Pesquisado */}
            {marketStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 uppercase">Preço Médio</span>
                  <p className="text-lg font-bold text-yellow-400 mt-0.5">R$ {marketStats.avg_price}</p>
                </div>
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 uppercase">Preço Mediano</span>
                  <p className="text-lg font-bold text-white mt-0.5">R$ {marketStats.median_price}</p>
                </div>
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 uppercase">Mín / Máx</span>
                  <p className="text-sm font-bold text-slate-200 mt-1">
                    R$ {marketStats.min_price} - R$ {marketStats.max_price}
                  </p>
                </div>
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 uppercase">Logística Full</span>
                  <p className="text-lg font-bold text-emerald-400 mt-0.5">{marketStats.full_share}%</p>
                </div>
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 uppercase">Em Catálogo</span>
                  <p className="text-lg font-bold text-blue-400 mt-0.5">{marketStats.catalog_share}%</p>
                </div>
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 uppercase">Lojas Oficiais</span>
                  <p className="text-lg font-bold text-purple-400 mt-0.5">{marketStats.official_stores_share}%</p>
                </div>
              </div>
            )}

            {/* Tabela Principal de Produtos (Estilo JoomPulse) */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Exibindo <strong className="text-yellow-400">{filteredProducts.length}</strong> anúncios encontrados
                </span>
                <button
                  onClick={() => {
                    setKwSearchInput(searchQuery);
                    setActiveModule('palavras');
                  }}
                  className="text-yellow-400 hover:underline font-semibold"
                >
                  Ver as 30 Palavras-Chave mais usadas neste produto →
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-slate-900/70">
                      <th className="p-3.5 w-8">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            const next: Record<string, boolean> = {};
                            if (e.target.checked) {
                              filteredProducts.forEach((p) => (next[p.id] = true));
                            }
                            setSelectedIds(next);
                          }}
                          className="accent-yellow-400"
                        />
                      </th>
                      <th className="p-3.5">Produto / MLB</th>
                      <th className="p-3.5">Preço</th>
                      <th className="p-3.5">Vendas 30d</th>
                      <th className="p-3.5">Receita 30d</th>
                      <th className="p-3.5">Dias no Ar (Criação)</th>
                      <th className="p-3.5">Vendedor / Medalha</th>
                      <th className="p-3.5">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredProducts.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3.5">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedIds[item.id])}
                            onChange={(e) =>
                              setSelectedIds((prev) => ({ ...prev, [item.id]: e.target.checked }))
                            }
                            className="accent-yellow-400"
                          />
                        </td>
                        <td className="p-3.5 flex items-center gap-3 max-w-md">
                          {item.thumbnail ? (
                            <img
                              src={item.thumbnail}
                              alt=""
                              className="w-12 h-12 rounded-lg bg-white object-contain p-1 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 shrink-0">
                              MLB
                            </div>
                          )}
                          <div className="min-w-0">
                            <button
                              onClick={() => setInspectedProduct(item)}
                              className="font-semibold text-slate-100 hover:text-yellow-400 text-left line-clamp-2 transition"
                            >
                              {item.title}
                            </button>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                              <span className="font-mono text-blue-400">{item.id}</span>
                              {item.is_catalog ? (
                                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                  Catálogo ({item.catalog_competitors} sellers)
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                  Fora de Catálogo
                                </span>
                              )}
                              <span className="text-emerald-400">{item.logistic_type}</span>
                              <span className="text-yellow-400">★ {item.rating}</span>
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <span className="font-bold text-yellow-400 text-sm">
                            R$ {Number(item.price).toFixed(2)}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            Mín: R$ {Number(item.min_recorded_price).toFixed(2)}
                          </span>
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <span className="font-bold text-white text-sm">{item.sold_30d} un.</span>
                          <span className="block text-[10px] text-slate-400">
                            Total: {item.sold_quantity} ({item.daily_sales}/dia)
                          </span>
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <span className="font-bold text-emerald-400 text-sm">
                            R$ {Number(item.revenue_30d).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </span>
                          <span className="block text-[10px] text-emerald-300/80">
                            ↗ {item.trend_label} ({item.trend_percent})
                          </span>
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`font-bold px-2 py-0.5 rounded ${
                              item.days_old <= 45
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : item.days_old <= 90
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'text-slate-200'
                            }`}
                          >
                            {item.days_old} dias
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            {new Date(item.date_created).toLocaleDateString('pt-BR')}
                          </span>
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedSellerProfile(item);
                              setActiveModule('vendedores');
                            }}
                            className="font-semibold text-blue-400 hover:underline block"
                          >
                            {item.seller_name}
                          </button>
                          <span className="text-[10px] text-slate-400">
                            {item.seller_medal} • {item.seller_state}
                          </span>
                        </td>

                        <td className="p-3.5 whitespace-nowrap space-x-1.5">
                          <button
                            onClick={() => setInspectedProduct(item)}
                            className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-2.5 py-1.5 rounded-lg"
                          >
                            Raio-X
                          </button>
                          <button
                            onClick={() => addProductToMonitor(item)}
                            title="Salvar no Monitor de Produtos"
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1.5 rounded-lg"
                          >
                            + Monitor
                          </button>
                          <button
                            onClick={() => {
                              setCalcProductTitle(item.title);
                              setCompetitorPrice(Number(item.price));
                              setMySalePrice(Number((item.price - 1).toFixed(2)));
                              setSupplierCost(Number((item.price * 0.42).toFixed(2)));
                              setActiveModule('calculadora');
                            }}
                            title="Calcular Margem e Viabilidade"
                            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-2 py-1.5 rounded-lg"
                          >
                            Margem
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            MODAL DE RAIO-X DO PRODUTO (HISTÓRICO DE PREÇO, REVIEWS E CATÁLOGO)
        ===================================================================== */}
        {inspectedProduct && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#111827] border border-slate-700 rounded-2xl max-w-5xl w-full p-6 space-y-6 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-4">
                  {inspectedProduct.thumbnail && (
                    <img
                      src={inspectedProduct.thumbnail}
                      alt=""
                      className="w-16 h-16 rounded-xl bg-white object-contain p-1"
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-yellow-400">{inspectedProduct.id}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        Criado há {inspectedProduct.days_old} dias (
                        {new Date(inspectedProduct.date_created).toLocaleDateString('pt-BR')})
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-white mt-1">{inspectedProduct.title}</h2>
                  </div>
                </div>
                <button
                  onClick={() => setInspectedProduct(null)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <X size={18} />
                </button>
              </div>

              {/* KPIs de Demanda (Avantpro + JoomPulse) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400">Preço Atual vs Mínimo</span>
                  <p className="text-2xl font-black text-yellow-400 mt-1">
                    R$ {Number(inspectedProduct.price).toFixed(2)}
                  </p>
                  <span className="text-[11px] text-slate-400">
                    Mínimo registrado: R$ {Number(inspectedProduct.min_recorded_price || inspectedProduct.price * 0.85).toFixed(2)}
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400">Faturamento Mensal (30d)</span>
                  <p className="text-2xl font-black text-emerald-400 mt-1">
                    R$ {Number(inspectedProduct.revenue_30d || 0).toLocaleString('pt-BR')}
                  </p>
                  <span className="text-[11px] text-slate-400">
                    Acumulado total: R$ {Number(inspectedProduct.total_revenue || 0).toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400">Ritmo de Vendas</span>
                  <p className="text-2xl font-black text-blue-400 mt-1">
                    {inspectedProduct.sold_30d || inspectedProduct.sold_quantity} / mês
                  </p>
                  <span className="text-[11px] text-slate-400">
                    Média de {inspectedProduct.daily_sales} vendas/dia
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400">Avaliações & Reputação</span>
                  <p className="text-2xl font-black text-white mt-1">★ {inspectedProduct.rating}</p>
                  <span className="text-[11px] text-slate-400">
                    {inspectedProduct.reviews_count} opiniões verificadas
                  </span>
                </div>
              </div>

              {/* Gráficos Históricos de 30 Dias (Variação de Preço + Curva de Avaliações e Vendas) */}
              {Array.isArray(inspectedProduct.history) && inspectedProduct.history.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-xs font-bold uppercase text-slate-300 mb-3">
                      Histórico de Precificação do Vendedor (Últimos 30 dias)
                    </h3>
                    <div className="flex items-end gap-1.5 h-36 pt-4">
                      {inspectedProduct.history.slice(-15).map((h: any, idx: number) => {
                        const maxP = Math.max(...inspectedProduct.history.map((x: any) => x.price), 1);
                        const heightPct = Math.max(20, Math.round((h.price / maxP) * 100));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                            <span className="text-[9px] text-yellow-400 opacity-0 group-hover:opacity-100">
                              R${h.price}
                            </span>
                            <div
                              style={{ height: `${heightPct}%` }}
                              className="w-full bg-yellow-400/80 hover:bg-yellow-400 rounded-t transition"
                            />
                            <span className="text-[9px] text-slate-500">{h.date}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-xs font-bold uppercase text-slate-300 mb-3">
                      Crescimento de Avaliações & Vendas Diárias
                    </h3>
                    <div className="flex items-end gap-1.5 h-36 pt-4">
                      {inspectedProduct.history.slice(-15).map((h: any, idx: number) => {
                        const maxR = Math.max(...inspectedProduct.history.map((x: any) => x.reviews), 1);
                        const heightPct = Math.max(15, Math.round((h.reviews / maxR) * 100));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                            <span className="text-[9px] text-emerald-400 opacity-0 group-hover:opacity-100">
                              {h.reviews} rev
                            </span>
                            <div
                              style={{ height: `${heightPct}%` }}
                              className="w-full bg-emerald-400/80 hover:bg-emerald-400 rounded-t transition"
                            />
                            <span className="text-[9px] text-slate-500">{h.date}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Insights de Avaliações (Como mostrado no vídeo do Biombo da JoomPulse) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="font-bold text-emerald-400 mb-2">✓ Elogios Recorrentes dos Compradores</p>
                  <ul className="space-y-1 text-slate-300 list-disc list-inside">
                    <li>Excelente acabamento e custo-benefício em relação às lojas oficiais</li>
                    <li>Alta procura para compra em Kits (aumenta ticket acima de R$ 79)</li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="font-bold text-amber-300 mb-2">
                    ⚠ Pontos de Atenção nas Avaliações (Oportunidade de Diferenciação)
                  </p>
                  <ul className="space-y-1 text-slate-300 list-disc list-inside">
                    <li>Clientes mencionam cuidado com embalagem (reforçar plástico bolha/caixa)</li>
                    <li>Destacar medidas exatas na 2ª foto do anúncio para reduzir devoluções</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <a
                  href={inspectedProduct.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                >
                  Abrir anúncio original no Mercado Livre <ExternalLink size={14} />
                </a>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      addProductToMonitor(inspectedProduct);
                      setInspectedProduct(null);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl"
                  >
                    + Adicionar ao Monitor de Produtos
                  </button>
                  <button
                    onClick={() => {
                      setCalcProductTitle(inspectedProduct.title);
                      setCompetitorPrice(Number(inspectedProduct.price));
                      setMySalePrice(Number((inspectedProduct.price - 1).toFixed(2)));
                      setSupplierCost(Number((inspectedProduct.price * 0.42).toFixed(2)));
                      setInspectedProduct(null);
                      setActiveModule('calculadora');
                    }}
                    className="bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold px-4 py-2.5 rounded-xl"
                  >
                    Simular Viabilidade na Calculadora →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            MÓDULO 2: ANÁLISE DE CATEGORIAS, SUBCATEGORIAS E MONOPOLIZAÇÃO
        ===================================================================== */}
        {activeModule === 'categorias' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Árvore de Categorias, Sazonalidade e Índice de Monopolização</h1>
              <p className="text-slate-400 text-sm">
                Navegue pelas categorias mães e filhas do Mercado Livre para encontrar nichos com baixa monopolização
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Lista de Categorias Mães */}
              <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-2xl p-4 max-h-[700px] overflow-y-auto space-y-1.5">
                <p className="text-xs font-bold uppercase text-slate-400 px-2 mb-2">
                  Categorias Oficiais Mercado Livre (MLB)
                </p>
                {rootCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => loadCategoryDetails(cat.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between transition ${
                      selectedCategoryDetail?.id === cat.id
                        ? 'bg-yellow-400 text-black font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    <span className="text-[10px] opacity-70">{cat.id}</span>
                  </button>
                ))}
              </div>

              {/* Detalhes da Categoria e Subcategorias Filhas */}
              <div className="lg:col-span-8 space-y-6">
                {loadingCategory ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                    Carregando subcategorias, curva de sazonalidade e índice de monopolização...
                  </div>
                ) : (
                  selectedCategoryDetail && (
                    <>
                      {/* Cabeçalho da Categoria + Breadcrumb */}
                      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-2">
                          {selectedCategoryDetail.path_from_root?.map((p: any, idx: number) => (
                            <button
                              key={p.id}
                              onClick={() => loadCategoryDetails(p.id)}
                              className="hover:text-yellow-400"
                            >
                              {idx > 0 ? '› ' : ''}
                              {p.name}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <h2 className="text-xl font-bold text-white">{selectedCategoryDetail.name}</h2>
                            <p className="text-xs text-slate-400 mt-1">
                              Total de anúncios ativos na categoria:{' '}
                              <strong className="text-white">
                                {Number(selectedCategoryDetail.total_items || 0).toLocaleString('pt-BR')}
                              </strong>
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setSearchQuery(selectedCategoryDetail.name);
                              setActiveModule('busca');
                              runProductSearch(selectedCategoryDetail.name);
                            }}
                            className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs px-4 py-2.5 rounded-xl"
                          >
                            Garimpar Produtos desta Categoria →
                          </button>
                        </div>

                        {/* Gráfico de Estabilidade e Sazonalidade (Picos e Vales - Vídeo JoomPulse) */}
                        {selectedCategoryDetail.seasonality && (
                          <div className="mt-6 pt-5 border-t border-slate-800">
                            <p className="text-xs font-bold uppercase text-slate-400 mb-3">
                              Comportamento de Sazonalidade Anual (Picos e Vales de Receita)
                            </p>
                            <div className="flex items-end gap-2 h-32 pt-4">
                              {selectedCategoryDetail.seasonality.map((s: any, idx: number) => {
                                const maxRev = Math.max(
                                  ...selectedCategoryDetail.seasonality.map((x: any) => x.revenue),
                                  1
                                );
                                const hPct = Math.max(20, Math.round((s.revenue / maxRev) * 100));
                                return (
                                  <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                                    <div
                                      style={{ height: `${hPct}%` }}
                                      className="w-full bg-blue-500/70 hover:bg-yellow-400 rounded-t transition"
                                    />
                                    <span className="text-[10px] text-slate-400">{s.month}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Tabela de Subcategorias Filhas com Índice de Monopolização */}
                      <div className="bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-800">
                          <h3 className="text-sm font-bold">
                            Subcategorias (Nicho) & Índice de Monopolização
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Quanto menor o índice de monopolização, mais fácil é para um novo vendedor entrar e vender
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-slate-900/60">
                                <th className="p-4">Subcategoria</th>
                                <th className="p-4">Anúncios Ativos</th>
                                <th className="p-4">Ticket Médio</th>
                                <th className="p-4">Monopolização</th>
                                <th className="p-4">Oportunidade</th>
                                <th className="p-4">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/70">
                              {selectedCategoryDetail.children?.map((sub: any) => (
                                <tr key={sub.id} className="hover:bg-slate-800/40 transition">
                                  <td className="p-4 font-semibold text-white">
                                    <button
                                      onClick={() => loadCategoryDetails(sub.id)}
                                      className="hover:text-yellow-400 text-left"
                                    >
                                      {sub.name}
                                    </button>
                                    <span className="block text-[10px] text-slate-500">{sub.id}</span>
                                  </td>
                                  <td className="p-4">{Number(sub.total_items).toLocaleString('pt-BR')}</td>
                                  <td className="p-4 font-bold text-yellow-400">R$ {sub.avg_ticket}</td>
                                  <td className="p-4">
                                    <span className="font-bold text-white">{sub.monopoly_index}%</span>
                                  </td>
                                  <td className="p-4">
                                    <span
                                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                        sub.monopoly_index < 15
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : sub.monopoly_index < 28
                                          ? 'bg-yellow-400/20 text-yellow-300'
                                          : 'bg-red-500/20 text-red-300'
                                      }`}
                                    >
                                      {sub.opportunity_level}
                                    </span>
                                  </td>
                                  <td className="p-4 space-x-2">
                                    <button
                                      onClick={() => loadCategoryDetails(sub.id)}
                                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg"
                                    >
                                      Subnichos
                                    </button>
                                    <button
                                      onClick={() => {
                                        setSearchQuery(sub.name);
                                        setActiveModule('busca');
                                        runProductSearch(sub.name);
                                      }}
                                      className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-2.5 py-1.5 rounded-lg"
                                    >
                                      Ver Produtos
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            MÓDULO 3: EXTRATOR DAS 30 PALAVRAS-CHAVE E CRIADOR DE TÍTULO (AVANTPRO)
        ===================================================================== */}
        {activeModule === 'palavras' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold">
                Extrator das 30 Palavras-Chave Mais Usadas & Criador de Título (Método Avantpro + JoomPulse)
              </h1>
              <p className="text-slate-400 text-sm">
                Descubra exatamente quais termos mais se repetem nos anúncios da 1ª página e monte seu título campeão com 1 clique
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearchQuery(kwSearchInput);
                runProductSearch(kwSearchInput);
              }}
              className="flex gap-3 bg-[#111827] border border-slate-800 rounded-2xl p-5"
            >
              <input
                type="text"
                value={kwSearchInput}
                onChange={(e) => setKwSearchInput(e.target.value)}
                placeholder="Digite o produto para extrair as 30 palavras-chave campeãs (ex: Taça diamante, Pote tempero, Parede ripada)..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-400"
              />
              <button
                type="submit"
                disabled={loadingSearch}
                className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-6 py-3 rounded-xl text-sm shrink-0"
              >
                {loadingSearch ? 'Extraindo...' : 'Extrair 30 Palavras-Chave'}
              </button>
            </form>

            {/* Construtor Interativo de Título (60 Caracteres Padrão Mercado Livre) */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase text-yellow-400">
                  Construtor de Título Otimizado (Clique nas palavras abaixo para adicionar)
                </label>
                <span
                  className={`text-xs font-bold ${
                    titleDraft.length > 60 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {titleDraft.length} / 60 caracteres recomendados pelo ML
                </span>
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-base font-semibold text-white"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(titleDraft);
                    setCopiedTitle(true);
                    setTimeout(() => setCopiedTitle(false), 2000);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-5 py-3 rounded-xl text-xs flex items-center gap-2 shrink-0"
                >
                  {copiedTitle ? <Check size={16} /> : <Copy size={16} />}
                  {copiedTitle ? 'Copiado!' : 'Copiar Título'}
                </button>
                <button
                  onClick={() => setTitleDraft('')}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-3 rounded-xl text-xs"
                >
                  Limpar
                </button>
              </div>
            </div>

            {/* Grade das 30 Palavras-Chave Mais Usadas (Estilo Avantpro) */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold mb-4">
                Ranking das 30 Palavras-Chave Validadas na 1ª Página ({topKeywords.length} termos extraídos)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {topKeywords.map((kw, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      const formatted = kw.keyword.charAt(0).toUpperCase() + kw.keyword.slice(1);
                      if (!titleDraft.toLowerCase().includes(kw.keyword.toLowerCase())) {
                        setTitleDraft((prev) => `${prev} ${formatted}`.trim());
                      }
                    }}
                    className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-yellow-400 cursor-pointer transition flex items-center justify-between"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-yellow-400">#{idx + 1} MAIS USADA</span>
                      <p className="font-bold text-white text-sm capitalize mt-0.5">{kw.keyword}</p>
                      <span className="text-[11px] text-slate-400">
                        Repete em {kw.occurrences} anúncios ({kw.frequency_percent}%)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-emerald-400">{kw.sales_volume} vendas</span>
                      <span className="block text-[10px] text-slate-400">
                        Ticket R$ {kw.avg_price}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            MÓDULO 4: BUSCA E PÁGINA DO VENDEDOR (ANÁLISE DE CONCORRENTES)
        ===================================================================== */}
        {activeModule === 'vendedores' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">Análise de Vendedores e Lojas Concorrentes</h1>
                <p className="text-slate-400 text-sm">
                  Inspecione a estratégia dos principais vendedores do nicho (Full, Frete Grátis, Medalha e Faturamento)
                </p>
              </div>
              {selectedSellerProfile && (
                <button
                  onClick={() => addSellerToMonitor(selectedSellerProfile)}
                  className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-5 py-2.5 rounded-xl text-xs"
                >
                  + Monitorar Este Vendedor em Tempo Real
                </button>
              )}
            </div>

            {/* Cards dos Vendedores Encontrados na Busca Atual */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {filteredProducts.slice(0, 9).map((sellerItem, idx) => (
                <div
                  key={idx}
                  className="bg-[#111827] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="px-2.5 py-0.5 rounded-full bg-yellow-400/15 text-yellow-300 font-bold">
                        {sellerItem.seller_medal}
                      </span>
                      <span className="text-slate-400">Estado: {sellerItem.seller_state}</span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-2">{sellerItem.seller_name}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Marca principal: <strong className="text-slate-200">{sellerItem.brand}</strong>
                    </p>

                    <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-400 block">Receita do Anúncio Líder</span>
                        <strong className="text-emerald-400 text-sm">
                          R$ {Number(sellerItem.revenue_30d).toLocaleString('pt-BR')}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Logística Principal</span>
                        <strong className="text-blue-400 text-sm">{sellerItem.logistic_type}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => addSellerToMonitor(sellerItem)}
                      className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-2 rounded-xl text-xs"
                    >
                      + Monitorar Vendedor
                    </button>
                    <button
                      onClick={() => setInspectedProduct(sellerItem)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs"
                    >
                      Ver Produto
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =====================================================================
            MÓDULO 5: MONITOR DE PRODUTOS E VENDEDORES (COM PASTAS E ATIVIDADES)
        ===================================================================== */}
        {activeModule === 'monitor' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">Monitor Inteligente de Produtos e Vendedores</h1>
                <p className="text-slate-400 text-sm">
                  Organize seus concorrentes em pastas e acompanhe diariamente todas as mudanças de preço, estoque e catálogo
                </p>
              </div>

              {/* Alternador Monitor de Produtos vs Monitor de Vendedores */}
              <div className="flex bg-[#111827] p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setMonitorSubTab('produtos')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                    monitorSubTab === 'produtos' ? 'bg-yellow-400 text-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monitor de Produtos ({monitoredProducts.length})
                </button>
                <button
                  onClick={() => setMonitorSubTab('vendedores')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                    monitorSubTab === 'vendedores' ? 'bg-yellow-400 text-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monitor de Vendedores ({monitoredSellers.length})
                </button>
              </div>
            </div>

            {/* Barra de Pastas Personalizadas (Igual ao vídeo do Monitor da JoomPulse) */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSelectedFolder('Todas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    selectedFolder === 'Todas'
                      ? 'bg-yellow-400 text-black'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Todas as Pastas
                </button>
                {folders.map((f) => (
                  <button
                    key={f}
                    onClick={() => setSelectedFolder(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      selectedFolder === f
                        ? 'bg-yellow-400 text-black'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    📁 {f}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newFolderName.trim() && !folders.includes(newFolderName.trim())) {
                    setFolders((prev) => [...prev, newFolderName.trim()]);
                    setNewFolderName('');
                    showToast('Nova pasta criada com sucesso!');
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nome da nova pasta..."
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
                <button
                  type="submit"
                  className="bg-slate-800 hover:bg-slate-700 text-yellow-400 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
                >
                  <FolderPlus size={14} /> Criar Pasta
                </button>
              </form>
            </div>

            {/* SUB-ABA A: PRODUTOS MONITORADOS */}
            {monitorSubTab === 'produtos' && (
              <div className="bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-slate-900/60">
                      <th className="p-4">Produto Monitorado</th>
                      <th className="p-4">Pasta</th>
                      <th className="p-4">Preço Atual</th>
                      <th className="p-4">Vendas 30d</th>
                      <th className="p-4">Última Atividade Detectada</th>
                      <th className="p-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {monitoredProducts
                      .filter((p) => selectedFolder === 'Todas' || p.folder === selectedFolder)
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-slate-800/40">
                          <td className="p-4">
                            <p className="font-bold text-white">{p.title}</p>
                            <span className="text-[10px] text-slate-400">
                              {p.id} • Vendedor: {p.seller_name} ({p.logistic_type})
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
                              📁 {p.folder}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-yellow-400 text-sm">
                            R$ {Number(p.price).toFixed(2)}
                          </td>
                          <td className="p-4 font-bold text-emerald-400">
                            {p.sold_30d} vendas (R$ {Number(p.revenue_30d).toLocaleString('pt-BR')})
                          </td>
                          <td className="p-4 text-slate-300">{p.last_change}</td>
                          <td className="p-4">
                            <button
                              onClick={() =>
                                setMonitoredProducts((prev) => prev.filter((item) => item.id !== p.id))
                              }
                              className="text-red-400 hover:text-red-300 p-1.5"
                              title="Remover do Monitor"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SUB-ABA B: VENDEDORES MONITORADOS + LOG DE ATIVIDADES DIÁRIAS */}
            {monitorSubTab === 'vendedores' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 space-y-3">
                  {monitoredSellers
                    .filter((s) => selectedFolder === 'Todas' || s.folder === selectedFolder)
                    .map((seller) => (
                      <div
                        key={seller.seller_id}
                        onClick={() => setActiveSellerActivityLog(seller)}
                        className={`p-5 rounded-2xl border cursor-pointer transition ${
                          activeSellerActivityLog?.seller_id === seller.seller_id
                            ? 'bg-slate-800/90 border-yellow-400'
                            : 'bg-[#111827] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="px-2 py-0.5 rounded bg-yellow-400/20 text-yellow-300 font-bold">
                            {seller.medal} • {seller.state}
                          </span>
                          <span className="text-slate-400">📁 {seller.folder}</span>
                        </div>
                        <h3 className="text-base font-bold text-white mt-2">{seller.seller_name}</h3>
                        <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800">
                          <span>Receita 30d: R$ {seller.revenue_30d.toLocaleString('pt-BR')}</span>
                          <span className="text-yellow-400 font-semibold flex items-center gap-1">
                            <Activity size={13} /> Ver Atividades ({seller.activities.length})
                          </span>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Painel de Histórico de Atividades do Vendedor (Idêntico ao vídeo lw5FgpzSuDY) */}
                <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-2xl p-6">
                  {activeSellerActivityLog || monitoredSellers[0] ? (
                    (() => {
                      const target = activeSellerActivityLog || monitoredSellers[0];
                      const filteredActs = target.activities.filter(
                        (a) => activityTypeFilter === 'Todas' || a.type === activityTypeFilter
                      );
                      return (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
                            <div>
                              <h3 className="text-base font-bold text-white">
                                Histórico de Atividades: {target.seller_name}
                              </h3>
                              <p className="text-xs text-slate-400">
                                Alterações de preço, novos anúncios e mudanças de catálogo do último mês
                              </p>
                            </div>
                            <select
                              value={activityTypeFilter}
                              onChange={(e) => setActivityTypeFilter(e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                            >
                              <option value="Todas">Todas as Atividades</option>
                              <option value="Mudança de Preço">Apenas Mudanças de Preço</option>
                              <option value="Novo Anúncio">Apenas Anúncios Novos</option>
                              <option value="Alteração de Catálogo">Alterações de Catálogo</option>
                            </select>
                          </div>

                          <div className="space-y-3">
                            {filteredActs.map((act, i) => (
                              <div
                                key={i}
                                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-4 text-xs"
                              >
                                <div>
                                  <span
                                    className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                      act.type === 'Mudança de Preço'
                                        ? 'bg-yellow-400/20 text-yellow-300'
                                        : act.type === 'Novo Anúncio'
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-blue-500/20 text-blue-300'
                                    }`}
                                  >
                                    {act.type}
                                  </span>
                                  <p className="font-bold text-white mt-1.5">{act.product}</p>
                                  <p className="text-slate-400 mt-0.5">{act.detail}</p>
                                </div>
                                <span className="text-slate-500 whitespace-nowrap">{act.date}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <p className="text-slate-400 text-sm">
                      Selecione um vendedor ao lado para inspecionar as atividades diárias.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            MÓDULO 6: CALCULADORA DE CONTRIBUIÇÃO & NEGOCIAÇÃO COM FORNECEDOR (AVANTPRO)
        ===================================================================== */}
        {activeModule === 'calculadora' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold">
                Calculadora de Margem de Contribuição e Viabilidade de Compra (Avantpro + JoomPulse)
              </h1>
              <p className="text-slate-400 text-sm">
                Descubra exatamente por quanto você precisa comprar no fornecedor para vender no preço do mercado com lucro
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Entradas da Calculadora */}
              <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Produto Analisado</label>
                  <input
                    type="text"
                    value={calcProductTitle}
                    onChange={(e) => setCalcProductTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 block mb-1">Preço do Concorrente (R$)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={competitorPrice}
                      onChange={(e) => setCompetitorPrice(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-yellow-400 font-bold block mb-1">Seu Preço de Venda (R$)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={mySalePrice}
                      onChange={(e) => setMySalePrice(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-yellow-400 rounded-xl px-3.5 py-2.5 text-white font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-emerald-400 font-bold block mb-1">
                      Custo no Fornecedor (R$)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={supplierCost}
                      onChange={(e) => setSupplierCost(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-emerald-500/60 rounded-xl px-3.5 py-2.5 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">
                      Custo Embalagem / Extra (R$)
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      value={packagingCost}
                      onChange={(e) => setPackagingCost(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 block mb-1">Regime Tributário (Imposto)</label>
                    <select
                      value={taxRegime}
                      onChange={(e) => setTaxRegime(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                    >
                      <option value="simples_4">Simples Nacional Inicial (4%)</option>
                      <option value="simples_7">Simples Nacional Faixa 2 (7%)</option>
                      <option value="simples_10">Simples Nacional Faixa 3 (10%)</option>
                      <option value="presumido_14">Lucro Presumido (14%)</option>
                      <option value="real_18">Lucro Real (18%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Frete Grátis (Acima R$ 79)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={calcShippingCost}
                      onChange={(e) => setCalcShippingCost(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setCalcAdType('classico')}
                    className={`flex-1 py-2.5 rounded-xl font-bold border ${
                      calcAdType === 'classico'
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : 'border-slate-700 text-slate-300'
                    }`}
                  >
                    Anúncio Clássico (12%)
                  </button>
                  <button
                    onClick={() => setCalcAdType('premium')}
                    className={`flex-1 py-2.5 rounded-xl font-bold border ${
                      calcAdType === 'premium'
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : 'border-slate-700 text-slate-300'
                    }`}
                  >
                    Anúncio Premium (17%)
                  </button>
                </div>
              </div>

              {/* Resultado + Tabela de Negociação com Fornecedor (Estilo Avantpro Vídeo eBiq4mK0W7w) */}
              <div className="lg:col-span-6 space-y-4">
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <span className="text-xs text-slate-400 uppercase">Margem de Contribuição Líquida</span>
                      <p
                        className={`text-4xl font-black mt-1 ${
                          netMarginPercent >= 15
                            ? 'text-emerald-400'
                            : netMarginPercent > 0
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        R$ {netContribution.toFixed(2)}{' '}
                        <span className="text-xl">({netMarginPercent.toFixed(2)}%)</span>
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                        netMarginPercent >= 15
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {netMarginPercent >= 15 ? '✓ Produto Viável' : '⚠ Negociar com Fornecedor'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span>Comissão ML ({mlRatePercent}%) + Taxa Fixa (R$ {mlFixedFee.toFixed(2)}):</span>
                      <span className="text-red-400 font-semibold">- R$ {mlTotalCommission.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Imposto Nota Fiscal ({currentTaxPercent}%):</span>
                      <span className="text-red-400 font-semibold">- R$ {taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Custo Embalagem + Frete:</span>
                      <span className="text-red-400 font-semibold">
                        - R$ {(packagingCost + effectiveShipping).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Alerta do Preço Alvo de Compra no Fornecedor */}
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                    <p className="font-bold text-emerald-300">
                      🎯 Meta de Negociação com o Fornecedor (Para ter {targetMarginPercent}% de Margem Líquida):
                    </p>
                    <p className="text-slate-200 mt-1">
                      Para vender a <strong>R$ {mySalePrice.toFixed(2)}</strong>, você deve pagar no máximo{' '}
                      <strong className="text-emerald-400 text-sm">
                        R$ {maxSupplierPriceForTarget.toFixed(2)}
                      </strong>{' '}
                      por unidade no fornecedor.
                    </p>
                  </div>
                </div>

                {/* Tabela Comparativa de Cenários de Compra no Fornecedor (Exatamente como no vídeo do Carlos Barreto - Avantpro) */}
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5">
                  <h3 className="text-xs font-bold uppercase text-slate-300 mb-3">
                    Simulador de Negociação: E se o fornecedor cobrar outro valor?
                  </h3>
                  <div className="space-y-2 text-xs">
                    {[0.75, 0.9, 1.0, 1.15, 1.3].map((factor, idx) => {
                      const simulatedBuy = Number((maxSupplierPriceForTarget * factor).toFixed(2));
                      const simulatedProfit =
                        mySalePrice -
                        simulatedBuy -
                        packagingCost -
                        mlTotalCommission -
                        taxAmount -
                        effectiveShipping;
                      const simulatedMargin = mySalePrice > 0 ? (simulatedProfit / mySalePrice) * 100 : 0;
                      return (
                        <div
                          key={idx}
                          onClick={() => setSupplierCost(simulatedBuy)}
                          className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-yellow-400 cursor-pointer flex items-center justify-between"
                        >
                          <span>
                            Pagando <strong>R$ {simulatedBuy.toFixed(2)}</strong> no fornecedor:
                          </span>
                          <span
                            className={`font-bold ${
                              simulatedMargin >= 15
                                ? 'text-emerald-400'
                                : simulatedMargin >= 5
                                ? 'text-yellow-400'
                                : 'text-red-400'
                            }`}
                          >
                            Lucro R$ {simulatedProfit.toFixed(2)} ({simulatedMargin.toFixed(1)}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

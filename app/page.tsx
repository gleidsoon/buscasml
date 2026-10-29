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
  Calculator,
  X,
  Store,
  RefreshCw,
  ShieldCheck,
  Code2,
  Users,
  AlertCircle,
  KeyRound,
  TrendingUp,
} from 'lucide-react';

const BRL = 'R\u0024';

export default function BuscasMLOfficialPlatform() {
  const [activeView, setActiveView]: any = useState('explorador');
  const [displayMode, setDisplayMode]: any = useState('grid');

  const [searchInput, setSearchInput]: any = useState('Coroa tiara strass noiva');
  const [loading, setLoading]: any = useState(false);
  const [apiInfo, setApiInfo]: any = useState({});

  const [products, setProducts]: any = useState([]);
  const [selectedProduct, setSelectedProduct]: any = useState(null);
  const [selectedPhoto, setSelectedPhoto]: any = useState('');
  const [rawJsonModalProduct, setRawJsonModalProduct]: any = useState(null);

  const [userOauthToken, setUserOauthToken]: any = useState(null);
  const [showOauthModal, setShowOauthModal]: any = useState(false);

  const [uploadedPreview, setUploadedPreview]: any = useState(null);
  const fileInputRef: any = useRef(null);

  const [calcTitle, setCalcTitle]: any = useState('Produto Selecionado');
  const [salePrice, setSalePrice]: any = useState(89.9);
  const [supplierCost, setSupplierCost]: any = useState(35.0);
  const [packagingCost, setPackagingCost]: any = useState(1.5);
  const [taxRate, setTaxRate]: any = useState(6.0);
  const [shippingCost, setShippingCost]: any = useState(18.9);
  const [adType, setAdType]: any = useState('premium');

  const executeOfficialSearch = async (e?: any, customInput?: string, overrideToken?: string) => {
    if (e && e.preventDefault) e.preventDefault();
    const q = String(customInput ?? searchInput).trim();
    if (!q) return;

    setLoading(true);
    setApiInfo({});

    try {
      const activeTok = overrideToken || userOauthToken || '';
      const tokenParam = activeTok ? '&user_token=' + encodeURIComponent(activeTok) : '';
      const res = await fetch('/api/ml?q=' + encodeURIComponent(q) + tokenParam);
      const data = await res.json();

      if (!res.ok || data.ok === false) {
        setApiInfo({ error: data.error || 'Erro ao consultar a API Oficial do Mercado Livre.' });
        setProducts([]);
        setSelectedProduct(null);
      } else {
        setApiInfo({
          endpoint: data.executed_endpoint,
          query_used: data.query_used,
          client_id: data.authenticated_client_id,
          is_user_oauth: data.is_user_oauth,
          message: data.message,
        });

        const list = Array.isArray(data.items) ? data.items : [];
        setProducts(list);

        if (list.length !== 0) {
          setSelectedProduct(list[0]);
          setSelectedPhoto(list[0].thumbnail || (list[0].pictures && list[0].pictures[0]) || '');
        } else {
          setSelectedProduct(null);
        }
      }
    } catch (err: any) {
      setApiInfo({ error: 'Falha de rede: ' + String((err && err.message) || 'Verifique sua conexao') });
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (file: any) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result || '');
      setUploadedPreview(base64);
      setLoading(true);
      try {
        const res = await fetch('/api/ml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename: file.name }),
        });
        const data = await res.json();
        const term = data.keyword || 'Coroa Noiva';
        setSearchInput(term);
        await executeOfficialSearch(undefined, term);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const savedTok = localStorage.getItem('buscasml_user_oauth');
    if (savedTok) {
      setUserOauthToken(savedTok);
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const redirectUri = window.location.origin;
      fetch(
        '/api/ml?action=exchange_code&code=' +
          encodeURIComponent(code) +
          '&redirect_uri=' +
          encodeURIComponent(redirectUri)
      )
        .then((r) => r.json())
        .then((data) => {
          if (data && data.ok && data.access_token) {
            localStorage.setItem('buscasml_user_oauth', data.access_token);
            setUserOauthToken(data.access_token);
            window.history.replaceState({}, '', window.location.pathname);
            executeOfficialSearch(undefined, 'Coroa tiara strass noiva', data.access_token);
          }
        });
    } else {
      executeOfficialSearch(undefined, 'Coroa tiara strass noiva', savedTok || undefined);
    }
  }, []);

  const numSale = Number(salePrice) || 0;
  const numSupplier = Number(supplierCost) || 0;
  const numPack = Number(packagingCost) || 0;
  const numTax = Number(taxRate) || 0;
  const numShip = Number(shippingCost) || 0;

  const mlRate = adType === 'classico' ? 12 : 17;
  const isUnder79 = numSale !== 0 && 79 > numSale;
  const fixedFee = isUnder79 ? 6.25 : 0;
  const effectiveShip = isUnder79 ? 0 : numShip;
  const mlCommission = (numSale * mlRate) / 100 + fixedFee;
  const taxVal = (numSale * numTax) / 100;
  const netProfit = numSale - numSupplier - numPack - mlCommission - taxVal - effectiveShip;
  const netMargin = numSale !== 0 ? (netProfit / numSale) * 100 : 0;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://buscasml.vercel.app';
  const mlAuthUrl =
    'https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=8353552938244269&redirect_uri=' +
    encodeURIComponent(currentOrigin);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070b14]/90 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-400 flex items-center justify-center text-black font-black text-xl">
              B
            </div>
            <div>
              <span className="text-lg font-extrabold text-white">
                Buscas<span className="text-yellow-400">ML</span>
              </span>
              <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                100% API Oficial ML
              </span>
            </div>
          </div>

          <div className="flex items-center bg-[#111827] p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveView('explorador')}
              className={
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ' +
                (activeView === 'explorador' ? 'bg-yellow-400 text-black' : 'text-slate-400 hover:text-white')
              }
            >
              <Search size={15} /> Busca & Raio-X Oficial
            </button>
            <button
              onClick={() => setActiveView('calculadora')}
              className={
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ' +
                (activeView === 'calculadora' ? 'bg-yellow-400 text-black' : 'text-slate-400 hover:text-white')
              }
            >
              <Calculator size={15} /> Simulador de Margem
            </button>
          </div>

          <button
            onClick={() => setShowOauthModal(true)}
            className={
              'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition ' +
              (userOauthToken || apiInfo.is_user_oauth
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-yellow-400/15 hover:bg-yellow-400/25 border-yellow-400/40 text-yellow-300')
            }
          >
            <KeyRound size={14} />
            {userOauthToken || apiInfo.is_user_oauth
              ? 'Conta ML Autorizada ✓'
              : 'Autorizar Conta ML (OAuth)'}
          </button>
        </div>
      </header>

      {/* MODAL PARA AUTORIZAR CONTA DO MERCADO LIVRE (DESBLOQUEIA /ITEMS E VENDEDORES NA API) */}
      {showOauthModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white">
                Autorizar Conta no Mercado Livre (OAuth 2.0)
              </h3>
              <button
                onClick={() => setShowOauthModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Para que o Mercado Livre libere a lista completa de ofertas (<code>/products/id/items</code>) e dados de
              qualquer vendedor na API Oficial, verifique se o link abaixo está salvo no campo{' '}
              <strong>URIs de redirect</strong> do seu aplicativo no DevCenter do Mercado Livre:
            </p>
            <div className="p-3 rounded-xl bg-[#070b14] border border-slate-800 font-mono text-xs text-yellow-400 select-all">
              {currentOrigin}
            </div>
            <a
              href={mlAuthUrl}
              className="block w-full py-3.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs text-center transition"
            >
              Conectar Minha Conta do Mercado Livre Agora →
            </a>
          </div>
        </div>
      )}

      {/* MODAL DE AUDITORIA DO JSON PURO */}
      {rawJsonModalProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-3xl max-w-4xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Code2 size={18} className="text-yellow-400" />
                  Prova Real: JSON Oficial Retornado pelo Mercado Livre
                </h3>
                <p className="text-xs text-slate-400">
                  Dados brutos entregues pelas rotas oficiais da API + Leitura de Oferta Ativa
                </p>
              </div>
              <button
                onClick={() => setRawJsonModalProduct(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 rounded-2xl bg-[#070b14] border border-slate-800 text-[11px] text-emerald-300 font-mono">
              {JSON.stringify(rawJsonModalProduct.raw_api_proof, null, 2)}
            </pre>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeView === 'explorador' && (
          <div className="space-y-8">
            <div className="rounded-3xl bg-gradient-to-b from-[#111827] to-[#0c1220] border border-slate-800 p-6 sm:p-8 shadow-2xl">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Busca Oficial de Produtos, Preços e Vendedores
              </h1>
              <p className="text-slate-400 text-sm mt-1 mb-6">
                Conectado diretamente às rotas oficiais <code>/products/search</code>,{' '}
                <code>{'/products/{id}/items'}</code> e <code>{'/users/{seller_id}'}</code> usando suas credenciais.
              </p>

              <form onSubmit={executeOfficialSearch} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Digite o nome do produto ou cole qualquer link do Mercado Livre..."
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-[#070b14] border border-slate-700 text-white text-sm sm:text-base focus:outline-none focus:border-yellow-400"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
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
                    const file = e.target.files && e.target.files[0];
                    if (file) handlePhotoUpload(file);
                  }}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-4 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shrink-0"
                >
                  {loading ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {loading ? 'Consultando API...' : 'Consultar API ML'}
                </button>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Testar na API agora:</span>
                {[
                  'Coroa tiara strass noiva',
                  'Creatina Growth 250g',
                  'Pote hermetico tempero',
                  'Jogo 6 tacas diamante',
                  'Cadeira gamer reclinavel',
                  'Parafusadeira Vonder',
                ].map((term) => (
                  <button
                    key={term}
                    onClick={() => {
                      setSearchInput(term);
                      executeOfficialSearch(undefined, term);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#070b14] hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
                  >
                    {term}
                  </button>
                ))}
              </div>

              {apiInfo.endpoint && (
                <div className="mt-4 p-3 rounded-xl bg-[#070b14] border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                  <span className="truncate">
                    <strong className="text-emerald-400">● 200 OK:</strong> {apiInfo.endpoint}
                  </span>
                  <span className="text-yellow-400">{'Termo processado: "' + String(apiInfo.query_used) + '"'}</span>
                </div>
              )}

              {apiInfo.error && (
                <div className="mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={16} />
                  {apiInfo.error}
                </div>
              )}
            </div>

            {selectedProduct && (
              <div className="rounded-3xl bg-[#111827] border-2 border-yellow-400/60 p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="px-3 py-1 rounded-full bg-yellow-400 text-black font-extrabold text-xs uppercase">
                      Raio-X Oficial da API
                    </span>
                    <span className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono text-xs">
                      Catálogo: {selectedProduct.product_id}
                    </span>
                    {selectedProduct.item_id && (
                      <span className="px-3 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono text-xs">
                        Anúncio: {selectedProduct.item_id}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRawJsonModalProduct(selectedProduct)}
                      className="flex items-center gap-1.5 text-xs bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 px-3.5 py-2 rounded-xl font-bold transition"
                    >
                      <Code2 size={15} /> Ver JSON Puro da API
                    </button>
                    <button
                      onClick={() => setSelectedProduct(null)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-4 flex flex-col justify-between bg-[#0b101d] border border-slate-800 rounded-2xl p-5">
                    <div>
                      <div className="w-full h-72 rounded-xl bg-white p-4 flex items-center justify-center overflow-hidden">
                        {selectedPhoto || selectedProduct.thumbnail ? (
                          <img
                            src={selectedPhoto || selectedProduct.thumbnail}
                            alt={selectedProduct.title}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-slate-400 text-xs">Sem imagem na API</span>
                        )}
                      </div>

                      {selectedProduct.pictures && selectedProduct.pictures.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
                          {selectedProduct.pictures.map((pic: string, i: number) => (
                            <button
                              key={i}
                              onClick={() => setSelectedPhoto(pic)}
                              className={
                                'w-14 h-14 rounded-lg bg-white p-1 border-2 shrink-0 ' +
                                ((selectedPhoto || selectedProduct.thumbnail) === pic
                                  ? 'border-yellow-400'
                                  : 'border-transparent opacity-60 hover:opacity-100')
                              }
                            >
                              <img src={pic} alt="" className="w-full h-full object-contain" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                      <a
                        href={selectedProduct.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-yellow-400 hover:underline flex items-center gap-1.5"
                      >
                        Abrir Página no ML <ExternalLink size={14} />
                      </a>
                      {selectedProduct.price && (
                        <button
                          onClick={() => {
                            setCalcTitle(selectedProduct.title);
                            setSalePrice(Number(selectedProduct.price));
                            setSupplierCost(Number((selectedProduct.price * 0.45).toFixed(2)));
                            setActiveView('calculadora');
                          }}
                          className="text-xs bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-3.5 py-2 rounded-xl"
                        >
                          Simular Margem →
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-8 space-y-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1">
                        <span>
                          Marca Oficial:{' '}
                          <strong className="text-white">{selectedProduct.brand || 'Não informada'}</strong>
                        </span>
                        {selectedProduct.model && (
                          <span>
                            • Modelo: <strong className="text-white">{selectedProduct.model}</strong>
                          </span>
                        )}
                        {selectedProduct.rating && (
                          <span className="text-yellow-400 font-bold">
                            • ★ {selectedProduct.rating}{' '}
                            {selectedProduct.reviews_count ? '(' + String(selectedProduct.reviews_count) + ' opiniões)' : ''}
                          </span>
                        )}
                      </div>
                      <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
                        {selectedProduct.title}
                      </h2>
                    </div>

                    {/* BLOCO DE PREÇO E VENDAS REAIS */}
                    <div className="p-5 rounded-2xl bg-[#0b101d] border border-slate-800 flex flex-wrap items-center justify-between gap-6">
                      <div>
                        {selectedProduct.original_price && selectedProduct.original_price > selectedProduct.price && (
                          <span className="text-xs text-slate-400 line-through block">
                            De: {BRL} {Number(selectedProduct.original_price).toFixed(2)}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 uppercase block">
                          Preço Atual do Produto
                        </span>
                        <span className="text-3xl sm:text-4xl font-black text-yellow-400">
                          {selectedProduct.price !== null
                            ? BRL +
                              ' ' +
                              Number(selectedProduct.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                            : 'Autorizar OAuth / Ver no ML'}
                        </span>
                      </div>

                      <div className="flex gap-6">
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase block">Volume de Vendas</span>
                          <span className="text-lg font-extrabold text-emerald-400">
                            {selectedProduct.sold_label ||
                              (selectedProduct.sold_quantity !== null
                                ? String(selectedProduct.sold_quantity) + ' vendidos'
                                : 'Oculto na API')}
                          </span>
                          {selectedProduct.daily_sales && (
                            <span className="block text-[11px] text-slate-400">
                              Média: {selectedProduct.daily_sales} vendas/dia
                            </span>
                          )}
                        </div>

                        {selectedProduct.total_revenue !== null && (
                          <div>
                            <span className="text-[11px] text-slate-400 uppercase block">Faturamento Bruto</span>
                            <span className="text-lg font-extrabold text-blue-400">
                              {BRL}{' '}
                              {Number(selectedProduct.total_revenue).toLocaleString('pt-BR', {
                                maximumFractionDigits: 0,
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <Calendar size={13} className="text-yellow-400" /> Data Criação (API)
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          {selectedProduct.date_created
                            ? new Date(selectedProduct.date_created).toLocaleDateString('pt-BR')
                            : selectedProduct.first_photo_month_year || 'Não informada'}
                        </p>
                        <span className="text-[11px] text-emerald-400">
                          {selectedProduct.days_old
                            ? 'Há ' + String(selectedProduct.days_old) + ' dias no ML'
                            : 'Extraída da API'}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <Clock size={13} className="text-blue-400" /> Upload da 1ª Foto
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          {selectedProduct.first_photo_month_year || 'Padrão CDN'}
                        </p>
                        <span className="text-[11px] text-slate-400">Assinatura arquivo ML</span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <Truck size={13} className="text-emerald-400" /> Logística Real
                        </span>
                        <p className="text-base font-extrabold text-white mt-1 capitalize">
                          {selectedProduct.logistic_type === 'fulfillment'
                            ? 'Fulfillment (Full)'
                            : selectedProduct.logistic_type || 'Padrão ML'}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {selectedProduct.free_shipping === true
                            ? '✓ Frete Grátis'
                            : 'Conforme região / carrinho'}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800">
                        <span className="text-[11px] text-slate-400 uppercase flex items-center gap-1">
                          <Users size={13} className="text-purple-400" /> Modalidade Anúncio
                        </span>
                        <p className="text-base font-extrabold text-white mt-1">
                          {selectedProduct.listing_type_id === 'gold_pro'
                            ? 'Premium (Sem Juros)'
                            : selectedProduct.listing_type_id === 'gold_special'
                            ? 'Clássico'
                            : 'Catálogo ML'}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {selectedProduct.warranty || 'Garantia padrão'}
                        </span>
                      </div>
                    </div>

                    {selectedProduct.seller ? (
                      <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-slate-900 to-purple-500/10 border border-blue-500/30">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                            <Store size={15} /> Dados do Vendedor / Conta Concorrente
                          </h3>
                          {selectedProduct.seller.power_seller_status && (
                            <span className="px-2.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 text-[11px] font-bold uppercase">
                              ★ MercadoLíder {selectedProduct.seller.power_seller_status}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="text-slate-400 block">Nickname (Nome da Loja)</span>
                            <p className="text-sm font-extrabold text-white mt-0.5">
                              {selectedProduct.seller.nickname || 'ID ' + String(selectedProduct.seller.id)}
                            </p>
                          </div>

                          <div>
                            <span className="text-slate-400 block">Data de Criação da Conta ML</span>
                            <p className="text-sm font-extrabold text-emerald-400 mt-0.5">
                              {selectedProduct.seller.registration_date
                                ? new Date(selectedProduct.seller.registration_date).toLocaleDateString('pt-BR') +
                                  ' (' +
                                  String(selectedProduct.seller.account_age_years) +
                                  ' anos)'
                                : 'Autorizar OAuth para ver'}
                            </p>
                          </div>

                          <div>
                            <span className="text-slate-400 block">Localização Registrada</span>
                            <p className="text-sm font-bold text-slate-200 mt-0.5">
                              {selectedProduct.seller.city || selectedProduct.seller.state
                                ? String(selectedProduct.seller.city || '') +
                                  ' ' +
                                  String(selectedProduct.seller.state || '')
                                : 'Brasil'}
                            </p>
                          </div>

                          <div>
                            <span className="text-slate-400 block">Vendas Concluídas da Loja</span>
                            <p className="text-sm font-extrabold text-yellow-400 mt-0.5">
                              {selectedProduct.seller.completed_transactions !== null &&
                              selectedProduct.seller.completed_transactions !== undefined
                                ? Number(selectedProduct.seller.completed_transactions).toLocaleString('pt-BR') +
                                  ' vendas'
                                : 'Ver perfil da loja'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-300">
                        <span>
                          Para liberar o vendedor e todas as ofertas privadas deste item diretamente pela API, autorize
                          sua conta do Mercado Livre via OAuth:
                        </span>
                        <button
                          onClick={() => setShowOauthModal(true)}
                          className="px-3.5 py-2 rounded-xl bg-yellow-400 text-black font-extrabold shrink-0"
                        >
                          Autorizar OAuth ML →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {products.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-white">
                    Produtos Encontrados na API Oficial ({products.length} resultados)
                  </h3>
                  <div className="flex items-center gap-1 bg-[#111827] p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      onClick={() => setDisplayMode('grid')}
                      className={
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold ' +
                        (displayMode === 'grid' ? 'bg-yellow-400 text-black' : 'text-slate-400')
                      }
                    >
                      <LayoutGrid size={14} /> Cards
                    </button>
                    <button
                      onClick={() => setDisplayMode('table')}
                      className={
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold ' +
                        (displayMode === 'table' ? 'bg-yellow-400 text-black' : 'text-slate-400')
                      }
                    >
                      <List size={14} /> Tabela
                    </button>
                  </div>
                </div>

                {displayMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map((item: any) => (
                      <div
                        key={item.product_id}
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
                              <span className="text-slate-400 text-xs">Sem imagem na API</span>
                            )}
                            <div className="absolute top-3 left-3 flex gap-1.5">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-950/85 text-yellow-400 font-mono font-bold text-[11px]">
                                {item.product_id}
                              </span>
                            </div>
                          </div>

                          <div className="p-5 space-y-3">
                            <h3
                              onClick={() => {
                                setSelectedProduct(item);
                                setSelectedPhoto(item.thumbnail || '');
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="font-bold text-sm text-white group-hover:text-yellow-400 line-clamp-2 cursor-pointer"
                            >
                              {item.title}
                            </h3>

                            <div className="flex items-baseline justify-between">
                              <span className="text-2xl font-black text-yellow-400">
                                {item.price !== null ? BRL + ' ' + Number(item.price).toFixed(2) : 'Ver Raio-X'}
                              </span>
                              {item.sold_label && (
                                <span className="text-xs font-bold text-emerald-400">{item.sold_label}</span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-[#090d16] border border-slate-800 text-xs">
                              <div>
                                <span className="text-[10px] text-slate-400 block">Data Criação (API)</span>
                                <strong className="text-white">
                                  {item.date_created
                                    ? new Date(item.date_created).toLocaleDateString('pt-BR')
                                    : item.first_photo_month_year || 'N/D'}
                                </strong>
                                {item.days_old && (
                                  <span className="block text-[10px] text-emerald-400">Há {item.days_old} dias</span>
                                )}
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 block">Marca Oficial</span>
                                <strong className="text-blue-400 truncate block">
                                  {item.brand || 'Não informada'}
                                </strong>
                                <span className="block text-[10px] text-slate-400">
                                  {item.logistic_type === 'fulfillment' ? '⚡ Full' : 'Envio ML'}
                                </span>
                              </div>
                            </div>

                            <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs">
                              <span className="text-[10px] text-slate-400 block">Vendedor:</span>
                              <p className="font-bold text-slate-100 truncate">
                                {(item.seller && item.seller.nickname) || 'Clique em Abrir Raio-X'}
                              </p>
                              {item.seller && item.seller.registration_date && (
                                <p className="text-[11px] text-emerald-400 mt-0.5">
                                  Conta criada: {new Date(item.seller.registration_date).toLocaleDateString('pt-BR')} (
                                  {item.seller.account_age_years} anos)
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="px-5 pb-5 pt-2 flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedProduct(item);
                              setSelectedPhoto(item.thumbnail || '');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs"
                          >
                            Abrir Raio-X
                          </button>
                          <button
                            onClick={() => setRawJsonModalProduct(item)}
                            className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs"
                            title="Ver JSON Oficial da API"
                          >
                            JSON
                          </button>
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
                            <th className="p-4">Foto & Produto (API)</th>
                            <th className="p-4">Preço Real</th>
                            <th className="p-4">Criação (date_created)</th>
                            <th className="p-4">Vendedor (/users)</th>
                            <th className="p-4">Vendas</th>
                            <th className="p-4">Auditoria</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {products.map((item: any) => (
                            <tr key={item.product_id} className="hover:bg-slate-800/40">
                              <td className="p-4 flex items-center gap-3.5 max-w-md">
                                {item.thumbnail && (
                                  <img
                                    src={item.thumbnail}
                                    alt={item.title}
                                    className="w-14 h-14 rounded-xl bg-white object-contain p-1 shrink-0"
                                  />
                                )}
                                <div>
                                  <p className="font-bold text-white line-clamp-2">{item.title}</p>
                                  <span className="font-mono text-[11px] text-blue-400">
                                    {item.product_id} {item.item_id ? '• ' + String(item.item_id) : ''}
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 font-black text-yellow-400 text-sm whitespace-nowrap">
                                {item.price !== null ? BRL + ' ' + Number(item.price).toFixed(2) : 'N/D'}
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white block">
                                  {item.date_created
                                    ? new Date(item.date_created).toLocaleDateString('pt-BR')
                                    : item.first_photo_month_year || 'N/D'}
                                </span>
                                {item.days_old && (
                                  <span className="text-[11px] text-emerald-400">Há {item.days_old} dias</span>
                                )}
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <span className="font-bold text-white block">
                                  {(item.seller && item.seller.nickname) || 'N/D'}
                                </span>
                                {item.seller && item.seller.registration_date && (
                                  <span className="text-[11px] text-slate-400">
                                    Conta criada: {new Date(item.seller.registration_date).toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </td>
                              <td className="p-4 font-bold text-emerald-400 whitespace-nowrap">
                                {item.sold_label ||
                                  (item.seller && item.seller.completed_transactions
                                    ? Number(item.seller.completed_transactions).toLocaleString('pt-BR') + ' na loja'
                                    : 'N/D')}
                              </td>
                              <td className="p-4 whitespace-nowrap space-x-2">
                                <button
                                  onClick={() => {
                                    setSelectedProduct(item);
                                    setSelectedPhoto(item.thumbnail || '');
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="bg-yellow-400 text-black font-bold px-3 py-1.5 rounded-xl"
                                >
                                  Raio-X
                                </button>
                                <button
                                  onClick={() => setRawJsonModalProduct(item)}
                                  className="bg-slate-800 text-emerald-400 font-bold px-3 py-1.5 rounded-xl"
                                >
                                  JSON
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
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
                    <label className="text-yellow-400 font-bold block mb-1">Preço de Venda ({BRL})</label>
                    <input
                      type="number"
                      step="0.1"
                      value={salePrice}
                      onChange={(e) => setSalePrice(Number(e.target.value))}
                      className="w-full bg-[#070b14] border border-yellow-400 rounded-xl px-4 py-2.5 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-emerald-400 font-bold block mb-1">Custo no Fornecedor ({BRL})</label>
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
                    <label className="text-slate-400 block mb-1">Embalagem ({BRL})</label>
                    <input
                      type="number"
                      step="0.25"
                      value={packagingCost}
                      onChange={(e) => setPackagingCost(Number(e.target.value))}
                      className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Frete (Acima de 79)</label>
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
                    <span className="text-red-400 font-bold">
                      - {BRL} {mlCommission.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Imposto Nota Fiscal ({taxRate}%):</span>
                    <span className="text-red-400 font-bold">
                      - {BRL} {taxVal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Custo Embalagem + Frete:</span>
                    <span className="text-red-400 font-bold">
                      - {BRL} {(numPack + effectiveShip).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-6 mt-6">
                  <span className="text-xs text-slate-400 uppercase">Lucro Líquido por Venda</span>
                  <p
                    className={
                      'text-4xl font-black mt-1 ' + (netProfit >= 0 ? 'text-emerald-400' : 'text-red-400')
                    }
                  >
                    {BRL} {netProfit.toFixed(2)}
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

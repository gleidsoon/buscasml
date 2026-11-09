'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  Boxes,
  Calculator,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Minus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Tag,
  Trash2,
  TrendingUp,
  Truck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  evaluateListingQuality,
  type AbcClass,
  type ListingQualityCriterionId,
  type ListingQualityReport,
} from '@/lib/mlEngine';
import {
  downloadMediaAsset,
  type CompetitorRow,
  type Dossier,
  type MediaAssetImage,
  type MediaExtractorPayload,
  type MonitoredProduct,
  type MonitoredSeller,
  type SellerDossierPayload,
} from '@/lib/platformTypes';
import { fmtBRL, fmtDec, fmtInt, fmtPct } from '@/components/SearchAndCategoryModules';

function SafeThumb({ src, alt, className = 'max-h-full max-w-full object-contain' }: { src: string | null | undefined; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-900 text-[10px] text-slate-500">
        Sem mídia
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setErr(true)}
      className={className}
    />
  );
}

/* =============================================================================
 * TERMÔMETRO VISUAL DE REPUTAÇÃO DO MERCADO LIVRE (5 CORES OFICIAIS)
 * ============================================================================= */

function ReputationThermometer({ level }: { level: string | null }) {
  const normalized = (level ?? '5_green').toLowerCase();
  const activeStep = normalized.startsWith('1')
    ? 1
    : normalized.startsWith('2')
      ? 2
      : normalized.startsWith('3')
        ? 3
        : normalized.startsWith('4')
          ? 4
          : 5;

  const bars = [
    { step: 1, color: 'bg-red-500', label: 'Crítica' },
    { step: 2, color: 'bg-orange-500', label: 'Baixa' },
    { step: 3, color: 'bg-amber-400', label: 'Regular' },
    { step: 4, color: 'bg-lime-400', label: 'Boa' },
    { step: 5, color: 'bg-emerald-500', label: 'Excelente (Verde)' },
  ];

  const activeInfo = bars.find((b) => b.step === activeStep) ?? bars[4];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-400">Termômetro Oficial de Reputação</span>
        <span className="font-bold text-emerald-300">{activeInfo.label}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {bars.map((b) => (
          <div
            key={b.step}
            className={`h-2.5 rounded-full transition-all ${
              b.step === activeStep
                ? `${b.color} ring-2 ring-white/50`
                : b.step < activeStep
                  ? `${b.color} opacity-35`
                  : 'bg-slate-800'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* =============================================================================
 * MÓDULO 6 — CONCORRÊNCIA & BUSCA DE VENDEDORES (RAIO-X DE LOJA + CURVA ABC)
 * ============================================================================= */

export function SellersAndCompetitorsModule({
  sellerDossier,
  loadingSeller,
  competitorDossier,
  loadingCompetitor,
  onSearchSeller,
  onSearchCompetitorAd,
  onOpenProductCode,
  onToggleMonitorSeller,
  isSellerMonitored,
  onToggleMonitorCompetitor,
  isProductMonitored,
  childrenCompetitorShowcase,
}: {
  sellerDossier: SellerDossierPayload | null;
  loadingSeller: boolean;
  competitorDossier: Dossier | null;
  loadingCompetitor: boolean;
  onSearchSeller: (q: string) => void;
  onSearchCompetitorAd: (q: string) => void;
  onOpenProductCode: (code: string) => void;
  onToggleMonitorSeller: (s: SellerDossierPayload) => void;
  isSellerMonitored: (sellerId: number | null, nickname: string | null) => boolean;
  onToggleMonitorCompetitor?: (row: CompetitorRow) => void;
  isProductMonitored: (code: string | null) => boolean;
  childrenCompetitorShowcase: ReactNode;
}) {
  const [subTab, setSubTab] = useState<'loja' | 'comparador'>('loja');
  const [sellerInput, setSellerInput] = useState('');
  const [compInput, setCompInput] = useState('');
  const [abcFilter, setAbcFilter] = useState<'ALL' | AbcClass>('ALL');

  useEffect(() => {
    if (sellerDossier?.seller.nickname) {
      setSellerInput(sellerDossier.seller.nickname);
    } else if (sellerDossier?.seller.id) {
      setSellerInput(String(sellerDossier.seller.id));
    }
  }, [sellerDossier?.seller.nickname, sellerDossier?.seller.id]);

  useEffect(() => {
    const code = competitorDossier?.mlbuId ?? competitorDossier?.itemId ?? competitorDossier?.productId;
    if (code) setCompInput(code);
  }, [competitorDossier?.mlbuId, competitorDossier?.itemId, competitorDossier?.productId]);

  const portfolioItems = useMemo(() => {
    const items = sellerDossier?.portfolio.items ?? [];
    if (abcFilter === 'ALL') return items;
    return items.filter((i) => i.abcClass === abcFilter);
  }, [sellerDossier, abcFilter]);

  const handleSellerSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!sellerInput.trim()) return;
    onSearchSeller(sellerInput.trim());
  };

  const handleCompSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!compInput.trim()) return;
    onSearchCompetitorAd(compInput.trim());
  };

  const sellerMonitored = sellerDossier
    ? isSellerMonitored(sellerDossier.seller.id, sellerDossier.seller.nickname)
    : false;

  return (
    <section className="space-y-6">
      {/* Cabeçalho + Alternador Raio-X de Lojista vs Comparador de Ofertas */}
      <div className="glass-panel rounded-3xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/35 bg-purple-500/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-purple-300">
              <Users size={12} /> Inteligência Competitiva &amp; Espionagem de Lojas
            </span>
            <h1 className="mt-2 text-xl font-extrabold text-white sm:text-2xl">
              Concorrência &amp; Raio-X de Vendedores
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Audite qualquer lojista por Nickname, ID ou anúncio (Curva ABC 80/15/5 e Reputação) ou compare ofertas equivalentes.
            </p>
          </div>

          <div className="flex rounded-2xl border border-white/10 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setSubTab('loja')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
                subTab === 'loja' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Store size={14} /> Raio-X de Vendedor (Loja)
            </button>
            <button
              type="button"
              onClick={() => setSubTab('comparador')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
                subTab === 'comparador' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users size={14} /> Comparador de Concorrentes
            </button>
          </div>
        </div>

        {subTab === 'loja' ? (
          <div className="mt-5">
            <form onSubmit={handleSellerSubmit} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Store
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-purple-400"
                />
                <input
                  value={sellerInput}
                  onChange={(e) => setSellerInput(e.target.value)}
                  placeholder="Digite o Nickname da loja, Seller ID numérico, link da vitrine ou link/código MLB de um anúncio..."
                  className="w-full rounded-2xl border border-white/10 bg-[#050914]/90 py-3 pl-11 pr-4 text-sm text-white placeholder-slate-400 outline-none focus:border-purple-400"
                />
              </div>
              <button
                type="submit"
                disabled={loadingSeller}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:from-purple-400 hover:to-indigo-500 disabled:opacity-60"
              >
                {loadingSeller ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Mapear Vendedor
              </button>
            </form>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span>Exemplos rápidos:</span>
              {['DEFANTISHOP', '532200362', 'LOJA OFICIAL SAMSUNG', 'WAP OFICIAL', 'MONDIAL OFICIAL'].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setSellerInput(ex);
                    onSearchSeller(ex);
                  }}
                  className="rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1 text-slate-300 hover:border-purple-400/40 hover:text-purple-300"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <form onSubmit={handleCompSubmit} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sky-400"
                />
                <input
                  value={compInput}
                  onChange={(e) => setCompInput(e.target.value)}
                  placeholder="Cole o link de um anúncio ou código MLB / MLBU para listar e comparar ofertas concorrentes..."
                  className="w-full rounded-2xl border border-white/10 bg-[#050914]/90 py-3 pl-11 pr-4 text-sm text-white placeholder-slate-400 outline-none focus:border-sky-400"
                />
              </div>
              <button
                type="submit"
                disabled={loadingCompetitor}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"
              >
                {loadingCompetitor ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                Comparar Ofertas
              </button>
            </form>
          </div>
        )}
      </div>

      {/* CONTEÚDO ABA 1: DOSSIÊ COMPLETO DO VENDEDOR + CURVA ABC */}
      {subTab === 'loja' && sellerDossier && (
        <div className="space-y-6">
          {/* Cabeçalho do Dossiê do Lojista */}
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="glass-panel space-y-4 rounded-3xl p-6 lg:col-span-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-0.5 text-[11px] font-bold text-emerald-300">
                      <Award size={11} className="mr-1 inline" />
                      {sellerDossier.seller.medal}
                    </span>
                    {sellerDossier.seller.officialStoreId && (
                      <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-0.5 text-[11px] font-bold text-sky-300">
                        Loja Oficial #{sellerDossier.seller.officialStoreId}
                      </span>
                    )}
                    <span className="rounded-full border border-white/10 bg-slate-950 px-2.5 py-0.5 font-mono text-[11px] text-slate-300">
                      ID: {sellerDossier.seller.id ?? '—'}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        sellerDossier.seller.isInternational
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {sellerDossier.seller.isInternational ? 'Internacional (CBT)' : 'Operação Nacional (Brasil)'}
                    </span>
                  </div>

                  <h2 className="mt-2.5 text-2xl font-black text-white">
                    {sellerDossier.seller.nickname ?? `Lojista #${sellerDossier.seller.id}`}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1 text-slate-200">
                      <MapPin size={13} className="text-amber-400" />
                      {sellerDossier.seller.city && sellerDossier.seller.state
                        ? `${sellerDossier.seller.city} - ${sellerDossier.seller.state}`
                        : sellerDossier.seller.state ?? 'Brasil'}
                    </span>
                    <span>·</span>
                    <span>
                      {sellerDossier.seller.accountYears !== null
                        ? `${sellerDossier.seller.accountYears} ano(s) de Mercado Livre`
                        : 'Conta verificada'}
                    </span>
                    <span>·</span>
                    <span className="text-sky-300">{sellerDossier.resolvedFrom}</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleMonitorSeller(sellerDossier)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                      sellerMonitored
                        ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                        : 'border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
                    }`}
                  >
                    {sellerMonitored ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                    {sellerMonitored ? 'Vendedor Monitorado' : 'Monitorar Vendedor'}
                  </button>
                  {sellerDossier.seller.storePermalink && (
                    <a
                      href={sellerDossier.seller.storePermalink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                    >
                      <ExternalLink size={14} /> Abrir Loja no ML
                    </a>
                  )}
                </div>
              </div>

              <ReputationThermometer level={sellerDossier.seller.reputationLevel} />

              <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Vendas da Conta</p>
                  <p className="mt-1 text-base font-black text-emerald-400">
                    {sellerDossier.seller.completedSales !== null
                      ? `+${fmtInt(sellerDossier.seller.completedSales)}`
                      : 'Alta reputação'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Taxa Reclamações</p>
                  <p className="mt-1 text-base font-black text-white">
                    {sellerDossier.seller.claimsRate !== null
                      ? fmtPct(sellerDossier.seller.claimsRate * 100)
                      : '< 1,0%'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Envio c/ Atraso</p>
                  <p className="mt-1 text-base font-black text-white">
                    {sellerDossier.seller.delayedHandlingRate !== null
                      ? fmtPct(sellerDossier.seller.delayedHandlingRate * 100)
                      : 'No prazo'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Aval. Positivas</p>
                  <p className="mt-1 text-base font-black text-amber-300">
                    {sellerDossier.seller.positiveRatingPct !== null
                      ? fmtPct(sellerDossier.seller.positiveRatingPct)
                      : '98%+'}
                  </p>
                </div>
              </div>
            </div>

            {/* Métricas Financeiras e Logísticas do Portfólio + Tendência de Vendas */}
            <div className="glass-panel flex flex-col justify-between space-y-4 rounded-3xl p-6 lg:col-span-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Desempenho Estimado do Portfólio Ativo
                  </h3>
                  <p className="text-xs text-slate-400">
                    Consolidado sobre os {sellerDossier.portfolio.portfolioSampleCount} principais anúncios ativos da loja
                  </p>
                </div>

                {sellerDossier.portfolio.salesTrend && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-extrabold ${
                      sellerDossier.portfolio.salesTrend === 'Em Alta'
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : sellerDossier.portfolio.salesTrend === 'Em Queda'
                          ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                          : 'border-sky-400/40 bg-sky-500/15 text-sky-300'
                    }`}
                  >
                    <TrendingUp size={13} /> Tendência: {sellerDossier.portfolio.salesTrend}
                  </span>
                )}
              </div>

              {sellerDossier.portfolio.salesTrendReason && (
                <p className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-300">
                  {sellerDossier.portfolio.salesTrendReason}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                  <p className="text-[11px] font-bold uppercase text-emerald-300">Faturamento Mensal Est.</p>
                  <p className="mt-1 text-2xl font-black text-white">
                    {fmtBRL(sellerDossier.portfolio.estimatedMonthlyRevenue)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-300">
                    ~{fmtInt(sellerDossier.portfolio.estimatedMonthlySales)} vendas/mês
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">
                  <p className="text-[11px] font-bold uppercase text-amber-300">Ticket Médio da Loja</p>
                  <p className="mt-1 text-2xl font-black text-white">
                    {fmtBRL(sellerDossier.portfolio.averageTicket)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-300">
                    Catálogo: {fmtPct(sellerDossier.portfolio.catalogPct)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2.5">
                  <p className="text-[10px] text-slate-400">Envio Full</p>
                  <p className="mt-0.5 font-extrabold text-emerald-400">
                    {fmtPct(sellerDossier.portfolio.fullPct)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2.5">
                  <p className="text-[10px] text-slate-400">Frete Grátis</p>
                  <p className="mt-0.5 font-extrabold text-sky-300">
                    {fmtPct(sellerDossier.portfolio.freeShippingPct)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2.5">
                  <p className="text-[10px] text-slate-400">Premium</p>
                  <p className="mt-0.5 font-extrabold text-amber-300">
                    {fmtPct(sellerDossier.portfolio.premiumPct)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Principais Marcas Trabalhadas pelo Vendedor */}
          {sellerDossier.portfolio.topBrands && sellerDossier.portfolio.topBrands.length > 0 && (
            <div className="glass-panel rounded-3xl p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                  <Tag size={15} className="text-amber-400" />
                  Principais Marcas Trabalhadas por {sellerDossier.seller.nickname ?? 'esta Loja'}
                </h3>
                <span className="text-[11px] text-slate-400">
                  Participação por marca no faturamento estimado do portfólio
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {sellerDossier.portfolio.topBrands.slice(0, 8).map((brand, idx) => (
                  <div
                    key={`${brand.name}-${idx}`}
                    className="rounded-2xl border border-white/10 bg-slate-950/65 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold text-white">
                        #{idx + 1} {brand.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        {fmtPct(brand.sharePct)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{brand.count} anúncio(s)</span>
                      <span className="font-semibold text-emerald-400">{fmtBRL(brand.monthlyRevenue)}/mês</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Portfólio em Curva ABC (A = 80% receita, B = 15%, C = 5%) */}
          <div className="glass-panel space-y-4 rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Portfólio de Anúncios em Curva ABC (Pareto de Receita)
                </h3>
                <p className="text-xs text-slate-400">
                  Identifique imediatamente os carros-chefe que sustentam o faturamento deste concorrente
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    {
                      id: 'ALL',
                      label: `Todos (${sellerDossier.portfolio.portfolioSampleCount})`,
                    },
                    {
                      id: 'A',
                      label: `Curva A · 80% (${sellerDossier.portfolio.abcCounts.A})`,
                    },
                    {
                      id: 'B',
                      label: `Curva B · 15% (${sellerDossier.portfolio.abcCounts.B})`,
                    },
                    {
                      id: 'C',
                      label: `Curva C · 5% (${sellerDossier.portfolio.abcCounts.C})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAbcFilter(tab.id)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                      abcFilter === tab.id
                        ? 'bg-amber-400 text-slate-950'
                        : 'border border-white/10 bg-slate-950 text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-950/90 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3.5 py-3 font-semibold"># / Curva</th>
                    <th className="px-3.5 py-3 font-semibold">Anúncio da Loja</th>
                    <th className="px-3.5 py-3 font-semibold">Preço</th>
                    <th className="px-3.5 py-3 font-semibold">Vendas 30d</th>
                    <th className="px-3.5 py-3 font-semibold">Faturamento 30d</th>
                    <th className="px-3.5 py-3 font-semibold">% Share Loja</th>
                    <th className="px-3.5 py-3 font-semibold">Logística</th>
                    <th className="px-3.5 py-3 text-right font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {portfolioItems.map((it) => {
                    const abcStyle =
                      it.abcClass === 'A'
                        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                        : it.abcClass === 'B'
                          ? 'border-amber-400/40 bg-amber-400/20 text-amber-300'
                          : 'border-slate-500/40 bg-slate-800 text-slate-300';
                    const targetCode = it.id || it.productId || '';

                    return (
                      <tr key={`${it.id}-${it.rank}`} className="transition hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-3.5 py-3">
                          <span className="mr-2 font-bold text-slate-300">#{it.rank}</span>
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${abcStyle}`}>
                            Curva {it.abcClass}
                          </span>
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="flex min-w-[230px] max-w-[340px] items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                              <SafeThumb src={it.image} alt={it.title} />
                            </div>
                            <div className="min-w-0">
                              <p className="line-clamp-2 font-bold text-white">{it.title}</p>
                              <p className="mt-0.5 font-mono text-[10px] text-sky-300">{it.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 font-extrabold text-amber-300">
                          {fmtBRL(it.price)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 font-bold text-white">
                          {fmtInt(it.monthlySales)} un.
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 font-extrabold text-emerald-400">
                          {fmtBRL(it.monthlyRevenue)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3">
                          <p className="font-bold text-sky-300">{fmtPct(it.revenueSharePct)}</p>
                          <p className="text-[10px] text-slate-400">Acum.: {fmtPct(it.cumulativeSharePct)}</p>
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {it.fulfillment && (
                              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                ⚡ Full
                              </span>
                            )}
                            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                              {it.listingType ?? 'Clássico'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => targetCode && onOpenProductCode(targetCode)}
                            className="rounded-lg bg-sky-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-400"
                          >
                            Abrir Raio-X
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'loja' && !sellerDossier && !loadingSeller && (
        <div className="glass-panel rounded-3xl p-10 text-center">
          <Store size={34} className="mx-auto text-purple-400" />
          <h3 className="mt-3 text-base font-bold text-white">
            Descubra os produtos Campeões (Curva A) de qualquer Vendedor
          </h3>
          <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
            Informe o Nickname, Seller ID, link da vitrine ou até mesmo o link de um anúncio para levantar reputação, faturamento mensal e portfólio completo.
          </p>
        </div>
      )}

      {/* CONTEÚDO ABA 2: COMPARADOR DE OFERTAS CONCORRENTES */}
      {subTab === 'comparador' && (
        <div className="space-y-4">
          {competitorDossier ? (
            <div className="glass-panel space-y-4 rounded-3xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <span className="text-[11px] font-bold uppercase text-sky-300">
                    Anúncio Base em Comparação ({competitorDossier.mlbuId ?? competitorDossier.itemId ?? competitorDossier.productId})
                  </span>
                  <h3 className="mt-0.5 text-base font-bold text-white">{competitorDossier.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Preço de referência: <strong className="text-amber-300">{fmtBRL(competitorDossier.price)}</strong> ·{' '}
                    {competitorDossier.competitors.length} ofertas concorrentes mapeadas
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isProductMonitored(
                    competitorDossier.mlbuId ?? competitorDossier.itemId ?? competitorDossier.productId,
                  ) && (
                    <span className="inline-flex items-center gap-1 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-200">
                      <BookmarkCheck size={13} /> Monitorando Base
                    </span>
                  )}
                  {(competitorDossier.mlbuId ?? competitorDossier.itemId ?? competitorDossier.productId) && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenProductCode(
                          (competitorDossier.mlbuId ??
                            competitorDossier.itemId ??
                            competitorDossier.productId) as string,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-200 hover:border-amber-400/40 hover:text-amber-200"
                    >
                      <Zap size={13} /> Abrir Raio-X Completo
                    </button>
                  )}
                </div>
              </div>
              {childrenCompetitorShowcase}
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-10 text-center">
              <Users size={34} className="mx-auto text-sky-400" />
              <h3 className="mt-3 text-base font-bold text-white">
                Cole o link ou código de qualquer anúncio acima para comparar todos os concorrentes
              </h3>
              <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
                Compare preços, diferença percentual, logística Full, modalidade e faturamento estimado de até 40 ofertas equivalentes.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* =============================================================================
 * MÓDULO 7 — MONITOR (PRODUTOS E VENDEDORES SALVOS COM SNAPSHOTS E DELTAS Δ)
 * ============================================================================= */

function DeltaBadge({
  value,
  formatter,
  invertGood = false,
  suffix = '',
}: {
  value: number | null;
  formatter: (n: number) => string;
  invertGood?: boolean;
  suffix?: string;
}) {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 0.001) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
        <Minus size={11} /> Estável
      </span>
    );
  }
  const positive = value > 0;
  const isGood = invertGood ? !positive : positive;
  const cls = isGood ? 'text-emerald-400' : 'text-rose-400';
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const sign = positive ? '+' : '';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${cls}`}>
      <Icon size={12} /> {sign}
      {formatter(value)}
      {suffix}
    </span>
  );
}

export function MonitorModuleView({
  products,
  sellers,
  refreshing,
  onRefreshAll,
  onRefreshSingleProduct,
  onRefreshSingleSeller,
  onAddProductByQuery,
  onAddSellerByQuery,
  onRemoveProduct,
  onRemoveSeller,
  onOpenProductCode,
  onInspectSeller,
}: {
  products: MonitoredProduct[];
  sellers: MonitoredSeller[];
  refreshing: boolean;
  onRefreshAll: () => void;
  onRefreshSingleProduct: (code: string) => void;
  onRefreshSingleSeller: (idOrNick: string) => void;
  onAddProductByQuery: (q: string) => void;
  onAddSellerByQuery: (q: string) => void;
  onRemoveProduct: (code: string) => void;
  onRemoveSeller: (id: string) => void;
  onOpenProductCode: (code: string) => void;
  onInspectSeller: (q: string) => void;
}) {
  const [tab, setTab] = useState<'produtos' | 'vendedores'>('produtos');
  const [quickInput, setQuickInput] = useState('');
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const handleQuickAdd = (e: FormEvent) => {
    e.preventDefault();
    const q = quickInput.trim();
    if (!q) return;
    if (tab === 'produtos') {
      onAddProductByQuery(q);
    } else {
      onAddSellerByQuery(q);
    }
    setQuickInput('');
  };

  return (
    <section className="space-y-6">
      <div className="glass-panel rounded-3xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
              <BookmarkCheck size={12} /> Radar Contínuo de Preço, Estoque &amp; Giro
            </span>
            <h1 className="mt-2 text-xl font-extrabold text-white sm:text-2xl">
              Monitoramento de Produtos &amp; Vendedores
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Acompanhe snapshots históricos salvos no seu navegador e meça variações reais de preço, estoque, vendas acumuladas e giro diário.
            </p>
          </div>

          <button
            type="button"
            disabled={refreshing || (products.length === 0 && sellers.length === 0)}
            onClick={onRefreshAll}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Atualizando Snapshots...' : 'Atualizar Métricas Agora'}
          </button>
        </div>

        {/* Abas Produtos Monitorados vs Vendedores Monitorados + Adição Direta */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="flex rounded-2xl border border-white/10 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setTab('produtos')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                tab === 'produtos' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              Produtos Monitorados ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('vendedores')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                tab === 'vendedores' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              Vendedores Monitorados ({sellers.length})
            </button>
          </div>

          <form onSubmit={handleQuickAdd} className="flex flex-1 gap-2 sm:max-w-md">
            <input
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder={
                tab === 'produtos'
                  ? 'Adicionar anúncio por código MLB / MLBU ou link...'
                  : 'Adicionar loja por Nickname ou Seller ID...'
              }
              className="w-full rounded-xl border border-white/10 bg-[#050914] px-3.5 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={refreshing}
              className="shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
            >
              + Monitorar
            </button>
          </form>
        </div>
      </div>

      {/* LISTA DE PRODUTOS MONITORADOS */}
      {tab === 'produtos' ? (
        products.length === 0 ? (
          <div className="glass-panel rounded-3xl p-10 text-center">
            <Bookmark size={34} className="mx-auto text-amber-400" />
            <h3 className="mt-3 text-base font-bold text-white">Nenhum produto em monitoramento ainda</h3>
            <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
              Clique no botão de salvar (Monitorar) em qualquer busca, ranking ou Raio-X de produto — ou cole o código/link acima para gravar o primeiro snapshot!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((item) => {
              const snaps = item.snapshots;
              const latest = snaps[snaps.length - 1];
              const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
              const deltaPrice =
                latest?.price !== null && prev?.price !== null && prev !== null
                  ? (latest.price ?? 0) - (prev.price ?? 0)
                  : null;
              const deltaStock =
                latest?.stock !== null && prev?.stock !== null && prev !== null
                  ? (latest.stock ?? 0) - (prev.stock ?? 0)
                  : null;
              const deltaSold =
                latest?.soldTotal !== null && prev?.soldTotal !== null && prev !== null
                  ? (latest.soldTotal ?? 0) - (prev.soldTotal ?? 0)
                  : null;
              const deltaDaily =
                latest?.dailySales !== null && prev?.dailySales !== null && prev !== null
                  ? (latest.dailySales ?? 0) - (prev.dailySales ?? 0)
                  : null;
              const expanded = expandedCode === item.code;

              return (
                <div key={item.code} className="glass-panel rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5">
                        <SafeThumb src={item.image} alt={item.title} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-mono font-bold text-sky-300">{item.code}</span>
                          {item.fulfillment && (
                            <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">
                              ⚡ Full
                            </span>
                          )}
                          <span className="text-slate-400">
                            Vendedor: <strong className="text-slate-200">{item.sellerNickname ?? 'ML'}</strong>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenProductCode(item.code)}
                          className="mt-0.5 line-clamp-1 text-left text-sm font-bold text-white hover:text-amber-300"
                        >
                          {item.title}
                        </button>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Clock size={11} /> {snaps.length} snapshot(s) · Última coleta:{' '}
                          {new Date(item.lastUpdatedAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={refreshing}
                        onClick={() => onRefreshSingleProduct(item.code)}
                        className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Atualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenProductCode(item.code)}
                        className="rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-400"
                      >
                        Abrir Raio-X
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedCode(expanded ? null : item.code)}
                        className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200"
                      >
                        Histórico {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveProduct(item.code)}
                        title="Remover do monitoramento"
                        className="rounded-xl border border-red-500/30 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Grade de Métricas Atuais + Variações Δ */}
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Preço Atual (Δ Preço)</p>
                      <p className="mt-1 text-base font-black text-amber-300">{fmtBRL(latest?.price)}</p>
                      <DeltaBadge value={deltaPrice} formatter={(n) => fmtBRL(n)} invertGood />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Estoque Disp. (Δ Estoque)</p>
                      <p className="mt-1 text-base font-black text-white">{fmtInt(latest?.stock)} un.</p>
                      <DeltaBadge value={deltaStock} formatter={(n) => fmtInt(n)} suffix=" un." />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Vendas Totais (Δ Vendas)</p>
                      <p className="mt-1 text-base font-black text-emerald-400">{fmtInt(latest?.soldTotal)} un.</p>
                      <DeltaBadge value={deltaSold} formatter={(n) => fmtInt(n)} suffix=" vendas" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Giro Diário (Δ Giro)</p>
                      <p className="mt-1 text-base font-black text-sky-300">
                        {fmtDec(latest?.dailySales, 1)} / dia
                      </p>
                      <DeltaBadge value={deltaDaily} formatter={(n) => fmtDec(n, 1)} suffix="/dia" />
                    </div>
                  </div>

                  {/* Linha do Tempo de Snapshots */}
                  {expanded && (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/80 p-3">
                      <p className="mb-2 text-xs font-bold text-slate-300">
                        Histórico de Snapshots Capturados ({snaps.length})
                      </p>
                      <table className="min-w-full text-left text-xs">
                        <thead className="text-[10px] uppercase text-slate-400">
                          <tr>
                            <th className="px-2.5 py-1.5">Data / Hora</th>
                            <th className="px-2.5 py-1.5">Preço</th>
                            <th className="px-2.5 py-1.5">Estoque</th>
                            <th className="px-2.5 py-1.5">Vendas Acum.</th>
                            <th className="px-2.5 py-1.5">Giro/Dia</th>
                            <th className="px-2.5 py-1.5">Receita 30d</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {[...snaps].reverse().map((s, idx) => (
                            <tr key={`${s.capturedAt}-${idx}`}>
                              <td className="px-2.5 py-1.5 text-slate-300">
                                {new Date(s.capturedAt).toLocaleString('pt-BR')}
                              </td>
                              <td className="px-2.5 py-1.5 font-bold text-amber-300">{fmtBRL(s.price)}</td>
                              <td className="px-2.5 py-1.5 text-white">{fmtInt(s.stock)}</td>
                              <td className="px-2.5 py-1.5 font-semibold text-emerald-400">
                                {fmtInt(s.soldTotal)}
                              </td>
                              <td className="px-2.5 py-1.5 text-sky-300">{fmtDec(s.dailySales, 1)}/d</td>
                              <td className="px-2.5 py-1.5 text-slate-200">{fmtBRL(s.monthlyRevenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : sellers.length === 0 ? (
        /* VAZIO VENDEDORES */
        <div className="glass-panel rounded-3xl p-10 text-center">
          <Store size={34} className="mx-auto text-purple-400" />
          <h3 className="mt-3 text-base font-bold text-white">Nenhum vendedor monitorado ainda</h3>
          <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
            Adicione um vendedor pelo campo acima ou clique em &ldquo;Monitorar Vendedor&rdquo; dentro do módulo Concorrência &amp; Vendedores!
          </p>
        </div>
      ) : (
        /* LISTA DE VENDEDORES MONITORADOS */
        <div className="space-y-4">
          {sellers.map((sel) => {
            const snaps = sel.snapshots;
            const latest = snaps[snaps.length - 1];
            const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
            const dSales =
              latest?.completedSales !== null && prev?.completedSales !== null && prev !== null
                ? (latest.completedSales ?? 0) - (prev.completedSales ?? 0)
                : null;
            const dRev =
              latest?.monthlyRevenue !== null && prev?.monthlyRevenue !== null && prev !== null
                ? (latest.monthlyRevenue ?? 0) - (prev.monthlyRevenue ?? 0)
                : null;
            const dTicket =
              latest?.avgTicket !== null && prev?.avgTicket !== null && prev !== null
                ? (latest.avgTicket ?? 0) - (prev.avgTicket ?? 0)
                : null;

            return (
              <div key={sel.id} className="glass-panel rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-amber-400/35 bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                        {sel.medal}
                      </span>
                      <span className="text-xs text-slate-400">{sel.cityState}</span>
                    </div>
                    <h3 className="mt-1 text-lg font-extrabold text-white">{sel.nickname}</h3>
                    <p className="text-[11px] text-slate-400">
                      {snaps.length} snapshot(s) · Atualizado em {new Date(sel.lastUpdatedAt).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={refreshing}
                      onClick={() => onRefreshSingleSeller(sel.sellerId ? String(sel.sellerId) : sel.nickname)}
                      className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300"
                    >
                      <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Atualizar
                    </button>
                    <button
                      type="button"
                      onClick={() => onInspectSeller(sel.sellerId ? String(sel.sellerId) : sel.nickname)}
                      className="rounded-xl bg-purple-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-purple-500"
                    >
                      Abrir Raio-X da Loja
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSeller(sel.id)}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 p-1.5 text-red-300"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Vendas Concluídas da Conta</p>
                    <p className="mt-1 text-base font-black text-emerald-400">
                      {fmtInt(latest?.completedSales)}
                    </p>
                    <DeltaBadge value={dSales} formatter={(n) => fmtInt(n)} suffix=" vendas" />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Faturamento Mensal Amostra</p>
                    <p className="mt-1 text-base font-black text-amber-300">
                      {fmtBRL(latest?.monthlyRevenue)}
                    </p>
                    <DeltaBadge value={dRev} formatter={(n) => fmtBRL(n)} />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Ticket Médio da Loja</p>
                    <p className="mt-1 text-base font-black text-white">{fmtBRL(latest?.avgTicket)}</p>
                    <DeltaBadge value={dTicket} formatter={(n) => fmtBRL(n)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* =============================================================================
 * MÓDULO 8 — ANÁLISE DA LISTAGEM (AUDITOR COMPLETO SCORE 0–100 SEO & CONVERSÃO)
 * ============================================================================= */

export function ListingAuditorModule({
  dossier,
  loading,
  monitoredProducts,
  onAuditQuery,
  onOpenFullRaioX,
  onSimulateMargin,
}: {
  dossier: Dossier | null;
  loading: string | null;
  monitoredProducts: MonitoredProduct[];
  onAuditQuery: (q: string) => void;
  onOpenFullRaioX: () => void;
  onSimulateMargin: (d: Dossier) => void;
}) {
  const [input, setInput] = useState('');

  useEffect(() => {
    const code = dossier?.mlbuId ?? dossier?.itemId ?? dossier?.productId ?? dossier?.permalink;
    if (code) setInput(code);
  }, [dossier?.mlbuId, dossier?.itemId, dossier?.productId, dossier?.permalink]);

  const report = useMemo<ListingQualityReport | null>(() => {
    if (!dossier) return null;
    if (dossier.listingQuality) return dossier.listingQuality;
    return evaluateListingQuality({
      title: dossier.title,
      brand: dossier.brand,
      model: dossier.model,
      imagesCount: dossier.images.length,
      videosCount: dossier.videos.length,
      attributesCount: dossier.attributes?.length ?? dossier.pageSignals?.specsAttributes?.length ?? 0,
      descriptionLength: dossier.pageSignals?.descriptionLength ?? 0,
      fulfillment: dossier.fulfillment,
      freeShipping: dossier.freeShipping,
      listingTypeId: dossier.listingTypeId,
      listingTypeLabel: dossier.listingType,
      price: dossier.price,
      sellerMedal: dossier.seller?.medal ?? null,
      reputationLevel: dossier.seller?.reputationLevel ?? null,
      ratingAverage: dossier.ratingAverage ?? dossier.reviewsDetail?.ratingAverage ?? null,
      ratingCount: dossier.ratingCount ?? dossier.reviewsDetail?.totalReviews ?? null,
      dailySales: dossier.velocity?.daily ?? null,
    });
  }, [dossier]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onAuditQuery(input.trim());
  };

  const criterionIcon = (id: ListingQualityCriterionId) => {
    switch (id) {
      case 'title':
        return <FileText size={16} className="text-sky-400" />;
      case 'photos':
        return <Camera size={16} className="text-amber-400" />;
      case 'video':
        return <Film size={16} className="text-purple-400" />;
      case 'specs':
        return <Boxes size={16} className="text-emerald-400" />;
      case 'logistics':
        return <Truck size={16} className="text-teal-400" />;
      case 'modality':
        return <Award size={16} className="text-yellow-400" />;
    }
  };

  const cleanSeoTitle = (dossier?.title ?? '')
    .replace(/\s*[|\-–]\s*(?:Mercado\s*Livre|Frete\s*Gr[áa]tis).*$/i, '')
    .replace(/\s*-\s*R\$\s*[\d.,]+.*$/i, '')
    .trim();
  const titleLen = cleanSeoTitle.length;
  const specs = dossier?.attributes ?? dossier?.pageSignals?.specsAttributes ?? [];

  return (
    <section className="space-y-6">
      {/* Barra de Auditoria de Anúncio */}
      <div className="glass-panel rounded-3xl p-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/35 bg-teal-500/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-teal-300">
          <ClipboardCheck size={12} /> Auditor Técnico de SEO, Mídia &amp; Conversão
        </span>
        <h1 className="mt-2 text-xl font-extrabold text-white sm:text-2xl">
          Análise de Qualidade da Listagem (Score 0 a 100)
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Cole o link ou código de qualquer anúncio (seu ou de concorrentes) para receber o diagnóstico completo nos 6 pilares de ranqueamento do Mercado Livre.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <ClipboardCheck
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-teal-400"
            />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Cole o link do anúncio ou digite um código MLB / MLBU para auditar..."
              className="w-full rounded-2xl border border-white/10 bg-[#050914]/90 py-3 pl-11 pr-4 text-sm text-white placeholder-slate-400 outline-none focus:border-teal-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading !== null}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
            Auditar Anúncio
          </button>
        </form>

        {monitoredProducts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">Auditar do seu Monitor:</span>
            {monitoredProducts.slice(0, 5).map((mp) => (
              <button
                key={mp.code}
                type="button"
                onClick={() => {
                  setInput(mp.code);
                  onAuditQuery(mp.code);
                }}
                className="rounded-lg border border-white/10 bg-slate-950/75 px-2.5 py-1 text-[11px] text-slate-300 hover:border-teal-400/40 hover:text-teal-300"
              >
                {mp.code}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resultado Completo da Auditoria 0-100 */}
      {dossier && report ? (
        <div className="space-y-6">
          {/* Resumo do Anúncio Auditado + Score Circular */}
          <div className="glass-panel rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-2">
                  <SafeThumb src={dossier.images[0]} alt={dossier.title} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-sky-300">
                      {dossier.mlbuId ?? dossier.itemId ?? dossier.productId}
                    </span>
                    <span className="font-extrabold text-amber-300">{fmtBRL(dossier.price)}</span>
                    <span className="text-slate-400">
                      Vendedor: <strong className="text-white">{dossier.seller?.nickname ?? 'ML'}</strong>
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg font-extrabold text-white">{dossier.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onOpenFullRaioX}
                      className="rounded-xl bg-sky-500 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sky-400"
                    >
                      Ver Raio-X Completo &amp; Avaliações
                    </button>
                    <button
                      type="button"
                      onClick={() => onSimulateMargin(dossier)}
                      className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-1.5 text-xs font-bold text-amber-300"
                    >
                      Simular Margem
                    </button>
                  </div>
                </div>
              </div>

              {/* Score Destacado */}
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/75 px-5 py-4">
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Score Geral</p>
                  <p
                    className={`text-4xl font-black ${
                      report.score >= 85
                        ? 'text-emerald-400'
                        : report.score >= 70
                          ? 'text-sky-300'
                          : report.score >= 50
                            ? 'text-amber-300'
                            : 'text-red-400'
                    }`}
                  >
                    {report.score}
                    <span className="text-base font-semibold text-slate-400">/100</span>
                  </p>
                  <p className="text-xs font-bold text-white">{report.levelLabel}</p>
                </div>
                <div className="space-y-1 border-l border-white/10 pl-4 text-xs">
                  <p className="flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 size={13} /> <strong>{report.passedCount}</strong> pilares ideais
                  </p>
                  <p className="flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle size={13} /> <strong>{report.warningCount}</strong> em atenção
                  </p>
                  <p className="flex items-center gap-1.5 text-rose-300">
                    <AlertCircle size={13} /> <strong>{report.criticalCount}</strong> críticos
                  </p>
                </div>
              </div>
            </div>

            {/* Sinais de Conversão, Reputação e Régua SEO do Título */}
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-xs">
                <p className="font-bold uppercase tracking-wide text-amber-300">Régua SEO do Título ({titleLen}/60)</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${
                      titleLen >= 50 && titleLen <= 60 ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.round((titleLen / 60) * 100))}%` }}
                  />
                </div>
                <p className="mt-2 text-slate-300">
                  {titleLen >= 52
                    ? 'Excelente aproveitamento semântico dos 60 caracteres do título.'
                    : `Restam ${Math.max(0, 60 - titleLen)} caracteres livres para incluir modelo, medida ou benefício-chave.`}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-xs">
                <p className="font-bold uppercase tracking-wide text-emerald-300">Diagnóstico de Conversão</p>
                <p className="mt-2 leading-relaxed text-slate-200">{report.conversionSignal}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-xs">
                <p className="font-bold uppercase tracking-wide text-sky-300">Saúde da Conta &amp; Exposição</p>
                <p className="mt-2 leading-relaxed text-slate-200">{report.reputationSignal}</p>
              </div>
            </div>

            {/* Grade dos 6 Pilares */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {report.criteria.map((c) => {
                const badgeCls =
                  c.status === 'ok'
                    ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                    : c.status === 'warning'
                      ? 'border-amber-400/35 bg-amber-400/15 text-amber-300'
                      : 'border-red-500/35 bg-red-500/15 text-red-300';
                const barCls =
                  c.status === 'ok'
                    ? 'bg-emerald-400'
                    : c.status === 'warning'
                      ? 'bg-amber-400'
                      : 'bg-red-500';
                return (
                  <div key={c.id} className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-xs font-bold text-white">
                        {criterionIcon(c.id)} {c.label}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeCls}`}>
                        {c.score}/{c.maxScore} pts
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-200">{c.currentValue}</p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.max(5, c.percentage)}%` }} />
                    </div>
                    <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">{c.recommendation}</p>
                  </div>
                );
              })}
            </div>

            {/* Plano de Ação Prioritário Passo a Passo */}
            {report.actionPlan.length > 0 && (
              <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/[0.08] p-5">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-amber-300">
                  <Zap size={16} /> Plano de Ação Prioritário (+{report.potentialGain} pontos disponíveis)
                </h3>
                <ul className="mt-3 space-y-2 text-xs text-slate-200">
                  {report.actionPlan.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[11px] font-black text-slate-950">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ficha Técnica Completa */}
            {specs.length > 0 && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">
                  Ficha Técnica Estruturada ({specs.length} atributos preenchidos)
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {specs.map((sp, i) => (
                    <div
                      key={`${sp.name}-${i}`}
                      className="flex justify-between gap-2 rounded-xl border border-white/5 bg-slate-900/80 px-3 py-2 text-xs"
                    >
                      <span className="text-slate-400">{sp.name}</span>
                      <strong className="text-right text-white">{sp.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        !loading && (
          <div className="glass-panel rounded-3xl p-10 text-center">
            <ShieldCheck size={36} className="mx-auto text-teal-400" />
            <h3 className="mt-3 text-base font-bold text-white">
              Pronto para auditar qualquer anúncio do Mercado Livre
            </h3>
            <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
              Descubra por que um concorrente ranqueia na primeira página ou quais ajustes exatos faltam para o seu anúncio atingir 100/100 pontos.
            </p>
          </div>
        )
      )}
    </section>
  );
}

/* =============================================================================
 * MÓDULO 9 — CLIPES E IMAGENS (EXTRATOR DE VÍDEOS & GALERIA HD -O.WEBP)
 * ============================================================================= */

export function ClipsAndImagesModule({
  media,
  loading,
  onExtractMedia,
  onOpenProductCode,
}: {
  media: MediaExtractorPayload | null;
  loading: boolean;
  onExtractMedia: (q: string) => void;
  onOpenProductCode: (code: string) => void;
}) {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (media?.query) setInput(media.query);
  }, [media?.query]);
  const [tab, setTab] = useState<'all' | 'official' | 'customer' | 'videos'>('all');
  const [lightbox, setLightbox] = useState<MediaAssetImage | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onExtractMedia(input.trim());
  };

  const visibleImages = useMemo<MediaAssetImage[]>(() => {
    if (!media) return [];
    if (tab === 'official') return media.galleryImages;
    if (tab === 'customer') return media.customerPhotos;
    if (tab === 'videos') return [];
    return [...media.galleryImages, ...media.customerPhotos];
  }, [media, tab]);

  const showVideos = tab === 'all' || tab === 'videos';

  const copyAllUrls = () => {
    if (!media || typeof navigator === 'undefined' || !navigator.clipboard) return;
    const urls = [
      ...media.videos.map((v) => v.url),
      ...visibleImages.map((img) => img.url),
    ].join('\n');
    if (!urls) return;
    void navigator.clipboard.writeText(urls);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  };

  return (
    <section className="space-y-6">
      <div className="glass-panel rounded-3xl p-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-400/35 bg-pink-500/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-pink-300">
          <Film size={12} /> Central de Criativos, Vídeos &amp; Fotos 1200px
        </span>
        <h1 className="mt-2 text-xl font-extrabold text-white sm:text-2xl">
          Buscador e Extrator de Clipes &amp; Imagens HD
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Extraia galerias oficiais em resolução máxima (-O.webp), fotos reais enviadas por compradores e vídeos/clipes por anúncio ou palavra-chave.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <ImageIcon
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-pink-400"
            />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Cole o link/código MLB / MLBU de um anúncio OU digite um nicho (ex: drone camera 4k)..."
              className="w-full rounded-2xl border border-white/10 bg-[#050914]/90 py-3 pl-11 pr-4 text-sm text-white placeholder-slate-400 outline-none focus:border-pink-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 px-6 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />}
            Extrair Mídias HD
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Testar extração por nicho:</span>
          {['smartwatch amoled', 'aspirador robo laser', 'ring light profissional', 'caixa de som bluetooth'].map(
            (kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => {
                  setInput(kw);
                  onExtractMedia(kw);
                }}
                className="rounded-lg border border-white/10 bg-slate-950/75 px-2.5 py-1 text-[11px] text-slate-300 hover:border-pink-400/40 hover:text-pink-300"
              >
                {kw}
              </button>
            ),
          )}
        </div>
      </div>

      {media && (
        <div className="space-y-5">
          {/* Barra de Abas e Ações em Lote */}
          <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  tab === 'all' ? 'bg-amber-400 text-slate-950' : 'bg-slate-950 text-slate-300'
                }`}
              >
                Todas ({media.galleryImages.length + media.customerPhotos.length + media.videos.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('official')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  tab === 'official' ? 'bg-amber-400 text-slate-950' : 'bg-slate-950 text-slate-300'
                }`}
              >
                Fotos Oficiais HD ({media.galleryImages.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('customer')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  tab === 'customer' ? 'bg-amber-400 text-slate-950' : 'bg-slate-950 text-slate-300'
                }`}
              >
                Fotos Reais de Clientes ({media.customerPhotos.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('videos')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  tab === 'videos' ? 'bg-amber-400 text-slate-950' : 'bg-slate-950 text-slate-300'
                }`}
              >
                Vídeos &amp; Clipes ({media.videos.length})
              </button>
            </div>

            <button
              type="button"
              onClick={copyAllUrls}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"
            >
              {copiedAll ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copiedAll ? 'URLs Copiadas!' : 'Copiar Todas as URLs HD'}
            </button>
          </div>

          {/* Seção de Vídeos / Clipes */}
          {showVideos && media.videos.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Film size={16} className="text-purple-400" /> Vídeos &amp; Clipes Encontrados ({media.videos.length})
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {media.videos.map((v, i) => (
                  <div key={`${v.url}-${i}`} className="glass-panel flex flex-col justify-between rounded-2xl p-4">
                    <div>
                      <div className="overflow-hidden rounded-xl bg-black">
                        {v.mimeType === 'mp4' ? (
                          <video
                            src={v.url}
                            poster={v.thumbnail ?? undefined}
                            controls
                            preload="metadata"
                            className="h-52 w-full object-contain"
                          />
                        ) : (
                          <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-center">
                            <Film size={28} className="text-purple-400" />
                            <p className="text-xs font-semibold text-slate-200">
                              Stream / Clip Mercado Livre ({v.mimeType.toUpperCase()})
                            </p>
                          </div>
                        )}
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs font-bold text-white">{v.productTitle}</p>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadMediaAsset(v.url, `clip-${v.itemCode ?? i + 1}`)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 py-2 text-xs font-bold text-white hover:bg-purple-500"
                      >
                        <Download size={13} /> Baixar / Abrir Clip
                      </button>
                      {v.itemCode && (
                        <button
                          type="button"
                          onClick={() => onOpenProductCode(v.itemCode as string)}
                          className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200"
                        >
                          Raio-X
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Galeria de Fotos Oficiais HD e Fotos de Clientes */}
          {visibleImages.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {visibleImages.map((img, idx) => (
                <article key={`${img.url}-${idx}`} className="glass-card flex flex-col overflow-hidden rounded-2xl">
                  <div
                    onClick={() => setLightbox(img)}
                    className="relative flex h-52 cursor-zoom-in items-center justify-center bg-white p-3"
                  >
                    <span
                      className={`absolute left-2.5 top-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        img.source === 'official'
                          ? 'bg-sky-500 text-white'
                          : 'bg-emerald-500 text-slate-950'
                      }`}
                    >
                      {img.source === 'official' ? 'Oficial HD' : 'Foto de Cliente'}
                    </span>
                    <SafeThumb src={img.url} alt={img.title} />
                  </div>

                  <div className="flex flex-1 flex-col justify-between gap-2 p-3.5 text-xs">
                    <div>
                      <p className="line-clamp-2 font-bold text-white">{img.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{img.resolutionLabel}</p>
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          void downloadMediaAsset(img.url, `midia-hd-${img.itemCode ?? idx + 1}`)
                        }
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-amber-400 py-1.5 text-[11px] font-extrabold text-slate-950 hover:bg-amber-300"
                      >
                        <Download size={12} /> Baixar HD
                      </button>
                      {img.itemCode && (
                        <button
                          type="button"
                          onClick={() => onOpenProductCode(img.itemCode as string)}
                          className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:text-amber-300"
                        >
                          Anúncio
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            tab !== 'videos' && (
              <div className="glass-panel rounded-2xl p-8 text-center text-xs text-slate-400">
                Nenhuma imagem encontrada neste filtro específico.
              </div>
            )
          )}
        </div>
      )}

      {!media && !loading && (
        <div className="glass-panel rounded-3xl p-10 text-center">
          <Camera size={34} className="mx-auto text-pink-400" />
          <h3 className="mt-3 text-base font-bold text-white">
            Inspire seus criativos com fotos HD e vídeos dos líderes de vendas
          </h3>
          <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
            Informe o código/link de um anúncio específico ou pesquise uma palavra-chave para extrair galerias completas em alta resolução e fotos reais de clientes.
          </p>
        </div>
      )}

      {/* Modal Lightbox de Visualização em Alta Resolução */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="line-clamp-1 text-sm font-bold text-white">{lightbox.title}</p>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex max-h-[68vh] items-center justify-center rounded-2xl bg-white p-4">
              <SafeThumb src={lightbox.url} alt={lightbox.title} className="max-h-[62vh] object-contain" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-400">{lightbox.resolutionLabel}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void downloadMediaAsset(lightbox.url, `foto-hd-${lightbox.itemCode ?? 'ml'}`)
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950"
                >
                  <Download size={14} /> Baixar em Alta Resolução
                </button>
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  <ExternalLink size={14} /> Abrir Original
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

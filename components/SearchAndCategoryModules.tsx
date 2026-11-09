'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  Boxes,
  Calculator,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  Film,
  Filter,
  Flame,
  Globe,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Store,
  Tag,
  TrendingUp,
  Truck,
  Zap,
} from 'lucide-react';
import { BRAZIL_UFS, extractKeywords, normalizeUf } from '@/lib/mlEngine';
import {
  DEFAULT_ADVANCED_FILTERS,
  DEFAULT_LOCAL_FILTERS,
  exportProductsToCsv,
  type AdvancedFilterState,
  type AdvancedSortKey,
  type CategoryMatrixRow,
  type CategoryOverview,
  type KeywordAnalysis,
  type ModuleId,
  type ProductSummary,
  type RankingPayload,
  type RankingProductItem,
  type RootCategoryItem,
  type TrendsModulePayload,
} from '@/lib/platformTypes';

/* =============================================================================
 * UTILITÁRIOS VISUAIS COMPARTILHADOS
 * ============================================================================= */

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const intFmt = new Intl.NumberFormat('pt-BR');

export function fmtBRL(v: number | null | undefined, fallback = '—'): string {
  return typeof v === 'number' && Number.isFinite(v) ? brlFmt.format(v) : fallback;
}

export function fmtInt(v: number | null | undefined, fallback = '—'): string {
  return typeof v === 'number' && Number.isFinite(v) ? intFmt.format(Math.round(v)) : fallback;
}

export function fmtDec(v: number | null | undefined, digits = 1, fallback = '—'): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : fallback;
}

export function fmtPct(v: number | null | undefined, fallback = '—'): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1).replace('.', ',')}%` : fallback;
}

function parseFilterNum(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function productCodeOf(p: ProductSummary): string | null {
  return p.mlbuId ?? p.itemId ?? p.productId ?? p.permalink;
}

function resolvedUfOf(p: ProductSummary): string | null {
  return normalizeUf(p.sellerState ?? p.seller?.state ?? null);
}

function monthlySalesOf(p: ProductSummary): number {
  if (p.velocity && Number.isFinite(p.velocity.monthly)) return Math.round(p.velocity.monthly);
  return p.soldQuantity ?? 0;
}

function monthlyRevOf(p: ProductSummary): number {
  if (p.revenue && Number.isFinite(p.revenue.monthly)) return p.revenue.monthly;
  if (p.price !== null && p.price > 0) return p.price * monthlySalesOf(p);
  return 0;
}

function imageCoreIdOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(\d+-[A-Z]{2,4}\d+_\d{4,6})/i);
  return m ? m[1].toUpperCase() : null;
}

function normTitleTokens(raw: string): string[] {
  const stop = new Set([
    'para', 'com', 'sem', 'por', 'uma', 'das', 'dos', 'que', 'mais', 'kit', 'novo', 'nova',
    'original', 'envio', 'full', 'gratis', 'luxo', 'promo', 'pronta', 'entrega',
  ]);
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w));
}

function applyAdvancedProductFilters(
  items: ProductSummary[],
  f: AdvancedFilterState,
): ProductSummary[] {
  const minPrice = parseFilterNum(f.priceMin);
  const maxPrice = parseFilterNum(f.priceMax);
  const minSales30 = parseFilterNum(f.sales30dMin);
  const maxSales30 = parseFilterNum(f.sales30dMax);
  const minRev30 = parseFilterNum(f.rev30dMin);
  const maxRev30 = parseFilterNum(f.rev30dMax);
  const minAgeDays = parseFilterNum(f.ageMinDays);
  const maxAgeDays = parseFilterNum(f.ageMaxDays);
  const minRat = f.minRating === 'todos' ? null : Number(f.minRating);

  const sameRefRaw = (f.sameTitleOrImageRef ?? '').trim();
  const refImgCore = imageCoreIdOf(sameRefRaw);
  const refTokens = sameRefRaw ? normTitleTokens(sameRefRaw).slice(0, 6) : [];

  const filtered = items.filter((p) => {
    const price = p.price ?? 0;
    const sales30 = monthlySalesOf(p);
    const rev30 = monthlyRevOf(p);
    const isCat = Boolean(p.isCatalog ?? p.productId);
    const isIntl = Boolean(p.isInternational);
    const uf = resolvedUfOf(p);
    const medalStr = p.seller?.medal ?? '';
    const nickStr = p.seller?.nickname ?? '';
    const isOfficial =
      Boolean(p.seller?.officialStoreId) ||
      /loja\s+oficial/i.test(nickStr) ||
      /oficial/i.test(medalStr);
    const hasMedal = /platinum|gold|silver|l[íi]der/i.test(medalStr);

    if (minPrice !== null && (p.price === null || price < minPrice)) return false;
    if (maxPrice !== null && (p.price === null || price > maxPrice)) return false;
    if (minSales30 !== null && sales30 < minSales30) return false;
    if (maxSales30 !== null && sales30 > maxSales30) return false;
    if (minRev30 !== null && rev30 < minRev30) return false;
    if (maxRev30 !== null && rev30 > maxRev30) return false;

    if (f.modality === 'premium' && p.listingTypeId !== 'gold_pro' && !/premium/i.test(p.listingType ?? '')) {
      return false;
    }
    if (
      f.modality === 'classico' &&
      (p.listingTypeId === 'gold_pro' || /premium/i.test(p.listingType ?? ''))
    ) {
      return false;
    }

    if (f.logistic === 'full' && !p.fulfillment) return false;
    if (f.logistic === 'frete_gratis' && !p.freeShipping) return false;
    if (f.logistic === 'flex' && !p.hasFlex) return false;

    if (f.adType === 'catalogo' && !isCat) return false;
    if (f.adType === 'comum' && isCat) return false;
    if (f.hideCatalog && isCat) return false;
    if (f.hideOfficialStores && isOfficial) return false;
    if (f.hideMedaledSellers && hasMedal) return false;

    if (f.selectedCategories && f.selectedCategories.length > 0) {
      const catKey = p.categoryId ?? p.categoryName ?? '';
      if (!catKey || !f.selectedCategories.includes(catKey)) return false;
    }

    if (f.selectedBrands && f.selectedBrands.length > 0) {
      const brandKey = (p.brand ?? 'Genérica / Própria').trim();
      if (!f.selectedBrands.includes(brandKey)) return false;
    }

    if (minRat !== null && (p.ratingAverage === null || p.ratingAverage < minRat)) return false;

    if (minAgeDays !== null && (p.daysOnAir === null || p.daysOnAir < minAgeDays)) return false;
    if (maxAgeDays !== null && (p.daysOnAir === null || p.daysOnAir > maxAgeDays)) return false;

    if (f.ageRange !== 'todos') {
      if (f.ageRange === 'mais_180') {
        if (p.daysOnAir === null || p.daysOnAir <= 180) return false;
      } else {
        const maxDays = Number(f.ageRange);
        if (p.daysOnAir === null || p.daysOnAir > maxDays) return false;
      }
    }

    if (sameRefRaw) {
      const pImgCore = imageCoreIdOf(p.image);
      const sameImage = Boolean(refImgCore && pImgCore && refImgCore === pImgCore);
      let sameTitle = false;
      if (refTokens.length > 0) {
        const candSet = new Set(normTitleTokens(p.title));
        let hits = 0;
        for (const tk of refTokens) {
          if (candSet.has(tk)) hits++;
        }
        const needed = refTokens.length <= 2 ? 1 : 2;
        sameTitle = hits >= needed;
      }
      if (!sameImage && !sameTitle) return false;
    }

    if (f.origin === 'nacional' && isIntl) return false;
    if (f.origin === 'internacional' && !isIntl) return false;

    if (f.uf && uf !== f.uf.toUpperCase()) return false;

    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (f.sort) {
      case 'faturamento_desc':
        return monthlyRevOf(b) - monthlyRevOf(a);
      case 'vendas_30d_desc':
        return monthlySalesOf(b) - monthlySalesOf(a);
      case 'total_vendidos_desc':
        return (b.soldQuantity ?? 0) - (a.soldQuantity ?? 0);
      case 'menor_preco':
        return (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER);
      case 'maior_preco':
        return (b.price ?? -1) - (a.price ?? -1);
      case 'melhor_avaliacao':
        return (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
      case 'mais_recentes':
        return (a.daysOnAir ?? Number.MAX_SAFE_INTEGER) - (b.daysOnAir ?? Number.MAX_SAFE_INTEGER);
      case 'relevancia':
      default:
        return 0;
    }
  });

  return sorted;
}

function ThumbImg({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-900 text-[10px] font-medium text-slate-500">
        Sem imagem
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="max-h-full max-w-full object-contain"
    />
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  tone = 'text-white',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className="overflow-visible rounded-2xl border border-white/[0.08] bg-slate-950/70 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-sky-400/90">{icon}</span>
      </div>
      <p className={`mt-2 text-xl font-black tabular-nums tracking-tight sm:text-2xl ${tone}`}>
        {value}
      </p>
      {sub && <p className="mt-1 truncate text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

/* =============================================================================
 * MÓDULO 1 — HOME (VISÃO GERAL, AÇÕES RÁPIDAS, RESUMO DO MERCADO & TENDÊNCIAS)
 * ============================================================================= */

export function HomeOverviewModule({
  ranking,
  monitoredProductsCount,
  monitoredSellersCount,
  onNavigate,
  onQuickSearchTerm,
  childrenRankingSection,
}: {
  ranking: RankingPayload | null;
  monitoredProductsCount: number;
  monitoredSellersCount: number;
  onNavigate: (mod: ModuleId) => void;
  onQuickSearchTerm: (term: string) => void;
  childrenRankingSection: ReactNode;
}) {
  const pulse = useMemo(() => {
    const items = ranking?.items ?? [];
    const prices = items.map((x) => x.price).filter((p): p is number => p !== null && p > 0);
    const avgTicket = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const fullCount = items.filter((x) => x.fulfillment).length;
    const fullPct = items.length > 0 ? Math.round((fullCount / items.length) * 100) : 0;
    const totalSoldSample = items.reduce((acc, x) => acc + (x.soldQuantity ?? 0), 0);
    return {
      avgTicket,
      fullPct,
      totalSoldSample,
      trendsCount: ranking?.trends.length ?? 0,
    };
  }, [ranking]);

  const quickActions: {
    id: ModuleId;
    title: string;
    desc: string;
    badge: string;
    icon: ReactNode;
    accent: string;
  }[] = [
    {
      id: 'produtos',
      title: 'Busca Avançada de Produtos',
      desc: 'Faturamento 30d, vendas, modalidade, Full, catálogo, nota e janela de idade (CSV).',
      badge: 'Multi-filtros',
      icon: <Search size={18} className="text-sky-400" />,
      accent: 'hover:border-sky-400/40',
    },
    {
      id: 'locais',
      title: 'Produtos Locais (Brasil vs. CBT)',
      desc: 'Isole estoque nacional de internacional e mapeie concorrentes por Estado (UF).',
      badge: '27 UFs',
      icon: <MapPin size={18} className="text-emerald-400" />,
      accent: 'hover:border-emerald-400/40',
    },
    {
      id: 'categorias',
      title: 'Análise de Categoria & Monopólio',
      desc: 'Matriz Mãe/Filha, concentração Top 5 vendedores/marcas e distribuição de medalhas.',
      badge: 'Árvore Oficial',
      icon: <Layers size={18} className="text-amber-400" />,
      accent: 'hover:border-amber-400/40',
    },
    {
      id: 'tendencias',
      title: 'Tendências & Sazonalidade',
      desc: 'Termos em ascensão cruzados com concorrência, ticket de entrada e adoção Full.',
      badge: 'Em Alta',
      icon: <TrendingUp size={18} className="text-rose-400" />,
      accent: 'hover:border-rose-400/40',
    },
    {
      id: 'vendedores',
      title: 'Raio-X de Vendedores & Lojas',
      desc: 'Dossiê por Nickname ou ID, reputação, faturamento 30d e portfólio em Curva ABC.',
      badge: 'Curva ABC',
      icon: <Store size={18} className="text-purple-400" />,
      accent: 'hover:border-purple-400/40',
    },
    {
      id: 'auditor',
      title: 'Análise da Listagem (0–100)',
      desc: 'Régua SEO 60 chars, fotos HD, vídeo, ficha técnica, logística e plano de ação.',
      badge: 'Auditor SEO',
      icon: <ClipboardCheck size={18} className="text-teal-400" />,
      accent: 'hover:border-teal-400/40',
    },
    {
      id: 'midias',
      title: 'Clipes e Imagens HD',
      desc: 'Extraia e baixe fotos oficiais de alta resolução (-O.webp), reviews e vídeos.',
      badge: 'Download HD',
      icon: <Film size={18} className="text-pink-400" />,
      accent: 'hover:border-pink-400/40',
    },
    {
      id: 'monitor',
      title: 'Monitor de Produtos & Lojas',
      desc: 'Histórico de snapshots com variações de preço, estoque, vendas e giro diário.',
      badge: `${monitoredProductsCount + monitoredSellersCount} salvos`,
      icon: <Bookmark size={18} className="text-amber-300" />,
      accent: 'hover:border-amber-300/40',
    },
  ];

  return (
    <div className="space-y-6">
      {/* F-Pattern: Cabeçalho Executivo Enxuto + KPIs Primários em Destaque */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              Pulso do Mercado Livre
            </h1>
            <p className="text-xs text-slate-400">
              Indicadores em tempo real da categoria ativa ({ranking?.selectedCategory.name ?? 'Geral Brasil'})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('produtos')}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-sm transition hover:bg-amber-300"
            >
              <Search size={14} /> Explorar Produtos
            </button>
            <button
              type="button"
              onClick={() => onNavigate('calculadora')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-400/40 hover:text-amber-300"
            >
              <Calculator size={14} /> Simular Margem
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Ticket Médio dos Líderes"
            value={fmtBRL(pulse.avgTicket)}
            sub={ranking?.selectedCategory.name ?? 'Mercado Livre Brasil'}
            icon={<Tag size={15} />}
            tone="text-amber-300"
          />
          <KpiTile
            label="Domínio Logística Full"
            value={`${pulse.fullPct}%`}
            sub="Share de envio Full no Top Ranking"
            icon={<Truck size={15} />}
            tone="text-emerald-400"
          />
          <KpiTile
            label="Termos em Ascensão"
            value={pulse.trendsCount > 0 ? `${pulse.trendsCount} termos` : 'Carregando...'}
            sub={`Amostra: +${fmtInt(pulse.totalSoldSample)} un. vendidas`}
            icon={<Flame size={15} />}
            tone="text-sky-300"
          />
          <KpiTile
            label="Radar de Monitoramento"
            value={`${monitoredProductsCount} prod · ${monitoredSellersCount} lojas`}
            sub="Snapshots locais com variação Δ"
            icon={<BookmarkCheck size={15} />}
            tone="text-white"
          />
        </div>
      </div>

      {/* Grade Escaneável de Módulos */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Módulos de Inteligência
          </h2>
          <span className="text-xs text-slate-400">Acesso rápido às 8 ferramentas</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((act) => (
            <button
              key={act.id}
              type="button"
              onClick={() => onNavigate(act.id)}
              className={`glass-card group flex flex-col justify-between rounded-2xl p-5 text-left transition ${act.accent}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950/80">
                    {act.icon}
                  </div>
                  <span className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                    {act.badge}
                  </span>
                </div>
                <h3 className="mt-3.5 text-sm font-bold text-white transition group-hover:text-amber-300">
                  {act.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{act.desc}</p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-sky-400">
                <span>Acessar</span>
                <ArrowUpRight size={13} className="transition group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Atalhos Rápidos de Termos do Mês */}
      {ranking && ranking.trends.length > 0 && (
        <div className="glass-panel rounded-2xl p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Termos em Alta no Mês
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tendencias')}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300"
            >
              Ver radar completo →
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ranking.trends.slice(0, 14).map((t) => (
              <button
                key={`${t.position}-${t.keyword}`}
                type="button"
                onClick={() => onQuickSearchTerm(t.keyword)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/75 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-amber-400/40 hover:text-amber-300"
              >
                <span className="font-bold tabular-nums text-amber-400">#{t.position}</span>
                <span>{t.keyword}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ranking Mais Vendidos & Tendências por Categoria */}
      {childrenRankingSection}
    </div>
  );
}

/* =============================================================================
 * MÓDULOS 2 & 3 — BUSCA DE PRODUTOS & PRODUTOS LOCAIS (MULTI-FILTROS + CSV + UF)
 * ============================================================================= */

export function AdvancedProductSearchModule({
  modeVariant,
  result,
  loading,
  filters,
  onPatchFilters,
  onResetFilters,
  onRunSearch,
  onOpenProduct,
  onSimulateProduct,
  onOpenCategory,
  onInspectSeller,
  onToggleMonitorProduct,
  isProductMonitored,
}: {
  modeVariant: 'produtos' | 'locais';
  result: KeywordAnalysis | null;
  loading: string | null;
  filters: AdvancedFilterState;
  onPatchFilters: (patch: Partial<AdvancedFilterState>) => void;
  onResetFilters: () => void;
  onRunSearch: (query: string, hints?: { origin?: string | null; uf?: string | null }) => void;
  onOpenProduct: (p: ProductSummary) => void;
  onSimulateProduct: (p: ProductSummary) => void;
  onOpenCategory: (categoryId: string) => void;
  onInspectSeller: (sellerQuery: string) => void;
  onToggleMonitorProduct: (p: ProductSummary) => void;
  isProductMonitored: (code: string | null) => boolean;
}) {
  const [searchInput, setSearchInput] = useState(result?.query ?? '');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.priceMin || filters.priceMax) count++;
    if (filters.sales30dMin || filters.sales30dMax) count++;
    if (filters.rev30dMin || filters.rev30dMax) count++;
    if (filters.ageMinDays || filters.ageMaxDays || filters.ageRange !== 'todos') count++;
    if (filters.modality !== 'todos') count++;
    if (filters.logistic !== 'todos') count++;
    if (filters.adType !== 'todos') count++;
    if (filters.minRating !== 'todos') count++;
    if (filters.hideOfficialStores) count++;
    if (filters.hideMedaledSellers) count++;
    if (filters.hideCatalog) count++;
    if (filters.sameTitleOrImageRef) count++;
    if (filters.selectedCategories.length > 0) count++;
    if (filters.selectedBrands.length > 0) count++;
    if (filters.uf) count++;
    return count;
  }, [filters]);

  useEffect(() => {
    if (result?.query) {
      setSearchInput(result.query);
    }
  }, [result?.query]);

  const rawProducts = result?.products ?? [];
  const visible = useMemo(
    () => applyAdvancedProductFilters(rawProducts, filters),
    [rawProducts, filters],
  );

  // Categorias e Marcas disponíveis na amostra para filtro múltiplo combinado ("Cérebro")
  const availableCategories = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const p of rawProducts) {
      const key = p.categoryId ?? p.categoryName ?? '';
      if (!key) continue;
      const label = p.categoryName ? `${p.categoryName} (${p.categoryId ?? ''})`.trim() : key;
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { key, label, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rawProducts]);

  const availableBrands = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of rawProducts) {
      const b = (p.brand ?? 'Genérica / Própria').trim();
      if (!b) continue;
      map.set(b, (map.get(b) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [rawProducts]);

  const toggleMultiCategory = (catKey: string) => {
    const cur = filters.selectedCategories ?? [];
    const next = cur.includes(catKey) ? cur.filter((c) => c !== catKey) : [...cur, catKey];
    onPatchFilters({ selectedCategories: next });
  };

  const toggleMultiBrand = (brandName: string) => {
    const cur = filters.selectedBrands ?? [];
    const next = cur.includes(brandName) ? cur.filter((b) => b !== brandName) : [...cur, brandName];
    onPatchFilters({ selectedBrands: next });
  };

  const handleFindSameImageOrTitle = (p: ProductSummary) => {
    const imgCore = imageCoreIdOf(p.image);
    const refValue = imgCore ? `${imgCore} ${p.title}` : p.title;
    setFiltersExpanded(true);
    onPatchFilters({ sameTitleOrImageRef: refValue });
  };

  // Contagem de Estados (UF) presentes na amostra carregada
  const ufCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of rawProducts) {
      const u = resolvedUfOf(p);
      if (u) map.set(u, (map.get(u) ?? 0) + 1);
    }
    return map;
  }, [rawProducts]);

  // Resumo Estatístico do Topo (Preço Médio, Receita Total 30d, Vendas Totais, % Full, % Catálogo)
  const topStats = useMemo(() => {
    const n = Math.max(1, visible.length);
    const prices = visible.map((p) => p.price).filter((x): x is number => x !== null && x > 0);
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const totalRev30d = visible.reduce((acc, p) => acc + monthlyRevOf(p), 0);
    const totalSales30d = visible.reduce((acc, p) => acc + monthlySalesOf(p), 0);
    const totalSoldAcc = visible.reduce((acc, p) => acc + (p.soldQuantity ?? 0), 0);
    const fullPct = visible.length > 0 ? (visible.filter((p) => p.fulfillment).length / n) * 100 : 0;
    const catPct =
      visible.length > 0
        ? (visible.filter((p) => Boolean(p.isCatalog ?? p.productId)).length / n) * 100
        : 0;
    const nationalPct =
      visible.length > 0 ? (visible.filter((p) => !p.isInternational).length / n) * 100 : 0;

    return { avgPrice, totalRev30d, totalSales30d, totalSoldAcc, fullPct, catPct, nationalPct };
  }, [visible]);

  const keywords = useMemo(
    () =>
      result?.keywords ??
      (rawProducts.length > 0 ? extractKeywords(rawProducts.map((p) => p.title)) : null),
    [result?.keywords, rawProducts],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim() || result?.query?.trim() || '';
    if (!q) return;
    onRunSearch(q, {
      origin: filters.origin !== 'todos' ? filters.origin : modeVariant === 'locais' ? 'nacional' : null,
      uf: filters.uf || null,
    });
  };

  const applyQuickPreset = (
    preset:
      | 'alta_receita'
      | 'alto_giro'
      | 'novos_60d'
      | 'oportunidade_140d'
      | 'full_catalogo'
      | 'limpar',
  ) => {
    const base = modeVariant === 'locais' ? DEFAULT_LOCAL_FILTERS : DEFAULT_ADVANCED_FILTERS;
    if (preset === 'limpar') {
      onResetFilters();
      return;
    }
    if (preset === 'alta_receita') {
      onPatchFilters({ ...base, rev30dMin: '10000', sort: 'faturamento_desc' });
    } else if (preset === 'alto_giro') {
      onPatchFilters({ ...base, sales30dMin: '30', sort: 'vendas_30d_desc' });
    } else if (preset === 'novos_60d') {
      onPatchFilters({ ...base, ageMinDays: '0', ageMaxDays: '60', sales30dMin: '5', sort: 'faturamento_desc' });
    } else if (preset === 'oportunidade_140d') {
      onPatchFilters({
        ...base,
        ageMinDays: '0',
        ageMaxDays: '140',
        hideOfficialStores: true,
        hideMedaledSellers: true,
        sort: 'faturamento_desc',
      });
    } else if (preset === 'full_catalogo') {
      onPatchFilters({ ...base, logistic: 'full', adType: 'catalogo', sort: 'faturamento_desc' });
    }
  };

  const sampleSuggestions =
    modeVariant === 'locais'
      ? ['parafusadeira sem fio', 'kit panelas antiaderente', 'cadeira ergonomica escritorio', 'camera seguranca wifi', 'suplemento creatina 300g']
      : ['fone bluetooth anc', 'air fryer 5 litros', 'fechadura digital biometria', 'microfone lapela sem fio', 'smartwatch gps'];

  return (
    <section className="space-y-5">
      {/* F-PATTERN: 5 KPIs Consolidados no Topo Absoluto quando há amostra carregada */}
      {rawProducts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiTile
            label="Preço Médio"
            value={fmtBRL(topStats.avgPrice)}
            sub={`${visible.length} de ${rawProducts.length} anúncios`}
            icon={<Tag size={14} />}
            tone="text-amber-300"
          />
          <KpiTile
            label="Receita Total 30d"
            value={fmtBRL(topStats.totalRev30d)}
            sub="Faturamento mensal da amostra"
            icon={<BarChart3 size={14} />}
            tone="text-emerald-400"
          />
          <KpiTile
            label="Vendas Estimadas 30d"
            value={`${fmtInt(topStats.totalSales30d)} un.`}
            sub={`Acumulado: ${fmtInt(topStats.totalSoldAcc)} un.`}
            icon={<TrendingUp size={14} />}
            tone="text-sky-300"
          />
          <KpiTile
            label="Adoção Full"
            value={fmtPct(topStats.fullPct)}
            sub="Mercado Envios Full"
            icon={<Truck size={14} />}
            tone="text-white"
          />
          <KpiTile
            label={modeVariant === 'locais' ? '% Estoque Nacional' : '% Catálogo'}
            value={fmtPct(modeVariant === 'locais' ? topStats.nationalPct : topStats.catPct)}
            sub={
              modeVariant === 'locais'
                ? `Catálogo: ${fmtPct(topStats.catPct)}`
                : `Nacionais: ${fmtPct(topStats.nationalPct)}`
            }
            icon={modeVariant === 'locais' ? <Globe size={14} /> : <Boxes size={14} />}
            tone="text-purple-300"
          />
        </div>
      )}

      {/* Barra Unificada de Contexto, Presets Rápidos & Filtros Colapsáveis (Sem duplicar hero search gigante) */}
      <div className="glass-panel rounded-3xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-base font-extrabold tracking-tight text-white sm:text-lg">
              {modeVariant === 'locais'
                ? 'Produtos Locais & Estados (UF)'
                : 'Busca Avançada de Produtos'}
            </h1>
            {result?.query && (
              <span className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-300">
                &ldquo;{result.query}&rdquo;
              </span>
            )}
            <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={modeVariant === 'locais' ? 'Trocar produto/UF...' : 'Trocar termo/nicho...'}
                  className="w-44 rounded-xl border border-white/10 bg-slate-950/90 py-1.5 pl-8 pr-2.5 text-xs text-white placeholder-slate-500 outline-none focus:w-56 focus:border-sky-400 sm:w-52"
                />
              </div>
              <button
                type="submit"
                disabled={loading !== null}
                className="inline-flex items-center gap-1 rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : 'Buscar'}
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersExpanded((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                filtersExpanded || activeFiltersCount > 0
                  ? 'border-amber-400/50 bg-amber-400/15 text-amber-300'
                  : 'border-white/10 bg-slate-900/80 text-slate-200 hover:border-white/25'
              }`}
            >
              <Filter size={13} />
              <span>Filtros Avançados</span>
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-black text-slate-950">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={visible.length === 0}
              onClick={() =>
                exportProductsToCsv(
                  visible,
                  modeVariant === 'locais' ? 'buscasml-produtos-locais' : 'buscasml-busca-avancada',
                )
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={13} /> CSV ({visible.length})
            </button>
          </div>
        </div>

        {/* Pílulas de Presets Inteligentes (1-Click) + Sugestões de Nicho */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Presets:
            </span>
            <button
              type="button"
              onClick={() => applyQuickPreset('oportunidade_140d')}
              className="rounded-lg border border-rose-400/35 bg-rose-500/12 px-2.5 py-1 text-[11px] font-bold text-rose-200 transition hover:bg-rose-500/25"
            >
              🎯 Oportunidades 0–140d
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset('alta_receita')}
              className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-400/20"
            >
              💰 Alta Receita (≥ R$ 10k)
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset('alto_giro')}
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              ⚡ Alto Giro (≥ 30/mês)
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset('novos_60d')}
              className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300 transition hover:bg-sky-500/20"
            >
              🌱 Recentes (0–60d)
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset('full_catalogo')}
              className="rounded-lg border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-semibold text-purple-300 transition hover:bg-purple-500/20"
            >
              📦 Catálogo + Full
            </button>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={() => applyQuickPreset('limpar')}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-white"
              >
                <RotateCcw size={11} /> Limpar
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Nichos:</span>
            {sampleSuggestions.slice(0, 4).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSearchInput(s);
                  onRunSearch(s, {
                    origin:
                      filters.origin !== 'todos'
                        ? filters.origin
                        : modeVariant === 'locais'
                          ? 'nacional'
                          : null,
                    uf: filters.uf || null,
                  });
                }}
                className="rounded-lg border border-white/10 bg-slate-950/70 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-amber-400/40 hover:text-amber-300"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Barra Dedicada de Origem + Estados (UF) em destaque no módulo Produtos Locais */}
        {modeVariant === 'locais' && (
          <div className="mt-4 space-y-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
                  Origem:
                </span>
                {(
                  [
                    { id: 'nacional', label: '🇧🇷 Nacional (Brasil)' },
                    { id: 'internacional', label: '🌐 Internacional (CBT)' },
                    { id: 'todos', label: 'Todas' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onPatchFilters({ origin: opt.id })}
                    className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                      filters.origin === opt.id
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'border border-white/10 bg-slate-950/70 text-slate-300 hover:border-emerald-400/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-amber-400" />
                <select
                  value={filters.uf}
                  onChange={(e) => onPatchFilters({ uf: e.target.value })}
                  className="rounded-xl border border-white/15 bg-slate-950 px-3 py-1 text-xs font-semibold text-white outline-none focus:border-amber-400"
                >
                  <option value="">Todos os 27 Estados (Brasil)</option>
                  {BRAZIL_UFS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code} — {u.name} ({u.region})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPatchFilters({ uf: '' })}
                className={`rounded-lg px-2.5 py-0.5 text-[11px] font-bold transition ${
                  !filters.uf
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:text-white'
                }`}
              >
                Brasil ({rawProducts.length})
              </button>
              {['SP', 'PR', 'SC', 'MG', 'RJ', 'RS', 'GO', 'ES', 'BA', 'PE', 'CE', 'DF'].map((ufCode) => {
                const cnt = ufCounts.get(ufCode) ?? 0;
                const active = filters.uf === ufCode;
                return (
                  <button
                    key={ufCode}
                    type="button"
                    onClick={() => onPatchFilters({ uf: active ? '' : ufCode })}
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold tabular-nums transition ${
                      active
                        ? 'bg-amber-400 font-bold text-slate-950'
                        : cnt > 0
                          ? 'border border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                          : 'border border-white/10 bg-slate-950/50 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {ufCode} {cnt > 0 ? `(${cnt})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Painel Completo de Filtros Analíticos ("Cérebro") — Colapsável */}
        {filtersExpanded && (
          <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
            {/* Grade de Faixas Numéricas: Preço, Vendas 30d, Faturamento 30d e Janela de Idade (dias) */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Faixa de Preço (R$)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    inputMode="decimal"
                    placeholder="Mín (ex: 49)"
                    value={filters.priceMin}
                    onChange={(e) => onPatchFilters({ priceMin: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white outline-none focus:border-sky-400"
                  />
                  <input
                    inputMode="decimal"
                    placeholder="Máx (ex: 350)"
                    value={filters.priceMax}
                    onChange={(e) => onPatchFilters({ priceMax: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Vendas Estimadas 30d (un.)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    inputMode="numeric"
                    placeholder="Mín (ex: 15)"
                    value={filters.sales30dMin}
                    onChange={(e) => onPatchFilters({ sales30dMin: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white outline-none focus:border-sky-400"
                  />
                  <input
                    inputMode="numeric"
                    placeholder="Máx (ex: 1000)"
                    value={filters.sales30dMax}
                    onChange={(e) => onPatchFilters({ sales30dMax: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Faturamento Mensal 30d (R$)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    inputMode="decimal"
                    placeholder="Mín (ex: 5000)"
                    value={filters.rev30dMin}
                    onChange={(e) => onPatchFilters({ rev30dMin: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white outline-none focus:border-sky-400"
                  />
                  <input
                    inputMode="decimal"
                    placeholder="Máx"
                    value={filters.rev30dMax}
                    onChange={(e) => onPatchFilters({ rev30dMax: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-sky-400/20 bg-slate-950/60 p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-sky-300">
                  Janela de Idade (Dias no Ar)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    inputMode="numeric"
                    placeholder="Mín (ex: 0)"
                    value={filters.ageMinDays}
                    onChange={(e) => onPatchFilters({ ageMinDays: e.target.value, ageRange: 'todos' })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white outline-none focus:border-sky-400"
                  />
                  <input
                    inputMode="numeric"
                    placeholder="Máx (ex: 140)"
                    value={filters.ageMaxDays}
                    onChange={(e) => onPatchFilters({ ageMaxDays: e.target.value, ageRange: 'todos' })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white outline-none focus:border-sky-400"
                  />
                </div>
              </div>
            </div>

            {/* Exclusões Inteligentes ("Ocultar") + Busca por Mesma Imagem / Título */}
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 lg:col-span-7">
                <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-300">
                  <EyeOff size={12} /> Ocultar:
                </span>
                <button
                  type="button"
                  onClick={() => onPatchFilters({ hideOfficialStores: !filters.hideOfficialStores })}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    filters.hideOfficialStores
                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                      : 'border-white/10 bg-slate-900 text-slate-300 hover:border-amber-400/40'
                  }`}
                >
                  Lojas Oficiais
                </button>
                <button
                  type="button"
                  onClick={() => onPatchFilters({ hideMedaledSellers: !filters.hideMedaledSellers })}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    filters.hideMedaledSellers
                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                      : 'border-white/10 bg-slate-900 text-slate-300 hover:border-amber-400/40'
                  }`}
                >
                  Vendedores com Medalha
                </button>
                <button
                  type="button"
                  onClick={() => onPatchFilters({ hideCatalog: !filters.hideCatalog })}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    filters.hideCatalog
                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                      : 'border-white/10 bg-slate-900 text-slate-300 hover:border-amber-400/40'
                  }`}
                >
                  Catálogo
                </button>
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 lg:col-span-5">
                <ImageIcon size={15} className="shrink-0 text-sky-400" />
                <input
                  value={filters.sameTitleOrImageRef}
                  onChange={(e) => onPatchFilters({ sameTitleOrImageRef: e.target.value })}
                  placeholder="Mesma imagem (URL mlstatic) ou título semelhante..."
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-400 outline-none focus:border-sky-400"
                />
                {filters.sameTitleOrImageRef && (
                  <button
                    type="button"
                    onClick={() => onPatchFilters({ sameTitleOrImageRef: '' })}
                    className="shrink-0 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Filtro Combinado de Múltiplas Categorias e Múltiplas Marcas */}
            {(availableCategories.length > 0 || availableBrands.length > 0) && (
              <div className="grid gap-3 lg:grid-cols-2">
                {availableCategories.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="mb-2 flex items-center justify-between text-[11px]">
                      <span className="font-bold uppercase tracking-wide text-slate-400">
                        Múltiplas Categorias ({filters.selectedCategories.length})
                      </span>
                      {filters.selectedCategories.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onPatchFilters({ selectedCategories: [] })}
                          className="font-semibold text-amber-300 hover:underline"
                        >
                          Todas
                        </button>
                      )}
                    </div>
                    <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                      {availableCategories.slice(0, 12).map((cat) => {
                        const active = filters.selectedCategories.includes(cat.key);
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => toggleMultiCategory(cat.key)}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                              active
                                ? 'border-sky-400 bg-sky-500 text-white'
                                : 'border-white/10 bg-slate-900 text-slate-300 hover:border-sky-400/40'
                            }`}
                          >
                            {cat.label} ({cat.count})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {availableBrands.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="mb-2 flex items-center justify-between text-[11px]">
                      <span className="font-bold uppercase tracking-wide text-slate-400">
                        Múltiplas Marcas ({filters.selectedBrands.length})
                      </span>
                      {filters.selectedBrands.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onPatchFilters({ selectedBrands: [] })}
                          className="font-semibold text-amber-300 hover:underline"
                        >
                          Todas
                        </button>
                      )}
                    </div>
                    <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                      {availableBrands.slice(0, 14).map((b) => {
                        const active = filters.selectedBrands.includes(b.name);
                        return (
                          <button
                            key={b.name}
                            type="button"
                            onClick={() => toggleMultiBrand(b.name)}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                              active
                                ? 'border-purple-400 bg-purple-500 text-white'
                                : 'border-white/10 bg-slate-900 text-slate-300 hover:border-purple-400/40'
                            }`}
                          >
                            {b.name} ({b.count})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Seletores Categóricos */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-400">Modalidade</span>
                <select
                  value={filters.modality}
                  onChange={(e) =>
                    onPatchFilters({ modality: e.target.value as AdvancedFilterState['modality'] })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-sky-400"
                >
                  <option value="todos">Todas</option>
                  <option value="classico">Clássico</option>
                  <option value="premium">Premium</option>
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-400">Logística</span>
                <select
                  value={filters.logistic}
                  onChange={(e) =>
                    onPatchFilters({ logistic: e.target.value as AdvancedFilterState['logistic'] })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-sky-400"
                >
                  <option value="todos">Todas</option>
                  <option value="full">⚡ Full</option>
                  <option value="frete_gratis">Frete Grátis</option>
                  <option value="flex">Envio Flex</option>
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-400">Tipo Anúncio</span>
                <select
                  value={filters.adType}
                  onChange={(e) =>
                    onPatchFilters({ adType: e.target.value as AdvancedFilterState['adType'] })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-sky-400"
                >
                  <option value="todos">Todos</option>
                  <option value="catalogo">Catálogo (BuyBox)</option>
                  <option value="comum">Anúncio Comum</option>
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-400">Nota Mínima</span>
                <select
                  value={filters.minRating}
                  onChange={(e) =>
                    onPatchFilters({ minRating: e.target.value as AdvancedFilterState['minRating'] })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-sky-400"
                >
                  <option value="todos">Qualquer nota</option>
                  <option value="4.0">4,0★ ou mais</option>
                  <option value="4.5">4,5★ ou mais</option>
                  <option value="4.8">4,8★ ou mais</option>
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-400">Idade Anúncio</span>
                <select
                  value={filters.ageRange}
                  onChange={(e) =>
                    onPatchFilters({ ageRange: e.target.value as AdvancedFilterState['ageRange'] })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-sky-400"
                >
                  <option value="todos">Qualquer idade</option>
                  <option value="30">Até 30 dias</option>
                  <option value="60">Até 60 dias</option>
                  <option value="90">Até 90 dias</option>
                  <option value="180">Até 180 dias</option>
                  <option value="mais_180">Mais de 180 dias</option>
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-400">Origem</span>
                <select
                  value={filters.origin}
                  onChange={(e) =>
                    onPatchFilters({ origin: e.target.value as AdvancedFilterState['origin'] })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-sky-400"
                >
                  <option value="todos">Brasil + Internacional</option>
                  <option value="nacional">Nacional (Brasil)</option>
                  <option value="internacional">Internacional (CBT)</option>
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-400">Estado (UF)</span>
                <select
                  value={filters.uf}
                  onChange={(e) => onPatchFilters({ uf: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-sky-400"
                >
                  <option value="">Todas as UFs</option>
                  {BRAZIL_UFS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code} - {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Barra de Ordenação, Termos SEO Vencedores & Alternância Tabela / Cards */}
      {rawProducts.length > 0 && (
        <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className="tabular-nums">
              Exibindo <strong className="text-white">{visible.length}</strong> de {rawProducts.length} anúncios
            </span>
            {filters.uf && (
              <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                UF: {filters.uf}
              </span>
            )}
            {keywords && keywords.words.length > 0 && (
              <div className="hidden items-center gap-1.5 border-l border-white/10 pl-3 xl:flex">
                <span className="text-[11px] font-semibold text-slate-400">Top SEO:</span>
                {keywords.words.slice(0, 6).map((w) => (
                  <button
                    key={w.term}
                    type="button"
                    onClick={() => {
                      setSearchInput(w.term);
                      onRunSearch(w.term);
                    }}
                    className="rounded-md border border-white/10 bg-slate-950/80 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-sky-400/40 hover:text-sky-300"
                  >
                    {w.term} <span className="tabular-nums text-[10px] text-amber-300">{Math.round(w.share * 100)}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <span>Ordenar:</span>
              <select
                value={filters.sort}
                onChange={(e) => onPatchFilters({ sort: e.target.value as AdvancedSortKey })}
                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white outline-none focus:border-sky-400"
              >
                <option value="faturamento_desc">Maior Faturamento 30d</option>
                <option value="vendas_30d_desc">Mais Vendas 30d</option>
                <option value="total_vendidos_desc">Total Histórico de Vendas</option>
                <option value="menor_preco">Menor Preço</option>
                <option value="maior_preco">Maior Preço</option>
                <option value="melhor_avaliacao">Melhor Avaliação</option>
                <option value="mais_recentes">Anúncios Mais Recentes</option>
                <option value="relevancia">Ordem Original</option>
              </select>
            </label>

            <div className="flex rounded-xl border border-white/10 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => onPatchFilters({ view: 'table' })}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition ${
                  filters.view === 'table'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <List size={13} /> Tabela
              </button>
              <button
                type="button"
                onClick={() => onPatchFilters({ view: 'grid' })}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition ${
                  filters.view === 'grid'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <LayoutGrid size={13} /> Cards
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estado Inicial / Vazio / Listagem */}
      {rawProducts.length === 0 ? (
        <div className="glass-panel rounded-3xl p-10 text-center">
          <Search size={30} className="mx-auto text-sky-400" />
          <h3 className="mt-3 text-base font-bold text-white">
            {modeVariant === 'locais'
              ? 'Use a barra superior ou um nicho acima para mapear vendedores por UF'
              : 'Use a barra superior ou clique em um nicho para abrir a matriz analítica'}
          </h3>
          <p className="mx-auto mt-1 max-w-lg text-xs text-slate-400">
            Faturamento 30d, vendas estimadas, logística Full, catálogo e filtros de oportunidade (0–140d).
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-panel rounded-3xl p-8 text-center">
          <p className="text-sm font-bold text-white">
            Nenhum anúncio corresponde aos {activeFiltersCount} filtro(s) ativo(s).
          </p>
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950"
          >
            <RotateCcw size={14} /> Resetar filtros ({rawProducts.length} anúncios)
          </button>
        </div>
      ) : filters.view === 'table' ? (
        /* TABELA ANALÍTICA DENSA COM CABEÇALHO FIXO (STICKY) */
        <div className="glass-panel max-h-[720px] overflow-auto rounded-2xl">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 text-[11px] uppercase tracking-wider text-slate-400 backdrop-blur-md">
              <tr>
                <th className="px-3.5 py-3.5 font-semibold">#</th>
                <th className="px-3.5 py-3.5 font-semibold">Anúncio / Código</th>
                <th className="px-3.5 py-3.5 font-semibold">Preço</th>
                <th className="px-3.5 py-3.5 font-semibold">Vendas 30d</th>
                <th className="px-3.5 py-3.5 font-semibold">Receita 30d</th>
                <th className="px-3.5 py-3.5 font-semibold">Modalidade &amp; Logística</th>
                <th className="px-3.5 py-3.5 font-semibold">Vendedor / UF</th>
                <th className="px-3.5 py-3.5 font-semibold">Nota &amp; Idade</th>
                <th className="px-3.5 py-3.5 text-right font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {visible.map((p, idx) => {
                const code = productCodeOf(p);
                const sales30 = monthlySalesOf(p);
                const rev30 = monthlyRevOf(p);
                const uf = resolvedUfOf(p);
                const isCat = Boolean(p.isCatalog ?? p.productId);
                const monitored = isProductMonitored(code);
                const sellerKey = p.seller?.id
                  ? String(p.seller.id)
                  : p.seller?.nickname ?? code ?? '';

                return (
                  <tr key={`${code ?? 'row'}-${idx}`} className="transition hover:bg-white/[0.03]">
                    <td className="px-3.5 py-3.5 font-extrabold tabular-nums text-amber-300">#{idx + 1}</td>
                    <td className="px-3.5 py-3.5">
                      <div className="flex min-w-[240px] max-w-[340px] items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                          <ThumbImg src={p.image} alt={p.title} />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenProduct(p)}
                            className="line-clamp-2 text-left font-bold text-slate-100 transition hover:text-amber-300"
                          >
                            {p.title}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                            <span className="font-mono text-sky-300">{p.mlbuId ?? p.itemId ?? p.productId ?? '—'}</span>
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5">
                              {isCat ? 'Catálogo' : 'Comum'}
                            </span>
                            {p.isInternational && (
                              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-bold text-rose-300">
                                CBT
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3.5 tabular-nums">
                      <p className="text-sm font-extrabold text-amber-300">{fmtBRL(p.price)}</p>
                      {p.originalPrice && p.price && p.originalPrice > p.price && (
                        <p className="text-[10px] text-slate-500 line-through">{fmtBRL(p.originalPrice)}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3.5 tabular-nums">
                      <p className="font-bold text-white">{fmtInt(sales30)} / mês</p>
                      <p className="text-[11px] text-slate-400">
                        {p.velocity ? `${fmtDec(p.velocity.daily, 1)}/dia` : `Acum.: ${fmtInt(p.soldQuantity)}`}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3.5 tabular-nums">
                      <p className="text-sm font-extrabold text-emerald-400">{fmtBRL(rev30)}</p>
                      <p className="text-[10px] text-slate-400">Total: {fmtInt(p.soldQuantity)} un.</p>
                    </td>
                    <td className="px-3.5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-md border border-white/10 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                          {p.listingType ?? 'Clássico'}
                        </span>
                        {p.fulfillment && (
                          <span className="rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            ⚡ Full
                          </span>
                        )}
                        {p.freeShipping && !p.fulfillment && (
                          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-300">
                            Frete Grátis
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-3.5">
                      <button
                        type="button"
                        onClick={() => sellerKey && onInspectSeller(sellerKey)}
                        className="text-left font-semibold text-slate-200 transition hover:text-amber-300"
                        title="Abrir Raio-X deste vendedor"
                      >
                        {p.seller?.nickname ?? 'Loja Verificada'}
                      </button>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                        {uf && (
                          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 font-bold text-amber-300">
                            {uf}
                          </span>
                        )}
                        <span>{p.seller?.medal ?? 'Ativo'}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3.5 tabular-nums">
                      {p.ratingAverage !== null ? (
                        <p className="inline-flex items-center gap-1 font-bold text-amber-300">
                          <Star size={11} className="fill-amber-400 text-amber-400" />
                          {fmtDec(p.ratingAverage, 1)}{' '}
                          <span className="font-normal text-slate-400">({fmtInt(p.ratingCount ?? 0)})</span>
                        </p>
                      ) : (
                        <p className="text-slate-500">Sem nota</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {p.daysOnAir !== null ? `${fmtInt(p.daysOnAir)}d no ar` : 'Idade n/d'}
                      </p>
                    </td>
                    <td className="px-3.5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* 1 Primary Action por linha + Secondary Ghost Icon Buttons */}
                        <button
                          type="button"
                          onClick={() => onOpenProduct(p)}
                          disabled={!code}
                          className="rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 transition hover:bg-amber-300 disabled:opacity-40"
                        >
                          Raio-X
                        </button>
                        <button
                          type="button"
                          onClick={() => onSimulateProduct(p)}
                          title="Simular margem na calculadora"
                          className="rounded-lg border border-white/10 bg-slate-900/90 p-1.5 text-slate-300 transition hover:border-amber-400/40 hover:text-amber-300"
                        >
                          <Calculator size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFindSameImageOrTitle(p)}
                          title="Buscar mesma imagem ou título"
                          className="rounded-lg border border-white/10 bg-slate-900/90 p-1.5 text-slate-300 transition hover:border-sky-400/40 hover:text-sky-300"
                        >
                          <ImageIcon size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleMonitorProduct(p)}
                          title={monitored ? 'Remover do Monitor' : 'Monitorar Produto'}
                          className={`rounded-lg border p-1.5 transition ${
                            monitored
                              ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-300'
                              : 'border-white/10 bg-slate-900/90 text-slate-300 hover:border-amber-400/40 hover:text-amber-300'
                          }`}
                        >
                          {monitored ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* VISÃO EM CARDS ANALÍTICOS */
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p, idx) => {
            const code = productCodeOf(p);
            const sales30 = monthlySalesOf(p);
            const rev30 = monthlyRevOf(p);
            const uf = resolvedUfOf(p);
            const monitored = isProductMonitored(code);
            const sellerKey = p.seller?.id ? String(p.seller.id) : p.seller?.nickname ?? '';

            return (
              <article key={`${code ?? 'card'}-${idx}`} className="glass-card flex flex-col overflow-hidden rounded-2xl">
                <div className="relative flex h-44 items-center justify-center bg-white p-4">
                  <span className="absolute left-3 top-3 rounded-lg bg-slate-950/85 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-300">
                    #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleMonitorProduct(p)}
                    title={monitored ? 'Monitorado' : 'Monitorar Produto'}
                    className={`absolute right-3 top-3 rounded-lg p-1.5 shadow transition ${
                      monitored
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-950/80 text-slate-200 hover:text-amber-300'
                    }`}
                  >
                    {monitored ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  </button>
                  <ThumbImg src={p.image} alt={p.title} />
                </div>

                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <span className="rounded-md border border-white/10 bg-slate-900 px-2 py-0.5 font-semibold text-slate-200">
                      {p.listingType ?? 'Clássico'}
                    </span>
                    {p.fulfillment && (
                      <span className="rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">
                        ⚡ Full
                      </span>
                    )}
                    {uf && (
                      <span className="rounded-md border border-amber-400/35 bg-amber-400/12 px-2 py-0.5 font-bold text-amber-300">
                        {uf}
                      </span>
                    )}
                    {p.categoryId && (
                      <button
                        type="button"
                        onClick={() => onOpenCategory(p.categoryId as string)}
                        className="rounded-md border border-white/10 bg-slate-900 px-2 py-0.5 text-slate-300 hover:text-amber-300"
                      >
                        {p.categoryId}
                      </button>
                    )}
                  </div>

                  <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-white">{p.title}</h3>

                  <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                    <button
                      type="button"
                      onClick={() => sellerKey && onInspectSeller(sellerKey)}
                      className="flex min-w-0 items-center gap-1.5 truncate hover:text-amber-300"
                    >
                      <Store size={12} className="shrink-0 text-emerald-400" />
                      <span className="truncate font-semibold">{p.seller?.nickname ?? 'Loja Oficial ML'}</span>
                    </button>
                    {p.ratingAverage !== null && (
                      <span className="inline-flex shrink-0 items-center gap-1 font-bold tabular-nums text-amber-300">
                        <Star size={11} className="fill-amber-400 text-amber-400" />
                        {fmtDec(p.ratingAverage, 1)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline justify-between pt-1 tabular-nums">
                    <p className="text-2xl font-black text-amber-300">{fmtBRL(p.price)}</p>
                    <span className="text-[11px] text-slate-400">
                      {p.daysOnAir !== null ? `${fmtInt(p.daysOnAir)}d no ar` : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.08] bg-slate-950/60 p-3 text-xs tabular-nums">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Vendas 30d</p>
                      <p className="font-bold text-white">{fmtInt(sales30)} un.</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Receita 30d</p>
                      <p className="font-bold text-emerald-400">{fmtBRL(rev30)}</p>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenProduct(p)}
                      disabled={!code}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 py-2 text-xs font-extrabold text-slate-950 transition hover:bg-amber-300 disabled:opacity-40"
                    >
                      <Search size={13} /> Raio-X
                    </button>
                    <button
                      type="button"
                      onClick={() => onSimulateProduct(p)}
                      title="Simular Margem"
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-amber-400/40 hover:text-amber-300"
                    >
                      <Calculator size={13} /> Margem
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFindSameImageOrTitle(p)}
                      title="Buscar mesma imagem/título"
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-slate-900 p-2 text-slate-300 hover:border-sky-400/40 hover:text-sky-300"
                    >
                      <ImageIcon size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* =============================================================================
 * MÓDULO 4 — ANÁLISE DE CATEGORIA (ÁRVORE OFICIAL + MONOPÓLIO + DISTRIBUIÇÕES)
 * ============================================================================= */

export function CategoryAnalysisModule({
  rootCategories,
  matrixRows,
  matrixLoading,
  categoryResult,
  loading,
  onSelectCategory,
  onSearchCategoryQuery,
  onOpenProduct,
  onSimulateProduct,
  onInspectSeller,
  onUseCategoryFees,
  onPickTrendKeyword,
  onToggleMonitorProduct,
  isProductMonitored,
}: {
  rootCategories: RootCategoryItem[];
  matrixRows: CategoryMatrixRow[];
  matrixLoading?: boolean;
  categoryResult: KeywordAnalysis | null;
  loading: string | null;
  onSelectCategory: (categoryId: string) => void;
  onSearchCategoryQuery: (q: string) => void;
  onOpenProduct: (p: ProductSummary) => void;
  onSimulateProduct: (p: ProductSummary) => void;
  onInspectSeller: (sellerQuery: string) => void;
  onUseCategoryFees: (cat: CategoryOverview) => void;
  onPickTrendKeyword: (kw: string) => void;
  onToggleMonitorProduct: (p: ProductSummary) => void;
  isProductMonitored: (code: string | null) => boolean;
}) {
  const [catInput, setCatInput] = useState('');
  const category = categoryResult?.category ?? null;
  const analytics = category?.analytics ?? null;
  const products = categoryResult?.products ?? [];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = catInput.trim();
    if (!clean) return;
    if (/^MLB\d+$/i.test(clean)) {
      onSelectCategory(clean.toUpperCase());
    } else {
      onSearchCategoryQuery(clean);
    }
  };

  const monopolyTone =
    analytics?.monopolyLevel === 'Baixo'
      ? {
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          bar: 'from-emerald-500 to-teal-400',
        }
      : analytics?.monopolyLevel === 'Alto'
        ? {
            badge: 'bg-red-500/20 text-red-300 border-red-500/40',
            bar: 'from-red-500 to-rose-400',
          }
        : {
            badge: 'bg-amber-400/20 text-amber-300 border-amber-400/40',
            bar: 'from-amber-400 to-yellow-500',
          };

  return (
    <section className="space-y-6">
      {/* Barra Compacta de Navegação da Árvore Oficial & Seletor de Nicho */}
      <div className="glass-panel rounded-3xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Layers size={18} className="text-amber-400" />
            <h1 className="text-base font-extrabold tracking-tight text-white sm:text-lg">
              Análise de Categoria &amp; Monopólio
            </h1>
            {category && (
              <span className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                {category.name} ({category.id})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category?.id ?? ''}
              onChange={(e) => e.target.value && onSelectCategory(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white outline-none focus:border-amber-400"
            >
              <option value="">Selecionar Macro-Categoria Oficial (32 nichos)...</option>
              {rootCategories.map((rc) => (
                <option key={rc.id} value={rc.id}>
                  {rc.name} ({rc.id})
                </option>
              ))}
            </select>

            <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
              <input
                value={catInput}
                onChange={(e) => setCatInput(e.target.value)}
                placeholder="Nicho ou código MLB..."
                className="w-40 rounded-xl border border-white/10 bg-slate-950/90 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:w-52 focus:border-amber-400 sm:w-48"
              />
              <button
                type="submit"
                disabled={loading !== null}
                className="inline-flex items-center gap-1 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-extrabold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : 'Analisar'}
              </button>
            </form>

            {category && (
              <button
                type="button"
                onClick={() => onUseCategoryFees(category)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-amber-400/40 hover:text-amber-300"
              >
                <Calculator size={13} /> Simular Taxas
              </button>
            )}
          </div>
        </div>

        {/* Pílulas rápidas de categorias raiz quando nenhuma selecionada */}
        {!category && rootCategories.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-3">
            {rootCategories.slice(0, 12).map((rc) => (
              <button
                key={rc.id}
                type="button"
                onClick={() => onSelectCategory(rc.id)}
                className="rounded-lg border border-white/10 bg-slate-950/75 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-amber-400/45 hover:text-amber-300"
              >
                {rc.name}
              </button>
            ))}
          </div>
        )}

        {/* Árvore Breadcrumb + Subcategorias Diretas */}
        {category && (
          <div className="mt-3.5 space-y-2.5 border-t border-white/[0.07] pt-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold text-slate-400">Árvore:</span>
              {(category.pathFromRoot && category.pathFromRoot.length > 0
                ? category.pathFromRoot
                : [{ id: category.id, name: category.name }]
              ).map((node, idx, arr) => (
                <span key={node.id} className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectCategory(node.id)}
                    className={`rounded-lg px-2 py-0.5 font-semibold transition ${
                      idx === arr.length - 1
                        ? 'bg-amber-400/20 text-amber-300'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {node.name}
                  </button>
                  {idx < arr.length - 1 && <ChevronRight size={12} className="text-slate-500" />}
                </span>
              ))}
              {category.totalItems !== null && (
                <span className="ml-auto rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-300">
                  {fmtInt(category.totalItems)} anúncios totais
                </span>
              )}
            </div>

            {category.childrenCategories.length > 0 && (
              <div className="flex max-h-28 flex-wrap items-center gap-1.5 overflow-y-auto pr-1">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Subcategorias ({category.childrenCategories.length}):
                </span>
                {category.childrenCategories.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onSelectCategory(ch.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/75 px-2.5 py-1 text-[11px] text-slate-200 transition hover:border-amber-400/45 hover:text-amber-300"
                  >
                    <span>{ch.name}</span>
                    {ch.totalItems !== null && (
                      <span className="tabular-nums text-[10px] text-slate-400">({fmtInt(ch.totalItems)})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* F-PATTERN: 4 KPIs Consolidados da Categoria Selecionada em Destaque Imediato */}
      {category && analytics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Faturamento 30d do Nicho"
            value={fmtBRL(analytics.estimatedMonthlyRevenue)}
            sub={`Amostra: ${analytics.sampleSize} líderes · ${fmtInt(analytics.estimatedMonthlySales)} un./mês`}
            icon={<BarChart3 size={15} />}
            tone="text-emerald-400"
          />
          <KpiTile
            label="Ticket Médio & Mediana"
            value={fmtBRL(analytics.averageTicket)}
            sub={`Mediana: ${fmtBRL(analytics.medianPrice)} (${fmtBRL(analytics.minPrice)}–${fmtBRL(analytics.maxPrice)})`}
            icon={<Tag size={15} />}
            tone="text-amber-300"
          />
          <KpiTile
            label="Proporção de Monopólio"
            value={`${analytics.concentratedSellersCount} / ${analytics.uniqueSellersCount} lojas`}
            sub={`Concentram 75% das vendas (${fmtPct(analytics.sellerConcentrationRatioPct)})`}
            icon={<Store size={15} />}
            tone="text-sky-300"
          />
          <KpiTile
            label="Comissões da Categoria"
            value={`${fmtDec(category.fees.categoryFees.range_128?.gold_special ?? 12, 1)}% / ${fmtDec(category.fees.categoryFees.range_128?.gold_pro ?? 17, 1)}%`}
            sub="Clássico vs. Premium (acima de R$ 79)"
            icon={<Calculator size={15} />}
            tone="text-white"
          />
        </div>
      )}

      {/* Matriz Consolidada de Categorias Mães e Filhas (Visível imediatamente ao abrir a aba) */}
      <div className="glass-panel overflow-x-auto rounded-3xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-white">
              <Layers size={17} className="text-amber-400" />
              Matriz de Categorias Mães e Filhas (Mercado Livre Brasil)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Receita Mensal 30d, Ticket Médio, Medalhas, % Full, % Catálogo e Índice de Monopolização real.
            </p>
          </div>
          {matrixLoading && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300">
              <Loader2 size={14} className="animate-spin" /> Atualizando matriz...
            </span>
          )}
        </div>

        {matrixRows.length > 0 ? (
          <div className="max-h-[540px] overflow-auto rounded-2xl border border-white/[0.06]">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 text-[11px] uppercase tracking-wider text-slate-400 backdrop-blur-md">
                <tr>
                  <th className="px-3.5 py-3.5 font-semibold">Categoria (Mãe / Filha)</th>
                  <th className="px-3.5 py-3.5 font-semibold">Receita Estimada 30d</th>
                  <th className="px-3.5 py-3.5 font-semibold">Ticket Médio</th>
                  <th className="px-3.5 py-3.5 font-semibold">Distribuição de Medalhas</th>
                  <th className="px-3.5 py-3.5 font-semibold">% Full</th>
                  <th className="px-3.5 py-3.5 font-semibold">% Catálogo</th>
                  <th className="px-3.5 py-3.5 font-semibold">Índice de Monopolização</th>
                  <th className="px-3.5 py-3.5 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {matrixRows.map((row) => {
                  const isSelected = category?.id === row.id;
                  const mBadge =
                    row.monopolyLevel === 'Baixo'
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : row.monopolyLevel === 'Alto'
                        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                        : 'border-amber-400/40 bg-amber-400/15 text-amber-300';
                  const md = row.medalDistribution;

                  return (
                    <tr
                      key={row.id}
                      onClick={() => onSelectCategory(row.id)}
                      className={`cursor-pointer transition hover:bg-white/[0.04] ${
                        isSelected ? 'bg-amber-400/[0.08]' : row.level === 'child' ? 'bg-slate-950/35' : ''
                      }`}
                    >
                      <td className="px-3.5 py-3.5">
                        <div className={`flex items-center gap-2 ${row.level === 'child' ? 'pl-5' : ''}`}>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                              row.level === 'mother'
                                ? 'bg-amber-400/20 text-amber-300'
                                : 'bg-sky-500/15 text-sky-300'
                            }`}
                          >
                            {row.level === 'mother' ? 'MÃE' : '↳ FILHA'}
                          </span>
                          <div>
                            <p className="font-bold text-white">{row.name}</p>
                            <p className="text-[10px] text-slate-400">
                              <span className="font-mono text-sky-300">{row.id}</span>
                              {row.parentName ? ` · ${row.parentName}` : ''}
                              {row.totalItems ? ` · ${fmtInt(row.totalItems)} itens` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3.5 font-extrabold tabular-nums text-emerald-400">
                        {fmtBRL(row.estimatedMonthlyRevenue)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3.5 font-bold tabular-nums text-amber-300">
                        {fmtBRL(row.averageTicket)}
                      </td>
                      <td className="min-w-[200px] px-3.5 py-3.5">
                        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="bg-sky-400"
                            title={`Oficiais: ${fmtPct(md.officialStorePct)}`}
                            style={{ width: `${md.officialStorePct}%` }}
                          />
                          <div
                            className="bg-emerald-400"
                            title={`Platinum: ${fmtPct(md.platinumPct)}`}
                            style={{ width: `${md.platinumPct}%` }}
                          />
                          <div
                            className="bg-amber-400"
                            title={`Gold/Líder: ${fmtPct(md.goldPct + md.silverPct)}`}
                            style={{ width: `${md.goldPct + md.silverPct}%` }}
                          />
                          <div
                            className="bg-slate-500"
                            title={`Sem Medalha: ${fmtPct(md.noMedalPct)}`}
                            style={{ width: `${md.noMedalPct}%` }}
                          />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] tabular-nums text-slate-400">
                          <span className="text-sky-300">Ofic. {Math.round(md.officialStorePct)}%</span>
                          <span className="text-emerald-300">Plat. {Math.round(md.platinumPct)}%</span>
                          <span className="text-amber-300">
                            Líder {Math.round(md.goldPct + md.silverPct)}%
                          </span>
                          <span>S/Med. {Math.round(md.noMedalPct)}%</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3.5 font-bold tabular-nums text-emerald-300">
                        ⚡ {fmtPct(row.fullPct)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3.5 font-bold tabular-nums text-purple-300">
                        {fmtPct(row.catalogPct)}
                      </td>
                      <td className="px-3.5 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${mBadge}`}>
                            {row.monopolyLevel}
                          </span>
                          <span className="text-[11px] font-bold tabular-nums text-slate-200">
                            ({fmtPct(row.monopolyIndexPct)})
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">
                          {row.concentratedSellersCount}/{row.uniqueSellersCount} lojas = 75% vendas
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCategory(row.id);
                          }}
                          className="rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 transition hover:bg-amber-300"
                        >
                          Explorar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            {matrixLoading
              ? 'Calculando indicadores em tempo real das categorias mães e filhas...'
              : 'Selecione uma categoria acima para iniciar o detalhamento.'}
          </div>
        )}
      </div>

      {/* Painel Analítico Consolidado quando há categoria carregada */}
      {category && analytics && (
        <>
          {/* Card de Nível de Competitividade / Monopólio + Proporções Operacionais & Medalhas */}
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="glass-panel space-y-4 rounded-3xl p-6 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={18} className="text-amber-400" />
                  <h3 className="text-base font-bold text-white">
                    Índice de Monopolização Real &amp; Barreira
                  </h3>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${monopolyTone.badge}`}>
                  Monopólio {analytics.monopolyLevel}
                </span>
              </div>

              <p className="text-xs leading-relaxed text-slate-300">{analytics.monopolySummary}</p>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
                Proporção real vendedores vs. concentradores:{' '}
                <strong className="text-amber-300">
                  {analytics.concentratedSellersCount} de {analytics.uniqueSellersCount} vendedores
                </strong>{' '}
                concentram 75% das vendas do nicho ({fmtPct(analytics.sellerConcentrationRatioPct)} da base ativa).
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-300">Share de Receita dos Top 5 Vendedores</span>
                    <strong className="text-amber-300">{fmtPct(analytics.monopolyIndexPct)}</strong>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${monopolyTone.bar}`}
                      style={{ width: `${Math.min(100, Math.max(4, analytics.monopolyIndexPct))}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-300">Share de Receita das Top 5 Marcas</span>
                    <strong className="text-sky-300">{fmtPct(analytics.brandConcentrationPct)}</strong>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-400"
                      style={{ width: `${Math.min(100, Math.max(4, analytics.brandConcentrationPct))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Proporções Operacionais + Distribuição de Medalhas */}
            <div className="glass-panel space-y-4 rounded-3xl p-6 lg:col-span-6">
              <h3 className="text-base font-bold text-white">
                Estrutura Operacional &amp; Distribuição de Medalhas
              </h3>
              <div className="space-y-3.5 text-xs">
                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="font-semibold text-sky-300">Clássico ({fmtPct(analytics.classicPct)})</span>
                    <span className="font-semibold text-amber-300">Premium ({fmtPct(analytics.premiumPct)})</span>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="bg-sky-500" style={{ width: `${analytics.classicPct}%` }} />
                    <div className="bg-amber-400" style={{ width: `${analytics.premiumPct}%` }} />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="font-semibold text-emerald-300">⚡ Full ({fmtPct(analytics.fullPct)})</span>
                    <span className="font-semibold text-slate-300">
                      Agência / Correios ({fmtPct(analytics.standardShippingPct)})
                    </span>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="bg-emerald-500" style={{ width: `${analytics.fullPct}%` }} />
                    <div className="bg-slate-600" style={{ width: `${analytics.standardShippingPct}%` }} />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="font-semibold text-purple-300">Catálogo ({fmtPct(analytics.catalogPct)})</span>
                    <span className="font-semibold text-slate-300">Anúncio Comum ({fmtPct(analytics.commonPct)})</span>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="bg-purple-500" style={{ width: `${analytics.catalogPct}%` }} />
                    <div className="bg-slate-600" style={{ width: `${analytics.commonPct}%` }} />
                  </div>
                </div>

                <div className="pt-1">
                  <div className="mb-1.5 flex flex-wrap justify-between gap-1 text-[11px]">
                    <span className="font-semibold text-sky-300">
                      Oficiais: {fmtPct(analytics.medalDistribution.officialStorePct)}
                    </span>
                    <span className="font-semibold text-emerald-300">
                      Platinum: {fmtPct(analytics.medalDistribution.platinumPct)}
                    </span>
                    <span className="font-semibold text-amber-300">
                      Gold/Líder: {fmtPct(analytics.medalDistribution.goldPct + analytics.medalDistribution.silverPct)}
                    </span>
                    <span className="font-semibold text-slate-300">
                      Sem Medalha: {fmtPct(analytics.medalDistribution.noMedalPct)}
                    </span>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="bg-sky-400"
                      style={{ width: `${analytics.medalDistribution.officialStorePct}%` }}
                    />
                    <div
                      className="bg-emerald-400"
                      style={{ width: `${analytics.medalDistribution.platinumPct}%` }}
                    />
                    <div
                      className="bg-amber-400"
                      style={{
                        width: `${analytics.medalDistribution.goldPct + analytics.medalDistribution.silverPct}%`,
                      }}
                    />
                    <div
                      className="bg-slate-500"
                      style={{ width: `${analytics.medalDistribution.noMedalPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top 5 Vendedores + Top 5 Marcas + Distribuição por Faixa de Preço */}
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Top 5 Vendedores */}
            <div className="glass-panel space-y-3 rounded-3xl p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Store size={16} className="text-emerald-400" /> Top 5 Vendedores do Nicho
              </h3>
              <div className="space-y-2.5">
                {analytics.topSellers.map((s, i) => (
                  <div
                    key={`${s.name}-${i}`}
                    className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onInspectSeller(s.id ?? s.name)}
                        className="truncate font-bold text-white hover:text-amber-300"
                      >
                        #{i + 1} {s.name}
                      </button>
                      <span className="shrink-0 font-bold text-emerald-400">{fmtPct(s.sharePct)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{fmtBRL(s.monthlyRevenue)} / mês</span>
                      <span>{s.listingsCount} anúncio(s)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 5 Marcas */}
            <div className="glass-panel space-y-3 rounded-3xl p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Award size={16} className="text-amber-400" /> Top 5 Marcas Dominantes
              </h3>
              <div className="space-y-2.5">
                {analytics.topBrands.map((b, i) => (
                  <div
                    key={`${b.name}-${i}`}
                    className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold text-white">
                        #{i + 1} {b.name}
                      </span>
                      <span className="shrink-0 font-bold text-sky-300">{fmtPct(b.sharePct)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{fmtBRL(b.monthlyRevenue)} / mês</span>
                      <span>{fmtInt(b.monthlySales)} un./mês</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Distribuição por Faixa de Preço */}
            <div className="glass-panel space-y-3 rounded-3xl p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <BarChart3 size={16} className="text-sky-400" /> Distribuição por Faixa de Preço
              </h3>
              <div className="space-y-3">
                {analytics.priceBuckets.map((b) => (
                  <div
                    key={b.label}
                    className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-100">{b.label}</span>
                      <span className="text-[11px] font-semibold text-amber-300">
                        {b.count} anúncios ({fmtPct(b.sharePct)})
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-sky-400"
                        style={{ width: `${Math.min(100, Math.max(4, b.revenueSharePct))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Receita na faixa: <strong className="text-emerald-300">{fmtBRL(b.revenue)}</strong> ({fmtPct(b.revenueSharePct)})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Termos em Alta da Categoria */}
          {category.trends.length > 0 && (
            <div className="glass-panel rounded-2xl p-5">
              <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <Sparkles size={14} /> Termos Mais Buscados Dentro de {category.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {category.trends.map((t, i) => (
                  <button
                    key={`${t.keyword}-${i}`}
                    type="button"
                    onClick={() => onPickTrendKeyword(t.keyword)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20"
                  >
                    <span className="font-bold text-amber-300">#{i + 1}</span> {t.keyword}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Produtos Líderes da Categoria */}
          {products.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">
                  Produtos Líderes em {category.name} ({products.length})
                </h3>
                <button
                  type="button"
                  onClick={() => exportProductsToCsv(products, `categoria-${category.id}`)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300"
                >
                  <Download size={13} /> Exportar Líderes CSV
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {products.slice(0, 12).map((p, idx) => {
                  const code = productCodeOf(p);
                  const monitored = isProductMonitored(code);
                  return (
                    <article key={`${code ?? 'catp'}-${idx}`} className="glass-card flex flex-col overflow-hidden rounded-2xl">
                      <div className="relative flex h-40 items-center justify-center bg-white p-3">
                        <span className="absolute left-2.5 top-2.5 rounded-md bg-slate-950/85 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => onToggleMonitorProduct(p)}
                          className={`absolute right-2.5 top-2.5 rounded-md p-1.5 ${
                            monitored ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950/75 text-slate-200'
                          }`}
                        >
                          {monitored ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
                        </button>
                        <ThumbImg src={p.image} alt={p.title} />
                      </div>
                      <div className="flex flex-1 flex-col gap-2 p-3.5 text-xs">
                        <h4 className="line-clamp-2 font-bold text-white">{p.title}</h4>
                        <p className="text-lg font-black text-amber-300">{fmtBRL(p.price)}</p>
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>{fmtInt(monthlySalesOf(p))} un./mês</span>
                          <span className="font-bold text-emerald-400">{fmtBRL(monthlyRevOf(p))}</span>
                        </div>
                        <div className="mt-auto flex gap-1.5 pt-2">
                          <button
                            type="button"
                            onClick={() => onOpenProduct(p)}
                            className="flex-1 rounded-lg bg-sky-500 py-1.5 text-[11px] font-bold text-white hover:bg-sky-400"
                          >
                            Raio-X
                          </button>
                          <button
                            type="button"
                            onClick={() => onSimulateProduct(p)}
                            className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-300"
                          >
                            Margem
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {!category && !loading && (
        <div className="glass-panel rounded-3xl p-10 text-center">
          <Layers size={34} className="mx-auto text-amber-400" />
          <h3 className="mt-3 text-base font-bold text-white">
            Selecione qualquer categoria acima para calcular o Monopólio e as Métricas de Nicho
          </h3>
          <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
            Você verá instantaneamente o faturamento estimado, concentração nos Top 5 vendedores e marcas, faixas de preço e subcategorias.
          </p>
        </div>
      )}
    </section>
  );
}

/* =============================================================================
 * MÓDULO 5 — TENDÊNCIAS (TERMOS EM ASCENSÃO, SAZONALIDADE & PREÇO DE ENTRADA)
 * ============================================================================= */

export function TrendsModuleView({
  data,
  loading,
  selectedCat,
  onSelectCategory,
  onSearchKeywordInProducts,
  onSearchKeywordInLocals,
  onExtractMediaForKeyword,
  onOpenRankingProduct,
}: {
  data: TrendsModulePayload | null;
  loading: boolean;
  selectedCat: string;
  onSelectCategory: (catId: string) => void;
  onSearchKeywordInProducts: (kw: string) => void;
  onSearchKeywordInLocals: (kw: string) => void;
  onExtractMediaForKeyword: (kw: string) => void;
  onOpenRankingProduct: (item: RankingProductItem) => void;
}) {
  const [demandFilter, setDemandFilter] = useState<'all' | 'Muito Alta' | 'Alta' | 'Crescente'>('all');

  const visibleTrends = useMemo(() => {
    const list = data?.trends ?? [];
    if (demandFilter === 'all') return list;
    return list.filter((t) => t.demandLevel === demandFilter);
  }, [data, demandFilter]);

  return (
    <section className="space-y-6">
      <div className="glass-panel rounded-3xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Flame size={18} className="text-rose-400" />
            <h1 className="text-base font-extrabold tracking-tight text-white sm:text-lg">
              Tendências &amp; Sazonalidade por Nicho
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <select
                value={selectedCat}
                onChange={(e) => onSelectCategory(e.target.value)}
                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white outline-none focus:border-amber-400"
              >
                <option value="all">🔥 Geral Brasil (Todas as Categorias)</option>
                {data.rootCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            )}

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-slate-950 p-1 text-xs">
              {(['all', 'Muito Alta', 'Alta', 'Crescente'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDemandFilter(lvl)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    demandFilter === lvl
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {lvl === 'all' ? 'Todas' : lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Abas rápidas das categorias principais */}
        {data && (
          <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {data.categories.map((cat) => {
                const active = selectedCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onSelectCategory(cat.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                      active
                        ? 'border-amber-400/60 bg-amber-400/15 text-amber-300'
                        : 'border-white/10 bg-slate-950/60 text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.shortName}</span>
                  </button>
                );
              })}
            </div>
            {loading && (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-sky-300">
                <Loader2 size={14} className="animate-spin" /> Atualizando...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabela de Termos Ranqueados com Sticky Header */}
      {visibleTrends.length > 0 && (
        <div className="glass-panel max-h-[640px] overflow-auto rounded-3xl">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 text-[11px] uppercase tracking-wider text-slate-400 backdrop-blur-md">
              <tr>
                <th className="px-4 py-3.5 font-semibold">Pos.</th>
                <th className="px-4 py-3.5 font-semibold">Termo em Ascensão</th>
                <th className="px-4 py-3.5 font-semibold">Potencial de Demanda</th>
                <th className="px-4 py-3.5 font-semibold">Sazonalidade</th>
                <th className="px-4 py-3.5 font-semibold">Concorrentes</th>
                <th className="px-4 py-3.5 font-semibold">Ticket de Entrada</th>
                <th className="px-4 py-3.5 font-semibold">Adoção Full</th>
                <th className="px-4 py-3.5 text-right font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {visibleTrends.map((t) => {
                const demandBadge =
                  t.demandLevel === 'Muito Alta'
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : t.demandLevel === 'Alta'
                      ? 'border-amber-400/40 bg-amber-400/15 text-amber-300'
                      : 'border-sky-400/40 bg-sky-500/15 text-sky-300';

                return (
                  <tr key={`${t.position}-${t.keyword}`} className="transition hover:bg-white/[0.03]">
                    <td className="px-4 py-3.5 font-black tabular-nums text-amber-300">#{t.position}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {t.sampleImage && (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                            <ThumbImg src={t.sampleImage} alt={t.keyword} />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-bold capitalize text-white">{t.keyword}</p>
                          <p className="text-[11px] text-slate-400">{t.categoryName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${demandBadge}`}>
                        {t.demandLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-200">{t.seasonalityLabel}</td>
                    <td className="px-4 py-3.5 font-bold tabular-nums text-slate-200">
                      {t.competingListings > 0 ? `${fmtInt(t.competingListings)} anúncios` : 'Nicho aberto'}
                    </td>
                    <td className="px-4 py-3.5 font-extrabold tabular-nums text-amber-300">
                      {fmtBRL(t.avgEntryPrice)}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{ width: `${Math.min(100, t.fullAdoptionPct)}%` }}
                          />
                        </div>
                        <span className="font-semibold text-emerald-300">{t.fullAdoptionPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSearchKeywordInProducts(t.keyword)}
                          className="rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 transition hover:bg-amber-300"
                        >
                          Analisar
                        </button>
                        <button
                          type="button"
                          onClick={() => onSearchKeywordInLocals(t.keyword)}
                          title="Mapear fornecedores nacionais e UFs"
                          className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-emerald-400/40 hover:text-emerald-300"
                        >
                          UF / Local
                        </button>
                        <button
                          type="button"
                          onClick={() => onExtractMediaForKeyword(t.keyword)}
                          title="Extrair fotos HD e clipes deste termo"
                          className="rounded-lg border border-white/10 bg-slate-900 p-1.5 text-slate-300 transition hover:border-amber-400/40 hover:text-amber-300"
                        >
                          <Film size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Produtos em Ascensão no Nicho */}
      {data && data.risingProducts.length > 0 && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-white">
            <TrendingUp size={18} className="text-emerald-400" /> Produtos Líderes de Crescimento em{' '}
            {data.selectedCategoryName}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.risingProducts.map((item) => (
              <article
                key={item.id}
                onClick={() => onOpenRankingProduct(item)}
                className="glass-card group flex cursor-pointer flex-col overflow-hidden rounded-2xl"
              >
                <div className="relative flex h-40 items-center justify-center bg-white p-3">
                  <span className="absolute left-2.5 top-2.5 rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-slate-950">
                    #{item.position}º
                  </span>
                  <ThumbImg src={item.image} alt={item.title} />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4 text-xs">
                  <span className="font-semibold text-emerald-400">{item.soldLabel}</span>
                  <h4 className="line-clamp-2 font-bold text-white group-hover:text-amber-300">
                    {item.title}
                  </h4>
                  <p className="mt-auto pt-1 text-xl font-black tabular-nums text-amber-300">{fmtBRL(item.price)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

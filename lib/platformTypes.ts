import type {
  AgeAlert,
  CategoryAnalyticsSummary,
  CategoryFees,
  CategoryMedalDistribution,
  Commission,
  KeywordStat,
  ListingQualityReport,
  MonopolyLevel,
  Periods,
  ReviewInsightsSummary,
  SalesEstimate,
  SellerPortfolioAnalytics,
} from '@/lib/mlEngine';
import type {
  PageSignals,
  ProductVideo,
  ReviewAttribute,
  ReviewComment,
  ReviewStarBreakdown,
  SpecAttribute,
} from '@/lib/pageState';

/* =============================================================================
 * NAVEGAÇÃO PRINCIPAL DA PLATAFORMA (SIDEBAR + MÓDULOS)
 * ============================================================================= */

export type ModuleId =
  | 'home'
  | 'produtos'
  | 'locais'
  | 'categorias'
  | 'tendencias'
  | 'vendedores'
  | 'monitor'
  | 'auditor'
  | 'midias'
  | 'calculadora'
  | 'raiox';

export type SearchMode = 'auto' | 'termo' | 'anuncio' | 'categoria';

/* =============================================================================
 * TIPOS ESPELHADOS DA API (/api/ml)
 * ============================================================================= */

export type SellerInfo = {
  id: number | null;
  nickname: string | null;
  registrationDate: string | null;
  accountYears: number | null;
  city: string | null;
  state: string | null;
  medal: string;
  reputationLevel: string | null;
  completedSales: number | null;
  canceledSales: number | null;
  cancellationRate: number | null;
  claimsRate: number | null;
  delayedHandlingRate: number | null;
  positiveRatingPct: number | null;
  officialStoreId: number | null;
};

export type FeeSnapshot = {
  categoryId: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  categoryFees: CategoryFees;
  classic: Commission | null;
  premium: Commission | null;
  current: Commission | null;
  shippingListCost: number | null;
  freeShippingByMeli: boolean;
  shippingSource: string;
  feeSource: string;
};

export type CompetitorRow = {
  itemId: string;
  productId: string | null;
  mlbuId: string | null;
  title: string;
  image: string | null;
  price: number | null;
  priceDiffPct: number | null;
  sellerId: number | null;
  sellerNickname: string | null;
  sellerMedal: string | null;
  sellerCompletedSales: number | null;
  sellerCityState: string | null;
  fulfillment: boolean;
  freeShipping: boolean;
  listingType: string | null;
  soldQuantity: number | null;
  soldLabel: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  monthlyRevenue: number | null;
  matchType: 'identical' | 'similar';
  permalink: string | null;
  source: 'Catálogo BuyBox' | 'Busca Similar';
};

export type ProductReviewsData = {
  ratingAverage: number;
  totalReviews: number;
  source: string;
  distribution: ReviewStarBreakdown[];
  attributes: ReviewAttribute[];
  customerPhotos: string[];
  comments: ReviewComment[];
  insights?: ReviewInsightsSummary;
  hasMore: boolean;
  objectId: string | null;
  isItem: boolean;
};

export type ProductSummary = {
  productId: string | null;
  itemId: string | null;
  mlbuId?: string | null;
  categoryId: string | null;
  categoryName?: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  image: string | null;
  price: number | null;
  originalPrice: number | null;
  soldQuantity: number | null;
  soldText: string | null;
  soldSource: string;
  salesEstimate: SalesEstimate | null;
  velocity: Periods | null;
  revenue: Periods | null;
  availableQuantity: number | null;
  listingType: string | null;
  listingTypeId: string | null;
  fulfillment: boolean;
  freeShipping: boolean;
  hasFlex?: boolean;
  isCatalog?: boolean;
  isInternational?: boolean;
  sellerState?: string | null;
  imagesCount?: number;
  hasVideo?: boolean;
  isSupermarket: boolean;
  isSponsored: boolean;
  ratingAverage: number | null;
  ratingCount: number | null;
  createdAt: string | null;
  createdSource: string;
  daysOnAir: number | null;
  ageAlert: AgeAlert | null;
  firstPhotoDate: string | null;
  seller: SellerInfo | null;
  permalink: string | null;
};

export type Dossier = {
  origin: string;
  productId: string | null;
  itemId: string | null;
  mlbuId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  permalink: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  images: string[];
  videos: ProductVideo[];
  attributes?: SpecAttribute[];
  listingQuality?: ListingQualityReport;
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  currency: string;
  listingType: string | null;
  listingTypeId: string | null;
  isSupermarket: boolean;
  availableQuantity: number | null;
  stockText: string | null;
  stockSource: string;
  soldValue: number | null;
  soldLabel: string;
  soldSource: string;
  salesEstimate: SalesEstimate | null;
  velocity: Periods | null;
  revenue: Periods | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  reviewsDetail?: ProductReviewsData;
  fulfillment: boolean;
  freeShipping: boolean;
  logisticType: string | null;
  createdAt: string | null;
  createdSource: string;
  daysOnAir: number | null;
  ageAlert: AgeAlert | null;
  ageAlertLabel: string | null;
  firstPhotoDate: string | null;
  firstPhotoSource: string;
  seller: SellerInfo | null;
  competitors: CompetitorRow[];
  fees: FeeSnapshot;
  keywords: { words: KeywordStat[]; phrases: KeywordStat[] };
  pageSignals: PageSignals | null;
  notes: string[];
  raw: Record<string, unknown>;
};

export type CategoryTrend = {
  keyword: string;
  url: string;
};

export type CategoryChild = {
  id: string;
  name: string;
  totalItems: number | null;
};

export type CategoryOverview = {
  id: string;
  name: string;
  path: string;
  pathFromRoot?: { id: string; name: string }[];
  totalItems: number | null;
  childrenCategories: CategoryChild[];
  trends: CategoryTrend[];
  fees: FeeSnapshot;
  analytics?: CategoryAnalyticsSummary;
};

export type RootCategoryItem = {
  id: string;
  name: string;
};

export type CategoryMatrixRow = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  level: 'mother' | 'child';
  totalItems?: number | null;
  sampleSize?: number;
  estimatedMonthlyRevenue: number;
  estimatedMonthlySales: number;
  averageTicket: number;
  medalDistribution: CategoryMedalDistribution;
  fullPct: number;
  catalogPct: number;
  uniqueSellersCount: number;
  concentratedSellersCount: number;
  sellerConcentrationRatioPct: number;
  monopolyIndexPct: number;
  monopolyLevel: MonopolyLevel;
};

export type RankingCategoryTab = {
  id: string;
  name: string;
  shortName: string;
  icon: string;
};

export type RankingProductItem = {
  position: number;
  id: string;
  productId: string | null;
  itemId: string | null;
  title: string;
  image: string | null;
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  soldQuantity: number | null;
  soldLabel: string;
  ratingAverage: number | null;
  ratingCount: number | null;
  sellerId: number | null;
  sellerNickname: string | null;
  sellerMedal: string | null;
  sellerCompletedSales: number | null;
  fulfillment: boolean;
  freeShipping: boolean;
  categoryId: string | null;
  categoryName: string;
  permalink: string | null;
};

export type RankingTrendItem = {
  position: number;
  keyword: string;
  url: string;
  categoryName: string;
};

export type RankingPayload = {
  categories: RankingCategoryTab[];
  selectedCategory: RankingCategoryTab;
  items: RankingProductItem[];
  trends: RankingTrendItem[];
  updatedAt: string;
};

export type TrendEnrichedItem = {
  position: number;
  keyword: string;
  url: string;
  categoryId: string | null;
  categoryName: string;
  demandLevel: 'Muito Alta' | 'Alta' | 'Crescente';
  seasonalityLabel: string;
  competingListings: number;
  avgEntryPrice: number | null;
  fullAdoptionPct: number;
  sampleImage: string | null;
};

export type TrendsModulePayload = {
  categories: RankingCategoryTab[];
  rootCategories: RootCategoryItem[];
  selectedCategoryId: string;
  selectedCategoryName: string;
  trends: TrendEnrichedItem[];
  risingProducts: RankingProductItem[];
  updatedAt: string;
};

export type SellerDossierPayload = {
  seller: SellerInfo & {
    countryId: string | null;
    storePermalink: string | null;
    isInternational: boolean;
  };
  portfolio: SellerPortfolioAnalytics;
  resolvedFrom: string;
};

export type MediaAssetImage = {
  url: string;
  source: 'official' | 'customer';
  title: string;
  itemCode: string | null;
  price: number | null;
  resolutionLabel: string;
};

export type MediaAssetVideo = ProductVideo & {
  productTitle: string;
  itemCode: string | null;
  permalink: string | null;
};

export type MediaExtractorPayload = {
  mode: 'announcement' | 'keyword';
  query: string;
  title: string;
  itemId: string | null;
  productId: string | null;
  mlbuId: string | null;
  price: number | null;
  sellerNickname: string | null;
  permalink: string | null;
  galleryImages: MediaAssetImage[];
  customerPhotos: MediaAssetImage[];
  videos: MediaAssetVideo[];
};

export type KeywordAnalysis = {
  mode: 'keyword';
  query: string;
  products: ProductSummary[];
  keywords?: { words: KeywordStat[]; phrases: KeywordStat[] };
  category?: CategoryOverview | null;
  note: string | null;
};

export type DossierAnalysis = { mode: 'dossier'; dossier: Dossier };
export type Analysis = KeywordAnalysis | DossierAnalysis;

/* =============================================================================
 * FILTROS AVANÇADOS DE BUSCA DE PRODUTOS E PRODUTOS LOCAIS
 * ============================================================================= */

export type AdvancedSortKey =
  | 'faturamento_desc'
  | 'vendas_30d_desc'
  | 'total_vendidos_desc'
  | 'menor_preco'
  | 'maior_preco'
  | 'melhor_avaliacao'
  | 'mais_recentes'
  | 'relevancia';

export type AdvancedFilterState = {
  priceMin: string;
  priceMax: string;
  sales30dMin: string;
  sales30dMax: string;
  rev30dMin: string;
  rev30dMax: string;
  modality: 'todos' | 'classico' | 'premium';
  logistic: 'todos' | 'full' | 'frete_gratis' | 'flex';
  adType: 'todos' | 'catalogo' | 'comum';
  minRating: 'todos' | '4.0' | '4.5' | '4.8';
  ageRange: 'todos' | '30' | '60' | '90' | '140' | '180' | 'mais_180';
  ageMinDays: string;
  ageMaxDays: string;
  selectedCategories: string[];
  selectedBrands: string[];
  hideOfficialStores: boolean;
  hideMedaledSellers: boolean;
  hideCatalog: boolean;
  sameTitleOrImageRef: string;
  origin: 'todos' | 'nacional' | 'internacional';
  uf: string; // '' = todos os estados, 'SP', 'PR', etc.
  sort: AdvancedSortKey;
  view: 'table' | 'grid';
};

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilterState = {
  priceMin: '',
  priceMax: '',
  sales30dMin: '',
  sales30dMax: '',
  rev30dMin: '',
  rev30dMax: '',
  modality: 'todos',
  logistic: 'todos',
  adType: 'todos',
  minRating: 'todos',
  ageRange: 'todos',
  ageMinDays: '',
  ageMaxDays: '',
  selectedCategories: [],
  selectedBrands: [],
  hideOfficialStores: false,
  hideMedaledSellers: false,
  hideCatalog: false,
  sameTitleOrImageRef: '',
  origin: 'todos',
  uf: '',
  sort: 'faturamento_desc',
  view: 'table',
};

export const DEFAULT_LOCAL_FILTERS: AdvancedFilterState = {
  ...DEFAULT_ADVANCED_FILTERS,
  origin: 'nacional',
  view: 'table',
};

/* =============================================================================
 * SISTEMA DE MONITORAMENTO (PRODUTOS & VENDEDORES COM SNAPSHOTS EM LOCALSTORAGE)
 * ============================================================================= */

export type ProductMonitorSnapshot = {
  capturedAt: string;
  price: number | null;
  stock: number | null;
  soldTotal: number | null;
  dailySales: number | null;
  monthlyRevenue: number | null;
};

export type MonitoredProduct = {
  code: string;
  title: string;
  image: string | null;
  sellerNickname: string | null;
  sellerId: number | null;
  fulfillment: boolean;
  listingType: string | null;
  permalink: string | null;
  addedAt: string;
  lastUpdatedAt: string;
  snapshots: ProductMonitorSnapshot[];
};

export type SellerMonitorSnapshot = {
  capturedAt: string;
  completedSales: number | null;
  monthlyRevenue: number | null;
  avgTicket: number | null;
  claimsRate: number | null;
  reputationLevel: string | null;
};

export type MonitoredSeller = {
  id: string;
  sellerId: number | null;
  nickname: string;
  medal: string;
  cityState: string;
  storePermalink: string | null;
  addedAt: string;
  lastUpdatedAt: string;
  snapshots: SellerMonitorSnapshot[];
};

export type MonitorStoreState = {
  products: MonitoredProduct[];
  sellers: MonitoredSeller[];
};

export const MONITOR_STORAGE_KEY = 'buscasml.monitor.v1';

export function readMonitorStore(): MonitorStoreState {
  if (typeof window === 'undefined') return { products: [], sellers: [] };
  try {
    const raw = window.localStorage.getItem(MONITOR_STORAGE_KEY);
    if (!raw) return { products: [], sellers: [] };
    const parsed = JSON.parse(raw) as Partial<MonitorStoreState>;
    return {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      sellers: Array.isArray(parsed.sellers) ? parsed.sellers : [],
    };
  } catch {
    return { products: [], sellers: [] };
  }
}

export function writeMonitorStore(state: MonitorStoreState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MONITOR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Armazenamento indisponível
  }
}

/* =============================================================================
 * EXPORTAÇÃO CSV E DOWNLOAD DE MÍDIA HD
 * ============================================================================= */

function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const text = String(val).replace(/\r?\n/g, ' ').trim();
  if (text.includes(';') || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function exportProductsToCsv(items: ProductSummary[], filePrefix = 'buscasml-produtos'): void {
  if (typeof window === 'undefined' || items.length === 0) return;

  const headers = [
    'Ranking',
    'Codigo',
    'Titulo',
    'Marca',
    'Preco (R$)',
    'Vendas Acumuladas',
    'Vendas 30d Est.',
    'Giro Diario',
    'Faturamento 30d (R$)',
    'Modalidade',
    'Logistica Full',
    'Frete Gratis',
    'Tipo Anuncio',
    'Origem',
    'UF Vendedor',
    'Vendedor',
    'Medalha',
    'Nota Media',
    'Avaliacoes',
    'Dias no Ar',
    'Link',
  ];

  const rows = items.map((p, idx) => {
    const code = p.mlbuId ?? p.itemId ?? p.productId ?? '';
    const sales30 = p.velocity ? Math.round(p.velocity.monthly) : p.soldQuantity ?? 0;
    const rev30 = p.revenue ? p.revenue.monthly.toFixed(2).replace('.', ',') : '';
    const priceStr = p.price !== null ? p.price.toFixed(2).replace('.', ',') : '';
    const dailyStr = p.velocity ? p.velocity.daily.toFixed(2).replace('.', ',') : '';
    const isCat = Boolean(p.isCatalog ?? p.productId);
    const originLabel = p.isInternational ? 'Internacional (CBT)' : 'Nacional (Brasil)';
    const uf = p.sellerState ?? p.seller?.state ?? '';

    return [
      idx + 1,
      code,
      p.title,
      p.brand ?? '',
      priceStr,
      p.soldQuantity ?? 0,
      sales30,
      dailyStr,
      rev30,
      p.listingType ?? 'Clássico',
      p.fulfillment ? 'Sim' : 'Não',
      p.freeShipping ? 'Sim' : 'Não',
      isCat ? 'Catálogo' : 'Comum',
      originLabel,
      uf,
      p.seller?.nickname ?? '',
      p.seller?.medal ?? '',
      p.ratingAverage !== null ? p.ratingAverage.toFixed(1).replace('.', ',') : '',
      p.ratingCount ?? 0,
      p.daysOnAir ?? '',
      p.permalink ?? '',
    ].map(escapeCsvCell).join(';');
  });

  const csvContent = `\uFEFF${headers.join(';')}\n${rows.join('\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filePrefix}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadMediaAsset(url: string, filenameBase: string): Promise<void> {
  if (typeof window === 'undefined' || !url) return;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('Direct download unavailable');
    const blob = await res.blob();
    const ext = blob.type.includes('mp4')
      ? 'mp4'
      : blob.type.includes('png')
        ? 'png'
        : blob.type.includes('jpeg')
          ? 'jpg'
          : 'webp';
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${filenameBase.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 50)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

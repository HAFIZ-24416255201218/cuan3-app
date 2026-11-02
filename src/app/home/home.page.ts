import { ChangeDetectorRef, Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { Subscription } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { I18nService } from '../services/i18n.service';
import { LogamMuliaPriceItem, MetalCategory, MetalPrice, MetalPriceService } from '../services/metal-price.service';
import { BiExchangeRateItem, CurrencyRateService } from '../services/currency-rate.service';
import { StockHistoryItem, StockIndexService, StockQuoteSummary } from '../services/stock-index.service';
import { CommodityGroup, CommodityHistoryPoint, CommodityPriceItem, CommodityPriceService } from '../services/commodity-price.service';
import { IndustrialMetalGroup, IndustrialMetalItem, IndustrialMetalService } from '../services/industrial-metal.service';
import { Transaction, Category, AppSettings, PeriodSummary } from '../models/finance.model';
import { Share } from '@capacitor/share';
import { ExportFile, ExportedFile } from '../services/export-file.plugin';
import { SavingsGoal, SavingsService } from '../services/savings.service';
import { AuthService } from '../services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { RoomMember, RoomService, SharedRoom } from '../services/room.service';
import { RoomApiService } from '../services/room-api.service';

interface CategoryShare {
  category: Category;
  total: number;
  percentage: number;
  color: string;
  strokeDashoffset?: number;
  strokeDasharray?: string;
}

interface DayGroup {
  dateStr: string;
  dayNumber: string;
  monthYear: string;
  dayName: string;
  income: number;
  expense: number;
  transactions: Transaction[];
}

export interface WeekSummary {
  weekNumber: number;
  weekName: string;
  startDate: string;
  endDate: string;
  dateRangeLabel: string;
  income: number;
  expense: number;
  isCurrent: boolean;
}

interface MarketPriceCategory {
  name: string;
  description: string;
  icon: string;
  instruments: string[];
}

type HomeView = 'report' | 'charts' | 'category_detail' | 'search' | 'settings' | 'categories' | 'savings' | 'create_transaction' | 'market_prices' | 'room_setup';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  private readonly copiedTransactionStorageKey = 'cuan_last_duplicated_transaction_draft_v1';
  private backButtonListener: PluginListenerHandle | null = null;
  private backButtonRegistrationPending = false;
  private isPageDestroyed = false;
  private exitPressTimeout: ReturnType<typeof setTimeout> | null = null;
  private isExitPressArmed = false;
  private _activeView: HomeView = 'report';
  private viewHistory: HomeView[] = [];
  private isRestoringView = false;

  // Navigation & View
  public get activeView(): HomeView {
    return this._activeView;
  }

  public set activeView(view: HomeView) {
    if (view === this._activeView) return;
    if (!this.isRestoringView) this.viewHistory.push(this._activeView);
    this._activeView = view;
  }

  public previousViewBeforeTxForm: HomeView = 'report';
  public reportPeriod: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily';
  public selectedDailyDateRange: { start: string; end: string } | null = null;
  public selectedMarketPriceCategory: MarketPriceCategory | null = null;

  // Shared Room State
  public activeRoom: SharedRoom | null = null;
  public isRoomSyncing = false;
  public isCreateRoomModalOpen = false;
  public isJoinRoomModalOpen = false;
  public isRoomDetailsModalOpen = false;
  public isRoomCreatedSuccessModalOpen = false;
  public newRoomName = '';
  public joinRoomCodeInput = '';
  public createdRoomCode = '';
  public roomErrorMessage = '';

  public savingsGoals: SavingsGoal[] = [];
  public savingsStorageError = '';
  public savingsTab: 'ongoing' | 'achieved' = 'ongoing';
  public expandedAchievementGoalIds = new Set<string>();
  public savingsSortBy: 'name' | 'targetAmount' | 'progress' = 'name';
  public savingsSortDirection: 'asc' | 'desc' = 'asc';
  public isSavingGoalModalOpen = false;
  public savingGoalName = '';
  public savingGoalTargetAmount: number | null = null;
  public savingGoalCurrency: NonNullable<SavingsGoal['currency']> = 'IDR';
  public savingGoalFrequency: NonNullable<SavingsGoal['contributionFrequency']> = 'daily';
  public savingGoalPlannedContribution: number | null = null;
  public savingGoalError = '';
  public selectedGoalForContribution: SavingsGoal | null = null;
  public achievedSavingsGoal: SavingsGoal | null = null;
  public savingContributionAmount: number | null = null;
  public savingContributionAction: 'add' | 'subtract' = 'add';
  public savingContributionNote = '';
  public savingContributionError = '';
  public readonly marketPriceCategories: MarketPriceCategory[] = [
    { name: 'Mata Uang', description: 'Kurs Transaksi Bank Indonesia (bi.go.id)', icon: 'cash-outline', instruments: ['USD/IDR', 'SGD/IDR', 'EUR/IDR', 'JPY/IDR', 'CNY/IDR', 'SAR/IDR'] },
    { name: 'Emas & Logam Mulia', description: 'Harga Emas Batangan & Perak Antam (logammulia.com)', icon: 'disc-outline', instruments: ['Emas Batangan', 'Gift Series', 'Batik Seri', 'Perak Murni'] },
    { name: 'Logam Industri', description: 'Tembaga, nikel, aluminium, timah (id.investing.com/commodities/metals)', icon: 'layers-outline', instruments: ['Tembaga', 'Nikel', 'Aluminium', 'Timah', 'Seng', 'Timbal', 'Bijih Besi', 'Platinum', 'Palladium'] },
    { name: 'Saham & Indeks', description: 'IHSG & Riwayat Harga (Yahoo Finance ^JKSE)', icon: 'stats-chart-outline', instruments: ['IHSG (^JKSE)', 'LQ45', 'BBCA', 'BBRI', 'BMRI', 'TLKM'] },
    { name: 'Komoditas', description: 'Harga Pangan Strategis Nasional (bi.go.id)', icon: 'nutrition-outline', instruments: ['Beras', 'Cabai', 'Minyak Goreng', 'Daging Sapi', 'Bawang', 'Telur', 'Gula Pasir'] }
  ];

  // Logam Industri (Investing.com Commodities Metals) State
  public industrialMetals: IndustrialMetalItem[] = [];
  public industrialMetalsUpdatedAt: Date | null = null;
  public industrialMetalsRecordedDate: string = '';
  public industrialMetalsStatus: 'loading' | 'ready' | 'error' = 'ready';
  public industrialMetalsError = '';
  public selectedIndustrialMetalGroup: IndustrialMetalGroup = 'all';
  public industrialMetalSearchQuery = '';
  public selectedIndustrialMetalModal: IndustrialMetalItem | null = null;
  public industrialMetalsUsdRate = 16555;
  public readonly officialInvestingMetalsUrl = IndustrialMetalService.OFFICIAL_INVESTING_URL;

  // Komoditas Pangan (PIHPS Bank Indonesia) State
  public commodityPrices: CommodityPriceItem[] = [];
  public commodityPricesUpdatedAt: Date | null = null;
  public commodityPricesRecordedDate: string = '';
  public commodityPricesStatus: 'loading' | 'ready' | 'error' = 'ready';
  public commodityPricesError = '';
  public selectedCommodityGroup: CommodityGroup = 'all';
  public commoditySearchQuery = '';
  public selectedCommodityModal: CommodityPriceItem | null = null;
  public readonly officialBiHargapanganUrl = CommodityPriceService.OFFICIAL_WEB_URL;

  // Emas & Logam Mulia State
  public metalPrices: LogamMuliaPriceItem[] = [];
  public metalPricesUpdatedAt: Date | null = null;
  public metalPricesRecordedDate: string = '';
  public metalPricesStatus: 'loading' | 'ready' | 'error' = 'ready';
  public metalPricesError = '';
  public metalPriceApiKeyInput = '';
  public selectedMetalCategory: 'all' | MetalCategory = 'all';
  public readonly officialLogamMuliaUrl = MetalPriceService.OFFICIAL_WEB_URL;

  // Mata Uang (Kurs Transaksi BI) State
  public currencyRates: BiExchangeRateItem[] = [];
  public currencyRatesUpdatedAt: Date | null = null;
  public currencyRatesRecordedDate: string = '';
  public currencyRatesStatus: 'loading' | 'ready' | 'error' = 'ready';
  public currencyRatesError = '';
  public currencySearchQuery = '';
  public selectedCurrencyRegion: 'all' | 'popular' | 'asia' | 'europe_americas' = 'popular';
  public selectedCurrencyForCopy: BiExchangeRateItem | null = null;
  public currencyCopyMessage = '';
  public currencyCopyError = false;
  public estimatedCopyMessage = '';
  public estimatedCopyError = false;
  public selectedMarketPriceCopyKey: string | null = null;
  public marketPriceCopyMessage = '';
  public marketPriceCopyError = false;
  public readonly officialBiUrl = CurrencyRateService.OFFICIAL_BI_URL;
  public calcAmount = 100;
  public calcFromCurrency = 'USD';

  // Saham & Indeks (Yahoo Finance ^JKSE) State
  public ihsgSummary: StockQuoteSummary | null = null;
  public ihsgStatus: 'loading' | 'ready' | 'error' = 'ready';
  public ihsgError = '';
  public selectedIhsgRange: '1mo' | '3mo' | '6mo' | '1y' = '1mo';
  public ihsgHistorySearch = '';
  public readonly officialYahooJkseUrl = StockIndexService.OFFICIAL_YAHOO_URL;

  // State
  public transactions: Transaction[] = [];
  public categories: Category[] = [];
  public settings!: AppSettings;

  // Filters for Laporan & Charts (Defaults to Okt 2026 matching screenshot)
  public selectedYear = 2026;
  public selectedMonth = 10; // 1-12 (10 = Okt)
  public chartType: 'expense' | 'income' = 'expense';
  public chartPeriod: 'weekly' | 'monthly' | 'yearly' | 'custom' = 'monthly';
  public chartWeekOffset = 0;
  public chartCustomStartDate = '';
  public chartCustomEndDate = '';
  public chartSort: 'highest' | 'lowest' | 'name' = 'highest';
  public isChartPeriodMenuOpen = false;
  public isChartSortMenuOpen = false;
  public readonly chartPeriodOptions: Array<'weekly' | 'monthly' | 'yearly' | 'custom'> =
    ['weekly', 'monthly', 'yearly', 'custom'];
  public readonly chartSortOptions: Array<'highest' | 'lowest' | 'name'> =
    ['highest', 'lowest', 'name'];
  public isDailySortAsc = false;
  public isHeaderMenuOpen = false;

  // Month-Year Picker Overlay (Image 1 & 2)
  public isMonthPickerOpen = false;
  public pickerYear = 2026;
  public get monthNamesList(): string[] {
    return this.isEn
      ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  }

  // Category Detail view (Screenshot 2 & 3)
  public selectedCategoryForDetail: Category | null = null;
  public categoryTrendMonths: { label: string; amount: number; x: number; y: number }[] = [];
  public categoryTrendPath = '';
  public categoryAreaPath = '';
  public categoryMaxAmount = 10000;
  public categoryYAxisTicks: { label: string; ratio: number }[] = [];
  public categoryDailyGroups: DayGroup[] = [];
  public categoryDetailSort: 'latest' | 'oldest' = 'latest';

  // Category Management Screen (Screenshot 1)
  public categoryTab: 'expense' | 'income' = 'expense';
  public isAddCatModalOpen = false;
  public isEditCatModalOpen = false;
  public editingCategory: Category | null = null;
  public newCatNameInput = '';
  public editCatNameInput = '';
  public newCatTypeInput: 'expense' | 'income' = 'expense';

  // Search Screen (Screenshot 1: Pencarian)
  public searchKeyword = '';
  public searchStartDate = '';
  public searchEndDate = '';
  public searchCategoryId = '';
  public searchMinAmount: number | null = null;
  public searchMaxAmount: number | null = null;
  public isSearchFilterOpen = true;
  public isSearchSummaryVisible = false;

  // Add / Edit Transaction Form
  public isFormOpen = false;
  public editingTxId: string | null = null;
  public isTransactionCopyMenuOpen = false;
  public copiedTransaction: Omit<Transaction, 'id' | 'createdAt'> | null = null;
  public formType: 'expense' | 'income' = 'expense';
  public formAmount: number = 0;
  public formCategoryId: string = '';
  public formDate: string = new Date().toISOString().split('T')[0];
  public formNote: string = '';
  public formAccount: string = 'Tunai';
  public isDuplicateModalOpen = false;
  public duplicateSearchQuery = '';
  public lastDuplicatedTransactionId: string | null = null;
  public formToastMessage = '';
  public formToastTimeout: any = null;
  public formValidationMessage = '';
  public formValidationField: 'amount' | 'category' | '' = '';

  // Mini Calculator
  public isMiniCalcOpen = false;
  public calcDisplay = '0';
  public calcFormula = '';
  public calcWaitingForSecondOperand = false;
  public calcPreviousOperand = '';
  public calcOperation = '';

  // PIN Lock & Security
  public pinEntered = '';
  public pinHasError = false;
  public isForgotPinOpen = false;
  public forgotAnswerInput = '';
  public newPinInput = '';
  public forgotPinError = '';

  // Category Management Modal
  public isCategoryModalOpen = false;
  public newCatName = '';
  public newCatType: 'expense' | 'income' = 'expense';
  public newCatColor = '#3b82f6';
  public newCatIcon = 'cart-outline';

  // Export Modal (Matching Screenshot)
  public isExportModalOpen = false;
  public isExportSuccessModalOpen = false;
  public exportedFile: ExportedFile | null = null;
  public isExportActionRunning = false;
  public exportTitle = 'Laporan Keuangan';
  public exportStartDate = '2026-10-01';
  public exportEndDate = '2026-10-31';
  public exportCategoryId = 'all';
  public exportFormat: 'XLS' | 'CSV' | 'PDF' = 'XLS';
  public isExportCategoryMenuOpen = false;
  public isExportFormatMenuOpen = false;
  public readonly exportFormatOptions: Array<'XLS' | 'CSV' | 'PDF'> = ['XLS', 'CSV', 'PDF'];

  // Filter ("SARING") Floating Modal (Matching User Screenshot)
  public isFilterModalOpen = false;
  public filterModalTab: 'income' | 'expense' = 'expense';
  public selectedFilterCategoryIds: string[] = [];
  public appliedFilterCategoryIds: string[] = [];

  // Widget Preview Modal
  public isWidgetModalOpen = false;

  // Drawer Modals (Rating, Help, About)
  public isRatingModalOpen = false;
  public ratingStars = 5;
  public ratingFeedback = '';
  public isHelpModalOpen = false;
  public isAboutModalOpen = false;

  // Monthly Laporan Data
  public monthlySummaryList: PeriodSummary[] = [];
  public yearlySummary = { income: 0, expense: 0, balance: 0, count: 0 };

  // Donut Chart Data
  public categoryShares: CategoryShare[] = [];
  public totalChartAmount = 0;

  private subs: Subscription[] = [];

  constructor(
    public financeService: FinanceService,
    public i18n: I18nService,
    private metalPriceService: MetalPriceService,
    private currencyRateService: CurrencyRateService,
    private stockIndexService: StockIndexService,
    private commodityPriceService: CommodityPriceService,
    private industrialMetalService: IndustrialMetalService,
    private savingsService: SavingsService,
    private readonly changeDetector: ChangeDetectorRef,
    public readonly authService: AuthService,
    private readonly router: Router,
    public roomService: RoomService,
    private readonly route: ActivatedRoute,
    private readonly roomApiService: RoomApiService
  ) {}

  public async logoutFromApp(): Promise<void> {
    try {
      this.roomService.initForUser(null);
      this.activeRoom = null;
      await this.authService.logout();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch (error) {
      console.error('Gagal mengakhiri sesi login.', error);
      alert(this.isEn
        ? 'Unable to log out. Please check your connection and try again.'
        : 'Tidak dapat keluar. Periksa koneksi lalu coba lagi.');
    }
  }

  public openMarketPriceCategory(category: MarketPriceCategory) {
    this.selectedMarketPriceCategory = category;
    if (category.name === 'Emas & Logam Mulia') {
      this.loadMetalPrices(false);
    } else if (category.name === 'Mata Uang') {
      this.loadCurrencyRates(false);
    } else if (category.name === 'Saham & Indeks') {
      if (!this.ihsgSummary) {
        this.ihsgSummary = this.stockIndexService.getInitialSummary(this.selectedIhsgRange);
      }
      this.loadIhsgData(false);
    } else if (category.name === 'Komoditas') {
      this.loadCommodityPrices(false);
    } else if (category.name === 'Logam Industri') {
      this.loadIndustrialMetals(false);
    }
  }

  public closeMarketPriceCategory() {
    this.selectedMarketPriceCategory = null;
  }

  public loadIhsgData(forceRefresh = false): void {
    if (!this.ihsgSummary) {
      this.ihsgSummary = this.stockIndexService.getInitialSummary(this.selectedIhsgRange);
    }
    this.ihsgStatus = 'loading';
    this.ihsgError = '';
    this.stockIndexService.getIhsgHistory(this.selectedIhsgRange, forceRefresh).subscribe({
      next: summary => {
        this.ihsgSummary = summary;
        this.ihsgStatus = 'ready';
      },
      error: (_err: unknown) => {
        if (!this.ihsgSummary) {
          this.ihsgStatus = 'error';
          this.ihsgError = 'Data IHSG dari Yahoo Finance belum dapat dimuat. Silakan periksa koneksi atau coba lagi.';
        } else {
          this.ihsgStatus = 'ready';
        }
      }
    });
  }

  public selectIhsgRange(range: '1mo' | '3mo' | '6mo' | '1y'): void {
    this.selectedIhsgRange = range;
    this.loadIhsgData(false);
  }

  public get filteredIhsgHistory(): StockHistoryItem[] {
    if (!this.ihsgSummary || !this.ihsgSummary.history) return [];
    if (!this.ihsgHistorySearch || !this.ihsgHistorySearch.trim()) {
      return this.ihsgSummary.history;
    }
    const q = this.ihsgHistorySearch.trim().toLowerCase();
    return this.ihsgSummary.history.filter(h => h.date.toLowerCase().includes(q));
  }

  public formatStockNumber(val: number, decimals = 2): string {
    if (!Number.isFinite(val)) return '0,00';
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(val);
  }

  public formatVolume(val: number): string {
    if (!Number.isFinite(val) || val <= 0) return '-';
    if (val >= 1_000_000_000) {
      return (val / 1_000_000_000).toFixed(2).replace('.', ',') + ' B';
    }
    if (val >= 1_000_000) {
      return (val / 1_000_000).toFixed(2).replace('.', ',') + ' M';
    }
    if (val >= 1_000) {
      return (val / 1_000).toFixed(1).replace('.', ',') + ' K';
    }
    return val.toLocaleString('id-ID');
  }

  public get ihsgSparklinePoints(): string {
    if (!this.ihsgSummary || !this.ihsgSummary.history || this.ihsgSummary.history.length < 2) return '';
    const history = [...this.ihsgSummary.history].reverse();
    const prices = history.map(h => h.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const width = 280;
    const height = 48;
    const padding = 4;

    return history.map((h, i) => {
      const x = (i / (history.length - 1)) * (width - 2 * padding) + padding;
      const y = height - padding - ((h.close - min) / range) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  public loadCurrencyRates(forceRefresh = false): void {
    this.currencyRatesStatus = 'loading';
    this.currencyRatesError = '';
    this.currencyRateService.getRates(forceRefresh).subscribe({
      next: snapshot => {
        this.currencyRates = snapshot.rates;
        this.currencyRatesUpdatedAt = snapshot.updatedAt;
        this.currencyRatesRecordedDate = snapshot.recordedDate;
        if (!this.calcFromCurrency && this.currencyRates.length > 0) {
          this.calcFromCurrency = 'USD';
        }
        this.currencyRatesStatus = 'ready';
      },
      error: (_err: unknown) => {
        this.currencyRatesStatus = 'error';
        this.currencyRatesError = 'Data Kurs Transaksi BI belum dapat dimuat. Silakan periksa koneksi atau coba lagi.';
      }
    });
  }

  public selectCurrencyRegion(region: 'all' | 'popular' | 'asia' | 'europe_americas'): void {
    this.selectedCurrencyRegion = region;
  }

  public toggleCurrencyCopy(rate: BiExchangeRateItem): void {
    this.selectedCurrencyForCopy =
      this.selectedCurrencyForCopy?.currency === rate.currency ? null : rate;
    this.currencyCopyMessage = '';
    this.currencyCopyError = false;
  }

  public async copyCurrencyRates(rate: BiExchangeRateItem): Promise<void> {
    const copyText = this.formatCurrencyRate(rate.middleRate).replace(/^Rp\s*/, '');

    if (!navigator.clipboard?.writeText) {
      this.currencyCopyError = true;
      this.currencyCopyMessage = this.isEn
        ? 'Clipboard access is unavailable in this browser.'
        : 'Fitur salin tidak tersedia di browser ini.';
      return;
    }

    try {
      await navigator.clipboard.writeText(copyText);
      this.currencyCopyError = false;
      this.currencyCopyMessage = this.isEn ? 'Rates copied.' : 'Harga kurs berhasil disalin.';
    } catch {
      this.currencyCopyError = true;
      this.currencyCopyMessage = this.isEn
        ? 'Could not copy rates. Check clipboard permissions.'
        : 'Harga kurs gagal disalin. Periksa izin clipboard browser.';
    }
  }

  public async copyEstimatedCurrency(): Promise<void> {
    const copyText = `Hasil Estimasi (Kurs Tengah BI): ${this.formatCurrencyRate(this.calculatedConvertIdr)}`;
    if (!navigator.clipboard?.writeText) {
      this.estimatedCopyError = true;
      this.estimatedCopyMessage = this.isEn
        ? 'Clipboard access is unavailable in this browser.'
        : 'Fitur salin tidak tersedia di browser ini.';
      return;
    }

    try {
      await navigator.clipboard.writeText(copyText);
      this.estimatedCopyError = false;
      this.estimatedCopyMessage = this.isEn ? 'Estimated price copied.' : 'Hasil estimasi berhasil disalin.';
    } catch {
      this.estimatedCopyError = true;
      this.estimatedCopyMessage = this.isEn
        ? 'Could not copy estimate. Check clipboard permissions.'
        : 'Hasil estimasi gagal disalin. Periksa izin clipboard browser.';
    }
  }

  public selectMarketPriceForCopy(key: string, text: string): void {
    if (this.selectedMarketPriceCopyKey === key) {
      this.selectedMarketPriceCopyKey = null;
      this.marketPriceCopyMessage = '';
      return;
    }
    this.selectedMarketPriceCopyKey = key;
    this.marketPriceCopyMessage = '';
    this.marketPriceCopyError = false;
    this.marketPriceCopyText = text;
  }

  private marketPriceCopyText = '';

  public selectPreciousMetalForCopy(metal: LogamMuliaPriceItem): void {
    const buyback = metal.buybackPrice === null
      ? ''
      : `\n${this.isEn ? 'Buyback' : 'Buyback'}: ${this.formatMetalPrice(metal.buybackPrice)}`;
    this.selectMarketPriceForCopy(
      `precious:${metal.name}`,
      `${this.getMetalDisplayName(metal)}\n${this.isEn ? 'Selling price' : 'Harga jual'}: ${this.formatMetalPrice(metal.sellPrice)}${buyback}\n${this.isEn ? 'Date' : 'Tanggal'}: ${metal.recordedDate}`
    );
  }

  public selectIndustrialMetalForCopy(metal: IndustrialMetalItem): void {
    const changePercent = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(metal.changePercent);
    const changeUsd = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(metal.changeUsd);

    this.selectMarketPriceForCopy(
      `industrial:${metal.id}`,
      [
        `INVESTING.COM • ${metal.exchange}`,
        this.isEn ? metal.englishName : metal.name,
        `${metal.englishName} • ${this.isEn ? 'Contract' : 'Kontrak'} ${metal.contractMonth}`,
        this.formatUsd(metal.priceUsd),
        metal.unit,
        `${this.isEn ? 'Estimate:' : 'Estimasi:'} ${this.formatIdrPrice(metal.priceIdr)} / ${metal.idrUnit.replace('Rp / ', '')}`,
        `${metal.changePercent > 0 ? '+' : ''}${changePercent}% (${metal.changeUsd > 0 ? '+' : ''}${changeUsd})`
      ].join('\n')
    );
  }

  public selectCommodityForCopy(item: CommodityPriceItem): void {
    this.selectedMarketPriceCopyKey = `commodity:${item.id}`;
    this.marketPriceCopyError = false;
    this.marketPriceCopyMessage = '';
    this.marketPriceCopyText = [
      this.getCommodityDisplayName(item),
      `${this.formatCommodityPrice(item.price)} per ${item.denomination}`,
      item.fluc !== 0
        ? `${item.fluc > 0 ? '+' : ''}${item.fluc}% (${item.change > 0 ? '+' : ''}${this.formatCommodityPrice(item.change)})`
        : (this.isEn ? 'Stable (Rp 0)' : 'Stabil (Rp 0)')
    ].join('\n');
  }

  public selectStockSummaryForCopy(summary: StockQuoteSummary): void {
    this.selectMarketPriceForCopy(
      `stock-summary:${summary.symbol}`,
      [
        `${summary.name} (${summary.symbol})`,
        `${this.isEn ? 'Price' : 'Harga'}: ${this.formatStockNumber(summary.regularMarketPrice)} ${summary.currency}`,
        `${this.isEn ? 'Change' : 'Perubahan'}: ${summary.change > 0 ? '+' : ''}${this.formatStockNumber(summary.change)} (${summary.changePercent > 0 ? '+' : ''}${this.formatStockNumber(summary.changePercent)}%)`,
        `${this.isEn ? 'Updated' : 'Diperbarui'}: ${summary.lastUpdated.toLocaleString(this.isEn ? 'en-US' : 'id-ID')}`
      ].join('\n')
    );
  }

  public selectStockHistoryForCopy(symbol: string, currency: string, row: StockHistoryItem): void {
    this.selectMarketPriceForCopy(
      `stock-history:${symbol}:${row.date}`,
      [
        `${symbol} - ${row.date}`,
        `${this.isEn ? 'Close' : 'Penutupan'}: ${this.formatStockNumber(row.close)} ${currency}`,
        `${this.isEn ? 'Change' : 'Perubahan'}: ${row.change > 0 ? '+' : ''}${this.formatStockNumber(row.change)} (${row.changePercent > 0 ? '+' : ''}${this.formatStockNumber(row.changePercent)}%)`,
        `${this.isEn ? 'Open' : 'Pembukaan'}: ${this.formatStockNumber(row.open)} ${currency}`,
        `${this.isEn ? 'High' : 'Tertinggi'}: ${this.formatStockNumber(row.high)} ${currency}`,
        `${this.isEn ? 'Low' : 'Terendah'}: ${this.formatStockNumber(row.low)} ${currency}`,
        `${this.isEn ? 'Volume' : 'Volume'}: ${this.formatVolume(row.volume)}`
      ].join('\n')
    );
  }

  public async copySelectedMarketPrice(): Promise<void> {
    if (!this.marketPriceCopyText) return;
    if (!navigator.clipboard?.writeText) {
      this.marketPriceCopyError = true;
      this.marketPriceCopyMessage = this.isEn
        ? 'Clipboard access is unavailable in this browser.'
        : 'Fitur salin tidak tersedia di browser ini.';
      return;
    }

    try {
      await navigator.clipboard.writeText(this.marketPriceCopyText);
      this.marketPriceCopyError = false;
      this.marketPriceCopyMessage = this.isEn ? 'Price copied.' : 'Harga berhasil disalin.';
    } catch {
      this.marketPriceCopyError = true;
      this.marketPriceCopyMessage = this.isEn
        ? 'Could not copy price. Check clipboard permissions.'
        : 'Harga gagal disalin. Periksa izin clipboard browser.';
    }
  }

  public get filteredCurrencyRates(): BiExchangeRateItem[] {
    if (!this.currencyRates || this.currencyRates.length === 0) return [];
    let list = this.currencyRates;
    if (this.selectedCurrencyRegion !== 'all') {
      list = list.filter(r => r.region === this.selectedCurrencyRegion);
    }
    if (this.currencySearchQuery && this.currencySearchQuery.trim()) {
      const q = this.currencySearchQuery.trim().toLowerCase();
      list = list.filter(r => r.currency.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    }
    return list;
  }

  public formatCurrencyRate(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(value);
  }

  public get calculatedConvertIdr(): number {
    const item = this.currencyRates.find(r => r.currency === this.calcFromCurrency);
    if (!item) return 0;
    const amount = Number(this.calcAmount) || 0;
    return (amount / item.unit) * item.middleRate;
  }

  public loadMetalPrices(forceRefresh = false): void {
    this.metalPricesStatus = 'loading';
    this.metalPricesError = '';
    this.metalPriceService.getLatestInIdr(forceRefresh).subscribe({
      next: snapshot => {
        this.metalPrices = snapshot.prices;
        this.metalPricesUpdatedAt = snapshot.updatedAt;
        this.metalPricesRecordedDate = snapshot.recordedDate || '';
        this.metalPricesStatus = 'ready';
      },
      error: (_error: unknown) => {
        this.metalPricesStatus = 'error';
        this.metalPricesError = 'Harga Emas Logam Mulia belum dapat dimuat. Silakan periksa koneksi atau coba lagi.';
      }
    });
  }

  public selectMetalCategory(cat: 'all' | MetalCategory): void {
    this.selectedMetalCategory = cat;
  }

  public get filteredMetalPrices(): LogamMuliaPriceItem[] {
    if (!this.metalPrices || this.metalPrices.length === 0) return [];
    if (this.selectedMetalCategory === 'all') {
      return this.metalPrices;
    }
    return this.metalPrices.filter(p => p.category === this.selectedMetalCategory);
  }

  public saveMetalPriceApiKey(): void {
    // Kept for backwards compatibility
  }

  public formatMetalPrice(price: number): string {
    if (!Number.isFinite(price) || price <= 0) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(price);
  }

  // ==========================================
  // KOMODITAS PANGAN (PIHPS BANK INDONESIA)
  // ==========================================
  public loadCommodityPrices(forceRefresh = false): void {
    this.commodityPricesStatus = 'loading';
    this.commodityPricesError = '';
    this.commodityPriceService.getCommodities(forceRefresh).subscribe({
      next: snapshot => {
        this.commodityPrices = snapshot.commodities;
        this.commodityPricesUpdatedAt = snapshot.updatedAt;
        this.commodityPricesRecordedDate = snapshot.recordedDate;
        this.commodityPricesStatus = 'ready';
      },
      error: (_err: unknown) => {
        this.commodityPricesStatus = 'error';
        this.commodityPricesError = 'Data harga pangan belum dapat dimuat. Silakan periksa koneksi atau coba lagi.';
      }
    });
  }

  public selectCommodityGroup(group: CommodityGroup): void {
    this.selectedCommodityGroup = group;
  }

  public get filteredCommodityPrices(): CommodityPriceItem[] {
    if (!this.commodityPrices || this.commodityPrices.length === 0) return [];
    let list = this.commodityPrices;
    if (this.selectedCommodityGroup !== 'all') {
      list = list.filter(item => item.group === this.selectedCommodityGroup);
    }
    if (this.commoditySearchQuery && this.commoditySearchQuery.trim()) {
      const q = this.commoditySearchQuery.trim().toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q) || item.groupLabel.toLowerCase().includes(q));
    }
    return list;
  }

  public formatCommodityPrice(num: number): string {
    if (!Number.isFinite(num) || num <= 0) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(num);
  }

  public openCommodityDetail(item: CommodityPriceItem): void {
    this.selectedMarketPriceCopyKey = null;
    this.marketPriceCopyMessage = '';
    this.marketPriceCopyError = false;
    this.marketPriceCopyText = '';
    this.selectedCommodityModal = item;
  }

  public closeCommodityDetail(): void {
    this.selectedCommodityModal = null;
    this.selectedMarketPriceCopyKey = null;
    this.marketPriceCopyMessage = '';
    this.marketPriceCopyError = false;
    this.marketPriceCopyText = '';
  }

  public getCommodityGroups() {
    return this.commodityPriceService.getCommodityGroups();
  }

  public get commoditySummaryStats() {
    const up = this.commodityPrices.filter(c => c.fluc > 0).length;
    const down = this.commodityPrices.filter(c => c.fluc < 0).length;
    const stable = this.commodityPrices.filter(c => c.fluc === 0).length;
    return { up, down, stable, total: this.commodityPrices.length };
  }

  public getCommoditySparklinePoints(history: CommodityHistoryPoint[]): string {
    if (!history || history.length < 2) return '';
    const prices = history.map(h => h.nominal);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const width = 80;
    const height = 28;
    const padding = 3;

    return history.map((h, i) => {
      const x = (i / (history.length - 1)) * (width - 2 * padding) + padding;
      const y = height - padding - ((h.nominal - min) / range) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  // ==========================================
  // LOGAM INDUSTRI (INVESTING.COM)
  // ==========================================
  public loadIndustrialMetals(forceRefresh = false): void {
    this.industrialMetalsStatus = 'loading';
    this.industrialMetalsError = '';
    this.industrialMetalService.getIndustrialMetals(forceRefresh).subscribe({
      next: snapshot => {
        this.industrialMetals = snapshot.metals;
        this.industrialMetalsUpdatedAt = snapshot.updatedAt;
        this.industrialMetalsRecordedDate = snapshot.recordedDate;
        this.industrialMetalsUsdRate = snapshot.usdToIdrRate;
        this.industrialMetalsStatus = 'ready';
      },
      error: (_err: unknown) => {
        this.industrialMetalsStatus = 'error';
        this.industrialMetalsError = 'Data komoditas logam industri belum dapat dimuat. Silakan periksa koneksi atau coba lagi.';
      }
    });
  }

  public selectIndustrialMetalGroup(group: IndustrialMetalGroup): void {
    this.selectedIndustrialMetalGroup = group;
  }

  public get filteredIndustrialMetals(): IndustrialMetalItem[] {
    if (!this.industrialMetals || this.industrialMetals.length === 0) return [];
    let list = this.industrialMetals;
    if (this.selectedIndustrialMetalGroup !== 'all') {
      list = list.filter(item => item.category === this.selectedIndustrialMetalGroup);
    }
    if (this.industrialMetalSearchQuery && this.industrialMetalSearchQuery.trim()) {
      const q = this.industrialMetalSearchQuery.trim().toLowerCase();
      list = list.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.englishName.toLowerCase().includes(q) ||
        item.symbol.toLowerCase().includes(q) ||
        item.exchange.toLowerCase().includes(q)
      );
    }
    return list;
  }

  public openIndustrialMetalDetail(item: IndustrialMetalItem): void {
    this.selectedMarketPriceCopyKey = null;
    this.marketPriceCopyMessage = '';
    this.marketPriceCopyError = false;
    this.marketPriceCopyText = '';
    this.selectedIndustrialMetalModal = item;
  }

  public closeIndustrialMetalDetail(): void {
    this.selectedIndustrialMetalModal = null;
    this.selectedMarketPriceCopyKey = null;
    this.marketPriceCopyMessage = '';
    this.marketPriceCopyError = false;
    this.marketPriceCopyText = '';
  }

  public get industrialMetalSummaryStats() {
    const up = this.industrialMetals.filter(m => m.trend === 'up').length;
    const down = this.industrialMetals.filter(m => m.trend === 'down').length;
    const stable = this.industrialMetals.filter(m => m.trend === 'stable').length;
    return { up, down, stable, total: this.industrialMetals.length };
  }

  public getIndustrialMetalSparklinePoints(history: Array<{ priceUsd: number }>): string {
    if (!history || history.length < 2) return '';
    const prices = history.map(h => h.priceUsd);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const width = 80;
    const height = 28;
    const padding = 3;

    return history.map((h, i) => {
      const x = (i / (history.length - 1)) * (width - 2 * padding) + padding;
      const y = height - padding - ((h.priceUsd - min) / range) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  public formatUsd(val: number): string {
    if (!Number.isFinite(val)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: val < 10 ? 2 : 1,
      maximumFractionDigits: val < 10 ? 4 : 2
    }).format(val);
  }

  public formatIdrPrice(num: number): string {
    if (!Number.isFinite(num) || num <= 0) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(num);
  }

  ngOnInit() {
    this.loadSavingsGoals();
    this.restoreCopiedTransactionDraft();
    this.registerNativeBackButton();

    const currentUser = this.authService.currentUser;
    this.roomService.initForUser(currentUser?.email);

    this.subs.push(
      this.authService.loadSession().subscribe(user => {
        if (user?.email) {
          this.roomService.initForUser(user.email);
        }
      }),
      this.financeService.transactions$.subscribe(txs => {
        this.transactions = txs;
        this.recalculateAll();
        if (this.activeRoom) {
          this.roomService.updateActiveRoomData(txs, undefined);
          // Sync ke server (fire-and-forget, tidak memblokir UI)
          this.roomApiService.syncRoom(this.activeRoom.id, { transactions: txs }).catch(() => {});
        }
      }),
      this.financeService.categories$.subscribe(cats => {
        this.categories = cats;
        this.recalculateAll();
      }),
      this.financeService.settings$.subscribe(settings => {
        this.settings = settings;
        this.syncSettingsView(settings);
        if (settings?.themeColor) {
          this.financeService.applyTheme(settings.themeColor);
        }
        this.recalculateAll();
      }),
      this.roomService.activeRoom$.subscribe(room => {
        this.activeRoom = room;
        if (room) {
          if (room.transactions && room.transactions.length > 0) {
            this.financeService.setTransactions(room.transactions);
          }
          if (room.savingsGoals && room.savingsGoals.length > 0) {
            this.savingsService.setGoals(room.savingsGoals);
            this.savingsGoals = room.savingsGoals;
          }
        }
        this.recalculateAll();
      })
    );

    // If navigated from login and no active room yet, show room setup view
    if (this.route.snapshot.queryParamMap.has('fromLogin')) {
      this.activeView = 'room_setup';
    }

    // Auto-refresh data pasar & komoditas ketika aplikasi pertama kali dibuka (hari ini)
    this.loadCommodityPrices(true);
    this.loadIndustrialMetals(false);
  }

  ngOnDestroy() {
    this.isPageDestroyed = true;
    this.subs.forEach(s => s.unsubscribe());
    if (this.exitPressTimeout) clearTimeout(this.exitPressTimeout);
    if (this.backButtonListener) {
      void this.backButtonListener.remove().catch(error => {
        console.error('Gagal melepas listener tombol kembali.', error);
      });
    }
  }

  private async registerNativeBackButton(): Promise<void> {
    if (!Capacitor.isNativePlatform() || this.backButtonRegistrationPending) return;
    this.backButtonRegistrationPending = true;

    try {
      const listener = await CapacitorApp.addListener('backButton', () => {
        if (this.isPageDestroyed) return;
        this.handleNativeBackButton();
      });
      if (this.isPageDestroyed) {
        await listener.remove();
        return;
      }
      this.backButtonListener = listener;
    } catch (error) {
      console.error('Gagal mengaktifkan navigasi tombol kembali perangkat.', error);
    } finally {
      this.backButtonRegistrationPending = false;
    }
  }

  private handleNativeBackButton(): void {
    if (this.handleBackNavigation()) {
      this.resetExitPress();
      this.changeDetector.detectChanges();
      return;
    }

    if (!this.isExitPressArmed) {
      this.isExitPressArmed = true;
      this.exitToastMessage = this.isEn
        ? 'Press back again to exit.'
        : 'Tekan tombol kembali sekali lagi untuk keluar.';
      if (this.exitPressTimeout) clearTimeout(this.exitPressTimeout);
      this.exitPressTimeout = setTimeout(() => {
        this.resetExitPress();
        this.changeDetector.detectChanges();
      }, 2000);
      this.changeDetector.detectChanges();
      return;
    }

    this.resetExitPress();
    this.promptConfirm({
      title: this.isEn ? 'Exit app?' : 'Keluar dari aplikasi?',
      message: this.isEn ? 'Are you sure you want to exit this app?' : 'Yakin mau keluar dari aplikasi ini?',
      confirmText: this.isEn ? 'Exit' : 'Keluar',
      cancelText: this.isEn ? 'Cancel' : 'Batal',
      type: 'warning',
      onConfirm: () => {
        void CapacitorApp.exitApp().catch(error => {
          console.error('Gagal keluar dari aplikasi.', error);
        });
      }
    });
    this.changeDetector.detectChanges();
  }

  private resetExitPress(): void {
    this.isExitPressArmed = false;
    this.exitToastMessage = '';
    if (this.exitPressTimeout) {
      clearTimeout(this.exitPressTimeout);
      this.exitPressTimeout = null;
    }
  }

  private navigateToPreviousView(fallback: HomeView = 'report', preferredView?: HomeView): boolean {
    const currentView = this.activeView;
    let destination: HomeView | undefined;

    while (this.viewHistory.length > 0) {
      const candidate = this.viewHistory.pop();
      if (candidate && candidate !== currentView && (!preferredView || candidate === preferredView)) {
        destination = candidate;
        break;
      }
    }

    if (!destination) {
      const safeFallback = preferredView && preferredView !== currentView ? preferredView : fallback;
      if (safeFallback === currentView) return false;
      destination = safeFallback;
    }

    this.isRestoringView = true;
    this.activeView = destination;
    this.isRestoringView = false;
    return true;
  }

  public goBackToPreviousView(fallback: HomeView = 'report'): void {
    this.navigateToPreviousView(fallback);
  }

  private handleBackNavigation(): boolean {
    if (this.achievedSavingsGoal) {
      this.achievedSavingsGoal = null;
      return true;
    }
    if (this.selectedGoalForContribution) {
      this.closeContributionModal();
      return true;
    }
    if (this.isSavingGoalModalOpen) {
      this.closeSavingGoalModal();
      return true;
    }
    if (this.isCreateRoomModalOpen) {
      this.closeCreateRoomModal();
      return true;
    }
    if (this.isJoinRoomModalOpen) {
      this.closeJoinRoomModal();
      return true;
    }
    if (this.isRoomDetailsModalOpen) {
      this.closeRoomDetailsModal();
      return true;
    }
    if (this.isRoomCreatedSuccessModalOpen) {
      this.finishCreateRoomAndGoHome();
      return true;
    }
    if (this.isConfirmModalOpen) {
      this.handleConfirmModalCancel();
      return true;
    }
    if (this.isChartPeriodMenuOpen || this.isChartSortMenuOpen) {
      this.closeChartSelectMenus();
      return true;
    }
    if (this.isExportCategoryMenuOpen || this.isExportFormatMenuOpen) {
      this.closeExportSelectMenus();
      return true;
    }
    if (this.isMonthPickerOpen) {
      this.closeMonthPicker();
      return true;
    }
    if (this.isDuplicateModalOpen) {
      this.closeDuplicateTransactionModal();
      return true;
    }
    if (this.isTransactionCopyMenuOpen) {
      this.isTransactionCopyMenuOpen = false;
      return true;
    }
    if (this.isHeaderMenuOpen) {
      this.isHeaderMenuOpen = false;
      return true;
    }
    if (this.isMiniCalcOpen) {
      this.isMiniCalcOpen = false;
      return true;
    }
    if (this.selectedCommodityModal) {
      this.closeCommodityDetail();
      return true;
    }
    if (this.selectedIndustrialMetalModal) {
      this.closeIndustrialMetalDetail();
      return true;
    }
    if (this.selectedMarketPriceCategory) {
      this.closeMarketPriceCategory();
      return true;
    }
    if (this.isExportModalOpen) {
      this.closeExportModal();
      return true;
    }
    if (this.isFilterModalOpen) {
      this.closeFilterModal();
      return true;
    }
    if (this.isHelpModalOpen) {
      this.isHelpModalOpen = false;
      return true;
    }
    if (this.isAboutModalOpen) {
      this.isAboutModalOpen = false;
      return true;
    }
    if (this.isAddCatModalOpen) {
      this.isAddCatModalOpen = false;
      return true;
    }
    if (this.isEditCatModalOpen) {
      this.isEditCatModalOpen = false;
      return true;
    }
    if (this.isWidgetModalOpen) {
      this.isWidgetModalOpen = false;
      return true;
    }
    if (this.isRatingModalOpen) {
      this.isRatingModalOpen = false;
      return true;
    }
    if (this.isForgotPinOpen) {
      this.isForgotPinOpen = false;
      return true;
    }
    if (this.isCategoryModalOpen) {
      this.isCategoryModalOpen = false;
      return true;
    }
    if (this.isSettingPickerOpen) {
      this.isSettingPickerOpen = false;
      return true;
    }
    if (this.isFormOpen) {
      this.isFormOpen = false;
      return true;
    }

    if (this.activeView === 'create_transaction') {
      this.closeTransactionForm();
      return true;
    }
    if (this.activeView === 'category_detail') {
      return this.navigateToPreviousView('charts');
    }
    if (this.activeView === 'report') {
      return false;
    }
    return this.navigateToPreviousView('report');
  }

  // --- Recalculation ---
  public recalculateAll() {
    this.yearlySummary = this.financeService.getYearlyStats(this.selectedYear);
    this.monthlySummaryList = this.financeService.getMonthlyList(this.selectedYear);
    this.calculateFinancialChart();
    if (this.selectedCategoryForDetail) {
      this.calculateCategoryDetailTrend();
    }
  }

  // --- Dynamic Summary for Currently Selected Period ---
  public getCurrentPeriodSummary() {
    const monthStr = this.selectedMonth.toString().padStart(2, '0');
    const prefix = `${this.selectedYear}-${monthStr}`;

    let txs: Transaction[] = [];
    if (this.reportPeriod === 'yearly') {
      txs = this.transactions.filter(t => t.date.startsWith(`${this.selectedYear}-`));
    } else if (this.reportPeriod === 'daily' && this.selectedDailyDateRange) {
      const range = this.selectedDailyDateRange;
      txs = this.transactions.filter(t =>
        t.date >= range.start && t.date <= range.end
      );
    } else {
      txs = this.transactions.filter(t => t.date.startsWith(prefix));
    }

    if (this.appliedFilterCategoryIds.length > 0 && this.appliedFilterCategoryIds.length < this.categories.length) {
      txs = txs.filter(t => this.appliedFilterCategoryIds.includes(t.categoryId));
    }

    let inc = 0;
    let exp = 0;
    txs.forEach(t => {
      if (t.type === 'income') inc += t.amount;
      else exp += t.amount;
    });

    return {
      income: inc,
      expense: exp,
      balance: inc - exp,
      count: txs.length
    };
  }

  // --- Grouped Daily Transactions for Harian Tab ---
  public getDailyGroupsForSelectedMonth(): DayGroup[] {
    const monthStr = this.selectedMonth.toString().padStart(2, '0');
    const prefix = `${this.selectedYear}-${monthStr}`;
    const range = this.selectedDailyDateRange;
    let txs = range
      ? this.transactions.filter(t =>
        t.date >= range.start && t.date <= range.end
      )
      : this.transactions.filter(t => t.date.startsWith(prefix));

    if (this.appliedFilterCategoryIds.length > 0 && this.appliedFilterCategoryIds.length < this.categories.length) {
      txs = txs.filter(t => this.appliedFilterCategoryIds.includes(t.categoryId));
    }

    if (txs.length === 0) return [];

    const map = new Map<string, Transaction[]>();
    txs.forEach(t => {
      const arr = map.get(t.date) || [];
      arr.push(t);
      map.set(t.date, arr);
    });

    const groups: DayGroup[] = [];
    map.forEach((tList, dateStr) => {
      const d = new Date(dateStr + 'T00:00:00');
      const dayNum = d.getDate().toString().padStart(2, '0');
      const monthYear = `${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
      const idDayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const enDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = (this.isEn ? enDayNames : idDayNames)[d.getDay()];

      let inc = 0;
      let exp = 0;
      tList.forEach(t => {
        if (t.type === 'income') inc += t.amount;
        else exp += t.amount;
      });

      groups.push({
        dateStr,
        dayNumber: dayNum,
        monthYear,
        dayName,
        income: inc,
        expense: exp,
        transactions: tList
      });
    });

    if (this.isDailySortAsc) {
      groups.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    } else {
      groups.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    }

    return groups;
  }

  public openWeekInDailyView(week: WeekSummary) {
    this.selectedDailyDateRange = { start: week.startDate, end: week.endDate };
    this.reportPeriod = 'daily';
  }

  public toggleDailySort() {
    this.isDailySortAsc = !this.isDailySortAsc;
  }

  // --- Grouped Weekly Summary (Screenshot Mingguan) ---
  public getWeeklySummaryList(): WeekSummary[] {
    const year = this.selectedYear;
    const month = this.selectedMonth; // 1-12
    const weeks: WeekSummary[] = [];

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0); // last day of month

    // Find the Sunday on or before firstDay
    const startSunday = new Date(firstDay);
    startSunday.setDate(startSunday.getDate() - startSunday.getDay());

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

    let currentStart = new Date(startSunday);
    let weekNum = 1;

    while (currentStart <= lastDay || (currentStart.getMonth() === month - 1)) {
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + 6);

      const startISO = `${currentStart.getFullYear()}-${(currentStart.getMonth() + 1).toString().padStart(2, '0')}-${currentStart.getDate().toString().padStart(2, '0')}`;
      const endISO = `${currentEnd.getFullYear()}-${(currentEnd.getMonth() + 1).toString().padStart(2, '0')}-${currentEnd.getDate().toString().padStart(2, '0')}`;

      const startLabel = `${currentStart.getDate().toString().padStart(2, '0')}.${(currentStart.getMonth() + 1).toString().padStart(2, '0')}`;
      const endLabel = `${currentEnd.getDate().toString().padStart(2, '0')}.${(currentEnd.getMonth() + 1).toString().padStart(2, '0')}`;

      // Calculate income and expense from transactions in this week range
      let inc = 0;
      let exp = 0;
      this.transactions.forEach(t => {
        const passesCategoryFilter = this.appliedFilterCategoryIds.length === 0
          || this.appliedFilterCategoryIds.length >= this.categories.length
          || this.appliedFilterCategoryIds.includes(t.categoryId);
        if (t.date >= startISO && t.date <= endISO && passesCategoryFilter) {
          if (t.type === 'income') inc += t.amount;
          else exp += t.amount;
        }
      });

      const isCurrent = todayStr >= startISO && todayStr <= endISO;

      weeks.push({
        weekNumber: weekNum,
        weekName: this.isEn ? `Week ${weekNum}` : `Minggu ${weekNum}`,
        startDate: startISO,
        endDate: endISO,
        dateRangeLabel: `${startLabel} ~ ${endLabel}`,
        income: inc,
        expense: exp,
        isCurrent
      });

      weekNum++;
      currentStart.setDate(currentStart.getDate() + 7);

      // Stop if the new week begins past the end of this month
      if (currentStart > lastDay && currentStart.getMonth() !== month - 1) {
        break;
      }
    }

    // Reverse so highest week is at top, down to Minggu 1 (matching screenshot)
    return weeks.reverse();
  }

  // --- Year Navigation ---
  public prevYear() {
    this.selectedYear--;
    this.recalculateAll();
  }

  public nextYear() {
    this.selectedYear++;
    this.recalculateAll();
  }

  // --- Month Navigation ---
  public prevMonth() {
    this.selectedDailyDateRange = null;
    if (this.selectedMonth === 1) {
      this.selectedMonth = 12;
      this.selectedYear--;
    } else {
      this.selectedMonth--;
    }
    this.pickerYear = this.selectedYear;
    this.recalculateAll();
  }

  public nextMonth() {
    this.selectedDailyDateRange = null;
    if (this.selectedMonth === 12) {
      this.selectedMonth = 1;
      this.selectedYear++;
    } else {
      this.selectedMonth++;
    }
    this.pickerYear = this.selectedYear;
    this.recalculateAll();
  }

  public getMonthName(monthNumber: number): string {
    const isEn = this.settings?.language === 'en';
    const idMonths = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    const enMonths = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return isEn ? enMonths[monthNumber] : idMonths[monthNumber];
  }

  // Month Picker Actions (Image 2)
  public openMonthPicker() {
    this.pickerYear = this.selectedYear;
    this.isMonthPickerOpen = true;
  }

  public closeMonthPicker() {
    this.isMonthPickerOpen = false;
  }

  public toggleMonthPicker() {
    if (this.isMonthPickerOpen) {
      this.closeMonthPicker();
    } else {
      this.openMonthPicker();
    }
  }

  public pickerPrevYear() {
    this.pickerYear--;
  }

  public pickerNextYear() {
    this.pickerYear++;
  }

  public selectMonth(month: number) {
    this.selectedDailyDateRange = null;
    this.selectedYear = this.pickerYear;
    this.selectedMonth = month;
    this.isMonthPickerOpen = false;
    this.recalculateAll();
  }

  // Format number helpers matching Image 3
  public formatSummaryNumber(num: number): string {
    if (num === 0) return '0';
    const isNegative = num < 0;
    const absFormatted = Math.round(Math.abs(num)).toLocaleString('id-ID');
    return isNegative ? `-${absFormatted}` : absFormatted;
  }

  public formatNumberWithDot(amount: number): string {
    return Math.round(Math.abs(amount)).toLocaleString('id-ID');
  }

  // --- Financial Chart (Screenshot 4) ---
  public getChartPeriodLabel(period: 'weekly' | 'monthly' | 'yearly' | 'custom'): string {
    switch (period) {
      case 'weekly': return this.isEn ? 'Weekly' : 'Mingguan';
      case 'monthly': return this.i18n.t('report.monthly');
      case 'yearly': return this.i18n.t('report.yearly');
      case 'custom': return this.isEn ? 'Custom' : 'Sesuaikan';
    }
  }

  public getChartSortLabel(sort: 'highest' | 'lowest' | 'name'): string {
    switch (sort) {
      case 'highest': return this.i18n.t('chart.highest');
      case 'lowest': return this.i18n.t('chart.lowest');
      case 'name': return this.isEn ? 'Name' : 'Nama';
    }
  }

  public toggleChartPeriodMenu(): void {
    this.isChartPeriodMenuOpen = !this.isChartPeriodMenuOpen;
    this.isChartSortMenuOpen = false;
  }

  public toggleChartSortMenu(): void {
    this.isChartSortMenuOpen = !this.isChartSortMenuOpen;
    this.isChartPeriodMenuOpen = false;
  }

  public closeChartSelectMenus(): void {
    this.isChartPeriodMenuOpen = false;
    this.isChartSortMenuOpen = false;
  }

  public selectChartPeriod(period: 'weekly' | 'monthly' | 'yearly' | 'custom'): void {
    if (period === 'weekly') this.chartWeekOffset = 0;
    this.chartPeriod = period;
    this.closeChartSelectMenus();
    this.onChartPeriodChange();
  }

  public getChartWeekRange(): { start: Date; end: Date } {
    const referenceDate = new Date(this.selectedYear, this.selectedMonth - 1, 1);
    const mondayOffset = (referenceDate.getDay() + 6) % 7;
    const start = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() - mondayOffset + this.chartWeekOffset * 7
    );
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start, end };
  }

  public getChartWeekRangeLabel(): string {
    const { start, end } = this.getChartWeekRange();
    return `${this.formatDateLabel(start)} ~ ${this.formatDateLabel(end)}`;
  }

  public navigateChartWeek(direction: -1 | 1): void {
    this.chartWeekOffset += direction;
    this.calculateFinancialChart();
  }

  public selectChartSort(sort: 'highest' | 'lowest' | 'name'): void {
    this.chartSort = sort;
    this.closeChartSelectMenus();
    this.calculateFinancialChart();
  }

  public onChartPeriodChange() {
    if (this.chartPeriod === 'custom' && (!this.chartCustomStartDate || !this.chartCustomEndDate)) {
      const monthStart = new Date(this.selectedYear, this.selectedMonth - 1, 1);
      const monthEnd = new Date(this.selectedYear, this.selectedMonth, 0);
      this.chartCustomStartDate = this.formatLocalDate(monthStart);
      this.chartCustomEndDate = this.formatLocalDate(monthEnd);
    }
    this.calculateFinancialChart();
  }

  public get isCustomChartRangeValid(): boolean {
    return !!this.chartCustomStartDate && !!this.chartCustomEndDate &&
      this.chartCustomStartDate <= this.chartCustomEndDate;
  }

  public calculateFinancialChart() {
    const monthStr = this.selectedMonth.toString().padStart(2, '0');
    const monthPrefix = `${this.selectedYear}-${monthStr}`;
    const { start: weekStart, end: weekEnd } = this.getChartWeekRange();
    const weekStartStr = this.formatLocalDate(weekStart);
    const weekEndStr = this.formatLocalDate(weekEnd);

    const filtered = this.transactions.filter(t => {
      if (t.type !== this.chartType) return false;
      if (this.chartPeriod === 'weekly') return t.date >= weekStartStr && t.date <= weekEndStr;
      if (this.chartPeriod === 'monthly') return t.date.startsWith(monthPrefix);
      if (this.chartPeriod === 'yearly') return t.date.startsWith(`${this.selectedYear}-`);
      if (this.chartPeriod === 'custom') {
        return this.isCustomChartRangeValid && t.date >= this.chartCustomStartDate &&
          t.date <= this.chartCustomEndDate;
      }
      return true;
    });

    const total = filtered.reduce((acc, t) => acc + t.amount, 0);
    this.totalChartAmount = total;

    // Group by category
    const catMap = new Map<string, number>();
    filtered.forEach(t => {
      const current = catMap.get(t.categoryId) || 0;
      catMap.set(t.categoryId, current + t.amount);
    });

    const shares: CategoryShare[] = [];
    catMap.forEach((catTotal, catId) => {
      const category = this.categories.find(c => c.id === catId) || {
        id: catId,
        name: 'Lain-Lain',
        type: this.chartType,
        icon: 'ellipsis-horizontal-outline',
        color: '#ef4444'
      };
      const percentage = total > 0 ? (catTotal / total) * 100 : 0;
      shares.push({
        category,
        total: catTotal,
        percentage,
        color: category.color || '#3b82f6'
      });
    });

    // Sort
    if (this.chartSort === 'highest') {
      shares.sort((a, b) => b.total - a.total);
    } else if (this.chartSort === 'lowest') {
      shares.sort((a, b) => a.total - b.total);
    } else {
      shares.sort((a, b) => a.category.name.localeCompare(b.category.name));
    }

    // Calculate Donut Segments
    const radius = 65;
    const circumference = 2 * Math.PI * radius;
    let accumulatedAngle = 0;

    shares.forEach(share => {
      const segmentStroke = (share.percentage / 100) * circumference;
      share.strokeDasharray = `${segmentStroke} ${circumference - segmentStroke}`;
      share.strokeDashoffset = -accumulatedAngle;
      accumulatedAngle += segmentStroke;
    });

    this.categoryShares = shares;
  }

  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateLabel(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}.${month}.${date.getFullYear()}`;
  }

  // --- Category Detail & Area Trend (Screenshot 3) ---
  public openCategoryDetail(category: Category) {
    this.selectedCategoryForDetail = category;
    this.calculateCategoryDetailTrend();
    this.activeView = 'category_detail';
  }

  public get filteredSavingsGoals(): SavingsGoal[] {
    const goals = this.savingsGoals.filter(goal =>
      this.savingsTab === 'achieved'
        ? goal.savedAmount >= goal.targetAmount
        : goal.savedAmount < goal.targetAmount
    );
    const direction = this.savingsSortDirection === 'asc' ? 1 : -1;
    return goals.sort((first, second) => {
      let comparison = 0;
      if (this.savingsSortBy === 'name') {
        comparison = first.name.localeCompare(second.name);
      } else if (this.savingsSortBy === 'targetAmount') {
        comparison = first.targetAmount - second.targetAmount;
      } else {
        comparison =
          first.savedAmount / first.targetAmount - second.savedAmount / second.targetAmount;
      }
      return comparison * direction;
    });
  }

  private loadSavingsGoals(): void {
    try {
      this.savingsGoals = this.savingsService.getGoals();
      this.savingsStorageError = '';
    } catch (error) {
      this.savingsStorageError = error instanceof Error ? error.message : String(error);
    }
  }

  public getSavingsProgress(goal: SavingsGoal): number {
    return Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100));
  }

  public formatSavingsMoney(amount: number, currency: SavingsGoal['currency'] = 'IDR'): string {
    const code = currency || 'IDR';
    const locale = this.isEn ? 'en-US' : 'id-ID';
    const maximumFractionDigits = code === 'IDR' || code === 'JPY' ? 0 : 2;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits
    }).format(amount);
  }

  public getSavingsEstimatedCompletionDate(
    targetAmount: number,
    savedAmount: number,
    contributionAmount: number,
    frequency: NonNullable<SavingsGoal['contributionFrequency']>
  ): Date | null {
    const remaining = targetAmount - savedAmount;
    if (remaining <= 0 || !Number.isFinite(contributionAmount) || contributionAmount <= 0) return null;

    const numberOfContributions = Math.ceil(remaining / contributionAmount);
    const estimatedDate = new Date();
    if (frequency === 'daily') {
      estimatedDate.setDate(estimatedDate.getDate() + numberOfContributions);
    } else if (frequency === 'weekly') {
      estimatedDate.setDate(estimatedDate.getDate() + numberOfContributions * 7);
    } else {
      const currentDay = estimatedDate.getDate();
      estimatedDate.setDate(1);
      estimatedDate.setMonth(estimatedDate.getMonth() + numberOfContributions);
      const lastDayOfMonth = new Date(
        estimatedDate.getFullYear(),
        estimatedDate.getMonth() + 1,
        0
      ).getDate();
      estimatedDate.setDate(Math.min(currentDay, lastDayOfMonth));
    }
    return estimatedDate;
  }

  public formatSavingsEstimatedDate(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleDateString(this.isEn ? 'en-US' : 'id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  public formatSavingsDateTime(dateTime: string | undefined): string {
    if (!dateTime) return this.isEn ? 'Not available' : 'Belum tersedia';
    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) return this.isEn ? 'Not available' : 'Belum tersedia';
    return date.toLocaleString(this.isEn ? 'en-US' : 'id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  public getSavingsDurationDays(goal: SavingsGoal): number | null {
    if (!goal.achievedAt) return null;
    const createdAt = new Date(goal.createdAt);
    const achievedAt = new Date(goal.achievedAt);
    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(achievedAt.getTime())) return null;

    const startDay = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
    const achievedDay = new Date(achievedAt.getFullYear(), achievedAt.getMonth(), achievedAt.getDate());
    return Math.max(0, Math.floor((achievedDay.getTime() - startDay.getTime()) / 86400000));
  }

  public toggleAchievementDetails(goalId: string): void {
    if (this.expandedAchievementGoalIds.has(goalId)) {
      this.expandedAchievementGoalIds.delete(goalId);
    } else {
      this.expandedAchievementGoalIds.add(goalId);
    }
  }

  public formatSavingsDate(dateTime: string | undefined): string {
    if (!dateTime) return this.isEn ? 'Not available' : 'Belum tersedia';
    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) return this.isEn ? 'Not available' : 'Belum tersedia';
    return this.formatSavingsEstimatedDate(date);
  }

  public get savingGoalEstimatedDate(): Date | null {
    return this.getSavingsEstimatedCompletionDate(
      Number(this.savingGoalTargetAmount),
      0,
      Number(this.savingGoalPlannedContribution),
      this.savingGoalFrequency
    );
  }

  public formatThousandsInput(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '';
    return Math.trunc(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  public onFormattedAmountInput(event: Event, field: 'transaction' | 'savingsTarget' | 'savingsPlan' | 'savingsDeposit'): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const rawValue = input.value;
    const cursorPosition = input.selectionStart ?? rawValue.length;
    const digitsBeforeCursor = rawValue.slice(0, cursorPosition).replace(/\D/g, '').length;
    const digits = rawValue.replace(/\D/g, '');
    const formattedValue = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = formattedValue;

    const nextCursorPosition = this.getFormattedInputCursorPosition(formattedValue, digitsBeforeCursor);
    input.setSelectionRange(nextCursorPosition, nextCursorPosition);

    const numericValue = digits ? Number(digits) : null;
    switch (field) {
      case 'transaction':
        this.formAmount = numericValue ?? 0;
        this.calcDisplay = this.formAmount.toString();
        this.clearFormValidationMessage('amount');
        break;
      case 'savingsTarget':
        this.savingGoalTargetAmount = numericValue;
        break;
      case 'savingsPlan':
        this.savingGoalPlannedContribution = numericValue;
        break;
      case 'savingsDeposit':
        this.savingContributionAmount = numericValue;
        break;
    }
  }

  private getFormattedInputCursorPosition(formattedValue: string, digitsBeforeCursor: number): number {
    if (digitsBeforeCursor <= 0) return 0;
    let digitsSeen = 0;
    for (let index = 0; index < formattedValue.length; index += 1) {
      if (/\d/.test(formattedValue[index])) {
        digitsSeen += 1;
        if (digitsSeen === digitsBeforeCursor) return index + 1;
      }
    }
    return formattedValue.length;
  }

  public openSavingGoalModal(): void {
    this.savingGoalName = '';
    this.savingGoalTargetAmount = null;
    this.savingGoalCurrency = 'IDR';
    this.savingGoalFrequency = 'daily';
    this.savingGoalPlannedContribution = null;
    this.savingGoalError = '';
    this.isSavingGoalModalOpen = true;
  }

  public closeSavingGoalModal(): void {
    this.isSavingGoalModalOpen = false;
    this.savingGoalError = '';
  }

  public createSavingGoal(): void {
    const name = this.savingGoalName.trim();
    const targetAmount = Number(this.savingGoalTargetAmount);
    const plannedContribution = Number(this.savingGoalPlannedContribution);
    if (
      !name ||
      !Number.isFinite(targetAmount) ||
      targetAmount <= 0 ||
      !Number.isFinite(plannedContribution) ||
      plannedContribution <= 0
    ) {
      this.savingGoalError = this.isEn
        ? 'Enter a name, a target, and a planned contribution greater than zero.'
        : 'Isi nama celengan, target, dan nominal pengisian lebih dari nol.';
      return;
    }

    try {
      this.savingsGoals = [
        ...this.savingsGoals,
        this.savingsService.createGoal(
          name,
          targetAmount,
          this.savingGoalCurrency,
          this.savingGoalFrequency,
          plannedContribution
        )
      ];
      this.savingsStorageError = '';
      this.closeSavingGoalModal();
    } catch (error) {
      this.savingGoalError = error instanceof Error ? error.message : String(error);
    }
  }

  public openContributionModal(goal: SavingsGoal): void {
    this.selectedGoalForContribution = this.savingsGoals.find(item => item.id === goal.id) || goal;
    this.savingContributionAmount = null;
    this.savingContributionAction = 'add';
    this.savingContributionNote = '';
    this.savingContributionError = '';
  }

  public get savingContributionQuickAmounts(): number[] {
    const goal = this.selectedGoalForContribution;
    if (!goal) return [];

    return [goal.plannedContributionAmount, goal.targetAmount].filter(
      (amount): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount > 0
    );
  }

  public closeContributionModal(): void {
    this.selectedGoalForContribution = null;
    this.savingContributionAmount = null;
    this.savingContributionNote = '';
    this.savingContributionError = '';
  }

  public setSavingContributionAmount(amount: number): void {
    this.savingContributionAmount = amount;
    this.savingContributionError = '';
  }

  public recordSaving(): void {
    const goal = this.selectedGoalForContribution;
    const amount = Number(this.savingContributionAmount);
    if (!goal) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      this.savingContributionError = this.isEn
        ? 'Enter an amount greater than zero.'
        : 'Masukkan jumlah lebih dari nol.';
      return;
    }
    if (this.savingContributionAction === 'subtract' && amount > goal.savedAmount) {
      this.savingContributionError = this.isEn
        ? 'The amount to reduce cannot exceed the current savings balance.'
        : 'Jumlah pengurangan tidak boleh melebihi saldo tabungan saat ini.';
      return;
    }

    try {
      const reachesTarget =
        this.savingContributionAction === 'add' &&
        goal.savedAmount < goal.targetAmount &&
        goal.savedAmount + amount >= goal.targetAmount;
      this.savingsService.addContribution(
        goal.id,
        amount,
        this.savingContributionAction,
        this.savingContributionNote
      );
      this.loadSavingsGoals();
      if (this.savingsStorageError) {
        this.savingContributionError = this.savingsStorageError;
        return;
      }
      this.closeContributionModal();
      if (reachesTarget) {
        this.achievedSavingsGoal = this.savingsGoals.find(item => item.id === goal.id) || null;
        this.savingsTab = 'achieved';
      }
    } catch (error) {
      this.savingContributionError = error instanceof Error ? error.message : String(error);
    }
  }

  public deleteSavingGoal(goal: SavingsGoal): void {
    const confirmed = confirm(
      this.isEn ? `Delete the "${goal.name}" savings goal?` : `Hapus celengan "${goal.name}"?`
    );
    if (!confirmed) return;
    try {
      this.savingsService.deleteGoal(goal.id);
      this.loadSavingsGoals();
    } catch (error) {
      this.savingsStorageError = error instanceof Error ? error.message : String(error);
    }
  }

  public calculateCategoryDetailTrend() {
    if (!this.selectedCategoryForDetail) return;
    const catId = this.selectedCategoryForDetail.id;

    // Build 8 months trend ending at selectedMonth / selectedYear
    // E.g. Agt, Sep, Okt, Nov, Des, Jan, Feb, Mar
    const months: { label: string; year: number; month: number; amount: number; x: number; y: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      let targetMonth = this.selectedMonth - i;
      let targetYear = this.selectedYear;
      while (targetMonth <= 0) {
        targetMonth += 12;
        targetYear--;
      }
      const monthPrefix = `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;
      const sum = this.transactions
        .filter(t => t.categoryId === catId && t.date.startsWith(monthPrefix))
        .reduce((acc, t) => acc + t.amount, 0);

      months.push({
        label: this.getMonthName(targetMonth),
        year: targetYear,
        month: targetMonth,
        amount: sum,
        x: 0,
        y: 0
      });
    }

    // Chart SVG coordinates: width 340, height 150
    // Chart box: x from 25 to 330 (width = 305), y from 15 to 135 (height = 120)
    const boxLeft = 25;
    const boxRight = 330;
    const boxTop = 15;
    const boxBottom = 135;
    const boxWidth = boxRight - boxLeft;
    const boxHeight = boxBottom - boxTop;

    // Max amount benchmark
    const maxData = Math.max(...months.map(m => m.amount), 0);
    let benchmark = 10000;
    if (maxData <= 10000) {
      benchmark = 10000;
    } else if (maxData <= 50000) {
      benchmark = 50000;
    } else if (maxData <= 100000) {
      benchmark = 100000;
    } else if (maxData <= 500000) {
      benchmark = 500000;
    } else if (maxData <= 1000000) {
      benchmark = 1000000;
    } else if (maxData <= 5000000) {
      benchmark = 5000000;
    } else {
      benchmark = Math.ceil(maxData / 1000000) * 1000000;
    }
    this.categoryMaxAmount = benchmark;

    const formatTick = (val: number): string => {
      if (val === 0) return '0';
      if (val >= 1000000) {
        const jt = val / 1000000;
        return (Number.isInteger(jt) ? jt : jt.toFixed(1)) + 'jt';
      }
      if (val >= 1000) {
        const rb = val / 1000;
        return (Number.isInteger(rb) ? rb : rb.toFixed(1)) + 'rb';
      }
      return val.toString();
    };

    this.categoryYAxisTicks = [
      { label: formatTick(benchmark), ratio: 1 },
      { label: formatTick(benchmark * 0.8), ratio: 0.8 },
      { label: formatTick(benchmark * 0.6), ratio: 0.6 },
      { label: formatTick(benchmark * 0.4), ratio: 0.4 },
      { label: formatTick(benchmark * 0.2), ratio: 0.2 },
      { label: formatTick(0), ratio: 0 }
    ];

    const stepX = boxWidth / (months.length - 1);
    months.forEach((m, idx) => {
      m.x = boxLeft + idx * stepX;
      const ratio = Math.min(m.amount / this.categoryMaxAmount, 1);
      m.y = boxBottom - ratio * boxHeight;
    });

    this.categoryTrendMonths = months;

    // Build SVG paths
    const points = months.map(m => `${m.x},${m.y}`);
    this.categoryTrendPath = `M ${points.join(' L ')}`;
    this.categoryAreaPath = `M ${months[0].x},${boxBottom} L ${points.join(' L ')} L ${months[months.length - 1].x},${boxBottom} Z`;

    // Calculate daily groups for current selected month
    const currentPrefix = `${this.selectedYear}-${this.selectedMonth.toString().padStart(2, '0')}`;
    const monthTxs = this.transactions.filter(t => t.categoryId === catId && t.date.startsWith(currentPrefix));

    // Group by date
    const dateMap = new Map<string, Transaction[]>();
    monthTxs.forEach(t => {
      const arr = dateMap.get(t.date) || [];
      arr.push(t);
      dateMap.set(t.date, arr);
    });

    const groups: DayGroup[] = [];
    dateMap.forEach((txs, dateStr) => {
      const d = new Date(dateStr + 'T00:00:00');
      const dayNum = d.getDate().toString().padStart(2, '0');
      const monthYear = `${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
      const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const dayName = dayNames[d.getDay()];

      let inc = 0;
      let exp = 0;
      txs.forEach(t => {
        if (t.type === 'income') inc += t.amount;
        else exp += t.amount;
      });

      groups.push({
        dateStr,
        dayNumber: dayNum,
        monthYear,
        dayName,
        income: inc,
        expense: exp,
        transactions: txs
      });
    });

    if (this.categoryDetailSort === 'latest') {
      groups.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    } else {
      groups.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    }

    this.categoryDailyGroups = groups;
  }

  public getCategoryCurrentMonthTotal(): number {
    if (!this.selectedCategoryForDetail) return 0;
    const prefix = `${this.selectedYear}-${this.selectedMonth.toString().padStart(2, '0')}`;
    return this.transactions
      .filter(t => t.categoryId === this.selectedCategoryForDetail?.id && t.date.startsWith(prefix))
      .reduce((acc, t) => acc + t.amount, 0);
  }

  // --- Search Transactions (Screenshot 5) ---
  public getFilteredTransactions(): Transaction[] {
    return this.transactions.filter(t => {
      // Date range
      if (this.searchStartDate && t.date < this.searchStartDate) return false;
      if (this.searchEndDate && t.date > this.searchEndDate) return false;

      // Category
      if (this.searchCategoryId && t.categoryId !== this.searchCategoryId) return false;

      // Min/Max
      if (this.searchMinAmount !== null && t.amount < this.searchMinAmount) return false;
      if (this.searchMaxAmount !== null && t.amount > this.searchMaxAmount) return false;

      // Keyword
      if (this.searchKeyword) {
        const kw = this.searchKeyword.toLowerCase();
        const matchNote = t.note?.toLowerCase().includes(kw);
        const matchCat = this.getTxCategoryName(t).toLowerCase().includes(kw);
        const matchAcc = t.account?.toLowerCase().includes(kw);
        if (!matchNote && !matchCat && !matchAcc) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }

  public getSearchStats() {
    const list = this.getFilteredTransactions();
    let inc = 0;
    let exp = 0;
    list.forEach(t => {
      if (t.type === 'income') inc += t.amount;
      else exp += t.amount;
    });
    return {
      income: inc,
      expense: exp,
      balance: inc - exp
    };
  }

  public clearSearchCategory() {
    this.searchCategoryId = '';
  }

  public resetSearchFilter() {
    this.searchKeyword = '';
    this.searchCategoryId = '';
    this.searchMinAmount = null;
    this.searchMaxAmount = null;
    this.searchStartDate = '';
    this.searchEndDate = '';
  }

  public async exportSearchResults(): Promise<void> {
    await this.handleExport(() => this.financeService.exportToExcel(
      this.searchStartDate || '2020-01-01',
      this.searchEndDate || '2030-12-31',
      this.searchCategoryId || 'all',
      'Pencarian_Keuangan'
    ));
  }

  public get formattedFormDate(): string {
    if (!this.formDate) return '';
    const parts = this.formDate.split('-').map(Number);
    if (parts.length !== 3) return this.formDate;
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.toString().padStart(2, '0')} ${monthNames[m]} ${y}`;
  }

  // --- Add / Edit Form & Mini Calculator Integration ---
  public openAddTransaction(type: 'expense' | 'income' = 'expense', fromView?: 'report' | 'charts' | 'category_detail' | 'search' | 'settings' | 'categories' | 'create_transaction' | 'market_prices') {
    if (fromView) {
      this.previousViewBeforeTxForm = fromView;
    } else if (this.activeView !== 'create_transaction') {
      this.previousViewBeforeTxForm = this.activeView;
    }
    this.editingTxId = null;
    this.isTransactionCopyMenuOpen = false;
    this.formType = type;
    this.formAmount = 0;
    this.calcDisplay = '0';
    this.calcFormula = '';
    this.formCategoryId = '';
    const today = new Date();
    const dayStr = today.getDate().toString().padStart(2, '0');
    const monthStr = this.selectedMonth.toString().padStart(2, '0');
    this.formDate = `${this.selectedYear}-${monthStr}-${dayStr}`;
    this.formNote = '';
    this.formAccount = 'Tunai';
    this.activeView = 'create_transaction';
    this.isFormOpen = false;
    this.isMiniCalcOpen = false;
  }

  public openEditTransaction(tx: Transaction, fromView?: 'report' | 'charts' | 'category_detail' | 'search' | 'settings' | 'categories' | 'create_transaction' | 'market_prices') {
    if (fromView) {
      this.previousViewBeforeTxForm = fromView;
    } else if (this.activeView !== 'create_transaction') {
      this.previousViewBeforeTxForm = this.activeView;
    }

    // Ensure selectedCategoryForDetail is maintained if we are editing a transaction from that category
    if (this.previousViewBeforeTxForm === 'category_detail' && !this.selectedCategoryForDetail && tx.categoryId) {
      this.selectedCategoryForDetail = this.categories.find(c => c.id === tx.categoryId) || null;
    }

    this.editingTxId = tx.id;
    this.isTransactionCopyMenuOpen = false;
    this.formType = tx.type;
    this.formAmount = tx.amount;
    this.calcDisplay = tx.amount.toString();
    this.calcFormula = '';
    this.formCategoryId = tx.categoryId;
    this.formDate = tx.date;
    this.formNote = tx.note || '';
    this.formAccount = tx.account || 'Tunai';
    this.activeView = 'create_transaction';
    this.isFormOpen = false;
    this.isMiniCalcOpen = false;
  }

  public closeTransactionForm() {
    this.isTransactionCopyMenuOpen = false;
    this.isMiniCalcOpen = false;
    this.editingTxId = null;

    if (this.previousViewBeforeTxForm === 'category_detail' && this.selectedCategoryForDetail) {
      this.calculateCategoryDetailTrend();
    }
    this.navigateToPreviousView('report', this.previousViewBeforeTxForm || 'report');
  }

  @HostListener('window:popstate')
  public onPopState() {
    this.handleNativeBackButton();
  }

  public saveTransaction() {
    this.clearFormValidationMessage();

    if (this.formAmount <= 0) {
      this.formValidationField = 'amount';
      this.formValidationMessage = this.isEn ? 'Please enter a valid amount.' : 'Masukkan nominal transaksi yang valid.';
      return;
    }

    if (!this.formCategoryId) {
      this.formValidationField = 'category';
      this.formValidationMessage = this.isEn ? 'Please select a category.' : 'Silakan pilih kategori transaksi terlebih dahulu.';
      return;
    }

    const cat = this.categories.find(c => c.id === this.formCategoryId);
    const catName = cat ? cat.name : (this.formType === 'income' ? 'Pemasukan' : 'Pengeluaran');

    if (this.editingTxId) {
      const existing = this.transactions.find(t => t.id === this.editingTxId);
      if (existing) {
        this.financeService.updateTransaction({
          ...existing,
          type: this.formType,
          amount: this.formAmount,
          categoryId: this.formCategoryId,
          categoryName: catName,
          categoryIcon: cat?.icon,
          categoryColor: cat?.color,
          date: this.formDate,
          note: this.formNote,
          account: this.formAccount
        });
      }
    } else {
      this.financeService.addTransaction({
        type: this.formType,
        amount: this.formAmount,
        categoryId: this.formCategoryId,
        categoryName: catName,
        categoryIcon: cat?.icon,
        categoryColor: cat?.color,
        date: this.formDate,
        note: this.formNote,
        account: this.formAccount
      });
    }

    if (this.previousViewBeforeTxForm === 'category_detail' && this.selectedCategoryForDetail) {
      this.calculateCategoryDetailTrend();
      this.navigateToPreviousView('report', 'category_detail');
    } else if (this.previousViewBeforeTxForm && this.previousViewBeforeTxForm !== 'create_transaction') {
      this.navigateToPreviousView('report', this.previousViewBeforeTxForm);
    } else {
      if (this.formDate) {
        const parts = this.formDate.split('-');
        if (parts.length >= 2) {
          this.selectedYear = parseInt(parts[0], 10);
          this.selectedMonth = parseInt(parts[1], 10);
          this.pickerYear = this.selectedYear;
        }
      }
      this.reportPeriod = 'daily';
      this.navigateToPreviousView('report', 'report');
    }
    this.isFormOpen = false;
    this.clearFormValidationMessage();
    this.recalculateAll();
  }

  public clearFormValidationMessage(field?: 'amount' | 'category'): void {
    if (field && field !== this.formValidationField) return;
    this.formValidationMessage = '';
    this.formValidationField = '';
  }

  public get formAmountFormatted(): string {
    if (!this.formAmount) return '';
    return Number(this.formAmount).toLocaleString('en-US');
  }

  public setFormType(type: 'expense' | 'income') {
    this.formType = type;
    // We intentionally retain this.formCategoryId so the user does not lose their selected category
    // when toggling between Pengeluaran and Pemasukan.
  }

  public getFormCategories(): Category[] {
    const catsForType = this.financeService.getCategories(this.formType);
    if (this.formCategoryId) {
      const selectedCat = this.categories.find(c => c.id === this.formCategoryId);
      if (selectedCat && !catsForType.some(c => c.id === selectedCat.id)) {
        return [selectedCat, ...catsForType];
      }
    }
    return catsForType;
  }

  public openYearInMonthlyView(year?: number) {
    if (year) {
      this.selectedYear = year;
      this.recalculateAll();
    }
    this.reportPeriod = 'monthly';
  }

  public openTxDatePicker(inputEl: HTMLInputElement) {
    if (!inputEl) return;
    try {
      if (typeof inputEl.showPicker === 'function') {
        inputEl.showPicker();
        return;
      }
    } catch {
      // Fallback if browser security prevents showPicker
    }
    inputEl.focus();
    inputEl.click();
  }

  public onFormDateChange() {
    // Form date changed by user
  }

  public openDuplicateTransactionModal() {
    this.isTransactionCopyMenuOpen = !this.isTransactionCopyMenuOpen;
  }

  public copyCurrentTransaction() {
    this.copiedTransaction = this.createCurrentTransactionCopy();
    this.lastDuplicatedTransactionId = null;
    this.isTransactionCopyMenuOpen = false;
    const saved = this.persistCopiedTransactionDraft();
    this.showFormToast(saved
      ? (this.isEn
      ? 'Current transaction copied to the last duplicate shortcut.'
      : 'Transaksi saat ini disalin ke Duplikat Catatan Terakhir.')
      : (this.isEn
        ? 'Transaction copied for this session, but could not be saved for later.'
        : 'Transaksi disalin untuk sesi ini, tetapi gagal disimpan untuk nanti.'));
  }

  public startDuplicateTransaction() {
    this.isTransactionCopyMenuOpen = false;

    if (this.editingTxId) {
      this.copiedTransaction = this.createCurrentTransactionCopy();
      this.lastDuplicatedTransactionId = null;
      this.persistCopiedTransactionDraft();
      this.editingTxId = null;
      this.showFormToast(this.isEn
        ? 'Transaction copied. Review and save it as a new transaction.'
        : 'Transaksi diduplikasi. Periksa kembali lalu simpan sebagai transaksi baru.');
      return;
    }

    if (!this.transactions?.length && !this.copiedTransaction) {
      this.copiedTransaction = this.createCurrentTransactionCopy();
      this.persistCopiedTransactionDraft();
    }

    this.duplicateSearchQuery = '';
    this.isDuplicateModalOpen = true;
  }

  private createCurrentTransactionCopy(): Omit<Transaction, 'id' | 'createdAt'> {
    const category = this.categories.find(item => item.id === this.formCategoryId);
    return {
      type: this.formType,
      amount: this.formAmount,
      categoryId: this.formCategoryId,
      categoryName: category ? this.getCategoryDisplayName(category) : '',
      categoryIcon: category?.icon,
      categoryColor: category?.color,
      date: this.formDate,
      note: this.formNote,
      account: this.formAccount
    };
  }

  public closeDuplicateTransactionModal() {
    this.isDuplicateModalOpen = false;
  }

  public applyDuplicatedTransaction(tx: Transaction | Omit<Transaction, 'id' | 'createdAt'>) {
    if ('id' in tx) {
      this.lastDuplicatedTransactionId = tx.id;
      this.copiedTransaction = null;
      this.removeCopiedTransactionDraft();
    } else {
      this.lastDuplicatedTransactionId = null;
      this.copiedTransaction = tx;
      this.persistCopiedTransactionDraft();
    }
    this.formType = tx.type;
    this.formAmount = tx.amount;
    this.calcDisplay = tx.amount.toString();
    this.calcFormula = '';
    this.formCategoryId = tx.categoryId;
    this.formNote = tx.note || '';
    this.formAccount = tx.account || 'Tunai';
    this.editingTxId = null;
    this.isDuplicateModalOpen = false;
    // PENTING: Tetap di halaman buat transaksi agar pengguna bisa mengedit dulu sebelum simpan
    this.activeView = 'create_transaction';
    this.showFormToast('Data transaksi berhasil dimuat. Silakan periksa atau edit lalu klik SIMPAN.');
  }

  public duplicateLastTransaction() {
    const transaction = this.quickDuplicateTransaction;
    if (transaction) {
      this.applyDuplicatedTransaction(transaction);
    }
  }

  public get quickDuplicateTransaction(): Transaction | Omit<Transaction, 'id' | 'createdAt'> | null {
    if (this.copiedTransaction) return this.copiedTransaction;
    if (!this.transactions?.length) return null;
    return this.transactions.find(tx => tx.id === this.lastDuplicatedTransactionId) || this.transactions[0];
  }

  public get filteredDuplicateTransactions(): Transaction[] {
    if (!this.transactions) return [];
    let list = this.transactions;
    if (this.duplicateSearchQuery.trim()) {
      const q = this.duplicateSearchQuery.toLowerCase().trim();
      list = list.filter(t =>
        (t.categoryName && t.categoryName.toLowerCase().includes(q)) ||
        (t.note && t.note.toLowerCase().includes(q)) ||
        (t.account && t.account.toLowerCase().includes(q)) ||
        t.amount.toString().includes(q)
      );
    }
    return list.slice(0, 30);
  }

  private restoreCopiedTransactionDraft(): void {
    try {
      const storedDraft = localStorage.getItem(this.copiedTransactionStorageKey);
      if (!storedDraft) return;

      const parsed: unknown = JSON.parse(storedDraft);
      if (this.isCopiedTransactionDraft(parsed)) {
        this.copiedTransaction = parsed;
      } else {
        this.removeCopiedTransactionDraft();
      }
    } catch (error) {
      console.error('Gagal membaca salinan transaksi tersimpan.', error);
      this.removeCopiedTransactionDraft();
    }
  }

  private isCopiedTransactionDraft(value: unknown): value is Omit<Transaction, 'id' | 'createdAt'> {
    if (!value || typeof value !== 'object') return false;
    const draft = value as Record<string, unknown>;
    return (draft['type'] === 'income' || draft['type'] === 'expense') &&
      typeof draft['amount'] === 'number' &&
      typeof draft['categoryId'] === 'string' &&
      typeof draft['categoryName'] === 'string' &&
      typeof draft['date'] === 'string' &&
      typeof draft['note'] === 'string' &&
      typeof draft['account'] === 'string';
  }

  private persistCopiedTransactionDraft(): boolean {
    if (!this.copiedTransaction) return false;
    try {
      localStorage.setItem(this.copiedTransactionStorageKey, JSON.stringify(this.copiedTransaction));
      return true;
    } catch (error) {
      console.error('Gagal menyimpan salinan transaksi.', error);
      return false;
    }
  }

  private removeCopiedTransactionDraft(): void {
    try {
      localStorage.removeItem(this.copiedTransactionStorageKey);
    } catch (error) {
      console.error('Gagal menghapus salinan transaksi tersimpan.', error);
    }
  }

  public showFormToast(msg: string) {
    this.formToastMessage = msg;
    if (this.formToastTimeout) clearTimeout(this.formToastTimeout);
    this.formToastTimeout = setTimeout(() => {
      this.formToastMessage = '';
    }, 4500);
  }

  public deleteCurrentTransaction() {
    if (!this.editingTxId) {
      this.closeTransactionForm();
      return;
    }
    this.deleteTransaction(this.editingTxId);
  }

  public deleteTransaction(id: string) {
    this.promptConfirm({
      title: this.settings?.language === 'en' ? 'Delete Transaction?' : 'Hapus Transaksi?',
      message: this.settings?.language === 'en'
        ? 'Are you sure you want to delete this transaction record? This action cannot be undone.'
        : 'Apakah Anda yakin ingin menghapus catatan transaksi ini? Tindakan ini tidak dapat dibatalkan.',
      confirmText: this.settings?.language === 'en' ? 'Delete' : 'Hapus',
      cancelText: this.settings?.language === 'en' ? 'Cancel' : 'Batal',
      type: 'danger',
      onConfirm: () => {
        this.financeService.deleteTransaction(id);
        this.closeTransactionForm();
        this.isFormOpen = false;
      }
    });
  }

  // --- Mini Calculator Logic (Feature 15) ---
  public toggleMiniCalc() {
    this.isMiniCalcOpen = !this.isMiniCalcOpen;
    if (this.isMiniCalcOpen && this.formAmount > 0) {
      this.calcDisplay = this.formAmount.toString();
    }
  }

  public inputCalcDigit(digit: string) {
    if (this.calcWaitingForSecondOperand) {
      this.calcDisplay = digit;
      this.calcWaitingForSecondOperand = false;
    } else {
      this.calcDisplay = this.calcDisplay === '0' ? digit : this.calcDisplay + digit;
    }
  }

  public inputCalcOperator(op: string) {
    if (this.calcOperation && !this.calcWaitingForSecondOperand) {
      this.calculateCalcResult();
    }
    this.calcPreviousOperand = this.calcDisplay;
    this.calcOperation = op;
    this.calcFormula = `${this.calcPreviousOperand} ${op}`;
    this.calcWaitingForSecondOperand = true;
  }

  public calculateCalcResult() {
    if (!this.calcOperation || !this.calcPreviousOperand) return;
    const prev = parseFloat(this.calcPreviousOperand);
    const curr = parseFloat(this.calcDisplay);
    let res = 0;

    switch (this.calcOperation) {
      case '+': res = prev + curr; break;
      case '-': res = prev - curr; break;
      case '×': res = prev * curr; break;
      case '÷': res = curr !== 0 ? prev / curr : 0; break;
    }

    this.calcFormula = `${this.calcPreviousOperand} ${this.calcOperation} ${curr} =`;
    this.calcDisplay = Math.round(res).toString();
    this.formAmount = Math.max(0, Math.round(res));
    this.calcOperation = '';
    this.calcWaitingForSecondOperand = true;
  }

  public clearCalc() {
    this.calcDisplay = '0';
    this.calcFormula = '';
    this.calcPreviousOperand = '';
    this.calcOperation = '';
    this.calcWaitingForSecondOperand = false;
  }

  public calcBackspace() {
    if (this.calcDisplay.length > 1) {
      this.calcDisplay = this.calcDisplay.slice(0, -1);
    } else {
      this.calcDisplay = '0';
    }
  }

  public applyCalcToForm() {
    if (this.calcOperation) {
      this.calculateCalcResult();
    }
    this.formAmount = parseFloat(this.calcDisplay) || 0;
    this.isMiniCalcOpen = false;
  }

  // --- PIN Keypad & Security (Features 9 & 10) ---
  public pressPinDigit(digit: string) {
    if (this.pinEntered.length < 4) {
      this.pinEntered += digit;
      this.pinHasError = false;

      if (this.pinEntered.length === 4) {
        setTimeout(() => {
          const success = this.financeService.unlockPin(this.pinEntered);
          if (!success) {
            this.pinHasError = true;
            this.pinEntered = '';
          }
        }, 200);
      }
    }
  }

  public deletePinDigit() {
    this.pinEntered = this.pinEntered.slice(0, -1);
    this.pinHasError = false;
  }

  public openForgotPin() {
    this.isForgotPinOpen = true;
    this.forgotAnswerInput = '';
    this.newPinInput = '';
    this.forgotPinError = '';
  }

  public submitForgotPin() {
    if (!this.newPinInput || this.newPinInput.length !== 4) {
      this.forgotPinError = this.settings.language === 'en' ? 'New PIN must be 4 digits' : 'PIN baru harus 4 digit angka';
      return;
    }
    const success = this.financeService.resetPinWithSecurity(this.forgotAnswerInput, this.newPinInput);
    if (success) {
      this.isForgotPinOpen = false;
      this.pinEntered = '';
      alert(this.settings.language === 'en' ? 'PIN successfully updated!' : 'PIN berhasil diperbarui!');
    } else {
      this.forgotPinError = this.settings.language === 'en' ? 'Security answer is incorrect!' : 'Jawaban keamanan salah!';
    }
  }

  // --- Export Reports (Matching Screenshot) ---
  public openExportModal() {
    this.exportTitle = this.isEn ? 'Financial Report' : 'Laporan Keuangan';
    const monthStr = this.selectedMonth.toString().padStart(2, '0');
    const lastDay = new Date(this.selectedYear, this.selectedMonth, 0).getDate().toString().padStart(2, '0');
    this.exportStartDate = `${this.selectedYear}-${monthStr}-01`;
    this.exportEndDate = `${this.selectedYear}-${monthStr}-${lastDay}`;
    this.exportCategoryId = 'all';
    this.exportFormat = 'XLS';
    this.closeExportSelectMenus();
    this.isExportModalOpen = true;
  }

  public closeExportModal() {
    this.closeExportSelectMenus();
    this.isExportModalOpen = false;
  }

  public getExportCategoryLabel(): string {
    if (this.exportCategoryId === 'all') return this.isEn ? 'All Categories' : 'Semua Kategori';
    const category = this.categories.find(cat => cat.id === this.exportCategoryId);
    return this.getCategoryDisplayName(category) || (this.isEn ? 'All Categories' : 'Semua Kategori');
  }

  public toggleExportCategoryMenu(): void {
    this.isExportCategoryMenuOpen = !this.isExportCategoryMenuOpen;
    this.isExportFormatMenuOpen = false;
  }

  public toggleExportFormatMenu(): void {
    this.isExportFormatMenuOpen = !this.isExportFormatMenuOpen;
    this.isExportCategoryMenuOpen = false;
  }

  public closeExportSelectMenus(): void {
    this.isExportCategoryMenuOpen = false;
    this.isExportFormatMenuOpen = false;
  }

  public selectExportCategory(categoryId: string): void {
    this.exportCategoryId = categoryId;
    this.closeExportSelectMenus();
  }

  public selectExportFormat(format: 'XLS' | 'CSV' | 'PDF'): void {
    this.exportFormat = format;
    this.closeExportSelectMenus();
  }

  public openExportDatePicker(input: HTMLInputElement) {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.click();
    }
  }

  public formatExportDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = parts[2].padStart(2, '0');
      const m = parseInt(parts[1], 10);
      const y = parts[0];
      const mName = this.getMonthName(m);
      return `${d} ${mName} ${y}`;
    }
    return dateStr;
  }

  public async executeExport(): Promise<void> {
    this.isExportModalOpen = false;
    const exportFile = this.exportFormat === 'XLS'
      ? () => this.financeService.exportToExcel(this.exportStartDate, this.exportEndDate, this.exportCategoryId, this.exportTitle)
      : this.exportFormat === 'CSV'
        ? () => this.financeService.exportToCSV(this.exportStartDate, this.exportEndDate, this.exportCategoryId, this.exportTitle)
        : () => this.financeService.exportToPDF(this.exportStartDate, this.exportEndDate, this.exportCategoryId, this.exportTitle);
    await this.handleExport(exportFile);
  }

  public async exportPdf(): Promise<void> {
    this.isExportModalOpen = false;
    await this.handleExport(() => this.financeService.exportToPDF(this.exportStartDate, this.exportEndDate, this.exportCategoryId, this.exportTitle));
  }

  public async exportExcel(): Promise<void> {
    this.isExportModalOpen = false;
    await this.handleExport(() => this.financeService.exportToExcel(this.exportStartDate, this.exportEndDate, this.exportCategoryId, this.exportTitle));
  }

  public async exportCsv(): Promise<void> {
    this.isExportModalOpen = false;
    await this.handleExport(() => this.financeService.exportToCSV(this.exportStartDate, this.exportEndDate, this.exportCategoryId, this.exportTitle));
  }

  private async handleExport(exportFile: () => Promise<ExportedFile | null>): Promise<void> {
    try {
      const file = await exportFile();
      if (file) {
        this.exportedFile = file;
        this.isExportSuccessModalOpen = true;
        this.changeDetector.detectChanges();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      const detail = error instanceof Error ? error.message : String(error);
      alert(this.isEn ? `Export failed: ${detail}` : `Ekspor gagal: ${detail}`);
    }
  }

  public closeExportSuccessModal(): void {
    this.isExportSuccessModalOpen = false;
    this.exportedFile = null;
  }

  public async shareExportedFile(): Promise<void> {
    const file = this.exportedFile;
    if (!file || this.isExportActionRunning) return;

    this.isExportActionRunning = true;
    this.isExportSuccessModalOpen = false;
    try {
      if (Capacitor.getPlatform() === 'android') {
        await ExportFile.shareFile({ uri: file.uri, mimeType: file.mimeType });
      } else {
        await Share.share({
          title: file.filename,
          dialogTitle: this.isEn ? 'Share export' : 'Kirim ekspor',
          files: [file.uri]
        });
      }
      this.closeExportSuccessModal();
    } catch (error) {
      this.isExportSuccessModalOpen = true;
      const detail = error instanceof Error ? error.message : String(error);
      alert(this.isEn ? `Could not share file: ${detail}` : `File gagal dikirim: ${detail}`);
    } finally {
      this.isExportActionRunning = false;
    }
  }

  public async openExportedFile(): Promise<void> {
    const file = this.exportedFile;
    if (!file || this.isExportActionRunning) return;

    this.isExportActionRunning = true;
    this.isExportSuccessModalOpen = false;
    try {
      if (Capacitor.getPlatform() === 'android') {
        await ExportFile.openFile({ uri: file.uri, mimeType: file.mimeType });
      } else {
        await Share.share({
          title: file.filename,
          dialogTitle: this.isEn ? 'Open export with' : 'Buka ekspor dengan',
          files: [file.uri]
        });
      }
      this.closeExportSuccessModal();
    } catch (error) {
      this.isExportSuccessModalOpen = true;
      const detail = error instanceof Error ? error.message : String(error);
      alert(this.isEn ? `Could not open file: ${detail}` : `File gagal dibuka: ${detail}`);
    } finally {
      this.isExportActionRunning = false;
    }
  }

  // --- Filter ("SARING") Modal Methods (Matching Screenshot) ---
  public openFilterModal() {
    this.filterModalTab = 'expense';
    if (this.appliedFilterCategoryIds.length > 0) {
      this.selectedFilterCategoryIds = [...this.appliedFilterCategoryIds];
    } else {
      // By default all categories are selected
      this.selectedFilterCategoryIds = this.categories.map(c => c.id);
    }
    this.isFilterModalOpen = true;
  }

  public closeFilterModal() {
    this.isFilterModalOpen = false;
  }

  public getCurrentTabCategories(): Category[] {
    return this.categories
      .filter(c => c.type === this.filterModalTab)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public isAllCurrentTabSelected(): boolean {
    const list = this.getCurrentTabCategories();
    if (list.length === 0) return false;
    return list.every(c => this.selectedFilterCategoryIds.includes(c.id));
  }

  public toggleAllCurrentTab() {
    const list = this.getCurrentTabCategories();
    const allSelected = this.isAllCurrentTabSelected();
    if (allSelected) {
      // Deselect all categories of current tab
      const removeIds = new Set(list.map(c => c.id));
      this.selectedFilterCategoryIds = this.selectedFilterCategoryIds.filter(id => !removeIds.has(id));
    } else {
      // Select all categories of current tab
      const currentIds = new Set(this.selectedFilterCategoryIds);
      list.forEach(c => currentIds.add(c.id));
      this.selectedFilterCategoryIds = Array.from(currentIds);
    }
  }

  public toggleFilterCategory(catId: string) {
    const idx = this.selectedFilterCategoryIds.indexOf(catId);
    if (idx > -1) {
      this.selectedFilterCategoryIds.splice(idx, 1);
    } else {
      this.selectedFilterCategoryIds.push(catId);
    }
  }

  public isCategoryFilterChecked(catId: string): boolean {
    return this.selectedFilterCategoryIds.includes(catId);
  }

  public applyCategoryFilter() {
    this.appliedFilterCategoryIds = [...this.selectedFilterCategoryIds];
    this.isFilterModalOpen = false;
    this.recalculateAll();
  }

  public resetCategoryFilter() {
    this.appliedFilterCategoryIds = [];
    this.selectedFilterCategoryIds = this.categories.map(c => c.id);
    this.isFilterModalOpen = false;
    this.recalculateAll();
  }

  public get isFilterActive(): boolean {
    return (
      this.appliedFilterCategoryIds.length > 0 &&
      this.appliedFilterCategoryIds.length < this.categories.length
    );
  }

  // --- Drawer Modals Methods ---
  public openRatingModal() {
    this.ratingStars = 5;
    this.ratingFeedback = '';
    this.isRatingModalOpen = true;
  }

  public submitRating() {
    alert('Terima kasih banyak atas penilaian dan ulasan Anda!');
    this.isRatingModalOpen = false;
  }

  public openHelpModal() {
    this.isHelpModalOpen = true;
  }

  public openAboutModal() {
    this.isAboutModalOpen = true;
  }

  // --- Backup & Restore (Feature 6) ---
  public backupData() {
    const json = this.financeService.exportDataJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_cuan_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public handleRestoreFile(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const success = this.financeService.importDataJSON(e.target.result);
        if (success) {
          alert(this.settings.language === 'en' ? 'Data restored successfully!' : 'Data berhasil dipulihkan!');
        } else {
          alert(this.settings.language === 'en' ? 'Failed to restore data. Invalid file.' : 'Gagal memulihkan data. Format tidak valid.');
        }
      };
      reader.readAsText(file);
    }
  }

  public resetAllData() {
    const msg = this.settings.language === 'en'
      ? 'Clear all financial records and restore default categories?'
      : 'Hapus semua catatan keuangan dan pulihkan kategori bawaan?';
    if (confirm(msg)) {
      this.financeService.resetToDefault();
      const now = new Date();
      this.selectedYear = now.getFullYear();
      this.selectedMonth = now.getMonth() + 1;
    }
  }

  // --- Category Management (Screenshot 1: Kategori) ---
  public getFilteredCategories(type: 'expense' | 'income'): Category[] {
    return this.categories
      .filter(c => c.type === type)
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }

  public openAddCategoryModal() {
    this.newCatNameInput = '';
    this.newCatTypeInput = this.categoryTab;
    this.isAddCatModalOpen = true;
  }

  public saveAddCategoryModal() {
    if (!this.newCatNameInput.trim()) return;
    this.financeService.addCategory({
      name: this.newCatNameInput.trim(),
      type: this.newCatTypeInput,
      color: '#e15241',
      icon: this.newCatTypeInput === 'expense' ? 'receipt-outline' : 'cash-outline'
    });
    this.isAddCatModalOpen = false;
    this.newCatNameInput = '';
  }

  public openEditCategoryModal(cat: Category) {
    this.editingCategory = cat;
    this.editCatNameInput = cat.name;
    this.isEditCatModalOpen = true;
  }

  public saveEditCategoryModal() {
    if (!this.editingCategory || !this.editCatNameInput.trim()) return;
    this.financeService.updateCategory({
      ...this.editingCategory,
      name: this.editCatNameInput.trim()
    });
    this.isEditCatModalOpen = false;
    this.editingCategory = null;
    this.editCatNameInput = '';
  }

  public openCategoryModal() {
    this.activeView = 'categories';
    this.isHeaderMenuOpen = false;
  }

  public createCategory() {
    if (!this.newCatName.trim()) return;
    this.financeService.addCategory({
      name: this.newCatName.trim(),
      type: this.newCatType,
      color: this.newCatColor,
      icon: this.newCatIcon
    });
    this.newCatName = '';
  }

  // --- Custom Confirmation Dialog (Replaces Native Browser confirm) ---
  public isConfirmModalOpen = false;
  public exitToastMessage = '';
  public confirmModalTitle = 'Hapus Transaksi?';
  public confirmModalMessage = 'Apakah Anda yakin ingin menghapus catatan transaksi ini?';
  public confirmModalConfirmText = 'Hapus';
  public confirmModalCancelText = 'Batal';
  public confirmModalType: 'danger' | 'warning' = 'danger';
  private confirmActionCallback: (() => void) | null = null;

  public promptConfirm(opts: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning';
    onConfirm: () => void;
  }) {
    this.confirmModalTitle = opts.title;
    this.confirmModalMessage = opts.message;
    this.confirmModalConfirmText = opts.confirmText || (this.settings?.language === 'en' ? 'Delete' : 'Hapus');
    this.confirmModalCancelText = opts.cancelText || (this.settings?.language === 'en' ? 'Cancel' : 'Batal');
    this.confirmModalType = opts.type || 'danger';
    this.confirmActionCallback = opts.onConfirm;
    this.isConfirmModalOpen = true;
  }

  public handleConfirmModalOk() {
    this.isConfirmModalOpen = false;
    if (this.confirmActionCallback) {
      this.confirmActionCallback();
      this.confirmActionCallback = null;
    }
  }

  public handleConfirmModalCancel() {
    this.isConfirmModalOpen = false;
    this.confirmActionCallback = null;
  }

  public deleteCategory(id: string) {
    this.promptConfirm({
      title: this.settings?.language === 'en' ? 'Delete Category?' : 'Hapus Kategori?',
      message: this.settings?.language === 'en' ? 'Are you sure you want to delete this category?' : 'Apakah Anda yakin ingin menghapus kategori ini?',
      confirmText: this.settings?.language === 'en' ? 'Delete' : 'Hapus',
      cancelText: this.settings?.language === 'en' ? 'Cancel' : 'Batal',
      type: 'danger',
      onConfirm: () => {
        this.financeService.deleteCategory(id);
      }
    });
  }

  // Getter for current language
  public get isEn(): boolean {
    return this.settings?.language === 'en';
  }

  public getCategoryDisplayName(cat: Category | undefined | null): string {
    if (!cat) return '';
    return (this.isEn && cat.nameEn) ? cat.nameEn : cat.name;
  }

  public getTxCategoryName(tx: Pick<Transaction, 'categoryId' | 'categoryName'>): string {
    const cat = this.categories.find(c => c.id === tx.categoryId);
    if (cat) return this.getCategoryDisplayName(cat);
    return tx.categoryName || '';
  }

  public getMarketPriceCategoryName(category: MarketPriceCategory): string {
    if (!this.isEn) return category.name;
    const names: Record<string, string> = {
      'Mata Uang': 'Currencies',
      'Emas & Logam Mulia': 'Gold & Precious Metals',
      'Logam Industri': 'Industrial Metals',
      'Saham & Indeks': 'Stocks & Indices',
      'Komoditas': 'Commodities'
    };
    return names[category.name] || category.name;
  }

  public getMarketPriceCategoryDescription(category: MarketPriceCategory): string {
    if (!this.isEn) return category.description;
    const descriptions: Record<string, string> = {
      'Mata Uang': 'Bank Indonesia Transaction Rates (bi.go.id)',
      'Emas & Logam Mulia': 'Antam Gold Bars & Silver Prices (logammulia.com)',
      'Logam Industri': 'Copper, nickel, aluminium, tin (id.investing.com/commodities/metals)',
      'Saham & Indeks': 'IHSG & Historical Prices (Yahoo Finance ^JKSE)',
      'Komoditas': 'National Strategic Food Prices (bi.go.id)'
    };
    return descriptions[category.name] || category.description;
  }

  public getCommodityDisplayName(item: CommodityPriceItem): string {
    if (!this.isEn) return item.name;
    const translations: Record<string, string> = {
      'Beras Kualitas Bawah I': 'Low-Quality Rice I',
      'Beras Kualitas Bawah II': 'Low-Quality Rice II',
      'Beras Kualitas Medium I': 'Medium-Quality Rice I',
      'Beras Kualitas Medium II': 'Medium-Quality Rice II',
      'Beras Kualitas Super I': 'Premium Rice I',
      'Beras Kualitas Super II': 'Premium Rice II',
      'Daging Ayam Ras Segar': 'Fresh Broiler Chicken',
      'Daging Sapi Kualitas 1': 'Beef Quality 1',
      'Daging Sapi Kualitas 2': 'Beef Quality 2',
      'Telur Ayam Ras Segar': 'Fresh Chicken Eggs',
      'Bawang Merah Ukuran Sedang': 'Medium Shallots',
      'Bawang Putih Ukuran Sedang': 'Medium Garlic',
      'Cabai Merah Besar': 'Large Red Chili',
      'Cabai Merah Keriting': 'Curly Red Chili',
      'Cabai Rawit Hijau': 'Green Bird’s Eye Chili',
      'Cabai Rawit Merah': 'Red Bird’s Eye Chili',
      'Minyak Goreng Curah': 'Bulk Cooking Oil',
      'Minyak Goreng Kemasan Bermerk 1': 'Branded Packaged Cooking Oil 1',
      'Minyak Goreng Kemasan Bermerk 2': 'Branded Packaged Cooking Oil 2',
      'Gula Pasir Kualitas Premium': 'Premium Granulated Sugar',
      'Gula Pasir Lokal': 'Local Granulated Sugar'
    };
    return translations[item.name] || item.name;
  }

  public getMetalDisplayName(item: LogamMuliaPriceItem): string {
    if (!this.isEn) return item.name;
    return item.name
      .replace(/Emas Batangan/g, 'Gold Bar')
      .replace(/Emas Spot/g, 'Spot Gold')
      .replace(/Perak Murni/g, 'Pure Silver')
      .replace(/Koin Perak/g, 'Silver Coin');
  }

  public getCommodityGroupDisplayName(groupLabel: string): string {
    if (!this.isEn) return groupLabel;
    const translations: Record<string, string> = {
      'Beras': 'Rice',
      'Cabai': 'Chili',
      'Bawang': 'Onion & Garlic',
      'Daging': 'Meat',
      'Telur': 'Eggs',
      'Minyak': 'Cooking Oil',
      'Gula': 'Sugar'
    };
    return translations[groupLabel] || groupLabel;
  }

  // --- Settings View State ---
  public settingThemeName = 'Mode terang';
  public settingCurrencyLabel = 'Indonesian rupiah(Rp)';
  public settingLanguageLabel = 'Indonesia';
  public settingFirstDayOfWeek = 'Minggu';
  public settingFirstDayOfMonth = '1';

  public syncSettingsView(settings: any) {
    if (!settings) return;
    const currMap: Record<string, string> = {
      IDR: 'Indonesian rupiah(Rp)',
      USD: 'US Dollar($)',
      EUR: 'Euro(€)',
      SGD: 'Singapore Dollar(S$)',
      JPY: 'Japanese Yen(¥)',
      MYR: 'Malaysian Ringgit(RM)',
    };
    if (settings.currency && currMap[settings.currency]) {
      this.settingCurrencyLabel = currMap[settings.currency];
    }
    const isEn = settings.language === 'en';
    const themeMap: Record<string, string> = {
      light: isEn ? 'Light Mode' : 'Mode terang',
      dark: isEn ? 'Dark Mode' : 'Mode gelap',
      // fallback for old saved values
      coral: isEn ? 'Light Mode' : 'Mode terang',
      teal: isEn ? 'Light Mode' : 'Mode terang',
      green: isEn ? 'Light Mode' : 'Mode terang',
      blue: isEn ? 'Light Mode' : 'Mode terang',
      purple: isEn ? 'Light Mode' : 'Mode terang',
    };
    if (settings.themeColor && themeMap[settings.themeColor]) {
      this.settingThemeName = themeMap[settings.themeColor];
    } else {
      this.settingThemeName = isEn ? 'Light Mode' : 'Mode terang';
    }
    if (settings.language === 'en') {
      this.settingLanguageLabel = 'English';
    } else {
      this.settingLanguageLabel = 'Indonesia';
    }
  }

  // Setting picker modal
  public isSettingPickerOpen = false;
  public settingPickerType = '';
  public settingPickerTitle = '';
  public settingPickerOptions: { label: string; value: any }[] = [];
  public pendingSettingValue: any = null;
  public pendingSettingLabel = '';

  public openSettingPicker(type: string) {
    this.settingPickerType = type;
    const isEn = this.isEn;
    if (type === 'theme') {
      this.settingPickerTitle = isEn ? 'Theme Mode' : 'Atur Warna Tema';
      this.settingPickerOptions = [
        { label: isEn ? 'Light Mode' : 'Mode terang', value: 'light' },
        { label: isEn ? 'Dark Mode' : 'Mode gelap', value: 'dark' },
      ];
      // Map old colour-based value to light/dark
      const savedTheme = this.settings?.themeColor || 'light';
      this.pendingSettingValue = savedTheme === 'dark' ? 'dark' : 'light';
    } else if (type === 'currency') {
      this.settingPickerTitle = isEn ? 'Currency Format' : 'Format Mata Uang';
      this.settingPickerOptions = [
        { label: 'Indonesian rupiah(Rp)', value: 'IDR' },
        { label: 'US Dollar($)', value: 'USD' },
        { label: 'Euro(€)', value: 'EUR' },
        { label: 'Singapore Dollar(S$)', value: 'SGD' },
        { label: 'Japanese Yen(¥)', value: 'JPY' },
        { label: 'Malaysian Ringgit(RM)', value: 'MYR' },
      ];
      this.pendingSettingValue = this.settings?.currency || 'IDR';
    } else if (type === 'language') {
      this.settingPickerTitle = isEn ? 'Select Language' : 'Pilih Bahasa';
      this.settingPickerOptions = [
        { label: 'Indonesia', value: 'id' },
        { label: 'English', value: 'en' },
      ];
      this.pendingSettingValue = this.settings?.language || 'id';
    } else if (type === 'firstDayOfWeek') {
      this.settingPickerTitle = isEn ? 'First Day of Week' : 'Hari Pertama Mingguan';
      this.settingPickerOptions = [
        { label: isEn ? 'Sunday' : 'Minggu', value: 'Minggu' },
        { label: isEn ? 'Monday' : 'Senin', value: 'Senin' },
        { label: isEn ? 'Saturday' : 'Sabtu', value: 'Sabtu' },
      ];
      this.pendingSettingValue = this.settingFirstDayOfWeek;
    } else if (type === 'firstDayOfMonth') {
      this.settingPickerTitle = isEn ? 'First Day of Month' : 'Tanggal Pertama Bulanan';
      this.settingPickerOptions = [
        { label: '1', value: '1' },
        { label: '25', value: '25' },
        { label: '28', value: '28' },
      ];
      this.pendingSettingValue = this.settingFirstDayOfMonth;
    }

    const currentOpt = this.settingPickerOptions.find(o => o.value === this.pendingSettingValue);
    this.pendingSettingLabel = currentOpt ? currentOpt.label : '';
    this.isSettingPickerOpen = true;
  }

  public isSettingSelected(opt: { label: string; value: any }): boolean {
    return this.pendingSettingValue === opt.value;
  }

  public pickPendingOption(opt: { label: string; value: any }) {
    this.pendingSettingValue = opt.value;
    this.pendingSettingLabel = opt.label;
  }

  public saveSettingOption() {
    if (this.settingPickerType === 'theme') {
      this.settingThemeName = this.pendingSettingLabel;
      this.changeTheme(this.pendingSettingValue as 'light' | 'dark');
    } else if (this.settingPickerType === 'currency') {
      this.settingCurrencyLabel = this.pendingSettingLabel;
      this.changeCurrency(this.pendingSettingValue);
    } else if (this.settingPickerType === 'language') {
      this.settingLanguageLabel = this.pendingSettingValue === 'en' ? 'English' : 'Indonesia';
      this.changeLanguage(this.pendingSettingValue);
    } else if (this.settingPickerType === 'firstDayOfWeek') {
      this.settingFirstDayOfWeek = this.pendingSettingValue;
    } else if (this.settingPickerType === 'firstDayOfMonth') {
      this.settingFirstDayOfMonth = this.pendingSettingValue;
    }
    this.recalculateAll();
    this.isSettingPickerOpen = false;
  }

  // --- Settings Modifiers ---
  public changeLanguage(lang: 'id' | 'en') {
    this.financeService.updateSettings({ language: lang });
    this.recalculateAll();
  }

  public changeCurrency(curr: 'IDR' | 'USD' | 'EUR' | 'SGD' | 'JPY' | 'MYR') {
    this.financeService.updateSettings({ currency: curr });
    this.recalculateAll();
  }

  public changeTheme(theme: 'light' | 'dark') {
    this.financeService.updateSettings({ themeColor: theme });
    this.financeService.applyTheme(theme);
  }

  public togglePinLock(enabled: boolean) {
    this.financeService.updateSettings({ pinEnabled: false, isUnlocked: true });
  }

  // --- Room Management Methods ---
  public isUserMemberOfActiveRoom(): boolean {
    if (!this.activeRoom) return false;
    const currentEmail = this.authService.currentUser?.email;
    return this.roomService.isUserMemberOrOwner(this.activeRoom, currentEmail);
  }

  public backupPersonalFinanceData(userEmail?: string | null): void {
    const email = (userEmail || this.authService.currentUser?.email)?.trim().toLowerCase();
    if (!email) return;
    try {
      const currentTx = this.financeService.getTransactions();
      if (currentTx) {
        localStorage.setItem(`cuan_personal_tx_${email}`, JSON.stringify(currentTx));
      }
      const currentGoals = this.savingsService.getGoals();
      if (currentGoals) {
        localStorage.setItem(`cuan_personal_savings_${email}`, JSON.stringify(currentGoals));
      }
    } catch {
      // Ignore
    }
  }

  public restorePersonalFinanceData(userEmail?: string | null): void {
    const email = (userEmail || this.authService.currentUser?.email)?.trim().toLowerCase();
    if (!email) {
      this.financeService.setTransactions([]);
      this.savingsService.setGoals([]);
      this.savingsGoals = [];
      return;
    }
    try {
      const rawTx = localStorage.getItem(`cuan_personal_tx_${email}`);
      if (rawTx) {
        const txs: Transaction[] = JSON.parse(rawTx);
        this.financeService.setTransactions(txs);
      } else {
        // If no backup exists yet, check if current transactions belong to a room
        if (!this.activeRoom) {
          // Keep current transactions
        } else {
          this.financeService.setTransactions([]);
        }
      }

      const rawGoals = localStorage.getItem(`cuan_personal_savings_${email}`);
      if (rawGoals) {
        const goals: SavingsGoal[] = JSON.parse(rawGoals);
        this.savingsService.setGoals(goals);
        this.savingsGoals = goals;
      } else if (this.activeRoom) {
        this.savingsService.setGoals([]);
        this.savingsGoals = [];
      }
    } catch {
      // Ignore
    }
  }

  public continueToPersonalFinances(): void {
    const userEmail = this.authService.currentUser?.email;
    this.roomService.setActiveRoom(null, userEmail);
    this.activeRoom = null;
    this.restorePersonalFinanceData(userEmail);
    this.activeView = 'report';
    this.recalculateAll();
  }

  public getUserRooms(): SharedRoom[] {
    const email = this.authService.currentUser?.email;
    return this.roomService.getUserRooms(email);
  }

  public selectRoomAndOpenDetails(room: SharedRoom): void {
    this.activeRoom = room;
    this.roomService.setActiveRoom(room, this.authService.currentUser?.email);
    this.openRoomDetailsModal();
  }

  public selectAndEnterRoom(room: SharedRoom): void {
    this.activeRoom = room;
    this.roomService.setActiveRoom(room, this.authService.currentUser?.email);
    this.enterActiveRoom();
  }

  public enterActiveRoom(): void {
    if (!this.activeRoom) return;
    const userEmail = this.authService.currentUser?.email;
    this.backupPersonalFinanceData(userEmail);
    if (this.activeRoom.transactions && this.activeRoom.transactions.length > 0) {
      this.financeService.setTransactions(this.activeRoom.transactions);
    }
    if (this.activeRoom.savingsGoals && this.activeRoom.savingsGoals.length > 0) {
      this.savingsService.setGoals(this.activeRoom.savingsGoals);
      this.savingsGoals = this.activeRoom.savingsGoals;
    }
    this.activeView = 'report';
    this.recalculateAll();
  }

  public openRoomSetup(): void {
    this.activeView = 'room_setup';
    this.roomErrorMessage = '';
  }

  public openCreateRoomModal(): void {
    this.newRoomName = '';
    this.roomErrorMessage = '';
    this.isCreateRoomModalOpen = true;
  }

  public closeCreateRoomModal(): void {
    this.isCreateRoomModalOpen = false;
    this.roomErrorMessage = '';
  }

  public async submitCreateRoom(): Promise<void> {
    if (!this.newRoomName.trim()) {
      this.roomErrorMessage = this.isEn ? 'Room name cannot be empty.' : 'Nama ruangan tidak boleh kosong.';
      return;
    }
    const user = this.authService.currentUser;
    const userEmail = user?.email || 'pembuat@cuan.app';
    const userName = user?.name || userEmail.split('@')[0];

    try {
      this.backupPersonalFinanceData(userEmail);
      const room = this.roomService.createRoom(this.newRoomName, userEmail, userName);
      this.createdRoomCode = room.inviteCode;
      this.activeRoom = room;
      this.isCreateRoomModalOpen = false;
      this.isRoomCreatedSuccessModalOpen = true;
      this.triggerRoomSync();
      // Upload ke server agar bisa diakses dari perangkat lain
      this.roomApiService.uploadRoom(room).catch(() => {/* offline – ok */});
    } catch (e: any) {
      this.roomErrorMessage = e.message || (this.isEn ? 'Failed to create room.' : 'Gagal membuat ruangan.');
    }
  }

  public openJoinRoomModal(): void {
    this.joinRoomCodeInput = '';
    this.roomErrorMessage = '';
    this.isJoinRoomModalOpen = true;
  }

  public closeJoinRoomModal(): void {
    this.isJoinRoomModalOpen = false;
    this.roomErrorMessage = '';
  }

  public fillDemoInviteCode(): void {
    this.joinRoomCodeInput = 'KOS-8492';
  }

  public async submitJoinRoom(): Promise<void> {
    if (!this.joinRoomCodeInput.trim()) {
      this.roomErrorMessage = this.isEn ? 'Please enter the room invite code.' : 'Masukkan kode undangan ruangan.';
      return;
    }
    const user = this.authService.currentUser;
    const userEmail = user?.email || 'anggota@cuan.app';
    const userName = user?.name || userEmail.split('@')[0];

    try {
      this.backupPersonalFinanceData(userEmail);

      // 1. Cari ruangan di server terlebih dahulu (lintas perangkat)
      const serverRoom = await this.roomApiService.findRoom(this.joinRoomCodeInput);
      if (serverRoom) {
        // Simpan ke localStorage agar bisa diakses offline lalu join di server
        const localRoom = this.roomService.mergeServerRoom(serverRoom);
        const joinedRoom = await this.roomApiService.joinRoom(serverRoom.id, userName) || localRoom;
        // Perbarui localStorage dengan data terbaru dari server
        this.roomService.mergeServerRoom(joinedRoom);
        this.roomService.setActiveRoom(joinedRoom, userEmail);
        this.activeRoom = joinedRoom;
        if (joinedRoom.transactions && joinedRoom.transactions.length > 0) {
          this.financeService.setTransactions(joinedRoom.transactions);
        }
        if (joinedRoom.savingsGoals && joinedRoom.savingsGoals.length > 0) {
          this.savingsService.setGoals(joinedRoom.savingsGoals);
          this.savingsGoals = joinedRoom.savingsGoals;
        }
        this.isJoinRoomModalOpen = false;
        this.activeView = 'room_setup';
        this.triggerRoomSync();
        alert(this.isEn ? `Successfully joined room "${joinedRoom.name}"!` : `Berhasil bergabung ke ruangan "${joinedRoom.name}"!`);
        return;
      }

      // 2. Fallback: cari di localStorage (untuk ruangan lokal / offline)
      const room = this.roomService.joinRoom(this.joinRoomCodeInput, userEmail, userName);
      this.activeRoom = room;
      if (room.transactions && room.transactions.length > 0) {
        this.financeService.setTransactions(room.transactions);
      }
      if (room.savingsGoals && room.savingsGoals.length > 0) {
        this.savingsService.setGoals(room.savingsGoals);
        this.savingsGoals = room.savingsGoals;
      }
      this.isJoinRoomModalOpen = false;
      this.activeView = 'room_setup';
      this.triggerRoomSync();
      alert(this.isEn ? `Successfully joined room "${room.name}"!` : `Berhasil bergabung ke ruangan "${room.name}"!`);
    } catch (e: any) {
      this.roomErrorMessage = e.message || (this.isEn ? 'Invite code not found.' : 'Kode undangan tidak ditemukan.');
    }
  }

  public finishCreateRoomAndStayInRoomSetup(): void {
    this.isRoomCreatedSuccessModalOpen = false;
    this.activeView = 'room_setup';
  }

  public finishCreateRoomAndGoHome(): void {
    this.finishCreateRoomAndStayInRoomSetup();
  }

  public openRoomDetailsModal(): void {
    this.isRoomDetailsModalOpen = true;
  }

  public closeRoomDetailsModal(): void {
    this.isRoomDetailsModalOpen = false;
  }

  public async copyInviteCode(code: string): Promise<void> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      }
      alert(this.isEn ? `Invite code "${code}" copied!` : `Kode undangan "${code}" berhasil disalin!`);
    } catch {
      alert(`${this.isEn ? 'Invite code' : 'Kode undangan'}: ${code}`);
    }
  }

  public leaveCurrentRoom(): void {
    if (!this.activeRoom) return;
    const isOwner = this.activeRoom.ownerEmail?.toLowerCase() === this.authService.currentUser?.email?.toLowerCase();
    const actionText = isOwner ? (this.isEn ? 'Delete' : 'Hapus') : (this.isEn ? 'Leave' : 'Keluar dari');
    const confirmLeave = confirm(
      this.isEn
        ? `${actionText} room "${this.activeRoom.name}"? You will switch back to personal finance.`
        : `${actionText} ruangan "${this.activeRoom.name}"? Anda akan beralih ke catatan keuangan pribadi.`
    );
    if (confirmLeave) {
      const roomId = this.activeRoom.id;
      const userEmail = this.authService.currentUser?.email;
      this.roomService.leaveRoom(userEmail);
      // Hapus/keluar dari server (fire-and-forget)
      this.roomApiService.deleteOrLeaveRoom(roomId).catch(() => {});
      this.activeRoom = null;
      this.isRoomDetailsModalOpen = false;
      this.restorePersonalFinanceData(userEmail);
      this.recalculateAll();
      this.activeView = 'room_setup';
      alert(isOwner ? (this.isEn ? 'Room has been deleted.' : 'Ruangan telah dihapus.') : (this.isEn ? 'You have left the room.' : 'Anda telah keluar dari ruangan.'));
    }
  }

  public triggerRoomSync(): void {
    this.isRoomSyncing = true;
    setTimeout(() => {
      this.isRoomSyncing = false;
      this.changeDetector.detectChanges();
    }, 700);
  }

  // ==========================================
  // PROFILE & EDIT PASSWORD MODAL
  // ==========================================
  public isProfileModalOpen = false;
  public profileCurrentPassword = '';
  public profileNewPassword = '';
  public profileConfirmPassword = '';
  public showCurrentPassword = false;
  public showNewPassword = false;
  public showConfirmPassword = false;
  public profilePasswordError = '';
  public profilePasswordSuccess = '';
  public isSavingPassword = false;

  public openProfileModal(): void {
    this.isProfileModalOpen = true;
    this.profileCurrentPassword = '';
    this.profileNewPassword = '';
    this.profileConfirmPassword = '';
    this.showCurrentPassword = false;
    this.showNewPassword = false;
    this.showConfirmPassword = false;
    this.profilePasswordError = '';
    this.profilePasswordSuccess = '';
    this.isSavingPassword = false;
  }

  public closeProfileModal(): void {
    this.isProfileModalOpen = false;
  }

  public async saveNewPassword(): Promise<void> {
    this.profilePasswordError = '';
    this.profilePasswordSuccess = '';

    const currentUser = this.authService.currentUser;
    const hasExistingPassword = this.authService.hasStoredPassword(currentUser?.email);

    if (hasExistingPassword && !this.profileCurrentPassword) {
      this.profilePasswordError = this.isEn
        ? 'Please enter your current password.'
        : 'Silakan masukkan kata sandi saat ini.';
      return;
    }

    if (!this.profileNewPassword || this.profileNewPassword.length < 6) {
      this.profilePasswordError = this.isEn
        ? 'New password must be at least 6 characters.'
        : 'Kata sandi baru minimal 6 karakter.';
      return;
    }

    if (this.profileNewPassword !== this.profileConfirmPassword) {
      this.profilePasswordError = this.isEn
        ? 'New password confirmation does not match.'
        : 'Konfirmasi kata sandi baru tidak cocok.';
      return;
    }

    if (hasExistingPassword && this.profileNewPassword === this.profileCurrentPassword) {
      this.profilePasswordError = this.isEn
        ? 'New password must be different from current password.'
        : 'Kata sandi baru harus berbeda dari kata sandi saat ini.';
      return;
    }

    this.isSavingPassword = true;
    try {
      await this.authService.changePassword(this.profileCurrentPassword, this.profileNewPassword);
      this.profilePasswordSuccess = this.isEn
        ? 'Password updated successfully!'
        : 'Kata sandi berhasil diperbarui!';
      this.profileCurrentPassword = '';
      this.profileNewPassword = '';
      this.profileConfirmPassword = '';
      setTimeout(() => {
        this.closeProfileModal();
      }, 1400);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('tidak sesuai') || msg.includes('incorrect') || msg.includes('salah')) {
        this.profilePasswordError = this.isEn
          ? 'Current password is incorrect.'
          : 'Kata sandi saat ini tidak sesuai.';
      } else {
        this.profilePasswordError = msg || (this.isEn ? 'Failed to update password.' : 'Gagal memperbarui kata sandi.');
      }
    } finally {
      this.isSavingPassword = false;
      this.changeDetector.detectChanges();
    }
  }
}

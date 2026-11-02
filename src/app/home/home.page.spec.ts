import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { HomePage } from './home.page';
import { CommodityPriceItem } from '../services/commodity-price.service';
import { IndustrialMetalItem } from '../services/industrial-metal.service';
import { SavingsGoal, SavingsService } from '../services/savings.service';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    localStorage.removeItem('cuan_savings_goals_v1');
    await TestBed.configureTestingModule({
      declarations: [HomePage],
      imports: [FormsModule, IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('returns through visited views in reverse navigation order', () => {
    component.activeView = 'search';
    component.activeView = 'charts';

    component.goBackToPreviousView();
    expect(component.activeView).toBe('search');

    component.goBackToPreviousView();
    expect(component.activeView).toBe('report');
  });

  it('does not add duplicate history entries when selecting the current view', () => {
    component.activeView = 'search';
    component.activeView = 'search';

    component.goBackToPreviousView();
    expect(component.activeView).toBe('report');

    component.goBackToPreviousView();
    expect(component.activeView).toBe('report');
  });

  it('opens the savings screen from the drawer menu below categories', () => {
    const menuButton = fixture.nativeElement.querySelector('.home-report-header .header-actions button:last-child');
    menuButton.click();
    fixture.detectChanges();

    const menuItems = fixture.nativeElement.querySelectorAll('.drawer-menu-item');
    expect(menuItems[3].textContent).toContain('Nabung');
    menuItems[3].click();
    fixture.detectChanges();

    expect(component.activeView).toBe('savings');
    expect(fixture.nativeElement.querySelector('.view-savings')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Tidak ada data untuk ditampilkan.');
  });

  it('creates a savings goal, records deposits, and moves completed goals to achieved', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 20, 12));
    try {
      component.openSavingGoalModal();
      component.savingGoalName = 'Dana darurat';
      component.savingGoalTargetAmount = 100000;
      component.savingGoalPlannedContribution = 10000;
      component.createSavingGoal();

      expect(component.savingsGoals).toHaveLength(1);
      expect(component.savingsGoals[0].name).toBe('Dana darurat');
      expect(component.savingsGoals[0].savedAmount).toBe(0);
      expect(component.savingsGoals[0].plannedContributionAmount).toBe(10000);
      expect(component.savingsGoals[0].contributionFrequency).toBe('daily');
      const createdAt = component.savingsGoals[0].createdAt;

      component.openContributionModal(component.savingsGoals[0]);
      component.savingContributionAmount = 100000;
      component.recordSaving();
      component.savingsTab = 'achieved';

      expect(component.filteredSavingsGoals).toHaveLength(1);
      expect(component.filteredSavingsGoals[0].savedAmount).toBe(100000);
      expect(component.getSavingsProgress(component.filteredSavingsGoals[0])).toBe(100);
      expect(component.savingsGoals[0].achievedAt).toBe(createdAt);
      expect(component.savingsGoals[0].contributions).toEqual([
        { amount: 100000, contributedAt: createdAt, action: 'add', note: '' }
      ]);
      expect(component.achievedSavingsGoal?.id).toBe(component.savingsGoals[0].id);
      expect(component.savingsTab).toBe('achieved');
      expect(component.getSavingsDurationDays(component.savingsGoals[0])).toBe(0);
      expect(component.formatSavingsDate(createdAt)).toContain('27');
      expect(component.formatSavingsDateTime(component.savingsGoals[0].achievedAt)).toContain('.12');
      expect(localStorage.getItem('cuan_savings_goals_v1')).toContain('Dana darurat');
    } finally {
      vi.useRealTimers();
    }
  });

  it('formats savings achievement details and labels in English when English is selected', () => {
    try {
      component.changeLanguage('en');
      const achievedAt = '2026-10-27T13:12:00.000Z';
      expect(component.isEn).toBe(true);
      expect(component.formatSavingsDateTime(achievedAt)).toContain('Oct');
      expect(component.formatSavingsDate(achievedAt)).toContain('Oct');

      component.savingsGoals = [{
        id: 'goal-english',
        name: 'Emergency fund',
        targetAmount: 1000,
        savedAmount: 1000,
        createdAt: achievedAt,
        achievedAt,
        contributions: [{ amount: 1000, contributedAt: achievedAt }]
      }];
      component.savingsTab = 'achieved';
      const menuButton = fixture.nativeElement.querySelector('.home-report-header .header-actions button:last-child');
      menuButton.click();
      fixture.detectChanges();
      fixture.nativeElement.querySelectorAll('.drawer-menu-item')[3].click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.savings-achievement-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Reached in');
      expect(fixture.nativeElement.textContent).toContain('Created on');
      expect(fixture.nativeElement.textContent).toContain('Achieved on');
    } finally {
      component.changeLanguage('id');
    }
  });

  it('shows honest unavailable dates for achieved goals created before achievement tracking', () => {
    component.savingsGoals = [{
      id: 'legacy-achieved',
      name: 'Old savings',
      targetAmount: 1000,
      savedAmount: 1000,
      createdAt: '2026-10-20T08:00:00.000Z'
    }];
    component.savingsTab = 'achieved';

    expect(component.getSavingsDurationDays(component.savingsGoals[0])).toBeNull();
    expect(component.formatSavingsDateTime(component.savingsGoals[0].achievedAt)).toBe('Belum tersedia');
    expect(component.savingsGoals[0].createdAt).toBe('2026-10-20T08:00:00.000Z');
  });

  it('collapses and expands achievement details from the chevron control', () => {
    const achievedAt = '2026-10-27T13:12:00.000Z';
    const goal: SavingsGoal = {
      id: 'collapsible-achievement',
      name: 'Holiday',
      targetAmount: 1000,
      savedAmount: 1000,
      createdAt: achievedAt,
      achievedAt,
      contributions: [{ amount: 1000, contributedAt: achievedAt }]
    };
    component.savingsGoals = [goal];
    component.savingsTab = 'achieved';
    const menuButton = fixture.nativeElement.querySelector('.home-report-header .header-actions button:last-child');
    menuButton.click();
    fixture.detectChanges();
    fixture.nativeElement.querySelectorAll('.drawer-menu-item')[3].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.savings-achievement-expanded')).toBeNull();
    const toggle = fixture.nativeElement.querySelector('.savings-achievement-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.savings-achievement-expanded')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Tanggal Dibuat');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.savings-achievement-expanded')).toBeNull();
  });

  it('formats savings amounts while typing and saves clean numeric values', () => {
    component.openSavingGoalModal();

    const targetInput = document.createElement('input');
    targetInput.value = '90000000';
    targetInput.setSelectionRange(4, 4);
    const targetInputEvent = new Event('input');
    Object.defineProperty(targetInputEvent, 'target', { value: targetInput });
    component.onFormattedAmountInput(targetInputEvent, 'savingsTarget');
    expect(targetInput.value).toBe('90.000.000');
    expect(targetInput.selectionStart).toBe(5);
    expect(component.savingGoalTargetAmount).toBe(90000000);

    const plannedInput = document.createElement('input');
    plannedInput.value = '10a000';
    const plannedInputEvent = new Event('input');
    Object.defineProperty(plannedInputEvent, 'target', { value: plannedInput });
    component.onFormattedAmountInput(plannedInputEvent, 'savingsPlan');
    expect(plannedInput.value).toBe('10.000');
    expect(component.savingGoalPlannedContribution).toBe(10000);

    component.savingGoalName = 'Dana darurat';
    component.createSavingGoal();
    expect(component.savingsGoals[0].targetAmount).toBe(90000000);
    expect(component.savingsGoals[0].plannedContributionAmount).toBe(10000);
    expect(localStorage.getItem('cuan_savings_goals_v1')).toContain('"targetAmount":90000000');

    component.openContributionModal(component.savingsGoals[0]);
    const depositInput = document.createElement('input');
    depositInput.value = '12.345';
    const depositInputEvent = new Event('input');
    Object.defineProperty(depositInputEvent, 'target', { value: depositInput });
    component.onFormattedAmountInput(depositInputEvent, 'savingsDeposit');
    expect(component.savingContributionAmount).toBe(12345);
    component.recordSaving();
    expect(component.savingsGoals[0].savedAmount).toBe(12345);
  });

  it('records savings increases and reductions with notes without allowing a negative balance', () => {
    component.openSavingGoalModal();
    component.savingGoalName = 'Travel';
    component.savingGoalTargetAmount = 10000;
    component.savingGoalPlannedContribution = 5000;
    component.createSavingGoal();

    const goal = component.savingsGoals[0];
    component.openContributionModal(goal);
    expect(goal.plannedContributionAmount).toBe(5000);
    expect(goal.targetAmount).toBe(10000);
    component.setSavingContributionAmount(goal.plannedContributionAmount || 0);
    expect(component.savingContributionAmount).toBe(5000);
    component.setSavingContributionAmount(10000);
    expect(component.savingContributionAmount).toBe(goal.targetAmount);
    component.savingContributionNote = 'Monthly deposit';
    component.recordSaving();
    expect(component.savingsGoals[0].savedAmount).toBe(10000);
    expect(component.savingsGoals[0].achievedAt).toBeTruthy();

    component.openContributionModal(component.savingsGoals[0]);
    component.savingContributionAction = 'subtract';
    component.setSavingContributionAmount(12000);
    component.recordSaving();
    expect(component.savingsGoals[0].savedAmount).toBe(10000);
    expect(component.savingContributionError).toContain('melebihi saldo');

    component.setSavingContributionAmount(3000);
    component.savingContributionNote = 'Ticket';
    component.recordSaving();
    expect(component.savingsGoals[0].savedAmount).toBe(7000);
    expect(component.savingsGoals[0].achievedAt).toBeUndefined();
    expect(component.savingsGoals[0].contributions?.[1]).toMatchObject({
      amount: 3000,
      action: 'subtract',
      note: 'Ticket'
    });

    const storedGoals = JSON.parse(localStorage.getItem('cuan_savings_goals_v1') || '[]');
    expect(storedGoals[0].savedAmount).toBe(7000);
  });

  it('only shows the congratulation dialog when an addition reaches the savings target', () => {
    const savingsService = TestBed.inject(SavingsService);
    const goal = savingsService.createGoal('New phone', 50000);
    savingsService.addContribution(goal.id, 40000);
    component.savingsGoals = savingsService.getGoals();
    component.openContributionModal(component.savingsGoals[0]);
    component.savingContributionAmount = 10000;
    component.recordSaving();
    fixture.detectChanges();

    expect(component.achievedSavingsGoal?.name).toBe('New phone');

    component.achievedSavingsGoal = null;
    component.openContributionModal(component.savingsGoals[0]);
    component.savingContributionAmount = 5000;
    component.recordSaving();
    expect(component.achievedSavingsGoal).toBeNull();
  });

  it('uses the selected goal plan and target for quick amounts and hides recording on achieved goals', () => {
    component.savingsGoals = [{
      id: 'quick-amount-goal',
      name: 'Laptop',
      targetAmount: 50000,
      savedAmount: 0,
      createdAt: new Date().toISOString(),
      plannedContributionAmount: 5000,
      contributionFrequency: 'daily'
    }];
    component.savingsTab = 'ongoing';
    component.activeView = 'savings';
    component.openContributionModal(component.savingsGoals[0]);
    fixture.detectChanges();

    expect(component.savingContributionQuickAmounts).toEqual([5000, 50000]);
    component.setSavingContributionAmount(component.savingContributionQuickAmounts[0]);
    expect(component.savingContributionAmount).toBe(5000);

    component.setSavingContributionAmount(component.savingContributionQuickAmounts[1]);
    expect(component.savingContributionAmount).toBe(50000);

    component.closeContributionModal();
    component.savingsTab = 'achieved';
    component.savingsGoals[0].savedAmount = 50000;
    component.activeView = 'report';
    fixture.detectChanges();
    const menuButton = fixture.nativeElement.querySelector('.home-report-header .header-actions button:last-child');
    menuButton.click();
    fixture.detectChanges();
    fixture.nativeElement.querySelectorAll('.drawer-menu-item')[3].click();
    fixture.detectChanges();

    const goalCard = fixture.nativeElement.querySelector('.savings-goal-card');
    expect(goalCard).toBeTruthy();
    expect(goalCard.textContent).not.toContain('Catat Tabungan');
    expect(goalCard.querySelector('.savings-goal-footer button')).toBeNull();
  });

  it('formats Indonesian thousands separators for the requested large amounts', () => {
    expect([1000, 10000, 1000000, 90000000, 1000000000, 1000000000000].map(value =>
      component.formatThousandsInput(value)
    )).toEqual([
      '1.000',
      '10.000',
      '1.000.000',
      '90.000.000',
      '1.000.000.000',
      '1.000.000.000.000'
    ]);
  });

  it('formats transaction amount while typing and retains a numeric value for saving', () => {
    component.openAddTransaction('expense');

    const amountInput = document.createElement('input');
    amountInput.value = '90.000.000';
    amountInput.setSelectionRange(6, 6);
    const amountInputEvent = new Event('input');
    Object.defineProperty(amountInputEvent, 'target', { value: amountInput });
    component.onFormattedAmountInput(amountInputEvent, 'transaction');

    expect(amountInput.value).toBe('90.000.000');
    expect(component.formAmount).toBe(90000000);
    expect(amountInput.selectionStart).toBe(6);
  });

  it('estimates target completion based on the contribution plan', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 12));
    const weeklyDate = component.getSavingsEstimatedCompletionDate(500, 100, 100, 'weekly');
    const monthlyDate = component.getSavingsEstimatedCompletionDate(600, 100, 100, 'monthly');

    try {
      expect(weeklyDate?.getFullYear()).toBe(2026);
      expect(weeklyDate?.getMonth()).toBe(1);
      expect(weeklyDate?.getDate()).toBe(28);
      expect(monthlyDate?.getMonth()).toBe(5);
      expect(monthlyDate?.getDate()).toBe(30);
      expect(component.getSavingsEstimatedCompletionDate(500, 500, 100, 'daily')).toBeNull();
      expect(component.getSavingsEstimatedCompletionDate(500, 0, 0, 'daily')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('scopes the extra safe-area spacing to the home header and removes default balance settings', () => {
    expect(fixture.nativeElement.querySelector('.home-report-header')).toBeTruthy();

    component.activeView = 'settings';
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Atur Saldo Bawaan');
    expect(fixture.nativeElement.textContent).not.toContain('Default Balance');
  });

  it('shows and navigates the selected week range in chart weekly mode', () => {
    component.selectChartPeriod('weekly');
    const currentWeekLabel = component.getChartWeekRangeLabel();
    expect(currentWeekLabel).toMatch(/^\d{2}\.\d{2}\.\d{4} ~ \d{2}\.\d{2}\.\d{4}$/);

    component.navigateChartWeek(1);
    expect(component.chartWeekOffset).toBe(1);
    expect(component.getChartWeekRangeLabel()).not.toBe(currentWeekLabel);

    component.selectChartPeriod('weekly');
    expect(component.chartWeekOffset).toBe(0);
    expect(component.getChartWeekRangeLabel()).toBe(currentWeekLabel);
  });

  it('shows the saved-file dialog after a successful export', async () => {
    const file = {
      filename: 'laporan_keuangan.xls',
      uri: 'content://downloads/laporan_keuangan.xls',
      location: 'Download/laporan_keuangan.xls',
      mimeType: 'application/vnd.ms-excel'
    };
    vi.spyOn(component.financeService, 'exportToExcel').mockResolvedValue(file);

    await component.executeExport();
    fixture.detectChanges();

    expect(component.exportedFile).toEqual(file);
    expect(component.isExportModalOpen).toBe(false);
    expect(component.isExportSuccessModalOpen).toBe(true);
    expect(fixture.nativeElement.querySelector('.export-success-dialog')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Download/laporan_keuangan.xls');
    expect(fixture.nativeElement.textContent).toContain('BUKA');
    expect(fixture.nativeElement.textContent).toContain('KIRIM');
  });

  it('anchors the weekly chart to the selected month rather than the current calendar date', () => {
    component.selectedYear = 2025;
    component.selectedMonth = 12;
    component.chartWeekOffset = 0;

    const label = component.getChartWeekRangeLabel();
    expect(label).toBe('01.12.2025 ~ 07.12.2025');
  });

  it('clears stale copy feedback when opening a commodity detail', () => {
    const item: CommodityPriceItem = {
      id: 'rice',
      name: 'Beras',
      group: 'beras',
      groupLabel: 'Beras',
      price: 14750,
      denomination: 'kg',
      change: 0,
      fluc: 0,
      trend: 'stable',
      date: '2026-10-27',
      history: []
    };
    component.selectedMarketPriceCopyKey = 'commodity:previous';
    component.marketPriceCopyMessage = 'Harga berhasil disalin.';

    component.openCommodityDetail(item);

    expect(component.selectedCommodityModal).toBe(item);
    expect(component.selectedMarketPriceCopyKey).toBeNull();
    expect(component.marketPriceCopyMessage).toBe('');
  });

  it('clears stale copy feedback when opening and closing an industrial metal detail', () => {
    const item: IndustrialMetalItem = {
      id: 'copper',
      name: 'Copper',
      englishName: 'Copper',
      symbol: 'HG',
      category: 'base',
      categoryLabel: 'Base Metals',
      exchange: 'COMEX',
      priceUsd: 4.62,
      unit: 'USD / lbs',
      priceIdr: 168618,
      idrUnit: 'Rp / kg',
      changeUsd: 0.045,
      changePercent: 0.98,
      trend: 'up',
      contractMonth: 'Dec 26',
      openUsd: 4.58,
      highUsd: 4.65,
      lowUsd: 4.56,
      prevCloseUsd: 4.575,
      date: '2026-10-27',
      history: [],
      investingUrl: 'https://id.investing.com/commodities/metals'
    };
    component.selectedMarketPriceCopyKey = 'industrial:previous';
    component.marketPriceCopyMessage = 'Harga berhasil disalin.';

    component.openIndustrialMetalDetail(item);

    expect(component.selectedIndustrialMetalModal).toBe(item);
    expect(component.selectedMarketPriceCopyKey).toBeNull();
    expect(component.marketPriceCopyMessage).toBe('');

    component.settings.language = 'id';
    component.selectIndustrialMetalForCopy(item);
    const copyText = Reflect.get(component, 'marketPriceCopyText') as string;
    expect(copyText).toContain('INVESTING.COM • COMEX');
    expect(copyText).toContain(component.isEn ? item.englishName : item.name);
    expect(copyText).toContain(
      `${item.englishName} • ${component.isEn ? 'Contract' : 'Kontrak'} ${item.contractMonth}`
    );
    expect(copyText).toContain('$4.62');
    expect(copyText).toContain('USD / lbs');
    expect(copyText).toContain('168.618 / kg');
    expect(copyText).toContain('+0.98% (+0.045)');
    component.marketPriceCopyMessage = 'Harga berhasil disalin.';
    component.closeIndustrialMetalDetail();

    expect(component.selectedIndustrialMetalModal).toBeNull();
    expect(component.selectedMarketPriceCopyKey).toBeNull();
    expect(component.marketPriceCopyMessage).toBe('');
  });

  it('asks for exit confirmation after two back presses from the home report', () => {
    const handleBackButton = Reflect.get(component, 'handleNativeBackButton') as (() => void) | undefined;
    expect(handleBackButton).toBeTruthy();

    handleBackButton?.call(component);
    expect(component.isConfirmModalOpen).toBe(false);
    expect(component.exitToastMessage).toContain('Tekan tombol kembali');

    handleBackButton?.call(component);
    expect(component.isConfirmModalOpen).toBe(true);
    expect(component.confirmModalMessage).toBe('Yakin mau keluar dari aplikasi ini?');
    expect(fixture.nativeElement.querySelector('.confirm-dialog-card')).toBeTruthy();
  });
});

import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';
import { BehaviorSubject, Observable } from 'rxjs';
import { Transaction, Category, AppSettings, PeriodSummary } from '../models/finance.model';
import { ExportFile, ExportedFile } from './export-file.plugin';

const STORAGE_KEY_TX = 'cuan_transactions_v1';
const STORAGE_KEY_CAT = 'cuan_categories_v1';
const STORAGE_KEY_SETTINGS = 'cuan_settings_v1';
const STORAGE_KEY_FINANCIAL_RECORDS_CLEARED = 'cuan_financial_records_cleared_v2';

@Injectable({
  providedIn: 'root'
})
export class FinanceService {

  private defaultCategories: Category[] = [
    // Expense (Matching Exact Screenshot: Asuransi, Bayi, Belanja, Buah-buahan, Cemilan, Elektronik, Hadiah, Hewan Peliharaan, Hiburan, Kantor, Kecantikan, Kesehatan, ...)
    { id: 'cat_asuransi', name: 'Asuransi', nameEn: 'Insurance', type: 'expense', icon: 'shield-checkmark-outline', color: '#0284c7' },
    { id: 'cat_bayi', name: 'Bayi', nameEn: 'Baby', type: 'expense', icon: 'heart-outline', color: '#ec4899' },
    { id: 'cat_belanja', name: 'Belanja', nameEn: 'Shopping', type: 'expense', icon: 'cart-outline', color: '#10b981' },
    { id: 'cat_buah', name: 'Buah-buahan', nameEn: 'Fruits', type: 'expense', icon: 'nutrition-outline', color: '#eab308' },
    { id: 'cat_cemilan', name: 'Cemilan', nameEn: 'Snacks', type: 'expense', icon: 'ice-cream-outline', color: '#9a3412' },
    { id: 'cat_elektronik', name: 'Elektronik', nameEn: 'Electronics', type: 'expense', icon: 'tv-outline', color: '#3b82f6' },
    { id: 'cat_hadiah', name: 'Hadiah', nameEn: 'Gift', type: 'expense', icon: 'gift-outline', color: '#f43f5e' },
    { id: 'cat_hewan', name: 'Hewan Peliharaan', nameEn: 'Pets', type: 'expense', icon: 'paw-outline', color: '#d97706' },
    { id: 'cat_hiburan', name: 'Hiburan', nameEn: 'Entertainment', type: 'expense', icon: 'game-controller-outline', color: '#ec4899' },
    { id: 'cat_kantor', name: 'Kantor', nameEn: 'Office', type: 'expense', icon: 'business-outline', color: '#475569' },
    { id: 'cat_kecantikan', name: 'Kecantikan', nameEn: 'Beauty', type: 'expense', icon: 'sparkles-outline', color: '#db2777' },
    { id: 'cat_kesehatan', name: 'Kesehatan', nameEn: 'Health', type: 'expense', icon: 'medkit-outline', color: '#059669' },
    { id: 'cat_makanan', name: 'Makanan', nameEn: 'Food & Dining', type: 'expense', icon: 'restaurant-outline', color: '#8b5cf6' },
    { id: 'cat_motor', name: 'Sepeda Motor', nameEn: 'Motorcycle', type: 'expense', icon: 'bicycle-outline', color: '#1e3a8a' },
    { id: 'cat_pulsa', name: 'Pulsa', nameEn: 'Phone & Internet', type: 'expense', icon: 'phone-portrait-outline', color: '#0284c7' },
    { id: 'cat_pajak', name: 'Pajak', nameEn: 'Tax', type: 'expense', icon: 'document-text-outline', color: '#64748b' },
    { id: 'cat_lain', name: 'Lain-Lain', nameEn: 'Others', type: 'expense', icon: 'ellipsis-horizontal-outline', color: '#ef4444' },
    { id: 'cat_tagihan', name: 'Tagihan', nameEn: 'Bills', type: 'expense', icon: 'receipt-outline', color: '#f59e0b' },
    // Income
    { id: 'cat_gaji', name: 'Gaji Bulanan', nameEn: 'Salary', type: 'income', icon: 'cash-outline', color: '#10b981' },
    { id: 'cat_bonus', name: 'Bonus & THR', nameEn: 'Bonus', type: 'income', icon: 'gift-outline', color: '#06b6d4' },
    { id: 'cat_investasi', name: 'Investasi', nameEn: 'Investment', type: 'income', icon: 'trending-up-outline', color: '#8b5cf6' },
    { id: 'cat_freelance', name: 'Freelance & Usaha', nameEn: 'Side Hustle', type: 'income', icon: 'briefcase-outline', color: '#3b82f6' },
    { id: 'cat_inc_lain', name: 'Pemasukan Lain', nameEn: 'Other Income', type: 'income', icon: 'wallet-outline', color: '#6366f1' },
  ];

  /* Legacy screenshot seed retained only to identify and remove prior demo records. */
  private readonly demoTransactionIds = new Set([
    'tx_okt_asuransi', 'tx_okt_15_01', 'tx_okt_15_02', 'tx_okt_15_03', 'tx_okt_01',
    ...Array.from({ length: 16 }, (_, index) => `tx_${String(index + 1).padStart(2, '0')}`)
  ]);

  private defaultSettings: AppSettings = {
    currency: 'IDR',
    language: 'id',
    themeColor: 'coral',
    pinEnabled: false,
    pinCode: '1234',
    securityQuestion: 'Nama hewan peliharaan pertama?',
    securityAnswer: 'Kucing',
    isUnlocked: true,
  };

  private transactionsSubject = new BehaviorSubject<Transaction[]>([]);
  public transactions$: Observable<Transaction[]> = this.transactionsSubject.asObservable();

  private categoriesSubject = new BehaviorSubject<Category[]>([]);
  public categories$: Observable<Category[]> = this.categoriesSubject.asObservable();

  private settingsSubject = new BehaviorSubject<AppSettings>(this.defaultSettings);
  public settings$: Observable<AppSettings> = this.settingsSubject.asObservable();

  constructor() {
    this.initData();
  }

  private initData() {
    // One-time migration: remove every previously saved income/expense record.
    // Categories and preferences remain intact.
    if (!localStorage.getItem(STORAGE_KEY_FINANCIAL_RECORDS_CLEARED)) {
      localStorage.removeItem(STORAGE_KEY_TX);
      localStorage.setItem(STORAGE_KEY_FINANCIAL_RECORDS_CLEARED, 'true');
    }

    const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        parsed.pinEnabled = false;
        parsed.isUnlocked = true;
        this.settingsSubject.next({ ...this.defaultSettings, ...parsed, pinEnabled: false, isUnlocked: true });
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({ ...this.defaultSettings, ...parsed, pinEnabled: false, isUnlocked: true }));
      } catch (e) {
        this.settingsSubject.next(this.defaultSettings);
      }
    } else {
      this.settingsSubject.next(this.defaultSettings);
    }

    const savedCats = localStorage.getItem(STORAGE_KEY_CAT);
    if (savedCats) {
      try {
        let cats: Category[] = JSON.parse(savedCats);
        let updated = false;
        for (const defCat of this.defaultCategories) {
          if (!cats.some(c => c.name.toLowerCase() === defCat.name.toLowerCase())) {
            cats.push(defCat);
            updated = true;
          }
        }
        if (updated) {
          localStorage.setItem(STORAGE_KEY_CAT, JSON.stringify(cats));
        }
        this.categoriesSubject.next(cats);
      } catch (e) {
        this.categoriesSubject.next(this.defaultCategories);
      }
    } else {
      this.categoriesSubject.next(this.defaultCategories);
      this.saveCategories();
    }

    const savedTx = localStorage.getItem(STORAGE_KEY_TX);
    if (savedTx) {
      try {
        const stored: Transaction[] = JSON.parse(savedTx);
        const txs = stored.filter(tx => !this.demoTransactionIds.has(tx.id));
        /* if (!txs.some(t => t.categoryId === 'cat_asuransi' && t.date === '2026-10-14')) {
          txs.push({
            id: 'tx_okt_asuransi',
            type: 'expense',
            amount: 10000,
            categoryId: 'cat_asuransi',
            categoryName: 'Asuransi',
            date: '2026-10-14',
            note: 'bayar pajak',
            account: 'Tunai',
            createdAt: '2026-10-14T10:00:00Z'
          });
          localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(txs));
        } */
        /* if (!txs.some(t => t.date === '2026-10-15')) {
          txs.unshift(
            {
              id: 'tx_okt_15_01',
              type: 'expense',
              amount: 700000,
              categoryId: 'cat_makanan',
              categoryName: 'Makanan',
              date: '2026-10-15',
              note: '-',
              account: 'Tunai',
              createdAt: '2026-10-15T08:00:00Z'
            },
            {
              id: 'tx_okt_15_02',
              type: 'expense',
              amount: 270000000,
              categoryId: 'cat_makanan',
              categoryName: 'Makanan',
              date: '2026-10-15',
              note: '-',
              account: 'Tunai',
              createdAt: '2026-10-15T09:00:00Z'
            },
            {
              id: 'tx_okt_15_03',
              type: 'income',
              amount: 50000,
              categoryId: 'cat_makanan',
              categoryName: 'Makanan',
              date: '2026-10-15',
              note: '-',
              account: 'Tunai',
              createdAt: '2026-10-15T10:00:00Z'
            }
          );
          localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(txs));
        } */
        /* if (!txs.some(t => t.date === '2026-10-14' && t.note === 'bayar pajak')) {
          txs.push({
            id: 'tx_okt_01',
            type: 'expense',
            amount: 25000,
            categoryId: 'cat_pajak',
            categoryName: 'Pajak',
            date: '2026-10-14',
            note: 'bayar pajak',
            account: 'Tunai',
            createdAt: '2026-10-14T10:00:00Z'
          });
          localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(txs));
        } */
        if (txs.length !== stored.length) localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(txs));
        this.transactionsSubject.next(txs);
      } catch (e) {
        this.transactionsSubject.next([]);
        this.saveTransactions();
      }
    } else {
      this.transactionsSubject.next([]);
      this.saveTransactions();
    }

    this.applyTheme(this.getSettings().themeColor);
  }

  // --- Transactions ---
  public getTransactions(): Transaction[] {
    return this.transactionsSubject.value;
  }

  public addTransaction(tx: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
    const newTx: Transaction = {
      ...tx,
      id: 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      createdAt: new Date().toISOString()
    };
    const current = [newTx, ...this.transactionsSubject.value];
    this.transactionsSubject.next(current);
    this.saveTransactions();
    return newTx;
  }

  public updateTransaction(updated: Transaction): void {
    const list = this.transactionsSubject.value.map(t => t.id === updated.id ? updated : t);
    this.transactionsSubject.next(list);
    this.saveTransactions();
  }

  public deleteTransaction(id: string): void {
    const list = this.transactionsSubject.value.filter(t => t.id !== id);
    this.transactionsSubject.next(list);
    this.saveTransactions();
  }

  private saveTransactions(): void {
    localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(this.transactionsSubject.value));
  }

  public setTransactions(txs: Transaction[]): void {
    this.transactionsSubject.next(txs);
    this.saveTransactions();
  }

  // --- Categories ---
  public getCategories(type?: 'income' | 'expense'): Category[] {
    const cats = this.categoriesSubject.value;
    if (!type) return cats;
    return cats.filter(c => c.type === type);
  }

  public addCategory(cat: Omit<Category, 'id'>): Category {
    const newCat: Category = {
      ...cat,
      id: 'cat_' + Date.now()
    };
    const updated = [...this.categoriesSubject.value, newCat];
    this.categoriesSubject.next(updated);
    this.saveCategories();
    return newCat;
  }

  public updateCategory(cat: Category): void {
    const updated = this.categoriesSubject.value.map(c => c.id === cat.id ? cat : c);
    this.categoriesSubject.next(updated);
    this.saveCategories();
  }

  public deleteCategory(id: string): void {
    const updated = this.categoriesSubject.value.filter(c => c.id !== id);
    this.categoriesSubject.next(updated);
    this.saveCategories();
  }

  private saveCategories(): void {
    localStorage.setItem(STORAGE_KEY_CAT, JSON.stringify(this.categoriesSubject.value));
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    return this.settingsSubject.value;
  }

  public updateSettings(partial: Partial<AppSettings>): void {
    const updated = { ...this.settingsSubject.value, ...partial };
    this.settingsSubject.next(updated);
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
    if (partial.themeColor) {
      this.applyTheme(partial.themeColor);
    }
  }

  public unlockPin(pin: string): boolean {
    const s = this.getSettings();
    if (s.pinCode === pin) {
      this.updateSettings({ isUnlocked: true });
      return true;
    }
    return false;
  }

  public lockApp(): void {
    if (this.getSettings().pinEnabled) {
      this.updateSettings({ isUnlocked: false });
    }
  }

  public resetPinWithSecurity(answer: string, newPin: string): boolean {
    const s = this.getSettings();
    if (s.securityAnswer.trim().toLowerCase() === answer.trim().toLowerCase()) {
      this.updateSettings({ pinCode: newPin, isUnlocked: true });
      return true;
    }
    return false;
  }

  // --- Themes ---
  public applyTheme(theme: string): void {
    document.body.classList.remove('theme-light', 'theme-coral', 'theme-teal', 'theme-green', 'theme-blue', 'theme-purple', 'theme-dark');
    if (theme && theme !== 'light') {
      document.body.classList.add(`theme-${theme}`);
    }
    // 'light' = default, no extra class needed
  }

  // --- Currency Formatting ---
  public formatMoney(amount: number): string {
    const s = this.getSettings();
    const curr = s.currency;
    const isNegative = amount < 0;
    const absVal = Math.abs(amount);

    let prefix = 'Rp';
    let formatted = '';

    switch (curr) {
      case 'USD':
        prefix = '$ ';
        formatted = absVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        break;
      case 'EUR':
        prefix = '€ ';
        formatted = absVal.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        break;
      case 'SGD':
        prefix = 'S$ ';
        formatted = absVal.toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        break;
      case 'JPY':
        prefix = '¥ ';
        formatted = Math.round(absVal).toLocaleString('ja-JP');
        break;
      case 'MYR':
        prefix = 'RM ';
        formatted = absVal.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        break;
      case 'IDR':
      default:
        prefix = 'Rp ';
        formatted = Math.round(absVal).toLocaleString('id-ID');
        break;
    }

    return `${isNegative ? '-' : ''}${prefix}${formatted}`;
  }

  // Format short for chart Y axis (e.g. 1jt, 2jt, 3jt)
  public formatShortMoney(amount: number): string {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(0) + 'jt';
    } else if (amount >= 1000) {
      return (amount / 1000).toFixed(0) + 'rb';
    }
    return amount.toString();
  }

  // --- Aggregations & Calculations ---
  public getYearlyStats(year: number) {
    const txs = this.getTransactions().filter(t => {
      const y = parseInt(t.date.split('-')[0], 10);
      return y === year;
    });

    let income = 0;
    let expense = 0;
    txs.forEach(t => {
      if (t.type === 'income') income += t.amount;
      else expense += t.amount;
    });

    return {
      income,
      expense,
      balance: income - expense,
      count: txs.length
    };
  }

  public getMonthlyList(year: number): PeriodSummary[] {
    const monthNamesId = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const isEn = this.getSettings().language === 'en';
    const names = isEn ? monthNamesEn : monthNamesId;

    const result: PeriodSummary[] = [];
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const currentYear = now.getFullYear();

    for (let m = 0; m < 12; m++) {
      const monthStr = (m + 1).toString().padStart(2, '0');
      const prefix = `${year}-${monthStr}`;
      const monthTxs = this.getTransactions().filter(t => t.date.startsWith(prefix));

      let inc = 0;
      let exp = 0;
      monthTxs.forEach(t => {
        if (t.type === 'income') inc += t.amount;
        else exp += t.amount;
      });

      const isCurrent = year === currentYear && m === currentMonthIdx;

      result.push({
        periodKey: `${year}-${monthStr}`,
        periodLabel: names[m],
        income: inc,
        expense: exp,
        balance: inc - exp,
        badgeClass: isCurrent ? 'badge-current' : 'badge-normal'
      });
    }

    // In Screenshot 2, list displays descending (Apr, Mar, Feb, Jan)
    return result.reverse();
  }

  // --- Backup / Restore / Reset ---
  public exportDataJSON(): string {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      transactions: this.getTransactions(),
      categories: this.categoriesSubject.value,
      settings: this.getSettings()
    };
    return JSON.stringify(data, null, 2);
  }

  public importDataJSON(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.transactions && Array.isArray(parsed.transactions)) {
        this.transactionsSubject.next(parsed.transactions);
        this.saveTransactions();
      }
      if (parsed.categories && Array.isArray(parsed.categories)) {
        this.categoriesSubject.next(parsed.categories);
        this.saveCategories();
      }
      if (parsed.settings) {
        this.updateSettings(parsed.settings);
      }
      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  }

  public resetToDefault(): void {
    this.transactionsSubject.next([]);
    this.saveTransactions();
    this.categoriesSubject.next(this.defaultCategories);
    this.saveCategories();
    this.updateSettings(this.defaultSettings);
  }

  // --- Export Helpers ---
  public formatDateDDMMYYYY(dateStr?: string): string {
    if (!dateStr) return '';
    const clean = dateStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${d}/${m}/${y}`;
    }
    return dateStr;
  }

  public formatNominalRp(amount: number): string {
    if (!amount || amount === 0) return 'Rp0';
    const rounded = Math.round(amount);
    const parts = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (rounded < 0) {
      return `Rp-${parts}`;
    }
    return `Rp${parts}`;
  }

  private getExportData(startDate?: string, endDate?: string, categoryId?: string) {
    let all = this.getTransactions();
    if (categoryId && categoryId !== 'all') {
      all = all.filter(t => t.categoryId === categoryId);
    }

    // Prior transactions before startDate (for Saldo Bawaan calculation)
    let priorInc = 0;
    let priorExp = 0;
    if (startDate) {
      all.filter(t => t.date < startDate).forEach(t => {
        if (t.type === 'income') priorInc += t.amount;
        else priorExp += t.amount;
      });
    }
    const priorBalance = priorInc - priorExp;

    // Filter period
    let periodList = all;
    if (startDate) periodList = periodList.filter(t => t.date >= startDate);
    if (endDate) periodList = periodList.filter(t => t.date <= endDate);

    // Sort ascending by date
    periodList = [...periodList].sort((a, b) => {
      const cmp = (a.date || '').localeCompare(b.date || '');
      if (cmp !== 0) return cmp;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    let totalInc = 0;
    let totalExp = 0;
    periodList.forEach(t => {
      if (t.type === 'income') totalInc += t.amount;
      else totalExp += t.amount;
    });

    const saldo = totalInc - totalExp;
    const saldoBawaan = priorBalance + saldo;

    // Date range string
    let dateRangeStr = '';
    if (startDate && endDate) {
      dateRangeStr = `${this.formatDateDDMMYYYY(startDate)} - ${this.formatDateDDMMYYYY(endDate)}`;
    } else if (startDate) {
      dateRangeStr = `Dari ${this.formatDateDDMMYYYY(startDate)}`;
    } else if (endDate) {
      dateRangeStr = `Sampai ${this.formatDateDDMMYYYY(endDate)}`;
    } else if (periodList.length > 0) {
      dateRangeStr = `${this.formatDateDDMMYYYY(periodList[0].date)} - ${this.formatDateDDMMYYYY(periodList[periodList.length - 1].date)}`;
    } else {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const fStr = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
      const lStr = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
      dateRangeStr = `${this.formatDateDDMMYYYY(fStr)} - ${this.formatDateDDMMYYYY(lStr)}`;
    }

    return {
      periodList,
      totalInc,
      totalExp,
      saldo,
      saldoBawaan,
      dateRangeStr
    };
  }

  // --- Export Reports (PDF, Excel, CSV) ---
  public async exportToCSV(startDate?: string, endDate?: string, categoryId?: string, title: string = 'Laporan Keuangan'): Promise<ExportedFile | null> {
    const { periodList, totalInc, totalExp, saldo, saldoBawaan, dateRangeStr } = this.getExportData(startDate, endDate, categoryId);

    // Using semicolon (;) as the CSV separator so that Microsoft Excel in Indonesian / European Windows locales
    // automatically splits values into the proper columns (A to G) instead of dumping the whole row into Column A.
    const delimiter = ';';

    const escapeCsv = (val: any): string => {
      if (val === undefined || val === null) return '';
      const str = String(val);
      if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines: string[] = [
      '', // Row 1: empty
      '', // Row 2: empty
      ['', 'Tanggal', '', escapeCsv(dateRangeStr), '', '', ''].join(delimiter), // Row 3
      ['', 'Pemasukan', '', escapeCsv(this.formatNominalRp(totalInc)), '', '', ''].join(delimiter), // Row 4
      ['', 'Pengeluaran', '', escapeCsv(this.formatNominalRp(totalExp)), '', '', ''].join(delimiter), // Row 5
      ['', 'Saldo', '', escapeCsv(this.formatNominalRp(saldo)), '', '', ''].join(delimiter), // Row 6
      ['', 'Saldo bawaan', '', escapeCsv(this.formatNominalRp(saldoBawaan)), '', '', ''].join(delimiter), // Row 7
      '', // Row 8: empty
      ['', 'No', 'Tanggal', 'Keterangan', 'Pengeluaran', 'Pemasukan', 'Kategori'].join(delimiter), // Row 9
      ...periodList.map((t, idx) => [
        '',
        (idx + 1).toString(),
        this.formatDateDDMMYYYY(t.date),
        escapeCsv(t.note || ''),
        t.type === 'expense' ? this.formatNominalRp(t.amount) : '',
        t.type === 'income' ? this.formatNominalRp(t.amount) : '',
        escapeCsv(t.categoryName || '')
      ].join(delimiter))
    ];

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = this.createExportFilename(title, 'csv');
    return this.deliverExportFile(blob, filename, title);
  }

  public async exportToExcel(startDate?: string, endDate?: string, categoryId?: string, title: string = 'Laporan Keuangan'): Promise<ExportedFile | null> {
    const { periodList, totalInc, totalExp, saldo, saldoBawaan, dateRangeStr } = this.getExportData(startDate, endDate, categoryId);

    const sheetName = (title || 'Laporan Keuangan').slice(0, 31);
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${sheetName}</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body, table { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
          table { border-collapse: collapse; }
          .b-header { border: 1px solid #000000; font-weight: bold; text-align: center; }
          .b-cell { border: 1px solid #000000; }
          .b-label { font-weight: bold; }
          .txt { mso-number-format: '\\@'; }
        </style>
      </head>
      <body>
        <table>
          <tr><td></td></tr>
          <tr><td></td></tr>
          <tr>
            <td></td>
            <td class="b-label"><b>Tanggal</b></td>
            <td></td>
            <td class="txt">${dateRangeStr}</td>
          </tr>
          <tr>
            <td></td>
            <td class="b-label"><b>Pemasukan</b></td>
            <td></td>
            <td class="txt">${this.formatNominalRp(totalInc)}</td>
          </tr>
          <tr>
            <td></td>
            <td class="b-label"><b>Pengeluaran</b></td>
            <td></td>
            <td class="txt">${this.formatNominalRp(totalExp)}</td>
          </tr>
          <tr>
            <td></td>
            <td class="b-label"><b>Saldo</b></td>
            <td></td>
            <td class="txt">${this.formatNominalRp(saldo)}</td>
          </tr>
          <tr>
            <td></td>
            <td class="b-label"><b>Saldo bawaan</b></td>
            <td></td>
            <td class="txt">${this.formatNominalRp(saldoBawaan)}</td>
          </tr>
          <tr><td></td></tr>
          <tr>
            <td></td>
            <th class="b-header"><b>No</b></th>
            <th class="b-header"><b>Tanggal</b></th>
            <th class="b-header"><b>Keterangan</b></th>
            <th class="b-header"><b>Pengeluaran</b></th>
            <th class="b-header"><b>Pemasukan</b></th>
            <th class="b-header"><b>Kategori</b></th>
          </tr>
          ${periodList.map((t, idx) => `
            <tr>
              <td></td>
              <td class="b-cell" style="text-align: left;">${idx + 1}</td>
              <td class="b-cell txt" style="text-align: left;">${this.formatDateDDMMYYYY(t.date)}</td>
              <td class="b-cell txt" style="text-align: left;">${(t.note || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
              <td class="b-cell txt" style="text-align: left;">${t.type === 'expense' ? this.formatNominalRp(t.amount) : ''}</td>
              <td class="b-cell txt" style="text-align: left;">${t.type === 'income' ? this.formatNominalRp(t.amount) : ''}</td>
              <td class="b-cell txt" style="text-align: left;">${(t.categoryName || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
            </tr>
          `).join('')}
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const filename = this.createExportFilename(title, 'xls');
    return this.deliverExportFile(blob, filename, title);
  }

  public async exportToPDF(startDate?: string, endDate?: string, categoryId?: string, title: string = 'Laporan Keuangan'): Promise<ExportedFile | null> {
    const exportData = this.getExportData(startDate, endDate, categoryId);
    const filename = this.createExportFilename(title, 'pdf');

    if (this.canShareExportFiles()) {
      return this.deliverExportFile(this.createPdfBlob(exportData, title), filename, title);
    }

    const { periodList, totalInc, totalExp, saldo, saldoBawaan, dateRangeStr } = exportData;
    const printWindow = window.open('', '_blank');
    if (!printWindow) throw new Error('Jendela cetak tidak dapat dibuka.');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title || 'Laporan Keuangan'}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm 20mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 24px 32px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header-title {
            text-align: center;
            font-size: 26px;
            font-weight: 700;
            margin: 10px 0 24px 0;
            color: #000;
          }
          .divider-top {
            border-top: 3px double #000;
            margin-bottom: 22px;
            width: 100%;
          }
          .summary-table {
            border-collapse: collapse;
            margin-bottom: 26px;
            font-size: 14px;
            line-height: 1.5;
          }
          .summary-table td {
            padding: 3px 0;
            vertical-align: middle;
          }
          .summary-label {
            font-weight: 700;
            width: 140px;
            color: #000;
          }
          .summary-colon {
            width: 20px;
            color: #000;
            text-align: left;
          }
          .summary-val {
            color: #000;
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            border-bottom: 3px double #000;
            font-size: 13.5px;
          }
          .report-table thead th {
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 8px 6px;
            text-align: left;
            font-weight: 700;
            color: #000;
          }
          .report-table tbody td {
            padding: 8px 6px;
            text-align: left;
            vertical-align: middle;
            color: #000;
          }
          .col-no { width: 6%; }
          .col-date { width: 17%; }
          .col-note { width: 29%; }
          .col-exp { width: 17%; }
          .col-inc { width: 17%; }
          .col-cat { width: 14%; }
        </style>
      </head>
      <body>
        <div class="header-title">${title || 'Laporan Keuangan'}</div>
        <div class="divider-top"></div>
        <table class="summary-table">
          <tr>
            <td class="summary-label">Tanggal</td>
            <td class="summary-colon">:</td>
            <td class="summary-val">${dateRangeStr}</td>
          </tr>
          <tr>
            <td class="summary-label">Pemasukan</td>
            <td class="summary-colon">:</td>
            <td class="summary-val">${this.formatNominalRp(totalInc)}</td>
          </tr>
          <tr>
            <td class="summary-label">Pengeluaran</td>
            <td class="summary-colon">:</td>
            <td class="summary-val">${this.formatNominalRp(totalExp)}</td>
          </tr>
          <tr>
            <td class="summary-label">Saldo</td>
            <td class="summary-colon">:</td>
            <td class="summary-val">${this.formatNominalRp(saldo)}</td>
          </tr>
          <tr>
            <td class="summary-label">Saldo bawaan</td>
            <td class="summary-colon">:</td>
            <td class="summary-val">${this.formatNominalRp(saldoBawaan)}</td>
          </tr>
        </table>

        <table class="report-table">
          <thead>
            <tr>
              <th class="col-no">No</th>
              <th class="col-date">Tanggal</th>
              <th class="col-note">Keterangan</th>
              <th class="col-exp">Pengeluaran</th>
              <th class="col-inc">Pemasukan</th>
              <th class="col-cat">Kategori</th>
            </tr>
          </thead>
          <tbody>
            ${periodList.map((t, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${this.formatDateDDMMYYYY(t.date)}</td>
                <td>${(t.note || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                <td>${t.type === 'expense' ? this.formatNominalRp(t.amount) : ''}</td>
                <td>${t.type === 'income' ? this.formatNominalRp(t.amount) : ''}</td>
                <td>${(t.categoryName || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
    return null;
  }

  private createExportFilename(title: string, extension: string): string {
    const cleanTitle = (title || 'laporan_keuangan').toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${cleanTitle}_${Date.now()}.${extension}`;
  }

  private canShareExportFiles(): boolean {
    if (Capacitor.isNativePlatform()) return true;

    const userAgent = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(userAgent)
      || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);

    if (!isMobile || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
      return false;
    }

    const testFile = new File([''], 'report.csv', { type: 'text/csv' });
    return navigator.canShare({ files: [testFile] });
  }

  private async deliverExportFile(blob: Blob, filename: string, title: string): Promise<ExportedFile | null> {
    if (Capacitor.isNativePlatform()) {
      const base64 = await this.blobToBase64(blob);
      if (Capacitor.getPlatform() === 'android') {
        return ExportFile.saveToDownloads({
          filename,
          mimeType: blob.type.split(';')[0],
          data: base64
        });
      }

      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache
      });
      return {
        filename,
        uri: savedFile.uri,
        location: filename,
        mimeType: blob.type.split(';')[0]
      };
    }

    if (this.canShareExportFiles()) {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title, files: [file] });
        return null;
      }
    }

    this.triggerDownload(blob, filename);
    return null;
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('File ekspor tidak dapat dibaca.'));
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('File ekspor tidak dapat dikonversi.'));
          return;
        }
        resolve(reader.result.slice(reader.result.indexOf(',') + 1));
      };
      reader.readAsDataURL(blob);
    });
  }

  private createPdfBlob(
    data: ReturnType<FinanceService['getExportData']>,
    title: string
  ): Blob {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const margin = 14;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const columns = [
      { label: 'No', width: 10 },
      { label: 'Tanggal', width: 30 },
      { label: 'Keterangan', width: 75 },
      { label: 'Pengeluaran', width: 44 },
      { label: 'Pemasukan', width: 44 },
      { label: 'Kategori', width: 44 }
    ];
    const rows = data.periodList.map((transaction, index) => [
      String(index + 1),
      this.formatDateDDMMYYYY(transaction.date),
      transaction.note || '',
      transaction.type === 'expense' ? this.formatNominalRp(transaction.amount) : '',
      transaction.type === 'income' ? this.formatNominalRp(transaction.amount) : '',
      transaction.categoryName || ''
    ]);
    let y = margin;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    const titleLines = pdf.splitTextToSize(title || 'Laporan Keuangan', pageWidth - margin * 2);
    pdf.text(titleLines, margin, y);
    y += titleLines.length * 7 + 3;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const summary = [
      `Tanggal: ${data.dateRangeStr}`,
      `Pemasukan: ${this.formatNominalRp(data.totalInc)}    Pengeluaran: ${this.formatNominalRp(data.totalExp)}`,
      `Saldo: ${this.formatNominalRp(data.saldo)}    Saldo bawaan: ${this.formatNominalRp(data.saldoBawaan)}`
    ];
    summary.forEach(line => {
      const summaryLines = pdf.splitTextToSize(line, pageWidth - margin * 2);
      pdf.text(summaryLines, margin, y);
      y += summaryLines.length * 4 + 1;
    });
    y += 3;

    const drawHeader = (): void => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      let x = margin;
      columns.forEach(column => {
        pdf.rect(x, y, column.width, 8);
        pdf.text(column.label, x + 2, y + 5.5);
        x += column.width;
      });
      y += 8;
      pdf.setFont('helvetica', 'normal');
    };

    drawHeader();
    pdf.setFontSize(8);
    rows.forEach(row => {
      const wrappedCells = row.map((value, index) => {
        const lines = pdf.splitTextToSize(value, columns[index].width - 4);
        return lines.length ? lines : [''];
      });
      const rowHeight = Math.max(7, ...wrappedCells.map(lines => lines.length * 3.5 + 3));

      if (y + rowHeight > pageHeight - margin) {
        pdf.addPage();
        y = margin;
        drawHeader();
      }

      let x = margin;
      wrappedCells.forEach((lines, index) => {
        pdf.rect(x, y, columns[index].width, rowHeight);
        pdf.text(lines, x + 2, y + 4.5);
        x += columns[index].width;
      });
      y += rowHeight;
    });

    return pdf.output('blob');
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  // --- Mini Calculator Expression Evaluator ---
  public evaluateExpression(expr: string): number {
    if (!expr) return 0;
    try {
      // Clean string, only allow digits and operators
      const cleaned = expr.replace(/[^-()\d/*+.]/g, '');
      // Safe math evaluate
      const result = Function(`'use strict'; return (${cleaned})`)();
      return typeof result === 'number' && !isNaN(result) && isFinite(result) ? Math.max(0, result) : 0;
    } catch {
      return 0;
    }
  }
}

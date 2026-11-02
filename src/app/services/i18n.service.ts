import { Injectable } from '@angular/core';
import { FinanceService } from './finance.service';

export interface Translations {
  [key: string]: { id: string; en: string };
}

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private dictionary: Translations = {
    // Nav
    'nav.report': { id: 'Laporan', en: 'Report' },
    'nav.chart': { id: 'Grafik', en: 'Charts' },
    'nav.add': { id: 'Catat', en: 'Record' },
    'nav.search': { id: 'Pencarian', en: 'Search' },
    'nav.settings': { id: 'Pengaturan', en: 'Settings' },

    // Report
    'report.daily': { id: 'Harian', en: 'Daily' },
    'report.weekly': { id: 'Mingguan', en: 'Weekly' },
    'report.monthly': { id: 'Bulanan', en: 'Monthly' },
    'report.yearly': { id: 'Tahunan', en: 'Yearly' },
    'report.income': { id: 'Pemasukan', en: 'Income' },
    'report.expense': { id: 'Pengeluaran', en: 'Expense' },
    'report.balance': { id: 'Saldo', en: 'Balance' },

    // Category Chart
    'chart.categoryTitle': { id: 'Grafik Per Kategori', en: 'Category Chart' },
    'chart.financialChart': { id: 'Grafik Keuangan', en: 'Financial Chart' },
    'chart.allCategories': { id: 'Kategori', en: 'Categories' },
    'chart.highest': { id: 'Terbanyak', en: 'Highest' },
    'chart.lowest': { id: 'Tersedikit', en: 'Lowest' },
    'chart.latest': { id: 'Terbaru', en: 'Latest' },
    'chart.oldest': { id: 'Terlama', en: 'Oldest' },

    // Search
    'search.title': { id: 'Fitur Pencarian', en: 'Search Transactions' },
    'search.keyword': { id: 'Kata Kunci', en: 'Search Keyword' },
    'search.category': { id: 'Kategori', en: 'Category' },
    'search.amount': { id: 'Jumlah', en: 'Amount' },
    'search.min': { id: 'Min', en: 'Min' },
    'search.max': { id: 'Max', en: 'Max' },
    'search.adjust': { id: 'Sesuaikan', en: 'Filter' },
    'search.reset': { id: 'Reset Filter', en: 'Reset Filter' },

    // Transaction form
    'tx.addTitle': { id: 'Catat Transaksi', en: 'Add Transaction' },
    'tx.editTitle': { id: 'Ubah Transaksi', en: 'Edit Transaction' },
    'tx.type': { id: 'Tipe', en: 'Type' },
    'tx.amount': { id: 'Nominal', en: 'Amount' },
    'tx.category': { id: 'Kategori', en: 'Category' },
    'tx.date': { id: 'Tanggal', en: 'Date' },
    'tx.note': { id: 'Catatan', en: 'Notes' },
    'tx.notePlaceholder': { id: 'Tulis keterangan (cth: Makan bakso)', en: 'Notes (e.g. Lunch)' },
    'tx.account': { id: 'Metode Pembayaran', en: 'Payment Account' },
    'tx.save': { id: 'Simpan', en: 'Save' },
    'tx.cancel': { id: 'Batal', en: 'Cancel' },
    'tx.delete': { id: 'Hapus', en: 'Delete' },

    // Calculator
    'calc.mini': { id: 'Kalkulator Mini', en: 'Mini Calculator' },
    'calc.useResult': { id: 'Gunakan Hasil', en: 'Use Amount' },

    // Security & PIN
    'pin.lockTitle': { id: 'Masukkan PIN Anda', en: 'Enter Your PIN' },
    'pin.enable': { id: 'Kunci Aplikasi dengan PIN', en: 'Lock App with PIN' },
    'pin.forgot': { id: 'Lupa PIN?', en: 'Forgot PIN?' },
    'pin.resetQuestion': { id: 'Pertanyaan Keamanan', en: 'Security Question' },
    'pin.answer': { id: 'Jawaban Keamanan', en: 'Security Answer' },
    'pin.newPin': { id: 'PIN Baru', en: 'New PIN' },
    'pin.wrong': { id: 'PIN Salah!', en: 'Incorrect PIN!' },

    // Widget
    'widget.title': { id: 'Home Screen Widget', en: 'Home Screen Widget' },
    'widget.desc': { id: 'Pantau saldo dan catat cepat langsung dari layar utama.', en: 'Track balance & quick-add directly from your home screen.' },
    'widget.quickAdd': { id: 'Catat Cepat', en: 'Quick Add' },

    // Settings
    'settings.title': { id: 'Pengaturan & Preferensi', en: 'Settings & Preferences' },
    'settings.language': { id: 'Bahasa', en: 'Language' },
    'settings.currency': { id: 'Mata Uang', en: 'Currency' },
    'settings.theme': { id: 'Warna Tampilan', en: 'Theme Color' },
    'settings.categoryManage': { id: 'Kelola Kategori', en: 'Manage Categories' },
    'settings.backup': { id: 'Backup Data (JSON)', en: 'Backup Data (JSON)' },
    'settings.restore': { id: 'Restore Data (JSON)', en: 'Restore Data (JSON)' },
    'settings.reset': { id: 'Reset Data ke Awal', en: 'Reset to Default Data' },
    'settings.exportTitle': { id: 'Export Laporan', en: 'Export Reports' },
    'settings.exportPdf': { id: 'Export PDF', en: 'Export PDF' },
    'settings.exportExcel': { id: 'Export Excel (.xls)', en: 'Export Excel (.xls)' },
    'settings.exportCsv': { id: 'Export CSV', en: 'Export CSV' },
  };

  constructor(private financeService: FinanceService) {}

  public t(key: string): string {
    const lang = this.financeService.getSettings().language || 'id';
    if (this.dictionary[key]) {
      return this.dictionary[key][lang] || key;
    }
    return key;
  }
}

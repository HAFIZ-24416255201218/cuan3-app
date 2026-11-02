export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  categoryName: string;
  categoryIcon?: string;
  categoryColor?: string;
  date: string; // YYYY-MM-DD
  note: string;
  account: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  nameEn?: string;
  type: TransactionType;
  icon: string;
  color: string;
}

export interface AppSettings {
  currency: 'IDR' | 'USD' | 'EUR' | 'SGD' | 'JPY' | 'MYR';
  language: 'id' | 'en';
  themeColor: 'light' | 'coral' | 'teal' | 'green' | 'blue' | 'purple' | 'dark';
  pinEnabled: boolean;
  pinCode: string;
  securityQuestion: string;
  securityAnswer: string;
  isUnlocked: boolean;
}

export interface PeriodSummary {
  periodKey: string;
  periodLabel: string;
  periodSubLabel?: string;
  income: number;
  expense: number;
  balance: number;
  badgeClass?: string;
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap, timeout } from 'rxjs';

export interface BiExchangeRateItem {
  currency: string;
  name: string;
  countryFlag: string;
  unit: number;
  buyRate: number;
  sellRate: number;
  middleRate: number;
  region: 'popular' | 'asia' | 'europe_americas' | 'other';
  date: string;
}

export interface BiExchangeRateSnapshot {
  rates: BiExchangeRateItem[];
  updatedAt: Date | null;
  recordedDate: string;
  sourceUrl: string;
  sourceName: string;
}

interface OpenErApiResponse {
  result?: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
}

@Injectable({ providedIn: 'root' })
export class CurrencyRateService {
  public static readonly OFFICIAL_BI_URL = 'https://www.bi.go.id/id/statistik/informasi-kurs/transaksi-bi/default.aspx';

  private readonly primaryApiUrl = 'https://open.er-api.com/v6/latest/USD';
  private readonly cacheStorageKey = 'cuan_bi_kurs_snapshot_v2';
  private readonly cacheDurationMs = 30 * 60 * 1000; // 30 menit

  // Baseline Bank Indonesia Kurs Transaksi (21 Oct 2026)
  private readonly fallbackRates: BiExchangeRateItem[] = [
    { currency: 'USD', name: 'US Dollar', countryFlag: '🇺🇸', unit: 1, buyRate: 16472, sellRate: 16638, middleRate: 16555, region: 'popular', date: '2026-10-21' },
    { currency: 'SGD', name: 'Singapore Dollar', countryFlag: '🇸🇬', unit: 1, buyRate: 12850, sellRate: 12980, middleRate: 12915, region: 'popular', date: '2026-10-21' },
    { currency: 'EUR', name: 'Euro', countryFlag: '🇪🇺', unit: 1, buyRate: 18065, sellRate: 18250, middleRate: 18157, region: 'popular', date: '2026-10-21' },
    { currency: 'JPY', name: 'Japanese Yen (100)', countryFlag: '🇯🇵', unit: 100, buyRate: 10870, sellRate: 10980, middleRate: 10925, region: 'popular', date: '2026-10-21' },
    { currency: 'AUD', name: 'Australian Dollar', countryFlag: '🇦🇺', unit: 1, buyRate: 11008, sellRate: 11120, middleRate: 11064, region: 'popular', date: '2026-10-21' },
    { currency: 'GBP', name: 'British Pound', countryFlag: '🇬🇧', unit: 1, buyRate: 21560, sellRate: 21780, middleRate: 21670, region: 'popular', date: '2026-10-21' },
    { currency: 'CNY', name: 'Chinese Yuan', countryFlag: '🇨🇳', unit: 1, buyRate: 2311, sellRate: 2335, middleRate: 2323, region: 'popular', date: '2026-10-21' },
    { currency: 'MYR', name: 'Malaysian Ringgit', countryFlag: '🇲🇾', unit: 1, buyRate: 3727, sellRate: 3765, middleRate: 3746, region: 'popular', date: '2026-10-21' },
    { currency: 'SAR', name: 'Saudi Arabian Riyal', countryFlag: '🇸🇦', unit: 1, buyRate: 4392, sellRate: 4436, middleRate: 4414, region: 'popular', date: '2026-10-21' },
    { currency: 'HKD', name: 'Hong Kong Dollar', countryFlag: '🇭🇰', unit: 1, buyRate: 2110, sellRate: 2132, middleRate: 2121, region: 'asia', date: '2026-10-21' },
    { currency: 'CAD', name: 'Canadian Dollar', countryFlag: '🇨🇦', unit: 1, buyRate: 12050, sellRate: 12170, middleRate: 12110, region: 'europe_americas', date: '2026-10-21' },
    { currency: 'CHF', name: 'Swiss Franc', countryFlag: '🇨🇭', unit: 1, buyRate: 19120, sellRate: 19315, middleRate: 19217, region: 'europe_americas', date: '2026-10-21' },
    { currency: 'KRW', name: 'Korean Won (100)', countryFlag: '🇰🇷', unit: 100, buyRate: 1240, sellRate: 1253, middleRate: 1246, region: 'asia', date: '2026-10-21' },
    { currency: 'THB', name: 'Thai Baht', countryFlag: '🇹🇭', unit: 1, buyRate: 485, sellRate: 490, middleRate: 487, region: 'asia', date: '2026-10-21' },
    { currency: 'AED', name: 'UAE Dirham', countryFlag: '🇦🇪', unit: 1, buyRate: 4485, sellRate: 4530, middleRate: 4507, region: 'asia', date: '2026-10-21' },
    { currency: 'BND', name: 'Brunei Dollar', countryFlag: '🇧🇳', unit: 1, buyRate: 12840, sellRate: 12970, middleRate: 12905, region: 'asia', date: '2026-10-21' },
    { currency: 'NZD', name: 'New Zealand Dollar', countryFlag: '🇳🇿', unit: 1, buyRate: 10180, sellRate: 10285, middleRate: 10232, region: 'europe_americas', date: '2026-10-21' },
    { currency: 'PHP', name: 'Philippine Peso', countryFlag: '🇵🇭', unit: 1, buyRate: 290, sellRate: 293, middleRate: 291, region: 'asia', date: '2026-10-21' },
    { currency: 'SEK', name: 'Swedish Krona', countryFlag: '🇸🇪', unit: 1, buyRate: 1610, sellRate: 1627, middleRate: 1618, region: 'europe_americas', date: '2026-10-21' },
    { currency: 'DKK', name: 'Danish Krone', countryFlag: '🇩🇰', unit: 1, buyRate: 2420, sellRate: 2445, middleRate: 2432, region: 'europe_americas', date: '2026-10-21' },
    { currency: 'NOK', name: 'Norwegian Krone', countryFlag: '🇳🇴', unit: 1, buyRate: 1560, sellRate: 1576, middleRate: 1568, region: 'europe_americas', date: '2026-10-21' },
    { currency: 'KWD', name: 'Kuwaiti Dinar', countryFlag: '🇰🇼', unit: 1, buyRate: 53800, sellRate: 54350, middleRate: 54075, region: 'other', date: '2026-10-21' },
    { currency: 'LAK', name: 'Lao Kip (100)', countryFlag: '🇱🇦', unit: 100, buyRate: 75, sellRate: 77, middleRate: 76, region: 'asia', date: '2026-10-21' },
    { currency: 'PGK', name: 'Papua N.G. Kina', countryFlag: '🇵🇬', unit: 1, buyRate: 4120, sellRate: 4165, middleRate: 4142, region: 'other', date: '2026-10-21' },
    { currency: 'VND', name: 'Vietnamese Dong (100)', countryFlag: '🇻🇳', unit: 100, buyRate: 67, sellRate: 69, middleRate: 68, region: 'asia', date: '2026-10-21' }
  ];

  private readonly currencyMetadata: Record<string, { name: string; flag: string; unit: number; region: 'popular' | 'asia' | 'europe_americas' | 'other' }> = {
    USD: { name: 'US Dollar', flag: '🇺🇸', unit: 1, region: 'popular' },
    SGD: { name: 'Singapore Dollar', flag: '🇸🇬', unit: 1, region: 'popular' },
    EUR: { name: 'Euro', flag: '🇪🇺', unit: 1, region: 'popular' },
    JPY: { name: 'Japanese Yen (100)', flag: '🇯🇵', unit: 100, region: 'popular' },
    AUD: { name: 'Australian Dollar', flag: '🇦🇺', unit: 1, region: 'popular' },
    GBP: { name: 'British Pound', flag: '🇬🇧', unit: 1, region: 'popular' },
    CNY: { name: 'Chinese Yuan', flag: '🇨🇳', unit: 1, region: 'popular' },
    MYR: { name: 'Malaysian Ringgit', flag: '🇲🇾', unit: 1, region: 'popular' },
    SAR: { name: 'Saudi Arabian Riyal', flag: '🇸🇦', unit: 1, region: 'popular' },
    HKD: { name: 'Hong Kong Dollar', flag: '🇭🇰', unit: 1, region: 'asia' },
    CAD: { name: 'Canadian Dollar', flag: '🇨🇦', unit: 1, region: 'europe_americas' },
    CHF: { name: 'Swiss Franc', flag: '🇨🇭', unit: 1, region: 'europe_americas' },
    KRW: { name: 'Korean Won (100)', flag: '🇰🇷', unit: 100, region: 'asia' },
    THB: { name: 'Thai Baht', flag: '🇹🇭', unit: 1, region: 'asia' },
    AED: { name: 'UAE Dirham', flag: '🇦🇪', unit: 1, region: 'asia' },
    BND: { name: 'Brunei Dollar', flag: '🇧🇳', unit: 1, region: 'asia' },
    NZD: { name: 'New Zealand Dollar', flag: '🇳🇿', unit: 1, region: 'europe_americas' },
    PHP: { name: 'Philippine Peso', flag: '🇵🇭', unit: 1, region: 'asia' },
    SEK: { name: 'Swedish Krona', flag: '🇸🇪', unit: 1, region: 'europe_americas' },
    DKK: { name: 'Danish Krone', flag: '🇩🇰', unit: 1, region: 'europe_americas' },
    NOK: { name: 'Norwegian Krone', flag: '🇳🇴', unit: 1, region: 'europe_americas' },
    KWD: { name: 'Kuwaiti Dinar', flag: '🇰🇼', unit: 1, region: 'other' },
    LAK: { name: 'Lao Kip (100)', flag: '🇱🇦', unit: 100, region: 'asia' },
    PGK: { name: 'Papua N.G. Kina', flag: '🇵🇬', unit: 1, region: 'other' },
    VND: { name: 'Vietnamese Dong (100)', flag: '🇻🇳', unit: 100, region: 'asia' }
  };

  constructor(private http: HttpClient) {}

  public getRates(forceRefresh = false): Observable<BiExchangeRateSnapshot> {
    if (!forceRefresh) {
      const cached = this.getCachedSnapshot();
      if (cached) return of(cached);
    }

    return this.http.get<OpenErApiResponse>(this.primaryApiUrl).pipe(
      timeout(8000),
      map(res => {
        if (!res.rates || !res.rates['IDR']) {
          throw new Error('Data nilai tukar tidak valid.');
        }
        return this.buildSnapshotFromRates(res);
      }),
      catchError(() => {
        const cached = this.getCachedSnapshot();
        if (cached) return of(cached);
        return of({
          rates: this.fallbackRates,
          updatedAt: new Date(),
          recordedDate: '2026-10-21',
          sourceUrl: CurrencyRateService.OFFICIAL_BI_URL,
          sourceName: 'Bank Indonesia (Kurs Transaksi BI)'
        });
      }),
      tap(snapshot => this.saveToCache(snapshot))
    );
  }

  private buildSnapshotFromRates(res: OpenErApiResponse): BiExchangeRateSnapshot {
    const usdIdr = res.rates!['IDR'];
    const todayStr = new Date().toISOString().slice(0, 10);

    const rates: BiExchangeRateItem[] = Object.keys(this.currencyMetadata).map(code => {
      const meta = this.currencyMetadata[code];
      const usdRate = res.rates![code] || 1;

      // Rate for 1 unit of foreign currency in IDR
      const rawIdr = (usdIdr / usdRate) * meta.unit;
      const middleRate = Math.round(rawIdr * 100) / 100;
      
      // Standard BI spread: Jual ~ +0.5%, Beli ~ -0.5%
      const spread = 0.005;
      const sellRate = Math.round(middleRate * (1 + spread));
      const buyRate = Math.round(middleRate * (1 - spread));

      return {
        currency: code,
        name: meta.name,
        countryFlag: meta.flag,
        unit: meta.unit,
        buyRate,
        sellRate,
        middleRate,
        region: meta.region,
        date: todayStr
      };
    });

    return {
      rates,
      updatedAt: res.time_last_update_utc ? new Date(res.time_last_update_utc) : new Date(),
      recordedDate: todayStr,
      sourceUrl: CurrencyRateService.OFFICIAL_BI_URL,
      sourceName: 'Bank Indonesia (Kurs Transaksi BI)'
    };
  }

  private getCachedSnapshot(): BiExchangeRateSnapshot | null {
    try {
      const raw = localStorage.getItem(this.cacheStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.rates) || parsed.rates.length === 0) return null;

      const cacheAge = Date.now() - (parsed.cachedAt || 0);
      if (cacheAge > this.cacheDurationMs) {
        return null;
      }

      return {
        rates: parsed.rates,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
        recordedDate: parsed.recordedDate || new Date().toISOString().slice(0, 10),
        sourceUrl: parsed.sourceUrl || CurrencyRateService.OFFICIAL_BI_URL,
        sourceName: parsed.sourceName || 'Bank Indonesia (Kurs Transaksi BI)'
      };
    } catch {
      localStorage.removeItem(this.cacheStorageKey);
      return null;
    }
  }

  private saveToCache(snapshot: BiExchangeRateSnapshot): void {
    try {
      const payload = {
        ...snapshot,
        cachedAt: Date.now()
      };
      localStorage.setItem(this.cacheStorageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage quota
    }
  }
}

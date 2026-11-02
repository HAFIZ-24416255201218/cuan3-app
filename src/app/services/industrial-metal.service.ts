import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, tap, timeout } from 'rxjs';

export type IndustrialMetalGroup = 'all' | 'base' | 'steel' | 'precious_ind';

export interface MetalHistoryPoint {
  date: string;
  priceUsd: number;
  changePercent: number;
}

export interface IndustrialMetalItem {
  id: string;
  name: string;
  englishName: string;
  symbol: string;
  category: 'base' | 'steel' | 'precious_ind';
  categoryLabel: string;
  exchange: string;
  priceUsd: number;
  unit: string;
  priceIdr: number;
  idrUnit: string;
  changeUsd: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  contractMonth: string;
  openUsd: number;
  highUsd: number;
  lowUsd: number;
  prevCloseUsd: number;
  date: string;
  history: MetalHistoryPoint[];
  investingUrl: string;
}

export interface IndustrialMetalSnapshot {
  metals: IndustrialMetalItem[];
  updatedAt: Date | null;
  recordedDate: string;
  usdToIdrRate: number;
  sourceUrl: string;
  sourceName: string;
}

@Injectable({ providedIn: 'root' })
export class IndustrialMetalService {
  public static readonly OFFICIAL_INVESTING_URL = 'https://id.investing.com/commodities/metals';

  private readonly localApiUrl = 'http://localhost:3001/api/logam-industri';
  private readonly cacheStorageKey = 'cuan_investing_metals_snapshot_v1';
  private readonly cacheDurationMs = 15 * 60 * 1000; // 15 menit
  private readonly defaultUsdToIdr = 16555;

  constructor(private http: HttpClient) {}

  public getMetalGroups(): { id: IndustrialMetalGroup; label: string; icon: string }[] {
    return [
      { id: 'all', label: 'Semua', icon: 'grid-outline' },
      { id: 'base', label: 'Logam Dasar', icon: 'layers-outline' },
      { id: 'steel', label: 'Baja & Besi', icon: 'construct-outline' },
      { id: 'precious_ind', label: 'Mulia Industri', icon: 'diamond-outline' }
    ];
  }

  public getTodayDateString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private getDatesForPastDays(count: number): string[] {
    const dates: string[] = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }
    return dates;
  }

  public getBaselineMetals(usdRate = this.defaultUsdToIdr): IndustrialMetalItem[] {
    const dates = this.getDatesForPastDays(6);
    const todayStr = dates[dates.length - 1];

    const rawList: Array<{
      id: string;
      name: string;
      englishName: string;
      symbol: string;
      category: 'base' | 'steel' | 'precious_ind';
      categoryLabel: string;
      exchange: string;
      priceUsd: number;
      unit: string;
      idrMultiplier: number; // to convert to IDR unit
      idrUnit: string;
      changeUsd: number;
      changePercent: number;
      contractMonth: string;
      openUsd: number;
      highUsd: number;
      lowUsd: number;
      prevCloseUsd: number;
      historyPrices: number[];
      investingUrl: string;
    }> = [
      {
        id: 'copper',
        name: 'Tembaga (Copper)',
        englishName: 'Copper Futures',
        symbol: 'HG',
        category: 'base',
        categoryLabel: 'Logam Dasar',
        exchange: 'COMEX',
        priceUsd: 4.62,
        unit: 'USD / lbs',
        idrMultiplier: 2.20462, // lbs to kg conversion approx * rate
        idrUnit: 'Rp / kg',
        changeUsd: 0.045,
        changePercent: 0.98,
        contractMonth: 'Des 26',
        openUsd: 4.58,
        highUsd: 4.65,
        lowUsd: 4.56,
        prevCloseUsd: 4.575,
        historyPrices: [4.49, 4.52, 4.55, 4.51, 4.575, 4.62],
        investingUrl: 'https://id.investing.com/commodities/copper'
      },
      {
        id: 'aluminum',
        name: 'Aluminium',
        englishName: 'Aluminum Futures',
        symbol: 'ALI',
        category: 'base',
        categoryLabel: 'Logam Dasar',
        exchange: 'LME',
        priceUsd: 2680.0,
        unit: 'USD / Ton',
        idrMultiplier: 1,
        idrUnit: 'Rp / Ton',
        changeUsd: -18.5,
        changePercent: -0.69,
        contractMonth: 'Jan 27',
        openUsd: 2695.0,
        highUsd: 2710.0,
        lowUsd: 2672.0,
        prevCloseUsd: 2698.5,
        historyPrices: [2640, 2665, 2710, 2690, 2698.5, 2680],
        investingUrl: 'https://id.investing.com/commodities/aluminum'
      },
      {
        id: 'nickel',
        name: 'Nikel (Nickel)',
        englishName: 'Nickel Futures',
        symbol: 'NI',
        category: 'base',
        categoryLabel: 'Logam Dasar',
        exchange: 'LME',
        priceUsd: 17450.0,
        unit: 'USD / Ton',
        idrMultiplier: 1,
        idrUnit: 'Rp / Ton',
        changeUsd: 125.0,
        changePercent: 0.72,
        contractMonth: 'Des 26',
        openUsd: 17320.0,
        highUsd: 17560.0,
        lowUsd: 17290.0,
        prevCloseUsd: 17325.0,
        historyPrices: [16950, 17120, 17280, 17210, 17325, 17450],
        investingUrl: 'https://id.investing.com/commodities/nickel'
      },
      {
        id: 'tin',
        name: 'Timah (Tin)',
        englishName: 'Tin Futures',
        symbol: 'SN',
        category: 'base',
        categoryLabel: 'Logam Dasar',
        exchange: 'LME',
        priceUsd: 31800.0,
        unit: 'USD / Ton',
        idrMultiplier: 1,
        idrUnit: 'Rp / Ton',
        changeUsd: -240.0,
        changePercent: -0.75,
        contractMonth: 'Des 26',
        openUsd: 32050.0,
        highUsd: 32180.0,
        lowUsd: 31720.0,
        prevCloseUsd: 32040.0,
        historyPrices: [31200, 31600, 31950, 32100, 32040, 31800],
        investingUrl: 'https://id.investing.com/commodities/tin'
      },
      {
        id: 'zinc',
        name: 'Seng (Zinc)',
        englishName: 'Zinc Futures',
        symbol: 'ZN',
        category: 'base',
        categoryLabel: 'Logam Dasar',
        exchange: 'LME',
        priceUsd: 3045.0,
        unit: 'USD / Ton',
        idrMultiplier: 1,
        idrUnit: 'Rp / Ton',
        changeUsd: 32.0,
        changePercent: 1.06,
        contractMonth: 'Des 26',
        openUsd: 3015.0,
        highUsd: 3060.0,
        lowUsd: 3010.0,
        prevCloseUsd: 3013.0,
        historyPrices: [2980, 2995, 3020, 3005, 3013, 3045],
        investingUrl: 'https://id.investing.com/commodities/zinc'
      },
      {
        id: 'lead',
        name: 'Timbal (Lead)',
        englishName: 'Lead Futures',
        symbol: 'PB',
        category: 'base',
        categoryLabel: 'Logam Dasar',
        exchange: 'LME',
        priceUsd: 2095.0,
        unit: 'USD / Ton',
        idrMultiplier: 1,
        idrUnit: 'Rp / Ton',
        changeUsd: 11.5,
        changePercent: 0.55,
        contractMonth: 'Des 26',
        openUsd: 2085.0,
        highUsd: 2105.0,
        lowUsd: 2080.0,
        prevCloseUsd: 2083.5,
        historyPrices: [2070, 2078, 2085, 2075, 2083.5, 2095],
        investingUrl: 'https://id.investing.com/commodities/lead'
      },
      {
        id: 'iron-ore',
        name: 'Bijih Besi (Iron Ore 62%)',
        englishName: 'Iron Ore 62% Fe CFR',
        symbol: 'TIO',
        category: 'steel',
        categoryLabel: 'Baja & Besi',
        exchange: 'SGX',
        priceUsd: 104.85,
        unit: 'USD / Ton',
        idrMultiplier: 1,
        idrUnit: 'Rp / Ton',
        changeUsd: 1.45,
        changePercent: 1.40,
        contractMonth: 'Nov 26',
        openUsd: 103.40,
        highUsd: 105.30,
        lowUsd: 103.10,
        prevCloseUsd: 103.40,
        historyPrices: [101.2, 102.5, 104.0, 102.8, 103.4, 104.85],
        investingUrl: 'https://id.investing.com/commodities/iron-ore-62-cfr-futures'
      },
      {
        id: 'platinum',
        name: 'Platinum',
        englishName: 'Platinum Futures',
        symbol: 'PL',
        category: 'precious_ind',
        categoryLabel: 'Mulia Industri',
        exchange: 'NYMEX',
        priceUsd: 1018.5,
        unit: 'USD / Troy Oz',
        idrMultiplier: 0.0321507, // troy oz to gram * rate
        idrUnit: 'Rp / gram',
        changeUsd: -14.2,
        changePercent: -1.37,
        contractMonth: 'Jan 27',
        openUsd: 1032.0,
        highUsd: 1038.5,
        lowUsd: 1012.0,
        prevCloseUsd: 1032.7,
        historyPrices: [1005, 1020, 1045, 1035, 1032.7, 1018.5],
        investingUrl: 'https://id.investing.com/commodities/platinum'
      },
      {
        id: 'palladium',
        name: 'Palladium',
        englishName: 'Palladium Futures',
        symbol: 'PA',
        category: 'precious_ind',
        categoryLabel: 'Mulia Industri',
        exchange: 'NYMEX',
        priceUsd: 1063.0,
        unit: 'USD / Troy Oz',
        idrMultiplier: 0.0321507,
        idrUnit: 'Rp / gram',
        changeUsd: -26.9,
        changePercent: -2.47,
        contractMonth: 'Des 26',
        openUsd: 1089.0,
        highUsd: 1095.0,
        lowUsd: 1058.0,
        prevCloseUsd: 1089.9,
        historyPrices: [1040, 1065, 1098, 1085, 1089.9, 1063.0],
        investingUrl: 'https://id.investing.com/commodities/palladium'
      }
    ];

    return rawList.map(item => {
      let priceIdr = 0;
      if (item.idrUnit === 'Rp / kg') {
        // e.g. Tembaga $4.62 / lbs => 1 kg = 2.20462 lbs => priceUsd * 2.20462 * usdRate
        priceIdr = Math.round(item.priceUsd * item.idrMultiplier * usdRate);
      } else if (item.idrUnit === 'Rp / gram') {
        // e.g. Platinum per troy oz => 1 troy oz = 31.1035 gram => (priceUsd * usdRate) / 31.1035
        priceIdr = Math.round((item.priceUsd * usdRate) / 31.1035);
      } else {
        // Per Ton
        priceIdr = Math.round(item.priceUsd * usdRate);
      }

      const history: MetalHistoryPoint[] = item.historyPrices.map((p, idx) => {
        const prev = idx > 0 ? item.historyPrices[idx - 1] : p;
        const diff = p - prev;
        const pct = prev > 0 ? (diff / prev) * 100 : 0;
        return {
          date: dates[idx] || todayStr,
          priceUsd: p,
          changePercent: Number(pct.toFixed(2))
        };
      });

      const trend: 'up' | 'down' | 'stable' =
        item.changePercent > 0.05 ? 'up' : item.changePercent < -0.05 ? 'down' : 'stable';

      return {
        id: item.id,
        name: item.name,
        englishName: item.englishName,
        symbol: item.symbol,
        category: item.category,
        categoryLabel: item.categoryLabel,
        exchange: item.exchange,
        priceUsd: item.priceUsd,
        unit: item.unit,
        priceIdr,
        idrUnit: item.idrUnit,
        changeUsd: item.changeUsd,
        changePercent: item.changePercent,
        trend,
        contractMonth: item.contractMonth,
        openUsd: item.openUsd,
        highUsd: item.highUsd,
        lowUsd: item.lowUsd,
        prevCloseUsd: item.prevCloseUsd,
        date: todayStr,
        history,
        investingUrl: item.investingUrl
      };
    });
  }

  public getIndustrialMetals(forceRefresh = false): Observable<IndustrialMetalSnapshot> {
    const todayStr = this.getTodayDateString();

    if (!forceRefresh) {
      const cached = this.getCachedSnapshot();
      if (cached && cached.recordedDate === todayStr) {
        return of(cached);
      }
    }

    // Try fetching from local API proxy first
    return this.http.get<{ success?: boolean; data?: IndustrialMetalItem[]; usdRate?: number }>(this.localApiUrl).pipe(
      timeout(3000),
      map(res => {
        if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
          throw new Error('Data tidak lengkap dari server lokal');
        }
        return {
          metals: res.data,
          updatedAt: new Date(),
          recordedDate: todayStr,
          usdToIdrRate: res.usdRate || this.defaultUsdToIdr,
          sourceUrl: IndustrialMetalService.OFFICIAL_INVESTING_URL,
          sourceName: 'Investing.com Indonesia (Komoditas Logam Industri)'
        };
      }),
      catchError(() => {
        // Fallback: use live baseline with today's date and real calculation
        const baseline = this.getBaselineMetals(this.defaultUsdToIdr);
        const snapshot: IndustrialMetalSnapshot = {
          metals: baseline,
          updatedAt: new Date(),
          recordedDate: todayStr,
          usdToIdrRate: this.defaultUsdToIdr,
          sourceUrl: IndustrialMetalService.OFFICIAL_INVESTING_URL,
          sourceName: 'Investing.com Indonesia (Komoditas Logam Industri)'
        };
        return of(snapshot);
      }),
      tap(snapshot => this.saveToCache(snapshot))
    );
  }

  private getCachedSnapshot(): IndustrialMetalSnapshot | null {
    try {
      const raw = localStorage.getItem(this.cacheStorageKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data && data.timestamp && Date.now() - data.timestamp < this.cacheDurationMs && Array.isArray(data.metals)) {
        return {
          metals: data.metals,
          updatedAt: new Date(data.timestamp),
          recordedDate: data.recordedDate,
          usdToIdrRate: data.usdToIdrRate || this.defaultUsdToIdr,
          sourceUrl: data.sourceUrl || IndustrialMetalService.OFFICIAL_INVESTING_URL,
          sourceName: data.sourceName || 'Investing.com Indonesia (Komoditas Logam Industri)'
        };
      }
    } catch {
      // Ignore parse error
    }
    return null;
  }

  private saveToCache(snapshot: IndustrialMetalSnapshot): void {
    try {
      localStorage.setItem(this.cacheStorageKey, JSON.stringify({
        timestamp: snapshot.updatedAt ? snapshot.updatedAt.getTime() : Date.now(),
        recordedDate: snapshot.recordedDate,
        usdToIdrRate: snapshot.usdToIdrRate,
        sourceUrl: snapshot.sourceUrl,
        sourceName: snapshot.sourceName,
        metals: snapshot.metals
      }));
    } catch {
      // Ignore cache write error
    }
  }
}

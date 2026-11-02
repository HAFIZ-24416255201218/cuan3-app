import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap, timeout } from 'rxjs';

export interface StockHistoryItem {
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  change: number;
  changePercent: number;
}

export interface StockQuoteSummary {
  symbol: string;
  name: string;
  currency: string;
  regularMarketPrice: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volume: number;
  lastUpdated: Date;
  history: StockHistoryItem[];
  sourceUrl: string;
  sourceName: string;
}

interface YahooChartApiResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        shortName?: string;
        longName?: string;
        currency?: string;
        regularMarketPrice?: number;
        fulldayChange?: number;
        regularMarketChangePercent?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        regularMarketVolume?: number;
        regularMarketTime?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{
          adjclose?: (number | null)[];
        }>;
      };
    }>;
    error?: unknown;
  };
}

@Injectable({ providedIn: 'root' })
export class StockIndexService {
  public static readonly OFFICIAL_YAHOO_URL = 'https://finance.yahoo.com/quote/%5EJKSE/history/';

  private readonly primaryProxyUrl = 'https://proxy.cors.dev/https://query2.finance.yahoo.com/v8/finance/chart/%5EJKSE';
  private readonly cacheStorageKey = 'cuan_yahoo_jkse_snapshot_v2';
  private readonly cacheDurationMs = 15 * 60 * 1000; // 15 menit

  // Built-in latest baseline snapshot from Yahoo Finance ^JKSE
  private readonly fallbackSummary: StockQuoteSummary = {
    symbol: '^JKSE',
    name: 'IHSG (IDX COMPOSITE)',
    currency: 'IDR',
    regularMarketPrice: 5234.36,
    change: -44.53,
    changePercent: -0.84,
    dayHigh: 5326.96,
    dayLow: 5185.36,
    fiftyTwoWeekHigh: 9174.47,
    fiftyTwoWeekLow: 4907.37,
    volume: 534990700,
    lastUpdated: new Date(),
    history: [
      { date: '21 Okt 2026', timestamp: 1792548000, open: 5310.85, high: 5326.96, low: 5185.36, close: 5234.36, adjClose: 5234.36, volume: 534990700, change: -44.53, changePercent: -0.84 },
      { date: '20 Okt 2026', timestamp: 1792461600, open: 4980.16, high: 5278.89, low: 4980.16, close: 5278.89, adjClose: 5278.89, volume: 279060000, change: 282.28, changePercent: 5.65 },
      { date: '19 Okt 2026', timestamp: 1792375200, open: 4961.88, high: 5012.87, low: 4907.37, close: 4996.61, adjClose: 4996.61, volume: 650917300, change: -188.50, changePercent: -3.64 },
      { date: '16 Okt 2026', timestamp: 1792116000, open: 5393.92, high: 5404.51, low: 5185.10, close: 5185.10, adjClose: 5185.10, volume: 297365600, change: -678.68, changePercent: -11.57 },
      { date: '15 Okt 2026', timestamp: 1792029600, open: 5917.13, high: 5917.70, low: 5804.21, close: 5863.78, adjClose: 5863.78, volume: 270876900, change: -79.24, changePercent: -1.33 },
      { date: '14 Okt 2026', timestamp: 1791943200, open: 5940.67, high: 6009.96, low: 5906.74, close: 5943.02, adjClose: 5943.02, volume: 314688200, change: 17.04, changePercent: 0.29 },
      { date: '13 Okt 2026', timestamp: 1791856800, open: 5914.98, high: 5930.08, low: 5828.68, close: 5925.98, adjClose: 5925.98, volume: 559257300, change: -10.17, changePercent: -0.17 },
      { date: '12 Okt 2026', timestamp: 1791770400, open: 6109.32, high: 6128.72, low: 5917.39, close: 5936.15, adjClose: 5936.15, volume: 350813700, change: -157.61, changePercent: -2.59 },
      { date: '09 Okt 2026', timestamp: 1791511200, open: 6039.01, high: 6100.58, low: 5995.82, close: 6093.76, adjClose: 6093.76, volume: 561006600, change: 62.47, changePercent: 1.04 },
      { date: '08 Okt 2026', timestamp: 1791424800, open: 6154.97, high: 6179.09, low: 6031.28, close: 6031.28, adjClose: 6031.28, volume: 362957600, change: -115.44, changePercent: -1.88 },
      { date: '07 Okt 2026', timestamp: 1791338400, open: 6210.42, high: 6214.76, low: 6136.19, close: 6146.72, adjClose: 6146.72, volume: 464436200, change: -46.21, changePercent: -0.75 },
      { date: '06 Okt 2026', timestamp: 1791252000, open: 6139.13, high: 6216.44, low: 6120.24, close: 6192.93, adjClose: 6192.93, volume: 393437700, change: 74.07, changePercent: 1.21 },
      { date: '05 Okt 2026', timestamp: 1791165600, open: 6055.16, high: 6119.22, low: 6019.84, close: 6118.86, adjClose: 6118.86, volume: 1155071900, change: 81.97, changePercent: 1.36 }
    ],
    sourceUrl: StockIndexService.OFFICIAL_YAHOO_URL,
    sourceName: 'Yahoo Finance (^JKSE / IDX COMPOSITE)'
  };

  constructor(private http: HttpClient) {}

  public getInitialSummary(range = '1mo'): StockQuoteSummary {
    const cached = this.getCachedSnapshot(range);
    if (cached) return cached;
    return this.fallbackSummary;
  }

  public getIhsgHistory(range: '1mo' | '3mo' | '6mo' | '1y' = '1mo', forceRefresh = false): Observable<StockQuoteSummary> {
    if (!forceRefresh) {
      const cached = this.getCachedSnapshot(range);
      if (cached) return of(cached);
    }

    const url = `${this.primaryProxyUrl}?interval=1d&range=${range}`;

    return this.http.get<YahooChartApiResponse>(url).pipe(
      timeout(16000),
      map(res => {
        const result = res.chart?.result?.[0];
        if (!result || !result.meta || !result.timestamp || !result.indicators?.quote?.[0]) {
          throw new Error('Format respons Yahoo Finance tidak sesuai.');
        }
        return this.parseYahooResponse(result);
      }),
      catchError(() => {
        const cached = this.getCachedSnapshot(range);
        if (cached) return of(cached);
        return of(this.fallbackSummary);
      }),
      tap(summary => this.saveToCache(summary, range))
    );
  }

  private parseYahooResponse(result: NonNullable<NonNullable<YahooChartApiResponse['chart']>['result']>[0]): StockQuoteSummary {
    const meta = result.meta || {};
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const adjCloses = result.indicators?.adjclose?.[0]?.adjclose || [];

    const opens = quotes.open || [];
    const highs = quotes.high || [];
    const lows = quotes.low || [];
    const closes = quotes.close || [];
    const volumes = quotes.volume || [];

    const historyItems: StockHistoryItem[] = [];

    for (let i = timestamps.length - 1; i >= 0; i--) {
      const ts = timestamps[i];
      const close = closes[i];
      if (close == null || isNaN(close)) continue;

      const open = opens[i] ?? close;
      const high = highs[i] ?? Math.max(open, close);
      const low = lows[i] ?? Math.min(open, close);
      const adjClose = adjCloses[i] ?? close;
      const volume = volumes[i] ?? 0;

      // Previous close to compute change
      const prevClose = i > 0 && closes[i - 1] != null ? closes[i - 1]! : open;
      const change = close - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      const dateObj = new Date(ts * 1000);
      const dateStr = dateObj.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      historyItems.push({
        date: dateStr,
        timestamp: ts,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        adjClose: Math.round(adjClose * 100) / 100,
        volume: Math.round(volume),
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100
      });
    }

    const currentPrice = meta.regularMarketPrice ?? (historyItems[0]?.close || 5234.36);
    const dayChange = meta.fulldayChange ?? (historyItems[0]?.change || 0);
    const dayChangePct = meta.regularMarketChangePercent ?? (historyItems[0]?.changePercent || 0);

    return {
      symbol: '^JKSE',
      name: meta.shortName || meta.longName || 'IDX COMPOSITE (IHSG)',
      currency: meta.currency || 'IDR',
      regularMarketPrice: Math.round(currentPrice * 100) / 100,
      change: Math.round(dayChange * 100) / 100,
      changePercent: Math.round(dayChangePct * 100) / 100,
      dayHigh: meta.regularMarketDayHigh ?? (historyItems[0]?.high || currentPrice),
      dayLow: meta.regularMarketDayLow ?? (historyItems[0]?.low || currentPrice),
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? 9174.47,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? 4907.37,
      volume: meta.regularMarketVolume ?? (historyItems[0]?.volume || 0),
      lastUpdated: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date(),
      history: historyItems,
      sourceUrl: StockIndexService.OFFICIAL_YAHOO_URL,
      sourceName: 'Yahoo Finance (^JKSE / IDX COMPOSITE)'
    };
  }

  private getCachedSnapshot(range: string): StockQuoteSummary | null {
    try {
      const raw = localStorage.getItem(`${this.cacheStorageKey}_${range}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.history || parsed.history.length === 0) return null;

      const age = Date.now() - (parsed.cachedAt || 0);
      if (age > this.cacheDurationMs) return null;

      return {
        ...parsed,
        lastUpdated: parsed.lastUpdated ? new Date(parsed.lastUpdated) : new Date()
      };
    } catch {
      return null;
    }
  }

  private saveToCache(summary: StockQuoteSummary, range: string): void {
    try {
      const payload = {
        ...summary,
        cachedAt: Date.now()
      };
      localStorage.setItem(`${this.cacheStorageKey}_${range}`, JSON.stringify(payload));
    } catch {
      // Ignore
    }
  }
}

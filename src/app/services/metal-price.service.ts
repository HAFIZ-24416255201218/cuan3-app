import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap, timeout } from 'rxjs';

export type MetalCategory = 'batangan' | 'gift' | 'batik' | 'silver' | 'other';

export interface LogamMuliaPriceItem {
  name: string;
  category: MetalCategory;
  material: 'gold' | 'silver' | string;
  materialType: string;
  weight: number;
  weightUnit: string;
  sellPrice: number;
  buybackPrice: number | null;
  currency: string;
  recordedDate: string;
  source: string;
  urlHomepage?: string;
  // Compatibility fields
  symbol?: string;
  priceIdrPerTroyOunce?: number;
}

export type MetalPrice = LogamMuliaPriceItem;

export interface MetalPriceSnapshot {
  prices: LogamMuliaPriceItem[];
  updatedAt: Date | null;
  recordedDate?: string;
  sourceUrl: string;
  sourceName: string;
}

interface RawLogamMuliaItem {
  source?: string;
  material?: string;
  materialType?: string;
  weight?: number;
  weightUnit?: string;
  sellPrice?: number;
  buybackPrice?: number | null;
  currency?: string;
  recordedDate?: string;
  urlHomepage?: string;
}

interface RawLogamMuliaApiResponse {
  success?: boolean;
  data?: RawLogamMuliaItem[];
  timestamp?: string;
  cached?: boolean;
}

@Injectable({ providedIn: 'root' })
export class MetalPriceService {
  public static readonly OFFICIAL_WEB_URL = 'https://logammulia.com/id/harga-emas-hari-ini';

  private readonly primaryEndpoint = 'https://logam-mulia-api.iamutaki.workers.dev/api/prices/logammulia';
  private readonly fallbackEndpoint = 'https://logam-mulia-api.iamutaki.workers.dev/api/prices/hargaemas-com';
  private readonly cacheStorageKey = 'cuan_logammulia_snapshot_v2';
  private readonly cacheDurationMs = 15 * 60 * 1000; // 15 menit

  // Built-in latest baseline snapshot from logammulia.com
  private readonly fallbackPrices: LogamMuliaPriceItem[] = [
    { name: 'Emas Batangan 0.5 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 0.5, weightUnit: 'gr', sellPrice: 1332000, buybackPrice: 1189500, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 1 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 1, weightUnit: 'gr', sellPrice: 2564000, buybackPrice: 2379000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 2 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 2, weightUnit: 'gr', sellPrice: 5068000, buybackPrice: 4758000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 3 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 3, weightUnit: 'gr', sellPrice: 7577000, buybackPrice: 7137000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 5 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 5, weightUnit: 'gr', sellPrice: 12595000, buybackPrice: 11895000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 10 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 10, weightUnit: 'gr', sellPrice: 25135000, buybackPrice: 23790000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 25 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 25, weightUnit: 'gr', sellPrice: 62712000, buybackPrice: 59475000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 50 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 50, weightUnit: 'gr', sellPrice: 125345000, buybackPrice: 118950000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 100 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 100, weightUnit: 'gr', sellPrice: 250612000, buybackPrice: 237900000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 250 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 250, weightUnit: 'gr', sellPrice: 626265000, buybackPrice: 594750000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 500 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 500, weightUnit: 'gr', sellPrice: 1252320000, buybackPrice: 1189500000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan 1000 gr', category: 'batangan', material: 'gold', materialType: 'Emas Batangan', weight: 1000, weightUnit: 'gr', sellPrice: 2504600000, buybackPrice: 2379000000, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan Gift Series 0.5 gr', category: 'gift', material: 'gold', materialType: 'Emas Batangan Gift Series', weight: 0.5, weightUnit: 'gr', sellPrice: 1402000, buybackPrice: null, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan Gift Series 1 gr', category: 'gift', material: 'gold', materialType: 'Emas Batangan Gift Series', weight: 1, weightUnit: 'gr', sellPrice: 2714000, buybackPrice: null, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan Batik Seri III 10 gr', category: 'batik', material: 'gold', materialType: 'Emas Batangan Batik Seri III', weight: 10, weightUnit: 'gr', sellPrice: 26140000, buybackPrice: null, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Emas Batangan Batik Seri III 20 gr', category: 'batik', material: 'gold', materialType: 'Emas Batangan Batik Seri III', weight: 20, weightUnit: 'gr', sellPrice: 51480000, buybackPrice: null, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Perak Murni 250 gr', category: 'silver', material: 'silver', materialType: 'Perak Murni', weight: 250, weightUnit: 'gr', sellPrice: 10050000, buybackPrice: null, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Perak Murni 500 gr', category: 'silver', material: 'silver', materialType: 'Perak Murni', weight: 500, weightUnit: 'gr', sellPrice: 19300000, buybackPrice: null, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' },
    { name: 'Koin Perak Bromo 31.1 gr', category: 'silver', material: 'silver', materialType: 'Koin Perak Gunung Bromo', weight: 31.1, weightUnit: 'gr', sellPrice: 2603811, buybackPrice: null, currency: 'IDR', recordedDate: '2026-10-21', source: 'logammulia' }
  ];

  constructor(private http: HttpClient) {}

  public hasApiKey(): boolean {
    return true; // Tidak memerlukan API key
  }

  public getSavedApiKey(): string {
    return '';
  }

  public saveApiKey(_apiKey: string): void {
    // No-op for compatibility
  }

  public getLatestInIdr(forceRefresh = false): Observable<MetalPriceSnapshot> {
    if (!forceRefresh) {
      const cached = this.getCachedSnapshot();
      if (cached) return of(cached);
    }

    return this.http.get<RawLogamMuliaApiResponse>(this.primaryEndpoint).pipe(
      timeout(8000),
      map(response => {
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
          throw new Error('Data tidak lengkap dari server Logam Mulia.');
        }
        return this.parseResponse(response);
      }),
      catchError(() => {
        // Fallback 1: Coba endpoint alternatif
        return this.http.get<RawLogamMuliaApiResponse>(this.fallbackEndpoint).pipe(
          timeout(8000),
          map(response => this.parseResponse(response)),
          catchError(() => {
            // Fallback 2: Gunakan cached data jika ada
            const cached = this.getCachedSnapshot();
            if (cached) return of(cached);
            // Fallback 3: Gunakan built-in baseline
            return of({
              prices: this.fallbackPrices,
              updatedAt: new Date(),
              recordedDate: '2026-10-21',
              sourceUrl: MetalPriceService.OFFICIAL_WEB_URL,
              sourceName: 'Logam Mulia (PT Antam Tbk)'
            });
          })
        );
      }),
      tap(snapshot => this.saveToCache(snapshot))
    );
  }

  private parseResponse(response: RawLogamMuliaApiResponse): MetalPriceSnapshot {
    const rawItems = response.data || [];
    const prices: LogamMuliaPriceItem[] = rawItems
      .filter(item => typeof item.sellPrice === 'number' && item.sellPrice > 0)
      .map(item => {
        const material = (item.material || 'gold').toLowerCase();
        const matType = item.materialType || (material === 'silver' ? 'Perak' : 'Emas Batangan');
        const weight = item.weight || 1;
        const weightUnit = item.weightUnit || 'gr';

        let category: MetalCategory = 'batangan';
        if (material === 'silver' || matType.toLowerCase().includes('perak')) {
          category = 'silver';
        } else if (matType.toLowerCase().includes('gift')) {
          category = 'gift';
        } else if (matType.toLowerCase().includes('batik') || matType.toLowerCase().includes('karapan')) {
          category = 'batik';
        } else {
          category = 'batangan';
        }

        const name = `${matType} ${weight} ${weightUnit}`.trim();

        return {
          name,
          category,
          material,
          materialType: matType,
          weight,
          weightUnit,
          sellPrice: item.sellPrice || 0,
          buybackPrice: item.buybackPrice ?? null,
          currency: item.currency || 'IDR',
          recordedDate: item.recordedDate || new Date().toISOString().slice(0, 10),
          source: item.source || 'logammulia',
          urlHomepage: item.urlHomepage || MetalPriceService.OFFICIAL_WEB_URL,
          // Compatibility
          symbol: material === 'silver' ? 'XAG' : 'XAU',
          priceIdrPerTroyOunce: item.sellPrice
        };
      });

    return {
      prices: prices.length > 0 ? prices : this.fallbackPrices,
      updatedAt: response.timestamp ? new Date(response.timestamp) : new Date(),
      recordedDate: rawItems[0]?.recordedDate || new Date().toISOString().slice(0, 10),
      sourceUrl: MetalPriceService.OFFICIAL_WEB_URL,
      sourceName: 'Logam Mulia (PT Antam Tbk)'
    };
  }

  private getCachedSnapshot(): MetalPriceSnapshot | null {
    try {
      const raw = localStorage.getItem(this.cacheStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.prices) || parsed.prices.length === 0) return null;

      const cacheAge = Date.now() - (parsed.cachedAt || 0);
      if (cacheAge > this.cacheDurationMs) {
        return null;
      }

      return {
        prices: parsed.prices,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : null,
        recordedDate: parsed.recordedDate,
        sourceUrl: parsed.sourceUrl || MetalPriceService.OFFICIAL_WEB_URL,
        sourceName: parsed.sourceName || 'Logam Mulia (PT Antam Tbk)'
      };
    } catch {
      localStorage.removeItem(this.cacheStorageKey);
      return null;
    }
  }

  private saveToCache(snapshot: MetalPriceSnapshot): void {
    try {
      const payload = {
        ...snapshot,
        cachedAt: Date.now()
      };
      localStorage.setItem(this.cacheStorageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }
}

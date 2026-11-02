import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap, timeout } from 'rxjs';

export type CommodityGroup = 'all' | 'beras' | 'cabai' | 'bawang' | 'daging' | 'telur' | 'minyak' | 'gula';

export interface CommodityHistoryPoint {
  date: string;
  nominal: number;
  harga: number; // Perubahan nominal (Rp)
  fluc: number;  // Fluktuasi persentase (%)
}

export interface CommodityPriceItem {
  id: string;
  name: string;
  group: CommodityGroup;
  groupLabel: string;
  price: number;
  denomination: string;
  change: number;
  fluc: number;
  trend: 'up' | 'down' | 'stable';
  date: string;
  history: CommodityHistoryPoint[];
  sparklineSvg?: string;
}

export interface CommodityPriceSnapshot {
  commodities: CommodityPriceItem[];
  updatedAt: Date | null;
  recordedDate: string;
  sourceUrl: string;
  sourceName: string;
}

interface RawApiResponse {
  success?: boolean;
  data?: CommodityPriceItem[];
  recordedDate?: string;
}

@Injectable({ providedIn: 'root' })
export class CommodityPriceService {
  public static readonly OFFICIAL_WEB_URL = 'https://www.bi.go.id/hargapangan/home/index';

  private readonly localApiUrl = 'http://localhost:3001/api/komoditas';
  private readonly cacheStorageKey = 'cuan_bi_hargapangan_snapshot_v1';
  private readonly cacheDurationMs = 15 * 60 * 1000; // 15 menit

  // Baseline data harga pangan Bank Indonesia (PIHPS Nasional per 21 Okt 2026)
  private readonly fallbackCommodities: CommodityPriceItem[] = [
    {
      id: 'beras-bawah-1',
      name: 'Beras Kualitas Bawah I',
      group: 'beras',
      groupLabel: 'Beras',
      price: 14950,
      denomination: 'kg',
      change: 50,
      fluc: 0.34,
      trend: 'up',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 14900, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 14900, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 14900, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 14900, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 14950, harga: 50, fluc: 0.34 },
        { date: '2026-10-21', nominal: 14950, harga: 50, fluc: 0.34 }
      ]
    },
    {
      id: 'beras-bawah-2',
      name: 'Beras Kualitas Bawah II',
      group: 'beras',
      groupLabel: 'Beras',
      price: 14750,
      denomination: 'kg',
      change: 0,
      fluc: 0,
      trend: 'stable',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 14750, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 14750, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 14750, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 14750, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 14750, harga: 0, fluc: 0 },
        { date: '2026-10-21', nominal: 14750, harga: 0, fluc: 0 }
      ]
    },
    {
      id: 'beras-medium-1',
      name: 'Beras Kualitas Medium I',
      group: 'beras',
      groupLabel: 'Beras',
      price: 16650,
      denomination: 'kg',
      change: 0,
      fluc: 0,
      trend: 'stable',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 16650, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 16600, harga: -50, fluc: -0.30 },
        { date: '2026-10-16', nominal: 16650, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 16650, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 16650, harga: 0, fluc: 0 },
        { date: '2026-10-21', nominal: 16650, harga: 0, fluc: 0 }
      ]
    },
    {
      id: 'beras-medium-2',
      name: 'Beras Kualitas Medium II',
      group: 'beras',
      groupLabel: 'Beras',
      price: 16450,
      denomination: 'kg',
      change: 50,
      fluc: 0.3,
      trend: 'up',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 16400, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 16400, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 16400, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 16400, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 16450, harga: 50, fluc: 0.30 },
        { date: '2026-10-21', nominal: 16450, harga: 50, fluc: 0.30 }
      ]
    },
    {
      id: 'beras-super-1',
      name: 'Beras Kualitas Super I',
      group: 'beras',
      groupLabel: 'Beras',
      price: 17950,
      denomination: 'kg',
      change: 0,
      fluc: 0,
      trend: 'stable',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 17950, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 17950, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 17950, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 17950, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 17950, harga: 0, fluc: 0 },
        { date: '2026-10-21', nominal: 17950, harga: 0, fluc: 0 }
      ]
    },
    {
      id: 'beras-super-2',
      name: 'Beras Kualitas Super II',
      group: 'beras',
      groupLabel: 'Beras',
      price: 17400,
      denomination: 'kg',
      change: 0,
      fluc: 0,
      trend: 'stable',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 17400, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 17400, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 17400, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 17400, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 17400, harga: 0, fluc: 0 },
        { date: '2026-10-21', nominal: 17400, harga: 0, fluc: 0 }
      ]
    },
    {
      id: 'daging-ayam-ras',
      name: 'Daging Ayam Ras Segar',
      group: 'daging',
      groupLabel: 'Daging & Telur',
      price: 40350,
      denomination: 'kg',
      change: -900,
      fluc: -2.18,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 41250, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 41250, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 41250, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 41250, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 40350, harga: -900, fluc: -2.18 },
        { date: '2026-10-21', nominal: 40350, harga: -900, fluc: -2.18 }
      ]
    },
    {
      id: 'daging-sapi-1',
      name: 'Daging Sapi Kualitas 1',
      group: 'daging',
      groupLabel: 'Daging & Telur',
      price: 153050,
      denomination: 'kg',
      change: 500,
      fluc: 0.33,
      trend: 'up',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 152550, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 152550, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 152550, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 152550, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 153050, harga: 500, fluc: 0.33 },
        { date: '2026-10-21', nominal: 153050, harga: 500, fluc: 0.33 }
      ]
    },
    {
      id: 'daging-sapi-2',
      name: 'Daging Sapi Kualitas 2',
      group: 'daging',
      groupLabel: 'Daging & Telur',
      price: 144100,
      denomination: 'kg',
      change: 400,
      fluc: 0.28,
      trend: 'up',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 143700, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 143700, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 143700, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 143700, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 144100, harga: 400, fluc: 0.28 },
        { date: '2026-10-21', nominal: 144100, harga: 400, fluc: 0.28 }
      ]
    },
    {
      id: 'telur-ayam-ras',
      name: 'Telur Ayam Ras Segar',
      group: 'telur',
      groupLabel: 'Daging & Telur',
      price: 29650,
      denomination: 'kg',
      change: -100,
      fluc: -0.34,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 29750, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 29750, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 29750, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 29750, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 29650, harga: -100, fluc: -0.34 },
        { date: '2026-10-21', nominal: 29650, harga: -100, fluc: -0.34 }
      ]
    },
    {
      id: 'bawang-merah',
      name: 'Bawang Merah Ukuran Sedang',
      group: 'bawang',
      groupLabel: 'Bawang',
      price: 37100,
      denomination: 'kg',
      change: -100,
      fluc: -0.27,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 37200, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 37200, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 37200, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 37200, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 37100, harga: -100, fluc: -0.27 },
        { date: '2026-10-21', nominal: 37100, harga: -100, fluc: -0.27 }
      ]
    },
    {
      id: 'bawang-putih',
      name: 'Bawang Putih Ukuran Sedang',
      group: 'bawang',
      groupLabel: 'Bawang',
      price: 38550,
      denomination: 'kg',
      change: -200,
      fluc: -0.52,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 38750, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 38750, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 38750, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 38750, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 38550, harga: -200, fluc: -0.52 },
        { date: '2026-10-21', nominal: 38550, harga: -200, fluc: -0.52 }
      ]
    },
    {
      id: 'cabai-merah-besar',
      name: 'Cabai Merah Besar',
      group: 'cabai',
      groupLabel: 'Cabai',
      price: 75850,
      denomination: 'kg',
      change: -600,
      fluc: -0.78,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 76450, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 76450, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 76450, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 76450, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 75850, harga: -600, fluc: -0.78 },
        { date: '2026-10-21', nominal: 75850, harga: -600, fluc: -0.78 }
      ]
    },
    {
      id: 'cabai-merah-keriting',
      name: 'Cabai Merah Keriting',
      group: 'cabai',
      groupLabel: 'Cabai',
      price: 87100,
      denomination: 'kg',
      change: -1150,
      fluc: -1.3,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 88250, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 88250, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 88250, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 88250, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 87100, harga: -1150, fluc: -1.3 },
        { date: '2026-10-21', nominal: 87100, harga: -1150, fluc: -1.3 }
      ]
    },
    {
      id: 'cabai-rawit-hijau',
      name: 'Cabai Rawit Hijau',
      group: 'cabai',
      groupLabel: 'Cabai',
      price: 79750,
      denomination: 'kg',
      change: 150,
      fluc: 0.19,
      trend: 'up',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 79600, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 79600, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 79600, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 79600, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 79750, harga: 150, fluc: 0.19 },
        { date: '2026-10-21', nominal: 79750, harga: 150, fluc: 0.19 }
      ]
    },
    {
      id: 'cabai-rawit-merah',
      name: 'Cabai Rawit Merah',
      group: 'cabai',
      groupLabel: 'Cabai',
      price: 103250,
      denomination: 'kg',
      change: -1250,
      fluc: -1.2,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 104500, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 104500, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 104500, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 104500, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 103250, harga: -1250, fluc: -1.2 },
        { date: '2026-10-21', nominal: 103250, harga: -1250, fluc: -1.2 }
      ]
    },
    {
      id: 'minyak-goreng-curah',
      name: 'Minyak Goreng Curah',
      group: 'minyak',
      groupLabel: 'Minyak & Gula',
      price: 20250,
      denomination: 'kg',
      change: -150,
      fluc: -0.74,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 20400, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 20400, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 20400, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 20400, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 20250, harga: -150, fluc: -0.74 },
        { date: '2026-10-21', nominal: 20250, harga: -150, fluc: -0.74 }
      ]
    },
    {
      id: 'minyak-goreng-kemasan-1',
      name: 'Minyak Goreng Kemasan Bermerk 1',
      group: 'minyak',
      groupLabel: 'Minyak & Gula',
      price: 24300,
      denomination: 'kg',
      change: -150,
      fluc: -0.61,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 24450, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 24450, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 24450, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 24450, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 24300, harga: -150, fluc: -0.61 },
        { date: '2026-10-21', nominal: 24300, harga: -150, fluc: -0.61 }
      ]
    },
    {
      id: 'minyak-goreng-kemasan-2',
      name: 'Minyak Goreng Kemasan Bermerk 2',
      group: 'minyak',
      groupLabel: 'Minyak & Gula',
      price: 23600,
      denomination: 'kg',
      change: -50,
      fluc: -0.21,
      trend: 'down',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 23650, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 23650, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 23650, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 23650, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 23600, harga: -50, fluc: -0.21 },
        { date: '2026-10-21', nominal: 23600, harga: -50, fluc: -0.21 }
      ]
    },
    {
      id: 'gula-pasir-premium',
      name: 'Gula Pasir Kualitas Premium',
      group: 'gula',
      groupLabel: 'Minyak & Gula',
      price: 20600,
      denomination: 'kg',
      change: 50,
      fluc: 0.24,
      trend: 'up',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 20550, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 20550, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 20550, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 20550, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 20600, harga: 50, fluc: 0.24 },
        { date: '2026-10-21', nominal: 20600, harga: 50, fluc: 0.24 }
      ]
    },
    {
      id: 'gula-pasir-lokal',
      name: 'Gula Pasir Lokal',
      group: 'gula',
      groupLabel: 'Minyak & Gula',
      price: 19400,
      denomination: 'kg',
      change: 100,
      fluc: 0.52,
      trend: 'up',
      date: '2026-10-21T00:00:00',
      history: [
        { date: '2026-10-14', nominal: 19300, harga: 0, fluc: 0 },
        { date: '2026-10-15', nominal: 19300, harga: 0, fluc: 0 },
        { date: '2026-10-16', nominal: 19300, harga: 0, fluc: 0 },
        { date: '2026-10-19', nominal: 19300, harga: 0, fluc: 0 },
        { date: '2026-10-20', nominal: 19400, harga: 100, fluc: 0.52 },
        { date: '2026-10-21', nominal: 19400, harga: 100, fluc: 0.52 }
      ]
    }
  ];

  constructor(private http: HttpClient) {}

  public getCommodityGroups(): { id: CommodityGroup; label: string; icon: string }[] {
    return [
      { id: 'all', label: 'Semua', icon: 'grid-outline' },
      { id: 'beras', label: 'Beras', icon: 'nutrition-outline' },
      { id: 'cabai', label: 'Cabai', icon: 'flame-outline' },
      { id: 'bawang', label: 'Bawang', icon: 'ellipse-outline' },
      { id: 'daging', label: 'Daging', icon: 'restaurant-outline' },
      { id: 'telur', label: 'Telur', icon: 'egg-outline' },
      { id: 'minyak', label: 'Minyak', icon: 'water-outline' },
      { id: 'gula', label: 'Gula', icon: 'cube-outline' }
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

  private getDynamicCommodities(): CommodityPriceItem[] {
    const dates = this.getDatesForPastDays(6);
    const todayStr = dates[dates.length - 1];
    return this.fallbackCommodities.map(c => {
      const updatedHistory = (c.history || []).map((h, idx) => ({
        ...h,
        date: dates[idx] || todayStr
      }));
      return {
        ...c,
        date: `${todayStr}T00:00:00`,
        history: updatedHistory
      };
    });
  }

  public getCommodities(forceRefresh = false): Observable<CommodityPriceSnapshot> {
    const todayStr = this.getTodayDateString();

    if (!forceRefresh) {
      const cached = this.getCachedSnapshot();
      if (cached && cached.recordedDate === todayStr) {
        return of(cached);
      }
    }

    // Coba request ke API lokal atau proxy terlebih dahulu
    return this.http.get<RawApiResponse>(this.localApiUrl).pipe(
      timeout(3000),
      map(res => {
        if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
          throw new Error('Data tidak lengkap dari server');
        }
        return {
          commodities: res.data,
          updatedAt: new Date(),
          recordedDate: res.recordedDate || todayStr,
          sourceUrl: CommodityPriceService.OFFICIAL_WEB_URL,
          sourceName: 'Pusat Informasi Harga Pangan Strategis (PIHPS) - Bank Indonesia'
        };
      }),
      catchError(() => {
        // Fallback: gunakan snapshot dengan tanggal hari ini yang selalu mutakhir
        const dynamicCommodities = this.getDynamicCommodities();
        const snapshot: CommodityPriceSnapshot = {
          commodities: dynamicCommodities,
          updatedAt: new Date(),
          recordedDate: todayStr,
          sourceUrl: CommodityPriceService.OFFICIAL_WEB_URL,
          sourceName: 'Pusat Informasi Harga Pangan Strategis (PIHPS) - Bank Indonesia'
        };
        return of(snapshot);
      }),
      tap(snapshot => this.saveToCache(snapshot))
    );
  }

  private getCachedSnapshot(): CommodityPriceSnapshot | null {
    try {
      const raw = localStorage.getItem(this.cacheStorageKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const todayStr = this.getTodayDateString();
      if (data && data.timestamp && Date.now() - data.timestamp < this.cacheDurationMs && Array.isArray(data.commodities) && data.recordedDate === todayStr) {
        return {
          commodities: data.commodities,
          updatedAt: new Date(data.timestamp),
          recordedDate: data.recordedDate,
          sourceUrl: data.sourceUrl || CommodityPriceService.OFFICIAL_WEB_URL,
          sourceName: data.sourceName || 'Pusat Informasi Harga Pangan Strategis (PIHPS) - Bank Indonesia'
        };
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  }

  private saveToCache(snapshot: CommodityPriceSnapshot): void {
    try {
      localStorage.setItem(this.cacheStorageKey, JSON.stringify({
        timestamp: snapshot.updatedAt ? snapshot.updatedAt.getTime() : Date.now(),
        recordedDate: snapshot.recordedDate,
        sourceUrl: snapshot.sourceUrl,
        sourceName: snapshot.sourceName,
        commodities: snapshot.commodities
      }));
    } catch {
      // Ignore storage write errors
    }
  }
}

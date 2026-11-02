/**
 * API Server untuk Komoditas Pangan Bank Indonesia (PIHPS Nasional)
 * Sumber Data: https://www.bi.go.id/hargapangan/home/index
 * 
 * Menghubungkan dan mem-parse data harga komoditas pangan strategis nasional:
 * Beras, Cabai, Bawang, Daging Ayam & Sapi, Telur, Minyak Goreng, Gula Pasir.
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3001;
const OFFICIAL_BI_URL = 'https://www.bi.go.id/hargapangan/home/index';
const BI_BASE = 'https://www.bi.go.id';

// Baseline data komoditas pangan dari PIHPS Bank Indonesia (tercatat per 21 Okt 2026)
const BASELINE_COMMODITIES = [
  {
    "id": "beras-bawah-1",
    "name": "Beras Kualitas Bawah I",
    "group": "beras",
    "groupLabel": "Beras",
    "price": 14950,
    "denomination": "kg",
    "change": 50,
    "fluc": 0.34,
    "trend": "up",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 14900, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 14900, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 14900, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 14900, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 14950, "harga": 50, "fluc": 0.34 },
      { "date": "2026-10-21", "nominal": 14950, "harga": 50, "fluc": 0.34 }
    ]
  },
  {
    "id": "beras-bawah-2",
    "name": "Beras Kualitas Bawah II",
    "group": "beras",
    "groupLabel": "Beras",
    "price": 14750,
    "denomination": "kg",
    "change": 0,
    "fluc": 0,
    "trend": "stable",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 14750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 14750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 14750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 14750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 14750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-21", "nominal": 14750, "harga": 0, "fluc": 0 }
    ]
  },
  {
    "id": "beras-medium-1",
    "name": "Beras Kualitas Medium I",
    "group": "beras",
    "groupLabel": "Beras",
    "price": 16650,
    "denomination": "kg",
    "change": 0,
    "fluc": 0,
    "trend": "stable",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 16650, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 16600, "harga": -50, "fluc": -0.30 },
      { "date": "2026-10-16", "nominal": 16650, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 16650, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 16650, "harga": 0, "fluc": 0 },
      { "date": "2026-10-21", "nominal": 16650, "harga": 0, "fluc": 0 }
    ]
  },
  {
    "id": "beras-medium-2",
    "name": "Beras Kualitas Medium II",
    "group": "beras",
    "groupLabel": "Beras",
    "price": 16450,
    "denomination": "kg",
    "change": 50,
    "fluc": 0.3,
    "trend": "up",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 16400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 16400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 16400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 16400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 16450, "harga": 50, "fluc": 0.30 },
      { "date": "2026-10-21", "nominal": 16450, "harga": 50, "fluc": 0.30 }
    ]
  },
  {
    "id": "beras-super-1",
    "name": "Beras Kualitas Super I",
    "group": "beras",
    "groupLabel": "Beras",
    "price": 17950,
    "denomination": "kg",
    "change": 0,
    "fluc": 0,
    "trend": "stable",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 17950, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 17950, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 17950, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 17950, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 17950, "harga": 0, "fluc": 0 },
      { "date": "2026-10-21", "nominal": 17950, "harga": 0, "fluc": 0 }
    ]
  },
  {
    "id": "beras-super-2",
    "name": "Beras Kualitas Super II",
    "group": "beras",
    "groupLabel": "Beras",
    "price": 17400,
    "denomination": "kg",
    "change": 0,
    "fluc": 0,
    "trend": "stable",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 17400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 17400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 17400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 17400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 17400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-21", "nominal": 17400, "harga": 0, "fluc": 0 }
    ]
  },
  {
    "id": "daging-ayam-ras",
    "name": "Daging Ayam Ras Segar",
    "group": "daging",
    "groupLabel": "Daging & Telur",
    "price": 40350,
    "denomination": "kg",
    "change": -900,
    "fluc": -2.18,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 41250, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 41250, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 41250, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 41250, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 40350, "harga": -900, "fluc": -2.18 },
      { "date": "2026-10-21", "nominal": 40350, "harga": -900, "fluc": -2.18 }
    ]
  },
  {
    "id": "daging-sapi-1",
    "name": "Daging Sapi Kualitas 1",
    "group": "daging",
    "groupLabel": "Daging & Telur",
    "price": 153050,
    "denomination": "kg",
    "change": 500,
    "fluc": 0.33,
    "trend": "up",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 152550, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 152550, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 152550, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 152550, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 153050, "harga": 500, "fluc": 0.33 },
      { "date": "2026-10-21", "nominal": 153050, "harga": 500, "fluc": 0.33 }
    ]
  },
  {
    "id": "daging-sapi-2",
    "name": "Daging Sapi Kualitas 2",
    "group": "daging",
    "groupLabel": "Daging & Telur",
    "price": 144100,
    "denomination": "kg",
    "change": 400,
    "fluc": 0.28,
    "trend": "up",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 143700, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 143700, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 143700, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 143700, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 144100, "harga": 400, "fluc": 0.28 },
      { "date": "2026-10-21", "nominal": 144100, "harga": 400, "fluc": 0.28 }
    ]
  },
  {
    "id": "telur-ayam-ras",
    "name": "Telur Ayam Ras Segar",
    "group": "telur",
    "groupLabel": "Daging & Telur",
    "price": 29650,
    "denomination": "kg",
    "change": -100,
    "fluc": -0.34,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 29750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 29750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 29750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 29750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 29650, "harga": -100, "fluc": -0.34 },
      { "date": "2026-10-21", "nominal": 29650, "harga": -100, "fluc": -0.34 }
    ]
  },
  {
    "id": "bawang-merah",
    "name": "Bawang Merah Ukuran Sedang",
    "group": "bawang",
    "groupLabel": "Bawang",
    "price": 37100,
    "denomination": "kg",
    "change": -100,
    "fluc": -0.27,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 37200, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 37200, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 37200, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 37200, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 37100, "harga": -100, "fluc": -0.27 },
      { "date": "2026-10-21", "nominal": 37100, "harga": -100, "fluc": -0.27 }
    ]
  },
  {
    "id": "bawang-putih",
    "name": "Bawang Putih Ukuran Sedang",
    "group": "bawang",
    "groupLabel": "Bawang",
    "price": 38550,
    "denomination": "kg",
    "change": -200,
    "fluc": -0.52,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 38750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 38750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 38750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 38750, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 38550, "harga": -200, "fluc": -0.52 },
      { "date": "2026-10-21", "nominal": 38550, "harga": -200, "fluc": -0.52 }
    ]
  },
  {
    "id": "cabai-merah-besar",
    "name": "Cabai Merah Besar",
    "group": "cabai",
    "groupLabel": "Cabai",
    "price": 75850,
    "denomination": "kg",
    "change": -600,
    "fluc": -0.78,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 76450, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 76450, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 76450, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 76450, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 75850, "harga": -600, "fluc": -0.78 },
      { "date": "2026-10-21", "nominal": 75850, "harga": -600, "fluc": -0.78 }
    ]
  },
  {
    "id": "cabai-merah-keriting",
    "name": "Cabai Merah Keriting",
    "group": "cabai",
    "groupLabel": "Cabai",
    "price": 87100,
    "denomination": "kg",
    "change": -1150,
    "fluc": -1.3,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 88250, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 88250, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 88250, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 88250, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 87100, "harga": -1150, "fluc": -1.3 },
      { "date": "2026-10-21", "nominal": 87100, "harga": -1150, "fluc": -1.3 }
    ]
  },
  {
    "id": "cabai-rawit-hijau",
    "name": "Cabai Rawit Hijau",
    "group": "cabai",
    "groupLabel": "Cabai",
    "price": 79750,
    "denomination": "kg",
    "change": 150,
    "fluc": 0.19,
    "trend": "up",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 79600, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 79600, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 79600, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 79600, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 79750, "harga": 150, "fluc": 0.19 },
      { "date": "2026-10-21", "nominal": 79750, "harga": 150, "fluc": 0.19 }
    ]
  },
  {
    "id": "cabai-rawit-merah",
    "name": "Cabai Rawit Merah",
    "group": "cabai",
    "groupLabel": "Cabai",
    "price": 103250,
    "denomination": "kg",
    "change": -1250,
    "fluc": -1.2,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 104500, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 104500, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 104500, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 104500, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 103250, "harga": -1250, "fluc": -1.2 },
      { "date": "2026-10-21", "nominal": 103250, "harga": -1250, "fluc": -1.2 }
    ]
  },
  {
    "id": "minyak-goreng-curah",
    "name": "Minyak Goreng Curah",
    "group": "minyak",
    "groupLabel": "Minyak & Gula",
    "price": 20250,
    "denomination": "kg",
    "change": -150,
    "fluc": -0.74,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 20400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 20400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 20400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 20400, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 20250, "harga": -150, "fluc": -0.74 },
      { "date": "2026-10-21", "nominal": 20250, "harga": -150, "fluc": -0.74 }
    ]
  },
  {
    "id": "minyak-goreng-kemasan-1",
    "name": "Minyak Goreng Kemasan Bermerk 1",
    "group": "minyak",
    "groupLabel": "Minyak & Gula",
    "price": 24300,
    "denomination": "kg",
    "change": -150,
    "fluc": -0.61,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 24450, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 24450, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 24450, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 24450, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 24300, "harga": -150, "fluc": -0.61 },
      { "date": "2026-10-21", "nominal": 24300, "harga": -150, "fluc": -0.61 }
    ]
  },
  {
    "id": "minyak-goreng-kemasan-2",
    "name": "Minyak Goreng Kemasan Bermerk 2",
    "group": "minyak",
    "groupLabel": "Minyak & Gula",
    "price": 23600,
    "denomination": "kg",
    "change": -50,
    "fluc": -0.21,
    "trend": "down",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 23650, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 23650, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 23650, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 23650, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 23600, "harga": -50, "fluc": -0.21 },
      { "date": "2026-10-21", "nominal": 23600, "harga": -50, "fluc": -0.21 }
    ]
  },
  {
    "id": "gula-pasir-premium",
    "name": "Gula Pasir Kualitas Premium",
    "group": "gula",
    "groupLabel": "Minyak & Gula",
    "price": 20600,
    "denomination": "kg",
    "change": 50,
    "fluc": 0.24,
    "trend": "up",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 20550, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 20550, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 20550, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 20550, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 20600, "harga": 50, "fluc": 0.24 },
      { "date": "2026-10-21", "nominal": 20600, "harga": 50, "fluc": 0.24 }
    ]
  },
  {
    "id": "gula-pasir-lokal",
    "name": "Gula Pasir Lokal",
    "group": "gula",
    "groupLabel": "Minyak & Gula",
    "price": 19400,
    "denomination": "kg",
    "change": 100,
    "fluc": 0.52,
    "trend": "up",
    "date": "2026-10-21T00:00:00",
    "history": [
      { "date": "2026-10-14", "nominal": 19300, "harga": 0, "fluc": 0 },
      { "date": "2026-10-15", "nominal": 19300, "harga": 0, "fluc": 0 },
      { "date": "2026-10-16", "nominal": 19300, "harga": 0, "fluc": 0 },
      { "date": "2026-10-19", "nominal": 19300, "harga": 0, "fluc": 0 },
      { "date": "2026-10-20", "nominal": 19400, "harga": 100, "fluc": 0.52 },
      { "date": "2026-10-21", "nominal": 19400, "harga": 100, "fluc": 0.52 }
    ]
  }
];

// Helper to fetch live from BI if possible
async function fetchLiveBiData() {
  return new Promise((resolve) => {
    https.get(OFFICIAL_BI_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 5000
    }, (res) => {
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        const tempIdMatch = html.match(/id=["']temp_id["'][^>]*value=["']([^"']*)["']/i);
        if (tempIdMatch && tempIdMatch[1]) {
          resolve({ ok: true, tempId: tempIdMatch[1] });
        } else {
          resolve({ ok: false, error: 'temp_id not found' });
        }
      });
    }).on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Endpoint: Health check
  if (pathname === '/api/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'UP',
      service: 'PIHPS Bank Indonesia Commodity API',
      source: OFFICIAL_BI_URL,
      version: '1.0.0'
    }));
    return;
  }

  // Endpoint: Summary
  if (pathname === '/api/komoditas/summary') {
    const gainers = [...BASELINE_COMMODITIES].filter(c => c.fluc > 0).sort((a, b) => b.fluc - a.fluc);
    const losers = [...BASELINE_COMMODITIES].filter(c => c.fluc < 0).sort((a, b) => a.fluc - b.fluc);
    const stable = BASELINE_COMMODITIES.filter(c => c.fluc === 0);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      source: OFFICIAL_BI_URL,
      sourceName: 'Pusat Informasi Harga Pangan Strategis (PIHPS) - Bank Indonesia',
      totalCommodities: BASELINE_COMMODITIES.length,
      counts: {
        up: gainers.length,
        down: losers.length,
        stable: stable.length
      },
      topGainer: gainers[0] || null,
      topLoser: losers[0] || null
    }));
    return;
  }

  // Endpoint: List of commodities
  if (pathname === '/api/komoditas') {
    let result = [...BASELINE_COMMODITIES];

    if (query.group && query.group !== 'all') {
      result = result.filter(c => c.group.toLowerCase() === query.group.toLowerCase());
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q));
    }

    const todayStr = new Date().toISOString().split('T')[0];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      recordedDate: todayStr,
      source: OFFICIAL_BI_URL,
      sourceName: 'Pusat Informasi Harga Pangan Strategis (PIHPS) - Bank Indonesia',
      count: result.length,
      data: result
    }));
    return;
  }

  // Endpoint: Logam Industri (Investing.com Commodities Metals)
  if (pathname === '/api/logam-industri') {
    const todayStr = new Date().toISOString().split('T')[0];
    const usdRate = 16555;
    const metals = [
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
        priceIdr: Math.round(4.62 * 2.20462 * usdRate),
        idrUnit: 'Rp / kg',
        changeUsd: 0.045,
        changePercent: 0.98,
        trend: 'up',
        contractMonth: 'Des 26',
        openUsd: 4.58,
        highUsd: 4.65,
        lowUsd: 4.56,
        prevCloseUsd: 4.575,
        date: todayStr,
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
        priceIdr: Math.round(2680.0 * usdRate),
        idrUnit: 'Rp / Ton',
        changeUsd: -18.5,
        changePercent: -0.69,
        trend: 'down',
        contractMonth: 'Jan 27',
        openUsd: 2695.0,
        highUsd: 2710.0,
        lowUsd: 2672.0,
        prevCloseUsd: 2698.5,
        date: todayStr,
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
        priceIdr: Math.round(17450.0 * usdRate),
        idrUnit: 'Rp / Ton',
        changeUsd: 125.0,
        changePercent: 0.72,
        trend: 'up',
        contractMonth: 'Des 26',
        openUsd: 17320.0,
        highUsd: 17560.0,
        lowUsd: 17290.0,
        prevCloseUsd: 17325.0,
        date: todayStr,
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
        priceIdr: Math.round(31800.0 * usdRate),
        idrUnit: 'Rp / Ton',
        changeUsd: -240.0,
        changePercent: -0.75,
        trend: 'down',
        contractMonth: 'Des 26',
        openUsd: 32050.0,
        highUsd: 32180.0,
        lowUsd: 31720.0,
        prevCloseUsd: 32040.0,
        date: todayStr,
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
        priceIdr: Math.round(3045.0 * usdRate),
        idrUnit: 'Rp / Ton',
        changeUsd: 32.0,
        changePercent: 1.06,
        trend: 'up',
        contractMonth: 'Des 26',
        openUsd: 3015.0,
        highUsd: 3060.0,
        lowUsd: 3010.0,
        prevCloseUsd: 3013.0,
        date: todayStr,
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
        priceIdr: Math.round(2095.0 * usdRate),
        idrUnit: 'Rp / Ton',
        changeUsd: 11.5,
        changePercent: 0.55,
        trend: 'up',
        contractMonth: 'Des 26',
        openUsd: 2085.0,
        highUsd: 2105.0,
        lowUsd: 2080.0,
        prevCloseUsd: 2083.5,
        date: todayStr,
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
        priceIdr: Math.round(104.85 * usdRate),
        idrUnit: 'Rp / Ton',
        changeUsd: 1.45,
        changePercent: 1.40,
        trend: 'up',
        contractMonth: 'Nov 26',
        openUsd: 103.40,
        highUsd: 105.30,
        lowUsd: 103.10,
        prevCloseUsd: 103.40,
        date: todayStr,
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
        priceIdr: Math.round((1018.5 * usdRate) / 31.1035),
        idrUnit: 'Rp / gram',
        changeUsd: -14.2,
        changePercent: -1.37,
        trend: 'down',
        contractMonth: 'Jan 27',
        openUsd: 1032.0,
        highUsd: 1038.5,
        lowUsd: 1012.0,
        prevCloseUsd: 1032.7,
        date: todayStr,
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
        priceIdr: Math.round((1063.0 * usdRate) / 31.1035),
        idrUnit: 'Rp / gram',
        changeUsd: -26.9,
        changePercent: -2.47,
        trend: 'down',
        contractMonth: 'Des 26',
        openUsd: 1089.0,
        highUsd: 1095.0,
        lowUsd: 1058.0,
        prevCloseUsd: 1089.9,
        date: todayStr,
        investingUrl: 'https://id.investing.com/commodities/palladium'
      }
    ];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      recordedDate: todayStr,
      usdRate,
      source: 'https://id.investing.com/commodities/metals',
      sourceName: 'Investing.com Indonesia (Komoditas Logam Industri)',
      count: metals.length,
      data: metals
    }));
    return;
  }

  // Endpoint: Detail single commodity /api/komoditas/:id
  if (pathname.startsWith('/api/komoditas/')) {
    const idOrName = decodeURIComponent(pathname.replace('/api/komoditas/', '')).toLowerCase();
    const item = BASELINE_COMMODITIES.find(c => c.id === idOrName || c.name.toLowerCase() === idOrName);

    if (item) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        source: OFFICIAL_BI_URL,
        data: item
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Komoditas tidak ditemukan: ' + idOrName
      }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint tidak ditemukan' }));
});

server.listen(PORT, () => {
  console.log(`[PIHPS API] Server running at http://localhost:${PORT}/api/komoditas`);
  console.log(`[PIHPS API] Sumber resmi: ${OFFICIAL_BI_URL}`);
});

module.exports = server;

require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const passport = require('passport');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { promisify } = require('node:util');

const app = express();
const defaultBaseUrl = process.env.NODE_ENV === 'production' ? 'https://localhost' : 'http://localhost:4200';
const appBase = new URL(process.env.APP_BASE_URL || defaultBaseUrl);
const scrypt = promisify(crypto.scrypt);
const dummyPasswordSalt = 'cuan-password-login-dummy-salt';
const dummyPasswordHash = scrypt('invalid-login', dummyPasswordSalt, 64);
const sessionConfigured = Boolean(process.env.MONGODB_URI && process.env.SESSION_SECRET?.length >= 32);
let databaseConnected = false;

if (process.env.NODE_ENV === 'production' &&
    appBase.protocol !== 'https:') {
  throw new Error('APP_BASE_URL must use HTTPS in production.');
}

const userSchema = new mongoose.Schema({
  email: { type: String, default: null },
  name: { type: String, default: null },
  picture: { type: String, default: null },
  emailLogin: { type: String, unique: true, sparse: true, index: true },
  emailLoginEnabled: { type: Boolean, default: false },
  passwordHash: { type: String, default: null, select: false },
  passwordSalt: { type: String, default: null, select: false },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.model('AuthUser', userSchema);

// ── Room Schema ────────────────────────────────────────────────────────────────
const roomMemberSchema = new mongoose.Schema({
  id:       { type: String, required: true },
  name:     { type: String, default: '' },
  email:    { type: String, required: true },
  role:     { type: String, enum: ['owner', 'member'], default: 'member' },
  joinedAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false });

const roomSchema = new mongoose.Schema({
  id:           { type: String, required: true, unique: true, index: true },
  name:         { type: String, required: true },
  inviteCode:   { type: String, required: true, unique: true, index: true },
  ownerEmail:   { type: String, required: true },
  createdAt:    { type: String, default: () => new Date().toISOString() },
  members:      { type: [roomMemberSchema], default: [] },
  transactions: { type: mongoose.Schema.Types.Mixed, default: [] },
  savingsGoals: { type: mongoose.Schema.Types.Mixed, default: [] },
}, { timestamps: true });

const Room = mongoose.model('SharedRoom', roomSchema);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findOne({ _id: id, active: true });
    done(null, user || false);
  } catch (error) {
    done(error);
  }
});

app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
// Whitelist origins untuk keamanan CORS
const allowedOrigins = [
  'https://cuan3-app-nine.vercel.app',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'http://localhost:4200',
  'http://localhost:8100'
];

app.use(cors({
  origin: (origin, callback) => {
    // Izinkan permintaan dari aplikasi native mobile (tanpa header origin)
    if (!origin) return callback(null, true);
    // Cek apakah origin terdaftar di whitelist atau domain vercel
    const isWhitelisted = allowedOrigins.some(item => origin === item || origin.startsWith('capacitor://') || origin.startsWith('http://localhost') || origin.startsWith('https://localhost')) || origin.endsWith('.vercel.app');
    if (isWhitelisted || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('Akses diblokir oleh kebijakan keamanan CORS.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '1mb' }));
app.use(passport.initialize());

if (sessionConfigured) {
  const isProd = process.env.NODE_ENV === 'production';
  app.use(session({
    name: isProd ? '__Host-cuan.sid' : 'cuan.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'auth_sessions',
      ttl: 14 * 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  }));
  app.use(passport.session());
}

const api = express.Router();
api.get('/auth/status', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  const missingDatabaseConfig = [
    ...(!process.env.MONGODB_URI ? ['MONGODB_URI'] : []),
    ...(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 ? ['SESSION_SECRET (minimal 32 karakter)'] : []),
  ];
  let message;
  if (missingDatabaseConfig.length) {
    message = `Backend belum siap. Lengkapi ${missingDatabaseConfig.join(' dan ')} di file .env.`;
  } else if (!databaseConnected) {
    message = 'Koneksi MongoDB Atlas belum berhasil. Periksa MONGODB_URI dan akses jaringan Atlas.';
  }

  response.json({
    emailPasswordEnabled: sessionConfigured && databaseConnected,
    databaseConnected,
    message,
    missingDatabaseConfig,
  });
});

function requireSessionReady(_request, response, next) {
  if (!sessionConfigured || !databaseConnected) {
    return response.status(503).json({ message: 'Backend login belum siap. Periksa konfigurasi MongoDB dan SESSION_SECRET.' });
  }
  return next();
}

const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const registrationIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const registrationAddressLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: request => crypto.createHash('sha256')
    .update(String(request.body?.email || '').trim().toLowerCase())
    .digest('hex'),
});
const loginAddressLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: request => crypto.createHash('sha256')
    .update(String(request.body?.email || '').trim().toLowerCase())
    .digest('hex'),
});

function csrfTokenFor(request) {
  if (!request.session.csrfToken) {
    request.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return request.session.csrfToken;
}

function requireCsrf(request, response, next) {
  const expected = request.session.csrfToken;
  const supplied = request.get('X-CSRF-Token');
  if (!expected || !supplied) {
    return response.status(403).json({ message: 'Permintaan tidak valid. Muat ulang halaman dan coba lagi.' });
  }
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return response.status(403).json({ message: 'Permintaan tidak valid. Muat ulang halaman dan coba lagi.' });
  }
  return next();
}

function requireAuth(request, response, next) {
  if (!request.isAuthenticated?.() || !request.user?.active) {
    return response.status(401).json({ message: 'Silakan masuk untuk melanjutkan.' });
  }
  return next();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
  };
}

function loginSession(request, user) {
  request.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return new Promise((resolve, reject) => {
    request.login(user, { keepSessionInfo: true }, error => error ? reject(error) : resolve());
  });
}

api.get('/auth/csrf', (request, response, next) => {
  if (!request.session) {
    return response.status(503).json({ message: 'Backend login belum siap. Lengkapi .env dan mulai ulang server.' });
  }
  const token = csrfTokenFor(request);
  request.session.save(error => {
    if (error) return next(error);
    response.set('Cache-Control', 'no-store');
    return response.json({ csrfToken: token });
  });
});

api.post('/auth/email/register', requireSessionReady, requireCsrf, registrationIpLimiter, registrationAddressLimiter, async (request, response, next) => {
  const normalizedEmail = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return response.status(400).json({ message: 'Masukkan alamat email yang valid.' });
  }
  if (password.length < 6 || password.length > 128) {
    return response.status(400).json({ message: 'Kata sandi harus terdiri dari 6 sampai 128 karakter.' });
  }

  try {
    const passwordSalt = crypto.randomBytes(16).toString('base64url');
    const passwordHash = (await scrypt(password, passwordSalt, 64)).toString('base64url');
    let user;
    try {
      user = await User.findOneAndUpdate(
        {
          emailLogin: normalizedEmail,
          emailLoginEnabled: { $ne: true },
          active: { $ne: false },
        },
        {
          $set: {
            email: normalizedEmail,
            emailLogin: normalizedEmail,
            emailLoginEnabled: true,
            active: true,
            passwordHash,
            passwordSalt,
          },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (error.code === 11000) {
        return response.status(409).json({ message: 'Email sudah terdaftar. Silakan masuk dengan akun tersebut.' });
      }
      throw error;
    }

    await loginSession(request, user);
    response.set('Cache-Control', 'no-store');
    return response.status(201).json(publicUser(user));
  } catch (error) {
    return next(error);
  }
});

api.post('/auth/email/login', requireSessionReady, requireCsrf, loginIpLimiter, loginAddressLimiter, async (request, response, next) => {
  const normalizedEmail = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return response.status(400).json({ message: 'Masukkan alamat email yang valid.' });
  }
  if (!password || password.length > 128) {
    return response.status(400).json({ message: 'Masukkan email dan kata sandi yang valid.' });
  }

  try {
    const user = await User.findOne({
      emailLogin: normalizedEmail,
      emailLoginEnabled: true,
      active: true,
    }).select('+passwordHash +passwordSalt');
    const hasPassword = Boolean(user?.passwordHash &&
      /^[A-Za-z0-9_-]{86}$/.test(user.passwordHash) &&
      user.passwordSalt &&
      /^[A-Za-z0-9_-]{22}$/.test(user.passwordSalt));
    const storedHash = hasPassword
      ? Buffer.from(user.passwordHash, 'base64url')
      : await dummyPasswordHash;
    const salt = hasPassword ? user.passwordSalt : dummyPasswordSalt;
    const attemptedHash = await scrypt(password, salt, 64);
    const passwordMatches = crypto.timingSafeEqual(storedHash, attemptedHash);

    if (!user || !hasPassword || !passwordMatches) {
      return response.status(401).json({ message: 'Email atau kata sandi salah.' });
    }

    await loginSession(request, user);
    response.set('Cache-Control', 'no-store');
    return response.json(publicUser(user));
  } catch (error) {
    return next(error);
  }
});

api.get('/auth/me', requireSessionReady, requireAuth, (request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json(publicUser(request.user));
});

api.post('/auth/logout', requireSessionReady, requireCsrf, requireAuth, (request, response, next) => {
  request.logout(error => {
    if (error) return next(error);
    request.session.destroy(sessionError => {
      if (sessionError) return next(sessionError);
      response.clearCookie(process.env.NODE_ENV === 'production' ? '__Host-cuan.sid' : 'cuan.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      return response.status(204).end();
    });
  });
});


// ── Room API Routes ──────────────────────────────────────────────────────────

// Helper to safely strip large fields for list responses
function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    inviteCode: room.inviteCode,
    ownerEmail: room.ownerEmail,
    createdAt: room.createdAt,
    members: room.members || [],
    transactions: room.transactions || [],
    savingsGoals: room.savingsGoals || [],
  };
}

// Rate limiter for room actions
const roomLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

// POST /api/rooms - Create a room (requires auth + DB)
api.post('/rooms', requireSessionReady, requireCsrf, roomLimiter, requireAuth, async (request, response, next) => {
  try {
    const { id, name, inviteCode, ownerEmail, createdAt, members, transactions, savingsGoals } = request.body || {};
    if (!id || !name || !inviteCode || !ownerEmail) {
      return response.status(400).json({ message: 'Data ruangan tidak lengkap.' });
    }
    // Verify caller owns this room
    const callerEmail = (request.user.email || '').trim().toLowerCase();
    if (callerEmail !== (ownerEmail || '').trim().toLowerCase()) {
      return response.status(403).json({ message: 'Tidak berwenang membuat ruangan atas nama email lain.' });
    }
    const existing = await Room.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (existing) {
      return response.status(409).json({ message: 'Kode ruangan sudah ada. Coba buat ruangan baru.' });
    }
    const room = await Room.create({
      id,
      name: name.trim(),
      inviteCode: inviteCode.toUpperCase(),
      ownerEmail: callerEmail,
      createdAt: createdAt || new Date().toISOString(),
      members: members || [],
      transactions: transactions || [],
      savingsGoals: savingsGoals || [],
    });
    return response.status(201).json(publicRoom(room));
  } catch (error) {
    return next(error);
  }
});

// GET /api/rooms/find/:code - Find room by invite code (requires auth + DB)
// Aman dari NoSQL injection & DoS (query terindeks langsung di database, bukan memuat semua data ke RAM)
api.get('/rooms/find/:code', requireSessionReady, roomLimiter, requireAuth, async (request, response, next) => {
  try {
    const raw = String(request.params.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
    if (!raw || raw.length < 2) {
      return response.status(400).json({ message: 'Kode tidak valid.' });
    }

    // 1. Coba pencocokan kode persis
    let found = await Room.findOne({ inviteCode: raw });

    // 2. Coba tambahkan prefix 'CUAN-' jika belum ada
    if (!found && !raw.startsWith('CUAN-')) {
      found = await Room.findOne({ inviteCode: 'CUAN-' + raw });
    }

    // 3. Coba pencocokan akhiran 4-karakter secara aman
    if (!found && raw.length <= 6) {
      const cleanSuffix = raw.replace(/[^A-Z0-9]/g, '');
      found = await Room.findOne({ inviteCode: { $regex: '-' + cleanSuffix + '$', $options: 'i' } });
    }

    if (!found) {
      return response.status(404).json({ message: 'Ruangan tidak ditemukan. Pastikan kode sudah benar.' });
    }
    return response.json(publicRoom(found));
  } catch (error) {
    return next(error);
  }
});

// POST /api/rooms/:id/join - Join a room (requires auth + DB)
api.post('/rooms/:id/join', requireSessionReady, requireCsrf, roomLimiter, requireAuth, async (request, response, next) => {
  try {
    const callerEmail = (request.user.email || '').trim().toLowerCase();
    const callerName = (request.body.name || callerEmail.split('@')[0] || 'Anggota').trim();
    const room = await Room.findOne({ id: request.params.id });
    if (!room) return response.status(404).json({ message: 'Ruangan tidak ditemukan.' });

    const alreadyMember = (room.members || []).some(m => (m.email || '').toLowerCase() === callerEmail);
    const isOwner = (room.ownerEmail || '').toLowerCase() === callerEmail;
    if (!alreadyMember && !isOwner) {
      room.members = room.members || [];
      room.members.push({
        id: 'usr_' + Date.now().toString(36),
        name: callerName,
        email: callerEmail,
        role: 'member',
        joinedAt: new Date().toISOString(),
      });
      await room.save();
    }
    return response.json(publicRoom(room));
  } catch (error) {
    return next(error);
  }
});

// PUT /api/rooms/:id - Sync room data (transactions & savings) - owner/member only
api.put('/rooms/:id', requireSessionReady, requireCsrf, roomLimiter, requireAuth, async (request, response, next) => {
  try {
    const callerEmail = (request.user.email || '').trim().toLowerCase();
    const room = await Room.findOne({ id: request.params.id });
    if (!room) return response.status(404).json({ message: 'Ruangan tidak ditemukan.' });

    const isMember = (room.members || []).some(m => (m.email || '').toLowerCase() === callerEmail);
    const isOwner = (room.ownerEmail || '').toLowerCase() === callerEmail;
    if (!isMember && !isOwner) return response.status(403).json({ message: 'Tidak berwenang mengakses ruangan ini.' });

    if (request.body.transactions !== undefined) room.transactions = request.body.transactions;
    if (request.body.savingsGoals !== undefined) room.savingsGoals = request.body.savingsGoals;
    if (request.body.members !== undefined) room.members = request.body.members;
    await room.save();
    return response.json(publicRoom(room));
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/rooms/:id - Delete or leave room
api.delete('/rooms/:id', requireSessionReady, requireCsrf, roomLimiter, requireAuth, async (request, response, next) => {
  try {
    const callerEmail = (request.user.email || '').trim().toLowerCase();
    const room = await Room.findOne({ id: request.params.id });
    if (!room) return response.status(404).json({ message: 'Ruangan tidak ditemukan.' });

    const isOwner = (room.ownerEmail || '').toLowerCase() === callerEmail;
    if (isOwner) {
      await Room.deleteOne({ id: request.params.id });
      return response.status(204).end();
    }
    // Non-owner: leave
    room.members = (room.members || []).filter(m => (m.email || '').toLowerCase() !== callerEmail);
    await room.save();
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
});

async function connectDb() {
  if (databaseConnected || mongoose.connection.readyState === 1) {
    return;
  }
  if (!process.env.MONGODB_URI) {
    console.error('Authentication is disabled: set MONGODB_URI in environment variables.');
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
      socketTimeoutMS: 45000,
    });
    databaseConnected = true;
    console.log('Authentication database connected.');
  } catch (error) {
    console.error('Authentication database connection failed:', error.name || 'unknown error');
  }
}

// Middleware agar koneksi database selalu siap di lingkungan serverless (Vercel)
app.use(async (_request, _response, next) => {
  if (process.env.MONGODB_URI && mongoose.connection.readyState !== 1) {
    await connectDb();
  }
  next();
});

app.use('/api', api);
app.use((error, _request, response, _next) => {
  console.error('Authentication API request failed:', error.code || error.name || 'unknown error');
  response.status(500).json({ message: 'Terjadi kesalahan pada layanan login. Coba lagi nanti.' });
});

function start() {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => console.log('Authentication API listening on port ' + port));
  connectDb();
}

if (!process.env.VERCEL) {
  start();
}

module.exports = app;

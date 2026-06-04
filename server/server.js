require('dotenv').config();
const fs           = require('fs');
const path         = require('path');
const express      = require('express');
const cors         = require('cors');
const http         = require('http');
const mongoose     = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const app    = express();
const server = http.createServer(app);
const isProd = process.env.NODE_ENV === 'production';

console.log('\n' + '='.repeat(70));
console.log('🚀 BEAST CRICKET AUCTION SERVER');
console.log('='.repeat(70));

// ── CORS ──────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://beastbca-client-production.up.railway.app',
  'https://beastbca-server-production.up.railway.app',
];

console.log('✅ CORS Origins:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || (isProd && origin?.includes('.railway.app'))) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));

app.options('*', cors());

// ── Middleware ────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (isProd) {
  app.use(helmet({ contentSecurityPolicy: false }));
}
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ── Request Logger ────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode >= 400 ? '❌' : '✅';
    console.log(`${status} [${res.statusCode}] ${req.method.padEnd(6)} ${req.path.padEnd(30)} ${duration}ms`);
  });
  next();
});

// ── Health Endpoints ──────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.get('/', (req, res) => res.json({ message: 'BCA Server OK', version: '1.0' }));

// ── Routes ────────────────────────────────
console.log('📍 Loading routes...');

try {
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth routes');
} catch (e) {
  console.error('❌ Auth error:', e.message);
}

try {
  app.use('/api/auctions', require('./routes/auctions'));
  console.log('✅ Auctions routes');
} catch (e) {
  console.error('❌ Auctions error:', e.message);
}

try {
  app.use('/api/admin', require('./routes/admin'));
  console.log('✅ Admin routes');
} catch (e) {
  console.error('❌ Admin error:', e.message);
}

try {
  app.use('/api/payments', require('./routes/payments'));
  console.log('✅ Payments routes');
} catch (e) {
  console.error('❌ Payments error:', e.message);
}

// ── 404 & Error ───────────────────────────
app.use((req, res) => {
  console.log('❌ 404:', req.method, req.path);
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

// ── MongoDB ────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    console.log('✅ MongoDB connected');

    // ── Email SMTP startup check ──────────────────────────
    try {
      const { verifyTransporter } = require('./utils/email');
      await verifyTransporter();
    } catch (e) {
      console.error('⚠️  Email startup check threw unexpectedly:', e.message);
    }

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log('='.repeat(70));
      console.log(`🌍 Server ready on port ${PORT}`);
      console.log(`📍 Frontend: https://beastbca-client-production.up.railway.app`);
      console.log(`📍 Backend: https://beastbca-server-production.up.railway.app`);
      console.log('='.repeat(70) + '\n');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB error:', err.message);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  console.log('⚠️  Shutting down...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      process.exit(0);
    });
  });
});

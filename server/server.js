require('dotenv').config();
const fs           = require('fs');
const path         = require('path');
const express      = require('express');
const cors         = require('cors');
const http         = require('http');
const mongoose     = require('mongoose');
const cookieParser = require('cookie-parser');

const app    = express();
const server = http.createServer(app);

console.log('\n' + '='.repeat(70));
console.log('🚀 BEAST CRICKET AUCTION - SERVER STARTING');
console.log('='.repeat(70));

// ── CORS ─────────────────────────────────
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));
app.options('*', cors());

console.log('✅ CORS: Enabled for all origins');

// ── Middleware ──────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Debug Logger ────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode >= 400 ? '❌' : '✅';
    console.log(`${status} [${res.statusCode}] ${req.method.toUpperCase().padEnd(6)} ${req.path.padEnd(30)} ${duration}ms`);
  });
  next();
});

// ── Health Endpoints ────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.get('/', (req, res) => res.json({ message: 'BCA Server OK' }));

// ── Routes ──────────────────────────────
console.log('📍 Loading routes...');

const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);
console.log('✅ /api/auth');

const auctionsRouter = require('./routes/auctions');
app.use('/api/auctions', auctionsRouter);
console.log('✅ /api/auctions');

const adminRouter = require('./routes/admin');
app.use('/api/admin', adminRouter);
console.log('✅ /api/admin');

// ── 404 & Errors ────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path, method: req.method });
});

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

// ── MongoDB ─────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('✅ MongoDB: Connected');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log('='.repeat(70));
      console.log(`🌍 Server ready on port ${PORT}`);
      console.log(`🌐 Frontend: https://beastbca-client-production.up.railway.app`);
      console.log(`📊 Backend: https://beastbca-server-production.up.railway.app`);
      console.log('='.repeat(70) + '\n');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB failed:', err.message);
    process.exit(1);
  });

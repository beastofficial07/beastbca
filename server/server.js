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
const isProd = process.env.NODE_ENV === 'production';

console.log('\n' + '='.repeat(70));
console.log('🚀 STARTING SERVER');
console.log('='.repeat(70));

// ── CORS ─────────────────────────────────
const corsOptions = {
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
};

console.log('✅ CORS enabled for all origins');
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Body Parsing ─────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

console.log('✅ Body parsing configured');

// ── Debug Middleware ─────────────────────
app.use((req, res, next) => {
  console.log(`\n📨 [${new Date().toLocaleTimeString()}] ${req.method.toUpperCase()} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   📦 Body:`, req.body);
  }
  next();
});

// ── Health Check ─────────────────────────
app.get('/health', (req, res) => {
  console.log('   ✅ Health check');
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  console.log('   ✅ API Health check');
  res.json({ ok: true, mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// ── Root Endpoint ────────────────────────
app.get('/', (req, res) => {
  console.log('   ✅ Root endpoint');
  res.json({ 
    message: 'BCA Auction API',
    status: 'running',
    endpoints: ['/health', '/api/health', '/api/auth/login', '/api/auth/register']
  });
});

// ── Auth Routes ──────────────────────────
console.log('📍 Loading auth routes...');

try {
  const authRouter = require('./routes/auth');
  app.use('/api/auth', authRouter);
  console.log('✅ Auth routes loaded on /api/auth');
} catch (err) {
  console.error('❌ Error loading auth routes:', err.message);
  console.error(err.stack);
}

// ── Auctions Routes ──────────────────────
console.log('📍 Loading auctions routes...');

try {
  const auctionsRouter = require('./routes/auctions');
  app.use('/api/auctions', auctionsRouter);
  console.log('✅ Auctions routes loaded on /api/auctions');
} catch (err) {
  console.error('❌ Error loading auctions routes:', err.message);
}

// ── Admin Routes ─────────────────────────
console.log('📍 Loading admin routes...');

try {
  const adminRouter = require('./routes/admin');
  app.use('/api/admin', adminRouter);
  console.log('✅ Admin routes loaded on /api/admin');
} catch (err) {
  console.error('❌ Error loading admin routes:', err.message);
}

// ── 404 Handler ──────────────────────────
app.use((req, res) => {
  console.log(`   ❌ 404: Route not found`);
  res.status(404).json({ 
    error: `${req.method} ${req.path} not found`,
    message: 'Check /health or /api/health for server status',
    available: [
      'GET  /health',
      'GET  /api/health',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET  /api/auctions/*',
      'GET  /api/admin/*'
    ]
  });
});

// ── Error Handler ────────────────────────
app.use((err, req, res, next) => {
  console.error(`   ❌ Error:`, err.message);
  res.status(err.status || 500).json({ 
    error: err.message,
    ...(isProd ? {} : { stack: err.stack })
  });
});

// ── MongoDB Connection ───────────────────
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable not set!');
  process.exit(1);
}

console.log('📊 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ MongoDB connected');
  
  // Start server
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(70));
    console.log('✨ SERVER IS READY');
    console.log('='.repeat(70));
    console.log(`🌍 Listening on port ${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Base URL: http://0.0.0.0:${PORT}`);
    console.log('\nTest endpoints:');
    console.log(`  - http://localhost:${PORT}/health`);
    console.log(`  - http://localhost:${PORT}/api/health`);
    console.log(`  - POST http://localhost:${PORT}/api/auth/login`);
    console.log('='.repeat(70) + '\n');
  });
})
.catch(err => {
  console.error('❌ Failed to connect to MongoDB:', err.message);
  console.error('Make sure MONGODB_URI is correct');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, shutting down...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ Server closed gracefully');
      process.exit(0);
    });
  });
});

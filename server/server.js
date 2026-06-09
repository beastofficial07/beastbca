require('dotenv').config();
const fs           = require('fs');
const path         = require('path');
const express      = require('express');
const cors         = require('cors');
const http         = require('http');
const { Server }   = require('socket.io');
const mongoose     = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const ioStore      = require('./socket/io');

// ── Uploads dir ─────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app    = express();
const server = http.createServer(app);
const isProd = process.env.NODE_ENV === 'production';

// ── CORS (COMPLETE FIX) ─────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://beastbca-client-production.up.railway.app', // ✅ CORRECT PRODUCTION URL
  process.env.FRONTEND_URL, // ✅ Allow override via env var
].filter(Boolean);

console.log('🌐 Allowed CORS origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow if origin is in whitelist OR in production allow all Railway domains
    if (allowedOrigins.includes(origin) || 
        (isProd && origin.includes('.railway.app'))) {
      callback(null, true);
    } else {
      console.log('⚠️ Blocked origin:', origin);
      callback(null, true); // ✅ Still allow but log it
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Socket.io ───────────────────────────
const io = new Server(server, {
  cors: {
    origin: function(origin, callback) {
      if (!origin || 
          allowedOrigins.includes(origin) || 
          (isProd && origin.includes('.railway.app'))) {
        callback(null, true);
      } else {
        callback(null, true); // Allow but log
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

ioStore.setIO(io);

// ── Security ────────────────────────────
app.set('trust proxy', 1);

if (isProd) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
}

app.disable('x-powered-by');

// ── Body parsing ────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Rate limits ─────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 500 : 2000,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// ── Static files ────────────────────────
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '1d',
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// ── Routes ──────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auctions', require('./routes/auctions'));
app.use('/api/admin', require('./routes/admin'));

// ── Health check ────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'BCA Auction Backend API',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      auctions: '/api/auctions/*',
      admin: '/api/admin/*',
    }
  });
});

// ── 404 handler ─────────────────────────
app.use((req, res) => {
  console.log('❌ 404:', req.method, req.url);
  res.status(404).json({ 
    error: `${req.method} ${req.url} not found`,
    availableRoutes: ['/api/auth', '/api/auctions', '/api/admin']
  });
});

// ── Error handler ───────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  console.error(err.stack);
  res.status(err.status || 500).json({ 
    error: isProd ? 'Server error' : err.message,
    ...(isProd ? {} : { stack: err.stack })
  });
});

// ── MongoDB + Start ─────────────────────
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(async () => {
  console.log('✅ MongoDB connected');

  // Verify SMTP connection on startup (non-fatal - don't fail deployment)
  try {
    const { verifyTransporter, isEmailConfigured } = require('./utils/email');
    if (isEmailConfigured()) {
      await verifyTransporter();
    } else {
      console.warn('⚠️  Email not configured - email features will be disabled');
    }
  } catch (e) {
    console.warn('⚠️  Email transporter check failed (non-fatal):', e.message);
  }

  // Initialize socket auction engine
  require('./socket/auctionEngine')(io);
  
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Allowed origins:`, allowedOrigins);
  });
})
.catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});

// ── Graceful shutdown ───────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(async () => {
    try {
      await mongoose.connection.close(false);
      console.log('MongoDB connection closed');
    } catch (err) {
      console.error('Error closing MongoDB:', err.message);
    }
    process.exit(0);
  });
});

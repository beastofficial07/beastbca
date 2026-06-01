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

console.log('\n' + '='.repeat(60));
console.log('🔍 SERVER CONFIGURATION:');
console.log('='.repeat(60));
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || '❌ NOT SET!');
console.log('='.repeat(60) + '\n');

// ── CORS (COMPLETE FIX) ─────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'https://beastbca-client-production.up.railway.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

console.log('🌐 Allowed CORS origins:');
allowedOrigins.forEach((origin, i) => {
  console.log(`   ${i + 1}. ${origin}`);
});

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('✅ No origin header - allowing');
      return callback(null, true);
    }
    
    // Allow if origin is in whitelist OR in production allow all Railway domains
    if (allowedOrigins.includes(origin) || 
        (isProd && origin.includes('.railway.app'))) {
      console.log(`✅ CORS Allowed origin: ${origin}`);
      callback(null, true);
    } else {
      console.log(`⚠️  Note: origin ${origin} (allowing anyway)`);
      callback(null, true); // Allow all for now
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
        callback(null, true);
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

// ── Debug middleware ────────────────────
app.use((req, res, next) => {
  console.log(`📨 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   Body:`, JSON.stringify(req.body).substring(0, 100));
  }
  next();
});

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
console.log('📍 Loading API routes...\n');

try {
  const authRouter = require('./routes/auth');
  app.use('/api/auth', authRouter);
  console.log('✅ /api/auth routes loaded');
} catch (err) {
  console.error('❌ Failed to load auth routes:', err.message);
}

try {
  const auctionsRouter = require('./routes/auctions');
  app.use('/api/auctions', auctionsRouter);
  console.log('✅ /api/auctions routes loaded');
} catch (err) {
  console.error('❌ Failed to load auctions routes:', err.message);
}

try {
  const adminRouter = require('./routes/admin');
  app.use('/api/admin', adminRouter);
  console.log('✅ /api/admin routes loaded\n');
} catch (err) {
  console.error('❌ Failed to load admin routes:', err.message);
}

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
    env: process.env.NODE_ENV,
    frontend: process.env.FRONTEND_URL,
    endpoints: {
      health: '/api/health',
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      auctions: '/api/auctions/*',
      admin: '/api/admin/*',
    }
  });
});

// ── 404 handler ─────────────────────────
app.use((req, res) => {
  console.log('❌ 404 Not Found:', req.method, req.url);
  res.status(404).json({ 
    error: `${req.method} ${req.url} not found`,
    availableRoutes: {
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      health: 'GET /api/health',
      auctions: 'GET /api/auctions/*',
      admin: 'GET /api/admin/*'
    }
  });
});

// ── Error handler ───────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  if (!isProd) {
    console.error(err.stack);
  }
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

console.log('🔗 Connecting to MongoDB...');
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(async () => {
  console.log('✅ MongoDB connected\n');

  // Verify SMTP connection on startup (non-fatal - don't fail deployment)
  try {
    const { verifyTransporter, isEmailConfigured } = require('./utils/email');
    if (isEmailConfigured()) {
      console.log('📧 Verifying email service...');
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
    console.log('\n' + '='.repeat(60));
    console.log('🚀 SERVER STARTED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`🌍 Port: ${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
    console.log(`📊 MongoDB: Connected`);
    console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
    console.log(`🔐 CORS Origins: ${allowedOrigins.length} allowed`);
    console.log('='.repeat(60) + '\n');
    console.log('Ready to accept requests!\n');
  });
})
.catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});

// ── Graceful shutdown ───────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

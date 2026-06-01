import axios from 'axios';

const TOKEN_KEY = 'bca_token';

export const saveToken = (t: string) => {
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
};

export const getToken = (): string => {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};

export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
};

// ✅ FIXED: Use environment variable directly with proper fallback
const BASE = (() => {
  if (typeof window === 'undefined') return 'http://localhost:5000';
  
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env.replace(/\/+$/, '');
  
  // Fallback: detect from current URL in production
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isDev ? 'http://localhost:5000' : `${window.location.protocol}//${window.location.host}`;
})();

console.log('🌐 API Base URL:', BASE);

export const imgUrl = (src?: string | null): string => {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  return `${BASE}${src.startsWith('/') ? '' : '/'}${src}`;
};

const api = axios.create({
  baseURL: `${BASE}/api`,
  withCredentials: true,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  console.log(`🌐 API ${config.method?.toUpperCase()} → ${config.baseURL}${config.url}`);
  console.log(`   Headers:`, { Authorization: token ? '✅ Bearer token' : '❌ No token' });
  return config;
});

api.interceptors.response.use(
  (res) => {
    console.log(`✅ Response [${res.status}]:`, res.data);
    return res;
  },
  (err) => {
    console.error(`❌ Error [${err.response?.status}]:`, err.response?.data || err.message);
    
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const p = window.location.pathname;
      const pub = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];
      if (!pub.some(pp => p.startsWith(pp)) && p !== '/') {
        clearToken();
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

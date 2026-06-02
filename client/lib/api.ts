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

// NEXT_PUBLIC_* vars are inlined at build time. If the build environment
// did not have NEXT_PUBLIC_API_URL set, the var will be undefined at runtime
// and we must never fall back to window.location.origin (the client domain).
const PRODUCTION_API_URL = 'https://beastbca-server-production.up.railway.app';

const BASE = (() => {
  const env = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;

  // SSR / build-time path — no window available
  if (typeof window === 'undefined') return 'http://localhost:5000';

  const isDev =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  // In development fall back to the local backend; in production always use
  // the known backend URL so requests never hit the client's own domain.
  return isDev ? 'http://localhost:5000' : PRODUCTION_API_URL;
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
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  } else if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  console.log(`📡 ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

api.interceptors.response.use(
  (res) => {
    console.log(`✅ [${res.status}]`, res.data);
    return res;
  },
  (err) => {
    console.error(`❌ [${err.response?.status}]`, err.response?.data?.error || err.message);
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

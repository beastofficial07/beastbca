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

// ✅ FIXED: Properly detect API URL
const BASE = (() => {
  // If running on server side
  if (typeof window === 'undefined') return 'http://localhost:5000';
  
  // Try environment variable first
  const env = process.env.NEXT_PUBLIC_API_URL;
  console.log('📦 NEXT_PUBLIC_API_URL env:', env);
  
  if (env) {
    const cleaned = env.replace(/\/+$/, '');
    console.log('🌐 Using env URL:', cleaned);
    return cleaned;
  }
  
  // In production, detect from current domain
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (isDev) {
    console.log('🔧 Development mode detected');
    return 'http://localhost:5000';
  }
  
  // Production: same domain as frontend
  const url = `${window.location.protocol}//${window.location.host}`;
  console.log('🚀 Production mode - using:', url);
  return url;
})();

console.log('✅ API Base URL configured:', BASE);

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
  
  // Set authorization header
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Handle FormData
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  } else if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  
  const fullUrl = `${config.baseURL}${config.url}`;
  console.log(`\n🌐 API Request:`);
  console.log(`   Method: ${config.method?.toUpperCase()}`);
  console.log(`   URL: ${fullUrl}`);
  console.log(`   Token: ${token ? '✅ Present' : '❌ Missing'}`);
  console.log(`   Data:`, config.data);
  
  return config;
});

api.interceptors.response.use(
  (res) => {
    console.log(`✅ Response [${res.status}]:`);
    console.log(`   Data:`, res.data);
    return res;
  },
  (err) => {
    const status = err.response?.status || 'No response';
    const errorData = err.response?.data || err.message;
    
    console.error(`\n❌ API Error:`);
    console.error(`   Status: ${status}`);
    console.error(`   URL: ${err.config?.url}`);
    console.error(`   Message:`, errorData);
    console.error(`   Full Error:`, err);
    
    // Handle 401 - redirect to login
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

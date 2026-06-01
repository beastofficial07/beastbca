'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import api, { saveToken } from '@/lib/api';

type FormData = { email: string; password: string };

const ROLES = [
  { id: 'organizer', label: 'Organizer', icon: '🎬' },
  { id: 'team_owner', label: 'Team Owner', icon: '🏆' },
  { id: 'viewer', label: 'Viewer', icon: '👁️' },
];

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    if (!selectedRole) {
      setError('Please select a role');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      console.log('🔐 Attempting login...');
      const res = await api.post('/auth/login', {
        email: data.email.trim().toLowerCase(),
        password: data.password,
        role: selectedRole,
      });

      console.log('✅ Login successful!');
      if (res.data.token) {
        saveToken(res.data.token);
      }

      const role = res.data.user?.role;
      setTimeout(() => {
        if (role === 'admin' || role === 'organizer') {
          window.location.href = '/dashboard/organizer';
        } else if (role === 'team_owner') {
          window.location.href = '/dashboard/team-owner';
        } else {
          window.location.href = '/auctions';
        }
      }, 500);
    } catch (e: any) {
      console.error('❌ Login failed:', e);
      const msg = e.response?.data?.error || 'Login failed. Please try again.';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md mx-4 p-8 bg-gray-800 rounded-lg shadow-xl">
        <h1 className="text-3xl font-bold text-center mb-8 text-white">Login</h1>

        {/* Role Selection */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setSelectedRole(r.id);
                setError(null);
              }}
              className={`p-3 rounded-lg border-2 transition-all ${
                selectedRole === r.id
                  ? 'border-blue-500 bg-blue-500/20'
                  : 'border-gray-600 bg-gray-700'
              }`}
            >
              <div className="text-2xl">{r.icon}</div>
              <div className="text-xs font-semibold mt-1">{r.label}</div>
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input
            {...register('email', { required: 'Email is required' })}
            type="email"
            placeholder="Email"
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
            disabled={loading}
          />
          {errors.email && <p className="text-red-400 text-sm">{errors.email.message}</p>}

          <input
            {...register('password', { required: 'Password is required' })}
            type="password"
            placeholder="Password"
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
            disabled={loading}
          />
          {errors.password && <p className="text-red-400 text-sm">{errors.password.message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Links */}
        <div className="mt-6 text-center space-y-2 text-sm">
          <p className="text-gray-400">
            Don't have an account?{' '}
            <Link href="/register" className="text-blue-400 hover:underline">
              Register
            </Link>
          </p>
          <Link href="/forgot-password" className="text-blue-400 hover:underline block">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}

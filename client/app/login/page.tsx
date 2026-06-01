'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import api, { saveToken } from '@/lib/api';
import GoldParticles from '@/components/beast/GoldParticles';
import FireSparkles from '@/components/beast/FireSparkles';
import BeastLogo from '@/components/beast/BeastLogo';

type F = { email: string; password: string };

const ROLES = [
  { id:'organizer',  icon:'🎬', label:'Organizer',  color:'from-amber-500/30 to-yellow-600/10', tagline:'Command Center Access' },
  { id:'team_owner', icon:'🏆', label:'Team Owner', color:'from-blue-500/30 to-cyan-600/10',   tagline:'War Room Access' },
  { id:'viewer',     icon:'👁️', label:'Viewer',     color:'from-emerald-500/30 to-green-600/10',tagline:'Live Arena Access' },
];

function mapError(msg: string, data?: any) {
  if (msg.includes('No account') || msg.includes('not found'))
    return { text:'No account with this email.', hint:'Check spelling or register first.', link:{ label:'Register →', href:'/register' } };
  if (data?.notVerified || msg.includes('not verified') || msg.includes('verify'))
    return { text:'Email not verified.', hint:'Check your inbox and click the verification link.', link:{ label:'Resend verification →', href:'/register' } };
  if (msg.includes('Incorrect') || msg.includes('password') || msg.includes('Wrong'))
    return { text:'Wrong password.', hint:'Check caps lock or reset below.', link:{ label:'Forgot password →', href:'/forgot-password' } };
  return { text: msg || 'Login failed.', hint:'' };
}

export default function LoginPage() {
  const [loading,      setLoading]      = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [formError,    setFormError]    = useState<any>(null);
  const { register, handleSubmit, formState:{ errors } } = useForm<F>();

  const onSubmit = async (d: F) => {
    if (!selectedRole) {
      setFormError({ text:'Please select your role first.' });
      return;
    }

    setFormError(null);
    setLoading(true);

    try {
      console.log('🔐 Attempting login...');
      console.log('📧 Email:', d.email.trim().toLowerCase());
      console.log('🎭 Role:', selectedRole);
      
      const res = await api.post('/auth/login', {
        email: d.email.trim().toLowerCase(),
        password: d.password,
        role: selectedRole
      });

      console.log('✅ Login successful!');
      console.log('📦 Response:', res.data);

      if (res.data.token) {
        console.log('🔑 Saving token to localStorage');
        saveToken(res.data.token);
        localStorage.setItem('role', res.data.user.role);
      }

      const actualRole = res.data.user?.role;
      console.log('👤 User role:', actualRole);

      // Proper role-based routing
      if (actualRole === 'organizer' || actualRole === 'admin') {
        console.log('📊 Redirecting to organizer dashboard');
        setTimeout(() => {
          window.location.href = '/dashboard/organizer';
        }, 500);
      } else if (actualRole === 'team_owner') {
        console.log('🏆 Redirecting to team owner dashboard');
        setTimeout(() => {
          window.location.href = '/dashboard/team-owner';
        }, 500);
      } else {
        console.log('👁️ Redirecting to auctions');
        setTimeout(() => {
          window.location.href = '/auctions';
        }, 500);
      }

    } catch (e: any) {
      console.error('❌ Login failed!');
      console.error('Error object:', e);
      console.error('Status:', e.response?.status);
      console.error('Error message:', e.response?.data?.error);
      console.error('Full error data:', e.response?.data);
      
      let errorMsg = 'Login failed.';
      if (e.response?.data?.error) {
        errorMsg = e.response.data.error;
      } else if (e.message) {
        errorMsg = e.message;
      }
      
      setFormError(mapError(errorMsg, e.response?.data));
      setLoading(false);
    }
  };

  const chosen = ROLES.find(r => r.id === selectedRole);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage:"url('/stadium-bg.jpg')" }}/>
      <div className="absolute inset-0" style={{ background:'radial-gradient(ellipse at center,transparent 20%,hsl(222 47% 6% / 0.95) 70%)' }}/>
      {[{ left:'10%', rotate:'-12deg' },{ left:'90%', rotate:'12deg' }].map((b,i)=>(
        <div key={i} className="absolute top-0 pointer-events-none"
          style={{ left:b.left,width:120,height:'60vh',
            background:'linear-gradient(180deg,hsla(45,100%,90%,0.8) 0%,transparent 100%)',
            transform:`rotate(${b.rotate})`,
            transformOrigin:'top center',
            filter:'blur(25px)',
            opacity:0.06 }}/>
      ))}
      <GoldParticles/>
      <FireSparkles/>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="flex justify-center mb-5 opacity-0 animate-slide-up">
          <BeastLogo size={100} glow float3d href="/"/>
        </div>

        {chosen && (
          <div className="flex justify-center mb-4 opacity-0 animate-slide-up">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r ${chosen.color} border-gold-subtle`}>
              <span className="text-lg">{chosen.icon}</span>
              <span className="font-heading text-sm uppercase tracking-[0.15em] text-primary">{chosen.label}</span>
              <span className="text-muted-foreground text-xs font-display">— {chosen.tagline}</span>
            </div>
          </div>
        )}

        <div className="bg-glass-premium rounded-xl p-7 gold-edge opacity-0 animate-slide-up">
          <h2 className="font-heading text-2xl uppercase tracking-wider text-center mb-1 text-foreground">
            Welcome Back
          </h2>

          <p className="text-center text-muted-foreground text-sm mb-5 font-display">
            Select your role to continue
          </p>

          <div className="grid grid-cols-3 gap-2 mb-5">
            {ROLES.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setSelectedRole(r.id); setFormError(null); }}
                className={`relative rounded-lg p-3 text-center transition-all duration-300 ${
                  selectedRole===r.id ? 'border-gold glow-gold' : 'border-gold-subtle'
                }`}
              >
                <div className="text-2xl mb-1">{r.icon}</div>
                <div className="font-heading text-[10px] uppercase tracking-wider">
                  {r.label}
                </div>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <input 
                {...register('email', { required: 'Email is required' })} 
                type="email" 
                placeholder="Email" 
                className="input-beast w-full"
                disabled={loading}
              />
              {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
            </div>
            
            <div>
              <input 
                {...register('password', { required: 'Password is required' })} 
                type="password" 
                placeholder="Password" 
                className="input-beast w-full"
                disabled={loading}
              />
              {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div className="text-right -mt-2">
              <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot Password?
              </Link>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3 bg-primary rounded disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Signing In...' : 'Login'}
            </button>

            <AnimatePresence>
              {formError && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-destructive text-xs font-heading bg-destructive/10 rounded-lg px-3 py-2 space-y-1 border border-destructive/20"
                >
                  <p className="font-bold">{formError.text}</p>
                  {formError.hint && <p className="text-muted-foreground font-display text-[11px]">{formError.hint}</p>}
                  {formError.link && (
                    <Link href={formError.link.href} className="text-primary underline font-heading block pt-1">
                      {formError.link.label}
                    </Link>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          <div className="mt-4 text-center">
            <p className="text-sm text-muted-foreground">Don't have an account? <Link href="/register" className="text-primary hover:underline font-heading">Register</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}

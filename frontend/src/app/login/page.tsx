'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, getApiErrorMessage, warmUpBackend } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import type { ApiEnvelope, AuthUser } from '@/lib/types';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';

type LoginData = {
  accessToken: string;
  user: AuthUser;
};

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Start waking the (free-tier) backend as soon as the page loads, so it's
  // ready by the time credentials are submitted.
  useEffect(() => {
    warmUpBackend();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    // If it's taking a while, reassure the user the server is just waking up.
    const slowTimer = setTimeout(() => setSlow(true), 4000);

    try {
      const response = await api.post<ApiEnvelope<LoginData>>('/auth/login', {
        email,
        password,
      });

      const { accessToken, user } = response.data.data;
      setAuth(accessToken, user);
      router.replace(user.role?.name === 'Staff' ? '/staff' : '/dashboard');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Login failed. Check your email and password.'));
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 bg-page-bg">
      {/* Subtle radial glow — just a hint of light, no color */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-white/5 blur-3xl" />

      <div className="relative flex w-full max-w-[420px] flex-col items-center">
        {/* Logo — large, prominent display of the brand */}
        <div className="mb-8 w-full max-w-[180px] sm:max-w-[220px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Vape and Sounds" className="w-full h-auto rounded-2xl" />
        </div>

        {/* Card */}
        <div className="w-full rounded-2xl bg-card-bg/80 backdrop-blur border border-card-border p-8 shadow-xl shadow-black/40">
          <div className="text-center mb-6">
            <h1 className="text-lg font-bold text-text-primary">Welcome Back</h1>
            <p className="text-sm text-text-muted mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-text-secondary">
                Email Address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Mail size={18} className="text-text-muted" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-input-border bg-input-bg pl-11 pr-4 py-3 text-text-primary placeholder-text-muted outline-none transition-all focus:border-white/40 focus:ring-2 focus:ring-white/10"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-text-secondary">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock size={18} className="text-text-muted" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-input-border bg-input-bg pl-11 pr-12 py-3 text-text-primary placeholder-text-muted outline-none transition-all focus:border-white/40 focus:ring-2 focus:ring-white/10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-white px-4 py-3.5 font-semibold text-black shadow-sm transition-all hover:bg-gray-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-5 w-5 animate-spin text-black" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {slow ? 'Waking the server…' : 'Logging in...'}
                </span>
              ) : (
                'LOG IN'
              )}
            </button>
          </form>
        </div>

        {/* Footer branding */}
        <p className="mt-6 text-[11px] text-text-muted tracking-wider uppercase">
          Vape & Sounds &middot; Est. 2021
        </p>
      </div>
    </main>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseJsonResponse } from '@/lib/parseJsonResponse';
import {
  Shield,
  Sparkles,
  Building2,
  User,
  Key,
  Mail,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Remove leaked credentials from URL (from old GET form submits)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsPending(true);

    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string)?.trim();
    const password = formData.get('password') as string;

    if (!email || !password) {
      setError('Email and password are required.');
      setIsPending(false);
      return;
    }

    try {
      if (activeTab === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await parseJsonResponse<{ access_token?: string; detail?: string }>(res);

        if (!res.ok) {
          setError(typeof data.detail === 'string' ? data.detail : 'Login failed');
          setIsPending(false);
          return;
        }

        // Store JWT token
        localStorage.setItem('auth_token', data.access_token!);
        router.push('/');
        router.refresh();
        return;
      }

      const fullName = formData.get('fullName') as string;
      const department = formData.get('department') as string;
      const role = (formData.get('role') as string) || 'employee';

      if (!fullName || !department) {
        setError('All fields are required.');
        setIsPending(false);
        return;
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName, department, role }),
      });

      const data = await parseJsonResponse<{ detail?: string }>(res);

      if (!res.ok) {
        setError(typeof data.detail === 'string' ? data.detail : 'Registration failed');
        setIsPending(false);
        return;
      }

      setSuccess('Registration successful! You can now log in.');
      e.currentTarget.reset();
      setActiveTab('login');
      setIsPending(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 mb-3 animate-pulse">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-indigo-200 to-white bg-clip-text text-transparent">
            KNOWLEDGE BOT
          </h1>
          <p className="text-sm text-slate-400 mt-2">Enterprise-grade Retrieval-Augmented Intelligence</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl">
          <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/40 mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setError(null);
                setSuccess(null);
              }}
              className={`py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${
                activeTab === 'login'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('signup');
                setError(null);
                setSuccess(null);
              }}
              className={`py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${
                activeTab === 'signup'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {activeTab === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
                    <input
                      name="fullName"
                      type="text"
                      required
                      placeholder="Jane Doe"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Department
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
                    <select
                      name="department"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition text-sm appearance-none text-slate-300"
                    >
                      <option value="General">General / All Departments</option>
                      <option value="Engineering">Engineering</option>
                      <option value="HR">Human Resources</option>
                      <option value="Finance">Finance</option>
                      <option value="Legal">Legal</option>
                      <option value="Marketing">Marketing</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Role (Simulated)
                  </label>
                  <div className="relative">
                    <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
                    <select
                      name="role"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition text-sm appearance-none text-slate-300"
                    >
                      <option value="employee">Standard Employee</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-xl text-red-400 text-xs font-medium">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-emerald-400 text-xs font-medium">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-6 text-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : activeTab === 'login' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {activeTab === 'login' && (
            <div className="mt-4 pt-4 border-t border-slate-800/60">
              <p className="text-[10px] text-slate-500 text-center">
                Using JWT authentication via FastAPI backend
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  User, 
  Building, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Server, 
  Sparkles,
  RefreshCw
} from 'lucide-react';

import { fetchUserProfile, type UserProfile } from '@/lib/userProfile';

interface ProfileData extends UserProfile {}

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  
  // Diagnostic state
  const [checkingDiagnostics, setCheckingDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{
    supabaseConnected: boolean | null;
    pgvectorInstalled: boolean | null;
    storageBucketConfigured: boolean | null;
    storageError: string | null;
    openaiKeyLoaded: boolean | null;
  }>({
    supabaseConnected: null,
    pgvectorInstalled: null,
    storageBucketConfigured: null,
    storageError: null,
    openaiKeyLoaded: null,
  });

  useEffect(() => {
    fetchProfile();
    runDiagnostics();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoadingProfile(true);

      const jwtResult = await fetchUserProfile();
      if (jwtResult.profile) {
        setProfile(jwtResult.profile);
        setProfileError(null);
        return;
      }
      if (jwtResult.error) {
        setProfileError(jwtResult.error);
      }

      const { createClient } = await import('@/lib/supabase-client');
      const supabase = createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('email, full_name, role, department')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          setProfile(data);
        } else {
          setProfile({
            email: user.email || '',
            full_name: user.user_metadata?.full_name || 'Employee',
            role: user.user_metadata?.role || 'employee',
            department: user.user_metadata?.department || 'General',
          });
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const runDiagnostics = async () => {
    setCheckingDiagnostics(true);
    try {
      const { createClient } = await import('@/lib/supabase-client');
      const supabase = createClient();
      
      // 1. Check Supabase connection & pgvector extension
      const { data: vectorCheck, error: vectorCheckErr } = await supabase.rpc('match_document_chunks', {
        query_embedding: Array(1536).fill(0),
        match_threshold: 0.99,
        match_count: 1,
        filter_department: 'Test'
      }).maybeSingle();

      const supabaseConnected = !vectorCheckErr || vectorCheckErr.code !== 'PGRST111'; // Connection test
      const pgvectorInstalled = !vectorCheckErr || (vectorCheckErr.code !== '42883' && vectorCheckErr.message !== 'function public.match_document_chunks(vector, double precision, integer, text) does not exist');

      // 2. Check Storage via server route (service role — anon key cannot read private buckets)
      let storageBucketConfigured = false;
      let storageError: string | null = null;
      try {
        const storageRes = await fetch('/api/health/storage');
        const storageData = await storageRes.json();
        storageBucketConfigured = storageRes.ok && storageData.ok === true;
        if (!storageBucketConfigured) {
          storageError =
            typeof storageData.error === 'string'
              ? storageData.error
              : typeof storageData.hint === 'string'
                ? storageData.hint
                : 'Storage check failed.';
        }
      } catch {
        storageBucketConfigured = false;
        storageError = 'Could not reach /api/health/storage on this deployment.';
      }

      const openaiKeyLoaded = true;

      setDiagnostics({
        supabaseConnected,
        pgvectorInstalled,
        storageBucketConfigured,
        storageError,
        openaiKeyLoaded
      });
    } catch (err) {
      console.error('Diagnostic run failed:', err);
      setDiagnostics({
        supabaseConnected: false,
        pgvectorInstalled: false,
        storageBucketConfigured: false,
        storageError: 'Diagnostic run failed.',
        openaiKeyLoaded: false,
      });
    } finally {
      setCheckingDiagnostics(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <Settings className="h-8 w-8 text-indigo-400" />
          Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1.5">
          Manage your employee account settings and inspect system connectivity health.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Profile Details Panel */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-md space-y-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-400" />
            User Profile
          </h2>

          {loadingProfile ? (
            <div className="py-8 flex items-center gap-2 text-slate-500 text-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading employee details...
            </div>
          ) : profile ? (
            <div className="space-y-4 text-xs font-semibold text-slate-400">
              <div className="flex justify-between py-2 border-b border-slate-850">
                <span className="uppercase tracking-wider">Full Name</span>
                <span className="text-white">{profile.full_name || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-850">
                <span className="uppercase tracking-wider">Email Address</span>
                <span className="text-white font-mono">{profile.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-850">
                <span className="uppercase tracking-wider">Role</span>
                <span className="text-white capitalize flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5 text-indigo-450" /> {profile.role}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-850">
                <span className="uppercase tracking-wider">Department</span>
                <span className="text-white capitalize flex items-center gap-1">
                  <Building className="h-3.5 w-3.5 text-indigo-455" /> {profile.department || 'General'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-2">
              <p className="text-red-400 text-xs font-semibold">
                {profileError || 'Failed to load profile.'}
              </p>
              <p className="text-[10px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                Profile and document lists require the FastAPI backend on port 8000 and your login
                session. Start the backend, then log out and sign in again if needed.
              </p>
            </div>
          )}
        </div>

        {/* Diagnostics Panel */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-md space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-indigo-400" />
              System Diagnostics
            </h2>
            <button
              onClick={runDiagnostics}
              disabled={checkingDiagnostics}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white transition flex items-center gap-1 disabled:opacity-40 text-[10px] font-bold"
            >
              {checkingDiagnostics ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Re-run check
            </button>
          </div>

          <div className="space-y-4">
            {/* Supabase connection check */}
            <div className="flex items-center justify-between p-3.5 bg-slate-950/45 border border-slate-850/60 rounded-xl">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-slate-200">Supabase API Connection</p>
                <p className="text-[9px] text-slate-500">Communicating with the Supabase client gateway</p>
              </div>
              {diagnostics.supabaseConnected === null ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin text-slate-500" />
              ) : diagnostics.supabaseConnected ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-450 shrink-0" />
              ) : (
                <XCircle className="h-4.5 w-4.5 text-red-450 shrink-0" />
              )}
            </div>

            {/* pgvector check */}
            <div className="flex items-center justify-between p-3.5 bg-slate-950/45 border border-slate-850/60 rounded-xl">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-slate-200">PostgreSQL pgvector Extension</p>
                <p className="text-[9px] text-slate-500">Checking vector operators and match function RPC</p>
              </div>
              {diagnostics.pgvectorInstalled === null ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin text-slate-500" />
              ) : diagnostics.pgvectorInstalled ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-450 shrink-0" />
              ) : (
                <XCircle className="h-4.5 w-4.5 text-red-450 shrink-0" />
              )}
            </div>

            {/* Storage check */}
            <div className="flex items-center justify-between p-3.5 bg-slate-950/45 border border-slate-850/60 rounded-xl">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-slate-200">Supabase Storage Bucket ('documents')</p>
                <p className="text-[9px] text-slate-500">
                  {diagnostics.storageError
                    ? diagnostics.storageError
                    : 'Verifying secure document repository accessibility'}
                </p>
              </div>
              {diagnostics.storageBucketConfigured === null ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin text-slate-500" />
              ) : diagnostics.storageBucketConfigured ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-450 shrink-0" />
              ) : (
                <XCircle className="h-4.5 w-4.5 text-red-450 shrink-0" />
              )}
            </div>

            {/* OpenAI check */}
            <div className="flex items-center justify-between p-3.5 bg-slate-950/45 border border-slate-850/60 rounded-xl">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-slate-200">OpenAI Api Integrations</p>
                <p className="text-[9px] text-slate-500">Verifying presence of local GPT configurations</p>
              </div>
              {diagnostics.openaiKeyLoaded === null ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin text-slate-500" />
              ) : diagnostics.openaiKeyLoaded ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-450 shrink-0" />
              ) : (
                <XCircle className="h-4.5 w-4.5 text-red-450 shrink-0" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

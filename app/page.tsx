import React from 'react';
import Link from 'next/link';
import { 
  FileText, 
  MessageSquare, 
  Users, 
  Clock, 
  Upload, 
  ArrowRight, 
  Calendar,
  Building,
  UserCheck
} from 'lucide-react';
import { getAuthenticatedUser } from '@/lib/backend-auth';
import { createAdminClient } from '@/lib/supabase-server';
import { canAccessDocument } from '@/lib/documentAccess';

export const dynamic = 'force-dynamic';

async function getDashboardMetrics(user: Awaited<ReturnType<typeof getAuthenticatedUser>>) {
  if (!user) {
    return { docCount: 0, chatCount: 0, userCount: 0, uploadCount: 0 };
  }

  const supabaseAdmin = createAdminClient();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [docsRes, chatsRes, usersRes] = await Promise.all([
    supabaseAdmin.from('documents').select('id, department, uploaded_by, created_at'),
    supabaseAdmin
      .from('chat_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
  ]);

  const accessible = (docsRes.data || []).filter((doc) => canAccessDocument(user, doc));
  const uploadCount = accessible.filter(
    (doc) => new Date(doc.created_at) >= startOfToday
  ).length;

  return {
    docCount: accessible.length,
    chatCount: chatsRes.count || 0,
    userCount: usersRes.count || 0,
    uploadCount,
  };
}

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  const metrics = await getDashboardMetrics(user);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 p-6 rounded-2xl border border-slate-800/80 shadow-lg">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Welcome to Enterprise Knowledge Bot
          </h1>
          <p className="text-slate-400 text-sm mt-1.5">
            Access secure RAG-based search and insights across company documents.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/chat"
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl transition shadow-md shadow-violet-600/10 flex items-center gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            Start Chatting
          </Link>
          <Link
            href="/upload"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Upload Document
          </Link>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Documents */}
        <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Documents</p>
            <h3 className="text-2xl font-bold text-white">{metrics.docCount}</h3>
            <p className="text-[10px] text-slate-500">Accessible files</p>
          </div>
          <div className="p-3.5 bg-violet-600/10 border border-violet-500/25 rounded-xl text-violet-400">
            <FileText className="h-6 w-6" />
          </div>
        </div>

        {/* Total Chats */}
        <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Conversations</p>
            <h3 className="text-2xl font-bold text-white">{metrics.chatCount}</h3>
            <p className="text-[10px] text-slate-500">Active chats</p>
          </div>
          <div className="p-3.5 bg-indigo-600/10 border border-indigo-500/25 rounded-xl text-indigo-400">
            <MessageSquare className="h-6 w-6" />
          </div>
        </div>

        {/* Total Users */}
        <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Team Members</p>
            <h3 className="text-2xl font-bold text-white">{metrics.userCount}</h3>
            <p className="text-[10px] text-slate-500">Active users</p>
          </div>
          <div className="p-3.5 bg-emerald-600/10 border border-emerald-500/25 rounded-xl text-emerald-400">
            <Users className="h-6 w-6" />
          </div>
        </div>

        {/* Recent Uploads */}
        <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recent Uploads</p>
            <h3 className="text-2xl font-bold text-white">{metrics.uploadCount}</h3>
            <p className="text-[10px] text-slate-500">Today</p>
          </div>
          <div className="p-3.5 bg-cyan-600/10 border border-cyan-500/25 rounded-xl text-cyan-400">
            <Clock className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Quick Access */}
        <div className="bg-slate-900/40 border border-slate-800/60 p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/chat" className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition group">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-indigo-400" />
                <span className="text-sm text-slate-200">Start a New Conversation</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-400 transition" />
            </Link>
            <Link href="/upload" className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition group">
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-violet-400" />
                <span className="text-sm text-slate-200">Upload a Document</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-400 transition" />
            </Link>
            <Link href="/settings" className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition group">
              <div className="flex items-center gap-3">
                <UserCheck className="h-5 w-5 text-emerald-400" />
                <span className="text-sm text-slate-200">View Settings</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-400 transition" />
            </Link>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-slate-900/40 border border-slate-800/60 p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-semibold text-white mb-4">System Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-emerald-950/30 border border-emerald-900/60 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-emerald-400">Authentication Service</span>
              </div>
              <span className="text-xs font-medium text-emerald-400">Active</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-slate-500 rounded-full"></div>
                <span className="text-sm text-slate-400">Document Processing</span>
              </div>
              <span className="text-xs font-medium text-slate-400">Ready</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-slate-500 rounded-full"></div>
                <span className="text-sm text-slate-400">Vector Database</span>
              </div>
              <span className="text-xs font-medium text-slate-400">Connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

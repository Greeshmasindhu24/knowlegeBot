'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  FileText, 
  MessageSquare, 
  UploadCloud, 
  Loader2, 
  Search,
  Calendar,
  Code,
  Building,
  Terminal,
  Activity,
  AlertOctagon
} from 'lucide-react';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  details: any;
  ip_address: string | null;
  created_at: string;
  users: {
    email: string;
  } | null;
}

interface AdminData {
  metrics: {
    totalDocuments: number;
    totalUsers: number;
    totalChats: number;
    totalUploads: number;
  };
  auditLogs: AuditLog[];
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtering & search
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin');
      
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Forbidden: Administrative access only.');
        }
        throw new Error('Failed to load administrator metrics.');
      }
      
      const adminData = await res.json();
      setData(adminData);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'upload_document':
        return 'bg-emerald-950/40 border border-emerald-900/20 text-emerald-400';
      case 'delete_document':
        return 'bg-red-950/40 border border-red-900/20 text-red-400';
      case 'ask_question':
        return 'bg-indigo-950/40 border border-indigo-900/20 text-indigo-400';
      case 'login':
        return 'bg-teal-950/40 border border-teal-900/20 text-teal-400';
      default:
        return 'bg-slate-900 border border-slate-800 text-slate-400';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Filter logs based on inputs
  const filteredLogs = data?.auditLogs.filter((log) => {
    const userEmail = log.users?.email?.toLowerCase() || 'system';
    const action = log.action.toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesSearch = userEmail.includes(query) || action.includes(query);
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-sm text-slate-400 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        Compiling administrative workspace data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-6 bg-red-950/20 border border-red-900/40 rounded-2xl space-y-4">
        <AlertOctagon className="h-10 w-10 text-red-400 mx-auto" />
        <h2 className="text-base font-bold text-white">Administrative Check Failed</h2>
        <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-indigo-400" />
          Admin Center
        </h1>
        <p className="text-slate-400 text-sm mt-1.5">
          System health telemetry, user statistics, and compliance audit logging.
        </p>
      </div>

      {/* Grid Stats */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Database Users</p>
              <h3 className="text-2xl font-bold text-white">{data.metrics.totalUsers}</h3>
              <p className="text-[10px] text-slate-500">Registered employees</p>
            </div>
            <div className="p-3.5 bg-violet-600/10 border border-violet-500/25 rounded-xl text-violet-400">
              <Users className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Documents</p>
              <h3 className="text-2xl font-bold text-white">{data.metrics.totalDocuments}</h3>
              <p className="text-[10px] text-slate-500">Active corporate files</p>
            </div>
            <div className="p-3.5 bg-indigo-600/10 border border-indigo-500/25 rounded-xl text-indigo-400">
              <FileText className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Conversations</p>
              <h3 className="text-2xl font-bold text-white">{data.metrics.totalChats}</h3>
              <p className="text-[10px] text-slate-500">RAG chat sessions</p>
            </div>
            <div className="p-3.5 bg-emerald-600/10 border border-emerald-500/25 rounded-xl text-emerald-400">
              <MessageSquare className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">File Ingestions</p>
              <h3 className="text-2xl font-bold text-white">{data.metrics.totalUploads}</h3>
              <p className="text-[10px] text-slate-500">Pipeline trigger events</p>
            </div>
            <div className="p-3.5 bg-amber-600/10 border border-amber-500/25 rounded-xl text-amber-400">
              <UploadCloud className="h-6 w-6" />
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Filter bar & Table */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-400 animate-pulse" />
            System Audit Log
          </h2>

          <div className="flex flex-wrap gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user or action..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-0 outline-none text-xs text-slate-350"
              />
            </div>

            {/* Dropdown Filter */}
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="py-2 pl-3 pr-8 bg-slate-950 border border-slate-800 rounded-xl outline-none text-xs text-slate-300"
            >
              <option value="all">All Operations</option>
              <option value="login">Logins</option>
              <option value="upload_document">Uploads</option>
              <option value="delete_document">Deletions</option>
              <option value="ask_question">Q&A Queries</option>
            </select>
          </div>
        </div>

        {/* Audit Log Table */}
        {filteredLogs && filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-3 px-2">Timestamp</th>
                  <th className="py-3 px-2">Employee Email</th>
                  <th className="py-3 px-2">Action type</th>
                  <th className="py-3 px-2">Network IP</th>
                  <th className="py-3 px-2 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-900/10 text-slate-300">
                        <td className="py-3.5 px-2 text-slate-450 flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3.5 w-3.5 shrink-0" /> {formatDate(log.created_at)}
                        </td>
                        <td className="py-3.5 px-2 font-medium">
                          {log.users?.email || 'System'}
                        </td>
                        <td className="py-3.5 px-2">
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md tracking-wide capitalize ${getActionColor(log.action)}`}>
                            {log.action.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-slate-500 font-mono">
                          {log.ip_address || '127.0.0.1'}
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="p-1.5 text-indigo-400 hover:text-indigo-300 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition inline-flex items-center gap-1 font-semibold text-[10px]"
                          >
                            <Code className="h-3 w-3" />
                            {isExpanded ? 'Hide parameters' : 'Inspect parameters'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="py-3 px-4 bg-slate-950/40 rounded-xl border border-slate-900/50">
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-450 flex items-center gap-1">
                                <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                                Action Parameters JSON
                              </p>
                              <pre className="p-3 bg-slate-950 border border-slate-850 rounded-xl text-[10.5px] font-mono text-slate-400 overflow-x-auto max-w-full select-all">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
            <Building className="h-10 w-10 text-slate-650 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-semibold">No audit logs matching filters found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Loader2,
  CheckCircle,
  XCircle,
  AlertOctagon,
} from 'lucide-react';

interface ReviewItem {
  id: string;
  question: string;
  response: string;
  reason: string;
  domain: string;
  status: string;
  created_at: string;
  users: { email: string } | null;
}

export default function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/review?status=pending');
      if (!res.ok) throw new Error('Failed to load review queue');
      const data = await res.json();
      setItems(data.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleReview = async (id: string, status: 'approved' | 'rejected' | 'revised') => {
    const res = await fetch('/api/review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, reviewerNotes: notes[id] || '' }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading review queue...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8 text-red-400">
        <AlertOctagon className="h-8 w-8 mx-auto mb-2" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-orange-400" />
          Human Review Queue
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Review flagged HR, legal, and low-confidence responses before they are trusted.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-sm">
          No pending reviews. All clear.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <p className="text-xs text-slate-500">{item.users?.email} · {item.domain} · {new Date(item.created_at).toLocaleString()}</p>
                  <p className="text-sm font-semibold text-white mt-1">Q: {item.question}</p>
                  <p className="text-xs text-orange-400 mt-1">Flag reason: {item.reason}</p>
                </div>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl text-xs text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {item.response}
              </div>
              <textarea
                value={notes[item.id] || ''}
                onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                placeholder="Reviewer notes (optional)"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300"
                rows={2}
              />
              <div className="flex gap-2">
                <button onClick={() => handleReview(item.id, 'approved')}
                  className="px-3 py-1.5 bg-emerald-950/40 border border-emerald-800 text-emerald-400 rounded-lg text-xs font-semibold flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> Approve
                </button>
                <button onClick={() => handleReview(item.id, 'revised')}
                  className="px-3 py-1.5 bg-indigo-950/40 border border-indigo-800 text-indigo-400 rounded-lg text-xs font-semibold">
                  Mark Revised
                </button>
                <button onClick={() => handleReview(item.id, 'rejected')}
                  className="px-3 py-1.5 bg-red-950/40 border border-red-800 text-red-400 rounded-lg text-xs font-semibold flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

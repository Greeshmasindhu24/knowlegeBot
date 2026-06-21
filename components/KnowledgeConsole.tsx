'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  FolderSync,
  AlertTriangle,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  formatFileSize,
  getFileTooLargeMessage,
  isFileTooLarge,
  MAX_UPLOAD_FILE_SIZE_LABEL,
} from '@/lib/uploadConstants';
import {
  SUPPORTED_UPLOAD_ACCEPT,
  SUPPORTED_UPLOAD_LABEL,
  isSupportedUploadExtension,
} from '@/lib/supportedFileTypes';

interface DocumentRow {
  id: string;
  name: string;
  file_type: string;
  created_at: string;
}

interface KnowledgeConsoleProps {
  isAdmin?: boolean;
  onDocumentsChange?: () => void;
}

export default function KnowledgeConsole({ isAdmin = false, onDocumentsChange }: KnowledgeConsoleProps) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoadingDocs(true);
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const ingestFile = async (selectedFile: File) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
    if (!isSupportedUploadExtension(ext)) {
      setErrorMessage(`Unsupported file type. Please upload ${SUPPORTED_UPLOAD_LABEL}.`);
      return;
    }
    if (isFileTooLarge(selectedFile.size)) {
      setErrorMessage(getFileTooLargeMessage(selectedFile.size));
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('department', 'General');
    formData.append('sourceSystem', 'manual_upload');

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Upload failed');
      }
      setStatusMessage(`Ingested "${data.document?.name || selectedFile.name}" successfully.`);
      await fetchDocuments();
      onDocumentsChange?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setErrorMessage(message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) ingestFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) ingestFile(file);
  };

  const handleFolderSync = async () => {
    setSyncing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/sync-folder', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Folder sync failed');
      setStatusMessage(data.summary || 'Directory sync completed.');
      await fetchDocuments();
      onDocumentsChange?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Folder sync failed';
      setErrorMessage(message);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearKnowledgeBase = async () => {
    if (
      !confirm(
        'Permanently delete ALL documents, chunks, embeddings, and storage files? This cannot be undone.'
      )
    ) {
      return;
    }

    setClearing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/clear-knowledge-base', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clear failed');
      setStatusMessage(`Knowledge base cleared (${data.removed} documents removed).`);
      await fetchDocuments();
      onDocumentsChange?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Clear failed';
      setErrorMessage(message);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/70 border-r border-slate-800/80">
      <div className="p-4 border-b border-slate-800/60">
        <h2 className="text-sm font-bold text-white">Enterprise Bot</h2>
        <p className="text-[10px] text-slate-500 mt-0.5">Knowledge console</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Knowledge Base */}
        <section className="space-y-2">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Knowledge Base</h3>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Upload internal documents to enrich the bot&apos;s capabilities.
          </p>

          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-xl p-3 text-center cursor-pointer transition ${
              dragActive
                ? 'border-violet-500 bg-violet-950/20'
                : 'border-slate-700 hover:border-slate-600 bg-slate-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_UPLOAD_ACCEPT}
              onChange={handleFileChange}
              className="hidden"
            />
            <UploadCloud className="h-5 w-5 text-indigo-400 mx-auto mb-1.5" />
            <p className="text-[10px] text-slate-400">Select or drag document</p>
            <p className="text-[9px] text-slate-600 mt-0.5">
              {SUPPORTED_UPLOAD_LABEL} (Max {MAX_UPLOAD_FILE_SIZE_LABEL})
            </p>
          </div>

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ingesting...
              </span>
            ) : (
              'Ingest Document'
            )}
          </button>
        </section>

        {/* Folder Sync */}
        <section className="space-y-2">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Folder Sync</h3>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Scan local <code className="text-slate-400">documents/</code> folder for changes.
          </p>
          <button
            type="button"
            onClick={handleFolderSync}
            disabled={syncing}
            className="w-full py-2 rounded-lg border border-slate-700 hover:bg-slate-800/60 disabled:opacity-50 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderSync className="h-3.5 w-3.5" />
            )}
            Sync Directory
          </button>
        </section>

        {/* Danger Zone */}
        {isAdmin && (
          <section className="space-y-2 pt-2 border-t border-slate-800/60">
            <h3 className="text-xs font-bold text-red-400 uppercase tracking-wide flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Danger Zone
            </h3>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Permanently delete all indexed chunks, embeddings, and metadata from Supabase.
            </p>
            <button
              type="button"
              onClick={handleClearKnowledgeBase}
              disabled={clearing}
              className="w-full py-2 rounded-lg border border-red-900/50 bg-red-950/30 hover:bg-red-950/50 disabled:opacity-50 text-red-400 text-xs font-semibold transition"
            >
              {clearing ? 'Clearing...' : 'Clear Knowledge Base'}
            </button>
          </section>
        )}

        {statusMessage && (
          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-900/40 text-[10px] text-emerald-400 flex gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-900/40 text-[10px] text-red-400 flex gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Documents list */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Documents</h3>
            <Link
              href="/upload"
              className="text-[9px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
            >
              Manage <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {loadingDocs ? (
            <div className="py-4 text-center text-[10px] text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
              Loading...
            </div>
          ) : documents.length === 0 ? (
            <p className="text-[10px] text-slate-600 py-2">No documents indexed yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/50 border border-slate-800/60 text-[10px]"
                >
                  <FileText className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate text-slate-300 font-medium">{doc.name}</span>
                  <span className="text-[9px] text-slate-600 shrink-0 uppercase">{doc.file_type}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="p-3 border-t border-slate-800/60 text-[9px] text-slate-600 text-center">
        Next.js &amp; Supabase · RAG Systems Online
      </div>
    </div>
  );
}

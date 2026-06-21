'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  Trash2, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Building, 
  FolderOpen,
  Calendar,
  Lock,
  RefreshCw,
  Link2,
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

interface DocumentMetadata {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  department: string;
  source_system?: string;
  owner?: string;
  sensitivity_label?: string;
  version?: string;
  created_at: string;
  users: {
    email: string;
  } | null;
}

type UploadStep = 'idle' | 'uploading' | 'extracting' | 'chunking' | 'embedding' | 'completed' | 'failed';

export default function UploadPage() {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  
  // Upload states
  const [file, setFile] = useState<File | null>(null);
  const [department, setDepartment] = useState('General');
  const [owner, setOwner] = useState('');
  const [sourceSystem, setSourceSystem] = useState('manual_upload');
  const [sensitivityLabel, setSensitivityLabel] = useState('internal');
  const [version, setVersion] = useState('1.0');
  const [connectorType, setConnectorType] = useState<'url' | 'sharepoint' | 'confluence'>('url');
  const [connectorUrl, setConnectorUrl] = useState('');
  const [connectorPageId, setConnectorPageId] = useState('');
  const [connectorSyncing, setConnectorSyncing] = useState(false);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoadingDocs(true);
      setListError(null);
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load documents');
      }
      if (data.documents) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
      setListError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!ext || !isSupportedUploadExtension(ext)) {
      setErrorMessage(`Unsupported file type. Please upload ${SUPPORTED_UPLOAD_LABEL} documents.`);
      setFile(null);
      return;
    }
    if (isFileTooLarge(selectedFile.size)) {
      setErrorMessage(getFileTooLargeMessage(selectedFile.size));
      setFile(null);
      return;
    }
    setErrorMessage(null);
    setFile(selectedFile);
    setUploadStep('idle');
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setErrorMessage(null);
    setUploadStep('uploading');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('department', department);
    formData.append('sourceSystem', sourceSystem);
    formData.append('owner', owner);
    formData.append('sensitivityLabel', sensitivityLabel);
    formData.append('version', version);

    try {
      // Step 1: Uploading & processing
      // We simulate step progress to show what is happening in our pipeline
      // Show progress while the server processes (embedding can take 30-60s for large files)
      const stepSimulation = setInterval(() => {
        setUploadStep((prev) => {
          if (prev === 'uploading') return 'extracting';
          if (prev === 'extracting') return 'chunking';
          if (prev === 'chunking') return 'embedding';
          return prev;
        });
      }, 4000);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(stepSimulation);

      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        if (res.status === 413) {
          throw new Error(`File exceeds the ${MAX_UPLOAD_FILE_SIZE_LABEL} upload limit.`);
        }
        throw new Error('Upload failed. The file may be too large or the server rejected the request.');
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadStep('completed');
      setFile(null);
      fetchDocuments(); // Refresh table list
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during upload.');
      setUploadStep('failed');
    }
  };

  const handleReindexDocument = async (id: string) => {
    setReindexingId(id);
    try {
      const res = await fetch(`/api/documents/reindex?id=${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Re-index failed');
      alert(`Re-indexed successfully (${data.chunkCount} chunks)`);
      fetchDocuments();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Re-index failed';
      alert(message);
    } finally {
      setReindexingId(null);
    }
  };

  const handleConnectorSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectorSyncing(true);
    setErrorMessage(null);
    try {
      const body: Record<string, string> = { type: connectorType, department };
      if (owner) body.owner = owner;
      body.sensitivityLabel = sensitivityLabel;
      body.version = version;

      if (connectorType === 'url') body.url = connectorUrl;
      else if (connectorType === 'sharepoint') body.siteUrl = connectorUrl;
      else if (connectorType === 'confluence') body.pageId = connectorPageId;

      const res = await fetch('/api/connectors/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connector sync failed');
      alert(`Synced "${data.name}" (${data.chunkCount} chunks)`);
      fetchDocuments();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Connector sync failed');
    } finally {
      setConnectorSyncing(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document and all its text vectors? This action is irreversible.')) {
      return;
    }

    try {
      const res = await fetch(`/api/documents?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Delete failed');
      }

      // Remove from state
      setDocuments(documents.filter((doc) => doc.id !== id));
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
    }
  };

  const getStepDescription = (step: UploadStep) => {
    switch (step) {
      case 'uploading':
        return 'Uploading raw file to secure Supabase cloud storage...';
      case 'extracting':
        return 'Extracting text tokens page-by-page...';
      case 'chunking':
        return 'Parsing text chunks and adding metadata mappings...';
      case 'embedding':
        return 'Generating embeddings and writing vectors to pgvector...';
      case 'completed':
        return 'Document ingested successfully!';
      case 'failed':
        return 'Ingestion process failed.';
      default:
        return 'Ready to ingest.';
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <UploadCloud className="h-8 w-8 text-indigo-400" />
          Document Hub
        </h1>
        <p className="text-slate-400 text-sm mt-1.5">
          Ingest text, DOCX, or PDF documents into your department's secure vector database.
        </p>
      </div>

      <div className="rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-4 text-sm text-slate-300">
        <p className="font-semibold text-white mb-1">What to upload</p>
        <p>
          Upload internal docs your team needs answers from — policies, SOPs, handbooks, project specs,
          certificates (PDF), or training materials. Supported formats: {SUPPORTED_UPLOAD_LABEL} (max {MAX_UPLOAD_FILE_SIZE_LABEL}).
          Tag each file with the correct <strong className="text-white">department</strong>; AI Chat only retrieves
          documents in your department plus General. Upload is optional, but answers are grounded in what has been ingested.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Uploader Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-md space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Ingest Document
            </h2>

            <form onSubmit={handleUploadSubmit} className="space-y-6">
              {/* Drag Drop Area */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[220px] ${
                  dragActive
                    ? 'border-violet-500 bg-violet-950/10'
                    : file
                    ? 'border-indigo-500/50 bg-indigo-950/5'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept={SUPPORTED_UPLOAD_ACCEPT}
                  className="hidden"
                />

                {file ? (
                  <div className="space-y-3">
                    <div className="h-12 w-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/20">
                      <FileText className="h-6 w-6 animate-bounce" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{file.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setUploadStep('idle');
                      }}
                      className="text-xs text-red-400 hover:text-red-300 font-semibold"
                    >
                      Remove File
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="h-12 w-12 rounded-xl bg-slate-900 text-slate-450 flex items-center justify-center mx-auto border border-slate-800">
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-350">
                        Drag and drop your file here, or <span className="text-violet-400 hover:underline">browse</span>
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">Supports PDF, DOCX, and TXT (Max {MAX_UPLOAD_FILE_SIZE_LABEL})</p>
                    </div>
                  </div>
                )}
              </div>

              {errorMessage && uploadStep === 'idle' && (
                <div className="p-3.5 bg-red-950/30 border border-red-900/40 rounded-xl text-red-400 text-xs font-semibold leading-relaxed flex gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Metadata fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Source System</label>
                  <select value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300">
                    <option value="manual_upload">Manual Upload</option>
                    <option value="file_store">File Store</option>
                    <option value="sharepoint">SharePoint</option>
                    <option value="confluence">Confluence</option>
                    <option value="url">Web Page</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Owner</label>
                  <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Document owner"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Sensitivity</label>
                  <select value={sensitivityLabel} onChange={(e) => setSensitivityLabel(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300">
                    <option value="public">Public</option>
                    <option value="internal">Internal</option>
                    <option value="confidential">Confidential</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Version</label>
                  <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300" />
                </div>
              </div>

              {/* Department Tag & Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Building className="h-3.5 w-3.5" />
                    Department Access restriction
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition text-sm text-slate-300"
                  >
                    <option value="General">General / All Departments</option>
                    <option value="Engineering">Engineering</option>
                    <option value="HR">Human Resources</option>
                    <option value="Finance">Finance</option>
                    <option value="Legal">Legal</option>
                    <option value="Marketing">Marketing</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!file || uploadStep !== 'idle'}
                  className="py-2.5 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-600/10 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-sm flex items-center justify-center gap-2"
                >
                  {uploadStep !== 'idle' && uploadStep !== 'completed' && uploadStep !== 'failed' && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {uploadStep === 'idle' ? 'Process Document' : 'Processing...'}
                </button>
              </div>
              {uploadStep !== 'idle' && uploadStep !== 'completed' && uploadStep !== 'failed' && (
                <p className="text-[10px] text-slate-500">
                  Large files may take 1–2 minutes while text is extracted and embeddings are generated.
                </p>
              )}
            </form>
          </div>

          {/* Connector Sync */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-md space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Link2 className="h-5 w-5 text-indigo-400" />
              Enterprise Connectors
            </h2>
            <form onSubmit={handleConnectorSync} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Connector</label>
                  <select value={connectorType} onChange={(e) => setConnectorType(e.target.value as typeof connectorType)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300">
                    <option value="url">URL / Web Page</option>
                    <option value="sharepoint">SharePoint</option>
                    <option value="confluence">Confluence</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Department</label>
                  <select value={department} onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300">
                    <option value="General">General</option>
                    <option value="Engineering">Engineering</option>
                    <option value="HR">HR</option>
                    <option value="Finance">Finance</option>
                    <option value="Legal">Legal</option>
                  </select>
                </div>
              </div>
              {connectorType === 'confluence' ? (
                <input value={connectorPageId} onChange={(e) => setConnectorPageId(e.target.value)}
                  placeholder="Confluence Page ID" required
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300" />
              ) : (
                <input value={connectorUrl} onChange={(e) => setConnectorUrl(e.target.value)}
                  placeholder={connectorType === 'sharepoint' ? 'SharePoint site URL' : 'Document or page URL'}
                  required
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300" />
              )}
              <button type="submit" disabled={connectorSyncing}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-sm flex items-center gap-2 disabled:opacity-50">
                {connectorSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Sync from Connector
              </button>
            </form>
          </div>

          {/* Stepper progress view */}
          {uploadStep !== 'idle' && (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-md space-y-4 animate-fadeIn">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-white text-sm">Processing Status</h3>
                  <p className="text-xs text-slate-450 mt-1">{getStepDescription(uploadStep)}</p>
                </div>
                {uploadStep === 'completed' && <CheckCircle className="h-5 w-5 text-emerald-400" />}
                {uploadStep === 'failed' && <AlertCircle className="h-5 w-5 text-red-400" />}
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    uploadStep === 'uploading' ? 'w-1/4 bg-violet-600' :
                    uploadStep === 'extracting' ? 'w-2/4 bg-violet-500' :
                    uploadStep === 'chunking' ? 'w-3/4 bg-indigo-500' :
                    uploadStep === 'embedding' ? 'w-11/12 bg-indigo-400' :
                    uploadStep === 'completed' ? 'w-full bg-emerald-500' :
                    'w-full bg-red-500'
                  }`}
                />
              </div>

              {/* Stepper steps status */}
              <div className="grid grid-cols-4 text-[10px] font-semibold text-slate-500 pt-1 text-center">
                <span className="text-violet-400">1. Upload</span>
                <span className={['extracting', 'chunking', 'embedding', 'completed'].includes(uploadStep) ? 'text-violet-400' : ''}>2. Extract</span>
                <span className={['chunking', 'embedding', 'completed'].includes(uploadStep) ? 'text-indigo-400' : ''}>3. Chunk</span>
                <span className={['embedding', 'completed'].includes(uploadStep) ? 'text-emerald-400' : ''}>4. Embed</span>
              </div>

              {errorMessage && (
                <div className="p-3.5 bg-red-950/30 border border-red-900/40 rounded-xl text-red-400 text-xs font-semibold leading-relaxed flex gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 1 Column: Help Panel */}
        <div className="bg-slate-900/20 border border-slate-850 rounded-2xl p-5 md:p-6 shadow-sm space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm">Security & Access Rules</h3>
          <ul className="space-y-3 text-xs text-slate-400">
            <li className="flex gap-2">
              <Lock className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
              <span><strong>Department-Based RLS:</strong> Documents can only be retrieved in chat searches by employees registered in the matching department.</span>
            </li>
            <li className="flex gap-2">
              <Building className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
              <span><strong>General Designation:</strong> Choosing <em>General</em> makes the document accessible to all authenticated company employees.</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
              <span><strong>Chunk & Overlap:</strong> The parser utilizes a 1000-character chunk boundary with a 200-character overlap to retain contextual continuity.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Already Uploaded Documents List */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-md space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-indigo-400" />
          Ingested Documents ({documents.length})
        </h2>

        {listError ? (
          <div className="text-center py-12 border border-dashed border-red-900/50 rounded-xl">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-2" />
            <p className="text-xs text-red-400 font-semibold">{listError}</p>
          </div>
        ) : loadingDocs ? (
          <div className="py-12 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
            Loading catalog...
          </div>
        ) : documents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-3 px-2">Document Name</th>
                  <th className="py-3 px-2">Access Department</th>
                  <th className="py-3 px-2">File Size</th>
                  <th className="py-3 px-2">Ingestion Date</th>
                  <th className="py-3 px-2">Uploaded By</th>
                  <th className="py-3 px-2">Source</th>
                  <th className="py-3 px-2">Sensitivity</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-900/20 text-slate-300">
                    <td className="py-3 px-2 font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold uppercase ${
                          doc.file_type === 'pdf' ? 'bg-red-950/50 text-red-400' :
                          doc.file_type === 'docx' ? 'bg-blue-950/50 text-blue-400' :
                          'bg-slate-900 text-slate-450'
                        }`}>
                          {doc.file_type}
                        </span>
                        {doc.name}
                      </div>
                    </td>
                    <td className="py-3 px-2 font-medium capitalize text-slate-400">
                      {doc.department}
                    </td>
                    <td className="py-3 px-2 text-slate-450">
                      {(doc.file_size / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-2 text-slate-450 flex items-center gap-1 mt-1">
                      <Calendar className="h-3.5 w-3.5 shrink-0" /> {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2 text-slate-400 truncate max-w-[150px]" title={doc.users?.email || 'N/A'}>
                      {doc.users?.email || 'System'}
                    </td>
                    <td className="py-3 px-2 text-slate-450 capitalize">
                      {doc.source_system?.replace('_', ' ') || 'manual'}
                    </td>
                    <td className="py-3 px-2 text-slate-450 capitalize">
                      {doc.sensitivity_label || 'internal'}
                    </td>
                    <td className="py-3 px-2 text-right space-x-1">
                      <button
                        onClick={() => handleReindexDocument(doc.id)}
                        disabled={reindexingId === doc.id}
                        className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/20 rounded-lg transition inline-flex"
                        title="Re-index document"
                      >
                        {reindexingId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/20 rounded-lg transition"
                        title="Delete document and clear vectors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
            <FileText className="h-10 w-10 text-slate-650 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-semibold">Your workspace vector database is currently empty.</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Upload and ingest files to begin Retieval-Augmented searches.</p>
          </div>
        )}
      </div>
    </div>
  );
}

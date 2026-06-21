'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  MessageSquare, 
  Send, 
  Plus, 
  Loader2, 
  Bot, 
  User, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  Trash2,
  Calendar,
  Upload,
  ThumbsUp,
  ThumbsDown,
  ShieldAlert,
} from 'lucide-react';
import KnowledgeConsole from '@/components/KnowledgeConsole';

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

interface Citation {
  sourceIndex: number;
  documentId: string;
  documentName: string;
  pageNumber?: number;
  content: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  citations?: Citation[];
  confidence?: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  needsReview?: boolean;
  disclaimer?: string;
  feedback?: 'positive' | 'negative';
}

const SUGGESTED_PROMPTS = [
  "What is the company leave policy?",
  "Summarize the key engineering standards.",
  "How are travel reimbursements handled?",
  "What is the onboarding checklist for new hires?"
];

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('new');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  
  // Loading states
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);

  // Citation view state
  const [expandedCitationIdx, setExpandedCitationIdx] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSessions();
    (async () => {
      try {
        const { createClient } = await import('@/lib/supabase-client');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();
          setIsAdmin(profile?.role === 'admin');
        }
      } catch {
        /* profile optional */
      }
    })();
  }, []);

  useEffect(() => {
    if (activeSessionId && activeSessionId !== 'new') {
      fetchMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, generating]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchSessions = async () => {
    try {
      setLoadingSessions(true);
      const res = await fetch('/api/documents'); // Wait, let's fetch from documents or check if we can select chat sessions
      // Since we don't have a direct /api/chat-sessions, we can make a query to get chat sessions using supabase client inline or fetch.
      // Wait, we can fetch all sessions. Let's retrieve from database using inline Supabase client.
      // Wait! Client components can use the client-side Supabase helper.
      const { createClient } = await import('@/lib/supabase-client');
      const supabase = createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: chatSessions, error } = await supabase
          .from('chat_sessions')
          .select('id, title, created_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (!error && chatSessions) {
          setSessions(chatSessions);
        }
      }
    } catch (err) {
      console.error('Error loading chat sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchMessages = async (sessionId: string) => {
    try {
      setLoadingMessages(true);
      const { createClient } = await import('@/lib/supabase-client');
      const supabase = createClient();
      
      const { data: historyMsgs, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (!error && historyMsgs) {
        setMessages(
          historyMsgs.map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            created_at: m.created_at,
            citations: m.citations || [],
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCreateNewSession = () => {
    setActiveSessionId('new');
    setMessages([]);
    setInput('');
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation history?')) return;

    try {
      const { createClient } = await import('@/lib/supabase-client');
      const supabase = createClient();
      
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (!error) {
        setSessions(sessions.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          handleCreateNewSession();
        }
      }
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || generating) return;

    const userQuestion = textToSend;
    setInput('');
    setGenerating(true);
    setProgressStep('Starting...');
    setExpandedCitationIdx(null);

    // Add user message immediately
    const userMsgId = Date.now().toString();
    const newUserMessage: Message = {
      id: userMsgId,
      role: 'user',
      content: userQuestion,
    };
    
    // Add placeholder assistant message
    const assistantMsgId = (Date.now() + 1).toString();
    const newAssistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      citations: [],
    };

    setMessages((prev) => [...prev, newUserMessage, newAssistantMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQuestion,
          sessionId: activeSessionId,
        }),
      });

      if (!response.ok) {
        let detail = 'Failed to initiate RAG conversation.';
        try {
          const errBody = await response.json();
          if (typeof errBody?.error === 'string') detail = errBody.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(detail);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to open connection stream.');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let receivedCitations: Citation[] = [];
      let serverSessionId: string | null = null;
      let serverMessageId: string | null = null;
      let metaConfidence: Message['confidenceLevel'] = 'medium';
      let metaNeedsReview = false;
      let metaDisclaimer: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep remainder

        for (const line of lines) {
          if (!line.trim()) continue;

          // SSE format: event: name \n data: payload
          const splitLines = line.split('\n');
          let eventType = '';
          let dataStr = '';

          for (const s of splitLines) {
            if (s.startsWith('event:')) {
              eventType = s.slice(6).trim();
            } else if (s.startsWith('data:')) {
              dataStr = s.slice(5).trim();
            }
          }

          if (dataStr) {
            try {
              const parsedData = JSON.parse(dataStr);
              if (eventType === 'progress') {
                setProgressStep(parsedData.step);
              } else if (eventType === 'meta' || eventType === 'citations') {
                receivedCitations = parsedData.citations || parsedData;
                metaConfidence = parsedData.confidenceLevel;
                metaNeedsReview = parsedData.needsHumanReview;
                metaDisclaimer = parsedData.disclaimer;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          citations: receivedCitations,
                          confidenceLevel: metaConfidence,
                          needsReview: metaNeedsReview,
                          disclaimer: metaDisclaimer,
                        }
                      : msg
                  )
                );
              } else if (eventType === 'token') {
                accumulatedText += parsedData.text;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: accumulatedText }
                      : msg
                  )
                );
              } else if (eventType === 'session') {
                serverSessionId = parsedData.sessionId;
                serverMessageId = parsedData.messageId;
              } else if (eventType === 'error') {
                throw new Error(parsedData.error || 'Server stream error');
              }
            } catch (jsonErr) {
              if (jsonErr instanceof Error && eventType === 'error') {
                throw jsonErr;
              }
              console.error('Error parsing stream JSON:', jsonErr);
            }
          }
        }
      }

      // If a new session was created on the server, update the session ID
      if (serverSessionId && activeSessionId === 'new') {
        setActiveSessionId(serverSessionId);
        fetchSessions();
      }

      if (serverMessageId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, id: serverMessageId! } : msg
          )
        );
      }
    } catch (err: any) {
      console.error('Error in chat request:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { 
                ...msg, 
                content: `An error occurred: ${err.message || 'The request timed out or connection was aborted.'}` 
              }
            : msg
        )
      );
    } finally {
      setGenerating(false);
      setProgressStep(null);
    }
  };

  const handleFeedback = async (messageId: string, rating: 'positive' | 'negative') => {
    if (messageId.startsWith(Date.now().toString().slice(0, 5))) return;
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, rating }),
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: rating } : m))
      );
    } catch (err) {
      console.error('Feedback error:', err);
    }
  };

  const confidenceColor = (level?: string) => {
    if (level === 'high') return 'text-emerald-400 bg-emerald-950/40 border-emerald-900/40';
    if (level === 'low') return 'text-amber-400 bg-amber-950/40 border-amber-900/40';
    return 'text-indigo-400 bg-indigo-950/40 border-indigo-900/40';
  };

  return (
    <div className="h-[calc(100vh-140px)] md:h-[calc(100vh-60px)] flex rounded-2xl border border-slate-900 overflow-hidden shadow-2xl bg-slate-950/20">
      {/* Knowledge console (reference: enterprise-bot-mu.vercel.app) */}
      <div className="hidden xl:flex w-72 shrink-0">
        <KnowledgeConsole isAdmin={isAdmin} />
      </div>

      {/* Sidebar: Conversation History */}
      <div className="hidden lg:flex w-72 bg-slate-900/65 border-r border-slate-900 flex-col shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800/40 flex items-center justify-between">
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
            <MessageSquare className="h-4.5 w-4.5 text-indigo-400" />
            Chat History
          </h3>
          <button
            onClick={handleCreateNewSession}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-650/15"
            title="Start new conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <button
            onClick={handleCreateNewSession}
            className={`w-full text-left px-3 py-2.5 rounded-xl font-medium transition flex items-center gap-2 text-xs border ${
              activeSessionId === 'new'
                ? 'bg-slate-800 text-white border-slate-750'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-transparent'
            }`}
          >
            <Plus className="h-4 w-4 text-slate-400" />
            New Conversation
          </button>

          {loadingSessions ? (
            <div className="py-8 flex items-center justify-center text-xs text-slate-500 gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading history...
            </div>
          ) : sessions.length > 0 ? (
            sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`group w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between cursor-pointer border ${
                  activeSessionId === s.id
                    ? 'bg-slate-800/80 text-white border-slate-750'
                    : 'text-slate-450 hover:text-slate-200 hover:bg-slate-800/30 border-transparent'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate leading-tight pr-2">
                    {s.title}
                  </p>
                  <p className="text-[9px] text-slate-500 mt-1 flex items-center gap-0.5">
                    <Calendar className="h-3 w-3" /> {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 rounded transition shrink-0"
                  title="Delete chat thread"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-[10px] text-slate-600">
              No previous conversations.
            </div>
          )}
        </div>
      </div>

      {/* Main chat window */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950/40 relative">
        {/* Active Session info bar */}
        <div className="px-5 py-4 border-b border-slate-900/60 bg-slate-950/20 backdrop-blur-md flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">
              Copilot Assistant
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Ask questions grounded in your knowledge base
              {activeSessionId !== 'new' && (
                <> · {sessions.find((s) => s.id === activeSessionId)?.title || 'Session'}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConsoleOpen((v) => !v)}
              className="xl:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition text-[10px] font-semibold"
            >
              Console
            </button>
            <button
              onClick={handleCreateNewSession}
              className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Message Thread Container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loadingMessages ? (
            <div className="h-full flex flex-col items-center justify-center text-sm text-slate-450 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              Retrieving context and history...
            </div>
          ) : messages.length > 0 ? (
            <div className="space-y-6">
              {messages.map((msg, index) => {
                const isAI = msg.role === 'assistant';
                return (
                  <div key={msg.id || index} className={`flex gap-4 ${isAI ? 'justify-start' : 'justify-end'}`}>
                    {/* Icon */}
                    {isAI && (
                      <div className="h-8.5 w-8.5 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/10">
                        <Bot className="h-4.5 w-4.5 text-white" />
                      </div>
                    )}

                    {/* Chat Bubble */}
                    <div className={`max-w-[85%] rounded-2xl p-4 border text-sm leading-relaxed ${
                      isAI
                        ? 'bg-slate-900/50 border-slate-850/80 text-slate-100'
                        : 'bg-indigo-600 text-white border-indigo-750 shadow-lg shadow-indigo-600/10'
                    }`}>
                      {/* Message Content */}
                      {msg.content ? (
                        <div className="space-y-3 whitespace-pre-wrap font-medium">
                          {msg.content}
                        </div>
                      ) : generating && isAI ? (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                          {progressStep || 'Thinking...'}
                        </div>
                      ) : (
                        <div className="text-slate-500 italic">No content returned.</div>
                      )}

                      {isAI && msg.confidenceLevel && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${confidenceColor(msg.confidenceLevel)}`}>
                            Confidence: {msg.confidenceLevel}
                          </span>
                          {msg.needsReview && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-orange-400 bg-orange-950/40 border-orange-900/40 flex items-center gap-1">
                              <ShieldAlert className="h-3 w-3" /> Pending human review
                            </span>
                          )}
                        </div>
                      )}

                      {isAI && msg.disclaimer && (
                        <p className="mt-2 text-[10px] text-slate-500 italic border-l-2 border-slate-700 pl-2">
                          {msg.disclaimer}
                        </p>
                      )}

                      {isAI && msg.content && !generating && msg.id.includes('-') && (
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => handleFeedback(msg.id, 'positive')}
                            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 ${msg.feedback === 'positive' ? 'border-emerald-600 text-emerald-400' : 'border-slate-800 text-slate-500 hover:text-emerald-400'}`}>
                            <ThumbsUp className="h-3.5 w-3.5" /> Helpful
                          </button>
                          <button onClick={() => handleFeedback(msg.id, 'negative')}
                            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 ${msg.feedback === 'negative' ? 'border-red-600 text-red-400' : 'border-slate-800 text-slate-500 hover:text-red-400'}`}>
                            <ThumbsDown className="h-3.5 w-3.5" /> Not helpful
                          </button>
                        </div>
                      )}

                      {/* Source Citations Drawer (AI messages only) */}
                      {isAI && msg.citations && msg.citations.length > 0 && (
                        <div className="mt-4 pt-3.5 border-t border-slate-800/60 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                            <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                            Source References
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5">
                            {msg.citations.map((cit, cIdx) => {
                              const isExpanded = expandedCitationIdx === cIdx;
                              return (
                                <div 
                                  key={cIdx}
                                  className="bg-slate-950/60 hover:bg-slate-950/80 border border-slate-850/80 rounded-xl p-2.5 transition"
                                >
                                  <button
                                    onClick={() => setExpandedCitationIdx(isExpanded ? null : cIdx)}
                                    className="w-full text-left flex items-center justify-between text-xs font-semibold text-slate-200 group gap-2"
                                  >
                                    <span className="truncate flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.25 bg-slate-900 border border-slate-800 text-[10px] text-indigo-400 rounded shrink-0">
                                        Source {cit.sourceIndex}
                                      </span>
                                      <span className="truncate group-hover:text-white" title={cit.documentName}>
                                        {cit.documentName}
                                      </span>
                                    </span>
                                    {isExpanded ? <ChevronUp className="h-4.5 w-4.5 text-slate-500" /> : <ChevronDown className="h-4.5 w-4.5 text-slate-500" />}
                                  </button>
                                  
                                  {cit.pageNumber && (
                                    <span className="inline-block mt-1 text-[9px] font-medium text-slate-500">
                                      Page Number: {cit.pageNumber}
                                    </span>
                                  )}

                                  {isExpanded && (
                                    <div className="mt-2.5 p-2 bg-slate-900 border border-slate-850/50 rounded-lg text-[10.5px] leading-normal text-slate-400 max-h-[140px] overflow-y-auto select-text">
                                      {cit.content}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {!isAI && (
                      <div className="h-8.5 w-8.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        <User className="h-4.5 w-4.5 text-slate-350" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Suggestions State (Empty Chat)
            <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-6">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/10 mb-2">
                <Bot className="h-9 w-9 text-white" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                  How can I help you today?
                </h1>
                <p className="text-slate-450 text-xs md:text-sm max-w-md mx-auto leading-relaxed">
                  I&apos;m ready to answer questions based on the documents you&apos;ve ingested.
                  Open the menu console to upload a document and get started.
                </p>
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload a Document
                </Link>
              </div>

              {/* Suggestions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-4">
                {SUGGESTED_PROMPTS.map((prompt, pIdx) => (
                  <button
                    key={pIdx}
                    onClick={() => {
                      setInput(prompt);
                      handleSendMessage(prompt);
                    }}
                    className="p-3 text-left bg-slate-900/35 hover:bg-slate-900/70 border border-slate-850 hover:border-indigo-650/40 rounded-xl transition text-xs font-semibold text-slate-300 hover:text-white flex items-start gap-2.5"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Mobile knowledge console drawer */}
        {consoleOpen && (
          <div className="xl:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setConsoleOpen(false)} />
            <div className="relative w-[min(100%,20rem)] h-full shadow-2xl">
              <KnowledgeConsole isAdmin={isAdmin} />
            </div>
          </div>
        )}

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/20 backdrop-blur-md space-y-2">
          <p className="text-[9px] text-center text-slate-600 max-w-4xl mx-auto">
            Copilot can make mistakes. Verify important information using the source documents.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(input);
            }}
            className="flex items-center gap-2 max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-1.5 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition duration-300"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={generating}
              placeholder="Ask a question about your enterprise documents..."
              className="flex-1 bg-transparent border-none outline-none py-2 px-3 text-sm text-slate-100 placeholder-slate-500 focus:ring-0"
            />
            <button
              type="submit"
              disabled={!input.trim() || generating}
              className="p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md disabled:opacity-30 disabled:hover:bg-indigo-600 transition"
            >
              {generating ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

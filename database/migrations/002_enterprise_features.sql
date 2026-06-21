-- Enterprise features migration: metadata, HITL, feedback, observability, performance

-- Richer document metadata
alter table public.documents
  add column if not exists source_system text default 'manual_upload',
  add column if not exists owner text,
  add column if not exists sensitivity_label text default 'internal',
  add column if not exists version text default '1.0',
  add column if not exists source_updated_at timestamp with time zone,
  add column if not exists source_url text;

-- Message feedback (thumbs up/down)
create table if not exists public.message_feedback (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.chat_messages(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  rating text not null check (rating in ('positive', 'negative')),
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (message_id, user_id)
);

-- Human-in-the-loop review queue
create table if not exists public.flagged_responses (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.chat_messages(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  question text not null,
  response text not null,
  reason text not null,
  domain text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revised')),
  reviewer_id uuid references public.users(id) on delete set null,
  reviewer_notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  reviewed_at timestamp with time zone
);

-- Retrieval observability logs
create table if not exists public.retrieval_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete set null,
  session_id uuid references public.chat_sessions(id) on delete set null,
  question text not null,
  department text,
  tools_used text[] default '{}',
  document_ids uuid[] default '{}',
  top_similarity float,
  confidence text,
  match_count int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Extend chat_messages with agent metadata
alter table public.chat_messages
  add column if not exists confidence float,
  add column if not exists needs_review boolean default false,
  add column if not exists disclaimer text;

-- pgvector HNSW index for faster similarity search
create index if not exists idx_document_chunks_embedding_hnsw
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

create index if not exists idx_flagged_responses_status on public.flagged_responses(status);
create index if not exists idx_message_feedback_message_id on public.message_feedback(message_id);
create index if not exists idx_retrieval_logs_created_at on public.retrieval_logs(created_at desc);

-- RLS for new tables
alter table public.message_feedback enable row level security;
alter table public.flagged_responses enable row level security;
alter table public.retrieval_logs enable row level security;

create policy "Users manage own feedback" on public.message_feedback
  for all using (auth.uid() = user_id);

create policy "Admins view all feedback" on public.message_feedback
  for select using (
    (select role from public.users where id = auth.uid()) = 'admin'
  );

create policy "Admins manage review queue" on public.flagged_responses
  for all using (
    (select role from public.users where id = auth.uid()) = 'admin'
  );

create policy "Users view own flagged items" on public.flagged_responses
  for select using (auth.uid() = user_id);

create policy "Admins view retrieval logs" on public.retrieval_logs
  for select using (
    (select role from public.users where id = auth.uid()) = 'admin'
  );

create policy "Service can insert retrieval logs" on public.retrieval_logs
  for insert with check (auth.role() = 'authenticated');

-- Enable the pgvector extension to work with embeddings
create extension if not exists vector;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- LEGACY FIX: public.users must use uuid id (matches auth.users and backend JWT users).
-- Older Supabase setups sometimes created public.users with serial/integer id; CREATE TABLE IF NOT EXISTS
-- would skip recreation and break FKs (e.g. documents.uploaded_by uuid → users.id integer).
do $$
declare
  users_id_type text;
begin
  select data_type into users_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'users'
    and column_name = 'id';

  if users_id_type is not null and users_id_type <> 'uuid' then
    raise notice 'Dropping legacy public.users (id type: %) and dependent tables; will recreate with uuid.', users_id_type;
    drop table if exists public.users cascade;
  end if;
end $$;

-- USERS TABLE (Linked to auth.users)
create table if not exists public.users (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'employee', -- 'admin', 'employee'
  department text default 'General',     -- 'Engineering', 'HR', 'Finance', 'General', etc.
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- DOCUMENTS TABLE
create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  file_path text not null,               -- Storage path inside the 'documents' bucket
  file_size integer not null,
  file_type text not null,               -- 'pdf', 'docx', 'txt'
  department text default 'General',     -- Used for department-based access control
  uploaded_by uuid references public.users(id) on delete set null,
  source_system text default 'manual_upload',
  owner text,
  sensitivity_label text default 'internal',
  version text default '1.0',
  source_updated_at timestamp with time zone,
  source_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- DOCUMENT CHUNKS TABLE
create table if not exists public.document_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references public.documents(id) on delete cascade not null,
  content text not null,
  embedding vector(1536),                -- OpenAI text-embedding-3-small uses 1536 dims
  metadata jsonb default '{}'::jsonb not null, -- {page: number, section: string, etc.}
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CHAT SESSIONS TABLE
create table if not exists public.chat_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  title text not null default 'New Conversation',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CHAT MESSAGES TABLE
create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  role text not null,                    -- 'user', 'assistant'
  content text not null,
  citations jsonb default '[]'::jsonb,   -- Array of source citations
  confidence float,
  needs_review boolean default false,
  disclaimer text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- AUDIT LOGS TABLE
create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete set null,
  action text not null,                  -- 'login', 'upload_document', 'ask_question', 'delete_document'
  details jsonb default '{}'::jsonb not null,
  ip_address text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- MESSAGE FEEDBACK TABLE
create table if not exists public.message_feedback (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.chat_messages(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  rating text not null check (rating in ('positive', 'negative')),
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (message_id, user_id)
);

-- FLAGGED RESPONSES (HITL REVIEW QUEUE)
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

-- RETRIEVAL LOGS (OBSERVABILITY)
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

-- INDEXES FOR PERFORMANCE
create index if not exists idx_documents_uploaded_by on public.documents(uploaded_by);
create index if not exists idx_documents_department on public.documents(department);
create index if not exists idx_document_chunks_doc_id on public.document_chunks(document_id);
create index if not exists idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index if not exists idx_chat_messages_session_id on public.chat_messages(session_id);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_document_chunks_embedding_hnsw
  on public.document_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists idx_flagged_responses_status on public.flagged_responses(status);
create index if not exists idx_message_feedback_message_id on public.message_feedback(message_id);
create index if not exists idx_retrieval_logs_created_at on public.retrieval_logs(created_at desc);

-- VECTOR SIMILARITY SEARCH FUNCTION
create or replace function public.match_document_chunks (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_department text default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql stable
as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on dc.document_id = d.id
  where (1 - (dc.embedding <=> query_embedding)) > match_threshold
    and (
      filter_department is null 
      or d.department = filter_department 
      or d.department = 'General'
      or d.department is null
    )
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- AUTOMATIC PUBLIC.USERS ROW ON SIGNUP TRIGGER
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, role, department)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'employee'),
    coalesce(new.raw_user_meta_data->>'department', 'General')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger creation
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ROW LEVEL SECURITY (RLS) POLICIES

alter table public.users enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.audit_logs enable row level security;
alter table public.message_feedback enable row level security;
alter table public.flagged_responses enable row level security;
alter table public.retrieval_logs enable row level security;

-- USERS Policies
create policy "Users can read profiles of everyone" on public.users
  for select using (auth.role() = 'authenticated');

create policy "Users can update their own profile" on public.users
  for update using (auth.uid() = id);

-- DOCUMENTS Policies
create policy "Users can read General documents or documents in their department" on public.documents
  for select using (
    auth.role() = 'authenticated' 
    and (
      department = 'General' 
      or department is null
      or department = (select department from public.users where id = auth.uid())
      or (select role from public.users where id = auth.uid()) = 'admin'
    )
  );

create policy "Admins and uploaders can manage documents" on public.documents
  for all using (
    auth.role() = 'authenticated'
    and (
      uploaded_by = auth.uid()
      or (select role from public.users where id = auth.uid()) = 'admin'
    )
  );

-- DOCUMENT_CHUNKS Policies
create policy "Users can read chunks of documents they have access to" on public.document_chunks
  for select using (
    exists (
      select 1 from public.documents d 
      where d.id = document_id
    )
  );

create policy "Admins and service roles can modify chunks" on public.document_chunks
  for all using (
    (select role from public.users where id = auth.uid()) = 'admin'
  );

-- CHAT_SESSIONS Policies
create policy "Users can manage their own chat sessions" on public.chat_sessions
  for all using (auth.uid() = user_id);

-- CHAT_MESSAGES Policies
create policy "Users can manage messages in their own chat sessions" on public.chat_messages
  for all using (
    exists (
      select 1 from public.chat_sessions s 
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

-- AUDIT_LOGS Policies
create policy "Admins can view all audit logs" on public.audit_logs
  for select using (
    (select role from public.users where id = auth.uid()) = 'admin'
  );

create policy "Users can view their own audit logs" on public.audit_logs
  for select using (
    auth.uid() = user_id
  );

create policy "Authenticated users can create audit logs" on public.audit_logs
  for insert with check (
    auth.role() = 'authenticated'
  );

-- MESSAGE FEEDBACK Policies
create policy "Users manage own feedback" on public.message_feedback
  for all using (auth.uid() = user_id);

create policy "Admins view all feedback" on public.message_feedback
  for select using (
    (select role from public.users where id = auth.uid()) = 'admin'
  );

-- FLAGGED RESPONSES Policies
create policy "Admins manage review queue" on public.flagged_responses
  for all using (
    (select role from public.users where id = auth.uid()) = 'admin'
  );

create policy "Users view own flagged items" on public.flagged_responses
  for select using (auth.uid() = user_id);

-- RETRIEVAL LOGS Policies
create policy "Admins view retrieval logs" on public.retrieval_logs
  for select using (
    (select role from public.users where id = auth.uid()) = 'admin'
  );

create policy "Authenticated users insert retrieval logs" on public.retrieval_logs
  for insert with check (auth.role() = 'authenticated');

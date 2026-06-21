-- Switch pgvector from OpenAI (1536) to Ollama nomic-embed-text (768).
-- Run in Supabase SQL Editor when LLM_PROVIDER=ollama.
-- WARNING: deletes all existing chunk embeddings. Re-upload documents afterward.

truncate table public.document_chunks;

drop index if exists public.idx_document_chunks_embedding_hnsw;

alter table public.document_chunks
  alter column embedding type vector(768)
  using null;

create index if not exists idx_document_chunks_embedding_hnsw
  on public.document_chunks using hnsw (embedding vector_cosine_ops);

create or replace function public.match_document_chunks (
  query_embedding vector(768),
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

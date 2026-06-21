-- Create the private Supabase Storage bucket used for document uploads.
-- Run this in Supabase Dashboard → SQL Editor if uploads fail with "Bucket not found".

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 15728640) -- 15 MB, matches lib/uploadConstants.ts
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Storage RLS policies (uploads also work via service-role API routes)

drop policy if exists "Users upload own documents" on storage.objects;
create policy "Users upload own documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users read own documents" on storage.objects;
create policy "Users read own documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own documents" on storage.objects;
create policy "Users delete own documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Admins manage all documents storage" on storage.objects;
create policy "Admins manage all documents storage"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

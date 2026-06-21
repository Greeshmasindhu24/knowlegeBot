import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase-server';
import { processDocument } from './documentProcessor';
import { embedAndStoreChunks } from './rag';

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId);

  if (error) {
    throw new Error(`Failed to delete existing chunks: ${error.message}`);
  }
}

export async function ingestDocumentBuffer(
  documentId: string,
  buffer: Buffer,
  fileType: string
): Promise<number> {
  await deleteDocumentChunks(documentId);
  const chunks = await processDocument(buffer, fileType);

  if (chunks.length > 0) {
    await embedAndStoreChunks(documentId, chunks);
  }

  return chunks.length;
}

export async function reindexDocument(
  supabase: SupabaseClient,
  documentId: string
): Promise<{ chunkCount: number; documentName: string }> {
  const { data: document, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error || !document) {
    throw new Error('Document not found or access denied');
  }

  const supabaseAdmin = createAdminClient();
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from('documents')
    .download(document.file_path);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download document from storage: ${downloadError?.message}`);
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const chunkCount = await ingestDocumentBuffer(documentId, buffer, document.file_type);

  await supabaseAdmin
    .from('documents')
    .update({
      source_updated_at: new Date().toISOString(),
    })
    .eq('id', documentId);

  return { chunkCount, documentName: document.name };
}

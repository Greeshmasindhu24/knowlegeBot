import { createAdminClient } from '@/lib/supabase-server';
import { ingestDocumentBuffer } from '@/lib/ingestion';
import { ConnectorSyncResult } from './index';

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function syncFromUrl(
  url: string,
  userId: string,
  department: string,
  metadata: { owner?: string; sensitivityLabel?: string; version?: string }
): Promise<ConnectorSyncResult> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'EnterpriseKnowledgeBot/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  let fileType = 'txt';
  let name = new URL(url).pathname.split('/').pop() || 'web-page';

  if (contentType.includes('html') || name.endsWith('.html') || name.endsWith('.htm')) {
    const text = stripHtml(buffer.toString('utf-8'));
    const textBuffer = Buffer.from(text, 'utf-8');
    fileType = 'txt';
    name = name.replace(/\.html?$/, '') + '.txt';

    return persistConnectorDocument({
      buffer: textBuffer,
      fileType,
      name,
      userId,
      department,
      sourceSystem: 'url',
      sourceUrl: url,
      metadata,
    });
  }

  if (contentType.includes('pdf') || name.endsWith('.pdf')) fileType = 'pdf';
  else if (name.endsWith('.docx')) fileType = 'docx';

  return persistConnectorDocument({
    buffer,
    fileType,
    name,
    userId,
    department,
    sourceSystem: 'url',
    sourceUrl: url,
    metadata,
  });
}

async function persistConnectorDocument(params: {
  buffer: Buffer;
  fileType: string;
  name: string;
  userId: string;
  department: string;
  sourceSystem: string;
  sourceUrl: string;
  metadata: { owner?: string; sensitivityLabel?: string; version?: string };
}): Promise<ConnectorSyncResult> {
  const supabaseAdmin = createAdminClient();
  const storagePath = `${params.userId}/${Date.now()}-${params.name}`;

  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(storagePath, params.buffer, {
      contentType: 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .insert({
      name: params.name,
      file_path: uploadData.path,
      file_size: params.buffer.length,
      file_type: params.fileType,
      department: params.department,
      uploaded_by: params.userId,
      source_system: params.sourceSystem,
      source_url: params.sourceUrl,
      owner: params.metadata.owner || null,
      sensitivity_label: params.metadata.sensitivityLabel || 'internal',
      version: params.metadata.version || '1.0',
      source_updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (docError || !doc) {
    await supabaseAdmin.storage.from('documents').remove([uploadData.path]);
    throw new Error(`Database insert failed: ${docError?.message}`);
  }

  const chunkCount = await ingestDocumentBuffer(doc.id, params.buffer, params.fileType);

  return {
    documentId: doc.id,
    name: doc.name,
    sourceSystem: params.sourceSystem,
    chunkCount,
  };
}

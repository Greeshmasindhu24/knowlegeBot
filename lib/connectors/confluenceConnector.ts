import { ConnectorSyncResult } from './index';

/**
 * Confluence connector — requires Atlassian API token.
 * Set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN in env.
 */
export async function syncFromConfluence(
  pageId: string,
  userId: string,
  department: string,
  metadata: { owner?: string; sensitivityLabel?: string; version?: string }
): Promise<ConnectorSyncResult> {
  const baseUrl = process.env.CONFLUENCE_BASE_URL;
  const email = process.env.CONFLUENCE_EMAIL;
  const apiToken = process.env.CONFLUENCE_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      'Confluence connector not configured. Set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN.'
    );
  }

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const pageRes = await fetch(
    `${baseUrl.replace(/\/$/, '')}/wiki/rest/api/content/${pageId}?expand=body.storage,version`,
    { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
  );

  if (!pageRes.ok) {
    throw new Error(`Confluence page fetch failed: ${await pageRes.text()}`);
  }

  const page = await pageRes.json();
  const html = page.body?.storage?.value || '';
  const text = html
    .replace(/<ac:[^>]+>/g, '')
    .replace(/<\/ac:[^>]+>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const buffer = Buffer.from(text, 'utf-8');
  const name = `${page.title || 'confluence-page'}.txt`;

  const { createAdminClient } = await import('@/lib/supabase-server');
  const { ingestDocumentBuffer } = await import('@/lib/ingestion');

  const supabaseAdmin = createAdminClient();
  const storagePath = `${userId}/${Date.now()}-${name}`;

  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: 'text/plain', upsert: false });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .insert({
      name,
      file_path: uploadData.path,
      file_size: buffer.length,
      file_type: 'txt',
      department,
      uploaded_by: userId,
      source_system: 'confluence',
      source_url: `${baseUrl}/wiki/spaces/~/${pageId}`,
      owner: metadata.owner || null,
      sensitivity_label: metadata.sensitivityLabel || 'internal',
      version: String(page.version?.number || metadata.version || '1.0'),
      source_updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (docError || !doc) {
    await supabaseAdmin.storage.from('documents').remove([uploadData.path]);
    throw new Error(`Database insert failed: ${docError?.message}`);
  }

  const chunkCount = await ingestDocumentBuffer(doc.id, buffer, 'txt');

  return { documentId: doc.id, name: doc.name, sourceSystem: 'confluence', chunkCount };
}

import { ConnectorSyncResult } from './index';

/**
 * SharePoint connector — requires Microsoft Graph API credentials.
 * Set SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET in env.
 */
export async function syncFromSharePoint(
  siteUrl: string,
  userId: string,
  department: string,
  metadata: { owner?: string; sensitivityLabel?: string; version?: string; filePath?: string }
): Promise<ConnectorSyncResult> {
  const tenantId = process.env.SHAREPOINT_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'SharePoint connector not configured. Set SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, and SHAREPOINT_CLIENT_SECRET environment variables.'
    );
  }

  // OAuth client-credentials token for Microsoft Graph
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!tokenRes.ok) {
    throw new Error(`SharePoint auth failed: ${await tokenRes.text()}`);
  }

  const { access_token } = await tokenRes.json();

  const graphSite = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const siteRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphSite}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!siteRes.ok) {
    throw new Error(`SharePoint site lookup failed: ${await siteRes.text()}`);
  }

  const site = await siteRes.json();
  const filePath = metadata.filePath || 'Shared Documents';

  const driveRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root:/${encodeURIComponent(filePath)}:/content`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (!driveRes.ok) {
    throw new Error(
      `SharePoint file download failed. Provide metadata.filePath with the document path. ${await driveRes.text()}`
    );
  }

  const buffer = Buffer.from(await driveRes.arrayBuffer());
  const name = filePath.split('/').pop() || 'sharepoint-doc';
  const ext = name.split('.').pop()?.toLowerCase() || 'txt';

  const { createAdminClient } = await import('@/lib/supabase-server');
  const { ingestDocumentBuffer } = await import('@/lib/ingestion');

  const supabaseAdmin = createAdminClient();
  const storagePath = `${userId}/${Date.now()}-${name}`;

  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: 'application/octet-stream', upsert: false });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .insert({
      name,
      file_path: uploadData.path,
      file_size: buffer.length,
      file_type: ext,
      department,
      uploaded_by: userId,
      source_system: 'sharepoint',
      source_url: siteUrl,
      owner: metadata.owner || null,
      sensitivity_label: metadata.sensitivityLabel || 'internal',
      version: metadata.version || '1.0',
      source_updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (docError || !doc) {
    await supabaseAdmin.storage.from('documents').remove([uploadData.path]);
    throw new Error(`Database insert failed: ${docError?.message}`);
  }

  const chunkCount = await ingestDocumentBuffer(doc.id, buffer, ext);

  return { documentId: doc.id, name: doc.name, sourceSystem: 'sharepoint', chunkCount };
}

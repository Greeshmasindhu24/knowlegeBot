import { NextRequest, NextResponse } from 'next/server';
import { createServerSideClient, createAdminClient } from '@/lib/supabase-server';
import { syncFromUrl, syncFromSharePoint, syncFromConfluence } from '@/lib/connectors';
import { writeAuditLog, getClientIp } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSideClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { type, department, owner, sensitivityLabel, version, url, siteUrl, pageId, filePath } =
      body;

    if (!type || !department) {
      return NextResponse.json(
        { error: 'Connector type and department are required' },
        { status: 400 }
      );
    }

    const metadata = { owner, sensitivityLabel, version, filePath };
    let result;

    switch (type) {
      case 'url':
        if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        result = await syncFromUrl(url, user.id, department, metadata);
        break;
      case 'sharepoint':
        if (!siteUrl)
          return NextResponse.json({ error: 'siteUrl is required' }, { status: 400 });
        result = await syncFromSharePoint(siteUrl, user.id, department, metadata);
        break;
      case 'confluence':
        if (!pageId)
          return NextResponse.json({ error: 'pageId is required' }, { status: 400 });
        result = await syncFromConfluence(pageId, user.id, department, metadata);
        break;
      default:
        return NextResponse.json({ error: `Unknown connector type: ${type}` }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();
    await writeAuditLog(supabaseAdmin, {
      userId: user.id,
      action: 'connector_sync',
      ipAddress: getClientIp(req.headers),
      details: {
        connector: type,
        document_id: result.documentId,
        document_name: result.name,
        chunk_count: result.chunkCount,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

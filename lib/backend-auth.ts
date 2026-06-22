import { cookies } from 'next/headers';
import { getBackendUrl } from '@/lib/backendUrl';
import { parseJsonResponse } from '@/lib/parseJsonResponse';
import { createAdminClient } from '@/lib/supabase-server';

export interface BackendUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  department: string;
}

export async function getAuthenticatedUser(): Promise<BackendUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${getBackendUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const data = await parseJsonResponse<BackendUser>(res);
    if (!data.id) return null;

    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name ?? null,
      role: data.role ?? 'employee',
      department: data.department ?? 'General',
    };
  } catch {
    return null;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = ReturnType<typeof createAdminClient>;

async function findAuthUserByEmail(
  supabaseAdmin: AdminClient,
  email: string
): Promise<{ id: string; email?: string } | null> {
  const normalized = email.toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(`Failed to look up Supabase auth user by email: ${error.message}`);
    }

    const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) return match;

    if (data.users.length < 1000) break;
  }

  return null;
}

async function ensureAuthUser(supabaseAdmin: AdminClient, user: BackendUser): Promise<void> {
  const { data: authLookup } = await supabaseAdmin.auth.admin.getUserById(user.id);
  if (authLookup?.user) return;

  const createPayload = {
    id: user.id,
    email: user.email,
    email_confirm: true as const,
    user_metadata: {
      full_name: user.full_name,
      role: user.role,
      department: user.department,
    },
  };

  let { error: authErr } = await supabaseAdmin.auth.admin.createUser(createPayload);

  if (authErr) {
    const { data: retryLookup } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (retryLookup?.user) return;

    const byEmail = await findAuthUserByEmail(supabaseAdmin, user.email);
    if (byEmail && byEmail.id !== user.id) {
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(byEmail.id);
      if (deleteErr) {
        throw new Error(
          `Email ${user.email} is registered in Supabase auth under id ${byEmail.id}, ` +
            `but backend uses ${user.id}. Remove the duplicate auth account first: ${deleteErr.message}`
        );
      }

      ({ error: authErr } = await supabaseAdmin.auth.admin.createUser(createPayload));
    }

    if (authErr) {
      const { data: finalLookup } = await supabaseAdmin.auth.admin.getUserById(user.id);
      if (!finalLookup?.user) {
        throw new Error(`Failed to sync user to Supabase auth: ${authErr.message}`);
      }
    }
  }
}

/** Mirror backend JWT users into Supabase so RLS tables accept their UUIDs. */
export async function ensureSupabaseUser(user: BackendUser): Promise<void> {
  if (!UUID_RE.test(user.id)) {
    throw new Error(
      `Supabase public.users.id must be a UUID (linked to auth.users). Received: ${user.id}`
    );
  }

  const supabaseAdmin = createAdminClient();

  const { data: existingProfile } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (existingProfile) return;

  await ensureAuthUser(supabaseAdmin, user);

  const { error: upsertErr } = await supabaseAdmin.from('users').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      department: user.department,
    },
    { onConflict: 'id' }
  );

  if (upsertErr) {
    throw new Error(`Failed to sync user profile to Supabase: ${upsertErr.message}`);
  }

  const { data: verifiedProfile } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!verifiedProfile) {
    throw new Error(
      `User ${user.id} was not found in public.users after sync; cannot insert documents.`
    );
  }
}

function formatDocumentInsertError(error: { code?: string; message?: string }): string {
  if (error.code === '23503') {
    return (
      'Your account profile is not synced to the database yet. ' +
      'Log out and log back in, then retry the upload. ' +
      'If the problem persists, ask an admin to verify Supabase auth and public.users are linked.'
    );
  }

  return error.message || 'Unknown database error';
}

export async function insertDocumentRecord(
  supabaseAdmin: AdminClient,
  user: BackendUser,
  record: Record<string, unknown>
) {
  await ensureSupabaseUser(user);

  let { data, error } = await supabaseAdmin.from('documents').insert(record).select().single();

  if (error?.code === '23503') {
    await ensureSupabaseUser(user);
    ({ data, error } = await supabaseAdmin.from('documents').insert(record).select().single());
  }

  if (error) {
    throw new Error(formatDocumentInsertError(error));
  }

  if (!data) {
    throw new Error('Document insert succeeded but no row was returned.');
  }

  return data;
}

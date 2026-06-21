export interface UserProfile {
  email: string;
  full_name: string | null;
  role: string;
  department: string | null;
}

export async function fetchUserProfile(): Promise<UserProfile | null> {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;

    const data = await res.json();
    return {
      email: data.email ?? '',
      full_name: data.full_name ?? null,
      role: data.role ?? 'employee',
      department: data.department ?? null,
    };
  } catch {
    return null;
  }
}

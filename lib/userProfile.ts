export interface UserProfile {
  email: string;
  full_name: string | null;
  role: string;
  department: string | null;
}

export type UserProfileResult =
  | { profile: UserProfile; error?: undefined }
  | { profile: null; error: string };

export async function fetchUserProfile(): Promise<UserProfileResult> {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail =
        typeof data.detail === 'string'
          ? data.detail
          : res.status === 401
            ? 'Your session expired. Please log out and sign in again.'
            : 'Failed to load profile.';
      return { profile: null, error: detail };
    }

    return {
      profile: {
        email: data.email ?? '',
        full_name: data.full_name ?? null,
        role: data.role ?? 'employee',
        department: data.department ?? null,
      },
    };
  } catch {
    return {
      profile: null,
      error: 'Cannot reach the app server. Make sure the frontend and backend are running.',
    };
  }
}

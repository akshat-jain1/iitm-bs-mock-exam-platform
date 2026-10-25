import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/get-user-role';

export interface CachedAuthUser {
  id: string;
  email?: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  user_role?: string;
  role?: string;
  aud?: string;
}

/**
 * Request-scoped memoized current user lookup.
 * Uses supabase.auth.getClaims() to eliminate remote getUser() network calls
 * while preserving request-level React cache memoization.
 * Returns a user-shaped object matching caller expectations (id, email, user_metadata, etc.).
 */
export const getCachedUser = cache(async (): Promise<CachedAuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims || !claims.sub) {
    return null;
  }

  return {
    id: claims.sub as string,
    email: (claims.email as string) || undefined,
    user_metadata: (claims.user_metadata || {}) as Record<string, unknown>,
    app_metadata: (claims.app_metadata || {}) as Record<string, unknown>,
    user_role: (claims.user_role as string) || undefined,
    role: (claims.role as string) || undefined,
    aud: (claims.aud as string) || undefined,
  };
});

/**
 * Request-scoped memoized user role lookup.
 * Fast-paths the JWT user_role claim when available, avoiding DB queries entirely.
 */
export const getCachedUserRole = cache(
  async (
    user: { id: string; email?: string | null; user_role?: string | null },
    options?: { skipJwtClaim?: boolean }
  ): Promise<string> => {
    if (!user) return 'student';
    if (!options?.skipJwtClaim && (user.user_role === 'admin' || user.user_role === 'student' || user.user_role === 'tester')) {
      return user.user_role;
    }
    return await getUserRole(user, options);
  }
);

/**
 * Request-scoped administrator verification helper.
 * Uses cached identity and double-checks the database role (skipJwtClaim: true)
 * for sensitive administrative write actions to guarantee immediate revocation
 * if an administrator's privileges have been demoted.
 */
export async function verifyAdmin() {
  const user = await getCachedUser();

  if (!user) {
    throw new Error('Unauthorized: Please sign in as an administrator.');
  }

  // Security hardening: verify against the authoritative database record for write operations
  const role = await getCachedUserRole(user, { skipJwtClaim: true });

  if (role !== 'admin') {
    throw new Error('Forbidden: Administrator privileges required.');
  }

  const supabase = await createClient();
  return { supabase, user };
}

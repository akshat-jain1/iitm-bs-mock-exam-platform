import { createClient } from '@/lib/supabase/server'
import { getServiceClientOrNull } from '@/lib/supabase/service'

/**
 * Resilient, multi-layer user role lookup.
 * 
 * 0. Fast-path: Reads role from JWT custom claim ('user_role' injected by Custom Access Token Hook)
 *    first, eliminating database roundtrips completely when the hook is active.
 * 1. Queries public.users via the authenticated SSR client (respects RLS, checks both id and email).
 * 2. If SSR lookup returns null or fails (due to RLS edge cases, cold starts, or session refresh timings),
 *    falls back to a server-side service-role client to query public.users directly by id OR email.
 * 3. If an existing profile is found by email with a mismatched UUID, it automatically synchronizes
 *    the public.users record's id to match auth.users.id so future RLS lookups succeed seamlessly.
 */
export async function getUserRole(
  user: { id: string; email?: string | null; user_role?: string | null },
  options?: { skipJwtClaim?: boolean }
): Promise<string> {
  if (!user) return 'student'

  // 0. Primary: Read from JWT claims first (unless skipJwtClaim requested for sensitive write mutations)
  // Only accept valid known roles ('admin', 'student', or 'tester'); otherwise fall back to DB lookup
  if (!options?.skipJwtClaim) {
    if (user.user_role === 'admin' || user.user_role === 'student' || user.user_role === 'tester') {
      return user.user_role
    }

    try {
      const supabase = await createClient()
      const { data: claimsData } = await supabase.auth.getClaims()
      const claimRole = claimsData?.claims?.user_role as string | undefined
      if (claimRole === 'admin' || claimRole === 'student' || claimRole === 'tester') {
        return claimRole
      }
    } catch (err) {
      console.error('[getUserRole] claims lookup error:', err)
    }
  }

  // 1. Resilient DB lookup: SSR client lookup (reads active session cookie)
  try {
    const supabase = await createClient()
    let query = supabase.from('users').select('role')

    if (user.email) {
      query = query.or(`id.eq.${user.id},email.eq.${user.email}`)
    } else {
      query = query.eq('id', user.id)
    }

    const { data: profile } = await query.maybeSingle()

    if (profile?.role) {
      return profile.role
    }
  } catch (err) {
    console.error('[getUserRole] SSR client lookup error:', err)
  }

  // 2. Resilient Fallback: Server-side Service Role Client (bypasses RLS)
  const adminClient = getServiceClientOrNull()

  if (adminClient) {
    try {
      let query = adminClient.from('users').select('id, role')

      if (user.email) {
        query = query.or(`id.eq.${user.id},email.eq.${user.email}`)
      } else {
        query = query.eq('id', user.id)
      }

      const { data: profile } = await query.maybeSingle()

      if (profile) {
        // If public.users has a divergent ID from auth.users, synchronize it
        if (profile.id !== user.id && user.email) {
          try {
            await adminClient
              .from('users')
              .update({ id: user.id })
              .eq('email', user.email)
          } catch (syncErr) {
            console.error('[getUserRole] ID synchronization error:', syncErr)
          }
        }
        return profile.role
      }
    } catch (adminErr) {
      console.error('[getUserRole] Service client lookup error:', adminErr)
    }
  }

  return 'student'
}

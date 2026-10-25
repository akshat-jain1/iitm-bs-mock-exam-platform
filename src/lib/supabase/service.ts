import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

let serviceClientInstance: SupabaseClient | null = null

/**
 * Shared, module-level Supabase service-role client helper.
 * Server-only, persistSession: false, autoRefreshToken: false.
 * Replaces repeated inline service client instantiations across the codebase.
 */
export function getServiceClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('Supabase service-role client cannot be instantiated in client-side code.')
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set.')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'

  if (!serviceClientInstance) {
    serviceClientInstance = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return serviceClientInstance
}

/**
 * Returns the service-role client if SUPABASE_SERVICE_ROLE_KEY is configured,
 * otherwise returns null for safe fallback.
 */
export function getServiceClientOrNull(): SupabaseClient | null {
  if (typeof window !== 'undefined') return null
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return null
  return getServiceClient()
}

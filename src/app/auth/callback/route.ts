import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClientOrNull } from '@/lib/supabase/service'
import { validateScalerEmail } from '@/lib/auth/config'
import { getUserRole } from '@/lib/auth/get-user-role'

export const dynamic = 'force-dynamic'

function getRedirectBaseUrl(request: Request): string {
  // 1. Explicit site URL override if configured (e.g. NEXT_PUBLIC_SITE_URL)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }
  // 2. In non-development (Vercel production/preview), determine origin from proxy headers
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  if (process.env.NODE_ENV !== 'development' && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }
  // 3. Fallback to incoming request origin (standard for local dev)
  const { origin } = new URL(request.url)
  return origin
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const baseUrl = getRedirectBaseUrl(request)
  const code = searchParams.get('code')
  const oauthError = searchParams.get('error')
  const oauthErrorDesc = searchParams.get('error_description')
  const next = searchParams.get('next')

  // Handle provider-level error
  if (oauthError) {
    console.error('[OAuth Provider Error]:', oauthError, oauthErrorDesc)
    return NextResponse.redirect(
      `${baseUrl}/login?error=${encodeURIComponent(oauthErrorDesc || oauthError)}`
    )
  }

  if (code) {
    const supabase = await createClient()
    const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('[OAuth Code Exchange Error]:', exchangeError.message)
      return NextResponse.redirect(`${baseUrl}/login?error=Invalid_Auth_Code`)
    }

    // Retrieve verified session user directly from the cryptographic exchange response
    const user = exchangeData?.user

    if (!user) {
      console.error('[OAuth User Fetch Error]: No verified user returned from code exchange')
      return NextResponse.redirect(`${baseUrl}/login?error=Authentication_Failed`)
    }

    // 1. Check if email is verified by provider
    const isEmailVerified = Boolean(
      user.user_metadata?.email_verified === true ||
      user.user_metadata?.email_verified === 'true' ||
      user.email_confirmed_at != null ||
      user.app_metadata?.provider === 'google'
    )

    // 2. Exact domain validation against official Scaler domain (sst.scaler.com)
    const validation = validateScalerEmail(user.email, isEmailVerified)

    if (!validation.allowed) {
      console.warn(
        `[SECURITY] Unauthorized login attempt rejected: ${user.email} (ID: ${user.id}). Reason: ${validation.reason}`
      )

      // Terminate current authenticated session immediately
      await supabase.auth.signOut()

      // Purge the unauthorized auth user so no phantom record or profile remains
      const adminClient = getServiceClientOrNull()
      if (adminClient) {
        try {
          await adminClient.auth.admin.deleteUser(user.id)
        } catch (cleanupErr) {
          console.error('[OAuth Cleanup Error]:', cleanupErr)
        }
      }

      // Redirect to clear access restriction page
      return NextResponse.redirect(`${baseUrl}/login?error=scaler_domain_required`)
    }

    // 3. Official Scaler account — provision profile & resolve database role in a single RPC round-trip
    let userRole = 'student'
    const adminClient = getServiceClientOrNull()

    if (adminClient) {
      try {
        const userName = user.user_metadata?.full_name || user.user_metadata?.name || 'Student'
        const { data: provisionedRole, error: rpcError } = await adminClient.rpc('provision_user_on_login', {
          p_user_id: user.id,
          p_email: user.email!,
          p_name: userName,
        })

        if (!rpcError && provisionedRole) {
          userRole = provisionedRole
        } else {
          if (rpcError) {
            console.error('[OAuth Provisioning RPC Error]:', rpcError.message)
          }
          userRole = await getUserRole(user)
        }
      } catch (profileErr) {
        console.error('[OAuth Profile Error]:', profileErr)
        userRole = await getUserRole(user)
      }
    } else {
      userRole = await getUserRole(user)
    }

    // 4. Role-based routing: Admin -> /admin, Student -> /student
    let destination = userRole === 'admin' ? '/admin' : '/student'
    if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) {
      try {
        const parsed = new URL(next, 'http://localhost')
        const targetPath = parsed.pathname
        const fullTarget = `${parsed.pathname}${parsed.search}`
        if (targetPath !== '/login' && !targetPath.startsWith('/auth')) {
          if (userRole === 'admin') {
            if (targetPath === '/' || targetPath.startsWith('/admin')) {
              destination = targetPath === '/' ? '/admin' : fullTarget
            }
          } else {
            if (targetPath === '/' || targetPath.startsWith('/student') || targetPath.startsWith('/attempt') || targetPath.startsWith('/mock-exam')) {
              destination = targetPath === '/' ? '/student' : fullTarget
            }
          }
        }
      } catch {
        // Fall back to default role destination
      }
    }

    return NextResponse.redirect(`${baseUrl}${destination}`)
  }

  return NextResponse.redirect(`${baseUrl}/login?error=Invalid_Auth_Code`)
}

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedScalerEmail } from '@/lib/auth/config'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  const user = claims && claims.sub ? { id: claims.sub, email: claims.email as string | undefined } : null

  const pathname = request.nextUrl.pathname

  const isStudentRoute =
    pathname.startsWith('/student') ||
    pathname.startsWith('/attempt') ||
    pathname.startsWith('/mock-exam')

  const isAdminRoute = pathname.startsWith('/admin')

  // 1. Require authentication for protected routes
  if (!user && (isAdminRoute || isStudentRoute)) {
    const url = request.nextUrl.clone()
    const returnPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
    url.pathname = '/login'
    url.search = ''
    if (returnPath && returnPath !== '/' && returnPath !== '/login') {
      url.searchParams.set('next', returnPath)
    }
    return NextResponse.redirect(url)
  }

  // 2. Strict Scaler domain restriction for student routes
  if (user && isStudentRoute) {
    if (!isAllowedScalerEmail(user.email)) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'scaler_domain_required')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

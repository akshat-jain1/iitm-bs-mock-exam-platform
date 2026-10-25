"use client"

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/theme/ThemeProvider'

function LoginForm() {
  const [showDevLogin, setShowDevLogin] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  // Error message formatting
  let errorMessage: string | null = null
  if (errorParam === 'scaler_domain_required') {
    errorMessage = 'Access restricted. Please sign in using your official Scaler email account (@sst.scaler.com).'
  } else if (errorParam === 'scaler_unverified_email') {
    errorMessage = 'Access restricted. Your Scaler email account is not verified by Google.'
  } else if (errorParam === 'Invalid_Auth_Code') {
    errorMessage = 'Authentication session expired or code was invalid. Please try again.'
  } else if (errorParam) {
    errorMessage = decodeURIComponent(errorParam)
  }

  // Unified Google OAuth Flow for both Students and Administrators
  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    const supabase = createClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    const origin = siteUrl ? siteUrl.replace(/\/$/, '') : window.location.origin

    const nextParam = searchParams.get('next')
    const callbackUrl = new URL(`${origin}/auth/callback`)
    if (nextParam) {
      callbackUrl.searchParams.set('next', nextParam)
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: {
          prompt: 'select_account',
          access_type: 'offline',
        },
      },
    })

    if (error) {
      console.error('Google OAuth initialization error:', error)
      setGoogleLoading(false)
    }
  }

  // Legacy Dev/Admin Password Login Flow (Preserved for local development)
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminError(null)
    setAdminLoading(true)

    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    })

    if (authError || !authData.user) {
      setAdminError('Invalid administrator credentials. Please check your email and password.')
      setAdminLoading(false)
      return
    }

    // Role Guard: Verify user is an authorized administrator
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (profile?.role !== 'admin') {
      // Immediately revoke session: students are strictly prohibited from using password sign-in
      await supabase.auth.signOut()
      setAdminError('Access denied: This sign-in is reserved for staff and administrators. Students must use "Continue with Google".')
      setAdminLoading(false)
      return
    }

    const nextParam = searchParams.get('next')
    if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/login')) {
      router.push(nextParam)
    } else {
      router.push('/admin')
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 font-sans">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white font-bold text-xl mb-3 shadow-sm">
            S
          </div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Scaler Examination Platform</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">Official Academic Examination Portal</p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg shadow-sm flex items-start space-x-3">
            <span className="text-red-500 dark:text-red-400 text-lg leading-none font-bold">⚠️</span>
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        <Card className="border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
          <CardHeader className="space-y-1 pb-4 text-center">
            <CardTitle className="text-xl font-semibold">Sign In</CardTitle>
            <p className="text-sm text-muted-foreground">Authenticate with your official Scaler account to continue</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {/* Primary Action: Single Unified Continue with Google Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-800 transition-colors duration-150 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>

            <p className="text-xs text-center text-slate-500 dark:text-slate-400 font-medium mt-3">
              Use your official Scaler Google account (<span className="font-mono text-slate-700 dark:text-slate-200 font-semibold">@sst.scaler.com</span>). Students, Faculty, and Administrators are routed automatically based on role.
            </p>
          </CardContent>

          <CardFooter className="flex flex-col justify-center border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4">
            <button
              type="button"
              onClick={() => setShowDevLogin(!showDevLogin)}
              className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
            >
              {showDevLogin ? 'Hide Dev/Admin Password Sign In' : 'Developer & Staff Password Sign In'}
            </button>

            {showDevLogin && (
              <form onSubmit={handleAdminLogin} className="w-full mt-4 space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Local Dev / Staff Authentication
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Email Address</label>
                  <Input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@gmail.com"
                    disabled={adminLoading}
                    required
                    className="mt-1 text-sm bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Password</label>
                  <Input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={adminLoading}
                    required
                    className="mt-1 text-sm bg-white dark:bg-slate-900"
                  />
                </div>

                {adminError && (
                  <div className="p-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 rounded">
                    {adminError}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={adminLoading}
                  className="w-full text-xs py-2 mt-1 bg-slate-900 hover:bg-slate-800 text-white shadow-xs font-semibold"
                >
                  {adminLoading ? 'Authenticating...' : 'Sign In as Administrator'}
                </Button>
              </form>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}

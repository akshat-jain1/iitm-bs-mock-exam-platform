import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/theme/ThemeProvider'

export default function SignupPage() {
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

        <Card className="border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="space-y-1 pb-4 text-center">
            <CardTitle className="text-xl font-semibold">Student Account Creation</CardTitle>
            <p className="text-sm text-muted-foreground">Self-registration via username/password is disabled</p>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Students do not need to register manually. Your student account is automatically provisioned when you sign in with your official Scaler Google account (<span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">@sst.scaler.com</span>).
            </p>
            <div className="pt-2">
              <Link href="/login" className="w-full">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  Go to Student Sign In
                </Button>
              </Link>
            </div>
          </CardContent>
          <CardFooter className="justify-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-4">
            Only official @sst.scaler.com accounts are permitted access.
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

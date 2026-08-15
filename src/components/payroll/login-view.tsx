'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, ShieldCheck } from 'lucide-react'
import FaceLoginStep from '@/components/payroll/face-login-step'
import ForgotPasswordStep from '@/components/payroll/forgot-password-step'
import { getBestEffortLocation } from '@/lib/geolocation-client'

interface PendingFace {
  pendingToken: string
  enrolled: boolean
}

export default function LoginView({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingFace, setPendingFace] = useState<PendingFace | null>(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      // Best-effort only — never blocks or delays sign-in on a denied/slow/unsupported prompt.
      // Only ever affects whether a login-triggered auto-punch (if enabled) is geofence-checked.
      const location = await getBestEffortLocation()
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          accuracy: location?.accuracy ?? null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Login failed')
      }
      if (json.requiresFaceVerification) {
        setPendingFace({ pendingToken: json.pendingToken, enrolled: json.enrolled })
        return
      }
      toast.success(`Welcome, ${json.user.name}`)
      onLoggedIn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFaceSuccess = (user: { name: string }) => {
    toast.success(`Welcome, ${user.name}`)
    onLoggedIn()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <ShieldCheck className="size-5" />
          </div>
          <CardTitle className="text-xl">PayrollPro</CardTitle>
          <CardDescription>
            {pendingFace ? 'One more step to finish signing in' : showForgotPassword ? 'Reset your password' : 'Sign in to continue'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingFace ? (
            <FaceLoginStep
              pendingToken={pendingFace.pendingToken}
              enrolled={pendingFace.enrolled}
              onSuccess={handleFaceSuccess}
              onBack={() => setPendingFace(null)}
            />
          ) : showForgotPassword ? (
            <ForgotPasswordStep onBack={() => setShowForgotPassword(false)} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@payrollpro.local"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs text-muted-foreground hover:text-emerald-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Sign in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

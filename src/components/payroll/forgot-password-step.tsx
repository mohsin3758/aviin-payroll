'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ForgotPasswordStepProps {
  onBack: () => void;
}

// Split out of login-view.tsx the same way face-login-step.tsx was — a small self-contained
// step rendered inside LoginView's own Card, no navigation/route change involved.
export default function ForgotPasswordStep({ onBack }: ForgotPasswordStepProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Always show the same confirmation regardless of the response — the API itself is
      // anti-enumeration (identical response whether or not the email exists), so the UI must
      // never behave differently based on outcome either.
      setSent(true);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <Mail className="size-5" />
        </div>
        <p className="text-sm text-muted-foreground">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent password reset instructions. Check your inbox.
        </p>
        <Button type="button" variant="ghost" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="size-4" />Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">Enter your email and we&apos;ll send you a link to reset your password.</p>
      <div className="space-y-1.5">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
        />
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
        Send reset link
      </Button>
      <Button type="button" variant="ghost" onClick={onBack} className="w-full gap-1.5">
        <ArrowLeft className="size-4" />Back to sign in
      </Button>
    </form>
  );
}

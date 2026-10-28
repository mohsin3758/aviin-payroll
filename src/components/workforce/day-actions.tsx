'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, LogIn, LogOut, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fmtTime } from './api';

export interface DayStatusView {
  state: string; checkInAt: string | null; checkOutAt: string | null; hoursWorked: number | null; eodDone: boolean; closed: boolean; reasons?: string[];
}

const STATE_TEXT: Record<string, string> = {
  pending: 'Not checked in yet', present: 'Checked in', late: 'Checked in (late)', half_day: 'Half day', absent: 'Absent', leave: 'On leave', holiday: 'Holiday', weekly_off: 'Weekly off',
};

/**
 * The big-button day screen shared by the logged-in "My Work Day" view and the signed-link page:
 * Check in, Check out, Still online, and the end-of-day update (under a minute).
 * `send` performs one action and resolves when the server accepted it.
 */
export default function DayActions({ status, pulsePending, showPulse = true, send, onDone }: {
  status: DayStatusView | null;
  pulsePending?: boolean;
  showPulse?: boolean;
  send: (body: Record<string, unknown>) => Promise<void>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [eod, setEod] = useState({ completed: '', inProgress: '', blockers: '', hours: '', tomorrow: '' });
  const checkedIn = !!status?.checkInAt;

  const go = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await send(body); toast.success(ok); onDone(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <p className="text-base font-medium">{STATE_TEXT[status?.state ?? 'pending'] ?? status?.state}</p>
        <p className="text-slate-600">In: {fmtTime(status?.checkInAt)} · Out: {fmtTime(status?.checkOutAt)}{status?.hoursWorked != null ? ` · ${status.hoursWorked} h` : ''}</p>
        {status?.eodDone && <p className="mt-1 flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />Today&apos;s update sent</p>}
        {status?.closed && <p className="mt-1 text-slate-500">This day is closed. Ask your coordinator if something is wrong.</p>}
      </div>

      {!status?.closed && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" className="h-16 text-base" disabled={busy || checkedIn} onClick={() => go({ action: 'checkin' }, 'Checked in')}><LogIn className="mr-2 h-5 w-5" />Check in</Button>
            <Button size="lg" variant="outline" className="h-16 text-base" disabled={busy || !checkedIn || !!status?.checkOutAt} onClick={() => go({ action: 'checkout' }, 'Checked out')}><LogOut className="mr-2 h-5 w-5" />Check out</Button>
          </div>
          {showPulse && checkedIn && (
            <div className="grid grid-cols-3 gap-2">
              <Button variant={pulsePending ? 'default' : 'outline'} disabled={busy} onClick={() => go({ action: 'pulse', answer: 'online' }, 'Thanks, noted')}><Wifi className="mr-1 h-4 w-4" />Still online</Button>
              <Button variant="outline" disabled={busy} onClick={() => go({ action: 'pulse', answer: 'break' }, 'Noted: on a break')}>On a break</Button>
              <Button variant="outline" disabled={busy} onClick={() => go({ action: 'pulse', answer: 'leave' }, 'Your coordinator has been told')}>Need leave</Button>
            </div>
          )}

          {checkedIn && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="font-medium">Today&apos;s update <span className="text-xs font-normal text-slate-500">(under a minute)</span></p>
              <div><Label>What did you complete?</Label><Textarea rows={2} value={eod.completed} onChange={(e) => setEod({ ...eod, completed: e.target.value })} /></div>
              <div><Label>Still in progress</Label><Textarea rows={2} value={eod.inProgress} onChange={(e) => setEod({ ...eod, inProgress: e.target.value })} /></div>
              <div><Label>Any blockers?</Label><Textarea rows={2} value={eod.blockers} onChange={(e) => setEod({ ...eod, blockers: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Hours worked</Label><Input type="number" step="0.25" min="0" max="24" value={eod.hours} onChange={(e) => setEod({ ...eod, hours: e.target.value })} /></div>
                <div><Label>Planned tomorrow</Label><Input value={eod.tomorrow} onChange={(e) => setEod({ ...eod, tomorrow: e.target.value })} /></div>
              </div>
              <Button disabled={busy || (!eod.completed.trim() && !eod.hours)} onClick={() => go({
                action: 'eod', mode: 'web_link', completed: eod.completed || null, inProgress: eod.inProgress || null, blockers: eod.blockers || null,
                hours: eod.hours ? Number(eod.hours) : null, tomorrow: eod.tomorrow || null,
              }, 'Update sent')}>{status?.eodDone ? 'Send again (replaces the earlier one)' : 'Send update'}</Button>
            </div>
          )}
        </>
      )}
      {status?.reasons && status.reasons.length > 0 && <ul className="list-disc pl-5 text-xs text-slate-500">{status.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
    </div>
  );
}

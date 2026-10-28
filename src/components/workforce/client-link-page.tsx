'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Flag, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmtTime, wf } from '@/components/workforce/api';

interface Row {
  assignmentId: string; contractor: string; state: string; stateLabel: string; checkInAt: string | null; checkOutAt: string | null; hoursWorked: number | null;
  overtimeHours: number; approvedOvertimeHours: number; completed: string | null; inProgress: string | null; blockers: string | null; clientConfirm: string; locked: boolean;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Public page behind the signed link a client representative gets in the daily digest. One tap to confirm or dispute. */
export default function ClientLinkPage({ token }: { token: string }) {
  const [data, setData] = useState<{ contact: string; project: string; client: string; date: string; rows: Row[]; signOffs: { year: number; month: number; status: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dispute, setDispute] = useState<Row | null>(null);
  const [d, setD] = useState({ reason: '', comment: '', claimedHours: '' });
  const [ot, setOt] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<Row | null>(null);
  const [rating, setRating] = useState(0);
  const [onTrack, setOnTrack] = useState<boolean | undefined>(undefined);

  const load = useCallback(async (date?: string) => {
    try { setData(await wf(`/api/workforce/c/${token}${date ? `?date=${date}` : ''}`)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await wf(`/api/workforce/c/${token}`, { method: 'POST', json: { ...body, date: data?.date } }); toast.success(ok); await load(data?.date); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const signoff = async (year: number, month: number) => {
    setBusy(true);
    try { await wf(`/api/workforce/c/${token}/signoff`, { method: 'POST', json: { year, month } }); toast.success('Month approved. Thank you.'); await load(data?.date); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const ym = data ? { year: Number(data.date.slice(0, 4)), month: Number(data.date.slice(5, 7)) } : null;
  const prev = ym ? (ym.month === 1 ? { year: ym.year - 1, month: 12 } : { year: ym.year, month: ym.month - 1 }) : null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-4">
      <h1 className="pt-2 text-xl font-semibold">Aviin · Workforce summary</h1>
      {error && <Card><CardContent className="py-6 text-center text-slate-700">{error}</CardContent></Card>}
      {data && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{data.client} · {data.project}</CardTitle>
              <CardDescription>Hello {data.contact}. Summary for {data.date}. Please confirm each contractor&apos;s day, or tell us if something is wrong.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {data.rows.length === 0 && <p className="text-slate-600">No contractors are assigned to you for this day.</p>}
              {data.rows.map((r) => (
                <div key={r.assignmentId} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><span className="font-medium">{r.contractor}</span> <Badge variant="outline">{r.stateLabel}</Badge>
                      {r.clientConfirm === 'confirmed' && <Badge className="ml-1 bg-emerald-100 text-emerald-800">Confirmed</Badge>}
                      {r.clientConfirm === 'disputed' && <Badge className="ml-1 bg-red-100 text-red-800">Query raised</Badge>}</div>
                    <span className="text-sm text-slate-600">In {fmtTime(r.checkInAt)} · Out {fmtTime(r.checkOutAt)}{r.hoursWorked != null ? ` · ${r.hoursWorked} h` : ''}</span>
                  </div>
                  {(r.completed || r.inProgress || r.blockers) && (
                    <div className="mt-1 text-sm text-slate-700">
                      {r.completed && <p><span className="text-slate-500">Completed:</span> {r.completed}</p>}
                      {r.inProgress && <p><span className="text-slate-500">In progress:</span> {r.inProgress}</p>}
                      {r.blockers && <p><span className="text-slate-500">Blockers:</span> {r.blockers}</p>}
                    </div>
                  )}
                  {r.overtimeHours > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span>Worked {r.overtimeHours} h beyond the normal day. Hours you approve as overtime:</span>
                      <Input type="number" step="0.25" min="0" max={r.overtimeHours} className="h-8 w-24" value={ot[r.assignmentId] ?? String(r.approvedOvertimeHours)} onChange={(e) => setOt({ ...ot, [r.assignmentId]: e.target.value })} /></div>
                  )}
                  {!r.locked && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy} onClick={() => post({ decision: 'confirm', assignmentId: r.assignmentId, ...(r.overtimeHours > 0 ? { approvedOvertimeHours: Number(ot[r.assignmentId] ?? r.approvedOvertimeHours) } : {}) }, 'Confirmed')}><Check className="mr-1 h-4 w-4" />Confirm</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { setD({ reason: '', comment: '', claimedHours: '' }); setDispute(r); }}><Flag className="mr-1 h-4 w-4" />Something is wrong</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRating(0); setOnTrack(undefined); setFb(r); }}><Star className="mr-1 h-4 w-4" />Rate this contractor</Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {prev && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Monthly approval</CardTitle><CardDescription>Once a month has ended and all queries are settled, approve it so it can go to payroll.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {[prev, ym!].map((m) => {
                  const done = data.signOffs.find((s) => s.year === m.year && s.month === m.month)?.status === 'signed';
                  return <Button key={`${m.year}-${m.month}`} variant="outline" disabled={busy || done} onClick={() => signoff(m.year, m.month)}>{done ? `${MONTHS[m.month - 1]} ${m.year}: approved ✓` : `Approve ${MONTHS[m.month - 1]} ${m.year}`}</Button>;
                })}
              </CardContent></Card>
          )}
        </>
      )}

      <Dialog open={!!dispute} onOpenChange={(o) => !o && setDispute(null)}>
        <DialogContent className="sm:max-w-md">
          {dispute && (<>
            <DialogHeader><DialogTitle>What is wrong with {dispute.contractor}&apos;s day?</DialogTitle><DialogDescription>A coordinator will look into it. Nothing changes in payment until it is settled.</DialogDescription></DialogHeader>
            <div className="space-y-2">
              <div><Label>Reason</Label><Input placeholder="e.g. Was not available after lunch" value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} /></div>
              <div><Label>Hours you believe they worked (optional)</Label><Input type="number" step="0.25" value={d.claimedHours} onChange={(e) => setD({ ...d, claimedHours: e.target.value })} /></div>
              <div><Label>Anything else</Label><Textarea rows={2} value={d.comment} onChange={(e) => setD({ ...d, comment: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setDispute(null)}>Cancel</Button>
              <Button disabled={busy || d.reason.trim().length < 3} onClick={async () => { await post({ decision: 'dispute', assignmentId: dispute.assignmentId, reason: d.reason, comment: d.comment || undefined, ...(d.claimedHours ? { claimedHours: Number(d.claimedHours) } : {}) }, 'Thank you, we will look into it'); setDispute(null); }}>Send</Button></DialogFooter></>)}
        </DialogContent>
      </Dialog>

      <Dialog open={!!fb} onOpenChange={(o) => !o && setFb(null)}>
        <DialogContent className="sm:max-w-sm">
          {fb && (<>
            <DialogHeader><DialogTitle>{fb.contractor}</DialogTitle><DialogDescription>Your view this week helps us support them.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2"><Button variant={onTrack === true ? 'default' : 'outline'} onClick={() => setOnTrack(true)}>On track</Button><Button variant={onTrack === false ? 'default' : 'outline'} onClick={() => setOnTrack(false)}>Not on track</Button></div>
              <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}><Star className={`h-7 w-7 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} /></button>)}</div>
            </div>
            <DialogFooter><Button disabled={busy || (onTrack === undefined && rating === 0)} onClick={async () => { await post({ decision: 'feedback', assignmentId: fb.assignmentId, ...(onTrack !== undefined ? { onTrack } : {}), ...(rating ? { rating } : {}) }, 'Thanks for the feedback'); setFb(null); }}>Send</Button></DialogFooter></>)}
        </DialogContent>
      </Dialog>
    </main>
  );
}

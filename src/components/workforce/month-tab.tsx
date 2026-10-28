'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock, RefreshCw, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSessionContext } from '@/hooks/session-context';
import { wf } from './api';

const inr = (n: number | null | undefined) => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function MonthTab() {
  const { user } = useSessionContext();
  const isAdmin = user?.role === 'admin';
  const full = user?.role === 'admin' || user?.role === 'hr';
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [projects, setProjects] = useState<{ id: string; name: string; client: { name: string } }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [year, setYear] = useState(prev.getFullYear());
  const [month, setMonth] = useState(prev.getMonth() + 1);
  const [data, setData] = useState<any | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [entries, setEntries] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [signNote, setSignNote] = useState('');
  const [waive, setWaive] = useState('');
  const [decide, setDecide] = useState<{ s: any; decision: 'approve' | 'reject' | 'modify' } | null>(null);
  const [reason, setReason] = useState('');
  const [mod, setMod] = useState({ unpaidDays: '', unitsWorked: '', rateOverride: '' });
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  useEffect(() => { wf<any[]>('/api/projects').then((p) => { setProjects(p); if (p[0]) setProjectId((x) => x || p[0].id); }).catch((e) => toast.error(e.message)); }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setData(await wf(`/api/workforce/month?projectId=${projectId}&year=${year}&month=${month}`));
      if (full) {
        setSuggestions(await wf(`/api/workforce/suggestions?year=${year}&month=${month}`));
        setEntries(await wf(`/api/workforce/month/entries?year=${year}&month=${month}&projectId=${projectId}`));
      }
    } catch (e) { toast.error((e as Error).message); }
  }, [projectId, year, month, full]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); } catch (e) {
      const err = e as Error & { body?: { blockers?: string[] } };
      toast.error(err.message, err.body?.blockers ? { description: err.body.blockers.slice(0, 4).join(' · ') } : undefined);
    } finally { setBusy(false); }
  };

  const submitToPayroll = async () => {
    setConfirmSubmit(false);
    await run(() => wf('/api/payroll/alternate-pay', { method: 'POST', json: entries.payload }), 'Submitted to the existing Alternate Pay run');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>Project</Label>
          <Select value={projectId} onValueChange={setProjectId}><SelectTrigger className="w-72"><SelectValue placeholder="Choose a project" /></SelectTrigger>
            <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.client.name} / {p.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Month</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Year</Label><Input type="number" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
        <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      {data && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">{MONTHS[month - 1]} {year}
                {data.lock ? <Badge className="bg-slate-800 text-white"><Lock className="mr-1 h-3 w-3" />Locked</Badge> : data.ready ? <Badge className="bg-emerald-100 text-emerald-800">Ready to lock</Badge> : <Badge className="bg-amber-100 text-amber-800">Not ready</Badge>}
                <Badge variant="outline">Client sign-off: {data.signOff?.status ?? 'not yet'}</Badge></CardTitle>
              {!data.lock && data.blockers.length > 0 && <CardDescription><ul className="list-disc pl-5">{data.blockers.map((b: string, i: number) => <li key={i}>{b}</li>)}</ul></CardDescription>}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Contractor</TableHead><TableHead>Worked</TableHead><TableHead>Late</TableHead><TableHead>Half</TableHead><TableHead>Absent</TableHead><TableHead>Unpaid days</TableHead><TableHead>Hours</TableHead><TableHead>OT h</TableHead>{full && <TableHead>Suggested pay</TableHead>}</TableRow></TableHeader>
                <TableBody>
                  {data.assignments.map((a: any) => (
                    <TableRow key={a.assignmentId}>
                      <TableCell className="font-medium">{a.contractor}<div className="text-xs text-slate-400">{a.employeeCode} · {a.payType}{a.monthlyDayBasis && a.payType === 'monthly' ? ` (${a.monthlyDayBasis} days)` : ''}</div></TableCell>
                      <TableCell>{a.summary.workedDays}</TableCell><TableCell>{a.summary.counts.late}</TableCell><TableCell>{a.summary.counts.half_day}</TableCell><TableCell>{a.summary.counts.absent}</TableCell>
                      <TableCell>{a.summary.suggestedUnpaidDays + a.outsideUnpaidDays}</TableCell><TableCell>{a.summary.payableHours}</TableCell><TableCell>{a.summary.overtimeHours}</TableCell>
                      {full && <TableCell>{a.prefill.ok ? <><div>{inr(a.prefill.suggestedGross)}</div><div className="text-xs text-slate-400">{a.prefill.basisNote}</div></> : <span className="text-red-600 text-xs">{a.prefill.reason}</span>}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!data.lock && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="space-y-2 rounded-md border p-3"><p className="text-sm font-medium">Record client sign-off (given outside the link)</p>
                    <Textarea rows={2} placeholder="Who approved, and how (e.g. email from Priya, 3 Dec)" value={signNote} onChange={(e) => setSignNote(e.target.value)} />
                    <Button size="sm" variant="outline" disabled={busy || signNote.trim().length < 5} onClick={() => run(() => wf('/api/workforce/month/signoff', { method: 'POST', json: { projectId, year, month, note: signNote } }), 'Sign-off recorded')}>Record sign-off</Button></div>
                  {full && <div className="space-y-2 rounded-md border p-3"><p className="text-sm font-medium">Lock the month</p>
                    <p className="text-xs text-slate-500">Freezes every day, writes attendance, and creates pay suggestions for you to approve. It does not run payroll.</p>
                    {isAdmin && data.signOff?.status !== 'signed' && <Textarea rows={2} placeholder="No client sign-off? Admin may waive it, with a reason" value={waive} onChange={(e) => setWaive(e.target.value)} />}
                    <Button size="sm" disabled={busy || !data.ready} onClick={() => run(() => wf('/api/workforce/month/lock', { method: 'POST', json: { projectId, year, month, ...(waive.trim().length >= 5 ? { waiveSignOffReason: waive } : {}) } }), 'Month locked')}><Lock className="mr-2 h-4 w-4" />Lock month</Button></div>}
                </div>
              )}
            </CardContent>
          </Card>

          {full && suggestions.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Suggestions awaiting your decision</CardTitle><CardDescription>Nothing here is applied until you approve, reject or modify it.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {suggestions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <div><span className="font-medium">{s.contractor}</span> <Badge variant="outline">{s.kind}</Badge> <Badge className={s.status === 'pending_admin' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'}>{s.status}</Badge>
                      <div className="text-xs text-slate-500">
                        {s.kind === 'prefill' && <>{inr(s.detail.suggestedGross)} · {s.detail.basisNote}</>}
                        {s.kind === 'deduction' && <>{s.detail.unpaidDays} unpaid day(s) · reduces pay by {inr(s.detail.amountReduction)}</>}
                        {s.kind === 'warning' && <>{s.detail.reason}</>}
                        {s.kind === 'payroll_blocker' && <>{(s.detail.problems ?? []).join(' · ')}</>}
                      </div></div>
                    {s.status === 'pending_admin' && (
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => { setReason(''); setDecide({ s, decision: 'approve' }); }}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => { setReason(''); setMod({ unpaidDays: '', unitsWorked: '', rateOverride: '' }); setDecide({ s, decision: 'modify' }); }}>Modify</Button>
                        <Button size="sm" variant="outline" onClick={() => { setReason(''); setDecide({ s, decision: 'reject' }); }}>Reject</Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {full && entries && (entries.entries.length > 0 || entries.blocked.length > 0) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Ready for payroll</CardTitle>
                <CardDescription>Approved entries, in the exact form the existing Alternate Pay run takes. You confirm before anything is submitted.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {entries.entries.length > 0 && (
                  <Table>
                    <TableHeader><TableRow><TableHead>Contractor</TableHead><TableHead>Units</TableHead><TableHead>Rate / amount</TableHead><TableHead>Gross</TableHead><TableHead>Reconciliation</TableHead></TableRow></TableHeader>
                    <TableBody>{entries.entries.map((e: any) => {
                      const rec = entries.reconciliation.find((r: any) => r.employeeId === e.employeeCode);
                      return (<TableRow key={e.assignmentId}><TableCell>{e.name}<div className="text-xs text-slate-400">{e.note}</div></TableCell><TableCell>{e.unitsWorked}</TableCell><TableCell>{inr(e.rateOverride)}</TableCell><TableCell>{inr(e.suggestedGross)}</TableCell>
                        <TableCell>{rec ? <Badge className={rec.status === 'matched' ? 'bg-emerald-100 text-emerald-800' : rec.status === 'mismatch' ? 'bg-red-100 text-red-800' : 'bg-slate-100'}>{rec.status.replace('_', ' ')}{rec.status === 'mismatch' ? ` (paid ${inr(rec.actual)})` : ''}</Badge> : '—'}</TableCell></TableRow>);
                    })}</TableBody>
                  </Table>
                )}
                {entries.blocked.map((b: any) => <p key={b.assignmentId} className="text-sm text-amber-700">{b.name}: {b.reasons.join(' · ')}</p>)}
                {entries.entries.length > 0 && <Button disabled={busy} onClick={() => setConfirmSubmit(true)}><Send className="mr-2 h-4 w-4" />Submit {entries.entries.length} entr{entries.entries.length === 1 ? 'y' : 'ies'} to payroll</Button>}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={!!decide} onOpenChange={(o) => !o && setDecide(null)}>
        <DialogContent className="sm:max-w-md">
          {decide && (<>
            <DialogHeader><DialogTitle className="capitalize">{decide.decision} · {decide.s.kind}</DialogTitle><DialogDescription>{decide.s.contractor}</DialogDescription></DialogHeader>
            <div className="space-y-3">
              {decide.decision === 'modify' && decide.s.kind === 'deduction' && <div><Label>Corrected unpaid days</Label><Input type="number" step="0.5" value={mod.unpaidDays} onChange={(e) => setMod({ ...mod, unpaidDays: e.target.value })} /></div>}
              {decide.decision === 'modify' && decide.s.kind === 'prefill' && <div className="grid grid-cols-2 gap-2"><div><Label>Units</Label><Input type="number" value={mod.unitsWorked} onChange={(e) => setMod({ ...mod, unitsWorked: e.target.value })} /></div><div><Label>Rate / amount</Label><Input type="number" value={mod.rateOverride} onChange={(e) => setMod({ ...mod, rateOverride: e.target.value })} /></div></div>}
              <div><Label>{decide.decision === 'approve' ? 'Note (optional)' : 'Reason (required)'}</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setDecide(null)}>Cancel</Button>
              <Button disabled={busy || (decide.decision !== 'approve' && reason.trim().length < 5)} onClick={() => run(async () => {
                await wf(`/api/workforce/suggestions/${decide.s.id}`, { method: 'PATCH', json: { decision: decide.decision, reason: reason || undefined,
                  ...(decide.decision === 'modify' && decide.s.kind === 'deduction' ? { unpaidDays: Number(mod.unpaidDays) } : {}),
                  ...(decide.decision === 'modify' && decide.s.kind === 'prefill' ? { unitsWorked: Number(mod.unitsWorked), rateOverride: Number(mod.rateOverride) } : {}) } });
                setDecide(null);
              }, 'Decision saved')}>Save decision</Button></DialogFooter></>)}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Submit to payroll?</AlertDialogTitle>
            <AlertDialogDescription>This runs the existing Alternate Pay process for {MONTHS[month - 1]} {year}: it immediately creates processed payments and notifies the contractors. Check the amounts above first.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={submitToPayroll}>Yes, submit</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

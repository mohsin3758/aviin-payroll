'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtDateTime, fmtTime, todayIst, wf } from './api';

interface Row {
  assignmentId: string; dailyStatusId: string | null; column: string; contractor: string; employeeCode: string; client: string; project: string;
  workMode: string; state: string; checkInAt: string | null; checkOutAt: string | null; hoursWorked: number | null; lateMinutes: number;
  eodDone: boolean; clientConfirm: string; openExceptions: number;
}

const COLUMNS = ['Exception', 'Not Started', 'Late', 'Checked In', 'Missing Update', 'Checked Out', 'Leave', 'Unavailable', 'Off'];
const COLUMN_CLASS: Record<string, string> = {
  Exception: 'border-red-300 bg-red-50', 'Not Started': 'border-slate-300 bg-slate-50', Late: 'border-amber-300 bg-amber-50',
  'Checked In': 'border-emerald-300 bg-emerald-50', 'Missing Update': 'border-orange-300 bg-orange-50', 'Checked Out': 'border-sky-300 bg-sky-50',
  Leave: 'border-violet-300 bg-violet-50', Unavailable: 'border-red-300 bg-red-100', Off: 'border-slate-200 bg-white',
};

export default function BoardTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [date, setDate] = useState(todayIst());
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientId, setClientId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any | null>(null);
  const [corr, setCorr] = useState({ checkIn: '', checkOut: '', reason: '', clientConfirmed: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ date });
      if (clientId !== 'all') q.set('clientId', clientId);
      const d = await wf<{ rows: Row[] }>(`/api/workforce/board?${q}`);
      setRows(d.rows);
    } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  }, [date, clientId]);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { wf<{ id: string; name: string }[]>('/api/clients').then(setClients).catch(() => undefined); }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const c of COLUMNS) m.set(c, []);
    for (const r of rows) m.get(r.column)?.push(r);
    return m;
  }, [rows]);

  const open = async (r: Row) => {
    if (!r.dailyStatusId) { toast.info('No record for this day yet.'); return; }
    try {
      const d = await wf(`/api/workforce/days/${r.dailyStatusId}`);
      setDetail({ ...d, row: r });
      setCorr({ checkIn: '', checkOut: '', reason: '', clientConfirmed: false });
    } catch (e) { toast.error((e as Error).message); }
  };

  const toIso = (hhmm: string) => (hhmm ? new Date(`${detail.date.slice(0, 10)}T${hhmm}:00+05:30`).toISOString() : undefined);
  const submitCorrection = async () => {
    setBusy(true);
    try {
      await wf(`/api/workforce/days/${detail.id}/correction`, { method: 'POST', json: { checkInAt: toIso(corr.checkIn), checkOutAt: toIso(corr.checkOut), reason: corr.reason, clientConfirmed: corr.clientConfirmed } });
      toast.success('Correction recorded'); setDetail(null); await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const makeLink = async () => {
    try {
      const l = await wf<{ url: string }>(`/api/workforce/assignments/${detail.row.assignmentId}/link`, { method: 'POST' });
      await navigator.clipboard?.writeText(l.url).catch(() => undefined);
      toast.success('Link copied. It works for 36 hours; share it only with this contractor.', { description: l.url });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></div>
        <div className="space-y-1"><Label>Client</Label>
          <Select value={clientId} onValueChange={setClientId}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All clients</SelectItem>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        <span className="ml-auto text-sm text-slate-500">{rows.length} active contractor(s)</span>
      </div>

      {!loading && rows.length === 0 && <Card><CardContent className="py-8 text-center text-slate-600">No active assignments you can see for this filter.</CardContent></Card>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = grouped.get(col) ?? [];
          if (list.length === 0) return null;
          return (
            <Card key={col} className={`border ${COLUMN_CLASS[col]}`}>
              <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm">{col}<Badge variant="secondary">{list.length}</Badge></CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {list.map((r) => (
                  <button key={r.assignmentId} onClick={() => open(r)} className="w-full rounded-md border bg-white p-2 text-left text-sm hover:bg-slate-50">
                    <div className="font-medium">{r.contractor} <span className="text-xs text-slate-400">{r.employeeCode}</span></div>
                    <div className="text-xs text-slate-500">{r.client} / {r.project}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-600">
                      <span>In {fmtTime(r.checkInAt)}</span>{r.checkOutAt && <span>Out {fmtTime(r.checkOutAt)}</span>}
                      {r.lateMinutes > 0 && <span className="text-amber-700">{r.lateMinutes} min late</span>}
                      {r.hoursWorked != null && <span>{r.hoursWorked} h</span>}
                      {r.clientConfirm === 'confirmed' && <span className="text-emerald-700">Client ✓</span>}
                      {r.clientConfirm === 'disputed' && <span className="text-red-700">Disputed</span>}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.row.contractor} · {detail.date.slice(0, 10)}</DialogTitle>
                <DialogDescription>{detail.row.client} / {detail.row.project}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="mb-1 flex items-center gap-2"><Badge>{detail.state}</Badge>{detail.locked && <Badge variant="outline">Locked</Badge>}</div>
                  <ul className="list-disc space-y-0.5 pl-5 text-slate-700">{(detail.evaluation?.reasons ?? []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                </div>
                {(detail.eodCompleted || detail.eodBlockers || detail.eodRaw) && (
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="font-medium">End-of-day update</p>
                    {detail.eodCompleted && <p><span className="text-slate-500">Completed:</span> {detail.eodCompleted}</p>}
                    {detail.eodInProgress && <p><span className="text-slate-500">In progress:</span> {detail.eodInProgress}</p>}
                    {detail.eodBlockers && <p><span className="text-slate-500">Blockers:</span> {detail.eodBlockers}</p>}
                    {detail.eodTomorrow && <p><span className="text-slate-500">Tomorrow:</span> {detail.eodTomorrow}</p>}
                  </div>
                )}
                <div>
                  <p className="mb-1 font-medium">Message timeline</p>
                  {detail.messages.length === 0 ? <p className="text-slate-500">No messages yet.</p> : (
                    <ul className="space-y-0.5 text-xs">{detail.messages.map((m: any) => (
                      <li key={m.id}>{fmtDateTime(m.sentAt ?? m.createdAt)} · {m.direction === 'in' ? '← inbound' : m.type} · <span className={m.status === 'failed' ? 'text-red-600' : ''}>{m.status}{m.suppressReason ? ` (${m.suppressReason})` : ''}{m.failureReason ? ` (${m.failureReason})` : ''}</span></li>
                    ))}</ul>
                  )}
                </div>
                {!detail.locked && (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="font-medium">Correct a forgotten check-in</p>
                    <p className="text-xs text-slate-500">Limited per contractor per month. Confirm with the client first.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Check-in (IST)</Label><Input type="time" value={corr.checkIn} onChange={(e) => setCorr({ ...corr, checkIn: e.target.value })} /></div>
                      <div><Label>Check-out (IST)</Label><Input type="time" value={corr.checkOut} onChange={(e) => setCorr({ ...corr, checkOut: e.target.value })} /></div>
                    </div>
                    <Textarea rows={2} placeholder="Reason" value={corr.reason} onChange={(e) => setCorr({ ...corr, reason: e.target.value })} />
                    <label className="flex items-center gap-2"><Checkbox checked={corr.clientConfirmed} onCheckedChange={(v) => setCorr({ ...corr, clientConfirmed: v === true })} />Client confirmed the contractor worked</label>
                    <Button size="sm" disabled={busy || (!corr.checkIn && !corr.checkOut) || corr.reason.trim().length < 5} onClick={submitCorrection}>Save correction</Button>
                  </div>
                )}
              </div>
              <DialogFooter><Button variant="outline" onClick={makeLink}><Link2 className="mr-2 h-4 w-4" />Copy contractor link</Button><Button onClick={() => setDetail(null)}>Close</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

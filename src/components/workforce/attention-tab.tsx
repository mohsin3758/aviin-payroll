'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Phone, MessageCircle, CheckCircle2, ArrowUpCircle, RefreshCw, UserCog } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSessionContext } from '@/hooks/session-context';
import { SEVERITY_CLASS, SEVERITY_LABEL, fmtDateTime, wf } from './api';

interface Item {
  id: string; synthetic: boolean; section: string; type: string; severity: number; status: string; title: string; detail: string | null;
  needsCall: boolean; callOutcome: string | null; callNote: string | null; date: string; overdueMinutes: number; assignmentId: string | null;
  ownerId: string | null; contractor: string | null; phone: string | null; project: string | null; client: string | null; lastResponseAt: string | null;
}

const SECTIONS: { key: string; title: string; hint: string }[] = [
  { key: 'critical', title: 'Critical', hint: 'Escalated: an SLA was missed or the issue is severe.' },
  { key: 'call_now', title: 'Call now', hint: 'Contractor unreachable: call and log the outcome.' },
  { key: 'waiting_contractor', title: 'Waiting for contractor', hint: 'You called and are waiting for a reply or callback.' },
  { key: 'waiting_client', title: 'Waiting for client', hint: '' },
  { key: 'payroll_exceptions', title: 'Payroll exceptions', hint: 'Fix these before month end.' },
  { key: 'contract_expiry', title: 'Contract expiry', hint: 'Assignments ending within 14 days.' },
  { key: 'other', title: "Today's other issues", hint: '' },
];

const OUTCOMES: [string, string][] = [
  ['connected', 'Connected'], ['no_answer', 'No answer'], ['callback_requested', 'Callback requested'], ['leave', 'On leave'],
  ['emergency', 'Emergency'], ['client_issue', 'Client issue'], ['technical_issue', 'Technical issue'], ['other', 'Other'],
];

export default function AttentionTab() {
  const { user } = useSessionContext();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ kind: 'contacted' | 'resolve' | 'reassign'; item: Item } | null>(null);
  const [outcome, setOutcome] = useState('connected');
  const [note, setNote] = useState('');
  const [leaveOverride, setLeaveOverride] = useState('none');
  const [staff, setStaff] = useState<{ id: string; name: string; role: string }[]>([]);
  const [newOwner, setNewOwner] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await wf<{ items: Item[] }>('/api/workforce/attention');
      setItems(data.items);
    } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'hr') wf<{ id: string; name: string; role: string }[]>('/api/workforce/staff').then(setStaff).catch(() => undefined);
  }, [user?.role]);

  const act = async (item: Item, body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try { await wf(`/api/workforce/exceptions/${item.id}`, { method: 'PATCH', json: body }); toast.success(done); setDialog(null); setNote(''); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const canReassign = user?.role === 'admin' || user?.role === 'hr';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">What needs your attention right now. Refreshes every 30 seconds.</p>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      {!loading && items.length === 0 && (
        <Card><CardContent className="py-10 text-center text-slate-600">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />Nothing needs attention. Everything is normal.
        </CardContent></Card>
      )}

      {SECTIONS.map((s) => {
        const list = items.filter((i) => i.section === s.key);
        if (list.length === 0) return null;
        return (
          <Card key={s.key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">{s.title}<Badge variant="secondary">{list.length}</Badge></CardTitle>
              {s.hint && <p className="text-xs text-slate-500">{s.hint}</p>}
            </CardHeader>
            <CardContent className="space-y-2">
              {list.map((i) => (
                <div key={i.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{i.title}</span>
                        <Badge className={SEVERITY_CLASS[i.severity]}>{SEVERITY_LABEL[i.severity]}</Badge>
                        {i.overdueMinutes > 0 && <Badge className="bg-red-100 text-red-800">{i.overdueMinutes} min overdue</Badge>}
                        {i.callOutcome && <Badge variant="outline">Last call: {i.callOutcome.replace('_', ' ')}</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {[i.contractor, i.project, i.client].filter(Boolean).join(' · ')} · {i.date}
                      </p>
                      {i.detail && <p className="text-sm text-slate-500">{i.detail}</p>}
                      {i.callNote && <p className="text-xs italic text-slate-500">Note: {i.callNote}</p>}
                      <p className="text-xs text-slate-400">Last reply from contractor: {fmtDateTime(i.lastResponseAt)}</p>
                    </div>
                    {!i.synthetic && (
                      <div className="flex flex-wrap gap-1.5">
                        {i.phone && <Button size="sm" variant="outline" asChild><a href={`tel:+91${i.phone.replace(/\D/g, '').slice(-10)}`}><Phone className="mr-1 h-4 w-4" />Call</a></Button>}
                        {i.phone && <Button size="sm" variant="outline" asChild><a href={`https://wa.me/91${i.phone.replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</a></Button>}
                        <Button size="sm" variant="outline" onClick={() => { setOutcome('connected'); setNote(''); setDialog({ kind: 'contacted', item: i }); }}>Mark contacted</Button>
                        <Button size="sm" onClick={() => { setNote(''); setLeaveOverride('none'); setDialog({ kind: 'resolve', item: i }); }}><CheckCircle2 className="mr-1 h-4 w-4" />Resolve</Button>
                        <Button size="sm" variant="outline" onClick={() => act(i, { action: 'escalate' }, 'Escalated')}><ArrowUpCircle className="mr-1 h-4 w-4" />Escalate</Button>
                        {canReassign && <Button size="sm" variant="outline" onClick={() => { setNewOwner(''); setNote(''); setDialog({ kind: 'reassign', item: i }); }}><UserCog className="mr-1 h-4 w-4" />Reassign</Button>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.kind === 'contacted' ? 'Log the call' : dialog.kind === 'resolve' ? 'Resolve' : 'Reassign'}</DialogTitle>
                <DialogDescription>{dialog.item.title}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {dialog.kind === 'contacted' && (
                  <div className="space-y-1.5"><Label>Outcome</Label>
                    <Select value={outcome} onValueChange={setOutcome}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{OUTCOMES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
                  </div>
                )}
                {dialog.kind === 'resolve' && (
                  <div className="space-y-1.5"><Label>If the contractor was on leave</Label>
                    <Select value={leaveOverride} onValueChange={setLeaveOverride}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not leave</SelectItem><SelectItem value="paid">Paid leave</SelectItem><SelectItem value="unpaid">Unpaid leave</SelectItem>
                      </SelectContent></Select>
                    <p className="text-xs text-slate-500">This stops the day being counted as an absence.</p>
                  </div>
                )}
                {dialog.kind === 'reassign' && (
                  <div className="space-y-1.5"><Label>New owner</Label>
                    <Select value={newOwner} onValueChange={setNewOwner}><SelectTrigger><SelectValue placeholder="Choose a staff login" /></SelectTrigger>
                      <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>)}</SelectContent></Select>
                  </div>
                )}
                <div className="space-y-1.5"><Label>{dialog.kind === 'resolve' ? 'How was it resolved?' : 'Note'}</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What happened?" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                <Button disabled={busy || (dialog.kind === 'resolve' && note.trim().length < 3) || (dialog.kind === 'reassign' && !newOwner)}
                  onClick={() => dialog.kind === 'contacted'
                    ? act(dialog.item, { action: 'contacted', outcome, note: note || undefined }, 'Call logged')
                    : dialog.kind === 'resolve'
                      ? act(dialog.item, { action: 'resolve', note, ...(leaveOverride !== 'none' ? { leaveOverride, outcome: 'leave' } : {}) }, 'Resolved')
                      : act(dialog.item, { action: 'reassign', ownerId: newOwner, note: note || undefined }, 'Reassigned')}>
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

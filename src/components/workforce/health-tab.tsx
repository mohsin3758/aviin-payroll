'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Activity, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSessionContext } from '@/hooks/session-context';
import { fmtDateTime, wf } from './api';

export default function HealthTab() {
  const { user } = useSessionContext();
  const [h, setH] = useState<any | null>(null);
  const load = useCallback(async () => { try { setH(await wf('/api/workforce/health')); } catch (e) { toast.error((e as Error).message); } }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const tick = async () => {
    try { const r = await wf<any>('/api/workforce/tick', { method: 'POST', json: {} }); toast.success(`Pass complete: ${r.messages} sent, ${r.suppressed} held back, ${r.exceptions} new exception(s)`); load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  if (!h) return <p className="text-sm text-slate-500">Loading…</p>;
  const w = h.worker;
  return (
    <div className="space-y-4">
      <Card className={w.running ? 'border-emerald-300' : 'border-red-300'}>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />Automation worker
          <Badge className={w.running ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>{w.running ? 'Running' : 'NOT RUNNING'}</Badge></CardTitle>
          <CardDescription>Runs every minute: sends reminders, raises exceptions, closes finished days and sends client digests.</CardDescription></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Last pass: {fmtDateTime(w.lastTickAt)} {w.secondsSinceTick != null && `(${w.secondsSinceTick}s ago)`} · took {w.lastTickMs ?? '—'} ms · {w.tickCount} passes since start</p>
          {w.lastError && <p className="text-red-700">Last error: {w.lastError}</p>}
          {!w.running && <p className="text-red-700">No pass in the last 5 minutes. Reminders and escalations are not being sent. Restart the app, and check WORKFORCE_WORKER is not set to "off".</p>}
          {user?.role === 'admin' && <Button size="sm" variant="outline" onClick={tick}><RefreshCw className="mr-2 h-4 w-4" />Run one pass now</Button>}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Open exceptions</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{h.openExceptions}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Messages, last 24 h</CardTitle></CardHeader><CardContent className="text-sm">
          {Object.keys(h.messagesLast24h).length === 0 ? 'None' : Object.entries(h.messagesLast24h).map(([k, v]) => <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span>{String(v)}</span></div>)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">WhatsApp</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <div>Account configured: <b>{h.whatsapp.configured ? 'yes' : 'no'}</b></div><div>Enabled in Settings: <b>{h.whatsapp.companyEnabled ? 'yes' : 'no'}</b></div><div>Webhook secrets set: <b>{h.whatsapp.webhookReady ? 'yes' : 'no'}</b></div></CardContent></Card>
      </div>
      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Switched on</CardTitle></CardHeader><CardContent className="text-sm">
        {h.enabledFlags.length === 0 ? <span className="text-slate-500">Everything is off. Existing payroll behaves exactly as before.</span> : <ul className="space-y-0.5">{h.enabledFlags.map((f: any) => <li key={f.key + f.scopeKey}><Badge variant="outline">{f.scopeKey}</Badge> {f.key}</li>)}</ul>}</CardContent></Card>
    </div>
  );
}

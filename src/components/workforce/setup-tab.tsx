'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSessionContext } from '@/hooks/session-context';
import { DEFAULT_SETTINGS } from '@/lib/workforce/settings';
import { WORKFORCE_FLAG_KEYS } from '@/lib/workforce/flag-keys';
import { wf } from './api';

const NONE = '__none__';
const inr = (n: number | null | undefined) => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>;
}
function Pick({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: [string, string][]; placeholder?: string }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder ?? 'Choose'} /></SelectTrigger>
      <SelectContent>{placeholder && <SelectItem value={NONE}>{placeholder}</SelectItem>}{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------- Clients
function ClientsSection() {
  const [clients, setClients] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [manage, setManage] = useState<any | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [c, setC] = useState({ name: '', phone: '', email: '', kind: 'representative' });
  const [h, setH] = useState({ date: '', name: '' });

  const load = useCallback(() => wf<any[]>('/api/clients').then(setClients).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const loadDetail = async (id: string) => {
    setContacts(await wf(`/api/clients/${id}/contacts`)); setHolidays(await wf(`/api/clients/${id}/holidays`));
  };
  const wrap = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); } catch (e) { toast.error((e as Error).message); } };

  return (
    <div className="space-y-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Add a client</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <Field label="Client name"><Input value={name} onChange={(e) => setName(e.target.value)} className="w-72" /></Field>
          <Button disabled={!name.trim()} onClick={() => wrap(async () => { await wf('/api/clients', { method: 'POST', json: { name } }); setName(''); await load(); }, 'Client added')}><Plus className="mr-1 h-4 w-4" />Add</Button>
        </CardContent></Card>
      <Card><CardContent className="pt-4">
        <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Client</TableHead><TableHead>Projects</TableHead><TableHead>Contacts</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{clients.map((x) => (
            <TableRow key={x.id}><TableCell>{x.code}</TableCell><TableCell className="font-medium">{x.name}</TableCell><TableCell>{x._count.projects}</TableCell><TableCell>{x._count.contacts}</TableCell>
              <TableCell>{x.active ? <Badge className="bg-emerald-100 text-emerald-800">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
              <TableCell className="space-x-1 text-right">
                <Button size="sm" variant="outline" onClick={() => { setManage(x); loadDetail(x.id); }}>Contacts &amp; holidays</Button>
                <Button size="sm" variant="ghost" onClick={() => wrap(async () => { await wf(`/api/clients/${x.id}`, { method: 'PUT', json: { active: !x.active } }); await load(); }, x.active ? 'Deactivated' : 'Activated')}>{x.active ? 'Deactivate' : 'Activate'}</Button></TableCell></TableRow>))}</TableBody></Table>
      </CardContent></Card>

      <Dialog open={!!manage} onOpenChange={(o) => !o && setManage(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {manage && (<>
            <DialogHeader><DialogTitle>{manage.name}</DialogTitle><DialogDescription>People at the client, and the client&apos;s own holidays (used for the monthly &quot;working days&quot; figure).</DialogDescription></DialogHeader>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2"><p className="font-medium">Contacts</p>
                {contacts.map((k) => <div key={k.id} className="rounded border p-2 text-sm"><b>{k.name}</b> <Badge variant="outline">{k.kind}</Badge><div className="text-xs text-slate-500">{k.phone} {k.email}</div></div>)}
                <div className="space-y-1.5 rounded border p-2">
                  <Input placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
                  <div className="grid grid-cols-2 gap-1.5"><Input placeholder="Mobile (10 digits)" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /><Input placeholder="Email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></div>
                  <Pick value={c.kind} onChange={(v) => setC({ ...c, kind: v || 'representative' })} options={[['representative', 'Representative (confirms attendance)'], ['coordinator', 'Coordinator'], ['billing', 'Billing']]} />
                  <Button size="sm" disabled={!c.name.trim() || (!c.phone && !c.email)} onClick={() => wrap(async () => { await wf(`/api/clients/${manage.id}/contacts`, { method: 'POST', json: { name: c.name, phone: c.phone || null, email: c.email || null, kind: c.kind } }); setC({ name: '', phone: '', email: '', kind: 'representative' }); await loadDetail(manage.id); }, 'Contact added')}>Add contact</Button></div></div>
              <div className="space-y-2"><p className="font-medium">Client holidays</p>
                {holidays.map((k) => <div key={k.id} className="flex items-center justify-between rounded border p-2 text-sm"><span>{k.date.slice(0, 10)} · {k.name}</span>
                  <Button size="icon" variant="ghost" onClick={() => wrap(async () => { await wf(`/api/clients/${manage.id}/holidays/${k.id}`, { method: 'DELETE' }); await loadDetail(manage.id); }, 'Removed')}><Trash2 className="h-4 w-4" /></Button></div>)}
                <div className="space-y-1.5 rounded border p-2"><Input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} /><Input placeholder="Holiday name" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
                  <Button size="sm" disabled={!h.date || !h.name.trim()} onClick={() => wrap(async () => { await wf(`/api/clients/${manage.id}/holidays`, { method: 'POST', json: h }); setH({ date: '', name: '' }); await loadDetail(manage.id); }, 'Holiday added')}>Add holiday</Button></div></div>
            </div></>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- Projects
function ProjectsSection() {
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [f, setF] = useState({ clientId: '', name: '', workMode: 'remote' });
  const load = useCallback(() => { wf<any[]>('/api/projects').then(setProjects); wf<any[]>('/api/clients').then(setClients); }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Add a project</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <Field label="Client"><div className="w-64"><Pick value={f.clientId} onChange={(v) => setF({ ...f, clientId: v })} placeholder="Choose client" options={clients.filter((c) => c.active).map((c) => [c.id, c.name])} /></div></Field>
          <Field label="Project name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-64" /></Field>
          <Field label="Work mode"><div className="w-36"><Pick value={f.workMode} onChange={(v) => setF({ ...f, workMode: v || 'remote' })} options={[['remote', 'Remote'], ['onsite', 'On-site'], ['hybrid', 'Hybrid']]} /></div></Field>
          <Button disabled={!f.clientId || !f.name.trim()} onClick={async () => { try { await wf('/api/projects', { method: 'POST', json: f }); setF({ ...f, name: '' }); toast.success('Project added'); load(); } catch (e) { toast.error((e as Error).message); } }}><Plus className="mr-1 h-4 w-4" />Add</Button>
        </CardContent></Card>
      <Card><CardContent className="pt-4"><Table><TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Project</TableHead><TableHead>Mode</TableHead><TableHead>Assignments</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{projects.map((p) => <TableRow key={p.id}><TableCell>{p.client.name}</TableCell><TableCell className="font-medium">{p.name}</TableCell><TableCell className="capitalize">{p.workMode}</TableCell><TableCell>{p._count.assignments}</TableCell><TableCell>{p.active ? 'Active' : 'Inactive'}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  );
}

// ---------------------------------------------------------------- Assignments
const BLANK = { id: '', employeeId: '', projectId: '', startDate: '', endDate: '', tier: 'full_time', contractType: 'exclusive', payType: 'monthly', payRate: '', monthlyDayBasis: 'working', workMode: 'remote', status: 'planned', resourceCoordinatorId: '', clientCoordinatorId: '', kamId: '', clientRepContactId: '' };

function AssignmentsSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [form, setForm] = useState<typeof BLANK | null>(null);

  const load = useCallback(() => wf<any[]>('/api/assignments').then(setRows).catch((e) => toast.error(e.message)), []);
  useEffect(() => {
    load();
    wf<any[]>('/api/employees?limit=200').then((d) => setEmployees(d.filter((e) => e.employmentType !== 'permanent'))).catch(() => undefined);
    wf<any[]>('/api/projects').then(setProjects).catch(() => undefined);
    wf<any[]>('/api/workforce/staff').then(setStaff).catch(() => undefined);
  }, [load]);
  useEffect(() => {
    const p = projects.find((x) => x.id === form?.projectId);
    if (p) wf<any[]>(`/api/clients/${p.clientId}/contacts`).then((c) => setContacts(c.filter((k) => k.active))).catch(() => setContacts([])); else setContacts([]);
  }, [form?.projectId, projects]);

  const save = async () => {
    if (!form) return;
    const body: Record<string, unknown> = {
      tier: form.tier, contractType: form.contractType, payType: form.payType, monthlyDayBasis: form.monthlyDayBasis, workMode: form.workMode, status: form.status,
      payRate: form.payRate ? Number(form.payRate) : null, endDate: form.endDate || null,
      resourceCoordinatorId: form.resourceCoordinatorId || null, clientCoordinatorId: form.clientCoordinatorId || null, kamId: form.kamId || null, clientRepContactId: form.clientRepContactId || null,
    };
    try {
      if (form.id) await wf(`/api/assignments/${form.id}`, { method: 'PUT', json: { ...body, startDate: form.startDate } });
      else await wf('/api/assignments', { method: 'POST', json: { ...body, employeeId: form.employeeId, projectId: form.projectId, startDate: form.startDate, declarationAt: new Date().toISOString() } });
      toast.success('Assignment saved'); setForm(null); load();
    } catch (e) { toast.error((e as Error).message); }
  };
  const edit = (a: any) => setForm({ ...BLANK, id: a.id, employeeId: a.employeeId, projectId: a.projectId, startDate: a.startDate.slice(0, 10), endDate: a.endDate?.slice(0, 10) ?? '', tier: a.tier, contractType: a.contractType, payType: a.payType, payRate: a.payRate ? String(a.payRate) : '', monthlyDayBasis: a.monthlyDayBasis, workMode: a.workMode, status: a.status, resourceCoordinatorId: a.resourceCoordinatorId ?? '', clientCoordinatorId: a.clientCoordinatorId ?? '', kamId: a.kamId ?? '', clientRepContactId: a.clientRepContactId ?? '' });
  const link = async (id: string) => { try { const l = await wf<{ url: string }>(`/api/workforce/assignments/${id}/link`, { method: 'POST' }); await navigator.clipboard?.writeText(l.url).catch(() => undefined); toast.success('Contractor link copied (valid 36 hours)', { description: l.url }); } catch (e) { toast.error((e as Error).message); } };
  const staffOpts = useMemo(() => staff.map((s): [string, string] => [s.id, `${s.name} (${s.role})`]), [staff]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setForm({ ...BLANK, startDate: new Date().toISOString().slice(0, 10) })}><Plus className="mr-1 h-4 w-4" />New assignment</Button></div>
      <Card><CardContent className="pt-4 overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Contractor</TableHead><TableHead>Client / project</TableHead><TableHead>Dates</TableHead><TableHead>Contract</TableHead><TableHead>Pay</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{rows.map((a) => (
          <TableRow key={a.id}><TableCell className="font-medium">{a.employee.firstName} {a.employee.lastName}<div className="text-xs text-slate-400">{a.employee.employeeCode} · {a.employee.phone ?? 'no phone'}</div></TableCell>
            <TableCell>{a.project.client.name}<div className="text-xs text-slate-400">{a.project.name}</div></TableCell><TableCell className="text-xs">{a.startDate.slice(0, 10)} → {a.endDate?.slice(0, 10) ?? 'open'}</TableCell>
            <TableCell className="text-xs capitalize">{a.tier.replace('_', ' ')} · {a.contractType.replace('_', ' ')}</TableCell>
            <TableCell className="text-xs">{a.payRate ? `${inr(a.payRate)} ${a.payType}${a.payType === 'monthly' ? ` (${a.monthlyDayBasis})` : ''}` : <span className="text-red-600">No rate</span>}</TableCell>
            <TableCell><Badge variant="outline" className="capitalize">{a.status}</Badge></TableCell>
            <TableCell className="space-x-1 text-right"><Button size="sm" variant="outline" onClick={() => edit(a)}>Edit</Button><Button size="icon" variant="ghost" title="Copy contractor link" onClick={() => link(a.id)}><Link2 className="h-4 w-4" /></Button></TableCell></TableRow>))}</TableBody></Table></CardContent></Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {form && (<>
            <DialogHeader><DialogTitle>{form.id ? 'Edit assignment' : 'New assignment'}</DialogTitle><DialogDescription>Placing a contractor on a client project. Pay terms are only ever used to PRE-FILL payroll for an admin to confirm.</DialogDescription></DialogHeader>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Contractor"><Pick value={form.employeeId} onChange={(v) => setForm({ ...form, employeeId: v })} placeholder="Choose contractor" options={employees.map((e): [string, string] => [e.id, `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})`])} /></Field>
              <Field label="Project"><Pick value={form.projectId} onChange={(v) => setForm({ ...form, projectId: v })} placeholder="Choose project" options={projects.filter((p) => p.active).map((p): [string, string] => [p.id, `${p.client.name} / ${p.name}`])} /></Field>
              <Field label="Start date"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
              <Field label="End date (optional)"><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
              <Field label="Type"><Pick value={form.tier} onChange={(v) => setForm({ ...form, tier: v || 'full_time' })} options={[['full_time', 'Full-time dedicated'], ['hourly', 'Hourly']]} /></Field>
              <Field label="Contract" hint="Exclusive blocks any overlapping assignment."><Pick value={form.contractType} onChange={(v) => setForm({ ...form, contractType: v || 'exclusive' })} options={[['exclusive', 'Exclusive'], ['non_exclusive', 'Non-exclusive'], ['restricted', 'Restricted']]} /></Field>
              <Field label="Paid"><Pick value={form.payType} onChange={(v) => setForm({ ...form, payType: v || 'monthly' })} options={[['monthly', 'Flat monthly fee'], ['daily', 'Per day (days worked only)'], ['hourly', 'Per hour']]} /></Field>
              <Field label={form.payType === 'monthly' ? 'Monthly fee (₹)' : form.payType === 'daily' ? 'Day rate (₹)' : 'Hourly rate (₹)'}><Input type="number" value={form.payRate} onChange={(e) => setForm({ ...form, payRate: e.target.value })} /></Field>
              {form.payType === 'monthly' && <Field label="A day is worth" hint="Calendar: fee ÷ 30/31. Working: fee ÷ the client's 20/21/22 working days."><Pick value={form.monthlyDayBasis} onChange={(v) => setForm({ ...form, monthlyDayBasis: v || 'working' })} options={[['working', 'Client working days'], ['calendar', 'Calendar days']]} /></Field>}
              <Field label="Work mode"><Pick value={form.workMode} onChange={(v) => setForm({ ...form, workMode: v || 'remote' })} options={[['remote', 'Remote'], ['onsite', 'On-site'], ['hybrid', 'Hybrid']]} /></Field>
              <Field label="Resource coordinator (makes the calls)"><Pick value={form.resourceCoordinatorId} onChange={(v) => setForm({ ...form, resourceCoordinatorId: v })} placeholder="None" options={staffOpts} /></Field>
              <Field label="Client coordinator"><Pick value={form.clientCoordinatorId} onChange={(v) => setForm({ ...form, clientCoordinatorId: v })} placeholder="None" options={staffOpts} /></Field>
              <Field label="KAM / KAE"><Pick value={form.kamId} onChange={(v) => setForm({ ...form, kamId: v })} placeholder="None" options={staffOpts} /></Field>
              <Field label="Client representative (confirms attendance)"><Pick value={form.clientRepContactId} onChange={(v) => setForm({ ...form, clientRepContactId: v })} placeholder="None" options={contacts.map((c): [string, string] => [c.id, `${c.name} (${c.kind})`])} /></Field>
              <Field label="Status" hint="Needs a pay rate to go active. Only active assignments get daily check-ins."><Pick value={form.status} onChange={(v) => setForm({ ...form, status: v || 'planned' })} options={[['planned', 'Planned'], ['active', 'Active'], ['paused', 'Paused'], ['ended', 'Ended']]} /></Field>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button disabled={!form.employeeId || !form.projectId || !form.startDate} onClick={save}>Save</Button></DialogFooter></>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- Rules
function RulesSection() {
  const [scope, setScope] = useState('company');
  const [targets, setTargets] = useState<{ clients: any[]; projects: any[]; assignments: any[] }>({ clients: [], projects: [], assignments: [] });
  const [scopeId, setScopeId] = useState('');
  const [values, setValues] = useState<Record<string, any>>({});
  const [effective, setEffective] = useState<any | null>(null);

  useEffect(() => { Promise.all([wf<any[]>('/api/clients'), wf<any[]>('/api/projects'), wf<any[]>('/api/assignments')]).then(([clients, projects, assignments]) => setTargets({ clients, projects, assignments })).catch(() => undefined); }, []);
  const load = useCallback(async () => {
    if (scope !== 'company' && !scopeId) { setValues({}); return; }
    const q = scope === 'company' ? 'scope=company' : `scope=${scope}&scopeId=${scopeId}`;
    try { setValues((await wf<any>(`/api/workforce/settings?${q}`)).values); } catch (e) { toast.error((e as Error).message); }
    setEffective(scope === 'assignment' && scopeId ? await wf(`/api/workforce/settings?assignmentId=${scopeId}`).catch(() => null) : null);
  }, [scope, scopeId]);
  useEffect(() => { load(); }, [load]);

  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[];
  const set = (k: string, v: unknown) => setValues((cur) => { const n = { ...cur }; if (v === '' || v === undefined) delete n[k]; else n[k] = v; return n; });
  const options = scope === 'client' ? targets.clients.map((c) => [c.id, c.name]) : scope === 'project' ? targets.projects.map((p) => [p.id, `${p.client.name} / ${p.name}`]) : targets.assignments.map((a) => [a.id, `${a.employee.firstName} ${a.employee.lastName ?? ''} — ${a.project.name}`]);

  const save = async () => { try { await wf('/api/workforce/settings', { method: 'PUT', json: { scope, scopeId: scope === 'company' ? undefined : scopeId, values } }); toast.success('Rules saved'); load(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">Attendance rules</CardTitle>
      <CardDescription>Set only what differs. Anything left blank is inherited: assignment ← project ← client ← company ← built-in default.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="w-44"><Pick value={scope} onChange={(v) => { setScope(v || 'company'); setScopeId(''); }} options={[['company', 'Company default'], ['client', 'A client'], ['project', 'A project'], ['assignment', 'One assignment']]} /></div>
          {scope !== 'company' && <div className="w-80"><Pick value={scopeId} onChange={setScopeId} placeholder={`Choose ${scope}`} options={options as [string, string][]} /></div>}
        </div>
        {effective && <p className="text-xs text-slate-500">Effective values for this assignment come from: {[...new Set(Object.values(effective.sources))].join(', ')}.</p>}
        <div className="grid gap-3 md:grid-cols-3">
          {keys.map((k) => {
            const def = DEFAULT_SETTINGS[k]; const cur = values[k];
            const src = effective?.sources?.[k];
            const label = k.replace(/([A-Z])/g, ' $1').toLowerCase();
            return (
              <div key={k} className="space-y-1"><Label className="capitalize">{label}</Label>
                {typeof def === 'boolean' ? (
                  <div className="flex items-center gap-2"><Switch checked={cur ?? def} onCheckedChange={(v) => set(k, v)} />{cur !== undefined && <Button size="sm" variant="ghost" onClick={() => set(k, '')}>inherit</Button>}</div>
                ) : k === 'overtimePolicy' ? (
                  <Pick value={cur ?? ''} onChange={(v) => set(k, v)} placeholder={`Inherit (${def})`} options={[['none', 'Not paid (recorded only)'], ['client_approved', 'Paid if client approves'], ['auto', 'Always paid']]} />
                ) : k === 'eodMode' ? (
                  <Pick value={cur ?? ''} onChange={(v) => set(k, v)} placeholder={`Inherit (${def})`} options={[['web_link', 'Web link (recommended)'], ['whatsapp_flow', 'WhatsApp Flow'], ['free_text', 'Free text reply']]} />
                ) : Array.isArray(def) ? (
                  <Input placeholder={`Inherit (${def.join(', ')})`} value={cur !== undefined ? cur.join(', ') : ''} onChange={(e) => set(k, e.target.value.trim() ? e.target.value.split(',').map((x: string) => (typeof def[0] === 'number' ? Number(x.trim()) : x.trim())).filter((x: unknown) => x !== '' && !(typeof x === 'number' && isNaN(x))) : '')} />
                ) : k === 'maxPayableHoursPerDay' ? (
                  <Input type="number" placeholder="Inherit (no ceiling)" value={cur ?? ''} onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value))} />
                ) : (
                  <Input type={typeof def === 'number' ? 'number' : 'text'} placeholder={`Inherit (${def})`} value={cur ?? ''} onChange={(e) => set(k, typeof def === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
                )}
                {src && <p className="text-[11px] text-slate-400">now: {String(effective.settings[k])} · from {src}</p>}
              </div>
            );
          })}
        </div>
        <Button onClick={save} disabled={scope !== 'company' && !scopeId}>Save rules</Button>
      </CardContent></Card>
  );
}

// ---------------------------------------------------------------- Go live
function GoLiveSection() {
  const { user } = useSessionContext();
  const isAdmin = user?.role === 'admin';
  const [flags, setFlags] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [scope, setScope] = useState('company');
  const [scopeId, setScopeId] = useState('');
  const [hook, setHook] = useState<any | null>(null);
  const [sec, setSec] = useState({ appSecret: '', verifyToken: '' });

  const load = useCallback(() => { wf<any>('/api/workforce/flags').then((d) => setFlags(d.flags)); wf<any[]>('/api/projects').then(setProjects); if (isAdmin) wf('/api/workforce/whatsapp-secrets').then(setHook).catch(() => undefined); }, [isAdmin]);
  useEffect(() => { load(); }, [load]);
  const scopeKey = scope === 'company' ? 'company' : scopeId ? `${scope}:${scopeId}` : '';
  const isOn = (key: string) => flags.some((f) => f.key === key && f.scopeKey === scopeKey && f.enabled);
  const toggle = async (key: string, enabled: boolean) => { try { await wf('/api/workforce/flags', { method: 'PUT', json: { key, scope, scopeId: scope === 'company' ? undefined : scopeId, enabled } }); toast.success(`${enabled ? 'Enabled' : 'Disabled'} ${key}`); load(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <div className="space-y-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Switches</CardTitle>
        <CardDescription>Everything starts OFF. Turn the main switch on for one pilot project first, then widen. With every switch off, payroll and attendance behave exactly as before.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="w-44"><Pick value={scope} onChange={(v) => { setScope(v || 'company'); setScopeId(''); }} options={[['company', 'Whole company'], ['project', 'One project'], ['client', 'One client']]} /></div>
            {scope === 'project' && <div className="w-80"><Pick value={scopeId} onChange={setScopeId} placeholder="Choose project" options={projects.map((p): [string, string] => [p.id, `${p.client.name} / ${p.name}`])} /></div>}
            {scope === 'client' && <div className="w-80"><Pick value={scopeId} onChange={setScopeId} placeholder="Choose client" options={[...new Map(projects.map((p) => [p.client.id, p.client.name])).entries()] as [string, string][]} /></div>}
          </div>
          {!isAdmin && <p className="text-sm text-amber-700">Only an admin can change these switches.</p>}
          <div className="grid gap-2 md:grid-cols-2">{WORKFORCE_FLAG_KEYS.map((k) => (
            <div key={k} className="flex items-center justify-between rounded border p-2 text-sm"><span>{k.replace(/_/g, ' ')}</span><Switch disabled={!isAdmin || !scopeKey} checked={isOn(k)} onCheckedChange={(v) => toggle(k, v)} /></div>))}</div>
        </CardContent></Card>
      {isAdmin && hook && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">WhatsApp replies (webhook)</CardTitle>
          <CardDescription>In Meta&apos;s developer console, set the callback URL below and the verify token you choose here; paste the app secret here. Until then messages go out but button taps and replies cannot come back.</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Callback URL: <code className="rounded bg-slate-100 px-1">{hook.webhookUrl}</code></div>
            <div>App secret: <b>{hook.appSecretSet ? 'set' : 'not set'}</b> · Verify token: <b>{hook.verifyTokenSet ? 'set' : 'not set'}</b></div>
            <div className="grid gap-2 md:grid-cols-2"><Input type="password" placeholder="Meta app secret" value={sec.appSecret} onChange={(e) => setSec({ ...sec, appSecret: e.target.value })} /><Input placeholder="Verify token (you choose)" value={sec.verifyToken} onChange={(e) => setSec({ ...sec, verifyToken: e.target.value })} /></div>
            <Button size="sm" disabled={!sec.appSecret && !sec.verifyToken} onClick={async () => { try { await wf('/api/workforce/whatsapp-secrets', { method: 'PUT', json: { ...(sec.appSecret ? { appSecret: sec.appSecret } : {}), ...(sec.verifyToken ? { verifyToken: sec.verifyToken } : {}) } }); setSec({ appSecret: '', verifyToken: '' }); toast.success('Saved'); load(); } catch (e) { toast.error((e as Error).message); } }}>Save</Button>
          </CardContent></Card>)}
    </div>
  );
}

// ---------------------------------------------------------------- Legacy clients
function LegacySection() {
  const [rows, setRows] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const load = useCallback(() => { wf<any[]>('/api/workforce/legacy-clients').then(setRows).catch((e) => toast.error(e.message)); wf<any[]>('/api/clients').then(setClients); }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (json: Record<string, unknown>) => { try { await wf('/api/workforce/legacy-clients', { method: 'PUT', json }); toast.success('Saved'); load(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">Old client names</CardTitle>
      <CardDescription>Employees and candidates carry the client as free text. Match each spelling to a real client. Nothing is merged automatically and the old records are never changed.</CardDescription></CardHeader>
      <CardContent><Table><TableHeader><TableRow><TableHead>As typed</TableHead><TableHead>Used by</TableHead><TableHead>Status</TableHead><TableHead>Match</TableHead></TableRow></TableHeader>
        <TableBody>{rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-slate-500">No legacy client names found.</TableCell></TableRow>}
          {rows.map((r) => (
            <TableRow key={r.id}><TableCell className="font-medium">{r.rawName}{r.possibleDuplicates.length > 0 && <div className="text-xs text-amber-700">Looks like: {r.possibleDuplicates.join(', ')}</div>}</TableCell><TableCell>{r.sourceCount}</TableCell><TableCell><Badge variant="outline" className="capitalize">{r.status}</Badge></TableCell>
              <TableCell>{r.status === 'unmapped' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="w-56"><Pick value={pick[r.rawName] ?? r.suggestedClient?.id ?? ''} onChange={(v) => setPick({ ...pick, [r.rawName]: v })} placeholder="Choose client" options={clients.map((c): [string, string] => [c.id, `${c.code} ${c.name}`])} /></div>
                  <Button size="sm" disabled={!(pick[r.rawName] ?? r.suggestedClient?.id)} onClick={() => act({ action: 'map', rawName: r.rawName, clientId: pick[r.rawName] ?? r.suggestedClient?.id })}>Map</Button>
                  <Button size="sm" variant="outline" onClick={() => act({ action: 'create', rawName: r.rawName })}>Create client</Button>
                  <Button size="sm" variant="ghost" onClick={() => act({ action: 'ignore', rawName: r.rawName })}>Ignore</Button></div>
              ) : r.clientId ? `→ ${clients.find((c) => c.id === r.clientId)?.name ?? r.clientId}` : '—'}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
  );
}

export default function SetupTab() {
  return (
    <Tabs defaultValue="assignments">
      <TabsList className="flex h-auto flex-wrap">
        <TabsTrigger value="assignments">Assignments</TabsTrigger><TabsTrigger value="clients">Clients</TabsTrigger><TabsTrigger value="projects">Projects</TabsTrigger>
        <TabsTrigger value="rules">Rules</TabsTrigger><TabsTrigger value="golive">Go-live switches</TabsTrigger><TabsTrigger value="legacy">Old client names</TabsTrigger>
      </TabsList>
      <TabsContent value="assignments" className="mt-4"><AssignmentsSection /></TabsContent>
      <TabsContent value="clients" className="mt-4"><ClientsSection /></TabsContent>
      <TabsContent value="projects" className="mt-4"><ProjectsSection /></TabsContent>
      <TabsContent value="rules" className="mt-4"><RulesSection /></TabsContent>
      <TabsContent value="golive" className="mt-4"><GoLiveSection /></TabsContent>
      <TabsContent value="legacy" className="mt-4"><LegacySection /></TabsContent>
    </Tabs>
  );
}

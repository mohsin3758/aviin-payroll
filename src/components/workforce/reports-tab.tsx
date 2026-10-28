'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { wf } from './api';

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 1000) / 10}%`);
const BAND: Record<string, string> = { green: 'bg-emerald-100 text-emerald-800', yellow: 'bg-yellow-100 text-yellow-800', orange: 'bg-orange-100 text-orange-800', red: 'bg-red-100 text-red-800' };

export default function ReportsTab() {
  const first = new Date(); first.setDate(1);
  const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(iso(first));
  const [to, setTo] = useState(iso(new Date()));
  const [groupBy, setGroupBy] = useState('project');
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await wf(`/api/workforce/reports?from=${from}&to=${to}&groupBy=${groupBy}`)); } catch (e) { toast.error((e as Error).message); }
  }, [from, to, groupBy]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" /></div>
        <div className="space-y-1"><Label>Group by</Label>
          <Select value={groupBy} onValueChange={setGroupBy}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="project">Project</SelectItem><SelectItem value="client">Client</SelectItem><SelectItem value="contractor">Contractor</SelectItem><SelectItem value="coordinator">Coordinator</SelectItem></SelectContent></Select></div>
        <Button variant="outline" asChild><a href={`/api/workforce/reports?from=${from}&to=${to}&groupBy=${groupBy}&format=csv`}><Download className="mr-2 h-4 w-4" />Export CSV</a></Button>
      </div>
      <Card><CardContent className="overflow-x-auto pt-4">
        <Table>
          <TableHeader><TableRow><TableHead>Group</TableHead><TableHead>Working days</TableHead><TableHead>Attendance</TableHead><TableHead>Late</TableHead><TableHead>Half</TableHead><TableHead>Absent</TableHead><TableHead>Hours</TableHead><TableHead>OT h</TableHead><TableHead>EOD update</TableHead><TableHead>Client confirm</TableHead><TableHead>Exceptions</TableHead><TableHead>Avg fix (min)</TableHead><TableHead>Disputes</TableHead><TableHead>Score</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={14} className="text-center text-slate-500">No data for this period.</TableCell></TableRow>}
            {rows.map((r) => (
              <>
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.label}<div className="text-xs text-slate-400">{r.assignments} assignment(s)</div></TableCell>
                  <TableCell>{r.workingDays}</TableCell><TableCell>{pct(r.attendanceRate)}</TableCell><TableCell>{r.lateDays}</TableCell><TableCell>{r.halfDays}</TableCell><TableCell>{r.absentDays}</TableCell>
                  <TableCell>{r.hoursWorked}</TableCell><TableCell>{r.overtimeHours}</TableCell><TableCell>{pct(r.eodRate)}</TableCell><TableCell>{pct(r.clientConfirmRate)}</TableCell>
                  <TableCell>{r.exceptionsOpened} <span className="text-xs text-slate-400">({r.exceptionsOpen} open)</span></TableCell><TableCell>{r.avgResolutionMinutes ?? '—'}</TableCell><TableCell>{r.disputes}</TableCell>
                  <TableCell>{r.reliability?.score != null ? <button onClick={() => setOpen(open === r.key ? null : r.key)}><Badge className={BAND[r.reliability.band]}>{r.reliability.score}</Badge></button> : '—'}</TableCell>
                </TableRow>
                {open === r.key && r.reliability && (
                  <TableRow key={`${r.key}-why`}><TableCell colSpan={14} className="bg-slate-50 text-sm">
                    <p className="mb-1 font-medium">Why this score</p>
                    <ul className="grid gap-0.5 md:grid-cols-2">{r.reliability.components.map((c: any) => <li key={c.key}><span className="capitalize">{c.key.replace(/([A-Z])/g, ' $1')}</span> ({c.weight}%): {c.reason}{c.points != null ? ` → ${c.points} pts` : ''}</li>)}</ul>
                    {r.reliability.note && <p className="mt-1 text-xs text-slate-500">{r.reliability.note}</p>}
                    <p className="mt-1 text-xs text-slate-500">The score informs people. It never triggers a deduction, warning or termination by itself.</p>
                  </TableCell></TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

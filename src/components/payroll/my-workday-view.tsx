'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DayActions from '@/components/workforce/day-actions';
import { wf } from '@/components/workforce/api';

interface Mine {
  assignmentId: string; project: string; client: string; date: string; shiftStart: string; shiftEnd: string;
  status: { state: string; checkInAt: string | null; checkOutAt: string | null; hoursWorked: number | null; eodDone: boolean; closed: boolean; reasons: string[] } | null;
  pulsePending: boolean;
}

/** A contractor's own day: check in, check out, "still online", and the daily update. */
export default function MyWorkDayView() {
  const [rows, setRows] = useState<Mine[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { setRows(await wf<Mine[]>('/api/workforce/me')); } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
      <div><h1 className="text-2xl font-semibold">My work day</h1><p className="text-sm text-slate-600">Tap to check in, answer &quot;still online&quot;, and send your update.</p></div>
      {!loading && rows.length === 0 && <Card><CardContent className="py-8 text-center text-slate-600">You have no active assignment with daily check-in switched on. If you expected one, ask your coordinator.</CardContent></Card>}
      {rows.map((r) => (
        <Card key={r.assignmentId}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{r.client} · {r.project}</CardTitle><CardDescription>{r.date} · shift {r.shiftStart}–{r.shiftEnd}</CardDescription></CardHeader>
          <CardContent>
            <DayActions status={r.status} pulsePending={r.pulsePending}
              send={async (body) => { await wf('/api/workforce/me', { method: 'POST', json: { assignmentId: r.assignmentId, ...body } }); }}
              onDone={load} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

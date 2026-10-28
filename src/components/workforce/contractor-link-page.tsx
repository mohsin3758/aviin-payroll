'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DayActions, { type DayStatusView } from '@/components/workforce/day-actions';
import { wf } from '@/components/workforce/api';

/** Public page behind the signed link in a contractor's WhatsApp message (no login). */
export default function ContractorLinkPage({ token }: { token: string }) {
  const [info, setInfo] = useState<{ name: string; project: string; date: string; shiftStart: string; shiftEnd: string; status: DayStatusView | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setInfo(await wf(`/api/workforce/t/${token}`)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <h1 className="pt-2 text-xl font-semibold">Aviin · Daily check-in</h1>
      {error && <Card><CardContent className="py-6 text-center text-slate-700">{error} Ask your coordinator for a new link.</CardContent></Card>}
      {info && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Hi {info.name}</CardTitle><CardDescription>{info.project} · {info.date} · shift {info.shiftStart}–{info.shiftEnd}</CardDescription></CardHeader>
          <CardContent>
            <DayActions status={info.status} showPulse
              send={async (body) => { await wf(`/api/workforce/t/${token}`, { method: 'POST', json: body }); }}
              onDone={load} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}

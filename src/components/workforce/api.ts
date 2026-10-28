/** Tiny fetch wrapper for the workforce screens: JSON in/out, and a thrown Error carrying the server's message. */
export async function wf<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(body?.error ?? `Request failed (${res.status})`) as Error & { status?: number; body?: unknown };
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return (body?.data ?? body) as T;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

export const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export const SEVERITY_LABEL: Record<number, string> = { 0: 'Normal', 1: 'Reminder', 2: 'Warning', 3: 'Action', 4: 'Management', 5: 'Critical' };
export const SEVERITY_CLASS: Record<number, string> = {
  0: 'bg-slate-100 text-slate-700', 1: 'bg-sky-100 text-sky-800', 2: 'bg-amber-100 text-amber-800',
  3: 'bg-orange-100 text-orange-800', 4: 'bg-red-100 text-red-800', 5: 'bg-red-600 text-white',
};

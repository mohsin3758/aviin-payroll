'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Briefcase, Receipt, Check, X as XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

interface Employee { id: string; employeeCode: string; firstName: string; lastName: string | null; employmentType: string; }
interface Row { employeeId: string; amount: string; unitsWorked: string; }

/* ------------------------------------------------------------------ */
/*  Off-Cycle & Alternate Pay                                          */
/* ------------------------------------------------------------------ */

function OffCyclePayCard({ employees }: { employees: Employee[] }) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<Row[]>([{ employeeId: '', amount: '', unitsWorked: '' }]);
  const [submitting, setSubmitting] = useState(false);

  const addRow = () => setRows((r) => [...r, { employeeId: '', amount: '', unitsWorked: '' }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof Row, value: string) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const handleSubmit = async () => {
    const entries = rows.filter((r) => r.employeeId && r.amount).map((r) => ({ employeeId: r.employeeId, amount: Number(r.amount) }));
    if (!reason.trim() || entries.length === 0) { toast.error('Reason and at least one employee/amount are required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/payroll/off-cycle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: Number(month), year: Number(year), reason: reason.trim(), entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process off-cycle payroll');
      toast.success(`Off-cycle payroll processed for ${entries.length} employee(s)`);
      setOpen(false); setReason(''); setRows([{ employeeId: '', amount: '', unitsWorked: '' }]);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to process'); } finally { setSubmitting(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><Briefcase className="size-4 text-emerald-600" />Off-Cycle Pay</CardTitle>
          <CardDescription>Bonus/incentive runs outside the regular monthly cycle — flat TDS, no PF/ESI.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />New Off-Cycle Run</Button>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Off-Cycle Payroll Run</DialogTitle><DialogDescription>e.g. a Diwali bonus payout, processed separately from the regular run.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Month</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
                <div className="space-y-1.5 col-span-1"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Diwali bonus" /></div>
              </div>
              <Separator />
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={row.employeeId} onValueChange={(v) => updateRow(i, 'employeeId', v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Employee…" /></SelectTrigger>
                      <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.employeeCode} — {e.firstName} {e.lastName ?? ''}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" placeholder="Amount" value={row.amount} onChange={(e) => updateRow(i, 'amount', e.target.value)} className="w-[120px]" />
                    <Button variant="ghost" size="icon" className="size-8 text-red-500 shrink-0" onClick={() => removeRow(i)} disabled={rows.length === 1}><Trash2 className="size-3.5" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addRow}><Plus className="size-3.5" />Add Employee</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}Process
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
    </Card>
  );
}

function AlternatePayCard({ employees }: { employees: Employee[] }) {
  const now = new Date();
  const nonPermanent = employees.filter((e) => e.employmentType !== 'permanent');
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [rows, setRows] = useState<Row[]>([{ employeeId: '', amount: '', unitsWorked: '' }]);
  const [submitting, setSubmitting] = useState(false);

  const addRow = () => setRows((r) => [...r, { employeeId: '', amount: '', unitsWorked: '' }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof Row, value: string) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const handleSubmit = async () => {
    const entries = rows
      .filter((r) => r.employeeId && r.unitsWorked)
      .map((r) => ({ employeeId: r.employeeId, unitsWorked: Number(r.unitsWorked), ...(r.amount ? { rateOverride: Number(r.amount) } : {}) }));
    if (entries.length === 0) { toast.error('Add at least one employee with units worked'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/payroll/alternate-pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: Number(month), year: Number(year), entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process');
      toast.success(`Processed pay for ${entries.length} employee(s)`);
      setOpen(false); setRows([{ employeeId: '', amount: '', unitsWorked: '' }]);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to process'); } finally { setSubmitting(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><Briefcase className="size-4 text-emerald-600" />Contractor / Daily-Wage / Hourly Pay</CardTitle>
          <CardDescription>For non-permanent employees, paid by units worked instead of the monthly slab engine.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={nonPermanent.length === 0}><Plus className="size-4" />New Run</Button>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Alternate Pay Run</DialogTitle><DialogDescription>Units worked = days for daily-wage, hours for hourly, 1 for a flat contractor invoice. Rate override falls back to the employee&apos;s configured rate if left blank (required for contractors).</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Month</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
              </div>
              <Separator />
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={row.employeeId} onValueChange={(v) => updateRow(i, 'employeeId', v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Employee…" /></SelectTrigger>
                      <SelectContent>{nonPermanent.map((e) => <SelectItem key={e.id} value={e.id}>{e.employeeCode} — {e.firstName} {e.lastName ?? ''} ({e.employmentType.replace('_', ' ')})</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" placeholder="Units" value={row.unitsWorked} onChange={(e) => updateRow(i, 'unitsWorked', e.target.value)} className="w-[90px]" />
                    <Input type="number" placeholder="Rate (opt.)" value={row.amount} onChange={(e) => updateRow(i, 'amount', e.target.value)} className="w-[110px]" />
                    <Button variant="ghost" size="icon" className="size-8 text-red-500 shrink-0" onClick={() => removeRow(i)} disabled={rows.length === 1}><Trash2 className="size-3.5" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addRow}><Plus className="size-3.5" />Add Employee</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}Process
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      {nonPermanent.length === 0 && (
        <CardContent><p className="text-xs text-muted-foreground">No contractor/daily-wage/hourly employees configured yet — set an employee&apos;s employment type on their profile.</p></CardContent>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Expense Claim Approvals                                            */
/* ------------------------------------------------------------------ */

interface Claim {
  id: string; category: string; amount: number; description: string | null; expenseDate: string; status: string;
  employee: { firstName: string; lastName: string | null; employeeCode: string };
}

function ExpenseClaimsCard() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/expense-claims?status=pending');
      const data = await res.json();
      setClaims(data.data ?? []);
    } catch { toast.error('Failed to load expense claims'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const handleDecision = async (id: string, approved: boolean) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/expense-claims/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process claim');
      toast.success(approved ? 'Claim approved — will be paid next cycle' : 'Claim rejected');
      fetchClaims();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to process claim'); } finally { setProcessingId(null); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Receipt className="size-4 text-emerald-600" />Pending Expense Claims</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : claims.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No pending expense claims.</p>
        ) : (
          <div className="divide-y">
            {claims.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium">{c.employee.firstName} {c.employee.lastName ?? ''}</span>{' '}
                  <span className="text-muted-foreground capitalize">— {c.category}, {fmt(c.amount)}</span>
                  {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline">{c.employee.employeeCode}</Badge>
                  <Button size="sm" variant="ghost" className="text-emerald-600" disabled={processingId === c.id} onClick={() => handleDecision(c.id, true)}><Check className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-600" disabled={processingId === c.id} onClick={() => handleDecision(c.id, false)}><XIcon className="size-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Container                                                          */
/* ------------------------------------------------------------------ */

export default function PayrollExtras() {
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    fetch('/api/employees?limit=200').then((r) => r.json()).then((d) => setEmployees(d.data ?? [])).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <Separator />
      <h2 className="text-lg font-semibold">Off-Cycle, Alternate Pay &amp; Expense Claims</h2>
      <OffCyclePayCard employees={employees} />
      <AlternatePayCard employees={employees} />
      <ExpenseClaimsCard />
    </div>
  );
}

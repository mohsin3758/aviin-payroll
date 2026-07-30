'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { HandCoins, Loader2, Plus, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSessionContext } from '@/hooks/session-context';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  eligible: 'bg-blue-100 text-blue-800 border-blue-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  forfeited: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
};

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  permanent: 'FTE',
  contractor: 'Contract',
};

interface EmployeeOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  designation?: string;
  client?: string | null;
  dateOfJoining?: string;
  employmentType?: string;
}

interface Incentive {
  id: string;
  recruiter: EmployeeOption;
  candidate: EmployeeOption;
  employmentType: string;
  amount: number;
  joinDate: string;
  eligibleDate: string;
  payMonth: number;
  payYear: number;
  monthlySalary: number | null;
  annualSalary: number | null;
  reason: string | null;
  status: string;
}

function empName(e: EmployeeOption) {
  return `${e.firstName} ${e.lastName ?? ''}`.trim();
}

export default function HiringIncentivesView() {
  const { user } = useSessionContext();
  const isAdmin = user?.role === 'admin';
  const now = new Date();

  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [tab, setTab] = useState<'all' | 'monthly' | 'yearly'>('all');

  const [statusFilter, setStatusFilter] = useState('all');
  const [reportMonth, setReportMonth] = useState(String(now.getMonth() + 1));
  const [reportYear, setReportYear] = useState(String(now.getFullYear()));
  const [yearlyYear, setYearlyYear] = useState(String(now.getFullYear()));

  const [createOpen, setCreateOpen] = useState(false);
  const [recruiterId, setRecruiterId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [annualSalary, setAnnualSalary] = useState('');
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);

  const [ratesOpen, setRatesOpen] = useState(false);
  const [fteRate, setFteRate] = useState('0');
  const [contractRate, setContractRate] = useState('0');
  const [savingRates, setSavingRates] = useState(false);
  const [loadingRates, setLoadingRates] = useState(false);

  const fetchIncentives = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hiring-incentives');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load hiring incentives');
      setIncentives(json.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load hiring incentives');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncentives();
  }, [fetchIncentives]);

  const openCreateDialog = async () => {
    setCreateOpen(true);
    if (employees.length === 0) {
      try {
        const res = await fetch('/api/employees?limit=200');
        const json = await res.json();
        setEmployees(json.data ?? []);
      } catch {
        toast.error('Failed to load employees');
      }
    }
  };

  const handleCreate = async () => {
    if (!recruiterId || !candidateId) {
      toast.error('Recruiter and candidate are required.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/hiring-incentives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recruiterId,
          candidateId,
          reason: reason.trim() || null,
          monthlySalary: monthlySalary.trim() ? Number(monthlySalary) : null,
          annualSalary: annualSalary.trim() ? Number(annualSalary) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create hiring incentive');
      toast.success(`Hiring incentive of ${fmt(data.amount)} scheduled for ${MONTHS[data.payMonth - 1]} ${data.payYear}`);
      setCreateOpen(false);
      setRecruiterId('');
      setCandidateId('');
      setMonthlySalary('');
      setAnnualSalary('');
      setReason('');
      fetchIncentives();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create hiring incentive');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this hiring incentive? It will not be paid out.')) return;
    try {
      const res = await fetch(`/api/hiring-incentives/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      toast.success('Hiring incentive cancelled');
      fetchIncentives();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel hiring incentive');
    }
  };

  const openRatesDialog = async () => {
    setRatesOpen(true);
    setLoadingRates(true);
    try {
      const res = await fetch('/api/hiring-incentives/rates');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load rates');
      setFteRate(String(json.data.hiringIncentiveFteRate));
      setContractRate(String(json.data.hiringIncentiveContractRate));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load rates');
    } finally {
      setLoadingRates(false);
    }
  };

  const handleSaveRates = async () => {
    setSavingRates(true);
    try {
      const res = await fetch('/api/hiring-incentives/rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hiringIncentiveFteRate: Number(fteRate),
          hiringIncentiveContractRate: Number(contractRate),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save rates');
      toast.success('Hiring incentive rates updated');
      setRatesOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save rates');
    } finally {
      setSavingRates(false);
    }
  };

  const selectedCandidate = useMemo(
    () => employees.find((e) => e.id === candidateId) ?? null,
    [employees, candidateId]
  );

  const filteredAll = useMemo(
    () => (statusFilter === 'all' ? incentives : incentives.filter((i) => i.status === statusFilter)),
    [incentives, statusFilter]
  );

  const monthlyRecords = useMemo(
    () => incentives.filter((i) => i.payMonth === Number(reportMonth) && i.payYear === Number(reportYear)),
    [incentives, reportMonth, reportYear]
  );
  const monthlySummary = useMemo(() => {
    const s = { total: 0, paid: 0, forfeited: 0, pending: 0, eligible: 0 };
    for (const i of monthlyRecords) {
      s.total += i.amount;
      if (i.status === 'paid') s.paid += i.amount;
      else if (i.status === 'forfeited') s.forfeited += i.amount;
      else if (i.status === 'pending') s.pending += i.amount;
      else if (i.status === 'eligible') s.eligible += i.amount;
    }
    return s;
  }, [monthlyRecords]);

  const yearlyByMonth = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      count: 0,
      total: 0,
      paid: 0,
      forfeited: 0,
    }));
    for (const inc of incentives) {
      if (inc.payYear !== Number(yearlyYear)) continue;
      const row = rows[inc.payMonth - 1];
      row.count += 1;
      row.total += inc.amount;
      if (inc.status === 'paid') row.paid += inc.amount;
      if (inc.status === 'forfeited') row.forfeited += inc.amount;
    }
    return rows;
  }, [incentives, yearlyYear]);

  const yearlyTotal = yearlyByMonth.reduce(
    (acc, r) => ({
      count: acc.count + r.count,
      total: acc.total + r.total,
      paid: acc.paid + r.paid,
      forfeited: acc.forfeited + r.forfeited,
    }),
    { count: 0, total: 0, paid: 0, forfeited: 0 }
  );

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <HandCoins className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hiring Incentives</h1>
            <p className="text-sm text-muted-foreground">
              Recruiter payouts for closing new hires — vests after 1 month of active employment
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={openRatesDialog}>
              <Settings2 className="size-4" />
              Configure Rates
            </Button>
          )}
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreateDialog}>
            <Plus className="size-4" />
            New Incentive
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {(['all', 'monthly', 'yearly'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'all' ? 'All Records' : t === 'monthly' ? 'Monthly Report' : 'Yearly Report'}
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">All Records</CardTitle>
              <CardDescription>Every hiring incentive ever scheduled, most recent first</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="eligible">Eligible</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="forfeited">Forfeited</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6"><Skeleton className="h-32 w-full" /></div>
            ) : filteredAll.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No hiring incentives yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recruiter</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Monthly Salary</TableHead>
                      <TableHead className="text-right">Annual Salary</TableHead>
                      <TableHead className="text-right">Incentive Amount</TableHead>
                      <TableHead>Join Date</TableHead>
                      <TableHead>Eligible Date</TableHead>
                      <TableHead>Pay Month</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAll.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{empName(i.recruiter)}</TableCell>
                        <TableCell>{empName(i.candidate)}</TableCell>
                        <TableCell>{i.candidate.client ?? '—'}</TableCell>
                        <TableCell>{i.candidate.designation ?? '—'}</TableCell>
                        <TableCell>{EMPLOYMENT_TYPE_LABEL[i.employmentType] ?? i.employmentType}</TableCell>
                        <TableCell className="text-right">{i.monthlySalary != null ? fmt(i.monthlySalary) : '—'}</TableCell>
                        <TableCell className="text-right">{i.annualSalary != null ? fmt(i.annualSalary) : '—'}</TableCell>
                        <TableCell className="text-right">{fmt(i.amount)}</TableCell>
                        <TableCell>{new Date(i.joinDate).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell>{new Date(i.eligibleDate).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell>{MONTHS[i.payMonth - 1]} {i.payYear}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_BADGE[i.status]}>{i.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{i.reason ?? '—'}</TableCell>
                        <TableCell>
                          {(i.status === 'pending' || i.status === 'eligible') && (
                            <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => handleCancel(i.id)}>
                              <X className="size-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'monthly' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={reportMonth} onValueChange={setReportMonth}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={reportYear} onValueChange={setReportYear}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs text-slate-600 font-medium">Total Scheduled</p>
              <p className="text-lg font-bold text-slate-800">{fmt(monthlySummary.total)}</p>
            </div>
            <div className="rounded-lg border bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600 font-medium">Paid</p>
              <p className="text-lg font-bold text-emerald-800">{fmt(monthlySummary.paid)}</p>
            </div>
            <div className="rounded-lg border bg-blue-50 p-3">
              <p className="text-xs text-blue-600 font-medium">Eligible (unpaid)</p>
              <p className="text-lg font-bold text-blue-800">{fmt(monthlySummary.eligible)}</p>
            </div>
            <div className="rounded-lg border bg-red-50 p-3">
              <p className="text-xs text-red-600 font-medium">Forfeited</p>
              <p className="text-lg font-bold text-red-800">{fmt(monthlySummary.forfeited)}</p>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              {monthlyRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">No hiring incentives scheduled for {MONTHS[Number(reportMonth) - 1]} {reportYear}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recruiter</TableHead>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyRecords.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{empName(i.recruiter)}</TableCell>
                          <TableCell>{empName(i.candidate)}</TableCell>
                          <TableCell>{i.candidate.client ?? '—'}</TableCell>
                          <TableCell>{i.candidate.designation ?? '—'}</TableCell>
                          <TableCell>{EMPLOYMENT_TYPE_LABEL[i.employmentType] ?? i.employmentType}</TableCell>
                          <TableCell className="text-right">{fmt(i.amount)}</TableCell>
                          <TableCell><Badge variant="outline" className={STATUS_BADGE[i.status]}>{i.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'yearly' && (
        <div className="space-y-4">
          <Select value={yearlyYear} onValueChange={setYearlyYear}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Forfeited</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yearlyByMonth.map((r) => (
                      <TableRow key={r.month}>
                        <TableCell>{MONTHS[r.month - 1]}</TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                        <TableCell className="text-right">{fmt(r.total)}</TableCell>
                        <TableCell className="text-right text-emerald-700">{fmt(r.paid)}</TableCell>
                        <TableCell className="text-right text-red-700">{fmt(r.forfeited)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{yearlyTotal.count}</TableCell>
                      <TableCell className="text-right">{fmt(yearlyTotal.total)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{fmt(yearlyTotal.paid)}</TableCell>
                      <TableCell className="text-right text-red-700">{fmt(yearlyTotal.forfeited)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* New Incentive dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open && !creating) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Hiring Incentive</DialogTitle>
            <DialogDescription>
              Schedules a one-time payout for the recruiter once the candidate completes 1 month of active employment.
              Amount and pay date are computed automatically from the candidate&apos;s join date and employment type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Recruiter (receives the payout)</Label>
              <Select value={recruiterId} onValueChange={setRecruiterId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select recruiter..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{empName(e)} ({e.employeeCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Candidate (the new hire that was closed)</Label>
              <Select value={candidateId} onValueChange={setCandidateId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select candidate..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{empName(e)} ({e.employeeCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedCandidate && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                <p className="font-medium">{empName(selectedCandidate)} ({selectedCandidate.employeeCode})</p>
                <p className="text-muted-foreground text-xs">
                  Role: {selectedCandidate.designation ?? '—'} · Client: {selectedCandidate.client ?? '—'} · Joined:{' '}
                  {selectedCandidate.dateOfJoining ? new Date(selectedCandidate.dateOfJoining).toLocaleDateString('en-IN') : '—'} · Type:{' '}
                  {EMPLOYMENT_TYPE_LABEL[selectedCandidate.employmentType ?? ''] ?? selectedCandidate.employmentType ?? '—'}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monthly Salary (record-keeping only)</Label>
                <Input type="number" min="0" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} placeholder="e.g. 45000" />
              </div>
              <div className="space-y-1.5">
                <Label>Annual Salary (record-keeping only)</Label>
                <Input type="number" min="0" value={annualSalary} onChange={(e) => setAnnualSalary(e.target.value)} placeholder="e.g. 540000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason / Notes (optional)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Senior Engineer role, closed via referral" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {creating ? <Loader2 className="size-4 animate-spin" /> : null}
              Schedule Incentive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Rates dialog (admin only) */}
      <Dialog open={ratesOpen} onOpenChange={(open) => { if (!open && !savingRates) setRatesOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Hiring Incentive Rates</DialogTitle>
            <DialogDescription>Fixed payout per closed hire, by employment type. Changing a rate only affects incentives created afterward.</DialogDescription>
          </DialogHeader>
          {loadingRates ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>FTE (permanent) rate</Label>
                <Input type="number" min="0" value={fteRate} onChange={(e) => setFteRate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contract rate</Label>
                <Input type="number" min="0" value={contractRate} onChange={(e) => setContractRate(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatesOpen(false)} disabled={savingRates}>Cancel</Button>
            <Button onClick={handleSaveRates} disabled={savingRates || loadingRates} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingRates ? <Loader2 className="size-4 animate-spin" /> : null}
              Save Rates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

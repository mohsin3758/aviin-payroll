'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calculator,
  Eye,
  Loader2,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  Download,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePayrollStore } from '@/store/payroll-store';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PayrollRunSummary {
  id: string;
  month: number;
  year: number;
  status: string;
  totalEmployees: number;
  totalGrossSalary: number;
  totalDeductions: number;
  totalNetSalary: number;
  totalEmployerPF: number;
  totalEmployerESI: number;
  totalEmployeePF: number;
  totalEmployeeESI: number;
  totalTDS: number;
  totalPT: number;
  totalLWF: number;
  processedAt: string | null;
  _count?: { details: number };
}

interface EmployeeInDetail {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  designation: string | null;
  department: string | null;
}

interface PayrollDetailRow {
  id: string;
  employeeId: string;
  daysInMonth: number;
  presentDays: number;
  paidDays: number;
  basic: number;
  dearnessAllowance: number;
  houseRentAllowance: number;
  conveyanceAllowance: number;
  medicalAllowance: number;
  specialAllowance: number;
  overtimeAllowance: number;
  bonus: number;
  otherEarnings: number;
  totalEarnings: number;
  employeePF: number;
  employerPF: number;
  employeeESI: number;
  employerESI: number;
  tds: number;
  professionalTax: number;
  lwf: number;
  totalDeductions: number;
  netSalary: number;
  grossSalary: number;
  ctc: number;
  employee?: EmployeeInDetail;
}

interface PayrollRunDetail extends Omit<PayrollRunSummary, '_count'> {
  details: PayrollDetailRow[];
}

interface ArrearRow {
  id: string;
  amount: number;
  reason: string | null;
  payMonth: number;
  payYear: number;
  status: string;
  employee: { firstName: string; lastName: string | null; employeeCode: string };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

const statusColor: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  processed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  paid: 'bg-slate-100 text-slate-800 border-slate-200',
};

const nextStatus: Record<string, string> = {
  draft: 'processed',
  processed: 'paid',
};

const nextStatusLabel: Record<string, string> = {
  draft: 'Mark Processed',
  processed: 'Mark Paid',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PayrollView() {
  const { refreshKey } = usePayrollStore();

  // Header state
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  // Processing dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Table state
  const [runs, setRuns] = useState<PayrollRunSummary[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  // Detail dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PayrollRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Arrears dialog state
  const [arrearsOpen, setArrearsOpen] = useState(false);
  const [arrears, setArrears] = useState<ArrearRow[]>([]);
  const [arrearsLoading, setArrearsLoading] = useState(false);
  const [arrearsEmployees, setArrearsEmployees] = useState<{ id: string; employeeCode: string; firstName: string; lastName: string | null }[]>([]);
  const [newArrearEmployeeId, setNewArrearEmployeeId] = useState('');
  const [newArrearAmount, setNewArrearAmount] = useState('');
  const [newArrearReason, setNewArrearReason] = useState('');
  const [newArrearPayMonth, setNewArrearPayMonth] = useState(String(now.getMonth() + 1));
  const [newArrearPayYear, setNewArrearPayYear] = useState(String(now.getFullYear()));
  const [creatingArrear, setCreatingArrear] = useState(false);

  /* --- Fetch payroll runs --- */
  const fetchRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const res = await fetch('/api/payroll');
      if (!res.ok) throw new Error('Failed to fetch payroll runs');
      const data: PayrollRunSummary[] = await res.json();
      setRuns(data);
    } catch {
      toast.error('Failed to load payroll runs');
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns, refreshKey]);

  /* --- Process payroll --- */
  const handleProcess = async () => {
    setProcessing(true);
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: Number(month), year: Number(year) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed');

      toast.success(
        `Payroll processed for ${MONTHS[Number(month) - 1]} ${year} — ${data.totalEmployees} employees`
      );
      setConfirmOpen(false);
      fetchRuns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  /* --- View detail --- */
  const openDetail = async (runId: string) => {
    setDetailOpen(true);
    setLoadingDetail(true);
    setSelectedRun(null);
    try {
      const res = await fetch(`/api/payroll/${runId}`);
      if (!res.ok) throw new Error('Failed to fetch details');
      const data: PayrollRunDetail = await res.json();
      setSelectedRun(data);
    } catch {
      toast.error('Failed to load payroll details');
      setDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  /* --- Status transition --- */
  const handleStatusChange = async (runId: string, newStatus: string) => {
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/payroll/${runId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Status update failed');

      toast.success(`Payroll marked as "${newStatus}"`);
      // Refresh detail view
      setSelectedRun(data);
      fetchRuns();
    } finally {
      setStatusUpdating(false);
    }
  };

  /* --- Bank file download --- */
  const handleDownloadBankFile = async (runId: string, monthNum: number, yearNum: number) => {
    try {
      const res = await fetch(`/api/payroll/${runId}/bank-file?format=csv`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to generate bank file' }));
        throw new Error(err.error || 'Failed to generate bank file');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bank-file-${monthNum}-${yearNum}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Bank file downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate bank file');
    }
  };

  /* --- Arrears --- */
  const fetchArrears = useCallback(async () => {
    setArrearsLoading(true);
    try {
      const res = await fetch('/api/arrears');
      if (!res.ok) throw new Error('Failed to load arrears');
      const json = await res.json();
      setArrears(json.data ?? []);
    } catch {
      toast.error('Failed to load arrears');
    } finally {
      setArrearsLoading(false);
    }
  }, []);

  const openArrearsDialog = async () => {
    setArrearsOpen(true);
    fetchArrears();
    if (arrearsEmployees.length === 0) {
      try {
        const res = await fetch('/api/employees?limit=200');
        const json = await res.json();
        setArrearsEmployees(json.data ?? []);
      } catch {
        toast.error('Failed to load employees');
      }
    }
  };

  const handleCreateArrear = async () => {
    if (!newArrearEmployeeId || !newArrearAmount) {
      toast.error('Employee and amount are required.');
      return;
    }
    setCreatingArrear(true);
    try {
      const res = await fetch('/api/arrears', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: newArrearEmployeeId,
          amount: Number(newArrearAmount),
          reason: newArrearReason.trim() || null,
          payMonth: Number(newArrearPayMonth),
          payYear: Number(newArrearPayYear),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create arrear');
      toast.success(`Arrear of ${fmt(Number(newArrearAmount))} scheduled for ${MONTHS[Number(newArrearPayMonth) - 1]} ${newArrearPayYear}`);
      setNewArrearEmployeeId('');
      setNewArrearAmount('');
      setNewArrearReason('');
      fetchArrears();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create arrear');
    } finally {
      setCreatingArrear(false);
    }
  };

  const handleCancelArrear = async (id: string) => {
    if (!confirm('Cancel this scheduled arrear? It will not be paid out.')) {
      return;
    }
    try {
      const res = await fetch(`/api/arrears/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel arrear');
      toast.success('Arrear cancelled');
      fetchArrears();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel arrear');
    }
  };

  /* --- Detail totals --- */
  const detailTotals = (detail: PayrollRunDetail) => {
    const t = {
      paidDays: 0, basic: 0, dearnessAllowance: 0, houseRentAllowance: 0,
      specialAllowance: 0, totalEarnings: 0,
      employeePF: 0, employeeESI: 0, tds: 0, professionalTax: 0, lwf: 0,
      totalDeductions: 0, netSalary: 0, employerPF: 0, employerESI: 0,
    };
    for (const d of detail.details) {
      t.paidDays += d.paidDays;
      t.basic += d.basic;
      t.dearnessAllowance += d.dearnessAllowance;
      t.houseRentAllowance += d.houseRentAllowance;
      t.specialAllowance += d.specialAllowance;
      t.totalEarnings += d.totalEarnings;
      t.employeePF += d.employeePF;
      t.employeeESI += d.employeeESI;
      t.tds += d.tds;
      t.professionalTax += d.professionalTax;
      t.lwf += d.lwf;
      t.totalDeductions += d.totalDeductions;
      t.netSalary += d.netSalary;
      t.employerPF += d.employerPF;
      t.employerESI += d.employerESI;
    }
    return t;
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll Processing</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Process monthly payroll and manage run statuses
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="payroll-month">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger id="payroll-month" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payroll-year">Year</Label>
            <Input
              id="payroll-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-[100px]"
            />
          </div>

          <Button variant="outline" onClick={openArrearsDialog}>
            <Wallet className="size-4" />
            Manage Arrears
          </Button>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Calculator className="size-4" />
                Process Payroll
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Process Payroll</AlertDialogTitle>
                <AlertDialogDescription>
                  Process payroll for <span className="font-semibold">{MONTHS[Number(month) - 1]} {year}</span>?
                  This will calculate salary for all active employees based on their attendance.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleProcess}
                  disabled={processing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {processing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    'Confirm'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ── Runs Table ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payroll Runs</CardTitle>
              <CardDescription>All processed payroll periods</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRuns} disabled={loadingRuns}>
              <RefreshCw className={`size-4 ${loadingRuns ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingRuns ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="size-10 mb-3 opacity-40" />
              <p className="text-sm">No payroll runs found. Process your first payroll above.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead className="text-right">Employees</TableHead>
                      <TableHead className="text-right">Total Gross</TableHead>
                      <TableHead className="text-right">Total Deductions</TableHead>
                      <TableHead className="text-right">Total Net</TableHead>
                      <TableHead className="text-right">Total PF</TableHead>
                      <TableHead className="text-right">Total ESI</TableHead>
                      <TableHead className="text-right">Total TDS</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="font-medium">{MONTHS[run.month - 1]}</TableCell>
                        <TableCell>{run.year}</TableCell>
                        <TableCell className="text-right">{run.totalEmployees}</TableCell>
                        <TableCell className="text-right">{fmt(run.totalGrossSalary)}</TableCell>
                        <TableCell className="text-right">{fmt(run.totalDeductions)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(run.totalNetSalary)}</TableCell>
                        <TableCell className="text-right">{fmt(run.totalEmployeePF)}</TableCell>
                        <TableCell className="text-right">{fmt(run.totalEmployeeESI)}</TableCell>
                        <TableCell className="text-right">{fmt(run.totalTDS)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusColor[run.status] || ''}
                          >
                            {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetail(run.id)}
                          >
                            <Eye className="size-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Card list (mobile) */}
              <div className="space-y-2 md:hidden">
                {runs.map((run) => (
                  <div key={run.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{MONTHS[run.month - 1]} {run.year}</div>
                        <div className="text-xs text-muted-foreground">{run.totalEmployees} employees</div>
                      </div>
                      <Badge variant="outline" className={statusColor[run.status] || ''}>
                        {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Net Salary</span>
                      <span className="font-semibold">{fmt(run.totalNetSalary)}</span>
                    </div>
                    <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => openDetail(run.id)}>
                      <Eye className="size-4 mr-1" />
                      View Details
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Dialog ──────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[95vw] lg:max-w-[90vw] xl:max-w-[1200px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRun && (
                <>
                  Payroll Detail — {MONTHS[selectedRun.month - 1]} {selectedRun.year}
                  <Badge
                    variant="outline"
                    className={statusColor[selectedRun.status] || ''}
                  >
                    {selectedRun.status.charAt(0).toUpperCase() + selectedRun.status.slice(1)}
                  </Badge>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Employee-wise salary breakdown
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : selectedRun ? (
            <div className="space-y-4">
              {/* Status action bar */}
              {nextStatus[selectedRun.status] && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <ChevronLeft className="size-4 text-amber-600 shrink-0" />
                  <span className="text-sm text-amber-800 flex-1">
                    Current status: <strong>{selectedRun.status}</strong>. You can transition to{' '}
                    <strong>{nextStatus[selectedRun.status]}</strong>.
                  </span>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={statusUpdating}
                    onClick={() =>
                      handleStatusChange(selectedRun.id, nextStatus[selectedRun.status]!)
                    }
                  >
                    {statusUpdating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    {nextStatusLabel[selectedRun.status]}
                  </Button>
                </div>
              )}

              {selectedRun.status !== 'draft' && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => handleDownloadBankFile(selectedRun.id, selectedRun.month, selectedRun.year)}
                  >
                    <Download className="size-4" />
                    Download Bank File
                  </Button>
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-600 font-medium">Total Gross</p>
                  <p className="text-lg font-bold text-emerald-800">{fmt(selectedRun.totalGrossSalary)}</p>
                </div>
                <div className="rounded-lg border bg-red-50 p-3">
                  <p className="text-xs text-red-600 font-medium">Total Deductions</p>
                  <p className="text-lg font-bold text-red-800">{fmt(selectedRun.totalDeductions)}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-slate-600 font-medium">Total Net</p>
                  <p className="text-lg font-bold text-slate-800">{fmt(selectedRun.totalNetSalary)}</p>
                </div>
                <div className="rounded-lg border bg-amber-50 p-3">
                  <p className="text-xs text-amber-600 font-medium">Employees</p>
                  <p className="text-lg font-bold text-amber-800">{selectedRun.totalEmployees}</p>
                </div>
              </div>

              <Separator />

              {/* Employee detail table */}
              <div className="overflow-x-auto text-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Emp Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Paid Days</TableHead>
                      <TableHead className="text-right">Basic</TableHead>
                      <TableHead className="text-right">HRA</TableHead>
                      <TableHead className="text-right">DA</TableHead>
                      <TableHead className="text-right">Special Allow</TableHead>
                      <TableHead className="text-right">Total Earnings</TableHead>
                      <TableHead className="text-right">Emp PF</TableHead>
                      <TableHead className="text-right">Emp ESI</TableHead>
                      <TableHead className="text-right">TDS</TableHead>
                      <TableHead className="text-right">PT</TableHead>
                      <TableHead className="text-right">LWF</TableHead>
                      <TableHead className="text-right">Total Deductions</TableHead>
                      <TableHead className="text-right">Net Salary</TableHead>
                      <TableHead className="text-right">Er. PF</TableHead>
                      <TableHead className="text-right">Er. ESI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRun.details.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">
                          {d.employee?.employeeCode ?? '—'}
                        </TableCell>
                        <TableCell className="font-medium min-w-[160px]">
                          {d.employee
                            ? `${d.employee.firstName} ${d.employee.lastName ?? ''}`.trim()
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">{d.paidDays}</TableCell>
                        <TableCell className="text-right">{fmt(d.basic)}</TableCell>
                        <TableCell className="text-right">{fmt(d.houseRentAllowance)}</TableCell>
                        <TableCell className="text-right">{fmt(d.dearnessAllowance)}</TableCell>
                        <TableCell className="text-right">{fmt(d.specialAllowance)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(d.totalEarnings)}</TableCell>
                        <TableCell className="text-right">{fmt(d.employeePF)}</TableCell>
                        <TableCell className="text-right">{fmt(d.employeeESI)}</TableCell>
                        <TableCell className="text-right">{fmt(d.tds)}</TableCell>
                        <TableCell className="text-right">{fmt(d.professionalTax)}</TableCell>
                        <TableCell className="text-right">{fmt(d.lwf)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(d.totalDeductions)}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700">
                          {fmt(d.netSalary)}
                        </TableCell>
                        <TableCell className="text-right">{fmt(d.employerPF)}</TableCell>
                        <TableCell className="text-right">{fmt(d.employerESI)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {selectedRun.details.length > 0 && (
                    <TableFooter>
                      <TableRow className="font-semibold">
                        <TableCell colSpan={2}>Totals</TableCell>
                        <TableCell className="text-right">
                          {detailTotals(selectedRun).paidDays}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).basic)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).houseRentAllowance)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).dearnessAllowance)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).specialAllowance)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).totalEarnings)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).employeePF)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).employeeESI)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).tds)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).professionalTax)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).lwf)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).totalDeductions)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-700">
                          {fmt(detailTotals(selectedRun).netSalary)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).employerPF)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(detailTotals(selectedRun).employerESI)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Arrears Dialog ─────────────────────────────────────────── */}
      <Dialog open={arrearsOpen} onOpenChange={setArrearsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Arrears</DialogTitle>
            <DialogDescription>
              One-time payments scheduled into a specific month&apos;s payroll — not prorated by attendance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* New arrear form */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Employee</Label>
                  <Select value={newArrearEmployeeId} onValueChange={setNewArrearEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {arrearsEmployees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.employeeCode} — {e.firstName} {e.lastName ?? ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Amount (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newArrearAmount}
                    onChange={(e) => setNewArrearAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium">Reason</Label>
                  <Input
                    placeholder="e.g. Retroactive raise for Q4"
                    value={newArrearReason}
                    onChange={(e) => setNewArrearReason(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Pay Month</Label>
                  <Select value={newArrearPayMonth} onValueChange={setNewArrearPayMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Pay Year</Label>
                  <Input
                    type="number"
                    min={2000}
                    max={2100}
                    value={newArrearPayYear}
                    onChange={(e) => setNewArrearPayYear(e.target.value)}
                  />
                </div>
              </div>
              <Button size="sm" onClick={handleCreateArrear} disabled={creatingArrear} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {creatingArrear ? <Loader2 className="size-4 animate-spin" /> : null}
                Schedule Arrear
              </Button>
            </div>

            {/* Existing arrears list */}
            <div className="divide-y rounded-lg border">
              {arrearsLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : arrears.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No arrears scheduled yet.</div>
              ) : (
                arrears.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-medium">{a.employee.employeeCode} — {a.employee.firstName} {a.employee.lastName ?? ''}</span>{' '}
                      <span className="text-muted-foreground">
                        · {fmt(a.amount)} · {MONTHS[a.payMonth - 1]} {a.payYear}
                        {a.reason ? ` · ${a.reason}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className={
                          a.status === 'paid'
                            ? 'border-emerald-300 text-emerald-700'
                            : a.status === 'cancelled'
                            ? 'border-slate-300 text-slate-500'
                            : 'border-amber-300 text-amber-700'
                        }
                      >
                        {a.status}
                      </Badge>
                      {a.status === 'pending' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleCancelArrear(a.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setArrearsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
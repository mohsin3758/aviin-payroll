'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  FilterIcon,
  Home,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';

import { usePayrollStore } from '@/store/payroll-store';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

// ---------- Types ----------

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  [key: string]: unknown;
}

interface WfhRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  employee: { firstName: string; lastName: string; employeeCode: string };
}

const YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current - 2; y <= current + 1; y++) years.push(y);
  return years;
})();

// ---------- Helpers ----------

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calcBusinessDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 0;
  const diffMs = Math.abs(e.getTime() - s.getTime());
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  approved: {
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  },
};

// ---------- Component ----------

export default function WfhRequestsView() {
  const { refreshKey } = usePayrollStore();

  // ---- Data state ----
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<WfhRequest[]>([]);

  // ---- Loading state ----
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState(false);

  // ---- Filter state ----
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<number>(() => new Date().getFullYear());

  // ---- Dialog state ----
  const [applyOpen, setApplyOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'approve' | 'reject' | 'cancel'; id: string } | null>(null);

  // ---- Form state ----
  const [formEmployee, setFormEmployee] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formReason, setFormReason] = useState('');

  const totalDays = useMemo(() => {
    if (!formStartDate || !formEndDate) return 0;
    return calcBusinessDays(formStartDate, formEndDate);
  }, [formStartDate, formEndDate]);

  // ---- Fetch employees ----
  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const res = await fetch('/api/employees?limit=200');
      if (!res.ok) throw new Error('Failed to fetch employees');
      const json = await res.json();
      setEmployees(json.data ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load employees');
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // ---- Fetch requests ----
  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const params = new URLSearchParams();
      if (filterEmployee !== 'all') params.set('employeeId', filterEmployee);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      params.set('year', String(filterYear));
      params.set('limit', '200');
      const res = await fetch(`/api/wfh?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch WFH requests');
      const json = await res.json();
      setRequests(json.data ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load WFH requests');
    } finally {
      setLoadingRequests(false);
    }
  }, [filterEmployee, filterStatus, filterYear]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests, refreshKey]);

  // ---- Form reset ----
  const resetForm = useCallback(() => {
    setFormEmployee('');
    setFormStartDate('');
    setFormEndDate('');
    setFormReason('');
  }, []);

  // ---- Apply on behalf of an employee ----
  const handleApply = useCallback(async () => {
    if (!formEmployee) {
      toast.error('Please select an employee');
      return;
    }
    if (!formStartDate || !formEndDate) {
      toast.error('Please select start and end dates');
      return;
    }
    if (new Date(formEndDate) < new Date(formStartDate)) {
      toast.error('End date cannot be before start date');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/wfh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: formEmployee,
          startDate: formStartDate,
          endDate: formEndDate,
          reason: formReason || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit WFH request');
      }
      toast.success('WFH request submitted');
      setApplyOpen(false);
      resetForm();
      fetchRequests();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to submit WFH request');
    } finally {
      setSubmitting(false);
    }
  }, [formEmployee, formStartDate, formEndDate, formReason, resetForm, fetchRequests]);

  // ---- Confirm action (approve / reject / cancel) ----
  const openConfirm = useCallback((type: 'approve' | 'reject' | 'cancel', id: string) => {
    setConfirmAction({ type, id });
    setConfirmOpen(true);
  }, []);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return;
    const { type, id } = confirmAction;
    setActioning(true);
    try {
      if (type === 'cancel') {
        const res = await fetch(`/api/wfh/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to cancel WFH request');
        toast.success('WFH request cancelled');
      } else {
        const res = await fetch(`/api/wfh/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: type === 'approve' ? 'approved' : 'rejected' }),
        });
        if (!res.ok) throw new Error(`Failed to ${type} WFH request`);
        toast.success(`WFH request ${type === 'approve' ? 'approved' : 'rejected'}`);
      }
      setConfirmOpen(false);
      setConfirmAction(null);
      fetchRequests();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActioning(false);
    }
  }, [confirmAction, fetchRequests]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* ========== HEADER ========== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">WFH Requests</h1>
          <p className="text-sm text-muted-foreground">
            Approve or reject work-from-home requests — once approved, the employee&apos;s punches are exempt from geofence checks for the approved dates.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            if (filterEmployee !== 'all') setFormEmployee(filterEmployee);
            setApplyOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        >
          <Plus className="mr-2 size-4" />
          New WFH Request
        </Button>
      </div>

      {/* ========== FILTERS ========== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <Label className="text-xs font-medium text-muted-foreground">Employee</Label>
          <Select value={filterEmployee} onValueChange={setFilterEmployee}>
            <SelectTrigger className="w-full">
              <FilterIcon className="mr-2 size-4 text-muted-foreground" />
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeCode})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <Label className="text-xs font-medium text-muted-foreground">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 min-w-[110px]">
          <Label className="text-xs font-medium text-muted-foreground">Year</Label>
          <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(parseInt(v, 10))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ========== REQUESTS TABLE ========== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">WFH Requests</CardTitle>
          <CardDescription>
            {requests.length} request{requests.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRequests || loadingEmployees ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Home className="mx-auto mb-2 size-10 opacity-40" />
              <p className="text-sm">No WFH requests found.</p>
              <p className="text-xs mt-1">Try adjusting filters or submit a new request.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Employee</TableHead>
                    <TableHead className="font-semibold">From</TableHead>
                    <TableHead className="font-semibold">To</TableHead>
                    <TableHead className="font-semibold text-center">Days</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Reason</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => {
                    const st = statusConfig[req.status] ?? statusConfig.pending;
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          <div>
                            <div className="text-sm">{req.employee.firstName} {req.employee.lastName}</div>
                            <div className="text-xs text-muted-foreground">{req.employee.employeeCode}</div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(req.startDate)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(req.endDate)}</TableCell>
                        <TableCell className="text-center font-medium">{req.totalDays}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={st.className}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {req.reason || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {req.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                                  onClick={() => openConfirm('approve', req.id)}
                                >
                                  <CheckCircle2 className="mr-1 size-4" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                                  onClick={() => openConfirm('reject', req.id)}
                                >
                                  <XCircle className="mr-1 size-4" />
                                  Reject
                                </Button>
                              </>
                            )}
                            {(req.status === 'pending' || req.status === 'approved') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                                onClick={() => openConfirm('cancel', req.id)}
                              >
                                <RotateCcw className="mr-1 size-4" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== NEW WFH REQUEST DIALOG ========== */}
      <Dialog open={applyOpen} onOpenChange={(open) => { if (!open) resetForm(); setApplyOpen(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="size-5 text-emerald-600" />
              New WFH Request
            </DialogTitle>
            <DialogDescription>
              Submit a work-from-home request on an employee&apos;s behalf. All fields marked with * are required.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="form-employee">
                Employee <span className="text-red-500">*</span>
              </Label>
              <Select value={formEmployee} onValueChange={setFormEmployee}>
                <SelectTrigger id="form-employee" className="w-full">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="form-start">
                  Start Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="form-start"
                  type="date"
                  value={formStartDate}
                  onChange={(e) => {
                    setFormStartDate(e.target.value);
                    if (!formEndDate) setFormEndDate(e.target.value);
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="form-end">
                  End Date <span className="text-red-500">*</span>
                </Label>
                <Input id="form-end" type="date" value={formEndDate} min={formStartDate} onChange={(e) => setFormEndDate(e.target.value)} />
              </div>
            </div>

            {totalDays > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/40">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Total Days</span>
                  <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{totalDays}</span>
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="form-reason">Reason</Label>
              <Textarea
                id="form-reason"
                placeholder="Enter reason for WFH (optional)"
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setApplyOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting ? (
                <>
                  <RotateCcw className="mr-2 size-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 size-4" />
                  Submit Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== CONFIRM ACTION DIALOG ========== */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'approve' && 'Approve WFH Request'}
              {confirmAction?.type === 'reject' && 'Reject WFH Request'}
              {confirmAction?.type === 'cancel' && 'Cancel WFH Request'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'approve' &&
                "This will approve the WFH request — the employee's punches will be exempt from geofence checks for these dates."}
              {confirmAction?.type === 'reject' &&
                'This will reject the WFH request. The employee will be notified.'}
              {confirmAction?.type === 'cancel' &&
                'This will cancel the WFH request. If it was already approved, the geofence exemption for these dates ends immediately.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmAction(); }}
              disabled={actioning}
              className={
                confirmAction?.type === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : confirmAction?.type === 'reject'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
              }
            >
              {actioning ? (
                <>
                  <RotateCcw className="mr-2 size-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {confirmAction?.type === 'approve' && (<><CheckCircle2 className="mr-2 size-4" />Approve</>)}
                  {confirmAction?.type === 'reject' && (<><XCircle className="mr-2 size-4" />Reject</>)}
                  {confirmAction?.type === 'cancel' && (<><Trash2 className="mr-2 size-4" />Cancel Request</>)}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckCircle2,
  FilterIcon,
  Leaf,
  Plus,
  RotateCcw,
  Search,
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
import { Progress } from '@/components/ui/progress';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

// ---------- Types ----------

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  [key: string]: unknown;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  [key: string]: unknown;
}

interface LeaveApplication {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  employee: { firstName: string; lastName: string; employeeCode: string };
  leaveType: LeaveType;
}

interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allocated: number;
  used: number;
  available: number;
  carryForward: number;
  leaveType: LeaveType;
  [key: string]: unknown;
}

// ---------- Helpers ----------

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function calcBusinessDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 0;
  const diffMs = Math.abs(e.getTime() - s.getTime());
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

function getBalanceColor(available: number, allocated: number): string {
  if (allocated <= 0) return 'text-muted-foreground';
  const pct = (available / allocated) * 100;
  if (pct > 50) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 25) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getProgressColor(available: number, allocated: number): string {
  if (allocated <= 0) return '[&>[data-slot=progress-indicator]]:bg-muted-foreground';
  const pct = (available / allocated) * 100;
  if (pct > 50) return '[&>[data-slot=progress-indicator]]:bg-emerald-500';
  if (pct >= 25) return '[&>[data-slot=progress-indicator]]:bg-amber-500';
  return '[&>[data-slot=progress-indicator]]:bg-red-500';
}

function getBalanceBorderColor(available: number, allocated: number): string {
  if (allocated <= 0) return 'border-border';
  const pct = (available / allocated) * 100;
  if (pct > 50) return 'border-emerald-200 dark:border-emerald-800';
  if (pct >= 25) return 'border-amber-200 dark:border-amber-800';
  return 'border-red-200 dark:border-red-800';
}

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  pending: {
    label: 'Pending',
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  approved: {
    label: 'Approved',
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  rejected: {
    label: 'Rejected',
    className:
      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
  },
  cancelled: {
    label: 'Cancelled',
    className:
      'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  },
};

// ---------- Component ----------

export default function LeavesView() {
  const { refreshKey, selectedEmployeeId } = usePayrollStore();

  // ---- Data state ----
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [allBalances, setAllBalances] = useState<LeaveBalance[]>([]);

  // ---- Loading state ----
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [loadingAllBalances, setLoadingAllBalances] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState(false);

  // ---- Filter state ----
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // ---- Dialog state ----
  const [applyOpen, setApplyOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject' | 'cancel';
    id: string;
  } | null>(null);

  // ---- Form state ----
  const [formEmployee, setFormEmployee] = useState('');
  const [formLeaveType, setFormLeaveType] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formReason, setFormReason] = useState('');

  const currentYear = new Date().getFullYear();

  // ---- Computed total days ----
  const totalDays = useMemo(() => {
    if (!formStartDate || !formEndDate) return 0;
    return calcBusinessDays(formStartDate, formEndDate);
  }, [formStartDate, formEndDate]);

  // ---- Fetch employees ----
  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const res = await fetch('/api/employees');
      if (!res.ok) throw new Error('Failed to fetch employees');
      const data = await res.json();
      setEmployees(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load employees');
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // ---- Fetch leave types ----
  const fetchLeaveTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const res = await fetch('/api/leaves?types=true');
      if (!res.ok) throw new Error('Failed to fetch leave types');
      const data = await res.json();
      setLeaveTypes(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load leave types');
    } finally {
      setLoadingTypes(false);
    }
  }, []);

  // ---- Fetch applications ----
  const fetchApplications = useCallback(async () => {
    setLoadingApplications(true);
    try {
      const params = new URLSearchParams();
      if (filterEmployee && filterEmployee !== 'all') {
        params.set('employeeId', filterEmployee);
      }
      if (filterStatus && filterStatus !== 'all') {
        params.set('status', filterStatus);
      }
      params.set('year', String(currentYear));
      const res = await fetch(`/api/leaves?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch applications');
      const data = await res.json();
      setApplications(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load leave applications');
    } finally {
      setLoadingApplications(false);
    }
  }, [filterEmployee, filterStatus, currentYear]);

  // ---- Fetch balance for selected employee ----
  const fetchBalances = useCallback(async () => {
    const empId = filterEmployee !== 'all' ? filterEmployee : selectedEmployeeId;
    if (!empId) {
      setBalances([]);
      setLoadingBalances(false);
      return;
    }
    setLoadingBalances(true);
    try {
      const res = await fetch(
        `/api/leaves/balance?employeeId=${empId}&year=${currentYear}`
      );
      if (!res.ok) throw new Error('Failed to fetch balances');
      const data = await res.json();
      setBalances(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load leave balances');
    } finally {
      setLoadingBalances(false);
    }
  }, [filterEmployee, selectedEmployeeId, currentYear]);

  // ---- Fetch all employees balances ----
  const fetchAllBalances = useCallback(async () => {
    setLoadingAllBalances(true);
    try {
      const allData: LeaveBalance[] = [];
      for (const emp of employees) {
        const res = await fetch(
          `/api/leaves/balance?employeeId=${emp.id}&year=${currentYear}`
        );
        if (res.ok) {
          const data = await res.json();
          allData.push(...data);
        }
      }
      setAllBalances(allData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load all employee balances');
    } finally {
      setLoadingAllBalances(false);
    }
  }, [employees, currentYear]);

  // ---- Effects ----
  useEffect(() => {
    fetchEmployees();
    fetchLeaveTypes();
  }, [fetchEmployees, fetchLeaveTypes]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications, refreshKey]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances, refreshKey]);

  useEffect(() => {
    if (employees.length > 0) {
      fetchAllBalances();
    }
  }, [employees, fetchAllBalances, refreshKey]);

  // ---- Form reset ----
  const resetForm = useCallback(() => {
    setFormEmployee('');
    setFormLeaveType('');
    setFormStartDate('');
    setFormEndDate('');
    setFormReason('');
  }, []);

  // ---- Apply for leave ----
  const handleApply = useCallback(async () => {
    if (!formEmployee) {
      toast.error('Please select an employee');
      return;
    }
    if (!formLeaveType) {
      toast.error('Please select a leave type');
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
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: formEmployee,
          leaveTypeId: formLeaveType,
          startDate: formStartDate,
          endDate: formEndDate,
          reason: formReason || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to apply for leave');
      }
      toast.success('Leave application submitted successfully');
      setApplyOpen(false);
      resetForm();
      fetchApplications();
      fetchBalances();
      fetchAllBalances();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to apply for leave');
    } finally {
      setSubmitting(false);
    }
  }, [
    formEmployee,
    formLeaveType,
    formStartDate,
    formEndDate,
    formReason,
    resetForm,
    fetchApplications,
    fetchBalances,
    fetchAllBalances,
  ]);

  // ---- Confirm action (approve / reject / cancel) ----
  const openConfirm = useCallback(
    (type: 'approve' | 'reject' | 'cancel', id: string) => {
      setConfirmAction({ type, id });
      setConfirmOpen(true);
    },
    []
  );

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return;
    const { type, id } = confirmAction;
    setActioning(true);
    try {
      if (type === 'cancel') {
        const res = await fetch(`/api/leaves/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to cancel leave');
        toast.success('Leave application cancelled');
      } else {
        const res = await fetch(`/api/leaves/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: type === 'approve' ? 'approved' : 'rejected' }),
        });
        if (!res.ok) throw new Error(`Failed to ${type} leave`);
        toast.success(`Leave application ${type === 'approve' ? 'approved' : 'rejected'}`);
      }
      setConfirmOpen(false);
      setConfirmAction(null);
      fetchApplications();
      fetchBalances();
      fetchAllBalances();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActioning(false);
    }
  }, [confirmAction, fetchApplications, fetchBalances, fetchAllBalances]);

  // ---- Get employee name helper ----
  const getEmployeeName = useCallback(
    (empId: string) => {
      const emp = employees.find((e) => e.id === empId);
      return emp ? `${emp.firstName} ${emp.lastName}` : empId;
    },
    [employees]
  );

  // ---- Current balance employee id ----
  const balanceEmployeeId =
    filterEmployee !== 'all' ? filterEmployee : selectedEmployeeId;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* ========== HEADER ========== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Leave Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage leave applications and balances for {currentYear}
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            if (filterEmployee && filterEmployee !== 'all') {
              setFormEmployee(filterEmployee);
            }
            setApplyOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        >
          <Plus className="mr-2 size-4" />
          Apply for Leave
        </Button>
      </div>

      {/* ========== FILTERS ========== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <Label className="text-xs font-medium text-muted-foreground">
            Employee
          </Label>
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
          <Label className="text-xs font-medium text-muted-foreground">
            Status
          </Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ========== LEAVE BALANCE CARDS ========== */}
      {balanceEmployeeId && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Leave Balance — {getEmployeeName(balanceEmployeeId)}
          </h2>
          {loadingBalances ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : balances.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:overflow-x-visible">
              {balances.map((b) => {
                const pct =
                  b.allocated > 0
                    ? Math.round((b.available / b.allocated) * 100)
                    : 0;
                return (
                  <Card
                    key={b.id}
                    className={`min-w-[200px] flex-shrink-0 border-l-4 ${getBalanceBorderColor(b.available, b.allocated)}`}
                  >
                    <CardHeader className="pb-0 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">
                          {b.leaveType.name}
                        </CardTitle>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {b.leaveType.code}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-2">
                      <div className="mb-2 flex items-baseline justify-between">
                        <span className={`text-2xl font-bold ${getBalanceColor(b.available, b.allocated)}`}>
                          {b.available}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          of {b.allocated} days
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        className={`h-2 mb-2 ${getProgressColor(b.available, b.allocated)}`}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Used: {b.used}</span>
                        {b.carryForward > 0 && (
                          <span>Carry Fwd: {b.carryForward}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="py-8">
              <CardContent className="text-center text-muted-foreground">
                <Leaf className="mx-auto mb-2 size-8 opacity-50" />
                <p className="text-sm">No leave balance data found for this employee.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ========== TABS: Applications & Balances ========== */}
      <Tabs defaultValue="applications" className="w-full">
        <TabsList>
          <TabsTrigger value="applications">
            <CalendarDays className="mr-1.5 size-4" />
            Leave Applications
          </TabsTrigger>
          <TabsTrigger value="balances">
            <Search className="mr-1.5 size-4" />
            Employee Balances
          </TabsTrigger>
        </TabsList>

        {/* ---- Applications Tab ---- */}
        <TabsContent value="applications">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leave Applications</CardTitle>
              <CardDescription>
                {applications.length} application{applications.length !== 1 ? 's' : ''} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingApplications ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : applications.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CalendarDays className="mx-auto mb-2 size-10 opacity-40" />
                  <p className="text-sm">No leave applications found.</p>
                  <p className="text-xs mt-1">
                    Try adjusting filters or apply for a new leave.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Employee</TableHead>
                        <TableHead className="font-semibold">Leave Type</TableHead>
                        <TableHead className="font-semibold">From</TableHead>
                        <TableHead className="font-semibold">To</TableHead>
                        <TableHead className="font-semibold text-center">Days</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Reason</TableHead>
                        <TableHead className="font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {applications.map((app) => {
                        const st = statusConfig[app.status] ?? statusConfig.pending;
                        return (
                          <TableRow key={app.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              <div>
                                <div className="text-sm">
                                  {app.employee.firstName} {app.employee.lastName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {app.employee.employeeCode}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800"
                              >
                                {app.leaveType.code}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {formatDate(app.startDate)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {formatDate(app.endDate)}
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {app.totalDays}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={st.className}>
                                {st.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                              {app.reason || '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {app.status === 'pending' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                                      onClick={() => openConfirm('approve', app.id)}
                                    >
                                      <CheckCircle2 className="mr-1 size-4" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                                      onClick={() => openConfirm('reject', app.id)}
                                    >
                                      <XCircle className="mr-1 size-4" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {(app.status === 'pending' || app.status === 'approved') && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                                    onClick={() => openConfirm('cancel', app.id)}
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
        </TabsContent>

        {/* ---- Employee Balances Tab ---- */}
        <TabsContent value="balances">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Leave Balances — All Employees
              </CardTitle>
              <CardDescription>
                Year {currentYear} leave balance overview
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAllBalances ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : allBalances.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Leaf className="mx-auto mb-2 size-10 opacity-40" />
                  <p className="text-sm">No balance data available.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Employee</TableHead>
                        <TableHead className="font-semibold">Leave Type</TableHead>
                        <TableHead className="font-semibold text-right">Allocated</TableHead>
                        <TableHead className="font-semibold text-right">Used</TableHead>
                        <TableHead className="font-semibold text-right">Available</TableHead>
                        <TableHead className="font-semibold text-right">Carry Forward</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allBalances.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {getEmployeeName(b.employeeId)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
                              {b.leaveType.code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.allocated}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {b.used}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            <span className={getBalanceColor(b.available, b.allocated)}>
                              {b.available}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.carryForward > 0 ? b.carryForward : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ========== APPLY FOR LEAVE DIALOG ========== */}
      <Dialog open={applyOpen} onOpenChange={(open) => {
        if (!open) resetForm();
        setApplyOpen(open);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="size-5 text-emerald-600" />
              Apply for Leave
            </DialogTitle>
            <DialogDescription>
              Submit a new leave application. All fields marked with * are required.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Employee */}
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

            {/* Leave Type */}
            <div className="grid gap-1.5">
              <Label htmlFor="form-type">
                Leave Type <span className="text-red-500">*</span>
              </Label>
              <Select value={formLeaveType} onValueChange={setFormLeaveType}>
                <SelectTrigger id="form-type" className="w-full">
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt) => (
                    <SelectItem key={lt.id} value={lt.id}>
                      {lt.name} ({lt.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date row */}
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
                    // Auto-set end date if not set
                    if (!formEndDate) setFormEndDate(e.target.value);
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="form-end">
                  End Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="form-end"
                  type="date"
                  value={formEndDate}
                  min={formStartDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Total days display */}
            {totalDays > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/40">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    Total Days
                  </span>
                  <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                    {totalDays}
                  </span>
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="grid gap-1.5">
              <Label htmlFor="form-reason">Reason</Label>
              <Textarea
                id="form-reason"
                placeholder="Enter reason for leave (optional)"
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setApplyOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitting ? (
                <>
                  <RotateCcw className="mr-2 size-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 size-4" />
                  Submit Application
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
              {confirmAction?.type === 'approve' && 'Approve Leave Application'}
              {confirmAction?.type === 'reject' && 'Reject Leave Application'}
              {confirmAction?.type === 'cancel' && 'Cancel Leave Application'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'approve' &&
                'This will approve the leave application and update the employee\'s leave balance. This action cannot be undone.'}
              {confirmAction?.type === 'reject' &&
                'This will reject the leave application. The employee will be notified.'}
              {confirmAction?.type === 'cancel' &&
                'This will cancel the leave application. The leave balance will remain unchanged.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmAction();
              }}
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
                  {confirmAction?.type === 'approve' && (
                    <>
                      <CheckCircle2 className="mr-2 size-4" />
                      Approve
                    </>
                  )}
                  {confirmAction?.type === 'reject' && (
                    <>
                      <XCircle className="mr-2 size-4" />
                      Reject
                    </>
                  )}
                  {confirmAction?.type === 'cancel' && (
                    <>
                      <Trash2 className="mr-2 size-4" />
                      Cancel Leave
                    </>
                  )}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

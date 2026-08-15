'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckCircle2,
  FilterIcon,
  Leaf,
  ListChecks,
  Loader2,
  Pencil,
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
import { Checkbox } from '@/components/ui/checkbox';
import { useSessionContext } from '@/hooks/session-context';

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
  shortCode: string;
  totalDays: number;
  isCarryForward: boolean;
  maxCarryForward: number;
  isPaid: boolean;
  active: boolean;
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
  totalAllocated: number;
  used: number;
  carryForwarded: number;
  leaveType: LeaveType;
  [key: string]: unknown;
}

// GET /api/leaves/balance returns raw totalAllocated/carryForwarded/used — "available" isn't a
// stored field anywhere, it's always derived at read time.
function availableDays(b: LeaveBalance): number {
  return b.totalAllocated + b.carryForwarded - b.used;
}

const LEAVE_YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current - 2; y <= current + 1; y++) years.push(y);
  return years;
})();

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
  const { user } = useSessionContext();
  const canManageLeavePolicy = user?.role === 'admin' || user?.role === 'hr';

  // ---- Data state ----
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [allBalances, setAllBalances] = useState<LeaveBalance[]>([]);

  // ---- Leave Types management (admin/hr) ----
  const [adminLeaveTypes, setAdminLeaveTypes] = useState<LeaveType[]>([]);
  const [loadingAdminLeaveTypes, setLoadingAdminLeaveTypes] = useState(true);
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);
  const [leaveTypeDialogOpen, setLeaveTypeDialogOpen] = useState(false);
  const [ltName, setLtName] = useState('');
  const [ltShortCode, setLtShortCode] = useState('');
  const [ltTotalDays, setLtTotalDays] = useState('');
  const [ltIsPaid, setLtIsPaid] = useState(true);
  const [ltIsCarryForward, setLtIsCarryForward] = useState(true);
  const [ltMaxCarryForward, setLtMaxCarryForward] = useState('');
  const [ltActive, setLtActive] = useState(true);
  const [savingLeaveType, setSavingLeaveType] = useState(false);

  const [allocatingLeaveType, setAllocatingLeaveType] = useState<LeaveType | null>(null);
  const [allocateYear, setAllocateYear] = useState(String(new Date().getFullYear()));
  const [allocating, setAllocating] = useState(false);

  // ---- Leave Balance manual management (admin/hr) ----
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [editingBalance, setEditingBalance] = useState<LeaveBalance | null>(null);
  const [balEmployeeId, setBalEmployeeId] = useState('');
  const [balLeaveTypeId, setBalLeaveTypeId] = useState('');
  const [balYear, setBalYear] = useState(String(new Date().getFullYear()));
  const [balTotalAllocated, setBalTotalAllocated] = useState('');
  const [balCarryForwarded, setBalCarryForwarded] = useState('');
  const [balUsed, setBalUsed] = useState('');
  const [balReason, setBalReason] = useState('');
  const [savingBalance, setSavingBalance] = useState(false);
  const [deletingBalanceId, setDeletingBalanceId] = useState<string | null>(null);

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
  const [filterLeaveType, setFilterLeaveType] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<number>(() => new Date().getFullYear());

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

  // ---- Computed total days ----
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
      if (filterLeaveType && filterLeaveType !== 'all') {
        params.set('leaveTypeId', filterLeaveType);
      }
      params.set('year', String(filterYear));
      params.set('limit', '200');
      const res = await fetch(`/api/leaves?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch applications');
      const json = await res.json();
      setApplications(json.data ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load leave applications');
    } finally {
      setLoadingApplications(false);
    }
  }, [filterEmployee, filterStatus, filterLeaveType, filterYear]);

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
        `/api/leaves/balance?employeeId=${empId}&year=${filterYear}`
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
  }, [filterEmployee, selectedEmployeeId, filterYear]);

  // ---- Fetch all employees balances ----
  const fetchAllBalances = useCallback(async () => {
    setLoadingAllBalances(true);
    try {
      const allData: LeaveBalance[] = [];
      for (const emp of employees) {
        const res = await fetch(
          `/api/leaves/balance?employeeId=${emp.id}&year=${filterYear}`
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
  }, [employees, filterYear]);

  const filteredAllBalances = useMemo(() => {
    return allBalances.filter((b) => {
      if (filterEmployee !== 'all' && b.employeeId !== filterEmployee) return false;
      if (filterLeaveType !== 'all' && b.leaveTypeId !== filterLeaveType) return false;
      return true;
    });
  }, [allBalances, filterEmployee, filterLeaveType]);

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

  // ---- Leave Types management (admin/hr) ----
  const fetchAdminLeaveTypes = useCallback(async () => {
    setLoadingAdminLeaveTypes(true);
    try {
      const res = await fetch('/api/leave-types?includeInactive=1');
      if (!res.ok) throw new Error('Failed to fetch leave types');
      const json = await res.json();
      setAdminLeaveTypes(json.data ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load leave types');
    } finally {
      setLoadingAdminLeaveTypes(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminLeaveTypes();
  }, [fetchAdminLeaveTypes, refreshKey]);

  const resetLeaveTypeForm = useCallback(() => {
    setLtName('');
    setLtShortCode('');
    setLtTotalDays('');
    setLtIsPaid(true);
    setLtIsCarryForward(true);
    setLtMaxCarryForward('');
    setLtActive(true);
  }, []);

  const openAddLeaveType = () => {
    setEditingLeaveType(null);
    resetLeaveTypeForm();
    setLeaveTypeDialogOpen(true);
  };

  const openEditLeaveType = (lt: LeaveType) => {
    setEditingLeaveType(lt);
    setLtName(lt.name);
    setLtShortCode(lt.shortCode);
    setLtTotalDays(String(lt.totalDays));
    setLtIsPaid(lt.isPaid);
    setLtIsCarryForward(lt.isCarryForward);
    setLtMaxCarryForward(String(lt.maxCarryForward));
    setLtActive(lt.active);
    setLeaveTypeDialogOpen(true);
  };

  const handleSaveLeaveType = async () => {
    if (!ltName.trim() || !ltShortCode.trim() || !ltTotalDays) {
      toast.error('Name, short code, and annual days are required.');
      return;
    }
    setSavingLeaveType(true);
    try {
      const payload = {
        name: ltName.trim(),
        shortCode: ltShortCode.trim().toUpperCase(),
        totalDays: Number(ltTotalDays),
        isPaid: ltIsPaid,
        isCarryForward: ltIsCarryForward,
        maxCarryForward: ltIsCarryForward ? Number(ltMaxCarryForward) || 0 : 0,
        ...(editingLeaveType ? { active: ltActive } : {}),
      };
      const res = await fetch(
        editingLeaveType ? `/api/leave-types/${editingLeaveType.id}` : '/api/leave-types',
        {
          method: editingLeaveType ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save leave type');
      toast.success(editingLeaveType ? 'Leave type updated' : `Leave type "${payload.name}" created`);
      setLeaveTypeDialogOpen(false);
      fetchAdminLeaveTypes();
      fetchLeaveTypes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save leave type');
    } finally {
      setSavingLeaveType(false);
    }
  };

  const handleAllocate = async () => {
    if (!allocatingLeaveType) return;
    setAllocating(true);
    try {
      const res = await fetch(`/api/leave-types/${allocatingLeaveType.id}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(allocateYear) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to allocate balances');
      toast.success(
        `${data.allocated} allocated, ${data.skipped} already existed${data.failed ? `, ${data.failed} failed` : ''} for ${allocatingLeaveType.name} — ${allocateYear}.`
      );
      setAllocatingLeaveType(null);
      fetchAllBalances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to allocate balances');
    } finally {
      setAllocating(false);
    }
  };

  // ---- Leave Balance manual management (admin/hr) ----
  const resetBalanceForm = useCallback(() => {
    setBalEmployeeId('');
    setBalLeaveTypeId('');
    setBalYear(String(new Date().getFullYear()));
    setBalTotalAllocated('');
    setBalCarryForwarded('');
    setBalUsed('');
    setBalReason('');
  }, []);

  const openAddBalance = () => {
    setEditingBalance(null);
    resetBalanceForm();
    setBalanceDialogOpen(true);
  };

  const openEditBalance = (b: LeaveBalance) => {
    setEditingBalance(b);
    setBalTotalAllocated(String(b.totalAllocated));
    setBalCarryForwarded(String(b.carryForwarded));
    setBalUsed(String(b.used));
    setBalReason('');
    setBalanceDialogOpen(true);
  };

  const handleSaveBalance = async () => {
    setSavingBalance(true);
    try {
      if (editingBalance) {
        if (!balReason.trim()) {
          toast.error('A reason is required when adjusting a balance.');
          setSavingBalance(false);
          return;
        }
        const res = await fetch(`/api/leave-balances/${editingBalance.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            totalAllocated: Number(balTotalAllocated),
            carryForwarded: Number(balCarryForwarded),
            used: Number(balUsed),
            reason: balReason.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update balance');
        toast.success('Balance updated');
      } else {
        if (!balEmployeeId || !balLeaveTypeId || !balTotalAllocated) {
          toast.error('Employee, leave type, and total allocated are required.');
          setSavingBalance(false);
          return;
        }
        const res = await fetch('/api/leave-balances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: balEmployeeId,
            leaveTypeId: balLeaveTypeId,
            year: Number(balYear),
            totalAllocated: Number(balTotalAllocated),
            carryForwarded: Number(balCarryForwarded) || 0,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create balance');
        toast.success('Balance created');
      }
      setBalanceDialogOpen(false);
      fetchAllBalances();
      fetchBalances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save balance');
    } finally {
      setSavingBalance(false);
    }
  };

  const handleDeleteBalance = async (b: LeaveBalance) => {
    if (!confirm(`Delete this ${b.leaveType.name} balance? This cannot be undone.`)) return;
    setDeletingBalanceId(b.id);
    try {
      const res = await fetch(`/api/leave-balances/${b.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete balance');
      toast.success('Balance deleted');
      fetchAllBalances();
      fetchBalances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete balance');
    } finally {
      setDeletingBalanceId(null);
    }
  };

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
            Manage leave applications and balances for {filterYear}
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
        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <Label className="text-xs font-medium text-muted-foreground">
            Leave Type
          </Label>
          <Select value={filterLeaveType} onValueChange={setFilterLeaveType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Leave Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leave Types</SelectItem>
              {leaveTypes.map((lt) => (
                <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 min-w-[110px]">
          <Label className="text-xs font-medium text-muted-foreground">
            Year
          </Label>
          <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(parseInt(v, 10))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAVE_YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
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
                const available = availableDays(b);
                const pct =
                  b.totalAllocated > 0
                    ? Math.round((available / b.totalAllocated) * 100)
                    : 0;
                return (
                  <Card
                    key={b.id}
                    className={`min-w-[200px] flex-shrink-0 border-l-4 ${getBalanceBorderColor(available, b.totalAllocated)}`}
                  >
                    <CardHeader className="pb-0 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">
                          {b.leaveType.name}
                        </CardTitle>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {b.leaveType.shortCode}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-2">
                      <div className="mb-2 flex items-baseline justify-between">
                        <span className={`text-2xl font-bold ${getBalanceColor(available, b.totalAllocated)}`}>
                          {available}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          of {b.totalAllocated} days
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        className={`h-2 mb-2 ${getProgressColor(available, b.totalAllocated)}`}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Used: {b.used}</span>
                        {b.carryForwarded > 0 && (
                          <span>Carry Fwd: {b.carryForwarded}</span>
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
          {canManageLeavePolicy && (
            <TabsTrigger value="types">
              <ListChecks className="mr-1.5 size-4" />
              Leave Types
            </TabsTrigger>
          )}
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
                                {app.leaveType.shortCode}
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
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Leave Balances — All Employees
                </CardTitle>
                <CardDescription>
                  Year {filterYear} leave balance overview
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1.5 min-w-[170px]">
                  <Label className="text-xs font-medium text-muted-foreground">Employee</Label>
                  <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                    <SelectTrigger className="w-full h-8 text-xs"><SelectValue placeholder="All Employees" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeCode})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 min-w-[150px]">
                  <Label className="text-xs font-medium text-muted-foreground">Leave Type</Label>
                  <Select value={filterLeaveType} onValueChange={setFilterLeaveType}>
                    <SelectTrigger className="w-full h-8 text-xs"><SelectValue placeholder="All Leave Types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Leave Types</SelectItem>
                      {leaveTypes.map((lt) => (
                        <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 min-w-[100px]">
                  <Label className="text-xs font-medium text-muted-foreground">Year</Label>
                  <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(parseInt(v, 10))}>
                    <SelectTrigger className="w-full h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAVE_YEAR_OPTIONS.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canManageLeavePolicy && (
                  <Button size="sm" className="gap-1.5" onClick={openAddBalance}>
                    <Plus className="size-4" />
                    Add Balance
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingAllBalances ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredAllBalances.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Leaf className="mx-auto mb-2 size-10 opacity-40" />
                  <p className="text-sm">No balance data matches these filters.</p>
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
                        {canManageLeavePolicy && <TableHead className="font-semibold text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAllBalances.map((b) => {
                        const available = availableDays(b);
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {getEmployeeName(b.employeeId)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
                                {b.leaveType.shortCode}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {b.totalAllocated}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {b.used}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              <span className={getBalanceColor(available, b.totalAllocated)}>
                                {available}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {b.carryForwarded > 0 ? b.carryForwarded : '—'}
                            </TableCell>
                            {canManageLeavePolicy && (
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditBalance(b)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-500 hover:text-red-700 disabled:opacity-30"
                                    disabled={b.used > 0 || deletingBalanceId === b.id}
                                    title={b.used > 0 ? 'Cannot delete — leave has already been used against this balance' : 'Delete'}
                                    onClick={() => handleDeleteBalance(b)}
                                  >
                                    {deletingBalanceId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  </Button>
                                </div>
                              </TableCell>
                            )}
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

        {/* ---- Leave Types Tab (admin/hr only) ---- */}
        {canManageLeavePolicy && (
          <TabsContent value="types">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Leave Types</CardTitle>
                  <CardDescription>
                    Configure the leave policies employees can apply against — annual entitlement, paid/unpaid, and carry-forward rules.
                  </CardDescription>
                </div>
                <Button size="sm" className="gap-1.5" onClick={openAddLeaveType}>
                  <Plus className="size-4" />
                  Add Leave Type
                </Button>
              </CardHeader>
              <CardContent>
                {loadingAdminLeaveTypes ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : adminLeaveTypes.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <ListChecks className="mx-auto mb-2 size-10 opacity-40" />
                    <p className="text-sm">No leave types configured yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Name</TableHead>
                          <TableHead className="font-semibold">Code</TableHead>
                          <TableHead className="font-semibold text-right">Annual Days</TableHead>
                          <TableHead className="font-semibold">Carry Forward</TableHead>
                          <TableHead className="font-semibold">Paid</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="font-semibold text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adminLeaveTypes.map((lt) => (
                          <TableRow key={lt.id} className={!lt.active ? 'opacity-50' : ''}>
                            <TableCell className="font-medium">{lt.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-[10px]">{lt.shortCode}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{lt.totalDays}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {lt.isCarryForward ? `Up to ${lt.maxCarryForward}` : 'No'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{lt.isPaid ? 'Paid' : 'Unpaid'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={lt.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'}>
                                {lt.active ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setAllocatingLeaveType(lt)}>
                                  Allocate
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditLeaveType(lt)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
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
        )}
      </Tabs>

      {/* ========== ADD/EDIT LEAVE TYPE DIALOG ========== */}
      <Dialog open={leaveTypeDialogOpen} onOpenChange={(open) => { if (!open) setLeaveTypeDialogOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLeaveType ? 'Edit Leave Type' : 'Add Leave Type'}</DialogTitle>
            <DialogDescription>
              {editingLeaveType
                ? 'Changes here only affect future allocations — existing employee balances are untouched.'
                : 'Add a new leave policy (e.g. Sick Leave, Earned Leave). Employees will need a balance allocated before they can apply.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={ltName} onChange={(e) => setLtName(e.target.value)} placeholder="e.g. Earned Leave" />
              </div>
              <div className="space-y-1.5">
                <Label>Short Code</Label>
                <Input value={ltShortCode} onChange={(e) => setLtShortCode(e.target.value)} placeholder="e.g. EL" maxLength={10} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Annual Entitlement (days)</Label>
              <Input type="number" min={0} step={0.5} value={ltTotalDays} onChange={(e) => setLtTotalDays(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={ltIsPaid} onCheckedChange={(v) => setLtIsPaid(!!v)} />
              Paid leave
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={ltIsCarryForward} onCheckedChange={(v) => setLtIsCarryForward(!!v)} />
              Allow carry-forward to next year
            </label>
            {ltIsCarryForward && (
              <div className="space-y-1.5">
                <Label>Max Carry-Forward (days)</Label>
                <Input type="number" min={0} step={0.5} value={ltMaxCarryForward} onChange={(e) => setLtMaxCarryForward(e.target.value)} />
              </div>
            )}
            {editingLeaveType && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={ltActive} onCheckedChange={(v) => setLtActive(!!v)} />
                Active (visible for new applications/allocations)
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveTypeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveLeaveType} disabled={savingLeaveType} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingLeaveType ? <Loader2 className="size-4 animate-spin" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== ALLOCATE DIALOG ========== */}
      <Dialog open={!!allocatingLeaveType} onOpenChange={(open) => { if (!open) setAllocatingLeaveType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate {allocatingLeaveType?.name}</DialogTitle>
            <DialogDescription>
              Creates a balance for every active employee who doesn&apos;t already have one for the chosen year — pro-rated for anyone who joined mid-year, with carry-forward rolled in from the prior year automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Year</Label>
            <Input type="number" value={allocateYear} onChange={(e) => setAllocateYear(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocatingLeaveType(null)}>Cancel</Button>
            <Button onClick={handleAllocate} disabled={allocating} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {allocating ? <Loader2 className="size-4 animate-spin" /> : null}Allocate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== ADD/EDIT BALANCE DIALOG ========== */}
      <Dialog open={balanceDialogOpen} onOpenChange={(open) => { if (!open) setBalanceDialogOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBalance ? 'Adjust Leave Balance' : 'Add Leave Balance'}</DialogTitle>
            <DialogDescription>
              {editingBalance
                ? `${getEmployeeName(editingBalance.employeeId)} — ${editingBalance.leaveType.name} (${editingBalance.year})`
                : 'Manually create a balance for one employee — for new joiners or one-off corrections outside a bulk allocation.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!editingBalance && (
              <>
                <div className="space-y-1.5">
                  <Label>Employee</Label>
                  <Select value={balEmployeeId} onValueChange={setBalEmployeeId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select employee…" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Leave Type</Label>
                    <Select value={balLeaveTypeId} onValueChange={setBalLeaveTypeId}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {leaveTypes.map((lt) => (
                          <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Year</Label>
                    <Input type="number" value={balYear} onChange={(e) => setBalYear(e.target.value)} />
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Total Allocated</Label>
                <Input type="number" min={0} step={0.5} value={balTotalAllocated} onChange={(e) => setBalTotalAllocated(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Carry Forwarded</Label>
                <Input type="number" min={0} step={0.5} value={balCarryForwarded} onChange={(e) => setBalCarryForwarded(e.target.value)} />
              </div>
            </div>
            {editingBalance && (
              <>
                <div className="space-y-1.5">
                  <Label>Used</Label>
                  <Input type="number" min={0} step={0.5} value={balUsed} onChange={(e) => setBalUsed(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Reason for adjustment <span className="text-red-500">*</span></Label>
                  <Textarea value={balReason} onChange={(e) => setBalReason(e.target.value)} rows={2} placeholder="e.g. correcting a leave cancelled outside the system" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBalance} disabled={savingBalance} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingBalance ? <Loader2 className="size-4 animate-spin" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      {lt.name} ({lt.shortCode})
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

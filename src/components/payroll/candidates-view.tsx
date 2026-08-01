'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { UserPlus, Loader2, Plus, Pencil, LogOut, Search, Eye, Trash2, Download, ChevronLeft, ChevronRight, AlertTriangle, History, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { usePayrollStore } from '@/store/payroll-store';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');
const PAGE_SIZE = 20;

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  permanent: 'FTE',
  contractor: 'Contract',
};

const INCENTIVE_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  eligible: 'bg-blue-100 text-blue-800 border-blue-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  forfeited: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
};

interface EmployeeOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
}

interface HiringIncentiveSummary {
  id: string;
  status: string;
  amount: number;
  payMonth: number;
  payYear: number;
}

interface Candidate {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  client: string | null;
  role: string;
  employmentType: string;
  recruiter: EmployeeOption | null;
  closingDate: string | null;
  dateOfJoining: string;
  probationEndDate: string | null;
  dateOfExit: string | null;
  monthlySalary: number | null;
  annualSalary: number | null;
  billingType: string | null;
  billingValue: number | null;
  billingAmount: number | null;
  paymentReceived: boolean;
  comment: string | null;
  hiringIncentive: HiringIncentiveSummary | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  userEmail: string;
  details: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

const FIELD_LABEL: Record<string, string> = {
  billingType: 'Billing Type',
  billingValue: 'Billing Value',
  paymentReceived: 'Payment Received',
  monthlySalary: 'Monthly Salary',
  annualSalary: 'Annual Salary',
};

function formatHistoryValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'paymentReceived') return value ? 'Received' : 'Pending';
  if (field === 'monthlySalary' || field === 'annualSalary') return fmt(Number(value));
  return String(value);
}

function isProbationEndingSoon(c: { dateOfExit: string | null; probationEndDate: string | null }): boolean {
  if (c.dateOfExit || !c.probationEndDate) return false;
  const end = new Date(c.probationEndDate).getTime();
  const now = Date.now();
  const in30 = now + 30 * 24 * 60 * 60 * 1000;
  return end >= now && end <= in30;
}

function candName(c: { firstName: string; lastName: string | null }) {
  return `${c.firstName} ${c.lastName ?? ''}`.trim();
}

const emptyForm = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  client: '',
  role: '',
  employmentType: 'permanent',
  recruiterId: '',
  closingDate: '',
  dateOfJoining: '',
  probationEndDate: '',
  monthlySalary: '',
  annualSalary: '',
  billingType: 'none',
  billingValue: '',
  paymentReceived: false,
  comment: '',
};

export default function CandidatesView() {
  const { user } = useSessionContext();
  const isAdmin = user?.role === 'admin';
  const { selectedCandidateId, setSelectedCandidateId } = usePayrollStore();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [tab, setTab] = useState<'list' | 'reports'>('list');
  const [reportView, setReportView] = useState<'client' | 'month' | 'recruiter' | 'billing'>('client');
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [endOpen, setEndOpen] = useState(false);
  const [endingCandidate, setEndingCandidate] = useState<Candidate | null>(null);
  const [endDate, setEndDate] = useState('');
  const [ending, setEnding] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewingCandidate, setViewingCandidate] = useState<Candidate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [historyItems, setHistoryItems] = useState<HistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [probationOnly, setProbationOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [markingPaid, setMarkingPaid] = useState(false);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/candidates${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load candidates');
      setCandidates(json.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Reports should always reflect every candidate, regardless of the list's active/ended filter.
  useEffect(() => {
    if (tab !== 'reports') return;
    fetch('/api/candidates?status=all')
      .then((r) => r.json())
      .then((j) => setCandidates(j.data ?? []))
      .catch(() => toast.error('Failed to load candidates'));
  }, [tab]);

  // Reset to page 1 whenever the visible set of candidates could change shape.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [searchQuery, statusFilter, probationOnly]);

  // Fetch this candidate's audit history whenever the View dialog opens on a new candidate.
  useEffect(() => {
    if (!viewOpen || !viewingCandidate) {
      setHistoryItems(null);
      return;
    }
    setHistoryLoading(true);
    fetch(`/api/candidates/${viewingCandidate.id}/history`)
      .then((r) => r.json())
      .then((j) => setHistoryItems(j.data ?? []))
      .catch(() => setHistoryItems([]))
      .finally(() => setHistoryLoading(false));
  }, [viewOpen, viewingCandidate]);

  // Cross-link from the Hiring Incentives screen: if a candidate was chosen there, jump
  // straight to its View dialog here, regardless of the active/ended filter, then clear the
  // pointer so navigating back to this screen later doesn't re-trigger it.
  useEffect(() => {
    if (!selectedCandidateId) return;
    fetch('/api/candidates?status=all')
      .then((r) => r.json())
      .then((j) => {
        const all: Candidate[] = j.data ?? [];
        const found = all.find((c) => c.id === selectedCandidateId);
        if (found) {
          setViewingCandidate(found);
          setViewOpen(true);
        } else {
          toast.error('Candidate not found');
        }
      })
      .catch(() => toast.error('Failed to load candidate'))
      .finally(() => setSelectedCandidateId(null));
  }, [selectedCandidateId, setSelectedCandidateId]);

  const ensureEmployeesLoaded = async () => {
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

  const openAdd = async () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
    await ensureEmployeesLoaded();
  };

  const openEdit = async (c: Candidate) => {
    setEditingId(c.id);
    setForm({
      firstName: c.firstName,
      lastName: c.lastName ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      client: c.client ?? '',
      role: c.role,
      employmentType: c.employmentType,
      recruiterId: c.recruiter?.id ?? '',
      closingDate: c.closingDate ? c.closingDate.split('T')[0] : '',
      dateOfJoining: c.dateOfJoining.split('T')[0],
      probationEndDate: c.probationEndDate ? c.probationEndDate.split('T')[0] : '',
      monthlySalary: c.monthlySalary != null ? String(c.monthlySalary) : '',
      annualSalary: c.annualSalary != null ? String(c.annualSalary) : '',
      billingType: c.billingType ?? 'none',
      billingValue: c.billingValue != null ? String(c.billingValue) : '',
      paymentReceived: c.paymentReceived,
      comment: c.comment ?? '',
    });
    setFormOpen(true);
    await ensureEmployeesLoaded();
  };

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.role.trim() || !form.dateOfJoining) {
      toast.error('First name, role, and date of joining are required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        client: form.client.trim() || null,
        role: form.role.trim(),
        employmentType: form.employmentType,
        recruiterId: form.recruiterId || null,
        closingDate: form.closingDate || null,
        dateOfJoining: form.dateOfJoining,
        probationEndDate: form.probationEndDate || null,
        monthlySalary: form.monthlySalary.trim() ? Number(form.monthlySalary) : null,
        annualSalary: form.annualSalary.trim() ? Number(form.annualSalary) : null,
        billingType: form.billingType === 'none' ? null : form.billingType,
        billingValue: form.billingType !== 'none' && form.billingValue.trim() ? Number(form.billingValue) : null,
        paymentReceived: form.paymentReceived,
        comment: form.comment.trim() || null,
      };
      const url = editingId ? `/api/candidates/${editingId}` : '/api/candidates';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save candidate');
      toast.success(`Candidate ${editingId ? 'updated' : 'added'}`);
      setFormOpen(false);
      fetchCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save candidate');
    } finally {
      setSubmitting(false);
    }
  };

  const openEndPlacement = (c: Candidate) => {
    setEndingCandidate(c);
    setEndDate(new Date().toISOString().split('T')[0]);
    setEndOpen(true);
  };

  const handleEndPlacement = async () => {
    if (!endingCandidate || !endDate) return;
    setEnding(true);
    try {
      const res = await fetch(`/api/candidates/${endingCandidate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateOfExit: endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record end date');
      toast.success('Placement end date recorded');
      setEndOpen(false);
      fetchCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record end date');
    } finally {
      setEnding(false);
    }
  };

  const openView = (c: Candidate) => {
    setViewingCandidate(c);
    setViewOpen(true);
  };

  const handleDelete = async (c: Candidate) => {
    if (!confirm(`Delete ${candName(c)}? This cannot be undone.`)) return;
    setDeletingId(c.id);
    try {
      const res = await fetch(`/api/candidates/${c.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete candidate');
      toast.success('Candidate deleted');
      fetchCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete candidate');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = candidates;
    if (q) {
      result = result.filter(
        (c) => candName(c).toLowerCase().includes(q) || (c.client ?? '').toLowerCase().includes(q)
      );
    }
    if (probationOnly) {
      result = result.filter(isProbationEndingSoon);
    }
    return result;
  }, [candidates, searchQuery, probationOnly]);

  const probationSoonCount = useMemo(
    () => candidates.filter(isProbationEndingSoon).length,
    [candidates]
  );

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / PAGE_SIZE));
  const paginatedCandidates = useMemo(
    () => filteredCandidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredCandidates, page]
  );

  // ─── Report aggregates ──────────────────────────────────────────────
  // "Effective date" for report grouping/filtering: closing date if set, else join date —
  // matches Month-wise's existing convention so a date-range filter behaves consistently
  // across all four views, not just the one that already groups by month.
  const reportCandidates = useMemo(() => {
    if (!reportFromDate && !reportToDate) return candidates;
    const from = reportFromDate ? new Date(reportFromDate).getTime() : -Infinity;
    const to = reportToDate ? new Date(reportToDate).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
    return candidates.filter((c) => {
      const effective = new Date(c.closingDate ?? c.dateOfJoining).getTime();
      return effective >= from && effective <= to;
    });
  }, [candidates, reportFromDate, reportToDate]);

  const byClient = useMemo(() => {
    const map = new Map<string, { count: number; billed: number; received: number }>();
    for (const c of reportCandidates) {
      const key = c.client ?? 'No client on record';
      const row = map.get(key) ?? { count: 0, billed: 0, received: 0 };
      row.count += 1;
      row.billed += c.billingAmount ?? 0;
      if (c.paymentReceived) row.received += c.billingAmount ?? 0;
      map.set(key, row);
    }
    return [...map.entries()].map(([client, row]) => ({ client, ...row })).sort((a, b) => b.billed - a.billed);
  }, [reportCandidates]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { label: string; count: number; billed: number }>();
    for (const c of reportCandidates) {
      const dateStr = c.closingDate ?? c.dateOfJoining;
      const d = new Date(dateStr);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const row = map.get(key) ?? { label, count: 0, billed: 0 };
      row.count += 1;
      row.billed += c.billingAmount ?? 0;
      map.set(key, row);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, row]) => row);
  }, [reportCandidates]);

  const byRecruiter = useMemo(() => {
    const map = new Map<string, { count: number; billed: number }>();
    for (const c of reportCandidates) {
      const key = c.recruiter ? candName(c.recruiter) : 'Unassigned';
      const row = map.get(key) ?? { count: 0, billed: 0 };
      row.count += 1;
      row.billed += c.billingAmount ?? 0;
      map.set(key, row);
    }
    return [...map.entries()].map(([recruiter, row]) => ({ recruiter, ...row })).sort((a, b) => b.count - a.count);
  }, [reportCandidates]);

  const billingRows = useMemo(
    () => reportCandidates.filter((c) => c.billingAmount != null).sort((a, b) => (b.billingAmount ?? 0) - (a.billingAmount ?? 0)),
    [reportCandidates]
  );
  const billingTotals = useMemo(() => {
    const totalBilled = billingRows.reduce((s, c) => s + (c.billingAmount ?? 0), 0);
    const totalReceived = billingRows.filter((c) => c.paymentReceived).reduce((s, c) => s + (c.billingAmount ?? 0), 0);
    return { totalBilled, totalReceived, outstanding: totalBilled - totalReceived };
  }, [billingRows]);

  const handleExportCsv = () => {
    const suffix = reportFromDate || reportToDate ? `_${reportFromDate || 'start'}_to_${reportToDate || 'end'}` : '';
    if (reportView === 'client') {
      downloadCsv(
        `candidates-by-client${suffix}.csv`,
        ['Client', 'Candidates', 'Total Billed', 'Received'],
        byClient.map((r) => [r.client, r.count, r.billed, r.received])
      );
    } else if (reportView === 'month') {
      downloadCsv(
        `candidates-by-month${suffix}.csv`,
        ['Month', 'Candidates', 'Total Billed'],
        byMonth.map((r) => [r.label, r.count, r.billed])
      );
    } else if (reportView === 'recruiter') {
      downloadCsv(
        `candidates-by-recruiter${suffix}.csv`,
        ['Recruiter', 'Closures', 'Total Billed'],
        byRecruiter.map((r) => [r.recruiter, r.count, r.billed])
      );
    } else {
      downloadCsv(
        `candidates-billing${suffix}.csv`,
        ['Candidate', 'Client', 'Billing Type', 'Amount', 'Payment Status'],
        billingRows.map((c) => [
          candName(c),
          c.client ?? '',
          c.billingType === 'percentage' ? `${c.billingValue}% of CTC` : 'Flat',
          c.billingAmount ?? 0,
          c.paymentReceived ? 'Received' : 'Pending',
        ])
      );
    }
    toast.success('CSV downloaded');
  };

  const handleExportListCsv = () => {
    const headers = [
      'Name', 'Client', 'Role', 'Type', 'Recruiter', 'Closing Date', 'Date of Joining',
      'Probation End Date', 'Placement End Date', 'Monthly Salary', 'Annual Salary',
      ...(isAdmin ? ['Billing Type', 'Billing Amount', 'Payment Status'] : []),
      'Status', 'Incentive Status',
    ];
    const rows = filteredCandidates.map((c) => [
      candName(c),
      c.client ?? '',
      c.role,
      EMPLOYMENT_TYPE_LABEL[c.employmentType] ?? c.employmentType,
      c.recruiter ? candName(c.recruiter) : '',
      c.closingDate ? new Date(c.closingDate).toLocaleDateString('en-IN') : '',
      new Date(c.dateOfJoining).toLocaleDateString('en-IN'),
      c.probationEndDate ? new Date(c.probationEndDate).toLocaleDateString('en-IN') : '',
      c.dateOfExit ? new Date(c.dateOfExit).toLocaleDateString('en-IN') : '',
      c.monthlySalary ?? '',
      c.annualSalary ?? '',
      ...(isAdmin
        ? [
            c.billingType === 'percentage' ? `${c.billingValue}% of CTC` : c.billingType === 'flat' ? 'Flat' : '',
            c.billingAmount ?? '',
            c.billingAmount != null ? (c.paymentReceived ? 'Received' : 'Pending') : '',
          ]
        : []),
      c.dateOfExit ? 'Ended' : 'Active',
      c.hiringIncentive ? c.hiringIncentive.status : 'None',
    ]);
    downloadCsv(`candidates${statusFilter !== 'all' ? `-${statusFilter}` : ''}.csv`, headers, rows);
    toast.success('CSV downloaded');
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = paginatedCandidates.map((c) => c.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleMarkSelectedPaid = async () => {
    if (selectedIds.size === 0) return;
    setMarkingPaid(true);
    try {
      const res = await fetch('/api/candidates/bulk-payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: [...selectedIds] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update payments');
      toast.success(
        `Marked ${data.updated} candidate${data.updated === 1 ? '' : 's'} as paid` +
          (data.skipped > 0 ? ` (${data.skipped} skipped — no unpaid billing charge)` : '')
      );
      setSelectedIds(new Set());
      fetchCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update payments');
    } finally {
      setMarkingPaid(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Candidates</h1>
            <p className="text-sm text-muted-foreground">
              Contract and full-time candidates placed with clients — separate from in-house payroll employees
            </p>
          </div>
        </div>
        {tab === 'list' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or client..."
                className="pl-8 w-[220px]"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="ended">Ended</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExportListCsv}>
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openAdd}>
              <Plus className="size-4" />
              Add Candidate
            </Button>
          </div>
        )}
      </div>

      {tab === 'list' && probationSoonCount > 0 && (
        <button
          onClick={() => setProbationOnly((v) => !v)}
          className={`w-full flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm text-left transition-colors ${
            probationOnly
              ? 'bg-amber-100 border-amber-300 text-amber-900'
              : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
          }`}
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <strong>{probationSoonCount}</strong> active candidate{probationSoonCount === 1 ? '' : 's'} with probation ending in the
            next 30 days.
          </span>
          <span className="ml-auto text-xs font-medium underline">{probationOnly ? 'Clear filter' : 'Show only these'}</span>
        </button>
      )}

      {isAdmin && (
        <div className="flex gap-2 border-b">
          {(['list', 'reports'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'list' ? 'Candidates' : 'Reports'}
            </button>
          ))}
        </div>
      )}

      {tab === 'list' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Candidates</CardTitle>
              <CardDescription>Name, client, role, billing, and placement dates</CardDescription>
            </div>
            {isAdmin && selectedIds.size > 0 && (
              <Button size="sm" onClick={handleMarkSelectedPaid} disabled={markingPaid} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {markingPaid ? <Loader2 className="size-4 animate-spin" /> : <IndianRupee className="size-4" />}
                Mark {selectedIds.size} as Paid
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6"><Skeleton className="h-32 w-full" /></div>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No candidates on record yet.</p>
            ) : filteredCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No candidates match &quot;{searchQuery}&quot;.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdmin && (
                        <TableHead className="w-8">
                          <Checkbox
                            checked={paginatedCandidates.length > 0 && paginatedCandidates.every((c) => selectedIds.has(c.id))}
                            onCheckedChange={toggleSelectAllOnPage}
                            aria-label="Select all on page"
                          />
                        </TableHead>
                      )}
                      <TableHead>Name</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Recruiter</TableHead>
                      <TableHead>Closed</TableHead>
                      <TableHead>Joined</TableHead>
                      {isAdmin && <TableHead className="text-right">Billing</TableHead>}
                      {isAdmin && <TableHead>Payment</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead>Incentive</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCandidates.map((c) => (
                      <TableRow key={c.id} className={isProbationEndingSoon(c) ? 'bg-amber-50' : undefined}>
                        {isAdmin && (
                          <TableCell>
                            <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelected(c.id)} aria-label={`Select ${candName(c)}`} />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">
                          {candName(c)}
                          {isProbationEndingSoon(c) && (
                            <AlertTriangle className="inline-block ml-1.5 size-3.5 text-amber-600 align-text-top" />
                          )}
                        </TableCell>
                        <TableCell>{c.client ?? '—'}</TableCell>
                        <TableCell>{c.role}</TableCell>
                        <TableCell>{EMPLOYMENT_TYPE_LABEL[c.employmentType] ?? c.employmentType}</TableCell>
                        <TableCell>{c.recruiter ? candName(c.recruiter) : '—'}</TableCell>
                        <TableCell>{c.closingDate ? new Date(c.closingDate).toLocaleDateString('en-IN') : '—'}</TableCell>
                        <TableCell>{new Date(c.dateOfJoining).toLocaleDateString('en-IN')}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">{c.billingAmount != null ? fmt(c.billingAmount) : '—'}</TableCell>
                        )}
                        {isAdmin && (
                          <TableCell>
                            {c.billingAmount == null ? (
                              '—'
                            ) : c.paymentReceived ? (
                              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">Received</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          {c.dateOfExit ? (
                            <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">Ended</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.hiringIncentive ? (
                            <Badge variant="outline" className={INCENTIVE_STATUS_BADGE[c.hiringIncentive.status] ?? ''}>
                              {c.hiringIncentive.status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="size-7" onClick={() => openView(c)}>
                              <Eye className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(c)}>
                              <Pencil className="size-4" />
                            </Button>
                            {!c.dateOfExit && (
                              <Button variant="ghost" size="icon" className="size-7 text-amber-600" onClick={() => openEndPlacement(c)}>
                                <LogOut className="size-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-red-500"
                              disabled={deletingId === c.id}
                              onClick={() => handleDelete(c)}
                            >
                              {deletingId === c.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
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
          {filteredCandidates.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCandidates.length)} of {filteredCandidates.length}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {isAdmin && tab === 'reports' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={reportView} onValueChange={(v) => setReportView(v as typeof reportView)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client-wise</SelectItem>
                <SelectItem value="month">Month-wise</SelectItem>
                <SelectItem value="recruiter">Recruiter-wise</SelectItem>
                <SelectItem value="billing">Billing-wise</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 text-sm">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={reportFromDate} onChange={(e) => setReportFromDate(e.target.value)} className="w-[150px]" />
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={reportToDate} onChange={(e) => setReportToDate(e.target.value)} className="w-[150px]" />
              {(reportFromDate || reportToDate) && (
                <Button variant="ghost" size="sm" onClick={() => { setReportFromDate(''); setReportToDate(''); }}>Clear</Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="ml-auto">
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>

          {reportView === 'client' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Client-wise</CardTitle><CardDescription>Candidates and billing totals per client</CardDescription></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Client</TableHead><TableHead className="text-right">Candidates</TableHead><TableHead className="text-right">Total Billed</TableHead><TableHead className="text-right">Received</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {byClient.map((r) => (
                        <TableRow key={r.client}>
                          <TableCell>{r.client}</TableCell>
                          <TableCell className="text-right">{r.count}</TableCell>
                          <TableCell className="text-right">{fmt(r.billed)}</TableCell>
                          <TableCell className="text-right text-emerald-700">{fmt(r.received)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {reportView === 'month' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Month-wise</CardTitle><CardDescription>Grouped by closing month (falls back to joining month if no closing date is set)</CardDescription></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Month</TableHead><TableHead className="text-right">Candidates</TableHead><TableHead className="text-right">Total Billed</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {byMonth.map((r) => (
                        <TableRow key={r.label}>
                          <TableCell>{r.label}</TableCell>
                          <TableCell className="text-right">{r.count}</TableCell>
                          <TableCell className="text-right">{fmt(r.billed)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {reportView === 'recruiter' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recruiter-wise</CardTitle><CardDescription>Closures and billing generated per recruiter</CardDescription></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Recruiter</TableHead><TableHead className="text-right">Closures</TableHead><TableHead className="text-right">Total Billed</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {byRecruiter.map((r) => (
                        <TableRow key={r.recruiter}>
                          <TableCell>{r.recruiter}</TableCell>
                          <TableCell className="text-right">{r.count}</TableCell>
                          <TableCell className="text-right">{fmt(r.billed)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {reportView === 'billing' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-slate-600 font-medium">Total Billed</p>
                  <p className="text-lg font-bold text-slate-800">{fmt(billingTotals.totalBilled)}</p>
                </div>
                <div className="rounded-lg border bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-600 font-medium">Received</p>
                  <p className="text-lg font-bold text-emerald-800">{fmt(billingTotals.totalReceived)}</p>
                </div>
                <div className="rounded-lg border bg-amber-50 p-3">
                  <p className="text-xs text-amber-600 font-medium">Outstanding</p>
                  <p className="text-lg font-bold text-amber-800">{fmt(billingTotals.outstanding)}</p>
                </div>
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Candidate</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Billing Type</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billingRows.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>{candName(c)}</TableCell>
                            <TableCell>{c.client ?? '—'}</TableCell>
                            <TableCell>{c.billingType === 'percentage' ? `${c.billingValue}% of CTC` : 'Flat'}</TableCell>
                            <TableCell className="text-right">{fmt(c.billingAmount ?? 0)}</TableCell>
                            <TableCell>
                              {c.paymentReceived ? (
                                <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">Received</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="font-semibold">
                          <TableCell colSpan={3}>Total</TableCell>
                          <TableCell className="text-right">{fmt(billingTotals.totalBilled)}</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open && !submitting) setFormOpen(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Candidate' : 'Add Candidate'}</DialogTitle>
            <DialogDescription>No payroll/PF/ESI/bank fields, since this candidate isn&apos;t an in-house payroll employee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name *</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="e.g. Acme Corp" />
              </div>
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Senior Engineer" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Employment Type *</Label>
                <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">Full-Time (FTE)</SelectItem>
                    <SelectItem value="contractor">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Recruiter</Label>
                <Select value={form.recruiterId || 'none'} onValueChange={(v) => setForm({ ...form, recruiterId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select recruiter..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{candName(e)} ({e.employeeCode})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Closing Date</Label>
                <Input type="date" value={form.closingDate} onChange={(e) => setForm({ ...form, closingDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Date of Joining *</Label>
                <Input type="date" value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Probation End Date</Label>
                <Input type="date" value={form.probationEndDate} onChange={(e) => setForm({ ...form, probationEndDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monthly Salary</Label>
                <Input type="number" min="0" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} placeholder="e.g. 45000" />
              </div>
              <div className="space-y-1.5">
                <Label>Annual Salary (CTC)</Label>
                <Input type="number" min="0" value={form.annualSalary} onChange={(e) => setForm({ ...form, annualSalary: e.target.value })} placeholder="e.g. 540000" />
              </div>
            </div>
            {isAdmin && (
              <div className="rounded-lg border p-3 space-y-3">
                <Label className="text-sm font-medium">Client Billing (one-time placement fee)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Select value={form.billingType} onValueChange={(v) => setForm({ ...form, billingType: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No billing charge</SelectItem>
                      <SelectItem value="percentage">Percentage of CTC</SelectItem>
                      <SelectItem value="flat">Flat amount</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.billingType !== 'none' && (
                    <Input
                      type="number"
                      min="0"
                      value={form.billingValue}
                      onChange={(e) => setForm({ ...form, billingValue: e.target.value })}
                      placeholder={form.billingType === 'percentage' ? 'e.g. 8.33 (%)' : 'e.g. 50000 (₹)'}
                    />
                  )}
                </div>
                {form.billingType !== 'none' && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="paymentReceived"
                      checked={form.paymentReceived}
                      onCheckedChange={(v) => setForm({ ...form, paymentReceived: !!v })}
                    />
                    <Label htmlFor="paymentReceived" className="cursor-pointer font-normal">Payment received from client</Label>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Comment / Notes</Label>
              <Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSave} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End placement dialog */}
      <Dialog open={endOpen} onOpenChange={(open) => { if (!open && !ending) setEndOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>End Placement</DialogTitle>
            <DialogDescription>
              Records when {endingCandidate ? candName(endingCandidate) : 'this candidate'}&apos;s placement/contract ended. If a hiring incentive is still pending for them, this may affect its eligibility.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>End Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndOpen(false)} disabled={ending}>Cancel</Button>
            <Button onClick={handleEndPlacement} disabled={ending} className="bg-amber-600 hover:bg-amber-700 text-white">
              {ending ? <Loader2 className="size-4 animate-spin" /> : null}
              Record End Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View (read-only) dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {viewingCandidate && (
            <>
              <DialogHeader>
                <DialogTitle>{candName(viewingCandidate)}</DialogTitle>
                <DialogDescription>{viewingCandidate.role} · {viewingCandidate.client ?? 'No client on record'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <DetailRow label="Phone" value={viewingCandidate.phone ?? '—'} />
                  <DetailRow label="Email" value={viewingCandidate.email ?? '—'} />
                  <DetailRow label="Employment Type" value={EMPLOYMENT_TYPE_LABEL[viewingCandidate.employmentType] ?? viewingCandidate.employmentType} />
                  <DetailRow label="Recruiter" value={viewingCandidate.recruiter ? candName(viewingCandidate.recruiter) : '—'} />
                  <DetailRow label="Closing Date" value={viewingCandidate.closingDate ? new Date(viewingCandidate.closingDate).toLocaleDateString('en-IN') : '—'} />
                  <DetailRow label="Date of Joining" value={new Date(viewingCandidate.dateOfJoining).toLocaleDateString('en-IN')} />
                  <DetailRow label="Probation End Date" value={viewingCandidate.probationEndDate ? new Date(viewingCandidate.probationEndDate).toLocaleDateString('en-IN') : '—'} />
                  <DetailRow label="Placement End Date" value={viewingCandidate.dateOfExit ? new Date(viewingCandidate.dateOfExit).toLocaleDateString('en-IN') : '—'} />
                  <DetailRow label="Monthly Salary" value={viewingCandidate.monthlySalary != null ? fmt(viewingCandidate.monthlySalary) : '—'} />
                  <DetailRow label="Annual Salary (CTC)" value={viewingCandidate.annualSalary != null ? fmt(viewingCandidate.annualSalary) : '—'} />
                </div>

                {isAdmin && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Client Billing</p>
                    <div className="grid grid-cols-2 gap-3">
                      <DetailRow
                        label="Type"
                        value={viewingCandidate.billingType === 'percentage' ? `${viewingCandidate.billingValue}% of CTC` : viewingCandidate.billingType === 'flat' ? 'Flat amount' : 'None'}
                      />
                      <DetailRow label="Amount" value={viewingCandidate.billingAmount != null ? fmt(viewingCandidate.billingAmount) : '—'} />
                    </div>
                    {viewingCandidate.billingAmount != null && (
                      <Badge variant="outline" className={viewingCandidate.paymentReceived ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}>
                        {viewingCandidate.paymentReceived ? 'Payment Received' : 'Payment Pending'}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hiring Incentive</p>
                  {viewingCandidate.hiringIncentive ? (
                    <div className="flex items-center justify-between">
                      <span>{fmt(viewingCandidate.hiringIncentive.amount)} — {MONTHS[viewingCandidate.hiringIncentive.payMonth - 1]} {viewingCandidate.hiringIncentive.payYear}</span>
                      <Badge variant="outline" className={INCENTIVE_STATUS_BADGE[viewingCandidate.hiringIncentive.status] ?? ''}>
                        {viewingCandidate.hiringIncentive.status}
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No hiring incentive scheduled for this candidate.</p>
                  )}
                </div>

                {viewingCandidate.comment && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Comment</p>
                    <p className="text-sm">{viewingCandidate.comment}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <History className="size-3.5" />
                    Change History
                  </p>
                  {historyLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : !historyItems || historyItems.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No changes recorded yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {historyItems.map((h) => (
                        <div key={h.id} className="rounded-lg border p-2.5 text-xs space-y-1">
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>{h.userEmail} · {h.action}</span>
                            <span>{new Date(h.createdAt).toLocaleString('en-IN')}</span>
                          </div>
                          {h.details && Object.keys(h.details).length > 0 ? (
                            <ul className="space-y-0.5">
                              {Object.entries(h.details).map(([field, change]) => (
                                <li key={field}>
                                  <span className="font-medium">{FIELD_LABEL[field] ?? field}:</span>{' '}
                                  {formatHistoryValue(field, change.from)} → {formatHistoryValue(field, change.to)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted-foreground italic">No field-level detail recorded.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
                <Button onClick={() => { setViewOpen(false); openEdit(viewingCandidate); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Pencil className="size-4" />
                  Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

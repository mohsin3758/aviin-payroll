'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Settings,
  Building2,
  Shield,
  CalendarClock,
  Save,
  Loader2,
  CheckCircle2,
  Info,
  Landmark,
  Banknote,
  FileCheck,
  Users,
  KeyRound,
  UserPlus,
  Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePayrollStore } from '@/store/payroll-store';
import { useSessionContext } from '@/hooks/session-context';
import { ScrollText, CalendarDays, Trash2, PlusCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CompanySettings {
  name: string;
  address: string;
  pan: string;
  tan: string;
  gstin: string;
  pfNumber: string;
  esiNumber: string;
  state: string;
  financialYearStart: string;
  payrollMonth: string;
  payrollYear: string;
  weeklyOffDays: number[];
}

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Component ─────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
}

type UserRole = 'admin' | 'hr' | 'manager' | 'employee';

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800 border-red-200',
  hr: 'bg-violet-100 text-violet-800 border-violet-200',
  manager: 'bg-blue-100 text-blue-800 border-blue-200',
  employee: 'bg-slate-100 text-slate-800 border-slate-200',
};

export default function SettingsView() {
  const { refreshKey } = usePayrollStore();
  const { user } = useSessionContext();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchAuditLogs = useCallback(async () => {
    if (user?.role !== 'admin') return;
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/audit-log?page=${auditPage}&limit=20`);
      if (!res.ok) throw new Error('Failed to load audit log');
      const json = await res.json();
      setAuditLogs(json.data ?? []);
      setAuditTotalPages(json.totalPages ?? 1);
    } catch {
      toast.error('Failed to load audit log');
    } finally {
      setAuditLoading(false);
    }
  }, [user?.role, auditPage]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs, refreshKey]);

  const [form, setForm] = useState<CompanySettings>({
    name: '',
    address: '',
    pan: '',
    tan: '',
    gstin: '',
    pfNumber: '',
    esiNumber: '',
    state: '',
    financialYearStart: '',
    payrollMonth: '',
    payrollYear: '',
    weeklyOffDays: [0],
  });

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const json = await res.json();
      setForm(json.data as CompanySettings);
    } catch {
      toast.error('Failed to load company settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings, refreshKey]);

  // ─── Holidays ─────────────────────────────────────────────────────────────
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [addingHoliday, setAddingHoliday] = useState(false);

  const fetchHolidays = useCallback(async () => {
    setHolidaysLoading(true);
    try {
      const res = await fetch(`/api/holidays?year=${new Date().getFullYear()}`);
      if (!res.ok) throw new Error('Failed to load holidays');
      const json = await res.json();
      setHolidays(json.data ?? []);
    } catch {
      toast.error('Failed to load company holidays');
    } finally {
      setHolidaysLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays, refreshKey]);

  const handleAddHoliday = async () => {
    if (!newHolidayName.trim() || !newHolidayDate) {
      toast.error('Holiday name and date are required.');
      return;
    }
    setAddingHoliday(true);
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newHolidayName.trim(), date: newHolidayDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add holiday');
      toast.success(`Holiday "${newHolidayName.trim()}" added — applies to all employees.`);
      setNewHolidayName('');
      setNewHolidayDate('');
      fetchHolidays();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add holiday');
    } finally {
      setAddingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from the company calendar? This affects payroll for every employee.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete holiday');
      toast.success('Holiday removed');
      fetchHolidays();
    } catch {
      toast.error('Failed to delete holiday');
    }
  };

  const toggleWeeklyOffDay = (day: number) => {
    setForm((prev) => ({
      ...prev,
      weeklyOffDays: prev.weeklyOffDays.includes(day)
        ? prev.weeklyOffDays.filter((d) => d !== day)
        : [...prev.weeklyOffDays, day].sort(),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      toast.success('Company settings saved successfully.');
    } catch {
      toast.error('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof CompanySettings, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ─── New Regime Slabs ────────────────────────────────────────────────────────

  const newRegimeSlabs = [
    { range: 'Up to ₹4,00,000', rate: 'Nil' },
    { range: '₹4,00,001 – ₹8,00,000', rate: '5%' },
    { range: '₹8,00,001 – ₹12,00,000', rate: '10%' },
    { range: '₹12,00,001 – ₹16,00,000', rate: '15%' },
    { range: '₹16,00,001 – ₹20,00,000', rate: '20%' },
    { range: '₹20,00,001 – ₹24,00,000', rate: '25%' },
    { range: 'Above ₹24,00,000', rate: '30%' },
  ];

  const oldRegimeSlabs = [
    { range: 'Up to ₹2,50,000', rate: 'Nil' },
    { range: '₹2,50,001 – ₹5,00,000', rate: '5%' },
    { range: '₹5,00,001 – ₹10,00,000', rate: '20%' },
    { range: 'Above ₹10,00,000', rate: '30%' },
  ];

  // ─── Users: change own password ──────────────────────────────────────────────

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangeMyPassword = async () => {
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');

      toast.success('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  // ─── Users: admin management ─────────────────────────────────────────────────

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (user?.role !== 'admin') return;
    setUsersLoading(true);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to load users');
      const json = await res.json();
      setUsers(json.data ?? []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers, refreshKey]);

  const handleToggleActive = async (target: ManagedUser) => {
    setTogglingUserId(target.id);
    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !target.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');

      toast.success(`${target.name} ${target.active ? 'deactivated' : 'reactivated'}.`);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setTogglingUserId(null);
    }
  };

  // Add user dialog
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('employee');
  const [creatingUser, setCreatingUser] = useState(false);

  const handleCreateUser = async () => {
    if (!newUserEmail.trim() || !newUserName.trim()) {
      toast.error('Name and email are required.');
      return;
    }
    if (newUserPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setCreatingUser(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail.trim(),
          name: newUserName.trim(),
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      toast.success(`User "${newUserName.trim()}" created.`);
      setAddUserOpen(false);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserPassword('');
      setNewUserRole('employee');
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  // Reset password dialog
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (resetPasswordValue.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    setResettingPassword(true);
    try {
      const res = await fetch(`/api/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPasswordValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      toast.success(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
      setResetPasswordValue('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Company Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage company information and compliance references
          </p>
        </div>
      </div>

      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company" className="gap-1.5">
            <Building2 className="size-4" />
            Company
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="size-4" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6">

      {/* ─── 1. Company Information ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-600" />
            <CardTitle>Company Information</CardTitle>
          </div>
          <CardDescription>
            Configure your company details and statutory registration numbers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* Company Name */}
              <div className="space-y-1.5">
                <Label htmlFor="company-name" className="text-xs font-medium">Company Name</Label>
                <Input
                  id="company-name"
                  placeholder="e.g. Acme India Pvt. Ltd."
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>

              {/* Address */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="address" className="text-xs font-medium">Address</Label>
                <Input
                  id="address"
                  placeholder="Registered office address"
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                />
              </div>

              {/* PAN */}
              <div className="space-y-1.5">
                <Label htmlFor="pan" className="text-xs font-medium">PAN</Label>
                <Input
                  id="pan"
                  placeholder="e.g. AABCA1234A"
                  maxLength={10}
                  className="uppercase"
                  value={form.pan}
                  onChange={(e) => updateField('pan', e.target.value.toUpperCase())}
                />
              </div>

              {/* TAN */}
              <div className="space-y-1.5">
                <Label htmlFor="tan" className="text-xs font-medium">TAN</Label>
                <Input
                  id="tan"
                  placeholder="e.g. DELA12345A"
                  maxLength={10}
                  className="uppercase"
                  value={form.tan}
                  onChange={(e) => updateField('tan', e.target.value.toUpperCase())}
                />
              </div>

              {/* GSTIN */}
              <div className="space-y-1.5">
                <Label htmlFor="gstin" className="text-xs font-medium">GSTIN</Label>
                <Input
                  id="gstin"
                  placeholder="e.g. 07AABCA1234A1Z5"
                  maxLength={15}
                  className="uppercase"
                  value={form.gstin}
                  onChange={(e) => updateField('gstin', e.target.value.toUpperCase())}
                />
              </div>

              {/* PF Number */}
              <div className="space-y-1.5">
                <Label htmlFor="pf-number" className="text-xs font-medium">PF Number</Label>
                <Input
                  id="pf-number"
                  placeholder="e.g. MHBAN0012345000"
                  value={form.pfNumber}
                  onChange={(e) => updateField('pfNumber', e.target.value.toUpperCase())}
                />
              </div>

              {/* ESI Number */}
              <div className="space-y-1.5">
                <Label htmlFor="esi-number" className="text-xs font-medium">ESI Number</Label>
                <Input
                  id="esi-number"
                  placeholder="e.g. 31-00-123456-000-0001"
                  value={form.esiNumber}
                  onChange={(e) => updateField('esiNumber', e.target.value.toUpperCase())}
                />
              </div>

              {/* State */}
              <div className="space-y-1.5">
                <Label htmlFor="state" className="text-xs font-medium">State</Label>
                <Select value={form.state} onValueChange={(v) => updateField('state', v)}>
                  <SelectTrigger id="state" className="w-full">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Financial Year Start */}
              <div className="space-y-1.5">
                <Label htmlFor="fy-start" className="text-xs font-medium">Financial Year Start</Label>
                <Input
                  id="fy-start"
                  type="date"
                  value={form.financialYearStart}
                  onChange={(e) => updateField('financialYearStart', e.target.value)}
                />
              </div>

              <Separator className="md:col-span-2 my-1" />

              {/* Current Payroll Month */}
              <div className="space-y-1.5">
                <Label htmlFor="payroll-month" className="text-xs font-medium">Current Payroll Month</Label>
                <Select value={form.payrollMonth} onValueChange={(v) => updateField('payrollMonth', v)}>
                  <SelectTrigger id="payroll-month" className="w-full">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Current Payroll Year */}
              <div className="space-y-1.5">
                <Label htmlFor="payroll-year" className="text-xs font-medium">Current Payroll Year</Label>
                <Input
                  id="payroll-year"
                  type="number"
                  min={2020}
                  max={2035}
                  value={form.payrollYear}
                  onChange={(e) => updateField('payrollYear', e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t bg-muted/30 px-6 py-4">
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-emerald-600 text-white hover:bg-emerald-700 gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Settings
          </Button>
        </CardFooter>
      </Card>

      {/* ─── 2. Statutory Compliance Reference ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            <CardTitle>Statutory Compliance Reference</CardTitle>
          </div>
          <CardDescription>
            Read-only reference for Indian payroll statutory rates and slabs (FY 2025-26).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" defaultValue={['pf', 'esi', 'tds', 'pt', 'lwf']} className="w-full">
            {/* PF */}
            <AccordionItem value="pf">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">PF</Badge>
                  <span>Provident Fund (EPF & MP Act, 1952)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="rounded-lg border bg-emerald-50/50 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Employee PF</p>
                          <p className="text-sm font-bold">12%</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Employer PF</p>
                          <p className="text-sm font-bold">12% (3.67% EPF + 8.33% EPS + 0.5% EDLI)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                          <Landmark className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">EPS (8.33%)</p>
                          <p className="text-sm font-bold">Capped at ₹15,000</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                          <Banknote className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Wage Ceiling</p>
                          <p className="text-sm font-bold">{fmt(15000)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Employer&apos;s 12% contribution is split into: EPF (3.67%), EPS pension fund (8.33% capped at ₹15,000 wages), and EDLI (0.5%).
                    Administrative charges of 0.85% (EDLIS) + 0.01% (EDLI admin) are additional.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ESI */}
            <AccordionItem value="esi">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-100 text-orange-800 border-orange-200">ESI</Badge>
                  <span>Employee State Insurance (ESI Act, 1948)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="rounded-lg border bg-orange-50/50 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Employee ESI</p>
                          <p className="text-sm font-bold">0.75%</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Employer ESI</p>
                          <p className="text-sm font-bold">3.25%</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
                          <Banknote className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Wage Ceiling</p>
                          <p className="text-sm font-bold">{fmt(21000)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ESI is applicable to employees with gross monthly wages up to {fmt(21000)}.
                    PWD employees have a higher ceiling of {fmt(25000)}.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* TDS */}
            <AccordionItem value="tds">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Badge className="bg-violet-100 text-violet-800 border-violet-200">TDS</Badge>
                  <span>Income Tax — Section 192 (FY 2025-26)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-5">
                  {/* New Regime */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">New Tax Regime</Badge>
                      <span className="text-sm font-medium">FY 2025-26 (Default Regime)</span>
                    </div>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-violet-50/60 hover:bg-violet-50/60">
                            <TableHead>Income Slab</TableHead>
                            <TableHead className="text-right w-[100px]">Tax Rate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {newRegimeSlabs.map((slab) => (
                            <TableRow key={slab.range}>
                              <TableCell className="font-medium text-sm">{slab.range}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{slab.rate}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5 rounded-md border bg-emerald-50 px-3 py-1.5 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Standard Deduction: <strong>{fmt(75000)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-md border bg-emerald-50 px-3 py-1.5 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Rebate u/s 87A: <strong>{fmt(60000)}</strong> (if total income ≤ ₹12L)</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Old Regime */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="secondary" className="text-xs">Old Tax Regime</Badge>
                      <span className="text-sm font-medium">FY 2025-26 (Opt-in Required)</span>
                    </div>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableHead>Income Slab</TableHead>
                            <TableHead className="text-right w-[100px]">Tax Rate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {oldRegimeSlabs.map((slab) => (
                            <TableRow key={slab.range}>
                              <TableCell className="font-medium text-sm">{slab.range}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{slab.rate}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Old regime allows deductions under 80C, 80D, HRA, LTA, etc. Standard deduction: ₹50,000. Rebate u/s 87A: ₹12,500 (income up to ₹5L).
                    </p>
                  </div>

                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Health & Education Cess of 4% is applicable on the total income tax calculated.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Professional Tax */}
            <AccordionItem value="pt">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Badge className="bg-rose-100 text-rose-800 border-rose-200">PT</Badge>
                  <span>Professional Tax</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="rounded-lg border bg-rose-50/50 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700">
                          <Landmark className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Maximum PT / Year</p>
                          <p className="text-sm font-bold">{fmt(2500)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700">
                          <Info className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Applicability</p>
                          <p className="text-sm font-bold">State-specific</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Professional Tax is levied by state governments. Maximum of {fmt(2500)} per annum.
                    Not applicable in all states (exempt in Delhi, Haryana, Rajasthan, etc.).
                    Salary slab varies by state. Typically deducted monthly.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* LWF */}
            <AccordionItem value="lwf">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200">LWF</Badge>
                  <span>Labour Welfare Fund</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="rounded-lg border bg-cyan-50/50 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-700">
                          <Banknote className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Contribution</p>
                          <p className="text-sm font-bold">State-specific amounts</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border bg-white p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-700">
                          <Info className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Applicable States</p>
                          <p className="text-sm font-bold">16 states</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Labour Welfare Fund contributions vary by state and are typically collected half-yearly or annually.
                    Applicable states include: Karnataka, Maharashtra, Gujarat, Tamil Nadu, Kerala, Andhra Pradesh, Telangana,
                    Madhya Pradesh, West Bengal, Punjab, Haryana, Uttar Pradesh, Bihar, Odisha, Chhattisgarh, and Delhi.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* ─── 3. Due Dates Calendar ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-emerald-600" />
            <CardTitle>Due Dates Calendar</CardTitle>
          </div>
          <CardDescription>
            Statutory compliance due dates for monthly deposits and filings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* PF */}
            <div className="relative overflow-hidden rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">PF</Badge>
                  <p className="text-sm font-semibold text-foreground">Provident Fund</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <FileCheck className="h-5 w-5" />
                </div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Deposit Due</span>
                  <span className="text-sm font-bold text-emerald-700">15th of following month</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Return Filing</span>
                  <span className="text-sm font-semibold text-foreground">25th of following month</span>
                </div>
              </div>
            </div>

            {/* ESI */}
            <div className="relative overflow-hidden rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <Badge className="bg-orange-100 text-orange-800 border-orange-200">ESI</Badge>
                  <p className="text-sm font-semibold text-foreground">Employee State Insurance</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                  <FileCheck className="h-5 w-5" />
                </div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Deposit Due</span>
                  <span className="text-sm font-bold text-orange-700">15th of following month</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Return Filing</span>
                  <span className="text-sm font-semibold text-foreground">12th of following month</span>
                </div>
              </div>
            </div>

            {/* TDS */}
            <div className="relative overflow-hidden rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <Badge className="bg-violet-100 text-violet-800 border-violet-200">TDS</Badge>
                  <p className="text-sm font-semibold text-foreground">Tax Deducted at Source</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                  <FileCheck className="h-5 w-5" />
                </div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Deposit Due</span>
                  <span className="text-sm font-bold text-violet-700">7th of following month</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Quarterly Return</span>
                  <span className="text-sm font-semibold text-foreground">31st May / Jul / Oct / Jan</span>
                </div>
              </div>
            </div>

            {/* PT */}
            <div className="relative overflow-hidden rounded-lg border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <Badge className="bg-rose-100 text-rose-800 border-rose-200">PT</Badge>
                  <p className="text-sm font-semibold text-foreground">Professional Tax</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  <FileCheck className="h-5 w-5" />
                </div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Deposit Due</span>
                  <span className="text-sm font-bold text-rose-700">Varies by state</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Return Filing</span>
                  <span className="text-sm font-semibold text-foreground">Typically 31st January</span>
                </div>
              </div>
            </div>

            {/* LWF */}
            <div className="relative overflow-hidden rounded-lg border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200">LWF</Badge>
                  <p className="text-sm font-semibold text-foreground">Labour Welfare Fund</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                  <FileCheck className="h-5 w-5" />
                </div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Deposit Due</span>
                  <span className="text-sm font-bold text-cyan-700">Varies by state</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Frequency</span>
                  <span className="text-sm font-semibold text-foreground">Half-yearly / Annually</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Company Calendar: Weekly Off + Holidays ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            Company Calendar
          </CardTitle>
          <CardDescription>
            Weekly off days and holidays apply automatically to every employee&apos;s attendance and payroll — no manual marking needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Weekly Off Days */}
          <div>
            <Label className="text-xs font-medium">Weekly Off Days</Label>
            <div className="mt-2 flex flex-wrap gap-3">
              {DAY_NAMES.map((dayName, idx) => (
                <label key={idx} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.weeklyOffDays.includes(idx)}
                    onCheckedChange={() => toggleWeeklyOffDay(idx)}
                    disabled={user?.role !== 'admin'}
                  />
                  {dayName}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Saved along with the rest of Company Settings — click Save below.</p>
          </div>

          <Separator />

          {/* Holidays list */}
          <div>
            <Label className="text-xs font-medium">Holidays ({new Date().getFullYear()})</Label>
            {user?.role !== 'employee' && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Holiday name (e.g. Diwali)"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  className="sm:max-w-xs"
                />
                <Input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="sm:max-w-[180px]"
                />
                <Button size="sm" onClick={handleAddHoliday} disabled={addingHoliday} className="gap-1.5">
                  <PlusCircle className="h-4 w-4" />
                  Add Holiday
                </Button>
              </div>
            )}

            <div className="mt-3 divide-y rounded-lg border">
              {holidaysLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : holidays.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No holidays configured yet.</div>
              ) : (
                holidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-medium">{h.name}</span>{' '}
                      <span className="text-muted-foreground">
                        — {new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                      </span>
                      {h.type === 'optional' && <Badge variant="outline" className="ml-2 text-[10px]">Optional</Badge>}
                    </div>
                    {user?.role !== 'employee' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDeleteHoliday(h.id, h.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log (admin only) */}
      {user?.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4 text-slate-500" />
              Audit Log
            </CardTitle>
            <CardDescription>Recent create/update/delete/login activity across the system</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : auditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        No audit log entries yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-xs">{log.userEmail ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{log.action}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{log.entity}{log.entityId ? ` (${log.entityId.slice(0, 8)}…)` : ''}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={log.details ?? ''}>{log.details ?? '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between border-t px-6 py-3">
            <Button variant="outline" size="sm" disabled={auditPage <= 1} onClick={() => setAuditPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {auditPage} of {auditTotalPages}</span>
            <Button variant="outline" size="sm" disabled={auditPage >= auditTotalPages} onClick={() => setAuditPage((p) => p + 1)}>
              Next
            </Button>
          </CardFooter>
        </Card>
      )}

        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          {/* ─── Change My Password ──────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-emerald-600" />
                Change My Password
              </CardTitle>
              <CardDescription>Update the password for your own account ({user?.email})</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                />
              </div>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={changingPassword || !currentPassword || !newPassword}
                onClick={handleChangeMyPassword}
              >
                {changingPassword ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Change Password
              </Button>
            </CardContent>
          </Card>

          {/* ─── Manage Users (admin only) ───────────────────────────────────── */}
          {user?.role === 'admin' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-emerald-600" />
                    Manage Users
                  </CardTitle>
                  <CardDescription>Create logins and control access for your team</CardDescription>
                </div>
                <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setAddUserOpen(true)}>
                    <UserPlus className="h-4 w-4" />
                    Add User
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add User</DialogTitle>
                      <DialogDescription>Create a new login for a team member.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="new-user-name">Name</Label>
                        <Input id="new-user-name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-user-email">Email</Label>
                        <Input id="new-user-email" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-user-password">Password</Label>
                        <Input id="new-user-password" type="password" autoComplete="new-password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-user-role">Role</Label>
                        <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as UserRole)}>
                          <SelectTrigger id="new-user-role" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="hr">HR</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddUserOpen(false)} disabled={creatingUser}>
                        Cancel
                      </Button>
                      <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreateUser} disabled={creatingUser}>
                        {creatingUser ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                        Create User
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : users.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                            No users found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">
                              {u.name}
                              {u.id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                            </TableCell>
                            <TableCell className="text-xs">{u.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`${ROLE_BADGE[u.role]} capitalize`}>{u.role}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={u.active ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                                {u.active ? 'Active' : 'Deactivated'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button variant="ghost" size="sm" onClick={() => { setResetTarget(u); setResetPasswordValue(''); }}>
                                  <KeyRound className="size-3.5 mr-1" />
                                  Reset Password
                                </Button>
                                {u.id !== user?.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={u.active ? 'text-red-600 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-700'}
                                    disabled={togglingUserId === u.id}
                                    onClick={() => handleToggleActive(u)}
                                  >
                                    {togglingUserId === u.id ? (
                                      <Loader2 className="size-3.5 mr-1 animate-spin" />
                                    ) : (
                                      <Ban className="size-3.5 mr-1" />
                                    )}
                                    {u.active ? 'Deactivate' : 'Reactivate'}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Reset Password Dialog ───────────────────────────────────────── */}
          <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>
                  Set a new password for {resetTarget?.name} ({resetTarget?.email}). They will need to use it on their next login.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="reset-password-value">New Password</Label>
                <Input
                  id="reset-password-value"
                  type="password"
                  autoComplete="new-password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resettingPassword}>
                  Cancel
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleResetPassword} disabled={resettingPassword}>
                  {resettingPassword ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                  Reset Password
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}


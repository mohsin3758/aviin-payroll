'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Link2,
  UserPlus,
  Ban,
  Mail,
  Send,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePayrollStore } from '@/store/payroll-store';
import { useSessionContext } from '@/hooks/session-context';
import { findLikelyHeaderRowIndex, guessFieldForHeader } from '@/lib/bank-format';
import { ScrollText, CalendarDays, Trash2, PlusCircle, Pencil, Upload, ArrowUp, ArrowDown, FileSpreadsheet, Clock, MessageCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

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
  category: string;
}

const HOLIDAY_CATEGORY_LABEL: Record<string, string> = {
  national: 'National',
  festival: 'Festival',
  other: 'Other',
};

const CALENDAR_YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current - 2; y <= current + 3; y++) years.push(y);
  return years;
})();

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  gracePeriodMinutes: number;
}

interface OfficeLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
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
  employeeId: string | null;
  employee: { firstName: string; lastName: string | null; employeeCode: string } | null;
  createdAt: string;
  _count?: { payrollFeatures: number; payrollEmployeeScopes: number };
}

const PAYROLL_FEATURES = [
  "process_payroll", "view_payroll", "download_bank_file", "manage_arrears",
  "manage_loans", "send_payslips", "manage_form16", "view_reports", "manage_hiring_incentives",
  "view_employees", "create_employee", "edit_employee", "manage_employee_assets",
  "manage_onboarding", "view_assets", "manage_exit_management", "manage_leave_management",
  "manage_wfh",
] as const;
type PayrollFeature = (typeof PAYROLL_FEATURES)[number];

const PAYROLL_FEATURE_LABELS: Record<PayrollFeature, string> = {
  process_payroll: "Process payroll",
  view_payroll: "View payroll runs & salary slips",
  download_bank_file: "Download bank file",
  manage_arrears: "Manage arrears",
  manage_loans: "Manage loans",
  send_payslips: "Send salary slips",
  manage_form16: "Manage Form 16",
  view_reports: "View reports",
  manage_hiring_incentives: "Manage hiring incentives",
  view_employees: "View employees",
  create_employee: "Add employees",
  edit_employee: "Edit employees",
  manage_employee_assets: "Manage employee assets",
  manage_onboarding: "Manage onboarding",
  view_assets: "View asset inventory",
  manage_exit_management: "Manage exit requests",
  manage_leave_management: "Manage leave",
  manage_wfh: "Manage WFH requests",
};

const FEATURE_GROUPS: { label: string; features: PayrollFeature[] }[] = [
  { label: "Payroll & Hiring Incentives", features: ["process_payroll", "view_payroll", "download_bank_file", "manage_arrears", "manage_loans", "send_payslips", "manage_form16", "view_reports", "manage_hiring_incentives"] },
  { label: "Employees", features: ["view_employees", "create_employee", "edit_employee", "manage_employee_assets"] },
  { label: "Onboarding", features: ["manage_onboarding"] },
  { label: "Assets", features: ["view_assets"] },
  { label: "Exit Management", features: ["manage_exit_management"] },
  { label: "Leave Management", features: ["manage_leave_management"] },
  { label: "WFH Management", features: ["manage_wfh"] },
];

interface LinkableEmployee {
  id: string;
  firstName: string;
  lastName: string | null;
  employeeCode: string;
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

  // ─── SMTP (Email) ─────────────────────────────────────────────────────────
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const fetchSmtpSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const json = await res.json();
      setSmtpHost(json.data.smtpHost ?? '');
      setSmtpPort(json.data.smtpPort ? String(json.data.smtpPort) : '587');
      setSmtpSecure(!!json.data.smtpSecure);
      setSmtpUser(json.data.smtpUser ?? '');
      setSmtpFrom(json.data.smtpFrom ?? '');
      setSmtpPasswordSet(!!json.data.smtpPasswordSet);
    } catch {
      // non-critical; the main fetchSettings() call already surfaces a toast on failure
    }
  }, []);

  useEffect(() => {
    fetchSmtpSettings();
  }, [fetchSmtpSettings, refreshKey]);

  const handleSaveSmtp = async () => {
    if (!smtpHost.trim()) {
      toast.error('SMTP host is required.');
      return;
    }
    setSavingSmtp(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 587,
          smtpSecure,
          smtpUser: smtpUser.trim() || null,
          ...(smtpPassword.trim() ? { smtpPassword: smtpPassword.trim() } : {}),
          smtpFrom: smtpFrom.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save SMTP settings');
      toast.success('SMTP settings saved — emails will now send through your own mail server.');
      setSmtpPassword('');
      setSmtpPasswordSet(!!data.data.smtpPasswordSet);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save SMTP settings');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress.trim()) {
      toast.error('Enter an email address to send the test to.');
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmailAddress.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send test email');
      toast.success(`Test email sent to ${testEmailAddress.trim()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  // ─── WhatsApp (Meta Cloud API) ──────────────────────────────────────────────
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('');
  const [whatsappAccessToken, setWhatsappAccessToken] = useState('');
  const [whatsappAccessTokenSet, setWhatsappAccessTokenSet] = useState(false);
  const [whatsappLeaveApprovalTemplate, setWhatsappLeaveApprovalTemplate] = useState('leave_approved');
  const [whatsappTemplateLanguage, setWhatsappTemplateLanguage] = useState('en_US');
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [testWhatsappNumber, setTestWhatsappNumber] = useState('');
  const [sendingWhatsappTest, setSendingWhatsappTest] = useState(false);

  const fetchWhatsappSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const json = await res.json();
      setWhatsappEnabled(!!json.data.whatsappEnabled);
      setWhatsappPhoneNumberId(json.data.whatsappPhoneNumberId ?? '');
      setWhatsappAccessTokenSet(!!json.data.whatsappAccessTokenSet);
      setWhatsappLeaveApprovalTemplate(json.data.whatsappLeaveApprovalTemplate ?? 'leave_approved');
      setWhatsappTemplateLanguage(json.data.whatsappTemplateLanguage ?? 'en_US');
    } catch {
      // non-critical; the main fetchSettings() call already surfaces a toast on failure
    }
  }, []);

  useEffect(() => {
    fetchWhatsappSettings();
  }, [fetchWhatsappSettings, refreshKey]);

  const handleSaveWhatsapp = async () => {
    if (whatsappEnabled && !whatsappPhoneNumberId.trim()) {
      toast.error('Phone Number ID is required to enable WhatsApp.');
      return;
    }
    setSavingWhatsapp(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsappEnabled,
          whatsappPhoneNumberId: whatsappPhoneNumberId.trim() || null,
          ...(whatsappAccessToken.trim() ? { whatsappAccessToken: whatsappAccessToken.trim() } : {}),
          whatsappLeaveApprovalTemplate: whatsappLeaveApprovalTemplate.trim() || 'leave_approved',
          whatsappTemplateLanguage: whatsappTemplateLanguage.trim() || 'en_US',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save WhatsApp settings');
      toast.success('WhatsApp settings saved.');
      setWhatsappAccessToken('');
      setWhatsappAccessTokenSet(!!data.data.whatsappAccessTokenSet);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save WhatsApp settings');
    } finally {
      setSavingWhatsapp(false);
    }
  };

  const handleSendTestWhatsapp = async () => {
    if (!testWhatsappNumber.trim()) {
      toast.error('Enter a 10-digit mobile number to send the test to.');
      return;
    }
    setSendingWhatsappTest(true);
    try {
      const res = await fetch('/api/settings/test-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testWhatsappNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send test WhatsApp message');
      toast.success(`Test WhatsApp message sent to ${testWhatsappNumber.trim()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send test WhatsApp message');
    } finally {
      setSendingWhatsappTest(false);
    }
  };

  // ─── Office Location, Geofencing & Login-based Attendance ──────────────────
  const [officeLatitude, setOfficeLatitude] = useState('');
  const [officeLongitude, setOfficeLongitude] = useState('');
  const [geofenceRadiusMeters, setGeofenceRadiusMeters] = useState('200');
  const [enforceGeofence, setEnforceGeofence] = useState(false);
  const [enableLoginAttendance, setEnableLoginAttendance] = useState(false);
  const [enableLogoutAttendance, setEnableLogoutAttendance] = useState(false);
  const [allowFacePunch, setAllowFacePunch] = useState(true);
  const [allowManualPunch, setAllowManualPunch] = useState(true);
  const [requireFaceLogin, setRequireFaceLogin] = useState(false);
  const [savingGeofence, setSavingGeofence] = useState(false);

  const fetchGeofenceSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const json = await res.json();
      setOfficeLatitude(json.data.officeLatitude != null ? String(json.data.officeLatitude) : '');
      setOfficeLongitude(json.data.officeLongitude != null ? String(json.data.officeLongitude) : '');
      setGeofenceRadiusMeters(json.data.geofenceRadiusMeters != null ? String(json.data.geofenceRadiusMeters) : '200');
      setEnforceGeofence(!!json.data.enforceGeofence);
      setEnableLoginAttendance(!!json.data.enableLoginAttendance);
      setEnableLogoutAttendance(!!json.data.enableLogoutAttendance);
      setAllowFacePunch(json.data.allowFacePunch !== false);
      setAllowManualPunch(json.data.allowManualPunch !== false);
      setRequireFaceLogin(!!json.data.requireFaceLogin);
    } catch {
      // non-critical; the main fetchSettings() call already surfaces a toast on failure
    }
  }, []);

  useEffect(() => {
    fetchGeofenceSettings();
  }, [fetchGeofenceSettings, refreshKey]);

  const handleSaveGeofence = async () => {
    const lat = officeLatitude.trim() ? Number(officeLatitude) : null;
    const lon = officeLongitude.trim() ? Number(officeLongitude) : null;
    if ((lat == null) !== (lon == null)) {
      toast.error('Set both latitude and longitude, or leave both blank.');
      return;
    }
    setSavingGeofence(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officeLatitude: lat,
          officeLongitude: lon,
          geofenceRadiusMeters: geofenceRadiusMeters.trim() ? Number(geofenceRadiusMeters) : null,
          enforceGeofence,
          enableLoginAttendance,
          enableLogoutAttendance,
          allowFacePunch,
          allowManualPunch,
          requireFaceLogin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save location settings');
      toast.success('Office location & attendance settings saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save location settings');
    } finally {
      setSavingGeofence(false);
    }
  };

  // ─── Bank Transfer Formats ───────────────────────────────────────────────────
  interface BankFormatColumn {
    order: number;
    header: string;
    source: 'field' | 'fixed';
    field?: string;
    fixedValue?: string;
  }
  interface BankFormat {
    id: string;
    name: string;
    isDefault: boolean;
    sampleFileName: string | null;
    columns: BankFormatColumn[];
  }
  const BANK_FORMAT_FIELD_OPTIONS: { value: string; label: string }[] = [
    { value: 'employeeCode', label: 'Employee Code' },
    { value: 'beneficiaryName', label: 'Beneficiary Name' },
    { value: 'bankName', label: 'Bank Name' },
    { value: 'accountNumber', label: 'Account Number' },
    { value: 'ifsc', label: 'IFSC Code' },
    { value: 'amount', label: 'Net Amount' },
    { value: 'narration', label: 'Narration' },
  ];

  const [bankFormats, setBankFormats] = useState<BankFormat[]>([]);
  const [bankFormatsLoading, setBankFormatsLoading] = useState(false);
  const [bfDialogOpen, setBfDialogOpen] = useState(false);
  const [bfEditingId, setBfEditingId] = useState<string | null>(null);
  const [bfName, setBfName] = useState('');
  const [bfIsDefault, setBfIsDefault] = useState(false);
  const [bfColumns, setBfColumns] = useState<BankFormatColumn[]>([]);
  const [bfSampleFile, setBfSampleFile] = useState<File | null>(null);
  const [savingBankFormat, setSavingBankFormat] = useState(false);
  const [deletingBankFormatId, setDeletingBankFormatId] = useState<string | null>(null);
  const [sampleParsedRows, setSampleParsedRows] = useState<string[][] | null>(null);
  const [sampleHeaderRowIdx, setSampleHeaderRowIdx] = useState<number | null>(null);
  const [parsingSample, setParsingSample] = useState(false);

  const fetchBankFormats = useCallback(async () => {
    if (user?.role !== 'admin' && user?.role !== 'hr') return;
    setBankFormatsLoading(true);
    try {
      const res = await fetch('/api/bank-formats');
      if (!res.ok) throw new Error('Failed to load bank formats');
      const json = await res.json();
      setBankFormats(json.data ?? []);
    } catch {
      toast.error('Failed to load bank formats');
    } finally {
      setBankFormatsLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    fetchBankFormats();
  }, [fetchBankFormats, refreshKey]);

  const openAddBankFormat = () => {
    setBfEditingId(null);
    setBfName('');
    setBfIsDefault(bankFormats.length === 0);
    setBfColumns([{ order: 0, header: '', source: 'field', field: 'accountNumber' }]);
    setBfSampleFile(null);
    setSampleParsedRows(null);
    setSampleHeaderRowIdx(null);
    setBfDialogOpen(true);
  };

  const openEditBankFormat = (format: BankFormat) => {
    setBfEditingId(format.id);
    setBfName(format.name);
    setBfIsDefault(format.isDefault);
    setBfColumns(format.columns.map((c, i) => ({ ...c, order: i })));
    setBfSampleFile(null);
    setSampleParsedRows(null);
    setSampleHeaderRowIdx(null);
    setBfDialogOpen(true);
  };

  const handleSampleFileSelected = async (file: File | null) => {
    setBfSampleFile(file);
    setSampleParsedRows(null);
    setSampleHeaderRowIdx(null);
    if (!file) return;
    setParsingSample(true);
    try {
      const form = new FormData();
      form.set('sampleFile', file);
      const res = await fetch('/api/bank-formats/parse-sample', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read that file');
      const rows: string[][] = data.data.rows;
      setSampleParsedRows(rows);
      const guessedIdx = rows.length > 0 ? findLikelyHeaderRowIndex(rows) : null;
      setSampleHeaderRowIdx(guessedIdx);
      if (guessedIdx !== null) {
        // Let the preview table render first, then scroll its guessed row into view —
        // otherwise the panel defaults to showing the top of a long instructions banner
        // and the highlighted row is invisible until the admin scrolls to find it.
        setTimeout(() => {
          document.getElementById(`bf-preview-row-${guessedIdx}`)?.scrollIntoView({ block: 'center' });
        }, 50);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read that file');
    } finally {
      setParsingSample(false);
    }
  };

  const applyDetectedColumns = (rowIdx: number) => {
    if (!sampleParsedRows || !sampleParsedRows[rowIdx]) return;
    const headerRow = sampleParsedRows[rowIdx];
    const detected: BankFormatColumn[] = headerRow
      .map((cell) => (cell ?? '').trim())
      .filter((cell) => cell.length > 0)
      .map((header, i) => {
        const guessed = guessFieldForHeader(header);
        return guessed
          ? { order: i, header, source: 'field' as const, field: guessed }
          : { order: i, header, source: 'fixed' as const, fixedValue: '' };
      });
    if (detected.length === 0) {
      toast.error('That row looks empty — pick a different row.');
      return;
    }
    setBfColumns(detected);
    const matchedCount = detected.filter((c) => c.source === 'field').length;
    toast.success(`Filled in ${detected.length} column(s) — ${matchedCount} auto-matched. Review them below before saving.`);
  };

  const addBfColumn = () => {
    setBfColumns((prev) => [...prev, { order: prev.length, header: '', source: 'field', field: 'accountNumber' }]);
  };
  const removeBfColumn = (idx: number) => {
    setBfColumns((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, order: i })));
  };
  const moveBfColumn = (idx: number, direction: -1 | 1) => {
    setBfColumns((prev) => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((c, i) => ({ ...c, order: i }));
    });
  };
  const updateBfColumn = (idx: number, updates: Partial<BankFormatColumn>) => {
    setBfColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...updates } : c)));
  };

  const handleSaveBankFormat = async () => {
    if (!bfName.trim()) {
      toast.error('Give this bank format a name.');
      return;
    }
    if (bfColumns.length === 0 || bfColumns.some((c) => !c.header.trim())) {
      toast.error('Every column needs a header, and at least one column is required.');
      return;
    }
    setSavingBankFormat(true);
    try {
      const form = new FormData();
      form.set('name', bfName.trim());
      form.set('isDefault', String(bfIsDefault));
      form.set('columns', JSON.stringify(bfColumns));
      if (bfSampleFile) form.set('sampleFile', bfSampleFile);

      const url = bfEditingId ? `/api/bank-formats/${bfEditingId}` : '/api/bank-formats';
      const res = await fetch(url, { method: bfEditingId ? 'PUT' : 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save bank format');
      toast.success(`Bank format "${bfName.trim()}" saved.`);
      setBfDialogOpen(false);
      fetchBankFormats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save bank format');
    } finally {
      setSavingBankFormat(false);
    }
  };

  const handleDeleteBankFormat = async (id: string) => {
    setDeletingBankFormatId(id);
    try {
      const res = await fetch(`/api/bank-formats/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete bank format');
      toast.success('Bank format deleted.');
      fetchBankFormats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete bank format');
    } finally {
      setDeletingBankFormatId(null);
    }
  };

  // ─── Holidays ─────────────────────────────────────────────────────────────
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [holidayPeriodMode, setHolidayPeriodMode] = useState<'calendar' | 'fy'>('calendar');
  const [holidayPeriodYear, setHolidayPeriodYear] = useState(() => new Date().getFullYear());
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayType, setNewHolidayType] = useState<'holiday' | 'optional'>('holiday');
  const [newHolidayCategory, setNewHolidayCategory] = useState<'national' | 'festival' | 'other'>('other');
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [holidayFilterCategory, setHolidayFilterCategory] = useState<'all' | 'national' | 'festival' | 'other'>('all');
  const [holidayFilterType, setHolidayFilterType] = useState<'all' | 'holiday' | 'optional'>('all');

  const fetchHolidays = useCallback(async () => {
    setHolidaysLoading(true);
    try {
      const query = holidayPeriodMode === 'fy' ? `fyStartYear=${holidayPeriodYear}` : `year=${holidayPeriodYear}`;
      const res = await fetch(`/api/holidays?${query}`);
      if (!res.ok) throw new Error('Failed to load holidays');
      const json = await res.json();
      setHolidays(json.data ?? []);
    } catch {
      toast.error('Failed to load company holidays');
    } finally {
      setHolidaysLoading(false);
    }
  }, [holidayPeriodMode, holidayPeriodYear]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays, refreshKey]);

  const holidayTotals = useMemo(() => {
    const byCategory: Record<string, number> = { national: 0, festival: 0, other: 0 };
    let optionalCount = 0;
    for (const h of holidays) {
      byCategory[h.category] = (byCategory[h.category] ?? 0) + 1;
      if (h.type === 'optional') optionalCount += 1;
    }
    return { total: holidays.length, byCategory, optionalCount };
  }, [holidays]);

  // holidayTotals above always reflects the full period regardless of these filters — only the
  // list below narrows, matching the "badge shows the whole count, list shows the subset" pattern.
  const filteredHolidays = useMemo(() => {
    return holidays.filter((h) => {
      if (holidayFilterCategory !== 'all' && h.category !== holidayFilterCategory) return false;
      if (holidayFilterType !== 'all' && h.type !== holidayFilterType) return false;
      return true;
    });
  }, [holidays, holidayFilterCategory, holidayFilterType]);

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
        body: JSON.stringify({
          name: newHolidayName.trim(),
          date: newHolidayDate,
          type: newHolidayType,
          category: newHolidayCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add holiday');
      toast.success(`Holiday "${newHolidayName.trim()}" added — applies to all employees.`);
      setNewHolidayName('');
      setNewHolidayDate('');
      setNewHolidayType('holiday');
      setNewHolidayCategory('other');
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

  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [editHolidayName, setEditHolidayName] = useState('');
  const [editHolidayDate, setEditHolidayDate] = useState('');
  const [editHolidayType, setEditHolidayType] = useState<'holiday' | 'optional'>('holiday');
  const [editHolidayCategory, setEditHolidayCategory] = useState<'national' | 'festival' | 'other'>('other');
  const [savingHoliday, setSavingHoliday] = useState(false);

  const openEditHoliday = (h: Holiday) => {
    setEditingHoliday(h);
    setEditHolidayName(h.name);
    setEditHolidayDate(h.date.slice(0, 10));
    setEditHolidayType(h.type === 'optional' ? 'optional' : 'holiday');
    setEditHolidayCategory((h.category as 'national' | 'festival' | 'other') || 'other');
  };

  const handleSaveEditHoliday = async () => {
    if (!editingHoliday) return;
    setSavingHoliday(true);
    try {
      const res = await fetch(`/api/holidays/${editingHoliday.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editHolidayName.trim(),
          date: editHolidayDate,
          type: editHolidayType,
          category: editHolidayCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update holiday');
      toast.success('Holiday updated');
      setEditingHoliday(null);
      fetchHolidays();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update holiday');
    } finally {
      setSavingHoliday(false);
    }
  };

  // ─── Shifts ───────────────────────────────────────────────────────────────
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('09:00');
  const [newShiftEnd, setNewShiftEnd] = useState('18:00');
  const [newShiftGrace, setNewShiftGrace] = useState('15');
  const [addingShift, setAddingShift] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editShiftName, setEditShiftName] = useState('');
  const [editShiftStart, setEditShiftStart] = useState('');
  const [editShiftEnd, setEditShiftEnd] = useState('');
  const [editShiftGrace, setEditShiftGrace] = useState('');
  const [savingShift, setSavingShift] = useState(false);

  const fetchShifts = useCallback(async () => {
    setShiftsLoading(true);
    try {
      const res = await fetch('/api/shifts');
      if (!res.ok) throw new Error('Failed to load shifts');
      const json = await res.json();
      setShifts(json.data ?? []);
    } catch {
      toast.error('Failed to load shifts');
    } finally {
      setShiftsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts, refreshKey]);

  const handleAddShift = async () => {
    if (!newShiftName.trim()) {
      toast.error('Shift name is required.');
      return;
    }
    setAddingShift(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newShiftName.trim(), startTime: newShiftStart, endTime: newShiftEnd, gracePeriodMinutes: newShiftGrace }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add shift');
      toast.success(`Shift "${newShiftName.trim()}" created`);
      setNewShiftName(''); setNewShiftStart('09:00'); setNewShiftEnd('18:00'); setNewShiftGrace('15');
      fetchShifts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add shift');
    } finally {
      setAddingShift(false);
    }
  };

  const openEditShift = (s: Shift) => {
    setEditingShift(s);
    setEditShiftName(s.name);
    setEditShiftStart(s.startTime);
    setEditShiftEnd(s.endTime);
    setEditShiftGrace(String(s.gracePeriodMinutes));
  };

  const handleSaveEditShift = async () => {
    if (!editingShift) return;
    setSavingShift(true);
    try {
      const res = await fetch(`/api/shifts/${editingShift.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editShiftName.trim(), startTime: editShiftStart, endTime: editShiftEnd, gracePeriodMinutes: editShiftGrace }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update shift');
      toast.success('Shift updated');
      setEditingShift(null);
      fetchShifts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update shift');
    } finally {
      setSavingShift(false);
    }
  };

  const handleDeleteShift = async (id: string, name: string) => {
    if (!confirm(`Delete the "${name}" shift? This only works if no employee is currently assigned to it.`)) return;
    try {
      const res = await fetch(`/api/shifts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete shift');
      toast.success('Shift deleted');
      fetchShifts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete shift');
    }
  };

  // ─── Branch Office Locations ────────────────────────────────────────────────
  const [officeLocations, setOfficeLocations] = useState<OfficeLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationLat, setNewLocationLat] = useState('');
  const [newLocationLon, setNewLocationLon] = useState('');
  const [newLocationRadius, setNewLocationRadius] = useState('200');
  const [addingLocation, setAddingLocation] = useState(false);
  const [editingLocation, setEditingLocation] = useState<OfficeLocation | null>(null);
  const [editLocationName, setEditLocationName] = useState('');
  const [editLocationLat, setEditLocationLat] = useState('');
  const [editLocationLon, setEditLocationLon] = useState('');
  const [editLocationRadius, setEditLocationRadius] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  const fetchOfficeLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const res = await fetch('/api/office-locations');
      if (!res.ok) throw new Error('Failed to load branch offices');
      const json = await res.json();
      setOfficeLocations(json.data ?? []);
    } catch {
      toast.error('Failed to load branch offices');
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOfficeLocations();
  }, [fetchOfficeLocations, refreshKey]);

  const handleAddLocation = async () => {
    if (!newLocationName.trim() || !newLocationLat.trim() || !newLocationLon.trim()) {
      toast.error('Name, latitude, and longitude are required.');
      return;
    }
    setAddingLocation(true);
    try {
      const res = await fetch('/api/office-locations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLocationName.trim(), latitude: newLocationLat, longitude: newLocationLon, radiusMeters: newLocationRadius }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add branch office');
      toast.success(`"${newLocationName.trim()}" added`);
      setNewLocationName(''); setNewLocationLat(''); setNewLocationLon(''); setNewLocationRadius('200');
      fetchOfficeLocations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add branch office');
    } finally {
      setAddingLocation(false);
    }
  };

  const openEditLocation = (l: OfficeLocation) => {
    setEditingLocation(l);
    setEditLocationName(l.name);
    setEditLocationLat(String(l.latitude));
    setEditLocationLon(String(l.longitude));
    setEditLocationRadius(String(l.radiusMeters));
  };

  const handleSaveEditLocation = async () => {
    if (!editingLocation) return;
    setSavingLocation(true);
    try {
      const res = await fetch(`/api/office-locations/${editingLocation.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editLocationName.trim(), latitude: editLocationLat, longitude: editLocationLon, radiusMeters: editLocationRadius }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update branch office');
      toast.success('Branch office updated');
      setEditingLocation(null);
      fetchOfficeLocations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update branch office');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleDeleteLocation = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This only works if no employee is currently assigned to it.`)) return;
    try {
      const res = await fetch(`/api/office-locations/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete branch office');
      toast.success('Branch office deleted');
      fetchOfficeLocations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete branch office');
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
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

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

  // ─── Users: link an existing login to an Employee record ────────────────────
  // For a user created via Add User (no linking step), rather than Activate ESS Portal.
  const [allEmployees, setAllEmployees] = useState<LinkableEmployee[]>([]);
  const [linkTarget, setLinkTarget] = useState<ManagedUser | null>(null);
  const [linkEmployeeId, setLinkEmployeeId] = useState('');
  const [linkingUser, setLinkingUser] = useState(false);

  const fetchAllEmployees = useCallback(async () => {
    if (user?.role !== 'admin') return;
    try {
      const res = await fetch('/api/employees?limit=200');
      if (!res.ok) return;
      const json = await res.json();
      setAllEmployees(json.data ?? []);
    } catch {
      // non-critical — the link dialog just shows an empty list if this fails
    }
  }, [user?.role]);

  useEffect(() => {
    fetchAllEmployees();
  }, [fetchAllEmployees, refreshKey]);

  const linkedEmployeeIds = useMemo(() => new Set(users.filter((u) => u.employeeId).map((u) => u.employeeId)), [users]);
  const unlinkedEmployees = useMemo(() => allEmployees.filter((e) => !linkedEmployeeIds.has(e.id)), [allEmployees, linkedEmployeeIds]);

  const openLinkDialog = (target: ManagedUser) => {
    setLinkTarget(target);
    setLinkEmployeeId('');
  };

  const handleLinkEmployee = async () => {
    if (!linkTarget || !linkEmployeeId) {
      toast.error('Select an employee to link.');
      return;
    }
    setLinkingUser(true);
    try {
      const res = await fetch(`/api/users/${linkTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: linkEmployeeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link employee');
      toast.success(`${linkTarget.name} is now linked to that employee record.`);
      setLinkTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link employee');
    } finally {
      setLinkingUser(false);
    }
  };

  const handleUnlinkEmployee = async (target: ManagedUser) => {
    setLinkingUser(true);
    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unlink employee');
      toast.success(`${target.name} is no longer linked to an employee record.`);
      setLinkTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink employee');
    } finally {
      setLinkingUser(false);
    }
  };

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

  // Edit user dialog (name / email / role)
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>('employee');
  const [savingEditUser, setSavingEditUser] = useState(false);

  const openEditUser = (target: ManagedUser) => {
    setEditingUser(target);
    setEditUserName(target.name);
    setEditUserEmail(target.email);
    setEditUserRole(target.role);
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    if (!editUserName.trim() || !editUserEmail.trim()) {
      toast.error('Name and email are required.');
      return;
    }
    setSavingEditUser(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editUserName.trim(), email: editUserEmail.trim(), role: editUserRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');
      toast.success(`${editUserName.trim()}'s details have been updated.`);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSavingEditUser(false);
    }
  };

  const handleDeleteUser = async (target: ManagedUser) => {
    if (!confirm(`Permanently delete the login for ${target.name} (${target.email})? This only removes their portal access — it does not delete any linked employee record. This cannot be undone.`)) return;
    setDeletingUserId(target.id);
    try {
      const res = await fetch(`/api/users/${target.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      toast.success(`${target.name}'s login has been deleted.`);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
    }
  };

  // Payroll access dialog (hr users only) — narrows which payroll features + which employees a
  // specific hr login can use, on top of (never beyond) the role's existing baseline access.
  const [payrollAccessTarget, setPayrollAccessTarget] = useState<ManagedUser | null>(null);
  const [restrictPayroll, setRestrictPayroll] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<PayrollFeature>>(new Set());
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [loadingPayrollAccess, setLoadingPayrollAccess] = useState(false);
  const [savingPayrollAccess, setSavingPayrollAccess] = useState(false);

  const openPayrollAccessDialog = async (target: ManagedUser) => {
    setPayrollAccessTarget(target);
    setEmployeeSearch('');
    setLoadingPayrollAccess(true);
    try {
      const res = await fetch(`/api/users/${target.id}/payroll-access`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load payroll access');
      const features: PayrollFeature[] = data.data.features ?? [];
      const employeeIds: string[] = data.data.employeeIds ?? [];
      setRestrictPayroll(features.length > 0 || employeeIds.length > 0);
      setSelectedFeatures(new Set(features));
      setSelectedEmployeeIds(new Set(employeeIds));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load payroll access');
      setPayrollAccessTarget(null);
    } finally {
      setLoadingPayrollAccess(false);
    }
  };

  const toggleFeature = (feature: PayrollFeature) => {
    setSelectedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(feature)) next.delete(feature); else next.add(feature);
      return next;
    });
  };

  const toggleScopedEmployee = (id: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredEmployeesForScope = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return allEmployees;
    return allEmployees.filter((e) =>
      `${e.firstName} ${e.lastName ?? ''} ${e.employeeCode}`.toLowerCase().includes(q)
    );
  }, [allEmployees, employeeSearch]);

  const handleSavePayrollAccess = async () => {
    if (!payrollAccessTarget) return;
    if (restrictPayroll && selectedFeatures.size === 0) {
      toast.error('Select at least one feature, or turn the switch off to remove restrictions entirely.');
      return;
    }
    if (restrictPayroll && selectedEmployeeIds.size === 0) {
      toast.error('Select at least one employee, or turn the switch off to remove restrictions entirely.');
      return;
    }
    setSavingPayrollAccess(true);
    try {
      const res = await fetch(`/api/users/${payrollAccessTarget.id}/payroll-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: restrictPayroll ? [...selectedFeatures] : [],
          employeeIds: restrictPayroll ? [...selectedEmployeeIds] : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update payroll access');
      toast.success(`Payroll access updated for ${payrollAccessTarget.name}.`);
      setPayrollAccessTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update payroll access');
    } finally {
      setSavingPayrollAccess(false);
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

      <Tabs defaultValue="company-info">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="company-info" className="gap-1.5">
            <Building2 className="size-4" />
            Company Info
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5">
            <Shield className="size-4" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarDays className="size-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="shifts" className="gap-1.5">
            <Clock className="size-4" />
            Shifts
          </TabsTrigger>
          <TabsTrigger value="location" className="gap-1.5">
            <MapPin className="size-4" />
            Location
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="size-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="bank-formats" className="gap-1.5">
            <FileSpreadsheet className="size-4" />
            Bank Formats
          </TabsTrigger>
          <TabsTrigger value="audit-log" className="gap-1.5">
            <ScrollText className="size-4" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="size-4" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company-info" className="space-y-6">

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

        </TabsContent>

        <TabsContent value="compliance" className="space-y-6">

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

        </TabsContent>

        <TabsContent value="calendar" className="space-y-6">

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-medium">Holidays</Label>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border p-0.5">
                  <button
                    type="button"
                    onClick={() => setHolidayPeriodMode('calendar')}
                    className={`rounded px-2 py-1 text-xs ${holidayPeriodMode === 'calendar' ? 'bg-emerald-600 text-white' : 'text-muted-foreground'}`}
                  >
                    Calendar Year
                  </button>
                  <button
                    type="button"
                    onClick={() => setHolidayPeriodMode('fy')}
                    className={`rounded px-2 py-1 text-xs ${holidayPeriodMode === 'fy' ? 'bg-emerald-600 text-white' : 'text-muted-foreground'}`}
                  >
                    Financial Year
                  </button>
                </div>
                <Select value={String(holidayPeriodYear)} onValueChange={(v) => setHolidayPeriodYear(parseInt(v, 10))}>
                  <SelectTrigger className="h-8 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALENDAR_YEAR_OPTIONS.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {holidayPeriodMode === 'fy' ? `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}` : y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Summary bar — always reflects the full selected period, independent of the filters below */}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Total: {holidayTotals.total}</Badge>
              <Badge variant="outline">National: {holidayTotals.byCategory.national ?? 0}</Badge>
              <Badge variant="outline">Festival: {holidayTotals.byCategory.festival ?? 0}</Badge>
              <Badge variant="outline">Other: {holidayTotals.byCategory.other ?? 0}</Badge>
              <Badge variant="outline">Optional (apply as leave): {holidayTotals.optionalCount}</Badge>
            </div>

            {/* Filter the list below (badges above stay unaffected) */}
            <div className="mt-2 flex flex-wrap gap-2">
              <Select value={holidayFilterCategory} onValueChange={(v) => setHolidayFilterCategory(v as typeof holidayFilterCategory)}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="national">National</SelectItem>
                  <SelectItem value="festival">Festival</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={holidayFilterType} onValueChange={(v) => setHolidayFilterType(v as typeof holidayFilterType)}>
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="holiday">Mandatory only</SelectItem>
                  <SelectItem value="optional">Optional only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {user?.role !== 'employee' && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
                <Select value={newHolidayCategory} onValueChange={(v) => setNewHolidayCategory(v as 'national' | 'festival' | 'other')}>
                  <SelectTrigger className="sm:w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="national">National</SelectItem>
                    <SelectItem value="festival">Festival</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={newHolidayType} onValueChange={(v) => setNewHolidayType(v as 'holiday' | 'optional')}>
                  <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="holiday">Mandatory</SelectItem>
                    <SelectItem value="optional">Optional (employee applies as leave if taken)</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleAddHoliday} disabled={addingHoliday} className="gap-1.5">
                  <PlusCircle className="h-4 w-4" />
                  Add Holiday
                </Button>
              </div>
            )}

            <div className="mt-3 divide-y rounded-lg border">
              {holidaysLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : filteredHolidays.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {holidays.length === 0 ? 'No holidays configured for this period.' : 'No holidays match these filters.'}
                </div>
              ) : (
                filteredHolidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-medium">{h.name}</span>{' '}
                      <span className="text-muted-foreground">
                        — {new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                      </span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{HOLIDAY_CATEGORY_LABEL[h.category] ?? 'Other'}</Badge>
                      {h.type === 'optional' && (
                        <Badge variant="outline" className="ml-2 text-[10px]">Optional</Badge>
                      )}
                    </div>
                    {user?.role !== 'employee' && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditHoliday(h)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDeleteHoliday(h.id, h.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingHoliday} onOpenChange={(open) => { if (!open) setEditingHoliday(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Holiday</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={editHolidayName} onChange={(e) => setEditHolidayName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={editHolidayDate} onChange={(e) => setEditHolidayDate(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={editHolidayCategory} onValueChange={(v) => setEditHolidayCategory(v as 'national' | 'festival' | 'other')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="national">National</SelectItem>
                  <SelectItem value="festival">Festival</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={editHolidayType} onValueChange={(v) => setEditHolidayType(v as 'holiday' | 'optional')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="holiday">Mandatory</SelectItem>
                  <SelectItem value="optional">Optional (employee applies as leave if taken)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingHoliday(null)}>Cancel</Button>
            <Button onClick={handleSaveEditHoliday} disabled={savingHoliday} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingHoliday ? <Loader2 className="size-4 animate-spin" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </TabsContent>

        <TabsContent value="shifts" className="space-y-6">

      {/* ─── Shift Definitions ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-emerald-600" />
            Shift Definitions
          </CardTitle>
          <CardDescription>
            Define working-hour shifts here, then assign one to each employee from their record in Employees — used for attendance grace-period calculation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.role !== 'employee' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Name</Label>
                <Input placeholder="e.g. General Shift" value={newShiftName} onChange={(e) => setNewShiftName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Start</Label>
                <Input type="time" value={newShiftStart} onChange={(e) => setNewShiftStart(e.target.value)} className="w-[130px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End</Label>
                <Input type="time" value={newShiftEnd} onChange={(e) => setNewShiftEnd(e.target.value)} className="w-[130px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Grace (min)</Label>
                <Input type="number" min={0} max={120} value={newShiftGrace} onChange={(e) => setNewShiftGrace(e.target.value)} className="w-[100px]" />
              </div>
              <Button size="sm" onClick={handleAddShift} disabled={addingShift} className="gap-1.5">
                <PlusCircle className="h-4 w-4" />
                Add Shift
              </Button>
            </div>
          )}

          <div className="divide-y rounded-lg border">
            {shiftsLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : shifts.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No shifts configured yet.</div>
            ) : (
              shifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <span className="font-medium">{s.name}</span>{' '}
                    <span className="text-muted-foreground">— {s.startTime}–{s.endTime} · {s.gracePeriodMinutes}min grace</span>
                  </div>
                  {user?.role !== 'employee' && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditShift(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDeleteShift(s.id, s.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingShift} onOpenChange={(open) => { if (!open) setEditingShift(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={editShiftName} onChange={(e) => setEditShiftName(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Start</Label><Input type="time" value={editShiftStart} onChange={(e) => setEditShiftStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>End</Label><Input type="time" value={editShiftEnd} onChange={(e) => setEditShiftEnd(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Grace (min)</Label><Input type="number" min={0} max={120} value={editShiftGrace} onChange={(e) => setEditShiftGrace(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingShift(null)}>Cancel</Button>
            <Button onClick={handleSaveEditShift} disabled={savingShift} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingShift ? <Loader2 className="size-4 animate-spin" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </TabsContent>

        <TabsContent value="email" className="space-y-6">

      {/* ─── Email (SMTP) Configuration (admin only) ─────────────────────────── */}
      {user?.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-emerald-600" />
              Email (SMTP) Configuration
            </CardTitle>
            <CardDescription>
              Configure your own mail server so salary slips, Form 16, and letters send to real inboxes.
              Leave unconfigured to keep using the built-in Ethereal test inbox (previews only, nothing delivered for real).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-host">SMTP Host</Label>
                <Input id="smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">Port</Label>
                <Input id="smtp-port" type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user">Username</Label>
                <Input id="smtp-user" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="you@yourdomain.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-password">
                  Password {smtpPasswordSet && <span className="text-xs font-normal text-emerald-600">(configured — leave blank to keep it)</span>}
                </Label>
                <Input id="smtp-password" type="password" autoComplete="new-password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder={smtpPasswordSet ? '••••••••' : ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-from">From Address</Label>
                <Input id="smtp-from" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder='"PayrollPro" <payroll@yourdomain.com>' />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch id="smtp-secure" checked={smtpSecure} onCheckedChange={setSmtpSecure} />
                <Label htmlFor="smtp-secure" className="cursor-pointer">Use SSL/TLS (port 465)</Label>
              </div>
            </div>
            <Button onClick={handleSaveSmtp} disabled={savingSmtp} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingSmtp ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save SMTP Settings
            </Button>

            <Separator />

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5 flex-1 min-w-[220px]">
                <Label htmlFor="smtp-test-to">Send a test email to</Label>
                <Input id="smtp-test-to" type="email" value={testEmailAddress} onChange={(e) => setTestEmailAddress(e.target.value)} placeholder="you@yourdomain.com" />
              </div>
              <Button variant="outline" onClick={handleSendTestEmail} disabled={sendingTest}>
                {sendingTest ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send Test Email
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── WhatsApp (Meta Cloud API) Configuration (admin only) ─────────────── */}
      {user?.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              WhatsApp Notifications
            </CardTitle>
            <CardDescription>
              Sends a WhatsApp record-keeping message to the employee when their leave is approved, via Meta&apos;s WhatsApp
              Cloud API (a real WhatsApp Business number — never your personal WhatsApp). Requires a Meta Business Account
              with WhatsApp set up, and a message template approved in Meta&apos;s WhatsApp Manager with the same name/language
              as below and 6 body placeholders (employee name, leave type, from date, to date, days, approver).
              Leave off and nothing changes — email-on-approval keeps working either way.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch id="whatsapp-enabled" checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
              <Label htmlFor="whatsapp-enabled" className="cursor-pointer">Enable WhatsApp notifications</Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp-phone-id">Phone Number ID</Label>
                <Input id="whatsapp-phone-id" value={whatsappPhoneNumberId} onChange={(e) => setWhatsappPhoneNumberId(e.target.value)} placeholder="From Meta WhatsApp Manager" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp-token">
                  Access Token {whatsappAccessTokenSet && <span className="text-xs font-normal text-emerald-600">(configured — leave blank to keep it)</span>}
                </Label>
                <Input id="whatsapp-token" type="password" autoComplete="new-password" value={whatsappAccessToken} onChange={(e) => setWhatsappAccessToken(e.target.value)} placeholder={whatsappAccessTokenSet ? '••••••••' : ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp-template">Leave Approval Template Name</Label>
                <Input id="whatsapp-template" value={whatsappLeaveApprovalTemplate} onChange={(e) => setWhatsappLeaveApprovalTemplate(e.target.value)} placeholder="leave_approved" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp-lang">Template Language Code</Label>
                <Input id="whatsapp-lang" value={whatsappTemplateLanguage} onChange={(e) => setWhatsappTemplateLanguage(e.target.value)} placeholder="en_US" />
              </div>
            </div>
            <Button onClick={handleSaveWhatsapp} disabled={savingWhatsapp} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingWhatsapp ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save WhatsApp Settings
            </Button>

            <Separator />

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5 flex-1 min-w-[220px]">
                <Label htmlFor="whatsapp-test-to">Send a test message to (10-digit mobile)</Label>
                <Input id="whatsapp-test-to" value={testWhatsappNumber} onChange={(e) => setTestWhatsappNumber(e.target.value)} placeholder="9876543210" />
              </div>
              <Button variant="outline" onClick={handleSendTestWhatsapp} disabled={sendingWhatsappTest}>
                {sendingWhatsappTest ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send Test Message
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

        </TabsContent>

        <TabsContent value="location" className="space-y-6">

      {/* ─── Office Location & Attendance (admin only) ────────────────────────── */}
      {user?.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-emerald-600" />
              Office Location &amp; Attendance
            </CardTitle>
            <CardDescription>
              Optional: set your default (head office) location to log how far each punch was from it. Leave blank
              and nothing changes — no location is ever requested from employees until coordinates are set here.
              Need another site? Add it under Branch Offices below and assign employees to it individually — Work
              From Home employees can be exempted entirely from the Employees screen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="office-lat">Office Latitude</Label>
                <Input id="office-lat" type="number" step="any" value={officeLatitude} onChange={(e) => setOfficeLatitude(e.target.value)} placeholder="19.0760" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="office-lon">Office Longitude</Label>
                <Input id="office-lon" type="number" step="any" value={officeLongitude} onChange={(e) => setOfficeLongitude(e.target.value)} placeholder="72.8777" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="geofence-radius">Allowed Radius (meters)</Label>
                <Input id="geofence-radius" type="number" value={geofenceRadiusMeters} onChange={(e) => setGeofenceRadiusMeters(e.target.value)} placeholder="200" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="enforce-geofence" checked={enforceGeofence} onCheckedChange={setEnforceGeofence} />
              <Label htmlFor="enforce-geofence" className="cursor-pointer">
                Block punches outside the radius <span className="text-xs font-normal text-muted-foreground">(off by default — until then, distance is only logged, never enforced)</span>
              </Label>
            </div>
            <Separator />
            <div className="flex items-center gap-2">
              <Switch id="enable-login-attendance" checked={enableLoginAttendance} onCheckedChange={setEnableLoginAttendance} />
              <Label htmlFor="enable-login-attendance" className="cursor-pointer">
                Automatically punch in an employee when they log in
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="enable-logout-attendance" checked={enableLogoutAttendance} onCheckedChange={setEnableLogoutAttendance} />
              <Label htmlFor="enable-logout-attendance" className="cursor-pointer">
                Automatically punch out an employee when they log out <span className="text-xs font-normal text-muted-foreground">(only if they're still punched in for today)</span>
              </Label>
            </div>
            <Separator />
            <p className="text-sm font-medium">Interactive Punch Methods</p>
            <div className="flex items-center gap-2">
              <Switch id="allow-face-punch" checked={allowFacePunch} onCheckedChange={setAllowFacePunch} />
              <Label htmlFor="allow-face-punch" className="cursor-pointer">
                Allow Quick Confirm (face) punch on the Attendance screen
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="allow-manual-punch" checked={allowManualPunch} onCheckedChange={setAllowManualPunch} />
              <Label htmlFor="allow-manual-punch" className="cursor-pointer">
                Allow Manual Punch on the Attendance screen <span className="text-xs font-normal text-muted-foreground">(admin's separate Mark Attendance override is never affected by this)</span>
              </Label>
            </div>
            <Separator />
            <p className="text-sm font-medium">Login Security</p>
            <div className="flex items-center gap-2">
              <Switch id="require-face-login" checked={requireFaceLogin} onCheckedChange={setRequireFaceLogin} />
              <Label htmlFor="require-face-login" className="cursor-pointer">
                Require face verification to sign in, after password <span className="text-xs font-normal text-muted-foreground">(applies only to logins linked to an employee record — an employee not yet enrolled is walked through a one-time enrollment on their next login; reuses the same face reference as Quick Confirm punch)</span>
              </Label>
            </div>
            <Button onClick={handleSaveGeofence} disabled={savingGeofence} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingGeofence ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Location &amp; Attendance Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Branch Offices (admin only) ───────────────────────────────────────── */}
      {user?.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-emerald-600" />
              Branch Offices
            </CardTitle>
            <CardDescription>
              Additional locations beyond the head office above. Assign an employee to one from their record in
              Employees — their punches are then geofenced against this location's own coordinates and radius
              instead of the head office's.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input placeholder="e.g. Bangalore Branch" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} className="w-[200px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Latitude</Label>
                <Input type="number" step="any" value={newLocationLat} onChange={(e) => setNewLocationLat(e.target.value)} placeholder="12.9716" className="w-[140px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Longitude</Label>
                <Input type="number" step="any" value={newLocationLon} onChange={(e) => setNewLocationLon(e.target.value)} placeholder="77.5946" className="w-[140px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Radius (m)</Label>
                <Input type="number" value={newLocationRadius} onChange={(e) => setNewLocationRadius(e.target.value)} className="w-[100px]" />
              </div>
              <Button size="sm" onClick={handleAddLocation} disabled={addingLocation} className="gap-1.5">
                <PlusCircle className="h-4 w-4" />
                Add Location
              </Button>
            </div>

            <div className="divide-y rounded-lg border">
              {locationsLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : officeLocations.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No branch offices configured yet.</div>
              ) : (
                officeLocations.map((l) => (
                  <div key={l.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-medium">{l.name}</span>{' '}
                      <span className="text-muted-foreground">— {l.latitude.toFixed(4)}, {l.longitude.toFixed(4)} · {l.radiusMeters}m radius</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditLocation(l)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDeleteLocation(l.id, l.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editingLocation} onOpenChange={(open) => { if (!open) setEditingLocation(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Branch Office</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={editLocationName} onChange={(e) => setEditLocationName(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Latitude</Label><Input type="number" step="any" value={editLocationLat} onChange={(e) => setEditLocationLat(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Longitude</Label><Input type="number" step="any" value={editLocationLon} onChange={(e) => setEditLocationLon(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Radius (m)</Label><Input type="number" value={editLocationRadius} onChange={(e) => setEditLocationRadius(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLocation(null)}>Cancel</Button>
            <Button onClick={handleSaveEditLocation} disabled={savingLocation} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingLocation ? <Loader2 className="size-4 animate-spin" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </TabsContent>

        <TabsContent value="bank-formats" className="space-y-6">

      {/* ─── Bank Transfer Formats (admin/hr) ──────────────────────────────────── */}
      {(user?.role === 'admin' || user?.role === 'hr') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Bank Transfer Formats
              </CardTitle>
              <CardDescription>
                Define the exact column layout your bank expects for salary transfer files (e.g. HDFC, PNB), then generate a real Excel file in that format from Payroll.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openAddBankFormat}>
              <PlusCircle className="h-4 w-4" />
              Add Format
            </Button>
          </CardHeader>
          <CardContent>
            {bankFormatsLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading...</p>
            ) : bankFormats.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No bank formats configured yet. Downloads will use the generic CSV layout until you add one.
              </p>
            ) : (
              <div className="space-y-2">
                {bankFormats.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{f.name}</span>
                      {f.isDefault && (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">Default</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{f.columns.length} column{f.columns.length === 1 ? '' : 's'}</span>
                      {f.sampleFileName && (
                        <a href={`/api/bank-formats/${f.id}/sample`} className="text-xs text-emerald-700 hover:underline" target="_blank" rel="noreferrer">
                          {f.sampleFileName}
                        </a>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => openEditBankFormat(f)}>
                        <Pencil className="size-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        disabled={deletingBankFormatId === f.id}
                        onClick={() => handleDeleteBankFormat(f.id)}
                      >
                        {deletingBankFormatId === f.id ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Trash2 className="size-3.5 mr-1" />}
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Add/Edit Bank Format Dialog ───────────────────────────────────── */}
      <Dialog open={bfDialogOpen} onOpenChange={(open) => { if (!open && !savingBankFormat) setBfDialogOpen(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bfEditingId ? 'Edit Bank Format' : 'Add Bank Format'}</DialogTitle>
            <DialogDescription>
              Upload your bank&apos;s sample file for your own reference, then build the exact column order below. Nothing is auto-detected — you decide what goes in each column.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bf-name">Format Name</Label>
                <Input id="bf-name" value={bfName} onChange={(e) => setBfName(e.target.value)} placeholder="e.g. HDFC" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bf-sample">Sample File (optional — auto-fills columns below)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="bf-sample"
                    type="file"
                    accept=".xlsx,.xls,.xlsm,.csv"
                    onChange={(e) => handleSampleFileSelected(e.target.files?.[0] ?? null)}
                    className="text-xs"
                  />
                  {parsingSample ? (
                    <Loader2 className="size-4 text-muted-foreground shrink-0 animate-spin" />
                  ) : (
                    <Upload className="size-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              </div>
            </div>

            {sampleParsedRows && sampleParsedRows.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <div className="text-sm font-medium">Which row has the column headers?</div>
                <p className="text-xs text-muted-foreground">
                  Bank templates often have instructions above the real header row. We&apos;ve highlighted our best guess
                  {sampleHeaderRowIdx !== null && <> — <strong>row {sampleHeaderRowIdx + 1}</strong></>} below; scroll to check it, click a different row if it&apos;s wrong, then apply.
                </p>
                <div className="overflow-x-auto max-h-72 overflow-y-auto rounded border bg-background">
                  <Table>
                    <TableBody>
                      {sampleParsedRows.map((row, idx) => {
                        const isEmpty = row.every((cell) => !cell || cell.trim().length === 0);
                        return (
                          <TableRow
                            key={idx}
                            id={`bf-preview-row-${idx}`}
                            onClick={() => !isEmpty && setSampleHeaderRowIdx(idx)}
                            className={`${isEmpty ? 'opacity-40' : 'cursor-pointer'} ${sampleHeaderRowIdx === idx ? 'bg-emerald-100 dark:bg-emerald-950' : ''}`}
                          >
                            <TableCell className="text-xs text-muted-foreground w-8">{idx + 1}</TableCell>
                            {isEmpty ? (
                              <TableCell className="text-xs italic text-muted-foreground">(empty row)</TableCell>
                            ) : (
                              row.map((cell, cIdx) => (
                                <TableCell key={cIdx} className="text-xs whitespace-nowrap">{cell}</TableCell>
                              ))
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={sampleHeaderRowIdx === null}
                  onClick={() => sampleHeaderRowIdx !== null && applyDetectedColumns(sampleHeaderRowIdx)}
                >
                  <FileSpreadsheet className="size-3.5 mr-1" />
                  Apply Detected Columns
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox id="bf-default" checked={bfIsDefault} onCheckedChange={(v) => setBfIsDefault(!!v)} />
              <Label htmlFor="bf-default" className="cursor-pointer">Use as default when generating a bank file</Label>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Columns, in order</Label>
                <Button variant="outline" size="sm" onClick={addBfColumn}>
                  <PlusCircle className="size-3.5 mr-1" />
                  Add Column
                </Button>
              </div>
              <div className="space-y-2 overflow-x-auto">
                {bfColumns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-lg border p-2 min-w-[560px]">
                    <div className="flex flex-col shrink-0">
                      <Button variant="ghost" size="icon" className="size-6" disabled={idx === 0} onClick={() => moveBfColumn(idx, -1)}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-6" disabled={idx === bfColumns.length - 1} onClick={() => moveBfColumn(idx, 1)}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                    </div>
                    <Input
                      className="w-40 shrink-0"
                      placeholder="Column header"
                      value={col.header}
                      onChange={(e) => updateBfColumn(idx, { header: e.target.value })}
                    />
                    <Select value={col.source} onValueChange={(v) => updateBfColumn(idx, { source: v as 'field' | 'fixed' })}>
                      <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="field">Employee Field</SelectItem>
                        <SelectItem value="fixed">Fixed Text</SelectItem>
                      </SelectContent>
                    </Select>
                    {col.source === 'field' ? (
                      <Select value={col.field} onValueChange={(v) => updateBfColumn(idx, { field: v })}>
                        <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder="Choose a field..." /></SelectTrigger>
                        <SelectContent>
                          {BANK_FORMAT_FIELD_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="flex-1 min-w-0"
                        placeholder="Fixed value, e.g. NEFT"
                        value={col.fixedValue ?? ''}
                        onChange={(e) => updateBfColumn(idx, { fixedValue: e.target.value })}
                      />
                    )}
                    <Button variant="ghost" size="icon" className="size-8 text-red-500 shrink-0" onClick={() => removeBfColumn(idx)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBfDialogOpen(false)} disabled={savingBankFormat}>
              Cancel
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSaveBankFormat} disabled={savingBankFormat}>
              {savingBankFormat ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Format
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </TabsContent>

        <TabsContent value="audit-log" className="space-y-6">

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
                        <TableHead>Linked Employee</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : users.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
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
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className={`${ROLE_BADGE[u.role]} capitalize`}>{u.role}</Badge>
                                {u.role === 'hr' && ((u._count?.payrollFeatures ?? 0) > 0 || (u._count?.payrollEmployeeScopes ?? 0) > 0) && (
                                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Restricted</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              {u.role !== 'employee' ? (
                                <span className="text-muted-foreground">—</span>
                              ) : u.employee ? (
                                <span>{u.employee.firstName} {u.employee.lastName ?? ''} <span className="text-muted-foreground">({u.employee.employeeCode})</span></span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400">Not linked</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={u.active ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                                {u.active ? 'Active' : 'Deactivated'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                {u.role === 'employee' && !u.employee && (
                                  <Button variant="ghost" size="sm" onClick={() => openLinkDialog(u)}>
                                    <Link2 className="size-3.5 mr-1" />
                                    Link Employee
                                  </Button>
                                )}
                                {u.role === 'employee' && u.employee && (
                                  <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={linkingUser} onClick={() => handleUnlinkEmployee(u)}>
                                    <Link2 className="size-3.5 mr-1" />
                                    Unlink
                                  </Button>
                                )}
                                {u.id !== user?.id && (
                                  <Button variant="ghost" size="sm" onClick={() => openEditUser(u)}>
                                    <Pencil className="size-3.5 mr-1" />
                                    Edit
                                  </Button>
                                )}
                                {u.role === 'hr' && (
                                  <Button variant="ghost" size="sm" onClick={() => openPayrollAccessDialog(u)}>
                                    <Shield className="size-3.5 mr-1" />
                                    Feature Access
                                  </Button>
                                )}
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
                                {u.id !== user?.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    disabled={deletingUserId === u.id}
                                    onClick={() => handleDeleteUser(u)}
                                  >
                                    {deletingUserId === u.id ? (
                                      <Loader2 className="size-3.5 mr-1 animate-spin" />
                                    ) : (
                                      <Trash2 className="size-3.5 mr-1" />
                                    )}
                                    Delete
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

          {/* ─── Edit User Dialog ─────────────────────────────────────────────── */}
          <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit User</DialogTitle>
                <DialogDescription>Update {editingUser?.name}&apos;s name, email, or role.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-user-name">Name</Label>
                  <Input id="edit-user-name" value={editUserName} onChange={(e) => setEditUserName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-user-email">Email</Label>
                  <Input id="edit-user-email" type="email" value={editUserEmail} onChange={(e) => setEditUserEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-user-role">Role</Label>
                  <Select value={editUserRole} onValueChange={(v) => setEditUserRole(v as UserRole)}>
                    <SelectTrigger id="edit-user-role" className="w-full">
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
                <Button variant="outline" onClick={() => setEditingUser(null)} disabled={savingEditUser}>
                  Cancel
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSaveEditUser} disabled={savingEditUser}>
                  {savingEditUser ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── Link Employee Dialog ─────────────────────────────────────────── */}
          <Dialog open={!!linkTarget} onOpenChange={(open) => !open && setLinkTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link Employee</DialogTitle>
                <DialogDescription>
                  Connect {linkTarget?.name}&apos;s login to an employee record, so they can use My Portal and see their own data.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="link-employee-select">Employee</Label>
                <Select value={linkEmployeeId} onValueChange={setLinkEmployeeId}>
                  <SelectTrigger id="link-employee-select" className="w-full">
                    <SelectValue placeholder={unlinkedEmployees.length === 0 ? 'No unlinked employees available' : 'Select an employee...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.firstName} {e.lastName ?? ''} ({e.employeeCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {unlinkedEmployees.length === 0 && (
                  <p className="text-xs text-muted-foreground">Every employee already has a login linked, or none exist yet.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLinkTarget(null)} disabled={linkingUser}>
                  Cancel
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleLinkEmployee} disabled={linkingUser || !linkEmployeeId}>
                  {linkingUser ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                  Link
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── Payroll Access Dialog (hr users only) ───────────────────────── */}
          <Dialog open={!!payrollAccessTarget} onOpenChange={(open) => !open && setPayrollAccessTarget(null)}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Feature Access — {payrollAccessTarget?.name}</DialogTitle>
                <DialogDescription>
                  By default an HR login has full access. Restrict it to specific features and/or specific employees below —
                  this can only narrow their access, never grant more than an HR role already has.
                </DialogDescription>
              </DialogHeader>
              {loadingPayrollAccess ? (
                <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Restrict this user&apos;s access</p>
                      <p className="text-xs text-muted-foreground">Off = full, unrestricted HR access to every feature and employee.</p>
                    </div>
                    <Switch checked={restrictPayroll} onCheckedChange={setRestrictPayroll} />
                  </div>

                  {restrictPayroll && (
                    <>
                      <div className="space-y-3">
                        <Label>Allowed features</Label>
                        <div className="space-y-3 rounded-lg border p-3">
                          {FEATURE_GROUPS.map((group) => (
                            <div key={group.label}>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{group.label}</p>
                              <div className="grid grid-cols-2 gap-2">
                                {group.features.map((feature) => (
                                  <label key={feature} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <Checkbox
                                      checked={selectedFeatures.has(feature)}
                                      onCheckedChange={() => toggleFeature(feature)}
                                    />
                                    {PAYROLL_FEATURE_LABELS[feature]}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Allowed employees ({selectedEmployeeIds.size} selected)</Label>
                        <Input
                          placeholder="Search by name or employee code..."
                          value={employeeSearch}
                          onChange={(e) => setEmployeeSearch(e.target.value)}
                        />
                        <div className="max-h-56 overflow-y-auto rounded-lg border p-2 space-y-1">
                          {filteredEmployeesForScope.length === 0 ? (
                            <p className="text-xs text-muted-foreground p-2">No matching employees.</p>
                          ) : (
                            filteredEmployeesForScope.map((e) => (
                              <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer px-1.5 py-1 rounded hover:bg-muted">
                                <Checkbox
                                  checked={selectedEmployeeIds.has(e.id)}
                                  onCheckedChange={() => toggleScopedEmployee(e.id)}
                                />
                                {e.firstName} {e.lastName ?? ''} <span className="text-muted-foreground">({e.employeeCode})</span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayrollAccessTarget(null)} disabled={savingPayrollAccess}>
                  Cancel
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleSavePayrollAccess}
                  disabled={savingPayrollAccess || loadingPayrollAccess}
                >
                  {savingPayrollAccess ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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


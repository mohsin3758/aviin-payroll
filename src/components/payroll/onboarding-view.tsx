'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, Loader2, CheckCircle2, Circle, Mail, KeyRound, Package, ListChecks, Pencil, Trash2,
  Send, Copy, RotateCw, Ban, Eye, FileCheck2, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePayrollStore } from '@/store/payroll-store';

interface Employee { id: string; employeeCode: string; firstName: string; lastName: string | null; designation: string; email: string; }
interface Task { id: string; taskName: string; isCompleted: boolean; order: number; }
interface Asset {
  id: string; assetType: string; assetTag: string | null; brand: string | null; model: string | null;
  condition: string | null; notes: string | null; allocatedDate: string; returnedDate: string | null;
  chargerSerialNo: string | null; chargerWireSerialNo: string | null;
  laptopName: string | null; laptopLoginId: string | null; laptopPassword: string | null; laptopPin: string | null;
}
interface Candidate {
  id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null;
  client: string | null; role: string; employmentType: string; dateOfJoining: string;
}
interface InviteEmployee {
  id: string; employeeCode: string; firstName: string; lastName: string | null; email: string;
  designation: string; department: string; onboardingStatus: string;
}
interface Invite {
  id: string; status: string; expiresAt: string; sentAt: string; resentAt: string | null;
  submittedAt: string | null; rejectionReason: string | null; isExpired: boolean;
  employee: InviteEmployee; candidate: { id: string; firstName: string; lastName: string | null } | null;
}
interface InviteDetailDoc { id: string; docType: string; fileName: string; createdAt: string }
interface InviteDetail extends Invite {
  employee: InviteEmployee & Record<string, unknown>;
  documents: InviteDetailDoc[];
}

const ASSET_TAG_LABEL: Record<string, string> = {
  laptop: 'Serial Number', phone: 'IMEI', id_card: 'Serial Number', other: 'Reference / Tag',
};

const INVITE_STATUS_STYLE: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  submitted: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  revoked: 'bg-gray-100 text-gray-600 border-gray-200',
};
const INVITE_STATUS_LABEL: Record<string, string> = {
  sent: 'Sent', in_progress: 'In Progress', submitted: 'Submitted',
  approved: 'Approved', rejected: 'Needs Correction', revoked: 'Revoked',
};
const DOC_TYPE_LABEL: Record<string, string> = {
  photo: 'Photo', pan: 'PAN Card', aadhaar: 'Aadhaar Card', bank_proof: 'Bank Proof',
  education_certificate: 'Education Certificate', previous_relieving_letter: 'Previous Relieving Letter', resume: 'Resume',
};

export default function OnboardingView() {
  const { refreshKey } = usePayrollStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [employeeId, setEmployeeId] = useState('');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetType, setAssetType] = useState('laptop');
  const [assetTag, setAssetTag] = useState('');
  const [assetBrand, setAssetBrand] = useState('');
  const [assetModel, setAssetModel] = useState('');
  const [assetCondition, setAssetCondition] = useState('new');
  const [assetNotes, setAssetNotes] = useState('');
  const [assetChargerSerialNo, setAssetChargerSerialNo] = useState('');
  const [assetChargerWireSerialNo, setAssetChargerWireSerialNo] = useState('');
  const [assetLaptopName, setAssetLaptopName] = useState('');
  const [assetLaptopLoginId, setAssetLaptopLoginId] = useState('');
  const [assetLaptopPassword, setAssetLaptopPassword] = useState('');
  const [assetLaptopPin, setAssetLaptopPin] = useState('');
  const [allocating, setAllocating] = useState(false);

  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editAssetType, setEditAssetType] = useState('laptop');
  const [editAssetTag, setEditAssetTag] = useState('');
  const [editAssetBrand, setEditAssetBrand] = useState('');
  const [editAssetModel, setEditAssetModel] = useState('');
  const [editAssetCondition, setEditAssetCondition] = useState('new');
  const [editAssetNotes, setEditAssetNotes] = useState('');
  const [editAssetChargerSerialNo, setEditAssetChargerSerialNo] = useState('');
  const [editAssetChargerWireSerialNo, setEditAssetChargerWireSerialNo] = useState('');
  const [editAssetLaptopName, setEditAssetLaptopName] = useState('');
  const [editAssetLaptopLoginId, setEditAssetLaptopLoginId] = useState('');
  const [editAssetLaptopPassword, setEditAssetLaptopPassword] = useState('');
  const [editAssetLaptopPin, setEditAssetLaptopPin] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [sendingLetter, setSendingLetter] = useState<'offer' | 'appointment' | null>(null);
  const [activatingPortal, setActivatingPortal] = useState(false);

  // --- Invites tab ---
  const [inviteSource, setInviteSource] = useState<'candidate' | 'manual'>('manual');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [invFirstName, setInvFirstName] = useState('');
  const [invLastName, setInvLastName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invDesignation, setInvDesignation] = useState('');
  const [invDepartment, setInvDepartment] = useState('');
  const [invClient, setInvClient] = useState('');
  const [invEmploymentType, setInvEmploymentType] = useState('permanent');
  const [invDateOfJoining, setInvDateOfJoining] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [inviteStatusFilter, setInviteStatusFilter] = useState('all');
  const [actingInviteId, setActingInviteId] = useState<string | null>(null);

  const [reviewInviteId, setReviewInviteId] = useState<string | null>(null);
  const [reviewDetail, setReviewDetail] = useState<InviteDetail | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const resetInviteForm = () => {
    setCandidateId(''); setInvFirstName(''); setInvLastName(''); setInvEmail(''); setInvPhone('');
    setInvDesignation(''); setInvDepartment(''); setInvClient(''); setInvEmploymentType('permanent'); setInvDateOfJoining('');
  };

  const fetchInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const qs = inviteStatusFilter !== 'all' ? `?status=${inviteStatusFilter}` : '';
      const res = await fetch(`/api/onboarding-invites${qs}`);
      const data = await res.json();
      setInvites(data.data ?? []);
    } catch {
      toast.error('Failed to load onboarding invites');
    } finally {
      setLoadingInvites(false);
    }
  }, [inviteStatusFilter]);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  useEffect(() => {
    fetch('/api/candidates?status=active')
      .then((r) => r.json())
      .then((d) => setCandidates(d.data ?? []))
      .catch(() => {});
  }, [refreshKey]);

  const handlePickCandidate = (id: string) => {
    setCandidateId(id);
    const c = candidates.find((x) => x.id === id);
    if (!c) return;
    setInvFirstName(c.firstName);
    setInvLastName(c.lastName ?? '');
    setInvEmail(c.email ?? '');
    setInvPhone(c.phone ?? '');
    setInvDesignation(c.role);
    setInvClient(c.client ?? '');
    setInvEmploymentType(c.employmentType);
    setInvDateOfJoining(c.dateOfJoining?.slice(0, 10) ?? '');
  };

  const notifySentInvite = (data: { inviteUrl: string; previewUrl: string | null }) => {
    toast.success('Onboarding invite sent', {
      description: data.previewUrl ? 'Click to view the sent email' : 'Link copied to clipboard',
      action: data.previewUrl
        ? { label: 'Open preview', onClick: () => window.open(data.previewUrl!, '_blank') }
        : { label: 'Copy link', onClick: () => navigator.clipboard.writeText(data.inviteUrl) },
    });
    if (!data.previewUrl) navigator.clipboard.writeText(data.inviteUrl).catch(() => {});
  };

  const handleSendInvite = async () => {
    setSendingInvite(true);
    try {
      const res = await fetch('/api/onboarding-invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: inviteSource === 'candidate' && candidateId ? candidateId : undefined,
          firstName: invFirstName.trim(),
          lastName: invLastName.trim() || undefined,
          email: invEmail.trim(),
          phone: invPhone.trim() || undefined,
          designation: invDesignation.trim(),
          department: invDepartment.trim(),
          client: invClient.trim() || undefined,
          employmentType: invEmploymentType,
          dateOfJoining: invDateOfJoining,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      notifySentInvite(data.data);
      resetInviteForm();
      fetchInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleResendInvite = async (id: string) => {
    setActingInviteId(id);
    try {
      const res = await fetch(`/api/onboarding-invites/${id}/resend`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend invite');
      notifySentInvite(data.data);
      fetchInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend invite');
    } finally {
      setActingInviteId(null);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    if (!confirm('Revoke this onboarding invite? The link will stop working immediately.')) return;
    setActingInviteId(id);
    try {
      const res = await fetch(`/api/onboarding-invites/${id}/revoke`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke invite');
      toast.success('Invite revoked');
      fetchInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invite');
    } finally {
      setActingInviteId(null);
    }
  };

  const openReview = async (id: string) => {
    setReviewInviteId(id);
    setReviewDetail(null);
    setReviewDecision(null);
    setRejectReason('');
    setLoadingReview(true);
    try {
      const res = await fetch(`/api/onboarding-invites/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load submission');
      setReviewDetail(data.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load submission');
      setReviewInviteId(null);
    } finally {
      setLoadingReview(false);
    }
  };

  const handleSubmitReview = async (decision: 'approved' | 'rejected') => {
    if (!reviewInviteId) return;
    if (decision === 'rejected' && !rejectReason.trim()) {
      toast.error('Please describe what needs to be corrected');
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/onboarding-invites/${reviewInviteId}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: decision === 'rejected' ? rejectReason.trim() : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit review');
      toast.success(decision === 'approved' ? 'Onboarding approved — employee is now active' : 'Sent back for correction');
      setReviewInviteId(null);
      fetchInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => {
    setLoadingEmps(true);
    fetch('/api/employees?limit=200')
      .then((r) => r.json())
      .then((d) => setEmployees(d.data ?? []))
      .catch(() => toast.error('Failed to load employees'))
      .finally(() => setLoadingEmps(false));
  }, [refreshKey]);

  const fetchTasksAndAssets = useCallback(async () => {
    if (!employeeId) return;
    setLoadingTasks(true);
    try {
      const [taskRes, assetRes] = await Promise.all([
        fetch(`/api/onboarding/tasks?employeeId=${employeeId}`),
        fetch(`/api/employees/${employeeId}/assets`),
      ]);
      const taskData = await taskRes.json();
      const assetData = await assetRes.json();
      setTasks(taskData.data ?? []);
      setAssets(assetData.data ?? []);
    } catch {
      toast.error('Failed to load onboarding data');
    } finally {
      setLoadingTasks(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchTasksAndAssets(); }, [fetchTasksAndAssets]);

  const handleSeedChecklist = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/onboarding/tasks/seed-defaults', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create checklist');
      toast.success('Onboarding checklist created');
      fetchTasksAndAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create checklist');
    } finally {
      setSeeding(false);
    }
  };

  const handleToggleTask = async (task: Task) => {
    try {
      const res = await fetch(`/api/onboarding/tasks/${task.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !task.isCompleted }),
      });
      if (!res.ok) throw new Error('Failed to update task');
      fetchTasksAndAssets();
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleAllocateAsset = async () => {
    setAllocating(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/assets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType,
          assetTag: assetTag.trim() || null,
          brand: assetBrand.trim() || null,
          model: assetModel.trim() || null,
          condition: assetCondition || null,
          notes: assetNotes.trim() || null,
          ...(assetType === 'laptop' ? {
            chargerSerialNo: assetChargerSerialNo.trim() || null,
            chargerWireSerialNo: assetChargerWireSerialNo.trim() || null,
            laptopName: assetLaptopName.trim() || null,
            laptopLoginId: assetLaptopLoginId.trim() || null,
            laptopPassword: assetLaptopPassword.trim() || null,
            laptopPin: assetLaptopPin.trim() || null,
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to allocate asset');
      toast.success('Asset allocated');
      setAssetTag(''); setAssetBrand(''); setAssetModel(''); setAssetCondition('new'); setAssetNotes('');
      setAssetChargerSerialNo(''); setAssetChargerWireSerialNo('');
      setAssetLaptopName(''); setAssetLaptopLoginId(''); setAssetLaptopPassword(''); setAssetLaptopPin('');
      fetchTasksAndAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to allocate asset');
    } finally {
      setAllocating(false);
    }
  };

  const handleReturnAsset = async (assetId: string) => {
    try {
      const res = await fetch(`/api/employees/${employeeId}/assets/${assetId}`, { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to mark returned');
      fetchTasksAndAssets();
    } catch {
      toast.error('Failed to mark asset returned');
    }
  };

  const openEditAsset = (a: Asset) => {
    setEditingAsset(a);
    setEditAssetType(a.assetType);
    setEditAssetTag(a.assetTag ?? '');
    setEditAssetBrand(a.brand ?? '');
    setEditAssetModel(a.model ?? '');
    setEditAssetCondition(a.condition ?? 'new');
    setEditAssetNotes(a.notes ?? '');
    setEditAssetChargerSerialNo(a.chargerSerialNo ?? '');
    setEditAssetChargerWireSerialNo(a.chargerWireSerialNo ?? '');
    setEditAssetLaptopName(a.laptopName ?? '');
    setEditAssetLaptopLoginId(a.laptopLoginId ?? '');
    setEditAssetLaptopPassword(a.laptopPassword ?? '');
    setEditAssetLaptopPin(a.laptopPin ?? '');
  };

  const handleSaveEditAsset = async () => {
    if (!editingAsset) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/assets/${editingAsset.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: editAssetType,
          assetTag: editAssetTag.trim() || null,
          brand: editAssetBrand.trim() || null,
          model: editAssetModel.trim() || null,
          condition: editAssetCondition || null,
          notes: editAssetNotes.trim() || null,
          ...(editAssetType === 'laptop' ? {
            chargerSerialNo: editAssetChargerSerialNo.trim() || null,
            chargerWireSerialNo: editAssetChargerWireSerialNo.trim() || null,
            laptopName: editAssetLaptopName.trim() || null,
            laptopLoginId: editAssetLaptopLoginId.trim() || null,
            laptopPassword: editAssetLaptopPassword.trim() || null,
            laptopPin: editAssetLaptopPin.trim() || null,
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update asset');
      toast.success('Asset updated');
      setEditingAsset(null);
      fetchTasksAndAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update asset');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!confirm('Delete this asset record permanently? Use "Mark Returned" instead if the employee actually returned it.')) return;
    try {
      const res = await fetch(`/api/employees/${employeeId}/assets/${assetId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete asset');
      toast.success('Asset deleted');
      fetchTasksAndAssets();
    } catch {
      toast.error('Failed to delete asset');
    }
  };

  const handleSendLetter = async (letterType: 'offer' | 'appointment') => {
    setSendingLetter(letterType);
    try {
      const res = await fetch('/api/onboarding/letters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, letterType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send letter');
      if (data.data.previewUrl) {
        toast.success(`${letterType === 'offer' ? 'Offer' : 'Appointment'} letter sent (test mode)`, {
          description: 'Click to view the sent email',
          action: { label: 'Open preview', onClick: () => window.open(data.data.previewUrl, '_blank') },
        });
      } else {
        toast.success(`${letterType === 'offer' ? 'Offer' : 'Appointment'} letter emailed`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send letter');
    } finally {
      setSendingLetter(null);
    }
  };

  const handleActivatePortal = async () => {
    setActivatingPortal(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/activate-portal`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to activate portal');
      if (data.previewUrl) {
        toast.success('Portal activated (test mode email)', {
          description: 'Click to view the welcome email with the temp password',
          action: { label: 'Open preview', onClick: () => window.open(data.previewUrl, '_blank') },
        });
      } else {
        toast.success('Portal activated — welcome email sent');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to activate portal');
    } finally {
      setActivatingPortal(false);
    }
  };

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><UserPlus className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employee Onboarding</h1>
          <p className="text-sm text-muted-foreground">Checklist, letters, asset allocation, and portal activation for new hires</p>
        </div>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist">Checklist &amp; Assets</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="space-y-6 mt-4">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-1.5 max-w-md">
            <Label>Select Employee</Label>
            {loadingEmps ? <Skeleton className="h-9 w-full" /> : (
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select an employee…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="font-mono text-xs text-muted-foreground mr-2">{e.employeeCode}</span>
                      {e.firstName} {e.lastName ?? ''} — {e.designation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {!employeeId ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Select an employee to manage their onboarding.</CardContent></Card>
      ) : loadingTasks ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Mail className="size-4 text-emerald-600" />Letters &amp; Portal Access</CardTitle>
              <CardDescription>Sends an email to {selectedEmployee?.email} and saves a copy on file.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={sendingLetter === 'offer'} onClick={() => handleSendLetter('offer')}>
                {sendingLetter === 'offer' ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}Send Offer Letter
              </Button>
              <Button variant="outline" disabled={sendingLetter === 'appointment'} onClick={() => handleSendLetter('appointment')}>
                {sendingLetter === 'appointment' ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}Send Appointment Letter
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={activatingPortal} onClick={handleActivatePortal}>
                {activatingPortal ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Activate ESS Portal
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ListChecks className="size-4 text-emerald-600" />Onboarding Checklist</CardTitle>
              {tasks.length === 0 && (
                <Button size="sm" onClick={handleSeedChecklist} disabled={seeding} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {seeding ? <Loader2 className="size-4 animate-spin" /> : null}Create Checklist
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No checklist yet — click &quot;Create Checklist&quot; to generate the standard onboarding tasks.</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <label key={t.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm cursor-pointer">
                      <Checkbox checked={t.isCompleted} onCheckedChange={() => handleToggleTask(t)} />
                      <span className={t.isCompleted ? 'line-through text-muted-foreground' : ''}>{t.taskName}</span>
                      {t.isCompleted ? <CheckCircle2 className="size-4 text-emerald-600 ml-auto" /> : <Circle className="size-4 text-muted-foreground ml-auto" />}
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Package className="size-4 text-emerald-600" />Asset Allocation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label>Asset Type</Label>
                  <Select value={assetType} onValueChange={setAssetType}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="laptop">Laptop</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="id_card">ID Card</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Brand</Label><Input value={assetBrand} onChange={(e) => setAssetBrand(e.target.value)} placeholder="e.g. Dell, Apple" className="w-[160px]" /></div>
                <div className="space-y-1.5"><Label>Model</Label><Input value={assetModel} onChange={(e) => setAssetModel(e.target.value)} placeholder="e.g. Latitude 5420" className="w-[180px]" /></div>
                <div className="space-y-1.5"><Label>{ASSET_TAG_LABEL[assetType]}</Label><Input value={assetTag} onChange={(e) => setAssetTag(e.target.value)} className="w-[180px]" /></div>
                <div className="space-y-1.5">
                  <Label>Condition</Label>
                  <Select value={assetCondition} onValueChange={setAssetCondition}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="damaged">Damaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {assetType === 'laptop' && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5"><Label>Laptop Name</Label><Input value={assetLaptopName} onChange={(e) => setAssetLaptopName(e.target.value)} placeholder="e.g. LAP-EMP001" /></div>
                  <div className="space-y-1.5"><Label>Laptop Login ID</Label><Input value={assetLaptopLoginId} onChange={(e) => setAssetLaptopLoginId(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Laptop Password</Label><Input type="password" value={assetLaptopPassword} onChange={(e) => setAssetLaptopPassword(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Laptop PIN</Label><Input type="password" value={assetLaptopPin} onChange={(e) => setAssetLaptopPin(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Charger Serial No</Label><Input value={assetChargerSerialNo} onChange={(e) => setAssetChargerSerialNo(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Charger Wire Serial No</Label><Input value={assetChargerWireSerialNo} onChange={(e) => setAssetChargerWireSerialNo(e.target.value)} /></div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Input value={assetNotes} onChange={(e) => setAssetNotes(e.target.value)} placeholder="Any other detail worth recording" />
              </div>
              <Button onClick={handleAllocateAsset} disabled={allocating} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {allocating ? <Loader2 className="size-4 animate-spin" /> : null}Allocate
              </Button>
              <Separator />
              {assets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No assets allocated yet.</p>
              ) : (
                <div className="divide-y">
                  {assets.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <span className="font-medium capitalize">{a.assetType.replace('_', ' ')}</span>{' '}
                        {(a.brand || a.model) && <span>{[a.brand, a.model].filter(Boolean).join(' ')} </span>}
                        {a.assetTag && <span className="text-muted-foreground">({a.assetTag})</span>}
                        {a.condition && <span className="text-muted-foreground capitalize"> · {a.condition}</span>}
                        {a.assetType === 'laptop' && (a.laptopName || a.laptopLoginId) && (
                          <p className="text-xs text-muted-foreground">
                            {a.laptopName && <>Name: {a.laptopName}</>}{a.laptopName && a.laptopLoginId ? ' · ' : ''}{a.laptopLoginId && <>Login ID: {a.laptopLoginId}</>}
                          </p>
                        )}
                        {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {a.returnedDate ? (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">Returned</Badge>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleReturnAsset(a.id)}>Mark Returned</Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditAsset(a)} title="Edit"><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" className="size-8 text-red-600" onClick={() => handleDeleteAsset(a.id)} title="Delete"><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
        </TabsContent>

        <TabsContent value="invites" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Send className="size-4 text-emerald-600" />Send Self-Onboarding Invite</CardTitle>
              <CardDescription>The new joiner fills in their own details and uploads documents via a link — no login required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={inviteSource === 'manual' ? 'default' : 'outline'} className={inviteSource === 'manual' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''} onClick={() => { setInviteSource('manual'); resetInviteForm(); }}>Manual Entry</Button>
                <Button type="button" size="sm" variant={inviteSource === 'candidate' ? 'default' : 'outline'} className={inviteSource === 'candidate' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''} onClick={() => { setInviteSource('candidate'); resetInviteForm(); }}>From Candidate</Button>
              </div>

              {inviteSource === 'candidate' && (
                <div className="space-y-1.5 max-w-md">
                  <Label>Candidate</Label>
                  <Select value={candidateId} onValueChange={handlePickCandidate}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select a candidate…" /></SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName ?? ''} — {c.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Name, email, role, and joining date will be prefilled — you can still edit them below.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>First Name</Label><Input value={invFirstName} onChange={(e) => setInvFirstName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Last Name</Label><Input value={invLastName} onChange={(e) => setInvLastName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={invPhone} onChange={(e) => setInvPhone(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Designation</Label><Input value={invDesignation} onChange={(e) => setInvDesignation(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Department</Label><Input value={invDepartment} onChange={(e) => setInvDepartment(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Client (optional)</Label><Input value={invClient} onChange={(e) => setInvClient(e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Employment Type</Label>
                  <Select value={invEmploymentType} onValueChange={setInvEmploymentType}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="permanent">Permanent</SelectItem>
                      <SelectItem value="contractor">Contractor</SelectItem>
                      <SelectItem value="daily_wage">Daily Wage</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Date of Joining</Label><Input type="date" value={invDateOfJoining} onChange={(e) => setInvDateOfJoining(e.target.value)} /></div>
              </div>

              <Button
                onClick={handleSendInvite}
                disabled={sendingInvite || !invFirstName.trim() || !invEmail.trim() || !invDesignation.trim() || !invDepartment.trim() || !invDateOfJoining}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {sendingInvite ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Send Invite
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><FileCheck2 className="size-4 text-emerald-600" />All Invites</CardTitle>
              <Select value={inviteStatusFilter} onValueChange={setInviteStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Needs Correction</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {loadingInvites ? (
                <Skeleton className="h-40 w-full" />
              ) : invites.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No onboarding invites yet.</p>
              ) : (
                <div className="divide-y">
                  {invites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-3 text-sm gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{inv.employee.firstName} {inv.employee.lastName ?? ''}</span>
                          <span className="font-mono text-xs text-muted-foreground">{inv.employee.employeeCode}</span>
                          <Badge variant="outline" className={INVITE_STATUS_STYLE[inv.status]}>{INVITE_STATUS_LABEL[inv.status] ?? inv.status}</Badge>
                          {inv.isExpired && inv.status !== 'approved' && inv.status !== 'revoked' && (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Expired</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{inv.employee.designation} · {inv.employee.department} · {inv.employee.email}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {inv.status === 'submitted' && (
                          <Button variant="outline" size="sm" onClick={() => openReview(inv.id)}>
                            <Eye className="size-4" />Review
                          </Button>
                        )}
                        {inv.status !== 'approved' && (
                          <>
                            <Button variant="ghost" size="icon" className="size-8" disabled={actingInviteId === inv.id} onClick={() => handleResendInvite(inv.id)} title="Resend / regenerate link">
                              {actingInviteId === inv.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
                            </Button>
                            {inv.status !== 'revoked' && (
                              <Button variant="ghost" size="icon" className="size-8 text-red-600" disabled={actingInviteId === inv.id} onClick={() => handleRevokeInvite(inv.id)} title="Revoke">
                                <Ban className="size-4" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!reviewInviteId} onOpenChange={(open) => { if (!open) setReviewInviteId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Onboarding Submission</DialogTitle>
            <DialogDescription>Check the details and documents below before approving.</DialogDescription>
          </DialogHeader>
          {loadingReview || !reviewDetail ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border divide-y text-sm">
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Name</span><span>{reviewDetail.employee.firstName} {reviewDetail.employee.lastName ?? ''}</span></div>
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Phone</span><span>{String(reviewDetail.employee.phone ?? '—')}</span></div>
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Date of Birth</span><span>{reviewDetail.employee.dateOfBirth ? String(reviewDetail.employee.dateOfBirth).slice(0, 10) : '—'}</span></div>
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">PAN</span><span>{String(reviewDetail.employee.panNumber ?? '—')}</span></div>
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Aadhaar</span><span>{String(reviewDetail.employee.aadhaarNumber ?? '—')}</span></div>
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Bank</span><span>{String(reviewDetail.employee.bankName ?? '—')} {reviewDetail.employee.bankAccountNumber ? `(${String(reviewDetail.employee.bankAccountNumber)})` : ''}</span></div>
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">IFSC</span><span>{String(reviewDetail.employee.bankIfsc ?? '—')}</span></div>
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Current Address</span><span>{String(reviewDetail.employee.currentAddress ?? '—')}</span></div>
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Permanent Address</span><span>{String(reviewDetail.employee.permanentAddress ?? '—')}</span></div>
                <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Emergency Contact</span><span>{String(reviewDetail.employee.emergencyContact ?? '—')}</span></div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Documents</Label>
                {reviewDetail.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {reviewDetail.documents.map((d) => (
                      <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 cursor-pointer">
                          {DOC_TYPE_LABEL[d.docType] ?? d.docType}<ExternalLink className="size-3" />
                        </Badge>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {reviewDecision === 'rejected' && (
                <div className="space-y-1.5">
                  <Label>What needs to be corrected?</Label>
                  <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="e.g. Bank IFSC code looks incorrect, please re-check." />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {reviewDecision === 'rejected' ? (
              <>
                <Button variant="outline" onClick={() => setReviewDecision(null)}>Back</Button>
                <Button variant="destructive" disabled={submittingReview} onClick={() => handleSubmitReview('rejected')}>
                  {submittingReview ? <Loader2 className="size-4 animate-spin" /> : null}Send Back for Correction
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" disabled={submittingReview || loadingReview} onClick={() => setReviewDecision('rejected')}>Request Correction</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={submittingReview || loadingReview} onClick={() => handleSubmitReview('approved')}>
                  {submittingReview ? <Loader2 className="size-4 animate-spin" /> : null}Approve &amp; Activate
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAsset} onOpenChange={(open) => { if (!open) setEditingAsset(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Asset Type</Label>
                <Select value={editAssetType} onValueChange={setEditAssetType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="laptop">Laptop</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="id_card">ID Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select value={editAssetCondition} onValueChange={setEditAssetCondition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Brand</Label><Input value={editAssetBrand} onChange={(e) => setEditAssetBrand(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Model</Label><Input value={editAssetModel} onChange={(e) => setEditAssetModel(e.target.value)} /></div>
              <div className="space-y-1.5 col-span-2"><Label>{ASSET_TAG_LABEL[editAssetType]}</Label><Input value={editAssetTag} onChange={(e) => setEditAssetTag(e.target.value)} /></div>
            </div>
            {editAssetType === 'laptop' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Laptop Name</Label><Input value={editAssetLaptopName} onChange={(e) => setEditAssetLaptopName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Laptop Login ID</Label><Input value={editAssetLaptopLoginId} onChange={(e) => setEditAssetLaptopLoginId(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Laptop Password</Label><Input type="password" value={editAssetLaptopPassword} onChange={(e) => setEditAssetLaptopPassword(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Laptop PIN</Label><Input type="password" value={editAssetLaptopPin} onChange={(e) => setEditAssetLaptopPin(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Charger Serial No</Label><Input value={editAssetChargerSerialNo} onChange={(e) => setEditAssetChargerSerialNo(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Charger Wire Serial No</Label><Input value={editAssetChargerWireSerialNo} onChange={(e) => setEditAssetChargerWireSerialNo(e.target.value)} /></div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input value={editAssetNotes} onChange={(e) => setEditAssetNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAsset(null)}>Cancel</Button>
            <Button onClick={handleSaveEditAsset} disabled={savingEdit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingEdit ? <Loader2 className="size-4 animate-spin" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

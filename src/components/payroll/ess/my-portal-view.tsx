'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserCircle, Loader2, Plus, Trash2, Upload, Download, Printer,
  FileText, Award, Wallet, PiggyBank, Receipt, Save, HandCoins,
  Package, TrendingUp, DoorOpen, Send, Clock, ScanFace, ShieldCheck,
  ListChecks, CheckCircle2, Circle, MapPin,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { usePayrollStore } from '@/store/payroll-store';
import { loadFaceModels, captureFaceDescriptor, describeCameraError } from '@/lib/face-recognition-client';

// Bounds the face-enrollment API call so a stalled/slow request fails fast with a clear error
// instead of leaving the "Capture & Enroll" button spinning forever.
const FACE_ENROLLMENT_REQUEST_TIMEOUT_MS = 15000;

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOLIDAY_CATEGORY_LABEL: Record<string, string> = { national: 'National', festival: 'Festival', other: 'Other' };
const HOLIDAY_YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current - 1; y <= current + 2; y++) years.push(y);
  return years;
})();

const STATUS_BADGE: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  absent: 'bg-red-100 text-red-700 border-red-200',
  'half-day': 'bg-amber-100 text-amber-700 border-amber-200',
  holiday: 'bg-purple-100 text-purple-700 border-purple-200',
  'weekly-off': 'bg-gray-100 text-gray-600 border-gray-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
  verified: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  paid: 'bg-slate-100 text-slate-800 border-slate-200',
  open: 'bg-amber-100 text-amber-800 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  resolved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
};
const badge = (status: string) => STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600 border-gray-200';

interface Profile {
  id: string; employeeCode: string; firstName: string; lastName: string | null;
  email: string; phone: string | null; designation: string; department: string;
  dateOfJoining: string; gender: string; dateOfBirth: string | null; bloodGroup: string | null;
  emergencyContact: string | null; currentAddress: string | null; permanentAddress: string | null;
  panNumber: string | null; aadhaarNumber: string | null; uanNumber: string | null; esiNumber: string | null;
  bankName: string | null; bankAccountNumber: string | null; bankIfsc: string | null;
  employmentType: string;
  company: { name: string; address: string | null };
  salaryStructure: { basic: number; houseRentAllowance: number } | null;
  familyMembers: { id: string; name: string; relation: string; occupation: string | null; isDependent: boolean }[];
  education: { id: string; degree: string; institution: string; yearOfPassing: number; grade: string | null }[];
  experiences: { id: string; companyName: string; designation: string; fromDate: string; toDate: string | null }[];
}

export default function MyPortalView() {
  const { refreshKey } = usePayrollStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');
  // Set by HolidaysTab's "Apply as Leave" button, consumed once by LeavesTab to pre-open its
  // Apply dialog with that date — a one-shot handoff between two independent sibling tabs.
  const [leavePrefillDate, setLeavePrefillDate] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await fetch('/api/ess/profile');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load profile');
      setProfile(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile, refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <UserCircle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Portal</h1>
          <p className="text-sm text-muted-foreground">
            {loadingProfile ? 'Loading…' : profile ? `${profile.firstName} ${profile.lastName ?? ''} · ${profile.employeeCode}` : ''}
          </p>
        </div>
      </div>

      {loadingProfile ? (
        <Skeleton className="h-64 w-full" />
      ) : !profile ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Could not load your profile.</CardContent></Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="leaves">Leaves</TabsTrigger>
            <TabsTrigger value="holidays">Holidays</TabsTrigger>
            <TabsTrigger value="payslip">Payslips</TabsTrigger>
            <TabsTrigger value="form16">Form 16</TabsTrigger>
            <TabsTrigger value="loans">Loans</TabsTrigger>
            <TabsTrigger value="hiring-incentives">Hiring Incentives</TabsTrigger>
            <TabsTrigger value="investment">Investment Declaration</TabsTrigger>
            <TabsTrigger value="expenses">Expense Claims</TabsTrigger>
            <TabsTrigger value="assets">My Assets</TabsTrigger>
            <TabsTrigger value="resignation">Resignation</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6"><ProfileTab profile={profile} onSaved={fetchProfile} /></TabsContent>
          <TabsContent value="documents" className="space-y-6"><DocumentsTab employeeId={profile.id} /></TabsContent>
          <TabsContent value="attendance" className="space-y-6"><AttendanceTab /></TabsContent>
          <TabsContent value="leaves" className="space-y-6">
            <LeavesTab prefillDate={leavePrefillDate} onPrefillConsumed={() => setLeavePrefillDate(null)} />
          </TabsContent>
          <TabsContent value="holidays" className="space-y-6">
            <HolidaysTab onApplyAsLeave={(date) => { setLeavePrefillDate(date); setActiveTab('leaves'); }} />
          </TabsContent>
          <TabsContent value="payslip" className="space-y-6"><PayslipTab /></TabsContent>
          <TabsContent value="form16" className="space-y-6"><Form16Tab /></TabsContent>
          <TabsContent value="loans" className="space-y-6"><LoansTab /></TabsContent>
          <TabsContent value="hiring-incentives" className="space-y-6"><HiringIncentivesTab /></TabsContent>
          <TabsContent value="investment" className="space-y-6"><InvestmentTab /></TabsContent>
          <TabsContent value="expenses" className="space-y-6"><ExpensesTab /></TabsContent>
          <TabsContent value="assets" className="space-y-6"><AssetsTab employeeId={profile.id} /></TabsContent>
          <TabsContent value="resignation" className="space-y-6"><ResignationTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Profile Tab                                                        */
/* ------------------------------------------------------------------ */

function ProfileTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [bloodGroup, setBloodGroup] = useState(profile.bloodGroup ?? '');
  const [emergencyContact, setEmergencyContact] = useState(profile.emergencyContact ?? '');
  const [currentAddress, setCurrentAddress] = useState(profile.currentAddress ?? '');
  const [permanentAddress, setPermanentAddress] = useState(profile.permanentAddress ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ess/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, bloodGroup, emergencyContact, currentAddress, permanentAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success('Profile updated');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
          <CardDescription>Designation, bank, and statutory numbers are read-only here — contact HR to correct those.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Designation</span><div className="font-medium">{profile.designation}</div></div>
            <div><span className="text-muted-foreground">Department</span><div className="font-medium">{profile.department}</div></div>
            <div><span className="text-muted-foreground">Date of Joining</span><div className="font-medium">{fmtDate(profile.dateOfJoining)}</div></div>
            <div><span className="text-muted-foreground">Employment Type</span><div className="font-medium capitalize">{profile.employmentType.replace('_', ' ')}</div></div>
            <div><span className="text-muted-foreground">PAN</span><div className="font-mono">{profile.panNumber ?? '—'}</div></div>
            <div><span className="text-muted-foreground">UAN</span><div className="font-mono">{profile.uanNumber ?? '—'}</div></div>
            <div><span className="text-muted-foreground">Bank Account</span><div className="font-mono">{profile.bankAccountNumber ?? '—'} ({profile.bankIfsc ?? '—'})</div></div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
            </div>
            <div className="space-y-1.5">
              <Label>Blood Group</Label>
              <Input value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="e.g. O+" />
            </div>
            <div className="space-y-1.5">
              <Label>Emergency Contact</Label>
              <Input value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="Name, phone" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Current Address</Label>
              <Textarea value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Permanent Address</Label>
              <Textarea value={permanentAddress} onChange={(e) => setPermanentAddress(e.target.value)} rows={2} />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <FamilyCard employeeId={profile.id} members={profile.familyMembers} onChanged={onSaved} />
      <EducationCard employeeId={profile.id} records={profile.education} onChanged={onSaved} />
      <ExperienceCard employeeId={profile.id} records={profile.experiences} onChanged={onSaved} />
      <ShiftCard employeeId={profile.id} />
      <WorkLocationCard employeeId={profile.id} />
      <OnboardingChecklistCard employeeId={profile.id} />
      <SalaryHistoryCard employeeId={profile.id} />
    </>
  );
}

function ShiftCard({ employeeId }: { employeeId: string }) {
  const [assignment, setAssignment] = useState<{
    effectiveFrom: string;
    shift: { name: string; startTime: string; endTime: string; gracePeriodMinutes: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/employees/${employeeId}/shift`)
      .then((r) => r.json())
      .then((d) => setAssignment(d.data ?? null))
      .catch(() => toast.error('Failed to load shift'))
      .finally(() => setLoading(false));
  }, [employeeId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="size-4 text-emerald-600" />
          My Shift
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : !assignment ? (
          <p className="text-sm text-muted-foreground py-2 text-center">No shift assigned yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><p className="text-muted-foreground">Shift</p><p className="font-medium">{assignment.shift.name}</p></div>
            <div><p className="text-muted-foreground">Start</p><p className="font-medium">{assignment.shift.startTime}</p></div>
            <div><p className="text-muted-foreground">End</p><p className="font-medium">{assignment.shift.endTime}</p></div>
            <div><p className="text-muted-foreground">Grace Period</p><p className="font-medium">{assignment.shift.gracePeriodMinutes} min</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkLocationCard({ employeeId }: { employeeId: string }) {
  const [exempt, setExempt] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [empRes, locRes] = await Promise.all([
          fetch(`/api/employees/${employeeId}`),
          fetch('/api/office-locations'),
        ]);
        const emp = await empRes.json();
        const locJson = await locRes.json();
        setExempt(!!emp.exemptFromGeofence);
        if (emp.officeLocationId) {
          const loc = (locJson.data ?? []).find((l: { id: string; name: string }) => l.id === emp.officeLocationId);
          setLocationName(loc?.name ?? null);
        }
      } catch {
        /* non-critical, card just shows the default state */
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  if (loading) return <Skeleton className="h-20 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="size-4 text-emerald-600" />
          Work Location
        </CardTitle>
        <CardDescription>Where your punches are geofenced against, if your admin has location enforcement on</CardDescription>
      </CardHeader>
      <CardContent>
        {exempt ? (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">Work From Home — exempt from office geofence</Badge>
        ) : locationName ? (
          <p className="text-sm">Assigned to <span className="font-medium">{locationName}</span></p>
        ) : (
          <p className="text-sm text-muted-foreground">Head office (default)</p>
        )}
      </CardContent>
    </Card>
  );
}

function OnboardingChecklistCard({ employeeId }: { employeeId: string }) {
  const [tasks, setTasks] = useState<{ id: string; taskName: string; isCompleted: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/onboarding/tasks?employeeId=${employeeId}`)
      .then((r) => r.json())
      .then((d) => setTasks(d.data ?? []))
      .catch(() => toast.error('Failed to load onboarding checklist'))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) return <Skeleton className="h-24 w-full" />;
  // Nothing seeded for this employee yet (e.g. hired before this checklist existed) — no
  // point showing an empty card for something HR never started tracking.
  if (tasks.length === 0) return null;

  const completedCount = tasks.filter((t) => t.isCompleted).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="size-4 text-emerald-600" />
          Onboarding Checklist
        </CardTitle>
        <CardDescription>{completedCount} of {tasks.length} steps completed by HR — read-only, contact HR with questions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            {t.isCompleted ? <CheckCircle2 className="size-4 text-emerald-600 shrink-0" /> : <Circle className="size-4 text-muted-foreground shrink-0" />}
            <span className={t.isCompleted ? '' : 'text-muted-foreground'}>{t.taskName}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SalaryHistoryCard({ employeeId }: { employeeId: string }) {
  const [revisions, setRevisions] = useState<{
    id: string; effectiveDate: string; reason: string;
    previousBasic: number; newBasic: number; previousGross: number; newGross: number; notes: string | null;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/employees/${employeeId}/salary-revisions`)
      .then((r) => r.json())
      .then((d) => setRevisions(d.data ?? []))
      .catch(() => toast.error('Failed to load salary history'))
      .finally(() => setLoading(false));
  }, [employeeId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="size-4 text-emerald-600" />
          Salary History
        </CardTitle>
        <CardDescription>Past revisions to your basic and gross salary</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No salary revisions on record yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Effective Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Gross</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revisions.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.effectiveDate)}</TableCell>
                  <TableCell className="capitalize">{r.reason}</TableCell>
                  <TableCell className="text-right">
                    {fmt(r.previousBasic)} → <span className="font-medium">{fmt(r.newBasic)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(r.previousGross)} → <span className="font-medium">{fmt(r.newGross)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function FamilyCard({ members, onChanged }: { employeeId: string; members: Profile['familyMembers']; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('spouse');
  const [occupation, setOccupation] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/ess/family', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), relation, occupation: occupation.trim() || null, isDependent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      toast.success('Family member added');
      setOpen(false); setName(''); setOccupation('');
      onChanged();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to add'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/ess/family/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      onChanged();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Family Details</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Add</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Family Member</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Relation</Label>
                <Select value={relation} onValueChange={setRelation}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spouse">Spouse</SelectItem>
                    <SelectItem value="father">Father</SelectItem>
                    <SelectItem value="mother">Mother</SelectItem>
                    <SelectItem value="child">Child</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Occupation</Label><Input value={occupation} onChange={(e) => setOccupation(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No family members added yet.</p>
        ) : (
          <div className="divide-y">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                <div><span className="font-medium">{m.name}</span> <span className="text-muted-foreground capitalize">— {m.relation}{m.occupation ? `, ${m.occupation}` : ''}</span></div>
                <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => handleDelete(m.id)}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EducationCard({ records, onChanged }: { employeeId: string; records: Profile['education']; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [degree, setDegree] = useState('');
  const [institution, setInstitution] = useState('');
  const [yearOfPassing, setYearOfPassing] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!degree.trim() || !institution.trim() || !yearOfPassing) { toast.error('All fields are required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/ess/education', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ degree: degree.trim(), institution: institution.trim(), yearOfPassing: Number(yearOfPassing) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      toast.success('Education added');
      setOpen(false); setDegree(''); setInstitution(''); setYearOfPassing('');
      onChanged();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to add'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/ess/education/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      onChanged();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Education</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Add</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Education</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Degree</Label><Input value={degree} onChange={(e) => setDegree(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Institution</Label><Input value={institution} onChange={(e) => setInstitution(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year of Passing</Label><Input type="number" value={yearOfPassing} onChange={(e) => setYearOfPassing(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No education records added yet.</p>
        ) : (
          <div className="divide-y">
            {records.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div><span className="font-medium">{r.degree}</span> <span className="text-muted-foreground">— {r.institution}, {r.yearOfPassing}</span></div>
                <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => handleDelete(r.id)}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExperienceCard({ records, onChanged }: { employeeId: string; records: Profile['experiences']; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!companyName.trim() || !designation.trim() || !fromDate) { toast.error('Company, designation, and from date are required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/ess/experience', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: companyName.trim(), designation: designation.trim(), fromDate, toDate: toDate || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      toast.success('Experience added');
      setOpen(false); setCompanyName(''); setDesignation(''); setFromDate(''); setToDate('');
      onChanged();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to add'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/ess/experience/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      onChanged();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Prior Experience</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Add</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Experience</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Company</Label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No prior experience added yet.</p>
        ) : (
          <div className="divide-y">
            {records.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div><span className="font-medium">{r.designation}</span> <span className="text-muted-foreground">at {r.companyName} ({fmtDate(r.fromDate)} – {r.toDate ? fmtDate(r.toDate) : 'Present'})</span></div>
                <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => handleDelete(r.id)}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Documents Tab                                                      */
/* ------------------------------------------------------------------ */

interface DocRow { id: string; docType: string; fileName: string; verifiedStatus: string; createdAt: string; }

function DocumentsTab({ employeeId }: { employeeId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState('pan');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents?employeeId=${employeeId}`);
      const data = await res.json();
      setDocs(data.data ?? []);
    } catch { toast.error('Failed to load documents'); } finally { setLoading(false); }
  }, [employeeId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async () => {
    if (!file) { toast.error('Select a file first'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', docType);
      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast.success('Document uploaded — pending HR verification');
      setFile(null);
      fetchDocs();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Upload failed'); } finally { setUploading(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My Documents</CardTitle>
        <CardDescription>Upload ID proofs for HR to verify. Accepted: JPEG, PNG, PDF (max 10MB).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pan">PAN Card</SelectItem>
                <SelectItem value="aadhaar">Aadhaar Card</SelectItem>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>File</Label>
            <Input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button onClick={handleUpload} disabled={uploading || !file} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload
          </Button>
        </div>
        <Separator />
        {loading ? <Skeleton className="h-24 w-full" /> : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No documents uploaded yet.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead>Uploaded</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="capitalize">{d.docType.replace('_', ' ')}</TableCell>
                  <TableCell className="truncate max-w-[200px]">{d.fileName}</TableCell>
                  <TableCell><Badge variant="outline" className={badge(d.verifiedStatus)}>{d.verifiedStatus}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => window.open(`/api/documents/${d.id}`, '_blank')}><Download className="size-3.5 mr-1" />Download</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Attendance Tab                                                     */
/* ------------------------------------------------------------------ */

interface RegularizationRow {
  id: string;
  date: string;
  requestedPunchIn: string | null;
  requestedPunchOut: string | null;
  reason: string;
  status: string;
  reviewComment: string | null;
}

function AttendanceTab() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [records, setRecords] = useState<{ id: string; date: string; status: string; punchIn: string | null; punchOut: string | null; totalHours: number | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const [requests, setRequests] = useState<RegularizationRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [reqDate, setReqDate] = useState('');
  const [reqPunchIn, setReqPunchIn] = useState('');
  const [reqPunchOut, setReqPunchOut] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ess/attendance?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((d) => setRecords(d.data ?? []))
      .catch(() => toast.error('Failed to load attendance'))
      .finally(() => setLoading(false));
  }, [month, year]);

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const res = await fetch('/api/attendance-regularizations');
      const data = await res.json();
      setRequests(data.data ?? []);
    } catch {
      toast.error('Failed to load correction requests');
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleSubmitRequest = async () => {
    if (!reqDate) { toast.error('Date is required.'); return; }
    if (!reqPunchIn && !reqPunchOut) { toast.error('Enter at least a punch-in or punch-out time.'); return; }
    if (!reqReason.trim()) { toast.error('Reason is required.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/attendance-regularizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: reqDate,
          requestedPunchIn: reqPunchIn ? `${reqDate}T${reqPunchIn}:00.000Z` : null,
          requestedPunchOut: reqPunchOut ? `${reqDate}T${reqPunchOut}:00.000Z` : null,
          reason: reqReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      toast.success('Correction request submitted');
      setOpen(false);
      setReqDate(''); setReqPunchIn(''); setReqPunchOut(''); setReqReason('');
      fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">My Attendance</CardTitle>
            <div className="flex gap-3 pt-2">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-[100px]" />
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Request Correction</Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Attendance Correction</DialogTitle>
                <DialogDescription>Missed a punch-in or punch-out? Ask your manager or HR to add or fix it.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={reqDate} onChange={(e) => setReqDate(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Punch In (optional)</Label><Input type="time" value={reqPunchIn} onChange={(e) => setReqPunchIn(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Punch Out (optional)</Label><Input type="time" value={reqPunchOut} onChange={(e) => setReqPunchOut(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reqReason} onChange={(e) => setReqReason(e.target.value)} rows={2} placeholder="e.g. Forgot to punch out before leaving" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmitRequest} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">Submit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-40 w-full" /> : records.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No attendance records for this month.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Punch In</TableHead><TableHead>Punch Out</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{fmtDate(r.date)}</TableCell>
                    <TableCell><Badge variant="outline" className={badge(r.status)}>{r.status}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.punchIn ? new Date(r.punchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.punchOut ? new Date(r.punchOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--'}</TableCell>
                    <TableCell className="text-right">{r.totalHours ?? '--'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">My Correction Requests</CardTitle></CardHeader>
        <CardContent>
          {requestsLoading ? <Skeleton className="h-24 w-full" /> : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No correction requests yet.</p>
          ) : (
            <div className="divide-y">
              {requests.map((r) => (
                <div key={r.id} className="py-2.5 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{fmtDate(r.date)}</span>
                    <Badge variant="outline" className={badge(r.status)}>{r.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.requestedPunchIn && <>In: {new Date(r.requestedPunchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} </>}
                    {r.requestedPunchOut && <>Out: {new Date(r.requestedPunchOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.reason}</p>
                  {r.reviewComment && <p className="text-xs italic text-muted-foreground">HR/Manager: {r.reviewComment}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FaceEnrollmentCard />
    </>
  );
}

interface FaceEnrollmentStatus {
  enrolled: boolean;
  enrolledAt?: string;
  consentedAt?: string;
}

function FaceEnrollmentCard() {
  const [status, setStatus] = useState<FaceEnrollmentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ess/face-enrollment');
      const data = await res.json();
      setStatus(data.data ?? { enrolled: false });
    } catch {
      toast.error('Failed to load face enrollment status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  // Camera only ever turns on after explicit consent, and always stops the moment the dialog
  // closes for any reason (cancel, success, or unmount) — never lingers running in the background.
  useEffect(() => {
    if (!open || !consent) return;
    let cancelled = false;
    setCameraError(null);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      } catch (err) {
        if (!cancelled) setCameraError(describeCameraError(err));
      }
      try {
        await loadFaceModels();
        if (!cancelled) setModelsReady(true);
      } catch {
        if (!cancelled) setCameraError('Failed to load the face recognition models. Check your connection and try again.');
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, consent, stopCamera]);

  const closeDialog = () => {
    stopCamera();
    setOpen(false);
    setConsent(false);
    setModelsReady(false);
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    setCapturing(true);
    try {
      const result = await captureFaceDescriptor(videoRef.current);
      if (!result.ok) {
        toast.error(
          result.reason === 'no-face' ? 'No face detected — center your face in the frame and try again.'
            : result.reason === 'multiple-faces' ? 'More than one face detected — make sure only you are in frame.'
              : result.reason === 'timeout' ? 'Detection timed out — try again.'
                : 'Capture failed. Try again.'
        );
        return;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FACE_ENROLLMENT_REQUEST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch('/api/ess/face-enrollment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ descriptor: result.descriptor, consent: true }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
          throw new Error('Request timed out — check your connection and try again.');
        }
        throw fetchErr;
      } finally {
        clearTimeout(timeoutId);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to enroll');
      toast.success('Face enrolled — you can now use Quick Confirm to punch in/out.');
      closeDialog();
      fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enroll');
    } finally {
      setCapturing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove your enrolled face? Quick Confirm punch will be unavailable until you re-enroll.')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/ess/face-enrollment', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove enrollment');
      toast.success('Face enrollment removed');
      fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove enrollment');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ScanFace className="size-4 text-emerald-600" />
          Face Recognition
        </CardTitle>
        <CardDescription>Enroll your face once to use Quick Confirm punch — it compares a live capture against this reference every time.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-16 w-full" /> : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {status?.enrolled ? (
                <>
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">Enrolled</Badge>
                  <span className="text-xs text-muted-foreground">since {fmtDate(status.enrolledAt ?? null)}</span>
                </>
              ) : (
                <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">Not enrolled</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                {status?.enrolled ? 'Re-enroll' : 'Enroll My Face'}
              </Button>
              {status?.enrolled && (
                <Button size="sm" variant="ghost" className="text-red-600" disabled={deleting} onClick={handleDelete}>
                  {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Remove
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ScanFace className="size-5 text-emerald-500" />Enroll Your Face</DialogTitle>
            <DialogDescription>This captures a live photo from your camera, converts it into a numeric face descriptor, and stores only that descriptor — never the photo itself.</DialogDescription>
          </DialogHeader>

          {!consent ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
                <p className="flex items-start gap-2"><ShieldCheck className="size-4 shrink-0 mt-0.5 text-emerald-600" />Your camera only turns on after you consent below, and only for this enrollment.</p>
                <p>Used only to verify your identity when you choose Quick Confirm punch. You can remove your enrollment at any time from this screen.</p>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="face-consent" checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
                <Label htmlFor="face-consent" className="cursor-pointer font-normal text-sm">
                  I consent to my camera capturing my face for identity verification, and to storing the resulting face descriptor for that purpose.
                </Label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button disabled={!consent} onClick={() => setConsent(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">Continue</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative w-full aspect-video rounded-lg bg-muted overflow-hidden border">
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-muted/80">
                    <Loader2 className="size-5 animate-spin mr-2" />Starting camera…
                  </div>
                )}
              </div>
              {cameraError && <p className="text-sm text-red-600">{cameraError}</p>}
              {cameraReady && !modelsReady && !cameraError && (
                <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" />Loading face recognition models…</p>
              )}
              <p className="text-xs text-muted-foreground">Look straight at the camera in good lighting, with only your face in frame, then capture.</p>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={capturing}>Cancel</Button>
                <Button onClick={handleCapture} disabled={!cameraReady || !modelsReady || capturing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {capturing ? <Loader2 className="size-4 animate-spin" /> : <ScanFace className="size-4" />}
                  Capture &amp; Enroll
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Leaves Tab                                                         */
/* ------------------------------------------------------------------ */

interface LeaveBalanceRow { id: string; leaveType: { id: string; name: string; shortCode: string }; totalAllocated: number; used: number; carryForwarded: number; }
interface LeaveAppRow { id: string; leaveType: { name: string }; startDate: string; endDate: string; totalDays: number; status: string; reason: string | null; }

function LeavesTab({ prefillDate, onPrefillConsumed }: { prefillDate?: string | null; onPrefillConsumed?: () => void } = {}) {
  const [balances, setBalances] = useState<LeaveBalanceRow[]>([]);
  const [applications, setApplications] = useState<LeaveAppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [applying, setApplying] = useState(false);
  const [filterYear, setFilterYear] = useState(() => new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState('all');

  // Arrived from Holidays tab's "Apply as Leave" — open the dialog pre-filled with that date,
  // then hand back control so a later visit here doesn't keep re-triggering it.
  useEffect(() => {
    if (!prefillDate) return;
    setStartDate(prefillDate);
    setEndDate(prefillDate);
    setApplyOpen(true);
    onPrefillConsumed?.();
  }, [prefillDate, onPrefillConsumed]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const appParams = new URLSearchParams({ year: String(filterYear) });
      if (filterStatus !== 'all') appParams.set('status', filterStatus);
      const [balRes, appRes] = await Promise.all([
        fetch(`/api/ess/leaves/balance?year=${filterYear}`),
        fetch(`/api/ess/leaves?${appParams.toString()}`),
      ]);
      const balData = await balRes.json();
      const appData = await appRes.json();
      setBalances(balData.data ?? []);
      setApplications(appData.data ?? []);
    } catch { toast.error('Failed to load leave data'); } finally { setLoading(false); }
  }, [filterYear, filterStatus]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleApply = async () => {
    if (!leaveTypeId || !startDate || !endDate) { toast.error('All fields are required'); return; }
    setApplying(true);
    try {
      const res = await fetch('/api/ess/leaves', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveTypeId, startDate, endDate, reason: reason.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply');
      toast.success('Leave application submitted');
      setApplyOpen(false); setLeaveTypeId(''); setStartDate(''); setEndDate(''); setReason('');
      fetchAll();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to apply'); } finally { setApplying(false); }
  };

  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/ess/leaves/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      toast.success('Leave cancelled');
      fetchAll();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to cancel'); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {balances.map((b) => (
          <Card key={b.id}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{b.leaveType.name}</p>
              <p className="text-xl font-bold">{(b.totalAllocated + b.carryForwarded - b.used).toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">of {b.totalAllocated + b.carryForwarded} available</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">My Leave Applications</CardTitle>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Year</Label>
              <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(parseInt(v, 10))}>
                <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOLIDAY_YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setApplyOpen(true)}><Plus className="size-4" />Apply for Leave</Button>
            <DialogContent>
              <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Leave Type</Label>
                  <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>{balances.map((b) => <SelectItem key={b.leaveType.id} value={b.leaveType.id}>{b.leaveType.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
                <Button onClick={handleApply} disabled={applying} className="bg-emerald-600 hover:bg-emerald-700 text-white">Submit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No leave applications match these filters.</p>
          ) : (
            <div className="divide-y">
              {applications.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-medium">{a.leaveType.name}</span>{' '}
                    <span className="text-muted-foreground">{fmtDate(a.startDate)} – {fmtDate(a.endDate)} ({a.totalDays}d)</span>
                    {a.reason && <p className="text-xs text-muted-foreground mt-0.5">{a.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={badge(a.status)}>{a.status}</Badge>
                    {(a.status === 'pending' || a.status === 'approved') && (
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleCancel(a.id)}>Cancel</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Holidays Tab                                                       */
/* ------------------------------------------------------------------ */

interface HolidayRow {
  id: string;
  name: string;
  date: string;
  type: string;
  category: string;
}

function HolidaysTab({ onApplyAsLeave }: { onApplyAsLeave?: (date: string) => void } = {}) {
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [weeklyOffLabel, setWeeklyOffLabel] = useState('');
  const [periodMode, setPeriodMode] = useState<'calendar' | 'fy'>('calendar');
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [filterCategory, setFilterCategory] = useState<'all' | 'national' | 'festival' | 'other'>('all');
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const query = periodMode === 'fy' ? `fyStartYear=${periodYear}` : `year=${periodYear}`;
      const [holidaysRes, settingsRes] = await Promise.all([
        fetch(`/api/holidays?${query}`),
        fetch('/api/settings'),
      ]);
      const holidaysJson = await holidaysRes.json();
      setHolidays(holidaysJson.data ?? []);

      const settingsJson = await settingsRes.json();
      const days: number[] = settingsJson.data?.weeklyOffDays ?? [];
      setWeeklyOffLabel(days.map((d) => WEEKDAY_LABELS[d]).join(', '));
    } catch {
      toast.error('Failed to load holidays');
    } finally {
      setLoading(false);
    }
  }, [periodMode, periodYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  const categoryFiltered = filterCategory === 'all' ? holidays : holidays.filter((h) => h.category === filterCategory);
  const mandatoryHolidays = categoryFiltered.filter((h) => h.type !== 'optional');
  const optionalHolidays = categoryFiltered.filter((h) => h.type === 'optional');

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Company Holiday Calendar</CardTitle>
            {weeklyOffLabel && <CardDescription>Your weekly off: {weeklyOffLabel}</CardDescription>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => setPeriodMode('calendar')}
                className={`rounded px-2 py-1 text-xs ${periodMode === 'calendar' ? 'bg-emerald-600 text-white' : 'text-muted-foreground'}`}
              >
                Calendar Year
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode('fy')}
                className={`rounded px-2 py-1 text-xs ${periodMode === 'fy' ? 'bg-emerald-600 text-white' : 'text-muted-foreground'}`}
              >
                Financial Year
              </button>
            </div>
            <Select value={String(periodYear)} onValueChange={(v) => setPeriodYear(parseInt(v, 10))}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOLIDAY_YEAR_OPTIONS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {periodMode === 'fy' ? `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}` : y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as typeof filterCategory)}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="national">National</SelectItem>
                <SelectItem value="festival">Festival</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Mandatory Holidays ({mandatoryHolidays.length})</p>
            <p className="text-xs text-muted-foreground mb-2">Paid company-wide — no application needed.</p>
            {mandatoryHolidays.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No mandatory holidays configured for this period.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {mandatoryHolidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-medium">{h.name}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{fmtDate(h.date)}</span>
                      <Badge variant="outline" className="text-[10px]">{HOLIDAY_CATEGORY_LABEL[h.category] ?? 'Other'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Optional / Festival Holidays ({optionalHolidays.length})</p>
            <p className="text-xs text-muted-foreground mb-2">
              Not automatically paid — if you want one of these days off, apply it as leave against your own Earned, Casual, or Sick Leave balance.
            </p>
            {optionalHolidays.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No optional holidays configured for this period.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {optionalHolidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-medium">{h.name}</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{fmtDate(h.date)}</span>
                        <Badge variant="outline" className="text-[10px]">{HOLIDAY_CATEGORY_LABEL[h.category] ?? 'Other'}</Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onApplyAsLeave?.(h.date.slice(0, 10))}
                      >
                        Apply as Leave
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Payslip Tab                                                        */
/* ------------------------------------------------------------------ */

function PayslipTab() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [slip, setSlip] = useState<{ monthName: string; year: number; totals: { totalEarnings: number; totalDeductions: number; netSalary: number }; earnings: Record<string, number>; deductions: Record<string, number> } | null>(null);

  const handleGenerate = async () => {
    setLoading(true); setSlip(null);
    try {
      const res = await fetch(`/api/ess/payslip?month=${month}&year=${year}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      setSlip(data.data);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to generate payslip'); } finally { setLoading(false); }
  };

  return (
    <Card>
      <style dangerouslySetInnerHTML={{ __html: `@media print { body * { visibility: hidden; } #ess-payslip-preview, #ess-payslip-preview * { visibility: visible; } #ess-payslip-preview { position: absolute; left: 0; top: 0; width: 100%; } #ess-payslip-preview .no-print { display: none !important; } }` }} />
      <CardHeader className="no-print">
        <CardTitle className="text-base flex items-center gap-2"><FileText className="size-4 text-emerald-600" />My Payslips</CardTitle>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-[100px]" />
          <Button onClick={handleGenerate} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}Generate
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {slip && (
          <div id="ess-payslip-preview" className="max-w-lg mx-auto space-y-4 border rounded-lg p-4">
            <h3 className="text-center font-bold">{slip.monthName} {slip.year} Salary Slip</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Total Earnings</p><p className="font-semibold">{fmt(slip.totals.totalEarnings)}</p></div>
              <div><p className="text-muted-foreground">Total Deductions</p><p className="font-semibold">{fmt(slip.totals.totalDeductions)}</p></div>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-emerald-700"><span>Net Salary</span><span>{fmt(slip.totals.netSalary)}</span></div>
            <Button variant="outline" className="w-full no-print" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Form 16 Tab                                                        */
/* ------------------------------------------------------------------ */

function Form16Tab() {
  const now = new Date();
  const currentFyStart = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const [fyStartYear, setFyStartYear] = useState(String(currentFyStart));
  const [loading, setLoading] = useState(false);
  const [form16, setForm16] = useState<{ financialYear: string; grossSalary: { total: number }; totalTaxableIncome: number; taxComputation: { totalTaxPayable: number }; tdsDeducted: { totalDeducted: number } } | null>(null);

  const handleGenerate = async () => {
    setLoading(true); setForm16(null);
    try {
      const res = await fetch(`/api/ess/form16?fyStartYear=${fyStartYear}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      setForm16(data.data);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to generate Form 16'); } finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Award className="size-4 text-emerald-600" />My Form 16 (Part B)</CardTitle>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <Input type="number" value={fyStartYear} onChange={(e) => setFyStartYear(e.target.value)} className="w-[140px]" />
          <Button onClick={handleGenerate} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}Generate
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {form16 && (
          <div className="max-w-lg mx-auto space-y-4 border rounded-lg p-4">
            <h3 className="text-center font-bold">FY {form16.financialYear} — Form 16 Part B</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Gross Salary</p><p className="font-semibold">{fmt(form16.grossSalary.total)}</p></div>
              <div><p className="text-muted-foreground">Taxable Income</p><p className="font-semibold">{fmt(form16.totalTaxableIncome)}</p></div>
              <div><p className="text-muted-foreground">Total Tax Payable</p><p className="font-semibold">{fmt(form16.taxComputation.totalTaxPayable)}</p></div>
              <div><p className="text-muted-foreground">TDS Deducted</p><p className="font-semibold">{fmt(form16.tdsDeducted.totalDeducted)}</p></div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Loans Tab                                                          */
/* ------------------------------------------------------------------ */

const LOAN_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

function LoansTab() {
  const [loans, setLoans] = useState<{ id: string; loanType: string; principal: number; emiAmount: number; totalMonths: number; remainingMonths: number; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [loanType, setLoanType] = useState('loan');
  const [principal, setPrincipal] = useState('');
  const [totalMonths, setTotalMonths] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchLoans = useCallback(() => {
    setLoading(true);
    fetch('/api/ess/loans').then((r) => r.json()).then((d) => setLoans(d.data ?? [])).catch(() => toast.error('Failed to load loans')).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  const hasPending = loans.some((l) => l.status === 'pending');

  const handleSubmit = async () => {
    const principalNum = Number(principal);
    const monthsNum = Number(totalMonths);
    if (!principalNum || principalNum <= 0) { toast.error('Enter a valid amount.'); return; }
    if (!monthsNum || monthsNum <= 0) { toast.error('Enter a valid repayment period.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/ess/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanType, principal: principalNum, totalMonths: monthsNum, reason: reason.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      toast.success('Request submitted — awaiting HR review');
      setOpen(false);
      setPrincipal(''); setTotalMonths(''); setReason('');
      fetchLoans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (id: string) => {
    try {
      const res = await fetch(`/api/ess/loans/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to withdraw request');
      toast.success('Request withdrawn');
      fetchLoans();
    } catch {
      toast.error('Failed to withdraw request');
    }
  };

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Wallet className="size-4 text-emerald-600" />My Loans &amp; Advances</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={hasPending}>
            <Plus className="size-4" />Request Loan/Advance
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request a Loan or Advance</DialogTitle>
              <DialogDescription>Submitted for HR review — nothing is deducted from your salary until it's approved.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={loanType} onValueChange={setLoanType}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loan">Loan</SelectItem>
                    <SelectItem value="advance">Advance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="e.g. 50000" /></div>
                <div className="space-y-1.5"><Label>Repay over (months)</Label><Input type="number" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value)} placeholder="e.g. 10" /></div>
              </div>
              <div className="space-y-1.5"><Label>Reason (optional)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loans.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No loans or advances on record.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Principal</TableHead><TableHead className="text-right">EMI</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {loans.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="capitalize">{l.loanType}</TableCell>
                  <TableCell className="text-right">{fmt(l.principal)}</TableCell>
                  <TableCell className="text-right">{fmt(l.emiAmount)}</TableCell>
                  <TableCell className="text-right">{l.status === 'pending' ? '—' : `${l.remainingMonths} / ${l.totalMonths} mo`}</TableCell>
                  <TableCell><Badge variant="outline" className={LOAN_STATUS_BADGE[l.status] ?? 'capitalize'}>{l.status}</Badge></TableCell>
                  <TableCell>{l.status === 'pending' && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleWithdraw(l.id)}>Withdraw</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Hiring Incentives Tab (read-only — recruiter's own records)        */
/* ------------------------------------------------------------------ */

const INCENTIVE_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  eligible: 'bg-blue-100 text-blue-800 border-blue-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  forfeited: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
};

function HiringIncentivesTab() {
  const [incentives, setIncentives] = useState<{
    id: string;
    candidate: { firstName: string; lastName: string | null; role?: string; client?: string | null };
    employmentType: string;
    amount: number;
    payMonth: number;
    payYear: number;
    status: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ess/hiring-incentives')
      .then((r) => r.json())
      .then((d) => setIncentives(d.data ?? []))
      .catch(() => toast.error('Failed to load hiring incentives'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <HandCoins className="size-4 text-emerald-600" />
          My Hiring Incentives
        </CardTitle>
        <CardDescription>Payouts for candidates you closed — paid out once they complete 1 month</CardDescription>
      </CardHeader>
      <CardContent>
        {incentives.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No hiring incentives on record.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Pay Month</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incentives.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.candidate.firstName} {i.candidate.lastName ?? ''}</TableCell>
                  <TableCell>{i.candidate.client ?? '—'}</TableCell>
                  <TableCell>{i.candidate.role ?? '—'}</TableCell>
                  <TableCell>{i.employmentType === 'permanent' ? 'FTE' : i.employmentType === 'contractor' ? 'Contract' : i.employmentType}</TableCell>
                  <TableCell className="text-right">{fmt(i.amount)}</TableCell>
                  <TableCell>{MONTHS[i.payMonth - 1]} {i.payYear}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={INCENTIVE_STATUS_BADGE[i.status] ?? badge(i.status)}>{i.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Investment Declaration Tab                                         */
/* ------------------------------------------------------------------ */

function InvestmentTab() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [section80C, setSection80C] = useState('0');
  const [section80D, setSection80D] = useState('0');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [proofs, setProofs] = useState<DocRow[]>([]);
  const [proofsLoading, setProofsLoading] = useState(true);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  const fetchDeclaration = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ess/investment-declaration?year=${year}`);
      const data = await res.json();
      if (data.data) {
        setSection80C(String(data.data.section80C));
        setSection80D(String(data.data.section80D));
        setStatus(data.data.status);
      } else {
        setSection80C('0'); setSection80D('0'); setStatus(null);
      }
    } catch { toast.error('Failed to load declaration'); } finally { setLoading(false); }
  }, [year]);

  useEffect(() => { fetchDeclaration(); }, [fetchDeclaration]);

  const fetchProofs = useCallback(async () => {
    setProofsLoading(true);
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      setProofs((data.data ?? []).filter((d: DocRow) => d.docType === 'investment_proof'));
    } catch { toast.error('Failed to load proof documents'); } finally { setProofsLoading(false); }
  }, []);

  useEffect(() => { fetchProofs(); }, [fetchProofs]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ess/investment-declaration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), section80C: Number(section80C), section80D: Number(section80D) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success('Investment declaration saved');
      fetchDeclaration();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSaving(false); }
  };

  const handleUploadProof = async () => {
    if (!proofFile) { toast.error('Select a file first'); return; }
    setUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append('file', proofFile);
      formData.append('docType', 'investment_proof');
      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast.success('Proof uploaded');
      setProofFile(null);
      fetchProofs();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Upload failed'); } finally { setUploadingProof(false); }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><PiggyBank className="size-4 text-emerald-600" />Investment Declaration</CardTitle>
          <CardDescription>Only applies under the Old Tax Regime. HR verifies declarations against submitted proofs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-1.5"><Label>Financial Year (start)</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          {loading ? <Skeleton className="h-24 w-full" /> : (
            <>
              {status && <Badge variant="outline" className={badge(status)}>{status}</Badge>}
              <div className="space-y-1.5"><Label>Section 80C (LIC, PPF, ELSS, etc.)</Label><Input type="number" value={section80C} onChange={(e) => setSection80C(e.target.value)} disabled={status === 'verified'} /></div>
              <div className="space-y-1.5"><Label>Section 80D (health insurance)</Label><Input type="number" value={section80D} onChange={(e) => setSection80D(e.target.value)} disabled={status === 'verified'} /></div>
              <Button onClick={handleSave} disabled={saving || status === 'verified'} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proof Documents</CardTitle>
          <CardDescription>Upload rent receipts, LIC/PPF/ELSS statements, insurance premium receipts, etc. — JPEG, PNG, or PDF (max 10MB).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>File</Label>
              <Input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button onClick={handleUploadProof} disabled={uploadingProof || !proofFile} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {uploadingProof ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload
            </Button>
          </div>
          <Separator />
          {proofsLoading ? <Skeleton className="h-16 w-full" /> : proofs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No proof documents uploaded yet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead>Uploaded</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {proofs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="truncate max-w-[200px]">{d.fileName}</TableCell>
                    <TableCell><Badge variant="outline" className={badge(d.verifiedStatus)}>{d.verifiedStatus}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => window.open(`/api/documents/${d.id}`, '_blank')}><Download className="size-3.5 mr-1" />Download</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Expense Claims Tab                                                 */
/* ------------------------------------------------------------------ */

function ExpensesTab() {
  const [claims, setClaims] = useState<{ id: string; category: string; amount: number; description: string | null; expenseDate: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('travel');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ess/expense-claims');
      const data = await res.json();
      setClaims(data.data ?? []);
    } catch { toast.error('Failed to load expense claims'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const handleSubmit = async () => {
    if (!amount || !expenseDate) { toast.error('Amount and date are required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/ess/expense-claims', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, amount: Number(amount), description: description.trim() || null, expenseDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      toast.success('Expense claim submitted');
      setOpen(false); setAmount(''); setDescription(''); setExpenseDate('');
      fetchClaims();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to submit'); } finally { setSubmitting(false); }
  };

  const handleWithdraw = async (id: string) => {
    try {
      const res = await fetch(`/api/ess/expense-claims/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to withdraw');
      toast.success('Claim withdrawn');
      fetchClaims();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to withdraw'); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Receipt className="size-4 text-emerald-600" />Expense Claims</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setOpen(true)}><Plus className="size-4" />Submit Claim</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit Expense Claim</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="travel">Travel</SelectItem>
                    <SelectItem value="food">Food</SelectItem>
                    <SelectItem value="accommodation">Accommodation</SelectItem>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Expense Date</Label><Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-32 w-full" /> : claims.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No expense claims yet.</p>
        ) : (
          <div className="divide-y">
            {claims.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium capitalize">{c.category}</span> <span className="text-muted-foreground">— {fmt(c.amount)} on {fmtDate(c.expenseDate)}</span>
                  {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={badge(c.status)}>{c.status}</Badge>
                  {c.status === 'pending' && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleWithdraw(c.id)}>Withdraw</Button>}
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
/*  My Assets Tab                                                      */
/* ------------------------------------------------------------------ */

const ASSET_TYPE_LABEL: Record<string, string> = {
  laptop: 'Laptop', phone: 'Phone', id_card: 'ID Card', other: 'Other',
};

function AssetsTab({ employeeId }: { employeeId: string }) {
  const [assets, setAssets] = useState<{
    id: string; assetType: string; assetTag: string | null; brand: string | null; model: string | null;
    allocatedDate: string; returnedDate: string | null; condition: string | null; notes: string | null;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/employees/${employeeId}/assets`)
      .then((r) => r.json())
      .then((d) => setAssets(d.data ?? []))
      .catch(() => toast.error('Failed to load assets'))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="size-4 text-emerald-600" />
          My Assets
        </CardTitle>
        <CardDescription>Company equipment currently or previously assigned to you</CardDescription>
      </CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No assets on record.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Brand / Model</TableHead>
                <TableHead>Tag</TableHead>
                <TableHead>Allocated</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{ASSET_TYPE_LABEL[a.assetType] ?? a.assetType}</TableCell>
                  <TableCell>{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{a.assetTag ?? '—'}</TableCell>
                  <TableCell>{fmtDate(a.allocatedDate)}</TableCell>
                  <TableCell>
                    {a.returnedDate ? fmtDate(a.returnedDate) : <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">With you</Badge>}
                  </TableCell>
                  <TableCell className="capitalize">{a.condition ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{a.notes ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Resignation Tab                                                    */
/* ------------------------------------------------------------------ */

interface ExitRequestRow {
  id: string;
  resignationDate: string;
  noticePeriodDays: number;
  lastWorkingDate: string;
  reason: string | null;
  status: string;
  managerApprovedAt: string | null;
  managerComment: string | null;
  hrApprovedAt: string | null;
  hrComment: string | null;
}

const EXIT_STATUS_LABEL: Record<string, string> = {
  pending_manager: 'Awaiting manager approval',
  pending_hr: 'Awaiting HR approval',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

function ResignationTab() {
  const [existing, setExisting] = useState<ExitRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [resignationDate, setResignationDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchExisting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/exit-requests');
      const json = await res.json();
      const rows: ExitRequestRow[] = json.data ?? [];
      // Self-scoped server-side, so at most one row (ExitRequest.employeeId is unique) —
      // but a rejected/withdrawn one is a closed cycle, not something to display as "current".
      const active = rows.find((r) => r.status !== 'rejected' && r.status !== 'withdrawn');
      setExisting(active ?? null);
    } catch {
      toast.error('Failed to load resignation status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExisting(); }, [fetchExisting]);

  const handleSubmit = async () => {
    if (!resignationDate) {
      toast.error('Resignation date is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/exit-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resignationDate, reason: reason.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit resignation');
      toast.success('Resignation submitted');
      setResignationDate('');
      setReason('');
      fetchExisting();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit resignation');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;

  if (existing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DoorOpen className="size-4 text-emerald-600" />
            Your Resignation
          </CardTitle>
          <CardDescription>Submitted {fmtDate(existing.resignationDate)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge variant="outline" className={badge(existing.status)}>{EXIT_STATUS_LABEL[existing.status] ?? existing.status}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Notice Period</span><div className="font-medium">{existing.noticePeriodDays} days</div></div>
            <div><span className="text-muted-foreground">Last Working Date</span><div className="font-medium">{fmtDate(existing.lastWorkingDate)}</div></div>
          </div>
          {existing.reason && (
            <div className="text-sm"><span className="text-muted-foreground">Your reason:</span> <span>{existing.reason}</span></div>
          )}
          {existing.managerComment && (
            <div className="text-sm rounded-lg border p-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Manager comment</span>
              <p>{existing.managerComment}</p>
            </div>
          )}
          {existing.hrComment && (
            <div className="text-sm rounded-lg border p-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">HR comment</span>
              <p>{existing.hrComment}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DoorOpen className="size-4 text-emerald-600" />
          Submit Your Resignation
        </CardTitle>
        <CardDescription>This starts your manager and HR approval process — your last working date is calculated from your company&apos;s standard notice period.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Resignation Date</Label>
            <Input type="date" value={resignationDate} onChange={(e) => setResignationDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Reason (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </div>
        <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Submit Resignation
        </Button>
      </CardContent>
    </Card>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, Circle, Loader2, Upload, Trash2, ShieldCheck, Clock, XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STEPS = ['Personal & Statutory', 'Bank Details', 'Documents', 'Review & Submit'];

interface EmployeeSnapshot {
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  designation: string;
  department: string;
  dateOfJoining: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string;
  bloodGroup: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  emergencyContact: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
}

interface DocMeta { id: string; docType: string; fileName: string; createdAt: string }

const REQUIRED_DOCS: { type: string; label: string }[] = [
  { type: 'photo', label: 'Photo' },
  { type: 'pan', label: 'PAN Card' },
  { type: 'aadhaar', label: 'Aadhaar Card' },
  { type: 'bank_proof', label: 'Bank Proof (cancelled cheque / passbook)' },
  { type: 'education_certificate', label: 'Education Certificate' },
];
const OPTIONAL_DOCS: { type: string; label: string }[] = [
  { type: 'previous_relieving_letter', label: 'Previous Employer Relieving Letter' },
  { type: 'resume', label: 'Resume' },
];

export default function OnboardingForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [terminalMessage, setTerminalMessage] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [employee, setEmployee] = useState<EmployeeSnapshot | null>(null);
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadType = useRef<string | null>(null);

  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('male');
  const [bloodGroup, setBloodGroup] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');

  const fetchInvite = useCallback(async () => {
    try {
      const res = await fetch(`/api/onboarding-invite/${token}`);
      const json = await res.json();
      if (!res.ok) {
        setTerminalMessage(json.error || 'This onboarding link is not valid.');
        setStatus(null);
        return;
      }
      const data = json.data;
      setStatus(data.status);
      setRejectionReason(data.rejectionReason);
      setEmployee(data.employee);
      setDocuments(data.documents ?? []);
      setPhone(data.employee.phone ?? '');
      setDateOfBirth(data.employee.dateOfBirth ? String(data.employee.dateOfBirth).slice(0, 10) : '');
      setGender(data.employee.gender ?? 'male');
      setBloodGroup(data.employee.bloodGroup ?? '');
      setCurrentAddress(data.employee.currentAddress ?? '');
      setPermanentAddress(data.employee.permanentAddress ?? '');
      setEmergencyContact(data.employee.emergencyContact ?? '');
      setPanNumber(data.employee.panNumber ?? '');
      setAadhaarNumber(data.employee.aadhaarNumber ?? '');
      setBankName(data.employee.bankName ?? '');
      setBankAccountNumber(data.employee.bankAccountNumber ?? '');
      setBankIfsc(data.employee.bankIfsc ?? '');
    } catch {
      setTerminalMessage('Failed to load your onboarding form. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchInvite(); }, [fetchInvite]);

  const saveStep = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/onboarding-invite/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim() || null,
          dateOfBirth: dateOfBirth || null,
          gender,
          bloodGroup: bloodGroup.trim() || null,
          currentAddress: currentAddress.trim() || null,
          permanentAddress: permanentAddress.trim() || null,
          emergencyContact: emergencyContact.trim() || null,
          panNumber: panNumber.trim() || null,
          aadhaarNumber: aadhaarNumber.trim() || null,
          bankName: bankName.trim() || null,
          bankAccountNumber: bankAccountNumber.trim() || null,
          bankIfsc: bankIfsc.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const ok = await saveStep();
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const triggerUpload = (docType: string) => {
    pendingUploadType.current = docType;
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const docType = pendingUploadType.current;
    e.target.value = '';
    if (!file || !docType) return;

    setUploadingType(docType);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', docType);
      const res = await fetch(`/api/onboarding-invite/${token}/documents`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast.success('Uploaded');
      fetchInvite();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingType(null);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      const res = await fetch(`/api/onboarding-invite/${token}/documents/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove document');
      fetchInvite();
    } catch {
      toast.error('Failed to remove document');
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/onboarding-invite/${token}/submit`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      toast.success('Submitted! HR will review your details shortly.');
      fetchInvite();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const docFor = (type: string) => documents.find((d) => d.docType === type);
  const requiredMissing = REQUIRED_DOCS.filter((d) => !docFor(d.type));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="size-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (terminalMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-3">
            <XCircle className="size-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{terminalMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-3">
            <Clock className="size-10 mx-auto text-amber-500" />
            <h2 className="text-lg font-semibold">Submitted — awaiting HR review</h2>
            <p className="text-sm text-muted-foreground">
              Thanks{employee ? `, ${employee.firstName}` : ''}! Your onboarding details have been sent to HR for review.
              You&apos;ll hear back if anything needs correcting.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!employee) return null;

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={handleFileChosen} />
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Welcome, {employee.firstName}!</h1>
          <p className="text-sm text-muted-foreground">
            {employee.designation} · {employee.department} · Joining {new Date(employee.dateOfJoining).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {status === 'rejected' && rejectionReason && (
          <Alert variant="destructive">
            <AlertTitle>HR requested a correction</AlertTitle>
            <AlertDescription>{rejectionReason}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Progress value={((step + 1) / STEPS.length) * 100} />
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((label, i) => (
              <span key={label} className={i <= step ? 'text-emerald-600 font-medium' : ''}>{label}</span>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{STEPS[step]}</CardTitle>
            {step === 0 && <CardDescription>Your personal details and statutory ID numbers.</CardDescription>}
            {step === 1 && <CardDescription>Where your salary will be paid.</CardDescription>}
            {step === 2 && <CardDescription>Upload clear photos or PDFs — max 10MB each.</CardDescription>}
            {step === 3 && <CardDescription>Double-check everything before submitting to HR.</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" /></div>
                <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Blood Group</Label><Input value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="e.g. O+" /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Emergency Contact</Label><Input value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="Name, phone number" /></div>
                <div className="space-y-1.5"><Label>Current Address</Label><Textarea value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} rows={2} /></div>
                <div className="space-y-1.5"><Label>Permanent Address</Label><Textarea value={permanentAddress} onChange={(e) => setPermanentAddress(e.target.value)} rows={2} /></div>
                <div className="space-y-1.5"><Label>PAN Number</Label><Input value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></div>
                <div className="space-y-1.5"><Label>Aadhaar Number</Label><Input value={aadhaarNumber} onChange={(e) => setAadhaarNumber(e.target.value)} placeholder="12-digit number" /></div>
              </div>
            )}

            {step === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2"><Label>Bank Name</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Account Number</Label><Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>IFSC Code</Label><Input value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} placeholder="ABCD0123456" /></div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Required</Label>
                  {REQUIRED_DOCS.map((d) => {
                    const uploaded = docFor(d.type);
                    return (
                      <div key={d.type} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          {uploaded ? <CheckCircle2 className="size-4 text-emerald-600 shrink-0" /> : <Circle className="size-4 text-muted-foreground shrink-0" />}
                          <div>
                            <p className="text-sm font-medium">{d.label}</p>
                            {uploaded && <p className="text-xs text-muted-foreground">{uploaded.fileName}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" disabled={uploadingType === d.type} onClick={() => triggerUpload(d.type)}>
                            {uploadingType === d.type ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                            {uploaded ? 'Replace' : 'Upload'}
                          </Button>
                          {uploaded && (
                            <Button variant="ghost" size="icon" className="size-8 text-red-600" onClick={() => handleDeleteDoc(uploaded.id)}>
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Optional</Label>
                  {OPTIONAL_DOCS.map((d) => {
                    const uploaded = docFor(d.type);
                    return (
                      <div key={d.type} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          {uploaded ? <CheckCircle2 className="size-4 text-emerald-600 shrink-0" /> : <Circle className="size-4 text-muted-foreground/50 shrink-0" />}
                          <div>
                            <p className="text-sm font-medium">{d.label}</p>
                            {uploaded && <p className="text-xs text-muted-foreground">{uploaded.fileName}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" disabled={uploadingType === d.type} onClick={() => triggerUpload(d.type)}>
                            {uploadingType === d.type ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                            {uploaded ? 'Replace' : 'Upload'}
                          </Button>
                          {uploaded && (
                            <Button variant="ghost" size="icon" className="size-8 text-red-600" onClick={() => handleDeleteDoc(uploaded.id)}>
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border divide-y text-sm">
                  <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Phone</span><span>{phone || '—'}</span></div>
                  <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Date of Birth</span><span>{dateOfBirth || '—'}</span></div>
                  <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">PAN</span><span>{panNumber || '—'}</span></div>
                  <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Aadhaar</span><span>{aadhaarNumber || '—'}</span></div>
                  <div className="grid grid-cols-2 gap-2 p-3"><span className="text-muted-foreground">Bank</span><span>{bankName || '—'} {bankAccountNumber && `(${bankAccountNumber})`}</span></div>
                  <div className="p-3">
                    <span className="text-muted-foreground">Documents</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {[...REQUIRED_DOCS, ...OPTIONAL_DOCS].filter((d) => docFor(d.type)).map((d) => (
                        <Badge key={d.type} variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">{d.label}</Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {requiredMissing.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTitle>Missing required documents</AlertTitle>
                    <AlertDescription>Go back to Documents and upload: {requiredMissing.map((d) => d.label).join(', ')}.</AlertDescription>
                  </Alert>
                )}

                <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
                  <Checkbox checked={confirmChecked} onCheckedChange={(v) => setConfirmChecked(!!v)} className="mt-0.5" />
                  <span className="text-sm">
                    <ShieldCheck className="size-4 inline mr-1 text-emerald-600" />
                    I confirm the information above is accurate to the best of my knowledge.
                  </span>
                </label>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={handleBack} disabled={step === 0 || saving || submitting}>Back</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}Next
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!confirmChecked || requiredMissing.length > 0 || submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}Submit for Review
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, Loader2, CheckCircle2, Circle, Mail, KeyRound, Package, ListChecks, Pencil, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePayrollStore } from '@/store/payroll-store';

interface Employee { id: string; employeeCode: string; firstName: string; lastName: string | null; designation: string; email: string; }
interface Task { id: string; taskName: string; isCompleted: boolean; order: number; }
interface Asset {
  id: string; assetType: string; assetTag: string | null; brand: string | null; model: string | null;
  condition: string | null; notes: string | null; allocatedDate: string; returnedDate: string | null;
}

const ASSET_TAG_LABEL: Record<string, string> = {
  laptop: 'Serial Number', phone: 'IMEI', id_card: 'Serial Number', other: 'Reference / Tag',
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
  const [allocating, setAllocating] = useState(false);

  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editAssetType, setEditAssetType] = useState('laptop');
  const [editAssetTag, setEditAssetTag] = useState('');
  const [editAssetBrand, setEditAssetBrand] = useState('');
  const [editAssetModel, setEditAssetModel] = useState('');
  const [editAssetCondition, setEditAssetCondition] = useState('new');
  const [editAssetNotes, setEditAssetNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [sendingLetter, setSendingLetter] = useState<'offer' | 'appointment' | null>(null);
  const [activatingPortal, setActivatingPortal] = useState(false);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to allocate asset');
      toast.success('Asset allocated');
      setAssetTag(''); setAssetBrand(''); setAssetModel(''); setAssetCondition('new'); setAssetNotes('');
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

      <Dialog open={!!editingAsset} onOpenChange={(open) => { if (!open) setEditingAsset(null); }}>
        <DialogContent>
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

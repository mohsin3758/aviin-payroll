'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserMinus, Loader2, Plus, CheckCircle2, Circle, Mail, Calculator, Lock,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSessionContext } from '@/hooks/session-context';
import { usePayrollStore } from '@/store/payroll-store';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const STATUS_BADGE: Record<string, string> = {
  pending_manager: 'bg-amber-100 text-amber-800 border-amber-200',
  pending_hr: 'bg-blue-100 text-blue-800 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  withdrawn: 'bg-gray-100 text-gray-700 border-gray-200',
};

interface Employee { id: string; employeeCode: string; firstName: string; lastName: string | null; designation: string; }
interface ExitRow {
  id: string; status: string; resignationDate: string; lastWorkingDate: string;
  employee: { firstName: string; lastName: string | null; employeeCode: string; designation: string };
  finalSettlement: { status: string; netSettlementAmount: number } | null;
}
interface ChecklistItem { id: string; taskName: string; isCompleted: boolean; }
interface Settlement {
  id: string; status: string; leaveEncashmentAmount: number; pendingArrearsAmount: number;
  gratuityAmount: number; loanRecoveryAmount: number; noticeShortfallAmount: number; netSettlementAmount: number;
}
interface ExitAsset { id: string; assetType: string; assetTag: string | null; brand: string | null; model: string | null; returnedDate: string | null; }
interface ExitDetail {
  id: string; employeeId: string; status: string; resignationDate: string; lastWorkingDate: string; noticePeriodDays: number;
  reason: string | null; managerComment: string | null; hrComment: string | null;
  employee: { firstName: string; lastName: string | null; employeeCode: string; designation: string; department: string; email: string };
  checklistItems: ChecklistItem[];
  finalSettlement: Settlement | null;
  assets: ExitAsset[];
}

export default function ExitManagementView() {
  const { user } = useSessionContext();
  const { refreshKey } = usePayrollStore();
  const isManager = user?.role === 'manager' || user?.role === 'admin' || user?.role === 'hr';
  const isHr = user?.role === 'admin' || user?.role === 'hr';

  const [requests, setRequests] = useState<ExitRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [resignationDate, setResignationDate] = useState('');
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExitDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [comment, setComment] = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/exit-requests');
      const data = await res.json();
      setRequests(data.data ?? []);
    } catch { toast.error('Failed to load exit requests'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests, refreshKey]);

  useEffect(() => {
    if (isHr) {
      fetch('/api/employees?limit=200').then((r) => r.json()).then((d) => setEmployees((d.data ?? []).filter((e: { dateOfExit: string | null }) => !e.dateOfExit)));
    }
  }, [isHr]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    setComment('');
    try {
      const res = await fetch(`/api/exit-requests/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setDetail(data.data);
    } catch { toast.error('Failed to load exit request'); } finally { setLoadingDetail(false); }
  };

  const handleCreate = async () => {
    if (!employeeId || !resignationDate) { toast.error('Employee and resignation date are required'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/exit-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, resignationDate, reason: reason.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      toast.success('Exit request created');
      setCreateOpen(false); setEmployeeId(''); setResignationDate(''); setReason('');
      fetchRequests();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to create exit request'); } finally { setCreating(false); }
  };

  const handleApprove = async (stage: 'manager' | 'hr', approved: boolean) => {
    if (!selectedId) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/exit-requests/${selectedId}/${stage}-approve`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, comment: comment.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process approval');
      toast.success(approved ? 'Approved' : 'Rejected');
      openDetail(selectedId);
      fetchRequests();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to process approval'); } finally { setProcessing(false); }
  };

  const handleToggleChecklist = async (itemId: string, isCompleted: boolean) => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/exit-requests/${selectedId}/checklist/${itemId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !isCompleted }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update checklist');
      openDetail(selectedId);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to update checklist'); }
  };

  const handleReturnAssetFromExit = async (employeeId: string, assetId: string) => {
    try {
      const res = await fetch(`/api/employees/${employeeId}/assets/${assetId}`, { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to mark asset returned');
      toast.success('Asset marked returned');
      if (selectedId) openDetail(selectedId);
    } catch { toast.error('Failed to mark asset returned'); }
  };

  const handleComputeSettlement = async () => {
    if (!selectedId) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/exit-requests/${selectedId}/final-settlement`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to compute settlement');
      toast.success('Final settlement computed');
      openDetail(selectedId);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to compute settlement'); } finally { setProcessing(false); }
  };

  const handleFinalize = async () => {
    if (!selectedId) return;
    if (!confirm('Finalize this settlement? This marks the employee as exited and cannot be undone.')) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/exit-requests/${selectedId}/final-settlement/finalize`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to finalize');
      toast.success('Settlement finalized — employee marked as exited');
      openDetail(selectedId);
      fetchRequests();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to finalize'); } finally { setProcessing(false); }
  };

  const handleSendLetter = async (letterType: 'experience' | 'relieving') => {
    if (!selectedId) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/exit-requests/${selectedId}/letters`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ letterType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send letter');
      if (data.data.previewUrl) {
        toast.success(`${letterType === 'experience' ? 'Experience' : 'Relieving'} letter sent (test mode)`, {
          description: 'Click to view the sent email',
          action: { label: 'Open preview', onClick: () => window.open(data.data.previewUrl, '_blank') },
        });
      } else {
        toast.success('Letter emailed');
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to send letter'); } finally { setProcessing(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><UserMinus className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Exit Management</h1>
            <p className="text-sm text-muted-foreground">Resignation approvals, checklists, and full-and-final settlement</p>
          </div>
        </div>
        {isHr && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreateOpen(true)}><Plus className="size-4" />Record Resignation</Button>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Resignation</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Employee</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.employeeCode} — {e.firstName} {e.lastName ?? ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Resignation Date</Label><Input type="date" value={resignationDate} onChange={(e) => setResignationDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white">Submit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-6"><Skeleton className="h-32 w-full" /></div> : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No exit requests.</p>
          ) : (
            <div className="divide-y">
              {requests.map((r) => (
                <button key={r.id} onClick={() => openDetail(r.id)} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{r.employee.firstName} {r.employee.lastName ?? ''}</span>
                      <span className="text-xs text-muted-foreground ml-2">{r.employee.employeeCode} · {r.employee.designation}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.finalSettlement?.status === 'finalized' && <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200"><Lock className="size-3 mr-1" />Settled</Badge>}
                      <Badge variant="outline" className={STATUS_BADGE[r.status]}>{r.status.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Resigned {fmtDate(r.resignationDate)} · Last day {fmtDate(r.lastWorkingDate)}</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {loadingDetail ? <Skeleton className="h-64 w-full" /> : detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.employee.firstName} {detail.employee.lastName ?? ''}
                  <Badge variant="outline" className={STATUS_BADGE[detail.status]}>{detail.status.replace('_', ' ')}</Badge>
                </DialogTitle>
                <DialogDescription>{detail.employee.designation} · {detail.employee.department} · {detail.employee.employeeCode}</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Resignation Date</span><div className="font-medium">{fmtDate(detail.resignationDate)}</div></div>
                <div><span className="text-muted-foreground">Last Working Day</span><div className="font-medium">{fmtDate(detail.lastWorkingDate)}</div></div>
                <div><span className="text-muted-foreground">Notice Period</span><div className="font-medium">{detail.noticePeriodDays} days</div></div>
              </div>
              {detail.reason && <p className="text-sm"><span className="text-muted-foreground">Reason: </span>{detail.reason}</p>}

              {detail.status === 'pending_manager' && isManager && (
                <div className="space-y-2 rounded-lg border p-3 bg-amber-50">
                  <Label>Manager Decision</Label>
                  <Textarea placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={processing} onClick={() => handleApprove('manager', true)}>Approve</Button>
                    <Button size="sm" variant="destructive" disabled={processing} onClick={() => handleApprove('manager', false)}>Reject</Button>
                  </div>
                </div>
              )}
              {detail.status === 'pending_hr' && isHr && (
                <div className="space-y-2 rounded-lg border p-3 bg-blue-50">
                  <Label>HR Decision</Label>
                  <Textarea placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={processing} onClick={() => handleApprove('hr', true)}>Approve</Button>
                    <Button size="sm" variant="destructive" disabled={processing} onClick={() => handleApprove('hr', false)}>Reject</Button>
                  </div>
                </div>
              )}

              {detail.status === 'approved' && (
                <>
                  <Separator />
                  {detail.assets.length > 0 && (
                    <div>
                      <Label className="text-xs font-medium">Company Assets</Label>
                      <div className="mt-2 space-y-1.5">
                        {detail.assets.map((a) => (
                          <div key={a.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <span className="capitalize">{a.assetType.replace('_', ' ')}</span>
                            {(a.brand || a.model) && <span className="text-muted-foreground">{[a.brand, a.model].filter(Boolean).join(' ')}</span>}
                            {a.assetTag && <span className="text-muted-foreground font-mono text-xs">({a.assetTag})</span>}
                            {a.returnedDate ? (
                              <Badge variant="outline" className="ml-auto bg-emerald-100 text-emerald-800 border-emerald-200">Returned</Badge>
                            ) : isHr ? (
                              <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => handleReturnAssetFromExit(detail.employeeId, a.id)}>Mark Returned</Button>
                            ) : (
                              <Badge variant="outline" className="ml-auto bg-amber-100 text-amber-800 border-amber-200">Outstanding</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs font-medium">Exit Checklist</Label>
                    <div className="mt-2 space-y-1.5">
                      {detail.checklistItems.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer">
                          <Checkbox checked={item.isCompleted} onCheckedChange={() => handleToggleChecklist(item.id, item.isCompleted)} disabled={!isHr} />
                          <span className={item.isCompleted ? 'line-through text-muted-foreground' : ''}>{item.taskName}</span>
                          {item.isCompleted ? <CheckCircle2 className="size-4 text-emerald-600 ml-auto" /> : <Circle className="size-4 text-muted-foreground ml-auto" />}
                        </label>
                      ))}
                    </div>
                  </div>

                  {isHr && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" disabled={processing} onClick={() => handleSendLetter('experience')}><Mail className="size-3.5 mr-1" />Experience Letter</Button>
                      <Button variant="outline" size="sm" disabled={processing} onClick={() => handleSendLetter('relieving')}><Mail className="size-3.5 mr-1" />Relieving Letter</Button>
                    </div>
                  )}

                  <Separator />
                  <div>
                    <Label className="text-xs font-medium">Full &amp; Final Settlement</Label>
                    {!detail.finalSettlement ? (
                      isHr && <Button size="sm" className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={processing} onClick={handleComputeSettlement}>
                        {processing ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}Compute Settlement
                      </Button>
                    ) : (
                      <div className="mt-2 space-y-1.5 rounded-lg border p-3 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Leave Encashment</span><span>{fmt(detail.finalSettlement.leaveEncashmentAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Pending Arrears</span><span>{fmt(detail.finalSettlement.pendingArrearsAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Gratuity</span><span>{fmt(detail.finalSettlement.gratuityAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Loan Recovery</span><span>– {fmt(detail.finalSettlement.loanRecoveryAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Notice Shortfall</span><span>– {fmt(detail.finalSettlement.noticeShortfallAmount)}</span></div>
                        <Separator />
                        <div className="flex justify-between font-bold text-emerald-700"><span>Net Settlement</span><span>{fmt(detail.finalSettlement.netSettlementAmount)}</span></div>
                        <div className="flex items-center justify-between pt-2">
                          <Badge variant="outline" className={detail.finalSettlement.status === 'finalized' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}>{detail.finalSettlement.status}</Badge>
                          {isHr && detail.finalSettlement.status === 'draft' && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" disabled={processing} onClick={handleComputeSettlement}>Recompute</Button>
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={processing} onClick={handleFinalize}><Lock className="size-3.5 mr-1" />Finalize</Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Search, Laptop, Smartphone, IdCard, Box, PlusCircle, Pencil, Trash2, UserPlus, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { usePayrollStore } from '@/store/payroll-store';

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const ASSET_TYPE_LABEL: Record<string, string> = {
  laptop: 'Laptop', phone: 'Phone', id_card: 'ID Card', other: 'Other',
};
const ASSET_TAG_LABEL: Record<string, string> = {
  laptop: 'Serial Number', phone: 'IMEI', id_card: 'Serial Number', other: 'Reference / Tag',
};

const ASSET_TYPE_ICON: Record<string, React.ElementType> = {
  laptop: Laptop, phone: Smartphone, id_card: IdCard, other: Box,
};

interface AssetRow {
  id: string;
  assetType: string;
  assetTag: string | null;
  brand: string | null;
  model: string | null;
  condition: string | null;
  notes: string | null;
  allocatedDate: string;
  returnedDate: string | null;
  chargerSerialNo: string | null;
  chargerWireSerialNo: string | null;
  laptopName: string | null;
  laptopLoginId: string | null;
  laptopPassword: string | null;
  laptopPin: string | null;
  employee: { firstName: string; lastName: string | null; employeeCode: string; dateOfExit: string | null } | null;
}

interface LinkableEmployee { id: string; firstName: string; lastName: string | null; employeeCode: string; }

interface AssetFormState {
  assetType: string;
  assetTag: string;
  brand: string;
  model: string;
  condition: string;
  notes: string;
  chargerSerialNo: string;
  chargerWireSerialNo: string;
  laptopName: string;
  laptopLoginId: string;
  laptopPassword: string;
  laptopPin: string;
}

const EMPTY_FORM: AssetFormState = {
  assetType: 'laptop', assetTag: '', brand: '', model: '', condition: 'new', notes: '',
  chargerSerialNo: '', chargerWireSerialNo: '', laptopName: '', laptopLoginId: '', laptopPassword: '', laptopPin: '',
};

function formToPayload(f: AssetFormState) {
  return {
    assetType: f.assetType,
    assetTag: f.assetTag.trim() || null,
    brand: f.brand.trim() || null,
    model: f.model.trim() || null,
    condition: f.condition || null,
    notes: f.notes.trim() || null,
    ...(f.assetType === 'laptop' ? {
      chargerSerialNo: f.chargerSerialNo.trim() || null,
      chargerWireSerialNo: f.chargerWireSerialNo.trim() || null,
      laptopName: f.laptopName.trim() || null,
      laptopLoginId: f.laptopLoginId.trim() || null,
      laptopPassword: f.laptopPassword.trim() || null,
      laptopPin: f.laptopPin.trim() || null,
    } : {}),
  };
}

function AssetFormFields({ form, setForm }: { form: AssetFormState; setForm: (f: AssetFormState) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Asset Type</Label>
          <Select value={form.assetType} onValueChange={(v) => setForm({ ...form, assetType: v })}>
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
          <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="good">Good</SelectItem>
              <SelectItem value="fair">Fair</SelectItem>
              <SelectItem value="damaged">Damaged</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Brand</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Dell, Apple" /></div>
        <div className="space-y-1.5"><Label>Model</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="e.g. Latitude 5420" /></div>
        <div className="space-y-1.5 col-span-2"><Label>{ASSET_TAG_LABEL[form.assetType]}</Label><Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} /></div>
      </div>
      {form.assetType === 'laptop' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Laptop Name</Label><Input value={form.laptopName} onChange={(e) => setForm({ ...form, laptopName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Laptop Login ID</Label><Input value={form.laptopLoginId} onChange={(e) => setForm({ ...form, laptopLoginId: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Laptop Password</Label><Input type="password" value={form.laptopPassword} onChange={(e) => setForm({ ...form, laptopPassword: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Laptop PIN</Label><Input type="password" value={form.laptopPin} onChange={(e) => setForm({ ...form, laptopPin: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Charger Serial No</Label><Input value={form.chargerSerialNo} onChange={(e) => setForm({ ...form, chargerSerialNo: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Charger Wire Serial No</Label><Input value={form.chargerWireSerialNo} onChange={(e) => setForm({ ...form, chargerWireSerialNo: e.target.value })} /></div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any other detail worth recording" />
      </div>
    </div>
  );
}

export default function AssetsView() {
  const { refreshKey } = usePayrollStore();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [assetType, setAssetType] = useState('all');
  const [status, setStatus] = useState('all');

  const [allEmployees, setAllEmployees] = useState<LinkableEmployee[]>([]);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (assetType !== 'all') params.set('assetType', assetType);
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/assets?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load assets');
      setAssets(data.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [search, assetType, status]);

  useEffect(() => {
    const t = setTimeout(fetchAssets, 300);
    return () => clearTimeout(t);
  }, [fetchAssets, refreshKey]);

  const fetchAllEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=200');
      if (!res.ok) return;
      const json = await res.json();
      setAllEmployees(json.data ?? []);
    } catch {
      // non-critical — the assign dialog just shows an empty list if this fails
    }
  }, []);

  useEffect(() => {
    fetchAllEmployees();
  }, [fetchAllEmployees, refreshKey]);

  const inStock = assets.filter((a) => !a.employee).length;
  const withEmployee = assets.filter((a) => a.employee && !a.returnedDate).length;
  const returned = assets.filter((a) => a.returnedDate).length;

  // ---- Add Asset ----
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AssetFormState>(EMPTY_FORM);
  const [addEmployeeId, setAddEmployeeId] = useState('');
  const [adding, setAdding] = useState(false);

  const openAddDialog = () => {
    setAddForm(EMPTY_FORM);
    setAddEmployeeId('');
    setAddOpen(true);
  };

  const handleAdd = async () => {
    setAdding(true);
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formToPayload(addForm), employeeId: addEmployeeId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add asset');
      toast.success(addEmployeeId ? 'Asset added and assigned.' : 'Asset added to inventory (In Stock).');
      setAddOpen(false);
      fetchAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add asset');
    } finally {
      setAdding(false);
    }
  };

  // ---- Edit Asset ----
  const [editingAsset, setEditingAsset] = useState<AssetRow | null>(null);
  const [editForm, setEditForm] = useState<AssetFormState>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditDialog = (a: AssetRow) => {
    setEditingAsset(a);
    setEditForm({
      assetType: a.assetType, assetTag: a.assetTag ?? '', brand: a.brand ?? '', model: a.model ?? '',
      condition: a.condition ?? 'new', notes: a.notes ?? '',
      chargerSerialNo: a.chargerSerialNo ?? '', chargerWireSerialNo: a.chargerWireSerialNo ?? '',
      laptopName: a.laptopName ?? '', laptopLoginId: a.laptopLoginId ?? '',
      laptopPassword: a.laptopPassword ?? '', laptopPin: a.laptopPin ?? '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingAsset) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/assets/${editingAsset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(editForm)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update asset');
      toast.success('Asset updated.');
      setEditingAsset(null);
      fetchAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update asset');
    } finally {
      setSavingEdit(false);
    }
  };

  // ---- Assign ----
  const [assignTarget, setAssignTarget] = useState<AssetRow | null>(null);
  const [assignEmployeeId, setAssignEmployeeId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const handleAssign = async () => {
    if (!assignTarget || !assignEmployeeId) {
      toast.error('Select an employee to assign this asset to.');
      return;
    }
    setAssigning(true);
    try {
      const res = await fetch(`/api/assets/${assignTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: assignEmployeeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign asset');
      toast.success('Asset assigned.');
      setAssignTarget(null);
      fetchAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign asset');
    } finally {
      setAssigning(false);
    }
  };

  // ---- Return to Stock ----
  const [returningId, setReturningId] = useState<string | null>(null);

  const handleReturnToStock = async (a: AssetRow) => {
    if (!confirm('Return this asset to unassigned company inventory? It will no longer be tied to any employee.')) return;
    setReturningId(a.id);
    try {
      const res = await fetch(`/api/assets/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: null }),
      });
      if (!res.ok) throw new Error('Failed to return asset to stock');
      toast.success('Asset returned to stock — it can now be assigned to anyone.');
      fetchAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to return asset to stock');
    } finally {
      setReturningId(null);
    }
  };

  // ---- Delete ----
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (a: AssetRow) => {
    if (!confirm('Delete this asset record permanently? Use Return to Stock instead if it\'s a real asset just not in use.')) return;
    setDeletingId(a.id);
    try {
      const res = await fetch(`/api/assets/${a.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete asset');
      toast.success('Asset deleted.');
      fetchAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete asset');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="size-6 text-emerald-600" />Assets</h1>
          <p className="text-sm text-muted-foreground">Company-wide inventory — allocated to employees, or unassigned in stock</p>
        </div>
        <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openAddDialog}>
          <PlusCircle className="size-4" />
          Add Asset
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total Assets</CardDescription><CardTitle className="text-2xl">{assets.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>In Stock</CardDescription><CardTitle className="text-2xl text-blue-600">{inStock}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>With Employees</CardDescription><CardTitle className="text-2xl text-amber-600">{withEmployee}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Returned</CardDescription><CardTitle className="text-2xl text-emerald-600">{returned}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search by employee, tag, brand, model..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={assetType} onValueChange={setAssetType}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="laptop">Laptop</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="id_card">ID Card</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="with_employee">With Employee</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          {loading ? (
            <Skeleton className="h-64 w-full mx-6 mb-6" />
          ) : assets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No assets found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Brand / Model</TableHead>
                  <TableHead>Tag / Serial</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => {
                  const Icon = ASSET_TYPE_ICON[a.assetType] ?? Box;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        {a.employee ? (
                          <>
                            <div className="font-medium">{a.employee.firstName} {a.employee.lastName ?? ''}</div>
                            <div className="text-xs text-muted-foreground font-mono">{a.employee.employeeCode}</div>
                          </>
                        ) : (
                          <span className="text-sm italic text-muted-foreground">— In Stock —</span>
                        )}
                      </TableCell>
                      <TableCell><span className="flex items-center gap-1.5"><Icon className="size-4 text-muted-foreground" />{ASSET_TYPE_LABEL[a.assetType] ?? a.assetType}</span></TableCell>
                      <TableCell>{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{a.assetTag ?? '—'}</TableCell>
                      <TableCell className="capitalize">{a.condition ?? '—'}</TableCell>
                      <TableCell>{fmtDate(a.allocatedDate)}</TableCell>
                      <TableCell>
                        {!a.employee ? (
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">In Stock</Badge>
                        ) : a.returnedDate ? (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">Returned {fmtDate(a.returnedDate)}</Badge>
                        ) : a.employee.dateOfExit ? (
                          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Outstanding (exited)</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">With Employee</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!a.employee ? (
                            <Button variant="ghost" size="sm" onClick={() => { setAssignTarget(a); setAssignEmployeeId(''); }}>
                              <UserPlus className="size-3.5 mr-1" />
                              Assign
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" disabled={returningId === a.id} onClick={() => handleReturnToStock(a)}>
                              {returningId === a.id ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <RotateCcw className="size-3.5 mr-1" />}
                              Return to Stock
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditDialog(a)} title="Edit"><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-red-600" disabled={deletingId === a.id} onClick={() => handleDelete(a)} title="Delete">
                            {deletingId === a.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Add Asset Dialog ────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Asset</DialogTitle>
            <DialogDescription>Add new company equipment — assign it to an employee now, or leave it unassigned in stock.</DialogDescription>
          </DialogHeader>
          <AssetFormFields form={addForm} setForm={setAddForm} />
          <div className="space-y-1.5">
            <Label>Assign to (optional)</Label>
            <Select value={addEmployeeId || 'none'} onValueChange={(v) => setAddEmployeeId(v === 'none' ? '' : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Leave unassigned — In Stock</SelectItem>
                {allEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName ?? ''} ({e.employeeCode})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {adding ? <Loader2 className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
              Add Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Asset Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!editingAsset} onOpenChange={(open) => { if (!open) setEditingAsset(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
          </DialogHeader>
          <AssetFormFields form={editForm} setForm={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAsset(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingEdit ? <Loader2 className="size-4 animate-spin" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Assign Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!assignTarget} onOpenChange={(open) => { if (!open) setAssignTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Asset</DialogTitle>
            <DialogDescription>
              {assignTarget && `${ASSET_TYPE_LABEL[assignTarget.assetType]}${assignTarget.assetTag ? ` (${assignTarget.assetTag})` : ''}`} — choose who it goes to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="assign-employee-select">Employee</Label>
            <Select value={assignEmployeeId} onValueChange={setAssignEmployeeId}>
              <SelectTrigger id="assign-employee-select" className="w-full">
                <SelectValue placeholder="Select an employee..." />
              </SelectTrigger>
              <SelectContent>
                {allEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName ?? ''} ({e.employeeCode})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={assigning}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleAssign} disabled={assigning || !assignEmployeeId}>
              {assigning ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

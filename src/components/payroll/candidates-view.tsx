'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Loader2, Plus, Pencil, LogOut } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  permanent: 'FTE',
  contractor: 'Contract',
};

interface Candidate {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  client: string | null;
  role: string;
  employmentType: string;
  dateOfJoining: string;
  dateOfExit: string | null;
}

function candName(c: Candidate) {
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
  dateOfJoining: '',
};

export default function CandidatesView() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [endOpen, setEndOpen] = useState(false);
  const [endingCandidate, setEndingCandidate] = useState<Candidate | null>(null);
  const [endDate, setEndDate] = useState('');
  const [ending, setEnding] = useState(false);

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

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (c: Candidate) => {
    setEditingId(c.id);
    setForm({
      firstName: c.firstName,
      lastName: c.lastName ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      client: c.client ?? '',
      role: c.role,
      employmentType: c.employmentType,
      dateOfJoining: c.dateOfJoining.split('T')[0],
    });
    setFormOpen(true);
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
        dateOfJoining: form.dateOfJoining,
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
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openAdd}>
            <Plus className="size-4" />
            Add Candidate
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Candidates</CardTitle>
          <CardDescription>Name, client, role, and placement dates — used when scheduling a Hiring Incentive</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><Skeleton className="h-32 w-full" /></div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No candidates on record yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{candName(c)}</TableCell>
                      <TableCell>{c.client ?? '—'}</TableCell>
                      <TableCell>{c.role}</TableCell>
                      <TableCell>{EMPLOYMENT_TYPE_LABEL[c.employmentType] ?? c.employmentType}</TableCell>
                      <TableCell>{c.phone ?? '—'}</TableCell>
                      <TableCell>{c.email ?? '—'}</TableCell>
                      <TableCell>{new Date(c.dateOfJoining).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell>
                        {c.dateOfExit ? (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">Ended</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(c)}>
                            <Pencil className="size-4" />
                          </Button>
                          {!c.dateOfExit && (
                            <Button variant="ghost" size="icon" className="size-7 text-amber-600" onClick={() => openEndPlacement(c)}>
                              <LogOut className="size-4" />
                            </Button>
                          )}
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

      {/* Add/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open && !submitting) setFormOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Candidate' : 'Add Candidate'}</DialogTitle>
            <DialogDescription>Basic placement details only — no payroll/PF/ESI/bank fields, since this candidate isn&apos;t an in-house payroll employee.</DialogDescription>
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
                <Label>Date of Joining *</Label>
                <Input type="date" value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} />
              </div>
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
    </div>
  );
}

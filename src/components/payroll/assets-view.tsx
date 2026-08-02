'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Search, Laptop, Smartphone, IdCard, Box } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const ASSET_TYPE_LABEL: Record<string, string> = {
  laptop: 'Laptop', phone: 'Phone', id_card: 'ID Card', other: 'Other',
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
  employee: { firstName: string; lastName: string | null; employeeCode: string; dateOfExit: string | null };
}

export default function AssetsView() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [assetType, setAssetType] = useState('all');
  const [status, setStatus] = useState('all');

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
  }, [fetchAssets]);

  const withEmployee = assets.filter((a) => !a.returnedDate).length;
  const returned = assets.filter((a) => a.returnedDate).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="size-6 text-emerald-600" />Assets</h1>
        <p className="text-sm text-muted-foreground">Company-wide inventory of equipment allocated across every employee</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total Assets</CardDescription><CardTitle className="text-2xl">{assets.length}</CardTitle></CardHeader></Card>
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
                <SelectItem value="with_employee">With Employee</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => {
                  const Icon = ASSET_TYPE_ICON[a.assetType] ?? Box;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium">{a.employee.firstName} {a.employee.lastName ?? ''}</div>
                        <div className="text-xs text-muted-foreground font-mono">{a.employee.employeeCode}</div>
                      </TableCell>
                      <TableCell><span className="flex items-center gap-1.5"><Icon className="size-4 text-muted-foreground" />{ASSET_TYPE_LABEL[a.assetType] ?? a.assetType}</span></TableCell>
                      <TableCell>{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{a.assetTag ?? '—'}</TableCell>
                      <TableCell className="capitalize">{a.condition ?? '—'}</TableCell>
                      <TableCell>{fmtDate(a.allocatedDate)}</TableCell>
                      <TableCell>
                        {a.returnedDate ? (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">Returned {fmtDate(a.returnedDate)}</Badge>
                        ) : a.employee.dateOfExit ? (
                          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Outstanding (exited)</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">With Employee</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

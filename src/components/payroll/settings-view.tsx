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
} from 'lucide-react';
import { toast } from 'sonner';
import { usePayrollStore } from '@/store/payroll-store';

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
  companyName: string;
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
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function SettingsView() {
  const { refreshKey } = usePayrollStore();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<CompanySettings>({
    companyName: '',
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
  });

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setForm(data as CompanySettings);
    } catch {
      toast.error('Failed to load company settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings, refreshKey]);

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
                  value={form.companyName}
                  onChange={(e) => updateField('companyName', e.target.value)}
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
    </div>
  );
}


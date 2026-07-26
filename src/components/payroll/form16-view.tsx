'use client';

import { useState, useEffect, useCallback } from 'react';
import { Award, Printer, Loader2, AlertCircle, Mail } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { usePayrollStore } from '@/store/payroll-store';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  designation: string;
  department: string;
}

interface Form16Data {
  employee: { name: string; code: string; pan: string; designation: string; email: string };
  company: { name: string; address: string; pan: string; tan: string };
  financialYear: string;
  fyStartYear: number;
  regime: string;
  monthsIncluded: number;
  periodCovered: { month: number; year: number }[];
  grossSalary: {
    basic: number;
    dearnessAllowance: number;
    houseRentAllowance: number;
    conveyanceAllowance: number;
    medicalAllowance: number;
    specialAllowance: number;
    overtimeAllowance: number;
    bonus: number;
    otherEarnings: number;
    arrears: number;
    total: number;
  };
  deductionsUnderSection16: { standardDeduction: number; professionalTax: number; total: number };
  incomeChargeableUnderSalaries: number;
  chapterVIA: { section80C: number; section80D: number; total: number };
  totalTaxableIncome: number;
  taxComputation: {
    taxOnTotalIncome: number;
    rebate87A: number;
    cess: number;
    totalTaxPayable: number;
  };
  tdsDeducted: { totalDeducted: number; monthlyBreakup: { month: number; year: number; tds: number }[] };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Form16View() {
  const { refreshKey } = usePayrollStore();

  const now = new Date();
  const currentFyStart = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [fyStartYear, setFyStartYear] = useState(String(currentFyStart));

  const [form16, setForm16] = useState<Form16Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [bulkSending, setBulkSending] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setLoadingEmps(true);
    try {
      const res = await fetch('/api/employees?limit=200');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setEmployees(json.data ?? []);
    } catch {
      toast.error('Failed to load employees');
    } finally {
      setLoadingEmps(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees, refreshKey]);

  const handleGenerate = async () => {
    if (!employeeId) {
      toast.error('Please select an employee');
      return;
    }
    setLoading(true);
    setGenerated(false);
    try {
      const params = new URLSearchParams({ employeeId, fyStartYear: String(fyStartYear) });
      const res = await fetch(`/api/form16?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate Form 16');

      setForm16(data.data);
      setGenerated(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate Form 16');
      setForm16(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBulkSend = async () => {
    setBulkSending(true);
    try {
      const res = await fetch('/api/form16/send-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fyStartYear: Number(fyStartYear) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send Form 16 emails');

      const parts = [`${data.sent} sent`];
      if (data.skipped) parts.push(`${data.skipped} skipped (no data or email)`);
      if (data.failed) parts.push(`${data.failed} failed`);
      toast[data.failed ? 'warning' : 'success'](`Form 16: ${parts.join(', ')}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send Form 16 emails');
    } finally {
      setBulkSending(false);
      setBulkConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Print-specific styles ─────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #form16-preview, #form16-preview * { visibility: visible; }
          #form16-preview {
            position: absolute; left: 0; top: 0; width: 100%;
            background: white !important; border: none !important;
            box-shadow: none !important; padding: 0 !important; margin: 0 !important;
          }
          #form16-preview .no-print { display: none !important; }
          #form16-preview table, #form16-preview tr { page-break-inside: avoid; }
        }
      `}} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Form 16 (Part B)</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Annual salary &amp; TDS certificate — computed from actual processed payroll
          </p>
        </div>
      </div>

      {/* ── Scope note ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 no-print">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">Part B only</p>
          <p className="mt-0.5">
            This generates Form 16 <strong>Part B</strong> (salary breakup &amp; tax computation) from your
            own payroll records. <strong>Part A</strong> (TAN-linked TRACES certificate number, quarterly
            challan/BSR details) can only be issued by the Income Tax Department&apos;s TRACES portal after
            your actual TDS returns are filed — no payroll software can legitimately generate it.
          </p>
        </div>
      </div>

      {/* ── Controls ───────────────────────────────────────────────── */}
      <Card className="no-print">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label htmlFor="f16-employee">Employee</Label>
              {loadingEmps ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger id="f16-employee" className="w-full">
                    <SelectValue placeholder="Select employee…" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        <span className="font-mono text-xs text-muted-foreground mr-2">
                          {emp.employeeCode}
                        </span>
                        {emp.firstName} {emp.lastName ?? ''}
                        <span className="text-muted-foreground ml-2">— {emp.designation}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f16-fy">Financial Year (start)</Label>
              <Input
                id="f16-fy"
                type="number"
                min={2000}
                max={2100}
                value={fyStartYear}
                onChange={(e) => setFyStartYear(e.target.value)}
                className="w-[140px]"
              />
            </div>

            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading || !employeeId}
              onClick={handleGenerate}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Award className="size-4" />
              )}
              Generate Form 16
            </Button>

            <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <Mail className="size-4" />
                  Email All Employees
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Email Form 16 to All Employees</AlertDialogTitle>
                  <AlertDialogDescription>
                    Send Form 16 (Part B) for FY {fyStartYear}-{String((Number(fyStartYear) + 1) % 100).padStart(2, '0')}{' '}
                    to every employee with processed payroll in that year? Employees with no data for
                    this FY will be skipped automatically.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={bulkSending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkSend} disabled={bulkSending}>
                    <Mail className="size-4" />
                    Send Emails
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* ── Loading state ──────────────────────────────────────────── */}
      {loading && (
        <Card>
          <CardContent className="py-12 space-y-4">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="size-8 animate-spin text-emerald-600 mb-4" />
              <p className="text-muted-foreground">Generating Form 16…</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Empty state ────────────────────────────────────────────── */}
      {!generated && !loading && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <AlertCircle className="size-12 mb-4 opacity-30" />
              <p className="text-sm">Select an employee and financial year, then click &quot;Generate Form 16&quot;</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Form 16 Preview ────────────────────────────────────────── */}
      {form16 && (
        <Card id="form16-preview" className="print:shadow-none print:border-0 print:rounded-none">
          <CardHeader className="text-center border-b-2 border-emerald-600 pb-4">
            <CardTitle className="text-xl">{form16.company.name}</CardTitle>
            {form16.company.address && (
              <CardDescription>{form16.company.address}</CardDescription>
            )}
            <div className="flex justify-center gap-6 mt-2 text-xs text-muted-foreground">
              {form16.company.pan && <span>PAN: {form16.company.pan}</span>}
              {form16.company.tan && <span>TAN: {form16.company.tan}</span>}
            </div>
            <p className="text-sm font-bold uppercase tracking-widest text-emerald-700 mt-3">
              Form 16 — Part B
            </p>
            <p className="text-sm text-muted-foreground">
              Financial Year {form16.financialYear} · {form16.regime === 'new' ? 'New' : 'Old'} Tax Regime
            </p>
            {form16.monthsIncluded < 12 && (
              <p className="text-xs text-amber-600 mt-1">
                Based on {form16.monthsIncluded} of 12 months&apos; processed payroll (partial year)
              </p>
            )}
          </CardHeader>

          <CardContent className="pt-6">
            <div className="max-w-[800px] mx-auto space-y-6">
              {/* ── Employee Info ─────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm border rounded-lg p-4 bg-muted/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee Name</span>
                  <span className="font-medium">{form16.employee.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee Code</span>
                  <span className="font-mono">{form16.employee.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PAN</span>
                  <span className="font-mono">{form16.employee.pan || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Designation</span>
                  <span>{form16.employee.designation || '—'}</span>
                </div>
              </div>

              {/* ── Gross Salary Breakup ───────────────────────────── */}
              <div>
                <h4 className="text-sm font-bold text-emerald-700 uppercase tracking-wide mb-2">
                  Gross Salary
                </h4>
                <SlipRow label="Basic" value={fmt(form16.grossSalary.basic)} />
                <SlipRow label="Dearness Allowance" value={fmt(form16.grossSalary.dearnessAllowance)} />
                <SlipRow label="House Rent Allowance" value={fmt(form16.grossSalary.houseRentAllowance)} />
                <SlipRow label="Conveyance Allowance" value={fmt(form16.grossSalary.conveyanceAllowance)} />
                <SlipRow label="Medical Allowance" value={fmt(form16.grossSalary.medicalAllowance)} />
                <SlipRow label="Special Allowance" value={fmt(form16.grossSalary.specialAllowance)} />
                <SlipRow label="Overtime Allowance" value={fmt(form16.grossSalary.overtimeAllowance)} />
                <SlipRow label="Bonus" value={fmt(form16.grossSalary.bonus)} />
                <SlipRow label="Other Earnings" value={fmt(form16.grossSalary.otherEarnings)} />
                <SlipRow label="Arrears" value={fmt(form16.grossSalary.arrears)} />
                <Separator className="my-2" />
                <SlipRow label="Gross Salary (Section 17(1))" value={fmt(form16.grossSalary.total)} bold />
              </div>

              {/* ── Deductions under Section 16 ────────────────────── */}
              <div>
                <h4 className="text-sm font-bold text-red-700 uppercase tracking-wide mb-2">
                  Deductions Under Section 16
                </h4>
                <SlipRow label="Standard Deduction" value={fmt(form16.deductionsUnderSection16.standardDeduction)} />
                <SlipRow label="Professional Tax (16(iii))" value={fmt(form16.deductionsUnderSection16.professionalTax)} />
                <Separator className="my-2" />
                <SlipRow
                  label="Income Chargeable Under 'Salaries'"
                  value={fmt(form16.incomeChargeableUnderSalaries)}
                  bold
                />
              </div>

              {/* ── Chapter VI-A ────────────────────────────────────── */}
              {form16.regime === 'old' && (
                <div>
                  <h4 className="text-sm font-bold text-violet-700 uppercase tracking-wide mb-2">
                    Deductions Under Chapter VI-A
                  </h4>
                  <SlipRow label="Section 80C (PF/ESI + declared investments, capped ₹1.5L)" value={fmt(form16.chapterVIA.section80C)} />
                  <SlipRow label="Section 80D (health insurance)" value={fmt(form16.chapterVIA.section80D)} />
                  <Separator className="my-2" />
                  <SlipRow label="Total Taxable Income" value={fmt(form16.totalTaxableIncome)} bold />
                </div>
              )}
              {form16.regime === 'new' && (
                <SlipRow label="Total Taxable Income (New Regime)" value={fmt(form16.totalTaxableIncome)} bold />
              )}

              {/* ── Tax Computation ─────────────────────────────────── */}
              <div>
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">
                  Tax Computation
                </h4>
                <SlipRow label="Tax on Total Income" value={fmt(form16.taxComputation.taxOnTotalIncome)} />
                <SlipRow label="Rebate u/s 87A" value={'– ' + fmt(form16.taxComputation.rebate87A)} />
                <SlipRow label="Health & Education Cess (4%)" value={fmt(form16.taxComputation.cess)} />
                <Separator className="my-2" />
                <SlipRow label="Total Tax Payable" value={fmt(form16.taxComputation.totalTaxPayable)} bold />
              </div>

              {/* ── TDS Summary ─────────────────────────────────────── */}
              <div className="rounded-lg border bg-emerald-50 p-4">
                <div className="flex justify-between text-base font-bold text-emerald-800">
                  <span>Total TDS Deducted (as per payroll records)</span>
                  <span>{fmt(form16.tdsDeducted.totalDeducted)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Based on {form16.tdsDeducted.monthlyBreakup.length} month(s) of processed payroll:{' '}
                  {form16.tdsDeducted.monthlyBreakup.map((m) => MONTHS[m.month - 1].slice(0, 3)).join(', ')}
                </p>
              </div>

              {/* ── Footer ─────────────────────────────────────────── */}
              <div className="text-center text-xs text-muted-foreground space-y-1 pt-2">
                <p className="italic">
                  This is a system-generated Form 16 Part B and does not require a signature. It does not
                  include Part A (TRACES certificate number and challan details).
                </p>
                <p>Generated on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              </div>

              {/* ── Print Button ─────────────────────────────────────── */}
              <div className="flex justify-center pt-2 no-print">
                <Button
                  variant="outline"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                  onClick={handlePrint}
                >
                  <Printer className="size-4" />
                  Print / Save as PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Row Helper                                                         */
/* ------------------------------------------------------------------ */

function SlipRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm py-0.5 ${bold ? 'font-bold' : ''}`}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={bold ? '' : 'tabular-nums'}>{value}</span>
    </div>
  );
}

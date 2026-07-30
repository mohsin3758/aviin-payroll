'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Printer,
  Loader2,
  Download,
  AlertCircle,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

interface SalarySlipData {
  employee: {
    name: string;
    code: string;
    designation: string;
    department: string;
    pan: string;
    email: string;
    bankName: string;
    bankAccountNumber: string;
    bankIfsc: string;
  };
  company: {
    name: string;
    address: string;
    pan: string;
    tan: string;
  };
  month: number;
  year: number;
  monthName: string;
  earnings: {
    basic: number;
    dearnessAllowance: number;
    houseRentAllowance: number;
    conveyanceAllowance: number;
    medicalAllowance: number;
    specialAllowance: number;
    overtimeAllowance: number;
    bonus: number;
    otherEarnings: number;
    hiringIncentive: number;
    totalEarnings: number;
  };
  deductions: {
    employeePF: number;
    employeeESI: number;
    tds: number;
    professionalTax: number;
    lwf: number;
    tardinessDeduction: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  employerContributions: {
    employerPF: number;
    employerEPS: number;
    employerEDLI: number;
    employerESI: number;
  };
  totals: {
    totalEarnings: number;
    totalDeductions: number;
    netSalary: number;
    grossSalary: number;
    ctc: number;
  };
  taxComputation: {
    taxRegime: string;
    grossAnnualSalary: number;
    standardDeduction: number;
    taxableIncome: number;
    incomeTax: number;
    cess: number;
    rebate87A: number;
    totalTax: number;
    tdsMonthly: number;
  };
  attendance: {
    daysInMonth: number;
    presentDays: number;
    paidDays: number;
  };
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

export default function SalarySlipView() {
  const { refreshKey } = usePayrollStore();

  const now = new Date();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const [slip, setSlip] = useState<SalarySlipData | null>(null);
  const [loadingSlip, setLoadingSlip] = useState(false);
  const [slipGenerated, setSlipGenerated] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  /* --- Fetch employees --- */
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

  /* --- Generate slip --- */
  const handleGenerate = async () => {
    if (!employeeId) {
      toast.error('Please select an employee');
      return;
    }
    setLoadingSlip(true);
    setSlipGenerated(false);
    try {
      const params = new URLSearchParams({
        employeeId,
        month: String(month),
        year: String(year),
      });
      const res = await fetch(`/api/salary-slip?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate slip');

      setSlip(data.data);
      setSlipGenerated(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate salary slip');
      setSlip(null);
    } finally {
      setLoadingSlip(false);
    }
  };

  /* --- Print --- */
  const handlePrint = () => {
    window.print();
  };

  /* --- Email --- */
  const handleSendEmail = async () => {
    if (!employeeId) return;
    setSendingEmail(true);
    try {
      const res = await fetch('/api/salary-slip/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, month: Number(month), year: Number(year) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');

      if (data.previewUrl) {
        toast.success('Salary slip emailed (test mode)', {
          description: 'Click to view the sent email',
          action: {
            label: 'Open preview',
            onClick: () => window.open(data.previewUrl, '_blank'),
          },
        });
      } else {
        toast.success(`Salary slip emailed to ${slip?.employee.email}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send salary slip email');
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Print-specific styles ─────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #salary-slip-preview, #salary-slip-preview * { visibility: visible; }
          #salary-slip-preview {
            position: absolute; left: 0; top: 0; width: 100%;
            background: white !important; border: none !important;
            box-shadow: none !important; padding: 0 !important; margin: 0 !important;
          }
          #salary-slip-preview .no-print { display: none !important; }
          #salary-slip-preview table, #salary-slip-preview tr { page-break-inside: avoid; }
        }
      `}} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Salary Slips</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate and preview employee salary slips
          </p>
        </div>
      </div>

      {/* ── Controls ───────────────────────────────────────────────── */}
      <Card className="no-print">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label htmlFor="slip-employee">Employee</Label>
              {loadingEmps ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger id="slip-employee" className="w-full">
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
              <Label htmlFor="slip-month">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger id="slip-month" className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slip-year">Year</Label>
              <Input
                id="slip-year"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-[100px]"
              />
            </div>

            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loadingSlip || !employeeId}
              onClick={handleGenerate}
            >
              {loadingSlip ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              Generate Slip
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Loading state ──────────────────────────────────────────── */}
      {loadingSlip && (
        <Card>
          <CardContent className="py-12 space-y-4">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="size-8 animate-spin text-emerald-600 mb-4" />
              <p className="text-muted-foreground">Generating salary slip…</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Empty state ────────────────────────────────────────────── */}
      {!slipGenerated && !loadingSlip && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <AlertCircle className="size-12 mb-4 opacity-30" />
              <p className="text-sm">Select an employee and click &quot;Generate Slip&quot; to preview</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Salary Slip Preview ────────────────────────────────────── */}
      {slip && (
        <Card
          id="salary-slip-preview"
          className="print:shadow-none print:border-0 print:rounded-none"
        >
          <CardContent className="p-0 sm:p-6 md:p-8">
            <div className="max-w-[800px] mx-auto space-y-6">
              {/* ── Company Header ────────────────────────────────── */}
              <div className="text-center border-b-2 border-emerald-600 pb-4">
                <h2 className="text-xl font-bold tracking-tight">{slip.company.name}</h2>
                {slip.company.address && (
                  <p className="text-sm text-muted-foreground mt-1">{slip.company.address}</p>
                )}
                <div className="flex justify-center gap-6 mt-2 text-xs text-muted-foreground">
                  {slip.company.pan && <span>PAN: {slip.company.pan}</span>}
                  {slip.company.tan && <span>TAN: {slip.company.tan}</span>}
                </div>
              </div>

              {/* ── Slip Title ─────────────────────────────────────── */}
              <div className="text-center">
                <h3 className="text-lg font-bold uppercase tracking-widest text-emerald-700">
                  Salary Slip
                </h3>
                <p className="text-sm text-muted-foreground">
                  {slip.monthName} {slip.year}
                </p>
              </div>

              {/* ── Employee Info ─────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm border rounded-lg p-4 bg-muted/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee Name</span>
                  <span className="font-medium">{slip.employee.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee Code</span>
                  <span className="font-mono">{slip.employee.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Designation</span>
                  <span>{slip.employee.designation || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department</span>
                  <span>{slip.employee.department || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PAN</span>
                  <span className="font-mono uppercase">{slip.employee.pan || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bank A/C</span>
                  <span className="font-mono">{slip.employee.bankAccountNumber || '—'}</span>
                </div>
              </div>

              {/* ── Attendance ────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center border rounded-lg p-3 bg-muted/30">
                  <p className="text-muted-foreground text-xs">Days in Month</p>
                  <p className="text-lg font-bold">{slip.attendance.daysInMonth}</p>
                </div>
                <div className="text-center border rounded-lg p-3 bg-muted/30">
                  <p className="text-muted-foreground text-xs">Present Days</p>
                  <p className="text-lg font-bold">{slip.attendance.presentDays}</p>
                </div>
                <div className="text-center border rounded-lg p-3 bg-emerald-50">
                  <p className="text-emerald-600 text-xs">Paid Days</p>
                  <p className="text-lg font-bold text-emerald-700">{slip.attendance.paidDays}</p>
                </div>
              </div>

              {/* ── Earnings & Deductions side by side ────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Earnings */}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-700 mb-2 border-b border-emerald-200 pb-1">
                    Earnings
                  </h4>
                  <Table>
                    <TableBody>
                      <SlipRow label="Basic Salary" value={slip.earnings.basic} />
                      <SlipRow label="Dearness Allowance" value={slip.earnings.dearnessAllowance} />
                      <SlipRow label="House Rent Allowance" value={slip.earnings.houseRentAllowance} />
                      <SlipRow label="Conveyance Allowance" value={slip.earnings.conveyanceAllowance} />
                      <SlipRow label="Medical Allowance" value={slip.earnings.medicalAllowance} />
                      <SlipRow label="Special Allowance" value={slip.earnings.specialAllowance} />
                      <SlipRow label="Overtime" value={slip.earnings.overtimeAllowance} />
                      <SlipRow label="Bonus" value={slip.earnings.bonus} />
                      <SlipRow label="Other Earnings" value={slip.earnings.otherEarnings} />
                      {slip.earnings.hiringIncentive > 0 && (
                        <SlipRow label="Hiring Incentive" value={slip.earnings.hiringIncentive} />
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-emerald-50">
                        <TableCell className="font-bold text-emerald-800">Total Earnings</TableCell>
                        <TableCell className="text-right font-bold text-emerald-800">
                          {fmt(slip.earnings.totalEarnings)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Deductions */}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-red-600 mb-2 border-b border-red-200 pb-1">
                    Deductions
                  </h4>
                  <Table>
                    <TableBody>
                      <SlipRow label="EPF (Employee)" value={slip.deductions.employeePF} />
                      <SlipRow label="ESI (Employee)" value={slip.deductions.employeeESI} />
                      <SlipRow label="TDS" value={slip.deductions.tds} />
                      <SlipRow label="Professional Tax" value={slip.deductions.professionalTax} />
                      <SlipRow label="LWF" value={slip.deductions.lwf} />
                      <SlipRow label="Tardiness Ded." value={slip.deductions.tardinessDeduction} />
                      <SlipRow label="Other Deductions" value={slip.deductions.otherDeductions} />
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-red-50">
                        <TableCell className="font-bold text-red-800">Total Deductions</TableCell>
                        <TableCell className="text-right font-bold text-red-800">
                          {fmt(slip.deductions.totalDeductions)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>

              {/* ── Employer Contributions ────────────────────────── */}
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600 mb-2 border-b pb-1">
                  Employer Contributions
                </h4>
                <Table>
                  <TableBody>
                    <SlipRow label="EPF (Employer)" value={slip.employerContributions.employerPF} />
                    <SlipRow label="EPS" value={slip.employerContributions.employerEPS} />
                    <SlipRow label="EDLI" value={slip.employerContributions.employerEDLI} />
                    <SlipRow label="ESI (Employer)" value={slip.employerContributions.employerESI} />
                  </TableBody>
                </Table>
              </div>

              <Separator />

              {/* ── Summary ───────────────────────────────────────── */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableBody>
                    <SlipRow label="Gross Salary" value={slip.totals.grossSalary} bold />
                    <SlipRow label="Total Deductions" value={slip.totals.totalDeductions} bold />
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-emerald-600 text-white hover:bg-emerald-600">
                      <TableCell className="text-lg font-bold text-white">Net Pay</TableCell>
                      <TableCell className="text-right text-lg font-bold text-white">
                        {fmt(slip.totals.netSalary)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
                <div className="flex justify-between px-4 py-2 bg-muted/50 text-sm">
                  <span className="text-muted-foreground">CTC (Cost to Company)</span>
                  <span className="font-semibold">{fmt(slip.totals.ctc)}</span>
                </div>
              </div>

              <Separator />

              {/* ── Tax Computation ───────────────────────────────── */}
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600 mb-2 border-b pb-1">
                  Tax Computation{' '}
                  <Badge variant="outline" className="ml-2 text-xs font-normal capitalize">
                    {slip.taxComputation.taxRegime} Regime
                  </Badge>
                </h4>
                <Table>
                  <TableBody>
                    <SlipRow label="Annual Gross Salary" value={slip.taxComputation.grossAnnualSalary} />
                    <SlipRow label="Standard Deduction (u/s 16(ia))" value={slip.taxComputation.standardDeduction} />
                    <SlipRow label="Taxable Income" value={slip.taxComputation.taxableIncome} bold />
                    <SlipRow label="Income Tax" value={slip.taxComputation.incomeTax} />
                    <SlipRow label="Health & Education Cess (4%)" value={slip.taxComputation.cess} />
                    <SlipRow label="Rebate u/s 87A" value={slip.taxComputation.rebate87A} />
                    <SlipRow label="Total Annual Tax" value={slip.taxComputation.totalTax} bold />
                    <SlipRow label="Monthly TDS" value={slip.taxComputation.tdsMonthly} bold />
                  </TableBody>
                </Table>
              </div>

              <Separator />

              {/* ── Footer ─────────────────────────────────────────── */}
              <div className="text-center text-xs text-muted-foreground space-y-1 pt-2">
                <p className="italic">
                  This is a system generated salary slip and does not require a signature.
                </p>
                <p>Generated on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              </div>

              {/* ── Print Button (hidden in print) ────────────────── */}
              <div className="flex justify-center gap-3 pt-2 no-print">
                <Button
                  variant="outline"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                  onClick={handlePrint}
                >
                  <Printer className="size-4" />
                  Print Slip
                </Button>
                <Button
                  variant="outline"
                  disabled={sendingEmail || !slip.employee.email}
                  onClick={handleSendEmail}
                >
                  {sendingEmail ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                  Email Slip
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
/*  Slip Row Helper                                                    */
/* ------------------------------------------------------------------ */

function SlipRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <TableRow>
      <TableCell className={bold ? 'font-semibold' : ''}>{label}</TableCell>
      <TableCell
        className={`text-right ${bold ? 'font-semibold' : ''}`}
      >
        {fmt(value)}
      </TableCell>
    </TableRow>
  );
}
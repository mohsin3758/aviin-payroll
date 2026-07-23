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
  TableFooter,
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
  FileText,
  Users,
  TrendingUp,
  TrendingDown,
  Building2,
  Wallet,
  Shield,
  AlertCircle,
  CalendarClock,
  Download,
  Loader2,
  IndianRupee,
  Banknote,
  Receipt,
  Landmark,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePayrollStore } from '@/store/payroll-store';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

type ReportType = 'summary' | 'pf' | 'esi' | 'tds' | 'pt' | 'lwf';

// ─── Mock data types ───────────────────────────────────────────────────────────

interface SummaryData {
  totalEmployees: number;
  totalEarnings: number;
  totalDeductions: number;
  employerContributions: number;
  netPayroll: number;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  tds: number;
  pt: number;
  lwf: number;
}

interface PfRow {
  code: string;
  name: string;
  pfWages: number;
  employeePf: number;
  employerPf: number;
  eps: number;
  edli: number;
  total: number;
}

interface PfData {
  rows: PfRow[];
  totalEmployeePf: number;
  totalEmployerContribution: number;
  challanMonth: string;
  dueDate: string;
}

interface EsiRow {
  code: string;
  name: string;
  grossWages: number;
  employeeEsi: number;
  employerEsi: number;
  totalEsi: number;
}

interface EsiData {
  rows: EsiRow[];
  totalEmployeeEsi: number;
  totalEmployerEsi: number;
  dueDate: string;
}

interface TdsRow {
  code: string;
  name: string;
  pan: string;
  regime: 'New' | 'Old';
  annualGross: number;
  standardDeduction: number;
  taxableIncome: number;
  tax: number;
  cess: number;
  totalTax: number;
  monthlyTds: number;
}

interface TdsData {
  rows: TdsRow[];
  totalTds: number;
  newRegimeCount: number;
  oldRegimeCount: number;
}

interface PtStateGroup {
  state: string;
  rows: { name: string; monthlySalary: number; ptAmount: number }[];
  stateTotal: number;
}

interface PtData {
  states: PtStateGroup[];
}

interface LwfStateGroup {
  state: string;
  employeeContribution: number;
  employerContribution: number;
  totalContribution: number;
  dueDate: string;
  frequency: string;
  employeeCount: number;
}

interface LwfData {
  states: LwfStateGroup[];
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ReportsView() {
  const { refreshKey } = usePayrollStore();

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const [month, setMonth] = useState(String(currentMonth));
  const [year, setYear] = useState(String(currentYear));
  const [reportType, setReportType] = useState<ReportType>('summary');
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  // Report data states
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [pfData, setPfData] = useState<PfData | null>(null);
  const [esiData, setEsiData] = useState<EsiData | null>(null);
  const [tdsData, setTdsData] = useState<TdsData | null>(null);
  const [ptData, setPtData] = useState<PtData | null>(null);
  const [lwfData, setLwfData] = useState<LwfData | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setGenerated(true);
    try {
      const res = await fetch(
        `/api/reports?month=${month}&year=${year}&type=${reportType}`
      );
      if (!res.ok) throw new Error('Failed to fetch report');
      const json = await res.json();
      const d = json.data;

      // The API returns a normalized shape (employees[]/totals/states[]) — mapped here into
      // the view-friendly row shapes the render functions below expect.
      switch (reportType) {
        case 'summary':
          setSummaryData({
            totalEmployees: d.totalEmployees,
            totalEarnings: d.earnings.totalEarnings,
            totalDeductions: d.deductions.totalDeductions,
            employerContributions: d.employerContributions.totalEmployerPF + d.employerContributions.totalEmployerESI,
            netPayroll: d.netPay.totalNetSalary,
            pfEmployee: d.statutoryTotals.pf.employeeShare,
            pfEmployer: d.statutoryTotals.pf.employerShare,
            esiEmployee: d.statutoryTotals.esi.employeeShare,
            esiEmployer: d.statutoryTotals.esi.employerShare,
            tds: d.statutoryTotals.tds,
            pt: d.statutoryTotals.professionalTax,
            lwf: d.statutoryTotals.lwf,
          });
          break;
        case 'pf':
          setPfData({
            rows: d.employees.map((e: Record<string, number | string>) => ({
              code: e.employeeCode,
              name: e.employeeName,
              pfWages: e.pfWages,
              employeePf: e.employeePF,
              employerPf: e.employerPF,
              eps: e.employerEPS,
              edli: e.employerEDLI,
              total: e.totalPF,
            })),
            totalEmployeePf: d.totals.totalEmployeePF,
            totalEmployerContribution: d.totals.totalEmployerPF + d.totals.totalEmployerEPS + d.totals.totalEmployerEDLI,
            challanMonth: `${MONTHS[Number(month) - 1]} ${year}`,
            dueDate: `15th ${MONTHS[Number(month) % 12]} ${Number(month) === 12 ? Number(year) + 1 : year}`,
          });
          break;
        case 'esi':
          setEsiData({
            rows: d.employees.map((e: Record<string, number | string>) => ({
              code: e.employeeCode,
              name: e.employeeName,
              grossWages: e.esiWages,
              employeeEsi: e.employeeESI,
              employerEsi: e.employerESI,
              totalEsi: e.totalESI,
            })),
            totalEmployeeEsi: d.totals.totalEmployeeESI,
            totalEmployerEsi: d.totals.totalEmployerESI,
            dueDate: `15th ${MONTHS[Number(month) % 12]} ${Number(month) === 12 ? Number(year) + 1 : year}`,
          });
          break;
        case 'tds':
          setTdsData({
            rows: d.employees.map((e: Record<string, number | string>) => ({
              code: e.employeeCode,
              name: e.employeeName,
              pan: e.panNumber || '—',
              regime: e.taxRegime === 'old' ? 'Old' : 'New',
              annualGross: Number(e.grossSalary) * 12,
              standardDeduction: e.taxRegime === 'old' ? 50000 : 75000,
              taxableIncome: Math.max(0, Number(e.grossSalary) * 12 - (e.taxRegime === 'old' ? 50000 : 75000)),
              tax: e.tdsAnnual,
              cess: 0, // Cess/tax split isn't persisted per-run; tdsAnnual is the authoritative total.
              totalTax: e.tdsAnnual,
              monthlyTds: e.tdsMonthly,
            })),
            totalTds: d.totals.totalTDS,
            newRegimeCount: d.totals.newRegimeCount,
            oldRegimeCount: d.totals.oldRegimeCount,
          });
          break;
        case 'pt':
          setPtData({
            states: d.states.map((s: { state: string; totalPT: number; employees: { employeeName: string; grossSalary: number; professionalTax: number }[] }) => ({
              state: s.state,
              stateTotal: s.totalPT,
              rows: s.employees.map((e) => ({
                name: e.employeeName,
                monthlySalary: e.grossSalary,
                ptAmount: e.professionalTax,
              })),
            })),
          });
          break;
        case 'lwf':
          setLwfData({
            states: d.states.map((s: { state: string; totalLWF: number; employeeCount: number }) => ({
              state: s.state,
              employeeContribution: s.totalLWF,
              employerContribution: 0,
              totalContribution: s.totalLWF,
              dueDate: 'Per state LWF schedule',
              frequency: 'As applicable',
              employeeCount: s.employeeCount,
            })),
          });
          break;
      }

      toast.success(`${MONTHS[Number(month) - 1]} ${year} ${reportLabel(reportType)} generated`);
    } catch {
      toast.error('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [month, year, reportType]);

  const handleExport = useCallback(async (type: ReportType) => {
    try {
      const res = await fetch(`/api/reports?month=${month}&year=${year}&type=${type}&format=csv`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report-${month}-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch {
      toast.error('Failed to export report');
    }
  }, [month, year]);

  useEffect(() => {
    if (generated) fetchReport();
  }, [refreshKey, generated, fetchReport]);

  const reportLabel = (type: ReportType) => {
    const labels: Record<ReportType, string> = {
      summary: 'Summary Report',
      pf: 'PF Report',
      esi: 'ESI Report',
      tds: 'TDS Report',
      pt: 'Professional Tax Report',
      lwf: 'LWF Report',
    };
    return labels[type];
  };

  // ─── Summary Report ──────────────────────────────────────────────────────────

  const renderSummary = () => {
    if (!summaryData) return null;

    const kpiCards = [
      { label: 'Total Employees', value: String(summaryData.totalEmployees), icon: Users, color: 'text-emerald-600 bg-emerald-50' },
      { label: 'Total Earnings', value: fmt(summaryData.totalEarnings), icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
      { label: 'Total Deductions', value: fmt(summaryData.totalDeductions), icon: TrendingDown, color: 'text-amber-600 bg-amber-50' },
      { label: 'Employer Contributions', value: fmt(summaryData.employerContributions), icon: Building2, color: 'text-sky-600 bg-sky-50' },
      { label: 'Net Payroll', value: fmt(summaryData.netPayroll), icon: Wallet, color: 'text-emerald-700 bg-emerald-50' },
    ];

    const statutoryCards = [
      { label: 'PF (Employee)', value: fmt(summaryData.pfEmployee), icon: Shield, color: 'text-emerald-600 bg-emerald-50' },
      { label: 'PF (Employer)', value: fmt(summaryData.pfEmployer), icon: Shield, color: 'text-emerald-700 bg-emerald-50' },
      { label: 'ESI (Employee)', value: fmt(summaryData.esiEmployee), icon: Shield, color: 'text-orange-600 bg-orange-50' },
      { label: 'ESI (Employer)', value: fmt(summaryData.esiEmployer), icon: Shield, color: 'text-orange-700 bg-orange-50' },
      { label: 'TDS', value: fmt(summaryData.tds), icon: Receipt, color: 'text-violet-600 bg-violet-50' },
      { label: 'Professional Tax', value: fmt(summaryData.pt), icon: Landmark, color: 'text-rose-600 bg-rose-50' },
      { label: 'LWF', value: fmt(summaryData.lwf), icon: Banknote, color: 'text-cyan-600 bg-cyan-50' },
    ];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            Payroll Summary — {MONTHS[Number(month) - 1]} {year}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            onClick={() => handleExport('summary')}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label} className="gap-4">
              <CardContent className="flex items-center gap-4 pt-0">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${kpi.color}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                  <p className="text-lg font-bold leading-tight truncate">{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Statutory Summary */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Statutory Summary
          </h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {statutoryCards.map((s) => (
              <Card key={s.label} className="gap-3 py-4">
                <CardContent className="flex items-center gap-3 pt-0">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${s.color}`}>
                    <s.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground truncate">{s.label}</p>
                    <p className="text-sm font-bold leading-tight truncate">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ─── PF Report ───────────────────────────────────────────────────────────────

  const renderPfReport = () => {
    if (!pfData) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            PF Contribution Report — {MONTHS[Number(month) - 1]} {year}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            onClick={() => handleExport('pf')}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm">
            <p className="font-medium text-emerald-800">Challan Month: {pfData.challanMonth}</p>
            <p className="text-emerald-700">
              Due date: <strong>{pfData.dueDate}</strong> — PF is due on the 15th of the following month.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-emerald-50/60 hover:bg-emerald-50/60">
                    <TableHead className="w-[100px]">Emp Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">PF Wages<br /><span className="font-normal text-xs text-muted-foreground">(Basic+DA)</span></TableHead>
                    <TableHead className="text-right">Employee PF<br /><span className="font-normal text-xs text-muted-foreground">(12%)</span></TableHead>
                    <TableHead className="text-right">Employer PF<br /><span className="font-normal text-xs text-muted-foreground">(3.67%)</span></TableHead>
                    <TableHead className="text-right">EPS<br /><span className="font-normal text-xs text-muted-foreground">(8.33% cap)</span></TableHead>
                    <TableHead className="text-right">EDLI<br /><span className="font-normal text-xs text-muted-foreground">(0.5%)</span></TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pfData.rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.pfWages)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.employeePf)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.employerPf)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.eps)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.edli)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(row.total)}</TableCell>
                    </TableRow>
                  ))}
                  {pfData.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        No PF data available for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {pfData.rows.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-emerald-50/40">
                      <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(pfData.totalEmployeePf)}</TableCell>
                      <TableCell colSpan={3} className="text-right font-semibold tabular-nums">{fmt(pfData.totalEmployerContribution)}</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex items-center gap-2 border-t bg-muted/30 px-6 py-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            PF is due on the 15th of the following month. Wage ceiling: ₹15,000.
          </CardFooter>
        </Card>
      </div>
    );
  };

  // ─── ESI Report ──────────────────────────────────────────────────────────────

  const renderEsiReport = () => {
    if (!esiData) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            ESI Contribution Report — {MONTHS[Number(month) - 1]} {year}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            onClick={() => handleExport('esi')}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
          <div className="text-sm">
            <p className="font-medium text-orange-800">ESI contribution is due by 15th of following month</p>
            <p className="text-orange-700">
              Only employees with gross wages ≤ ₹21,000 are covered under ESI.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-orange-50/60 hover:bg-orange-50/60">
                    <TableHead className="w-[100px]">Emp Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Gross Wages</TableHead>
                    <TableHead className="text-right">Employee ESI<br /><span className="font-normal text-xs text-muted-foreground">(0.75%)</span></TableHead>
                    <TableHead className="text-right">Employer ESI<br /><span className="font-normal text-xs text-muted-foreground">(3.25%)</span></TableHead>
                    <TableHead className="text-right font-semibold">Total ESI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {esiData.rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.grossWages)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.employeeEsi)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.employerEsi)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(row.totalEsi)}</TableCell>
                    </TableRow>
                  ))}
                  {esiData.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No ESI data available for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {esiData.rows.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-orange-50/40">
                      <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(esiData.totalEmployeeEsi)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(esiData.totalEmployerEsi)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmt(esiData.totalEmployeeEsi + esiData.totalEmployerEsi)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ─── TDS Report ──────────────────────────────────────────────────────────────

  const renderTdsReport = () => {
    if (!tdsData) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            TDS Report — {MONTHS[Number(month) - 1]} {year}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            onClick={() => handleExport('tds')}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
          <div className="text-sm">
            <p className="font-medium text-violet-800">TDS under Section 192</p>
            <p className="text-violet-700">
              Deduct monthly, deposit by 7th of next month.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-violet-50/60 hover:bg-violet-50/60">
                    <TableHead className="w-[90px]">Emp Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px]">PAN</TableHead>
                    <TableHead className="w-[100px]">Regime</TableHead>
                    <TableHead className="text-right">Annual Gross</TableHead>
                    <TableHead className="text-right">Std Deduction</TableHead>
                    <TableHead className="text-right">Taxable Income</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Cess (4%)</TableHead>
                    <TableHead className="text-right">Total Tax</TableHead>
                    <TableHead className="text-right font-semibold">Monthly TDS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tdsData.rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-mono text-xs uppercase">{row.pan}</TableCell>
                      <TableCell>
                        <Badge
                          variant={row.regime === 'New' ? 'default' : 'secondary'}
                          className={
                            row.regime === 'New'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-800 border-slate-200'
                          }
                        >
                          {row.regime}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.annualGross)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.standardDeduction)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.taxableIncome)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.tax)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.cess)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.totalTax)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(row.monthlyTds)}</TableCell>
                    </TableRow>
                  ))}
                  {tdsData.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                        No TDS data available for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {tdsData.rows.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-violet-50/40">
                      <TableCell colSpan={10} className="font-semibold">Total TDS</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(tdsData.totalTds)}</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between border-t bg-muted/30 px-6 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5" />
              TDS under Section 192 — deduct monthly, deposit by 7th of next month.
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                New Regime: {tdsData.newRegimeCount}
              </Badge>
              <Badge variant="outline" className="border-slate-400 text-slate-600">
                Old Regime: {tdsData.oldRegimeCount}
              </Badge>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  };

  // ─── Professional Tax Report ─────────────────────────────────────────────────

  const renderPtReport = () => {
    if (!ptData) return null;

    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-foreground">
          Professional Tax Report — {MONTHS[Number(month) - 1]} {year}
        </h3>

        {ptData.states.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center h-24 text-muted-foreground">
              No Professional Tax data available for this period.
            </CardContent>
          </Card>
        )}

        {ptData.states.map((state) => (
          <Card key={state.state}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-rose-500" />
                  {state.state}
                </CardTitle>
                <Badge variant="outline" className="border-emerald-300 text-emerald-700 font-semibold">
                  State Total: {fmt(state.stateTotal)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-rose-50/60 hover:bg-rose-50/60">
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Monthly Salary</TableHead>
                      <TableHead className="text-right font-semibold">PT Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.rows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(row.monthlySalary)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{fmt(row.ptAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-rose-50/40">
                      <TableCell colSpan={2} className="font-semibold">State Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(state.stateTotal)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  // ─── LWF Report ──────────────────────────────────────────────────────────────

  const renderLwfReport = () => {
    if (!lwfData) return null;

    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-foreground">
          Labour Welfare Fund Report — {MONTHS[Number(month) - 1]} {year}
        </h3>

        {lwfData.states.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center h-24 text-muted-foreground">
              No LWF data available for this period.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {lwfData.states.map((state) => (
            <Card key={state.state}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-cyan-500" />
                    {state.state}
                  </CardTitle>
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                    {state.frequency}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Due: {state.dueDate} &middot; {state.employeeCount} employees
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Employee Contribution</p>
                    <p className="text-lg font-bold text-foreground tabular-nums">{fmt(state.employeeContribution)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Employer Contribution</p>
                    <p className="text-lg font-bold text-foreground tabular-nums">{fmt(state.employerContribution)}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                    <p className="text-xs text-emerald-700">Total Contribution</p>
                    <p className="text-lg font-bold text-emerald-800 tabular-nums">{fmt(state.totalContribution)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Compliance Reports</h1>
            <p className="text-sm text-muted-foreground">
              Generate and view statutory compliance reports
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="report-month" className="text-xs font-medium">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger id="report-month" className="w-[160px]">
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
            <Label htmlFor="report-year" className="text-xs font-medium">Year</Label>
            <Input
              id="report-year"
              type="number"
              min={2020}
              max={2035}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-[100px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-type" className="text-xs font-medium">Report Type</Label>
            <Select
              value={reportType}
              onValueChange={(v) => setReportType(v as ReportType)}
            >
              <SelectTrigger id="report-type" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Summary</SelectItem>
                <SelectItem value="pf">PF</SelectItem>
                <SelectItem value="esi">ESI</SelectItem>
                <SelectItem value="tds">TDS</SelectItem>
                <SelectItem value="pt">Professional Tax</SelectItem>
                <SelectItem value="lwf">LWF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={fetchReport}
            disabled={loading}
            className="bg-emerald-600 text-white hover:bg-emerald-700 gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Generate Report
          </Button>
        </CardContent>
      </Card>

      {/* Report Content */}
      {!generated && (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-400">
              <IndianRupee className="h-8 w-8" />
            </div>
            <div>
              <p className="font-medium text-foreground">No report generated</p>
              <p className="text-sm text-muted-foreground">
                Select the period and report type, then click &quot;Generate Report&quot;
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {generated && loading && (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <p className="text-sm text-muted-foreground">Generating report...</p>
          </CardContent>
        </Card>
      )}

      {generated && !loading && (
        <>
          {reportType === 'summary' && renderSummary()}
          {reportType === 'pf' && renderPfReport()}
          {reportType === 'esi' && renderEsiReport()}
          {reportType === 'tds' && renderTdsReport()}
          {reportType === 'pt' && renderPtReport()}
          {reportType === 'lwf' && renderLwfReport()}
        </>
      )}
    </div>
  );
}
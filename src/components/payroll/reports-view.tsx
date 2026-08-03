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
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  UserMinus,
  LineChart as LineChartIcon,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { usePayrollStore } from '@/store/payroll-store';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

type ReportType = 'summary' | 'pf' | 'esi' | 'tds' | 'pt' | 'lwf' | 'headcount' | 'attrition' | 'attendance' | 'leave-balance';
// The 6 original types are all tied to a payroll run for a single month (or range of months);
// headcount/attrition/attendance/leave-balance are workforce-analytics types with their own params.
const STATUTORY_TYPES: ReportType[] = ['summary', 'pf', 'esi', 'tds', 'pt', 'lwf'];
// Attendance shares the statutory types' single month/year picker (no range support), but
// isn't itself tied to a payroll run, so it's kept out of STATUTORY_TYPES (which also gates the
// range-mode checkbox — attendance doesn't support ranges).
const MONTH_YEAR_TYPES: ReportType[] = [...STATUTORY_TYPES, 'attendance'];

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

interface HeadcountData {
  asOf: string;
  totalActiveEmployees: number;
  byDepartment: { department: string; count: number }[];
  byState: { state: string; count: number }[];
  byEmploymentType: { employmentType: string; count: number }[];
}

interface AttritionRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  designation: string;
  state: string;
  dateOfJoining: string;
  dateOfExit: string;
  tenureYears: number;
  exitReason: string | null;
}

interface AttritionData {
  totalExits: number;
  employees: AttritionRow[];
  byDepartment: { department: string; count: number }[];
}

interface TrendMonth {
  month: number;
  year: number;
  exits: number;
  grossPayroll: number;
  netPayroll: number;
}

interface AttendanceRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  designation: string;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  attendancePercent: number;
  overtimeHours: number;
}

interface AttendanceData {
  daysInMonth: number;
  employees: AttendanceRow[];
  totals: { totalEmployees: number; avgAttendancePercent: number };
}

interface LeaveBalanceRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  leaveType: string;
  totalAllocated: number;
  carryForwarded: number;
  used: number;
  remaining: number;
}

interface LeaveBalanceData {
  employees: LeaveBalanceRow[];
  byLeaveType: { leaveType: string; totalAllocated: number; used: number; remaining: number }[];
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

  // Multi-month range mode (statutory types only) — month/year above serve as the range start.
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [toMonth, setToMonth] = useState(String(currentMonth));
  const [toYear, setToYear] = useState(String(currentYear));

  // Attrition report's own date-range params (distinct from the statutory month/year above).
  const todayIso = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(todayIso.slice(0, 8) + '01');
  const [toDate, setToDate] = useState(todayIso);

  // Leave Balance's own single-year param.
  const [leaveYear, setLeaveYear] = useState(String(currentYear));

  // Report data states
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [pfData, setPfData] = useState<PfData | null>(null);
  const [esiData, setEsiData] = useState<EsiData | null>(null);
  const [tdsData, setTdsData] = useState<TdsData | null>(null);
  const [ptData, setPtData] = useState<PtData | null>(null);
  const [lwfData, setLwfData] = useState<LwfData | null>(null);
  const [headcountData, setHeadcountData] = useState<HeadcountData | null>(null);
  const [attritionData, setAttritionData] = useState<AttritionData | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceData | null>(null);
  const [leaveBalanceData, setLeaveBalanceData] = useState<LeaveBalanceData | null>(null);

  // Trends tab
  const [trendMonths, setTrendMonths] = useState<TrendMonth[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);

  // Shared by fetchReport and handleExport so the two can never build different query strings
  // for the same report configuration.
  const buildReportQuery = useCallback((type: ReportType) => {
    const params = new URLSearchParams({ type });
    if (type === 'headcount') {
      // no date params needed — always "right now"
    } else if (type === 'attrition') {
      params.set('fromDate', fromDate);
      params.set('toDate', toDate);
    } else if (type === 'leave-balance') {
      params.set('year', leaveYear);
    } else if (type === 'attendance') {
      params.set('month', month);
      params.set('year', year);
    } else if (isRangeMode) {
      params.set('fromMonth', month);
      params.set('fromYear', year);
      params.set('toMonth', toMonth);
      params.set('toYear', toYear);
    } else {
      params.set('month', month);
      params.set('year', year);
    }
    return params;
  }, [month, year, isRangeMode, toMonth, toYear, fromDate, toDate, leaveYear]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setGenerated(true);
    try {
      const params = buildReportQuery(reportType);
      const res = await fetch(`/api/reports?${params.toString()}`);
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
        case 'headcount':
          setHeadcountData(d as HeadcountData);
          break;
        case 'attrition':
          setAttritionData(d as AttritionData);
          break;
        case 'attendance':
          setAttendanceData(d as AttendanceData);
          break;
        case 'leave-balance':
          setLeaveBalanceData(d as LeaveBalanceData);
          break;
      }

      const periodLabel = reportType === 'headcount' ? 'as of today'
        : reportType === 'attrition' ? `${fromDate} to ${toDate}`
          : reportType === 'leave-balance' ? `Year ${leaveYear}`
            : isRangeMode ? `${MONTHS[Number(month) - 1]} ${year} – ${MONTHS[Number(toMonth) - 1]} ${toYear}`
              : `${MONTHS[Number(month) - 1]} ${year}`;
      toast.success(`${periodLabel} ${reportLabel(reportType)} generated`);
    } catch {
      toast.error('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [month, year, reportType, buildReportQuery, isRangeMode, toMonth, toYear, fromDate, toDate, leaveYear]);

  const handleExport = useCallback(async (type: ReportType, format: 'csv' | 'xlsx' | 'pdf' = 'csv') => {
    try {
      const params = buildReportQuery(type);
      params.set('format', format);
      const res = await fetch(`/api/reports?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = type === 'headcount' ? 'headcount'
        : type === 'attrition' ? `attrition-${fromDate}-to-${toDate}`
          : type === 'leave-balance' ? `leave-balance-${leaveYear}`
            : `${type}-${month}-${year}`;
      a.download = `${suffix}-report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch {
      toast.error('Failed to export report');
    }
  }, [buildReportQuery, month, year, fromDate, toDate, leaveYear]);

  // A shared 3-button export row (CSV/Excel/PDF) so every report view builds this identically
  // rather than repeating the same three <Button> blocks per type.
  const ExportButtons = ({ type }: { type: ReportType }) => (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => handleExport(type, 'csv')}>
        <Download className="h-3.5 w-3.5" /> CSV
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => handleExport(type, 'xlsx')}>
        <Download className="h-3.5 w-3.5" /> Excel
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => handleExport(type, 'pdf')}>
        <Download className="h-3.5 w-3.5" /> PDF
      </Button>
    </div>
  );

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
      headcount: 'Headcount Report',
      attrition: 'Attrition Report',
      attendance: 'Attendance Report',
      'leave-balance': 'Leave Balance Report',
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
            Payroll Summary — {periodDisplay}
          </h3>
          <ExportButtons type="summary" />
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
            PF Contribution Report — {periodDisplay}
          </h3>
          <ExportButtons type="pf" />
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
            ESI Contribution Report — {periodDisplay}
          </h3>
          <ExportButtons type="esi" />
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
            TDS Report — {periodDisplay}
          </h3>
          <ExportButtons type="tds" />
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
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            Professional Tax Report — {periodDisplay}
          </h3>
          <ExportButtons type="pt" />
        </div>

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
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            Labour Welfare Fund Report — {periodDisplay}
          </h3>
          <ExportButtons type="lwf" />
        </div>

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

  // ─── Headcount Report ────────────────────────────────────────────────────────

  const renderHeadcountReport = () => {
    if (!headcountData) return null;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            Headcount Report — as of {new Date(headcountData.asOf).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </h3>
          <ExportButtons type="headcount" />
        </div>

        <Card className="gap-4">
          <CardContent className="flex items-center gap-4 pt-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Active Employees</p>
              <p className="text-lg font-bold">{headcountData.totalActiveEmployees}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-emerald-600" />By Department</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Department</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                <TableBody>
                  {headcountData.byDepartment.map((d) => (
                    <TableRow key={d.department}><TableCell>{d.department}</TableCell><TableCell className="text-right tabular-nums">{d.count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4 text-rose-500" />By State</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>State</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                <TableBody>
                  {headcountData.byState.map((s) => (
                    <TableRow key={s.state}><TableCell>{s.state}</TableCell><TableCell className="text-right tabular-nums">{s.count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ─── Attrition Report ────────────────────────────────────────────────────────

  const renderAttritionReport = () => {
    if (!attritionData) return null;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Attrition Report — {fromDate} to {toDate}</h3>
          <ExportButtons type="attrition" />
        </div>

        <Card className="gap-4">
          <CardContent className="flex items-center gap-4 pt-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <UserMinus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Exits</p>
              <p className="text-lg font-bold">{attritionData.totalExits}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-rose-50/60 hover:bg-rose-50/60">
                    <TableHead>Emp Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Date of Exit</TableHead>
                    <TableHead className="text-right">Tenure (yrs)</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attritionData.employees.map((e) => (
                    <TableRow key={e.employeeId}>
                      <TableCell className="font-mono text-xs">{e.employeeCode}</TableCell>
                      <TableCell className="font-medium">{e.employeeName}</TableCell>
                      <TableCell>{e.department}</TableCell>
                      <TableCell>{e.designation}</TableCell>
                      <TableCell>{new Date(e.dateOfExit).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.tenureYears}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{e.exitReason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {attritionData.employees.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No exits in this period.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ─── Attendance Report ───────────────────────────────────────────────────────

  const renderAttendanceReport = () => {
    if (!attendanceData) return null;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Attendance Report — {MONTHS[Number(month) - 1]} {year}</h3>
          <ExportButtons type="attendance" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="gap-4">
            <CardContent className="flex items-center gap-4 pt-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Employees</p>
                <p className="text-lg font-bold">{attendanceData.totals.totalEmployees}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-4">
            <CardContent className="flex items-center gap-4 pt-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg. Attendance</p>
                <p className="text-lg font-bold">{attendanceData.totals.avgAttendancePercent}%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-emerald-50/60 hover:bg-emerald-50/60">
                    <TableHead className="w-[100px]">Emp Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Half-Day</TableHead>
                    <TableHead className="text-right">Overtime (hrs)</TableHead>
                    <TableHead className="text-right font-semibold">Attendance %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceData.employees.map((row) => (
                    <TableRow key={row.employeeId}>
                      <TableCell className="font-mono text-xs">{row.employeeCode}</TableCell>
                      <TableCell className="font-medium">{row.employeeName}</TableCell>
                      <TableCell>{row.department}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.presentDays}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.absentDays}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.halfDays}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.overtimeHours}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{row.attendancePercent}%</TableCell>
                    </TableRow>
                  ))}
                  {attendanceData.employees.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No active employees found.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex items-center gap-2 border-t bg-muted/30 px-6 py-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Present days include company holidays and weekly-offs with no explicit attendance record — the same definition payroll pays against.
          </CardFooter>
        </Card>
      </div>
    );
  };

  // ─── Leave Balance Report ────────────────────────────────────────────────────

  const renderLeaveBalanceReport = () => {
    if (!leaveBalanceData) return null;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Leave Balance Report — Year {leaveYear}</h3>
          <ExportButtons type="leave-balance" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {leaveBalanceData.byLeaveType.map((lt) => (
            <Card key={lt.leaveType} className="gap-3 py-4">
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">{lt.leaveType}</p>
                <p className="text-sm">Allocated: <span className="font-semibold tabular-nums">{lt.totalAllocated}</span></p>
                <p className="text-sm">Used: <span className="font-semibold tabular-nums">{lt.used}</span></p>
                <p className="text-sm text-emerald-700">Remaining: <span className="font-semibold tabular-nums">{lt.remaining}</span></p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-emerald-50/60 hover:bg-emerald-50/60">
                    <TableHead className="w-[100px]">Emp Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Carry Fwd</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right font-semibold">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveBalanceData.employees.map((row, i) => (
                    <TableRow key={`${row.employeeId}-${row.leaveType}-${i}`}>
                      <TableCell className="font-mono text-xs">{row.employeeCode}</TableCell>
                      <TableCell className="font-medium">{row.employeeName}</TableCell>
                      <TableCell>{row.department}</TableCell>
                      <TableCell>{row.leaveType}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.totalAllocated}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.carryForwarded}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.used}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{row.remaining}</TableCell>
                    </TableRow>
                  ))}
                  {leaveBalanceData.employees.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No leave balances recorded for this year.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ─── Trends Tab ──────────────────────────────────────────────────────────────

  const fetchTrends = useCallback(async () => {
    setTrendsLoading(true);
    try {
      const res = await fetch('/api/reports/trends?months=6');
      if (!res.ok) throw new Error('Failed to load trends');
      const json = await res.json();
      setTrendMonths(json.data.months ?? []);
    } catch {
      toast.error('Failed to load trends');
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrends(); }, [fetchTrends, refreshKey]);

  const trendChartData = trendMonths.map((m) => ({
    name: `${MONTHS[m.month - 1].slice(0, 3)} ${String(m.year).slice(2)}`,
    Gross: m.grossPayroll,
    Net: m.netPayroll,
    Exits: m.exits,
  }));

  const renderTrends = () => (
    <div className="space-y-6">
      {trendsLoading ? (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><IndianRupee className="h-4 w-4 text-emerald-600" />Payroll Cost Trend</CardTitle></CardHeader>
            <CardContent className="pb-6">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => {
                        const abs = Math.abs(v);
                        if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`;
                        if (abs >= 1000) return `₹${(abs / 1000).toFixed(0)}K`;
                        return `₹${abs}`;
                      }}
                    />
                    <Tooltip formatter={(value: number) => fmt(value)} contentStyle={{ borderRadius: '0.75rem', border: '1px solid var(--border)' }} />
                    <Legend verticalAlign="bottom" iconType="circle" iconSize={8} />
                    <Bar dataKey="Gross" name="Gross" radius={[6, 6, 0, 0]} fill="#10b981" />
                    <Bar dataKey="Net" name="Net" radius={[6, 6, 0, 0]} fill="#14b8a6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><UserMinus className="h-4 w-4 text-rose-500" />Attrition Trend</CardTitle></CardHeader>
            <CardContent className="pb-6">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: '0.75rem', border: '1px solid var(--border)' }} />
                    <Bar dataKey="Exits" name="Exits" radius={[6, 6, 0, 0]} fill="#f43f5e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5" />
        Headcount isn&apos;t shown here since past values can&apos;t be reconstructed accurately — only exits and payroll cost have real historical figures.
      </p>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  const isStatutoryType = STATUTORY_TYPES.includes(reportType);
  const periodDisplay = isRangeMode
    ? `${MONTHS[Number(month) - 1]} ${year} – ${MONTHS[Number(toMonth) - 1]} ${toYear}`
    : `${MONTHS[Number(month) - 1]} ${year}`;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports</h1>
            <p className="text-sm text-muted-foreground">
              Statutory compliance, workforce analytics, and trend charts
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Compliance &amp; Workforce Reports</TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5"><LineChartIcon className="h-3.5 w-3.5" />Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-6 mt-4">
          {/* Filters */}
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
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
                      <SelectItem value="headcount">Headcount</SelectItem>
                      <SelectItem value="attrition">Attrition</SelectItem>
                      <SelectItem value="attendance">Attendance</SelectItem>
                      <SelectItem value="leave-balance">Leave Balance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {MONTH_YEAR_TYPES.includes(reportType) && !isRangeMode && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="report-month" className="text-xs font-medium">Month</Label>
                      <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger id="report-month" className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m, i) => (
                            <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="report-year" className="text-xs font-medium">Year</Label>
                      <Input id="report-year" type="number" min={2020} max={2035} value={year} onChange={(e) => setYear(e.target.value)} className="w-[100px]" />
                    </div>
                  </>
                )}

                {isStatutoryType && isRangeMode && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">From</Label>
                      <div className="flex gap-1.5">
                        <Select value={month} onValueChange={setMonth}>
                          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{MONTHS.map((m, i) => (<SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>))}</SelectContent>
                        </Select>
                        <Input type="number" min={2020} max={2035} value={year} onChange={(e) => setYear(e.target.value)} className="w-[90px]" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">To</Label>
                      <div className="flex gap-1.5">
                        <Select value={toMonth} onValueChange={setToMonth}>
                          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{MONTHS.map((m, i) => (<SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>))}</SelectContent>
                        </Select>
                        <Input type="number" min={2020} max={2035} value={toYear} onChange={(e) => setToYear(e.target.value)} className="w-[90px]" />
                      </div>
                    </div>
                  </>
                )}

                {reportType === 'attrition' && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="from-date" className="text-xs font-medium">From Date</Label>
                      <Input id="from-date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[160px]" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="to-date" className="text-xs font-medium">To Date</Label>
                      <Input id="to-date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[160px]" />
                    </div>
                  </>
                )}

                {reportType === 'leave-balance' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="leave-year" className="text-xs font-medium">Year</Label>
                    <Input id="leave-year" type="number" min={2020} max={2035} value={leaveYear} onChange={(e) => setLeaveYear(e.target.value)} className="w-[100px]" />
                  </div>
                )}

                <Button
                  onClick={fetchReport}
                  disabled={loading}
                  className="bg-emerald-600 text-white hover:bg-emerald-700 gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Generate Report
                </Button>
              </div>

              {isStatutoryType && (
                <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
                  <Checkbox checked={isRangeMode} onCheckedChange={(v) => setIsRangeMode(!!v)} />
                  Multi-month date range (spans several payroll runs, summed per employee)
                </label>
              )}
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
              {reportType === 'headcount' && renderHeadcountReport()}
              {reportType === 'attrition' && renderAttritionReport()}
              {reportType === 'attendance' && renderAttendanceReport()}
              {reportType === 'leave-balance' && renderLeaveBalanceReport()}
            </>
          )}
        </TabsContent>

        <TabsContent value="trends" className="mt-4">
          {renderTrends()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
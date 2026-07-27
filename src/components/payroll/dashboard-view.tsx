'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  UserCheck,
  CalendarOff,
  IndianRupee,
  Play,
  ClipboardCheck,
  FileBarChart,
  Eye,
  TrendingUp,
  Building2,
  DollarSign,
  CalendarDays,
  Clock,
  LogOut,
  TrendingDown,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { usePayrollStore } from '@/store/payroll-store';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface DepartmentCount {
  department: string;
  count: number;
}

interface SalaryStats {
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalTDS: number;
  totalPF: number;
  totalESI: number;
  totalEmployerPF: number;
  totalEmployerESI: number;
  totalPT: number;
  totalLWF: number;
}

interface PayrollRunRow {
  id: string;
  month: number;
  year: number;
  status: string;
  totalEmployees: number;
  totalGrossSalary: number;
  totalNetSalary: number;
  processedAt: string | null;
  createdAt: string;
}

interface DashboardData {
  totalEmployees: number;
  presentToday: number;
  onLeaveToday: number;
  payrollSummary: {
    month: number;
    year: number;
    status: string;
    totalEmployees: number;
    processedAt: string | null;
  } | null;
  salaryStats: SalaryStats | null;
  departmentCounts: DepartmentCount[];
  stateCounts: { state: string; count: number }[];
  exitAnalytics: {
    pendingExitApprovals: number;
    employeesInNotice: number;
    exitsThisMonth: number;
    exitsThisQuarter: number;
  };
  recentPayrollRuns: PayrollRunRow[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const fmt = (n: number) => '\u20B9' + n.toLocaleString('en-IN');

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const PIE_COLORS = ['#10b981', '#14b8a6', '#06b6d4', '#f59e0b', '#f43f5e'];

const statusBadge: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  processed: 'bg-sky-100 text-sky-800 border-sky-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function DashboardView() {
  const { setActiveView, setSelectedPayrollRunId } = usePayrollStore();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard');
        if (!cancelled) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        /* keep loading=false, data stays null */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [upcomingHolidays, setUpcomingHolidays] = useState<{ id: string; name: string; date: string }[]>([]);
  const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const [weeklyOffLabel, setWeeklyOffLabel] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [holidaysRes, settingsRes] = await Promise.all([
          fetch(`/api/holidays?year=${new Date().getFullYear()}`),
          fetch('/api/settings'),
        ]);
        const holidaysJson = await holidaysRes.json();
        const today = new Date();
        const upcoming = (holidaysJson.data ?? [])
          .filter((h: { date: string }) => new Date(h.date) >= new Date(today.toDateString()))
          .slice(0, 5);
        setUpcomingHolidays(upcoming);

        const settingsJson = await settingsRes.json();
        const days: number[] = settingsJson.data?.weeklyOffDays ?? [];
        setWeeklyOffLabel(days.map((d) => WEEKDAY_NAMES[d]).join(', '));
      } catch {
        /* non-critical widget, fail silently */
      }
    })();
     
  }, []);

  /* ---- Derived ---- */

  const departmentData = (data?.departmentCounts ?? []).map((d) => ({
    name: d.department,
    value: d.count,
  }));

  const barData = data?.salaryStats
    ? [
        { name: 'Gross', value: data.salaryStats.totalGross },
        { name: 'Deductions', value: -data.salaryStats.totalDeductions },
        { name: 'Net', value: data.salaryStats.totalNet },
      ]
    : [];

  /* ---- Handlers ---- */

  const handleViewRun = (run: PayrollRunRow) => {
    setSelectedPayrollRunId(run.id);
    setActiveView('payroll');
  };

  /* ------------------------------------------------------------------ */
  /*  Loading skeleton                                                  */
  /* ------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="space-y-6">
        {/* KPI skeletons */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-white rounded-xl border shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chart skeletons */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>

        {/* Table skeleton */}
        <Skeleton className="h-64 rounded-xl" />

        {/* Quick actions skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Empty state                                                        */
  /* ------------------------------------------------------------------ */

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <TrendingUp className="mb-4 size-12" />
        <p className="text-lg font-medium">Unable to load dashboard data.</p>
        <p className="text-sm">Please check your connection and try again.</p>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/*  1. KPI Cards Row                                            */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Employees */}
        <Card className="bg-white rounded-xl border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Users className="size-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{data.totalEmployees}</p>
                <p className="text-sm text-muted-foreground">Total Employees</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Present Today */}
        <Card className="bg-white rounded-xl border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                <UserCheck className="size-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{data.presentToday}</p>
                <p className="text-sm text-muted-foreground">Present Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* On Leave Today */}
        <Card className="bg-white rounded-xl border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <CalendarOff className="size-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{data.onLeaveToday}</p>
                <p className="text-sm text-muted-foreground">On Leave Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Payroll */}
        <Card className="bg-white rounded-xl border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <IndianRupee className="size-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {data.salaryStats ? fmt(data.salaryStats.totalNet) : '--'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.payrollSummary
                    ? `Monthly Payroll \u00B7 ${MONTH_NAMES[data.payrollSummary.month - 1]} ${data.payrollSummary.year}`
                    : 'Monthly Payroll'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================ */}
      {/*  1b. Company Calendar — visible to every role                */}
      {/* ============================================================ */}
      {(upcomingHolidays.length > 0 || weeklyOffLabel) && (
        <Card className="bg-white rounded-xl border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-emerald-600" />
              Company Calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            {weeklyOffLabel && (
              <p className="mb-3 text-sm text-muted-foreground">
                Weekly off: <span className="font-medium text-foreground">{weeklyOffLabel}</span>
              </p>
            )}
            {upcomingHolidays.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {upcomingHolidays.map((h) => (
                  <div key={h.id} className="rounded-lg border bg-emerald-50/50 px-3 py-2 text-sm">
                    <span className="font-medium">{h.name}</span>{' '}
                    <span className="text-muted-foreground">
                      — {new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/*  2. Charts Row                                               */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Department Distribution - PieChart */}
        <Card className="bg-white rounded-xl border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-emerald-600" />
              Department Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            {departmentData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={departmentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                    >
                      {departmentData.map((_, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '0.75rem',
                        border: '1px solid var(--border)',
                        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                No department data available.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Salary Stats - BarChart */}
        <Card className="bg-white rounded-xl border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="size-4 text-emerald-600" />
              Monthly Salary Stats
              {data.payrollSummary && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {MONTH_NAMES[data.payrollSummary.month - 1]} {data.payrollSummary.year}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            {barData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => {
                        const abs = Math.abs(v);
                        if (abs >= 100000) return `\u20B9${(abs / 100000).toFixed(1)}L`;
                        if (abs >= 1000) return `\u20B9${(abs / 1000).toFixed(0)}K`;
                        return `\u20B9${abs}`;
                      }}
                    />
                    <Tooltip
                      formatter={(value: number) => fmt(Math.abs(value))}
                      contentStyle={{
                        borderRadius: '0.75rem',
                        border: '1px solid var(--border)',
                        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar
                      dataKey="value"
                      name="Amount"
                      radius={[6, 6, 0, 0]}
                      fill="#10b981"
                    >
                      {barData.map((entry, idx) => (
                        <Cell
                          key={`bar-${idx}`}
                          fill={
                            entry.name === 'Gross'
                              ? '#10b981'
                              : entry.name === 'Deductions'
                                ? '#f43f5e'
                                : '#14b8a6'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                No payroll data available.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============================================================ */}
      {/*  3. Recent Payroll Runs Table                                */}
      {/* ============================================================ */}
      <Card className="bg-white rounded-xl border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-emerald-600" />
            Recent Payroll Runs
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          {data.recentPayrollRuns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Gross Salary</TableHead>
                  <TableHead className="text-right">Net Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentPayrollRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {MONTH_NAMES[run.month - 1]}
                    </TableCell>
                    <TableCell>{run.year}</TableCell>
                    <TableCell className="text-right">{run.totalEmployees}</TableCell>
                    <TableCell className="text-right">{fmt(run.totalGrossSalary)}</TableCell>
                    <TableCell className="text-right">{fmt(run.totalNetSalary)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadge[run.status] ?? 'border-border'}
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                        onClick={() => handleViewRun(run)}
                      >
                        <Eye className="size-4" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No payroll runs yet. Process your first payroll run to see data here.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/*  4. Quick Actions Row                                        */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Process Payroll */}
        <Card className="group cursor-pointer border-dashed border-emerald-200 bg-gradient-to-br from-white to-emerald-50/40 transition-all hover:border-emerald-400 hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-200">
              <Play className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Process Payroll</p>
              <p className="text-xs text-muted-foreground">Run payroll for current month</p>
            </div>
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={(e) => {
                e.stopPropagation();
                setActiveView('payroll');
              }}
            >
              Go
            </Button>
          </CardContent>
        </Card>

        {/* Mark Attendance */}
        <Card className="group cursor-pointer border-dashed border-teal-200 bg-gradient-to-br from-white to-teal-50/40 transition-all hover:border-teal-400 hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm shadow-teal-200">
              <ClipboardCheck className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Mark Attendance</p>
              <p className="text-xs text-muted-foreground">Record daily attendance</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
              onClick={(e) => {
                e.stopPropagation();
                setActiveView('attendance');
              }}
            >
              Go
            </Button>
          </CardContent>
        </Card>

        {/* Generate Reports */}
        <Card className="group cursor-pointer border-dashed border-rose-200 bg-gradient-to-br from-white to-rose-50/40 transition-all hover:border-rose-400 hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm shadow-rose-200">
              <FileBarChart className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Generate Reports</p>
              <p className="text-xs text-muted-foreground">Export payroll &amp; compliance reports</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              onClick={(e) => {
                e.stopPropagation();
                setActiveView('reports');
              }}
            >
              Go
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================ */}
      {/*  Exit Analytics                                              */}
      {/* ============================================================ */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Exit Analytics</h3>
          <Button variant="ghost" size="sm" className="text-emerald-700" onClick={() => setActiveView('exit-management')}>
            View Exit Management
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="bg-white rounded-xl border shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                  <ClipboardCheck className="size-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{data.exitAnalytics.pendingExitApprovals}</p>
                  <p className="text-sm text-muted-foreground">Pending Exit Approvals</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-xl border shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <Clock className="size-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{data.exitAnalytics.employeesInNotice}</p>
                  <p className="text-sm text-muted-foreground">Serving Notice Period</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-xl border shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <LogOut className="size-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{data.exitAnalytics.exitsThisMonth}</p>
                  <p className="text-sm text-muted-foreground">Exits This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-xl border shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                  <TrendingDown className="size-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{data.exitAnalytics.exitsThisQuarter}</p>
                  <p className="text-sm text-muted-foreground">Exits This Quarter</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
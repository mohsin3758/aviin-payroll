'use client';

import { PayrollLayout } from '@/components/payroll/layout';
import { TopBar } from '@/components/payroll/top-bar';
import { usePayrollStore } from '@/store/payroll-store';
import { lazy, Suspense } from 'react';

const DashboardView = lazy(() => import('@/components/payroll/dashboard-view'));
const EmployeesView = lazy(() => import('@/components/payroll/employees-view'));
const AttendanceView = lazy(() => import('@/components/payroll/attendance-view'));
const LeavesView = lazy(() => import('@/components/payroll/leaves-view'));
const PayrollView = lazy(() => import('@/components/payroll/payroll-view'));
const SalarySlipView = lazy(() => import('@/components/payroll/salary-slip-view'));
const ReportsView = lazy(() => import('@/components/payroll/reports-view'));
const SettingsView = lazy(() => import('@/components/payroll/settings-view'));

function LoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    </div>
  );
}

function ViewRenderer() {
  const { activeView, refreshKey } = usePayrollStore();

  // Use refreshKey to force re-mount when needed
  const key = `${activeView}-${refreshKey}`;

  return (
    <Suspense fallback={<LoadingFallback />}>
      {activeView === 'dashboard' && <DashboardView key={key} />}
      {activeView === 'employees' && <EmployeesView key={key} />}
      {activeView === 'attendance' && <AttendanceView key={key} />}
      {activeView === 'leaves' && <LeavesView key={key} />}
      {activeView === 'payroll' && <PayrollView key={key} />}
      {activeView === 'salary-slip' && <SalarySlipView key={key} />}
      {activeView === 'reports' && <ReportsView key={key} />}
      {activeView === 'settings' && <SettingsView key={key} />}
    </Suspense>
  );
}

export default function Home() {
  return (
    <PayrollLayout>
      <TopBar />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <ViewRenderer />
      </main>
    </PayrollLayout>
  );
}
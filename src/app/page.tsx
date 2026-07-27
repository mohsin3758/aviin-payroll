'use client';

import { PayrollLayout } from '@/components/payroll/layout';
import { TopBar } from '@/components/payroll/top-bar';
import { usePayrollStore } from '@/store/payroll-store';
import { useSession } from '@/hooks/use-session';
import { SessionProvider } from '@/hooks/session-context';
import LoginView from '@/components/payroll/login-view';
import { lazy, Suspense } from 'react';

const DashboardView = lazy(() => import('@/components/payroll/dashboard-view'));
const EmployeesView = lazy(() => import('@/components/payroll/employees-view'));
const AttendanceView = lazy(() => import('@/components/payroll/attendance-view'));
const LeavesView = lazy(() => import('@/components/payroll/leaves-view'));
const PayrollView = lazy(() => import('@/components/payroll/payroll-view'));
const SalarySlipView = lazy(() => import('@/components/payroll/salary-slip-view'));
const Form16View = lazy(() => import('@/components/payroll/form16-view'));
const ReportsView = lazy(() => import('@/components/payroll/reports-view'));
const SettingsView = lazy(() => import('@/components/payroll/settings-view'));
const MyPortalView = lazy(() => import('@/components/payroll/ess/my-portal-view'));
const OnboardingView = lazy(() => import('@/components/payroll/onboarding-view'));
const ExitManagementView = lazy(() => import('@/components/payroll/exit-management-view'));
const HelpDeskView = lazy(() => import('@/components/payroll/helpdesk-view'));

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
      {activeView === 'form16' && <Form16View key={key} />}
      {activeView === 'reports' && <ReportsView key={key} />}
      {activeView === 'settings' && <SettingsView key={key} />}
      {activeView === 'my-portal' && <MyPortalView key={key} />}
      {activeView === 'onboarding' && <OnboardingView key={key} />}
      {activeView === 'exit-management' && <ExitManagementView key={key} />}
      {activeView === 'helpdesk' && <HelpDeskView key={key} />}
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
    </div>
  );
}

export default function Home() {
  const { user, loading, refresh, logout } = useSession();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginView onLoggedIn={refresh} />;
  }

  return (
    <SessionProvider value={{ user, logout }}>
      <PayrollLayout>
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <ViewRenderer />
        </main>
      </PayrollLayout>
    </SessionProvider>
  );
}
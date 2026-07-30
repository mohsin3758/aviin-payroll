'use client';

import { useEffect, useState } from 'react';
import { usePayrollStore, type ViewType } from '@/store/payroll-store';
import { useSessionContext } from '@/hooks/session-context';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Fingerprint,
  CalendarOff,
  Calculator,
  FileText,
  BarChart3,
  Settings,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
  Award,
  UserCircle,
  UserPlus,
  UserMinus,
  LifeBuoy,
  HandCoins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NavItem {
  id: ViewType;
  label: string;
  icon: React.ElementType;
  /** Only shown when the current login is linked to an Employee record. */
  requiresEmployeeId?: boolean;
  /** Only shown to these roles. Undefined = visible to everyone (preserves prior behavior). */
  roles?: Array<'admin' | 'hr' | 'manager' | 'employee'>;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-portal', label: 'My Portal', icon: UserCircle, requiresEmployeeId: true },
  // Manager gets read-only access (backend strips salary figures); employee is directed to
  // My Portal instead of a company-wide directory.
  { id: 'employees', label: 'Employees', icon: Users, roles: ['admin', 'hr', 'manager'] },
  { id: 'onboarding', label: 'Onboarding', icon: UserPlus, roles: ['admin', 'hr'] },
  // Backend manager-approve route already accepts the manager role for stage-1 approval —
  // this was the one nav item actively blocking a capability the backend already supports.
  { id: 'exit-management', label: 'Exit Management', icon: UserMinus, roles: ['admin', 'hr', 'manager'] },
  // Stays visible to every role: employee's own My Portal Attendance tab is read-only, so this
  // shared page is the only place to actually punch in/out. Backend + UI scope it to self.
  { id: 'attendance', label: 'Attendance', icon: Fingerprint },
  // Employee applies/tracks leave via My Portal instead; this page is the approval surface.
  { id: 'leaves', label: 'Leave Mgmt', icon: CalendarOff, roles: ['admin', 'hr', 'manager'] },
  { id: 'payroll', label: 'Payroll', icon: Calculator, roles: ['admin', 'hr'] },
  { id: 'salary-slip', label: 'Salary Slips', icon: FileText, roles: ['admin', 'hr'] },
  { id: 'form16', label: 'Form 16', icon: Award, roles: ['admin', 'hr'] },
  { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'hr', 'manager'] },
  { id: 'candidates', label: 'Candidates', icon: UserPlus, roles: ['admin', 'hr'] },
  { id: 'hiring-incentives', label: 'Hiring Incentives', icon: HandCoins, roles: ['admin', 'hr'] },
  { id: 'helpdesk', label: 'Help Desk', icon: LifeBuoy },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['admin', 'hr', 'manager'] },
];

export function PayrollLayout({ children }: { children: React.ReactNode }) {
  const { activeView, sidebarOpen, setActiveView, setSidebarOpen } = usePayrollStore();
  const { user } = useSessionContext();
  const [fyLabel, setFyLabel] = useState('');

  const visibleNavItems = navItems.filter(
    (item) =>
      (!item.roles || item.roles.includes(user?.role ?? 'employee')) &&
      (!item.requiresEmployeeId || !!user?.employeeId)
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        const start = json.data?.financialYearStart as string | undefined;
        if (start) {
          const startYear = new Date(start).getFullYear();
          setFyLabel(`FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`);
        }
      } catch {
        /* non-critical badge, fail silently */
      }
    })();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 260 : 64 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          'fixed z-50 flex h-full flex-col bg-slate-900 text-white md:relative md:z-auto',
          !sidebarOpen && 'md:min-w-[64px]'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-700/50 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
            <IndianRupee className="h-5 w-5 text-white" />
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden"
              >
                <h1 className="text-base font-bold tracking-tight">PayrollPro</h1>
                <p className="text-[10px] text-slate-400">Indian Payroll Management</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <TooltipProvider delayDuration={0}>
          <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              const button = (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveView(item.id);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <AnimatePresence>
                    {sidebarOpen && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="truncate"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );

              if (!sidebarOpen) {
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return button;
            })}
          </nav>
        </TooltipProvider>

        {/* Sidebar Footer */}
        <div className="border-t border-slate-700/50 p-3">
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                <Badge variant="outline" className="w-full justify-center border-emerald-600/30 text-emerald-400 text-xs">
                  {fyLabel || '—'}
                </Badge>
                <p className="text-center text-[10px] text-slate-500">PF | ESI | TDS | PT | LWF</p>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
'use client';

import { useState, useEffect } from 'react';
import { usePayrollStore } from '@/store/payroll-store';
import { Menu, Database, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  employees: 'Employee Management',
  attendance: 'Attendance Management',
  leaves: 'Leave Management',
  payroll: 'Payroll Processing',
  'salary-slip': 'Salary Slips',
  reports: 'Compliance Reports',
  settings: 'Company Settings',
};

export function TopBar() {
  const { activeView, setSidebarOpen, triggerRefresh } = usePayrollStore();
  const [seeding, setSeeding] = useState(false);
  const [today, setToday] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }));
    setMounted(true);
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Database seeded successfully!');
        triggerRefresh();
      } else {
        toast.error(data.error || 'Failed to seed database');
      }
    } catch {
      toast.error('Failed to seed database');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-4 md:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{viewTitles[activeView] || 'Dashboard'}</h2>
          {mounted && (
            <p className="hidden text-xs text-slate-500 sm:block">{today}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <Button
          variant="outline"
          size="sm"
          className="hidden gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 sm:flex"
          onClick={handleSeed}
          disabled={seeding}
        >
          <Database className="h-4 w-4" />
          {seeding ? 'Seeding...' : 'Seed Demo Data'}
        </Button>

        <Badge variant="outline" className="hidden border-emerald-200 text-emerald-700 md:inline-flex">
          Admin
        </Badge>

        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-emerald-600 text-xs text-white">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
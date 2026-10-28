'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSessionContext } from '@/hooks/session-context';
import AttentionTab from '@/components/workforce/attention-tab';
import BoardTab from '@/components/workforce/board-tab';
import MonthTab from '@/components/workforce/month-tab';
import ReportsTab from '@/components/workforce/reports-tab';
import SetupTab from '@/components/workforce/setup-tab';
import HealthTab from '@/components/workforce/health-tab';

/**
 * Contractor Workforce: the coordinator's workspace. Starts on "Needs attention" (the call queue),
 * not on a headcount, because the aim is to be told only when something is NOT normal.
 * admin/hr see everything; a manager (acting as a coordinator) sees only their own assignments.
 */
export default function WorkforceView() {
  const { user } = useSessionContext();
  const full = user?.role === 'admin' || user?.role === 'hr';
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Contractor Workforce</h1>
        <p className="text-sm text-slate-600">Daily check-ins, reminders and escalation. You are told only when something is not normal.</p>
      </div>
      <Tabs defaultValue="attention">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="attention">Needs attention</TabsTrigger>
          <TabsTrigger value="board">Live board</TabsTrigger>
          <TabsTrigger value="month">Month &amp; payroll</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          {full && <TabsTrigger value="setup">Setup</TabsTrigger>}
          {full && <TabsTrigger value="health">Health</TabsTrigger>}
        </TabsList>
        <TabsContent value="attention" className="mt-4"><AttentionTab /></TabsContent>
        <TabsContent value="board" className="mt-4"><BoardTab /></TabsContent>
        <TabsContent value="month" className="mt-4"><MonthTab /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportsTab /></TabsContent>
        {full && <TabsContent value="setup" className="mt-4"><SetupTab /></TabsContent>}
        {full && <TabsContent value="health" className="mt-4"><HealthTab /></TabsContent>}
      </Tabs>
    </div>
  );
}

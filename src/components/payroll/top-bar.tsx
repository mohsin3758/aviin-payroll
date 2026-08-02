'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePayrollStore, type ViewType } from '@/store/payroll-store';
import { Menu, Database, User, LogOut, Sun, Moon, Bell, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useSessionContext } from '@/hooks/session-context';
import { useTheme } from 'next-themes';

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  'my-portal': 'My Portal',
  employees: 'Employee Management',
  onboarding: 'Employee Onboarding',
  'exit-management': 'Exit Management',
  attendance: 'Attendance Management',
  leaves: 'Leave Management',
  payroll: 'Payroll Processing',
  'salary-slip': 'Salary Slips',
  form16: 'Form 16',
  reports: 'Compliance Reports',
  helpdesk: 'Help Desk',
  settings: 'Company Settings',
};

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  category: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function TopBar() {
  const { activeView, setActiveView, setSidebarOpen, triggerRefresh } = usePayrollStore();
  const { user, logout } = useSessionContext();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [seeding, setSeeding] = useState(false);
  const [today, setToday] = useState('');
  const [mounted, setMounted] = useState(false);

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      toast.success('Password changed.');
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.data ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // non-critical, fail silently
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleNotificationClick = async (n: NotificationRow) => {
    if (!n.isRead) {
      try {
        await fetch(`/api/notifications/${n.id}`, { method: 'PUT' });
        fetchNotifications();
      } catch {
        // non-critical
      }
    }
    if (n.link) setActiveView(n.link as ViewType);
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
      fetchNotifications();
    } catch {
      toast.error('Failed to mark notifications read');
    }
  };

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
    if (!confirm('This permanently deletes the current company record and everything under it — employees, salary structures, attendance, leaves, and payroll runs — then replaces it with fresh demo data. There is no undo. Continue?')) {
      return;
    }
    setSeeding(true);
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESET_DEMO_DATA' }),
      });
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
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 md:px-6">
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
          <h2 className="text-lg font-semibold text-foreground">{viewTitles[activeView] || 'Dashboard'}</h2>
          {mounted && (
            <p className="hidden text-xs text-muted-foreground sm:block">{today}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {user?.role === 'admin' && process.env.NODE_ENV !== 'production' && (
          <Button
            variant="outline"
            size="sm"
            className="hidden gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 sm:flex"
            onClick={handleSeed}
            disabled={seeding}
          >
            <Database className="h-4 w-4" />
            {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </Button>
        )}

        <Badge variant="outline" className="hidden border-emerald-200 text-emerald-700 md:inline-flex capitalize">
          {user?.role ?? 'guest'}
        </Badge>

        <Button
          variant="ghost"
          size="icon"
          title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          {mounted && theme ? (resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <span className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" title="Notifications">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="p-0 font-medium">Notifications</DropdownMenuLabel>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className="text-xs text-emerald-600 hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications yet.</p>
              ) : (
                notifications.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`flex-col items-start gap-0.5 whitespace-normal ${n.isRead ? '' : 'bg-emerald-50 dark:bg-emerald-950/20'}`}
                  >
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{n.message}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString('en-IN')}</span>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full outline-none ring-emerald-600 focus-visible:ring-2">
              <Avatar className="h-8 w-8 cursor-pointer" title={user?.name}>
                <AvatarFallback className="bg-emerald-600 text-xs text-white">
                  {user?.name ? user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() : <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="font-medium">{user?.name}</div>
              <div className="text-xs font-normal text-muted-foreground">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
              <KeyRound className="h-4 w-4" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={passwordOpen} onOpenChange={(open) => { if (!open && !changingPassword) setPasswordOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Update the password for your own login.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Current Password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New Password</Label>
              <Input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)} disabled={changingPassword}>Cancel</Button>
            <Button onClick={handleChangePassword} disabled={changingPassword} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {changingPassword ? <Loader2 className="size-4 animate-spin" /> : null}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
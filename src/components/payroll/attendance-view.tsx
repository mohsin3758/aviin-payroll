'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Fingerprint,
  LogOut,
  Clock,
  UserCheck,
  UserX,
  Users,
  CheckCircle2,
  Loader2,
  AlertCircle,
  MonitorSmartphone,
  Pencil,
  Upload,
  XCircle,
  CalendarClock,
} from 'lucide-react';

import { usePayrollStore } from '@/store/payroll-store';
import { useSessionContext } from '@/hooks/session-context';
import { istDateOnly } from '@/lib/date-ist';
import { loadFaceModels, captureFaceDescriptor, describeCameraError } from '@/lib/face-recognition-client';

// Bounds the punch API call the same way captureFaceDescriptor bounds on-device detection — a
// stalled/slow network request fails fast with a clear error instead of leaving "Finalizing..."
// spinning forever.
const PUNCH_REQUEST_TIMEOUT_MS = 15000;
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  department?: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  punchInMethod: string | null;
  punchOutMethod: string | null;
  punchSessions: string | null;
  faceVerified: boolean;
  faceConfidence: number | null;
  distanceFromOfficeMeters: number | null;
  status: string;
  totalHours: number | null;
  notes: string | null;
  employee: {
    firstName: string;
    lastName: string;
    employeeCode: string;
  };
}

interface PunchSession {
  punchIn: string;
  punchOut: string | null;
  punchInMethod: string;
  punchOutMethod: string | null;
}

/** Mirrors the server's effectiveSessions() fallback: a legacy/admin-only record with no
 * punchSessions JSON is treated as one implicit session from its top-level punchIn/punchOut. */
function parseSessions(record: { punchSessions: string | null; punchIn: string | null; punchOut: string | null; punchInMethod: string | null; punchOutMethod: string | null } | null): PunchSession[] {
  if (!record) return [];
  if (record.punchSessions) {
    try {
      const parsed = JSON.parse(record.punchSessions);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* fall through to legacy fallback */
    }
  }
  if (!record.punchIn) return [];
  return [{ punchIn: record.punchIn, punchOut: record.punchOut, punchInMethod: record.punchInMethod ?? 'manual', punchOutMethod: record.punchOutMethod }];
}

function isSessionOpen(record: { punchSessions: string | null; punchIn: string | null; punchOut: string | null; punchInMethod: string | null; punchOutMethod: string | null } | null): boolean {
  const sessions = parseSessions(record);
  if (sessions.length === 0) return false;
  return !sessions[sessions.length - 1].punchOut;
}

interface TodayPunch {
  id: string;
  punchIn: string | null;
  punchOut: string | null;
  punchSessions: string | null;
  status: string;
  totalHours: number | null;
  punchInMethod: string | null;
  punchOutMethod: string | null;
  distanceFromOfficeMeters: number | null;
}

type PunchAction = 'in' | 'out';
type VerificationStep = 'idle' | 'initializing' | 'detecting' | 'verifying' | 'verified' | 'error';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_CONFIG: Record<string, { label: string; className: string; rowClass: string }> = {
  present: { label: 'Present', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', rowClass: 'bg-emerald-50/50 dark:bg-emerald-950/20' },
  absent: { label: 'Absent', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800', rowClass: 'bg-red-50/50 dark:bg-red-950/20' },
  'half-day': { label: 'Half Day', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800', rowClass: 'bg-amber-50/50 dark:bg-amber-950/20' },
  holiday: { label: 'Holiday', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800', rowClass: 'bg-purple-50/50 dark:bg-purple-950/20' },
  'weekly-off': { label: 'Weekly Off', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400 border-gray-200 dark:border-gray-700', rowClass: 'bg-gray-50/50 dark:bg-gray-950/10' },
};

const METHOD_BADGE: Record<string, string> = {
  face: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
  manual: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  login: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-200 dark:border-sky-800',
};

// Display-only labels — the stored punchInMethod/punchOutMethod DB values ("face", "manual",
// "login") are unchanged; only what's shown to the user avoids implying real biometric
// verification for the "face" method (see gap 5 in the training guide).
const METHOD_LABEL: Record<string, string> = {
  face: 'Quick Confirm',
  manual: 'Manual',
  login: 'Login',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatElapsed(fromMs: number, toMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((toMs - fromMs) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AttendanceView() {
  const { refreshKey, triggerRefresh } = usePayrollStore();
  const { user } = useSessionContext();
  const isStaff = user?.role === 'admin' || user?.role === 'hr';
  const isEmployeeRole = user?.role === 'employee';
  const canReviewRegularizations = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'manager';
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // ---- Office location config (drives whether geolocation is captured at all, and whether
  // the login-attendance info card reflects an active or inactive feature) ----
  const [officeConfigured, setOfficeConfigured] = useState(false);
  const [geofenceEnforced, setGeofenceEnforced] = useState(false);
  const [loginAttendanceEnabled, setLoginAttendanceEnabled] = useState(false);
  const [logoutAttendanceEnabled, setLogoutAttendanceEnabled] = useState(false);
  const [allowFacePunch, setAllowFacePunch] = useState(true);
  const [allowManualPunch, setAllowManualPunch] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        setOfficeConfigured(json.data?.officeLatitude != null && json.data?.officeLongitude != null);
        setGeofenceEnforced(!!json.data?.enforceGeofence);
        setLoginAttendanceEnabled(!!json.data?.enableLoginAttendance);
        setLogoutAttendanceEnabled(!!json.data?.enableLogoutAttendance);
        setAllowFacePunch(json.data?.allowFacePunch !== false);
        setAllowManualPunch(json.data?.allowManualPunch !== false);
      } catch {
        /* non-critical, defaults are safe (no geo prompt, "not enabled" copy) */
      }
    })();
  }, []);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/attendance/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      const { imported, skipped, totalRows } = data.data;
      if (skipped > 0) {
        toast.warning(`Imported ${imported}/${totalRows} rows — ${skipped} skipped (check employeeCode/date/status columns)`);
      } else {
        toast.success(`Imported ${imported} attendance record(s)`);
      }
      triggerRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // ---- State: Filters ----
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all');

  // ---- State: Employees ----
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);

  // ---- State: Attendance Data ----
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  // ---- State: Regularization Requests ----
  const [regularizations, setRegularizations] = useState<{
    id: string;
    date: string;
    requestedPunchIn: string | null;
    requestedPunchOut: string | null;
    reason: string;
    status: string;
    employee: { firstName: string; lastName: string | null; employeeCode: string };
  }[]>([]);
  const [regularizationsLoading, setRegularizationsLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewTarget, setReviewTarget] = useState<{ id: string; approved: boolean } | null>(null);
  const [reviewing, setReviewing] = useState(false);

  // ---- State: Live Clock ----
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // ---- State: Punch ----
  const [punchEmployeeId, setPunchEmployeeId] = useState<string>('');
  const [todayPunch, setTodayPunch] = useState<TodayPunch | null>(null);

  // Employee role: locked to their own record — GET /api/attendance/punch is scoped so an
  // employee session can only punch for themselves anyway; this keeps the UI honest about that.
  useEffect(() => {
    if (isEmployeeRole && user?.employeeId) {
      setPunchEmployeeId(user.employeeId);
    }
  }, [isEmployeeRole, user?.employeeId]);

  // ---- State: Confirm Punch Dialog ----
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [punchAction, setPunchAction] = useState<PunchAction>('in');
  const [verificationStep, setVerificationStep] = useState<VerificationStep>('idle');
  const [verificationPunching, setVerificationPunching] = useState(false);
  const [faceCameraReady, setFaceCameraReady] = useState(false);
  const [faceModelsReady, setFaceModelsReady] = useState(false);
  const [faceCameraError, setFaceCameraError] = useState<string | null>(null);
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);

  // ---- State: Manual Punch Dialog ----
  const [manualTime, setManualTime] = useState<string>('');
  const [manualPunching, setManualPunching] = useState(false);

  // ---- State: Mark Attendance Dialog ----
  const [markDialogOpen, setMarkDialogOpen] = useState(false);
  const [markEmployeeId, setMarkEmployeeId] = useState<string>('');
  const [markDate, setMarkDate] = useState<string>('');
  const [markPunchIn, setMarkPunchIn] = useState<string>('');
  const [markPunchOut, setMarkPunchOut] = useState<string>('');
  const [markStatus, setMarkStatus] = useState<string>('present');
  // Always "manual" — Login and Face are only ever set by the system itself (the login/logout
  // hooks and the interactive Quick Confirm flow), never something an admin should be able to
  // manually attest to on someone else's behalf.
  const markMethod = 'manual';
  const [markNotes, setMarkNotes] = useState<string>('');
  const [markSubmitting, setMarkSubmitting] = useState(false);

  // ---- Computed: Year Range ----
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => current - 2 + i);
  }, []);

  // ---- Clock Effect ----
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
      setNowMs(now.getTime());
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // ---- Fetch Employees ----
  const fetchEmployees = useCallback(async () => {
    try {
      setEmployeesLoading(true);
      const res = await fetch('/api/employees?limit=200');
      if (!res.ok) throw new Error('Failed to fetch employees');
      const json = await res.json();
      setEmployees(json.data ?? []);
    } catch {
      toast.error('Failed to load employees');
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  // ---- Fetch Attendance ----
  const fetchAttendance = useCallback(async () => {
    try {
      setAttendanceLoading(true);
      const params = new URLSearchParams({ month: String(currentMonth), year: String(currentYear) });
      if (filterEmployeeId !== 'all') params.set('employeeId', filterEmployeeId);
      const res = await fetch(`/api/attendance?${params}`);
      if (!res.ok) throw new Error('Failed to fetch attendance');
      const json = await res.json();
      setAttendanceRecords(json.data ?? []);
    } catch {
      toast.error('Failed to load attendance records');
    } finally {
      setAttendanceLoading(false);
    }
  }, [currentMonth, currentYear, filterEmployeeId]);

  // ---- Fetch Regularization Requests (admin/hr/manager) ----
  const fetchRegularizations = useCallback(async () => {
    setRegularizationsLoading(true);
    try {
      const res = await fetch('/api/attendance-regularizations?status=pending');
      const json = await res.json();
      setRegularizations(json.data ?? []);
    } catch {
      toast.error('Failed to load correction requests');
    } finally {
      setRegularizationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canReviewRegularizations) fetchRegularizations();
  }, [canReviewRegularizations, fetchRegularizations]);

  const openReview = (id: string, approved: boolean) => {
    setReviewTarget({ id, approved });
    setReviewComment('');
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    setReviewing(true);
    setReviewingId(reviewTarget.id);
    try {
      const res = await fetch(`/api/attendance-regularizations/${reviewTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: reviewTarget.approved, comment: reviewComment.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to review request');
      toast.success(reviewTarget.approved ? 'Correction approved' : 'Correction rejected');
      setReviewTarget(null);
      fetchRegularizations();
      fetchAttendance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to review request');
    } finally {
      setReviewing(false);
      setReviewingId(null);
    }
  };

  // ---- Fetch Today's Punch for Selected Employee ----
  const fetchTodayPunch = useCallback(async (empId: string) => {
    if (!empId) { setTodayPunch(null); return; }
    try {
      const today = istDateOnly().toISOString().split('T')[0];
      const res = await fetch(`/api/attendance?employeeId=${empId}&date=${today}`);
      if (!res.ok) return;
      const json = await res.json();
      const records: AttendanceRecord[] = json.data ?? [];
      if (records.length > 0) {
        const r = records[0];
        setTodayPunch({ id: r.id, punchIn: r.punchIn, punchOut: r.punchOut, punchSessions: r.punchSessions, status: r.status, totalHours: r.totalHours, punchInMethod: r.punchInMethod, punchOutMethod: r.punchOutMethod, distanceFromOfficeMeters: r.distanceFromOfficeMeters });
      } else {
        setTodayPunch(null);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useEffect(() => { fetchAttendance(); }, [fetchAttendance, refreshKey]);
  useEffect(() => { fetchTodayPunch(punchEmployeeId); }, [punchEmployeeId, fetchTodayPunch]);

  // ---- KPI Summary ----
  const summary = useMemo(() => {
    const today = istDateOnly().toISOString().split('T')[0];
    const todayRecords = filterEmployeeId === 'all'
      ? attendanceRecords.filter((r) => r.date.startsWith(today))
      : attendanceRecords.filter((r) => r.date.startsWith(today) && r.employeeId === filterEmployeeId);
    const present = todayRecords.filter((r) => r.status === 'present').length;
    const absent = todayRecords.filter((r) => r.status === 'absent').length;
    const halfDay = todayRecords.filter((r) => r.status === 'half-day').length;
    const totalHours = todayRecords.reduce((sum, r) => sum + (r.totalHours ?? 0), 0);
    return { present, absent, halfDay, totalHours: Math.round(totalHours * 100) / 100 };
  }, [attendanceRecords, filterEmployeeId]);

  // ---- Best-effort geolocation capture ----
  // Only ever attempted once an admin has configured an office location — otherwise no
  // location permission prompt appears at all. Doesn't itself reject anything here (the server
  // is the one that enforces — see recordPunch's "coordinates required when enforced" guard in
  // attendance-punch.ts); this just gives the user a clear heads-up when enforcement is on and
  // location couldn't be obtained, instead of a confusing rejection with no visible cause.
  // 10s timeout + a 60s maximumAge: network-based positioning (no GPS chip, e.g. most laptops)
  // routinely takes longer than the previous 5s to resolve, and reusing a very recent fix avoids
  // re-prompting the OS location stack on every single punch.
  const captureGeoLocation = useCallback((): Promise<{ latitude: number; longitude: number; accuracy: number } | null> => {
    if (!officeConfigured || typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => {
          if (geofenceEnforced) {
            toast.error("Couldn't determine your location — allow location access in your browser and try again.");
          }
          resolve(null);
        },
        { timeout: 10000, maximumAge: 60000 }
      );
    });
  }, [officeConfigured, geofenceEnforced]);

  // ---- Face Punch: camera lifecycle ----
  // Starts the moment the Confirm Punch dialog opens (while allowFacePunch is on — no point
  // requesting camera access if that tab won't even render) and always stops when the dialog
  // closes for any reason, never lingering running in the background.
  const stopFaceCamera = useCallback(() => {
    faceStreamRef.current?.getTracks().forEach((t) => t.stop());
    faceStreamRef.current = null;
    setFaceCameraReady(false);
  }, []);

  useEffect(() => {
    if (!verificationOpen || !allowFacePunch) return;
    let cancelled = false;
    setFaceCameraError(null);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        faceStreamRef.current = stream;
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          await faceVideoRef.current.play();
        }
        setFaceCameraReady(true);
      } catch (err) {
        if (!cancelled) setFaceCameraError(describeCameraError(err, 'Use Manual Punch instead.'));
      }
      try {
        await loadFaceModels();
        if (!cancelled) setFaceModelsReady(true);
      } catch {
        if (!cancelled) setFaceCameraError('Failed to load the face recognition models. Use Manual Punch instead.');
      }
    })();
    return () => {
      cancelled = true;
      stopFaceCamera();
    };
  }, [verificationOpen, allowFacePunch, stopFaceCamera]);

  // ---- Punch Handler ----
  const handlePunchClick = (action: PunchAction) => {
    if (!punchEmployeeId) {
      toast.error('Please select an employee before punching.');
      return;
    }
    const sessionOpen = isSessionOpen(todayPunch);
    if (action === 'in' && sessionOpen) {
      toast.error('Already punched in — punch out first before starting a new session.');
      return;
    }
    if (action === 'out' && !sessionOpen) {
      toast.error(todayPunch?.punchIn ? 'Already punched out today.' : 'No punch-in record found for today. Punch in first.');
      return;
    }
    setPunchAction(action);
    setVerificationStep('idle');
    setVerificationOpen(true);
  };

  // ---- Confirm Punch: real camera capture + server-side face match ----
  const runFaceVerification = useCallback(async () => {
    if (!faceVideoRef.current || !faceCameraReady || !faceModelsReady) return;
    setVerificationPunching(true);
    setVerificationStep('detecting');
    try {
      const capture = await captureFaceDescriptor(faceVideoRef.current);
      if (!capture.ok) {
        setVerificationStep('error');
        toast.error(
          capture.reason === 'no-face' ? 'No face detected — center your face in the frame and try again.'
            : capture.reason === 'multiple-faces' ? 'More than one face detected — make sure only you are in frame.'
              : capture.reason === 'timeout' ? 'Detection timed out — try again.'
                : 'Capture failed. Try again.'
        );
        return;
      }
      setVerificationStep('verifying');
      const geo = await captureGeoLocation();
      const punchController = new AbortController();
      const punchTimeoutId = setTimeout(() => punchController.abort(), PUNCH_REQUEST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch('/api/attendance/punch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: punchEmployeeId,
            action: punchAction,
            method: 'face',
            faceData: { descriptor: capture.descriptor },
            ...(geo && { latitude: geo.latitude, longitude: geo.longitude, accuracy: geo.accuracy }),
          }),
          signal: punchController.signal,
        });
      } catch (fetchErr) {
        if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
          throw new Error('Request timed out — check your connection and try again.');
        }
        throw fetchErr;
      } finally {
        clearTimeout(punchTimeoutId);
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Punch failed' }));
        throw new Error(err.error || 'Punch failed');
      }
      setVerificationStep('verified');
      toast.success(`Punch ${punchAction === 'in' ? 'IN' : 'OUT'} recorded successfully!`);
      fetchAttendance();
      fetchTodayPunch(punchEmployeeId);
      setTimeout(() => setVerificationOpen(false), 900);
    } catch (err) {
      setVerificationStep('error');
      toast.error(err instanceof Error ? err.message : 'Punch failed');
    } finally {
      setVerificationPunching(false);
    }
  }, [punchEmployeeId, punchAction, fetchAttendance, fetchTodayPunch, captureGeoLocation, faceCameraReady, faceModelsReady]);

  // ---- Manual Punch Submit ----
  const handleManualPunch = useCallback(async () => {
    if (!manualTime) {
      toast.error('Please set a time.');
      return;
    }
    setManualPunching(true);
    try {
      const [hours, minutes] = manualTime.split(':').map(Number);
      const now = new Date();
      now.setHours(hours, minutes, 0, 0);
      const geo = await captureGeoLocation();
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: punchEmployeeId,
          action: punchAction,
          method: 'manual',
          ...(geo && { latitude: geo.latitude, longitude: geo.longitude, accuracy: geo.accuracy }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Manual punch failed' }));
        throw new Error(err.error || 'Manual punch failed');
      }
      toast.success(`Manual Punch ${punchAction === 'in' ? 'IN' : 'OUT'} recorded at ${manualTime}`);
      setVerificationOpen(false);
      fetchAttendance();
      fetchTodayPunch(punchEmployeeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Manual punch failed');
    } finally {
      setManualPunching(false);
    }
  }, [manualTime, punchEmployeeId, punchAction, fetchAttendance, fetchTodayPunch, captureGeoLocation]);

  // ---- Mark Attendance Submit ----
  const handleMarkAttendance = useCallback(async () => {
    if (!markEmployeeId || !markDate || !markStatus) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setMarkSubmitting(true);
    try {
      const punchInISO = markPunchIn ? `${markDate}T${markPunchIn}:00.000Z` : undefined;
      const punchOutISO = markPunchOut ? `${markDate}T${markPunchOut}:00.000Z` : undefined;
      const body: Record<string, unknown> = {
        employeeId: markEmployeeId,
        date: markDate,
        status: markStatus,
        punchInMethod: markMethod,
        punchOutMethod: markMethod,
        notes: markNotes || undefined,
      };
      if (punchInISO) body.punchIn = punchInISO;
      if (punchOutISO) body.punchOut = punchOutISO;
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to mark attendance' }));
        throw new Error(err.error || 'Failed to mark attendance');
      }
      toast.success('Attendance marked successfully.');
      setMarkDialogOpen(false);
      setMarkEmployeeId('');
      setMarkDate('');
      setMarkPunchIn('');
      setMarkPunchOut('');
      setMarkStatus('present');
      setMarkNotes('');
      fetchAttendance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark attendance');
    } finally {
      setMarkSubmitting(false);
    }
  }, [markEmployeeId, markDate, markPunchIn, markPunchOut, markStatus, markMethod, markNotes, fetchAttendance]);

  // ---- Confirmation Step UI ----
  // Real biometric check: the boxed area below is a live front-camera feed. On "Start
  // Confirmation" we run on-device face detection + descriptor extraction (captureFaceDescriptor)
  // and send only the resulting 128-number descriptor to the server, which matches it against
  // the employee's enrolled FaceEnrollment — see face-recognition-client.ts / face-match.ts.
  const renderVerificationContent = () => {
    const showLiveVideo = verificationStep !== 'verified';
    return (
    <div className="flex flex-col items-center gap-5 py-2">
      {/* Live camera feed, with state overlays on top */}
      <div className="relative w-48 h-48 rounded-2xl bg-muted/60 border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-3 overflow-hidden">
        <video
          ref={faceVideoRef}
          muted
          playsInline
          className={`absolute inset-0 size-full object-cover -scale-x-100 ${showLiveVideo && faceCameraReady ? 'opacity-100' : 'opacity-0'}`}
        />
        <AnimatePresence mode="wait">
          {!faceCameraError && verificationStep === 'idle' && !faceCameraReady && (
            <motion.div
              key="starting-camera"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 bg-muted/60 px-3 py-2 rounded-lg"
            >
              <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
              <span className="text-sm text-muted-foreground">Starting camera...</span>
            </motion.div>
          )}
          {!faceCameraError && verificationStep === 'idle' && faceCameraReady && !faceModelsReady && (
            <motion.div
              key="loading-models"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 bg-black/40 px-3 py-2 rounded-lg"
            >
              <Loader2 className="size-8 animate-spin text-white" />
              <span className="text-sm text-white">Loading face recognition...</span>
            </motion.div>
          )}
          {!faceCameraError && verificationStep === 'idle' && faceCameraReady && faceModelsReady && (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-3 rounded-xl border-2 border-emerald-500/50 pointer-events-none"
            />
          )}
          {faceCameraError && (
            <motion.div
              key="camera-error"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-2 px-3 text-center"
            >
              <AlertCircle className="size-8 text-red-500" />
              <span className="text-xs text-muted-foreground">{faceCameraError}</span>
            </motion.div>
          )}
          {(verificationStep === 'detecting' || verificationStep === 'verifying') && (
            <motion.div
              key={verificationStep}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {/* Scanning line over the live video */}
              <motion.div
                className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                initial={{ top: '10%' }}
                animate={{ top: ['10%', '90%', '10%'] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              />
              <div className="absolute inset-3 rounded-xl border-2 border-emerald-500/60" />
            </motion.div>
          )}
          {verificationStep === 'verified' && (
            <motion.div
              key="verified"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="size-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Confirmed</span>
            </motion.div>
          )}
          {verificationStep === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50"
            >
              <div className="size-16 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <AlertCircle className="size-10 text-red-600 dark:text-red-400" />
              </div>
              <span className="text-sm font-medium text-red-100">Confirmation Failed</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Progress Steps */}
      <div className="w-full space-y-3">
        {[
          { step: 'initializing' as const, label: 'Preparing...' },
          { step: 'detecting' as const, label: 'Confirming...' },
          { step: 'verifying' as const, label: 'Finalizing...' },
          { step: 'verified' as const, label: 'Confirmed \u2713' },
        ].map((item, idx) => {
          const stepOrder = ['initializing', 'detecting', 'verifying', 'verified'];
          const currentIdx = stepOrder.indexOf(verificationStep);
          const itemIdx = stepOrder.indexOf(item.step);
          const isActive = verificationStep === item.step;
          const isDone = itemIdx < currentIdx;
          const isError = verificationStep === 'error' && itemIdx === currentIdx;

          return (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="flex items-center gap-3"
            >
              <div className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                isError
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                  : isDone
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
                    : isActive
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
              }`}>
                {isDone ? <CheckCircle2 className="size-4" /> : isError ? <AlertCircle className="size-4" /> : idx + 1}
              </div>
              <span className={`text-sm transition-colors ${
                isDone || isActive
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground'
              }`}>
                {item.label}
              </span>
              {isActive && verificationStep !== 'verified' && (
                <Loader2 className="size-4 animate-spin text-emerald-500 ml-auto" />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Action button */}
      {verificationStep === 'idle' && (
        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          size="lg"
          onClick={runFaceVerification}
          disabled={verificationPunching || !faceCameraReady || !faceModelsReady || !!faceCameraError}
        >
          {verificationPunching ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
          Start Confirmation
        </Button>
      )}
      {verificationStep === 'error' && (
        <Button
          className="w-full"
          variant="outline"
          onClick={runFaceVerification}
          disabled={verificationPunching || !faceCameraReady || !faceModelsReady || !!faceCameraError}
        >
          <Loader2 className={`size-4 ${verificationPunching ? 'animate-spin' : 'hidden'}`} />
          Retry
        </Button>
      )}
    </div>
    );
  };

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* ============ HEADER ============ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Attendance Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage employee attendance, with quick punch confirmation</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Month Select */}
          <Select value={String(currentMonth)} onValueChange={(v) => setCurrentMonth(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Year Select */}
          <Select value={String(currentYear)} onValueChange={(v) => setCurrentYear(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Employee Filter — hidden for employee role: the backend now scopes their view to
              themselves regardless, so a picker offering "everyone" would just be misleading. */}
          {!isEmployeeRole && (
            <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Mark Attendance Button — hidden for employee role: POST /api/attendance already
              requires admin/hr/manager server-side, so this always 403'd for employee anyway. */}
          {!isEmployeeRole && (
            <Button variant="outline" onClick={() => { setMarkDate(istDateOnly().toISOString().split('T')[0]); setMarkDialogOpen(true); }}>
              <Pencil className="size-4" />
              Mark Attendance
            </Button>
          )}
          {isStaff && (
            <>
              <input ref={importInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
              <Button variant="outline" disabled={importing} onClick={() => importInputRef.current?.click()} title="CSV columns: employeeCode,date,status,punchIn,punchOut,notes">
                {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Import CSV
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ============ PUNCH IN/OUT CARD ============ */}
      <Card className="border-emerald-200/60 dark:border-emerald-800/40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 via-transparent to-transparent dark:from-emerald-950/20 pointer-events-none" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Fingerprint className="size-5 text-emerald-600 dark:text-emerald-400" />
            Punch In / Punch Out
          </CardTitle>
          <CardDescription>Select an employee and confirm or manually record a punch.</CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-5">
          {/* Employee Select for Punch — locked to self for employee role (the backend only
              ever accepts your own employeeId here anyway; the picker would just be misleading). */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="flex-1 w-full sm:max-w-xs space-y-2">
              <Label htmlFor="punch-employee">Employee <span className="text-red-500">*</span></Label>
              {isEmployeeRole ? (
                <div id="punch-employee" className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-foreground">
                  {user?.name ?? 'You'}
                </div>
              ) : (
                <Select value={punchEmployeeId} onValueChange={setPunchEmployeeId}>
                  <SelectTrigger id="punch-employee" className="w-full">
                    <SelectValue placeholder="Select employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} ({emp.employeeCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {/* Live Clock */}
            <div className="flex flex-col items-center px-6 py-3 rounded-xl bg-muted/50 border border-border/50">
              <div className="text-2xl font-mono font-bold tracking-wider text-foreground tabular-nums">
                {currentTime || '--:--:-- --'}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{currentDate}</div>
            </div>
          </div>

          {/* Punch Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              className="flex-1 h-14 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
              onClick={() => handlePunchClick('in')}
              disabled={!punchEmployeeId || isSessionOpen(todayPunch)}
            >
              <Fingerprint className="size-5" />
              {todayPunch && parseSessions(todayPunch).length > 0 && !isSessionOpen(todayPunch) ? 'Punch IN Again' : 'Punch IN'}
            </Button>
            <Button
              className="flex-1 h-14 text-base font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-200 dark:shadow-rose-900/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
              onClick={() => handlePunchClick('out')}
              disabled={!punchEmployeeId || !isSessionOpen(todayPunch)}
            >
              <LogOut className="size-5" />
              Punch OUT
            </Button>
          </div>

          {/* Last Punch Info */}
          {punchEmployeeId && todayPunch && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-emerald-500" />
                <span className="text-muted-foreground">First In:</span>
                <span className="font-medium">{formatTime(todayPunch.punchIn)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-rose-500" />
                <span className="text-muted-foreground">{isSessionOpen(todayPunch) ? 'Currently:' : 'Last Out:'}</span>
                <span className="font-medium">{isSessionOpen(todayPunch) ? 'Punched in' : (todayPunch.punchOut ? formatTime(todayPunch.punchOut) : 'Not yet')}</span>
              </div>
              {parseSessions(todayPunch).length > 1 && (
                <Badge variant="outline" className="bg-sky-100 text-sky-700 border-sky-200">
                  {parseSessions(todayPunch).length} sessions today
                </Badge>
              )}
              {(() => {
                const sessions = parseSessions(todayPunch);
                const openSession = sessions.length > 0 && !sessions[sessions.length - 1].punchOut ? sessions[sessions.length - 1] : null;
                if (openSession) {
                  const completedMs = (todayPunch.totalHours ?? 0) * 60 * 60 * 1000;
                  const openElapsedMs = Math.max(0, nowMs - new Date(openSession.punchIn).getTime());
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Hours so far:</span>
                      <span className="font-medium font-mono tabular-nums text-emerald-700">
                        {formatElapsed(0, completedMs + openElapsedMs)}
                      </span>
                    </div>
                  );
                }
                if (todayPunch.totalHours != null) {
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Hours:</span>
                      <span className="font-medium">{todayPunch.totalHours}h</span>
                    </div>
                  );
                }
                return null;
              })()}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Method:</span>
                <Badge variant="outline" className={METHOD_BADGE[todayPunch.punchInMethod ?? 'manual']}>
                  {todayPunch.punchInMethod ? (METHOD_LABEL[todayPunch.punchInMethod] ?? todayPunch.punchInMethod) : 'N/A'}
                </Badge>
              </div>
              {todayPunch.distanceFromOfficeMeters != null && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Distance from office:</span>
                  <span className="font-medium">{Math.round(todayPunch.distanceFromOfficeMeters)}m</span>
                </div>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* ============ TODAY'S SUMMARY KPIs ============ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="border-emerald-200/60 dark:border-emerald-800/40">
            <CardContent className="flex items-center gap-4 pt-0">
              <div className="flex size-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <UserCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.present}</div>
                <div className="text-xs text-muted-foreground font-medium">Present</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="border-red-200/60 dark:border-red-800/40">
            <CardContent className="flex items-center gap-4 pt-0">
              <div className="flex size-11 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <UserX className="size-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.absent}</div>
                <div className="text-xs text-muted-foreground font-medium">Absent</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-amber-200/60 dark:border-amber-800/40">
            <CardContent className="flex items-center gap-4 pt-0">
              <div className="flex size-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Clock className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.halfDay}</div>
                <div className="text-xs text-muted-foreground font-medium">Half Day</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-emerald-200/60 dark:border-emerald-800/40">
            <CardContent className="flex items-center gap-4 pt-0">
              <div className="flex size-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <Users className="size-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.totalHours}h</div>
                <div className="text-xs text-muted-foreground font-medium">Total Hours</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ============ CORRECTION REQUESTS ============ */}
      {canReviewRegularizations && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="size-4 text-emerald-600" />
              Pending Correction Requests
            </CardTitle>
            <CardDescription>Employee-submitted punch-in/punch-out corrections awaiting your review</CardDescription>
          </CardHeader>
          <CardContent>
            {regularizationsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : regularizations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No pending correction requests.</p>
            ) : (
              <div className="divide-y">
                {regularizations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="text-sm space-y-0.5">
                      <p className="font-medium">{r.employee.firstName} {r.employee.lastName ?? ''} <span className="text-xs text-muted-foreground font-normal">({r.employee.employeeCode})</span></p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(r.date)} —
                        {r.requestedPunchIn && <> In: {new Date(r.requestedPunchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>}
                        {r.requestedPunchOut && <> Out: {new Date(r.requestedPunchOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>}
                      </p>
                      <p className="text-xs text-muted-foreground italic">{r.reason}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200" disabled={reviewing && reviewingId === r.id} onClick={() => openReview(r.id, true)}>
                        <CheckCircle2 className="size-4" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 border-red-200" disabled={reviewing && reviewingId === r.id} onClick={() => openReview(r.id, false)}>
                        <XCircle className="size-4" />Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!reviewTarget} onOpenChange={(open) => { if (!open && !reviewing) setReviewTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{reviewTarget?.approved ? 'Approve' : 'Reject'} Correction Request</DialogTitle>
            <DialogDescription>
              {reviewTarget?.approved ? 'This will apply the requested time(s) to the employee’s attendance record.' : 'The employee will be able to see this was rejected.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Comment (optional)</Label>
            <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)} disabled={reviewing}>Cancel</Button>
            <Button
              onClick={handleReview}
              disabled={reviewing}
              className={reviewTarget?.approved ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
            >
              {reviewing ? <Loader2 className="size-4 animate-spin" /> : null}
              {reviewTarget?.approved ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ ATTENDANCE TABLE ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance Records</CardTitle>
          <CardDescription>
            Showing {attendanceRecords.length} record{attendanceRecords.length !== 1 ? 's' : ''} for {MONTHS[currentMonth - 1]} {currentYear}
            {filterEmployeeId !== 'all' && (
              <span className="ml-1">
                (filtered)
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {attendanceLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : attendanceRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="size-10 mb-3 opacity-40" />
              <p className="text-sm">No attendance records found for this period.</p>
            </div>
          ) : (
            <>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Punch In</TableHead>
                    <TableHead>Punch Out</TableHead>
                    <TableHead>Total Hours</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceRecords.map((record, idx) => {
                    const statusCfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.absent;
                    const method = record.punchInMethod ?? record.punchOutMethod ?? 'N/A';
                    return (
                      <motion.tr
                        key={record.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        className={`border-b transition-colors hover:bg-muted/50 ${statusCfg.rowClass}`}
                      >
                        <TableCell className="font-mono text-xs">{record.employee.employeeCode}</TableCell>
                        <TableCell className="font-medium">{record.employee.firstName} {record.employee.lastName}</TableCell>
                        <TableCell className="text-sm">{formatDate(record.date)}</TableCell>
                        <TableCell className="font-mono text-sm">{formatTime(record.punchIn)}</TableCell>
                        <TableCell className="font-mono text-sm">{formatTime(record.punchOut)}</TableCell>
                        <TableCell className="font-mono text-sm">{record.totalHours != null ? `${record.totalHours}h` : '--'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={METHOD_BADGE[method] || ''}>
                            {METHOD_LABEL[method] ?? method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusCfg.className}>
                            {statusCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMarkEmployeeId(record.employeeId);
                              setMarkDate(record.date.split('T')[0]);
                              setMarkPunchIn(record.punchIn ? new Date(record.punchIn).toTimeString().slice(0, 5) : '');
                              setMarkPunchOut(record.punchOut ? new Date(record.punchOut).toTimeString().slice(0, 5) : '');
                              setMarkStatus(record.status);
                              setMarkNotes(record.notes || '');
                              setMarkDialogOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Card list (mobile) */}
              <div className="space-y-2 p-3 md:hidden">
                {attendanceRecords.map((record) => {
                  const statusCfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.absent;
                  const method = record.punchInMethod ?? record.punchOutMethod ?? 'N/A';
                  return (
                    <div key={record.id} className={`rounded-lg border p-3 ${statusCfg.rowClass}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{record.employee.firstName} {record.employee.lastName}</div>
                          <div className="text-xs text-muted-foreground">{record.employee.employeeCode} · {formatDate(record.date)}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className={statusCfg.className}>{statusCfg.label}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => {
                              setMarkEmployeeId(record.employeeId);
                              setMarkDate(record.date.split('T')[0]);
                              setMarkPunchIn(record.punchIn ? new Date(record.punchIn).toTimeString().slice(0, 5) : '');
                              setMarkPunchOut(record.punchOut ? new Date(record.punchOut).toTimeString().slice(0, 5) : '');
                              setMarkStatus(record.status);
                              setMarkNotes(record.notes || '');
                              setMarkDialogOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>In: <span className="font-mono">{formatTime(record.punchIn)}</span></span>
                        <span>Out: <span className="font-mono">{formatTime(record.punchOut)}</span></span>
                        <span>{record.totalHours != null ? `${record.totalHours}h` : '--'}</span>
                        <Badge variant="outline" className={`${METHOD_BADGE[method] || ''} text-[10px]`}>{METHOD_LABEL[method] ?? method}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ============ LOGIN-BASED ATTENDANCE INFO ============ */}
      <Card className="border-muted-foreground/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <MonitorSmartphone className="size-5 text-sky-500" />
            Login / Logout Attendance
            <Badge
              variant="outline"
              className={loginAttendanceEnabled
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400 border-gray-200 dark:border-gray-700'}
            >
              Login {loginAttendanceEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <Badge
              variant="outline"
              className={logoutAttendanceEnabled
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400 border-gray-200 dark:border-gray-700'}
            >
              Logout {logoutAttendanceEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-sky-50/50 dark:bg-sky-950/20 border-sky-200/60 dark:border-sky-800/40 p-4 text-sm text-muted-foreground space-y-2">
            {loginAttendanceEnabled ? (
              <p>
                Employees are automatically marked as <span className="font-semibold text-sky-700 dark:text-sky-400">present</span> when they log into the payroll system.
                This uses the <Badge variant="outline" className={METHOD_BADGE.login}>login</Badge> method and is recorded alongside quick-confirm and manual punches.
              </p>
            ) : (
              <p>
                Login-based punch-in is not currently active. An admin can turn this on under Settings → Office Location &amp; Attendance to automatically punch in an employee when they log in.
              </p>
            )}
            {logoutAttendanceEnabled ? (
              <p>
                Employees who are still punched in are automatically <span className="font-semibold text-sky-700 dark:text-sky-400">punched out</span> when they log out of the payroll system.
              </p>
            ) : (
              <p>
                Logout-based punch-out is not currently active. An admin can turn this on under Settings → Office Location &amp; Attendance.
              </p>
            )}
            {(!allowFacePunch || !allowManualPunch) && (
              <p>
                {!allowFacePunch && !allowManualPunch
                  ? 'Both Quick Confirm and Manual Punch are currently disabled for employees on this screen.'
                  : !allowFacePunch
                    ? 'Quick Confirm (face) punch is currently disabled for employees on this screen — only Manual Punch is available.'
                    : 'Manual Punch is currently disabled for employees on this screen — only Quick Confirm is available.'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ============ CONFIRM PUNCH DIALOG ============ */}
      <Dialog open={verificationOpen} onOpenChange={(open) => { if (!open && !verificationPunching) setVerificationOpen(false); }}>
        <DialogContent className="sm:max-w-md" showCloseButton={!verificationPunching}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="size-5 text-emerald-500" />
              Confirm Punch — {punchAction === 'in' ? 'IN' : 'OUT'}
            </DialogTitle>
            <DialogDescription>
              Confirm your {punchAction === 'in' ? 'punch in' : 'punch out'} below.
            </DialogDescription>
          </DialogHeader>

          {!allowFacePunch && !allowManualPunch ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Both punch methods are currently disabled by your admin. Contact HR or use Login-based attendance if enabled.
            </div>
          ) : (
            <Tabs defaultValue={allowFacePunch ? 'face' : 'manual'} className="mt-2">
              <TabsList className="w-full">
                {allowFacePunch && (
                  <TabsTrigger value="face" className="flex-1">
                    <Fingerprint className="size-4" />
                    Quick Confirm
                  </TabsTrigger>
                )}
                {allowManualPunch && (
                  <TabsTrigger value="manual" className="flex-1">
                    <Clock className="size-4" />
                    Manual Punch
                  </TabsTrigger>
                )}
              </TabsList>
              {allowFacePunch && (
                <TabsContent value="face" className="mt-4">
                  {renderVerificationContent()}
                </TabsContent>
              )}
              {allowManualPunch && (
                <TabsContent value="manual" className="mt-4">
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="manual-time">
                        {punchAction === 'in' ? 'Punch In Time' : 'Punch Out Time'}
                      </Label>
                      <Input
                        id="manual-time"
                        type="time"
                        value={manualTime}
                        onChange={(e) => setManualTime(e.target.value)}
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use current time ({currentTime})
                      </p>
                    </div>
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleManualPunch}
                      disabled={manualPunching}
                    >
                      {manualPunching && <Loader2 className="size-4 animate-spin" />}
                      Submit Manual {punchAction === 'in' ? 'Punch In' : 'Punch Out'}
                    </Button>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ MARK ATTENDANCE DIALOG ============ */}
      <Dialog open={markDialogOpen} onOpenChange={(open) => { if (!open && !markSubmitting) setMarkDialogOpen(false); }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!markSubmitting}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-emerald-500" />
              Mark Attendance
            </DialogTitle>
            <DialogDescription>
              Manually create or update an attendance record for any employee.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mark-employee">Employee <span className="text-red-500">*</span></Label>
                <Select value={markEmployeeId} onValueChange={setMarkEmployeeId}>
                  <SelectTrigger id="mark-employee" className="w-full">
                    <SelectValue placeholder="Select employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mark-date">Date <span className="text-red-500">*</span></Label>
                <Input id="mark-date" type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mark-punch-in">Punch In Time</Label>
                <Input id="mark-punch-in" type="time" value={markPunchIn} onChange={(e) => setMarkPunchIn(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mark-punch-out">Punch Out Time</Label>
                <Input id="mark-punch-out" type="time" value={markPunchOut} onChange={(e) => setMarkPunchOut(e.target.value)} className="font-mono" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mark-status">Status <span className="text-red-500">*</span></Label>
              <Select value={markStatus} onValueChange={setMarkStatus}>
                <SelectTrigger id="mark-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="half-day">Half Day</SelectItem>
                  <SelectItem value="holiday">Holiday</SelectItem>
                  <SelectItem value="weekly-off">Weekly Off</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Recorded with method &quot;Manual&quot; — Login and Face are only ever set by the system itself, never a manual entry.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mark-notes">Notes</Label>
              <Input id="mark-notes" type="text" placeholder="Optional notes..." value={markNotes} onChange={(e) => setMarkNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkDialogOpen(false)} disabled={markSubmitting}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleMarkAttendance}
              disabled={markSubmitting}
            >
              {markSubmitting && <Loader2 className="size-4 animate-spin" />}
              Save Attendance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
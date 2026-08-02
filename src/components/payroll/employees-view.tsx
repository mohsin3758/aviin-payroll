'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Building2,
  CreditCard,
  Landmark,
  Briefcase,
  Phone,
  Mail,
  CalendarDays,
  Droplets,
  Heart,
  MapPin,
  Shield,
  Banknote,
  FileText,
  Loader2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { usePayrollStore } from '@/store/payroll-store'
import { useSessionContext } from '@/hooks/session-context'

// ─── Constants ────────────────────────────────────────────────────────────────

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN')

const DEPARTMENTS = ['Engineering', 'HR', 'Finance', 'Marketing', 'Operations']

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

const GENDERS = ['Male', 'Female', 'Other']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const DEPT_COLORS: Record<string, string> = {
  Engineering: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  HR: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  Finance: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Marketing: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  Operations: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalaryStructure {
  id?: string
  basic: number
  dearnessAllowance: number
  houseRentAllowance: number
  conveyanceAllowance: number
  medicalAllowance: number
  specialAllowance: number
  overtimeAllowance: number
  bonus: number
  otherEarnings: number
  employerPF: number
  employerESI: number
  gratuity: number
  dailyRate: number | null
  hourlyRate: number | null
}

interface Employee {
  id: string
  employeeCode: string
  firstName: string
  lastName: string | null
  email: string
  phone: string | null
  dateOfJoining: string
  dateOfExit: string | null
  designation: string
  department: string
  client: string | null
  state: string
  employmentType: string
  panNumber: string | null
  aadhaarNumber: string | null
  bankName: string | null
  bankAccountNumber: string | null
  bankIfsc: string | null
  uanNumber: string | null
  esiNumber: string | null
  pfApplicable: boolean
  esiApplicable: boolean
  ptApplicable: boolean
  lwfApplicable: boolean
  taxRegime: string
  gender: string
  dateOfBirth: string | null
  bloodGroup: string | null
  emergencyContact: string | null
  currentAddress: string | null
  permanentAddress: string | null
  salaryStructure: SalaryStructure | null
  createdAt: string
  updatedAt: string
}

interface FormData {
  employeeCode: string
  firstName: string
  lastName: string
  email: string
  phone: string
  dateOfJoining: string
  designation: string
  department: string
  client: string
  state: string
  employmentType: string
  panNumber: string
  aadhaarNumber: string
  bankName: string
  bankAccountNumber: string
  bankIfsc: string
  uanNumber: string
  esiNumber: string
  pfApplicable: boolean
  esiApplicable: boolean
  ptApplicable: boolean
  lwfApplicable: boolean
  taxRegime: string
  gender: string
  dateOfBirth: string
  bloodGroup: string
  emergencyContact: string
  currentAddress: string
  permanentAddress: string
  // Salary structure
  basic: string
  dearnessAllowance: string
  houseRentAllowance: string
  conveyanceAllowance: string
  medicalAllowance: string
  specialAllowance: string
  dailyRate: string
  hourlyRate: string
}

const emptyForm: FormData = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfJoining: '',
  designation: '',
  department: '',
  client: '',
  state: 'Maharashtra',
  employmentType: 'permanent',
  panNumber: '',
  aadhaarNumber: '',
  bankName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  uanNumber: '',
  esiNumber: '',
  pfApplicable: true,
  esiApplicable: true,
  ptApplicable: true,
  lwfApplicable: true,
  taxRegime: 'new',
  gender: 'Male',
  dateOfBirth: '',
  bloodGroup: '',
  emergencyContact: '',
  currentAddress: '',
  permanentAddress: '',
  basic: '',
  dearnessAllowance: '0',
  houseRentAllowance: '',
  conveyanceAllowance: '1600',
  medicalAllowance: '1250',
  specialAllowance: '',
  dailyRate: '',
  hourlyRate: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(firstName: string, lastName: string | null) {
  const f = firstName?.charAt(0)?.toUpperCase() || ''
  const l = lastName?.charAt(0)?.toUpperCase() || ''
  return (f + l) || '?'
}

function getFullName(emp: Employee) {
  return `${emp.firstName}${emp.lastName ? ' ' + emp.lastName : ''}`
}

function computeSalary(form: FormData) {
  const basic = parseFloat(form.basic) || 0
  const da = parseFloat(form.dearnessAllowance) || 0
  const hra = parseFloat(form.houseRentAllowance) || 0
  const conv = parseFloat(form.conveyanceAllowance) || 0
  const med = parseFloat(form.medicalAllowance) || 0
  const special = parseFloat(form.specialAllowance) || 0
  const gross = basic + da + hra + conv + med + special
  const employerPF = form.pfApplicable ? Math.round(basic * 0.12) : 0
  const employerESI = form.esiApplicable && gross <= 21000 ? Math.round(gross * 0.0325) : 0
  const monthlyCTC = gross + employerPF + employerESI
  return { gross, employerPF, employerESI, monthlyCTC }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmployeesView() {
  const { refreshKey } = usePayrollStore()
  const { user } = useSessionContext()
  // Manager now has read-only nav access to this directory (no salary data — backend strips
  // it). Add/Edit/Delete stay admin/hr-only, matching PUT/DELETE /api/employees/[id] server-side.
  const canManage = user?.role === 'admin' || user?.role === 'hr'

  // Table state
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>({ ...emptyForm })
  const [submitting, setSubmitting] = useState(false)
  const [salaryOpen, setSalaryOpen] = useState(false)

  // View
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null)

  // Tax declaration (80C/80D) — only meaningful for old-regime employees
  const currentFinancialYear = new Date().getFullYear()
  const [declaration80C, setDeclaration80C] = useState('')
  const [declaration80D, setDeclaration80D] = useState('')
  const [declarationLoading, setDeclarationLoading] = useState(false)
  const [declarationSaving, setDeclarationSaving] = useState(false)

  const fetchDeclaration = useCallback(async (employeeId: string) => {
    setDeclarationLoading(true)
    try {
      const res = await fetch(`/api/investment-declarations?employeeId=${employeeId}&year=${currentFinancialYear}`)
      if (!res.ok) throw new Error('Failed to load declaration')
      const json = await res.json()
      const existing = json.data?.[0]
      setDeclaration80C(existing ? String(existing.section80C) : '')
      setDeclaration80D(existing ? String(existing.section80D) : '')
    } catch {
      toast.error('Failed to load investment declaration')
    } finally {
      setDeclarationLoading(false)
    }
  }, [currentFinancialYear])

  const handleSaveDeclaration = async () => {
    if (!viewEmployee) return
    setDeclarationSaving(true)
    try {
      const res = await fetch('/api/investment-declarations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: viewEmployee.id,
          year: currentFinancialYear,
          section80C: parseFloat(declaration80C) || 0,
          section80D: parseFloat(declaration80D) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save declaration')
      toast.success('Investment declaration saved — will apply from the next payroll run.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save declaration')
    } finally {
      setDeclarationSaving(false)
    }
  }

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ─── Fetch Employees ──────────────────────────────────────────────────────

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (deptFilter && deptFilter !== 'all') params.set('department', deptFilter)
      if (stateFilter && stateFilter !== 'all') params.set('state', stateFilter)
      params.set('page', String(page))
      params.set('limit', String(pageSize))

      const res = await fetch(`/api/employees?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch employees')
      const json = await res.json()
      setEmployees(json.data ?? [])
      setTotal(json.total ?? 0)
      setTotalPages(json.totalPages ?? 1)
    } catch {
      toast.error('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }, [search, deptFilter, stateFilter, page])

  useEffect(() => {
    setPage(1)
  }, [search, deptFilter, stateFilter])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees, refreshKey])

  // ─── Form helpers ─────────────────────────────────────────────────────────

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const openAddDialog = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setSalaryOpen(false)
    setFormOpen(true)
  }

  const openEditDialog = (emp: Employee) => {
    setEditingId(emp.id)
    setForm({
      employeeCode: emp.employeeCode,
      firstName: emp.firstName,
      lastName: emp.lastName || '',
      email: emp.email,
      phone: emp.phone || '',
      dateOfJoining: emp.dateOfJoining?.split('T')[0] || '',
      designation: emp.designation,
      department: emp.department,
      client: emp.client || '',
      state: emp.state,
      employmentType: emp.employmentType || 'permanent',
      panNumber: emp.panNumber || '',
      aadhaarNumber: emp.aadhaarNumber || '',
      bankName: emp.bankName || '',
      bankAccountNumber: emp.bankAccountNumber || '',
      bankIfsc: emp.bankIfsc || '',
      uanNumber: emp.uanNumber || '',
      esiNumber: emp.esiNumber || '',
      pfApplicable: emp.pfApplicable,
      esiApplicable: emp.esiApplicable,
      ptApplicable: emp.ptApplicable,
      lwfApplicable: emp.lwfApplicable,
      taxRegime: emp.taxRegime,
      gender: emp.gender,
      dateOfBirth: emp.dateOfBirth?.split('T')[0] || '',
      bloodGroup: emp.bloodGroup || '',
      emergencyContact: emp.emergencyContact || '',
      currentAddress: emp.currentAddress || '',
      permanentAddress: emp.permanentAddress || '',
      basic: emp.salaryStructure?.basic?.toString() || '',
      dearnessAllowance: emp.salaryStructure?.dearnessAllowance?.toString() || '0',
      houseRentAllowance: emp.salaryStructure?.houseRentAllowance?.toString() || '',
      conveyanceAllowance: emp.salaryStructure?.conveyanceAllowance?.toString() || '1600',
      medicalAllowance: emp.salaryStructure?.medicalAllowance?.toString() || '1250',
      specialAllowance: emp.salaryStructure?.specialAllowance?.toString() || '',
      dailyRate: emp.salaryStructure?.dailyRate?.toString() || '',
      hourlyRate: emp.salaryStructure?.hourlyRate?.toString() || '',
    })
    setSalaryOpen(false)
    setFormOpen(true)
  }

  const openViewDialog = (emp: Employee) => {
    setViewEmployee(emp)
    setViewOpen(true)
    if (emp.taxRegime === 'old') {
      fetchDeclaration(emp.id)
    }
  }

  const openDeleteDialog = (id: string) => {
    setDeletingId(id)
    setDeleteOpen(true)
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.firstName.trim()) {
      toast.error('First name is required')
      return
    }
    if (!form.email.trim()) {
      toast.error('Email is required')
      return
    }
    if (!form.designation.trim()) {
      toast.error('Designation is required')
      return
    }
    if (!form.department) {
      toast.error('Department is required')
      return
    }
    if (!form.dateOfJoining) {
      toast.error('Date of joining is required')
      return
    }

    setSubmitting(true)
    try {
      const salary = computeSalary(form)
      const payload = {
        ...(editingId ? {} : { employeeCode: form.employeeCode || undefined }),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        dateOfJoining: form.dateOfJoining,
        designation: form.designation.trim(),
        department: form.department,
        client: form.client.trim() || null,
        state: form.state,
        employmentType: form.employmentType,
        panNumber: form.panNumber.trim() || null,
        aadhaarNumber: form.aadhaarNumber.trim() || null,
        bankName: form.bankName.trim() || null,
        bankAccountNumber: form.bankAccountNumber.trim() || null,
        bankIfsc: form.bankIfsc.trim() || null,
        uanNumber: form.uanNumber.trim() || null,
        esiNumber: form.esiNumber.trim() || null,
        pfApplicable: form.pfApplicable,
        esiApplicable: form.esiApplicable,
        ptApplicable: form.ptApplicable,
        lwfApplicable: form.lwfApplicable,
        taxRegime: form.taxRegime,
        gender: form.gender.toLowerCase(),
        dateOfBirth: form.dateOfBirth || null,
        bloodGroup: form.bloodGroup || null,
        emergencyContact: form.emergencyContact.trim() || null,
        currentAddress: form.currentAddress.trim() || null,
        permanentAddress: form.permanentAddress.trim() || null,
        salaryStructure: {
          basic: parseFloat(form.basic) || 0,
          dearnessAllowance: parseFloat(form.dearnessAllowance) || 0,
          houseRentAllowance: parseFloat(form.houseRentAllowance) || 0,
          conveyanceAllowance: parseFloat(form.conveyanceAllowance) || 0,
          medicalAllowance: parseFloat(form.medicalAllowance) || 0,
          specialAllowance: parseFloat(form.specialAllowance) || 0,
          employerPF: salary.employerPF,
          employerESI: salary.employerESI,
          dailyRate: form.dailyRate ? parseFloat(form.dailyRate) : null,
          hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null,
        },
      }

      const url = editingId ? `/api/employees/${editingId}` : '/api/employees'
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Request failed')
      }

      toast.success(editingId ? 'Employee updated successfully' : 'Employee added successfully')
      setFormOpen(false)
      fetchEmployees()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const res = await fetch(`/api/employees/${deletingId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete employee')
      toast.success('Employee marked as exited')
      setDeleteOpen(false)
      setDeletingId(null)
      fetchEmployees()
    } catch {
      toast.error('Failed to delete employee')
    }
  }

  // ─── Salary computed values ───────────────────────────────────────────────

  const salaryComputed = computeSalary(form)

  // ─── Loading Skeletons ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employee Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {employees.length} active {employees.length === 1 ? 'employee' : 'employees'}
          </p>
        </div>
        {canManage && (
          <Button onClick={openAddDialog} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <UserPlus className="size-4" />
            Add Employee
          </Button>
        )}
      </div>

      {canManage && <LoanRequestsCard />}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {INDIAN_STATES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table (desktop) */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>State</TableHead>
                <TableHead>PAN</TableHead>
                <TableHead>Tax Regime</TableHead>
                <TableHead className="text-center">PF/ESI</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    No employees found
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-mono text-xs">
                      {emp.employeeCode}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-semibold">
                            {getInitials(emp.firstName, emp.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{getFullName(emp)}</div>
                          <div className="text-muted-foreground text-xs">{emp.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={DEPT_COLORS[emp.department] || ''}
                      >
                        {emp.department}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{emp.designation}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.state}</TableCell>
                    <TableCell className="font-mono text-xs">{emp.panNumber || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          emp.taxRegime === 'new'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-transparent'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-transparent'
                        }
                      >
                        {emp.taxRegime === 'new' ? 'New' : 'Old'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1.5">
                        {emp.pfApplicable ? (
                          <Check className="size-4 text-emerald-600" />
                        ) : (
                          <X className="size-4 text-muted-foreground/40" />
                        )}
                        <span className="text-muted-foreground text-xs">/</span>
                        {emp.esiApplicable ? (
                          <Check className="size-4 text-emerald-600" />
                        ) : (
                          <X className="size-4 text-muted-foreground/40" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openViewDialog(emp)}
                          title="View"
                        >
                          <Eye className="size-4" />
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => openEditDialog(emp)}
                              title="Edit"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={() => openDeleteDialog(emp.id)}
                              title="Delete"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Card list (mobile) */}
      <div className="space-y-3 md:hidden">
        {employees.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No employees found</CardContent>
          </Card>
        ) : (
          employees.map((emp) => (
            <Card key={emp.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-semibold">
                        {getInitials(emp.firstName, emp.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{getFullName(emp)}</div>
                      <div className="text-muted-foreground text-xs truncate">{emp.employeeCode} · {emp.designation}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openViewDialog(emp)} title="View">
                      <Eye className="size-4" />
                    </Button>
                    {canManage && (
                      <>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditDialog(emp)} title="Edit">
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => openDeleteDialog(emp.id)}
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className={DEPT_COLORS[emp.department] || ''}>
                    {emp.department}
                  </Badge>
                  <Badge variant="outline" className="text-xs">{emp.state}</Badge>
                  <Badge
                    className={
                      emp.taxRegime === 'new'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-transparent'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-transparent'
                    }
                  >
                    {emp.taxRegime === 'new' ? 'New Regime' : 'Old Regime'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination (shared) */}
      {total > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} employees
          </span>
          <span className="sm:hidden">{total} employees</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ─── Add / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open && !submitting) setFormOpen(false) }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update employee details below.'
                : 'Fill in the details to add a new employee.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Personal Info */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="size-4 text-emerald-600" />
                <h3 className="font-semibold text-sm">Personal Information</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    placeholder="Doe"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="john@company.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => updateField('gender', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => updateField('dateOfBirth', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Blood Group</Label>
                  <Select value={form.bloodGroup} onValueChange={(v) => updateField('bloodGroup', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOOD_GROUPS.map((bg) => (
                        <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emergencyContact">Emergency Contact</Label>
                  <Input
                    id="emergencyContact"
                    value={form.emergencyContact}
                    onChange={(e) => updateField('emergencyContact', e.target.value)}
                    placeholder="+91 98765 00000"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Employment Info */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="size-4 text-emerald-600" />
                <h3 className="font-semibold text-sm">Employment Information</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="employeeCode">Employee Code</Label>
                  <Input
                    id="employeeCode"
                    value={form.employeeCode}
                    onChange={(e) => updateField('employeeCode', e.target.value)}
                    placeholder="Auto-generated"
                    disabled={!!editingId}
                  />
                  {!editingId && (
                    <p className="text-muted-foreground text-xs">Leave empty to auto-generate</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="designation">Designation *</Label>
                  <Input
                    id="designation"
                    value={form.designation}
                    onChange={(e) => updateField('designation', e.target.value)}
                    placeholder="Software Engineer"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Department *</Label>
                  <Select value={form.department} onValueChange={(v) => updateField('department', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client">Client</Label>
                  <Input
                    id="client"
                    value={form.client}
                    onChange={(e) => updateField('client', e.target.value)}
                    placeholder="e.g. Acme Corp (leave blank if not applicable)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doj">Date of Joining *</Label>
                  <Input
                    id="doj"
                    type="date"
                    value={form.dateOfJoining}
                    onChange={(e) => updateField('dateOfJoining', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Select value={form.state} onValueChange={(v) => updateField('state', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDIAN_STATES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Employment Type</Label>
                  <Select value={form.employmentType} onValueChange={(v) => updateField('employmentType', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="permanent">Permanent</SelectItem>
                      <SelectItem value="contractor">Contractor</SelectItem>
                      <SelectItem value="daily_wage">Daily Wage</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">Non-permanent types are paid via Payroll &gt; Contractor/Daily-Wage/Hourly Pay, not the regular monthly run.</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Statutory */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="size-4 text-emerald-600" />
                <h3 className="font-semibold text-sm">Statutory Details</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="panNumber">PAN Number</Label>
                  <Input
                    id="panNumber"
                    value={form.panNumber}
                    onChange={(e) => updateField('panNumber', e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    className="uppercase"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aadhaarNumber">Aadhaar Number</Label>
                  <Input
                    id="aadhaarNumber"
                    value={form.aadhaarNumber}
                    onChange={(e) => updateField('aadhaarNumber', e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="1234 5678 9012"
                    maxLength={12}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="uanNumber">UAN Number</Label>
                  <Input
                    id="uanNumber"
                    value={form.uanNumber}
                    onChange={(e) => updateField('uanNumber', e.target.value)}
                    placeholder="100000000000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="esiNumber">ESI Number</Label>
                  <Input
                    id="esiNumber"
                    value={form.esiNumber}
                    onChange={(e) => updateField('esiNumber', e.target.value)}
                    placeholder="310000000000000"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Compliances */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="size-4 text-emerald-600" />
                <h3 className="font-semibold text-sm">Compliances</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="pfSwitch" className="cursor-pointer">PF Applicable</Label>
                  <Switch
                    id="pfSwitch"
                    checked={form.pfApplicable}
                    onCheckedChange={(v) => updateField('pfApplicable', v)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="esiSwitch" className="cursor-pointer">ESI Applicable</Label>
                  <Switch
                    id="esiSwitch"
                    checked={form.esiApplicable}
                    onCheckedChange={(v) => updateField('esiApplicable', v)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="ptSwitch" className="cursor-pointer">PT Applicable</Label>
                  <Switch
                    id="ptSwitch"
                    checked={form.ptApplicable}
                    onCheckedChange={(v) => updateField('ptApplicable', v)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="lwfSwitch" className="cursor-pointer">LWF Applicable</Label>
                  <Switch
                    id="lwfSwitch"
                    checked={form.lwfApplicable}
                    onCheckedChange={(v) => updateField('lwfApplicable', v)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Tax Regime</Label>
                  <Select value={form.taxRegime} onValueChange={(v) => updateField('taxRegime', v)}>
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New Tax Regime</SelectItem>
                      <SelectItem value="old">Old Tax Regime</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Bank Details */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Landmark className="size-4 text-emerald-600" />
                <h3 className="font-semibold text-sm">Bank Details</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={form.bankName}
                    onChange={(e) => updateField('bankName', e.target.value)}
                    placeholder="State Bank of India"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bankAccountNumber">Account Number</Label>
                  <Input
                    id="bankAccountNumber"
                    value={form.bankAccountNumber}
                    onChange={(e) => updateField('bankAccountNumber', e.target.value.replace(/\D/g, ''))}
                    placeholder="1234567890"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bankIfsc">IFSC Code</Label>
                  <Input
                    id="bankIfsc"
                    value={form.bankIfsc}
                    onChange={(e) => updateField('bankIfsc', e.target.value.toUpperCase())}
                    placeholder="SBIN0001234"
                    className="uppercase"
                    maxLength={11}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Address */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="size-4 text-emerald-600" />
                <h3 className="font-semibold text-sm">Address</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="currentAddress">Current Address</Label>
                  <Textarea
                    id="currentAddress"
                    value={form.currentAddress}
                    onChange={(e) => updateField('currentAddress', e.target.value)}
                    placeholder="Enter current address"
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="permanentAddress">Permanent Address</Label>
                  <Textarea
                    id="permanentAddress"
                    value={form.permanentAddress}
                    onChange={(e) => updateField('permanentAddress', e.target.value)}
                    placeholder="Enter permanent address"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Salary Structure (Collapsible) */}
            <Collapsible open={salaryOpen} onOpenChange={setSalaryOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full">
                <Banknote className="size-4 text-emerald-600" />
                <h3 className="font-semibold text-sm">Salary Structure</h3>
                {salaryOpen ? (
                  <ChevronUp className="size-4 ml-auto text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 ml-auto text-muted-foreground" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                {form.employmentType !== 'permanent' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    {form.employmentType === 'daily_wage' && (
                      <div className="space-y-1.5">
                        <Label htmlFor="dailyRate">Daily Rate</Label>
                        <Input id="dailyRate" type="number" value={form.dailyRate} onChange={(e) => updateField('dailyRate', e.target.value)} placeholder="800" />
                      </div>
                    )}
                    {form.employmentType === 'hourly' && (
                      <div className="space-y-1.5">
                        <Label htmlFor="hourlyRate">Hourly Rate</Label>
                        <Input id="hourlyRate" type="number" value={form.hourlyRate} onChange={(e) => updateField('hourlyRate', e.target.value)} placeholder="150" />
                      </div>
                    )}
                    {form.employmentType === 'contractor' && (
                      <p className="text-xs text-muted-foreground sm:col-span-2">Contractors are paid a flat invoiced amount each run — no standing rate needed here.</p>
                    )}
                    <p className="text-xs text-muted-foreground sm:col-span-2">The monthly salary fields below don&apos;t apply to this employment type — they&apos;re only used if you later switch this employee back to Permanent.</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="basic">Basic Salary</Label>
                    <Input
                      id="basic"
                      type="number"
                      value={form.basic}
                      onChange={(e) => updateField('basic', e.target.value)}
                      placeholder="25000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="da">Dearness Allowance</Label>
                    <Input
                      id="da"
                      type="number"
                      value={form.dearnessAllowance}
                      onChange={(e) => updateField('dearnessAllowance', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hra">HRA</Label>
                    <Input
                      id="hra"
                      type="number"
                      value={form.houseRentAllowance}
                      onChange={(e) => updateField('houseRentAllowance', e.target.value)}
                      placeholder="10000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="conveyance">Conveyance Allowance</Label>
                    <Input
                      id="conveyance"
                      type="number"
                      value={form.conveyanceAllowance}
                      onChange={(e) => updateField('conveyanceAllowance', e.target.value)}
                      placeholder="1600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="medical">Medical Allowance</Label>
                    <Input
                      id="medical"
                      type="number"
                      value={form.medicalAllowance}
                      onChange={(e) => updateField('medicalAllowance', e.target.value)}
                      placeholder="1250"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="special">Special Allowance</Label>
                    <Input
                      id="special"
                      type="number"
                      value={form.specialAllowance}
                      onChange={(e) => updateField('specialAllowance', e.target.value)}
                      placeholder="5000"
                    />
                  </div>
                </div>

                {/* Computed values */}
                <div className="mt-4 rounded-lg border bg-muted/50 p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Computed Values</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex justify-between sm:flex-col sm:gap-0.5">
                      <span className="text-xs text-muted-foreground">Gross Salary</span>
                      <span className="text-sm font-semibold">{fmt(salaryComputed.gross)}</span>
                    </div>
                    <div className="flex justify-between sm:flex-col sm:gap-0.5">
                      <span className="text-xs text-muted-foreground">Employer PF (12% of Basic)</span>
                      <span className="text-sm font-semibold">{fmt(salaryComputed.employerPF)}</span>
                    </div>
                    <div className="flex justify-between sm:flex-col sm:gap-0.5">
                      <span className="text-xs text-muted-foreground">
                        Employer ESI (3.25%{form.esiApplicable && salaryComputed.gross <= 21000 ? '' : ' — N/A'})
                      </span>
                      <span className="text-sm font-semibold">{fmt(salaryComputed.employerESI)}</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold">Monthly CTC</span>
                    <span className="text-sm font-bold text-emerald-600">{fmt(salaryComputed.monthlyCTC)}</span>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitting ? 'Saving...' : editingId ? 'Update Employee' : 'Add Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Employee Dialog ──────────────────────────────────────────── */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewEmployee && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-sm font-bold">
                      {getInitials(viewEmployee.firstName, viewEmployee.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <DialogTitle>{getFullName(viewEmployee)}</DialogTitle>
                    <DialogDescription>{viewEmployee.employeeCode} · {viewEmployee.designation}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="personal" className="mt-2">
                <TabsList>
                  <TabsTrigger value="personal">
                    <UserPlus className="size-3.5 mr-1" /> Personal
                  </TabsTrigger>
                  <TabsTrigger value="employment">
                    <Briefcase className="size-3.5 mr-1" /> Employment
                  </TabsTrigger>
                  <TabsTrigger value="salary">
                    <Banknote className="size-3.5 mr-1" /> Salary
                  </TabsTrigger>
                  <TabsTrigger value="bank">
                    <Landmark className="size-3.5 mr-1" /> Bank
                  </TabsTrigger>
                  {viewEmployee.taxRegime === 'old' && (
                    <TabsTrigger value="tax">
                      <Shield className="size-3.5 mr-1" /> Tax Declaration
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* Personal Tab */}
                <TabsContent value="personal" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem icon={<UserPlus className="size-4 text-muted-foreground" />} label="Full Name" value={getFullName(viewEmployee)} />
                    <InfoItem icon={<Mail className="size-4 text-muted-foreground" />} label="Email" value={viewEmployee.email} />
                    <InfoItem icon={<Phone className="size-4 text-muted-foreground" />} label="Phone" value={viewEmployee.phone || '—'} />
                    <InfoItem icon={<UserPlus className="size-4 text-muted-foreground" />} label="Gender" value={viewEmployee.gender} />
                    <InfoItem icon={<CalendarDays className="size-4 text-muted-foreground" />} label="Date of Birth" value={viewEmployee.dateOfBirth ? new Date(viewEmployee.dateOfBirth).toLocaleDateString('en-IN') : '—'} />
                    <InfoItem icon={<Droplets className="size-4 text-muted-foreground" />} label="Blood Group" value={viewEmployee.bloodGroup || '—'} />
                    <InfoItem icon={<Heart className="size-4 text-muted-foreground" />} label="Emergency Contact" value={viewEmployee.emergencyContact || '—'} />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="size-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">Current Address</span>
                    </div>
                    <p className="text-sm pl-6">{viewEmployee.currentAddress || '—'}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="size-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">Permanent Address</span>
                    </div>
                    <p className="text-sm pl-6">{viewEmployee.permanentAddress || '—'}</p>
                  </div>
                </TabsContent>

                {/* Employment Tab */}
                <TabsContent value="employment" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem icon={<FileText className="size-4 text-muted-foreground" />} label="Employee Code" value={viewEmployee.employeeCode} mono />
                    <InfoItem icon={<Briefcase className="size-4 text-muted-foreground" />} label="Designation" value={viewEmployee.designation} />
                    <InfoItem icon={<Building2 className="size-4 text-muted-foreground" />} label="Department" value={viewEmployee.department}>
                      <Badge
                        variant="secondary"
                        className={DEPT_COLORS[viewEmployee.department] || ''}
                      >
                        {viewEmployee.department}
                      </Badge>
                    </InfoItem>
                    <InfoItem icon={<CalendarDays className="size-4 text-muted-foreground" />} label="Date of Joining" value={new Date(viewEmployee.dateOfJoining).toLocaleDateString('en-IN')} />
                    <InfoItem icon={<Building2 className="size-4 text-muted-foreground" />} label="Client" value={viewEmployee.client || '—'} />
                    <InfoItem icon={<MapPin className="size-4 text-muted-foreground" />} label="State" value={viewEmployee.state} />
                    <InfoItem icon={<Shield className="size-4 text-muted-foreground" />} label="Tax Regime" value={viewEmployee.taxRegime === 'new' ? 'New' : 'Old'}>
                      <Badge
                        className={
                          viewEmployee.taxRegime === 'new'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-transparent'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-transparent'
                        }
                      >
                        {viewEmployee.taxRegime === 'new' ? 'New' : 'Old'}
                      </Badge>
                    </InfoItem>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-xs text-muted-foreground font-medium mb-3">Statutory & Compliances</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <InfoItem icon={<CreditCard className="size-4 text-muted-foreground" />} label="PAN" value={viewEmployee.panNumber || '—'} mono />
                      <InfoItem icon={<CreditCard className="size-4 text-muted-foreground" />} label="Aadhaar" value={viewEmployee.aadhaarNumber || '—'} mono />
                      <InfoItem icon={<Shield className="size-4 text-muted-foreground" />} label="UAN" value={viewEmployee.uanNumber || '—'} mono />
                      <InfoItem icon={<Shield className="size-4 text-muted-foreground" />} label="ESI No." value={viewEmployee.esiNumber || '—'} mono />
                      <ComplianceBadge label="PF" active={viewEmployee.pfApplicable} />
                      <ComplianceBadge label="ESI" active={viewEmployee.esiApplicable} />
                      <ComplianceBadge label="PT" active={viewEmployee.ptApplicable} />
                      <ComplianceBadge label="LWF" active={viewEmployee.lwfApplicable} />
                    </div>
                  </div>
                </TabsContent>

                {/* Salary Tab */}
                <TabsContent value="salary" className="mt-4 space-y-4">
                  {viewEmployee.salaryStructure ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem icon={null} label="Basic Salary" value={fmt(viewEmployee.salaryStructure.basic)} />
                        <InfoItem icon={null} label="Dearness Allowance" value={fmt(viewEmployee.salaryStructure.dearnessAllowance)} />
                        <InfoItem icon={null} label="HRA" value={fmt(viewEmployee.salaryStructure.houseRentAllowance)} />
                        <InfoItem icon={null} label="Conveyance" value={fmt(viewEmployee.salaryStructure.conveyanceAllowance)} />
                        <InfoItem icon={null} label="Medical" value={fmt(viewEmployee.salaryStructure.medicalAllowance)} />
                        <InfoItem icon={null} label="Special Allowance" value={fmt(viewEmployee.salaryStructure.specialAllowance)} />
                        <InfoItem icon={null} label="Overtime" value={fmt(viewEmployee.salaryStructure.overtimeAllowance)} />
                        <InfoItem icon={null} label="Bonus" value={fmt(viewEmployee.salaryStructure.bonus)} />
                      </div>
                      <Separator />
                      <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                        <h4 className="text-xs text-muted-foreground font-medium">Summary</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <InfoItem icon={null} label="Employer PF" value={fmt(viewEmployee.salaryStructure.employerPF)} />
                          <InfoItem icon={null} label="Employer ESI" value={fmt(viewEmployee.salaryStructure.employerESI)} />
                          <InfoItem icon={null} label="Gratuity" value={fmt(viewEmployee.salaryStructure.gratuity)} />
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-sm font-semibold">Monthly CTC</span>
                          {(() => {
                            const gross =
                              viewEmployee.salaryStructure.basic +
                              viewEmployee.salaryStructure.dearnessAllowance +
                              viewEmployee.salaryStructure.houseRentAllowance +
                              viewEmployee.salaryStructure.conveyanceAllowance +
                              viewEmployee.salaryStructure.medicalAllowance +
                              viewEmployee.salaryStructure.specialAllowance +
                              viewEmployee.salaryStructure.overtimeAllowance +
                              viewEmployee.salaryStructure.bonus +
                              viewEmployee.salaryStructure.otherEarnings
                            const ctc = gross + (viewEmployee.salaryStructure.employerPF || 0) + (viewEmployee.salaryStructure.employerESI || 0) + (viewEmployee.salaryStructure.gratuity || 0)
                            return <span className="text-base font-bold text-emerald-600">{fmt(ctc)}</span>
                          })()}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Banknote className="size-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No salary structure defined</p>
                    </div>
                  )}
                </TabsContent>

                {/* Bank Tab */}
                <TabsContent value="bank" className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <InfoItem icon={<Landmark className="size-4 text-muted-foreground" />} label="Bank Name" value={viewEmployee.bankName || '—'} />
                    <InfoItem icon={<CreditCard className="size-4 text-muted-foreground" />} label="Account Number" value={viewEmployee.bankAccountNumber || '—'} mono />
                    <InfoItem icon={<FileText className="size-4 text-muted-foreground" />} label="IFSC Code" value={viewEmployee.bankIfsc || '—'} mono />
                  </div>
                </TabsContent>

                {/* Tax Declaration Tab (old regime only) */}
                {viewEmployee.taxRegime === 'old' && (
                  <TabsContent value="tax" className="mt-4 space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Financial year {currentFinancialYear} — combined with PF+ESI, 80C is capped at ₹1,50,000 and 80D at ₹25,000.
                      Changes apply starting with the next payroll run processed for this year.
                    </p>
                    {declarationLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="decl-80c" className="text-xs font-medium">Section 80C (LIC, PPF, ELSS, etc.)</Label>
                          <Input
                            id="decl-80c"
                            type="number"
                            min="0"
                            placeholder="0"
                            value={declaration80C}
                            onChange={(e) => setDeclaration80C(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="decl-80d" className="text-xs font-medium">Section 80D (Health Insurance)</Label>
                          <Input
                            id="decl-80d"
                            type="number"
                            min="0"
                            placeholder="0"
                            value={declaration80D}
                            onChange={(e) => setDeclaration80D(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={declarationSaving || declarationLoading}
                      onClick={handleSaveDeclaration}
                    >
                      {declarationSaving ? 'Saving...' : 'Save Declaration'}
                    </Button>
                  </TabsContent>
                )}
              </Tabs>

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    setViewOpen(false)
                    openEditDialog(viewEmployee)
                  }}
                >
                  <Pencil className="size-4" />
                  Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the employee as exited. They will no longer appear in the active
              employees list. This action can be reversed by updating their exit date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={false}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Sub-Components ────────────────────────────────────────────────────────────

function InfoItem({
  icon,
  label,
  value,
  mono,
  children,
}: {
  icon?: React.ReactNode
  label: string
  value?: string
  mono?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      {children || (
        <p className={`text-sm pl-6 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
      )}
    </div>
  )
}

function ComplianceBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2">
      {active ? (
        <Check className="size-4 text-emerald-600" />
      ) : (
        <X className="size-4 text-muted-foreground/40" />
      )}
      <span className="text-sm">{label} {active ? 'Applicable' : 'Not Applicable'}</span>
    </div>
  )
}

function LoanRequestsCard() {
  const [requests, setRequests] = useState<{
    id: string; loanType: string; principal: number; totalMonths: number; reason: string | null;
    employee: { firstName: string; lastName: string | null; employeeCode: string };
  }[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/loans?status=pending')
      const json = await res.json()
      setRequests(json.data ?? [])
    } catch {
      toast.error('Failed to load loan requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const handleAction = async (id: string, status: 'active' | 'rejected') => {
    setActingId(id)
    try {
      const res = await fetch(`/api/loans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update request')
      toast.success(status === 'active' ? 'Loan approved' : 'Loan request rejected')
      fetchRequests()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update request')
    } finally {
      setActingId(null)
    }
  }

  if (!loading && requests.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="size-4 text-emerald-600" />
          Pending Loan / Advance Requests
        </CardTitle>
        <CardDescription>Employee-submitted requests awaiting approval — approving starts EMI deductions from next month&apos;s payroll</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="divide-y">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3 gap-4">
                <div className="text-sm space-y-0.5">
                  <p className="font-medium capitalize">
                    {r.employee.firstName} {r.employee.lastName ?? ''} <span className="text-xs text-muted-foreground font-normal">({r.employee.employeeCode})</span>
                    {' — '}{r.loanType} of ₹{r.principal.toLocaleString('en-IN')} over {r.totalMonths} months
                  </p>
                  {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200" disabled={actingId === r.id} onClick={() => handleAction(r.id, 'active')}>
                    {actingId === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200" disabled={actingId === r.id} onClick={() => handleAction(r.id, 'rejected')}>
                    <X className="size-4" />Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
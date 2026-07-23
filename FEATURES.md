# PayrollPro — Feature Documentation

> **Last Updated:** July 2025  
> **Version:** 0.2.0

---

## Overview

PayrollPro is a comprehensive Indian Payroll Management System with **22 completed features** across 8 application views. The system handles the full employee lifecycle from onboarding to monthly salary processing with full Indian statutory compliance.

---

## Architecture

- **Single-Page Application** with client-side view routing via Zustand
- **8 lazy-loaded views** rendered inside a shared layout
- **15 API routes** (28 handlers) for all backend operations
- **SQLite database** with 8 Prisma models
- **Indian payroll calculation engine** (590 lines) covering all major statutory requirements

---

## Feature Matrix

### 1. Dashboard

**File:** `src/components/payroll/dashboard-view.tsx` (577 lines)  
**API:** `GET /api/dashboard`

| Feature | Status | Details |
|---------|--------|---------|
| Employee count KPI | ✅ | Total active employees (exited = filtered out) |
| Present today KPI | ✅ | Count of attendance records with status "present" for today |
| On leave today KPI | ✅ | Count of approved leave applications covering today |
| Monthly payroll summary | ✅ | Shows latest payroll run's month, year, status, total |
| Salary statistics | ✅ | Total gross, deductions, net, TDS, PF, ESI, PT, LWF from latest run |
| Department distribution chart | ✅ | Pie chart (Recharts) showing employees per department |
| State distribution chart | ✅ | Pie chart showing employees per state |
| Recent payroll runs | ✅ | Table of last 6 payroll runs with status |
| Seed demo data button | ✅ | One-click to populate database with sample data |

---

### 2. Employee Management

**File:** `src/components/payroll/employees-view.tsx` (1,424 lines)  
**APIs:** `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/[id]`

| Feature | Status | Details |
|---------|--------|---------|
| Employee list with table | ✅ | Shows code, name, department, designation, state, PAN, tax regime, PF/ESI status |
| Search by name or code | ✅ | Client-side filtering across firstName, lastName, employeeCode |
| Filter by department | ✅ | Dropdown: All Departments / Engineering / HR / Finance / Marketing / Operations |
| Filter by state | ✅ | Dropdown: All States / Maharashtra / Karnataka / Tamil Nadu (and 33 other states) |
| Create employee | ✅ | Full dialog with personal info, employment details, bank details, salary structure |
| View employee details | ✅ | Read-only dialog showing all employee fields + salary breakdown + compliance flags |
| Edit employee | ✅ | Same dialog as create, pre-filled with existing data |
| Soft-delete employee | ✅ | Sets `dateOfExit` instead of hard delete; removes from active lists |
| Auto-generate employee code | ✅ | Format: `EMP####` (auto-incremented) |
| Salary structure management | ✅ | Basic, HRA, DA, Conveyance, Medical, Special Allowance, Overtime, Bonus |
| CTC display | ✅ | Shows CTC = Gross + Employer PF + Employer ESI + Gratuity |
| Tax regime selection | ✅ | New Tax Regime or Old Tax Regime per employee |
| Compliance flags | ✅ | PF Applicable, ESI Applicable, PT Applicable, LWF Applicable toggles |
| Compliance badges | ✅ | Visual badges showing PF/ESI/PT/LWF applicability status |

---

### 3. Attendance Management

**File:** `src/components/payroll/attendance-view.tsx` (1,039 lines)  
**APIs:** `GET/POST /api/attendance`, `POST /api/attendance/punch`

| Feature | Status | Details |
|---------|--------|---------|
| Attendance calendar view | ✅ | Monthly calendar showing attendance status per day |
| Daily attendance table | ✅ | Shows punch-in/out times, method, face verification, total hours |
| Filter by employee | ✅ | Employee selector dropdown |
| Filter by month/year | ✅ | Month and year selectors |
| Filter by date | ✅ | Specific date picker |
| Punch in | ✅ | Record arrival with method (face/manual/login) |
| Punch out | ✅ | Record departure with method |
| Face recognition support | ✅ | Stores face verification status and confidence score |
| Manual attendance creation | ✅ | Dialog to manually create/edit attendance records |
| Duplicate punch prevention | ✅ | Prevents double punch-in or punch-out for same day |
| Total hours calculation | ✅ | Auto-calculated from punch-in to punch-out |
| Status tracking | ✅ | Present, Absent, Half-Day, Holiday, Weekly-Off |
| Framer Motion animations | ✅ | Smooth transitions on calendar day selection |

---

### 4. Leave Management

**File:** `src/components/payroll/leaves-view.tsx` (1,034 lines)  
**APIs:** `GET/POST /api/leaves`, `GET/PUT/DELETE /api/leaves/[id]`, `GET /api/leaves/balance`

| Feature | Status | Details |
|---------|--------|---------|
| Leave applications list | ✅ | Table showing employee, type, dates, days, status, reason |
| Employee filter | ✅ | Filter by specific employee |
| Status filter | ✅ | Filter by: All / Pending / Approved / Rejected |
| Apply for leave | ✅ | Dialog: select employee, type, date range, reason |
| Approve leave | ✅ | Updates status to "approved", increments leave balance used count |
| Reject leave | ✅ | Updates status to "rejected" |
| Cancel leave | ✅ | Updates status to "cancelled" |
| Leave balance tab | ✅ | Shows per-employee, per-type, per-year balances |
| Balance display | ✅ | Total allocated, used, remaining for each leave type |
| Leave types | ✅ | Casual Leave (CL), Sick Leave (SL), Earned Leave (EL), Compensatory Off |
| Annual allocation | ✅ | Configurable total days per leave type per year |
| Carry-forward support | ✅ | Schema supports carry-forward with max limit |
| Transaction-based approval | ✅ | Leave approval + balance update in a DB transaction |

---

### 5. Payroll Processing

**File:** `src/components/payroll/payroll-view.tsx` (657 lines)  
**APIs:** `GET/POST /api/payroll`, `GET/PUT /api/payroll/[runId]`

| Feature | Status | Details |
|---------|--------|---------|
| Payroll run list | ✅ | Shows all payroll runs with month, year, status, employee count, totals |
| Process payroll button | ✅ | One-click processing for selected month/year |
| Per-employee calculation | ✅ | Iterates all active employees and calculates salary |
| Present-day pro-ration | ✅ | Salary adjusted based on actual present days |
| Earnings breakdown | ✅ | Basic, DA, HRA, Conveyance, Medical, Special, OT, Bonus |
| Deductions breakdown | ✅ | Employee PF, Employer PF, Employee ESI, Employer ESI, TDS, PT, LWF |
| Net salary calculation | ✅ | Total Earnings - Total Deductions |
| CTC calculation | ✅ | Gross + Employer PF + Employer ESI + Gratuity |
| Payroll status workflow | ✅ | Draft → Processed → Paid |
| Run totals | ✅ | Aggregate totals across all employees for the run |
| Refresh capability | ✅ | Manual refresh button to reload payroll data |
| Undo/reprocess | ✅ | Can re-process a month (deletes existing and recalculates) |

---

### 6. Salary Slip Generation

**File:** `src/components/payroll/salary-slip-view.tsx` (580 lines)  
**API:** `GET /api/salary-slip`

| Feature | Status | Details |
|---------|--------|---------|
| Employee selector | ✅ | Dropdown to select employee |
| Month/year selector | ✅ | Select any month and year |
| Generate salary slip | ✅ | Fetches or computes salary data for display |
| Company header | ✅ | Shows company name, address, PAN, TAN, GSTIN |
| Employee info section | ✅ | Name, code, designation, department, PAN, state |
| Earnings table | ✅ | All earnings components with monthly amounts |
| Deductions table | ✅ | All deduction components with monthly amounts |
| Summary section | ✅ | Total earnings, total deductions, net pay, CTC |
| Print layout | ✅ | Print-optimized CSS with `@media print` rules |
| Print button | ✅ | Triggers `window.print()` for salary slip |
| Real-time calculation | ✅ | If no processed payroll exists, calculates on-the-fly |
| Tax regime display | ✅ | Shows applicable tax regime and TDS amount |

---

### 7. Compliance Reports

**File:** `src/components/payroll/reports-view.tsx` (846 lines)  
**API:** `GET /api/reports`

| Feature | Status | Details |
|---------|--------|---------|
| Report type selector | ✅ | Summary, PF, ESI, TDS, Professional Tax, LWF |
| Month/year filter | ✅ | Select any month and year for reports |
| Summary report | ✅ | Overview: total employees, gross salary, all deductions, net pay |
| PF report | ✅ | Per-employee: gross wages, employee PF (12%), employer PF (12%), total PF |
| ESI report | ✅ | Per-employee: gross wages, employee ESI (0.75%), employer ESI (3.25%), total ESI |
| TDS report | ✅ | Per-employee: taxable income, TDS amount, tax regime |
| Professional Tax report | ✅ | Per-employee: monthly PT based on state slab |
| LWF report | ✅ | Per-employee: employee and employer LWF contributions |
| Grand totals | ✅ | Each report shows column totals at the bottom |
| Export buttons | ⚠️ | UI buttons present but **non-functional** (no backend export logic) |

---

### 8. Company Settings

**File:** `src/components/payroll/settings-view.tsx` (794 lines)  
**API:** `GET/PUT /api/settings`

| Feature | Status | Details |
|---------|--------|---------|
| Company name | ✅ | Editable text field |
| Company address | ✅ | Editable text area |
| PAN number | ✅ | Editable text field |
| TAN number | ✅ | Editable text field |
| GSTIN | ✅ | Editable text field |
| PF number | ✅ | Editable text field |
| ESI number | ✅ | Editable text field |
| State selection | ✅ | Dropdown with all 36 Indian states/UTs |
| Financial year start | ✅ | Date picker (default: April 1) |
| Payroll month/year | ✅ | Current payroll period configuration |
| Save settings | ✅ | Persists to database |
| Upsert behavior | ✅ | Creates company record if none exists, updates if it does |

---

## Statutory Compliance Engine

**File:** `src/lib/payroll/engine.ts` (590 lines)

### EPF (Employees' Provident Fund)

| Parameter | Value |
|-----------|-------|
| Employee contribution | 12% of (Basic + Dearness Allowance) |
| Employer contribution | 12% of (Basic + Dearness Allowance) |
| EPS portion (Employer) | 8.33% (capped at ₹15,000/month basis) |
| EPF portion (Employer) | 3.67% (remainder) |
| Wage ceiling | ₹15,000/month (optional applicability) |
| Pension contribution cap | ₹1,250/month (8.33% × ₹15,000) |

### ESI (Employees' State Insurance)

| Parameter | Value |
|-----------|-------|
| Employee contribution | 0.75% of Gross Salary |
| Employer contribution | 3.25% of Gross Salary |
| Wage ceiling | ₹21,000/month |
| Applicability | Gross salary ≤ ₹21,000/month |

### TDS (Tax Deducted at Source) — New Regime (FY 2025-26)

| Income Slab | Rate |
|-------------|------|
| ₹0 – ₹4,00,000 | 0% |
| ₹4,00,001 – ₹8,00,000 | 5% |
| ₹8,00,001 – ₹12,00,000 | 10% |
| ₹12,00,001 – ₹16,00,000 | 15% |
| ₹16,00,001 – ₹20,00,000 | 20% |
| ₹20,00,001 – ₹24,00,000 | 25% |
| Above ₹24,00,000 | 30% |

- Standard Deduction: ₹75,000
- Rebate u/s 87A: Taxable income ≤ ₹12,00,000 → full rebate
- Monthly TDS: Annual tax ÷ 12

### TDS (Old Regime) (FY 2025-26)

| Income Slab | Rate |
|-------------|------|
| ₹0 – ₹2,50,000 | 0% |
| ₹2,50,001 – ₹5,00,000 | 5% |
| ₹5,00,001 – ₹10,00,000 | 20% |
| Above ₹10,00,000 | 30% |

- Standard Deduction: ₹50,000
- Section 80C: Up to ₹1,50,000
- Section 80D: Up to ₹25,000 (₹50,000 for senior citizens)
- HRA Exemption: Calculated based on metro/non-metro, rent paid, salary components
- Rebate u/s 87A: Total income ≤ ₹5,00,000

### Professional Tax (State-wise)

Covers 13+ states with slab-based monthly deductions:

| State | Monthly Slabs |
|-------|--------------|
| Maharashtra | ₹0 (≤₹7,500), ₹200 (₹7,501–10,000), ₹300 (>₹10,000) |
| Karnataka | ₹0 (≤₹15,000), ₹200 (>₹15,000) |
| Tamil Nadu | ₹0 (≤₹21,000), ₹135 (half-yearly >₹21,000) |
| Gujarat | ₹0 (≤₹5,999), ₹20 (₹6,000–8,999), ₹80 (₹9,000–11,999), ₹150 (≥₹12,000) |
| Andhra Pradesh | ₹0 (≤₹15,000), ₹200 (>₹15,000) |
| Telangana | ₹0 (≤₹15,000), ₹200 (>₹15,000) |
| West Bengal | ₹0 (≤₹10,000), ₹110–208 (slab-based) |
| Madhya Pradesh | ₹0 (≤₹18,750), ₹125–208 (slab-based) |
| Uttar Pradesh | ₹0 (≤₹10,000), ₹200 (>₹10,000) |
| Kerala | ₹0 (≤₹15,000), ₹200 (>₹15,000) |
| Punjab | ₹0 (≤₹15,000), ₹200 (>₹15,000) |
| Rajasthan | ₹0 (≤₹15,000), ₹175–300 (slab-based) |
| Odisha | ₹0 (≤₹15,000), ₹200 (>₹15,000) |

### Labour Welfare Fund (State-wise)

Covers 12+ states with monthly employee/employer contributions:

| State | Employee | Employer | Total |
|-------|----------|----------|-------|
| Maharashtra | ₹6 | ₹12 | ₹18 |
| Karnataka | ₹20 | ₹40 | ₹60 |
| Gujarat | ₹3 | ₹6 | ₹9 |
| Madhya Pradesh | ₹4 | ₹8 | ₹12 |
| Delhi | ₹0.75 | ₹1.50 | ₹2.25 |
| Haryana | ₹3 | ₹6 | ₹9 |
| Punjab | ₹2.50 | ₹5 | ₹7.50 |
| Kerala | ₹5 | ₹10 | ₹15 |
| Tamil Nadu | ₹10 | ₹20 | ₹30 |
| Andhra Pradesh | ₹2 | ₹4 | ₹6 |
| Telangana | ₹2 | ₹4 | ₹6 |
| West Bengal | ₹4 | ₹8 | ₹12 |

---

## Seed Data

**API:** `POST /api/seed`

The seed endpoint creates:

| Entity | Count | Details |
|--------|-------|---------|
| Company | 1 | Acme Corp Pvt. Ltd., Maharashtra, with PAN/TAN/GSTIN/PF/ESI numbers |
| Leave Types | 4 | Casual Leave (12), Sick Leave (6), Earned Leave (15), Compensatory Off (5) |
| Employees | 6 | Across 3 states (Maharashtra ×3, Karnataka ×2, Tamil Nadu ×1) |
| Salary Structures | 6 | One per employee with varying components |
| Leave Balances | 24 | 4 types × 6 employees for current year |

### Employee Roster

| Code | Name | Department | State | Salary | Tax Regime |
|------|------|-----------|-------|--------|------------|
| EMP001 | Arjun Sharma | Engineering | Maharashtra | ₹85,000 | New |
| EMP002 | Priya Nair | HR | Karnataka | ₹65,000 | Old |
| EMP003 | Vikram Patel | Finance | Maharashtra | ₹75,000 | New |
| EMP004 | Meena Krishnan | Marketing | Tamil Nadu | ₹55,000 | New |
| EMP005 | Suresh Reddy | Operations | Karnataka | ₹45,000 | Old |
| EMP006 | Anjali Deshmukh | Engineering | Maharashtra | ₹25,000 | New |

---

*Generated by Z.ai Code — Feature Documentation*
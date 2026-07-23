# PayrollPro — Complete Project Audit

> **Audit Date:** July 2025  
> **Auditor:** Z.ai Code (Automated)  
> **Project Version:** 0.2.0  
> **Audit Scope:** Full codebase — architecture, security, performance, quality, deployment readiness

---

## 1. Product Overview

**PayrollPro** is a comprehensive Indian Payroll Management System built as a single-page application with 8 views. It handles the complete payroll lifecycle including employee management, face-recognition attendance tracking, leave management, statutory-compliant salary processing (PF, ESI, TDS, PT, LWF), salary slip generation, and compliance reporting.

**Target Users:** Small-to-medium Indian businesses (1–500 employees) needing statutory-compliant payroll processing.

**Key Differentiator:** Full Indian statutory compliance engine covering 13+ states for Professional Tax and 12+ states for Labour Welfare Fund, with both New and Old Tax Regime support for FY 2025-26.

---

## 2. Business Requirements

| # | Requirement | Status |
|---|-------------|--------|
| BR-01 | Manage employee records (CRUD) with personal, employment, and bank details | ✅ Complete |
| BR-02 | Define salary structures (Basic, HRA, DA, Conveyance, Medical, Special, Overtime, Bonus) | ✅ Complete |
| BR-03 | Track daily attendance with punch-in/punch-out (manual, login, face recognition methods) | ✅ Complete |
| BR-04 | Store face verification metadata (confidence scores, verification status) | ✅ Complete |
| BR-05 | Manage leave types (CL, SL, EL, Compensatory Off) with annual allocation | ✅ Complete |
| BR-06 | Apply for, approve, reject, and cancel leave applications | ✅ Complete |
| BR-07 | Track leave balances per employee per year with carry-forward | ✅ Complete |
| BR-08 | Process monthly payroll for all active employees | ✅ Complete |
| BR-09 | Calculate EPF (12%+12%), ESI (0.75%+3.25%), TDS (New/Old regime), PT, LWF | ✅ Complete |
| BR-10 | Generate individual salary slips (viewable, printable) | ✅ Complete |
| BR-11 | Generate compliance reports (PF, ESI, TDS, PT, LWF, Summary) | ✅ Complete |
| BR-12 | Configure company settings (name, PAN, TAN, GSTIN, PF/ESI numbers, state) | ✅ Complete |
| BR-13 | Dashboard with KPIs, department distribution, recent payroll runs | ✅ Complete |
| BR-14 | Multi-state support (employees in different states have different PT/LWF rules) | ✅ Complete |
| BR-15 | User authentication and role-based access control | ❌ Not Implemented |
| BR-16 | Data export to CSV/PDF | ❌ Not Implemented (buttons exist but are non-functional) |
| BR-17 | Audit trail / change log for payroll modifications | ❌ Not Implemented |
| BR-18 | Email salary slips to employees | ❌ Not Implemented |
| BR-19 | Multi-company / multi-tenant support | ❌ Not Implemented |
| BR-20 | Bank file generation (for NEFT/RTGS salary disbursement) | ❌ Not Implemented |

---

## 3. Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Framework** | Next.js (App Router) | 16.1.1 | Standalone output mode |
| **Language** | TypeScript | 5.x | `noImplicitAny: false`, `ignoreBuildErrors: true` |
| **Runtime** | Bun | latest | Used for dev, build, and start |
| **Frontend** | React | 19.0.0 | All components use `'use client'` |
| **Styling** | Tailwind CSS | 4.x | With `@tailwindcss/postcss` |
| **UI Library** | shadcn/ui (New York) | latest | 47 components, unmodified |
| **Icons** | Lucide React | 0.525.0 | |
| **Animation** | Framer Motion | 12.23.2 | Sidebar, attendance view |
| **State Management** | Zustand | 5.0.6 | Single store (`payroll-store.ts`) |
| **Server State** | TanStack React Query | 5.82.0 | Installed but **NOT used** in codebase |
| **Database** | SQLite (via Prisma) | 6.11.1 | File-based at `db/custom.db` |
| **ORM** | Prisma Client | 6.11.1 | With query logging enabled in dev |
| **Auth** | NextAuth.js | 4.24.11 | **Installed but NOT configured** |
| **Form Handling** | React Hook Form + Zod | 7.60.0 / 4.0.2 | **Installed but NOT used** (forms use raw state) |
| **Charts** | Recharts | 2.15.4 | Dashboard charts |
| **Validation** | Zod | 4.0.2 | Installed but **NOT used** for API input validation |
| **Reverse Proxy** | Caddy | — | Port 81 → localhost:3000, with XTransformPort support |

### Unused Dependencies (Installed but Not Used in Application Code)

| Package | Purpose | Action Needed |
|---------|---------|---------------|
| `next-auth` | Authentication | Configure or remove |
| `next-intl` | Internationalization | Remove |
| `@mdxeditor/editor` | MDX editing | Remove |
| `react-markdown` | Markdown rendering | Remove |
| `react-syntax-highlighter` | Code highlighting | Remove |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | Drag-and-drop | Remove |
| `next-themes` | Dark mode | Remove or implement |
| `@reactuses/core` | React hooks | Remove |
| `uuid` | UUID generation | Remove |
| `@tanstack/react-query` | Server state | Use or remove |
| `react-hook-form` + `@hookform/resolvers` | Form handling | Use or remove |
| `input-otp` | OTP input | Remove |
| `embla-carousel-react` | Carousel | Remove |
| `react-resizable-panels` | Resizable panels | Remove |
| `cmdk` | Command palette | Remove |

---

## 4. Folder Structure

```
/home/z/my-project/
├── Caddyfile                          # Caddy reverse proxy config (port 81)
├── bun.lock                           # Bun lock file
├── components.json                    # shadcn/ui configuration
├── eslint.config.mjs                  # ESLint config (nearly all rules disabled)
├── next.config.ts                     # Next.js config (standalone, ignoreBuildErrors)
├── package.json                       # Dependencies and scripts
├── postcss.config.mjs                 # PostCSS config
├── tailwind.config.ts                 # Tailwind CSS config
├── tsconfig.json                      # TypeScript config
├── prisma/
│   └── schema.prisma                  # Database schema (8 models)
├── db/
│   └── custom.db                      # SQLite database file
├── public/                            # Static assets
├── upload/                            # File upload directory
├── examples/                          # Example code (websocket demo)
├── tool-results/                      # Cached tool results (should be gitignored)
├── worklog.md                         # Development worklog
└── src/
    ├── app/
    │   ├── globals.css                # Global styles with CSS variables
    │   ├── layout.tsx                 # Root layout
    │   ├── page.tsx                   # Entry page (SPA with lazy-loaded views)
    │   └── api/
    │       ├── route.ts               # Health check endpoint
    │       ├── seed/route.ts          # Database seeder (destructive!)
    │       ├── dashboard/route.ts     # Dashboard statistics
    │       ├── employees/
    │       │   ├── route.ts           # Employee list + create
    │       │   └── [id]/route.ts      # Employee get/update/soft-delete
    │       ├── attendance/
    │       │   ├── route.ts           # Attendance CRUD with filters
    │       │   └── punch/route.ts     # Simplified punch in/out
    │       ├── leaves/
    │       │   ├── route.ts           # Leave applications CRUD + types
    │       │   ├── [id]/route.ts      # Leave approve/reject/cancel
    │       │   └── balance/route.ts   # Leave balance query
    │       ├── payroll/
    │       │   ├── route.ts           # Payroll run list + process
    │       │   └── [runId]/route.ts   # Payroll run status transitions
    │       ├── salary-slip/route.ts   # Individual salary slip generation
    │       ├── reports/route.ts       # Statutory compliance reports
    │       └── settings/route.ts      # Company settings get/update
    ├── components/
    │   ├── payroll/                   # Application views (9 files, ~7,000 lines)
    │   │   ├── layout.tsx             # Main layout with animated sidebar
    │   │   ├── top-bar.tsx            # Top navigation bar
    │   │   ├── dashboard-view.tsx     # Dashboard (577 lines)
    │   │   ├── employees-view.tsx     # Employee management (1,424 lines)
    │   │   ├── attendance-view.tsx    # Attendance tracking (1,039 lines)
    │   │   ├── leaves-view.tsx        # Leave management (1,034 lines)
    │   │   ├── payroll-view.tsx       # Payroll processing (657 lines)
    │   │   ├── salary-slip-view.tsx   # Salary slip viewer (580 lines)
    │   │   ├── reports-view.tsx       # Compliance reports (846 lines)
    │   │   └── settings-view.tsx      # Company settings (794 lines)
    │   └── ui/                        # shadcn/ui components (47 files, ~5,600 lines)
    ├── hooks/
    │   ├── use-mobile.ts              # Mobile detection hook
    │   └── use-toast.ts               # Toast notification hook
    ├── lib/
    │   ├── db.ts                      # Prisma client singleton
    │   ├── utils.ts                   # cn() utility
    │   └── payroll/
    │       ├── index.ts               # Re-exports
    │       └── engine.ts              # Indian payroll calculation engine (590 lines)
    └── store/
        └── payroll-store.ts           # Zustand global state
```

### Code Metrics

| Metric | Value |
|--------|-------|
| Total source files (`src/`) | 80 files |
| Total source lines (`src/`) | 13,570 lines |
| Application code (views + layout + top-bar) | ~7,000 lines |
| UI library code (shadcn/ui) | ~5,600 lines |
| API routes (14 route files) | ~2,500 lines |
| Lib/utility code | ~600 lines |
| Store code | ~30 lines |
| Hooks | ~150 lines |
| Largest component | `employees-view.tsx` (1,424 lines) |
| Smallest component | `top-bar.tsx` (98 lines) |

---

## 5. Database Schema

**Engine:** SQLite via Prisma ORM  
**File:** `db/custom.db`  
**Models:** 8

### Entity Relationship Diagram

```
Company (1) ──→ (N) Employee
Company (1) ──→ (N) PayrollRun
Employee (1) ──→ (1) SalaryStructure
Employee (1) ──→ (N) Attendance
Employee (1) ──→ (N) LeaveApplication
Employee (1) ──→ (N) LeaveBalance
Employee (1) ──→ (N) PayrollDetail
LeaveType (1) ──→ (N) LeaveBalance
LeaveType (1) ──→ (N) LeaveApplication
PayrollRun (1) ──→ (N) PayrollDetail
```

### Model Summary

| Model | Purpose | Key Fields | Unique Constraints |
|-------|---------|------------|-------------------|
| `Company` | Organization settings | name, PAN, TAN, GSTIN, PF/ESI numbers, state | PK: id |
| `Employee` | Employee master data | code, personal info, bank details, compliance flags | PK: id, UQ: employeeCode |
| `SalaryStructure` | Monthly salary breakdown | basic, HRA, DA, conveyance, medical, special, OT, bonus | PK: id, UQ: employeeId |
| `Attendance` | Daily attendance records | date, punchIn/Out, face verification, total hours | PK: id, UQ: [employeeId, date], IDX: [employeeId, date] |
| `LeaveType` | Leave type definitions | name, shortCode, totalDays, carryForward rules | PK: id |
| `LeaveBalance` | Annual leave allocation | employeeId, leaveTypeId, year, allocated, used | PK: id, UQ: [employeeId, leaveTypeId, year] |
| `LeaveApplication` | Leave requests | startDate, endDate, totalDays, status, approval | PK: id |
| `PayrollRun` | Monthly payroll batch | month, year, status, totals (gross, deductions, net, statutory) | PK: id, UQ: [companyId, month, year] |
| `PayrollDetail` | Per-employee payroll results | Full earnings/deductions breakdown, CTC | PK: id |

### Schema Issues

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| SCH-01 | Missing indexes | LOW | No indexes on `LeaveApplication.employeeId`, `PayrollDetail.employeeId`, `PayrollDetail.payrollRunId` |
| SCH-02 | No audit fields | MEDIUM | No `createdBy`, `updatedBy` fields — no way to track who made changes |
| SCH-03 | No soft-delete pattern | LOW | Only Employee has soft delete (`dateOfExit`); PayrollRun and LeaveApplication use status fields instead |
| SCH-04 | Float for money | MEDIUM | All salary/monetary fields use `Float` — should use `Decimal` or `Int` (paise) to avoid floating-point rounding errors |

---

## 6. API List

### API Endpoints (14 routes, 28 handlers)

| Method | Endpoint | Purpose | Auth | Validation | Error Handling |
|--------|----------|---------|------|------------|----------------|
| GET | `/api` | Health check | ❌ | N/A | N/A |
| POST | `/api/seed` | Seed demo data (DESTRUCTIVE) | ❌ | None | ✅ try/catch |
| GET | `/api/dashboard` | Dashboard KPIs | ❌ | None | ✅ try/catch |
| GET | `/api/employees` | List employees (search, filter) | ❌ | Partial | ✅ try/catch |
| POST | `/api/employees` | Create employee + salary structure | ❌ | None | ✅ try/catch |
| GET | `/api/employees/[id]` | Get single employee | ❌ | None | ✅ try/catch |
| PUT | `/api/employees/[id]` | Update employee + salary | ❌ | None | ✅ try/catch |
| DELETE | `/api/employees/[id]` | Soft-delete employee | ❌ | None | ✅ try/catch |
| GET | `/api/attendance` | List attendance (filter by employee/month/date) | ❌ | Partial | ✅ try/catch |
| POST | `/api/attendance` | Create/update attendance record | ❌ | Partial | ✅ try/catch |
| POST | `/api/attendance/punch` | Simplified punch in/out | ❌ | Full | ✅ try/catch |
| GET | `/api/leaves` | List leave applications + types | ❌ | None | ❌ **Missing** |
| POST | `/api/leaves` | Create leave application | ❌ | None | ❌ **Missing** |
| GET | `/api/leaves/[id]` | Get single leave application | ❌ | None | ❌ **Missing** |
| PUT | `/api/leaves/[id]` | Approve/reject leave | ❌ | Partial | ❌ **Missing** |
| DELETE | `/api/leaves/[id]` | Cancel leave | ❌ | None | ❌ **Missing** |
| GET | `/api/leaves/balance` | Get leave balances | ❌ | Partial | ❌ **Missing** |
| GET | `/api/payroll` | List payroll runs | ❌ | None | ✅ try/catch |
| POST | `/api/payroll` | Process payroll for month/year | ❌ | Partial | ✅ try/catch |
| GET | `/api/payroll/[runId]` | Get payroll run details | ❌ | None | ✅ try/catch |
| PUT | `/api/payroll/[runId]` | Update payroll run status | ❌ | Partial | ✅ try/catch |
| GET | `/api/salary-slip` | Generate salary slip | ❌ | Partial | ✅ try/catch |
| GET | `/api/reports` | Generate compliance reports | ❌ | Partial | ✅ try/catch |
| GET | `/api/settings` | Get company settings | ❌ | N/A | ✅ try/catch |
| PUT | `/api/settings` | Update company settings | ❌ | Partial | ✅ try/catch |

---

## 7. Environment Variables

| Variable | Value | Status |
|----------|-------|--------|
| `DATABASE_URL` | `file:/home/z/my-project/db/custom.db` | ⚠️ Hardcoded absolute path |

### Missing Environment Files

| File | Status |
|------|--------|
| `.env.local` | ❌ Not present |
| `.env.production` | ❌ Not present |
| `.env.example` | ❌ Not present |
| `.env.test` | ❌ Not present |

### Issues
- **No `.env.example` file** — new developers have no reference for required env vars
- **Hardcoded absolute path** in `DATABASE_URL` — will break in any other environment
- **No environment variable validation** at startup

---

## 8. Feature List (Completed)

### ✅ Fully Implemented

| # | Feature | Description |
|---|---------|-------------|
| F-01 | **Dashboard** | Real-time KPIs (total employees, present today, on leave, monthly payroll), department/state distribution pie charts, recent payroll runs table |
| F-02 | **Employee CRUD** | Full create/read/update/delete with search, department/state filters, salary structure management |
| F-03 | **Salary Structure** | Define Basic, HRA, DA, Conveyance, Medical, Special Allowance, Overtime, Bonus with CTC display |
| F-04 | **Attendance Recording** | Punch in/out with manual, login, and face-recognition methods, date filtering |
| F-05 | **Face Recognition Metadata** | Store face verification status and confidence scores |
| F-06 | **Leave Type Management** | CL, SL, EL, Compensatory Off with configurable annual allocation and carry-forward |
| F-07 | **Leave Application** | Apply, approve, reject, cancel with date range validation |
| F-08 | **Leave Balance Tracking** | Per-employee, per-year, per-type balance with used/remaining display |
| F-09 | **Payroll Processing** | Monthly batch processing with present-day-based pro-ration |
| F-10 | **EPF Calculation** | Employee 12% + Employer 12% (3.67% EPS + 8.33% EPF) on Basic+DA |
| F-11 | **ESI Calculation** | Employee 0.75% + Employer 3.25% on gross (₹21,000/month threshold) |
| F-12 | **TDS Calculation (New Regime)** | FY 2025-26 slabs: 0-4L→0%, 4-8L→5%, 8-12L→10%, 12-16L→15%, 16-20L→20%, 20-24L→25%, >24L→30%, standard deduction ₹75,000, rebate u/s 87A up to ₹12L |
| F-13 | **TDS Calculation (Old Regime)** | FY 2025-26 slabs with §80C/80D deductions, HRA exemption, standard deduction ₹50,000 |
| F-14 | **Professional Tax** | State-wise slab-based calculation for 13+ Indian states (MH, KA, TN, GJ, etc.) |
| F-15 | **Labour Welfare Fund** | Monthly deduction for 12+ states with employee/employer split |
| F-16 | **Salary Slip Generation** | Detailed per-employee slip with print layout and print-specific CSS |
| F-17 | **Compliance Reports** | Summary, PF, ESI, TDS, PT, LWF reports for any month/year |
| F-18 | **Company Settings** | Configure name, PAN, TAN, GSTIN, PF/ESI numbers, state, financial year |
| F-19 | **Seed Data** | One-click demo data: 1 company, 6 employees across 3 states, 4 leave types |
| F-20 | **Responsive Sidebar** | Animated collapsible sidebar with mobile hamburger overlay |
| F-21 | **Lazy Loading** | All 8 views are React.lazy-loaded with Suspense fallback |
| F-22 | **View Refresh** | Global refresh mechanism via Zustand `refreshKey` |

---

## 9. Pending Features

| # | Feature | Priority | Effort | Description |
|---|---------|----------|--------|-------------|
| PF-01 | **Authentication & Authorization** | CRITICAL | Large | Implement NextAuth.js v5 (or remove v4 dep), add login page, role-based access (Admin, HR, Manager, Employee) |
| PF-02 | **API Input Validation** | CRITICAL | Medium | Add Zod schemas for all API route inputs — currently most routes accept unvalidated JSON |
| PF-03 | **Data Export (CSV/PDF)** | HIGH | Medium | Implement actual export logic for reports and salary slips (buttons exist but are stubs) |
| PF-04 | **Bank File Generation** | HIGH | Medium | Generate NEFT/RTGS bank upload files from processed payroll |
| PF-05 | **Email Salary Slips** | HIGH | Medium | Send salary slips via email after payroll processing |
| PF-06 | **Error Handling for Leave APIs** | HIGH | Small | Add try/catch to 3 leave routes that lack error handling |
| PF-07 | **Dark Mode** | MEDIUM | Medium | `next-themes` is installed but not implemented |
| PF-08 | **Audit Trail** | MEDIUM | Large | Log all create/update/delete operations with user, timestamp, and changes |
| PF-09 | **Payroll Locking** | MEDIUM | Small | Prevent re-processing of paid payroll runs (currently possible) |
| PF-10 | **Overtime Calculation** | MEDIUM | Small | Auto-calculate overtime based on attendance hours > 8/day |
| PF-11 | **Half-Day / Leave Integration** | MEDIUM | Small | Link half-day attendance to leave balance auto-deduction |
| PF-12 | **Arrear Processing** | MEDIUM | Large | Handle retroactive salary adjustments |
| PF-13 | **Loan & Advance Deductions** | MEDIUM | Large | Track and deduct employee loans/advances from salary |
| PF-14 | **Investment Declarations (80C/80D)** | MEDIUM | Medium | Allow employees to declare tax-saving investments |
| PF-15 | **Form 16 Generation** | MEDIUM | Large | Auto-generate annual Form 16 for TDS filing |
| PF-16 | **Multi-Company Support** | LOW | Large | Current schema supports it but UI/APIs are hardcoded to first company |
| PF-17 | **Mobile-Optimized Views** | LOW | Medium | Sidebar collapses but inner views are not optimized for small screens |
| PF-18 | **Notification System** | LOW | Medium | In-app notifications for leave approvals, payroll processing, etc. |
| PF-19 | **Data Import (CSV/Excel)** | LOW | Medium | Bulk employee/salary import |
| PF-20 | **Full-Text Search** | LOW | Small | SQLite FTS for employee search |

---

## 10. Known Issues

| # | Issue | Severity | Component | Description |
|---|-------|----------|-----------|-------------|
| KI-01 | TypeScript compilation errors | HIGH | API routes | 4 TS errors: `employeeId_date` composite unique key not recognized by generated Prisma types |
| KI-02 | Missing error handling | HIGH | Leave APIs | 3 leave API routes (6 handlers) have zero try/catch — unhandled DB errors cause raw 500 responses |
| KI-03 | No authentication | CRITICAL | All APIs | All 14 API routes are completely unprotected — anyone can access/modify all data |
| KI-04 | Destructive seed endpoint | HIGH | `/api/seed` | POST `/api/seed` wipes ALL data with no confirmation or auth |
| KI-05 | Float precision for money | MEDIUM | Schema + Engine | All salary calculations use JavaScript `Float` — potential rounding errors (e.g., `0.1 + 0.2 !== 0.3`) |
| KI-06 | Non-functional export buttons | MEDIUM | Reports view | "Export" buttons in compliance reports are UI stubs with no backend logic |
| KI-07 | Duplicate constants | LOW | Views | Indian states, departments, and tax slabs are duplicated across 3+ component files |
| KI-08 | `dangerouslySetInnerHTML` | LOW | Salary slip | Print-specific CSS injected via `dangerouslySetInnerHTML` — XSS risk if any user content were included (currently safe) |
| KI-09 | No rate limiting | MEDIUM | All APIs | No rate limiting on any endpoint — vulnerable to brute force and DoS |
| KI-10 | Prisma query logging in dev | LOW | `db.ts` | `log: ['query']` logs every SQL query — should be disabled or conditional |
| KI-11 | Hardcoded DB path | MEDIUM | `.env` | `DATABASE_URL=file:/home/z/my-project/db/custom.db` uses absolute path |
| KI-12 | `tool-results/` in repo | LOW | Repository | 33+ cached tool result files should be in `.gitignore` |
| KI-13 | `examples/` in repo | LOW | Repository | Example websocket code should be in `.gitignore` or a separate repo |

---

## 11. Build Errors

| # | Error | File | Line | Severity | Fix |
|---|-------|------|------|----------|-----|
| BE-01 | TS2561: `employeeId_date` not in `AttendanceWhereUniqueInput` | `src/app/api/attendance/punch/route.ts` | 70 | HIGH | Regenerate Prisma client: `bun run db:generate`, or use `findFirst` + `create`/`update` pattern |
| BE-02 | TS2561: `employeeId_date` not in `AttendanceWhereUniqueInput` | `src/app/api/attendance/punch/route.ts` | 113 | HIGH | Same as BE-01 |
| BE-03 | TS2561: `employeeId_date` not in `AttendanceWhereUniqueInput` | `src/app/api/attendance/route.ts` | 156 | HIGH | Same as BE-01 |
| BE-04 | TS2561: `employeeId_date` not in `AttendanceWhereUniqueInput` | `src/app/api/attendance/route.ts` | 212 | HIGH | Same as BE-01 |

> **Note:** `next.config.ts` has `ignoreBuildErrors: true`, so `next build` succeeds despite these errors. However, they represent real type safety issues that should be resolved.

---

## 12. Runtime Errors

| # | Error | Context | Severity | Status |
|---|-------|---------|----------|--------|
| RE-01 | `EADDRINUSE: address already in use :::3000` | Dev server startup (from previous session) | LOW | Resolved (server restarted) |
| RE-02 | None currently | Dev log shows clean 200 responses for all routes | — | ✅ Clean |

**Dev server log analysis (last 157 lines):**
- All HTTP responses return `200`
- No stack traces
- No unhandled exceptions
- Only Prisma query logs and Next.js route compilation logs

---

## 13. Security Issues

| # | Issue | Severity | OWASP Category | Description |
|---|-------|----------|----------------|-------------|
| SEC-01 | **No Authentication** | CRITICAL | A01:2021 — Broken Access Control | All 28 API handlers are publicly accessible. No login, no session, no tokens. |
| SEC-02 | **No Authorization** | CRITICAL | A01:2021 — Broken Access Control | No role-based access. Any user can process payroll, delete employees, modify settings. |
| SEC-03 | **Destructive Unprotected Endpoint** | HIGH | A01:2021 — Broken Access Control | `POST /api/seed` wipes all database data. No auth, no confirmation. |
| SEC-04 | **No Input Validation** | HIGH | A03:2021 — Injection | Most API routes accept raw JSON without Zod/schema validation. Vulnerable to malformed data. |
| SEC-05 | **No Rate Limiting** | MEDIUM | A04:2021 — Insecure Design | No request throttling. Vulnerable to brute force and denial-of-service attacks. |
| SEC-06 | **No CSRF Protection** | MEDIUM | A05:2021 — Security Misconfiguration | No CSRF tokens on state-changing requests (POST/PUT/DELETE). |
| SEC-07 | **Prisma Query Logging** | LOW | A09:2021 — Security Logging Failures | `log: ['query']` in dev mode logs all SQL — could leak PII if logs are exposed. |
| SEC-08 | **next-auth v4 EOL** | MEDIUM | A06:2021 — Vulnerable Components | `next-auth@4.24.11` is end-of-life. Should migrate to Auth.js v5. |
| SEC-09 | **No CORS Configuration** | LOW | A05:2021 — Security Misconfiguration | No explicit CORS headers. Next.js defaults may be too permissive. |
| SEC-10 | **No Helmet/Security Headers** | LOW | A05:2021 — Security Misconfiguration | No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` headers. |
| SEC-11 | **SQLite in Production** | MEDIUM | — | SQLite is file-based and not suitable for concurrent production workloads. Should use PostgreSQL/MySQL. |
| SEC-12 | **No Environment Variable Validation** | LOW | A05:2021 — Security Misconfiguration | No validation that required env vars are set at startup. |

---

## 14. Performance Issues

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| PER-01 | N+1 queries in payroll processing | MEDIUM | `POST /api/payroll` iterates employees sequentially — each triggers 3-4 DB queries. For 100+ employees, this is slow. |
| PER-02 | No pagination | MEDIUM | Employee list, attendance records, and leave applications load ALL records — no server-side pagination. |
| PER-03 | No caching | LOW | Dashboard data is fetched fresh on every navigation. No SWR/React Query caching despite `@tanstack/react-query` being installed. |
| PER-04 | Large component bundles | LOW | `employees-view.tsx` is 1,424 lines — should be split into smaller components. |
| PER-05 | Recharts bundle size | LOW | Recharts (~200KB) is imported for 2 simple pie charts. Could use lighter alternatives. |
| PER-06 | No image optimization | LOW | No `next/image` usage (it's disabled in ESLint). If employee photos are added, this matters. |
| PER-07 | SQLite write contention | MEDIUM | SQLite only allows one writer at a time. Concurrent payroll processing will fail. |

---

## 15. Unit Test Coverage

| Metric | Value |
|--------|-------|
| **Test files** | 0 |
| **Test cases** | 0 |
| **Coverage** | **0%** |
| **Test framework** | Not configured (no Jest/Vitest/Playwright) |

### Critical Untested Code

| Component | Risk | Why It Matters |
|-----------|------|----------------|
| `src/lib/payroll/engine.ts` | CRITICAL | 590 lines of complex statutory calculations — a single bug means incorrect employee pay or compliance violations |
| `src/app/api/payroll/route.ts` | HIGH | Payroll processing logic with DB transactions |
| `src/app/api/attendance/route.ts` | MEDIUM | Complex date filtering and upsert logic |
| `src/app/api/leaves/[id]/route.ts` | MEDIUM | Transaction-based leave approval with balance updates |

---

## 16. Integration Test Coverage

| Metric | Value |
|--------|-------|
| **Integration test files** | 0 |
| **E2E test files** | 0 |
| **API test files** | 0 |
| **Coverage** | **0%** |

### Missing Integration Tests

| Flow | Priority |
|------|----------|
| Employee CRUD (create → read → update → soft-delete) | HIGH |
| Attendance punch in → punch out → verify hours | HIGH |
| Leave apply → approve → verify balance deduction | HIGH |
| Payroll process → verify all statutory calculations | CRITICAL |
| Salary slip generation for processed payroll | HIGH |
| Compliance report generation | MEDIUM |

---

## 17. Missing Validations

| # | Location | Missing Validation | Risk |
|---|----------|-------------------|------|
| V-01 | `POST /api/employees` | No Zod schema — no email format, PAN format, phone format, required field checks | HIGH |
| V-02 | `PUT /api/employees/[id]` | Same as V-01 — update payload is unvalidated | HIGH |
| V-03 | `POST /api/leaves` | No validation that startDate ≤ endDate, no overlap check with existing leaves | MEDIUM |
| V-04 | `POST /api/attendance` | No validation of date format beyond basic isNaN check | LOW |
| V-05 | `POST /api/payroll` | No validation that month is 1-12, year is reasonable | LOW |
| V-06 | `PUT /api/settings` | No PAN/TAN/GSTIN format validation | LOW |
| V-07 | `POST /api/employees` | No duplicate email/phone check | MEDIUM |
| V-08 | `POST /api/leaves` | No check if employee has sufficient leave balance before creating application | MEDIUM |
| V-09 | All views | No client-side form validation — forms rely on HTML5 `required` only | MEDIUM |
| V-10 | `POST /api/attendance/punch` | No check if employee is active (not exited) before allowing punch | MEDIUM |

---

## 18. Missing APIs

| # | Endpoint | Purpose | Priority |
|---|----------|---------|----------|
| A-01 | `POST /api/auth/login` | User authentication | CRITICAL |
| A-02 | `POST /api/auth/logout` | User logout | CRITICAL |
| A-03 | `GET /api/auth/session` | Get current session | CRITICAL |
| A-04 | `POST /api/employees/bulk` | Bulk employee import | MEDIUM |
| A-05 | `GET /api/employees/[id]/history` | Employee salary/position change history | MEDIUM |
| A-06 | `POST /api/payroll/[runId]/lock` | Lock payroll run from further changes | HIGH |
| A-07 | `POST /api/salary-slip/bulk-email` | Email salary slips to all employees | HIGH |
| A-08 | `GET /api/reports/export?format=csv\|pdf` | Export reports as files | HIGH |
| A-09 | `GET /api/audit-log` | View system audit trail | MEDIUM |
| A-10 | `POST /api/attendance/face-register` | Register employee face for recognition | MEDIUM |
| A-11 | `GET /api/statements/annual` | Generate annual income statements | MEDIUM |
| A-12 | `POST /api/investments` | Employee investment declarations (80C/80D) | MEDIUM |

---

## 19. UI Issues

| # | Issue | Component | Severity | Description |
|---|-------|-----------|----------|-------------|
| UI-01 | No loading states for API calls | All views | MEDIUM | Some views show raw empty states during data fetch instead of skeletons |
| UI-02 | No empty state illustrations | Dashboard, Reports | LOW | Empty states show plain text — should have illustrations or CTAs |
| UI-03 | No confirmation dialogs for destructive actions | Employees (delete) | HIGH | Employee soft-delete has no confirmation dialog |
| UI-04 | No form error display | All forms | MEDIUM | API errors are shown via `alert()` or `console.error()` instead of inline validation messages |
| UI-05 | Hardcoded fiscal year in sidebar | Layout | LOW | "FY 2025-26" is hardcoded — should derive from settings |
| UI-06 | No breadcrumb navigation | All views | LOW | Users can't see their navigation path |
| UI-07 | Salary slip print layout issues | Salary slip | LOW | Uses `dangerouslySetInnerHTML` for print CSS — fragile |
| UI-08 | No data table sorting | Employees, Attendance, Leaves | MEDIUM | Tables display data but have no column sort capability |
| UI-09 | No data table pagination | Employees, Attendance, Leaves | MEDIUM | All records loaded at once — no pagination controls |
| UI-10 | Console errors in leaves view | Leaves | LOW | 7 `console.error` calls instead of user-facing toast notifications |
| UI-11 | No success toasts on CRUD operations | All views | MEDIUM | Successful operations (create, update, delete) don't show confirmation toasts |

---

## 20. Mobile Responsiveness Issues

| # | Issue | Component | Severity | Description |
|---|-------|-----------|----------|-------------|
| MOB-01 | Employee table horizontal scroll | Employees | MEDIUM | 9-column table requires horizontal scroll on mobile — no card-view alternative |
| MOB-02 | Payroll results table | Payroll | MEDIUM | Wide table with 15+ columns not optimized for mobile |
| MOB-03 | Salary slip layout | Salary slip | LOW | Print-optimized layout doesn't adapt well to mobile screens |
| MOB-04 | Report tables | Reports | MEDIUM | Compliance report tables are too wide for mobile |
| MOB-05 | Dialog forms | All | LOW | Dialogs are full-width but inner forms may overflow on small screens |
| MOB-06 | No mobile-specific navigation | All | LOW | Sidebar collapses but there's no bottom tab bar for mobile |

---

## 21. Deployment Configuration

### Current Setup
- **Runtime:** Bun (process manager: `nohup`)
- **Reverse Proxy:** Caddy (port 81)
- **Output Mode:** Next.js standalone
- **Database:** SQLite file at `db/custom.db`

### Production Build Command
```bash
bun run build
# Post-build: copies static/, public/, db/ into .next/standalone/
# Also runs sed to replace hardcoded DB path
```

### Production Start Command
```bash
NODE_ENV=production bun .next/standalone/server.js
```

### Issues
| # | Issue | Severity |
|---|-------|----------|
| DEP-01 | No process manager (PM2, systemd) — `nohup` is not production-grade | HIGH |
| DEP-02 | No health check endpoint monitoring | MEDIUM |
| DEP-03 | No log rotation configured | MEDIUM |
| DEP-04 | Hardcoded DB path requires `sed` in build script | MEDIUM |
| DEP-05 | No graceful shutdown handling | LOW |

---

## 22. Docker Configuration

| Item | Status |
|------|--------|
| `Dockerfile` | ❌ **NOT PRESENT** |
| `docker-compose.yml` | ❌ **NOT PRESENT** |
| `.dockerignore` | ❌ **NOT PRESENT** |
| Multi-stage build | ❌ Not configured |
| Container health check | ❌ Not configured |

---

## 23. CI/CD Configuration

| Item | Status |
|------|--------|
| GitHub Actions | ❌ **NOT PRESENT** |
| Any CI pipeline | ❌ **NOT PRESENT** |
| Automated testing | ❌ **NOT PRESENT** |
| Automated linting | ⚠️ Configured but all rules disabled |
| Automated deployment | ❌ **NOT PRESENT** |
| Branch protection rules | ❌ **NOT PRESENT** |
| Pre-commit hooks | ❌ **NOT PRESENT** |

---

## 24. Database Migrations

| Item | Status |
|------|--------|
| Migration files | ❌ **NONE** — uses `prisma db push` (schema-only, no migration history) |
| Migration directory | ❌ Not configured |
| Rollback capability | ❌ Not possible without migration files |
| Data seeding in migrations | ❌ Handled by separate `/api/seed` endpoint |
| Schema diff tracking | ❌ No tracking of schema changes over time |

**Risk:** Using `prisma db push` in development is fine, but without migration files, there's no way to safely evolve the schema in production with existing data.

---

## 25. Production Readiness Score

### Scoring Criteria (each 0–10, weighted)

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| **Functionality** | 20% | 8/10 | 1.60 |
| **Security** | 20% | 1/10 | 0.20 |
| **Reliability** | 15% | 4/10 | 0.60 |
| **Performance** | 10% | 5/10 | 0.50 |
| **Test Coverage** | 15% | 0/10 | 0.00 |
| **Code Quality** | 10% | 5/10 | 0.50 |
| **Deployment** | 5% | 2/10 | 0.10 |
| **Documentation** | 5% | 3/10 | 0.15 |

### **Overall Score: 37 / 100**

### Grade: **D+ (Prototype Stage)**

### Interpretation
- **37–50: Alpha/Prototype** — Core features work but missing critical production requirements (auth, tests, deployment)
- The application demonstrates a **strong feature set** for an MVP/prototype
- **Critical gaps** in security (no auth), quality (0% test coverage), and deployment (no Docker/CI/CD) prevent production use
- The payroll calculation engine is the strongest component — comprehensive Indian statutory compliance
- With ~2–3 weeks of focused work on security, testing, and deployment, this could reach a **B grade (70+)**

---

## 26. Complete TODO List

### 🔴 Critical (Must Fix Before Any Deployment)

- [ ] SEC-01: Implement authentication (login/logout/session)
- [ ] SEC-02: Implement role-based authorization (Admin/HR/Manager/Employee)
- [ ] SEC-03: Protect `/api/seed` endpoint with auth
- [ ] V-01/V-02: Add Zod validation schemas for all employee API inputs
- [ ] KI-02: Add try/catch error handling to 3 leave API routes
- [ ] BE-01–04: Fix `employeeId_date` TypeScript errors (regenerate Prisma client or refactor)
- [ ] Create `.env.example` file with all required variables

### 🟡 High Priority (Fix Before Production)

- [ ] SEC-04: Add Zod validation to ALL API route inputs
- [ ] SEC-05: Add rate limiting to API routes
- [ ] PF-06: Implement data export (CSV/PDF) for reports
- [ ] PF-04: Implement bank file generation (NEFT/RTGS)
- [ ] PF-05: Implement email salary slip delivery
- [ ] UI-03: Add confirmation dialogs for destructive actions
- [ ] UI-08/09: Add table sorting and pagination
- [ ] KI-05: Migrate monetary fields from Float to Decimal/Int
- [ ] SCH-02: Add audit trail fields to schema
- [ ] PER-01: Optimize payroll processing (batch queries)
- [ ] PER-02: Add server-side pagination to all list endpoints
- [ ] Write unit tests for payroll engine (CRITICAL — financial calculations)
- [ ] Write integration tests for core API flows
- [ ] Set up Vitest/Jest testing framework
- [ ] SEC-11: Migrate from SQLite to PostgreSQL for production

### 🟢 Medium Priority (Fix Before Scaling)

- [ ] PF-07: Implement dark mode
- [ ] PF-08: Implement audit trail logging
- [ ] PF-09: Add payroll run locking
- [ ] PF-10: Implement overtime auto-calculation
- [ ] PF-11: Link half-day attendance to leave deduction
- [ ] PF-14: Add investment declaration forms (80C/80D)
- [ ] PER-03: Implement React Query caching for dashboard data
- [ ] MOB-01–04: Optimize tables for mobile (card views)
- [ ] KI-07: Extract shared constants to a single constants file
- [ ] KI-09: Add security headers (CSP, X-Frame-Options, etc.)
- [ ] UI-01: Add skeleton loading states to all views
- [ ] UI-04/11: Replace alert()/console.error with toast notifications
- [ ] Remove unused dependencies (14 packages identified)
- [ ] Enable proper ESLint rules (currently all disabled)

### ⚪ Low Priority (Nice to Have)

- [ ] PF-12: Arrear processing
- [ ] PF-13: Loan/advance tracking
- [ ] PF-15: Form 16 generation
- [ ] PF-16: Multi-company UI support
- [ ] PF-18: In-app notification system
- [ ] PF-19: Bulk data import (CSV/Excel)
- [ ] PF-20: SQLite full-text search
- [ ] MOB-06: Mobile bottom tab navigation
- [ ] UI-02: Empty state illustrations
- [ ] UI-06: Breadcrumb navigation
- [ ] Create Dockerfile and docker-compose.yml
- [ ] Set up GitHub Actions CI/CD pipeline
- [ ] Set up pre-commit hooks (lint, format, type-check)
- [ ] Add `.gitignore` entries for `tool-results/`, `examples/`
- [ ] Migrate `next-auth` from v4 to v5 (Auth.js)
- [ ] Add `prisma migrate` instead of `db push`
- [ ] KI-10: Make Prisma query logging conditional on env
- [ ] SEC-08: Add CSRF protection

---

*Generated by Z.ai Code — Automated Project Audit*
*This audit covers 13,570 lines of source code across 80 files.*
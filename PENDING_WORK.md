# PayrollPro — Pending Work & Roadmap

> **Last Updated:** July 2025  
> **Version:** 0.2.0  
> **Current Status:** Prototype / MVP (Production Readiness: 37/100)

---

## Priority Legend

- 🔴 **CRITICAL** — Must fix before any deployment (security, data integrity)
- 🟡 **HIGH** — Must fix before production release
- 🟢 **MEDIUM** — Should fix before scaling to more users
- ⚪ **LOW** — Nice to have, can defer

---

## Phase 1: Security & Stability (Week 1–2)

> **Goal:** Make the application safe to deploy to a staging environment

### 🔴 CRITICAL

#### SEC-01: Implement Authentication
- [ ] Install and configure Auth.js v5 (or remove unused next-auth v4)
- [ ] Create login page with email/password
- [ ] Add session management
- [ ] Protect all API routes with session check
- [ ] Add session expiry and refresh logic
- [ ] **Effort:** 2–3 days
- [ ] **Files to create/modify:**
  - `src/app/api/auth/[...nextauth]/route.ts` (new)
  - `src/lib/auth.ts` (new)
  - `src/middleware.ts` (new)
  - `src/app/login/page.tsx` (new, but needs alternative routing since only `/` is allowed — use modal/dialog approach)
  - All 14 API route files (add session check)

#### SEC-02: Implement Role-Based Authorization
- [ ] Define roles: Admin, HR, Manager, Employee
- [ ] Add role field to database (new model or extend Company)
- [ ] Create middleware/helper to check permissions
- [ ] Apply role checks to API routes:
  - Admin: full access to all endpoints
  - HR: employee CRUD, leave approval, payroll processing
  - Manager: view reports, approve team leaves
  - Employee: view own salary slip, apply for leave, punch attendance
- [ ] **Effort:** 2–3 days

#### SEC-03: Protect Destructive Endpoints
- [ ] Add auth check to `POST /api/seed`
- [ ] Add admin-only restriction to seed endpoint
- [ ] Add confirmation flow (double-submit prevention)
- [ ] **Effort:** 0.5 days

#### V-01/V-02: Add API Input Validation (Zod)
- [ ] Create Zod schemas for Employee create/update
- [ ] Create Zod schemas for Leave application
- [ ] Create Zod schemas for Attendance punch
- [ ] Create Zod schemas for Payroll processing
- [ ] Create Zod schemas for Settings
- [ ] Apply schemas as middleware in API routes
- [ ] **Effort:** 2 days
- [ ] **Files to create:**
  - `src/lib/validations/employee.ts` (new)
  - `src/lib/validations/leave.ts` (new)
  - `src/lib/validations/attendance.ts` (new)
  - `src/lib/validations/payroll.ts` (new)
  - `src/lib/validations/settings.ts` (new)

#### KI-02: Fix Missing Error Handling in Leave APIs
- [ ] Add try/catch to `GET/POST /api/leaves`
- [ ] Add try/catch to `GET/PUT/DELETE /api/leaves/[id]`
- [ ] Add try/catch to `GET /api/leaves/balance`
- [ ] Return consistent error responses (JSON with `error` field)
- [ ] **Effort:** 1 hour
- [ ] **Files to modify:**
  - `src/app/api/leaves/route.ts`
  - `src/app/api/leaves/[id]/route.ts`
  - `src/app/api/leaves/balance/route.ts`

#### BE-01–04: Fix TypeScript Compilation Errors
- [ ] Run `bun run db:generate` to regenerate Prisma client types
- [ ] If issue persists, refactor `employeeId_date` composite unique lookups to use `findFirst` + `create`/`update` pattern
- [ ] Verify `npx tsc --noEmit` passes with 0 errors
- [ ] Remove `ignoreBuildErrors: true` from `next.config.ts`
- [ ] **Effort:** 1–2 hours
- [ ] **Files to modify:**
  - `src/app/api/attendance/punch/route.ts`
  - `src/app/api/attendance/route.ts`
  - `next.config.ts`

#### ENV-01: Environment Variable Setup
- [ ] Create `.env.example` with all required variables
- [ ] Create `.env.local` for local development
- [ ] Change `DATABASE_URL` to relative path: `file:./db/custom.db`
- [ ] Add environment variable validation at startup
- [ ] **Effort:** 0.5 days

---

## Phase 2: Quality & Testing (Week 2–3)

> **Goal:** Achieve test coverage >60% for business-critical code

### 🟡 HIGH

#### TEST-01: Set Up Testing Framework
- [ ] Install Vitest + @testing-library/react + @testing-library/jest-dom
- [ ] Configure Vitest with Next.js path aliases
- [ ] Set up test database (separate SQLite file)
- [ ] Create test utilities (factory functions, DB helpers)
- [ ] **Effort:** 1 day

#### TEST-02: Payroll Engine Unit Tests (CRITICAL)
- [ ] Test EPF calculation (normal, ceiling, edge cases)
- [ ] Test ESI calculation (normal, ceiling, zero)
- [ ] Test TDS New Regime (each slab, standard deduction, 87A rebate)
- [ ] Test TDS Old Regime (each slab, 80C, 80D, HRA exemption)
- [ ] Test Professional Tax for each state
- [ ] Test LWF for each state
- [ ] Test net salary calculation
- [ ] Test CTC calculation
- [ ] Test edge cases: zero salary, max ceiling, negative deductions
- [ ] **Target:** 30+ test cases
- [ ] **Effort:** 2–3 days
- [ ] **File to create:** `src/lib/payroll/__tests__/engine.test.ts`

#### TEST-03: API Integration Tests
- [ ] Employee CRUD flow (create → get → update → soft-delete)
- [ ] Attendance punch in → punch out → verify hours
- [ ] Leave apply → approve → verify balance deduction
- [ ] Leave reject → verify no balance change
- [ ] Payroll process → verify all calculations stored correctly
- [ ] Salary slip generation for processed payroll
- [ ] Salary slip generation for unprocessed month (on-the-fly)
- [ ] Dashboard API returns expected shape
- [ ] Settings get/update cycle
- [ ] **Target:** 20+ test cases
- [ ] **Effort:** 2–3 days
- [ ] **Files to create:** `src/app/api/__tests__/` directory

#### TEST-04: Component Tests
- [ ] Dashboard renders without crashing
- [ ] Employee list displays data
- [ ] Employee create dialog opens and submits
- [ ] Navigation between views works
- [ ] **Effort:** 1–2 days

---

## Phase 3: Core Features (Week 3–4)

> **Goal:** Complete the minimum viable feature set for production use

### 🟡 HIGH

#### PF-03: Data Export (CSV/PDF)
- [ ] Install CSV generation library (papaparse or json2csv)
- [ ] Create export utility for CSV format
- [ ] Implement PDF generation (using browser print or server-side)
- [ ] Add export endpoints:
  - `GET /api/reports/export?format=csv&type=pf&month=7&year=2025`
  - `GET /api/reports/export?format=pdf&type=summary&month=7&year=2025`
- [ ] Wire up existing export buttons in Reports view
- [ ] **Effort:** 2 days

#### PF-04: Bank File Generation
- [ ] Define NEFT/RTGS file format (bank-specific templates)
- [ ] Create bank file generation utility
- [ ] Add endpoint: `POST /api/payroll/[runId]/bank-file`
- [ ] Support common formats: SBI, HDFC, ICICI
- [ ] **Effort:** 2 days

#### PF-05: Email Salary Slips
- [ ] Install email library (nodemailer or Resend)
- [ ] Create email template for salary slip
- [ ] Add endpoint: `POST /api/salary-slip/bulk-email`
- [ ] Add individual email endpoint: `POST /api/salary-slip/email`
- [ ] Add email configuration to Settings
- [ ] **Effort:** 2 days

#### UI-03: Confirmation Dialogs
- [ ] Add confirmation dialog for employee soft-delete
- [ ] Add confirmation dialog for leave rejection
- [ ] Add confirmation dialog for payroll re-processing
- [ ] Add confirmation dialog for seed data (destructive)
- [ ] **Effort:** 0.5 days

#### UI-08/09: Table Sorting & Pagination
- [ ] Add column sort to Employee table
- [ ] Add column sort to Attendance table
- [ ] Add column sort to Leave table
- [ ] Add server-side pagination (limit/offset) to list APIs
- [ ] Add pagination controls to table footers
- [ ] **Effort:** 2 days

#### PF-09: Payroll Run Locking
- [ ] Prevent re-processing of "paid" payroll runs
- [ ] Add lock check in `POST /api/payroll`
- [ ] Show locked status in UI (disable process button)
- [ ] **Effort:** 0.5 days

---

## Phase 4: Polish & Optimization (Week 4–5)

> **Goal:** Improve UX, performance, and code quality

### 🟢 MEDIUM

#### PF-07: Dark Mode
- [ ] Implement theme toggle using `next-themes` (already installed)
- [ ] Add CSS variables for dark theme
- [ ] Add theme toggle button to TopBar or Settings
- [ ] Persist theme preference
- [ ] **Effort:** 1 day

#### PF-08: Audit Trail
- [ ] Add `AuditLog` model to Prisma schema
- [ ] Create audit logging middleware/utility
- [ ] Log all create/update/delete operations
- [ ] Add audit log viewer in Settings
- [ ] **Effort:** 2 days

#### PF-10: Overtime Auto-Calculation
- [ ] Calculate overtime when attendance hours > 8/day
- [ ] Add overtime rate configuration (1.5x, 2x)
- [ ] Include overtime in payroll processing
- [ ] **Effort:** 1 day

#### PF-11: Half-Day ↔ Leave Integration
- [ ] Auto-deduct 0.5 day from leave balance on half-day attendance
- [ ] Add setting to enable/disable auto-deduction
- [ ] Show linkage in leave balance view
- [ ] **Effort:** 1 day

#### PER-01: Optimize Payroll Processing
- [ ] Batch DB queries instead of sequential per-employee queries
- [ ] Use `Promise.all` for independent queries
- [ ] Consider database transaction for entire payroll run
- [ ] **Effort:** 1 day

#### PER-02: Server-Side Pagination
- [ ] Add `page` and `limit` query params to list endpoints
- [ ] Return total count for pagination controls
- [ ] Update frontend to use paginated API
- [ ] **Effort:** 1 day

#### KI-07: Extract Shared Constants
- [ ] Create `src/lib/constants/indian-states.ts`
- [ ] Create `src/lib/constants/departments.ts`
- [ ] Create `src/lib/constants/tax-slabs.ts`
- [ ] Create `src/lib/constants/leave-types.ts`
- [ ] Replace all duplicated constants in view components
- [ ] **Effort:** 0.5 days

#### UI-01: Skeleton Loading States
- [ ] Add skeleton loaders to Dashboard
- [ ] Add skeleton loaders to Employee list
- [ ] Add skeleton loaders to Payroll results
- [ ] **Effort:** 1 day

#### UI-04/11: Toast Notifications
- [ ] Replace `alert()` with toast notifications (sonner is installed)
- [ ] Add success toasts for: employee created/updated/deleted, leave applied/approved/rejected, payroll processed
- [ ] Add error toasts for: API failures, validation errors
- [ ] Remove `console.error` from component code
- [ ] **Effort:** 1 day

#### MOB-01–04: Mobile Table Optimization
- [ ] Add card-view alternative for mobile tables
- [ ] Use responsive breakpoints to switch table/card views
- [ ] Optimize salary slip layout for mobile
- [ ] Optimize report tables for mobile
- [ ] **Effort:** 2 days

#### Remove Unused Dependencies
- [ ] Remove 14+ unused packages from `package.json`
- [ ] Run `bun install` after removal
- [ ] Verify no breakage
- [ ] **Effort:** 0.5 days
- [ ] **Packages to remove:** `next-intl`, `@mdxeditor/editor`, `react-markdown`, `react-syntax-highlighter`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@reactuses/core`, `uuid`, `input-otp`, `embla-carousel-react`, `react-resizable-panels`, `cmdk`

---

## Phase 5: Advanced Features (Week 5+)

> **Goal:** Differentiate from competitors and support scaling

### ⚪ LOW

#### PF-12: Arrear Processing
- [ ] Track salary arrears from past periods
- [ ] Include arrears in current month's payroll
- [ ] Show arrears separately on salary slip
- [ ] **Effort:** 3 days

#### PF-13: Loan & Advance Tracking
- [ ] Add `EmployeeLoan` model (amount, EMI, start date, status)
- [ ] Track monthly EMI deductions in payroll
- [ ] Show loan summary in employee view
- [ ] **Effort:** 3 days

#### PF-14: Investment Declarations (80C/80D)
- [ ] Add `InvestmentDeclaration` model
- [ ] Create declaration form in Employee/Settings view
- [ ] Use declared amounts in Old Regime TDS calculation
- [ ] **Effort:** 2 days

#### PF-15: Form 16 Generation
- [ ] Create Form 16 PDF template
- [ ] Auto-populate from payroll data
- [ ] Generate annually or on-demand
- [ ] **Effort:** 3 days

#### PF-16: Multi-Company UI
- [ ] Add company switcher in sidebar or settings
- [ ] Filter all API queries by selected company
- [ ] Update seed data to support multiple companies
- [ ] **Effort:** 2 days

#### PF-18: Notification System
- [ ] Add in-app notification bell
- [ ] Generate notifications for: leave approval, payroll processing, salary slip ready
- [ ] Mark as read/unread
- [ ] **Effort:** 2 days

#### PF-19: Bulk Data Import
- [ ] Create CSV/Excel upload component
- [ ] Parse and validate uploaded data
- [ ] Bulk insert employees and salary structures
- [ ] **Effort:** 2 days

---

## Phase 6: DevOps & Deployment (Week 5–6)

> **Goal:** Production-ready deployment pipeline

### 🟡 HIGH

#### DEP-01: Docker Configuration
- [ ] Create multi-stage `Dockerfile`:
  ```dockerfile
  FROM oven/bun:1 AS base
  FROM base AS deps
  FROM base AS builder
  FROM base AS runner
  ```
- [ ] Create `docker-compose.yml` (app + caddy)
- [ ] Create `.dockerignore`
- [ ] Add health check to Dockerfile
- [ ] Test locally with `docker compose up`
- [ ] **Effort:** 1 day

#### DEP-02: CI/CD Pipeline
- [ ] Create `.github/workflows/ci.yml`:
  - Lint → Type check → Unit tests → Build
- [ ] Create `.github/workflows/cd.yml`:
  - Build Docker image → Push to registry → Deploy
- [ ] Add branch protection rules
- [ ] Add pre-commit hooks (husky + lint-staged)
- [ ] **Effort:** 1–2 days

#### DEP-03: Process Manager
- [ ] Replace `nohup` with PM2 or systemd
- [ ] Configure graceful shutdown
- [ ] Set up log rotation
- [ ] Configure auto-restart on crash
- [ ] **Effort:** 0.5 days

#### SEC-11: Database Migration
- [ ] Evaluate PostgreSQL/MySQL for production
- [ ] Update Prisma schema provider
- [ ] Create initial migration with `prisma migrate dev`
- [ ] Test all queries against new database
- [ ] Document migration steps
- [ ] **Effort:** 1–2 days

#### DEP-04: Security Hardening
- [ ] Add rate limiting middleware
- [ ] Add security headers (CSP, X-Frame-Options, etc.)
- [ ] Configure CORS properly
- [ ] Add request ID tracking for logging
- [ ] **Effort:** 1 day

---

## Effort Summary

| Phase | Duration | Items | Status |
|-------|----------|-------|--------|
| Phase 1: Security & Stability | 1–2 weeks | 7 tasks | 🔴 Not Started |
| Phase 2: Quality & Testing | 1–2 weeks | 4 tasks | 🔴 Not Started |
| Phase 3: Core Features | 1–2 weeks | 6 tasks | 🔴 Not Started |
| Phase 4: Polish & Optimization | 1–2 weeks | 12 tasks | 🔴 Not Started |
| Phase 5: Advanced Features | 2+ weeks | 7 tasks | ⚪ Deferred |
| Phase 6: DevOps & Deployment | 1–2 weeks | 4 tasks | 🔴 Not Started |
| **Total** | **7–12 weeks** | **40 tasks** | |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Authentication adds complexity to all API routes | High | Medium | Create reusable auth middleware/helper |
| Payroll engine bugs cause incorrect pay | Medium | Critical | Phase 2 testing is top priority |
| SQLite concurrency limits scaling | High | Medium | Plan PostgreSQL migration in Phase 6 |
| Float precision causes rounding errors | Medium | Medium | Test with edge cases; migrate to Decimal if needed |
| Unused dependencies cause bloat/security risk | Low | Low | Remove in Phase 4 |
| No tests means regressions during feature work | High | High | Complete Phase 2 before Phase 3 |

---

*Generated by Z.ai Code — Pending Work & Roadmap*
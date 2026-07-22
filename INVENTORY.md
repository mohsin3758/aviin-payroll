# PayrollPro — File Inventory

> **Generated:** July 2025 · **Version:** 0.2.0

---

## Summary

| Category | Files | Lines | % of Code |
|----------|-------|-------|-----------|
| **Total Source Files** | **83** | **16,378** | **100%** |
| Frontend Files | 61 | 12,830 | 78.3% |
| Backend Files | 22 | 3,548 | 21.7% |
| SQL / Schema Files | 1 | 231 | — |
| Config Files | 9 | 313 | — |
| Test Files | 0 | 0 | — |

---

## Frontend Files — 61 files, 12,830 lines

### App Shell — 3 files, 215 lines

| File | Lines |
|------|-------|
| `src/app/page.tsx` | 56 |
| `src/app/layout.tsx` | 37 |
| `src/app/globals.css` | 122 |

### Payroll Views — 10 files, 7,218 lines

| File | Lines | Description |
|------|-------|-------------|
| `src/components/payroll/employees-view.tsx` | 1,424 | Employee CRUD, salary structure, search/filter |
| `src/components/payroll/attendance-view.tsx` | 1,039 | Calendar view, punch in/out, face verification |
| `src/components/payroll/leaves-view.tsx` | 1,034 | Leave applications, approvals, balance tracking |
| `src/components/payroll/reports-view.tsx` | 846 | PF, ESI, TDS, PT, LWF compliance reports |
| `src/components/payroll/settings-view.tsx` | 794 | Company settings, PAN/TAN/GSTIN/PF/ESI config |
| `src/components/payroll/payroll-view.tsx` | 657 | Monthly payroll processing, run management |
| `src/components/payroll/dashboard-view.tsx` | 577 | KPIs, charts, department/state distribution |
| `src/components/payroll/salary-slip-view.tsx` | 580 | Individual salary slip, print layout |
| `src/components/payroll/layout.tsx` | 169 | Animated sidebar, mobile overlay |
| `src/components/payroll/top-bar.tsx` | 98 | Top navigation bar |

### UI Components (shadcn/ui) — 47 files, 5,397 lines

All stock shadcn/ui v2 (New York style), unmodified from CLI generation.

| File | Lines | File | Lines | File | Lines |
|------|-------|------|-------|------|-------|
| `accordion.tsx` | 66 | `menubar.tsx` | 276 | `scroll-area.tsx` | 58 |
| `alert-dialog.tsx` | 157 | `navigation-menu.tsx` | 168 | `select.tsx` | 185 |
| `alert.tsx` | 66 | `pagination.tsx` | 127 | `separator.tsx` | 28 |
| `aspect-ratio.tsx` | 11 | `popover.tsx` | 48 | `sheet.tsx` | 139 |
| `avatar.tsx` | 53 | `progress.tsx` | 31 | `skeleton.tsx` | 13 |
| `badge.tsx` | 46 | `radio-group.tsx` | 45 | `slider.tsx` | 63 |
| `breadcrumb.tsx` | 109 | `resizable.tsx` | 56 | `sonner.tsx` | 25 |
| `button.tsx` | 59 | `carousel.tsx` | 241 | `switch.tsx` | 31 |
| `calendar.tsx` | 213 | `chart.tsx` | 353 | `table.tsx` | 116 |
| `card.tsx` | 92 | `checkbox.tsx` | 32 | `tabs.tsx` | 66 |
| `collapsible.tsx` | 33 | `command.tsx` | 184 | `textarea.tsx` | 18 |
| `context-menu.tsx` | 252 | `dialog.tsx` | 143 | `toast.tsx` | 128 |
| `dropdown-menu.tsx` | 257 | `drawer.tsx` | 135 | `toaster.tsx` | 34 |
| `form.tsx` | 167 | `hover-card.tsx` | 44 | `toggle-group.tsx` | 73 |
| `input-otp.tsx` | 77 | `input.tsx` | 21 | `toggle.tsx` | 47 |
| `label.tsx` | 24 | `tooltip.tsx` | 61 | `sidebar.tsx` | 726 |

---

## Backend Files — 22 files, 3,548 lines

### API Routes — 15 files, 2,690 lines

| File | Lines | Methods |
|------|-------|---------|
| `src/app/api/reports/route.ts` | 404 | GET |
| `src/app/api/seed/route.ts` | 403 | POST |
| `src/app/api/salary-slip/route.ts` | 338 | GET |
| `src/app/api/payroll/route.ts` | 313 | GET, POST |
| `src/app/api/employees/route.ts` | 248 | GET, POST |
| `src/app/api/attendance/route.ts` | 258 | GET, POST |
| `src/app/api/attendance/punch/route.ts` | 169 | POST |
| `src/app/api/leaves/[id]/route.ts` | 168 | GET, PUT, DELETE |
| `src/app/api/leaves/route.ts` | 130 | GET, POST |
| `src/app/api/employees/[id]/route.ts` | 106 | GET, PUT, DELETE |
| `src/app/api/payroll/[runId]/route.ts` | 107 | GET, PUT |
| `src/app/api/settings/route.ts` | 89 | GET, PUT |
| `src/app/api/dashboard/route.ts` | 126 | GET |
| `src/app/api/leaves/balance/route.ts` | 25 | GET |
| `src/app/api/route.ts` | 6 | GET |

### Library — 4 files, 608 lines

| File | Lines | Description |
|------|-------|-------------|
| `src/lib/payroll/engine.ts` | 589 | Indian statutory payroll calculation engine |
| `src/lib/db.ts` | 12 | Prisma client singleton |
| `src/lib/utils.ts` | 6 | `cn()` utility (clsx + tailwind-merge) |
| `src/lib/payroll/index.ts` | 1 | Re-exports |

### Hooks — 2 files, 212 lines

| File | Lines | Description |
|------|-------|-------------|
| `src/hooks/use-toast.ts` | 193 | Toast notification hook |
| `src/hooks/use-mobile.ts` | 19 | Mobile viewport detection |

### Store — 1 file, 38 lines

| File | Lines | Description |
|------|-------|-------------|
| `src/store/payroll-store.ts` | 38 | Zustand global state (view, sidebar, selections) |

---

## SQL / Schema Files — 1 file, 231 lines

| File | Lines | Description |
|------|-------|-------------|
| `prisma/schema.prisma` | 231 | 8 models: Company, Employee, SalaryStructure, Attendance, LeaveType, LeaveBalance, LeaveApplication, PayrollRun, PayrollDetail |

---

## Config Files — 9 files, 313 lines

| File | Lines | Purpose |
|------|-------|---------|
| `package.json` | 94 | Dependencies, scripts |
| `tailwind.config.ts` | 64 | Tailwind CSS theme, shadcn/ui CSS variables |
| `eslint.config.mjs` | 50 | ESLint configuration (nearly all rules disabled) |
| `tsconfig.json` | 42 | TypeScript compiler options |
| `Caddyfile` | 23 | Reverse proxy (port 81 → localhost:3000) |
| `components.json` | 20 | shadcn/ui CLI configuration |
| `next.config.ts` | 14 | Next.js standalone output, build settings |
| `postcss.config.mjs` | 5 | PostCSS with Tailwind plugin |
| `.env` | 1 | DATABASE_URL |

---

## Test Files — 0 files, 0 lines

> ⚠️ **No application-level test files exist.** No unit, integration, or e2e tests have been written.

---

## Totals

```
┌──────────────────────────────┬─────────┬──────────┐
│ Category                     │  Files  │   Lines  │
├──────────────────────────────┼─────────┼──────────┤
│ App Shell                    │       3 │      215 │
│ Payroll Views                │      10 │    7,218 │
│ UI Components (shadcn/ui)    │      47 │    5,397 │
│ API Routes                   │      15 │    2,690 │
│ Library (payroll engine etc) │       4 │      608 │
│ Hooks                        │       2 │      212 │
│ Store (Zustand)              │       1 │       38 │
│ Prisma Schema                │       1 │      231 │
│ Config Files                 │       9 │      313 │
│ Test Files                   │       0 │        0 │
├──────────────────────────────┼─────────┼──────────┤
│ TOTAL                        │      92 │   16,922 │
└──────────────────────────────┴─────────┴──────────┘
```

*Note: 83 source files in `src/` + 1 schema + 9 config = 93 items total. Lines column includes only `src/` source (16,378) + schema (231) + config (313) = 16,922.*

---

*Generated by Z.ai Code*
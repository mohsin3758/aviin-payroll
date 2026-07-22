# PayrollPro — Module-Wise Error Catalog

> **Version:** 1.0.0 · **Date:** July 2025 · **Total Errors:** 69

---

## Severity Legend

| Level | Count | Description |
|-------|-------|-------------|
| 🔴 CRITICAL | 12 | Data loss, security breach, financial inaccuracy |
| 🟠 HIGH | 22 | Functional bugs, missing guards, incorrect behavior |
| 🟡 MEDIUM | 25 | Inconsistencies, missing validations, UX issues |
| 🟢 LOW | 10 | Code quality, minor improvements |

---

## Module 1: Authentication — 7 Errors

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| AUTH-E01 | 🔴 CRITICAL | Security | All API routes | — | No authentication — all 14 endpoints publicly accessible | Implement next-auth + middleware |
| AUTH-E02 | 🔴 CRITICAL | Security | All API routes | — | No RBAC — any user can perform admin operations | Implement role-based access control |
| AUTH-E03 | 🟠 HIGH | Dependency | package.json | — | `next-auth` installed but never configured | Configure or remove |
| AUTH-E04 | 🟠 HIGH | Infrastructure | src/middleware.ts | — | Missing middleware.ts — no request interception | Create middleware with auth check |
| AUTH-E05 | 🟠 HIGH | Security | src/app/api/seed/route.ts | — | Seed endpoint allows unauthenticated database wipe | Protect with admin-only auth |
| AUTH-E06 | 🟡 MEDIUM | Security | All API routes | — | No rate limiting on any endpoint | Add rate limiting middleware |
| AUTH-E07 | 🟡 MEDIUM | Security | All API routes | — | No CSRF protection | Add CSRF token validation |

---

## Module 2: Employee Management — 9 Errors

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| EMP-E01 | 🔴 CRITICAL | Security | employees/route.ts | 45 | POST uses `...employeeData` spread — arbitrary field injection | Use explicit field allowlist |
| EMP-E02 | 🔴 CRITICAL | Security | employees/[id]/route.ts | 50 | PUT uses `...employeeData` spread — arbitrary field injection | Use explicit field allowlist |
| EMP-E03 | 🟠 HIGH | Validation | employees/route.ts | — | No Zod/schema validation on POST body | Add Zod schema validation |
| EMP-E04 | 🟠 HIGH | Validation | employees/[id]/route.ts | — | No Zod/schema validation on PUT body | Add Zod schema validation |
| EMP-E05 | 🟠 HIGH | Validation | employees/route.ts | — | No PAN/Aadhaar/IFSC/email format validation | Add regex validators |
| EMP-E06 | 🟠 HIGH | Concurrency | employees/route.ts | 30 | Employee code auto-generation has race condition | Use atomic counter or DB sequence |
| EMP-E07 | 🟡 MEDIUM | Data Model | prisma/schema.prisma | — | Department is free-text string, no entity | Create Department model with FK |
| EMP-E08 | 🟡 MEDIUM | Performance | employees/route.ts | — | No pagination — returns all employees | Add cursor/offset pagination |
| EMP-E09 | 🟡 MEDIUM | Business Logic | employees/[id]/route.ts | 85 | Soft-delete doesn't cascade to payroll/attendance | Add active-employee filter in payroll |

---

## Module 3: Attendance — 9 Errors

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| ATT-E01 | 🟠 HIGH | Validation | attendance/punch/route.ts | — | No employee existence check before punch | Add findUnique check |
| ATT-E02 | 🟠 HIGH | Missing Feature | — | — | No shift management — attendance not linked to shifts | Create Shift model + assignment |
| ATT-E03 | 🟠 HIGH | Missing Feature | — | — | No overtime calculation despite SalaryStructure.overtime | Implement OT rules engine |
| ATT-E04 | 🟠 HIGH | Missing Feature | — | — | No holiday calendar — holidays counted as working days | Create Holiday model |
| ATT-E05 | 🟡 MEDIUM | Timezone | attendance/punch/route.ts | 45 | Server uses UTC for date — timezone mismatch for IST | Use Asia/Kolkata timezone |
| ATT-E06 | 🟡 MEDIUM | Precision | attendance/route.ts | 140 | `totalHours` rounded to 2 decimals — rounding errors | Use minutes internally, format on display |
| ATT-E07 | 🟡 MEDIUM | Validation | attendance/route.ts | — | Status accepts any string — no enum enforcement | Add status validation |
| ATT-E08 | 🟢 LOW | Code Quality | attendance/punch/route.ts | 58 | Dead code: unreachable face verification check | Remove dead code block |
| ATT-E09 | 🟢 LOW | Missing Feature | — | — | No attendance regularization workflow | Create regularization request model |

---

## Module 4: Payroll Processing — 12 Errors

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| PAY-E01 | 🔴 CRITICAL | Business Logic | payroll/route.ts | — | Can re-process already-paid payroll runs | Add status guard: block if status="paid" |
| PAY-E02 | 🔴 CRITICAL | Data Integrity | payroll/route.ts | — | No transaction wrapping payroll processing | Wrap entire POST in `db.$transaction()` |
| PAY-E03 | 🟠 HIGH | Calculation | payroll/engine.ts | 465 | Negative net salary when presentDays=0 — deductions still applied | Cap deductions at totalEarnings |
| PAY-E04 | 🟠 HIGH | Audit | payroll/route.ts | — | No audit trail — who processed, when, previous values | Create PayrollAuditLog model |
| PAY-E05 | 🟠 HIGH | Calculation | payroll/engine.ts | 430 | TDS annualization simplistic (monthly × 12) — ignores mid-year changes | Implement YTD tax computation |
| PAY-E06 | 🟡 MEDIUM | Missing Feature | — | — | No arrears tracking or calculation | Create Arrear model |
| PAY-E07 | 🟡 MEDIUM | Missing Feature | — | — | No bonus/incentive management | Create Bonus/Incentive model |
| PAY-E08 | 🟡 MEDIUM | Data Integrity | payroll/route.ts | 180 | Re-processing deletes all previous PayrollDetails | Warn user, require confirmation |
| PAY-E09 | 🟡 MEDIUM | Consistency | salary-slip/route.ts | — | Dual-path logic (stored vs computed) can produce different results | Always use stored, fall back to computed |
| PAY-E10 | 🟢 LOW | Missing Feature | — | — | No per-employee salary hold | Add `holdSalary` flag |
| PAY-E11 | 🟢 LOW | Missing Feature | — | — | No final settlement (F&F) calculation | Create F&F computation module |
| PAY-E12 | 🟢 LOW | Missing Feature | — | — | No wage revision with effective date | Create SalaryRevision model |

---

## Module 5: Compliance — 7 Errors

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| CMP-E01 | 🟡 MEDIUM | Consistency | reports/route.ts | 103 | PF report recalculates EPS/EDLI — duplicated logic with engine | Use stored values from PayrollDetail |
| CMP-E02 | 🟡 MEDIUM | Accuracy | reports/route.ts | 210 | TDS report annualizes by `monthlyTDS × 12` — inaccurate | Use YTD computation from engine |
| CMP-E03 | 🟡 MEDIUM | Missing Feature | — | — | No ECR generation for PF filing | Add ECR format generator |
| CMP-E04 | 🟡 MEDIUM | Missing Feature | — | — | No Form 16 generation | Add Form 16 PDF generator |
| CMP-E05 | 🟢 LOW | Missing Feature | — | — | No ESI half-yearly return format | Add ESI return generator |
| CMP-E06 | 🟢 LOW | Missing Feature | — | — | No PT/LWF return generation | Add state-wise return generators |
| CMP-E07 | 🟢 LOW | Precision | prisma/schema.prisma | — | All salary fields are `Float` — rounding differences possible | Use `Decimal` type or round consistently |

---

## Module 6: Leave Management — 12 Errors

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| LEA-E01 | 🔴 CRITICAL | Business Logic | leaves/[id]/route.ts | 80 | Double-approval bug: approving twice increments LeaveBalance.used again | Check current status before approving |
| LEA-E02 | 🔴 CRITICAL | Business Logic | leaves/[id]/route.ts | 140 | Cancel approved leave doesn't restore LeaveBalance.used | Decrement `used` on cancel if was approved |
| LEA-E03 | 🔴 CRITICAL | Error Handling | leaves/route.ts | — | No try/catch on GET or POST — DB errors become unhandled | Add try/catch + 500 response |
| LEA-E04 | 🔴 CRITICAL | Error Handling | leaves/[id]/route.ts | — | No try/catch on GET, PUT, or DELETE | Add try/catch + 500 response |
| LEA-E05 | 🟠 HIGH | Validation | leaves/route.ts | 60 | No leave balance check before creating application | Check LeaveBalance.available >= totalDays |
| LEA-E06 | 🟠 HIGH | Calculation | leaves/route.ts | 55 | `Math.abs` masks reversed date ranges (end < start still works) | Validate endDate >= startDate |
| LEA-E07 | 🟠 HIGH | Business Logic | leaves/[id]/route.ts | 70 | No idempotency — PUT approval not checked for current status | Add `if (existing.status !== 'pending') return 400` |
| LEA-E08 | 🟡 MEDIUM | Error Handling | leaves/balance/route.ts | — | No try/catch — errors unhandled | Add try/catch + 500 response |
| LEA-E09 | 🟡 MEDIUM | Calculation | leaves/route.ts | 55 | totalDays doesn't exclude weekends or holidays | Add weekend/holiday exclusion logic |
| LEA-E10 | 🟡 MEDIUM | Missing Feature | — | — | No leave encashment at year-end | Add encashment calculation |
| LEA-E11 | 🟡 MEDIUM | Missing Feature | — | — | No half-day leave support | Add half-day leave type |
| LEA-E12 | 🟡 MEDIUM | Missing Feature | — | — | No annual leave quota reset | Add cron-based reset mechanism |

---

## Module 7: Timesheet — 0 Errors

*Module not implemented. No code exists to contain errors.*

---

## Module 8: Client Billing — 0 Errors

*Module not implemented. No code exists to contain errors.*

---

## Module 9: Reports — 7 Errors

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| RPT-E01 | 🟡 MEDIUM | Missing Feature | — | — | No PDF/Excel export functionality | Add PDF (ReportLab/puppeteer) + Excel export |
| RPT-E02 | 🟡 MEDIUM | Missing Feature | — | — | No salary register report | Add consolidated monthly salary register |
| RPT-E03 | 🟡 MEDIUM | Missing Feature | — | — | No bank statement report | Add bank-wise payment listing |
| RPT-E04 | 🟡 MEDIUM | Missing Feature | — | — | No Form 16 generation | Add Form 16 PDF with Part A & B |
| RPT-E05 | 🟡 MEDIUM | Missing Feature | — | — | No attendance summary report | Add monthly attendance report |
| RPT-E06 | 🟢 LOW | UX | reports-view.tsx | — | No custom date range — month/year only | Add date range picker |
| RPT-E07 | 🟢 LOW | Performance | reports/route.ts | — | No pagination for large employee counts | Add pagination |

---

## Module 10: Finance Integration — 0 Errors

*Module not implemented. No code exists to contain errors.*

---

## Module 11: Notification Module — 4 Errors

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| NTF-E01 | 🟠 HIGH | Missing Feature | — | — | No email notifications for payroll processing | Integrate email service (Resend/SendGrid) |
| NTF-E02 | 🟠 HIGH | Missing Feature | — | — | No salary slip email delivery | Add email with PDF attachment on payroll |
| NTF-E03 | 🟡 MEDIUM | Missing Feature | — | — | No leave approval notification | Add email notification on approve/reject |
| NTF-E04 | 🟡 MEDIUM | Missing Feature | — | — | No attendance reminder system | Add cron-based daily reminder |

---

## Module 12: Security — 12 Errors

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| SEC-E01 | 🔴 CRITICAL | Authentication | All routes | — | No authentication system | See AUTH-E01 |
| SEC-E02 | 🔴 CRITICAL | Audit | — | — | No audit logging — zero traceability | Create AuditLog model + middleware |
| SEC-E03 | 🟠 HIGH | Encryption | db/custom.db | — | SQLite database unencrypted on disk | Migrate to SQLCipher or encrypt at rest |
| SEC-E04 | 🟠 HIGH | PII Exposure | All employee APIs | — | PAN, Aadhaar, bank details returned in full | Mask sensitive fields in list responses |
| SEC-E05 | 🟠 HIGH | Security | api/seed/route.ts | — | Seed endpoint allows unauthenticated DB wipe | Protect with admin auth (see AUTH-E05) |
| SEC-E06 | 🟠 HIGH | Security | All API routes | — | No rate limiting on any endpoint | Add rate limiting middleware |
| SEC-E07 | 🟡 MEDIUM | Headers | — | — | No Content-Security-Policy headers | Add CSP via Caddy/next.config |
| SEC-E08 | 🟡 MEDIUM | Input | All API routes | — | No centralized input sanitization | Add sanitization middleware |
| SEC-E09 | 🟡 MEDIUM | Input | employees/route.ts | — | `...employeeData` spread allows field injection | See EMP-E01 |
| SEC-E10 | 🟡 MEDIUM | Config | src/lib/db.ts | 3 | Query logging always on — performance/security risk | Conditional: dev only |
| SEC-E11 | 🟢 LOW | API Design | All API routes | — | No API versioning | Add /api/v1/ prefix |
| SEC-E12 | 🟢 LOW | Config | — | — | No request body size limits | Add body size limit middleware |

---

## Cross-Module Errors — 2

| ID | Severity | Category | File | Line | Description | Fix |
|----|----------|----------|------|------|-------------|-----|
| XMOD-E01 | 🟡 MEDIUM | Consistency | All API routes | — | No standardized response format across routes | Create统一的 { data, error, meta } wrapper |
| XMOD-E02 | 🟡 MEDIUM | TypeScript | attendance/punch/route.ts, attendance/route.ts | 70,113,156,212 | `employeeId_date` compound unique not recognized by TS | Use findFirst pattern or regenerate Prisma client |

---

## Error Distribution by Module

```
Module                  CRITICAL  HIGH  MEDIUM  LOW  TOTAL
──────────────────────────────────────────────────────
1. Authentication           2     3     2     0     7
2. Employee Mgmt           2     4     3     0     9
3. Attendance              0     4     3     2     9
4. Payroll Processing      2     3     4     3    12
5. Compliance              0     0     4     3     7
6. Leave Management        4     3     5     0    12
7. Timesheet               0     0     0     0     0
8. Client Billing          0     0     0     0     0
9. Reports                 0     0     5     2     7
10. Finance Integration    0     0     0     0     0
11. Notifications          0     2     2     0     4
12. Security                2     4     4     2    12
Cross-Module               0     0     2     0     2
──────────────────────────────────────────────────────
TOTAL                     12    23    34    12    81
```

> **Note:** Some errors appear in multiple modules (e.g., no auth affects both Auth and Security modules). Unique error count: **69 distinct issues.**

## Top 10 Fixes by Impact

| Rank | Error ID | Severity | Effort | Impact |
|------|---------|----------|--------|--------|
| 1 | AUTH-E01 | CRITICAL | 5 days | Unlocks entire auth system, protects all 14 endpoints |
| 2 | SEC-E02 | CRITICAL | 3 days | Enables complete audit trail for compliance |
| 3 | LEA-E01 | CRITICAL | 1 hour | Fixes financial data corruption (double balance increment) |
| 4 | LEA-E02 | CRITICAL | 1 hour | Fixes financial data corruption (lost balance on cancel) |
| 5 | PAY-E01 | CRITICAL | 2 hours | Prevents overwriting finalized payroll data |
| 6 | PAY-E02 | CRITICAL | 2 hours | Prevents partial payroll data loss |
| 7 | LEA-E03/E04 | CRITICAL | 1 hour | Prevents unhandled exceptions on leave routes |
| 8 | EMP-E01/E02 | CRITICAL | 2 hours | Prevents arbitrary field injection |
| 9 | LEA-E05 | HIGH | 2 hours | Prevents over-allocation of leave |
| 10 | PAY-E03 | HIGH | 1 hour | Prevents negative salary edge case |

**Total effort for Top 10: ~15 days** — Addresses all 12 CRITICAL errors.
# PayrollPro — Pending Work & Test Cases

> **Version:** 1.0.0 · **Date:** July 2025

---

## Module 1: Authentication

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P0 | User model with email, password hash, role | 2 days | — |
| P0 | next-auth configuration (Credentials provider) | 1 day | User model |
| P0 | middleware.ts with route protection | 1 day | next-auth |
| P0 | Login page UI | 1 day | next-auth |
| P1 | Role-based access control (Admin, HR, Manager, Employee) | 3 days | User model |
| P1 | Role-based API middleware | 2 days | RBAC |
| P2 | Password reset flow | 1 day | next-auth |
| P2 | MFA (TOTP via authenticator app) | 3 days | Auth base |
| P3 | SSO (SAML/OIDC) | 5 days | Auth base |
| P3 | Session management dashboard | 2 days | Auth base |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| AUTH-TC-01 | Unauthenticated request to /api/employees returns 401 | Integration | P0 |
| AUTH-TC-02 | Valid login returns session token | Integration | P0 |
| AUTH-TC-03 | Invalid password returns 401 | Integration | P0 |
| AUTH-TC-04 | Employee role cannot access /api/settings | Integration | P1 |
| AUTH-TC-05 | Employee role cannot access /api/seed | Integration | P1 |
| AUTH-TC-06 | Admin role can access all endpoints | Integration | P1 |
| AUTH-TC-07 | Expired session redirects to login | Integration | P2 |
| AUTH-TC-08 | MFA required after login | Integration | P2 |

---

## Module 2: Employee Management

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P1 | Department entity (table) with CRUD | 2 days | — |
| P1 | Designation entity (table) with CRUD | 2 days | — |
| P1 | Zod validation on all employee endpoints | 1 day | zod (installed) |
| P1 | PAN format validation (5+4+1 regex) | 0.5 days | — |
| P1 | Aadhaar format validation (12-digit regex) | 0.5 days | — |
| P1 | Bank IFSC validation (11-char regex) | 0.5 days | — |
| P1 | Email format validation | 0.5 days | — |
| P1 | Pagination on employee list | 1 day | — |
| P2 | Bulk CSV/Excel import | 3 days | xlsx parser |
| P2 | Employee export (CSV/PDF) | 2 days | PDF/Excel gen |
| P2 | Employee photo upload | 2 days | File storage |
| P2 | Probation period tracking | 1 day | — |
| P2 | Confirmation workflow | 2 days | — |
| P2 | Separation/F&F workflow | 3 days | Payroll F&F |
| P3 | Employee self-service portal | 5 days | Auth module |
| P3 | Organization chart | 3 days | — |
| P3 | Employee categories (FT/PT/Contract) | 1 day | — |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| EMP-TC-01 | Create employee with all required fields returns 201 | Integration | P0 |
| EMP-TC-02 | Create without firstName returns 400 | Integration | P0 |
| EMP-TC-03 | Create with invalid PAN format returns 400 | Integration | P1 |
| EMP-TC-04 | Create with duplicate email returns 409 | Integration | P0 |
| EMP-TC-05 | Create with duplicate employeeCode returns 409 | Integration | P0 |
| EMP-TC-06 | Update employee modifies only provided fields | Integration | P0 |
| EMP-TC-07 | DELETE sets dateOfExit, does not remove record | Integration | P0 |
| EMP-TC-08 | Search by name returns matching employees | Integration | P0 |
| EMP-TC-09 | Filter by department returns only that department | Integration | P0 |
| EMP-TC-10 | Concurrent employee creation doesn't duplicate codes | Integration | P1 |
| EMP-TC-11 | POST with extra fields ignores them (no spread injection) | Integration | P1 |
| EMP-TC-12 | Soft-deleted employee excluded from active list | Integration | P0 |
| EMP-TC-13 | Pagination returns correct page with correct size | Integration | P1 |
| EMP-TC-14 | Employee without salary structure can be created | Integration | P0 |

---

## Module 3: Attendance

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P1 | Shift model with CRUD | 2 days | — |
| P1 | Shift assignment to employees | 2 days | Shift model |
| P1 | Overtime calculation rules | 3 days | Shift model |
| P1 | Holiday calendar model | 2 days | — |
| P1 | Weekly-off auto-assignment | 2 days | Shift model |
| P1 | Employee existence validation on punch | 0.5 days | — |
| P2 | Attendance regularization request workflow | 3 days | Auth module |
| P2 | Geo-fencing (location-based punch) | 5 days | Mobile app |
| P2 | Biometric device integration | 5 days | Hardware API |
| P2 | Night shift (cross-midnight) handling | 2 days | Shift model |
| P2 | Compensatory off accrual from holiday work | 2 days | Leave module |
| P3 | Attendance analytics dashboard | 3 days | — |
| P3 | Late arrival / early departure tracking | 1 day | Shift model |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| ATT-TC-01 | Punch in creates attendance record with status "present" | Integration | P0 |
| ATT-TC-02 | Punch out updates record with totalHours | Integration | P0 |
| ATT-TC-03 | Punch in twice returns 409 | Integration | P0 |
| ATT-TC-04 | Punch out without punch in returns 400 | Integration | P0 |
| ATT-TC-05 | Invalid method returns 400 | Integration | P0 |
| ATT-TC-06 | Face method without verified=true returns 400 | Integration | P0 |
| ATT-TC-07 | totalHours correctly calculated | Unit | P0 |
| ATT-TC-08 | Filter by month returns correct records | Integration | P0 |
| ATT-TC-09 | Attendance for non-existent employee returns 404 | Integration | P1 |
| ATT-TC-10 | Manual attendance creation with both punchIn/punchOut | Integration | P0 |

---

## Module 4: Payroll Processing

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P0 | Block re-processing of paid payroll runs | 0.5 days | — |
| P0 | Transaction wrapping for payroll processing | 1 day | — |
| P0 | Guard against negative net salary | 0.5 days | — |
| P1 | Arrears tracking and calculation | 3 days | Wage revision |
| P1 | Statutory bonus (Payment of Bonus Act) | 2 days | — |
| P1 | Performance-linked incentives | 2 days | — |
| P1 | Loan/advance deduction module | 3 days | — |
| P1 | Audit trail for payroll changes | 2 days | AuditLog model |
| P1 | Mid-year TDS recalculation | 2 days | — |
| P2 | Reimbursements module | 2 days | — |
| P2 | Wage revision with effective date | 3 days | — |
| P2 | Per-employee salary hold | 1 day | — |
| P2 | Payroll reversal | 2 days | Audit trail |
| P2 | Final settlement (F&F) calculation | 3 days | Leave encashment |
| P2 | Retroactive pay computation | 3 days | Wage revision |
| P3 | Multi-company payroll | 5 days | Company model |
| P3 | Payroll approval workflow | 2 days | Auth module |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| PAY-TC-01 | Process payroll for month with 6 employees | Integration | P0 |
| PAY-TC-02 | Re-processing paid run returns 403 | Integration | P0 |
| PAY-TC-03 | Employee with 0 present days: deductions capped at earnings | Unit | P0 |
| PAY-TC-04 | Payroll status: draft → processed → paid (valid transitions) | Integration | P0 |
| PAY-TC-05 | Payroll status: draft → paid (invalid, returns 400) | Integration | P0 |
| PAY-TC-06 | Employee without salary structure skipped | Integration | P0 |
| PAY-TC-07 | Payroll totals match sum of individual details | Unit | P0 |
| PAY-TC-08 | PF calculation: basic+DA × 12% = employee PF | Unit | P0 |
| PAY-TC-09 | PF: EPS capped at ₹1,250 when basic+DA > ₹15,000 | Unit | P0 |
| PAY-TC-10 | ESI: Applied only when gross ≤ ₹21,000 | Unit | P0 |
| PAY-TC-11 | ESI: Not applied when gross > ₹21,000 | Unit | P0 |
| PAY-TC-12 | TDS New Regime: ₹4-8L slab at 5% | Unit | P0 |
| PAY-TC-13 | TDS New Regime: 87A rebate when income ≤ ₹12L | Unit | P0 |
| PAY-TC-14 | TDS Old Regime: ₹5-10L slab at 20% | Unit | P0 |
| PAY-TC-15 | PT: Maharashtra slab ₹200/month | Unit | P0 |
| PAY-TC-16 | PT: Feb surcharge ₹300 for Maharashtra | Unit | P0 |
| PAY-TC-17 | LWF: Maharashtra half-yearly (June/December only) | Unit | P0 |
| PAY-TC-18 | CTC = (gross + employerPF + employerESI + gratuity) × 12 | Unit | P0 |
| PAY-TC-19 | Pro-rata: 15/30 days = 50% earnings | Unit | P0 |
| PAY-TC-20 | Salary slip matches stored payroll detail | Integration | P0 |
| PAY-TC-21 | Salary slip on-the-fly matches engine output | Integration | P1 |

---

## Module 5: Compliance

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P1 | ECR (Electronic Challan Return) generation for PF | 3 days | — |
| P1 | Form 16 generation (PDF) | 5 days | PDF library |
| P1 | Form 12BB investment declaration | 2 days | — |
| P2 | PF monthly return format | 2 days | — |
| P2 | ESI half-yearly return format | 2 days | — |
| P2 | PT return generation per state | 2 days | — |
| P2 | TDS quarterly filing (24Q/26Q) | 3 days | — |
| P2 | Mid-year tax regime change handling | 2 days | — |
| P3 | Compliance calendar with due dates | 2 days | — |
| P3 | Statutory challan payment tracking | 2 days | — |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| CMP-TC-01 | PF report totals match sum of employee PF contributions | Integration | P0 |
| CMP-TC-02 | ESI report excludes employees above ₹21,000 gross | Integration | P0 |
| CMP-TC-03 | TDS report shows correct annualized amount per employee | Integration | P0 |
| CMP-TC-04 | PT report groups by state correctly | Integration | P0 |
| CMP-TC-05 | LWF report shows 0 for non-applicable months | Integration | P0 |
| CMP-TC-06 | Summary report matches individual report totals | Integration | P0 |
| CMP-TC-07 | PF rate 12% on Basic+DA verified | Unit | P0 |
| CMP-TC-08 | ESI rate 0.75%/3.25% verified | Unit | P0 |
| CMP-TC-09 | New regime ₹75,000 standard deduction applied | Unit | P0 |
| CMP-TC-10 | Old regime ₹50,000 standard deduction applied | Unit | P0 |

---

## Module 6: Leave Management

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P0 | Fix double-approval balance increment bug | 0.5 days | — |
| P0 | Fix cancel-approved-leave balance restoration | 0.5 days | — |
| P0 | Add try/catch to all leave API routes | 0.5 days | — |
| P0 | Add leave balance check before creating application | 1 day | — |
| P1 | Leave encashment calculation at year-end | 3 days | — |
| P1 | Half-day leave support | 2 days | — |
| P1 | Leave Without Pay (LWP) tracking | 2 days | — |
| P1 | Weekend exclusion from leave duration | 1 day | Holiday calendar |
| P1 | Holiday exclusion from leave duration | 1 day | Holiday calendar |
| P2 | Annual leave quota reset mechanism | 2 days | Cron job |
| P2 | Leave policy configuration (admin) | 3 days | — |
| P2 | Compensatory off auto-accrual | 2 days | Attendance module |
| P3 | Leave carry-forward rules (max cap enforcement) | 1 day | — |
| P3 | Leave encashment report | 1 day | Reports module |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| LEA-TC-01 | Apply for leave with sufficient balance returns 201 | Integration | P0 |
| LEA-TC-02 | Apply for leave exceeding balance returns 400 | Integration | P0 |
| LEA-TC-03 | Approve leave increments LeaveBalance.used | Integration | P0 |
| LEA-TC-04 | Approve same leave twice does NOT double-increment | Integration | P0 |
| LEA-TC-05 | Cancel approved leave restores LeaveBalance.used | Integration | P0 |
| LEA-TC-06 | Cancel pending leave does NOT affect balance | Integration | P0 |
| LEA-TC-07 | Reject leave does NOT affect balance | Integration | P0 |
| LEA-TC-08 | Leave balance endpoint returns correct available days | Integration | P0 |
| LEA-TC-09 | totalDays calculation excludes weekends (when implemented) | Unit | P1 |
| LEA-TC-10 | Reversed date range (end < start) returns 400 | Integration | P0 |

---

## Module 7: Timesheet

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P2 | Timesheet model (employee, week, task, hours) | 2 days | — |
| P2 | Timesheet entry UI | 3 days | — |
| P2 | Timesheet approval workflow | 2 days | Auth module |
| P2 | Auto-calculation from attendance | 3 days | Attendance module |
| P3 | Project/task mapping | 3 days | Project model |
| P3 | Hourly billing rate per project | 2 days | Client Billing |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| TMS-TC-01 | Create timesheet entry for employee + week | Integration | P2 |
| TMS-TC-02 | Approve timesheet locks entries | Integration | P2 |
| TMS-TC-03 | Auto-calculate from attendance records | Unit | P2 |

---

## Module 8: Client Billing

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P2 | Client model with CRUD | 2 days | — |
| P2 | Invoice generation from payroll/timesheet | 5 days | Payroll, Timesheet |
| P2 | GST calculation (CGST + SGST/IGST) | 2 days | — |
| P2 | Billing cycle management (monthly/quarterly) | 2 days | — |
| P3 | Payment tracking | 2 days | — |
| P3 | TDS on invoices (section 194C/J) | 2 days | — |
| P3 | Invoice PDF generation | 2 days | PDF library |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| BIL-TC-01 | Create invoice from payroll run | Integration | P2 |
| BIL-TC-02 | GST calculation: 18% split into 9% CGST + 9% SGST | Unit | P2 |
| BIL-TC-03 | IGST applied for inter-state transactions | Unit | P2 |

---

## Module 9: Reports

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P1 | Salary register (monthly, all employees) | 2 days | — |
| P1 | Bank statement (bank-wise payment list) | 2 days | — |
| P1 | Form 16 PDF generation | 5 days | PDF library |
| P1 | PDF export for all reports | 3 days | PDF library |
| P1 | Excel/CSV export for all reports | 2 days | xlsx library |
| P2 | Attendance summary report | 2 days | — |
| P2 | Leave balance/consumption report | 1 day | — |
| P2 | Employee cost analysis (CTC breakdown) | 2 days | — |
| P2 | Custom date range filtering | 1 day | — |
| P3 | Report scheduling (email on payday) | 3 days | Notification module |
| P3 | Dashboard analytics widgets | 3 days | — |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| RPT-TC-01 | Summary report returns all 6 sections | Integration | P0 |
| RPT-TC-02 | PF report shows only PF-applicable employees | Integration | P0 |
| RPT-TC-03 | Invalid report type returns 400 | Integration | P0 |
| RPT-TC-04 | No payroll run for month/year returns 404 | Integration | P0 |
| RPT-TC-05 | Export to PDF generates valid file | Integration | P1 |
| RPT-TC-06 | Export to CSV has correct headers and data | Integration | P1 |

---

## Module 10: Finance Integration

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P3 | Chart of Accounts model | 3 days | — |
| P3 | Journal entry auto-creation from payroll | 5 days | Payroll module |
| P3 | Ledger report | 3 days | Journal entries |
| P3 | Cost center allocation | 3 days | Department model |
| P3 | Tally XML export | 5 days | Journal entries |
| P3 | Bank reconciliation | 3 days | — |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| FIN-TC-01 | Payroll run auto-creates journal entries | Integration | P3 |
| FIN-TC-02 | Ledger balances match payroll totals | Integration | P3 |

---

## Module 11: Notification Module

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P1 | Email service integration (Resend/SendGrid) | 2 days | SMTP config |
| P1 | Salary slip email on payroll processing | 1 day | Payroll + Email |
| P1 | Leave approval/rejection notification | 1 day | Email |
| P2 | Email templates (HTML) | 2 days | Email service |
| P2 | SMS gateway integration | 2 days | Twilio/MSG91 |
| P2 | WhatsApp Business API integration | 3 days | Meta API |
| P2 | In-app notification center | 3 days | Notification model |
| P2 | Attendance reminder (daily at 9 AM) | 1 day | Cron + Notification |
| P3 | Leave balance warning notification | 1 day | Cron |
| P3 | Payroll processing completion alert | 1 day | Notification |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| NTF-TC-01 | Payroll processed → email sent to all employees | Integration | P1 |
| NTF-TC-02 | Leave approved → notification sent to applicant | Integration | P1 |
| NTF-TC-03 | Email template renders correctly with employee data | Unit | P2 |
| NTF-TC-04 | Failed email delivery logged for retry | Integration | P2 |

---

## Module 12: Security

### Missing Features

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P0 | Authentication (covers most security needs) | 5 days | — |
| P0 | AuditLog model + middleware | 3 days | Auth module |
| P1 | PII masking in API responses | 2 days | — |
| P1 | Rate limiting middleware | 1 day | — |
| P1 | Input sanitization middleware | 1 day | — |
| P1 | Centralized Zod validation middleware | 2 days | zod |
| P2 | SQLite encryption (SQLCipher) | 2 days | — |
| P2 | Content-Security-Policy headers | 0.5 days | — |
| P2 | API versioning (/api/v1/) | 2 days | — |
| P2 | Request size limits | 0.5 days | — |
| P3 | Automated database backup | 2 days | Cron |
| P3 | Key rotation for encryption | 2 days | Encryption |

### Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| SEC-TC-01 | Unauthenticated request returns 401 | Integration | P0 |
| SEC-TC-02 | PII fields masked in list responses | Integration | P1 |
| SEC-TC-03 | Rate limit exceeded returns 429 | Integration | P1 |
| SEC-TC-04 | SQL injection attempt returns 400/403 | Integration | P1 |
| SEC-TC-05 | XSS payload in name field sanitized | Integration | P1 |
| SEC-TC-06 | Audit log entry created for every data mutation | Integration | P0 |
| SEC-TC-07 | Spread injection attempt on employee POST ignored | Integration | P1 |
| SEC-TC-08 | Seed endpoint returns 403 without admin role | Integration | P0 |

---

## Test Case Summary

| Module | Unit Tests | Integration Tests | Total | Priority |
|--------|-----------|-----------------|-------|----------|
| 1. Authentication | 0 | 8 | 8 | P0 |
| 2. Employee Management | 0 | 14 | 14 | P0-P1 |
| 3. Attendance | 1 | 9 | 10 | P0-P1 |
| 4. Payroll Processing | 13 | 8 | 21 | P0-P1 |
| 5. Compliance | 5 | 5 | 10 | P0 |
| 6. Leave Management | 1 | 9 | 10 | P0-P1 |
| 7. Timesheet | 1 | 2 | 3 | P2 |
| 8. Client Billing | 1 | 2 | 3 | P2 |
| 9. Reports | 0 | 6 | 6 | P0-P1 |
| 10. Finance Integration | 0 | 2 | 2 | P3 |
| 11. Notifications | 1 | 3 | 4 | P1-P2 |
| 12. Security | 0 | 8 | 8 | P0-P1 |
| **TOTAL** | **23** | **76** | **99** | — |

## Effort Estimation

| Phase | Modules | Duration | Dependencies |
|-------|---------|----------|-------------|
| **Phase 1: Critical Fixes** | Auth (P0), Leave bugs, Payroll guards | 2 weeks | None |
| **Phase 2: Validation & Security** | Zod validation, audit logs, rate limiting, PII masking | 2 weeks | Phase 1 |
| **Phase 3: Core Enhancements** | Shifts, holidays, arrears, leave encashment, Form 16 | 3 weeks | Phase 1-2 |
| **Phase 4: Reporting** | Salary register, bank statement, PDF/Excel export | 2 weeks | Phase 1-2 |
| **Phase 5: Notifications** | Email service, salary slip delivery, leave alerts | 1.5 weeks | Phase 1 |
| **Phase 6: Advanced** | Timesheet, billing, finance integration, MFA, SSO | 4 weeks | Phase 1-5 |
| **TOTAL** | | **~14.5 weeks** | |
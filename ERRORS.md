# PayrollPro — Error Catalog

> **Last Updated:** July 2025  
> **Version:** 0.2.0  
> **Scope:** All errors found during comprehensive project audit

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| TypeScript Build Errors | 4 | 🔴 HIGH |
| Missing Error Handling | 6 handlers | 🔴 HIGH |
| Security Vulnerabilities | 12 | 🔴 CRITICAL (2) / 🟡 MEDIUM (8) / ⚪ LOW (2) |
| Runtime Errors (Current) | 0 | ✅ CLEAN |
| Lint Errors | 0 | ✅ CLEAN |
| Validation Gaps | 10 | 🟡 HIGH (2) / 🟢 MEDIUM (6) / ⚪ LOW (2) |
| UI/UX Issues | 11 | 🟡 MEDIUM (7) / ⚪ LOW (4) |
| Mobile Issues | 6 | 🟡 MEDIUM (4) / ⚪ LOW (2) |
| Schema Issues | 4 | 🟡 MEDIUM (2) / ⚪ LOW (2) |
| Performance Issues | 7 | 🟡 MEDIUM (3) / ⚪ LOW (4) |
| Deployment Gaps | 5 | 🟡 HIGH (1) / 🟢 MEDIUM (3) / ⚪ LOW (1) |

**Total Issues Cataloged: 71**

---

## 1. TypeScript Build Errors

These errors are suppressed by `ignoreBuildErrors: true` in `next.config.ts` but represent real type safety problems.

### BE-01 through BE-04: `employeeId_date` Composite Unique Key

**Error Message:**
```
TS2561: Object literal may only specify known properties, but 'employeeId_date' does not exist 
in type 'AttendanceWhereUniqueInput'. Did you mean to write 'employeeId'?
```

**Root Cause:**  
The Prisma schema defines `@@unique([employeeId, date])` on the `Attendance` model, which should create a composite unique constraint. The code uses this as `employeeId_date` in `upsert` `where` clauses, but the generated Prisma Client types don't expose this as a valid `WhereUniqueInput` property.

**Likely Reason:**  
The Prisma client was not regenerated after adding the `@@unique` directive, or the Prisma version has a naming mismatch for compound unique keys.

**Files Affected:**

| Error ID | File | Line |
|----------|------|------|
| BE-01 | `src/app/api/attendance/punch/route.ts` | 70 |
| BE-02 | `src/app/api/attendance/punch/route.ts` | 113 |
| BE-03 | `src/app/api/attendance/route.ts` | 156 |
| BE-04 | `src/app/api/attendance/route.ts` | 212 |

**Fix Options:**

1. **Regenerate Prisma Client (try first):**
   ```bash
   cd /home/z/my-project && bun run db:generate
   ```

2. **If regeneration doesn't fix it, refactor to use findFirst pattern:**
   ```typescript
   // BEFORE (broken):
   const record = await db.attendance.upsert({
     where: { employeeId_date: { employeeId, date: attendanceDate } },
     create: { ... },
     update: { ... },
   });

   // AFTER (fixed):
   const existing = await db.attendance.findFirst({
     where: { employeeId, date: attendanceDate },
   });
   if (existing) {
     const record = await db.attendance.update({
       where: { id: existing.id },
       data: { ... },
     });
   } else {
     const record = await db.attendance.create({
       data: { ... },
     });
   }
   ```

3. **Alternative: Use raw unique constraint name if Prisma generates it differently:**
   ```bash
   bun run db:generate 2>&1 | head -20  # Check for warnings
   ```

**Severity:** 🔴 HIGH — These errors exist in attendance recording, a core feature used daily.

---

## 2. Missing Error Handling in API Routes

Three leave API routes have **zero try/catch blocks**, meaning any database failure will result in an unhandled exception and a raw 500 error response.

### EH-01: `GET /api/leaves`

**File:** `src/app/api/leaves/route.ts`  
**Handlers affected:** `GET`, `POST`

**Current Code:**
```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // ... bare await db.* calls with no try/catch
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // ... bare await db.* calls with no try/catch
}
```

**Risk:** Database connection failure, invalid query, or constraint violation will crash the handler.

**Fix:**
```typescript
export async function GET(request: NextRequest) {
  try {
    // ... existing logic
  } catch (error) {
    console.error("GET /api/leaves error:", error);
    return NextResponse.json({ error: "Failed to fetch leave applications." }, { status: 500 });
  }
}
```

---

### EH-02: `GET/PUT/DELETE /api/leaves/[id]`

**File:** `src/app/api/leaves/[id]/route.ts`  
**Handlers affected:** `GET`, `PUT`, `DELETE`

**Critical Risk:** The `PUT` handler uses `db.$transaction()` for leave approval (updates application + increments leave balance). If this transaction fails mid-way, there's no error handling — the client gets a raw error.

**Fix:** Wrap all three handlers in try/catch. For the transaction, ensure proper rollback messaging.

---

### EH-03: `GET /api/leaves/balance`

**File:** `src/app/api/leaves/balance/route.ts`  
**Handlers affected:** `GET`

**Fix:** Wrap in try/catch with appropriate error response.

---

### Error Response Consistency

**Current pattern (routes WITH error handling):**
```typescript
return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
```

**Recommendation:** Create a shared error handler utility:
```typescript
// src/lib/api-response.ts
export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}
```

---

## 3. Security Vulnerabilities

### SEC-01: No Authentication (CRITICAL)

**All 28 API handlers are publicly accessible.**

| Impact | Details |
|--------|---------|
| Data exposure | Anyone can read all employee data, salaries, PAN numbers, bank details |
| Data modification | Anyone can create, update, or delete employees, payroll, settings |
| Data destruction | Anyone can hit `POST /api/seed` to wipe the entire database |
| Compliance violation | Storing PAN/bank details without access control violates Indian data protection laws |

**Evidence:**
```typescript
// Every API route follows this pattern — no session check:
export async function GET() {
  const employees = await db.employee.findMany({ ... }); // No auth!
  return NextResponse.json(employees);
}
```

**Fix:** Implement Auth.js v5 with session-based authentication. Add middleware or helper function:
```typescript
// src/lib/auth.ts
export async function requireAuth(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) throw new AuthError("Unauthorized");
  return session;
}
```

---

### SEC-02: No Authorization (CRITICAL)

Even if authentication is added, there's no role-based access control. All users would have the same permissions.

**Required Roles:**
| Role | Can View Employees | Can Process Payroll | Can Approve Leaves | Can View Salary Slips | Can Modify Settings |
|------|-------------------|---------------------|-------------------|----------------------|-------------------|
| Admin | ✅ All | ✅ | ✅ | ✅ All | ✅ |
| HR | ✅ All | ✅ | ✅ | ✅ All | ❌ |
| Manager | ✅ Team | ❌ | ✅ Team | ❌ | ❌ |
| Employee | ❌ Own only | ❌ | ❌ | ✅ Own only | ❌ |

---

### SEC-03: Destructive Unprotected Endpoint (HIGH)

**Endpoint:** `POST /api/seed`

**Behavior:** Deletes ALL data from ALL tables, then re-seeds with demo data.

```typescript
// From seed/route.ts:
await db.payrollDetail.deleteMany();
await db.payrollRun.deleteMany();
await db.leaveBalance.deleteMany();
await db.leaveApplication.deleteMany();
await db.attendance.deleteMany();
await db.salaryStructure.deleteMany();
await db.leaveType.deleteMany();
await db.employee.deleteMany();
await db.company.deleteMany();
```

**Risk:** Any HTTP client (curl, browser, script) can wipe the entire database.

**Fix:** Add admin-only auth check AND a confirmation token:
```typescript
export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session.user.role !== 'admin') {
    return apiError("Forbidden", 403);
  }
  const { confirm } = await request.json();
  if (confirm !== 'WIPE_ALL_DATA') {
    return apiError("Confirmation token required", 400);
  }
  // ... proceed with seed
}
```

---

### SEC-04: No Input Validation (HIGH)

**Zod is installed (`^4.0.2`) but NEVER used for API input validation.**

Example of vulnerable code:
```typescript
// POST /api/employees — accepts ANY JSON body
export async function POST(request: NextRequest) {
  const body = await request.json(); // No validation!
  const { employeeCode, salaryStructure, ...employeeData } = body;
  // employeeData could contain ANY fields — Prisma will silently ignore extras,
  // but the data shape is completely uncontrolled
}
```

**Attack Vectors:**
- Malformed dates causing DB errors
- Negative salary values
- Invalid email/phone formats stored in DB
- Extremely long strings causing performance issues
- SQL injection via Prisma is unlikely but unvalidated data can cause logical errors

**Fix:** Create Zod schemas for every API input:
```typescript
// src/lib/validations/employee.ts
import { z } from 'zod';

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email(),
  phone: z.string().regex(/^[6-9]\d{9}$/).optional(),
  dateOfJoining: z.string().datetime(),
  designation: z.string().min(1),
  department: z.enum(['Engineering', 'HR', 'Finance', 'Marketing', 'Operations']),
  state: z.string(),
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).optional(),
  // ... etc
});
```

---

### SEC-05: No Rate Limiting (MEDIUM)

No rate limiting on any endpoint. An attacker could:
- Brute-force employee data by iterating IDs
- DoS the server with rapid requests
- Abuse the seed endpoint

**Fix:** Add rate limiting middleware:
```typescript
// Using next middleware or a library like rate-limiter-flexible
import { RateLimiterMemory } from 'rate-limiter-flexible';

const limiter = new RateLimiterMemory({ points: 100, duration: 60 }); // 100 req/min
```

---

### SEC-06: No CSRF Protection (MEDIUM)

State-changing requests (POST/PUT/DELETE) have no CSRF token validation.

**Fix:** Use NextAuth's built-in CSRF protection or implement double-submit cookie pattern.

---

### SEC-08: next-auth v4 End-of-Life (MEDIUM)

`next-auth@4.24.11` is in the package.json but NOT configured. Version 4 is end-of-life.

**Fix:** Either:
- Remove the dependency if not planning to use it
- Migrate to Auth.js v5 (`next-auth@5` / `@auth/core`)

---

### SEC-09/10: Missing Security Headers (LOW)

No explicit security headers:
- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`

**Fix:** Add via `next.config.ts` or middleware:
```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};
```

---

### SEC-11: SQLite in Production (MEDIUM)

SQLite is file-based and has limitations:
- Only one writer at a time (write-locking)
- No built-in replication or backup
- Limited concurrent connection support
- Not suitable for multi-instance deployments

**Fix:** Plan migration to PostgreSQL for production (Phase 6 of roadmap).

---

## 4. Runtime Errors

### Current Status: ✅ CLEAN

The dev server log (`dev.log`, 157 lines) shows:
- All HTTP responses return `200`
- No stack traces
- No unhandled exceptions
- Only Prisma query logs and Next.js compilation logs

### Historical Error: EADDRINUSE

**Error:** `listen EADDRINUSE: address already in use :::3000`

**Context:** Occurred during a previous development session when a dev server was already running.

**Status:** ✅ Resolved — server restarted successfully.

---

## 5. Schema & Data Issues

### SCH-04: Float Precision for Monetary Values (MEDIUM)

All salary and monetary fields use `Float` in the Prisma schema:

```prisma
model SalaryStructure {
  basic               Float
  houseRentAllowance  Float
  // ... all money fields are Float
}

model PayrollDetail {
  basic               Float
  netSalary           Float
  // ... all money fields are Float
}
```

**Problem:** JavaScript floating-point arithmetic causes precision errors:
```javascript
0.1 + 0.2 === 0.30000000000000004  // true!
```

For payroll, even a ₹0.01 error per employee per month accumulates to significant amounts.

**Fix:** Use `Decimal` type in Prisma (maps to `REAL` in SQLite with precision) or use `Int` (store in paise):
```prisma
model SalaryStructure {
  basic               Decimal    @db.Decimal(10, 2)
  houseRentAllowance  Decimal    @db.Decimal(10, 2)
}
```

---

### SCH-01: Missing Database Indexes (LOW)

No explicit indexes on frequently-queried fields:
- `LeaveApplication.employeeId` — queried for per-employee leave lists
- `PayrollDetail.employeeId` — queried for per-employee payroll history
- `PayrollDetail.payrollRunId` — queried for run details

**Current:** Prisma auto-creates indexes for `@id` and `@unique` fields, plus the explicit `@@index([employeeId, date])` on Attendance. But the above fields have no indexes.

**Fix:** Add to schema:
```prisma
model LeaveApplication {
  // ... existing fields
  @@index([employeeId])
  @@index([status])
}

model PayrollDetail {
  // ... existing fields
  @@index([payrollRunId])
  @@index([employeeId])
}
```

---

## 6. UI/UX Issues

### UI-03: No Confirmation Dialog for Employee Delete (HIGH)

**File:** `src/components/payroll/employees-view.tsx`

Employee soft-delete executes immediately without user confirmation:
```typescript
const handleDelete = async (id: string) => {
  const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
  // No "Are you sure?" dialog before this!
};
```

**Fix:** Use shadcn/ui `AlertDialog`:
```typescript
<AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Deactivate Employee?</AlertDialogTitle>
      <AlertDialogDescription>
        This will set the employee's exit date. They will no longer appear in active lists.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={confirmDelete}>Deactivate</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

### UI-04/11: Poor Error Display (MEDIUM)

Component code uses `alert()` and `console.error()` instead of user-friendly toasts:

```typescript
// Current (leaves-view.tsx):
} catch (err) {
  console.error(err);  // User sees nothing!
}
```

**Fix:** Use `sonner` toast (already installed):
```typescript
import { toast } from 'sonner';

} catch (err) {
  toast.error('Failed to submit leave application');
}
```

---

### UI-08/09: No Table Sorting or Pagination (MEDIUM)

All data tables load ALL records with no sorting or pagination:
- Employee table: loads all employees
- Attendance table: loads all records for a month
- Leave table: loads all applications

For 100+ employees, this causes:
- Slow initial load
- Large DOM size
- Poor mobile experience

**Fix:** Implement server-side pagination and sorting in API routes, with UI controls in the table components.

---

## 7. Performance Issues

### PER-01: Sequential Payroll Processing (MEDIUM)

**File:** `src/app/api/payroll/route.ts`

Payroll is processed by iterating employees one by one:
```typescript
for (const employee of employees) {
  const attendance = await db.attendance.findMany({ ... });  // N queries
  const result = processEmployeePayroll(employee, salaryStructure, attendance, company);
  await db.payrollDetail.upsert({ ... });  // N more queries
}
```

For 100 employees, this generates 200+ sequential DB queries.

**Fix:**
1. Batch attendance queries: `db.attendance.findMany({ where: { date: { gte, lte }, employeeId: { in: employeeIds } } })`
2. Use `db.$transaction` for batch inserts
3. Consider `createMany` for payroll details

---

### PER-02: No Pagination (MEDIUM)

List endpoints return ALL matching records:
```typescript
const employees = await db.employee.findMany({ where });  // No limit/take
```

**Fix:** Add pagination:
```typescript
const page = parseInt(searchParams.get('page') ?? '1');
const limit = parseInt(searchParams.get('limit') ?? '20');
const [data, total] = await Promise.all([
  db.employee.findMany({ where, skip: (page - 1) * limit, take: limit }),
  db.employee.count({ where }),
]);
return NextResponse.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
```

---

## 8. Configuration Issues

### CFG-01: ESLint Rules All Disabled (LOW)

**File:** `eslint.config.mjs`

Nearly every ESLint rule is set to `"off"`:
```javascript
rules: {
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-unused-vars": "off",
  "no-console": "off",
  "no-unused-vars": "off",
  "prefer-const": "off",
  // ... 20+ more rules disabled
}
```

**Impact:** No static analysis protection. Typos, unused variables, and code quality issues go undetected.

**Fix:** Gradually enable rules, starting with the most valuable:
1. `"@typescript-eslint/no-unused-vars": "warn"`
2. `"no-console": "warn"` (use proper logger instead)
3. `"prefer-const": "warn"`
4. `"@typescript-eslint/no-explicit-any": "warn"`

---

### CFG-02: TypeScript Strict Mode Weakened (MEDIUM)

**File:** `tsconfig.json`
```json
{
  "noImplicitAny": false,
}
```

**File:** `next.config.ts`
```typescript
{
  typescript: { ignoreBuildErrors: true },
}
```

**Impact:** Type errors are silently ignored during build. The 4 `employeeId_date` errors are masked.

**Fix:**
1. Fix all TypeScript errors (BE-01 through BE-04)
2. Set `noImplicitAny: true` in tsconfig.json
3. Set `ignoreBuildErrors: false` in next.config.ts

---

### CFG-03: Hardcoded Database Path (MEDIUM)

**File:** `.env`
```
DATABASE_URL=file:/home/z/my-project/db/custom.db
```

**Problem:** Absolute path `/home/z/my-project/` is hardcoded. Will break in any other environment.

**Fix:**
```env
DATABASE_URL=file:./db/custom.db
```

The build script already has a `sed` command to fix this for standalone output, but the root cause should be fixed.

---

## Error Priority Matrix

| Priority | Count | Must Fix Before |
|----------|-------|-----------------|
| 🔴 CRITICAL | 2 | Any deployment |
| 🔴 HIGH | 14 | Production release |
| 🟡 MEDIUM | 25 | Scaling / Public beta |
| ⚪ LOW | 14 | When convenient |
| **Total** | **55 unique actionable items** | |

---

## Quick Fix Checklist (Under 2 Hours)

These are the fastest wins to improve code quality immediately:

- [ ] Fix 4 TypeScript errors: `bun run db:generate` (5 min)
- [ ] Add try/catch to 3 leave API routes (30 min)
- [ ] Change `DATABASE_URL` to relative path (2 min)
- [ ] Create `.env.example` file (10 min)
- [ ] Add `.gitignore` entries for `tool-results/`, `examples/` (2 min)
- [ ] Remove Prisma query logging in production: conditional `log` config (5 min)
- [ ] Replace 7 `console.error` in leaves-view with toast (15 min)
- [ ] Add confirmation dialog for employee delete (20 min)

**Estimated total: ~2 hours**

---

*Generated by Z.ai Code — Error Catalog*
*71 total issues cataloged across all categories.*
# PayrollPro — Architecture Documentation

> **Version:** 1.0.0  
> **Last Updated:** July 2025  
> **Framework:** Next.js 16.1.1 (App Router) + Bun + Prisma 6.11.1 + SQLite  
> **Architecture Pattern:** Monolithic SPA with Server-Side API Routes

---

## Table of Contents

1. [System Architecture Diagram](#1-system-architecture-diagram)
2. [Database ER Diagram](#2-database-er-diagram)
3. [API Flow Diagram](#3-api-flow-diagram)
4. [Authentication Flow](#4-authentication-flow)
5. [Module Dependencies](#5-module-dependencies)
6. [Sequence Diagrams](#6-sequence-diagrams)

---

## 1. System Architecture Diagram

### 1.1 High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PAYLOAD DELIVERY LAYER                              │
│                                                                                 │
│  ┌─────────────┐      ┌──────────────────┐      ┌──────────────────────────┐  │
│  │   Caddy      │      │   Next.js 16.1   │      │   Bun Runtime            │  │
│  │  Reverse     │─────▶│   App Router     │─────▶│   (Node.js compatible)   │  │
│  │  Proxy :81   │      │   Standalone     │      │                          │  │
│  └─────────────┘      └──────────────────┘      └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION LAYER                                   │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        CLIENT-SIDE (Browser)                              │  │
│  │                                                                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐  │  │
│  │  │  React   │  │ Zustand  │  │ Recharts  │  │ shadcn/ui (47 comps)  │  │  │
│  │  │  19.0    │  │  5.0.6   │  │  2.15.4   │  │ Radix UI primitives   │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────────────────┘  │  │
│  │                                                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐    │  │
│  │  │ Framer Motion │  │  Tailwind 4  │  │ React Hook Form + Zod 4   │    │  │
│  │  │  12.23.2      │  │  CSS (v4)   │  │ Form validation            │    │  │
│  │  └──────────────┘  └──────────────┘  └────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                      │ fetch()                                 │
│                                      ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        SERVER-SIDE (Next.js)                              │  │
│  │                                                                          │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│  │  │                    14 API Route Handlers                         │    │  │
│  │  │  /api/dashboard  /api/employees  /api/attendance  /api/leaves   │    │  │
│  │  │  /api/payroll    /api/reports    /api/settings   /api/salary-slip│    │  │
│  │  │  /api/seed       /api (health)                                 │    │  │
│  │  └─────────────────────────────────────────────────────────────────┘    │  │
│  │                                      │                                   │  │
│  │                                      ▼                                   │  │
│  │  ┌──────────────────────┐  ┌────────────────────────────────────────┐  │  │
│  │  │  Payroll Engine       │  │  Prisma ORM 6.11.1                    │  │  │
│  │  │  (Pure TypeScript)    │  │  SQLite Client                         │  │  │
│  │  │  - PF/ESI/TDS calc    │  │  - Type-safe queries                   │  │  │
│  │  │  - PT/LWF state-wise  │  │  - Single global instance             │  │  │
│  │  │  - New/Old Tax Regime │  │  - Query logging                       │  │  │
│  │  │  - FY 2025-26         │  │                                        │  │  │
│  │  └──────────────────────┘  └────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                         │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                    SQLite Database (db/custom.db)                         │  │
│  │                    8 Models · 9 Tables · File-based Storage               │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Mermaid System Architecture

```mermaid
graph TB
    subgraph Client ["Client Layer (Browser)"]
        UI["shadcn/ui Components<br/>47 Radix UI Primitives"]
        RC["React 19.0<br/>8 Lazy-Loaded Views"]
        ZS["Zustand Store<br/>Navigation + Selections"]
        CH["Recharts 2.15.4<br/>Charts & Visualizations"]
        FM["Framer Motion<br/>Animations"]
        TW["Tailwind CSS 4<br/>Styling Engine"]
        RC --> UI
        RC --> CH
        RC --> ZS
        RC --> FM
        RC --> TW
    end

    subgraph Server ["Server Layer (Next.js 16)"]
        subgraph Routes ["API Routes (14 endpoints)"]
            R1["/api/dashboard"]
            R2["/api/employees"]
            R3["/api/attendance"]
            R4["/api/leaves"]
            R5["/api/payroll"]
            R6["/api/reports"]
            R7["/api/settings"]
            R8["/api/salary-slip"]
            R9["/api/seed"]
        end
        PE["Payroll Engine<br/>590 Lines Pure TS<br/>Indian Statutory Compliance"]
        PM["Prisma ORM 6.11.1<br/>SQLite Client<br/>Type-Safe Queries"]
    end

    subgraph Data ["Data Layer"]
        DB[("SQLite Database<br/>db/custom.db<br/>8 Models · 9 Tables")]
    end

    subgraph Infra ["Infrastructure"]
        CD["Caddy Reverse Proxy<br/>:81 → :3000"]
        BN["Bun Runtime<br/>Node.js Compatible"]
    end

    RC -- "fetch() / REST" --> Routes
    Routes --> PE
    Routes --> PM
    PM --> DB
    PE -. "Pure Functions" .-> Routes
    CD --> BN
    BN --> Server
```

### 1.3 Single-Page Application Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Next.js App Router                         │
│                                                                │
│   / (only route)                                               │
│   ├── layout.tsx          → Root Layout (Server Component)     │
│   │   ├── Geist Fonts     → Google Fonts via next/font        │
│   │   ├── Sonner Toaster  → Toast notification container       │
│   │   └── page.tsx        → Client Component (SPA Shell)       │
│   │       ├── PayrollLayout                                   │
│   │       │   ├── Sidebar (animated, collapsible)             │
│   │       │   ├── TopBar (seed button, admin badge)           │
│   │       │   └── ViewRenderer                                │
│   │       │       └── Suspense fallback                       │
│   │       │           └── Active View (lazy-loaded)           │
│   │       └── Fallback: Loading spinner                       │
│   │                                                           │
│   └── api/               → 14 Server-Side Route Handlers      │
│       ├── route.ts       → Health check                       │
│       ├── dashboard/     → KPI aggregation                    │
│       ├── employees/     → CRUD operations                    │
│       ├── attendance/    → Punch & log                        │
│       ├── leaves/        → Applications & balance             │
│       ├── payroll/       → Processing & status                │
│       ├── reports/       → Compliance reports                 │
│       ├── settings/      → Company configuration              │
│       ├── salary-slip/   → Slip generation                    │
│       └── seed/          → Database seeder                    │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Database ER Diagram

### 2.1 Entity Relationship Diagram

```mermaid
erDiagram
    Company {
        string id PK
        string name
        string pan
        string tan
        string gstin
        string pfNumber
        string esiNumber
        string state
        string financialYearStart
        int payrollMonth
        int payrollYear
        string address
        string city
        string pincode
        string createdAt
        string updatedAt
    }

    Employee {
        string id PK
        string employeeCode UK
        string firstName
        string lastName
        string email UK
        string phone
        string dateOfBirth
        string dateOfJoining
        string dateOfExit
        string department
        string designation
        string state
        string gender
        string pan
        string aadhaar
        string uan
        string bankName
        string bankAccount
        string bankIfsc
        string pfApplicable
        string esiApplicable
        string ptApplicable
        string lwfApplicable
        string taxRegime
        string status
        string createdAt
        string updatedAt
    }

    SalaryStructure {
        string id PK
        string employeeId FK
        float basic
        float da
        float hra
        float conveyance
        float medical
        float specialAllowance
        float overtime
        float bonus
        float employerPF
        float employerESI
        float gratuity
    }

    Attendance {
        string id PK
        string employeeId FK
        string date
        string punchIn
        string punchOut
        string status
        float totalHours
        string method
        string ipAddress
        string deviceInfo
    }

    LeaveType {
        string id PK
        string name
        string shortCode
        int totalDays
        boolean isCarryForward
        int maxCarryForward
        boolean isPaid
        string createdAt
        string updatedAt
    }

    LeaveBalance {
        string id PK
        string employeeId FK
        string leaveTypeId FK
        int year
        int totalAllocated
        int used
        int carryForwarded
        int available
    }

    LeaveApplication {
        string id PK
        string employeeId FK
        string leaveTypeId FK
        string startDate
        string endDate
        int totalDays
        string reason
        string status
        string approvedBy
        string createdAt
        string updatedAt
    }

    PayrollRun {
        string id PK
        string companyId FK
        int month
        int year
        string status
        int totalEmployees
        float totalGross
        float totalDeductions
        float totalNetPay
        float totalPF
        float totalESI
        float totalTDS
        float totalPT
        float totalLWF
        string processedAt
        string createdAt
        string updatedAt
    }

    PayrollDetail {
        string id PK
        string payrollRunId FK
        string employeeId FK
        int presentDays
        float basic
        float da
        float hra
        float conveyance
        float medical
        float specialAllowance
        float overtime
        float bonus
        float grossSalary
        float employeePF
        float employerPF
        float employeeESI
        float employerESI
        float tds
        float professionalTax
        float lwf
        float totalDeductions
        float netSalary
        float ctc
        string createdAt
    }

    Company ||--o{ Employee : "employs"
    Company ||--o{ PayrollRun : "runs payroll"
    Employee ||--|| SalaryStructure : "has"
    Employee ||--o{ Attendance : "records"
    Employee ||--o{ LeaveBalance : "tracks"
    Employee ||--o{ LeaveApplication : "submits"
    Employee ||--o{ PayrollDetail : "earns"
    LeaveType ||--o{ LeaveBalance : "allocates"
    LeaveType ||--o{ LeaveApplication : "categorized as"
    PayrollRun ||--o{ PayrollDetail : "contains"
```

### 2.2 Unique Constraints & Indexes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE CONSTRAINTS                                 │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ Table                        │ Constraint                                    │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Employee                     │ employeeCode UNIQUE                           │
│                              │ email UNIQUE                                  │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Attendance                   │ @@unique([employeeId, date])                  │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ LeaveBalance                 │ @@unique([employeeId, leaveTypeId, year])     │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ PayrollRun                   │ @@unique([companyId, month, year])            │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ SalaryStructure              │ employeeId UNIQUE (1:1 with Employee)         │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### 2.3 Relationship Cardinality Summary

```
Company      1 ──── ∞  Employee          (One company, many employees)
Company      1 ──── ∞  PayrollRun        (One company, many payroll runs)
Employee     1 ──── 1   SalaryStructure   (One employee, one salary structure)
Employee     1 ──── ∞  Attendance         (One employee, many attendance records)
Employee     1 ──── ∞  LeaveBalance       (One employee, balances per type/year)
Employee     1 ──── ∞  LeaveApplication   (One employee, many leave requests)
Employee     1 ──── ∞  PayrollDetail      (One employee, many payroll records)
LeaveType    1 ──── ∞  LeaveBalance       (One type, many employee balances)
LeaveType    1 ──── ∞  LeaveApplication   (One type, many applications)
PayrollRun   1 ──── ∞  PayrollDetail      (One run, many employee details)
```

---

## 3. API Flow Diagram

### 3.1 Complete API Routing Map

```mermaid
graph LR
    subgraph Client ["Client (React SPA)"]
        V1["Dashboard View"]
        V2["Employees View"]
        V3["Attendance View"]
        V4["Leaves View"]
        V5["Payroll View"]
        V6["Salary Slip View"]
        V7["Reports View"]
        V8["Settings View"]
    end

    subgraph API ["API Routes"]
        A1["GET /api/dashboard"]
        A2["GET|POST /api/employees"]
        A3["GET|PUT|DEL /api/employees/:id"]
        A4["GET|POST /api/attendance"]
        A5["POST /api/attendance/punch"]
        A6["GET|POST /api/leaves"]
        A7["GET|PUT|DEL /api/leaves/:id"]
        A8["GET /api/leaves/balance"]
        A9["GET|POST /api/payroll"]
        A10["GET|PUT /api/payroll/:runId"]
        A11["GET /api/reports"]
        A12["GET|PUT /api/settings"]
        A13["GET /api/salary-slip"]
        A14["POST /api/seed"]
    end

    subgraph Processing ["Processing Layer"]
        ENG["Payroll Engine<br/>(Pure Functions)"]
        PRS["Prisma ORM<br/>(SQL Generation)"]
    end

    subgraph Storage ["Data Layer"]
        SQL["SQLite<br/>(db/custom.db)"]
    end

    V1 --> A1
    V2 --> A2 & A3
    V3 --> A4 & A5
    V4 --> A6 & A7 & A8
    V5 --> A9 & A10
    V6 --> A13
    V7 --> A11
    V8 --> A12 & A14

    A1 --> PRS
    A2 & A3 --> PRS
    A4 & A5 --> PRS
    A6 & A7 & A8 --> PRS
    A9 --> ENG & PRS
    A10 --> PRS
    A11 --> PRS
    A12 --> PRS
    A13 --> ENG & PRS
    A14 --> PRS

    PRS --> SQL
```

### 3.2 API Endpoint Reference Table

| Endpoint | Method | Input | Output | Processing |
|----------|--------|-------|--------|------------|
| `/api` | GET | — | `{ message }` | None (health check) |
| `/api/dashboard` | GET | — | KPIs, charts, recent runs | 5 parallel Prisma queries |
| `/api/employees` | GET | `?search, ?department, ?state` | Employee[] | Prisma `findMany` with filters |
| `/api/employees` | POST | Employee + SalaryStructure body | Created Employee | Prisma `create` (nested) |
| `/api/employees/[id]` | GET | URL param `id` | Employee + Salary | Prisma `findUnique` with include |
| `/api/employees/[id]` | PUT | Employee + Salary body | Updated Employee | Prisma `update` (nested) |
| `/api/employees/[id]` | DELETE | URL param `id` | Deleted Employee | Prisma `update` (soft: set `dateOfExit`) |
| `/api/attendance` | GET | `?employeeId, ?month, ?year, ?date` | Attendance[] | Prisma `findMany` with filters |
| `/api/attendance` | POST | Attendance body | Created/Updated record | Prisma `upsert` (by employeeId+date) |
| `/api/attendance/punch` | POST | `{ employeeId, method, ... }` | Attendance record | Upsert + auto totalHours calc |
| `/api/leaves` | GET | `?types` flag | LeaveApplication[] or LeaveType[] | Conditional query |
| `/api/leaves` | POST | LeaveApplication body | Created application | Prisma `create` + totalDays calc |
| `/api/leaves/[id]` | GET | URL param `id` | LeaveApplication | Prisma `findUnique` |
| `/api/leaves/[id]` | PUT | `{ status, approvedBy }` | Updated application | Transactional: update status + LeaveBalance |
| `/api/leaves/[id]` | DELETE | URL param `id` | Deleted application | Prisma `delete` |
| `/api/leaves/balance` | GET | `?employeeId, ?year` | LeaveBalance[] | Prisma `findMany` with include |
| `/api/payroll` | GET | `?month, ?year, ?status` | PayrollRun[] | Prisma `findMany` with filters |
| `/api/payroll` | POST | `{ month, year }` | Created PayrollRun | **Payroll Engine** + bulk Prisma `create` |
| `/api/payroll/[runId]` | GET | URL param `runId` | Run + all PayrollDetails | Prisma `findUnique` with include |
| `/api/payroll/[runId]` | PUT | `{ status }` | Updated run | State machine: draft→processed→paid |
| `/api/reports` | GET | `?type (pf\|esi\|tds\|pt\|lwf\|summary)` | Report data | Prisma aggregation queries |
| `/api/settings` | GET | — | Company settings | Prisma `findFirst` or defaults |
| `/api/settings` | PUT | Company body | Updated settings | Prisma `upsert` |
| `/api/salary-slip` | GET | `?employeeId, ?month, ?year` | Salary slip data | Stored detail OR **on-the-fly engine calc** |
| `/api/seed` | POST | — | Seed result | Wipe + create 1 Co, 4 leave types, 6 employees |

### 3.3 Payroll Processing Data Flow

```
┌──────────────┐     POST /api/payroll     ┌────────────────────┐
│  Payroll     │    { month, year }        │  Payroll API       │
│  View        │ ────────────────────────▶ │  Route Handler     │
│  (Client)    │                           └────────┬───────────┘
└──────────────┘                                    │
                                                     ▼
                                          ┌────────────────────┐
                                          │  Fetch All Active  │
                                          │  Employees with    │
                                          │  Salary Structures │
                                          └────────┬───────────┘
                                                   │
                          ┌────────────────────────┼────────────────────────┐
                          ▼                        ▼                        ▼
                   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
                   │  Employee 1  │         │  Employee 2  │         │  Employee N  │
                   │  + Salary    │         │  + Salary    │         │  + Salary    │
                   └──────┬───────┘         └──────┬───────┘         └──────┬───────┘
                          │                        │                        │
                          ▼                        ▼                        ▼
                   ┌──────────────────────────────────────────────────────────────┐
                   │                   PAYROLL ENGINE                             │
                   │                   (engine.ts)                                │
                   │                                                              │
                   │  1. Prorate earnings by paidDays/daysInMonth                 │
                   │  2. Calculate PF (Basic+DA × 12%, EPS capped ₹15K)          │
                   │  3. Calculate ESI (Gross ≤ ₹21K, 0.75%/3.25%)               │
                   │  4. Calculate PT (State-wise slab lookup)                   │
                   │  5. Calculate LWF (State + frequency-aware)                  │
                   │  6. Calculate TDS (Annualize → Tax Slabs → ÷12)             │
                   │  7. Compute Net = Earnings - All Deductions                 │
                   │  8. Compute CTC = Earnings + Employer Contributions          │
                   └──────────────────────────────────────────────────────────────┘
                          │                        │                        │
                          ▼                        ▼                        ▼
                   ┌──────────────────────────────────────────────────────────────┐
                   │                   Prisma Transaction                         │
                   │                                                              │
                   │  1. Upsert PayrollRun (company+month+year)                   │
                   │  2. Delete existing PayrollDetails for this run              │
                   │  3. Create N PayrollDetail records                           │
                   │  4. Update PayrollRun with aggregate totals                  │
                   └──────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
                                          ┌────────────────────┐
                                          │  SQLite Database   │
                                          │  (db/custom.db)    │
                                          └────────────────────┘
```

---

## 4. Authentication Flow

### 4.1 Current State — No Authentication

```mermaid
graph TD
    subgraph Current ["CURRENT STATE (v1.0.0)"]
        USER["👤 User / Admin"] -->|"Direct Access"| APP["🚀 PayrollPro Application"]
        APP -->|"No Auth Check"| API["📡 API Routes (14)"]
        API -->|"No Auth Check"| DB["💾 SQLite Database"]
        
        style USER fill:#ff6b6b,color:#fff
        style APP fill:#ff6b6b,color:#fff
        style API fill:#ff6b6b,color:#fff
        style DB fill:#ff6b6b,color:#fff
    end

    note["⚠️ CRITICAL SECURITY GAP\n\n• No authentication middleware\n• next-auth installed but NOT configured\n• No API route protection\n• No role-based access control\n• All endpoints publicly accessible\n• No rate limiting\n• No CSRF protection"]
```

### 4.2 Proposed Authentication Architecture (next-auth v4)

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant B as 🌐 Browser
    participant MW as 🛡️ Middleware
    participant NA as 🔐 next-auth
    participant API as 📡 API Route
    participant DB as 💾 SQLite

    Note over U,DB: Phase 1 — Login Flow
    U->>B: Navigate to /login
    B->>NA: GET /api/auth/signin
    NA->>DB: Find user by email
    DB-->>NA: User record + password hash
    NA->>NA: Verify credentials (bcrypt)
    NA-->>B: Set session cookie (JWT)
    B-->>U: Redirect to /dashboard

    Note over U,DB: Phase 2 — Authenticated Request
    U->>B: Click "View Payroll"
    B->>MW: GET /api/payroll + Cookie
    MW->>MW: Verify JWT token
    MW->>MW: Check session expiry
    alt Session Valid
        MW->>API: Forward request (user in header)
        API->>DB: Prisma query
        DB-->>API: Results
        API-->>B: JSON response
        B-->>U: Render data
    else Session Invalid
        MW-->>B: 401 Unauthorized
        B-->>U: Redirect to /login
    end

    Note over U,DB: Phase 3 — Role-Based Access
    U->>B: Click "Settings"
    B->>MW: GET /api/settings + Cookie
    MW->>MW: Verify JWT + check role
    alt Role = ADMIN
        MW->>API: Forward request
        API-->>B: Settings data
    else Role = EMPLOYEE
        MW-->>B: 403 Forbidden
        B-->>U: "Access Denied" message
    end
```

### 4.3 Proposed Middleware Chain

```
┌─────────────────────────────────────────────────────────────────┐
│                    REQUEST LIFECYCLE                             │
│                                                                 │
│  Incoming Request                                               │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐     ┌──────────────────┐                  │
│  │  Caddy Proxy    │────▶│  Next.js Server   │                  │
│  │  (Port 81→3000) │     │                   │                  │
│  └─────────────────┘     └────────┬──────────┘                  │
│                                   │                              │
│                                   ▼                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           src/middleware.ts (PROPOSED)                    │   │
│  │                                                          │   │
│  │  1. Check if route requires auth (/api/*)                │   │
│  │  2. Extract session token from cookies                   │   │
│  │  3. Verify JWT signature + expiry                        │   │
│  │  4. Extract user roles from token payload                │   │
│  │  5. Match roles against route access matrix              │   │
│  │  6. If valid: attach user to request headers              │   │
│  │  7. If invalid: return 401/403                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                   │                              │
│                                   ▼                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              API Route Handler                           │   │
│  │  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │   │
│  │  │ Validate  │→│ Business      │→│ Database          │  │   │
│  │  │ Input     │  │ Logic        │  │ Operations        │  │   │
│  │  │ (Zod)     │  │              │  │ (Prisma)          │  │   │
│  │  └──────────┘  └──────────────┘  └───────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Proposed Role-Based Access Matrix

| Role | Dashboard | Employees | Attendance | Leaves | Payroll | Reports | Settings | Salary Slips |
|------|-----------|-----------|------------|--------|---------|---------|----------|-------------|
| **Admin** | ✅ Full | ✅ CRUD | ✅ All | ✅ Approve | ✅ Process | ✅ All | ✅ CRUD | ✅ All |
| **HR** | ✅ Full | ✅ Read/Create | ✅ All | ✅ Approve | ✅ Process | ✅ Compliance | ❌ | ✅ All |
| **Manager** | ✅ Team | ✅ Team (Read) | ✅ Team | ✅ Team (Read) | ❌ | ✅ Team | ❌ | ✅ Team |
| **Employee** | ✅ Self | ❌ | ✅ Self | ✅ Self | ❌ | ❌ | ❌ | ✅ Self Only |

---

## 5. Module Dependencies

### 5.1 File Dependency Graph

```mermaid
graph TD
    subgraph Entry ["Entry Points"]
        PAGE["page.tsx<br/>(SPA Shell)"]
        LAYOUT["layout.tsx<br/>(Root Layout)"]
    end

    subgraph Components ["View Components (9)"]
        LAY["layout.tsx<br/>Sidebar + Shell"]
        TOP["top-bar.tsx<br/>Header Bar"]
        DASH["dashboard-view.tsx"]
        EMP["employees-view.tsx"]
        ATT["attendance-view.tsx"]
        LEA["leaves-view.tsx"]
        PAY["payroll-view.tsx"]
        SLIP["salary-slip-view.tsx"]
        REP["reports-view.tsx"]
        SET["settings-view.tsx"]
    end

    subgraph State ["State Management"]
        STORE["payroll-store.ts<br/>(Zustand)"]
    end

    subgraph Lib ["Library Layer"]
        DB["db.ts<br/>(Prisma Client)"]
        UTILS["utils.ts<br/>(cn utility)"]
        ENGINE["payroll/engine.ts<br/>(Calculation Engine)"]
        ENGIDX["payroll/index.ts<br/>(Barrel Export)"]
    end

    subgraph Hooks ["Custom Hooks"]
        MOB["use-mobile.ts"]
        TOAST["use-toast.ts"]
    end

    subgraph UI ["UI Primitives (47)"]
        BTN["button.tsx"]
        CARD["card.tsx"]
        DIALOG["dialog.tsx"]
        TABLE["table.tsx"]
        FORM["form.tsx"]
        SELECT["select.tsx"]
        INPUT["input.tsx"]
        TABS["tabs.tsx"]
        BADGE["badge.tsx"]
        AVATAR["avatar.tsx"]
        SKELETON["skeleton.tsx"]
        CHART["chart.tsx"]
        PROGRESS["progress.tsx"]
        OTHER["... +34 more shadcn/ui"]
    end

    subgraph External ["External Dependencies"]
        PRISMA["@prisma/client"]
        ZUSTAND["zustand"]
        RECHARTS["recharts"]
        FRAMER["framer-motion"]
        HOOKFORM["react-hook-form"]
        ZOD["zod"]
        SONNER["sonner"]
        DATEFNS["date-fns"]
        RADIX["@radix-ui/*"]
        LUCIDE["lucide-react"]
    end

    PAGE --> LAY & TOP & STORE
    PAGE --> DASH & EMP & ATT & LEA & PAY & SLIP & REP & SET
    LAYOUT --> PAGE

    LAY --> STORE & BTN & AVATAR & TOOLTIP["tooltip.tsx"]
    TOP --> BTN & SKELETON

    DASH --> CARD & CHART & BADGE & TABLE & PROGRESS
    EMP --> DIALOG & TABLE & FORM & BTN & SELECT & INPUT & TABS
    ATT --> CARD & TABLE & BTN & BADGE & DIALOG
    LEA --> DIALOG & TABLE & FORM & BTN & SELECT & BADGE
    PAY --> CARD & TABLE & DIALOG & BTN & SELECT & BADGE
    SLIP --> CARD & TABLE & BTN & SELECT
    REP --> CARD & TABLE & TABS & BTN & BADGE
    SET --> CARD & FORM & INPUT & SELECT & BTN & ACCORDION["accordion.tsx"]

    STORE --> ZUSTAND
    DASH --> RECHARTS
    LAY --> FRAMER
    EMP --> HOOKFORM & ZOD
    SET --> HOOKFORM & ZOD
    ATT --> DATEFNS

    UI --> RADIX
    UI --> LUCIDE
    OTHER --> RADIX & LUCIDE

    subgraph ServerOnly ["Server-Side Only"]
        API14["14 API Routes"]
        API14 --> DB & ENGINE
        DB --> PRISMA
        ENGINE --> ENGIDX
    end
```

### 5.2 Dependency Categories

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         DEPENDENCY MATRIX                                     │
├────────────────────┬──────────┬──────────────────────────────────────────────┤
│ Category           │ Count    │ Packages                                     │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ Core Framework     │ 3        │ next, react, react-dom                       │
│ Database           │ 2        │ @prisma/client, prisma                       │
│ State Management   │ 1        │ zustand                                      │
│ UI Framework       │ 40+      │ @radix-ui/* (40+ primitives)                 │
│ Styling            │ 5        │ tailwindcss, postcss, clsx, tw-merge, cva   │
│ Forms              │ 3        │ react-hook-form, @hookform/resolvers, zod    │
│ Charts             │ 1        │ recharts                                     │
│ Animation          │ 1        │ framer-motion                                │
│ Date Utilities     │ 1        │ date-fns                                     │
│ Toast              │ 1        │ sonner                                       │
│ Table              │ 1        │ @tanstack/react-table                        │
│ Icons              │ 1        │ lucide-react                                 │
│ Misc               │ 6        │ sharp, next-auth, next-intl, next-themes,    │
│                    │          │ react-markdown, react-syntax-highlighter      │
│ Unused (Installed) │ 14+      │ @dnd-kit/*, @tanstack/react-query, uuid,     │
│                    │          │ next-auth, next-intl, etc.                    │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ Dev Dependencies   │ 6        │ typescript, bun-types, eslint,               │
│                    │          │ eslint-config-next, tailwindcss, postcss     │
└────────────────────┴──────────┴──────────────────────────────────────────────┘
```

### 5.3 Import Dependency Heat Map

```
                    ┌─────────────────────────────────────────────────────┐
                    │  Which modules depend on which:                     │
                    ├──────────┬────────┬────────┬────────┬────────┬──────┤
                    │ Store   │ Engine │ db.ts  │ Recharts│ zod    │ hook- │
                    │          │        │        │        │        │ form  │
├───────────────────┼──────────┼────────┼────────┼────────┼────────┼──────┤
│ page.tsx          │ ████    │        │        │        │        │       │
│ layout.tsx        │         │        │        │        │        │       │
│ layout.tsx (comp) │ ████    │        │        │        │        │       │
│ top-bar.tsx       │         │        │        │        │        │       │
│ dashboard-view    │         │        │        │ ████   │        │       │
│ employees-view    │         │        │        │        │ ████   │ ████  │
│ attendance-view   │         │        │        │        │        │       │
│ leaves-view       │         │        │        │        │        │       │
│ payroll-view      │         │        │        │        │        │       │
│ salary-slip-view  │         │        │        │        │        │       │
│ reports-view      │         │        │        │        │        │       │
│ settings-view     │         │        │        │        │ ████   │ ████  │
├───────────────────┼──────────┼────────┼────────┼────────┼────────┼──────┤
│ API: payroll      │         │ ████   │ ████   │        │        │       │
│ API: salary-slip  │         │ ████   │ ████   │        │        │       │
│ API: all others   │         │        │ ████   │        │        │       │
└───────────────────┴──────────┴────────┴────────┴────────┴────────┴──────┘
```

### 5.4 Client vs Server Module Split

```
CLIENT-SIDE ONLY (Browser)                    SERVER-SIDE ONLY (Node.js)
├── src/components/payroll/layout.tsx         ├── src/app/api/** (14 route files)
├── src/components/payroll/top-bar.tsx        ├── src/lib/db.ts (Prisma Client)
├── src/components/payroll/dashboard-view.tsx └── src/lib/payroll/engine.ts
├── src/components/payroll/employees-view.tsx
├── src/components/payroll/attendance-view.tsx
├── src/components/payroll/leaves-view.tsx
├── src/components/payroll/payroll-view.tsx
├── src/components/payroll/salary-slip-view.tsx
├── src/components/payroll/reports-view.tsx
├── src/components/payroll/settings-view.tsx
├── src/store/payroll-store.ts (Zustand)
├── src/hooks/use-mobile.ts
└── src/hooks/use-toast.ts

SHARED (Both)
├── src/lib/utils.ts (cn function)
├── src/components/ui/** (47 shadcn components)
└── src/lib/payroll/index.ts (barrel, but only imported server-side)
```

---

## 6. Sequence Diagrams

### 6.1 Employee Lifecycle

```mermaid
sequenceDiagram
    actor Admin as 👤 Admin
    participant App as 🖥️ React SPA
    participant API as 📡 /api/employees
    participant DB as 💾 SQLite

    Note over Admin,DB: Create Employee
    Admin->>App: Click "Add Employee"
    App->>App: Open Create Dialog (4 tabs)
    Admin->>App: Fill Personal, Bank, Salary, Statutory
    App->>App: Validate with Zod schema
    App->>API: POST /api/employees<br/>{ ...employee, salaryStructure }
    API->>API: Auto-generate employeeCode (EMP001...)
    API->>DB: prisma.employee.create({ data, include: { salaryStructure } })
    DB-->>API: Created Employee record
    API-->>App: 201 Created + employee JSON
    App->>App: Update employee list (refreshKey++)
    App-->>Admin: Show success toast

    Note over Admin,DB: View Employee
    Admin->>App: Click employee row
    App->>API: GET /api/employees/EMP001
    API->>DB: prisma.employee.findUnique({ where, include })
    DB-->>API: Employee + SalaryStructure
    API-->>App: 200 + full employee data
    App-->>Admin: Open Edit Dialog (pre-filled)

    Note over Admin,DB: Update Employee
    Admin->>App: Modify fields in dialog
    App->>API: PUT /api/employees/EMP001<br/>{ ...updates, salaryStructure }
    API->>DB: prisma.employee.update({ data, include })
    DB-->>API: Updated Employee
    API-->>App: 200 + updated employee
    App->>App: Refresh employee list
    App-->>Admin: Show success toast

    Note over Admin,DB: Soft Delete Employee
    Admin->>App: Click "Delete" + Confirm
    App->>API: DELETE /api/employees/EMP001
    API->>DB: prisma.employee.update({ data: { dateOfExit: new Date() } })
    DB-->>API: Updated (soft-deleted)
    API-->>App: 200 + success
    App->>App: Remove from active list
    App-->>Admin: Show "Employee deactivated" toast
```

### 6.2 Payroll Processing Flow

```mermaid
sequenceDiagram
    actor Admin as 👤 Admin
    participant App as 🖥️ Payroll View
    participant API as 📡 /api/payroll
    participant Engine as ⚙️ Payroll Engine
    participant DB as 💾 SQLite

    Note over Admin,DB: Initiate Payroll Run
    Admin->>App: Select Month/Year (e.g., Jul 2025)
    Admin->>App: Click "Run Payroll"
    App->>App: Confirm dialog: "Process payroll for Jul 2025?"
    App->>API: POST /api/payroll<br/>{ month: 7, year: 2025 }
    
    Note over API,DB: Step 1 — Fetch Employees
    API->>DB: prisma.employee.findMany({<br/>  where: { status: 'active' },<br/>  include: { salaryStructure: true }<br/>})
    DB-->>API: N active employees with salary structures

    Note over API,DB: Step 2 — Process Each Employee
    loop For Each Employee (N iterations)
        API->>DB: prisma.attendance.findMany({<br/>  where: { employeeId, date in month }<br/>})
        DB-->>API: Attendance records for month
        API->>Engine: processEmployeePayroll({<br/>  employee, salaryStructure,<br/>  month: 7, year: 2025,<br/>  presentDays, daysInMonth<br/>})
        
        Note over Engine: Calculation Pipeline
        Engine->>Engine: 1. Prorate earnings
        Engine->>Engine: 2. PF = Basic+DA × 12%
        Engine->>Engine: 3. ESI check (gross ≤ ₹21K)
        Engine->>Engine: 4. PT = stateSlab(gross)
        Engine->>Engine: 5. LWF = stateCheck(state, month)
        Engine->>Engine: 6. TDS = annualize → slabTax → ÷12
        Engine->>Engine: 7. Net = Gross - Deductions
        Engine->>Engine: 8. CTC = Gross + Employer Contribs
        
        Engine-->>API: PayrollResult (40+ fields)
    end

    Note over API,DB: Step 3 — Persist Results
    API->>DB: prisma.$transaction([<br/>  payrollRun.upsert(),<br/>  payrollDetail.deleteMany(),<br/>  payrollDetail.createMany(N),<br/>  payrollRun.update(aggregates)<br/>])
    DB-->>API: Transaction committed
    API-->>App: 201 + PayrollRun with details

    Note over Admin,DB: Step 4 — Status Transition
    App->>App: Show processed payroll run
    Admin->>App: Click "Mark as Paid"
    App->>API: PUT /api/payroll/RUN_ID<br/>{ status: 'paid' }
    API->>DB: prisma.payrollRun.update({ status: 'paid' })
    DB-->>API: Updated
    API-->>App: 200 + updated run
    App-->>Admin: Status badge: "Paid" (green)
```

### 6.3 Leave Application & Approval Flow

```mermaid
sequenceDiagram
    actor Emp as 👤 Employee
    actor Mgr as 👤 Manager
    participant App as 🖥️ React SPA
    participant API as 📡 /api/leaves
    participant DB as 💾 SQLite

    Note over Emp,DB: Apply for Leave
    Emp->>App: Navigate to Leaves View
    Emp->>App: Click "Apply for Leave"
    App->>API: GET /api/leaves?types
    API->>DB: prisma.leaveType.findMany()
    DB-->>API: [CL, SL, EL, CO]
    API-->>App: Leave types list
    App-->>Emp: Select type (e.g., CL)
    Emp->>App: Select dates: Jul 15-17, 2025
    App->>App: Auto-calculate totalDays = 3
    Emp->>App: Enter reason: "Personal work"
    App->>API: POST /api/leaves<br/>{<br/>  employeeId, leaveTypeId,<br/>  startDate: "2025-07-15",<br/>  endDate: "2025-07-17",<br/>  totalDays: 3,<br/>  reason: "Personal work"<br/>}
    API->>DB: prisma.leaveApplication.create()
    DB-->>API: Created (status: "pending")
    API-->>App: 201 + LeaveApplication
    App-->>Emp: Toast: "Leave application submitted"

    Note over Mgr,DB: Approve Leave
    Mgr->>App: Navigate to Leaves View
    App->>API: GET /api/leaves
    API->>DB: prisma.leaveApplication.findMany({ include: [employee, leaveType] })
    DB-->>API: All applications
    API-->>App: 200 + applications list
    App-->>Mgr: Show pending applications table
    Mgr->>App: Click "Approve" on Employee's CL request
    App->>API: PUT /api/leaves/LEAVE_ID<br/>{ status: "approved", approvedBy: "manager_id" }
    
    Note over API,DB: Transactional Approval
    API->>DB: prisma.$transaction([<br/>  1. UPDATE LeaveApplication SET status='approved'<br/>  2. UPDATE LeaveBalance SET used = used + 3<br/>])
    DB-->>API: Transaction committed
    API-->>App: 200 + updated application
    App->>App: Refresh leave list
    App-->>Mgr: Toast: "Leave approved"

    Note over Emp,DB: Check Leave Balance
    Emp->>App: View leave balances
    App->>API: GET /api/leaves/balance?employeeId=EMP001&year=2025
    API->>DB: prisma.leaveBalance.findMany({ where, include: [leaveType] })
    DB-->>API: Balances: CL: 9/12, SL: 12/12, EL: 12/15, CO: 2/2
    API-->>App: 200 + balances
    App-->>Emp: Display balance cards with usage bars
```

### 6.4 Attendance Punch Flow

```mermaid
sequenceDiagram
    actor Emp as 👤 Employee
    participant App as 🖥️ Attendance View
    participant API as 📡 /api/attendance/punch
    participant DB as 💾 SQLite

    Note over Emp,DB: Punch In (Morning)
    Emp->>App: Click "Punch In" button
    App->>App: Capture current time: 09:05 AM
    App->>App: Get IP address (if available)
    App->>API: POST /api/attendance/punch<br/>{<br/>  employeeId: "EMP001",<br/>  method: "manual",<br/>  punchTime: "2025-07-15T09:05:00",<br/>  ipAddress: "192.168.1.x",<br/>  deviceInfo: "Chrome/MacOS"<br/>}
    API->>DB: prisma.attendance.upsert({<br/>  where: { employeeId_date },<br/>  create: { punchIn: "09:05", status: "present" },<br/>  update: { /* no-op if already punched in */ }<br/>})
    DB-->>API: Created/Updated record
    API-->>App: 200 + attendance record
    App-->>Emp: Button changes to "Punch Out" (red)<br/>Show "Punched in at 09:05 AM"

    Note over Emp,DB: Punch Out (Evening)
    Emp->>App: Click "Punch Out" button
    App->>App: Capture current time: 06:10 PM
    App->>API: POST /api/attendance/punch<br/>{<br/>  employeeId: "EMP001",<br/>  method: "manual",<br/>  punchTime: "2025-07-15T18:10:00"<br/>}
    API->>DB: prisma.attendance.upsert({<br/>  update: {<br/>    punchOut: "18:10",<br/>    totalHours: 9.08,<br/>    status: "present"<br/>  }<br/>})
    DB-->>API: Updated with punch out + totalHours
    API-->>App: 200 + updated record
    App-->>Emp: Show "Punched out at 06:10 PM"<br/>"Total: 9h 5m"<br/>Button resets to "Punch In"

    Note over Emp,DB: View Attendance Log
    Emp->>App: Select month: July 2025
    App->>API: GET /api/attendance?employeeId=EMP001&month=7&year=2025
    API->>DB: prisma.attendance.findMany({ where })
    DB-->>API: 22 attendance records
    API-->>App: 200 + attendance array
    App-->>Emp: Render attendance table<br/>with daily status, hours, method
```

### 6.5 Salary Slip Generation Flow

```mermaid
sequenceDiagram
    actor Emp as 👤 Employee
    participant App as 🖥️ Salary Slip View
    participant API as 📡 /api/salary-slip
    participant Engine as ⚙️ Payroll Engine
    participant DB as 💾 SQLite

    Note over Emp,DB: Request Salary Slip
    Emp->>App: Select Employee: EMP001
    Emp->>App: Select Month: July 2025
    Emp->>App: Click "Generate Slip"
    App->>API: GET /api/salary-slip?<br/>employeeId=EMP001&month=7&year=2025

    Note over API,DB: Path A — Stored Payroll Detail Exists
    API->>DB: prisma.payrollDetail.findFirst({<br/>  where: { employeeId, payrollRun: { month, year } }<br/>})
    
    alt Payroll Detail Found
        DB-->>API: Stored PayrollDetail (all 30+ fields)
        API->>DB: prisma.employee.findUnique({ include: [salaryStructure] })
        DB-->>API: Employee + Salary info
        API->>DB: prisma.company.findFirst()
        DB-->>API: Company details
        API-->>App: 200 + { employee, company, payrollDetail, taxComputation }
    else No Stored Detail (On-the-fly calculation)
        DB-->>API: null
        API->>DB: prisma.employee.findUnique({ include: [salaryStructure] })
        DB-->>API: Employee + SalaryStructure
        API->>Engine: processEmployeePayroll({ employee, month, year, presentDays, daysInMonth })
        Engine-->>API: PayrollResult (calculated on-the-fly)
        API->>DB: prisma.company.findFirst()
        DB-->>API: Company details
        API-->>App: 200 + { employee, company, payrollResult, taxComputation }
    end

    Note over Emp,DB: Render Salary Slip
    App->>App: Format salary slip with sections:
    App->>App: ┌─ Company Header ─────────────┐
    App->>App: │  Acme Corp, PAN, TAN, GSTIN  │
    App->>App: ├─ Employee Info ──────────────┤
    App->>App: │  Name, ID, Dept, Designation │
    App->>App: ├─ Earnings ───────────────────┤
    App->>App: │  Basic, DA, HRA, Conv, Med   │
    App->>App: │  Special, OT, Bonus          │
    App->>App: ├─ Deductions ─────────────────┤
    App->>App: │  PF, ESI, TDS, PT, LWF      │
    App->>App: ├─ Employer Contributions ─────┤
    App->>App: │  PF, ESI, Gratuity           │
    App->>App: ├─ Tax Computation ────────────┤
    App->>App: │  Regime, Slabs, Rebate, Cess │
    App->>App: └─ Net Pay & CTC ──────────────┘
    App-->>Emp: Display formatted salary slip<br/>with print button
```

### 6.6 Dashboard Data Aggregation Flow

```mermaid
sequenceDiagram
    actor User as 👤 User
    participant App as 🖥️ Dashboard View
    participant API as 📡 /api/dashboard
    participant DB as 💾 SQLite

    User->>App: Navigate to Dashboard
    App->>API: GET /api/dashboard

    par Parallel Queries (5 simultaneous)
        API->>DB: prisma.employee.count({ where: { status: 'active' } })
    and
        API->>DB: prisma.attendance.count({<br/>  where: { date: today, status: 'present' }<br/>})
    and
        API->>DB: prisma.leaveApplication.count({<br/>  where: { startDate <= today, endDate >= today, status: 'approved' }<br/>})
    and
        API->>DB: prisma.employee.groupBy({<br/>  by: ['department'],<br/>  _count: true<br/>})
    and
        API->>DB: prisma.payrollRun.findMany({<br/>  orderBy: { createdAt: 'desc' },<br/>  take: 5<br/>})
    end

    DB-->>API: totalEmployees: 6
    DB-->>API: presentToday: 4
    DB-->>API: onLeaveToday: 1
    DB-->>API: departmentCounts: [{ Engineering: 3, HR: 2, Finance: 1 }]
    DB-->>API: recentPayrollRuns: [Jun 2025, May 2025, ...]

    API->>API: Assemble response:
    API->>API: {<br/>  totalEmployees, presentToday, onLeaveToday,<br/>  departmentCounts, stateCounts,<br/>  recentPayrollRuns,<br/>  latestRun: { month, year, totals }<br/>}

    API-->>App: 200 + dashboard data

    App->>App: Render 4 KPI cards (employees, present, leave, payroll)
    App->>App: Render PieChart (department distribution)
    App->>App: Render BarChart (payroll trends)
    App->>App: Render recent payroll runs table

    App-->>User: Dashboard with all widgets
```

### 6.7 Seed Data Initialization Flow

```mermaid
sequenceDiagram
    actor Admin as 👤 Admin
    participant App as 🖥️ TopBar
    participant API as 📡 /api/seed
    participant DB as 💾 SQLite

    Admin->>App: Click "Seed Demo Data"
    App->>App: Confirm: "This will erase ALL data. Continue?"
    Admin->>App: Click "Confirm"
    App->>API: POST /api/seed

    Note over API,DB: Destructive Reset
    API->>DB: prisma.payrollDetail.deleteMany()
    API->>DB: prisma.payrollRun.deleteMany()
    API->>DB: prisma.leaveApplication.deleteMany()
    API->>DB: prisma.leaveBalance.deleteMany()
    API->>DB: prisma.salaryStructure.deleteMany()
    API->>DB: prisma.attendance.deleteMany()
    API->>DB: prisma.leaveType.deleteMany()
    API->>DB: prisma.employee.deleteMany()
    API->>DB: prisma.company.deleteMany()

    Note over API,DB: Create Seed Data
    API->>DB: prisma.company.create({<br/>  name: "Acme Corp",<br/>  pan: "ABCDE1234F",<br/>  state: "Maharashtra",<br/>  ...<br/>})
    
    API->>DB: prisma.leaveType.createMany([<br/>  { name: "Casual Leave", shortCode: "CL", totalDays: 12 },<br/>  { name: "Sick Leave", shortCode: "SL", totalDays: 12 },<br/>  { name: "Earned Leave", shortCode: "EL", totalDays: 15 },<br/>  { name: "Compensatory Off", shortCode: "CO", totalDays: 2 }<br/>])

    loop Create 6 Employees with Salary Structures
        API->>DB: prisma.employee.create({<br/>  data: {<br/>    employeeCode, name, department,<br/>    state, taxRegime, ...,<br/>    salaryStructure: { create: {<br/>      basic, da, hra, ...<br/>    }},<br/>    leaveBalances: { create: [...] }<br/>  }<br/>})
    end

    DB-->>API: All seed data created
    API-->>App: 200 + {<br/>  company: 1, employees: 6,<br/>  leaveTypes: 4, message: "Seeded successfully"<br/>}
    App->>App: triggerRefresh() — reload all views
    App-->>Admin: Toast: "Demo data seeded successfully!"
```

---

## Appendix A: Technology Stack Reference

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Runtime | Bun | Latest | JavaScript runtime (Node.js compatible) |
| Framework | Next.js | 16.1.1 | React framework with App Router |
| Language | TypeScript | 5.x | Type-safe JavaScript |
| UI Library | React | 19.0.0 | Component library |
| UI Components | shadcn/ui (New York) | — | 47 Radix UI primitives |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| State | Zustand | 5.0.6 | Client state management |
| Database | SQLite | — | Embedded file-based database |
| ORM | Prisma | 6.11.1 | Type-safe database client |
| Charts | Recharts | 2.15.4 | Data visualization |
| Animation | Framer Motion | 12.23.2 | UI animations |
| Forms | React Hook Form | 7.60.0 | Form state management |
| Validation | Zod | 4.0.2 | Schema validation |
| Icons | Lucide React | — | SVG icon library |
| Toast | Sonner | 2.0.6 | Toast notifications |
| Dates | date-fns | 4.1.0 | Date manipulation |
| Reverse Proxy | Caddy | — | Port 81 → 3000 |

## Appendix B: File Count Summary

| Category | Count | Total Lines (approx) |
|----------|-------|---------------------|
| View Components | 9 | ~7,018 |
| UI Components (shadcn) | 47 | ~5,600 |
| API Route Handlers | 14 | ~2,500 |
| Payroll Engine | 2 | ~600 |
| State Management | 1 | ~30 |
| Hooks | 2 | ~150 |
| Configuration Files | 8 | ~200 |
| Database Schema | 1 | ~120 |
| **Total Source Files** | **~84** | **~16,218** |

---

*Generated for PayrollPro v1.0.0 — Indian Payroll Management System*  
*Architecture documentation covers system design, database schema, API flows, and interaction sequences.*
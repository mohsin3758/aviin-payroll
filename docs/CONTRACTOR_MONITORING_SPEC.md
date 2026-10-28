# Contractor Workforce Management (Exception-Based) — Technical Spec v2

Status: **DRAFT v2 for approval — no application code has been changed.**
Written against the repo at commit `af81eb7` (2026-10-28). v2 merges the first spec with the owner's
"Master Implementation Plan" after checking that plan's assumptions against the real code.

---

## 0. Core principle

Not "how do we check every contractor every day?" but
**"how does the system prove everything is normal, and tell Aviin only when something is not?"**

- Normal flow: Deploy → Check in → Work → Pulse → Daily update → Client confirm → Timesheet → Payroll.
- Exception flow: Missed event → Reminder → Warning → Coordinator task → Client notice → Escalation.
- The coordinator's home screen is **"What needs my attention?"**, not "who is present?".

Non-negotiable rules:
1. **The existing PayrollPro payroll stays the system of record.** No second payroll engine. Monitoring feeds *approved days/hours* into the existing engine.
2. **Pay- or contract-affecting results are suggestions** until an admin approves (pre-fill + confirm). Never silently automatic.
3. **Nothing is hard-coded that is a business, legal or contractual rule** (grace, thresholds, 9–10 h, leave notice, caps). All are settings.
4. Contractors use the client's tools; **no integration with client Jira/Teams/etc.** Status is self-reported and client-confirmed.
5. No spyware: no GPS tracking, webcam, keystroke or screen capture. Location/face only for on-site roles, only when enabled and consented.
6. If something here conflicts with existing production behavior: **stop and report**, never silently replace it.

## 1. Policy decisions register (Phase 0 — all configurable, none hard-coded)

WhatsApp provider/templates · SMS fallback yes/no · message retention · quiet hours · daily message cap · contractor consent wording ·
DPDP notice · contract/exclusivity wording · leave policy · attendance-correction policy · grace · half-day rule · absence rule ·
payroll-deduction policy · client sign-off policy · timesheet policy · working-hour policy (see §7.3) · escalation policy.

Owner-approved starting values: grace **15 min**; corrections **2/month**; leave notice **48 h, per-client override**; standard day **9 h**, overtime per-client (§7.3, default unpaid);
half-day/absent thresholds = recommendations in §7.2 (confirm with counsel/contracts).

## 2. What exists today (verified in code)

| Area | Reality |
|---|---|
| Stack | Next.js 16 App Router, React 19, Prisma 6 + **SQLite** (`file:/app/db/custom.db`), Tailwind/shadcn, Vitest. One Docker container; `prisma db push --accept-data-loss` runs on every boot (`docker/docker-entrypoint.sh`). |
| Build | `next.config.ts` has `typescript.ignoreBuildErrors: true` — **type errors do not fail builds**. Uncommitted unrelated change (`/guide` rewrite) — leave alone. |
| Roles | `Role = "admin" \| "hr" \| "manager" \| "employee"` (`src/lib/auth.ts`); JWT cookie; middleware rejects all `/api/*` without a session except `/api/auth/`, `/api/seed`, `/api/onboarding-invite/`. |
| People | Contractors are `Employee` rows (`employmentType`: `permanent`/`contractor`/`daily_wage`/`hourly`). |
| Clients/Projects | **Do not exist.** `Employee.client` / `Candidate.client` are free text. |
| Attendance | `Attendance` (unique employee+IST day), multi-session punches, face verify, geofence, WFH, `AttendanceRegularizationRequest`, `Shift` (grace 15), `Holiday`, `LeaveApplication`. Single punch path: `recordPunch()` in `src/lib/attendance-punch.ts`. |
| Payroll | `src/lib/payroll/engine.ts` **already has alternate pay modes** (`daily_wage`/`hourly`/`contractor`) computed from *units worked* (days/hours), with contractor TDS. This is the integration target: monitoring supplies approved units; the engine computes. (To confirm in Phase 1 step 1: exactly where a payroll run takes units-worked input today.) |
| Timesheets / invoices | **No such models.** Only the one-time placement fee in `candidate-billing.ts`. |
| WhatsApp | `src/lib/whatsapp.ts` send-only, one hard-coded template; config on `Company`; settings + test route exist. No inbound webhook, buttons, or template registry. |
| Notifications | In-app `Notification` rows only. |
| Scheduler/queue/Redis | **None.** |

**Phase 1 step 1 audit result — how contractor pay works today (verified 2026-10-28):**
- Contractors are paid via `POST /api/payroll/alternate-pay` (admin/hr with the `process_payroll` feature), taking `entries[{employeeId, unitsWorked, rateOverride?}]` for one month.
- `daily_wage` → `SalaryStructure.dailyRate × days`; `hourly` → `SalaryStructure.hourlyRate × hours`; `contractor` → **no standing rate on file**: `rateOverride` is required and the engine pays `rate × units` (flat invoice, normally units = 1) minus 10% TDS (`CONTRACTOR_TDS_RATE`).
- That endpoint **processes immediately** (creates/extends a `PayrollRun` of `runType: "alternate_pay"`, `status: "processed"`) with no draft step, and rejects anyone already paid that month (409).
- **Consequence for the design:** the monitoring module must NOT call this endpoint. Month-lock produces a **pre-fill** (suggested `unitsWorked` / suggested `rateOverride` per contractor) shown to the admin, who submits it through the existing Alternate Pay dialog. The existing engine, TDS and run states stay untouched.
- **Pay model (owner answer, 2026-10-28): all three exist, chosen per client/project deal** — flat **monthly** fee, **per day**, or **per hour**. For monthly fees the day value depends on the deal: **calendar** basis (fee ÷ 30/31 calendar days, weekly offs paid) or **working-day** basis (fee ÷ the client's working days in the month, typically 20/21/22).
  Stored on `Assignment` as `payType` (`monthly`/`daily`/`hourly`), `payRate`, `monthlyDayBasis` (`calendar`/`working`). Implemented as the pure, tested function `computePayPrefill()` in `src/lib/workforce/pay-prefill.ts`, which expresses every type as rate × units (the form the existing engine takes): monthly → units 1 with a prorated amount; daily → payable days × day rate; hourly → approved hours × hourly rate. `countWorkingDays()` derives the 20/21/22 figure from the assignment's working weekdays minus client holidays.
  Output is a **suggestion** (`unitsWorked`, `rateOverride`, plus a plain-language working) for an admin to submit via the existing Alternate Pay dialog. Payroll validation also flags a mismatch when an employee's `SalaryStructure.dailyRate/hourlyRate` differs from the assignment's `payRate`.
  **Owner decisions (2026-10-28):** on **daily-rate deals only days actually worked are paid** (weekly offs, holidays and paid leave are not paid) — so the `payableDays` input is days worked (half-day = 0.5). **Each client gets its own holiday list** (`ClientHoliday`, `/api/clients/[id]/holidays`), separate from the company-wide `Holiday` table, because the monthly "working days" figure (20/21/22) follows the client's calendar.

Duplicate-avoidance (must NOT be recreated): payroll calc, employee master, attendance, leave, WFH, holidays, shifts, auth/RBAC, audit log, notifications, geofence/face.
Genuinely new: Client, ClientContact, Project, Assignment, policy, DailyStatus, messaging engine, exceptions, timesheet entries, client confirmation/sign-off, reports, worker.

## 3. Roles and access

**Decision (2026-10-28, supersedes the earlier "add two roles" plan): Phase 1 adds NO new role values.**
Reason, verified in code: about a dozen existing routes (documents, helpdesk, exit requests, attendance regularizations, and the `scopeToOwnEmployeeIfSelf` helper) only restrict the literal role `employee`; any new role string would silently be treated as elevated there. Instead, *coordinator is a capability derived from assignments*:
- `admin` / `hr` — full access to the module (the only ones who create/edit clients, projects, assignments, holidays).
- `manager` — acts as **resource coordinator / client coordinator / KAM** for exactly the assignments where their user id is set in `resourceCoordinatorId` / `clientCoordinatorId` / `kamId`. Read-only on master data; the call queue (later step) is scoped the same way. Sees nothing for a client/project the module is switched off for.
- `employee` — a contractor; sees only their own assignments.
- Pay terms (`payType`, `payRate`, `monthlyDayBasis`) are hidden from managers and contractors (same policy as salary figures).
- Only an `admin` (not hr) can switch the module's feature flags on.
Dedicated roles (`resource_coordinator`, `client_coordinator`, `kam`, `contractor_care`, `finance_admin`, `payroll_admin`, `management`) are deferred until every existing `=== "employee"` check has been hardened to an allow-list, as a separate reviewed change. Implementation: `src/lib/workforce/access.ts` (pure, unit-tested) + `scope-server.ts`.

**Client representative** = not a User in Phases 1–2. Acts through signed, expiring, single-purpose links (hash stored, like onboarding invites).
An optional `client_manager` login is a Phase 3 decision.

**Contractor actions without a password** (WhatsApp buttons, EOD web link): signed per-contractor, per-assignment, per-day links/tokens; single-purpose, expiring. Contractors who also have a My Portal login can use it.

Scoping rules: coordinator sees only assigned clients/projects/contractors; contractor sees self only; client rep sees only their project; admin/hr global.
Reuse `requireSelfOrRole` / `scopeToOwnEmployeeIfSelf`. **Every new route is added to the real-HTTP RBAC integration tests** (missing ownership checks were this app's most common past bug).

## 4. Data model (new Prisma models, additive only)

Strings not enums; `@@index` on query keys; IST day via `istDateOnly()`; every model with a user-facing action writes `logAudit`.

```
FeatureFlag       key, scope("company"|"client"|"project"), clientId?, projectId?, enabled(default false)
Client            id, code("CL-001"), companyId, name, active, timezone, notes
ClientContact     id, clientId, name, phone, email, kind("representative"|"coordinator"|"billing"), active
LegacyClientMap   id, rawName, clientId?, status("unmapped"|"mapped"|"duplicate"|"ignored"), mappedBy, mappedAt   -- migration audit
Project           id, clientId, name, active, start/end, workMode("remote"|"onsite"|"hybrid"), location?, timezone?
SettingsPolicy    id, scope("company"|"client"|"project"|"assignment"), scopeId?, values JSON (see §7), updatedBy
                  -- resolution order: Assignment → Project → Client → Company default; per-key, not whole-object
Assignment        id, employeeId, projectId, clientRepContactId?, resourceCoordinatorId, clientCoordinatorId, kamId?,
                  startDate, endDate?, workMode, location?, timezone, tier("full_time"|"hourly"),
                  expectedHoursPerDay?, expectedHoursPerWeek?, workingDays, contractType("exclusive"|"non_exclusive"|"restricted"),
                  declarationAt?, declarationNote?, status("planned"|"active"|"paused"|"ended")
                  -- pay rate/bill rate/billing type: NOT stored here until Phase 1 step 1 confirms how contractor pay is configured
                  --   today (avoid duplicating SalaryStructure). Bill-side fields deferred with billing (Phase 4).
DailyStatus       id, assignmentId, date, state("pending"|"present"|"late"|"half_day"|"absent"|"leave"|"holiday"|"weekly_off"),
                  checkInAt?, checkInChannel("whatsapp"|"web"|"missed_call"|"coordinator"), checkOutAt?, hoursWorked?,
                  pulsesSent, pulsesAnswered, eodMode?, eodCompleted?, eodInProgress?, eodBlockers?, eodHours?, eodTomorrow?, eodRaw?, eodAt?,
                  clientConfirm("none"|"confirmed"|"disputed"), clientConfirmAt?, locked, attendanceId?
                  @@unique([assignmentId, date])
Message           id, assignmentId, employeeId?, contactId?, direction("out"|"in"), type, channel, template?, priority,
                  scheduledAt, sentAt?, status("queued"|"sent"|"delivered"|"read"|"failed"|"replied"|"suppressed"),
                  suppressReason?, failureReason?, retryCount, correlationId, providerMessageId?, payload JSON
                  @@unique([assignmentId, date, type, seq])   -- idempotency
ExceptionCase     id, type, severity(0-5), assignmentId?, employeeId?, projectId?, ownerId(User), date,
                  status("open"|"in_progress"|"waiting_contractor"|"waiting_client"|"resolved"|"escalated"|"dismissed"),
                  slaDueAt, resolution?, resolvedAt?, resolvedBy?, notes, history JSON
CallTask          id, exceptionId, assignedTo, dueAt, outcome("called"|"connected"|"no_answer"|"callback_requested"|"leave"|
                  "emergency"|"client_issue"|"technical_issue"|"other")?, note?, closedAt?
Dispute           id, dailyStatusId, raisedBy("contractor"|"client"|"system"), reason, comment, disputedHoursOrStatus,
                  status("open"|"resolved"|"rejected"), resolvedBy?, resolution?
Correction        id, dailyStatusId, requestedBy, approvedBy?, originalValue JSON, newValue JSON, reason, clientConfirmed, createdAt
TimesheetEntry    id, assignmentId, date, hours, note?, status("draft"|"submitted"|"approved"|"rejected"), approvedByContactId?, approvedAt?   -- Phase 2
Suggestion        id, kind("deduction"|"warning"|"replacement"|"payroll_blocker"), employeeId, assignmentId?, period, detail JSON,
                  status("pending_admin"|"approved"|"rejected"|"modified"), decidedBy?, decidedReason?, decidedAt?
ClientSignOff     id, projectId, period("week"|"month"), periodStart, periodEnd, signedByContactId?, signedAt?, status
MonthLock         id, projectId, year, month, lockedAt, lockedBy, payrollPrefillAt?
WaTemplate        id, name, language, purpose, approvalStatus
ReliabilityScore  assignmentId, period, components JSON, score, band, reasons JSON, computedAt                 -- Phase 3
```

Relationship to existing tables:
- `Employee` unchanged (legacy `client` text kept read-only). `DailyStatus` **writes into existing `Attendance`** on lock (same unique key) so reports/leave/WFH/payroll keep working unchanged.
- Existing `LeaveApplication`/`WfhRequest`/`Holiday` are read for leave/holiday/WFH state — not duplicated. Contractor leave requests reuse `LeaveApplication` with the notice rule added as a validation.
- Existing `AttendanceRegularizationRequest` stays for permanent staff; contractors use `Correction` (cap configurable, default 2/month).
- Legacy client mapping: mapping screen, duplicate detection (normalized-name matching), unresolved-client report, migration audit log. Historical rows are never altered or deleted.

## 5. Feature flags (all default **off**)

`contractor_workforce_enabled`, `whatsapp_enabled`, `client_digest_enabled`, `client_confirmation_enabled`, `exception_engine_enabled`,
`payroll_prefill_enabled`, `reliability_score_enabled`, `sms_fallback_enabled`, `voice_automation_enabled`.
Company-level always; client- and project-level where it makes sense (pilot = one project). With every flag off, existing payroll/attendance behavior is byte-for-byte unchanged (tested).

## 6. Messaging engine

Single centralized engine; business logic never calls a provider directly.

- **Provider abstraction:** `NotificationProvider` interface with `WhatsAppProvider` (v1), `EmailProvider` (reuse `mailer.ts`), `SMSProvider` (optional, only if chosen). Business code asks for a *message type*, the engine picks template/channel.
- **Message types:** CHECK_IN, LATE_REMINDER, FINAL_REMINDER, CALL_ESCALATION, CLIENT_STATUS_NOTICE, STILL_ONLINE, END_OF_DAY, EOD_REMINDER, CLIENT_DIGEST, LEAVE_ACKNOWLEDGEMENT, TIMESHEET_REMINDER, APPROVAL_REMINDER.
- **Safety:** idempotency key per (assignment, date, type, seq); duplicate-click and duplicate-webhook safe; retry with backoff; delivery tracking; quiet hours; leave/holiday/weekly-off/inactive-assignment suppression (logged as `suppressed` with reason); correlation ID on every message.
- **Daily message cap (decision): default 8 contractor-directed automated messages/day, configurable per company/client/project, plus a hard ceiling of 12 that nothing can exceed.**
  Reason: a normal day sends 4 (check-in, two pulses, end-of-day prompt); the worst-case ladder sends 8 (check-in, two reminders, two pulses, EOD prompt, two EOD reminders). A cap of 6 would silence the end-of-day reminders on exactly the days they matter.
  When near the cap, the engine drops lowest priority first (2nd EOD reminder, then 1st EOD reminder, then pulses) — never the check-in prompt or a coordinator/client notice. Coordinator and client messages are counted separately and not against the contractor's cap.
- **WhatsApp specifics:** outbound templates; inbound webhook `GET` handshake + `POST` (verify `X-Hub-Signature-256`, rate-limited, idempotent on message id); button replies; delivery/failed status callbacks; correlation. Webhook path added to the middleware public list (self-authenticated). New `Company` secrets `whatsappAppSecret`, `whatsappVerifyToken` (never returned by GET, same as the access token).
  24-hour window: after a contractor replies, free-form/interactive messages are allowed for 24 h; business-initiated messages outside it need approved templates. Because contractors reply daily, many prompts may fit the window — **verify against Meta's current rules in Phase 0 before deciding which prompts need templates** (affects approval workload and cost).
- A **failed send / number not on WhatsApp / template rejected** raises an exception immediately — a failed send must never look like a silent contractor.
- Templates to submit early: see **[WHATSAPP_TEMPLATES.md](WHATSAPP_TEMPLATES.md)** (draft wording, categories, buttons, sample values) — the owner submits them in Meta WhatsApp Manager; the app cannot do this for them.
- **SMS fallback decision: not in v1.** WhatsApp + the human call is the fallback. India SMS needs DLT registration and per-message cost, and adds a second channel to tune. The provider abstraction keeps an `SMSProvider` slot; revisit after the pilot if WhatsApp delivery/failure data shows a real gap.

## 7. Rule engine

### 7.1 Inheritance
`Assignment → Project → Client → Company default`, resolved per key. Every setting records where its effective value came from (shown in the UI).

### 7.2 Settings (defaults; owner-approved ones marked ✔)
- Shift start/end, working days, weekly off, timezone (client's, default IST).
- Grace ✔15 min → Late. Half-day: check-in later than 2 h, **or** hours < 50% of required, **or** ≥2 of 3 pulses missed with no reason *(recommendation)*. Absent: no check-in and no valid reason, or hours < ~4 *(recommendation)*. Repeat-late review after 3/month (review task only).
- Leave notice ✔48 h (per-client override); same-day sick allowed with reason, coordinator+client notified.
- Corrections ✔2/month; each stores original value, new value, reason, requester, approver, timestamp, client confirmation; 3rd needs admin override + written reason.
- Pulse times (default 13:00, 16:00), miss limit, reminder offsets, escalation steps, quiet hours, daily cap (§6).
- **End-of-day mode** (§9).

### 7.3 Working hours and overtime (owner decision 2026-10-28)
**Decision:** the standard working day is **9 hours** (`scheduledHoursPerDay = 9`). Hours beyond that are **overtime (OT)**, and OT handling is a **per-client setting** because most IT-sector clients do not pay for overtime. OT is built in Phase 1, not deferred.

Settings (company default, overridable per client/project/assignment; each shows its definition in the UI):

| Setting | Default | Meaning |
|---|---|---|
| `scheduledHoursPerDay` | **9** | The standard day. Full-time expectation. |
| `breaksIncluded` | **true** *(decided: standard IT 9-hour shift, check-in to check-out)* | The 9 h is the check-in-to-check-out span including breaks, the simplest rule for contractors and clients. If false, only worked time counts. |
| `shortHoursToleranceMinutes` | 30 | Shortfall within this is ignored. Beyond it → "short hours" exception for a human to review. A shortfall alone never changes pay; only half-day/absent rules (§7.2) or an admin-approved suggestion can. |
| `overtimePolicy` | **`none`** | `none` = hours over 9 are recorded but **not payable** (the usual IT-client position). `client_approved` = OT is payable only for hours the client rep approves in the daily digest. `auto` = all hours over the threshold are payable. |
| `overtimeStartsAfterHours` | 9 | When OT starts counting. |
| `maxPayableHoursPerDay` | none | Optional ceiling on payable hours (OT included), even if more were worked. |
| `overtimeRateMultiplier` | 1.0 | Applied only to payable OT hours; a pay-side setting, separate from anything billed to the client. |

How hours are measured: check-in to check-out, cross-checked with the contractor's end-of-day reported hours; if they disagree beyond tolerance the day goes to the coordinator, and **client confirmation prevails**. OT is shown in the client digest as its own line so the client sees it and, where policy needs it, approves it.

Payroll: OT that is payable is passed to the **existing** payroll engine as additional units worked (it already pays hourly/contractor/daily-wage workers from units worked, `src/lib/payroll/engine.ts`); this module computes no money. Phase 1 step 1 confirms exactly how the engine takes the hours input. Unpayable OT is still recorded for client reporting and reliability context (not penalized).

Pay-affecting results from hours (short hours, absence) remain suggestions pending admin approval (§12).

## 8. Daily process and exception engine

### 8.1 Normal and escalation timeline (offsets from shift start T; all configurable)
| When | Action |
|---|---|
| T−15 | CHECK_IN prompt (**Check in** button). Records date, time, contractor, assignment, project, source, timezone |
| T+15 | LATE_REMINDER; state = **Late** (never Absent yet) |
| T+30 | FINAL_REMINDER (no human task unless the assignment rule requires one) |
| T+45 | **CallTask** for resource coordinator (outcome list in §4) |
| T+90 | Unresolved → client_coordinator notified; neutral CLIENT_STATUS_NOTICE to client ("status pending, Aviin is handling it") — no private details |
| 13:00 / 16:00 | STILL_ONLINE pulse; 2 consecutive misses → CallTask (one miss is never proof of absence) |
| Shift end −30 | END_OF_DAY prompt; EOD_REMINDER +30 / +60 |
| Evening | CLIENT_DIGEST (contractor, check-in, hours, status, completed, blockers, exceptions, leave, pending) → rep taps **Confirm** or **Dispute** (dispute requires reason, comment, date, contractor, disputed hours/status → creates Dispute; payroll untouched) |
| Next morning | Missing-EOD people top the coordinator queue; day auto-closes when no `pending` remain |

### 8.2 Exception engine (central)
Exception types: missing check-in, late, missed pulse, missing EOD, missing timesheet, client dispute, repeated absence, no response, message failure, assignment expiry, contract expiry, missing pay rate, **overlapping assignments / schedule conflicts / impossible hours**, payroll blocker, payroll mismatch, client escalation. *(Billing mismatch added when billing exists — Phase 4.)*

Severity: **0** normal · **1** automated reminder · **2** warning · **3** coordinator/KAM action · **4** management escalation · **5** critical client/business issue.
Every exception stores type, severity, owner, created time, SLA, status, resolution, resolution time, notes, audit history. Severity auto-rises when SLA is breached.
Overlap/conflict detection creates an exception for a human; it **never** labels anyone as moonlighting.

### 8.3 Evidence priority
Client rep confirmation > coordinator call outcome > contractor self check-in. Disagreement → Dispute for the coordinator.

## 9. End-of-day update — three selectable modes

Fields (target < 60 s): Completed · In progress · Blockers · Hours worked · Tomorrow. A workforce status update, not a project-management replacement.

`eodMode` is a setting per company/client/project (and fallback order), admin-selectable:
1. **Web link** (default, recommended): signed single-use mobile form, no login; reliable; all five fields.
2. **WhatsApp Flow**: Meta-hosted in-chat form; best UX but needs Flow approval and has Meta-side limits.
3. **Free-text reply**: contractor replies in plain text; stored raw (`eodRaw`); a simple parser extracts hours if present; coordinator can fix fields. Lowest friction, least structured.

If the chosen mode fails (e.g., Flow not delivered), the engine falls back in the configured order (default Flow → web link → free text). Mode used is recorded per day.

## 10. Scheduler / worker

Separate worker process in the same container (started by the entrypoint), 60-second tick querying due work from the DB; no Redis.
All state in DB; idempotent steps; restart-safe catch-up limited to a safe window; heartbeat row + dashboard alert if no tick for 5 min; timezone via `istDateOnly()`/client timezone.
Swap to BullMQ+Redis (MIT) only if scale triggers hit (§17). Data-driven rules mean no rule rewrite on swap.

## 11. Screens

Navigation via existing `ViewType` store; shadcn; **Dialog width overrides must use `sm:max-w-*`** (known bug). Mobile-first for contractor and coordinator screens.
1. **What Needs My Attention** (coordinator home): Critical · Call Now · Waiting for Contractor · Waiting for Client · Payroll Exceptions · Contract Expiry · Today's Unresolved.
2. **Call Queue** (primary): contractor, client, project, reason, severity, time overdue, last response, assigned coordinator, SLA; actions Call (`tel:`), WhatsApp, Mark contacted, Resolve, Escalate, Reassign — clear without opening other screens.
3. **Live Board**: Not Started · Checked In · Late · Leave · Unavailable · Exception · Checked Out · Missing Update; filters client/project/coordinator/KAM/status/location/work mode.
4. **Clients & Projects**, **Assignments** (bulk Excel import), **Policy editor** (shows effective value + source, plain-language ladder preview), **Legacy Client Mapping**.
5. **Disputes & Corrections** (counter x/2 per month, evidence side by side).
6. **Contractor portal** (mobile-first, inside My Portal + token pages): CHECK IN · CHECK OUT · AVAILABLE · LEAVE · STILL ONLINE · DAILY UPDATE · TIMESHEET.
7. **Client pages** (token links; coordinator-side admin view): daily digest, weekly/monthly sign-off, dispute with reasons.
8. **Admin confirmations**: Suggestions (deduction/warning/replacement/payroll blockers) — approve / reject / modify with reason.
9. **Workforce Dashboard**: active contractors/assignments, checked in, late, leave, unavailable, missing update/timesheet, pending client approval, open exceptions, high-risk, expiring assignments.
10. **Existing Payroll dashboard**: not replaced; widgets/links added — Contractor Payroll Ready, Pending Client Approval, Payroll Exceptions, Approved Contractor Hours, Attendance Corrections.
11. **Settings → Automation**: flags, templates, quiet hours, caps, EOD mode, worker health, test-send.

## 12. Month lock and payroll link (Phase 2)

Flow: Attendance + approved timesheets → Month summary (payable days/hours, approved hours, exceptions, suggested adjustments) → client sign-off → **MonthLock** → pre-fill → **existing** payroll calculation → admin review → existing approval → existing finalization → existing payment process. Nothing here recomputes pay.

**Payroll validation before pre-fill** — contractor exists; active assignment; valid payroll period; approved attendance; approved timesheet where applicable; valid pay rate; no payroll-blocking exception; no duplicate entry; no edit to a locked period. Any failure = **payroll exception** (`Suggestion.kind = payroll_blocker`); incomplete data is never silently calculated.

**Suggested deductions** (e.g. absent → 1 payable day) = `pending_admin`; admin approves / rejects / modifies with reason; every action audited; never auto-applied.
Client cannot silently modify approved records; changes after sign-off create a Correction/Dispute trail.

## 13. Timesheets, billing, reconciliation

- **Timesheet** (hourly tier, Phase 2): contractor submits `TimesheetEntry`; client rep approves; only approved hours feed payroll units.
- **Payroll reconciliation (Phase 2):** approved hours vs hours handed to payroll — both internal data, mismatch = exception.
- **Billing / invoicing / profitability (Phase 4, deferred):** no billing or invoice data exists today, so there is nothing to reuse or reconcile against. Requires its own design (bill rates, invoice model or accounting integration) — not part of Phases 1–3.

## 14. Reliability score and assignment health (Phase 3)

No client-tool integration means "delivery" cannot come from Jira. Delivery and feedback therefore come from the **client's own answers**:
- Attendance 25% · Timesheet compliance 15% · **Delivery 25% = client's weekly "on track?" pulse** · **Client feedback 20% = periodic client rating** · Response SLA 10% · Availability reliability 5%.
- Bands: 90–100 Green · 75–89 Yellow · 60–74 Orange · <60 Red. **Always shows its reasons per component** — never an opaque number.
- Assignment health = score + trend + major risks + unresolved exceptions + recommended action.
- Score changes are audited. Scores inform humans; they never auto-terminate or auto-deduct.

## 15. Privacy and compliance

Purpose limitation, data minimization, configurable retention, access controls, audit log, timestamped consent/notice (like `FaceEnrollment.consentedAt`), export/delete on request (DPDP Act 2023).
Excluded by default: continuous GPS, webcam, keystrokes, screen recording, hidden surveillance.
Exclusivity/availability are **contract terms** drafted by counsel; software records declarations only. Very tight control over "contractors" can create employment-relationship exposure — counsel reviews contract wording, the hours policy and the retention policy before go-live.

## 16. Audit log (existing `logAudit`)

Assignment create/change · attendance create/change · correction · leave request/approval · client confirm/dispute · exception create/resolve · payroll pre-fill · deduction suggestion/approval/rejection · month lock · contract and rate changes · reliability-score changes · flag changes · legacy client mapping.

## 17. Scale and risks

| Risk | Mitigation |
|---|---|
| **`prisma db push --accept-data-loss` on every boot** can silently drop data on a rename/removal | **Additive-only schema changes** (new tables/nullable columns); no renames/drops without a separate reviewed migration; **backup the DB volume before every deploy** |
| **Type errors don't fail builds** (`ignoreBuildErrors`) | `tsc --noEmit` is a mandatory pre-deploy gate (fix or baseline existing errors first) |
| SQLite single-writer under tick + webhooks | Short transactions, batching, indexes; migration trigger defined (e.g. >1,500 active assignments or lock errors); evaluate record volume, concurrency, jobs, webhook volume, reporting, backup before recommending Postgres |
| Meta template rejection / quality drop | Submit templates early; message cap; low-noise defaults; monitor failures |
| Contractors ignore WhatsApp | Human call is the designed fallback; pay tied to verified check-in + client confirmation |
| Client rep never confirms | No silent auto-confirm by default; unconfirmed days stay `pending` |
| Fake check-ins | Client confirmation is the stronger signal; optional geofence/face for on-site |
| Worker down | Heartbeat + alert; idempotent catch-up |
| Shared VPS with locally modified `.env`/compose | Deploy only on explicit approval, with `git stash` handling per project notes |
| "Bug-free" expectation | Not promisable; mitigated by tests (§19), pilot, audit trail, flags, rollback |

## 18. Phased plan

### Phase 0 — Preparation (≈1–2 weeks, no production code)
Policy register decisions (§1) · **hours/OT rule decided (§7.3: 9 h standard, OT per client, default unpaid)** · **Meta template submission (drafts in WHATSAPP_TEMPLATES.md) + 24 h-window verification** · pilot selected per §20 · counsel review (exclusivity, availability, retention, DPDP text) · **SMS decided: not in v1**.
**Readiness report:** this spec §2 is the audit baseline; Phase 1 step 1 re-verifies payroll units-worked input, contractor pay configuration, and reporting/export patterns before design freezes.

### Phase 1 — Core daily loop (≈4–6 weeks)
Order: (1) targeted audit + architecture/DB/API/RBAC impact notes → (2) feature flags → (3) Client/Project/Assignment + legacy mapping → (4) policy engine with inheritance → (5) DailyStatus + state machine + link to `Attendance` → (6) provider abstraction + WhatsApp inbound/outbound + message engine → (7) worker + reminder scheduler → (8) exception engine + severity/SLA → (9) Call Queue + What-Needs-My-Attention → (10) Live Board → (11) contractor portal + token actions → (12) end-of-day (3 modes) → (13) leave notice validation.
Roles: `resource_coordinator`, `client_coordinator`.
**Exit:** one pilot project runs a full working week; no duplicate messages; coordinators clear all unresponsive cases from the queue; RBAC + idempotency + failure tests green; flags-off regression green.

### Phase 2 — Client side and payroll link (≈3–5 weeks)
Client digest + confirm/dispute links · dispute resolution · corrections (cap) · weekly/monthly sign-off · timesheets · month lock · payroll validation + pre-fill into the existing engine · admin suggestions screen · payroll hours reconciliation · reports (attendance, availability, timesheet, client approval, contractor payroll, payroll exceptions, disputes, coordinator performance, assignment health, expiry) with Excel/CSV (+PDF where existing patterns support) · Payroll-dashboard widgets.
**Exit:** one full monthly payroll cycle on the pilot, client-signed, admin-approved; existing payroll untouched when flags off.

### Phase 3 — Hardening and extras (≈3–4 weeks, then ongoing)
Reliability score + assignment health · overlap/conflict exceptions polish · SMS fallback (not in v1; only if pilot data shows a gap) · optional client login · optional voice automation (jambonz + licensed carrier) **only after** legal, carrier, cost, privacy and reliability review · Postgres/queue only if triggers hit.

### Phase 4 — Billing (separate decision)
Bill rates, hours-based invoicing or accounting integration, billing reconciliation, profitability. Needs its own spec.

## 19. Testing

- **Unit:** grace, late, half-day, absent, leave notice, correction limits, message cap + priority drop, quiet hours, holiday/weekly-off/leave suppression, escalation timing, setting inheritance, payroll validation, deduction approval, severity/SLA.
- **Integration:** WhatsApp webhook (signature, duplicate, delayed), message delivery, DailyStatus→Attendance, assignment mapping, client confirm/dispute, payroll pre-fill.
- **RBAC (real HTTP, every role):** coordinator cannot see unrelated clients; contractor cannot see another contractor; client token cannot see another client/project; admin/hr can approve; management read-only reports.
- **End-to-end:** assignment → check-in → late → reminder → call queue → client notice → EOD → client confirm → month lock → pre-fill → existing payroll → admin approval → finalization.
- **Failure/idempotency:** WhatsApp down, duplicate/delayed webhook, duplicate button click, worker restart, DB/network failure, timezone change, phone number change, assignment change, leave day, public holiday, weekly off, cancelled assignment.
- **Flags-off regression:** existing payroll/attendance outputs identical.

## 20. Deployment safety, pilot, rollout

Separate git branch; no direct production deploy. Pre-deploy checklist: tests · `tsc --noEmit` · migration dry-run on a copy of the DB · API/frontend/security checks · **DB volume backup** · rollback plan (previous image + backup restore) · flags verified off.
Pilot: 1 client, ~10–20 contractors, resource + client coordinators, one client rep, one payroll admin; ≥1 full working week, then one full payroll cycle.

**Pilot selection (recommendation; the owner names the actual client/people):**
- *Client:* cooperative client manager who will tap Confirm daily; 10–20 **full-time** contractors on the same shift/timezone; mostly remote; **real availability problems today** (so improvement is measurable); not the largest or most delicate account; OT either unpaid or simple.
- *People:* 1 resource coordinator + 1 backup; 1 Aviin client coordinator; 1 client representative; 1 payroll administrator; contractors told in advance that the process replaces daily calls and what it expects of them (consent + notice signed first).
- *Baseline first (week before):* record today's numbers — calls per day, contractors unreachable per week, complaints, corrections — so results are comparable.
- *Staging:* **Week 1** contractor messages + internal call queue on, client notices/digest **off**, coordinators keep their normal calls in parallel to compare. **Week 2** client digest/confirm on, coordinators stop routine calls. **Then** one monthly payroll cycle with admin-approved pre-fill.
- *Proposed success targets (adjust):* ≥ 90% of check-ins by tap by day 5; routine coordinator calls down ≥ 70% vs baseline; duplicate messages 0; failed sends < 3% with all failures reaching the queue; client confirms ≥ 80% of days; zero unapproved payroll changes.
KPIs — contractor (check-in/EOD compliance, response and delivery rates), coordinator (calls, unresolved, resolution time, escalations), client (approval and dispute rates, turnaround), payroll (exceptions, corrections, mismatches), system (duplicate/failed messages, webhook/job failures, latency).
Rollout: pilot project → more projects, same client → more clients → company-wide. Never everything at once.

## 21. Phase deliverable report (each phase ends with)
Files changed/created · migrations · endpoints · routes/components · services/jobs · WhatsApp integration · RBAC changes · payroll integration · tests + results · security/performance checks · env vars · deployment + rollback instructions · known limitations · remaining business decisions · next-phase recommendation.

## 22. Open items for the owner
1. **Name** the pilot client/project and people (selection criteria in §20).
2. ~~Hours rule~~ — decided: 9 h standard, breaks included (check-in to check-out), OT per client. **Pilot OT default: `none` (recorded, unpaid)**; switch the pilot client to `client_approved` only if its contract/PO pays overtime, and then only for hours the client rep approves in the digest (prior approval, per standard IT-staffing practice).
3. ~~SMS~~ — decided: not in v1.
3b. **Submit the WhatsApp templates** in Meta WhatsApp Manager (WHATSAPP_TEMPLATES.md) and report approval status.
4. Client rep login now or later (default: signed links only).
5. Counsel sign-off on half-day/absent thresholds, retention, exclusivity wording.
6. Confirm how contractors' pay is configured today (Phase 1 step 1) so Assignment doesn't duplicate it.
7. Billing is deferred to its own phase — confirm.

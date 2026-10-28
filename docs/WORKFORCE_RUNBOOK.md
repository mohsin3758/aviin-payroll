# Contractor Workforce — Runbook

What this is: the operating guide for the Contractor Workforce module (design in
`CONTRACTOR_MONITORING_SPEC.md`, WhatsApp wording in `WHATSAPP_TEMPLATES.md`).

## 1. State after deployment: everything is OFF
Deploying the code changes nothing for anyone. Every feature flag defaults off, the worker does a single
cheap query per minute and exits, and the new screens only appear for admin/HR/manager (Contractor Workforce)
and for contractors with an Employee record (My Work Day) — which show nothing until you switch a project on.
Existing payroll, attendance and leave behave exactly as before.

## 2. Go-live checklist for the FIRST project (pilot)
1. **Meta templates approved** (see `WHATSAPP_TEMPLATES.md`). Until they are, leave WhatsApp off — the module still works with the web link.
2. **Setup → Clients**: add the client; add its contacts (mark the person who will confirm attendance as *Representative*, with a mobile number); add the client's holidays.
3. **Setup → Projects**: add the project.
4. **Setup → Assignments**: for each contractor choose project, dates, pay terms, **resource coordinator**, **client coordinator**, KAM/KAE and the client representative; set status **Active** (needs a pay rate).
   Coordinators are existing `manager` logins — create one per person (Settings → Users), never shared.
5. **Setup → Rules** (optional): per client/project overrides — shift hours, grace, overtime policy, end-of-day mode, message cap, etc.
6. **Setup → Go-live switches** (admin only): choose *One project* → turn on `contractor_workforce_enabled`. Check **Health** shows the worker "Running".
7. Run a **dry week** with WhatsApp still off: contractors use *My Work Day* or a link from the assignment (link icon); coordinators work the *Needs attention* and *Live board* tabs. Messages are recorded as "suppressed (whatsapp_not_enabled)" — nothing is sent.
8. When happy: Settings → WhatsApp (existing) must be configured and enabled; in **Setup → Go-live → WhatsApp replies** enter the Meta *app secret* and a *verify token*, and in Meta's console set the callback URL shown there. Then turn on `whatsapp_enabled` for the project. Send yourself a test first.
9. Turn on `client_digest_enabled` when the client representative is ready to receive the daily summary.
10. Widen: more projects, then more clients. Never all at once.

## 3. Month end
*Month & payroll* tab → pick project and month:
1. Every working day must be decided (days close themselves the next morning), no open disputes, no unresolved severity-3+ exceptions.
2. The client approves the month from their link (or record sign-off received by email).
3. **Lock** (admin/HR): freezes days, writes the existing attendance records, creates **suggestions**.
4. Approve / reject / modify each suggestion (reason required). Nothing reaches payroll before this.
5. *Ready for payroll* lists approved entries in the exact shape the existing **Alternate Pay** run takes; **Submit** (with a confirmation) calls that existing run. Payroll maths and TDS are the existing engine's.
6. After payroll, the reconciliation column compares expected and recorded amounts.

## 4. Watching it
- **Health tab**: worker running / last pass / last error; messages by status (24 h); WhatsApp readiness; what is switched on. If it says NOT RUNNING, reminders and escalations are not being sent — restart the app and check `WORKFORCE_WORKER` is not `off`.
- **Needs attention** is the daily workspace. Items escalate to severity 4 automatically if their SLA passes, and admin/HR are notified.
- A message that cannot be delivered, or a contractor with no phone number, raises a call task — a failed send never looks like a silent contractor.

## 5. Environment variables (all optional)
| Variable | Default | Meaning |
|---|---|---|
| `WORKFORCE_WORKER` | on | `off` disables the in-process worker (run it on ONE instance only) |
| `PUBLIC_APP_URL` | `https://payroll.aviintech.com` | Base URL in emailed links |
| `WORKFORCE_ALLOW_TICK_NOW` | unset | `1` lets an admin simulate the clock via `POST /api/workforce/tick {now}`. **Never set in production.** |

## 6. Rolling back
- **Fast (no deploy)**: turn the switch(es) off in *Go-live switches*. Everything stops; data is kept.
- **Code**: on the server, `git checkout <previous commit>` then `docker compose up -d --build`. The new tables are additive and unused by old code, so they can stay.
- **Data**: a database backup is taken before every deploy (`/opt/payrollpro/backups/`). Restore by stopping the app, copying the backup over `/app/db/custom.db` in the volume, and starting it.

## 7. Known limits (also in the spec)
- WhatsApp **Flow** end-of-day mode falls back to the web link until a Meta Flow is configured.
- Coordinators are notified in-app (and by the call queue), not by WhatsApp.
- No SMS or automated voice calls (decided: WhatsApp + a human call).
- Dedicated coordinator roles are deferred; coordinators are `manager` logins scoped by assignment.
- Hours for hourly deals come from check-in/out and the end-of-day hours, confirmed by the client — there is no separate timesheet table.
- Shifts crossing midnight and daylight-saving timezones are not supported.
- Billing/invoicing/profit reconciliation is a separate future phase.
- The client representative acts through signed links; there is no client login.

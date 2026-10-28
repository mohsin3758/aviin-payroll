# Pilot Intake Sheet

**Current production fact (checked 2026-10-28):** the payroll app holds only 8 permanent employees, none with
a client set, and no `manager` logins. There are **no contractor records yet**, so the pilot cannot be chosen
from existing data. Fill this sheet and the whole pilot can be set up in under an hour.

## 1. Pick the pilot client (choose the account matching the most of these)
1. 10–20 **full-time** contractors on the same shift.
2. A client manager who answers messages and will tap **Confirm** each day.
3. Mostly remote work.
4. The worst availability / call-chasing problems today (so improvement is measurable).
5. Not your largest or most delicate account.
Avoid, for the first pilot: on-site/hybrid, night shifts, clients that pay overtime or have complex holidays.

## 2. Client
| Field | Value |
|---|---|
| Client name | |
| Project name | |
| Work mode | Remote / On-site / Hybrid |
| Shift start – end (e.g. 09:00–18:00) | |
| Client holidays for the next 3 months | (date, name) |
| Overtime paid by the client? | No (default) / Only with approval / Yes |
| End-of-day update method | Web link (recommended) / free text |

## 3. Client representative (the person who confirms attendance daily)
Name · mobile (10 digits) · email

## 4. Aviin people (one login each, never shared; created as `manager`)
| Role | Name | Work email | Mobile |
|---|---|---|---|
| Resource coordinator (makes the calls) | | | |
| Backup coordinator | | | |
| Client coordinator (liaises with the client) | | | |
| KAM / KAE | | | |
These become the named people on each assignment. They see only their own assignments, never pay figures.

## 5. Contractors (10–20 rows)
| First name | Last name | Mobile (WhatsApp) | Email | Start date | End date (if fixed) | Paid | Rate (₹) | Day basis (monthly only) |
|---|---|---|---|---|---|---|---|---|
| | | | | | | monthly / per-day / per-hour | | client working days / calendar days |
Also: who already has a payroll login? (they can use **My Work Day**); otherwise they use the link on WhatsApp.

## 6. Before switching anything on
- [ ] Each contractor has signed the updated agreement and the monitoring notice/consent (see `LEGAL_REVIEW_BRIEF.md`).
- [ ] Contractors have been told the process replaces daily calls and what is expected.
- [ ] Baseline recorded for the week before: calls per day, unreachable contractors per week, complaints, corrections.

## 7. Pilot timeline (recommended)
| When | What |
|---|---|
| Day 0 | Records created; one project switched on; WhatsApp OFF; coordinators watch *Needs attention* and *Live board*; contractors use My Work Day or a link |
| Week 1 | Coordinators keep their normal calls in parallel, to compare |
| End of week 1 | Review: check-in rate, calls avoided, wrong states, wording. Adjust Rules |
| Week 2 | Turn on WhatsApp (templates approved first), then the client digest; stop routine calls |
| Month end | Client signs off; admin locks; approves suggestions; submit to payroll; reconcile |

## 8. Proposed success targets (adjust)
≥ 90% of check-ins by tap by day 5 · routine coordinator calls down ≥ 70% vs baseline · duplicate messages 0 ·
failed sends < 3% and every failure reaches the call queue · client confirms ≥ 80% of days · zero unapproved
payroll changes.

## 9. Meta / WhatsApp details I need (to enter the account and submit the templates)
- WhatsApp Business **phone number ID** and **WhatsApp Business Account (WABA) ID**
- A **permanent access token** (system user) with `whatsapp_business_messaging` and `whatsapp_business_management`
- The Meta **app secret** (for verifying replies) and a **verify token** you choose
Keep these out of chat/email where possible; enter them directly in Settings → WhatsApp and Setup → Go-live.

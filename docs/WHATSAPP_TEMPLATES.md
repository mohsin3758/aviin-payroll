# WhatsApp Message Templates — Drafts to Submit in Meta WhatsApp Manager

Status: **DRAFT.** Submit in Meta Business → WhatsApp Manager → Message templates, using the WhatsApp Business account already configured in PayrollPro (Settings → WhatsApp). The app cannot submit these for you. Approval can take from minutes to a few days, and a rejected template must be edited and resubmitted.

Existing template in use today: `leave_approved` (leave approval notice). Do not rename or delete it.

## Rules to keep approvals smooth
- Category **Utility** for all of these (they are transactional/operational, not promotions). Do not add marketing wording, offers, or emojis.
- Language: `en` (English). The app's current setting is `en_US`; use the same code Meta shows for the language you pick, and keep it consistent. Hindi versions can be added later as separate language variants of the same template names.
- Names: lowercase letters, digits, underscores only.
- Variables are `{{1}}`, `{{2}}`…; Meta requires a **sample value for each** when submitting. A body must **not start or end with a variable** and should not be mostly variables.
- Buttons: *Quick reply* buttons return a payload the webhook reads (what the app uses to record Check in / Still online). *URL* buttons open a signed link (end-of-day form, client confirmation); the URL's last part can be one variable.
- Never put private data (pay, reasons for absence, health) in a template that goes to a client.
- A contractor's reply opens a 24-hour window for free-form/interactive messages. Before finalising which prompts truly need a template, check Meta's current rules (Phase 0 task). Submitting all of them is still the safe choice.

## Contractor-facing

### 1. `checkin_prompt`
Body: `Hi {{1}}, good morning. Your shift for {{2}} starts at {{3}}. Please tap Check in when you are ready.`
Samples: Rahul · Acme Project · 9:00 AM
Buttons (quick reply): `Check in` · `On leave today`

### 2. `checkin_reminder`
Body: `Hi {{1}}, we have not received your check-in for {{2}} today. Your shift started at {{3}}. Please check in below, or let us know if you are unavailable.`
Samples: Rahul · Acme Project · 9:00 AM
Buttons (quick reply): `Check in` · `On leave` · `Need help`

### 3. `pulse_online`
Body: `Hi {{1}}, quick check: are you online and working on {{2}} right now?`
Samples: Rahul · Acme Project
Buttons (quick reply): `Yes, online` · `On a break` · `Leave`

### 4. `eod_prompt`
Body: `Hi {{1}}, it is time for today's update for {{2}}. It takes under a minute. Please share what you completed, any blockers, and your hours.`
Samples: Rahul · Acme Project
Button (URL, dynamic): `Send update` → `https://payroll.aviintech.com/u/{{1}}`

### 5. `eod_reminder`
Body: `Hi {{1}}, your update for {{2}} today is still pending. Please send it now so your day can be confirmed.`
Samples: Rahul · Acme Project
Button (URL, dynamic): `Send update` → `https://payroll.aviintech.com/u/{{1}}`

### 6. `timesheet_reminder`
Body: `Hi {{1}}, your timesheet for {{2}} is due. Please submit it so it can be approved.`
Samples: Rahul · 1–15 November
Button (URL, dynamic): `Open timesheet` → `https://payroll.aviintech.com/t/{{1}}`

### 7. `leave_ack`
Body: `Hi {{1}}, your leave request for {{2}} has been {{3}}.`
Samples: Rahul · 12–13 November · approved
(No buttons.) *Note: this is separate from the existing `leave_approved` template, which keeps working for permanent staff.*

## Aviin coordinators (internal)

### 8. `coordinator_task`
Body: `Action needed: {{1}} on {{2}} has not responded since {{3}}. Please call and log the outcome in the queue.`
Samples: Rahul · Acme Project · 9:00 AM
Button (URL): `Open call queue` → `https://payroll.aviintech.com`

## Client-facing (no private details)

### 9. `client_status_notice`
Body: `Hello {{1}}, this is Aviin. Today's status for {{2}} on {{3}} is pending confirmation. We are following up and will update you shortly.`
Samples: Priya · Rahul · Acme Project
Variables: client contact name · contractor name · project. *(Sent only after the unresolved-after-90-minutes step; wording is deliberately neutral.)*

### 10. `client_daily_digest`
Body: `Hello {{1}}, the workforce summary for {{2}} on {{3}} is ready. Please review and confirm or raise a query.`
Samples: Priya · Acme Project · 3 November
Button (URL, dynamic): `Review and confirm` → `https://payroll.aviintech.com/c/{{1}}`

### 11. `approval_reminder`
Body: `Hello {{1}}, attendance and hours for {{2}} are waiting for your approval. Please review when you can.`
Samples: Priya · Acme Project
Button (URL, dynamic): `Review` → `https://payroll.aviintech.com/c/{{1}}`

## Submission checklist
1. Create templates 1–11 in WhatsApp Manager exactly as above (adjust wording to your brand voice, keeping the variable order).
2. Record each template's **exact name, language code and status** and send them back; the app's template registry is configured to match them.
3. If any is rejected, copy Meta's reason; the usual causes are variables at the start/end of the body, missing samples, or promotional wording.
4. Do not change an approved template's wording in the app — edit and resubmit in Meta, then update the registry.
5. Confirm the payroll domain `payroll.aviintech.com` is the one buttons should open (URL buttons must match the domain Meta approved).

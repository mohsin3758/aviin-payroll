# Contractor Workforce — Brief for Legal / CA Review

**Status: DRAFT questions and draft wording for counsel to confirm or replace. This is not legal advice.**
Hand this to your lawyer (employment/contract) and CA (TDS) **before the first contractor is switched on.**

## 1. What the system does (one paragraph for counsel)
Aviin places full-time, exclusive contractors with client projects. The software asks each contractor to
check in daily (WhatsApp or a web link), answer two "still online" checks, and send a short end-of-day
update. Missed steps trigger automatic reminders, then a phone call by an Aviin coordinator, then a status
notice to the client. The client's representative confirms or disputes each day. At month end the client
approves the month; Aviin's admin approves any pay adjustment; only then is a payment entry prepared for the
existing payroll. No deduction, warning or termination is ever applied automatically.

## 2. Questions for counsel
**A. Classification (contractor vs employee).** The arrangement has fixed 9-hour days, exclusivity, daily
check-ins, coordinator calls and pay reduced for absence. Does this create a real risk that these people are
treated as employees (PF/ESI/gratuity/labour-code exposure), and which of these features should be softened
or documented differently to stay a genuine contract-for-services? (This is the most important question.)

**B. Exclusivity.** (i) Is an exclusivity clause during the engagement enforceable for these contractors?
(ii) What, if anything, can bind them after the engagement (Section 27, Indian Contract Act)? (iii) Is a
signed "declaration of other engagements" plus a right to ask for a fresh declaration reasonable?

**C. Pay linked to attendance.** (i) Is it permissible to reduce a monthly fee pro rata for days not worked
(calendar-day or client-working-day basis)? (ii) Per-day deals pay only days worked; per-hour deals pay
approved hours. (iii) Overtime beyond 9 hours is unpaid unless the client agrees: does the contract need to
say so? (iv) Is withholding payment for a missed check-in enforceable, or only a pro rata reduction for
unworked time?

**D. The thresholds the software uses** (all adjustable per client; please confirm or change):
| Rule | Current default |
|---|---|
| Late | check-in more than 15 minutes after shift start |
| Half-day | check-in more than 2 hours late, or under 4.5 h worked, or 2 unexplained missed "still online" checks |
| Absent | no check-in without valid reason, or under 4 h worked, or check-in after half the shift |
| Short hours | shortfall over 30 min against 9 h is flagged for review only; pay unchanged |
| Planned leave notice | 48 hours (per client) |
| Corrections | 2 per contractor per month; a 3rd needs an admin override with a written reason |
Must these be written into each contractor agreement to be binding? Are they reasonable?

**E. TDS and tax.** The existing payroll deducts 10% TDS on contractor payments by default (section 194J).
Should some engagements use another rate/section (e.g. 194C)? Who decides per engagement?

**F. Monitoring and data protection (DPDP Act 2023).**
(i) Wording of the notice and consent (draft in section 4). (ii) Purposes: attendance, availability, daily
work status, sharing with the client. (iii) Data shared with the client representative: name, check-in and
check-out times, hours, status, daily update text. (iv) Retention periods for messages, attendance and
updates. (v) Meta/WhatsApp as a processor and any cross-border transfer. (vi) Rights requests and breach
handling. (vii) Confirm that **no** screen capture, keystroke logging, webcam or continuous location tracking
is used (none is).

**G. WhatsApp messaging.** Opt-in/consent wording for business messages, and a way to opt out (and what
happens to attendance if a contractor opts out: the web link and phone call remain).

**H. Client contracts.** Should the client agreement state that the client representative's daily
confirmation and monthly sign-off are the agreed evidence of days worked, and set a deadline after which an
unanswered month is deemed approved? (The software never auto-approves; deemed approval would be a process
decision.)

**I. Disputes and records.** How long to keep dispute records, corrections and audit logs.

## 3. Draft clause wording (for counsel to refine)
1. **Exclusivity and availability.** "During the Engagement the Contractor shall work exclusively for the
   Client through [Company], shall not undertake any other paid work or engagement, and shall be available
   and responsive on the Client's working days during the Client's working hours [9 hours, including breaks]
   unless on approved leave."
2. **Declaration.** "The Contractor declares that they have no other current engagement, and will promptly
   disclose any change. [Company] may ask for a fresh written declaration at any time. A false declaration is
   a material breach."
3. **Daily confirmation.** "The Contractor shall confirm availability each working day through the
   channels notified by [Company] (WhatsApp, a web link, or telephone) and provide a short end-of-day
   status update."
4. **Pay basis.** "Fees are payable for [days/hours] actually worked and approved by the Client. For a monthly
   fee, the fee is reduced pro rata for days not worked, calculated on [calendar days / the Client's working
   days] in the month. Time beyond [9] hours a day is not separately payable unless the Client approves it in
   advance in writing."
5. **Leave.** "Planned absence requires [48] hours' notice through the notified channel; same-day absence for
   illness requires prompt notice and a reason."
6. **Corrections.** "A missed check-in may be corrected on the Client's confirmation, up to [2] times a month;
   further corrections need [Company]'s written approval."
7. **Records and sign-off.** "Daily and monthly confirmation by the Client's representative is the agreed
   record of days worked. [Disputes shall be raised within [X] days.]"
8. **Notice and termination.** "Repeated failure to be available is a material breach entitling [Company] to
   terminate on [X] days' notice [and to recover amounts paid for days not worked]."

## 4. Draft DPDP notice and consent (for counsel)
"[Company] will process your name, mobile number, check-in and check-out times, availability, working hours
and daily work updates to run your engagement, confirm days worked with the client, calculate fees and keep
records. Messages are sent through WhatsApp and may be handled by Meta. Your attendance and daily update are
shared with the client representative for this project. We do not use screen capture, keystroke logging,
webcam or continuous location tracking. We keep this information for [period]. You may ask to see, correct
or erase your data or withdraw consent by contacting [contact]; withdrawing consent may mean we cannot
confirm your days through WhatsApp but you can use the web link or telephone. I consent. [signature/date]"

## 5. Where each rule lives in the software
Contractor Workforce → Setup → **Rules** (company, client, project or assignment level). Overtime, shift,
grace, leave notice, correction limit, quiet hours, message cap and the end-of-day method are all settings, so
counsel's answers can be applied without code changes. The exclusivity declaration date is recorded on each
assignment.

# AutoED-ERP · PRD coverage

Status of every requirement ID in the PRD (v1.0, product owner Atif Khan, Founder) in this build.

- **Built**: working in the web app against the database.
- **Partial**: the core works; the note says what is missing.
- **Needs a provider**: the product side is built, but it needs a third-party account or device (payment gateway, WhatsApp, SMS, biometric) connected before it does anything outside the app.
- **Not built**: not in this MVP.

All P0 items are built or partial except where marked. Native mobile apps are not built: every app in section 8.32 is delivered as a mobile-friendly web screen (installable as a web app).

## Data rules (section 6)

| ID | Status | Note |
|---|---|---|
| DM-01 | Built | `org_id` on every table; branch and year on operational tables |
| DM-02 | Built | Recorded state machine; withdrawal cancels future demands, ends transport and hostel |
| DM-03 | Built | Triggers block edits and deletes on receipts, payments, allocations, vouchers |
| DM-04 | Built | Trigger locks marks once published; unlock goes through approval |
| DM-05 | Built | Separate restricted tables; health views logged |
| DM-06 | Built | Data-health report (on demand, not nightly) |
| DM-07 | Partial | Custom fields on students, staff, households, enquiries; shown on forms and stored; not yet in search or report filters |

## Functional requirements (section 8)

| Module | Built | Partial | Not built |
|---|---|---|---|
| 8.1 SIS | SIS-01, 02, 04, 06, 07, 10, 11 | SIS-03 (balance view, no auto-suggest), SIS-05 (corrections via approval, no document upload), SIS-08 (fields and exports), SIS-09 (records only, no e-sign) | |
| 8.2 Attendance | ATT-01, 02, 04, 05, 06, 07, 08, 09 | | ATT-03 devices (needs a provider) |
| 8.3 Timetable | TT-01, 02, 03, 04, 05 | TT-06 (facility bookings, no conflict check), TT-07 (effective dates stored) | |
| 8.4 Learning | LRN-01, 03, 04, 06 (generic screens) | LRN-02 (no approval wiring), LRN-05 (links only) | LRN-07 |
| 8.5 Homework | HW-01, 02, 03, 04, 05 | | HW-06 |
| 8.6 Assessment | GB-01, 03, 04, 07 (fixed layout), 08, 10, 11 | GB-02 (CBSE, Cambridge, ICSE, IB, NEP-HPC, pre-school scales and schemes; stage-specific HPC layouts not built), GB-05 (rubric records), GB-06, GB-09 (report family), GB-12 | |
| 8.7 Exam cell | EXM-01, 03, 05, 06 | EXM-02 (attendance and envelope fields), EXM-04 (OMR sheet printed, no scanning), EXM-07 | |
| 8.8 Wellbeing | WB-01, 04 | WB-02, 03, 05, 06 (registers) | |
| 8.9 Health | HLT-01, 02, 04 | HLT-03 (BMI shown, no growth chart) | |
| 8.10 Co-curricular | | CC-01, 02, 03, 04, 05 (registers and house leaderboard) | |
| 8.11 Admissions | ADM-02, 03 | ADM-04 (task list created on admission) | ADM-01 (separate CRM product), ADM-05 |
| 8.12 Fees | FEE-01, 02, 03, 04, 06, 07, 09, 11, 12, 13 | FEE-08 (CSV statement import and matching), FEE-10 (refund requests and approval; no bank file), FEE-14, FEE-15 (fee certificate template) | FEE-05 online payment (needs a gateway) |
| 8.13 HR | HR-01, 03, 04 | HR-02, 05 (PF, ESI, PT, monthly TDS; no Form 16 or tax computation), 06, 07, 08, 09, 10, 11 | |
| 8.14 Accounting | ACC-01, 02, 03, 04 (Tally XML), 05 | ACC-06 | Zoho Books sync |
| 8.15 Transport | TR-01, 02, 04 (phone GPS), 05, 06, 07 (fee head), 08, 09 | | TR-03 route optimisation |
| 8.16 Safety | SAF-01, 02, 03, 05, 06 | SAF-04 | |
| 8.17 Hostel | | HOS-01 to 05 (registers) | |
| 8.18 Canteen | CAN-01, 02 | CAN-03 | |
| 8.19 Inventory | INV-01, 03 | INV-02, 04, 05, 06 | |
| 8.20 Documents | DOC-01 (templates with merge fields), 02, 03 (status and export), 05 (library) | DOC-04 (via requests) | DOC-06 e-signature |
| 8.21 Library | LIB-02, 04 | LIB-01 (no ISBN lookup), LIB-03 | |
| 8.22 Communication | COM-01, 02, 03, 04, 06 | COM-07 (queued; needs providers), COM-09 | COM-05 fallback, COM-08 translation |
| 8.23 Events | EVT-02, 03 | EVT-01 (no Google/Outlook sync), EVT-04 (albums, no upload or face-blur), EVT-05 | |
| 8.24 Helpdesk | HD-01, 02, 03, 04 | | |
| 8.25 Forms | FRM-01, 03 | FRM-02 (mapping field stored, not applied) | |
| 8.26 Reports | RPT-01, 02, 03, 04, 06, 08 | RPT-05 (saved views; scheduled email not sent), RPT-07 | |
| 8.27 Adoption | ADO-01, 02, 03, 04 | ADO-05 | |
| 8.28 Alumni | ALU-02 | ALU-01 | |
| 8.29 Group | GRP-01, 03 | GRP-02 (shared masters, no lock/default per branch), GRP-04, 05 | |
| 8.30 Statutory | REG-01 (exports), REG-02 | REG-03, 04 | |
| 8.31 Facilities | | FAC-01, 02, 03 (registers, maintenance tickets) | |
| 8.32 Apps | PAP-01 to 07, 09 (English, Hindi, Telugu labels on the parent home), TAP-01, 02, 03, SAP-01, 02, OAP-01, 02 | PAP-08, TAP-04 (offline for attendance only) | PAP-10 white-label, native apps |

## Platform sections

| Section | Status |
|---|---|
| 9 Customisation (CF-01..10) | CF-01, 02, 05, 07, 08 built; CF-03, 06 partial; CF-04, 09, 10 not built |
| 10 Workflow (WF-01..06) | WF-01, 02, 04, 05, 06 built; WF-03 partial (recipes are fixed code, not a visual builder; time-based recipes run on demand, see below) |
| 11 Admin console | Built, except devices health (registers only) |
| 12 Platform console | PLT-01, 02, 04, 05, 09 (no impersonation), 10, 11, 13 built; PLT-03 partial (CSV import with dry run and undo); PLT-06, 07, 08, 12 partial; PLT-14 not built |
| 13 Technical | TEC-01, 02, 04 (in-request, no job queue), 05, 07, 08 built or partial; TEC-03 partial; TEC-06 API not built; TEC-09 not built |
| 17 Privacy | PRV-01, 02, 04, 05 built (registers); PRV-03 rules stored, no scheduled job |

## Known limits of this build

- **Scheduled jobs.** Time-based recipes (9:15 attendance nudges, fee reminder ladder, document expiry, marks deadlines) run when an admin presses "Run now" on the automations page. To run them on a clock, add a Vercel Cron job or a Supabase scheduled function that calls the same code.
- **Third-party providers.** Payment gateway, WhatsApp, SMS, email, voice, biometric and RFID devices, Google and Microsoft sign-in, and Zoho Books need accounts and keys. The app queues outgoing messages in the delivery log until a provider is connected.
- **File uploads.** A private storage bucket per school exists, but screens take links rather than uploading files.
- **Scale.** Bulk jobs (report cards for a whole branch, payroll, demand generation) run inside the request. They are fine for a single school; a job queue is needed for thousands of records at once.
- **Data residency.** The Supabase project is in Tokyo (`ap-northeast-1`). The PRD requires India; create the production project in Mumbai (`ap-south-1`) before real data goes in.

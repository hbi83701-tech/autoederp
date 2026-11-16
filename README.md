# AutoED-ERP

**The school operating system.** One configurable platform to run every part of a school or school group: students, academics, fees, people, operations, safety and communication.

- **Product owner:** Atif Khan, Founder
- **Built by:** Digivate
- **Stack:** Next.js 15 (App Router, server components and server actions) · Supabase (Postgres, Auth, Storage, row-level security) · Vercel
- **Specification:** School Operating System PRD v1.0 (renamed AutoED-ERP). Requirement-by-requirement status is in [`docs/COVERAGE.md`](docs/COVERAGE.md).

## What is in this MVP

| Area | Screens |
|---|---|
| Role homes | Management morning pulse, teacher "My day", role home for office staff, parent app, student portal, driver app |
| Students | Student 360 (profile, attendance, academics, fees, growth record, health, services, timeline), admission with sibling matching and duplicate checks, recorded status state machine, bulk transfer, admissions pipeline with one-click conversion |
| Attendance | One-tap roll call (default present, offline queue and sync), live not-marked board, parent absence alerts, three-day chronic absence alert, staff attendance and geo-tagged check-in, regularisation |
| Academics | Timetable grid with clash detection and generator, substitution planner with ranked suggestions, post-to-class composer with approval option and posting compliance, assessment engine with board packs, spreadsheet marks grid (paste from Excel, AB/EX/ML), marks-entry status board, report cards (generate, AI or rule-based remarks, review, sign-off, publish, QR verification, marks lock), exam cell (seating, hall tickets, question bank, paper builder, AI question drafts), online and diagnostic tests with tab-switch logging and Bloom's analysis |
| Fees | Fee structure and plans, demand generation with mid-year pro-rating, counter collection with several modes and sibling-combined payment, idempotent receipts with QR, reversal only through approval, cheque lifecycle with bounce reversal, bank reconciliation, defaulter worklist with ageing, reminders and promises to pay, late-fee rules, concessions with impact shown and approval routing, Tally export |
| People | Staff 360, onboarding checklist, leave with balances and cover impact, payroll run (LOP, PF, ESI, Professional Tax, TDS, loans, bonus), payslips, bank and statutory files, staff self-service |
| Operations | Transport console with compliance expiry, live trips, driver app with GPS, boarding and SOS, parent bus page; gate app with visitors, OTP-verified pickups and authorised-pickup lookup; library counter with fines into fees; store and canteen counter with wallet limits, blocked items and allergy flags; stock, procurement, assets; accounting ledger, expenses, budgets, statements |
| Communication | One composer (app first, WhatsApp/SMS/email/voice queued for providers), quiet hours, approval for mass messages, read tracking, two-way parent inbox, emergency broadcast with acknowledgements, helpdesk with SLA and ratings, forms with conditional logic, PTM slots, certificates with public QR verification |
| Insight | 20 report families with filters, grouping, CSV export and saved views; principal's daily diary; insight cards; ask-your-data; group console comparing branches; adoption and compliance monitor |
| Admin console | Set-up checklist, demo data, users and invite links, editable permission matrix, settings (modules, terminology, fee and message rules), year rollover wizard, CSV import with dry run and undo, audit log, data-health report, automations and recipe library, plan and wallet, plus generic list/edit/export screens for all 186 tables |
| Platform console | Tenants with health score, onboarding tracker, invoices, messaging wallet, support desk, releases and feature flags, central content register, access log |

## Security model

- Every table carries `org_id`; row-level security limits every query to the caller's school, branch and role. Policies are generated from one table definition (`schema/tables.mjs`) so none is missed.
- The permission matrix (PRD section 15) lives in `role_permissions` and is enforced in the database through `app.can()`, not only in the UI. Schools can edit every cell.
- Parents and students only see rows linked to their own children (`app.my_students()`).
- Sensitive health, category and bank fields are in separate restricted tables; every view of student health data is logged.
- Receipts, payments, allocations and vouchers cannot be edited or deleted (trigger-enforced). Corrections are reversals with approval.
- Published marks are locked by trigger; changes need an approved unlock.
- An append-only audit trail records every create, update, delete and sensitive view.
- Anonymous visitors can call exactly one function: certificate and report-card verification by QR code.

## Run locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in your Supabase URL and publishable key, then:

```bash
npm run dev
```

Apply the SQL files in `supabase/migrations/` in order to a new Supabase project (they are already applied to the `autoederp` project). `002_tables.sql` and `003_policies.sql` are generated: edit `schema/tables.mjs` and run `node schema/gen.mjs`.

```bash
npm test
```

runs the golden tests for fee, grading, payroll, timetable and calendar rules.

## Environment variables

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `ANTHROPIC_API_KEY` (optional) | Enables AI remark drafts, question drafts and free-form ask-your-data. Without it, rule-based fallbacks are used. No student names are sent. |

## First use

1. Sign up, create the school and pick the board. The board pack installs grades, sections, subjects, grading scale, fee heads, leave types, approval rules, templates and recipes.
2. Optional: Admin console → Demo data, to explore with fictional families.
3. Invite staff and parents from Admin console → Users (invite links carry the role and the linked record).

To make someone an AutoED platform administrator, add their email to `app.platform_admin_emails` before they sign up.

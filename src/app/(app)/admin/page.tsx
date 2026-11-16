import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card } from '@/components/ui';

export const metadata = { title: 'Admin console' };
const AREAS: [string, [string, string, string][]][] = [
  ['Get started', [['/admin/setup', 'Set-up checklist', 'What is done and what is next'], ['/admin/demo', 'Demo data', 'Fill the school with sample records to explore'], ['/admin/import', 'Import and export centre', 'CSV templates with validation and undo']]],
  ['Organisation and structure', [['/admin/settings', 'Organisation and settings', 'Legal details, modules, terminology, fee and message rules'], ['/x/branches', 'Branches', 'Campuses, boards, timings, GST'], ['/x/academic_years', 'Academic years', ''], ['/x/terms', 'Terms', ''], ['/x/programmes', 'Grades / programmes', ''], ['/x/sections', 'Sections', 'Class teacher, room, capacity'], ['/x/subjects', 'Subjects', ''], ['/x/calendar_events', 'Calendar and holidays', ''], ['/admin/rollover', 'Year rollover wizard', 'Promote, carry dues, preview, commit']]],
  ['People and access', [['/admin/users', 'Users and invites', 'Invite staff, parents and students'], ['/admin/roles', 'Roles and permissions', 'Edit every cell of the matrix'], ['/x/delegations', 'Delegations', 'Approvals during leave']]],
  ['Data model', [['/x/custom_fields', 'Custom fields', 'Extra fields on students, staff and more'], ['/x/masters', 'Dropdown masters', 'Houses, categories, concern types'], ['/x/doc_templates', 'Document templates', ''], ['/x/message_templates', 'Message templates', '']]],
  ['Academics and money', [['/x/assessment_schemes', 'Assessment schemes', 'Board packs, weightages'], ['/x/grading_scales', 'Grading scales', ''], ['/x/fee_heads', 'Fee heads', ''], ['/fees/structure', 'Fee plans', ''], ['/x/concession_types', 'Concessions and scholarships', ''], ['/x/leave_types', 'Leave policies', ''], ['/x/accounts', 'Chart of accounts', '']]],
  ['Workflows', [['/x/approval_rules', 'Approval rules', 'Who approves what, in what order'], ['/admin/automations', 'Automations and recipes', 'Install, pause, run log'], ['/x/checklists', 'Adoption checklists', ''], ['/admin/adoption', 'Adoption monitor', 'Usage and compliance']]],
  ['Integrations and devices', [['/x/integrations', 'Integrations', 'Gateways, WhatsApp, SMS, accounting, SSO'], ['/x/devices', 'Devices', 'Biometric, RFID, GPS, gate tablets'], ['/x/api_keys', 'API keys', ''], ['/x/webhooks', 'Webhooks', '']]],
  ['Security, privacy and data', [['/admin/audit', 'Audit log', 'Search every change and sensitive view'], ['/admin/health', 'Data-health report', 'Missing and impossible values'], ['/x/consents', 'Consent register', ''], ['/x/data_requests', 'Data-subject requests', ''], ['/x/retention_rules', 'Retention rules', ''], ['/x/breach_log', 'Breach-response log', ''], ['/x/export_log', 'Export log', '']]],
  ['Subscription and help', [['/admin/subscription', 'Plan and messaging wallet', ''], ['/x/support_tickets', 'Support tickets', 'Talk to AutoED support'], ['/x/briefings', "What's new", '']]],
];
export default async function Admin() {
  await requireCap('admin');
  return (
    <Page title="Admin console" sub="Shape the system to the school's way of working. No vendor call needed.">
      <div className="space-y-4">{AREAS.map(([title, links]) => <Card key={title} title={title}><div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">{links.map(([h, l, d]) => <Link key={h} href={h} className="bg-white px-4 py-3 hover:bg-paper"><div className="text-sm font-medium">{l}</div>{d && <div className="text-xs text-muted">{d}</div>}</Link>)}</div></Card>)}</div>
    </Page>
  );
}

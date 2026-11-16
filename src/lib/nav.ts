import type { Ctx } from './ctx';
import { ENTITIES } from './entities.gen';

export const PRODUCT = { name: 'AutoED-ERP', tagline: 'The school operating system', owner: 'Atif Khan', ownerTitle: 'Founder', company: 'Digivate' };

type Item = { href: string; label: string; cap?: string; roles?: string[]; module?: string };
type Group = { title: string; items: Item[] };

/** Navigation grouped by job. Each role sees only what it can use (PRD 18.1). */
const NAV: Group[] = [
  { title: 'Today', items: [
    { href: '/', label: 'Home' },
    { href: '/approvals', label: 'Approvals' },
    { href: '/inbox', label: 'Notifications' },
  ] },
  { title: 'Students', items: [
    { href: '/students', label: 'Students', cap: 'students' },
    { href: '/attendance', label: 'Attendance', cap: 'attendance' },
    { href: '/admissions', label: 'Admissions', cap: 'admissions' },
    { href: '/wellbeing', label: 'Wellbeing and health', cap: 'wellbeing' },
  ] },
  { title: 'Academics', items: [
    { href: '/timetable', label: 'Timetable', cap: 'timetable' },
    { href: '/homework', label: 'Homework and diary', cap: 'homework' },
    { href: '/assessments', label: 'Assessment', cap: 'marks' },
    { href: '/report-cards', label: 'Report cards', cap: 'marks' },
    { href: '/exams', label: 'Exam cell and tests', cap: 'exams' },
    { href: '/m/learning', label: 'Curriculum and learning', cap: 'learning' },
  ] },
  { title: 'Finance', items: [
    { href: '/fees/counter', label: 'Fee counter', cap: 'fees' },
    { href: '/fees', label: 'Fees and dues', cap: 'fees' },
    { href: '/accounting', label: 'Accounting', cap: 'accounting' },
  ] },
  { title: 'People', items: [
    { href: '/hr', label: 'Staff and HR', cap: 'staff' },
    { href: '/hr/leave', label: 'Leave', cap: 'leave' },
    { href: '/hr/payroll', label: 'Payroll', cap: 'payroll' },
    { href: '/me', label: 'My leave and payslips', roles: ['coordinator', 'class_teacher', 'subject_teacher', 'accounts', 'front_office', 'transport', 'librarian', 'store', 'warden', 'counsellor', 'nurse', 'security', 'driver', 'principal'] },
  ] },
  { title: 'Operations', items: [
    { href: '/transport', label: 'Transport', cap: 'transport', module: 'transport' },
    { href: '/driver', label: 'Driver app', roles: ['driver', 'transport', 'group_admin'] , module: 'transport' },
    { href: '/gate', label: 'Gate and visitors', cap: 'gate' },
    { href: '/library', label: 'Library', cap: 'library', module: 'library' },
    { href: '/store', label: 'Store and canteen', cap: 'inventory', module: 'store' },
    { href: '/m/hostel', label: 'Hostel', cap: 'hostel', module: 'hostel' },
    { href: '/m/facilities', label: 'Facilities', cap: 'facilities' },
  ] },
  { title: 'Communication', items: [
    { href: '/messages', label: 'Messages', cap: 'messages' },
    { href: '/helpdesk', label: 'Helpdesk', cap: 'helpdesk' },
    { href: '/m/events', label: 'Calendar and events', cap: 'events' },
    { href: '/forms', label: 'Forms and surveys', cap: 'forms' },
    { href: '/documents', label: 'Certificates', cap: 'documents' },
  ] },
  { title: 'Insight', items: [
    { href: '/reports', label: 'Reports', cap: 'reports' },
    { href: '/insights', label: 'AI insights', roles: ['group_admin', 'principal', 'system_admin', 'coordinator'] },
    { href: '/group', label: 'Group console', roles: ['group_admin'] },
    { href: '/modules', label: 'All modules', roles: ['group_admin', 'system_admin', 'principal'] },
    { href: '/admin', label: 'Admin console', cap: 'admin' },
  ] },
];
const PARENT_NAV: Group[] = [{ title: 'Family', items: [
  { href: '/parent', label: 'Today' }, { href: '/parent/fees', label: 'Fees' }, { href: '/parent/academics', label: 'Academics' },
  { href: '/parent/requests', label: 'Requests' }, { href: '/parent/bus', label: 'Bus' }, { href: '/parent/calendar', label: 'Calendar' },
  { href: '/parent/messages', label: 'Messages' }, { href: '/parent/more', label: 'Store, wallet and more' },
] }];
const STUDENT_NAV: Group[] = [{ title: 'Student', items: [
  { href: '/student', label: 'My day' }, { href: '/student/homework', label: 'Homework' }, { href: '/student/tests', label: 'Tests' }, { href: '/student/results', label: 'Results and library' },
] }];

export function navFor(ctx: Ctx): Group[] {
  if (ctx.role === 'parent') return PARENT_NAV;
  if (ctx.role === 'student') return STUDENT_NAV;
  const groups = NAV.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => (!i.cap || ctx.can(i.cap)) && (!i.roles || i.roles.includes(ctx.role)) && (!i.module || ctx.moduleOn(i.module))),
  })).filter((g) => g.items.length);
  if (ctx.profile.is_platform_admin) groups.push({ title: 'AutoED', items: [{ href: '/platform', label: 'Platform console' }] });
  return groups;
}

export const MODULE_TITLES: Record<string, string> = {
  sis: 'Student information', attendance: 'Attendance', timetable: 'Timetable', learning: 'Curriculum and learning', homework: 'Homework', assessment: 'Assessment',
  exams: 'Exam cell', wellbeing: 'Wellbeing and conduct', health: 'Health and infirmary', activities: 'Co-curricular and houses', admissions: 'Admissions', fees: 'Fees',
  accounting: 'Accounting and budgets', hr: 'HR and payroll', transport: 'Transport', safety: 'Gate and campus safety', hostel: 'Hostel', canteen: 'Canteen',
  inventory: 'Store, inventory and procurement', library: 'Library', documents: 'Documents', communication: 'Communication', events: 'Calendar, events and PTM',
  helpdesk: 'Helpdesk', forms: 'Forms', workflow: 'Workflows', reports: 'Reports', adoption: 'Adoption monitor', alumni: 'Alumni', group: 'Group and franchise',
  statutory: 'Statutory reporting', facilities: 'Facilities and maintenance', admin: 'Set-up', privacy: 'Privacy and consent',
};
export const entitiesOf = (module: string) => Object.values(ENTITIES).filter((e) => e.module === module && !e.hidden);

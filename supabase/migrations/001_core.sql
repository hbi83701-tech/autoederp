-- AutoED-ERP core: tenancy, identity, permissions, audit, approvals.
create schema if not exists app;
grant usage on schema app to authenticated, anon, service_role;

-- ───────────── Tenants ─────────────
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  pan text, gst_no text, logo_url text, city text, state text default 'Telangana',
  plan text not null default 'Enterprise' check (plan in ('Essentials','Professional','Enterprise')),
  status text not null default 'trial' check (status in ('trial','active','suspended','cancelled','archived')),
  price_per_student numeric not null default 900,
  renewal_date date, trial_ends date default (current_date + 30),
  region text default 'India',
  modules jsonb not null default '{}',
  terminology jsonb not null default '{}',
  settings jsonb not null default '{}',
  messaging_balance numeric not null default 0,
  partner text, notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references public.organisations(id) on delete set null,
  branch_id uuid,
  role text not null default 'pending',
  full_name text, email text, phone text,
  staff_id uuid, student_id uuid,
  is_platform_admin boolean not null default false,
  language text not null default 'en',
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles(org_id);

create table public.role_permissions (
  org_id uuid not null references public.organisations(id) on delete cascade,
  role text not null,
  capability text not null,
  level text not null default '-' check (level in ('F','B','S','O','V','R','-')),
  primary key (org_id, role, capability)
);

-- ───────────── Session helpers (used by every policy) ─────────────
create or replace function app.org_id() returns uuid language sql stable security definer set search_path = '' as
$$ select org_id from public.profiles where id = auth.uid() and active $$;
create or replace function app.role() returns text language sql stable security definer set search_path = '' as
$$ select role from public.profiles where id = auth.uid() and active $$;
create or replace function app.branch_id() returns uuid language sql stable security definer set search_path = '' as
$$ select branch_id from public.profiles where id = auth.uid() and active $$;
create or replace function app.staff_id() returns uuid language sql stable security definer set search_path = '' as
$$ select staff_id from public.profiles where id = auth.uid() and active $$;
create or replace function app.is_staff() returns boolean language sql stable security definer set search_path = '' as
$$ select coalesce((select role not in ('parent','student','pending') and org_id is not null from public.profiles where id = auth.uid() and active), false) $$;
create or replace function app.is_platform_admin() returns boolean language sql stable security definer set search_path = '' as
$$ select coalesce((select is_platform_admin from public.profiles where id = auth.uid() and active), false) $$;
create or replace function app.user_name() returns text language sql stable security definer set search_path = '' as
$$ select coalesce(full_name, email) from public.profiles where id = auth.uid() $$;
create or replace function app.can(cap text, need text default 'read') returns boolean language sql stable security definer set search_path = '' as
$$ select exists (
     select 1 from public.profiles p join public.role_permissions rp on rp.org_id = p.org_id and rp.role = p.role
     where p.id = auth.uid() and p.active and rp.capability = cap
       and case when need = 'write' then rp.level in ('F','B','S') else rp.level in ('F','B','S','V') end) $$;
create or replace function app.branch_ok(b uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select coalesce((select p.branch_id is null or b is null or p.branch_id = b from public.profiles p where p.id = auth.uid() and p.active), false) $$;
create or replace function app.require(cap text, need text default 'write') returns void language plpgsql stable security definer set search_path = '' as
$$ begin if not app.can(cap, need) then raise exception 'You do not have permission for this action (%).', cap using errcode = '42501'; end if; end $$;

-- ───────────── Policy and audit generators ─────────────
create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid,
  actor uuid, actor_name text,
  action text not null, entity text not null, entity_id text,
  before jsonb, after jsonb, note text,
  at timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events(org_id, at desc);
create index audit_events_entity_idx on public.audit_events(entity, entity_id);
alter table public.audit_events enable row level security;
create policy audit_sel on public.audit_events for select to authenticated using (org_id = (select app.org_id()) and (select app.can('audit','read')));

create or replace function app.audit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events(org_id, actor, actor_name, action, entity, entity_id, after) values (new.org_id, auth.uid(), app.user_name(), 'created', tg_table_name, new.id::text, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      insert into public.audit_events(org_id, actor, actor_name, action, entity, entity_id, before, after) values (new.org_id, auth.uid(), app.user_name(), 'updated', tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  else
    insert into public.audit_events(org_id, actor, actor_name, action, entity, entity_id, before) values (old.org_id, auth.uid(), app.user_name(), 'deleted', tg_table_name, old.id::text, to_jsonb(old));
    return old;
  end if;
end $$;
create or replace function app.audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'The audit trail is append-only.'; end $$;
create trigger audit_events_immutable before update or delete on public.audit_events for each row execute function app.audit_immutable();

create or replace function app.audited(tbl text, mode text default 'iud') returns void language plpgsql as $$
begin
  execute format('create trigger %I after %s on public.%I for each row execute function app.audit()',
    tbl || '_audit', case when mode = 'ud' then 'update or delete' else 'insert or update or delete' end, tbl);
end $$;

create or replace function app.secure(tbl text, cap text, opts jsonb default '{}') returns void language plpgsql as $$
declare
  has_branch boolean;
  br text := '';
  base text := 'org_id = (select app.org_id())';
begin
  execute format('alter table public.%I enable row level security', tbl);
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = tbl and column_name = 'branch_id') into has_branch;
  if has_branch then br := ' and (branch_id is null or (select app.branch_id()) is null or branch_id = (select app.branch_id()))'; end if;
  if coalesce((opts->>'read_all')::boolean, false) then
    execute format('create policy %I on public.%I for select to authenticated using (%s)', tbl || '_sel', tbl, base);
  elsif not coalesce((opts->>'no_staff_read')::boolean, false) then
    execute format('create policy %I on public.%I for select to authenticated using (%s and (select app.can(%L, ''read''))%s)', tbl || '_sel', tbl, base, cap, br);
  end if;
  execute format('create policy %I on public.%I for insert to authenticated with check (%s and (select app.can(%L, ''write''))%s)', tbl || '_ins', tbl, base, cap, br);
  execute format('create policy %I on public.%I for update to authenticated using (%s and (select app.can(%L, ''write''))%s) with check (%s and (select app.can(%L, ''write''))%s)', tbl || '_upd', tbl, base, cap, br, base, cap, br);
  execute format('create policy %I on public.%I for delete to authenticated using (%s and (select app.can(%L, ''write''))%s)', tbl || '_del', tbl, base, cap, br);
  if opts ? 'student' then
    execute format('create policy %I on public.%I for select to authenticated using (%I = any((select app.my_students())::uuid[]))', tbl || '_family', tbl, opts->>'student');
  end if;
  if opts ? 'own' then
    execute format('create policy %I on public.%I for select to authenticated using (%I = (select auth.uid()))', tbl || '_own', tbl, opts->>'own');
    execute format('create policy %I on public.%I for insert to authenticated with check (%s and %I = (select auth.uid()))', tbl || '_own_ins', tbl, base, opts->>'own');
  end if;
  if opts ? 'staff_own' then
    execute format('create policy %I on public.%I for select to authenticated using (%I = (select app.staff_id()))', tbl || '_staff_own', tbl, opts->>'staff_own');
  end if;
end $$;

-- ───────────── RLS for the core tables ─────────────
alter table public.organisations enable row level security;
create policy org_sel on public.organisations for select to authenticated using (id = (select app.org_id()) or (select app.is_platform_admin()));
create policy org_upd on public.organisations for update to authenticated using (id = (select app.org_id()) and (select app.can('admin','write'))) with check (id = (select app.org_id()));
revoke insert, update, delete on public.organisations from authenticated, anon;
grant update (name, legal_name, pan, gst_no, logo_url, city, state, modules, terminology, settings) on public.organisations to authenticated;
select app.audited('organisations');

alter table public.profiles enable row level security;
create policy prof_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy prof_org on public.profiles for select to authenticated using (org_id = (select app.org_id()) and (select app.is_staff()));
create policy prof_platform on public.profiles for select to authenticated using ((select app.is_platform_admin()));
create policy prof_admin_upd on public.profiles for update to authenticated using (org_id = (select app.org_id()) and (select app.can('admin','write'))) with check (org_id = (select app.org_id()));
revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (role, branch_id, full_name, phone, active, staff_id, student_id) on public.profiles to authenticated;

alter table public.role_permissions enable row level security;
create policy rp_sel on public.role_permissions for select to authenticated using (org_id = (select app.org_id()));
create policy rp_ins on public.role_permissions for insert to authenticated with check (org_id = (select app.org_id()) and (select app.can('admin','write')));
create policy rp_upd on public.role_permissions for update to authenticated using (org_id = (select app.org_id()) and (select app.can('admin','write'))) with check (org_id = (select app.org_id()));
create policy rp_del on public.role_permissions for delete to authenticated using (org_id = (select app.org_id()) and (select app.can('admin','write')));

-- New auth user -> profile row (role 'pending' until they create a school or accept an invite).
create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, full_name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- ───────────── Invites ─────────────
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.org_id() references public.organisations(id) on delete cascade,
  email text, full_name text,
  role text not null,
  branch_id uuid,
  staff_id uuid, guardian_id uuid, student_id uuid,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid, accepted_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
alter table public.invites enable row level security;
create policy inv_all on public.invites for all to authenticated
  using (org_id = (select app.org_id()) and ((select app.can('admin','write')) or (select app.can('staff','write')) or (select app.can('students','write'))))
  with check (org_id = (select app.org_id()) and ((select app.can('admin','write')) or (select app.can('staff','write')) or (select app.can('students','write'))));

-- ───────────── Notifications ─────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  title text not null, body text, link text, kind text default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notif_sel on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notif_ins on public.notifications for insert to authenticated with check (org_id = (select app.org_id()) and (select app.is_staff()));
create policy notif_upd on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function app.notify(p_org uuid, p_user uuid, p_title text, p_body text default null, p_link text default null, p_kind text default 'info') returns void
language sql security definer set search_path = '' as
$$ insert into public.notifications(org_id, user_id, title, body, link, kind) select p_org, p_user, p_title, p_body, p_link, p_kind where p_user is not null $$;

-- Notify every active user holding one of the given roles (optionally within a branch).
create or replace function app.notify_roles(p_org uuid, p_roles text[], p_branch uuid, p_title text, p_body text default null, p_link text default null, p_kind text default 'info') returns void
language sql security definer set search_path = '' as
$$ insert into public.notifications(org_id, user_id, title, body, link, kind)
   select p_org, p.id, p_title, p_body, p_link, p_kind from public.profiles p
   where p.org_id = p_org and p.active and p.role = any(p_roles) and (p_branch is null or p.branch_id is null or p.branch_id = p_branch) $$;

-- ───────────── Number series ─────────────
create table public.number_series (
  org_id uuid not null references public.organisations(id) on delete cascade,
  scope text not null default '',
  key text not null,
  prefix text not null default '',
  next_value integer not null default 1,
  pad integer not null default 5,
  primary key (org_id, scope, key)
);
alter table public.number_series enable row level security;
create policy ns_sel on public.number_series for select to authenticated using (org_id = (select app.org_id()) and (select app.is_staff()));
create policy ns_upd on public.number_series for update to authenticated using (org_id = (select app.org_id()) and (select app.can('admin','write'))) with check (org_id = (select app.org_id()));

create or replace function app.next_number(p_org uuid, p_key text, p_prefix text, p_scope text default '') returns text
language plpgsql security definer set search_path = '' as $$
declare v integer; pf text; pd integer;
begin
  insert into public.number_series(org_id, scope, key, prefix) values (p_org, coalesce(p_scope, ''), p_key, p_prefix) on conflict do nothing;
  update public.number_series set next_value = next_value + 1 where org_id = p_org and scope = coalesce(p_scope, '') and key = p_key
    returning next_value - 1, prefix, pad into v, pf, pd;
  return pf || lpad(v::text, pd, '0');
end $$;

-- ───────────── Server secret (lets the Next.js server prove itself to SECURITY DEFINER functions) ─────────────
create table if not exists app.secrets (key text primary key, value_hash text not null);
create or replace function app.server_ok(p_secret text) returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from app.secrets where key = 'server' and value_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')) $$;

-- ───────────── Approvals (generic engine) ─────────────
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.org_id() references public.organisations(id) on delete cascade,
  branch_id uuid,
  object_type text not null,
  object_id uuid,
  title text not null,
  summary text,
  impact text,
  payload jsonb not null default '{}',
  amount numeric,
  student_id uuid,
  steps jsonb not null default '["principal"]',
  current_step integer not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','rejected','info','cancelled')),
  requested_by uuid default auth.uid(), requested_by_name text,
  sla_due timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index approvals_org_idx on public.approvals(org_id, status);
create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  approval_id uuid not null references public.approvals(id) on delete cascade,
  step integer not null,
  actor uuid, actor_name text,
  decision text not null,
  comment text,
  at timestamptz not null default now()
);
alter table public.approvals enable row level security;
alter table public.approval_actions enable row level security;
create policy appr_sel on public.approvals for select to authenticated using (org_id = (select app.org_id()) and (requested_by = (select auth.uid()) or (select app.is_staff())));
create policy appr_act_sel on public.approval_actions for select to authenticated using (org_id = (select app.org_id()) and (select app.is_staff()));
select app.audited('approvals');

-- ───────────── Platform console tables (AutoED internal back office) ─────────────
create table public.platform_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, price_per_student numeric not null, min_per_branch numeric not null, includes text, features jsonb not null default '{}'
);
create table public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  invoice_no text, period text, students integer, amount numeric not null, gst numeric not null default 0,
  status text not null default 'due' check (status in ('due','paid','overdue','void')), due_date date, paid_on date, created_at timestamptz not null default now()
);
create table public.platform_onboarding (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  item text not null, status text not null default 'todo' check (status in ('todo','in_progress','done','blocked')), owner text, due_date date, blocker text, sort integer default 0
);
create table public.platform_flags (
  key text not null, org_id uuid references public.organisations(id) on delete cascade, enabled boolean not null default false, note text,
  id uuid primary key default gen_random_uuid()
);
create table public.platform_content (
  id uuid primary key default gen_random_uuid(),
  type text not null, key text not null, version text not null default '1', effective_from date default current_date, data jsonb not null default '{}', notes text
);
create table public.platform_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null, notes text, stage text not null default 'planned' check (stage in ('planned','pilot','general','rolled_back')), released_on date, kill_switch boolean not null default false
);
create table public.platform_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  type text not null check (type in ('credit','debit')), channel text, category text, amount numeric not null, provider_cost numeric default 0, note text, at timestamptz not null default now()
);
create table public.platform_access_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid, actor uuid, actor_name text, action text not null, reason text, expires_at timestamptz, at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['platform_plans','platform_invoices','platform_onboarding','platform_flags','platform_content','platform_releases','platform_wallet_ledger','platform_access_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select app.is_platform_admin())) with check ((select app.is_platform_admin()))', t || '_platform', t);
  end loop;
end $$;
create policy platform_plans_read on public.platform_plans for select to authenticated using (true);
create policy platform_invoices_org on public.platform_invoices for select to authenticated using (org_id = (select app.org_id()) and (select app.can('admin','read')));
create policy platform_wallet_org on public.platform_wallet_ledger for select to authenticated using (org_id = (select app.org_id()) and (select app.can('admin','read')));
create policy platform_flags_org on public.platform_flags for select to authenticated using (org_id is null or org_id = (select app.org_id()));
create policy platform_releases_read on public.platform_releases for select to authenticated using (true);
create policy platform_access_org on public.platform_access_log for select to authenticated using (org_id = (select app.org_id()) and (select app.can('audit','read')));
create policy platform_onboarding_org on public.platform_onboarding for select to authenticated using (org_id = (select app.org_id()) and (select app.can('admin','read')));

insert into public.platform_plans(name, price_per_student, min_per_branch, includes) values
 ('Essentials', 350, 50000, 'Student records, attendance, fees and receipts, parent and teacher apps, announcements and diary, certificates and ID cards, basic report cards, standard reports'),
 ('Professional', 600, 90000, 'Essentials plus all gradebooks, exam cell, homework and LMS-lite, HR and payroll, transport with GPS, library, inventory, visitor and gate, analytics'),
 ('Enterprise', 900, 250000, 'Professional plus hostel, canteen wallet, school store, group console, budget and finance intelligence, custom workflows and objects, API and SSO, AI insights, dedicated success manager');

-- ───────────── Compact table builder (used by 002_tables.sql) ─────────────
-- Column spec: "key[:type][!][=default][{opt|opt}]" or "key>ref_table[!]", separated by ";".
create table app.pending (seq serial primary key, kind integer not null, stmt text not null);
create or replace function app.t(p_name text, p_cap text, p_cols text, p_opts jsonb default '{}') returns void language plpgsql as $$
declare
  spec text; m text[]; k text; typ text; req boolean; rest text; def text; l text; i integer; u text;
  lines text[] := array['id uuid primary key default gen_random_uuid()', 'org_id uuid not null default app.org_id() references public.organisations(id) on delete cascade'];
  so jsonb := '{}';
begin
  if coalesce((p_opts->>'branch')::boolean, false) then
    lines := array_append(lines, 'branch_id uuid default app.branch_id()');
    insert into app.pending(kind, stmt) values (1, format('alter table public.%I add constraint %I foreign key (branch_id) references public.branches(id)', p_name, p_name || '_branch_id_fkey'));
  end if;
  if coalesce((p_opts->>'year')::boolean, false) then
    lines := array_append(lines, 'year_id uuid');
    insert into app.pending(kind, stmt) values (1, format('alter table public.%I add constraint %I foreign key (year_id) references public.academic_years(id)', p_name, p_name || '_year_id_fkey'));
  end if;
  foreach spec in array string_to_array(p_cols, ';') loop
    m := regexp_match(spec, '^(\w+)>(\w+)(!)?$');
    if m is not null then
      lines := array_append(lines, m[1] || ' uuid' || case when m[3] is not null then ' not null' else '' end);
      insert into app.pending(kind, stmt) values
        (1, format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s', p_name, p_name || '_' || m[1] || '_fkey', m[1], m[2], case when m[3] is not null then 'cascade' else 'set null' end)),
        (1, format('create index %I on public.%I(%I)', p_name || '_' || m[1] || '_idx', p_name, m[1]));
      continue;
    end if;
    m := regexp_match(spec, '^(\w+)(?::(\w+))?(!)?(.*)$');
    k := m[1]; typ := coalesce(m[2], 'text'); req := m[3] is not null; rest := coalesce(m[4], ''); def := null;
    if left(rest, 1) = '=' then
      if typ = 'jsonb' then def := substr(rest, 2);
      else i := strpos(rest, '{'); def := case when i = 0 then substr(rest, 2) else substr(rest, 2, i - 2) end;
      end if;
    end if;
    l := k || ' ' || case typ when 'int' then 'integer' when 'bool' then 'boolean' when 'ts' then 'timestamptz' else typ end || case when req then ' not null' else '' end;
    if def is not null and def <> '' then
      l := l || ' default ' || case when def = 'now' then 'now()' when def = 'today' then 'current_date' when def = 'uid' then 'auth.uid()'
        when typ in ('text', 'date', 'time') then quote_literal(def) when typ = 'jsonb' then quote_literal(def) || '::jsonb' else def end;
    end if;
    lines := array_append(lines, l);
  end loop;
  if coalesce((p_opts->>'custom')::boolean, false) then lines := array_append(lines, 'custom jsonb not null default ''{}'''); end if;
  lines := array_append(lines, 'created_by uuid default auth.uid()');
  lines := array_append(lines, 'created_at timestamptz not null default now()');
  execute format('create table public.%I (%s)', p_name, array_to_string(lines, ', '));
  execute format('create index %I on public.%I(org_id)', p_name || '_org_idx', p_name);
  for u in select jsonb_array_elements_text(coalesce(p_opts->'unique', '[]')) loop
    execute format('create unique index %I on public.%I(%s)', p_name || '_' || replace(u, ',', '_') || '_uq', p_name, u);
  end loop;
  for u in select jsonb_array_elements_text(coalesce(p_opts->'index', '[]')) loop
    execute format('create index %I on public.%I(%s)', p_name || '_' || replace(u, ',', '_') || '_ix', p_name, u);
  end loop;
  select coalesce(jsonb_object_agg(key, value), '{}') into so from jsonb_each(p_opts) where key in ('read_all', 'student', 'own', 'staff_own', 'no_staff_read');
  insert into app.pending(kind, stmt) values (2, format('select app.secure(%L, %L, %L::jsonb)', p_name, p_cap, so::text));
  if coalesce(p_opts->>'audit', 'iud') <> 'none' then
    insert into app.pending(kind, stmt) values (2, format('select app.audited(%L, %L)', p_name, coalesce(p_opts->>'audit', 'iud')));
  end if;
end $$;
create or replace function app.run_pending(p_kind integer) returns void language plpgsql as $$
declare r record;
begin
  for r in select stmt from app.pending where kind = p_kind order by seq loop execute r.stmt; end loop;
  delete from app.pending where kind = p_kind;
end $$;

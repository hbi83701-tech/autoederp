-- AutoED-ERP business logic, part 1: permissions, onboarding, student lifecycle, money, approvals.

-- ───────────── Default permission matrix (PRD section 15, editable per school) ─────────────
create or replace function app.seed_permissions(p_org uuid) returns void language plpgsql security definer set search_path = '' as $$
declare r record; pair text; c text;
begin
  foreach c in array array['students','sensitive','attendance','timetable','learning','homework','marks','exams','wellbeing','safeguarding','health','activities','admissions','fees','concessions','accounting','staff','payroll','leave','messages','transport','gate','hostel','canteen','inventory','library','documents','events','helpdesk','forms','reports','admin','audit','facilities'] loop
    insert into public.role_permissions values (p_org, 'group_admin', c, 'F') on conflict do nothing;
  end loop;
  for r in select * from (values
    ('system_admin', 'students:B,attendance:B,timetable:B,learning:B,homework:B,marks:B,exams:B,wellbeing:V,health:V,activities:B,admissions:B,fees:B,concessions:V,accounting:V,staff:B,payroll:V,leave:B,messages:B,transport:B,gate:B,hostel:B,canteen:B,inventory:B,library:B,documents:B,events:B,helpdesk:B,forms:B,reports:V,admin:F,audit:F,facilities:B'),
    ('principal', 'students:B,sensitive:B,attendance:B,timetable:B,learning:B,homework:B,marks:B,exams:B,wellbeing:B,safeguarding:B,health:B,activities:B,admissions:B,fees:V,concessions:B,accounting:V,staff:B,leave:B,messages:B,transport:V,gate:B,hostel:B,canteen:V,inventory:V,library:V,documents:B,events:B,helpdesk:B,forms:B,reports:V,admin:V,audit:V,facilities:B'),
    ('coordinator', 'students:V,attendance:B,timetable:B,learning:B,homework:B,marks:B,exams:B,wellbeing:B,health:V,activities:B,leave:V,messages:B,documents:V,events:B,helpdesk:B,forms:B,reports:V,library:V,facilities:V'),
    ('class_teacher', 'students:V,sensitive:V,attendance:S,timetable:V,learning:S,homework:S,marks:S,exams:V,wellbeing:S,health:V,activities:S,fees:V,concessions:R,leave:O,messages:S,documents:V,events:V,helpdesk:S,forms:V,reports:V,library:V,facilities:V'),
    ('subject_teacher', 'students:V,attendance:S,timetable:V,learning:S,homework:S,marks:S,exams:V,wellbeing:S,activities:V,leave:O,messages:S,events:V,helpdesk:V,forms:V,reports:V,library:V,facilities:V'),
    ('accounts', 'students:V,fees:B,concessions:V,accounting:B,payroll:V,leave:O,messages:S,inventory:V,canteen:V,transport:V,documents:V,helpdesk:B,reports:V'),
    ('hr', 'staff:F,payroll:F,leave:F,attendance:B,documents:B,helpdesk:B,events:V,reports:V,messages:S'),
    ('front_office', 'students:B,admissions:B,fees:V,attendance:V,gate:B,messages:B,documents:B,events:B,helpdesk:B,forms:B,reports:V,transport:V,library:V,leave:O'),
    ('transport', 'students:V,attendance:S,transport:B,fees:V,messages:S,gate:V,helpdesk:B,reports:V,leave:O'),
    ('librarian', 'students:V,library:B,inventory:V,reports:V,leave:O'),
    ('store', 'students:V,inventory:B,canteen:B,fees:V,reports:V,leave:O'),
    ('warden', 'students:V,hostel:B,attendance:S,wellbeing:S,gate:B,health:V,messages:S,leave:O'),
    ('counsellor', 'students:V,sensitive:V,wellbeing:B,safeguarding:B,health:V,events:V,leave:O'),
    ('nurse', 'students:V,sensitive:V,health:B,leave:O'),
    ('security', 'students:V,gate:B,transport:V,leave:O'),
    ('driver', 'leave:O')
  ) as t(role, perms) loop
    foreach pair in array string_to_array(r.perms, ',') loop
      insert into public.role_permissions values (p_org, r.role, split_part(pair, ':', 1), split_part(pair, ':', 2)) on conflict (org_id, role, capability) do nothing;
    end loop;
  end loop;
end $$;

-- ───────────── Onboarding: create a school, accept an invite ─────────────
create table if not exists app.platform_admin_emails (email text primary key);

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, full_name, is_platform_admin)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
          exists (select 1 from app.platform_admin_emails e where lower(e.email) = lower(new.email)))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.create_organisation(p_name text, p_branch text, p_board text default 'CBSE', p_city text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_uid uuid := auth.uid(); ys integer;
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter the school name.'; end if;
  if (select org_id from public.profiles where id = v_uid) is not null then raise exception 'You already belong to a school.'; end if;
  insert into public.organisations(name, city, created_by) values (trim(p_name), p_city, v_uid) returning id into v_org;
  perform app.seed_permissions(v_org);
  update public.profiles set org_id = v_org, role = 'group_admin', branch_id = null where id = v_uid;
  insert into public.branches(org_id, name, code, board, city) values (v_org, coalesce(nullif(trim(p_branch), ''), 'Main campus'), 'MAIN', p_board, p_city);
  ys := case when extract(month from current_date) >= 4 then extract(year from current_date)::integer else extract(year from current_date)::integer - 1 end;
  insert into public.academic_years(org_id, name, start_date, end_date, is_current)
  values (v_org, ys || '-' || right((ys + 1)::text, 2), make_date(ys, 4, 1), make_date(ys + 1, 3, 31), true);
  insert into public.platform_onboarding(org_id, item, sort)
  select v_org, x, ord from unnest(array['Structure set up from pack','Roles and users','Fee plans and concessions','Opening balances migrated and reconciled','Assessment scheme and report-card templates','Timetable and transport routes','Channels approved (WhatsApp, DLT, gateway)','Staff training','Go-live of staff modules','Parent app launch']) with ordinality as t(x, ord);
  return v_org;
end $$;

create or replace function app.guard_invite() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.can('admin', 'write') then return new; end if;
  if new.role in ('parent', 'student') and app.can('students', 'write') then return new; end if;
  if app.can('staff', 'write') and new.role not in ('group_admin', 'system_admin', 'principal', 'accounts', 'hr', 'parent', 'student') then return new; end if;
  raise exception 'You cannot invite someone as %.', new.role;
end $$;
create trigger invites_guard before insert or update on public.invites for each row execute function app.guard_invite();

create or replace function public.claim_invite(p_token text) returns text language plpgsql security definer set search_path = '' as $$
declare inv public.invites; v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;
  select email into v_email from auth.users where id = v_uid;
  select * into inv from public.invites where token = p_token and accepted_at is null and expires_at > now();
  if inv.id is null then raise exception 'This invite link is invalid or has expired.'; end if;
  if inv.email is not null and lower(inv.email) <> lower(v_email) then raise exception 'This invite was issued for a different email address.'; end if;
  if (select org_id from public.profiles where id = v_uid) is not null then raise exception 'You already belong to a school.'; end if;
  update public.profiles set org_id = inv.org_id, role = inv.role, branch_id = inv.branch_id, staff_id = inv.staff_id, student_id = inv.student_id,
    full_name = coalesce(inv.full_name, full_name) where id = v_uid;
  if inv.staff_id is not null then update public.staff set user_id = v_uid where id = inv.staff_id; end if;
  if inv.guardian_id is not null then update public.guardians set user_id = v_uid where id = inv.guardian_id; end if;
  update public.invites set accepted_by = v_uid, accepted_at = now() where id = inv.id;
  return inv.role;
end $$;

create or replace function public.update_my_profile(p_name text, p_phone text, p_language text) returns void language sql security definer set search_path = '' as
$$ update public.profiles set full_name = coalesce(nullif(trim(p_name), ''), full_name), phone = p_phone, language = coalesce(p_language, language) where id = auth.uid() $$;
create or replace function public.touch_seen() returns void language sql security definer set search_path = '' as
$$ update public.profiles set last_seen_at = now() where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '10 minutes') $$;
create or replace function public.next_no(p_key text, p_prefix text, p_scope text default '') returns text language plpgsql security definer set search_path = '' as
$$ begin if not app.is_staff() then raise exception 'Not allowed'; end if; return app.next_number(app.org_id(), p_key, p_prefix, p_scope); end $$;
create or replace function public.log_view(p_entity text, p_id text, p_note text default null) returns void language sql security definer set search_path = '' as
$$ insert into public.audit_events(org_id, actor, actor_name, action, entity, entity_id, note) select app.org_id(), auth.uid(), app.user_name(), 'viewed', p_entity, p_id, p_note where app.org_id() is not null $$;
create or replace function public.staff_directory() returns table (id uuid, name text, designation text) language sql stable security definer set search_path = '' as
$$ select s.id, trim(s.first_name || ' ' || coalesce(s.last_name, '')), s.designation from public.staff s where s.org_id = app.org_id() and s.status = 'active' $$;

-- ───────────── Student lifecycle: a recorded state machine (DM-02) ─────────────
create or replace function public.change_student_status(p_student uuid, p_to text, p_reason text default null, p_date date default current_date) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.students; ok boolean;
begin
  perform app.require('students', 'write');
  select * into s from public.students where id = p_student and org_id = app.org_id();
  if s.id is null then raise exception 'Student not found.'; end if;
  ok := case s.status
    when 'applicant' then p_to in ('admitted', 'active', 'archived')
    when 'admitted' then p_to in ('active', 'withdrawn', 'archived')
    when 'active' then p_to in ('suspended', 'withdrawn', 'alumni')
    when 'suspended' then p_to in ('active', 'withdrawn')
    when 'withdrawn' then p_to in ('alumni', 'active')
    when 'alumni' then p_to in ('archived', 'active')
    else false end;
  if not ok then raise exception 'A student cannot move from % to %.', s.status, p_to; end if;
  perform set_config('app.status_change', '1', true);
  update public.students set status = p_to,
    left_on = case when p_to in ('withdrawn', 'alumni') then coalesce(left_on, p_date) when p_to = 'active' then null else left_on end
  where id = p_student;
  perform set_config('app.status_change', '0', true);
  insert into public.student_status_events(org_id, student_id, from_status, to_status, reason, effective_date, actor_name)
  values (s.org_id, p_student, s.status, p_to, p_reason, p_date, app.user_name());
  if p_to in ('withdrawn', 'alumni') then
    update public.fee_demands set status = 'cancelled', note = trim(coalesce(note, '') || ' Cancelled: student ' || p_to)
    where student_id = p_student and due_date > p_date and paid = 0 and status = 'due';
    update public.student_transport set active = false, end_date = p_date where student_id = p_student and active;
    update public.hostel_allocations set active = false, end_date = p_date where student_id = p_student and active;
    update public.enrolments set status = 'left', end_date = p_date where student_id = p_student and status = 'active';
  end if;
  if p_to = 'alumni' then
    insert into public.alumni_profiles(org_id, student_id, batch_year) values (s.org_id, p_student, extract(year from p_date)::integer) on conflict (student_id) do nothing;
  end if;
end $$;

create or replace function app.guard_student_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and coalesce(current_setting('app.status_change', true), '') <> '1' then
    raise exception 'Use the status change action so that the change is recorded with a reason.';
  end if;
  return new;
end $$;
create trigger students_status_guard before update on public.students for each row execute function app.guard_student_status();

-- ───────────── Money is never edited or deleted (DM-03); marks lock after publication (DM-04) ─────────────
create or replace function app.immutable_financial() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.allow_purge', true), '') = '1' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'DELETE' then raise exception 'Financial records cannot be deleted. Use a reversal.'; end if;
  if tg_table_name = 'receipts' then
    if (to_jsonb(new) - array['status', 'reversed_reason']) is distinct from (to_jsonb(old) - array['status', 'reversed_reason']) then
      raise exception 'Receipts cannot be edited. Use a reversal.';
    end if;
  elsif tg_table_name = 'receipt_payments' then
    if (to_jsonb(new) - array['cheque_status', 'deposit_batch', 'bank_line_id']) is distinct from (to_jsonb(old) - array['cheque_status', 'deposit_batch', 'bank_line_id']) then
      raise exception 'Payments cannot be edited. Use a reversal.';
    end if;
  else
    raise exception 'Financial records cannot be edited. Use a reversal entry.';
  end if;
  return new;
end $$;
create trigger receipts_immutable before update or delete on public.receipts for each row execute function app.immutable_financial();
create trigger receipt_payments_immutable before update or delete on public.receipt_payments for each row execute function app.immutable_financial();
create trigger receipt_allocations_immutable before update or delete on public.receipt_allocations for each row execute function app.immutable_financial();
create trigger vouchers_immutable before update or delete on public.vouchers for each row execute function app.immutable_financial();
create trigger voucher_lines_immutable before update or delete on public.voucher_lines for each row execute function app.immutable_financial();

create or replace function app.guard_marks() returns trigger language plpgsql security definer set search_path = '' as $$
declare st text; aid uuid;
begin
  if tg_op = 'DELETE' then aid := old.assessment_id; else aid := new.assessment_id; end if;
  select status into st from public.assessments where id = aid;
  if st in ('locked', 'published') and coalesce(current_setting('app.allow_purge', true), '') <> '1' then
    raise exception 'Marks are locked after publication. Request an unlock with a reason.';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger assessment_results_lock before insert or update or delete on public.assessment_results for each row execute function app.guard_marks();

-- ───────────── Fee collection (FEE-04, TEC-02): atomic, idempotent, traceable to the ledger ─────────────
create or replace function app.post_receipt_voucher(p_receipt uuid) returns void language plpgsql security definer set search_path = '' as $$
declare r public.receipts; v uuid; cash uuid; bank uuid; inc uuid;
begin
  select * into r from public.receipts where id = p_receipt;
  select id into cash from public.accounts where org_id = r.org_id and code = '1000';
  select id into bank from public.accounts where org_id = r.org_id and code = '1010';
  select id into inc from public.accounts where org_id = r.org_id and code = '4000';
  if cash is null or bank is null or inc is null then return; end if;
  insert into public.vouchers(org_id, branch_id, voucher_no, date, type, narration, ref_type, ref_id)
  values (r.org_id, r.branch_id, 'V-' || r.receipt_no, r.date, 'receipt', 'Fee receipt ' || r.receipt_no, 'receipt', r.id) returning id into v;
  insert into public.voucher_lines(org_id, branch_id, voucher_id, account_id, debit)
  select r.org_id, r.branch_id, v, case when rp.mode = 'cash' then cash else bank end, sum(rp.amount)
  from public.receipt_payments rp where rp.receipt_id = r.id group by case when rp.mode = 'cash' then cash else bank end;
  insert into public.voucher_lines(org_id, branch_id, voucher_id, account_id, credit)
  select r.org_id, r.branch_id, v, coalesce(h.account_id, inc), sum(ra.amount)
  from public.receipt_allocations ra join public.fee_demands d on d.id = ra.demand_id join public.fee_heads h on h.id = d.head_id
  where ra.receipt_id = r.id group by coalesce(h.account_id, inc);
end $$;

create or replace function public.collect_fee(p jsonb) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_org uuid := app.org_id(); v_total numeric := 0; v_paytotal numeric; a jsonb; d public.fee_demands; bal numeric;
  v_students uuid[]; sid uuid; v_receipt uuid; v_no text; v_ids uuid[] := '{}'; stotal numeric; pay jsonb; rem numeric[];
  remaining numeric; share numeric; v_year uuid; v_branch uuid; v_code text; i integer; v_key text := nullif(p->>'idempotency_key', '');
begin
  perform app.require('fees', 'write');
  if v_key is not null and exists (select 1 from public.receipts where org_id = v_org and idempotency_key = v_key) then
    return jsonb_build_object('duplicate', true, 'receipt_ids', (select jsonb_agg(id) from public.receipts where org_id = v_org and idempotency_key = v_key));
  end if;
  for a in select * from jsonb_array_elements(coalesce(p->'allocations', '[]')) loop
    select * into d from public.fee_demands where id = (a->>'demand_id')::uuid for update;
    if d.id is null then raise exception 'Fee demand not found.'; end if;
    if d.status in ('cancelled', 'waived') then raise exception '% is % and cannot be collected.', coalesce(d.label, 'This fee'), d.status; end if;
    bal := d.amount - d.concession + d.fine - d.paid;
    if (a->>'amount')::numeric <= 0 or (a->>'amount')::numeric > bal then
      raise exception 'The amount for % is more than its balance of %.', coalesce(d.label, 'a fee'), bal;
    end if;
    v_total := v_total + (a->>'amount')::numeric;
  end loop;
  select coalesce(sum((x->>'amount')::numeric), 0) into v_paytotal from jsonb_array_elements(coalesce(p->'payments', '[]')) x;
  if v_total <= 0 then raise exception 'Nothing to collect.'; end if;
  if v_paytotal <> v_total then raise exception 'Payment modes add up to % but the fees selected add up to %.', v_paytotal, v_total; end if;
  select array_agg(distinct d2.student_id) into v_students
  from jsonb_array_elements(p->'allocations') x join public.fee_demands d2 on d2.id = (x->>'demand_id')::uuid;
  select array_agg((x->>'amount')::numeric order by ord) into rem from jsonb_array_elements(p->'payments') with ordinality as t(x, ord);
  foreach sid in array v_students loop
    select sum((x->>'amount')::numeric), min(d2.year_id::text)::uuid into stotal, v_year
    from jsonb_array_elements(p->'allocations') x join public.fee_demands d2 on d2.id = (x->>'demand_id')::uuid where d2.student_id = sid;
    select s.branch_id, b.code into v_branch, v_code from public.students s left join public.branches b on b.id = s.branch_id where s.id = sid;
    v_no := app.next_number(v_org, 'receipt', 'RCPT-' || coalesce(v_code, 'X') || '-', coalesce(v_branch::text, ''));
    insert into public.receipts(org_id, branch_id, year_id, receipt_no, student_id, household_id, date, total, collected_by_name, idempotency_key, channel, note)
    values (v_org, v_branch, v_year, v_no, sid, (select household_id from public.students where id = sid), coalesce(nullif(p->>'date', '')::date, current_date),
            stotal, app.user_name(), v_key, coalesce(p->>'channel', 'counter'), p->>'note') returning id into v_receipt;
    v_ids := v_ids || v_receipt;
    for a in select x from jsonb_array_elements(p->'allocations') x join public.fee_demands d2 on d2.id = (x->>'demand_id')::uuid where d2.student_id = sid loop
      insert into public.receipt_allocations(org_id, receipt_id, demand_id, student_id, amount) values (v_org, v_receipt, (a->>'demand_id')::uuid, sid, (a->>'amount')::numeric);
      update public.fee_demands set paid = paid + (a->>'amount')::numeric,
        status = case when paid + (a->>'amount')::numeric >= amount - concession + fine then 'paid' else 'partial' end
      where id = (a->>'demand_id')::uuid;
    end loop;
    remaining := stotal;
    for i in 1..coalesce(array_length(rem, 1), 0) loop
      exit when remaining <= 0;
      if rem[i] > 0 then
        share := least(rem[i], remaining);
        pay := p->'payments'->(i - 1);
        insert into public.receipt_payments(org_id, receipt_id, mode, amount, reference, cheque_no, cheque_bank, cheque_date, cheque_status, gateway, gateway_payment_id)
        values (v_org, v_receipt, pay->>'mode', share, pay->>'reference', pay->>'cheque_no', pay->>'cheque_bank', nullif(pay->>'cheque_date', '')::date,
                case when pay->>'mode' in ('cheque', 'dd') then 'received' end, pay->>'gateway', pay->>'gateway_payment_id');
        rem[i] := rem[i] - share;
        remaining := remaining - share;
      end if;
    end loop;
    perform app.post_receipt_voucher(v_receipt);
    perform app.notify(v_org, g.user_id, 'Payment received', 'Receipt ' || v_no || ' for Rs ' || stotal, '/receipt/' || v_receipt, 'fees')
    from public.guardians g where g.household_id = (select household_id from public.students where id = sid) and g.user_id is not null;
  end loop;
  return jsonb_build_object('duplicate', false, 'receipt_ids', to_jsonb(v_ids));
end $$;

create or replace function app.reverse_receipt(p_receipt uuid, p_reason text) returns void language plpgsql security definer set search_path = '' as $$
declare r public.receipts; v uuid;
begin
  select * into r from public.receipts where id = p_receipt for update;
  if r.id is null or r.status = 'reversed' then return; end if;
  update public.receipts set status = 'reversed', reversed_reason = p_reason where id = r.id;
  update public.fee_demands d set paid = d.paid - ra.amount, status = case when d.paid - ra.amount <= 0 then 'due' else 'partial' end
  from public.receipt_allocations ra where ra.receipt_id = r.id and ra.demand_id = d.id;
  if exists (select 1 from public.vouchers where ref_type = 'receipt' and ref_id = r.id) then
    insert into public.vouchers(org_id, branch_id, voucher_no, date, type, narration, ref_type, ref_id)
    values (r.org_id, r.branch_id, 'V-REV-' || r.receipt_no, current_date, 'journal', 'Reversal of ' || r.receipt_no || ': ' || coalesce(p_reason, ''), 'receipt_reversal', r.id) returning id into v;
    insert into public.voucher_lines(org_id, branch_id, voucher_id, account_id, debit, credit)
    select vl.org_id, vl.branch_id, v, vl.account_id, vl.credit, vl.debit from public.voucher_lines vl join public.vouchers vo on vo.id = vl.voucher_id
    where vo.ref_type = 'receipt' and vo.ref_id = r.id;
  end if;
  perform app.notify(r.org_id, g.user_id, 'Receipt cancelled', 'Receipt ' || r.receipt_no || ' was reversed: ' || coalesce(p_reason, ''), '/receipt/' || r.id, 'fees')
  from public.guardians g where g.household_id = r.household_id and g.user_id is not null;
end $$;

create or replace function public.bounce_cheque(p_payment uuid, p_fine numeric default 0) returns void language plpgsql security definer set search_path = '' as $$
declare rp public.receipt_payments; r public.receipts; fh uuid;
begin
  perform app.require('fees', 'write');
  select * into rp from public.receipt_payments where id = p_payment and org_id = app.org_id();
  if rp.id is null or rp.mode not in ('cheque', 'dd') then raise exception 'Cheque payment not found.'; end if;
  select * into r from public.receipts where id = rp.receipt_id;
  update public.receipt_payments set cheque_status = 'bounced' where id = rp.id;
  perform app.reverse_receipt(r.id, 'Cheque ' || coalesce(rp.cheque_no, '') || ' bounced');
  if p_fine > 0 then
    select id into fh from public.fee_heads where org_id = r.org_id and type = 'fine' limit 1;
    if fh is not null then
      insert into public.fee_demands(org_id, branch_id, year_id, student_id, head_id, label, amount, due_date, note)
      values (r.org_id, r.branch_id, r.year_id, r.student_id, fh, 'Cheque bounce charge', p_fine, current_date, 'Cheque ' || coalesce(rp.cheque_no, ''));
    end if;
  end if;
  perform app.notify_roles(r.org_id, array['accounts'], r.branch_id, 'Cheque bounced', 'Receipt ' || r.receipt_no || ' was reversed. Follow up with the family.', '/fees/cheques', 'fees');
end $$;

create or replace function app.apply_concession(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare c public.concessions; ht text; tot numeric := 0; dem record; cut numeric; rem numeric;
begin
  select * into c from public.concessions where id = p_id;
  select ct.head_type into ht from public.concession_types ct where ct.id = c.type_id;
  ht := coalesce(nullif(ht, ''), 'tuition');
  rem := c.value;
  for dem in select d.* from public.fee_demands d join public.fee_heads h on h.id = d.head_id
             where d.student_id = c.student_id and d.status in ('due', 'partial') and h.type = ht and (c.year_id is null or d.year_id = c.year_id) order by d.due_date loop
    if c.kind = 'percent' then cut := round(dem.amount * c.value / 100);
    else cut := least(rem, dem.amount - dem.concession - dem.paid); rem := rem - greatest(cut, 0);
    end if;
    cut := greatest(least(cut, dem.amount - dem.concession - dem.paid), 0);
    if cut > 0 then
      update public.fee_demands set concession = concession + cut,
        status = case when amount - (concession + cut) + fine - paid <= 0 then (case when paid > 0 then 'paid' else 'waived' end) else status end
      where id = dem.id;
      tot := tot + cut;
    end if;
  end loop;
  update public.concessions set amount = tot where id = p_id;
end $$;

-- AutoED-ERP business logic, part 2: approvals engine, gate, PTM, online tests, driver app, platform, storage, grants.

-- ───────────── Approvals (WF-01, WF-02) ─────────────
create or replace function app.can_decide(a public.approvals) returns boolean language sql stable security definer set search_path = '' as $$
  select a.status = 'pending' and a.org_id = app.org_id() and (
    app.role() = 'group_admin'
    or (a.requested_by is distinct from auth.uid() and (a.steps->>a.current_step) = app.role() and app.branch_ok(a.branch_id)
        and ((a.steps->>a.current_step) <> 'class_teacher' or a.student_id is null or exists (
          select 1 from public.students s join public.sections sec on sec.id = s.section_id where s.id = a.student_id and sec.class_teacher_id = app.staff_id())))
    or exists (select 1 from public.delegations d join public.profiles p on p.id = d.from_user
               where d.to_user = auth.uid() and current_date between d.start_date and d.end_date and p.org_id = a.org_id and p.role = (a.steps->>a.current_step)))
$$;

create or replace function public.my_approvals() returns setof public.approvals language sql stable security definer set search_path = '' as
$$ select a.* from public.approvals a where a.org_id = app.org_id() and a.status = 'pending' and app.can_decide(a) order by a.created_at $$;

create or replace function public.submit_approval(p_type text, p_object uuid, p_title text, p_summary text default null, p_amount numeric default null,
  p_payload jsonb default '{}', p_student uuid default null, p_impact text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := app.org_id(); v_steps jsonb; v_id uuid; v_branch uuid; v_hours integer; v_first text;
begin
  if v_org is null then raise exception 'Please sign in first.'; end if;
  if not app.is_staff() then
    if p_type not in ('gate_pass', 'leave', 'profile_change') then raise exception 'Not allowed.'; end if;
    if p_student is null or not (p_student = any(app.my_students())) then raise exception 'Not allowed.'; end if;
  end if;
  select steps, escalate_hours into v_steps, v_hours from public.approval_rules
  where org_id = v_org and object_type = p_type and active
    and (min_amount is null or coalesce(p_amount, 0) >= min_amount) and (max_amount is null or coalesce(p_amount, 0) <= max_amount)
  order by min_amount desc nulls last limit 1;
  if v_steps is null or jsonb_array_length(v_steps) = 0 then v_steps := '["principal"]'; v_hours := 24; end if;
  v_branch := coalesce((select branch_id from public.students where id = p_student), app.branch_id());
  insert into public.approvals(org_id, branch_id, object_type, object_id, title, summary, impact, payload, amount, student_id, steps, requested_by, requested_by_name, sla_due)
  values (v_org, v_branch, p_type, p_object, p_title, p_summary, p_impact, coalesce(p_payload, '{}'), p_amount, p_student, v_steps, auth.uid(), app.user_name(),
          now() + make_interval(hours => coalesce(v_hours, 24))) returning id into v_id;
  v_first := v_steps->>0;
  if v_first = 'class_teacher' and p_student is not null then
    perform app.notify(v_org, p.id, 'Approval needed: ' || p_title, p_summary, '/approvals', 'approval')
    from public.profiles p join public.sections sec on sec.class_teacher_id = p.staff_id join public.students s on s.section_id = sec.id where s.id = p_student and p.org_id = v_org;
  else
    perform app.notify_roles(v_org, array[v_first], v_branch, 'Approval needed: ' || p_title, p_summary, '/approvals', 'approval');
  end if;
  return v_id;
end $$;

create or replace function app.apply_approval(a public.approvals, p_ok boolean, p_comment text) returns void language plpgsql security definer set search_path = '' as $$
declare lr public.leave_requests; c public.concessions; rg public.attendance_regularisations; d date; v_otp text; f text; t text;
begin
  case a.object_type
  when 'leave' then
    update public.leave_requests set status = case when p_ok then 'approved' else 'rejected' end, decided_at = now() where id = a.object_id and org_id = a.org_id returning * into lr;
    if p_ok and lr.id is not null then
      for d in select generate_series(lr.from_date, lr.to_date, interval '1 day')::date loop
        if lr.person_type = 'student' then
          insert into public.attendance(org_id, branch_id, person_type, student_id, section_id, date, session, status, source, reason)
          select lr.org_id, s.branch_id, 'student', s.id, s.section_id, d, 'day', 'LV', 'teacher', 'Approved leave' from public.students s where s.id = lr.student_id
          on conflict (student_id, date, session) do update set status = 'LV', reason = 'Approved leave';
        else
          insert into public.attendance(org_id, branch_id, person_type, staff_id, date, session, status, source, reason)
          select lr.org_id, st.branch_id, 'staff', st.id, d, 'day', case when lr.half_day then 'HD' else 'LV' end, 'teacher', 'Approved leave' from public.staff st where st.id = lr.staff_id
          on conflict (staff_id, date, session) do update set status = excluded.status, reason = 'Approved leave';
        end if;
      end loop;
      if lr.person_type = 'staff' then
        perform app.notify_roles(a.org_id, array['coordinator', 'principal'], a.branch_id, 'Cover needed: ' || a.title, 'Open the substitution planner to assign cover.', '/timetable/substitutions?date=' || lr.from_date, 'cover');
      end if;
    end if;
  when 'concession' then
    update public.concessions set status = case when p_ok then 'approved' else 'rejected' end, approved_at = now() where id = a.object_id and org_id = a.org_id returning * into c;
    if p_ok and c.id is not null then perform app.apply_concession(c.id); end if;
  when 'refund' then
    update public.refunds set status = case when p_ok then 'approved' else 'rejected' end where id = a.object_id and org_id = a.org_id;
  when 'receipt_reversal' then
    if p_ok and exists (select 1 from public.receipts where id = a.object_id and org_id = a.org_id) then
      perform app.reverse_receipt(a.object_id, coalesce(a.payload->>'reason', p_comment, 'Approved reversal'));
    end if;
  when 'post' then
    update public.posts set status = case when p_ok then 'published' else 'rejected' end, published_at = now() where id = a.object_id and org_id = a.org_id;
  when 'message' then
    update public.messages set status = case when p_ok then 'scheduled' else 'rejected' end where id = a.object_id and org_id = a.org_id;
  when 'gate_pass' then
    update public.gate_passes set status = case when p_ok then 'approved' else 'rejected' end where id = a.object_id and org_id = a.org_id;
    if p_ok then
      v_otp := lpad(floor(random() * 1000000)::integer::text, 6, '0');
      insert into public.gate_pass_secrets(org_id, pass_id, student_id, otp)
      select a.org_id, g.id, g.student_id, v_otp from public.gate_passes g where g.id = a.object_id and g.org_id = a.org_id
      on conflict (pass_id) do update set otp = excluded.otp;
    end if;
  when 'marks_unlock' then
    if p_ok then update public.assessments set status = 'open' where id = a.object_id and org_id = a.org_id; end if;
  when 'profile_change' then
    if p_ok then
      t := a.payload->>'table'; f := a.payload->>'field';
      if t = 'students' and f in ('first_name', 'last_name', 'mother_tongue', 'nationality') then
        execute format('update public.students set %I = $1 where id = $2 and org_id = $3', f) using a.payload->>'value', a.object_id, a.org_id;
      elsif t = 'students' and f = 'dob' then
        update public.students set dob = (a.payload->>'value')::date where id = a.object_id and org_id = a.org_id;
      elsif t = 'guardians' and f in ('name', 'phone', 'email', 'occupation') then
        execute format('update public.guardians set %I = $1 where id = $2 and org_id = $3', f) using a.payload->>'value', a.object_id, a.org_id;
      elsif t = 'households' and f in ('address', 'city', 'pincode', 'phone') then
        execute format('update public.households set %I = $1 where id = $2 and org_id = $3', f) using a.payload->>'value', a.object_id, a.org_id;
      end if;
    end if;
  when 'expense' then
    update public.expenses set status = case when p_ok then 'approved' else 'rejected' end where id = a.object_id and org_id = a.org_id;
  when 'purchase_request' then
    update public.purchase_requests set status = case when p_ok then 'approved' else 'rejected' end where id = a.object_id and org_id = a.org_id;
  when 'purchase_order' then
    update public.purchase_orders set status = case when p_ok then 'approved' else 'cancelled' end where id = a.object_id and org_id = a.org_id;
  when 'gallery' then
    update public.gallery_albums set status = case when p_ok then 'approved' else 'draft' end where id = a.object_id and org_id = a.org_id;
  when 'lesson_plan' then
    update public.lesson_plans set status = case when p_ok then 'approved' else 'returned' end, reviewer_comment = p_comment where id = a.object_id and org_id = a.org_id;
  when 'regularisation' then
    update public.attendance_regularisations set status = case when p_ok then 'approved' else 'rejected' end where id = a.object_id and org_id = a.org_id returning * into rg;
    if p_ok and rg.id is not null then
      insert into public.attendance(org_id, branch_id, person_type, staff_id, date, session, status, source, reason)
      select rg.org_id, st.branch_id, 'staff', st.id, rg.date, 'day', rg.requested_status, 'teacher', 'Regularised: ' || rg.reason from public.staff st where st.id = rg.staff_id
      on conflict (staff_id, date, session) do update set status = excluded.status, reason = excluded.reason;
    end if;
  when 'tc' then
    if p_ok then perform public.change_student_status(a.object_id, 'withdrawn', 'Transfer certificate approved', current_date); end if;
  else null;
  end case;
  if a.payload ? 'ticket_id' then
    update public.tickets set status = 'resolved', resolved_at = now(), resolution = case when p_ok then 'Approved' else 'Rejected' end || coalesce(': ' || p_comment, '')
    where id = (a.payload->>'ticket_id')::uuid and org_id = a.org_id;
  end if;
end $$;

create or replace function public.decide_approval(p_id uuid, p_decision text, p_comment text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare a public.approvals;
begin
  select * into a from public.approvals where id = p_id for update;
  if a.id is null or not app.can_decide(a) then raise exception 'This approval is not waiting for you.'; end if;
  if p_decision not in ('approve', 'reject', 'info') then raise exception 'Unknown decision.'; end if;
  insert into public.approval_actions(org_id, approval_id, step, actor, actor_name, decision, comment)
  values (a.org_id, a.id, a.current_step, auth.uid(), app.user_name(), p_decision, p_comment);
  if p_decision = 'info' then
    perform app.notify(a.org_id, a.requested_by, 'More information needed: ' || a.title, p_comment, '/approvals?tab=mine', 'approval');
    return 'info';
  elsif p_decision = 'reject' then
    update public.approvals set status = 'rejected', decided_at = now() where id = a.id;
    perform app.apply_approval(a, false, p_comment);
    perform app.notify(a.org_id, a.requested_by, 'Rejected: ' || a.title, p_comment, '/approvals?tab=mine', 'approval');
    return 'rejected';
  end if;
  if a.current_step + 1 < jsonb_array_length(a.steps) then
    update public.approvals set current_step = current_step + 1 where id = a.id;
    perform app.notify_roles(a.org_id, array[a.steps->>(a.current_step + 1)], a.branch_id, 'Approval needed: ' || a.title, a.summary, '/approvals', 'approval');
    return 'next';
  end if;
  update public.approvals set status = 'approved', decided_at = now() where id = a.id;
  perform app.apply_approval(a, true, p_comment);
  perform app.notify(a.org_id, a.requested_by, 'Approved: ' || a.title, p_comment, '/approvals?tab=mine', 'approval');
  return 'approved';
end $$;

-- ───────────── Gate pass handover (SAF-02) ─────────────
create or replace function public.verify_gate_pass(p_pass uuid, p_otp text) returns text language plpgsql security definer set search_path = '' as $$
declare g public.gate_passes; v_name text;
begin
  perform app.require('gate', 'write');
  select * into g from public.gate_passes where id = p_pass and org_id = app.org_id();
  if g.id is null then raise exception 'Gate pass not found.'; end if;
  if g.status <> 'approved' then raise exception 'This pass is % and cannot be used.', g.status; end if;
  if not exists (select 1 from public.gate_pass_secrets where pass_id = p_pass and otp = trim(p_otp)) then
    perform app.notify_roles(g.org_id, array['principal', 'front_office'], g.branch_id, 'Wrong OTP at the gate', 'A collector gave a wrong OTP. The student was not handed over.', '/gate', 'alert');
    return 'mismatch';
  end if;
  update public.gate_passes set status = 'handed_over', handed_over_at = now(), verified_by_name = app.user_name() where id = p_pass;
  select trim(first_name || ' ' || coalesce(last_name, '')) into v_name from public.students where id = g.student_id;
  perform app.notify(g.org_id, gu.user_id, 'Handed over', v_name || ' was handed over to ' || coalesce(g.collector_name, 'the collector') || ' at ' || to_char(now() at time zone 'Asia/Kolkata', 'HH12:MI AM'), '/parent', 'gate')
  from public.guardians gu join public.students s on s.household_id = gu.household_id where s.id = g.student_id and gu.user_id is not null;
  return 'ok';
end $$;

-- ───────────── PTM booking (EVT-02) ─────────────
create or replace function public.book_ptm_slot(p_slot uuid, p_student uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (p_student = any(app.my_students())) then raise exception 'Not allowed.'; end if;
  update public.ptm_slots set status = 'booked', student_id = p_student, booked_by = auth.uid() where id = p_slot and org_id = app.org_id() and status = 'open';
  if not found then raise exception 'That slot has just been taken. Please pick another.'; end if;
end $$;

-- ───────────── Online tests (EXM-05, EXM-06): answers never reach the student's browser ─────────────
create or replace function public.get_test_questions(p_test uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.online_tests;
begin
  select * into t from public.online_tests where id = p_test and org_id = app.org_id();
  if t.id is null then raise exception 'Test not found.'; end if;
  if not app.can('exams', 'read') and not (t.status = 'live' and t.section_id = any(app.my_sections())) then raise exception 'This test is not open to you.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'type', q.type, 'options', q.options, 'marks', q.marks) order by case when t.randomise then random() else 0 end)
    from public.questions q where q.org_id = t.org_id and q.id in (select (x #>> '{}')::uuid from jsonb_array_elements(t.question_ids) x)), '[]');
end $$;

create or replace function public.submit_test(p_test uuid, p_student uuid, p_answers jsonb, p_tab_switches integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.online_tests; q record; v_score numeric := 0; v_max numeric := 0; got numeric; v_an jsonb := '{}'; given text;
begin
  select * into t from public.online_tests where id = p_test and org_id = app.org_id();
  if t.id is null or t.status <> 'live' then raise exception 'This test is not open.'; end if;
  if not (p_student = any(app.my_students())) then raise exception 'Not allowed.'; end if;
  if exists (select 1 from public.test_attempts where test_id = p_test and student_id = p_student and submitted_at is not null) then raise exception 'You have already submitted this test.'; end if;
  for q in select * from public.questions where org_id = t.org_id and id in (select (x #>> '{}')::uuid from jsonb_array_elements(t.question_ids) x) loop
    given := lower(trim(coalesce(p_answers->>(q.id::text), '')));
    got := case when q.type in ('mcq', 'true_false', 'short') and given <> '' and given = lower(trim(coalesce(q.answer, ''))) then q.marks else 0 end;
    v_score := v_score + got; v_max := v_max + q.marks;
    v_an := jsonb_set(v_an, array[q.bloom], jsonb_build_object(
      'score', coalesce((v_an->q.bloom->>'score')::numeric, 0) + got, 'max', coalesce((v_an->q.bloom->>'max')::numeric, 0) + q.marks));
  end loop;
  insert into public.test_attempts(org_id, test_id, student_id, answers, score, max_score, submitted_at, tab_switches, analysis)
  values (t.org_id, p_test, p_student, p_answers, v_score, v_max, now(), coalesce(p_tab_switches, 0), v_an)
  on conflict (test_id, student_id) do update set answers = excluded.answers, score = excluded.score, max_score = excluded.max_score, submitted_at = now(), tab_switches = excluded.tab_switches, analysis = excluded.analysis;
  if t.assessment_id is not null then
    insert into public.assessment_results(org_id, assessment_id, student_id, marks) values (t.org_id, t.assessment_id, p_student, v_score)
    on conflict (assessment_id, student_id) do update set marks = excluded.marks;
  end if;
  return jsonb_build_object('score', v_score, 'max', v_max);
end $$;

-- ───────────── Public QR verification of certificates and report cards (DOC-02) ─────────────
create or replace function public.verify_document(p_code text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('kind', 'document', 'type', d.type, 'title', d.title, 'number', d.number, 'status', d.status, 'issued_on', d.issued_on,
       'school', o.name, 'student', (select trim(s.first_name || ' ' || coalesce(s.last_name, '')) from public.students s where s.id = d.student_id))
     from public.issued_documents d join public.organisations o on o.id = d.org_id where d.verify_code = p_code and length(p_code) >= 10),
    (select jsonb_build_object('kind', 'report_card', 'type', 'Report card', 'title', r.term, 'status', r.status, 'issued_on', r.published_at::date,
       'school', o.name, 'student', (select trim(s.first_name || ' ' || coalesce(s.last_name, '')) from public.students s where s.id = r.student_id))
     from public.report_cards r join public.organisations o on o.id = r.org_id where r.verify_code = p_code and r.status = 'published' and length(p_code) >= 10))
$$;

-- ───────────── Store and canteen counter sale with wallet limits (CAN-01, CAN-02) ─────────────
create or replace function public.pos_sale(p jsonb) returns uuid language plpgsql set search_path = '' as $$
declare v_org uuid := app.org_id(); w public.wallets; v_total numeric; v_today numeric; l jsonb; v_id uuid; v_student uuid := nullif(p->>'student_id', '')::uuid; blocked text;
begin
  perform app.require('inventory', 'write');
  select coalesce(sum((x->>'qty')::numeric * (x->>'price')::numeric), 0) into v_total from jsonb_array_elements(p->'lines') x;
  if v_total <= 0 then raise exception 'Add at least one item.'; end if;
  if coalesce(p->>'payment_mode', 'wallet') = 'wallet' then
    select * into w from public.wallets where student_id = v_student and org_id = v_org for update;
    if w.id is null or not w.active then raise exception 'This student has no active wallet.'; end if;
    for l in select * from jsonb_array_elements(p->'lines') loop
      select i.name into blocked from public.items i where i.id = (l->>'item_id')::uuid and (',' || lower(coalesce(w.blocked_items, '')) || ',') like '%,' || lower(i.name) || ',%';
      if blocked is not null then raise exception '% is blocked by the parent for this student.', blocked; end if;
    end loop;
    if w.balance < v_total then raise exception 'Wallet balance is Rs % but the bill is Rs %.', w.balance, v_total; end if;
    select coalesce(sum(amount), 0) into v_today from public.wallet_txns where wallet_id = w.id and type = 'purchase' and at::date = current_date;
    if w.daily_limit is not null and v_today + v_total > w.daily_limit then raise exception 'This goes over the daily spend limit of Rs % set by the parent.', w.daily_limit; end if;
    update public.wallets set balance = balance - v_total where id = w.id;
    insert into public.wallet_txns(org_id, wallet_id, student_id, type, amount, note) values (v_org, w.id, v_student, 'purchase', v_total, coalesce(p->>'counter', 'canteen') || ' purchase');
  end if;
  insert into public.sales(org_id, counter, student_id, lines, total, payment_mode, sold_by_name)
  values (v_org, coalesce(p->>'counter', 'canteen'), v_student, p->'lines', v_total, coalesce(p->>'payment_mode', 'wallet'), app.user_name()) returning id into v_id;
  insert into public.stock_movements(org_id, item_id, qty, type, ref, variant)
  select v_org, (x->>'item_id')::uuid, -(x->>'qty')::numeric, 'sale', v_id::text, x->>'variant' from jsonb_array_elements(p->'lines') x where x->>'item_id' is not null;
  return v_id;
end $$;

-- ───────────── Driver and attendant app (TR-04): no table access, only these actions ─────────────
create or replace function app.route_ok(p_route uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.routes r where r.id = p_route and r.org_id = app.org_id()
     and (app.can('transport', 'write') or r.driver_id = app.staff_id() or r.attendant_id = app.staff_id())) $$;

create or replace function public.driver_routes() returns table (id uuid, name text, vehicle text, running_trip uuid) language sql stable security definer set search_path = '' as
$$ select r.id, r.name, v.reg_no, (select t.id from public.trips t where t.route_id = r.id and t.status = 'running' order by t.started_at desc limit 1)
   from public.routes r left join public.vehicles v on v.id = r.vehicle_id where r.active and app.route_ok(r.id) order by r.name $$;

create or replace function public.driver_trip_start(p_route uuid, p_direction text default 'pickup') returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; r public.routes;
begin
  if not app.route_ok(p_route) then raise exception 'This route is not assigned to you.'; end if;
  select id into v_id from public.trips where route_id = p_route and status = 'running' limit 1;
  if v_id is not null then return v_id; end if;
  select * into r from public.routes where id = p_route;
  insert into public.trips(org_id, branch_id, route_id, direction) values (r.org_id, r.branch_id, p_route, p_direction) returning id into v_id;
  perform app.notify(r.org_id, g.user_id, 'Bus started', r.name || ' has started its ' || p_direction || ' trip.', '/parent/bus', 'bus')
  from public.student_transport st join public.students s on s.id = st.student_id join public.guardians g on g.household_id = s.household_id
  where st.route_id = p_route and st.active and g.user_id is not null;
  return v_id;
end $$;

create or replace function public.driver_trip_students(p_trip uuid) returns table (student_id uuid, name text, stop text, sort integer, last_event text)
language sql stable security definer set search_path = '' as
$$ select s.id, trim(s.first_name || ' ' || coalesce(s.last_name, '')), sp.name, coalesce(sp.sort, 0),
     (select e.type from public.trip_events e where e.trip_id = t.id and e.student_id = s.id order by e.at desc limit 1)
   from public.trips t join public.student_transport st on st.route_id = t.route_id and st.active join public.students s on s.id = st.student_id and s.status = 'active'
   left join public.stops sp on sp.id = st.stop_id where t.id = p_trip and app.route_ok(t.route_id) order by 4, 2 $$;

create or replace function public.driver_mark(p_trip uuid, p_student uuid, p_type text, p_lat numeric default null, p_lng numeric default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.trips; v_name text;
begin
  select * into t from public.trips where id = p_trip;
  if t.id is null or not app.route_ok(t.route_id) then raise exception 'This trip is not assigned to you.'; end if;
  if p_type not in ('boarded', 'dropped', 'absent', 'sos', 'delay') then raise exception 'Unknown event.'; end if;
  insert into public.trip_events(org_id, trip_id, student_id, type, lat, lng, note) values (t.org_id, p_trip, p_student, p_type, p_lat, p_lng, p_note);
  if p_type in ('boarded', 'dropped') and p_student is not null then
    select trim(first_name || ' ' || coalesce(last_name, '')) into v_name from public.students where id = p_student;
    perform app.notify(t.org_id, g.user_id, v_name || ' ' || p_type, 'At ' || to_char(now() at time zone 'Asia/Kolkata', 'HH12:MI AM'), '/parent/bus', 'bus')
    from public.guardians g join public.students s on s.household_id = g.household_id where s.id = p_student and g.user_id is not null;
  elsif p_type = 'sos' then
    perform app.notify_roles(t.org_id, array['transport', 'principal', 'group_admin'], t.branch_id, 'SOS from a bus', coalesce(p_note, 'The driver pressed SOS.'), '/transport/live', 'alert');
  elsif p_type = 'delay' then
    update public.trips set delay_minutes = coalesce(nullif(p_note, '')::integer, 15) where id = p_trip;
    perform app.notify(t.org_id, g.user_id, 'Bus running late', 'Your bus is running about ' || coalesce(nullif(p_note, ''), '15') || ' minutes late.', '/parent/bus', 'bus')
    from public.student_transport st join public.students s on s.id = st.student_id join public.guardians g on g.household_id = s.household_id
    where st.route_id = t.route_id and st.active and g.user_id is not null;
    perform app.notify_roles(t.org_id, array['transport'], t.branch_id, 'Bus delay reported', null, '/transport/live', 'bus');
  end if;
end $$;

create or replace function public.driver_position(p_trip uuid, p_lat numeric, p_lng numeric, p_speed numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip and status = 'running';
  if t.id is null or not app.route_ok(t.route_id) then return; end if;
  update public.trips set last_lat = p_lat, last_lng = p_lng, last_speed = p_speed, last_at = now() where id = p_trip;
  insert into public.trip_positions(org_id, trip_id, lat, lng, speed) values (t.org_id, p_trip, p_lat, p_lng, p_speed);
  if coalesce(p_speed, 0) > 60 and not exists (select 1 from public.trip_events where trip_id = p_trip and type = 'overspeed' and at > now() - interval '5 minutes') then
    insert into public.trip_events(org_id, trip_id, type, lat, lng, note) values (t.org_id, p_trip, 'overspeed', p_lat, p_lng, round(p_speed) || ' km/h');
    perform app.notify_roles(t.org_id, array['transport'], t.branch_id, 'Over-speed alert', round(p_speed) || ' km/h', '/transport/live', 'alert');
  end if;
end $$;

create or replace function public.driver_trip_end(p_trip uuid) returns void language plpgsql security definer set search_path = '' as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip;
  if t.id is null or not app.route_ok(t.route_id) then raise exception 'This trip is not assigned to you.'; end if;
  update public.trips set status = 'completed', ended_at = now() where id = p_trip;
end $$;

-- ───────────── Helpdesk routing and SLA (HD-01) ─────────────
create or replace function app.on_ticket() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and tg_when = 'BEFORE' then
    new.owner_role := coalesce(new.owner_role, case lower(coalesce(new.category, ''))
      when 'fees' then 'accounts' when 'transport' then 'transport' when 'academic' then 'coordinator' when 'safety' then 'principal'
      when 'it' then 'system_admin' when 'hr' then 'hr' else 'front_office' end);
    new.sla_due := coalesce(new.sla_due, now() + case new.priority when 'critical' then interval '4 hours' when 'high' then interval '24 hours' when 'low' then interval '96 hours' else interval '48 hours' end);
    new.raised_by_name := coalesce(new.raised_by_name, app.user_name());
    return new;
  end if;
  perform app.notify_roles(new.org_id, array[new.owner_role], new.branch_id, 'New request: ' || new.subject, left(new.body, 140), '/helpdesk/' || new.id, 'helpdesk');
  return new;
end $$;
create trigger tickets_before before insert on public.tickets for each row execute function app.on_ticket();
create trigger tickets_after after insert on public.tickets for each row execute function app.on_ticket();

-- ───────────── Platform console actions (PLT-01, PLT-04, PLT-05, PLT-09) ─────────────
create or replace function public.platform_tenants() returns table (id uuid, name text, city text, plan text, status text, price_per_student numeric, renewal_date date,
  messaging_balance numeric, created_at timestamptz, students bigint, staff bigint, users bigint, last_seen timestamptz, open_tickets bigint)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.city, o.plan, o.status, o.price_per_student, o.renewal_date, o.messaging_balance, o.created_at,
    (select count(*) from public.students s where s.org_id = o.id and s.status = 'active'),
    (select count(*) from public.staff s where s.org_id = o.id and s.status = 'active'),
    (select count(*) from public.profiles p where p.org_id = o.id),
    (select max(p.last_seen_at) from public.profiles p where p.org_id = o.id),
    (select count(*) from public.support_tickets t where t.org_id = o.id and t.status <> 'resolved')
  from public.organisations o where app.is_platform_admin() order by o.created_at desc
$$;

create or replace function public.platform_update_org(p_org uuid, p_status text, p_plan text, p_price numeric, p_renewal date, p_notes text, p_modules jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'Platform staff only.'; end if;
  update public.organisations set status = coalesce(p_status, status), plan = coalesce(p_plan, plan), price_per_student = coalesce(p_price, price_per_student),
    renewal_date = coalesce(p_renewal, renewal_date), notes = coalesce(p_notes, notes), modules = coalesce(p_modules, modules) where id = p_org;
  insert into public.platform_access_log(org_id, actor, actor_name, action, reason) values (p_org, auth.uid(), app.user_name(), 'tenant updated', coalesce(p_status, '') || ' ' || coalesce(p_plan, ''));
end $$;

create or replace function public.platform_add_credits(p_org uuid, p_amount numeric, p_note text default null) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'Platform staff only.'; end if;
  update public.organisations set messaging_balance = messaging_balance + p_amount where id = p_org;
  insert into public.platform_wallet_ledger(org_id, type, amount, note) values (p_org, case when p_amount >= 0 then 'credit' else 'debit' end, abs(p_amount), p_note);
end $$;

create or replace function public.platform_reply_ticket(p_ticket uuid, p_reply text, p_status text default 'resolved') returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'Platform staff only.'; end if;
  update public.support_tickets set reply = p_reply, status = p_status where id = p_ticket;
end $$;

create or replace function public.platform_support_tickets() returns table (id uuid, org_name text, subject text, body text, priority text, status text, reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as
$$ select t.id, o.name, t.subject, t.body, t.priority, t.status, t.reply, t.created_at from public.support_tickets t join public.organisations o on o.id = t.org_id
   where app.is_platform_admin() order by t.created_at desc limit 200 $$;

-- ───────────── File storage: one private bucket, one folder per school ─────────────
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;
create policy files_read on storage.objects for select to authenticated using (bucket_id = 'files' and (storage.foldername(name))[1] = (select app.org_id())::text);
create policy files_write on storage.objects for insert to authenticated with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select app.org_id())::text);
create policy files_delete on storage.objects for delete to authenticated using (bucket_id = 'files' and (storage.foldername(name))[1] = (select app.org_id())::text and (select app.is_staff()));

-- ───────────── Execution rights: nothing for anonymous visitors except document verification ─────────────
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.verify_document(text) to anon;
alter default privileges in schema public revoke execute on functions from public, anon;

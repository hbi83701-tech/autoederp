-- Audit trigger reads org_id generically (the organisations table has none), and internal functions get a fixed search path.
-- The audit function body is also updated in 001_core.sql for fresh installs.
alter function app.audit_immutable() set search_path = pg_catalog, public;
alter function app.audited(text, text) set search_path = pg_catalog, public;
alter function app.secure(text, text, jsonb) set search_path = pg_catalog, public;
alter function app.guard_student_status() set search_path = pg_catalog, public;
alter function app.run_pending(integer) set search_path = pg_catalog, public;
alter function app.immutable_financial() set search_path = pg_catalog, public;
alter function app.t(text, text, text, jsonb) set search_path = pg_catalog, public;

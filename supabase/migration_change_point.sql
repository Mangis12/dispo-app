-- ============================================================================
-- Migracija: koordinatoriaus „keitimo taškas" planuose (eina į Kelionę).
--   change_lat / change_lng — koordinatės kur įvyks pamaina
--   change_location        — miesto / vietos pavadinimas
-- Idempotentiška: galima paleisti kelis kartus.
-- ============================================================================

alter table public.plans add column if not exists change_lat       double precision;
alter table public.plans add column if not exists change_lng       double precision;
alter table public.plans add column if not exists change_location  text;

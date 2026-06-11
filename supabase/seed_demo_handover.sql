-- ============================================================================
-- DEMO: pamaina (handover) ant vienos mašinos JKL 142 — 2026 m. birželis
--   Jonas Petrauskas   06-01 → 06-10
--   Saulius Urbonas    06-10 → 06-15
--   Edgaras Butkus     06-15 → (dabar)
-- Parodo, kaip grafike matosi pamainos + išsaugoma istorija „kas ką keitė".
-- Balansas išlieka: 10 reise / 10 namuose (d01→namo, d13→reise).
-- ============================================================================

-- 1) Mašinos priskyrimų grandinė
delete from public.car_assignments where car_number = 'JKL 142';
insert into public.car_assignments (id, car_number, driver_id, driver_name, start_date, end_date) values
  ('ah1', 'JKL 142', 'd01', 'Jonas Petrauskas', '2026-06-01', '2026-06-10'),
  ('ah2', 'JKL 142', 'd14', 'Saulius Urbonas',  '2026-06-10', '2026-06-15'),
  ('ah3', 'JKL 142', 'd13', 'Edgaras Butkus',   '2026-06-15', null);

-- 2) Vairuotojų būsenos pagal grandinės pabaigą
update public.drivers set status='Namuose', current_car='Nėra', start_date=null, planned_return_date=null,
       home_status='Poilsis', readiness_date='2026-07-01', last_trip_end_date='2026-06-10' where id='d01';
update public.drivers set last_trip_end_date='2026-06-15' where id='d14';
update public.drivers set status='Reise', current_car='JKL 142', start_date='2026-06-15',
       planned_return_date='2026-07-25', home_status='Nėra', readiness_date=null where id='d13';

-- 3) Istorija — kas ką keitė
insert into public.history (id, timestamp, driver_id, driver_name, action, details, car_number, date) values
  ('hh1', '2026-06-10 09:00', 'd01', 'Jonas Petrauskas', 'Išsiųstas namo',        'Poilsis po reiso',                          'Nėra',    '2026-06-10'),
  ('hh2', '2026-06-10 09:00', 'd14', 'Saulius Urbonas',  'Pakeitimas įvykdytas',  'Auto: JKL 142 — pakeitė Joną Petrauską',    'JKL 142', '2026-06-10'),
  ('hh3', '2026-06-15 09:00', 'd14', 'Saulius Urbonas',  'Išsiųstas namo',        'Poilsis po reiso',                          'Nėra',    '2026-06-15'),
  ('hh4', '2026-06-15 09:00', 'd13', 'Edgaras Butkus',   'Pakeitimas įvykdytas',  'Auto: JKL 142 — pakeitė Saulių Urboną',     'JKL 142', '2026-06-15');

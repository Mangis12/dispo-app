-- ============================================================================
-- Dispo — TESTINIAI DUOMENYS (20 vairuotojų, 10 mašinų)
-- Paleisti: Supabase Dashboard → SQL Editor → įklijuoti → Run.
-- DĖMESIO: pirma IŠVALO esamus duomenis (drivers/cars/plans/history/assignments),
-- tada įrašo naują testinį rinkinį. Datos suderintos su 2026-06-10.
-- 10 vairuotojų „Reise" (kadencijoje, priskirti mašinoms), 10 „Namuose".
-- Įmonės: LT ir PL. Specializacijos: Tentas / Refas / Universalus.
-- Mašinos: Tentas arba Refas, registracija LT arba PL.
-- ============================================================================

truncate table public.car_assignments, public.plans, public.history,
               public.drivers, public.cars restart identity;

-- ── MAŠINOS (10) ─────────────────────────────────────────────────────────────
insert into public.cars (id, number, status, type, registration, active_from) values
  ('c01', 'JKL 142',   'Aktyvus', 'Tentas', 'LT', '2026-01-01'),
  ('c02', 'MRT 588',   'Aktyvus', 'Refas',  'LT', '2026-01-01'),
  ('c03', 'PVN 903',   'Aktyvus', 'Tentas', 'LT', '2026-01-01'),
  ('c04', 'RDG 271',   'Aktyvus', 'Refas',  'LT', '2026-01-01'),
  ('c05', 'SLK 460',   'Aktyvus', 'Tentas', 'LT', '2026-01-01'),
  ('c06', 'WGM 21043', 'Aktyvus', 'Refas',  'PL', '2026-01-01'),
  ('c07', 'KRA 882X',  'Aktyvus', 'Tentas', 'PL', '2026-01-01'),
  ('c08', 'PO 7745K',  'Aktyvus', 'Refas',  'PL', '2026-01-01'),
  ('c09', 'GD 3390M',  'Aktyvus', 'Tentas', 'PL', '2026-01-01'),
  ('c10', 'WX 5512T',  'Aktyvus', 'Refas',  'PL', '2026-01-01');

-- ── VAIRUOTOJAI — „REISE" / kadencijoje (10) ────────────────────────────────
insert into public.drivers
  (id, name, phone, status, current_car, start_date, planned_return_date,
   home_status, readiness_date, company_type, specialization, last_trip_end_date) values
  ('d01', 'Jonas Petrauskas',      '+370 600 11001', 'Reise', 'JKL 142',   '2026-05-01', '2026-06-14', 'Nėra', null, 'LT', 'Tentas',     null),
  ('d02', 'Andrius Kazlauskas',    '+370 600 11002', 'Reise', 'MRT 588',   '2026-04-20', '2026-06-12', 'Nėra', null, 'LT', 'Refas',      null),
  ('d03', 'Tomas Vaitkus',         '+370 600 11003', 'Reise', 'PVN 903',   '2026-05-10', '2026-06-25', 'Nėra', null, 'LT', 'Tentas',     null),
  ('d04', 'Mindaugas Žukauskas',   '+370 600 11004', 'Reise', 'RDG 271',   '2026-05-15', '2026-07-01', 'Nėra', null, 'LT', 'Refas',      null),
  ('d05', 'Darius Stankevičius',   '+370 600 11005', 'Reise', 'SLK 460',   '2026-05-22', '2026-07-05', 'Nėra', null, 'LT', 'Universalus', null),
  ('d06', 'Piotr Kowalski',        '+48 600 110 006', 'Reise', 'WGM 21043', '2026-04-28', '2026-06-16', 'Nėra', null, 'PL', 'Refas',      null),
  ('d07', 'Krzysztof Nowak',       '+48 600 110 007', 'Reise', 'KRA 882X',  '2026-05-05', '2026-06-20', 'Nėra', null, 'PL', 'Tentas',     null),
  ('d08', 'Tomasz Wiśniewski',     '+48 600 110 008', 'Reise', 'PO 7745K',  '2026-05-18', '2026-06-30', 'Nėra', null, 'PL', 'Refas',      null),
  ('d09', 'Marek Wójcik',          '+48 600 110 009', 'Reise', 'GD 3390M',  '2026-05-25', '2026-07-08', 'Nėra', null, 'PL', 'Universalus', null),
  ('d10', 'Andrzej Kamiński',      '+48 600 110 010', 'Reise', 'WX 5512T',  '2026-06-01', '2026-07-15', 'Nėra', null, 'PL', 'Tentas',     null);

-- ── VAIRUOTOJAI — „NAMUOSE" (10) ─────────────────────────────────────────────
insert into public.drivers
  (id, name, phone, status, current_car, start_date, planned_return_date,
   home_status, readiness_date, company_type, specialization, last_trip_end_date) values
  ('d11', 'Rokas Jankauskas',      '+370 600 11011', 'Namuose', 'Nėra', null, null, 'Poilsis',           '2026-06-18', 'LT', 'Tentas',     '2026-06-04'),
  ('d12', 'Karolis Petraitis',     '+370 600 11012', 'Namuose', 'Nėra', null, null, 'Tvarko dokumentus', '2026-06-12', 'LT', 'Refas',      '2026-05-28'),
  ('d13', 'Edgaras Butkus',        '+370 600 11013', 'Namuose', 'Nėra', null, null, 'Poilsis',           '2026-06-20', 'LT', 'Universalus', '2026-06-06'),
  ('d14', 'Saulius Urbonas',       '+370 600 11014', 'Namuose', 'Nėra', null, null, 'Nėra',              '2026-06-11', 'LT', 'Tentas',     '2026-06-01'),
  ('d15', 'Gintaras Balčiūnas',    '+370 600 11015', 'Namuose', 'Nėra', null, null, 'Poilsis',           '2026-06-25', 'LT', 'Refas',      '2026-06-08'),
  ('d16', 'Łukasz Lewandowski',    '+48 600 110 016', 'Namuose', 'Nėra', null, null, 'Tvarko dokumentus', '2026-06-14', 'PL', 'Refas',      '2026-05-30'),
  ('d17', 'Paweł Zieliński',       '+48 600 110 017', 'Namuose', 'Nėra', null, null, 'Poilsis',           '2026-06-22', 'PL', 'Tentas',     '2026-06-05'),
  ('d18', 'Michał Szymański',      '+48 600 110 018', 'Namuose', 'Nėra', null, null, 'Nėra',              '2026-06-13', 'PL', 'Universalus', '2026-06-02'),
  ('d19', 'Grzegorz Woźniak',      '+48 600 110 019', 'Namuose', 'Nėra', null, null, 'Poilsis',           '2026-06-28', 'PL', 'Refas',      '2026-06-09'),
  ('d20', 'Adam Dąbrowski',        '+48 600 110 020', 'Namuose', 'Nėra', null, null, 'Tvarko dokumentus', '2026-06-16', 'PL', 'Tentas',     '2026-05-26');

-- ── MAŠINŲ PRISKYRIMAI aktyviems reisams (10) ───────────────────────────────
insert into public.car_assignments (id, car_number, driver_id, driver_name, start_date, end_date) values
  ('a01', 'JKL 142',   'd01', 'Jonas Petrauskas',    '2026-05-01', null),
  ('a02', 'MRT 588',   'd02', 'Andrius Kazlauskas',  '2026-04-20', null),
  ('a03', 'PVN 903',   'd03', 'Tomas Vaitkus',       '2026-05-10', null),
  ('a04', 'RDG 271',   'd04', 'Mindaugas Žukauskas', '2026-05-15', null),
  ('a05', 'SLK 460',   'd05', 'Darius Stankevičius', '2026-05-22', null),
  ('a06', 'WGM 21043', 'd06', 'Piotr Kowalski',      '2026-04-28', null),
  ('a07', 'KRA 882X',  'd07', 'Krzysztof Nowak',     '2026-05-05', null),
  ('a08', 'PO 7745K',  'd08', 'Tomasz Wiśniewski',   '2026-05-18', null),
  ('a09', 'GD 3390M',  'd09', 'Marek Wójcik',        '2026-05-25', null),
  ('a10', 'WX 5512T',  'd10', 'Andrzej Kamiński',    '2026-06-01', null);

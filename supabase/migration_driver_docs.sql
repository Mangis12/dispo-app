-- Vairuotojų papildomi laukai: el. paštas, vidinis numeris (DS) ir dokumentų galiojimai (JSONB).
alter table public.drivers add column if not exists email text;
alter table public.drivers add column if not exists tab_nr text;
alter table public.drivers add column if not exists documents jsonb;

-- Automobilių papildomi laukai: markė ir gamybos metai.
alter table public.cars add column if not exists brand text;
alter table public.cars add column if not exists year integer;

-- ============================================================================
-- Dispo — Supabase schema (Postgres)
-- Paleisti: Supabase Dashboard → SQL Editor → įklijuoti viską → Run.
-- Idempotentiška: galima paleisti pakartotinai.
-- Stulpeliai snake_case; frontende konvertuojami į camelCase (src/lib/mappers.ts).
-- ============================================================================

-- ── Lentelės ────────────────────────────────────────────────────────────────

create table if not exists public.drivers (
  id                   text primary key,
  name                 text not null,
  phone                text not null default '',
  status               text not null default 'Namuose',   -- 'Reise' | 'Namuose'
  current_car          text not null default 'Nėra',
  start_date           date,
  planned_return_date  date,
  home_status          text not null default 'Nėra',       -- 'Nėra' | 'Poilsis' | 'Tvarko dokumentus'
  readiness_date       date,
  company_type         text not null default 'LT',         -- 'LT' | 'PL'
  specialization       text not null default 'Universalus',-- 'Tentas' | 'Refas' | 'Universalus'
  last_trip_end_date   date,
  updated_at           timestamptz not null default now()
);

create table if not exists public.cars (
  id            text primary key,
  number        text not null,
  status        text not null default 'Aktyvus',  -- 'Aktyvus' | 'Remontas'
  type          text not null default 'Tentas',   -- 'Tentas' | 'Refas'
  registration  text not null default 'LT',        -- 'LT' | 'PL'
  active_from   date,
  updated_at    timestamptz not null default now()
);

create table if not exists public.history (
  id           text primary key,
  timestamp    timestamptz not null default now(),
  driver_id    text not null,
  driver_name  text not null,
  action       text not null,
  details      text not null default '',
  car_number   text,
  date         date,
  updated_at   timestamptz not null default now()
);

create table if not exists public.plans (
  id                     text primary key,
  car_number             text not null,
  leaving_driver_id      text,
  leaving_driver_name    text,
  incoming_driver_id     text not null,
  incoming_driver_name   text not null,
  date                   date not null,
  status                 text not null default 'Suplanuota', -- 'Suplanuota' | 'Atlikta'
  new_planned_return_date date,
  updated_at             timestamptz not null default now()
);

create table if not exists public.car_assignments (
  id           text primary key,
  car_number   text not null,
  driver_id    text not null,
  driver_name  text not null,
  start_date   date not null,
  end_date     date,
  updated_at   timestamptz not null default now()
);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- v1 politika: bet kuris prisijungęs (authenticated) vartotojas turi pilną prieigą.
-- Vieno padalinio įrankis. Vėliau galima skaidyti pagal organizaciją.

do $$
declare t text;
begin
  foreach t in array array['drivers','cars','history','plans','car_assignments']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "authenticated_all" on public.%I;', t);
    execute format($p$
      create policy "authenticated_all" on public.%I
        for all
        to authenticated
        using (true)
        with check (true);
    $p$, t);
  end loop;
end $$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Įtraukti lenteles į realtime publication, kad keli dispečeriai matytų
-- pakeitimus iškart (postgres_changes prenumerata frontende).

do $$
declare t text;
begin
  foreach t in array array['drivers','cars','history','plans','car_assignments']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then
      null; -- jau pridėta
    end;
  end loop;
end $$;

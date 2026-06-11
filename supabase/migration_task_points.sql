-- ============================================================================
-- Migracija: koordinatoriaus papildomos užduotys (task_points) + dviguba
-- užduotis ant keitimo taško (plans.change_task). Idempotentiška.
-- ============================================================================

-- Dviguba užduotis ant keitimo taško (keitimas + ką nuvežti)
alter table public.plans add column if not exists change_task text;

-- Papildomų užduočių taškai (su vieta), gali būti išsaugoti ateičiai
create table if not exists public.task_points (
  id          text primary key,
  title       text not null default '',
  description text not null default '',
  lat         double precision,
  lng         double precision,
  location    text not null default '',
  saved       boolean not null default false,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.task_points enable row level security;

do $$ begin
  create policy "task_points_all" on public.task_points
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.task_points;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Migracija: kalendoriaus pastabos (viena diena = viena pastaba). Idempotentiška.
-- ============================================================================

create table if not exists public.calendar_notes (
  id          text primary key,
  date        text not null,
  text        text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.calendar_notes enable row level security;

do $$ begin
  create policy "calendar_notes_all" on public.calendar_notes
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.calendar_notes;
exception when duplicate_object then null; end $$;

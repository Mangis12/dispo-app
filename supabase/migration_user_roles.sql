-- Vartotojų rolės (RBAC). Rolė rišama prie Supabase paskyros; vartotojas
-- savo rolės pakeisti negali (RLS leidžia tik skaityti savo eilutę).
-- Rolės: replacement (pilnos teisės), coordinator (tik koordinatoriaus skiltis),
--        transport (tik stebėjimas).

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'transport' check (role in ('replacement','coordinator','transport')),
  updated_at timestamptz default now()
);

alter table public.user_roles enable row level security;

-- Kiekvienas vartotojas mato tik savo rolę.
drop policy if exists "read own role" on public.user_roles;
create policy "read own role" on public.user_roles
  for select using (auth.uid() = user_id);

-- Pradinė reikšmė: seniausia (pirmoji sukurta) paskyra gauna pilnas teises,
-- kad savininkas neliktų užblokuotas. Kitiems lieka numatytasis „transport",
-- kol pilnų teisių vartotojas priskirs rolę.
insert into public.user_roles (user_id, role)
select id, 'replacement' from auth.users order by created_at asc limit 1
on conflict (user_id) do nothing;

-- Rolės priskyrimas pagal el. paštą — tik „replacement" rolės vartotojai.
create or replace function public.set_user_role(p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target uuid;
begin
  select role into caller_role from public.user_roles where user_id = auth.uid();
  if caller_role is distinct from 'replacement' then
    raise exception 'Neturite teisių keisti rolių';
  end if;
  if p_role not in ('replacement','coordinator','transport') then
    raise exception 'Netinkama rolė: %', p_role;
  end if;
  select id into target from auth.users where lower(email) = lower(p_email);
  if target is null then
    raise exception 'Vartotojas su el. paštu % nerastas', p_email;
  end if;
  insert into public.user_roles (user_id, role, updated_at)
  values (target, p_role, now())
  on conflict (user_id) do update set role = excluded.role, updated_at = now();
  return p_role;
end;
$$;

revoke all on function public.set_user_role(text, text) from public;
grant execute on function public.set_user_role(text, text) to authenticated;

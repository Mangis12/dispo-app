-- Atleisti / Nereikalingi vairuotojai.
-- dismissed_date: data, nuo kada vairuotojas atleistas (NULL = dirba).
-- unneeded: ar vairuotojas pažymėtas nereikalingu (nesiūlomas keitimuose).
alter table drivers add column if not exists dismissed_date date;
alter table drivers add column if not exists unneeded boolean not null default false;

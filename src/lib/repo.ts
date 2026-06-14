// Duomenų repozitorija. Supabase režimu skaito/rašo į Postgres; jei Supabase
// neįjungtas (.env nėra) — atsarginis offline režimas per localStorage.
// React state lieka UI šaltinis; čia tik įkėlimas (loadAll), sinchronizacija
// (syncCollection) ir realaus laiko prenumerata (subscribeAll).

import { supabase, isSupabaseEnabled } from './supabase';
import { TABLES, type CollectionKey } from './mappers';
import type {
  Driver, Car, HistoryEntry, ReplacementPlan, CarAssignment, TaskPoint, CalendarNote,
} from '../types';

export interface AllData {
  drivers: Driver[];
  cars: Car[];
  history: HistoryEntry[];
  plans: ReplacementPlan[];
  carAssignments: CarAssignment[];
  taskPoints: TaskPoint[];
  calendarNotes: CalendarNote[];
}

// localStorage raktai (suderinti su senąja App.tsx persistencija — duomenys nedingsta).
const LS_KEYS: Record<CollectionKey, string> = {
  drivers: 'drivers_data',
  cars: 'cars_data',
  history: 'history_data',
  plans: 'plans_data',
  carAssignments: 'car_assignments_data',
  taskPoints: 'task_points_data',
  calendarNotes: 'calendar_notes_data',
};

const lsLoad = <T,>(key: string, fallback: T): T => {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};
const lsSave = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
};

// ── Įkėlimas ─────────────────────────────────────────────────────────────────
// Grąžina visas kolekcijas. Jei `defaults` perduoti, jie naudojami tuščiai DB /
// localStorage (pradinis užpildymas). Supabase režimu, jei lentelė tuščia, o
// defaults yra — jie įrašomi į DB (seed), kad keli vartotojai matytų tą patį.
export async function loadAll(defaults?: Partial<AllData>): Promise<AllData> {
  if (!isSupabaseEnabled || !supabase) {
    return {
      drivers: lsLoad(LS_KEYS.drivers, defaults?.drivers ?? []),
      cars: lsLoad(LS_KEYS.cars, defaults?.cars ?? []),
      history: lsLoad(LS_KEYS.history, defaults?.history ?? []),
      plans: lsLoad(LS_KEYS.plans, defaults?.plans ?? []),
      carAssignments: lsLoad(LS_KEYS.carAssignments, defaults?.carAssignments ?? []),
      taskPoints: lsLoad(LS_KEYS.taskPoints, defaults?.taskPoints ?? []),
      calendarNotes: lsLoad(LS_KEYS.calendarNotes, defaults?.calendarNotes ?? []),
    };
  }

  const result = {} as AllData;
  for (const key of Object.keys(TABLES) as CollectionKey[]) {
    const { table, fromRow } = TABLES[key];
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw new Error(`Nepavyko įkelti „${table}“: ${error.message}`);
    let rows = (data ?? []).map((r) => fromRow(r as Record<string, unknown>));

    // Seed: tuščia DB lentelė + turim pradinius duomenis → įrašom kartą.
    const seed = (defaults?.[key] as unknown[] | undefined) ?? [];
    if (rows.length === 0 && seed.length > 0) {
      await syncCollection(key, [], seed as never[]);
      rows = seed as never[];
    }
    (result as unknown as Record<string, unknown>)[key] = rows;
  }
  return result;
}

// ── Sinchronizacija (diff prev vs next) ──────────────────────────────────────
// Upsert'ina naujus/pakeistus, delete'ina pašalintus. Mažas duomenų kiekis —
// row-diff paprastas ir korektiškas. Offline režimu rašo į localStorage.
export async function syncCollection<K extends CollectionKey>(
  key: K,
  prev: unknown[],
  next: unknown[],
): Promise<void> {
  if (!isSupabaseEnabled || !supabase) {
    lsSave(LS_KEYS[key], next);
    return;
  }

  const { table, toRow } = TABLES[key];
  const convert = toRow as (x: unknown) => Record<string, unknown>;
  const idOf = (x: unknown) => (x as { id: string }).id;

  const prevById = new Map(prev.map((x) => [idOf(x), x]));
  const nextById = new Map(next.map((x) => [idOf(x), x]));

  // Pridėti arba pakeisti (tik tie, kurių JSON pasikeitė).
  const toUpsert = next.filter((x) => {
    const before = prevById.get(idOf(x));
    return !before || JSON.stringify(before) !== JSON.stringify(x);
  });
  // Pašalinti.
  const removedIds = [...prevById.keys()].filter((id) => !nextById.has(id));

  if (toUpsert.length > 0) {
    const { error } = await supabase.from(table).upsert(toUpsert.map(convert));
    if (error) throw new Error(`Nepavyko išsaugoti „${table}“: ${error.message}`);
  }
  if (removedIds.length > 0) {
    const { error } = await supabase.from(table).delete().in('id', removedIds);
    if (error) throw new Error(`Nepavyko ištrinti iš „${table}“: ${error.message}`);
  }
}

// ── Realaus laiko prenumerata ────────────────────────────────────────────────
// Kai kitas vartotojas keičia DB, perkrauname tą kolekciją ir atnaujiname state
// per perduotą setter'į. Grąžina atjungimo funkciją. Offline režimu — no-op.
type Setters = {
  [K in CollectionKey]: (rows: AllData[K]) => void;
};

export function subscribeAll(setters: Setters): () => void {
  if (!isSupabaseEnabled || !supabase) return () => {};

  const reload = async (key: CollectionKey) => {
    const { table, fromRow } = TABLES[key];
    const { data, error } = await supabase!.from(table).select('*');
    if (error) return;
    const rows = (data ?? []).map((r) => fromRow(r as Record<string, unknown>));
    (setters[key] as (rows: unknown[]) => void)(rows);
  };

  const channel = supabase.channel('dispo-realtime');
  for (const key of Object.keys(TABLES) as CollectionKey[]) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLES[key].table },
      () => { void reload(key); },
    );
  }
  channel.subscribe();

  return () => { void supabase!.removeChannel(channel); };
}

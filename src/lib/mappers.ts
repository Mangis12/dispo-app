// Konversija tarp TS tipų (camelCase) ir Supabase DB eilučių (snake_case).
// Kiekviena sąsaja turi to-/from-row porą. `updated_at` valdo DB (default now()),
// tad jo nesiunčiame; from-row jį ignoruoja.

import type {
  Driver, Car, HistoryEntry, ReplacementPlan, CarAssignment, TaskPoint, CalendarNote,
} from '../types';

type Row = Record<string, unknown>;

// ── Driver ───────────────────────────────────────────────────────────────────
export const driverToRow = (d: Driver): Row => ({
  id: d.id,
  name: d.name,
  phone: d.phone,
  status: d.status,
  current_car: d.currentCar,
  start_date: d.startDate,
  planned_return_date: d.plannedReturnDate,
  home_status: d.homeStatus,
  readiness_date: d.readinessDate,
  company_type: d.companyType,
  specialization: d.specialization,
  last_trip_end_date: d.lastTripEndDate ?? null,
  email: d.email ?? null,
  tab_nr: d.tabNr ?? null,
  documents: d.docs ?? null,
});

export const driverFromRow = (r: Row): Driver => ({
  id: String(r.id),
  name: String(r.name ?? ''),
  phone: String(r.phone ?? ''),
  status: r.status as Driver['status'],
  currentCar: String(r.current_car ?? 'Nėra'),
  startDate: (r.start_date as string | null) ?? null,
  plannedReturnDate: (r.planned_return_date as string | null) ?? null,
  homeStatus: r.home_status as Driver['homeStatus'],
  readinessDate: (r.readiness_date as string | null) ?? null,
  companyType: r.company_type as Driver['companyType'],
  specialization: r.specialization as Driver['specialization'],
  lastTripEndDate: (r.last_trip_end_date as string | null) ?? null,
  email: (r.email as string | null) ?? undefined,
  tabNr: (r.tab_nr as string | null) ?? undefined,
  docs: (r.documents as Driver['docs']) ?? undefined,
});

// ── Car ──────────────────────────────────────────────────────────────────────
export const carToRow = (c: Car): Row => ({
  id: c.id,
  number: c.number,
  status: c.status,
  type: c.type,
  registration: c.registration,
  active_from: c.activeFrom ?? null,
  brand: c.brand ?? null,
  year: c.year ?? null,
});

export const carFromRow = (r: Row): Car => ({
  id: String(r.id),
  number: String(r.number ?? ''),
  status: r.status as Car['status'],
  type: r.type as Car['type'],
  registration: r.registration as Car['registration'],
  activeFrom: (r.active_from as string | undefined) ?? undefined,
  brand: (r.brand as string | null) ?? undefined,
  year: (r.year as number | null) ?? undefined,
});

// ── HistoryEntry ─────────────────────────────────────────────────────────────
export const historyToRow = (h: HistoryEntry): Row => ({
  id: h.id,
  timestamp: h.timestamp,
  driver_id: h.driverId,
  driver_name: h.driverName,
  action: h.action,
  details: h.details,
  car_number: h.carNumber ?? null,
  date: h.date ?? null,
});

export const historyFromRow = (r: Row): HistoryEntry => ({
  id: String(r.id),
  timestamp: String(r.timestamp),
  driverId: String(r.driver_id ?? ''),
  driverName: String(r.driver_name ?? ''),
  action: String(r.action ?? ''),
  details: String(r.details ?? ''),
  carNumber: (r.car_number as string | undefined) ?? undefined,
  date: (r.date as string | undefined) ?? undefined,
});

// ── ReplacementPlan ──────────────────────────────────────────────────────────
export const planToRow = (p: ReplacementPlan): Row => ({
  id: p.id,
  car_number: p.carNumber,
  leaving_driver_id: p.leavingDriverId,
  leaving_driver_name: p.leavingDriverName,
  incoming_driver_id: p.incomingDriverId,
  incoming_driver_name: p.incomingDriverName,
  date: p.date,
  status: p.status,
  new_planned_return_date: p.newPlannedReturnDate ?? null,
  change_lat: p.changeLat ?? null,
  change_lng: p.changeLng ?? null,
  change_location: p.changeLocation ?? null,
  change_task: p.changeTask ?? null,
});

export const planFromRow = (r: Row): ReplacementPlan => ({
  id: String(r.id),
  carNumber: String(r.car_number ?? ''),
  leavingDriverId: String(r.leaving_driver_id ?? ''),
  leavingDriverName: String(r.leaving_driver_name ?? ''),
  incomingDriverId: String(r.incoming_driver_id ?? ''),
  incomingDriverName: String(r.incoming_driver_name ?? ''),
  date: String(r.date ?? ''),
  status: r.status as ReplacementPlan['status'],
  newPlannedReturnDate: (r.new_planned_return_date as string | undefined) ?? undefined,
  changeLat: (r.change_lat as number | null) ?? null,
  changeLng: (r.change_lng as number | null) ?? null,
  changeLocation: (r.change_location as string | null) ?? null,
  changeTask: (r.change_task as string | null) ?? null,
});

// ── TaskPoint ────────────────────────────────────────────────────────────────
export const taskPointToRow = (t: TaskPoint): Row => ({
  id: t.id,
  title: t.title,
  description: t.description,
  lat: t.lat,
  lng: t.lng,
  location: t.location,
  saved: t.saved,
  active: t.active,
});

export const taskPointFromRow = (r: Row): TaskPoint => ({
  id: String(r.id),
  title: String(r.title ?? ''),
  description: String(r.description ?? ''),
  lat: (r.lat as number | null) ?? null,
  lng: (r.lng as number | null) ?? null,
  location: String(r.location ?? ''),
  saved: Boolean(r.saved),
  active: Boolean(r.active),
});

// ── CarAssignment ────────────────────────────────────────────────────────────
export const assignmentToRow = (a: CarAssignment): Row => ({
  id: a.id,
  car_number: a.carNumber,
  driver_id: a.driverId,
  driver_name: a.driverName,
  start_date: a.startDate,
  end_date: a.endDate,
});

export const assignmentFromRow = (r: Row): CarAssignment => ({
  id: String(r.id),
  carNumber: String(r.car_number ?? ''),
  driverId: String(r.driver_id ?? ''),
  driverName: String(r.driver_name ?? ''),
  startDate: String(r.start_date ?? ''),
  endDate: (r.end_date as string | null) ?? null,
});

// ── CalendarNote ─────────────────────────────────────────────────────────────
export const noteToRow = (n: CalendarNote): Row => ({ id: n.id, date: n.date, text: n.text });
export const noteFromRow = (r: Row): CalendarNote => ({ id: String(r.id), date: String(r.date ?? ''), text: String(r.text ?? '') });

// ── Registras: lentelė ↔ konverteriai (naudoja repo.ts) ──────────────────────
export const TABLES = {
  drivers:         { table: 'drivers',         toRow: driverToRow,     fromRow: driverFromRow },
  cars:            { table: 'cars',            toRow: carToRow,        fromRow: carFromRow },
  history:         { table: 'history',         toRow: historyToRow,    fromRow: historyFromRow },
  plans:           { table: 'plans',           toRow: planToRow,       fromRow: planFromRow },
  carAssignments:  { table: 'car_assignments', toRow: assignmentToRow, fromRow: assignmentFromRow },
  taskPoints:      { table: 'task_points',     toRow: taskPointToRow,  fromRow: taskPointFromRow },
  calendarNotes:   { table: 'calendar_notes',  toRow: noteToRow,       fromRow: noteFromRow },
} as const;

export type CollectionKey = keyof typeof TABLES;

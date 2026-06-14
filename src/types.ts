export type DriverStatus = 'Reise' | 'Namuose';
export type HomeStatus = 'Nėra' | 'Poilsis' | 'Tvarko dokumentus';
export type RegistrationType = 'LT' | 'PL';
export type DriverSpecialization = 'Tentas' | 'Refas' | 'Universalus';
export type CarType = 'Tentas' | 'Refas';

// Vairuotojo dokumentų galiojimai (iš Excel sąrašo). Visi datų laukai — 'yyyy-MM-dd'.
export interface DriverDocs {
  personalCode?: string;     // Asmens kodas
  passportNo?: string;       // Paso NR.
  passportExpiry?: string;   // Paso galiojimo data
  licenseExpiry?: string;    // Teisių galiojimas
  code95Expiry?: string;     // 95 kodo galiojimas
  tachoCardExpiry?: string;  // Chip kortelės galiojimas (tacho)
  tachoCountry?: string;     // Tacho šalis
  pinkSheetExpiry?: string;  // Rožinio lapo galiojimas
  llglExpiry?: string;       // LLGL galiojimas
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  status: DriverStatus;
  currentCar: string;
  startDate: string | null;
  plannedReturnDate: string | null;
  homeStatus: HomeStatus;
  readinessDate: string | null;
  companyType: RegistrationType;
  specialization: DriverSpecialization;
  lastTripEndDate?: string | null;
  email?: string;
  tabNr?: string;            // DS / vidinis numeris
  docs?: DriverDocs;
}

export interface Car {
  id: string;
  number: string;
  status: 'Aktyvus' | 'Remontas';
  type: CarType;
  registration: RegistrationType;
  activeFrom?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  driverId: string;
  driverName: string;
  action: string;
  details: string;
  carNumber?: string;
  date?: string;
}

export interface ReplacementPlan {
  id: string;
  carNumber: string;
  leavingDriverId: string;
  leavingDriverName: string;
  incomingDriverId: string;
  incomingDriverName: string;
  date: string;
  status: 'Suplanuota' | 'Atlikta';
  newPlannedReturnDate?: string;
  // Koordinatoriaus numatytas keitimo taškas (kur įvyks pamaina) — eina į Kelionę.
  changeLat?: number | null;
  changeLng?: number | null;
  changeLocation?: string | null;
  // Papildoma užduotis tame pačiame taške (pvz. nuvežti dokumentus) →
  // Kelionėje atvyksta kaip dviguba: keitimas + užduotis.
  changeTask?: string | null;
}

// Dispečerio pastaba kalendoriuje (viena diena = viena pastaba).
export interface CalendarNote {
  id: string;
  date: string; // yyyy-MM-dd
  text: string;
}

// Koordinatoriaus papildoma užduotis su vieta. Gali būti išsaugota (pasikartojanti)
// daugkartiniam naudojimui. Aktyvios užduotys atkeliauja į Kelionės skiltį.
export interface TaskPoint {
  id: string;
  title: string;
  description: string;
  lat: number | null;
  lng: number | null;
  location: string;
  saved: boolean;   // išsaugotas šablonas ateičiai (pasikartojantis)
  active: boolean;  // šiuo metu siunčiamas į Kelionę
}

export interface CarAssignment {
  id: string;
  carNumber: string;
  driverId: string;
  driverName: string;
  startDate: string;
  endDate: string | null;
}

// ─── Kelionės planavimas (TripPlanner) ───────────────────────────────────────
export interface TripStop {
  id: number;
  lat: number;
  lng: number;
  city: string;
  type: 'driver' | 'task';
  driverId: string;
  planId: string;
  addWork: string;
  taskDesc?: string;
}

export interface TripVehicle {
  id: string;
  number: string;
  capacity: number;
  color: string;
  stops: TripStop[];
  additionalWork: string;
}

export interface RouteInfo {
  km: number;
  h: number;
}

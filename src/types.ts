export type DriverStatus = 'Reise' | 'Namuose';
export type HomeStatus = 'Nėra' | 'Poilsis' | 'Tvarko dokumentus';
export type RegistrationType = 'LT' | 'PL';
export type DriverSpecialization = 'Tentas' | 'Refas' | 'Universalus';
export type CarType = 'Tentas' | 'Refas';

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

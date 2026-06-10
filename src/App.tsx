import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Users, Truck, Home, Calendar, Plus, ArrowRightLeft, ArrowRight,
  AlertCircle, UserPlus, LogOut, LogIn, X, Edit, History,
  CheckCircle2, User, Trash2, ChevronLeft, ChevronRight,
  LayoutDashboard, Database, Wifi, WifiOff, Bell, Map as MapIcon
} from 'lucide-react';
import {
  format, differenceInDays, parseISO, isBefore, isAfter,
  addDays, subDays, isValid, startOfWeek, endOfWeek, getWeek,
  isSameWeek, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, addMonths, subMonths, isSameMonth, getDaysInMonth
} from 'date-fns';
import { lt } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase, isSupabaseEnabled } from './lib/supabase';
import { loadAll, syncCollection, subscribeAll, type AllData } from './lib/repo';
import TripPlanner from './components/TripPlanner';
import type {
  Driver, DriverStatus, HomeStatus, Car, HistoryEntry,
  ReplacementPlan, RegistrationType, DriverSpecialization, CarType, CarAssignment
} from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INITIAL_DRIVERS: Driver[] = [
  { id: '1', name: 'Jonas Petraitis', phone: '+370 600 12345', status: 'Reise', currentCar: 'LVA 123', startDate: '2026-01-15', plannedReturnDate: '2026-03-20', homeStatus: 'Nėra', readinessDate: null, companyType: 'LT', specialization: 'Tentas' },
  { id: '2', name: 'Andrius Sabonis', phone: '+370 600 54321', status: 'Reise', currentCar: 'KRS 777', startDate: '2026-02-10', plannedReturnDate: '2026-03-25', homeStatus: 'Nėra', readinessDate: null, companyType: 'LT', specialization: 'Refas' },
  { id: '3', name: 'Mantas Jankavičius', phone: '+370 611 22334', status: 'Namuose', currentCar: 'Nėra', startDate: null, plannedReturnDate: null, homeStatus: 'Poilsis', readinessDate: '2026-03-15', companyType: 'PL', specialization: 'Universalus' },
  { id: '4', name: 'Dovydas Volkovas', phone: '+370 622 33445', status: 'Namuose', currentCar: 'Nėra', startDate: null, plannedReturnDate: null, homeStatus: 'Tvarko dokumentus', readinessDate: '2026-03-25', companyType: 'LT', specialization: 'Tentas' },
];

const INITIAL_CARS: Car[] = [
  { id: 'c1', number: 'LVA 123', status: 'Aktyvus', type: 'Tentas', registration: 'LT', activeFrom: '2026-01-01' },
  { id: 'c2', number: 'KRS 777', status: 'Aktyvus', type: 'Refas', registration: 'LT', activeFrom: '2026-01-01' },
  { id: 'c3', number: 'BCZ 555', status: 'Aktyvus', type: 'Tentas', registration: 'PL', activeFrom: '2026-01-01' },
];

type Tab = 'dashboard' | 'planning' | 'drivers' | 'cars' | 'history' | 'calendar' | 'auto-grafikas' | 'trip';

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, onClick }: { label: string; value: number | string; sub?: string; accent?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "text-left rounded-2xl p-6 bg-surface border border-hairline shadow-card transition-all",
        onClick && "hover:border-ink/25 hover:-translate-y-0.5 cursor-pointer"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={cn("w-1.5 h-1.5 rounded-full", accent ?? "bg-stone-300")} />
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      </div>
      <p className="text-[2rem] leading-none font-semibold tracking-tight text-ink">{value}</p>
      {sub && <p className="text-xs text-muted mt-2">{sub}</p>}
    </Tag>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'blue' | 'green' | 'red' | 'amber' | 'purple' }) {
  const variants = {
    default: 'bg-stone-100 text-stone-500',
    blue:    'bg-blue-50 text-blue-600',
    green:   'bg-emerald-50 text-emerald-600',
    red:     'bg-red-50 text-red-500',
    amber:   'bg-amber-50 text-amber-600',
    purple:  'bg-violet-50 text-violet-600',
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide", variants[variant])}>
      {children}
    </span>
  );
}

// ─── Modal Wrapper ────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-surface w-full max-w-md rounded-3xl shadow-float border border-hairline overflow-hidden slide-in-from-bottom-4">
        <div className="px-6 py-5 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="p-1.5 -mr-1 text-muted hover:text-ink hover:bg-stone-100 rounded-lg transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Form Field ───────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-canvas border border-hairline rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:bg-white focus:border-ink/40 transition-all";
const selectCls = "w-full bg-canvas border border-hairline rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:bg-white focus:border-ink/40 transition-all appearance-none";

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap",
        active ? "bg-ink text-white" : "text-muted hover:text-ink hover:bg-stone-100"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-400 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [drivers, setDrivers]           = useState<Driver[]>([]);
  const [cars, setCars]                 = useState<Car[]>([]);
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [plans, setPlans]               = useState<ReplacementPlan[]>([]);
  const [carAssignments, setCarAssignments] = useState<CarAssignment[]>([]);
  const [loaded, setLoaded]             = useState(false);
  // Paskutinė su saugykla suderinta būsena — naudojama syncCollection diff'ui.
  const prevSnap = useRef<AllData>({ drivers: [], cars: [], history: [], plans: [], carAssignments: [] });

  const [activeTab, setActiveTab]       = useState<Tab>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(null);
  const [toast, setToast]               = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [newReturnDate, setNewReturnDate] = useState(format(addDays(new Date(), 42), 'yyyy-MM-dd'));

  // Modal states
  const [addDriverOpen, setAddDriverOpen]   = useState(false);
  const [addCarOpen, setAddCarOpen]         = useState(false);
  const [editCarOpen, setEditCarOpen]       = useState(false);
  const [tripOpen, setTripOpen]             = useState(false);
  const [homeOpen, setHomeOpen]             = useState(false);
  const [editDriverOpen, setEditDriverOpen] = useState(false);
  const [confirmData, setConfirmData]       = useState<{
    carNumber: string; leavingId: string | null; incomingId: string;
    date: string; driverName: string; planId?: string;
    isExecution?: boolean; executionDate?: string;
  } | null>(null);

  const [selectedDriverForTrip, setSelectedDriverForTrip]   = useState<Driver | null>(null);
  const [selectedCarForAssignment, setSelectedCarForAssignment] = useState<string | null>(null);
  const [selectedDriverForHome, setSelectedDriverForHome]   = useState<Driver | null>(null);
  const [selectedDriverForEdit, setSelectedDriverForEdit]   = useState<Driver | null>(null);
  const [selectedCarForEdit, setSelectedCarForEdit]         = useState<Car | null>(null);

  // Planning
  const [selectedTripDriverId, setSelectedTripDriverId] = useState('');
  const [targetReplaceDate, setTargetReplaceDate]       = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedHomeDriverId, setSelectedHomeDriverId] = useState('');
  const [targetWorkDate, setTargetWorkDate]             = useState(format(new Date(), 'yyyy-MM-dd'));

  // History tab
  const [historyMode, setHistoryMode]         = useState<'upcoming' | 'past'>('upcoming');
  const [historyMonth, setHistoryMonth]       = useState(new Date());
  const [historyWeekOffset, setHistoryWeekOffset] = useState(0);

  // Filters
  const [driverFilter, setDriverFilter] = useState({ companyType: '' as RegistrationType | '', specialization: '' as DriverSpecialization | '', search: '' });
  const [carFilter, setCarFilter]       = useState({ registration: '' as RegistrationType | '', type: '' as CarType | '', search: '' });

  // ── Įkėlimas (Supabase arba localStorage) ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadAll({ drivers: INITIAL_DRIVERS, cars: INITIAL_CARS, history: [], plans: [], carAssignments: [] });
        if (cancelled) return;
        // Dedup planų ir, jei priskyrimų nėra — išvedame iš „Reise" vairuotojų.
        const dedupPlans = data.plans.filter((p, i, a) => i === a.findIndex(x => x.carNumber === p.carNumber && x.date === p.date && x.leavingDriverId === p.leavingDriverId && x.incomingDriverId === p.incomingDriverId));
        let assignments = data.carAssignments;
        if (assignments.length === 0) {
          assignments = data.drivers.filter(d => d.status === 'Reise' && d.currentCar !== 'Nėra' && d.startDate).map(d => ({
            id: Math.random().toString(36).substr(2, 9),
            carNumber: d.currentCar, driverId: d.id, driverName: d.name,
            startDate: d.startDate!, endDate: null,
          }));
        }
        // prevSnap = neapdorota įkelta būsena; skirtumai (dedup/išvesti priskyrimai) įsirašys per sync.
        prevSnap.current = { drivers: data.drivers, cars: data.cars, history: data.history, plans: data.plans, carAssignments: data.carAssignments };
        setDrivers(data.drivers);
        setCars(data.cars);
        setHistory(data.history);
        setPlans(dedupPlans);
        setCarAssignments(assignments);
      } catch (e) {
        if (!cancelled) setToast({ message: e instanceof Error ? e.message : 'Klaida kraunant duomenis', type: 'error' });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Persistencija (debounce'inta sinchronizacija į saugyklą) ─────────────────
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => {
      (async () => {
        try {
          await syncCollection('drivers', prevSnap.current.drivers, drivers);
          await syncCollection('cars', prevSnap.current.cars, cars);
          await syncCollection('history', prevSnap.current.history, history);
          await syncCollection('plans', prevSnap.current.plans, plans);
          await syncCollection('carAssignments', prevSnap.current.carAssignments, carAssignments);
          prevSnap.current = { drivers, cars, history, plans, carAssignments };
        } catch (e) {
          setToast({ message: e instanceof Error ? e.message : 'Sinchronizacijos klaida', type: 'error' });
        }
      })();
    }, 400);
    return () => clearTimeout(id);
  }, [drivers, cars, history, plans, carAssignments, loaded]);

  // ── Realaus laiko prenumerata (kitų vartotojų pakeitimai) ────────────────────
  useEffect(() => {
    if (!loaded) return;
    return subscribeAll({
      drivers:        (rows) => { prevSnap.current.drivers = rows;        setDrivers(rows); },
      cars:           (rows) => { prevSnap.current.cars = rows;           setCars(rows); },
      history:        (rows) => { prevSnap.current.history = rows;        setHistory(rows); },
      plans:          (rows) => { prevSnap.current.plans = rows;          setPlans(rows); },
      carAssignments: (rows) => { prevSnap.current.carAssignments = rows; setCarAssignments(rows); },
    });
  }, [loaded]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }
  }, [toast]);

  // Sync dates with selection
  useEffect(() => {
    if (!selectedTripDriverId) return;
    if (selectedTripDriverId.startsWith('CAR:')) {
      const car = cars.find(c => c.number === selectedTripDriverId.replace('CAR:', ''));
      setTargetReplaceDate(car?.activeFrom || format(new Date(), 'yyyy-MM-dd'));
    } else {
      const d = drivers.find(x => x.id === selectedTripDriverId);
      if (d?.plannedReturnDate) setTargetReplaceDate(d.plannedReturnDate);
    }
  }, [selectedTripDriverId, drivers, cars]);

  useEffect(() => {
    if (!selectedHomeDriverId) return;
    const d = drivers.find(x => x.id === selectedHomeDriverId);
    if (d?.readinessDate) setTargetWorkDate(d.readinessDate);
  }, [selectedHomeDriverId, drivers]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const uid = () => Math.random().toString(36).substr(2, 9);

  const logHistory = (driverId: string, driverName: string, action: string, details: string, carNumber?: string, date?: string) => {
    setHistory(prev => [{
      id: uid(), timestamp: format(new Date(), 'yyyy-MM-dd HH:mm'),
      driverId, driverName, action, details, carNumber, date
    }, ...prev]);
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  // ── Driver Actions ────────────────────────────────────────────────────────────
  const addDriver = (d: Omit<Driver, 'id'>) => {
    const driver = { ...d, id: uid() };
    setDrivers(prev => [...prev, driver]);
    logHistory(driver.id, driver.name, 'Pridėtas vairuotojas', 'Naujas vairuotojas įtrauktas');
    setAddDriverOpen(false);
    showToast(`${driver.name} pridėtas`);
  };

  const updateDriver = (id: string, updates: Partial<Driver>) => {
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    if (updates.name) setPlans(prev => prev.map(p => ({
      ...p,
      incomingDriverName: p.incomingDriverId === id ? updates.name! : p.incomingDriverName,
      leavingDriverName:  p.leavingDriverId  === id ? updates.name! : p.leavingDriverName,
    })));
    if (updates.startDate !== undefined || updates.currentCar !== undefined) {
      setCarAssignments(prev => prev.map(a => a.driverId === id && a.endDate === null ? {
        ...a,
        startDate: updates.startDate  !== undefined ? (updates.startDate  || a.startDate)  : a.startDate,
        carNumber: updates.currentCar !== undefined ? (updates.currentCar || a.carNumber) : a.carNumber,
      } : a));
    }
  };

  const deleteDriver = (id: string) => {
    const d = drivers.find(x => x.id === id);
    if (!d) return;
    setPlans(prev => prev.filter(p => p.incomingDriverId !== id && p.leavingDriverId !== id));
    setDrivers(prev => prev.filter(x => x.id !== id));
    logHistory(id, d.name, 'Ištrintas vairuotojas', 'Pašalintas iš sistemos');
    showToast(`${d.name} pašalintas`);
  };

  const sendHome = (id: string, homeStatus: HomeStatus, readinessDate: string) => {
    const d = drivers.find(x => x.id === id);
    if (!d) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    updateDriver(id, { status: 'Namuose', currentCar: 'Nėra', startDate: null, plannedReturnDate: null, homeStatus, readinessDate, lastTripEndDate: today });
    setCarAssignments(prev => prev.map(a => a.driverId === id && a.endDate === null ? { ...a, endDate: today } : a));
    logHistory(id, d.name, 'Išsiųstas namo', `Būsena: ${homeStatus}, Pasiruošęs: ${readinessDate}`, 'Nėra', today);
    setHomeOpen(false); setSelectedDriverForHome(null);
    showToast(`${d.name} išsiųstas namo`);
  };

  const sendToTrip = (id: string, carNumber: string, startDate: string, plannedReturn: string) => {
    const d = drivers.find(x => x.id === id);
    if (!d) return;
    setCarAssignments(prev => {
      let updated = prev.map(a => a.carNumber === carNumber && a.endDate === null ? { ...a, endDate: startDate } : a);
      const cur = drivers.find(x => x.currentCar === carNumber && x.status === 'Reise');
      if (cur && !prev.some(a => a.carNumber === carNumber && a.endDate === null)) {
        updated = [...updated, { id: uid(), carNumber, driverId: cur.id, driverName: cur.name, startDate: cur.startDate || startDate, endDate: startDate }];
      }
      return [...updated, { id: uid(), carNumber, driverId: id, driverName: d.name, startDate, endDate: null }];
    });
    updateDriver(id, { status: 'Reise', currentCar: carNumber, startDate, plannedReturnDate: plannedReturn, homeStatus: 'Nėra', readinessDate: null });
    logHistory(id, d.name, 'Išsiųstas į reisą', `Auto: ${carNumber}, Nuo: ${startDate}, Iki: ${plannedReturn}`, carNumber, startDate);
    setTripOpen(false); setSelectedDriverForTrip(null); setSelectedCarForAssignment(null);
    showToast(`${d.name} išsiųstas į reisą`);
  };

  // ── Car Actions ───────────────────────────────────────────────────────────────
  const addCar = (c: Omit<Car, 'id'>) => {
    setCars(prev => [...prev, { ...c, id: uid() }]);
    setAddCarOpen(false);
    showToast(`Automobilis ${c.number} pridėtas`);
  };

  const updateCar = (id: string, updates: Partial<Car>) => {
    setCars(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    setEditCarOpen(false); setSelectedCarForEdit(null);
    showToast('Automobilis atnaujintas');
  };

  const deleteCar = (id: string) => {
    const car = cars.find(c => c.id === id);
    if (!car) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const ready  = format(addDays(new Date(), 21), 'yyyy-MM-dd');
    const inCar  = drivers.filter(d => d.currentCar === car.number);
    if (inCar.length > 0) {
      setDrivers(prev => prev.map(d => d.currentCar === car.number ? { ...d, status: 'Namuose', currentCar: 'Nėra', startDate: null, plannedReturnDate: null, homeStatus: 'Poilsis', readinessDate: ready, lastTripEndDate: today } : d));
      setCarAssignments(prev => prev.map(a => a.carNumber === car.number && a.endDate === null ? { ...a, endDate: today } : a));
      inCar.forEach(d => logHistory(d.id, d.name, 'Automobilis ištrintas', `Grįžo namo (${car.number} pašalintas)`, 'Nėra', today));
    }
    setPlans(prev => prev.filter(p => p.carNumber !== car.number));
    setCars(prev => prev.filter(c => c.id !== id));
    showToast(`${car.number} pašalintas`);
  };

  // ── Plan Actions ──────────────────────────────────────────────────────────────
  const createPlan = (carNumber: string, leavingId: string | null, incomingId: string, date: string, returnDate?: string) => {
    if (plans.some(p => p.carNumber === carNumber && p.date === date && p.status === 'Suplanuota')) {
      showToast(`Šiai datai jau yra planas (${carNumber})`, 'error'); return;
    }
    const leaving  = leavingId ? drivers.find(d => d.id === leavingId) : null;
    const incoming = drivers.find(d => d.id === incomingId);
    if (!incoming) return;
    const plan: ReplacementPlan = {
      id: uid(), carNumber,
      leavingDriverId: leavingId || 'NONE', leavingDriverName: leaving?.name || 'Nėra',
      incomingDriverId: incomingId, incomingDriverName: incoming.name,
      date, status: 'Suplanuota', newPlannedReturnDate: returnDate
    };
    setPlans(prev => [plan, ...prev]);
    logHistory(incomingId, incoming.name, 'Suplanuotas pakeitimas', `Auto: ${carNumber}, Data: ${date}`, carNumber, date);
    showToast(`Planas sukurtas: ${incoming.name} → ${carNumber}`);
  };

  const deletePlan = (planId: string) => {
    setPlans(prev => prev.filter(p => p.id !== planId));
    showToast('Planas atšauktas');
  };

  const completePlan = (planId: string, execReturnDate?: string, actualDate?: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const execDate   = actualDate || plan.date;
    const returnDate = execReturnDate || plan.newPlannedReturnDate || format(addDays(parseISO(execDate), 42), 'yyyy-MM-dd');
    const readiness  = format(addDays(parseISO(execDate), 21), 'yyyy-MM-dd');

    setPlans(prev => prev.map(p => p.id === planId ? { ...p, status: 'Atlikta', date: execDate } : p));
    setDrivers(prev => prev.map(d => {
      if (d.id === plan.leavingDriverId && plan.leavingDriverId !== 'NONE')
        return { ...d, status: 'Namuose', currentCar: 'Nėra', startDate: null, plannedReturnDate: null, homeStatus: 'Poilsis', readinessDate: readiness, lastTripEndDate: execDate };
      if (d.id === plan.incomingDriverId)
        return { ...d, status: 'Reise', currentCar: plan.carNumber, startDate: execDate, plannedReturnDate: returnDate, homeStatus: 'Nėra', readinessDate: null };
      return d;
    }));
    setCarAssignments(prev => {
      let updated = prev.map(a => (a.carNumber === plan.carNumber && a.endDate === null) || (a.driverId === plan.leavingDriverId && a.endDate === null) ? { ...a, endDate: execDate } : a);
      return [...updated, { id: uid(), carNumber: plan.carNumber, driverId: plan.incomingDriverId, driverName: plan.incomingDriverName, startDate: execDate, endDate: null }];
    });
    if (plan.leavingDriverId !== 'NONE') logHistory(plan.leavingDriverId, plan.leavingDriverName, 'Išsiųstas namo', `Poilsis, pasiruošęs: ${readiness}`, 'Nėra', execDate);
    logHistory(plan.incomingDriverId, plan.incomingDriverName, 'Pakeitimas įvykdytas', `Auto: ${plan.carNumber}, nuo ${execDate} iki ${returnDate}`, plan.carNumber, execDate);
    showToast(`Pakeitimas įvykdytas: ${plan.incomingDriverName} → ${plan.carNumber}`);
  };

  // ── Computed ──────────────────────────────────────────────────────────────────
  const urgentCount = useMemo(() =>
    drivers.filter(d => {
      if (d.status !== 'Reise' || !d.plannedReturnDate) return false;
      const days = differenceInDays(parseISO(d.plannedReturnDate), new Date());
      return days <= 7 && !plans.some(p => p.status === 'Suplanuota' && p.leavingDriverId === d.id);
    }).length
  , [drivers, plans]);

  // Keičiamo reiso „taikinys": įmonė + mašinos tipas (Tentas/Refas) — pagal tai rūšiuojamos rekomendacijos.
  const replaceTarget = useMemo(() => {
    if (!selectedTripDriverId) return null;
    if (selectedTripDriverId.startsWith('CAR:')) {
      const car = cars.find(c => c.number === selectedTripDriverId.replace('CAR:', '')) || null;
      return car ? { company: car.registration, carType: car.type as CarType | '', car } : null;
    }
    const d = drivers.find(x => x.id === selectedTripDriverId);
    if (!d) return null;
    const car = cars.find(c => c.number === d.currentCar) || null;
    return { company: d.companyType, carType: (car?.type ?? '') as CarType | '', car };
  }, [selectedTripDriverId, drivers, cars]);

  // Specializacijos tinkamumas mašinai: 0 = tiksli (Tentas↔Tentas / Refas↔Refas),
  // 1 = Universalus (gali vairuoti bet kurią), 2 = priešinga specializacija.
  const specFit = (d: Driver, carType: CarType | '') => {
    if (carType && d.specialization === carType) return 0;
    if (d.specialization === 'Universalus') return 1;
    return 2;
  };

  const potentialReplacements = useMemo(() => {
    if (!replaceTarget) return [];
    const { company, carType } = replaceTarget;
    return drivers.filter(d => d.status === 'Namuose').sort((a, b) => {
      // 1) ta pati įmonė pirmiau
      const ca = a.companyType === company ? 0 : 1;
      const cb = b.companyType === company ? 0 : 1;
      if (ca !== cb) return ca - cb;
      // 2) specializacijos atitiktis mašinai (tiksli → universalus → priešinga)
      const sa = specFit(a, carType), sb = specFit(b, carType);
      if (sa !== sb) return sa - sb;
      // 3) tarp lygių — anksčiau pasiruošę pirmiau
      const da = a.readinessDate ? parseISO(a.readinessDate).getTime() : Infinity;
      const db = b.readinessDate ? parseISO(b.readinessDate).getTime() : Infinity;
      return da - db;
    });
  }, [drivers, replaceTarget]);

  const potentialTrips = useMemo(() => {
    if (!selectedHomeDriverId) return [];
    const target = parseISO(targetWorkDate);
    return drivers.filter(d => d.status === 'Reise' && d.plannedReturnDate && Math.abs(differenceInDays(parseISO(d.plannedReturnDate), target)) <= 14)
      .sort((a, b) => (a.plannedReturnDate || '').localeCompare(b.plannedReturnDate || ''));
  }, [drivers, selectedHomeDriverId, targetWorkDate]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const reiseDrivers  = drivers.filter(d => d.status === 'Reise');
  const namuoseDrivers = drivers.filter(d => d.status === 'Namuose').sort((a, b) => (a.readinessDate || '').localeCompare(b.readinessDate || ''));
  const activePlans   = plans.filter(p => p.status === 'Suplanuota');

  if (!loaded) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="w-8 h-8 border-2 border-hairline border-t-ink rounded-full animate-spin" />
          <p className="text-sm">Kraunama…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-canvas/80 backdrop-blur-xl border-b border-hairline">
        <div className="max-w-screen-2xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 bg-ink rounded-2xl flex items-center justify-center">
              <Truck className="text-white w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight leading-none">Dispečeris</p>
              <p className="text-[10px] text-muted tracking-wide mt-0.5">Vestex Transport</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1 overflow-x-auto py-1 flex-1 justify-center">
            <TabBtn active={activeTab === 'dashboard'}     onClick={() => setActiveTab('dashboard')}     icon={<LayoutDashboard size={15}/>} label="Skydelis" />
            <TabBtn active={activeTab === 'planning'}      onClick={() => setActiveTab('planning')}      icon={<ArrowRightLeft size={15}/>}  label="Planavimas" badge={urgentCount} />
            <TabBtn active={activeTab === 'drivers'}       onClick={() => setActiveTab('drivers')}       icon={<Users size={15}/>}           label="Vairuotojai" />
            <TabBtn active={activeTab === 'cars'}          onClick={() => setActiveTab('cars')}          icon={<Truck size={15}/>}           label="Auto" />
            <TabBtn active={activeTab === 'history'}       onClick={() => setActiveTab('history')}       icon={<History size={15}/>}         label="Istorija" />
            <TabBtn active={activeTab === 'calendar'}      onClick={() => setActiveTab('calendar')}      icon={<Calendar size={15}/>}        label="Kalendorius" />
            <TabBtn active={activeTab === 'auto-grafikas'} onClick={() => setActiveTab('auto-grafikas')} icon={<LayoutDashboard size={15}/>} label="Grafikas" />
            <TabBtn active={activeTab === 'trip'}          onClick={() => setActiveTab('trip')}          icon={<MapIcon size={15}/>}         label="Kelionė" />
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* DB indicator */}
            <span className="hidden md:flex items-center gap-1.5 text-[11px] font-medium text-muted px-2.5 py-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", isSupabaseEnabled ? "bg-emerald-400" : "bg-stone-300")} />
              {isSupabaseEnabled ? 'Supabase' : 'Vietinė'}
            </span>
            <button onClick={() => setAddCarOpen(true)} className="flex items-center gap-1.5 bg-surface border border-hairline text-ink px-3 py-1.5 rounded-full text-xs font-medium hover:border-ink/25 transition-all">
              <Plus size={14}/><span className="hidden sm:inline">Auto</span>
            </button>
            <button onClick={() => setAddDriverOpen(true)} className="flex items-center gap-1.5 bg-ink text-white px-3.5 py-1.5 rounded-full text-xs font-medium hover:bg-ink/85 transition-all">
              <UserPlus size={14}/><span className="hidden sm:inline">Vairuotojas</span>
            </button>
            {isSupabaseEnabled && (
              <button onClick={() => { void supabase?.auth.signOut(); }} title="Atsijungti" className="flex items-center justify-center text-muted hover:text-ink hover:bg-stone-100 p-2 rounded-full transition-all">
                <LogOut size={15}/>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-8">

        {/* ══════════════════ DASHBOARD ══════════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Reise"        value={reiseDrivers.length}   sub={`iš ${drivers.length} viso`}          accent="bg-blue-400"    onClick={() => setActiveTab('drivers')} />
              <StatCard label="Namuose"      value={namuoseDrivers.length} sub="laukia darbo"                          accent="bg-emerald-400" onClick={() => setActiveTab('drivers')} />
              <StatCard label="Planai"       value={activePlans.length}    sub="suplanuota"                            accent="bg-violet-400"  onClick={() => setActiveTab('planning')} />
              <StatCard label="Skubu"        value={urgentCount}           sub="reikia keitimo ≤7d"                   accent={urgentCount > 0 ? "bg-red-400" : "bg-stone-300"} onClick={() => setActiveTab('planning')} />
            </div>

            {/* Planned Replacements */}
            <section>
              <SectionHeader icon={<ArrowRightLeft size={18} className="text-blue-500"/>} title="Suplanuoti keitimai">
                <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
              </SectionHeader>

              {(() => {
                const monthPlans = activePlans.filter(p => isSameMonth(parseISO(p.date), selectedMonth) && cars.some(c => c.number === p.carNumber));
                if (monthPlans.length === 0) return <EmptyState icon={<Calendar size={28}/>} text="Šį mėnesį suplanuotų keitimų nėra" />;

                const byWeek: Record<string, { start: Date; plans: ReplacementPlan[] }> = {};
                monthPlans.forEach(p => {
                  const d = parseISO(p.date);
                  const ws = startOfWeek(d, { weekStartsOn: 1 });
                  const k  = format(ws, 'MM.dd');
                  if (!byWeek[k]) byWeek[k] = { start: ws, plans: [] };
                  byWeek[k].plans.push(p);
                });

                return (
                  <div className="space-y-8">
                    {Object.entries(byWeek).sort((a,b) => a[1].start.getTime() - b[1].start.getTime()).map(([k, { start, plans: wPlans }]) => (
                      <div key={k}>
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 bg-stone-200 px-3 py-1 rounded-full">
                            Savaitė {format(start, 'MM.dd')} – {format(endOfWeek(start, { weekStartsOn: 1 }), 'MM.dd')}
                          </span>
                          <div className="h-px flex-1 bg-stone-200" />
                        </div>
                        <div className="grid gap-3">
                          {wPlans.sort((a,b) => a.date.localeCompare(b.date)).map(plan => (
                            <PlanCard key={plan.id} plan={plan} drivers={drivers} cars={cars} plans={plans}
                              onComplete={() => {
                                setConfirmData({ carNumber: plan.carNumber, leavingId: plan.leavingDriverId, incomingId: plan.incomingDriverId, date: plan.date, driverName: plan.incomingDriverName, planId: plan.id, isExecution: true });
                                if (plan.newPlannedReturnDate) setNewReturnDate(plan.newPlannedReturnDate);
                              }}
                              onDelete={() => deletePlan(plan.id)}
                              onEdit={() => setEditingPlanId(plan.id)}
                              editingPlanId={editingPlanId}
                              setEditingPlanId={setEditingPlanId}
                              setPlans={setPlans}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>

            {/* Drivers at Home */}
            <section>
              <SectionHeader icon={<Home size={18} className="text-emerald-500"/>} title="Vairuotojai namuose" />
              {namuoseDrivers.length === 0
                ? <EmptyState icon={<Users size={28}/>} text="Visi vairuotojai reise" />
                : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {namuoseDrivers.map(d => (
                      <HomeDriverCard key={d.id} driver={d} onSendToTrip={() => { setSelectedDriverForTrip(d); setTripOpen(true); }} />
                    ))}
                  </div>
                )
              }
            </section>

            {/* Reise drivers urgency */}
            {urgentCount > 0 && (
              <section>
                <SectionHeader icon={<AlertCircle size={18} className="text-red-500"/>} title="Reikia keitimo (≤7 dienų)" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {reiseDrivers.filter(d => {
                    if (!d.plannedReturnDate) return false;
                    return differenceInDays(parseISO(d.plannedReturnDate), new Date()) <= 7 && !plans.some(p => p.status === 'Suplanuota' && p.leavingDriverId === d.id);
                  }).map(d => (
                    <div key={d.id} className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-sm">{d.name}</p>
                        <p className="text-xs text-red-600 font-semibold">{d.currentCar} — grįžta: {d.plannedReturnDate}</p>
                        <p className="text-[10px] text-red-400 mt-0.5">Liko {differenceInDays(parseISO(d.plannedReturnDate!), new Date())} d.</p>
                      </div>
                      <button onClick={() => { setSelectedTripDriverId(d.id); setActiveTab('planning'); }} className="bg-red-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-red-700 transition-colors whitespace-nowrap">
                        Planuoti
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Timeline */}
            <section>
              <SectionHeader icon={<LayoutDashboard size={18} className="text-violet-500"/>} title="Vairuotojų grafikas">
                <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
              </SectionHeader>
              <DriverTimeline drivers={drivers} cars={cars} plans={plans} carAssignments={carAssignments} month={selectedMonth} />
            </section>
          </div>
        )}

        {/* ══════════════════ PLANNING ══════════════════ */}
        {activeTab === 'planning' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Pakeitimų planavimas</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: who to replace */}
              <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
                <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
                  <LogOut size={16} className="text-red-500"/>
                  <h3 className="font-bold">Ką pakeisti?</h3>
                </div>
                <Field label="Automobilis / vairuotojas reise">
                  <select className={selectCls} value={selectedTripDriverId} onChange={e => setSelectedTripDriverId(e.target.value)}>
                    <option value="">Pasirinkite...</option>
                    <optgroup label="Reise">
                      {drivers.filter(d => d.status === 'Reise').sort((a,b) => (a.plannedReturnDate||'').localeCompare(b.plannedReturnDate||'')).map(d => {
                        const carType = cars.find(c => c.number === d.currentCar)?.type;
                        return (
                          <option key={d.id} value={d.id} disabled={plans.some(p => p.status === 'Suplanuota' && p.leavingDriverId === d.id)}>
                            {d.currentCar}{carType ? ` (${carType})` : ''} • {d.name} — grįžta: {d.plannedReturnDate || '?'}
                            {plans.some(p => p.status === 'Suplanuota' && p.leavingDriverId === d.id) ? ' (suplanuota)' : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="Laisvi automobiliai">
                      {cars.filter(c => !drivers.some(d => d.currentCar === c.number)).map(c => (
                        <option key={c.id} value={`CAR:${c.number}`}>{c.number} ({c.registration} • {c.type}) — aktyvus nuo: {c.activeFrom}</option>
                      ))}
                    </optgroup>
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Keitimo data">
                    <input type="date" className={inputCls} value={targetReplaceDate} onChange={e => setTargetReplaceDate(e.target.value)} />
                  </Field>
                  <Field label="Dirbs iki">
                    <input type="date" className={inputCls} value={newReturnDate} onChange={e => setNewReturnDate(e.target.value)} />
                  </Field>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Rekomenduojami ({potentialReplacements.length})</p>
                    {replaceTarget?.car && (
                      <span className="text-[11px] text-muted whitespace-nowrap">
                        {replaceTarget.car.number} · <span className="font-medium text-ink">{replaceTarget.carType || '—'}</span> · {replaceTarget.company}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {potentialReplacements.length === 0 && <p className="text-xs text-muted italic py-4 text-center">Nėra laisvų vairuotojų</p>}
                    {potentialReplacements.map(d => {
                      const isPlanned = plans.some(p => p.incomingDriverId === d.id && p.status === 'Suplanuota');
                      const daysHome  = d.lastTripEndDate ? differenceInDays(new Date(), parseISO(d.lastTripEndDate)) : null;
                      const fit = specFit(d, replaceTarget?.carType ?? '');
                      const sameCompany = !!replaceTarget && d.companyType === replaceTarget.company;
                      return (
                        <div key={d.id} className={cn("flex items-center justify-between p-3 rounded-xl border transition-all", isPlanned ? "bg-emerald-50 border-emerald-200" : "bg-canvas border-hairline hover:border-ink/25")}>
                          <div>
                            <p className="text-sm font-semibold">{d.name}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Badge variant={fit === 0 ? 'green' : fit === 1 ? 'blue' : 'default'}>{d.specialization}</Badge>
                              <Badge variant={sameCompany ? 'green' : 'default'}>{d.companyType}</Badge>
                              <span className="text-[10px] text-muted">Nuo: {d.readinessDate || '?'}{daysHome !== null ? ` (${daysHome}d. namuose)` : ''}</span>
                            </div>
                          </div>
                          {isPlanned ? (
                            <Badge variant="green">Suplanuota</Badge>
                          ) : (
                            <button onClick={() => {
                              const leaving = selectedTripDriverId.startsWith('CAR:') ? null : drivers.find(x => x.id === selectedTripDriverId);
                              const carNum  = selectedTripDriverId.startsWith('CAR:') ? selectedTripDriverId.replace('CAR:','') : leaving?.currentCar || '';
                              setConfirmData({ carNumber: carNum, leavingId: leaving?.id || null, incomingId: d.id, date: targetReplaceDate, driverName: d.name });
                            }} className="bg-ink text-white text-xs font-medium px-3.5 py-1.5 rounded-full hover:bg-ink/85 transition-colors">
                              Planuoti
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right: give work to driver */}
              <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
                <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
                  <LogIn size={16} className="text-emerald-500"/>
                  <h3 className="font-bold">Kam duoti darbą?</h3>
                </div>
                <Field label="Vairuotojas namuose">
                  <select className={selectCls} value={selectedHomeDriverId} onChange={e => setSelectedHomeDriverId(e.target.value)}>
                    <option value="">Pasirinkite...</option>
                    {drivers.filter(d => d.status === 'Namuose').sort((a,b) => (a.readinessDate||'').localeCompare(b.readinessDate||'')).map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.companyType} • {d.specialization}) — nuo: {d.readinessDate || '?'}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Darbo data">
                    <input type="date" className={inputCls} value={targetWorkDate} onChange={e => setTargetWorkDate(e.target.value)} />
                  </Field>
                  <Field label="Dirbs iki">
                    <input type="date" className={inputCls} value={newReturnDate} onChange={e => setNewReturnDate(e.target.value)} />
                  </Field>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Galimi automobiliai ({potentialTrips.length})</p>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {potentialTrips.length === 0 && <p className="text-xs text-stone-400 italic py-4 text-center">Nėra grįžtančių vairuotojų šiam laikotarpiui</p>}
                    {potentialTrips.map(d => {
                      const isPlanned = plans.some(p => p.carNumber === d.currentCar && p.date === targetWorkDate && p.status === 'Suplanuota');
                      const late = d.plannedReturnDate && isBefore(parseISO(d.plannedReturnDate), new Date());
                      return (
                        <div key={d.id} className={cn("flex items-center justify-between p-3 rounded-xl border", isPlanned ? "bg-emerald-50 border-emerald-200" : "bg-stone-50 border-stone-100 hover:border-stone-300")}>
                          <div>
                            <p className="text-sm font-semibold">{d.currentCar} — {d.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant={late ? 'red' : 'blue'}>{late ? 'Vėluoja' : `Nuo: ${d.plannedReturnDate}`}</Badge>
                              <Badge>{d.companyType} • {d.specialization}</Badge>
                            </div>
                          </div>
                          {isPlanned ? <Badge variant="green">Suplanuota</Badge> : (
                            <button onClick={() => {
                              if (!selectedHomeDriverId) { showToast('Pasirinkite vairuotoją', 'error'); return; }
                              const incoming = drivers.find(x => x.id === selectedHomeDriverId);
                              setConfirmData({ carNumber: d.currentCar, leavingId: d.id, incomingId: selectedHomeDriverId, date: targetWorkDate, driverName: incoming?.name || '' });
                            }} className="bg-stone-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-stone-700 transition-colors">
                              Planuoti
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Active Plans List */}
            {activePlans.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-6">
                <p className="text-sm font-bold mb-4">Visi aktyvūs planai ({activePlans.length})</p>
                <div className="space-y-2">
                  {activePlans.sort((a,b) => a.date.localeCompare(b.date)).map(plan => (
                    <div key={plan.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold bg-stone-900 text-white px-2 py-0.5 rounded">{plan.carNumber}</span>
                        <div>
                          <p className="text-xs font-semibold">{plan.leavingDriverName} → {plan.incomingDriverName}</p>
                          <p className="text-[10px] text-stone-400">{plan.date}{plan.newPlannedReturnDate ? ` • dirbs iki: ${plan.newPlannedReturnDate}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setConfirmData({ carNumber: plan.carNumber, leavingId: plan.leavingDriverId, incomingId: plan.incomingDriverId, date: plan.date, driverName: plan.incomingDriverName, planId: plan.id, isExecution: true }); if (plan.newPlannedReturnDate) setNewReturnDate(plan.newPlannedReturnDate); }} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all"><CheckCircle2 size={14}/></button>
                        <button onClick={() => deletePlan(plan.id)} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"><Trash2 size={14}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ DRIVERS ══════════════════ */}
        {activeTab === 'drivers' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-xl font-bold">Vairuotojai ({drivers.length})</h2>
              <div className="flex flex-wrap gap-2">
                <select className={cn(selectCls, 'w-auto')} value={driverFilter.companyType} onChange={e => setDriverFilter(p => ({ ...p, companyType: e.target.value as RegistrationType | '' }))}>
                  <option value="">Visos įmonės</option>
                  <option value="LT">LT</option>
                  <option value="PL">PL</option>
                </select>
                <select className={cn(selectCls, 'w-auto')} value={driverFilter.specialization} onChange={e => setDriverFilter(p => ({ ...p, specialization: e.target.value as DriverSpecialization | '' }))}>
                  <option value="">Visi tipai</option>
                  <option value="Tentas">Tentas</option>
                  <option value="Refas">Refas</option>
                  <option value="Universalus">Universalus</option>
                </select>
                <input placeholder="Paieška..." className={cn(inputCls, 'w-36')} value={driverFilter.search} onChange={e => setDriverFilter(p => ({ ...p, search: e.target.value }))} />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-900 text-white text-left">
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Vairuotojas</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Įmonė / Tipas</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Būsena</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Auto</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Data</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-right">Veiksmai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {drivers.filter(d => {
                    const mc = !driverFilter.companyType || d.companyType === driverFilter.companyType;
                    const ms = !driverFilter.specialization || d.specialization === driverFilter.specialization;
                    const mx = !driverFilter.search || d.name.toLowerCase().includes(driverFilter.search.toLowerCase());
                    return mc && ms && mx;
                  }).map(d => {
                    const plan = plans.find(p => p.status === 'Suplanuota' && (p.leavingDriverId === d.id || p.incomingDriverId === d.id));
                    const isLate = d.status === 'Reise' && d.plannedReturnDate && isBefore(parseISO(d.plannedReturnDate), new Date());
                    return (
                      <tr key={d.id} className="hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{d.name}</div>
                          <div className="text-[10px] text-stone-400 font-mono">{d.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <Badge>{d.companyType}</Badge>
                            <Badge variant="blue">{d.specialization}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={d.status === 'Reise' ? 'blue' : 'green'}>{d.status}</Badge>
                          {plan && <span className="ml-1.5 text-[9px] text-violet-600 font-bold">PLANAS</span>}
                          {isLate && <span className="ml-1.5"><Badge variant="red">Vėluoja</Badge></span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-bold">{d.currentCar}</td>
                        <td className="px-4 py-3 text-xs">
                          {d.status === 'Reise' ? (
                            <span className="text-stone-500">Grįžta: <strong>{d.plannedReturnDate || '?'}</strong></span>
                          ) : (
                            <span className="text-stone-500">Gali: <strong>{d.readinessDate || '?'}</strong></span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            {d.status === 'Reise' ? (
                              <button onClick={() => { setSelectedDriverForHome(d); setHomeOpen(true); }} className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 transition-colors">Namo</button>
                            ) : (
                              <button onClick={() => { setSelectedDriverForTrip(d); setTripOpen(true); }} className="px-2.5 py-1 bg-stone-900 text-white text-[10px] font-bold rounded-lg hover:bg-stone-700 transition-colors">Į reisą</button>
                            )}
                            <button onClick={() => { setSelectedDriverForEdit(d); setEditDriverOpen(true); }} className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg transition-all"><Edit size={13}/></button>
                            <button onClick={() => deleteDriver(d.id)} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════ CARS ══════════════════ */}
        {activeTab === 'cars' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-xl font-bold">Automobilių parkas ({cars.length})</h2>
              <div className="flex gap-2 flex-wrap">
                <select className={cn(selectCls, 'w-auto')} value={carFilter.registration} onChange={e => setCarFilter(p => ({ ...p, registration: e.target.value as RegistrationType | '' }))}>
                  <option value="">Visos registracijos</option>
                  <option value="LT">LT</option>
                  <option value="PL">PL</option>
                </select>
                <select className={cn(selectCls, 'w-auto')} value={carFilter.type} onChange={e => setCarFilter(p => ({ ...p, type: e.target.value as CarType | '' }))}>
                  <option value="">Visi tipai</option>
                  <option value="Tentas">Tentas</option>
                  <option value="Refas">Refas</option>
                </select>
                <input placeholder="Paieška..." className={cn(inputCls, 'w-32')} value={carFilter.search} onChange={e => setCarFilter(p => ({ ...p, search: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cars.filter(c => {
                const mr = !carFilter.registration || c.registration === carFilter.registration;
                const mt = !carFilter.type || c.type === carFilter.type;
                const ms = !carFilter.search || c.number.toLowerCase().includes(carFilter.search.toLowerCase());
                return mr && mt && ms;
              }).map(car => {
                const driver = drivers.find(d => d.currentCar === car.number);
                const plan   = plans.find(p => p.status === 'Suplanuota' && p.carNumber === car.number);
                return (
                  <div key={car.id} className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow group">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-mono font-black text-lg tracking-tight">{car.number}</p>
                        <div className="flex gap-1.5 mt-1">
                          <Badge variant="blue">{car.type}</Badge>
                          <Badge>{car.registration}</Badge>
                          <Badge variant={car.status === 'Aktyvus' ? 'green' : 'red'}>{car.status}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setSelectedCarForEdit(car); setEditCarOpen(true); }} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit size={13}/></button>
                        <button onClick={() => deleteCar(car.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={13}/></button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm border-t border-stone-100 pt-3">
                      <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                        <User size={12} className="text-stone-400"/>
                      </div>
                      {driver ? <p className="font-semibold">{driver.name}</p> : <p className="text-stone-400 italic text-xs">Nepriskirtas</p>}
                    </div>

                    {plan && (
                      <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                        <p className="text-[9px] font-black text-violet-500 uppercase mb-1">Suplanuotas keitimas</p>
                        <p className="text-xs font-semibold">{plan.incomingDriverName} → {plan.date}</p>
                      </div>
                    )}

                    {!driver && (
                      <button onClick={() => { setSelectedCarForAssignment(car.number); setTripOpen(true); }} className="w-full bg-stone-900 text-white py-2 rounded-xl text-xs font-bold hover:bg-stone-700 transition-colors">
                        Priskirti vairuotoją
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════ HISTORY ══════════════════ */}
        {activeTab === 'history' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-bold">Istorija</h2>
              <div className="flex items-center gap-3">
                <div className="flex bg-stone-100 p-1 rounded-xl">
                  {(['upcoming', 'past'] as const).map(m => (
                    <button key={m} onClick={() => setHistoryMode(m)} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", historyMode === m ? "bg-white shadow text-stone-900" : "text-stone-400")}>
                      {m === 'upcoming' ? 'Būsimi' : 'Atlikti'}
                    </button>
                  ))}
                </div>
                <MonthNav value={historyMonth} onChange={v => { setHistoryMonth(v); setHistoryWeekOffset(0); }} />
              </div>
            </div>

            {/* Plans table */}
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-900 text-white text-left">
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Data</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Auto</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Išeina</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Ateina</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Tipas</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Statusas</th>
                    {historyMode === 'upcoming' && <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-right">Veiksmai</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {plans.filter(p => {
                    const correct = historyMode === 'upcoming' ? p.status === 'Suplanuota' : p.status === 'Atlikta';
                    return correct && isSameMonth(parseISO(p.date), historyMonth);
                  }).sort((a,b) => a.date.localeCompare(b.date)).map(plan => {
                    const car = cars.find(c => c.number === plan.carNumber);
                    return (
                      <tr key={plan.id} className="hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-bold">{plan.date}</td>
                        <td className="px-4 py-3"><span className="font-mono font-bold bg-stone-100 px-2 py-0.5 rounded text-xs">{plan.carNumber}</span></td>
                        <td className="px-4 py-3 text-sm">{plan.leavingDriverName}</td>
                        <td className="px-4 py-3 text-sm font-semibold">{plan.incomingDriverName}</td>
                        <td className="px-4 py-3"><Badge variant="blue">{car?.type || '?'}</Badge></td>
                        <td className="px-4 py-3"><Badge variant={plan.status === 'Suplanuota' ? 'blue' : 'green'}>{plan.status}</Badge></td>
                        {historyMode === 'upcoming' && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => { setConfirmData({ carNumber: plan.carNumber, leavingId: plan.leavingDriverId, incomingId: plan.incomingDriverId, date: plan.date, driverName: plan.incomingDriverName, planId: plan.id, isExecution: true }); if (plan.newPlannedReturnDate) setNewReturnDate(plan.newPlannedReturnDate); }} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all"><CheckCircle2 size={13}/></button>
                              <button onClick={() => deletePlan(plan.id)} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"><Trash2 size={13}/></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {plans.filter(p => historyMode === 'upcoming' ? p.status === 'Suplanuota' : p.status === 'Atlikta').filter(p => isSameMonth(parseISO(p.date), historyMonth)).length === 0 && (
                <div className="py-12 text-center text-stone-400 text-sm">Planų nerasta</div>
              )}
            </div>

            {/* Action Log */}
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 bg-stone-900 text-white flex items-center gap-2">
                <History size={14}/>
                <span className="text-xs font-bold uppercase tracking-wider">Veiksmų žurnalas</span>
              </div>
              <div className="divide-y divide-stone-100 max-h-96 overflow-y-auto">
                {history.slice(0, 50).map(entry => (
                  <div key={entry.id} className="px-4 py-3 flex gap-4 hover:bg-stone-50 transition-colors">
                    <span className="text-[10px] font-mono text-stone-400 shrink-0 pt-0.5 w-32">{entry.timestamp}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold">{entry.driverName}</p>
                        <Badge variant="blue">{entry.action}</Badge>
                        {entry.carNumber && entry.carNumber !== 'Nėra' && <Badge>{entry.carNumber}</Badge>}
                      </div>
                      <p className="text-[11px] text-stone-500 mt-0.5 truncate">{entry.details}</p>
                    </div>
                  </div>
                ))}
                {history.length === 0 && <div className="py-8 text-center text-stone-400 text-xs">Žurnalas tuščias</div>}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ CALENDAR ══════════════════ */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Keitimų kalendorius</h2>
              <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
            </div>
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-900 text-white">
                {['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Še', 'Se'].map(d => (
                  <div key={d} className="p-3 text-center text-[10px] font-black uppercase tracking-widest">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {(() => {
                  const ms   = startOfMonth(selectedMonth);
                  const me   = endOfMonth(ms);
                  const days = eachDayOfInterval({ start: startOfWeek(ms, { weekStartsOn: 1 }), end: endOfWeek(me, { weekStartsOn: 1 }) });
                  return days.map((day, i) => {
                    const ds   = format(day, 'yyyy-MM-dd');
                    const dp   = plans.filter(p => p.date === ds);
                    const curr = isSameMonth(day, selectedMonth);
                    const tod  = isSameDay(day, new Date());
                    return (
                      <div key={i} onClick={() => dp.length > 0 && setSelectedCalendarDay(ds)} className={cn("min-h-[100px] p-2 border-r border-b border-stone-100 transition-colors", !curr && "bg-stone-50 opacity-40", tod && "bg-blue-50", dp.length > 0 && "cursor-pointer hover:bg-stone-50")}>
                        <span className={cn("text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full", tod ? "bg-stone-900 text-white" : "text-stone-400")}>{format(day, 'd')}</span>
                        <div className="mt-1 space-y-1">
                          {dp.slice(0, 3).map(p => (
                            <div key={p.id} className={cn("text-[8px] px-1.5 py-0.5 rounded font-bold truncate", p.status === 'Suplanuota' ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}>
                              {p.carNumber} • {p.incomingDriverName}
                            </div>
                          ))}
                          {dp.length > 3 && <div className="text-[8px] text-stone-400 font-bold">+{dp.length - 3}</div>}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ AUTO GRAFIKAS ══════════════════ */}
        {activeTab === 'auto-grafikas' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Automobilių grafikas</h2>
              <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
            </div>
            <DriverTimeline drivers={drivers} cars={cars} plans={plans} carAssignments={carAssignments} month={selectedMonth} showCars />
          </div>
        )}

        {/* ══════════════════ KELIONĖ (žemėlapis) ══════════════════ */}
        {activeTab === 'trip' && (
          <TripPlanner drivers={drivers} plans={plans} showToast={(msg, type) => setToast({ message: msg, type: type ?? 'success' })} />
        )}

        {/* Reset */}
        <div className="text-center pt-4">
          <button onClick={() => { if (confirm('Atstatyti sistemą? Visi duomenys bus prarasti.')) { setDrivers(INITIAL_DRIVERS); setCars(INITIAL_CARS); setHistory([]); setPlans([]); setCarAssignments([]); localStorage.clear(); showToast('Sistema atstatyta'); }}} className="text-[10px] font-bold text-stone-300 hover:text-stone-500 transition-colors uppercase tracking-widest">
            Sistemos atstatymas
          </button>
        </div>
      </main>

      {/* ══════════════════ MODALS ══════════════════ */}

      {/* Add Driver */}
      {addDriverOpen && (
        <Modal title="Naujas vairuotojas" onClose={() => setAddDriverOpen(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); addDriver({ name: f.get('name') as string, phone: f.get('phone') as string, status: 'Namuose', currentCar: 'Nėra', startDate: null, plannedReturnDate: null, homeStatus: 'Poilsis', readinessDate: format(new Date(), 'yyyy-MM-dd'), companyType: f.get('companyType') as RegistrationType, specialization: f.get('specialization') as DriverSpecialization }); }}>
            <Field label="Vardas Pavardė"><input name="name" required placeholder="Vardas Pavardė" className={inputCls} /></Field>
            <Field label="Telefonas"><input name="phone" required placeholder="+370 ..." className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Įmonė"><select name="companyType" required className={selectCls}><option value="LT">LT</option><option value="PL">PL</option></select></Field>
              <Field label="Tipas"><select name="specialization" required className={selectCls}><option value="Tentas">Tentas</option><option value="Refas">Refas</option><option value="Universalus">Universalus</option></select></Field>
            </div>
            <button type="submit" className="w-full bg-stone-900 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-stone-800 transition-colors">Pridėti</button>
          </form>
        </Modal>
      )}

      {/* Add Car */}
      {addCarOpen && (
        <Modal title="Naujas automobilis" onClose={() => setAddCarOpen(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); addCar({ number: (f.get('number') as string).toUpperCase(), status: 'Aktyvus', type: f.get('type') as CarType, registration: f.get('registration') as RegistrationType, activeFrom: f.get('activeFrom') as string }); }}>
            <Field label="Numeris"><input name="number" required placeholder="ABC 123" className={cn(inputCls, 'uppercase font-mono')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Registracija"><select name="registration" required className={selectCls}><option value="LT">LT</option><option value="PL">PL</option></select></Field>
              <Field label="Tipas"><select name="type" required className={selectCls}><option value="Tentas">Tentas</option><option value="Refas">Refas</option></select></Field>
            </div>
            <Field label="Aktyvus nuo"><input name="activeFrom" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} className={inputCls} /></Field>
            <button type="submit" className="w-full bg-stone-900 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-stone-800 transition-colors">Pridėti</button>
          </form>
        </Modal>
      )}

      {/* Edit Car */}
      {editCarOpen && selectedCarForEdit && (
        <Modal title={`Redaguoti: ${selectedCarForEdit.number}`} onClose={() => { setEditCarOpen(false); setSelectedCarForEdit(null); }}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); updateCar(selectedCarForEdit.id, { number: f.get('number') as string, type: f.get('type') as CarType, registration: f.get('registration') as RegistrationType, status: f.get('status') as 'Aktyvus' | 'Remontas' }); }}>
            <Field label="Numeris"><input name="number" required defaultValue={selectedCarForEdit.number} className={cn(inputCls, 'uppercase')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Registracija"><select name="registration" required defaultValue={selectedCarForEdit.registration} className={selectCls}><option value="LT">LT</option><option value="PL">PL</option></select></Field>
              <Field label="Tipas"><select name="type" required defaultValue={selectedCarForEdit.type} className={selectCls}><option value="Tentas">Tentas</option><option value="Refas">Refas</option></select></Field>
            </div>
            <Field label="Būsena"><select name="status" defaultValue={selectedCarForEdit.status} className={selectCls}><option value="Aktyvus">Aktyvus</option><option value="Remontas">Remontas</option></select></Field>
            <button type="submit" className="w-full bg-stone-900 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-stone-800 transition-colors">Išsaugoti</button>
          </form>
        </Modal>
      )}

      {/* Send to Trip */}
      {tripOpen && (selectedDriverForTrip || selectedCarForAssignment) && (
        <Modal title={selectedDriverForTrip ? `Į reisą: ${selectedDriverForTrip.name}` : `Priskirti: ${selectedCarForAssignment}`} onClose={() => { setTripOpen(false); setSelectedDriverForTrip(null); setSelectedCarForAssignment(null); }}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const did = selectedDriverForTrip?.id || f.get('driverId') as string; const car = selectedCarForAssignment || f.get('car') as string; sendToTrip(did, car, f.get('startDate') as string, f.get('returnDate') as string); }}>
            {!selectedDriverForTrip && <Field label="Vairuotojas"><select name="driverId" required className={selectCls}><option value="">Pasirinkite...</option>{drivers.filter(d => d.status === 'Namuose').map(d => <option key={d.id} value={d.id}>{d.name} ({d.companyType} • {d.specialization})</option>)}</select></Field>}
            {!selectedCarForAssignment && <Field label="Automobilis"><select name="car" required className={selectCls}>{cars.map(c => <option key={c.id} value={c.number}>{c.number} ({c.registration} • {c.type})</option>)}</select></Field>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pradžia"><input name="startDate" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} className={inputCls} /></Field>
              <Field label="Planuojama pabaiga"><input name="returnDate" type="date" required defaultValue={format(addDays(new Date(), 42), 'yyyy-MM-dd')} className={inputCls} /></Field>
            </div>
            <button type="submit" className="w-full bg-stone-900 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-stone-800 transition-colors">Patvirtinti</button>
          </form>
        </Modal>
      )}

      {/* Send Home */}
      {homeOpen && selectedDriverForHome && (
        <Modal title={`Namo: ${selectedDriverForHome.name}`} onClose={() => { setHomeOpen(false); setSelectedDriverForHome(null); }}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); sendHome(selectedDriverForHome.id, f.get('status') as HomeStatus, f.get('readinessDate') as string); }}>
            <Field label="Būsena namuose"><select name="status" required className={selectCls}><option value="Poilsis">Poilsis</option><option value="Tvarko dokumentus">Tvarko dokumentus</option></select></Field>
            <Field label="Gali nuo"><input name="readinessDate" type="date" required defaultValue={format(addDays(new Date(), 14), 'yyyy-MM-dd')} className={inputCls} /></Field>
            <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors">Patvirtinti</button>
          </form>
        </Modal>
      )}

      {/* Edit Driver */}
      {editDriverOpen && selectedDriverForEdit && (
        <Modal title={`Redaguoti: ${selectedDriverForEdit.name}`} onClose={() => { setEditDriverOpen(false); setSelectedDriverForEdit(null); }}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); updateDriver(selectedDriverForEdit.id, { name: f.get('name') as string, phone: f.get('phone') as string, status: f.get('status') as DriverStatus, currentCar: f.get('car') as string, startDate: (f.get('startDate') as string) || null, plannedReturnDate: (f.get('returnDate') as string) || null, homeStatus: f.get('homeStatus') as HomeStatus, readinessDate: (f.get('readinessDate') as string) || null, companyType: f.get('companyType') as RegistrationType, specialization: f.get('specialization') as DriverSpecialization }); setEditDriverOpen(false); showToast('Duomenys atnaujinti'); }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vardas"><input name="name" required defaultValue={selectedDriverForEdit.name} className={inputCls} /></Field>
              <Field label="Tel."><input name="phone" required defaultValue={selectedDriverForEdit.phone} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Įmonė"><select name="companyType" required defaultValue={selectedDriverForEdit.companyType} className={selectCls}><option value="LT">LT</option><option value="PL">PL</option></select></Field>
              <Field label="Tipas"><select name="specialization" required defaultValue={selectedDriverForEdit.specialization} className={selectCls}><option value="Tentas">Tentas</option><option value="Refas">Refas</option><option value="Universalus">Universalus</option></select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Būsena"><select name="status" defaultValue={selectedDriverForEdit.status} className={selectCls}><option value="Reise">Reise</option><option value="Namuose">Namuose</option></select></Field>
              <Field label="Auto"><input name="car" defaultValue={selectedDriverForEdit.currentCar} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pradžia"><input name="startDate" type="date" defaultValue={selectedDriverForEdit.startDate || ''} className={inputCls} /></Field>
              <Field label="Grįžta"><input name="returnDate" type="date" defaultValue={selectedDriverForEdit.plannedReturnDate || ''} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Namų būsena"><select name="homeStatus" defaultValue={selectedDriverForEdit.homeStatus} className={selectCls}><option value="Nėra">Nėra</option><option value="Poilsis">Poilsis</option><option value="Tvarko dokumentus">Tvarko dokumentus</option></select></Field>
              <Field label="Gali nuo"><input name="readinessDate" type="date" defaultValue={selectedDriverForEdit.readinessDate || ''} className={inputCls} /></Field>
            </div>
            <button type="submit" className="w-full bg-stone-900 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-stone-800 transition-colors">Išsaugoti</button>
          </form>
        </Modal>
      )}

      {/* Calendar Day Detail */}
      {selectedCalendarDay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between">
              <div>
                <p className="font-bold">{format(parseISO(selectedCalendarDay), 'yyyy MMMM d', { locale: lt })}</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider">Dienos planai</p>
              </div>
              <button onClick={() => setSelectedCalendarDay(null)} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={16}/></button>
            </div>
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              {plans.filter(p => p.date === selectedCalendarDay).map(plan => (
                <div key={plan.id} className="border border-stone-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono font-black bg-stone-900 text-white px-2 py-0.5 rounded text-sm">{plan.carNumber}</span>
                    <Badge variant={plan.status === 'Suplanuota' ? 'blue' : 'green'}>{plan.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div><p className="text-[9px] text-red-500 font-bold uppercase mb-0.5">Namo</p><p className="font-semibold text-sm">{plan.leavingDriverName}</p></div>
                    <ArrowRight size={16} className="text-stone-300 shrink-0"/>
                    <div className="text-right"><p className="text-[9px] text-emerald-500 font-bold uppercase mb-0.5">Į reisą</p><p className="font-semibold text-sm">{plan.incomingDriverName}</p></div>
                  </div>
                </div>
              ))}
              {plans.filter(p => p.date === selectedCalendarDay).length === 0 && <p className="text-center text-stone-400 text-sm py-8">Planų nėra</p>}
            </div>
            <div className="px-6 py-4 border-t border-stone-100">
              <button onClick={() => setSelectedCalendarDay(null)} className="w-full bg-stone-900 text-white py-2.5 rounded-xl font-bold text-sm">Uždaryti</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Plan */}
      {confirmData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="font-bold">{confirmData.isExecution ? 'Patvirtinti įvykdymą' : 'Patvirtinti planą'}</h3>
              <button onClick={() => setConfirmData(null)} className="p-1.5 hover:bg-stone-100 rounded-lg"><X size={16}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-stone-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400 font-medium">Automobilis</span>
                  <span className="font-mono font-black">{confirmData.carNumber}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-stone-400 font-medium">Data</span>
                  {confirmData.isExecution ? (
                    <input type="date" className={cn(inputCls, 'w-40 text-right')} value={confirmData.executionDate || confirmData.date} onChange={e => setConfirmData(p => p ? { ...p, executionDate: e.target.value } : null)} />
                  ) : (
                    <span className="font-bold">{confirmData.date}</span>
                  )}
                </div>
                <div className="pt-2 border-t border-stone-200 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[9px] text-stone-400 font-bold uppercase">Namo</p>
                    <p className="text-sm font-semibold truncate">{confirmData.leavingId && confirmData.leavingId !== 'NONE' ? drivers.find(d => d.id === confirmData.leavingId)?.name || '—' : 'Nauja mašina'}</p>
                  </div>
                  <ArrowRight size={14} className="text-stone-300 shrink-0"/>
                  <div className="flex-1 text-right">
                    <p className="text-[9px] text-stone-400 font-bold uppercase">Į reisą</p>
                    <p className="text-sm font-semibold truncate">{confirmData.driverName}</p>
                  </div>
                </div>
              </div>
              <Field label="Dirbs iki (planuojama)">
                <input type="date" className={inputCls} value={newReturnDate} onChange={e => setNewReturnDate(e.target.value)} />
              </Field>
            </div>
            <div className="px-6 py-4 border-t border-stone-100 flex gap-3">
              <button onClick={() => setConfirmData(null)} className="flex-1 py-2.5 border border-stone-200 rounded-xl text-sm font-semibold hover:bg-stone-50 transition-colors">Atšaukti</button>
              <button onClick={() => {
                if (confirmData.isExecution && confirmData.planId) completePlan(confirmData.planId, newReturnDate, confirmData.executionDate);
                else createPlan(confirmData.carNumber, confirmData.leavingId, confirmData.incomingId, confirmData.date, newReturnDate);
                setConfirmData(null);
              }} className="flex-1 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-colors">
                {confirmData.isExecution ? 'Įvykdyta ✓' : 'Patvirtinti'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn("fixed bottom-6 right-6 flex items-center gap-3 pl-4 pr-3 py-3 rounded-2xl shadow-float z-[100] animate-in slide-in-from-bottom-4", toast.type === 'success' ? "bg-ink text-white" : "bg-red-500 text-white")}>
          {toast.type === 'success' ? <CheckCircle2 size={16} className="opacity-90"/> : <AlertCircle size={16} className="opacity-90"/>}
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-50 hover:opacity-100 transition-opacity"><X size={14}/></button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-2.5">
        {icon}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MonthNav({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  return (
    <div className="flex items-center gap-1 bg-surface border border-hairline rounded-full p-1">
      <button onClick={() => onChange(subMonths(value, 1))} className="p-1.5 text-muted hover:text-ink hover:bg-stone-100 rounded-full transition-colors"><ChevronLeft size={14}/></button>
      <span className="px-3 text-xs font-medium min-w-[110px] text-center capitalize">{format(value, 'MMMM yyyy', { locale: lt })}</span>
      <button onClick={() => onChange(addMonths(value, 1))} className="p-1.5 text-muted hover:text-ink hover:bg-stone-100 rounded-full transition-colors"><ChevronRight size={14}/></button>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-16 text-center bg-surface rounded-2xl border border-hairline">
      <div className="inline-flex p-4 bg-canvas rounded-2xl text-stone-300 mb-3">{icon}</div>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

function HomeDriverCard({ driver, onSendToTrip }: { driver: Driver; onSendToTrip: () => void }) {
  const daysHome = driver.lastTripEndDate ? differenceInDays(new Date(), parseISO(driver.lastTripEndDate)) : null;
  return (
    <div className="bg-surface rounded-2xl border border-hairline p-4 group hover:border-ink/25 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-semibold text-sm">
          {driver.name.charAt(0)}
        </div>
        <Badge variant={driver.homeStatus === 'Tvarko dokumentus' ? 'amber' : 'green'}>{driver.homeStatus}</Badge>
      </div>
      <p className="font-semibold text-sm mb-1">{driver.name}</p>
      <div className="flex gap-1 mb-3">
        <Badge>{driver.companyType}</Badge>
        <Badge variant="blue">{driver.specialization}</Badge>
      </div>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-muted">Gali nuo</span>
          <span className="font-semibold text-blue-600">{driver.readinessDate || '?'}</span>
        </div>
        {daysHome !== null && (
          <div className="flex justify-between">
            <span className="text-muted">Namuose</span>
            <span className="font-semibold">{daysHome} d.</span>
          </div>
        )}
      </div>
      <button onClick={onSendToTrip} className="w-full mt-3 py-2 bg-ink text-white text-[11px] font-medium rounded-xl opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
        Į reisą →
      </button>
    </div>
  );
}

function PlanCard({ plan, drivers, cars, plans, onComplete, onDelete, onEdit, editingPlanId, setEditingPlanId, setPlans }: {
  plan: ReplacementPlan; drivers: Driver[]; cars: Car[]; plans: ReplacementPlan[];
  onComplete: () => void; onDelete: () => void; onEdit: () => void;
  editingPlanId: string | null; setEditingPlanId: (id: string | null) => void;
  setPlans: React.Dispatch<React.SetStateAction<ReplacementPlan[]>>;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 hover:shadow-md transition-all">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Date */}
        <div className="flex flex-col items-center min-w-[60px]">
          <div className="w-12 h-12 rounded-2xl bg-stone-900 text-white flex flex-col items-center justify-center">
            <span className="text-lg font-black leading-none">{format(parseISO(plan.date), 'dd')}</span>
            <span className="text-[8px] uppercase opacity-60">{format(parseISO(plan.date), 'EEE', { locale: lt })}</span>
          </div>
          <span className="mt-1.5 text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{plan.carNumber}</span>
        </div>

        {/* Exchange */}
        <div className="flex-1 flex items-center gap-4">
          <div className="flex-1 text-right">
            <p className="text-[9px] text-red-500 font-black uppercase mb-0.5 flex items-center justify-end gap-1"><LogOut size={9}/>Namo</p>
            <p className="font-bold text-sm">{plan.leavingDriverName}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center shrink-0">
            <ArrowRightLeft size={14} className="text-stone-400"/>
          </div>
          <div className="flex-1">
            <p className="text-[9px] text-emerald-500 font-black uppercase mb-0.5 flex items-center gap-1"><LogIn size={9}/>Į reisą</p>
            <p className="font-bold text-sm">{plan.incomingDriverName}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex sm:flex-col gap-2 border-t sm:border-t-0 sm:border-l border-stone-100 pt-3 sm:pt-0 sm:pl-4 w-full sm:w-auto">
          <button onClick={onComplete} className="flex-1 sm:flex-none p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all" title="Įvykdyta"><CheckCircle2 size={16}/></button>
          <button onClick={onEdit}    className="flex-1 sm:flex-none p-2.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all" title="Redaguoti"><Edit size={16}/></button>
          <button onClick={onDelete}  className="flex-1 sm:flex-none p-2.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all" title="Ištrinti"><X size={16}/></button>
        </div>
      </div>
    </div>
  );
}

function DriverTimeline({ drivers, cars, plans, carAssignments, month, showCars }: {
  drivers: Driver[]; cars: Car[]; plans: ReplacementPlan[]; carAssignments: CarAssignment[]; month: Date; showCars?: boolean;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd   = endOfMonth(month);
  const totalDays  = getDaysInMonth(month);
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const rows = showCars ? cars : drivers;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden overflow-x-auto">
      <div className="min-w-[900px]">
        {/* Header */}
        <div className="flex border-b border-stone-200 bg-stone-900 text-white">
          <div className="w-48 shrink-0 px-4 py-3 text-[10px] font-black uppercase tracking-wider">{showCars ? 'Auto' : 'Vairuotojas'}</div>
          <div className="flex flex-1">
            {days.map(d => (
              <div key={d.toString()} className={cn("flex-1 py-2 text-center border-r border-white/5", isSameDay(d, new Date()) && "bg-blue-500/20")}>
                <div className="text-[7px] uppercase opacity-50">{format(d, 'EEE', { locale: lt })}</div>
                <div className="text-[9px] font-bold">{format(d, 'd')}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-stone-100">
          {(showCars ? cars : drivers).map(item => {
            const driver = !showCars ? item as Driver : null;
            const car    = showCars  ? item as Car    : null;

            const bars: { start: number; end: number; type: 'active' | 'planned'; label: string }[] = [];

            if (driver) {
              carAssignments.filter(a => a.driverId === driver.id).forEach(a => {
                const s = parseISO(a.startDate);
                const e = a.endDate ? parseISO(a.endDate) : (driver.plannedReturnDate ? parseISO(driver.plannedReturnDate) : monthEnd);
                if (!isAfter(s, monthEnd) && !isBefore(e, monthStart)) {
                  const si = isBefore(s, monthStart) ? 0 : differenceInDays(s, monthStart);
                  const ei = isAfter(e, monthEnd) ? totalDays - 1 : differenceInDays(e, monthStart);
                  if (ei >= si) bars.push({ start: si, end: ei, type: 'active', label: `${a.carNumber} (${a.startDate})` });
                }
              });
              plans.filter(p => p.status === 'Suplanuota' && p.incomingDriverId === driver.id).forEach(p => {
                const s = parseISO(p.date);
                const e = p.newPlannedReturnDate ? parseISO(p.newPlannedReturnDate) : addDays(s, 42);
                if (!isAfter(s, monthEnd) && !isBefore(e, monthStart)) {
                  const si = isBefore(s, monthStart) ? 0 : differenceInDays(s, monthStart);
                  const ei = isAfter(e, monthEnd) ? totalDays - 1 : differenceInDays(e, monthStart);
                  if (ei >= si) bars.push({ start: si, end: ei, type: 'planned', label: `Planas: ${p.carNumber}` });
                }
              });
            }

            if (car) {
              carAssignments.filter(a => a.carNumber === car.number).forEach(a => {
                const s = parseISO(a.startDate);
                const e = a.endDate ? parseISO(a.endDate) : monthEnd;
                if (!isAfter(s, monthEnd) && !isBefore(e, monthStart)) {
                  const si = isBefore(s, monthStart) ? 0 : differenceInDays(s, monthStart);
                  const ei = isAfter(e, monthEnd) ? totalDays - 1 : differenceInDays(e, monthStart);
                  if (ei >= si) bars.push({ start: si, end: ei, type: 'active', label: a.driverName });
                }
              });
              plans.filter(p => p.status === 'Suplanuota' && p.carNumber === car.number).forEach(p => {
                const s = parseISO(p.date);
                const e = p.newPlannedReturnDate ? parseISO(p.newPlannedReturnDate) : addDays(s, 42);
                if (!isAfter(s, monthEnd) && !isBefore(e, monthStart)) {
                  const si = isBefore(s, monthStart) ? 0 : differenceInDays(s, monthStart);
                  const ei = isAfter(e, monthEnd) ? totalDays - 1 : differenceInDays(e, monthStart);
                  if (ei >= si) bars.push({ start: si, end: ei, type: 'planned', label: p.incomingDriverName });
                }
              });
            }

            const d = driver;
            const c = car;

            return (
              <div key={(d || c)!.id} className="flex group hover:bg-stone-50 transition-colors h-12">
                <div className="w-48 shrink-0 px-4 flex items-center gap-2 border-r border-stone-100">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", d ? (d.status === 'Reise' ? 'bg-blue-500' : 'bg-emerald-500') : 'bg-violet-500')} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{d ? d.name : c!.number}</p>
                    <p className="text-[9px] text-stone-400 truncate">{d ? (d.currentCar !== 'Nėra' ? d.currentCar : 'Namuose') : `${c!.type} • ${c!.registration}`}</p>
                  </div>
                </div>
                <div className="flex-1 relative">
                  {days.map((day, i) => (
                    <div key={i} className={cn("absolute top-0 bottom-0 border-r border-stone-100", isSameDay(day, new Date()) && "bg-blue-50/50")} style={{ left: `${(i / totalDays) * 100}%`, width: `${(1 / totalDays) * 100}%` }} />
                  ))}
                  {bars.map((bar, idx) => (
                    <div key={idx} className={cn("absolute top-2 bottom-2 rounded-lg flex items-center px-2 overflow-hidden text-white text-[9px] font-bold", bar.type === 'active' ? 'bg-blue-500' : 'bg-emerald-400 border border-dashed border-emerald-600')}
                      style={{ left: `${(bar.start / totalDays) * 100}%`, width: `${((bar.end - bar.start + 1) / totalDays) * 100}%` }}
                      title={bar.label}
                    >
                      <span className="truncate">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

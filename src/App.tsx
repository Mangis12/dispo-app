import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Users, Truck, Home, Calendar, Plus, ArrowRightLeft, ArrowRight,
  AlertCircle, UserPlus, LogOut, LogIn, X, Edit, History,
  CheckCircle2, User, Trash2, ChevronLeft, ChevronRight,
  LayoutDashboard, Database, Wifi, WifiOff, Bell, Map as MapIcon, MapPin, Menu, Search, Mail, Undo2, StickyNote,
  List, LayoutGrid, Columns3, Download, Phone, Snowflake, Container,
  Upload, FileSpreadsheet, ShieldCheck, ShieldAlert, Contact, CreditCard, FileCheck2,
  ClipboardList, GripVertical, Check, Lock, UserCog,
  UserX, UserMinus, RotateCcw, ChevronDown, Ban
} from 'lucide-react';
import {
  format, differenceInDays, parseISO, isBefore, isAfter,
  addDays, subDays, addWeeks, isValid, startOfWeek, endOfWeek, getWeek,
  isSameWeek, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, addMonths, subMonths, isSameMonth, getDaysInMonth
} from 'date-fns';
import { lt, ru } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase, isSupabaseEnabled } from './lib/supabase';
import { loadAll, syncCollection, subscribeAll, type AllData } from './lib/repo';
import TripPlanner from './components/TripPlanner';
import CoordinatorBoard from './components/CoordinatorBoard';
import { EmptyRoad, EmptyChecklist, SemiTruck, EuropeMap } from './components/illustrations';
import { parseDriverWorkbook, mergeIntoDriver, buildDriverIndex, findExisting, buildDriverTemplate, type ParsedDriver } from './lib/importDrivers';
import { parseCarWorkbook, mergeIntoCar, buildCarIndex, findExistingCar, buildCarTemplate, type ParsedCar } from './lib/importCars';
import { useLang, useT, useDateLocale, type Lang } from './lib/i18n';
import { useRole, ROLE_LABELS, type Role } from './lib/roles';
import type {
  Driver, DriverStatus, HomeStatus, Car, HistoryEntry,
  ReplacementPlan, RegistrationType, DriverSpecialization, CarType, CarAssignment, TaskPoint, CalendarNote
} from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Dokumento galiojimo būsena pagal datą (ISO). soon = ≤60 d. iki pabaigos.
type DocState = 'none' | 'ok' | 'soon' | 'expired';
function docState(iso?: string): { state: DocState; days: number | null } {
  if (!iso) return { state: 'none', days: null };
  const d = parseISO(iso);
  if (!isValid(d)) return { state: 'none', days: null };
  const days = differenceInDays(d, new Date());
  if (days < 0) return { state: 'expired', days };
  if (days <= 60) return { state: 'soon', days };
  return { state: 'ok', days };
}
const DOC_FIELDS: { key: keyof NonNullable<Driver['docs']>; label: string }[] = [
  { key: 'passportExpiry', label: 'Pasas' },
  { key: 'licenseExpiry',  label: 'Teisės' },
  { key: 'code95Expiry',   label: '95 kodas' },
  { key: 'tachoCardExpiry',label: 'Tacho kortelė' },
  { key: 'adrExpiry',      label: 'ADR' },
  { key: 'llglExpiry',     label: 'LLGL' },
  { key: 'visaExpiry',     label: 'Viza' },
  { key: 'pinkSheetExpiry',label: 'Rožinis lapas' },
];
// Blogiausia vairuotojo dokumentų būsena (perspėjimui sąraše).
function worstDocState(d: Driver): DocState {
  if (!d.docs) return 'none';
  let worst: DocState = 'none';
  const rank: Record<DocState, number> = { none: 0, ok: 1, soon: 2, expired: 3 };
  DOC_FIELDS.forEach(f => {
    const s = docState(d.docs![f.key] as string | undefined).state;
    if (rank[s] > rank[worst]) worst = s;
  });
  return worst;
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

type Tab = 'dashboard' | 'planning' | 'drivers' | 'cars' | 'history' | 'calendar' | 'auto-grafikas' | 'trip' | 'coordinator' | 'draft';

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, onClick, art }: { label: string; value: number | string; sub?: string; accent?: string; onClick?: () => void; art?: React.ReactNode }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "group/stat relative overflow-hidden text-left rounded-2xl p-6 bg-surface border border-hairline shadow-card transition-all",
        onClick && "hover:border-ink/25 hover:-translate-y-0.5 cursor-pointer"
      )}
    >
      {/* Teminė line-art detalė kampe */}
      {art && (
        <div className="absolute -right-3 -bottom-3 text-ink/[0.06] group-hover/stat:text-gold/25 transition-colors duration-300 pointer-events-none">
          {art}
        </div>
      )}
      <div className="relative flex items-center gap-2 mb-3">
        <span className={cn("w-1.5 h-1.5 rounded-full", accent ?? "bg-stone-300")} />
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      </div>
      <p className="relative text-[2.25rem] leading-none font-display font-medium tracking-tight text-ink">{value}</p>
      {sub && <p className="relative text-xs text-muted mt-2.5">{sub}</p>}
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

// ─── Tik stebėjimo juosta (kai vartotojas neturi redagavimo teisių) ───────────
function ReadOnlyNotice({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
      <Lock size={14} className="shrink-0" />
      <span>{text}</span>
    </div>
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

const inputCls = "w-full bg-canvas border border-hairline rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:outline-none focus:bg-surface focus:border-ink/40 transition-all";
const selectCls = "w-full bg-canvas border border-hairline rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:bg-surface focus:border-ink/40 transition-all appearance-none";

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap",
        active ? "bg-ink text-white ring-1 ring-gold/40 shadow-card" : "text-muted hover:text-ink hover:bg-hairline/50"
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

// ─── Sidebar nav ──────────────────────────────────────────────────────────────
function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70">{label}</p>
      {children}
    </div>
  );
}

function NavItem({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-xl text-sm font-medium transition-all",
        active ? "bg-ink/[0.055] text-ink" : "text-muted hover:text-ink hover:bg-ink/[0.03]"
      )}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-gold" />}
      <span className={cn("shrink-0 transition-colors", active ? "text-gold" : "text-muted group-hover:text-ink")}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge != null && badge > 0 && (
        <span className="text-[10px] font-semibold text-white bg-gold rounded-full px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { lang, setLang } = useLang();
  const t = useT();
  const dfLocale = lang === 'ru' ? ru : lt;
  const { role, canEdit, canCoordinate, isAdmin, kurejasUnlocked, unlockKurejas, lockKurejas } = useRole();
  const [drivers, setDrivers]           = useState<Driver[]>([]);
  const [cars, setCars]                 = useState<Car[]>([]);
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [plans, setPlans]               = useState<ReplacementPlan[]>([]);
  const [carAssignments, setCarAssignments] = useState<CarAssignment[]>([]);
  const [taskPoints, setTaskPoints]     = useState<TaskPoint[]>([]);
  const [calendarNotes, setCalendarNotes] = useState<CalendarNote[]>([]);
  const [loaded, setLoaded]             = useState(false);
  // Paskutinė su saugykla suderinta būsena — naudojama syncCollection diff'ui.
  const prevSnap = useRef<AllData>({ drivers: [], cars: [], history: [], plans: [], carAssignments: [], taskPoints: [], calendarNotes: [] });

  const [activeTab, setActiveTab]       = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen]   = useState(false);
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
  const [dismissOpen, setDismissOpen]                       = useState(false);
  const [selectedDriverForDismiss, setSelectedDriverForDismiss] = useState<Driver | null>(null);
  const [showDismissed, setShowDismissed]                   = useState(false);
  const [showUnneeded, setShowUnneeded]                     = useState(false);
  const [homeSearch, setHomeSearch]                         = useState('');
  const [homeExpanded, setHomeExpanded]                     = useState<Record<string, boolean>>({});
  const [selectedCarForEdit, setSelectedCarForEdit]         = useState<Car | null>(null);
  const [editAssignment, setEditAssignment]                 = useState<CarAssignment | null>(null);
  const [planGroup, setPlanGroup]                           = useState<'all' | CarType>('all');
  const [planWeek, setPlanWeek]                             = useState<'all' | 'this' | 'next'>('all');
  const [emailGroup, setEmailGroup]                         = useState<CarType | null>(null);
  const [emailTo, setEmailTo]                               = useState('');
  const [emailWeeks, setEmailWeeks]                         = useState<1 | 2>(2);

  // Planning
  const [selectedTripDriverId, setSelectedTripDriverId] = useState('');
  const [targetReplaceDate, setTargetReplaceDate]       = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedHomeDriverId, setSelectedHomeDriverId] = useState('');
  const [targetWorkDate, setTargetWorkDate]             = useState(format(new Date(), 'yyyy-MM-dd'));

  // Vairuotojų „duomenų bazė": vaizdas, profilio drawer, pažymėjimai
  const [driverView, setDriverView]           = useState<'table' | 'kanban' | 'cards'>('table');
  const [profileDriver, setProfileDriver]     = useState<Driver | null>(null);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  // Excel importas
  const [importOpen, setImportOpen]           = useState(false);
  const [importRows, setImportRows]           = useState<ParsedDriver[]>([]);
  const [importMeta, setImportMeta]           = useState<{ fileName: string; cols: string[] } | null>(null);
  const [importErr, setImportErr]             = useState<string | null>(null);
  const [carImportOpen, setCarImportOpen]     = useState(false);
  const [carImportRows, setCarImportRows]     = useState<ParsedCar[]>([]);
  const [carImportMeta, setCarImportMeta]     = useState<{ fileName: string } | null>(null);
  const [carImportErr, setCarImportErr]       = useState<string | null>(null);
  // Keitimo juodraštis: laikinas keitimų rinkinys (carNumber → incoming vairuotojas)
  const [drafts, setDrafts] = useState<{ carNumber: string; incomingDriverId: string; date: string }[]>([]);
  // Rolių administravimo langas (tik pilnų teisių vartotojui)
  const [roleAdminOpen, setRoleAdminOpen] = useState(false);
  const [kurejasCodeOpen, setKurejasCodeOpen] = useState(false);
  // Bendras patvirtinimo langas (taip/ne prieš įvykdant veiksmą)
  const [confirmAsk, setConfirmAsk] = useState<{ title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void } | null>(null);
  const askConfirm = (opts: { title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void }) => setConfirmAsk(opts);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null); // carNumber arba 'pool'
  // Automobilių „duomenų bazė"
  const [carView, setCarView]                 = useState<'table' | 'kanban' | 'cards'>('cards');
  const [profileCar, setProfileCar]           = useState<Car | null>(null);
  const [selectedCarIds, setSelectedCarIds]   = useState<string[]>([]);

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
        const data = await loadAll({ drivers: INITIAL_DRIVERS, cars: INITIAL_CARS, history: [], plans: [], carAssignments: [], taskPoints: [], calendarNotes: [] });
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
        prevSnap.current = { drivers: data.drivers, cars: data.cars, history: data.history, plans: data.plans, carAssignments: data.carAssignments, taskPoints: data.taskPoints, calendarNotes: data.calendarNotes };
        setDrivers(data.drivers);
        setCars(data.cars);
        setHistory(data.history);
        setPlans(dedupPlans);
        setCarAssignments(assignments);
        setTaskPoints(data.taskPoints);
        setCalendarNotes(data.calendarNotes);
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
          await syncCollection('taskPoints', prevSnap.current.taskPoints, taskPoints);
          await syncCollection('calendarNotes', prevSnap.current.calendarNotes, calendarNotes);
          prevSnap.current = { drivers, cars, history, plans, carAssignments, taskPoints, calendarNotes };
        } catch (e) {
          setToast({ message: e instanceof Error ? e.message : 'Sinchronizacijos klaida', type: 'error' });
        }
      })();
    }, 400);
    return () => clearTimeout(id);
  }, [drivers, cars, history, plans, carAssignments, taskPoints, calendarNotes, loaded]);

  // ── Realaus laiko prenumerata (kitų vartotojų pakeitimai) ────────────────────
  useEffect(() => {
    if (!loaded) return;
    return subscribeAll({
      drivers:        (rows) => { prevSnap.current.drivers = rows;        setDrivers(rows); },
      cars:           (rows) => { prevSnap.current.cars = rows;           setCars(rows); },
      history:        (rows) => { prevSnap.current.history = rows;        setHistory(rows); },
      plans:          (rows) => { prevSnap.current.plans = rows;          setPlans(rows); },
      carAssignments: (rows) => { prevSnap.current.carAssignments = rows; setCarAssignments(rows); },
      taskPoints:     (rows) => { prevSnap.current.taskPoints = rows;     setTaskPoints(rows); },
      calendarNotes:  (rows) => { prevSnap.current.calendarNotes = rows;  setCalendarNotes(rows); },
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
  // Teisių sargai: pilnam redagavimui ir koordinavimui. Grąžina true, jei leista.
  const guardEdit = () => { if (!canEdit) { showToast(t('Neturite teisių atlikti šį veiksmą'), 'error'); return false; } return true; };
  const guardCoord = () => { if (!canCoordinate) { showToast(t('Neturite teisių atlikti šį veiksmą'), 'error'); return false; } return true; };
  // Rolės priskyrimas pagal el. paštą (per Supabase RPC; serveris tikrina teises).
  const assignRole = async (email: string, newRole: Role) => {
    if (!supabase) return;
    const { error } = await supabase.rpc('set_user_role', { p_email: email.trim(), p_role: newRole });
    if (error) { showToast(error.message, 'error'); return; }
    showToast(t('Rolė priskirta'));
    setRoleAdminOpen(false);
  };

  // ── Driver Actions ────────────────────────────────────────────────────────────
  const addDriver = (d: Omit<Driver, 'id'>) => {
    if (!guardEdit()) return;
    const driver = { ...d, id: uid() };
    setDrivers(prev => [...prev, driver]);
    logHistory(driver.id, driver.name, 'Pridėtas vairuotojas', 'Naujas vairuotojas įtrauktas');
    setAddDriverOpen(false);
    showToast(`${driver.name} pridėtas`);
  };

  const updateDriver = (id: string, updates: Partial<Driver>) => {
    if (!guardEdit()) return;
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

  // „Nereikalingas" žymė: vairuotojas nesiūlomas keitimuose, bet lieka matomas
  // atskiroje planavimo zonoje (blogiausiam atvejui).
  const toggleUnneeded = (d: Driver) => {
    if (!guardEdit()) return;
    const val = !d.unneeded;
    setDrivers(prev => prev.map(x => x.id === d.id ? { ...x, unneeded: val } : x));
    logHistory(d.id, d.name, val ? 'Pažymėtas nereikalingu' : 'Grąžintas į aktyvius', val ? 'Nesiūlomas keitimuose' : 'Vėl siūlomas keitimuose');
    showToast(val ? `${d.name} — ${t('nereikalingas')}` : `${d.name} — ${t('aktyvus')}`);
  };

  // Atleidimas: vairuotojas perkeliamas į „Atleisti" skiltį, nuimamas nuo mašinos.
  const dismissDriver = (id: string, date: string) => {
    if (!guardEdit()) return;
    const d = drivers.find(x => x.id === id);
    if (!d) return;
    // Uždarom atvirus priskyrimus atleidimo data.
    setCarAssignments(prev => prev.map(a => a.driverId === id && a.endDate === null ? { ...a, endDate: date } : a));
    setDrivers(prev => prev.map(x => x.id === id ? {
      ...x, dismissedDate: date, unneeded: false,
      status: 'Namuose', currentCar: 'Nėra', startDate: null, plannedReturnDate: null,
    } : x));
    logHistory(d.id, d.name, 'Atleistas', `Atleistas nuo ${date}`, undefined, date);
    showToast(`${d.name} — ${t('atleistas')}`);
    setDismissOpen(false); setSelectedDriverForDismiss(null);
  };

  // Grąžinimas iš atleistųjų į aktyvius (namuose).
  const reinstateDriver = (d: Driver) => {
    if (!guardEdit()) return;
    setDrivers(prev => prev.map(x => x.id === d.id ? {
      ...x, dismissedDate: null, status: 'Namuose', homeStatus: 'Poilsis',
      readinessDate: x.readinessDate || format(new Date(), 'yyyy-MM-dd'),
    } : x));
    logHistory(d.id, d.name, 'Grąžintas', 'Grąžintas iš atleistųjų į aktyvius');
    showToast(`${d.name} — ${t('grąžintas')}`);
  };

  // Dokumentų datų / tapatybės redagavimas rankiniu būdu (atnaujinus dokumentą).
  const saveDriverDocs = (id: string, docs: Driver['docs'], extra: { email?: string; tabNr?: string }) => {
    if (!guardEdit()) return;
    const d = drivers.find(x => x.id === id);
    setDrivers(prev => prev.map(x => x.id === id ? { ...x, docs, email: extra.email ?? x.email, tabNr: extra.tabNr ?? x.tabNr } : x));
    if (d) logHistory(d.id, d.name, 'Atnaujinti dokumentai', 'Pakeistos dokumentų datos');
    showToast(t('Dokumentai atnaujinti'));
  };

  // ── Excel importas ──────────────────────────────────────────────────────────
  const downloadTemplate = (company: 'LT' | 'PL') => {
    const blob = buildDriverTemplate(company);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vairuotoju_sablonas_${company}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    setImportErr(null);
    try {
      const buf = await file.arrayBuffer();
      const { rows, headerMap } = parseDriverWorkbook(buf);
      if (rows.length === 0) {
        setImportErr('Faile nerasta vairuotojų eilučių. Patikrinkite, ar yra stulpeliai „Pavardė" ir „Vardas".');
        setImportRows([]); setImportMeta(null);
        return;
      }
      setImportRows(rows);
      setImportMeta({ fileName: file.name, cols: Object.values(headerMap).filter(Boolean) });
    } catch (e) {
      setImportErr('Nepavyko nuskaityti failo. Tinka .xlsx, .xls arba .csv.');
      setImportRows([]); setImportMeta(null);
    }
  };

  // Suderinimo statistika: kiek naujų / kiek atnaujinamų.
  const importDiff = useMemo(() => {
    const index = buildDriverIndex(drivers);
    let updated = 0, created = 0;
    importRows.forEach(p => { if (findExisting(index, p)) updated++; else created++; });
    return { updated, created };
  }, [importRows, drivers]);

  const applyImport = () => {
    if (!guardEdit()) return;
    setDrivers(prev => {
      const next = [...prev];
      const index = buildDriverIndex(next);
      importRows.forEach(p => {
        const existing = findExisting(index, p);
        if (existing) {
          const merged = mergeIntoDriver(existing, p);
          const idx = next.findIndex(d => d.id === existing.id);
          if (idx >= 0) next[idx] = merged;
        } else {
          const created = { ...mergeIntoDriver(undefined, p), id: uid() };
          next.push(created);
          // Naujas vairuotojas papildo indeksą, kad to paties failo dublikatai susilietų.
          const k = buildDriverIndex([created]);
          k.byPc.forEach((v, key) => index.byPc.set(key, v));
          k.byTab.forEach((v, key) => index.byTab.set(key, v));
          k.byNm.forEach((v, key) => index.byNm.set(key, v));
        }
      });
      return next;
    });
    showToast(`Importuota: ${importDiff.created} nauji, ${importDiff.updated} atnaujinti`);
    setImportOpen(false);
    setImportRows([]); setImportMeta(null); setImportErr(null);
  };

  const deleteDriver = (id: string) => {
    if (!guardEdit()) return;
    const d = drivers.find(x => x.id === id);
    if (!d) return;
    setPlans(prev => prev.filter(p => p.incomingDriverId !== id && p.leavingDriverId !== id));
    setDrivers(prev => prev.filter(x => x.id !== id));
    logHistory(id, d.name, 'Ištrintas vairuotojas', 'Pašalintas iš sistemos');
    showToast(`${d.name} pašalintas`);
  };

  const sendHome = (id: string, homeStatus: HomeStatus, readinessDate: string) => {
    if (!guardEdit()) return;
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
    if (!guardEdit()) return;
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
    if (!guardEdit()) return;
    setCars(prev => [...prev, { ...c, id: uid() }]);
    setAddCarOpen(false);
    showToast(`Automobilis ${c.number} pridėtas`);
  };

  const updateCar = (id: string, updates: Partial<Car>) => {
    if (!guardEdit()) return;
    setCars(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    setEditCarOpen(false); setSelectedCarForEdit(null);
    showToast('Automobilis atnaujintas');
  };

  // ── Automobilių Excel importas ──────────────────────────────────────────────
  const downloadCarTemplate = () => {
    const url = URL.createObjectURL(buildCarTemplate());
    const a = document.createElement('a');
    a.href = url; a.download = 'automobiliu_sablonas.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCarImportFile = async (file: File) => {
    setCarImportErr(null);
    try {
      const { rows } = parseCarWorkbook(await file.arrayBuffer());
      if (rows.length === 0) {
        setCarImportErr('Faile nerasta automobilių. Patikrinkite stulpelį „Mašinos nr".');
        setCarImportRows([]); setCarImportMeta(null);
        return;
      }
      setCarImportRows(rows);
      setCarImportMeta({ fileName: file.name });
    } catch {
      setCarImportErr('Nepavyko nuskaityti failo. Tinka .xlsx, .xls arba .csv.');
      setCarImportRows([]); setCarImportMeta(null);
    }
  };

  const carImportDiff = useMemo(() => {
    const index = buildCarIndex(cars);
    let updated = 0, created = 0;
    carImportRows.forEach(p => { if (findExistingCar(index, p)) updated++; else created++; });
    return { updated, created };
  }, [carImportRows, cars]);

  const applyCarImport = () => {
    if (!guardEdit()) return;
    setCars(prev => {
      const next = [...prev];
      const index = buildCarIndex(next);
      carImportRows.forEach(p => {
        const existing = findExistingCar(index, p);
        if (existing) {
          const idx = next.findIndex(c => c.id === existing.id);
          if (idx >= 0) next[idx] = mergeIntoCar(existing, p);
        } else {
          const created = { ...mergeIntoCar(undefined, p), id: uid() };
          next.push(created);
          index.set(created.number.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ''), created);
        }
      });
      return next;
    });
    showToast(`Importuota: ${carImportDiff.created} nauji, ${carImportDiff.updated} atnaujinti`);
    setCarImportOpen(false);
    setCarImportRows([]); setCarImportMeta(null); setCarImportErr(null);
  };

  const deleteCar = (id: string) => {
    if (!guardEdit()) return;
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
    if (!guardEdit()) return;
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
    if (!guardEdit()) return;
    setPlans(prev => prev.filter(p => p.id !== planId));
    showToast('Planas atšauktas');
  };

  // ── Keitimo juodraštis ──────────────────────────────────────────────────────
  // Priskiria vairuotoją mašinai (vienas vairuotojas — vienoje vietoje;
  // viena mašina — vienas keitimas). Galima tempti tarp mašinų.
  const assignDraft = (carNumber: string, incomingDriverId: string) => {
    if (!guardEdit()) return;
    setDrafts(prev => {
      // pašalinam vairuotoją iš kitur ir mašiną iš kitur, tada pridedam
      const cleaned = prev.filter(d => d.incomingDriverId !== incomingDriverId && d.carNumber !== carNumber);
      const existingDate = prev.find(d => d.carNumber === carNumber)?.date;
      return [...cleaned, { carNumber, incomingDriverId, date: existingDate || format(new Date(), 'yyyy-MM-dd') }];
    });
  };
  const removeDraft = (carNumber: string) => setDrafts(prev => prev.filter(d => d.carNumber !== carNumber));
  const setDraftDate = (carNumber: string, date: string) => setDrafts(prev => prev.map(d => d.carNumber === carNumber ? { ...d, date } : d));
  const clearDrafts = () => setDrafts([]);
  const confirmDrafts = () => {
    if (!guardEdit()) return;
    if (drafts.length === 0) return;
    drafts.forEach(d => {
      const leaving = drivers.find(dr => dr.currentCar === d.carNumber && dr.status === 'Reise');
      createPlan(d.carNumber, leaving?.id ?? null, d.incomingDriverId, d.date);
    });
    const n = drafts.length;
    setDrafts([]);
    showToast(`${t('Keitimai suplanuoti')}: ${n}`);
    setActiveTab('planning');
  };

  const completePlan = (planId: string, execReturnDate?: string, actualDate?: string) => {
    if (!guardEdit()) return;
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

  // ── Atšaukti įvykdytą pakeitimą (klaidos taisymas) — completePlan inversija ──
  const undoCompletion = (planId: string) => {
    if (!guardEdit()) return;
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const execDate = plan.date;
    // Planas vėl tampa suplanuotu
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, status: 'Suplanuota' } : p));
    // Atstatom vairuotojus: įvykdęs (incoming) grįžta namo; ankstesnis (leaving) — atgal į reisą
    setDrivers(prev => prev.map(d => {
      if (d.id === plan.incomingDriverId)
        return { ...d, status: 'Namuose', currentCar: 'Nėra', startDate: null, plannedReturnDate: null, homeStatus: 'Poilsis', readinessDate: execDate };
      if (plan.leavingDriverId && plan.leavingDriverId !== 'NONE' && d.id === plan.leavingDriverId)
        return { ...d, status: 'Reise', currentCar: plan.carNumber, plannedReturnDate: execDate, homeStatus: 'Nėra', readinessDate: null, lastTripEndDate: null };
      return d;
    }));
    // Atstatom priskyrimus: pašalinam incoming atvirą segmentą; leaving segmentą vėl atidarom
    setCarAssignments(prev => {
      const withoutIncoming = prev.filter(a => !(a.carNumber === plan.carNumber && a.driverId === plan.incomingDriverId && a.startDate === execDate && a.endDate === null));
      return withoutIncoming.map(a => (a.carNumber === plan.carNumber && a.driverId === plan.leavingDriverId && a.endDate === execDate) ? { ...a, endDate: null } : a);
    });
    logHistory(plan.incomingDriverId, plan.incomingDriverName, 'Pakeitimas atšauktas', `Auto: ${plan.carNumber} — įvykdymas anuliuotas`, plan.carNumber, execDate);
    showToast(`Įvykdymas atšauktas: ${plan.carNumber}`);
  };

  // ── Priskyrimo (grafiko segmento) redagavimas / trynimas ──
  const updateAssignment = (id: string, updates: Partial<CarAssignment>) => {
    setCarAssignments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    showToast('Priskyrimas atnaujintas');
  };
  const deleteAssignment = (id: string) => {
    const a = carAssignments.find(x => x.id === id);
    setCarAssignments(prev => prev.filter(x => x.id !== id));
    if (a) logHistory(a.driverId, a.driverName, 'Priskyrimas ištrintas', `Auto: ${a.carNumber} (${a.startDate}–${a.endDate || 'dabar'})`, a.carNumber, a.startDate);
    showToast('Priskyrimas ištrintas');
  };

  // ── Grafiko „drag": priskyrimo (kadencijos) juostos pastūmimas dienomis ──
  const shiftISO = (d: string, days: number) => format(addDays(parseISO(d), days), 'yyyy-MM-dd');
  const moveAssignment = (a: CarAssignment, deltaDays: number) => {
    if (!guardEdit()) return;
    if (!deltaDays) return;
    setCarAssignments(prev => prev.map(x => x.id === a.id
      ? { ...x, startDate: shiftISO(x.startDate, deltaDays), endDate: x.endDate ? shiftISO(x.endDate, deltaDays) : null }
      : x));
    // Atviram reisui pastumiam ir vairuotojo datas (pradžia + numatoma grįžimo data).
    if (a.endDate == null) {
      setDrivers(prev => prev.map(d => d.id === a.driverId
        ? { ...d, startDate: d.startDate ? shiftISO(d.startDate, deltaDays) : d.startDate, plannedReturnDate: d.plannedReturnDate ? shiftISO(d.plannedReturnDate, deltaDays) : d.plannedReturnDate }
        : d));
    }
    logHistory(a.driverId, a.driverName, 'Grafikas pakoreguotas', `Auto: ${a.carNumber} pastumta ${deltaDays > 0 ? '+' : ''}${deltaDays} d.`, a.carNumber, shiftISO(a.startDate, deltaDays));
    showToast(`${a.carNumber}: pastumta ${deltaDays > 0 ? '+' : ''}${deltaDays} d.`);
  };

  // ── Grafiko „drag": juostos krašto tempimas (pradžia ARBA pabaiga atskirai) ──
  const resizeAssignment = (a: CarAssignment, edge: 'start' | 'end', deltaDays: number) => {
    if (!guardEdit()) return;
    if (!deltaDays) return;
    if (edge === 'start') {
      const ns = shiftISO(a.startDate, deltaDays);
      if (a.endDate && !isBefore(parseISO(ns), parseISO(a.endDate))) return; // pradžia < pabaiga
      setCarAssignments(prev => prev.map(x => x.id === a.id ? { ...x, startDate: ns } : x));
      if (a.endDate == null) setDrivers(prev => prev.map(d => d.id === a.driverId ? { ...d, startDate: ns } : d));
      logHistory(a.driverId, a.driverName, 'Grafikas pakoreguotas', `Auto: ${a.carNumber} pradžia → ${ns}`, a.carNumber, ns);
      showToast(`${a.carNumber}: pradžia ${ns}`);
    } else {
      if (a.endDate) {
        const ne = shiftISO(a.endDate, deltaDays);
        if (!isAfter(parseISO(ne), parseISO(a.startDate))) return; // pabaiga > pradžia
        setCarAssignments(prev => prev.map(x => x.id === a.id ? { ...x, endDate: ne } : x));
        showToast(`${a.carNumber}: pabaiga ${ne}`);
      } else {
        // Atviras reisas: pabaigą lemia numatoma grįžimo data (plannedReturnDate).
        const drv = drivers.find(d => d.id === a.driverId);
        if (!drv?.plannedReturnDate) return;
        const ne = shiftISO(drv.plannedReturnDate, deltaDays);
        if (!isAfter(parseISO(ne), parseISO(a.startDate))) return;
        setDrivers(prev => prev.map(d => d.id === a.driverId ? { ...d, plannedReturnDate: ne } : d));
        showToast(`${a.carNumber}: grįžimas → ${ne}`);
      }
    }
  };

  // ── Grafiko „drag": planuojamo keitimo data (horizontaliai) ──
  const movePlanDate = (planId: string, deltaDays: number) => {
    if (!guardEdit()) return;
    if (!deltaDays) return;
    const p = plans.find(x => x.id === planId); if (!p) return;
    setPlans(prev => prev.map(x => x.id === planId ? { ...x, date: shiftISO(x.date, deltaDays) } : x));
    showToast(`Planas ${p.carNumber}: data ${deltaDays > 0 ? '+' : ''}${deltaDays} d.`);
  };

  // ── Grafiko „drag": planuojamo keitimo perkėlimas ant kitos mašinos ──
  const movePlanToCar = (planId: string, newCar: string) => {
    if (!guardEdit()) return;
    const p = plans.find(x => x.id === planId); if (!p || p.carNumber === newCar) return;
    if (!cars.some(c => c.number === newCar)) return;
    // Naujos mašinos dabartinis (atviras) vairuotojas tampa „išeinančiu".
    const open = carAssignments.filter(x => x.carNumber === newCar && x.endDate == null);
    const cur = open.length ? open.reduce((a, b) => (b.startDate >= a.startDate ? b : a)) : null;
    setPlans(prev => prev.map(x => x.id === planId
      ? { ...x, carNumber: newCar, leavingDriverId: cur?.driverId ?? 'NONE', leavingDriverName: cur?.driverName ?? '—' }
      : x));
    logHistory(p.incomingDriverId, p.incomingDriverName, 'Planas perkeltas', `${p.carNumber} → ${newCar}`, newCar, p.date);
    showToast(`Planas perkeltas: ${p.carNumber} → ${newCar}`);
  };

  // ── Koordinatorius: keitimo taško nustatymas / valymas plane ──
  const setPlanChangePoint = (planId: string, lat: number, lng: number, location: string) => {
    if (!guardCoord()) return;
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, changeLat: lat, changeLng: lng, changeLocation: location } : p));
    const p = plans.find(x => x.id === planId);
    if (p) showToast(`Keitimo taškas: ${p.carNumber} → ${location}`);
  };
  const clearPlanChangePoint = (planId: string) => {
    if (!guardCoord()) return;
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, changeLat: null, changeLng: null, changeLocation: null, changeTask: null } : p));
    showToast('Keitimo taškas pašalintas');
  };
  // Dviguba užduotis ant keitimo taško (keitimas + ką nuvežti) — eina į Kelionę kartu.
  const setPlanChangeTask = (planId: string, task: string) => {
    if (!guardCoord()) return;
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, changeTask: task || null } : p));
  };

  // ── Kalendoriaus pastabos (viena diena = viena pastaba) ──
  const setDayNote = (date: string, text: string) => {
    if (!guardEdit()) return;
    setCalendarNotes(prev => {
      const exists = prev.find(n => n.date === date);
      if (!text.trim()) return prev.filter(n => n.date !== date);
      if (exists) return prev.map(n => n.date === date ? { ...n, text } : n);
      return [...prev, { id: `note-${date}`, date, text }];
    });
  };

  // ── Koordinatoriaus papildomos užduotys (task points) ──
  const addTaskPoint = (t: Omit<TaskPoint, 'id'>) => {
    if (!guardCoord()) return '';
    const id = uid();
    setTaskPoints(prev => [...prev, { ...t, id }]);
    showToast(t.saved ? `Užduotis išsaugota: ${t.title || t.location}` : `Užduotis pridėta: ${t.title || t.location}`);
    return id;
  };
  const updateTaskPoint = (id: string, updates: Partial<TaskPoint>) => {
    if (!guardCoord()) return;
    setTaskPoints(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  const deleteTaskPoint = (id: string) => {
    if (!guardCoord()) return;
    setTaskPoints(prev => prev.filter(t => t.id !== id));
    showToast('Užduotis pašalinta');
  };
  // Iš išsaugoto šablono sukuriam aktyvią (siunčiamą į Kelionę) užduotį.
  const activateSavedTask = (tpl: TaskPoint) => {
    if (!guardCoord()) return;
    addTaskPoint({ title: tpl.title, description: tpl.description, lat: tpl.lat, lng: tpl.lng, location: tpl.location, saved: false, active: true });
  };

  // ── Vairuotojų bazė: CSV eksportas ir el. paštas (mailto) ──
  const driverReturnOrReady = (d: Driver) => d.status === 'Reise' ? (d.plannedReturnDate || '') : (d.readinessDate || '');
  const exportDriversCSV = (list: Driver[]) => {
    if (!list.length) { showToast('Nėra ką eksportuoti', 'error'); return; }
    const head = ['Vardas', 'Telefonas', 'Įmonė', 'Specializacija', 'Būsena', 'Auto', 'Grįžta/Gali'];
    const rows = list.map(d => [d.name, d.phone, d.companyType, d.specialization, d.status, d.currentCar, driverReturnOrReady(d)]);
    const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `vairuotojai_${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast(`Eksportuota: ${list.length} vairuotojų`);
  };
  const emailDrivers = (list: Driver[]) => {
    if (!list.length) { showToast('Pažymėkite vairuotojų', 'error'); return; }
    const lines = list.map(d => `• ${d.name} (${d.companyType}·${d.specialization}) — ${d.status}${d.status === 'Reise' ? ` · ${d.currentCar} · grįžta ${d.plannedReturnDate || '?'}` : ` · laisvas nuo ${d.readinessDate || '?'}`} · ${d.phone}`).join('\n');
    const body = `Sveiki,\n\nVairuotojų sąrašas (${list.length}):\n\n${lines}\n\n— Dispečeris · Vestex Transport`;
    window.location.href = `mailto:?subject=${encodeURIComponent(`Vairuotojų sąrašas (${list.length})`)}&body=${encodeURIComponent(body)}`;
  };

  // ── Automobilių bazė: CSV eksportas ir el. paštas ──
  const exportCarsCSV = (list: Car[]) => {
    if (!list.length) { showToast('Nėra ką eksportuoti', 'error'); return; }
    const head = ['Numeris', 'Tipas', 'Registracija', 'Būsena', 'Vairuotojas'];
    const rows = list.map(c => { const drv = drivers.find(d => d.currentCar === c.number); return [c.number, c.type, c.registration, c.status, drv?.name || '']; });
    const csv = [head, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `automobiliai_${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast(`Eksportuota: ${list.length} mašinų`);
  };
  const emailCars = (list: Car[]) => {
    if (!list.length) { showToast('Pažymėkite mašinų', 'error'); return; }
    const lines = list.map(c => { const drv = drivers.find(d => d.currentCar === c.number); return `• ${c.number} (${c.type}·${c.registration}) — ${c.status}${drv ? ` · vairuotojas: ${drv.name}` : ' · laisva'}`; }).join('\n');
    const body = `Sveiki,\n\nAutomobilių sąrašas (${list.length}):\n\n${lines}\n\n— Dispečeris · Vestex Transport`;
    window.location.href = `mailto:?subject=${encodeURIComponent(`Automobilių sąrašas (${list.length})`)}&body=${encodeURIComponent(body)}`;
  };

  // ── El. laiško su savaitės planais turinys (mailto) ──
  const buildPlansEmail = (group: CarType, weeks: 1 | 2) => {
    const from = startOfWeek(new Date(), { weekStartsOn: 1 });
    const to   = endOfWeek(addWeeks(new Date(), weeks - 1), { weekStartsOn: 1 });
    const list = plans
      .filter(p => p.status === 'Suplanuota')
      .filter(p => cars.find(c => c.number === p.carNumber)?.type === group)
      .filter(p => { const dt = parseISO(p.date); return !isBefore(dt, from) && !isAfter(dt, to); })
      .sort((a, b) => a.date.localeCompare(b.date));
    const lines = list.length
      ? list.map(p => `• ${p.date} · ${p.carNumber} (${group}): ${p.leavingDriverName || '—'} → ${p.incomingDriverName}`).join('\n')
      : 'Šiam laikotarpiui planų nėra.';
    const period = `${format(from, 'MM-dd')}–${format(to, 'MM-dd')}`;
    const subject = `${group} keitimų planai (${period})`;
    const body = `Sveiki,\n\n${group} grupės mašinų keitimų planai (${weeks === 1 ? 'ši savaitė' : 'ši ir kita savaitė'}, ${period}):\n\n${lines}\n\n— Dispečeris · Vestex Transport`;
    return { subject, body, count: list.length };
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
    return drivers.filter(d => d.status === 'Namuose' && !d.dismissedDate && !d.unneeded).sort((a, b) => {
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
    return drivers.filter(d => d.status === 'Reise' && !d.dismissedDate && d.plannedReturnDate && Math.abs(differenceInDays(parseISO(d.plannedReturnDate), target)) <= 14)
      .sort((a, b) => (a.plannedReturnDate || '').localeCompare(b.plannedReturnDate || ''));
  }, [drivers, selectedHomeDriverId, targetWorkDate]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const reiseDrivers  = drivers.filter(d => d.status === 'Reise' && !d.dismissedDate);
  // „Namuose" skydeliui/sąrašui = laisvi ir reikalingi (be atleistų ir nereikalingų).
  const namuoseDrivers = drivers.filter(d => d.status === 'Namuose' && !d.dismissedDate && !d.unneeded).sort((a, b) => (a.readinessDate || '').localeCompare(b.readinessDate || ''));
  const dismissedDrivers = drivers.filter(d => !!d.dismissedDate).sort((a, b) => (b.dismissedDate || '').localeCompare(a.dismissedDate || ''));
  const activePlans   = plans.filter(p => p.status === 'Suplanuota');
  // Planai be nustatyto keitimo taško — koordinatoriaus „darbų" skaičius.
  const coordinatorPending = activePlans.filter(p => p.changeLat == null).length;

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

  const go = (tab: Tab) => { setActiveTab(tab); setSidebarOpen(false); };
  const pageMeta: Record<Tab, { title: string; subtitle: string }> = {
    dashboard:       { title: t('Skydelis'),     subtitle: t('Bendra parko ir vairuotojų apžvalga') },
    planning:        { title: t('Planavimas'),   subtitle: t('Keitimų planavimas ir rekomendacijos') },
    drivers:         { title: t('Vairuotojai'),  subtitle: `${drivers.length} ${t('vairuotojai')} · ${reiseDrivers.length} ${t('reise')}, ${namuoseDrivers.length} ${t('namuose')}` },
    cars:            { title: t('Automobiliai'), subtitle: `${cars.length} ${t('mašinos parke')}` },
    history:         { title: t('Istorija'),     subtitle: t('Visų veiksmų žurnalas') },
    calendar:        { title: t('Kalendorius'),  subtitle: t('Keitimai pagal mėnesį') },
    'auto-grafikas': { title: t('Grafikas'),     subtitle: t('Automobilių užimtumo juosta') },
    coordinator:     { title: t('Koordinatorius'), subtitle: t('Keitimo taškai žemėlapyje — eina į Kelionę') },
    draft:           { title: t('Keitimo juodraštis'), subtitle: t('Sujunkite mašiną su vairuotoju — patvirtinus keitimas suplanuojamas') },
    trip:            { title: t('Kelionė'),      subtitle: t('Maršrutų ir keitimo logistika') },
  };
  const meta = pageMeta[activeTab];

  return (
    <div className="grain min-h-screen bg-canvas text-ink font-sans flex">
      {/* Mobiliojo sidebar fonas */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-40 lg:hidden" />}

      {/* ── Sidebar ── */}
      <aside className={cn(
        "fixed lg:sticky top-0 z-50 lg:z-30 h-screen w-64 shrink-0 flex flex-col bg-canvas border-r border-hairline transition-transform duration-300 lg:translate-x-0",
        sidebarOpen ? "translate-x-0 shadow-float" : "-translate-x-full"
      )}>
        <div className="flex items-center gap-2.5 px-5 h-16 shrink-0 border-b border-hairline/60">
          <div className="w-9 h-9 rounded-2xl bg-ink flex items-center justify-center ring-1 ring-gold/30 shrink-0">
            <span className="font-display text-gold-soft text-lg leading-none">D</span>
          </div>
          <div>
            <p className="text-[17px] font-display font-medium tracking-tight leading-none">Dispečeris</p>
            <p className="text-[10px] text-muted tracking-[0.12em] uppercase mt-1">Vestex Transport</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          <NavGroup label={t('Apžvalga')}>
            <NavItem active={activeTab === 'dashboard'} onClick={() => go('dashboard')} icon={<LayoutDashboard size={17}/>} label={t('Skydelis')} />
          </NavGroup>
          <NavGroup label={t('Operacijos')}>
            <NavItem active={activeTab === 'planning'} onClick={() => go('planning')} icon={<ArrowRightLeft size={17}/>} label={t('Planavimas')} badge={urgentCount} />
            <NavItem active={activeTab === 'calendar'} onClick={() => go('calendar')} icon={<Calendar size={17}/>} label={t('Kalendorius')} />
            <NavItem active={activeTab === 'auto-grafikas'} onClick={() => go('auto-grafikas')} icon={<LayoutDashboard size={17}/>} label={t('Grafikas')} />
            {canEdit && <NavItem active={activeTab === 'draft'} onClick={() => go('draft')} icon={<ClipboardList size={17}/>} label={t('Keitimo juodraštis')} badge={drafts.length || undefined} />}
            <NavItem active={activeTab === 'coordinator'} onClick={() => go('coordinator')} icon={<MapPin size={17}/>} label={t('Koordinatorius')} badge={coordinatorPending} />
            <NavItem active={activeTab === 'trip'} onClick={() => go('trip')} icon={<MapIcon size={17}/>} label={t('Kelionė')} />
          </NavGroup>
          <NavGroup label={t('Katalogas')}>
            <NavItem active={activeTab === 'drivers'} onClick={() => go('drivers')} icon={<Users size={17}/>} label={t('Vairuotojai')} />
            <NavItem active={activeTab === 'cars'} onClick={() => go('cars')} icon={<Truck size={17}/>} label={t('Automobiliai')} />
          </NavGroup>
          <NavGroup label={t('Žurnalas')}>
            <NavItem active={activeTab === 'history'} onClick={() => go('history')} icon={<History size={17}/>} label={t('Istorija')} />
          </NavGroup>
        </nav>

        {/* Dekoratyvinis line-art akcentas (premium detalė) */}
        <div className="px-6 pb-1 pt-2 shrink-0 pointer-events-none select-none" aria-hidden>
          <SemiTruck className="w-full h-auto opacity-[0.18]" />
        </div>

        <div className="px-3 py-3 border-t border-hairline shrink-0">
          <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-muted">
            <span className={cn("w-1.5 h-1.5 rounded-full", isSupabaseEnabled ? "bg-emerald-400" : "bg-stone-300")} />
            {isSupabaseEnabled ? t('Supabase debesis') : t('Vietinė saugykla')}
          </div>
          {isSupabaseEnabled && (
            <button onClick={() => { void supabase?.auth.signOut(); }} className="w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-xl text-sm font-medium text-muted hover:text-ink hover:bg-ink/[0.03] transition-all">
              <LogOut size={17}/> {t('Atsijungti')}
            </button>
          )}
        </div>
      </aside>

      {/* ── Content column ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-canvas/80 backdrop-blur-xl border-b border-hairline">
          <div className="px-4 lg:px-8 h-16 flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-muted hover:text-ink rounded-lg transition-colors"><Menu size={20}/></button>
            <div className="min-w-0">
              <h1 className="text-lg lg:text-xl font-display font-medium tracking-tight leading-none truncate">{meta.title}</h1>
              <p className="text-[11px] text-muted mt-1 hidden sm:block truncate">{meta.subtitle}</p>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              {/* Vartotojo rolė. Kūrėjas → rolių valdymas; kiti → Kūrėjo kodo įvedimas. */}
              <button
                onClick={() => isAdmin ? setRoleAdminOpen(true) : setKurejasCodeOpen(true)}
                title={isAdmin ? t('Tvarkyti roles') : t('Kūrėjo prieiga')}
                className={cn(
                  'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all',
                  isAdmin ? 'bg-gold/15 text-ink ring-1 ring-gold/30 hover:bg-gold/25' : 'bg-ink/[0.06] text-muted hover:bg-ink/10'
                )}>
                {isAdmin ? <ShieldCheck size={13} /> : canEdit ? <UserCog size={13} /> : <Lock size={13} />} {t(ROLE_LABELS[role])}
              </button>
              {/* Kalbos perjungiklis LT / RU */}
              <div className="flex items-center bg-ink/[0.06] rounded-full p-0.5" role="group" aria-label={t('Kalba')}>
                {(['lt', 'ru'] as Lang[]).map(l => (
                  <button key={l} onClick={() => setLang(l)} className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide transition-all', lang === l ? 'bg-ink text-white shadow-card' : 'text-muted hover:text-ink')}>
                    {l === 'lt' ? 'LT' : 'RU'}
                  </button>
                ))}
              </div>
              {canEdit && (activeTab === 'cars' || activeTab === 'dashboard') && (
                <button onClick={() => setAddCarOpen(true)} className="flex items-center gap-1.5 bg-surface border border-hairline text-ink px-3.5 py-2 rounded-full text-xs font-medium hover:border-ink/25 transition-all">
                  <Plus size={14}/><span className="hidden sm:inline">{t('Automobilis')}</span>
                </button>
              )}
              {canEdit && (activeTab === 'drivers' || activeTab === 'dashboard' || activeTab === 'planning') && (
                <button onClick={() => setAddDriverOpen(true)} className="flex items-center gap-1.5 bg-ink text-white px-3.5 py-2 rounded-full text-xs font-medium hover:bg-ink/85 transition-all">
                  <UserPlus size={14}/><span className="hidden sm:inline">{t('Vairuotojas')}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main key={activeTab} className="reveal px-4 lg:px-8 py-6 lg:py-8 space-y-8 w-full max-w-[1600px]">

        {/* ══════════════════ DASHBOARD ══════════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Hero — švarus, modernus tipografinis pasveikinimas (be animacijos/logo) */}
            <div className="relative overflow-hidden rounded-3xl border border-hairline shadow-card bg-surface">
              <div className="pointer-events-none absolute -top-24 -right-10 w-80 h-80 rounded-full bg-gold/10 blur-3xl" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-surface via-surface to-canvas" />
              <div className="relative px-6 sm:px-9 py-7 sm:py-9 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">{format(new Date(), "EEEE, MMMM d", { locale: dfLocale })}</p>
                  <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-tight mt-1.5 text-ink">
                    {(() => { const h = new Date().getHours(); return t(h < 12 ? 'Labas rytas' : h < 18 ? 'Laba diena' : 'Labas vakaras'); })()}
                  </h2>
                  <p className="text-sm text-muted mt-2">{t('Bendra parko ir vairuotojų apžvalga')}</p>
                </div>
                {/* Greita santrauka — elegantiškos pilės */}
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 px-3 py-1.5 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />{reiseDrivers.length} {t('reise')}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{namuoseDrivers.length} {t('namuose')}</span>
                  {urgentCount > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-600 px-3 py-1.5 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />{urgentCount} {t('skubu')}</span>}
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label={t('Reise')}        value={reiseDrivers.length}   sub={`${t('iš')} ${drivers.length} ${t('viso')}`}   accent="bg-blue-400"    onClick={() => setActiveTab('drivers')} art={<SemiTruck className="w-28 h-auto" stroke="currentColor" />} />
              <StatCard label={t('Namuose')}      value={namuoseDrivers.length} sub={t('laukia darbo')}                     accent="bg-emerald-400" onClick={() => setActiveTab('drivers')} art={<Home size={92} strokeWidth={1.2} />} />
              <StatCard label={t('Planai')}       value={activePlans.length}    sub={t('suplanuota')}                       accent="bg-violet-400"  onClick={() => setActiveTab('planning')} art={<ArrowRightLeft size={88} strokeWidth={1.1} />} />
              <StatCard label={t('Skubu')}        value={urgentCount}           sub={t('reikia keitimo ≤7d')}              accent={urgentCount > 0 ? "bg-red-400" : "bg-stone-300"} onClick={() => setActiveTab('planning')} art={<AlertCircle size={88} strokeWidth={1.1} />} />
            </div>

            {/* Planned Replacements */}
            <section>
              <SectionHeader icon={<ArrowRightLeft size={18} className="text-blue-500"/>} title={t('Suplanuoti keitimai')}>
                <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
              </SectionHeader>

              {(() => {
                const monthPlans = activePlans.filter(p => isSameMonth(parseISO(p.date), selectedMonth) && cars.some(c => c.number === p.carNumber));
                if (monthPlans.length === 0) return <EmptyState icon={<Calendar size={28}/>} text={t('Šį mėnesį suplanuotų keitimų nėra')} />;

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
                            {t('Savaitė')} {format(start, 'MM.dd')} – {format(endOfWeek(start, { weekStartsOn: 1 }), 'MM.dd')}
                          </span>
                          <div className="h-px flex-1 bg-stone-200" />
                        </div>
                        <div className="grid gap-3">
                          {wPlans.sort((a,b) => a.date.localeCompare(b.date)).map(plan => (
                            <PlanCard key={plan.id} plan={plan} canEdit={canEdit} drivers={drivers} cars={cars} plans={plans}
                              onComplete={() => {
                                setConfirmData({ carNumber: plan.carNumber, leavingId: plan.leavingDriverId, incomingId: plan.incomingDriverId, date: plan.date, driverName: plan.incomingDriverName, planId: plan.id, isExecution: true });
                                if (plan.newPlannedReturnDate) setNewReturnDate(plan.newPlannedReturnDate);
                              }}
                              onDelete={() => askConfirm({ title: t('Atšaukti planą?'), danger: true, confirmLabel: t('Taip, atšaukti'), message: <span>{plan.carNumber}: {plan.incomingDriverName} ({format(parseISO(plan.date), 'yyyy-MM-dd')})</span>, onConfirm: () => deletePlan(plan.id) })}
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

            {/* Drivers at Home — paieška + grupavimas pagal pasiruošimą */}
            <section>
              <SectionHeader icon={<Home size={18} className="text-emerald-500"/>} title={t('Vairuotojai namuose')}>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input value={homeSearch} onChange={e => setHomeSearch(e.target.value)} placeholder={t('Ieškoti pagal pavardę...')}
                    className="w-44 sm:w-56 bg-surface border border-hairline rounded-full pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:border-ink/40 transition-all" />
                  {homeSearch && <button onClick={() => setHomeSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><X size={13} /></button>}
                </div>
              </SectionHeader>
              {namuoseDrivers.length === 0
                ? <EmptyState icon={<Users size={28}/>} text={t('Visi vairuotojai reise')} />
                : (() => {
                  const today = new Date();
                  const CAP = 18; // kiek rodyti viename bloke prieš „Rodyti visus"
                  const q = homeSearch.trim().toLowerCase();
                  const surname = (n: string) => { const p = n.trim().split(/\s+/); return (p[p.length - 1] || n).toLowerCase(); };
                  const bySurname = (a: Driver, b: Driver) => surname(a.name).localeCompare(surname(b.name), 'lt');
                  const matches = q ? namuoseDrivers.filter(d => d.name.toLowerCase().includes(q)) : namuoseDrivers;
                  const readyNow = (d: Driver) => !d.readinessDate || !isAfter(parseISO(d.readinessDate), today);
                  const soon = (d: Driver) => !!d.readinessDate && isAfter(parseISO(d.readinessDate), today) && differenceInDays(parseISO(d.readinessDate), today) <= 7;
                  const bucketNow   = matches.filter(readyNow).sort(bySurname);
                  const bucketSoon  = matches.filter(soon).sort(bySurname);
                  const bucketLater = matches.filter(d => !readyNow(d) && !soon(d)).sort(bySurname);
                  const grid = (list: Driver[]) => (
                    <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2">
                      {list.map(d => (
                        <HomeDriverCard key={d.id} driver={d} canEdit={canEdit} onSendToTrip={() => { setSelectedDriverForTrip(d); setTripOpen(true); }} />
                      ))}
                    </div>
                  );
                  // Blokas su antrašte ir „Rodyti visus" (jei daugiau nei CAP). Paieškoje — viskas išplėsta.
                  const bucket = (key: string, dot: string, label: string, list: Driver[]) => {
                    if (list.length === 0) return null;
                    const expanded = !!homeExpanded[key] || !!q;
                    const shown = expanded ? list : list.slice(0, CAP);
                    const toggle = () => setHomeExpanded(p => ({ ...p, [key]: !p[key] }));
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-2 mt-1">
                          <span className={cn('w-2 h-2 rounded-full', dot)} />
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
                          <span className="text-[11px] font-semibold text-stone-400">· {list.length}</span>
                        </div>
                        {grid(shown)}
                        {!q && list.length > CAP && (
                          <button onClick={toggle} className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted hover:text-ink py-1.5 rounded-lg hover:bg-ink/[0.04] transition-all">
                            {expanded ? t('Slėpti') : `${t('Rodyti visus')} (${list.length})`}
                            <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
                          </button>
                        )}
                      </div>
                    );
                  };
                  if (matches.length === 0) return <p className="text-sm text-muted text-center py-8">{t('Nieko nerasta')}</p>;
                  return (
                    <div className="space-y-4">
                      {bucket('now',  'bg-emerald-400', t('Galima dabar'), bucketNow)}
                      {bucket('soon', 'bg-amber-400',   t('Greitai (≤7 d.)'), bucketSoon)}
                      {bucket('later','bg-stone-300',   t('Vėliau'), bucketLater)}
                    </div>
                  );
                })()
              }
            </section>

            {/* Reise drivers urgency */}
            {urgentCount > 0 && (
              <section>
                <SectionHeader icon={<AlertCircle size={18} className="text-red-500"/>} title={t('Reikia keitimo (≤7 dienų)')} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {reiseDrivers.filter(d => {
                    if (!d.plannedReturnDate) return false;
                    return differenceInDays(parseISO(d.plannedReturnDate), new Date()) <= 7 && !plans.some(p => p.status === 'Suplanuota' && p.leavingDriverId === d.id);
                  }).map(d => (
                    <div key={d.id} className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-sm">{d.name}</p>
                        <p className="text-xs text-red-600 font-semibold">{d.currentCar} — {t('grįžta')}: {d.plannedReturnDate}</p>
                        <p className="text-[10px] text-red-400 mt-0.5">{t('Liko')} {differenceInDays(parseISO(d.plannedReturnDate!), new Date())} {t('d.')}</p>
                      </div>
                      <button onClick={() => { setSelectedTripDriverId(d.id); setActiveTab('planning'); }} className="bg-red-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-red-700 transition-colors whitespace-nowrap">
                        {t('Planuoti')}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Timeline */}
            <section>
              <SectionHeader icon={<LayoutDashboard size={18} className="text-violet-500"/>} title={t('Vairuotojų grafikas')}>
                <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
              </SectionHeader>
              <DriverTimeline drivers={drivers} cars={cars} plans={plans} carAssignments={carAssignments} month={selectedMonth} onEditAssignment={setEditAssignment} onMoveAssignment={moveAssignment} onMovePlanDate={movePlanDate} onMovePlanToCar={movePlanToCar} onResizeAssignment={resizeAssignment} />
            </section>
          </div>
        )}

        {/* ══════════════════ PLANNING ══════════════════ */}
        {activeTab === 'planning' && (
          <div className="space-y-6">
            {!canEdit && <ReadOnlyNotice text={role === 'coordinator' ? t('Redaguoti galite tik Koordinatoriaus skiltyje') : t('Tik stebėjimas — redaguoti negalite')} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: who to replace */}
              <div className="bg-surface rounded-2xl border border-hairline p-6 space-y-5">
                <div className="flex items-center gap-2 border-b border-hairline pb-4">
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
                      const ready = d.readinessDate ? !isAfter(parseISO(d.readinessDate), new Date()) : true;
                      const fit = specFit(d, replaceTarget?.carType ?? '');
                      const sameCompany = !!replaceTarget && d.companyType === replaceTarget.company;
                      return (
                        <div key={d.id} className={cn("flex items-center justify-between p-3 rounded-xl border transition-all", isPlanned ? "bg-emerald-50 border-emerald-200" : "bg-canvas border-hairline hover:border-ink/25")}>
                          <div>
                            <p className="text-sm font-semibold">{d.name}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Badge variant={fit === 0 ? 'green' : fit === 1 ? 'blue' : 'default'}>{d.specialization}</Badge>
                              <Badge variant={sameCompany ? 'green' : 'default'}>{d.companyType}</Badge>
                              <span className={cn("text-[10px]", ready ? "text-emerald-600 font-medium" : "text-muted")}>
                                {ready ? 'Galima siųsti' : `Poilsiauja iki ${d.readinessDate || '—'}`}{d.homeStatus && d.homeStatus !== 'Nėra' ? ` · ${d.homeStatus}` : ''}
                              </span>
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
              <div className="bg-surface rounded-2xl border border-hairline p-6 space-y-5">
                <div className="flex items-center gap-2 border-b border-hairline pb-4">
                  <LogIn size={16} className="text-emerald-500"/>
                  <h3 className="font-bold">Kam duoti darbą?</h3>
                </div>
                <Field label="Vairuotojas namuose">
                  <select className={selectCls} value={selectedHomeDriverId} onChange={e => setSelectedHomeDriverId(e.target.value)}>
                    <option value="">Pasirinkite...</option>
                    {drivers.filter(d => d.status === 'Namuose' && !d.dismissedDate).sort((a,b) => (a.readinessDate||'').localeCompare(b.readinessDate||'')).map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.companyType} • {d.specialization}){d.unneeded ? ' • nereikalingas' : ''} — nuo: {d.readinessDate || '?'}</option>
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
                        <div key={d.id} className={cn("flex items-center justify-between p-3 rounded-xl border", isPlanned ? "bg-emerald-50 border-emerald-200" : "bg-canvas border-hairline hover:border-stone-300")}>
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
                            }} className="bg-ink text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-ink/85 transition-colors">
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

            {/* Planai pagal grupes (Tentai / Refai) + el. paštas + įvykdyti su atšaukimu */}
            {(activePlans.length > 0 || plans.some(p => p.status === 'Atlikta')) && (() => {
              const typeOf = (p: ReplacementPlan) => cars.find(c => c.number === p.carNumber)?.type;
              const wkFrom = startOfWeek(addWeeks(new Date(), planWeek === 'next' ? 1 : 0), { weekStartsOn: 1 });
              const wkTo   = endOfWeek(addWeeks(new Date(), planWeek === 'next' ? 1 : 0), { weekStartsOn: 1 });
              const inWeek = (p: ReplacementPlan) => { if (planWeek === 'all') return true; const dt = parseISO(p.date); return !isBefore(dt, wkFrom) && !isAfter(dt, wkTo); };
              const shown = activePlans.filter(p => (planGroup === 'all' || typeOf(p) === planGroup) && inWeek(p)).sort((a, b) => a.date.localeCompare(b.date));
              const done  = plans.filter(p => p.status === 'Atlikta').sort((a, b) => b.date.localeCompare(a.date));
              return (
                <div className="bg-surface rounded-2xl border border-hairline p-6 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Aktyvūs planai ({shown.length})</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex bg-canvas p-1 rounded-xl gap-1">
                        {([['all', 'Visi'], ['Tentas', 'Tentai'], ['Refas', 'Refai']] as const).map(([g, lbl]) => (
                          <button key={g} onClick={() => setPlanGroup(g)}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", planGroup === g ? "bg-ink text-white" : "text-muted hover:text-ink")}>{lbl}</button>
                        ))}
                      </div>
                      <div className="flex bg-canvas p-1 rounded-xl gap-1">
                        {([['all', 'Visada'], ['this', 'Ši sav.'], ['next', 'Kita sav.']] as const).map(([w, lbl]) => (
                          <button key={w} onClick={() => setPlanWeek(w)}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", planWeek === w ? "bg-gold text-white" : "text-muted hover:text-ink")}>{lbl}</button>
                        ))}
                      </div>
                      <button onClick={() => setEmailGroup('Tentas')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-hairline text-ink hover:border-ink/25 transition-all"><Mail size={13}/> Tentai</button>
                      <button onClick={() => setEmailGroup('Refas')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-hairline text-ink hover:border-ink/25 transition-all"><Mail size={13}/> Refai</button>
                    </div>
                  </div>

                  {shown.length === 0 ? (
                    <p className="text-xs text-muted italic py-4 text-center">Nėra aktyvių planų šioje grupėje</p>
                  ) : (
                    <div className="space-y-2">
                      {shown.map(plan => {
                        const carType = typeOf(plan);
                        return (
                          <div key={plan.id} className="flex items-center justify-between p-3 bg-canvas rounded-xl border border-hairline">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-xs font-semibold bg-ink text-white px-2 py-0.5 rounded shrink-0">{plan.carNumber}</span>
                              {carType && <Badge variant={carType === 'Tentas' ? 'blue' : 'purple'}>{t(carType)}</Badge>}
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{plan.leavingDriverName} → {plan.incomingDriverName}</p>
                                <p className="text-[10px] text-muted">{plan.date}{plan.newPlannedReturnDate ? ` • dirbs iki: ${plan.newPlannedReturnDate}` : ''}</p>
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button title="Įvykdyti" onClick={() => { setConfirmData({ carNumber: plan.carNumber, leavingId: plan.leavingDriverId, incomingId: plan.incomingDriverId, date: plan.date, driverName: plan.incomingDriverName, planId: plan.id, isExecution: true }); if (plan.newPlannedReturnDate) setNewReturnDate(plan.newPlannedReturnDate); }} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all"><CheckCircle2 size={14}/></button>
                              <button title="Ištrinti" onClick={() => askConfirm({ title: t('Atšaukti planą?'), danger: true, confirmLabel: t('Taip, atšaukti'), message: <span>{plan.carNumber}: {plan.incomingDriverName} ({format(parseISO(plan.date), 'yyyy-MM-dd')})</span>, onConfirm: () => deletePlan(plan.id) })} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"><Trash2 size={14}/></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {done.length > 0 && (
                    <div className="pt-3 border-t border-hairline">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted mb-2">Įvykdyti pakeitimai · galima atšaukti</p>
                      <div className="space-y-2">
                        {done.slice(0, 8).map(plan => (
                          <div key={plan.id} className="flex items-center justify-between p-3 bg-canvas/50 rounded-xl border border-hairline">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-xs font-semibold bg-emerald-600 text-white px-2 py-0.5 rounded shrink-0">{plan.carNumber}</span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{plan.leavingDriverName} → {plan.incomingDriverName}</p>
                                <p className="text-[10px] text-muted">Įvykdyta: {plan.date}</p>
                              </div>
                            </div>
                            <button title="Atšaukti įvykdymą" onClick={() => { if (confirm('Atšaukti šį įvykdymą? Duomenys grįš į būseną prieš pakeitimą.')) undoCompletion(plan.id); }}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors shrink-0"><Undo2 size={13}/> Atšaukti</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ══════════════════ DRIVERS ══════════════════ */}
        {activeTab === 'drivers' && (() => {
          const matchesFilter = (d: Driver) => {
            const mc = !driverFilter.companyType || d.companyType === driverFilter.companyType;
            const ms = !driverFilter.specialization || d.specialization === driverFilter.specialization;
            const mx = !driverFilter.search || d.name.toLowerCase().includes(driverFilter.search.toLowerCase());
            return mc && ms && mx;
          };
          // Pagrindiniai sąrašai — be atleistų; atleistieji rodomi atskiroje skiltyje.
          const fd = drivers.filter(d => !d.dismissedDate && matchesFilter(d));
          const dismissedList = drivers.filter(d => !!d.dismissedDate && matchesFilter(d));
          const reiseList = fd.filter(d => d.status === 'Reise');
          const namuoseList = fd.filter(d => d.status === 'Namuose');
          const selectedList = fd.filter(d => selectedDriverIds.includes(d.id));
          const allSel = fd.length > 0 && fd.every(d => selectedDriverIds.includes(d.id));
          const toggleSel = (id: string) => setSelectedDriverIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
          const planOf = (d: Driver) => plans.find(p => p.status === 'Suplanuota' && (p.leavingDriverId === d.id || p.incomingDriverId === d.id));
          const lateOf = (d: Driver) => d.status === 'Reise' && !!d.plannedReturnDate && isBefore(parseISO(d.plannedReturnDate), new Date());
          const avatar = (d: Driver, big?: boolean) => (
            <div className={cn("rounded-full flex items-center justify-center font-semibold shrink-0",
              d.status === 'Reise' ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700",
              big ? "w-11 h-11 text-sm" : "w-9 h-9 text-[11px]")}>
              {d.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
            </div>
          );
          const miniCard = (d: Driver) => {
            const plan = planOf(d); const isLate = lateOf(d); const sel = selectedDriverIds.includes(d.id);
            return (
              <div key={d.id} onClick={() => setProfileDriver(d)} className={cn("bg-surface rounded-xl border p-3 cursor-pointer transition-all hover:shadow-card hover:border-ink/20", sel ? "border-gold ring-1 ring-gold/30" : "border-hairline")}>
                <div className="flex items-start gap-3">
                  {avatar(d, true)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">{d.name}</p>
                      {isLate && <Badge variant="red">{t('Vėluoja')}</Badge>}
                    </div>
                    <p className="text-[11px] text-muted truncate">{d.companyType} · {t(d.specialization)}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge variant={d.status === 'Reise' ? 'blue' : 'green'}>{t(d.status)}</Badge>
                      {d.unneeded && <Badge variant="amber">{t('Nereikalingas')}</Badge>}
                      {d.currentCar !== 'Nėra' && <span className="font-mono text-[10px] text-muted">{d.currentCar}</span>}
                      {plan && <span className="text-[9px] text-violet-600 font-bold">{t('PLANAS')}</span>}
                    </div>
                  </div>
                  <input type="checkbox" onClick={e => e.stopPropagation()} checked={sel} onChange={() => toggleSel(d.id)} className="accent-gold mt-0.5 w-4 h-4" />
                </div>
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-hairline">
                  <span className="text-[11px] text-muted">{d.status === 'Reise' ? `${t('Grįžta')} ${d.plannedReturnDate || '?'}` : `${t('Laisvas')} ${d.readinessDate || '?'}`}</span>
                  {canEdit && <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                    {d.status === 'Reise'
                      ? <button onClick={() => { setSelectedDriverForHome(d); setHomeOpen(true); }} className="px-2 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded-md hover:bg-emerald-600 transition-colors">{t('Namo')}</button>
                      : <button onClick={() => { setSelectedDriverForTrip(d); setTripOpen(true); }} className="px-2 py-1 bg-ink text-white text-[10px] font-bold rounded-md hover:bg-ink/85 transition-colors">{t('Į reisą')}</button>}
                    <button onClick={() => { setSelectedDriverForEdit(d); setEditDriverOpen(true); }} className="p-1.5 bg-ink/[0.05] text-ink rounded-md hover:bg-ink hover:text-white transition-all"><Edit size={12} /></button>
                  </div>}
                </div>
              </div>
            );
          };
          return (
          <div className="space-y-4">
            {/* Įrankių juosta: vaizdo perjungiklis · pažymėjimo veiksmai · filtrai */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex bg-ink/[0.06] p-1 rounded-xl self-start">
                {([['table', 'Lentelė', List], ['kanban', 'Kanban', Columns3], ['cards', 'Kortelės', LayoutGrid]] as const).map(([v, label, Icon]) => (
                  <button key={v} onClick={() => setDriverView(v)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', driverView === v ? 'bg-surface shadow-card text-ink' : 'text-muted hover:text-ink')}>
                    <Icon size={14} /> {t(label)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedDriverIds.length > 0 && (
                  <div className="flex items-center gap-1.5 mr-1">
                    <span className="text-xs font-semibold text-ink bg-gold/15 px-2.5 py-1.5 rounded-lg">{selectedList.length} {t('pasirinkta')}</span>
                    <button onClick={() => emailDrivers(selectedList)} title={t('Siųsti el. paštu')} className="p-2 rounded-lg bg-ink/[0.06] hover:bg-ink hover:text-white transition-all"><Mail size={14} /></button>
                    <button onClick={() => exportDriversCSV(selectedList)} title={t('Eksportuoti CSV')} className="p-2 rounded-lg bg-ink/[0.06] hover:bg-ink hover:text-white transition-all"><Download size={14} /></button>
                    <button onClick={() => setSelectedDriverIds([])} title={t('Išvalyti')} className="p-2 rounded-lg text-muted hover:text-red-500 transition-colors"><X size={14} /></button>
                  </div>
                )}
                <select className={cn(selectCls, 'w-auto')} value={driverFilter.companyType} onChange={e => setDriverFilter(p => ({ ...p, companyType: e.target.value as RegistrationType | '' }))}>
                  <option value="">{t('Visos įmonės')}</option><option value="LT">LT</option><option value="PL">PL</option>
                </select>
                <select className={cn(selectCls, 'w-auto')} value={driverFilter.specialization} onChange={e => setDriverFilter(p => ({ ...p, specialization: e.target.value as DriverSpecialization | '' }))}>
                  <option value="">{t('Visi tipai')}</option><option value="Tentas">{t('Tentas')}</option><option value="Refas">{t('Refas')}</option><option value="Universalus">{t('Universalus')}</option>
                </select>
                <input placeholder={t('Paieška...')} className={cn(inputCls, 'w-36')} value={driverFilter.search} onChange={e => setDriverFilter(p => ({ ...p, search: e.target.value }))} />
                <button onClick={() => exportDriversCSV(fd)} title={t('Eksportuoti visus į CSV')} className="p-2 rounded-lg border border-hairline text-muted hover:text-ink hover:border-ink/30 transition-all"><Download size={15} /></button>
                {canEdit && <button onClick={() => { setImportRows([]); setImportMeta(null); setImportErr(null); setImportOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink text-white text-xs font-semibold hover:bg-ink/85 transition-all"><Upload size={14} /> {t('Importuoti Excel')}</button>}
              </div>
            </div>

            {/* LENTELĖ */}
            {driverView === 'table' && (
              <div className="bg-surface rounded-2xl border border-hairline overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink text-white text-left">
                      <th className="pl-4 pr-2 py-3 w-9"><input type="checkbox" checked={allSel} onChange={() => setSelectedDriverIds(allSel ? [] : fd.map(d => d.id))} className="accent-gold w-4 h-4 align-middle" /></th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Vairuotojas')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Įmonė / Tipas')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Būsena')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Auto')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Data')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-right">{t('Veiksmai')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {fd.map(d => {
                      const plan = planOf(d); const isLate = lateOf(d); const sel = selectedDriverIds.includes(d.id);
                      return (
                        <tr key={d.id} onClick={() => setProfileDriver(d)} className={cn("hover:bg-canvas transition-colors cursor-pointer", sel && "bg-gold/[0.05]")}>
                          <td className="pl-4 pr-2 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel} onChange={() => toggleSel(d.id)} className="accent-gold w-4 h-4 align-middle" /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {avatar(d)}
                              <div><div className="font-semibold flex items-center gap-1.5">{d.name}{(() => { const w = worstDocState(d); return w === 'expired' ? <span title="Dokumentai pasibaigę"><ShieldAlert size={13} className="text-red-500" /></span> : w === 'soon' ? <span title="Dokumentai netrukus baigiasi"><ShieldAlert size={13} className="text-amber-500" /></span> : null; })()}</div><div className="text-[10px] text-stone-400 font-mono">{d.phone}</div></div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><div className="flex gap-1.5"><Badge>{d.companyType}</Badge><Badge variant="blue">{t(d.specialization)}</Badge></div></td>
                          <td className="px-4 py-3">
                            <Badge variant={d.status === 'Reise' ? 'blue' : 'green'}>{t(d.status)}</Badge>
                            {d.unneeded && <span className="ml-1.5"><Badge variant="amber">{t('Nereikalingas')}</Badge></span>}
                            {plan && <span className="ml-1.5 text-[9px] text-violet-600 font-bold">{t('PLANAS')}</span>}
                            {isLate && <span className="ml-1.5"><Badge variant="red">{t('Vėluoja')}</Badge></span>}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-bold">{d.currentCar}</td>
                          <td className="px-4 py-3 text-xs">{d.status === 'Reise' ? <span className="text-stone-500">{t('Grįžta')}: <strong>{d.plannedReturnDate || '?'}</strong></span> : <span className="text-stone-500">{t('Gali')}: <strong>{d.readinessDate || '?'}</strong></span>}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              {canEdit ? <>
                              {d.status === 'Reise'
                                ? <button onClick={() => { setSelectedDriverForHome(d); setHomeOpen(true); }} className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 transition-colors">{t('Namo')}</button>
                                : <button onClick={() => { setSelectedDriverForTrip(d); setTripOpen(true); }} className="px-2.5 py-1 bg-ink text-white text-[10px] font-bold rounded-lg hover:bg-ink/85 transition-colors">{t('Į reisą')}</button>}
                              <button onClick={() => { setSelectedDriverForEdit(d); setEditDriverOpen(true); }} className="p-1.5 bg-ink/[0.05] text-ink hover:bg-ink hover:text-white rounded-lg transition-all"><Edit size={13} /></button>
                              <button onClick={() => deleteDriver(d.id)} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"><Trash2 size={13} /></button>
                              </> : <span className="text-[10px] text-stone-300">—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {fd.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted text-sm">{t('Nieko nerasta')}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* KANBAN pagal būseną */}
            {driverView === 'kanban' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {([['Reise', reiseList, 'bg-blue-400'], ['Namuose', namuoseList, 'bg-emerald-400']] as const).map(([title, list, dot]) => (
                  <div key={title} className="bg-canvas/40 rounded-2xl border border-hairline p-3">
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                      <span className={cn('w-2 h-2 rounded-full', dot)} />
                      <p className="text-sm font-semibold">{t(title)}</p>
                      <span className="text-xs text-muted">· {list.length}</span>
                    </div>
                    <div className="space-y-2">
                      {list.map(miniCard)}
                      {list.length === 0 && <p className="text-xs text-muted text-center py-8">Tuščia</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* KORTELĖS */}
            {driverView === 'cards' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {fd.map(miniCard)}
                {fd.length === 0 && <div className="col-span-full text-center text-muted py-10 text-sm">Nieko nerasta</div>}
              </div>
            )}

            {/* ATLEISTI — sulankstoma skiltis */}
            {dismissedList.length > 0 && (
              <div className="bg-canvas/40 rounded-2xl border border-hairline overflow-hidden">
                <button onClick={() => setShowDismissed(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-stone-50 transition-colors">
                  <UserX size={15} className="text-stone-400" />
                  <p className="text-sm font-semibold">{t('Atleisti')}</p>
                  <span className="text-xs text-muted">· {dismissedList.length}</span>
                  <span className="ml-auto text-[11px] text-muted">{showDismissed ? t('Slėpti') : t('Rodyti')}</span>
                  <ChevronDown size={16} className={cn('text-muted transition-transform', showDismissed && 'rotate-180')} />
                </button>
                {showDismissed && (
                  <div className="px-3 pb-3 space-y-2">
                    {dismissedList.map(d => (
                      <div key={d.id} onClick={() => setProfileDriver(d)} className="bg-surface rounded-xl border border-hairline p-3 flex items-center gap-3 cursor-pointer hover:border-ink/20 transition-all opacity-80 hover:opacity-100">
                        <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-500 flex items-center justify-center text-[11px] font-semibold shrink-0">{d.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate">{d.name}</p>
                          <p className="text-[11px] text-muted truncate">{d.companyType} · {t(d.specialization)} · <span className="text-red-500 font-medium">{t('Atleistas nuo')} {d.dismissedDate}</span></p>
                        </div>
                        {canEdit && (
                          <button onClick={e => { e.stopPropagation(); reinstateDriver(d); }} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 transition-colors shrink-0">
                            <RotateCcw size={12} /> {t('Grąžinti')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })()}

        {/* ══════════════════ CARS ══════════════════ */}
        {activeTab === 'cars' && (() => {
          const fc = cars.filter(c => {
            const mr = !carFilter.registration || c.registration === carFilter.registration;
            const mt = !carFilter.type || c.type === carFilter.type;
            const ms = !carFilter.search || c.number.toLowerCase().includes(carFilter.search.toLowerCase());
            return mr && mt && ms;
          });
          const tentai = fc.filter(c => c.type === 'Tentas');
          const refai = fc.filter(c => c.type === 'Refas');
          const selectedList = fc.filter(c => selectedCarIds.includes(c.id));
          const allSel = fc.length > 0 && fc.every(c => selectedCarIds.includes(c.id));
          const toggleSel = (id: string) => setSelectedCarIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
          const TypeIcon = ({ t, className }: { t: CarType; className?: string }) => t === 'Refas' ? <Snowflake className={className} /> : <Container className={className} />;
          const carCard = (car: Car) => {
            const driver = drivers.find(d => d.currentCar === car.number);
            const plan = plans.find(p => p.status === 'Suplanuota' && p.carNumber === car.number);
            const sel = selectedCarIds.includes(car.id);
            return (
              <div key={car.id} onClick={() => setProfileCar(car)} className={cn("group bg-surface rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-card hover:border-ink/20", sel ? "border-gold ring-1 ring-gold/30" : "border-hairline")}>
                <div className="flex items-start gap-3">
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", car.status === 'Aktyvus' ? "bg-ink text-gold-soft" : "bg-red-50 text-red-400")}>
                    <TypeIcon t={car.type} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-bold text-base tracking-tight">{car.number}</p>
                    {(car.brand || car.year) && <p className="text-[11px] text-muted truncate">{[car.brand, car.year].filter(Boolean).join(' · ')}</p>}
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      <Badge variant="blue">{t(car.type)}</Badge>
                      <Badge>{car.registration}</Badge>
                      <Badge variant={car.status === 'Aktyvus' ? 'green' : 'red'}>{t(car.status)}</Badge>
                    </div>
                  </div>
                  <input type="checkbox" onClick={e => e.stopPropagation()} checked={sel} onChange={() => toggleSel(car.id)} className="accent-gold mt-0.5 w-4 h-4" />
                </div>

                <div className="flex items-center gap-2 text-sm border-t border-hairline mt-3 pt-3">
                  {driver ? <>
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-semibold shrink-0">{driver.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
                    <div className="min-w-0"><p className="font-semibold text-xs truncate">{driver.name}</p><p className="text-[10px] text-muted">{t('Grįžta')} {driver.plannedReturnDate || '?'}</p></div>
                  </> : <>
                    <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center shrink-0"><User size={13} className="text-stone-400" /></div>
                    <p className="text-stone-400 italic text-xs">{t('Laisva')}</p>
                  </>}
                  {plan && <span className="ml-auto text-[9px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full shrink-0">{t('PLANAS')} {format(parseISO(plan.date), 'MM.dd')}</span>}
                </div>

                {!driver && canEdit && (
                  <button onClick={e => { e.stopPropagation(); setSelectedCarForAssignment(car.number); setTripOpen(true); }} className="w-full bg-ink text-white py-2 rounded-xl text-xs font-bold hover:bg-ink/85 transition-colors mt-3">{t('Priskirti vairuotoją')}</button>
                )}
              </div>
            );
          };
          return (
          <div className="space-y-4">
            {/* Įrankių juosta */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex bg-ink/[0.06] p-1 rounded-xl self-start">
                {([['cards', 'Kortelės', LayoutGrid], ['kanban', 'Pagal tipą', Columns3], ['table', 'Lentelė', List]] as const).map(([v, label, Icon]) => (
                  <button key={v} onClick={() => setCarView(v)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', carView === v ? 'bg-surface shadow-card text-ink' : 'text-muted hover:text-ink')}>
                    <Icon size={14} /> {t(label)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedCarIds.length > 0 && (
                  <div className="flex items-center gap-1.5 mr-1">
                    <span className="text-xs font-semibold text-ink bg-gold/15 px-2.5 py-1.5 rounded-lg">{selectedList.length} {t('pasirinkta')}</span>
                    <button onClick={() => emailCars(selectedList)} title={t('Siųsti el. paštu')} className="p-2 rounded-lg bg-ink/[0.06] hover:bg-ink hover:text-white transition-all"><Mail size={14} /></button>
                    <button onClick={() => exportCarsCSV(selectedList)} title={t('Eksportuoti CSV')} className="p-2 rounded-lg bg-ink/[0.06] hover:bg-ink hover:text-white transition-all"><Download size={14} /></button>
                    <button onClick={() => setSelectedCarIds([])} title={t('Išvalyti')} className="p-2 rounded-lg text-muted hover:text-red-500 transition-colors"><X size={14} /></button>
                  </div>
                )}
                <select className={cn(selectCls, 'w-auto')} value={carFilter.registration} onChange={e => setCarFilter(p => ({ ...p, registration: e.target.value as RegistrationType | '' }))}>
                  <option value="">{t('Visos registracijos')}</option><option value="LT">LT</option><option value="PL">PL</option>
                </select>
                <select className={cn(selectCls, 'w-auto')} value={carFilter.type} onChange={e => setCarFilter(p => ({ ...p, type: e.target.value as CarType | '' }))}>
                  <option value="">{t('Visi tipai')}</option><option value="Tentas">{t('Tentas')}</option><option value="Refas">{t('Refas')}</option>
                </select>
                <input placeholder={t('Paieška...')} className={cn(inputCls, 'w-32')} value={carFilter.search} onChange={e => setCarFilter(p => ({ ...p, search: e.target.value }))} />
                <button onClick={() => exportCarsCSV(fc)} title={t('Eksportuoti visus į CSV')} className="p-2 rounded-lg border border-hairline text-muted hover:text-ink hover:border-ink/30 transition-all"><Download size={15} /></button>
                {canEdit && <button onClick={() => { setCarImportRows([]); setCarImportMeta(null); setCarImportErr(null); setCarImportOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink text-white text-xs font-semibold hover:bg-ink/85 transition-all"><Upload size={14} /> {t('Importuoti Excel')}</button>}
              </div>
            </div>

            {/* KORTELĖS */}
            {carView === 'cards' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {fc.map(carCard)}
                {fc.length === 0 && <div className="col-span-full text-center text-muted py-10 text-sm">{t('Nieko nerasta')}</div>}
              </div>
            )}

            {/* PAGAL TIPĄ (kanban) */}
            {carView === 'kanban' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {([['Tentai', tentai, 'bg-blue-400'], ['Refai', refai, 'bg-cyan-400']] as const).map(([title, list, dot]) => (
                  <div key={title} className="bg-canvas/40 rounded-2xl border border-hairline p-3">
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                      <span className={cn('w-2 h-2 rounded-full', dot)} />
                      <p className="text-sm font-semibold">{t(title)}</p>
                      <span className="text-xs text-muted">· {list.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {list.map(carCard)}
                      {list.length === 0 && <p className="text-xs text-muted text-center py-8 sm:col-span-2">Tuščia</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* LENTELĖ */}
            {carView === 'table' && (
              <div className="bg-surface rounded-2xl border border-hairline overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink text-white text-left">
                      <th className="pl-4 pr-2 py-3 w-9"><input type="checkbox" checked={allSel} onChange={() => setSelectedCarIds(allSel ? [] : fc.map(c => c.id))} className="accent-gold w-4 h-4 align-middle" /></th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Mašina')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Reg.')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Būsena')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Vairuotojas')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">{t('Keitimas')}</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-right">{t('Veiksmai')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {fc.map(car => {
                      const driver = drivers.find(d => d.currentCar === car.number);
                      const plan = plans.find(p => p.status === 'Suplanuota' && p.carNumber === car.number);
                      const sel = selectedCarIds.includes(car.id);
                      return (
                        <tr key={car.id} onClick={() => setProfileCar(car)} className={cn("hover:bg-canvas transition-colors cursor-pointer", sel && "bg-gold/[0.05]")}>
                          <td className="pl-4 pr-2 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel} onChange={() => toggleSel(car.id)} className="accent-gold w-4 h-4 align-middle" /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", car.status === 'Aktyvus' ? "bg-ink text-gold-soft" : "bg-red-50 text-red-400")}><TypeIcon t={car.type} className="w-4 h-4" /></div>
                              <div><div className="font-mono font-bold">{car.number}</div><div className="text-[10px] text-muted">{[car.type, car.brand, car.year].filter(Boolean).join(' · ')}</div></div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><Badge>{car.registration}</Badge></td>
                          <td className="px-4 py-3"><Badge variant={car.status === 'Aktyvus' ? 'green' : 'red'}>{t(car.status)}</Badge></td>
                          <td className="px-4 py-3 text-xs">{driver ? <span className="font-semibold">{driver.name}</span> : <span className="text-muted italic">{t('Laisva')}</span>}</td>
                          <td className="px-4 py-3 text-xs">{plan ? <span className="text-violet-600 font-semibold">{plan.incomingDriverName} · {format(parseISO(plan.date), 'MM.dd')}</span> : <span className="text-muted">—</span>}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              {canEdit ? <>
                              {!driver && <button onClick={() => { setSelectedCarForAssignment(car.number); setTripOpen(true); }} className="px-2.5 py-1 bg-ink text-white text-[10px] font-bold rounded-lg hover:bg-ink/85 transition-colors">{t('Priskirti')}</button>}
                              <button onClick={() => { setSelectedCarForEdit(car); setEditCarOpen(true); }} className="p-1.5 bg-ink/[0.05] text-ink hover:bg-ink hover:text-white rounded-lg transition-all"><Edit size={13} /></button>
                              <button onClick={() => deleteCar(car.id)} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"><Trash2 size={13} /></button>
                              </> : <span className="text-[10px] text-stone-300">—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {fc.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted text-sm">{t('Nieko nerasta')}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          );
        })()}

        {/* ══════════════════ HISTORY ══════════════════ */}
        {activeTab === 'history' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">
              <div className="flex items-center gap-3">
                <div className="flex bg-stone-100 p-1 rounded-xl">
                  {(['upcoming', 'past'] as const).map(m => (
                    <button key={m} onClick={() => setHistoryMode(m)} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", historyMode === m ? "bg-surface shadow text-stone-900" : "text-stone-400")}>
                      {m === 'upcoming' ? 'Būsimi' : 'Atlikti'}
                    </button>
                  ))}
                </div>
                <MonthNav value={historyMonth} onChange={v => { setHistoryMonth(v); setHistoryWeekOffset(0); }} />
              </div>
            </div>

            {/* Plans table */}
            <div className="bg-surface rounded-2xl border border-hairline overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink text-white text-left">
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Data</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Auto</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Išeina</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Ateina</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Tipas</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold">Statusas</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider font-bold text-right">Veiksmai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {plans.filter(p => {
                    const correct = historyMode === 'upcoming' ? p.status === 'Suplanuota' : p.status === 'Atlikta';
                    return correct && isSameMonth(parseISO(p.date), historyMonth);
                  }).sort((a,b) => a.date.localeCompare(b.date)).map(plan => {
                    const car = cars.find(c => c.number === plan.carNumber);
                    return (
                      <tr key={plan.id} className="hover:bg-canvas transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-bold">{plan.date}</td>
                        <td className="px-4 py-3"><span className="font-mono font-bold bg-stone-100 px-2 py-0.5 rounded text-xs">{plan.carNumber}</span></td>
                        <td className="px-4 py-3 text-sm">{plan.leavingDriverName}</td>
                        <td className="px-4 py-3 text-sm font-semibold">{plan.incomingDriverName}</td>
                        <td className="px-4 py-3"><Badge variant="blue">{car?.type || '?'}</Badge></td>
                        <td className="px-4 py-3"><Badge variant={plan.status === 'Suplanuota' ? 'blue' : 'green'}>{plan.status}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            {historyMode === 'upcoming' ? (
                              <>
                                <button onClick={() => { setConfirmData({ carNumber: plan.carNumber, leavingId: plan.leavingDriverId, incomingId: plan.incomingDriverId, date: plan.date, driverName: plan.incomingDriverName, planId: plan.id, isExecution: true }); if (plan.newPlannedReturnDate) setNewReturnDate(plan.newPlannedReturnDate); }} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all" title="Įvykdyti"><CheckCircle2 size={13}/></button>
                                <button onClick={() => deletePlan(plan.id)} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all" title="Ištrinti"><Trash2 size={13}/></button>
                              </>
                            ) : (
                              <button onClick={() => { if (confirm(`Atšaukti įvykdytą pakeitimą ${plan.carNumber}?\n${plan.incomingDriverName} grįš namo, ${plan.leavingDriverName} — atgal į reisą.`)) undoCompletion(plan.id); }} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white rounded-lg transition-all text-xs font-semibold" title="Atšaukti įvykdymą"><Undo2 size={13}/> Atšaukti</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {plans.filter(p => historyMode === 'upcoming' ? p.status === 'Suplanuota' : p.status === 'Atlikta').filter(p => isSameMonth(parseISO(p.date), historyMonth)).length === 0 && (
                <div className="py-12 px-6"><EmptyChecklist label="Planų nerasta šiam laikotarpiui" /></div>
              )}
            </div>

            {/* Action Log */}
            <div className="bg-surface rounded-2xl border border-hairline overflow-hidden">
              <div className="px-4 py-3 bg-ink text-white flex items-center gap-2">
                <History size={14}/>
                <span className="text-xs font-bold uppercase tracking-wider">Veiksmų žurnalas</span>
              </div>
              <div className="divide-y divide-stone-100 max-h-96 overflow-y-auto">
                {history.slice(0, 50).map(entry => (
                  <div key={entry.id} className="px-4 py-3 flex gap-4 hover:bg-canvas transition-colors">
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
            <div className="flex items-center justify-end">
              <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
            </div>
            <div className="bg-surface rounded-2xl border border-hairline overflow-hidden">
              <div className="grid grid-cols-7 border-b border-hairline bg-ink text-white">
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
                    const note = calendarNotes.find(n => n.date === ds);
                    return (
                      <div key={i} onClick={() => setSelectedCalendarDay(ds)} className={cn("group/day relative min-h-[100px] p-2 border-r border-b border-hairline transition-colors cursor-pointer hover:bg-canvas", !curr && "bg-canvas opacity-40", tod && "bg-blue-50")}>
                        <div className="flex items-center justify-between">
                          <span className={cn("text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full", tod ? "bg-ink text-white" : "text-stone-400")}>{format(day, 'd')}</span>
                          {note && <span title={note.text} className="text-gold"><StickyNote size={11} /></span>}
                        </div>
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
            <div className="flex items-center justify-end">
              <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
            </div>
            <DriverTimeline drivers={drivers} cars={cars} plans={plans} carAssignments={carAssignments} month={selectedMonth} showCars onEditAssignment={setEditAssignment} onMoveAssignment={moveAssignment} onMovePlanDate={movePlanDate} onMovePlanToCar={movePlanToCar} onResizeAssignment={resizeAssignment} />
          </div>
        )}

        {/* ══════════════════ KEITIMO JUODRAŠTIS ══════════════════ */}
        {activeTab === 'draft' && (() => {
          const homeDrivers = drivers.filter(d => d.status === 'Namuose' && !d.dismissedDate && !d.unneeded);
          const usedIds = new Set(drafts.map(d => d.incomingDriverId));
          const pool = homeDrivers.filter(d => !usedIds.has(d.id));
          // Nereikalingi (namuose) — atskira zona; nesiūlomi, bet matomi blogiausiam atvejui.
          const unneededPool = drivers.filter(d => d.status === 'Namuose' && !d.dismissedDate && d.unneeded && !usedIds.has(d.id));
          // Tik mašinos, kurios keičiasi šią savaitę: dabartinis vairuotojas grįžta
          // iki šios savaitės pabaigos (įskaitant vėluojančius) ir dar nesuplanuota.
          const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
          const boardCars = cars.filter(c => {
            if (c.status !== 'Aktyvus') return false;
            if (drafts.some(d => d.carNumber === c.number)) return true; // jau įdėtas į juodraštį — paliekam matomą
            const cur = drivers.find(d => d.currentCar === c.number && d.status === 'Reise');
            if (!cur || !cur.plannedReturnDate) return false;
            const alreadyPlanned = plans.some(p => p.status === 'Suplanuota' && p.carNumber === c.number);
            if (alreadyPlanned) return false;
            try { return parseISO(cur.plannedReturnDate) <= weekEnd; } catch { return false; }
          });
          const draftFor = (carNumber: string) => drafts.find(d => d.carNumber === carNumber);
          const driverById = (id: string) => drivers.find(d => d.id === id);
          const inits = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('');
          // Optimalaus vairuotojo rekomendacija mašinai: +specializacija (tipas), +įmonė (LT/PL),
          // greitesnis pasiruošimas. Universalus tinka bet kuriam tipui.
          const matchScore = (d: Driver, c: Car) => {
            let s = 0;
            if (d.specialization === c.type) s += 3;
            else if (d.specialization === 'Universalus') s += 1;
            else s -= 3;
            if (d.companyType === c.registration) s += 2;
            return s;
          };
          const recommendFor = (c: Car) => pool
            .map(d => ({ d, s: matchScore(d, c) }))
            .filter(x => x.s > 0)
            .sort((a, b) => b.s - a.s || (a.d.readinessDate || '9').localeCompare(b.d.readinessDate || '9'))[0]?.d;
          const onDropToCar = (carNumber: string, e: React.DragEvent) => {
            e.preventDefault(); setDragOverZone(null);
            const id = e.dataTransfer.getData('driverId');
            if (id) assignDraft(carNumber, id);
          };
          const onDropToPool = (e: React.DragEvent) => {
            e.preventDefault(); setDragOverZone(null);
            const id = e.dataTransfer.getData('driverId');
            const d = drafts.find(x => x.incomingDriverId === id);
            if (d) removeDraft(d.carNumber);
          };
          const driverChip = (d: Driver, from: string) => (
            <div
              draggable
              onDragStart={e => { e.dataTransfer.setData('driverId', d.id); e.dataTransfer.setData('from', from); e.dataTransfer.effectAllowed = 'move'; }}
              className="group flex items-center gap-2.5 bg-surface border border-hairline rounded-xl px-2.5 py-2 cursor-grab active:cursor-grabbing hover:border-ink/30 hover:shadow-card transition-all select-none"
            >
              <GripVertical size={14} className="text-stone-300 group-hover:text-stone-400 shrink-0" />
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0", "bg-emerald-100 text-emerald-700")}>{inits(d.name)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold truncate leading-tight">{d.name}</p>
                <p className="text-[10px] text-muted truncate">{d.companyType} · {t(d.specialization)}{d.readinessDate ? ` · ${t('Galima')} ${d.readinessDate}` : ''}</p>
              </div>
            </div>
          );
          return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Laisvų vairuotojų baseinas */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOverZone('pool'); }}
                onDragLeave={() => setDragOverZone(z => z === 'pool' ? null : z)}
                onDrop={onDropToPool}
                className={cn("lg:col-span-1 bg-canvas/40 rounded-2xl border p-3 self-start", dragOverZone === 'pool' ? "border-gold ring-1 ring-gold/30" : "border-hairline")}
              >
                <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                  <Users size={15} className="text-emerald-500" />
                  <p className="text-sm font-semibold">{t('Laisvi vairuotojai')}</p>
                  <span className="text-xs text-muted">· {pool.length}</span>
                </div>
                <div className="space-y-2 min-h-[80px]">
                  {pool.map(d => <div key={d.id}>{driverChip(d, 'pool')}</div>)}
                  {pool.length === 0 && <p className="text-xs text-muted text-center py-8">{t('Visi vairuotojai paskirstyti')}</p>}
                </div>
              </div>

              {/* Mašinos su drop zonomis */}
              <div className="lg:col-span-2">
                <div className="flex items-center gap-2 px-1 mb-2">
                  <Truck size={15} className="text-ink/70" />
                  <p className="text-sm font-semibold">{t('Šią savaitę keičiasi')}</p>
                  <span className="text-xs text-muted">· {boardCars.length}</span>
                </div>
                {boardCars.length === 0 && (
                  <div className="bg-surface rounded-2xl border border-hairline py-12 px-6 text-center">
                    <CheckCircle2 size={26} className="mx-auto text-emerald-400 mb-2" />
                    <p className="text-sm font-medium text-ink">{t('Šią savaitę keičiamų mašinų nėra')}</p>
                    <p className="text-xs text-muted mt-1">{t('Mašinos atsiranda automatiškai, kai vairuotojas grįžta šią savaitę')}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {boardCars.map(car => {
                    const leaving = drivers.find(d => d.currentCar === car.number && d.status === 'Reise');
                    const dr = draftFor(car.number);
                    const incoming = dr ? driverById(dr.incomingDriverId) : undefined;
                    const ready = !!incoming;
                    return (
                      <div
                        key={car.id}
                        onDragOver={e => { e.preventDefault(); setDragOverZone(car.number); }}
                        onDragLeave={() => setDragOverZone(z => z === car.number ? null : z)}
                        onDrop={e => onDropToCar(car.number, e)}
                        className={cn("rounded-2xl border p-3 transition-all", dragOverZone === car.number ? "border-gold ring-2 ring-gold/30 bg-gold/[0.03]" : ready ? "border-emerald-200 bg-emerald-50/40" : "border-hairline bg-surface")}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", car.status === 'Aktyvus' ? "bg-ink text-gold-soft" : "bg-red-50 text-red-400")}>{car.type === 'Refas' ? <Snowflake className="w-4 h-4" /> : <Container className="w-4 h-4" />}</div>
                          <div className="min-w-0">
                            <p className="font-mono font-bold text-sm leading-tight">{car.number}</p>
                            <p className="text-[10px] text-muted">{[t(car.type), car.brand].filter(Boolean).join(' · ')}</p>
                          </div>
                          {ready && incoming && matchScore(incoming, car) >= 3 && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded-full"><Check size={10} />{t('Optimalu')}</span>}
                          {ready && <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 size={12} />{t('Keitimas paruoštas')}</span>}
                        </div>

                        {/* Nuima (dabartinis) */}
                        <div className="flex items-center gap-2 text-[11px] text-muted mb-1.5">
                          <span className="uppercase tracking-wide text-[9px] font-bold text-stone-400 w-12 shrink-0">{t('Dabar')}</span>
                          {leaving ? <span className="font-medium text-ink/80">{leaving.name}</span> : <span className="italic">{t('Laisva')}</span>}
                        </div>

                        {/* Pakeičia (drop) */}
                        <div className="flex items-center gap-2">
                          <span className="uppercase tracking-wide text-[9px] font-bold text-stone-400 w-12 shrink-0">{t('Naujas')}</span>
                          {incoming
                            ? <div className="flex-1 flex items-center gap-1">{driverChip(incoming, car.number)}<button onClick={() => removeDraft(car.number)} className="p-1.5 text-muted hover:text-red-500 transition-colors shrink-0"><X size={13} /></button></div>
                            : (() => {
                                const rec = recommendFor(car);
                                if (!rec) return <div className="flex-1 border-2 border-dashed border-hairline rounded-xl px-3 py-2.5 text-center text-[11px] text-stone-400">{t('Vilkite čia vairuotoją')}</div>;
                                return (
                                  <button onClick={() => assignDraft(car.number, rec.id)} className="flex-1 flex items-center gap-2 border-2 border-dashed border-gold/50 bg-gold/[0.04] hover:bg-gold/10 rounded-xl px-2.5 py-2 text-left transition-all">
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-gold bg-gold/15 px-1.5 py-0.5 rounded-full shrink-0">✨ {t('Siūloma')}</span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[12px] font-semibold truncate leading-tight">{rec.name}</p>
                                      <p className="text-[10px] text-muted truncate">{rec.companyType} · {t(rec.specialization)}</p>
                                    </div>
                                    <Plus size={14} className="text-gold shrink-0" />
                                  </button>
                                );
                              })()}
                        </div>

                        {dr && (
                          <div className="mt-2 pt-2 border-t border-hairline flex items-center gap-2">
                            <span className="text-[10px] text-muted">{t('Keitimo data')}</span>
                            <input type="date" value={dr.date} onChange={e => setDraftDate(car.number, e.target.value)} className="text-xs bg-canvas border border-hairline rounded-lg px-2 py-1 focus:outline-none focus:border-ink/40" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Nereikalingi — sulankstoma zona (paspaudus pamatyti; blogiausiam atvejui) */}
            <div className="bg-canvas/40 rounded-2xl border border-hairline overflow-hidden">
              <button onClick={() => setShowUnneeded(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-stone-50 transition-colors">
                <Ban size={15} className="text-stone-400" />
                <p className="text-sm font-semibold">{t('Nereikalingi')}</p>
                <span className="text-xs text-muted">· {unneededPool.length}</span>
                <span className="ml-auto text-[11px] text-muted">{showUnneeded ? t('Slėpti') : t('Rodyti')}</span>
                <ChevronDown size={16} className={cn('text-muted transition-transform', showUnneeded && 'rotate-180')} />
              </button>
              {showUnneeded && (
                <div className="px-4 pb-4">
                  {unneededPool.length === 0
                    ? <p className="text-xs text-muted text-center py-4">{t('Nereikalingų vairuotojų nėra')}</p>
                    : <>
                        <p className="text-[11px] text-muted mb-2">{t('Šie vairuotojai nesiūlomi automatiškai, bet juos galima įtraukti rankiniu būdu.')}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {unneededPool.map(d => <div key={d.id} className="opacity-75 hover:opacity-100 transition-opacity">{driverChip(d, 'pool')}</div>)}
                        </div>
                      </>}
                </div>
              )}
            </div>

            {/* Peržiūra + patvirtinimas */}
            <div className="bg-surface rounded-2xl border border-hairline p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-gold" />
                  <p className="text-sm font-semibold">{t('Peržiūra')}</p>
                  <span className="text-xs text-muted">· {drafts.length} {drafts.length === 1 ? t('keitimas') : t('keitimai')}</span>
                </div>
                {drafts.length > 0 && <button onClick={clearDrafts} className="text-xs text-muted hover:text-red-500 transition-colors">{t('Išvalyti juodraštį')}</button>}
              </div>
              {drafts.length === 0
                ? <p className="text-sm text-muted text-center py-6">{t('Juodraštyje keitimų nėra')}</p>
                : (
                  <div className="space-y-2">
                    {drafts.map(dr => {
                      const car = cars.find(c => c.number === dr.carNumber);
                      const incoming = driverById(dr.incomingDriverId);
                      const leaving = drivers.find(d => d.currentCar === dr.carNumber && d.status === 'Reise');
                      return (
                        <div key={dr.carNumber} className="flex items-center gap-3 bg-canvas/50 border border-hairline rounded-xl px-3 py-2.5 text-sm">
                          <span className="font-mono font-bold bg-ink/[0.06] px-2 py-0.5 rounded shrink-0">{dr.carNumber}</span>
                          {car && <span className="text-[10px] text-muted hidden sm:inline">{t(car.type)}</span>}
                          <span className="flex items-center gap-2 min-w-0 flex-1 justify-center">
                            <span className="text-red-500/80 truncate">{leaving ? `${t('Nuima')}: ${leaving.name}` : t('Laisva')}</span>
                            <ArrowRight size={14} className="text-muted shrink-0" />
                            <span className="text-emerald-600 font-semibold truncate">{incoming?.name}</span>
                          </span>
                          <span className="font-mono text-xs text-muted shrink-0">{dr.date}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              <button
                onClick={() => askConfirm({
                  title: t('Patvirtinti keitimus?'),
                  confirmLabel: t('Taip, suplanuoti'),
                  message: (
                    <div className="space-y-1.5">
                      <p>{t('Šie keitimai bus suplanuoti ir perduoti tolesniems žingsniams:')}</p>
                      <ul className="mt-2 space-y-1">
                        {drafts.map(dr => {
                          const inc = driverById(dr.incomingDriverId);
                          const lv = drivers.find(x => x.currentCar === dr.carNumber && x.status === 'Reise');
                          return <li key={dr.carNumber} className="flex items-center gap-2 text-xs bg-canvas border border-hairline rounded-lg px-2.5 py-1.5">
                            <span className="font-mono font-semibold">{dr.carNumber}</span>
                            <span className="text-muted truncate">{lv ? lv.name : '—'} → <span className="text-emerald-600 font-semibold">{inc?.name}</span></span>
                            <span className="ml-auto font-mono text-muted shrink-0">{dr.date}</span>
                          </li>;
                        })}
                      </ul>
                    </div>
                  ),
                  onConfirm: confirmDrafts,
                })}
                disabled={drafts.length === 0}
                className="w-full mt-4 inline-flex items-center justify-center gap-2 bg-ink text-white py-3 rounded-xl text-sm font-bold hover:bg-ink/85 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 size={16} /> {t('Patvirtinti ir suplanuoti')}
              </button>
            </div>
          </div>
          );
        })()}

        {/* ══════════════════ KOORDINATORIUS (keitimo taškai) ══════════════════ */}
        {activeTab === 'coordinator' && (
          <div className="space-y-5">
            {!canCoordinate && <ReadOnlyNotice text={t('Tik stebėjimas — redaguoti negalite')} />}
            <PageBanner h="xtall" bg={<EuropeMap className="w-full h-full opacity-90" />} eyebrow="Koordinavimas" title="Keitimo taškai Europoje" subtitle="Pažymėkite, kur įvyks pamaina — taškai keliauja į Kelionę" />
            <CoordinatorBoard
              plans={plans} cars={cars} drivers={drivers} taskPoints={taskPoints}
              onSetPoint={setPlanChangePoint} onClearPoint={clearPlanChangePoint} onSetPlanTask={setPlanChangeTask}
              onAddTask={addTaskPoint} onUpdateTask={updateTaskPoint} onDeleteTask={deleteTaskPoint} onActivateSaved={activateSavedTask}
              onGoTrip={() => setActiveTab('trip')}
            />
          </div>
        )}

        {/* ══════════════════ KELIONĖ (žemėlapis) ══════════════════ */}
        {activeTab === 'trip' && (
          <div className="space-y-5">
            {!canEdit && <ReadOnlyNotice text={role === 'coordinator' ? t('Redaguoti galite tik Koordinatoriaus skiltyje') : t('Tik stebėjimas — redaguoti negalite')} />}
            <PageBanner h="xtall" bg={<EuropeMap className="w-full h-full opacity-90" />}
              eyebrow="Logistika" title="Keitimo kelionės planavimas" subtitle="Mikroautobusai, maršrutai ir užduotys viename žemėlapyje" />
            <TripPlanner drivers={drivers} plans={plans} cars={cars} taskPoints={taskPoints} onConsumeTask={(id) => updateTaskPoint(id, { active: false })} showToast={(msg, type) => setToast({ message: msg, type: type ?? 'success' })} />
          </div>
        )}

        {/* Reset — tik pilnų teisių vartotojas */}
        {isAdmin && (
        <div className="text-center pt-4">
          <button onClick={() => { if (confirm('Atstatyti sistemą? Visi duomenys bus prarasti.')) { setDrivers(INITIAL_DRIVERS); setCars(INITIAL_CARS); setHistory([]); setPlans([]); setCarAssignments([]); localStorage.clear(); showToast('Sistema atstatyta'); }}} className="text-[10px] font-bold text-stone-300 hover:text-stone-500 transition-colors uppercase tracking-widest">
            Sistemos atstatymas
          </button>
        </div>
        )}
      </main>

      {/* ══════════════════ MODALS ══════════════════ */}

      {/* Add Driver */}
      {/* ── Excel importas ── */}
      {importOpen && (
        <div className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-surface w-full max-w-3xl rounded-3xl shadow-float border border-hairline overflow-hidden slide-in-from-bottom-4 flex flex-col max-h-[88vh]">
            <div className="px-6 py-5 flex items-center justify-between border-b border-hairline shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-ink flex items-center justify-center"><FileSpreadsheet size={17} className="text-gold-soft" /></div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight">{t('Importuoti vairuotojų sąrašą')}</h2>
                  <p className="text-[11px] text-muted">{t('Excel (.xlsx / .xls) arba .csv · duomenys atsinaujins sistemoje')}</p>
                </div>
              </div>
              <button onClick={() => setImportOpen(false)} className="p-1.5 text-muted hover:text-ink hover:bg-stone-100 rounded-lg transition-colors"><X size={16} /></button>
            </div>

            <div className="px-6 py-5 overflow-y-auto">
              {importRows.length === 0 ? (
                <>
                  <label className="block cursor-pointer">
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.currentTarget.value = ''; }} />
                    <div className="border-2 border-dashed border-hairline hover:border-gold/60 rounded-2xl p-10 text-center transition-colors bg-canvas">
                      <Upload size={28} className="mx-auto text-muted mb-3" />
                      <p className="text-sm font-semibold text-ink">{t('Pasirinkite Excel failą')}</p>
                      <p className="text-xs text-muted mt-1">{t('Stulpeliai atpažįstami automatiškai: Pavardė, Vardas, Tel, Paso galiojimo data, Teisių galiojimas, 95 kodo, Tacho kortelės, LLGL / Viza, ADR, Asmens kodas…')}</p>
                    </div>
                  </label>
                  {importErr && <p className="mt-4 text-xs font-medium text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{importErr}</p>}

                  {/* Pavyzdiniai šablonai — LT ir PL įmonių dokumentai skiriasi */}
                  <div className="mt-4 rounded-2xl border border-hairline bg-canvas p-4">
                    <p className="text-xs font-semibold text-ink mb-0.5">{t('Nežinote formato? Atsisiųskite pavyzdį')}</p>
                    <p className="text-[11px] text-muted mb-3">{t('LT ir PL įmonių dokumentai skiriasi: LT — LLGL, PL — Viza; abiem — ADR. Užpildykite šabloną ir įkelkite.')}</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => downloadTemplate('LT')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-hairline bg-surface text-xs font-semibold text-ink hover:border-ink/40 hover:bg-ink hover:text-white transition-all"><Download size={13} /> {t('LT įmonės šablonas')}</button>
                      <button onClick={() => downloadTemplate('PL')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-hairline bg-surface text-xs font-semibold text-ink hover:border-ink/40 hover:bg-ink hover:text-white transition-all"><Download size={13} /> {t('PL įmonės šablonas')}</button>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-2 text-[11px] text-muted bg-gold/5 border border-gold/20 rounded-xl px-3 py-2.5">
                    <ShieldCheck size={14} className="text-gold shrink-0 mt-0.5" />
                    <span>{t('Atitikimas pagal Asmens kodą (jei nėra — DS numerį, tada vardą+pavardę). Esami vairuotojai atnaujinami, nauji — pridedami. Reiso būsenos ir istorija nekeičiamos.')}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg">+{importDiff.created} {t('nauji')}</span>
                    <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">{importDiff.updated} {t('atnaujinami')}</span>
                    <span className="text-xs text-muted ml-1">{importMeta?.fileName} · {importRows.length} {t('eilutės')}</span>
                    <button onClick={() => { setImportRows([]); setImportMeta(null); }} className="ml-auto text-xs text-muted hover:text-ink underline">{t('Kitas failas')}</button>
                  </div>
                  <div className="rounded-xl border border-hairline overflow-hidden overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-ink text-white text-left">
                        <th className="px-3 py-2 font-bold">{t('Vairuotojas')}</th>
                        <th className="px-3 py-2 font-bold">{t('Įmonė/Tipas')}</th>
                        <th className="px-3 py-2 font-bold">{t('Pasas')}</th>
                        <th className="px-3 py-2 font-bold">{t('Teisės')}</th>
                        <th className="px-3 py-2 font-bold">95 k.</th>
                        <th className="px-3 py-2 font-bold">{t('Tacho')}</th>
                        <th className="px-3 py-2 font-bold">ADR</th>
                        <th className="px-3 py-2 font-bold">LLGL/Viza</th>
                      </tr></thead>
                      <tbody>
                        {importRows.slice(0, 60).map((p, i) => {
                          const cell = (iso?: string) => {
                            const s = docState(iso).state;
                            return <td className={cn('px-3 py-2 whitespace-nowrap font-mono', s === 'expired' ? 'text-red-600 font-bold' : s === 'soon' ? 'text-amber-600 font-semibold' : 'text-muted')}>{iso || '—'}</td>;
                          };
                          return (
                            <tr key={i} className="border-t border-hairline odd:bg-canvas/40">
                              <td className="px-3 py-2"><span className="font-semibold text-ink">{p.name}</span>{p.docs.personalCode && <span className="block text-[10px] text-muted font-mono">{p.docs.personalCode}</span>}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{p.companyType} · {p.specialization}</td>
                              {cell(p.docs.passportExpiry)}
                              {cell(p.docs.licenseExpiry)}
                              {cell(p.docs.code95Expiry)}
                              {cell(p.docs.tachoCardExpiry)}
                              {cell(p.docs.adrExpiry)}
                              {cell(p.companyType === 'PL' ? p.docs.visaExpiry : p.docs.llglExpiry)}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 60 && <p className="text-[11px] text-muted mt-2">{t('Rodoma 60 iš')} {importRows.length}. {t('Importuojami visi.')}</p>}
                </>
              )}
            </div>

            {importRows.length > 0 && (
              <div className="px-6 py-4 border-t border-hairline flex items-center justify-end gap-2 shrink-0">
                <button onClick={() => setImportOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-ink hover:bg-stone-100 transition-colors">{t('Atšaukti')}</button>
                <button onClick={applyImport} className="inline-flex items-center gap-2 bg-ink text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-ink/85 transition-all"><FileCheck2 size={15} /> {t('Importuoti į sistemą')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Automobilių Excel importas ── */}
      {carImportOpen && (
        <div className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-surface w-full max-w-2xl rounded-3xl shadow-float border border-hairline overflow-hidden slide-in-from-bottom-4 flex flex-col max-h-[88vh]">
            <div className="px-6 py-5 flex items-center justify-between border-b border-hairline shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-ink flex items-center justify-center"><FileSpreadsheet size={17} className="text-gold-soft" /></div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight">{t('Importuoti automobilių sąrašą')}</h2>
                  <p className="text-[11px] text-muted">{t('Excel (.xlsx / .xls) arba .csv · duomenys atsinaujins sistemoje')}</p>
                </div>
              </div>
              <button onClick={() => setCarImportOpen(false)} className="p-1.5 text-muted hover:text-ink hover:bg-stone-100 rounded-lg transition-colors"><X size={16} /></button>
            </div>

            <div className="px-6 py-5 overflow-y-auto">
              {carImportRows.length === 0 ? (
                <>
                  <label className="block cursor-pointer">
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCarImportFile(f); e.currentTarget.value = ''; }} />
                    <div className="border-2 border-dashed border-hairline hover:border-gold/60 rounded-2xl p-10 text-center transition-colors bg-canvas">
                      <Upload size={28} className="mx-auto text-muted mb-3" />
                      <p className="text-sm font-semibold text-ink">{t('Pasirinkite Excel failą')}</p>
                      <p className="text-xs text-muted mt-1">{t('Stulpeliai atpažįstami automatiškai: Mašinos nr, Markė, Ref/Tent, Gamybos metai, Registracija.')}</p>
                    </div>
                  </label>
                  {carImportErr && <p className="mt-4 text-xs font-medium text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{carImportErr}</p>}

                  <div className="mt-4 rounded-2xl border border-hairline bg-canvas p-4">
                    <p className="text-xs font-semibold text-ink mb-0.5">{t('Nežinote formato? Atsisiųskite pavyzdį.')}</p>
                    <p className="text-[11px] text-muted mb-3">{t('Užpildykite šabloną (Mašinos nr · Markė · Ref/Tent · Gamybos metai) ir įkelkite atgal.')}</p>
                    <button onClick={downloadCarTemplate} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-hairline bg-surface text-xs font-semibold text-ink hover:border-ink/40 hover:bg-ink hover:text-white transition-all"><Download size={13} /> {t('Automobilių šablonas')}</button>
                  </div>
                  <div className="mt-4 flex items-start gap-2 text-[11px] text-muted bg-gold/5 border border-gold/20 rounded-xl px-3 py-2.5">
                    <ShieldCheck size={14} className="text-gold shrink-0 mt-0.5" />
                    <span>{t('Atitikimas pagal Mašinos nr. Esami automobiliai atnaujinami, nauji — pridedami (būsena „Aktyvus"). Vairuotojų priskyrimai nekeičiami.')}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg">+{carImportDiff.created} {t('nauji')}</span>
                    <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">{carImportDiff.updated} {t('atnaujinami')}</span>
                    <span className="text-xs text-muted ml-1">{carImportMeta?.fileName} · {carImportRows.length} {t('eilutės')}</span>
                    <button onClick={() => { setCarImportRows([]); setCarImportMeta(null); }} className="ml-auto text-xs text-muted hover:text-ink underline">{t('Kitas failas')}</button>
                  </div>
                  <div className="rounded-xl border border-hairline overflow-hidden overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-ink text-white text-left">
                        <th className="px-3 py-2 font-bold">{t('Mašinos nr')}</th>
                        <th className="px-3 py-2 font-bold">{t('Markė')}</th>
                        <th className="px-3 py-2 font-bold">{t('Tipas')}</th>
                        <th className="px-3 py-2 font-bold">{t('Metai')}</th>
                        <th className="px-3 py-2 font-bold">{t('Reg.')}</th>
                      </tr></thead>
                      <tbody>
                        {carImportRows.slice(0, 80).map((p, i) => (
                          <tr key={i} className="border-t border-hairline odd:bg-canvas/40">
                            <td className="px-3 py-2 font-mono font-semibold text-ink">{p.number}</td>
                            <td className="px-3 py-2">{p.brand || '—'}</td>
                            <td className="px-3 py-2">{t(p.type)}</td>
                            <td className="px-3 py-2 font-mono">{p.year || '—'}</td>
                            <td className="px-3 py-2">{p.registration}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {carImportRows.length > 80 && <p className="text-[11px] text-muted mt-2">{t('Rodoma 80 iš')} {carImportRows.length}. {t('Importuojami visi.')}</p>}
                </>
              )}
            </div>

            {carImportRows.length > 0 && (
              <div className="px-6 py-4 border-t border-hairline flex items-center justify-end gap-2 shrink-0">
                <button onClick={() => setCarImportOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-ink hover:bg-stone-100 transition-colors">{t('Atšaukti')}</button>
                <button onClick={applyCarImport} className="inline-flex items-center gap-2 bg-ink text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-ink/85 transition-all"><FileCheck2 size={15} /> {t('Importuoti į sistemą')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bendras patvirtinimo langas (taip/ne) ── */}
      {confirmAsk && (
        <Modal title={confirmAsk.title} onClose={() => setConfirmAsk(null)}>
          <div className="space-y-4">
            <div className="text-sm text-ink">{confirmAsk.message}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmAsk(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-ink hover:bg-stone-100 transition-colors">{t('Atšaukti')}</button>
              <button onClick={() => { const fn = confirmAsk.onConfirm; setConfirmAsk(null); fn(); }} className={cn("inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all", confirmAsk.danger ? "bg-red-600 hover:bg-red-700" : "bg-ink hover:bg-ink/85")}>
                <Check size={15}/> {confirmAsk.confirmLabel || t('Patvirtinti')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Rolių valdymas (tik pilnų teisių vartotojui) ── */}
      {roleAdminOpen && isAdmin && (
        <Modal title={t('Vartotojų rolės')} onClose={() => setRoleAdminOpen(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void assignRole(f.get('email') as string, f.get('role') as Role); }}>
            <div className="flex items-start gap-2 text-[11px] text-muted bg-gold/5 border border-gold/20 rounded-xl px-3 py-2.5">
              <ShieldCheck size={14} className="text-gold shrink-0 mt-0.5" />
              <span>{t('Rolė rišama prie paskyros; vartotojas jos pats pakeisti negali.')}</span>
            </div>
            <Field label={t('Vartotojo el. paštas')}><input name="email" type="email" required placeholder="vardas@imone.lt" className={inputCls} /></Field>
            <Field label={t('Pasirinkite rolę')}>
              <select name="role" required defaultValue="" className={selectCls}>
                <option value="" disabled>{t('Pasirinkite rolę')}</option>
                <option value="replacement">{t('Keitimų vadybininkas')}</option>
                <option value="coordinator">{t('Koordinatorius')}</option>
                <option value="transport">{t('Transporto vadybininkas')}</option>
              </select>
            </Field>
            <button type="submit" className="w-full inline-flex items-center justify-center gap-2 bg-ink text-white py-2.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition-colors"><UserCog size={15} /> {t('Priskirti rolę')}</button>
          </form>
          {kurejasUnlocked && (
            <button type="button" onClick={() => { lockKurejas(); setRoleAdminOpen(false); showToast(t('Kūrėjo režimas išjungtas')); }} className="mt-3 w-full inline-flex items-center justify-center gap-2 border border-hairline text-muted py-2.5 rounded-xl font-semibold text-sm hover:text-ink hover:border-ink/25 transition-colors"><Lock size={14} /> {t('Išjungti Kūrėjo režimą')}</button>
          )}
        </Modal>
      )}

      {/* ── Kūrėjo prieiga (slaptu kodu) ── */}
      {kurejasCodeOpen && (
        <Modal title={t('Kūrėjo prieiga')} onClose={() => setKurejasCodeOpen(false)}>
          <form className="space-y-4" onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = unlockKurejas((f.get('code') as string) || '');
            if (ok) { showToast(t('Kūrėjo režimas įjungtas')); setKurejasCodeOpen(false); }
            else showToast(t('Neteisingas kodas'), 'error');
          }}>
            <div className="flex items-start gap-2 text-[11px] text-muted bg-gold/5 border border-gold/20 rounded-xl px-3 py-2.5">
              <ShieldCheck size={14} className="text-gold shrink-0 mt-0.5" />
              <span>{t('Kūrėjo rolė suteikia pilną prieigą prie visų pakeitimų, rolių valdymo ir sistemos atstatymo.')}</span>
            </div>
            <Field label={t('Kūrėjo kodas')}>
              <input name="code" type="password" inputMode="numeric" autoFocus required placeholder="••••" className={cn(inputCls, 'tracking-[0.4em] text-center font-mono')} />
            </Field>
            <button type="submit" className="w-full inline-flex items-center justify-center gap-2 bg-ink text-white py-2.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition-colors"><ShieldCheck size={15} /> {t('Įjungti Kūrėjo režimą')}</button>
          </form>
        </Modal>
      )}

      {addDriverOpen && (
        <Modal title={t('Naujas vairuotojas')} onClose={() => setAddDriverOpen(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); addDriver({ name: f.get('name') as string, phone: f.get('phone') as string, status: 'Namuose', currentCar: 'Nėra', startDate: null, plannedReturnDate: null, homeStatus: 'Poilsis', readinessDate: format(new Date(), 'yyyy-MM-dd'), companyType: f.get('companyType') as RegistrationType, specialization: f.get('specialization') as DriverSpecialization }); }}>
            <Field label={t('Vardas Pavardė')}><input name="name" required placeholder={t('Vardas Pavardė')} className={inputCls} /></Field>
            <Field label={t('Telefonas')}><input name="phone" required placeholder="+370 ..." className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Įmonė')}><select name="companyType" required className={selectCls}><option value="LT">LT</option><option value="PL">PL</option></select></Field>
              <Field label={t('Tipas')}><select name="specialization" required className={selectCls}><option value="Tentas">{t('Tentas')}</option><option value="Refas">{t('Refas')}</option><option value="Universalus">{t('Universalus')}</option></select></Field>
            </div>
            <button type="submit" className="w-full bg-ink text-white py-2.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition-colors">{t('Pridėti')}</button>
          </form>
        </Modal>
      )}

      {/* Add Car */}
      {addCarOpen && (
        <Modal title={t('Naujas automobilis')} onClose={() => setAddCarOpen(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); addCar({ number: (f.get('number') as string).toUpperCase(), status: 'Aktyvus', type: f.get('type') as CarType, registration: f.get('registration') as RegistrationType, activeFrom: f.get('activeFrom') as string }); }}>
            <Field label={t('Numeris')}><input name="number" required placeholder="ABC 123" className={cn(inputCls, 'uppercase font-mono')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Registracija')}><select name="registration" required className={selectCls}><option value="LT">LT</option><option value="PL">PL</option></select></Field>
              <Field label={t('Tipas')}><select name="type" required className={selectCls}><option value="Tentas">{t('Tentas')}</option><option value="Refas">{t('Refas')}</option></select></Field>
            </div>
            <Field label={t('Aktyvus nuo')}><input name="activeFrom" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} className={inputCls} /></Field>
            <button type="submit" className="w-full bg-ink text-white py-2.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition-colors">{t('Pridėti')}</button>
          </form>
        </Modal>
      )}

      {/* Edit Car */}
      {editCarOpen && selectedCarForEdit && (
        <Modal title={`${t('Redaguoti')}: ${selectedCarForEdit.number}`} onClose={() => { setEditCarOpen(false); setSelectedCarForEdit(null); }}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); updateCar(selectedCarForEdit.id, { number: f.get('number') as string, type: f.get('type') as CarType, registration: f.get('registration') as RegistrationType, status: f.get('status') as 'Aktyvus' | 'Remontas' }); }}>
            <Field label={t('Numeris')}><input name="number" required defaultValue={selectedCarForEdit.number} className={cn(inputCls, 'uppercase')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Registracija')}><select name="registration" required defaultValue={selectedCarForEdit.registration} className={selectCls}><option value="LT">LT</option><option value="PL">PL</option></select></Field>
              <Field label={t('Tipas')}><select name="type" required defaultValue={selectedCarForEdit.type} className={selectCls}><option value="Tentas">{t('Tentas')}</option><option value="Refas">{t('Refas')}</option></select></Field>
            </div>
            <Field label={t('Būsena')}><select name="status" defaultValue={selectedCarForEdit.status} className={selectCls}><option value="Aktyvus">{t('Aktyvus')}</option><option value="Remontas">{t('Remontas')}</option></select></Field>
            <button type="submit" className="w-full bg-ink text-white py-2.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition-colors">{t('Išsaugoti')}</button>
          </form>
        </Modal>
      )}

      {/* Send to Trip */}
      {tripOpen && (selectedDriverForTrip || selectedCarForAssignment) && (
        <Modal title={selectedDriverForTrip ? `${t('Į reisą')}: ${selectedDriverForTrip.name}` : `${t('Priskirti')}: ${selectedCarForAssignment}`} onClose={() => { setTripOpen(false); setSelectedDriverForTrip(null); setSelectedCarForAssignment(null); }}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const did = selectedDriverForTrip?.id || f.get('driverId') as string; const car = selectedCarForAssignment || f.get('car') as string; sendToTrip(did, car, f.get('startDate') as string, f.get('returnDate') as string); }}>
            {!selectedDriverForTrip && <Field label={t('Vairuotojas')}><select name="driverId" required className={selectCls}><option value="">{t('Pasirinkite...')}</option>{drivers.filter(d => d.status === 'Namuose' && !d.dismissedDate).map(d => <option key={d.id} value={d.id}>{d.name} ({d.companyType} • {t(d.specialization)}){d.unneeded ? ` • ${t('nereikalingas')}` : ''}</option>)}</select></Field>}
            {!selectedCarForAssignment && <Field label={t('Automobilis')}><select name="car" required className={selectCls}>{cars.map(c => <option key={c.id} value={c.number}>{c.number} ({c.registration} • {t(c.type)})</option>)}</select></Field>}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Pradžia')}><input name="startDate" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} className={inputCls} /></Field>
              <Field label={t('Planuojama pabaiga')}><input name="returnDate" type="date" required defaultValue={format(addDays(new Date(), 42), 'yyyy-MM-dd')} className={inputCls} /></Field>
            </div>
            <button type="submit" className="w-full bg-ink text-white py-2.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition-colors">{t('Patvirtinti')}</button>
          </form>
        </Modal>
      )}

      {/* Send Home */}
      {homeOpen && selectedDriverForHome && (
        <Modal title={`${t('Namo')}: ${selectedDriverForHome.name}`} onClose={() => { setHomeOpen(false); setSelectedDriverForHome(null); }}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); sendHome(selectedDriverForHome.id, f.get('status') as HomeStatus, f.get('readinessDate') as string); }}>
            <Field label={t('Būsena namuose')}><select name="status" required className={selectCls}><option value="Poilsis">{t('Poilsis')}</option><option value="Tvarko dokumentus">{t('Tvarko dokumentus')}</option></select></Field>
            <Field label={t('Gali nuo')}><input name="readinessDate" type="date" required defaultValue={format(addDays(new Date(), 14), 'yyyy-MM-dd')} className={inputCls} /></Field>
            <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors">{t('Patvirtinti')}</button>
          </form>
        </Modal>
      )}

      {/* Atleidimas: pasirinkti atleidimo datą */}
      {dismissOpen && selectedDriverForDismiss && (
        <Modal title={`${t('Atleisti')}: ${selectedDriverForDismiss.name}`} onClose={() => { setDismissOpen(false); setSelectedDriverForDismiss(null); }}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); dismissDriver(selectedDriverForDismiss.id, f.get('dismissedDate') as string); }}>
            <div className="flex items-start gap-2 text-[11px] text-muted bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <UserX size={14} className="text-red-500 shrink-0 mt-0.5" />
              <span>{t('Vairuotojas bus perkeltas į „Atleisti" skiltį ir nuimtas nuo mašinos. Vėliau jį galima grąžinti.')}</span>
            </div>
            <Field label={t('Atleistas nuo')}><input name="dismissedDate" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} className={inputCls} /></Field>
            <button type="submit" className="w-full inline-flex items-center justify-center gap-2 bg-red-500 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-red-600 transition-colors"><UserX size={15} /> {t('Atleisti')}</button>
          </form>
        </Modal>
      )}

      {/* Edit Driver */}
      {editDriverOpen && selectedDriverForEdit && (
        <Modal title={`${t('Redaguoti')}: ${selectedDriverForEdit.name}`} onClose={() => { setEditDriverOpen(false); setSelectedDriverForEdit(null); }}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); updateDriver(selectedDriverForEdit.id, { name: f.get('name') as string, phone: f.get('phone') as string, status: f.get('status') as DriverStatus, currentCar: f.get('car') as string, startDate: (f.get('startDate') as string) || null, plannedReturnDate: (f.get('returnDate') as string) || null, homeStatus: f.get('homeStatus') as HomeStatus, readinessDate: (f.get('readinessDate') as string) || null, companyType: f.get('companyType') as RegistrationType, specialization: f.get('specialization') as DriverSpecialization }); setEditDriverOpen(false); showToast(t('Duomenys atnaujinti')); }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Vardas')}><input name="name" required defaultValue={selectedDriverForEdit.name} className={inputCls} /></Field>
              <Field label={t('Tel.')}><input name="phone" required defaultValue={selectedDriverForEdit.phone} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Įmonė')}><select name="companyType" required defaultValue={selectedDriverForEdit.companyType} className={selectCls}><option value="LT">LT</option><option value="PL">PL</option></select></Field>
              <Field label={t('Tipas')}><select name="specialization" required defaultValue={selectedDriverForEdit.specialization} className={selectCls}><option value="Tentas">{t('Tentas')}</option><option value="Refas">{t('Refas')}</option><option value="Universalus">{t('Universalus')}</option></select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Būsena')}><select name="status" defaultValue={selectedDriverForEdit.status} className={selectCls}><option value="Reise">{t('Reise')}</option><option value="Namuose">{t('Namuose')}</option></select></Field>
              <Field label={t('Auto')}><input name="car" defaultValue={selectedDriverForEdit.currentCar} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Pradžia')}><input name="startDate" type="date" defaultValue={selectedDriverForEdit.startDate || ''} className={inputCls} /></Field>
              <Field label={t('Grįžta')}><input name="returnDate" type="date" defaultValue={selectedDriverForEdit.plannedReturnDate || ''} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Namų būsena')}><select name="homeStatus" defaultValue={selectedDriverForEdit.homeStatus} className={selectCls}><option value="Nėra">{t('Nėra')}</option><option value="Poilsis">{t('Poilsis')}</option><option value="Tvarko dokumentus">{t('Tvarko dokumentus')}</option></select></Field>
              <Field label={t('Gali nuo')}><input name="readinessDate" type="date" defaultValue={selectedDriverForEdit.readinessDate || ''} className={inputCls} /></Field>
            </div>
            <button type="submit" className="w-full bg-ink text-white py-2.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition-colors">{t('Išsaugoti')}</button>
          </form>
        </Modal>
      )}

      {/* Calendar Day Detail */}
      {selectedCalendarDay && (() => {
        const sel = parseISO(selectedCalendarDay);
        const wStart = startOfWeek(sel, { weekStartsOn: 1 });
        const wEnd = endOfWeek(sel, { weekStartsOn: 1 });
        const weekDays = eachDayOfInterval({ start: wStart, end: wEnd });
        const weekPlans = plans.filter(p => { const d = parseISO(p.date); return !isBefore(d, wStart) && !isAfter(d, wEnd); });
        const note = calendarNotes.find(n => n.date === selectedCalendarDay);
        return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={(e) => e.target === e.currentTarget && setSelectedCalendarDay(null)}>
          <div className="bg-surface w-full max-w-xl rounded-3xl shadow-float overflow-hidden">
            {/* Antraštė su savaitės juosta */}
            <div className="px-6 py-4 bg-ink text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-lg font-medium capitalize">{format(sel, 'EEEE, MMMM d', { locale: dfLocale })}</p>
                  <p className="text-[10px] text-gold-soft uppercase tracking-[0.18em] mt-0.5">Savaitė {format(wStart, 'MM.dd')}–{format(wEnd, 'MM.dd')} · {weekPlans.length} keitimai</p>
                </div>
                <button onClick={() => setSelectedCalendarDay(null)} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={16}/></button>
              </div>
              <div className="grid grid-cols-7 gap-1 mt-3">
                {weekDays.map(d => {
                  const ds = format(d, 'yyyy-MM-dd');
                  const cnt = plans.filter(p => p.date === ds).length;
                  const isSel = ds === selectedCalendarDay;
                  return (
                    <button key={ds} onClick={() => setSelectedCalendarDay(ds)} className={cn("rounded-lg py-1.5 text-center transition-all", isSel ? "bg-gold text-ink" : "bg-white/5 hover:bg-white/10")}>
                      <div className="text-[8px] uppercase opacity-70">{format(d, 'EEEEEE', { locale: dfLocale })}</div>
                      <div className="text-sm font-semibold leading-tight">{format(d, 'd')}</div>
                      <div className={cn("text-[8px] font-bold leading-none", cnt > 0 ? (isSel ? "text-ink/70" : "text-gold-soft") : "opacity-0")}>{cnt || '·'}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[55vh] overflow-y-auto">
              {/* Pasirinktos dienos keitimai */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Šios dienos keitimai</p>
                <div className="space-y-2">
                  {plans.filter(p => p.date === selectedCalendarDay).map(plan => {
                    const car = cars.find(c => c.number === plan.carNumber);
                    return (
                      <div key={plan.id} className="border border-hairline rounded-xl p-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono font-bold bg-ink text-white px-2 py-0.5 rounded text-xs">{plan.carNumber}</span>
                          <div className="flex items-center gap-1.5">
                            {car && <Badge variant="blue">{car.type}</Badge>}
                            <Badge variant={plan.status === 'Suplanuota' ? 'blue' : 'green'}>{plan.status}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <div><p className="text-[9px] text-red-500 font-bold uppercase mb-0.5">Namo</p><p className="font-semibold text-sm">{plan.leavingDriverName}</p></div>
                          <ArrowRight size={16} className="text-stone-300 shrink-0"/>
                          <div className="text-right"><p className="text-[9px] text-emerald-500 font-bold uppercase mb-0.5">Į reisą</p><p className="font-semibold text-sm">{plan.incomingDriverName}</p></div>
                        </div>
                        {plan.changeLocation && <p className="text-[11px] text-muted mt-2 pt-2 border-t border-hairline">📍 {plan.changeLocation}{plan.changeTask ? ` · 📦 ${plan.changeTask}` : ''}</p>}
                      </div>
                    );
                  })}
                  {plans.filter(p => p.date === selectedCalendarDay).length === 0 && <p className="text-stone-400 text-sm py-3 text-center bg-canvas rounded-xl">Šią dieną keitimų nėra</p>}
                </div>
              </div>

              {/* Visos savaitės santrauka */}
              {weekPlans.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Visa savaitė</p>
                  <div className="space-y-1">
                    {weekPlans.sort((a, b) => a.date.localeCompare(b.date)).map(p => (
                      <button key={p.id} onClick={() => setSelectedCalendarDay(p.date)} className={cn("w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg transition-colors text-xs", p.date === selectedCalendarDay ? "bg-gold/10" : "hover:bg-canvas")}>
                        <span className="font-mono text-[10px] text-muted w-12 shrink-0">{format(parseISO(p.date), 'MM.dd')}</span>
                        <span className="font-mono font-semibold bg-ink/[0.07] px-1.5 py-0.5 rounded shrink-0">{p.carNumber}</span>
                        <span className="truncate">{p.leavingDriverName} → <b className="font-semibold">{p.incomingDriverName}</b></span>
                        <span className={cn("ml-auto w-1.5 h-1.5 rounded-full shrink-0", p.status === 'Suplanuota' ? "bg-blue-400" : "bg-emerald-400")} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Pastaba dienai */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5"><StickyNote size={12} className="text-gold" /> Pastaba šiai dienai</p>
                <textarea
                  defaultValue={note?.text ?? ''}
                  key={selectedCalendarDay}
                  onBlur={(e) => { if ((e.target.value || '') !== (note?.text ?? '')) setDayNote(selectedCalendarDay, e.target.value); }}
                  rows={3}
                  placeholder="Užrašykite pastabą (pvz. patvirtinti su vairuotoju, dokumentai, sąlygos)…"
                  className="w-full bg-canvas border border-hairline rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:border-gold/60"
                />
                <p className="text-[10px] text-muted mt-1">Išsaugoma automatiškai (paspaudus šalia laukelio).</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-hairline">
              <button onClick={() => setSelectedCalendarDay(null)} className="w-full bg-ink text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-ink/85 transition-colors">Uždaryti</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Vairuotojo profilio šoninė panelė (drawer) */}
      {profileDriver && (
        <DriverProfileDrawer
          driver={drivers.find(d => d.id === profileDriver.id) ?? profileDriver} canEdit={canEdit}
          plans={plans} carAssignments={carAssignments} history={history}
          onClose={() => setProfileDriver(null)}
          onTrip={(d) => { setProfileDriver(null); setSelectedDriverForTrip(d); setTripOpen(true); }}
          onHome={(d) => { setProfileDriver(null); setSelectedDriverForHome(d); setHomeOpen(true); }}
          onEdit={(d) => { setProfileDriver(null); setSelectedDriverForEdit(d); setEditDriverOpen(true); }}
          onToggleUnneeded={toggleUnneeded}
          onDismiss={(d) => { setProfileDriver(null); setSelectedDriverForDismiss(d); setDismissOpen(true); }}
          onReinstate={reinstateDriver}
          onSaveDocs={saveDriverDocs}
        />
      )}

      {/* Automobilio profilio drawer */}
      {profileCar && (
        <CarProfileDrawer
          car={profileCar} canEdit={canEdit} drivers={drivers} plans={plans} carAssignments={carAssignments} history={history}
          onClose={() => setProfileCar(null)}
          onAssign={(c) => { setProfileCar(null); setSelectedCarForAssignment(c.number); setTripOpen(true); }}
          onEdit={(c) => { setProfileCar(null); setSelectedCarForEdit(c); setEditCarOpen(true); }}
        />
      )}

      {/* Confirm Plan */}
      {confirmData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
              <h3 className="font-bold">{confirmData.isExecution ? 'Patvirtinti įvykdymą' : 'Patvirtinti planą'}</h3>
              <button onClick={() => setConfirmData(null)} className="p-1.5 hover:bg-stone-100 rounded-lg"><X size={16}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-canvas rounded-xl p-4 space-y-3">
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
                <div className="pt-2 border-t border-hairline flex items-center gap-3">
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
            <div className="px-6 py-4 border-t border-hairline flex gap-3">
              <button onClick={() => setConfirmData(null)} className="flex-1 py-2.5 border border-hairline rounded-xl text-sm font-semibold hover:bg-canvas transition-colors">Atšaukti</button>
              <button onClick={() => {
                if (confirmData.isExecution && confirmData.planId) completePlan(confirmData.planId, newReturnDate, confirmData.executionDate);
                else createPlan(confirmData.carNumber, confirmData.leavingId, confirmData.incomingId, confirmData.date, newReturnDate);
                setConfirmData(null);
              }} className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-bold hover:bg-ink/90 transition-colors">
                {confirmData.isExecution ? 'Įvykdyta ✓' : 'Patvirtinti'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Priskyrimo (grafiko segmento) redagavimas */}
      {editAssignment && (
        <Modal title="Redaguoti priskyrimą" onClose={() => setEditAssignment(null)}>
          <form className="space-y-4" onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const drvId = f.get('driver') as string;
            const drv = drivers.find(d => d.id === drvId);
            updateAssignment(editAssignment.id, {
              driverId: drvId,
              driverName: drv?.name || editAssignment.driverName,
              startDate: f.get('startDate') as string,
              endDate: (f.get('endDate') as string) || null,
            });
            setEditAssignment(null);
          }}>
            <div className="text-xs text-muted bg-canvas rounded-xl px-3 py-2">Mašina: <span className="font-mono font-semibold text-ink">{editAssignment.carNumber}</span></div>
            <Field label="Vairuotojas">
              <select name="driver" defaultValue={editAssignment.driverId} className={selectCls}>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.companyType} • {d.specialization})</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nuo"><input type="date" name="startDate" defaultValue={editAssignment.startDate} className={inputCls} required /></Field>
              <Field label="Iki (tuščia = dabar)"><input type="date" name="endDate" defaultValue={editAssignment.endDate || ''} className={inputCls} /></Field>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { if (confirm('Ištrinti šį priskyrimą?')) { deleteAssignment(editAssignment.id); setEditAssignment(null); } }}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors">
                <Trash2 size={15}/> Ištrinti
              </button>
              <button type="submit" className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium hover:bg-ink/90 transition-colors">Išsaugoti</button>
            </div>
          </form>
        </Modal>
      )}

      {/* El. laiškas su grupės planais */}
      {emailGroup && (() => {
        const mail = buildPlansEmail(emailGroup, emailWeeks);
        return (
          <Modal title={`Siųsti ${emailGroup} planus`} onClose={() => setEmailGroup(null)}>
            <div className="space-y-4">
              <Field label="Gavėjo el. paštas">
                <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="komanda@imone.lt" className={inputCls} />
              </Field>
              <Field label="Laikotarpis">
                <div className="flex bg-canvas p-1 rounded-xl gap-1">
                  {([[1, 'Ši savaitė'], [2, 'Ši + kita']] as const).map(([w, lbl]) => (
                    <button key={w} type="button" onClick={() => setEmailWeeks(w)}
                      className={cn("flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all", emailWeeks === w ? "bg-ink text-white" : "text-muted hover:text-ink")}>{lbl}</button>
                  ))}
                </div>
              </Field>
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Peržiūra ({mail.count} planai)</p>
                <pre className="text-[11px] leading-relaxed text-ink bg-canvas border border-hairline rounded-xl p-3 max-h-48 overflow-auto whitespace-pre-wrap font-sans">{mail.body}</pre>
              </div>
              <a
                href={`mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`}
                onClick={() => { showToast('Atidaromas el. laiškas…'); setTimeout(() => setEmailGroup(null), 300); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-ink text-white rounded-xl text-sm font-medium hover:bg-ink/90 transition-colors">
                <Mail size={15}/> Atidaryti laišką
              </a>
            </div>
          </Modal>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div className={cn("fixed bottom-6 right-6 flex items-center gap-3 pl-4 pr-3 py-3 rounded-2xl shadow-float z-[100] animate-in slide-in-from-bottom-4", toast.type === 'success' ? "bg-ink text-white" : "bg-red-500 text-white")}>
          {toast.type === 'success' ? <CheckCircle2 size={16} className="opacity-90"/> : <AlertCircle size={16} className="opacity-90"/>}
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-50 hover:opacity-100 transition-opacity"><X size={14}/></button>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-2.5">
        {icon}
        <h2 className="text-xl font-display font-medium tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MonthNav({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const dfLocale = useDateLocale();
  return (
    <div className="flex items-center gap-1 bg-surface border border-hairline rounded-full p-1">
      <button onClick={() => onChange(subMonths(value, 1))} className="p-1.5 text-muted hover:text-ink hover:bg-stone-100 rounded-full transition-colors"><ChevronLeft size={14}/></button>
      <span className="px-3 text-xs font-medium min-w-[110px] text-center capitalize">{format(value, 'MMMM yyyy', { locale: dfLocale })}</span>
      <button onClick={() => onChange(addMonths(value, 1))} className="p-1.5 text-muted hover:text-ink hover:bg-stone-100 rounded-full transition-colors"><ChevronRight size={14}/></button>
    </div>
  );
}

// Plona premium juosta skilties viršuje (Etihad dvasia). `bg` — pasirinktinis
// fonas (pvz. Europos žemėlapis); kitaip naudojama nuotrauka `img`. `art` —
// dešinėje pusėje rodoma line-art detalė (pvz. mikroautobusas).
// Vairuotojo profilio šoninė panelė: kontaktai, būsena, dabartinė mašina,
// susiję planai, priskyrimų ir veiksmų istorija + greiti veiksmai.
function DriverProfileDrawer({ driver, canEdit, plans, carAssignments, history, onClose, onTrip, onHome, onEdit, onToggleUnneeded, onDismiss, onReinstate, onSaveDocs }: {
  driver: Driver; canEdit: boolean; plans: ReplacementPlan[]; carAssignments: CarAssignment[]; history: HistoryEntry[];
  onClose: () => void; onTrip: (d: Driver) => void; onHome: (d: Driver) => void; onEdit: (d: Driver) => void;
  onToggleUnneeded: (d: Driver) => void; onDismiss: (d: Driver) => void; onReinstate: (d: Driver) => void;
  onSaveDocs: (id: string, docs: Driver['docs'], extra: { email?: string; tabNr?: string }) => void;
}) {
  const t = useT();
  const d = driver;
  const [editDocs, setEditDocs] = useState(false);
  const dismissed = !!d.dismissedDate;
  const initials = d.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  const relPlans = plans.filter(p => p.leavingDriverId === d.id || p.incomingDriverId === d.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  // Darbo / poilsio istorija: priskyrimai = darbas (ant mašinos), tarpai = poilsis
  const dAssigns = carAssignments.filter(a => a.driverId === d.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
  type TLItem = { type: 'work' | 'rest'; car?: string; from: string; to: string | null };
  const timeline: TLItem[] = [];
  dAssigns.forEach((a, i) => {
    timeline.push({ type: 'work', car: a.carNumber, from: a.startDate, to: a.endDate });
    const next = dAssigns[i + 1];
    if (a.endDate && next && a.endDate < next.startDate) timeline.push({ type: 'rest', from: a.endDate, to: next.startDate });
  });
  const lastA = dAssigns[dAssigns.length - 1];
  if (d.status === 'Namuose' && lastA?.endDate) timeline.push({ type: 'rest', from: lastA.endDate, to: null });
  else if (d.status === 'Namuose' && d.lastTripEndDate && dAssigns.length === 0) timeline.push({ type: 'rest', from: d.lastTripEndDate, to: null });
  const tl = timeline.slice(-12).reverse();
  const dayCount = (from: string, to: string | null) => { try { return differenceInDays(to ? parseISO(to) : new Date(), parseISO(from)); } catch { return 0; } };
  const isLate = d.status === 'Reise' && !!d.plannedReturnDate && isBefore(parseISO(d.plannedReturnDate), new Date());
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-1.5"><span className="text-xs text-muted">{k}</span><span className="text-sm font-medium text-right">{v}</span></div>
  );
  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-canvas shadow-float flex flex-col slide-in-from-bottom-4">
        {/* Antraštė */}
        <div className="bg-ink text-white p-6 shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-semibold text-lg ring-1", d.status === 'Reise' ? "bg-blue-500/20 text-blue-200 ring-blue-400/30" : "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30")}>{initials}</div>
              <div>
                <p className="font-display text-xl font-medium leading-tight">{d.name}</p>
                <a href={`tel:${d.phone.replace(/\s/g, '')}`} className="text-xs text-white/70 hover:text-gold-soft inline-flex items-center gap-1.5 mt-1"><Phone size={11} />{d.phone}</a>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={18} /></button>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", d.status === 'Reise' ? "bg-blue-400/20 text-blue-100" : "bg-emerald-400/20 text-emerald-100")}><span className={cn("w-1.5 h-1.5 rounded-full", d.status === 'Reise' ? "bg-blue-300" : "bg-emerald-300")} />{t(d.status)}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">{d.companyType}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">{t(d.specialization)}</span>
            {isLate && <span className="rounded-full bg-red-500/25 text-red-100 px-2.5 py-1 text-xs font-semibold">{t('Vėluoja')}</span>}
            {d.unneeded && <span className="rounded-full bg-amber-500/25 text-amber-100 px-2.5 py-1 text-xs font-semibold">{t('Nereikalingas')}</span>}
            {dismissed && <span className="rounded-full bg-red-500/30 text-red-100 px-2.5 py-1 text-xs font-semibold">{t('Atleistas nuo')} {d.dismissedDate}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Būsenos santrauka */}
          <div className="bg-surface rounded-2xl border border-hairline p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">{t('Būsena')}</p>
            {d.status === 'Reise' ? (<>
              <Row k={t('Dabartinė mašina')} v={<span className="font-mono">{d.currentCar}</span>} />
              <Row k={t('Reiso pradžia')} v={d.startDate || '—'} />
              <Row k={t('Numatomas grįžimas')} v={<span className={isLate ? 'text-red-500' : ''}>{d.plannedReturnDate || '—'}</span>} />
            </>) : (<>
              <Row k={t('Namų būsena')} v={t(d.homeStatus)} />
              <Row k={t('Laisvas nuo')} v={d.readinessDate || '—'} />
              <Row k={t('Paskutinio reiso pabaiga')} v={d.lastTripEndDate || '—'} />
            </>)}
          </div>

          {/* Greiti veiksmai — tik turintiems redagavimo teises */}
          {canEdit && !dismissed && (
          <div className="flex gap-2">
            {d.status === 'Reise'
              ? <button onClick={() => onHome(d)} className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors"><LogOut size={15} /> {t('Siųsti namo')}</button>
              : <button onClick={() => onTrip(d)} className="flex-1 inline-flex items-center justify-center gap-2 bg-ink text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-ink/85 transition-colors"><LogIn size={15} /> {t('Siųsti į reisą')}</button>}
            <button onClick={() => onEdit(d)} className="inline-flex items-center justify-center gap-2 px-4 bg-ink/[0.05] text-ink rounded-xl text-sm font-semibold hover:bg-ink hover:text-white transition-all"><Edit size={15} /></button>
          </div>
          )}

          {/* Statuso veiksmai: nereikalingas / atleidimas / grąžinimas */}
          {canEdit && (
          <div className="flex gap-2">
            {dismissed ? (
              <button onClick={() => onReinstate(d)} className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors"><RotateCcw size={15} /> {t('Grąžinti į aktyvius')}</button>
            ) : (<>
              <button onClick={() => onToggleUnneeded(d)} className={cn('flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all border', d.unneeded ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100')}>
                {d.unneeded ? <><RotateCcw size={15} /> {t('Grąžinti į reikalingus')}</> : <><UserMinus size={15} /> {t('Pažymėti nereikalingu')}</>}
              </button>
              <button onClick={() => onDismiss(d)} className="inline-flex items-center justify-center gap-2 px-4 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 transition-all"><UserX size={15} /> {t('Atleisti')}</button>
            </>)}
          </div>
          )}

          {/* Dokumentai ir galiojimai */}
          {(() => {
            const docs = d.docs ?? {};
            const items = DOC_FIELDS.map(f => ({ ...f, iso: docs[f.key] as string | undefined, ...docState(docs[f.key] as string | undefined) }))
              .filter(it => it.iso);
            const expired = items.filter(it => it.state === 'expired').length;
            const soon = items.filter(it => it.state === 'soon').length;
            const inCls = 'w-full bg-canvas border border-hairline rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-ink/40';
            return (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('Dokumentai')}</p>
                  <div className="flex items-center gap-1.5">
                    {!editDocs && (expired > 0 ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><ShieldAlert size={11} />{expired} {t('pasibaigę')}</span>
                      : soon > 0 ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><ShieldAlert size={11} />{soon} {t('baigiasi')}</span>
                      : items.length > 0 ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><ShieldCheck size={11} />{t('Galioja')}</span> : null)}
                    {canEdit && !editDocs && <button onClick={() => setEditDocs(true)} title={t('Redaguoti datas')} className="inline-flex items-center gap-1 text-[10px] font-bold text-ink bg-ink/[0.06] hover:bg-ink hover:text-white px-2 py-0.5 rounded-full transition-all"><Edit size={11} /> {t('Redaguoti')}</button>}
                  </div>
                </div>

                {editDocs ? (
                  /* ── Redagavimo forma: rankinis datų / tapatybės keitimas ── */
                  <form onSubmit={e => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const val = (k: string) => { const v = (f.get(k) as string || '').trim(); return v || undefined; };
                    const newDocs: Driver['docs'] = { ...docs };
                    DOC_FIELDS.forEach(fd => { (newDocs as Record<string, unknown>)[fd.key] = val(fd.key); });
                    newDocs.personalCode = val('personalCode');
                    newDocs.passportNo = val('passportNo');
                    newDocs.tachoCountry = val('tachoCountry');
                    onSaveDocs(d.id, newDocs, { email: val('email'), tabNr: val('tabNr') });
                    setEditDocs(false);
                  }} className="bg-surface rounded-2xl border border-hairline p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block"><span className="text-[10px] text-muted">{t('Asmens kodas')}</span><input name="personalCode" defaultValue={docs.personalCode || ''} className={inCls} /></label>
                      <label className="block"><span className="text-[10px] text-muted">{t('Paso NR.')}</span><input name="passportNo" defaultValue={docs.passportNo || ''} className={inCls} /></label>
                      <label className="block"><span className="text-[10px] text-muted">{t('Tacho šalis')}</span><input name="tachoCountry" defaultValue={docs.tachoCountry || ''} className={inCls} /></label>
                      <label className="block"><span className="text-[10px] text-muted">{t('DS Nr.')}</span><input name="tabNr" defaultValue={d.tabNr || ''} className={inCls} /></label>
                      <label className="block col-span-2"><span className="text-[10px] text-muted">{t('El. paštas')}</span><input name="email" type="email" defaultValue={d.email || ''} className={inCls} /></label>
                    </div>
                    <div className="border-t border-hairline pt-3 grid grid-cols-2 gap-2">
                      {DOC_FIELDS.map(fd => (
                        <label key={fd.key} className="block"><span className="text-[10px] text-muted">{t(fd.label)}</span><input name={fd.key} type="date" defaultValue={(docs[fd.key] as string) || ''} className={inCls} /></label>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="submit" className="flex-1 inline-flex items-center justify-center gap-2 bg-ink text-white py-2 rounded-lg text-xs font-bold hover:bg-ink/90 transition-colors"><Check size={14} /> {t('Išsaugoti')}</button>
                      <button type="button" onClick={() => setEditDocs(false)} className="px-4 inline-flex items-center justify-center gap-2 bg-ink/[0.05] text-ink py-2 rounded-lg text-xs font-bold hover:bg-ink/10 transition-colors">{t('Atšaukti')}</button>
                    </div>
                  </form>
                ) : (<>
                {/* Tapatybės info */}
                {(docs.personalCode || docs.passportNo || docs.tachoCountry || d.email || d.tabNr) && (
                  <div className="bg-surface rounded-2xl border border-hairline p-3 mb-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {docs.personalCode && <div><p className="text-[10px] text-muted">{t('Asmens kodas')}</p><p className="text-xs font-mono font-medium">{docs.personalCode}</p></div>}
                    {docs.passportNo && <div><p className="text-[10px] text-muted">{t('Paso NR.')}</p><p className="text-xs font-mono font-medium">{docs.passportNo}</p></div>}
                    {docs.tachoCountry && <div><p className="text-[10px] text-muted">{t('Tacho šalis')}</p><p className="text-xs font-medium">{docs.tachoCountry}</p></div>}
                    {d.tabNr && <div><p className="text-[10px] text-muted">{t('DS Nr.')}</p><p className="text-xs font-mono font-medium">{d.tabNr}</p></div>}
                    {d.email && <div className="col-span-2 min-w-0"><p className="text-[10px] text-muted">{t('El. paštas')}</p><a href={`mailto:${d.email}`} className="text-xs font-medium text-blue-600 hover:underline truncate block">{d.email}</a></div>}
                  </div>
                )}

                {/* Galiojimai */}
                {items.length > 0 ? (
                  <div className="space-y-1.5">
                    {items.map(it => (
                      <div key={it.key} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 border',
                        it.state === 'expired' ? 'bg-red-50 border-red-200' : it.state === 'soon' ? 'bg-amber-50 border-amber-200' : 'bg-surface border-hairline')}>
                        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                          it.state === 'expired' ? 'bg-red-100 text-red-600' : it.state === 'soon' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600')}>
                          {it.key === 'passportExpiry' ? <Contact size={14} /> : it.key === 'tachoCardExpiry' ? <CreditCard size={14} /> : <FileCheck2 size={14} />}
                        </div>
                        <span className="text-[13px] font-semibold flex-1">{t(it.label)}</span>
                        <div className="text-right">
                          <p className={cn('text-xs font-mono font-semibold', it.state === 'expired' ? 'text-red-600' : it.state === 'soon' ? 'text-amber-700' : 'text-ink')}>{it.iso}</p>
                          <p className={cn('text-[10px]', it.state === 'expired' ? 'text-red-500' : it.state === 'soon' ? 'text-amber-600' : 'text-muted')}>
                            {it.days != null ? (it.days < 0 ? `${t('Pasibaigė prieš')} ${Math.abs(it.days)} ${t('d.')}` : it.days === 0 ? t('Baigiasi šiandien') : `${t('Liko')} ${it.days} ${t('d.')}`) : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted">{canEdit ? t('Dokumentų datų nėra. Spauskite „Redaguoti" arba importuokite Excel.') : t('Dokumentų datų nėra. Importuokite Excel sąrašą.')}</p>}
                </>)}
              </div>
            );
          })()}

          {/* Susiję planai */}
          {relPlans.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">{t('Susiję keitimai')}</p>
              <div className="space-y-1.5">
                {relPlans.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-xs bg-surface border border-hairline rounded-lg px-3 py-2">
                    <span className="font-mono text-muted w-12 shrink-0">{format(parseISO(p.date), 'MM.dd')}</span>
                    <span className="font-mono font-semibold bg-ink/[0.06] px-1.5 py-0.5 rounded shrink-0">{p.carNumber}</span>
                    <span className="truncate">{p.leavingDriverName} → {p.incomingDriverName}</span>
                    <span className={cn("ml-auto w-1.5 h-1.5 rounded-full shrink-0", p.status === 'Suplanuota' ? "bg-blue-400" : "bg-emerald-400")} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Darbo / poilsio istorija */}
          {tl.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">{t('Darbo ir poilsio istorija')}</p>
              <div className="space-y-1.5">
                {tl.map((it, i) => {
                  const days = dayCount(it.from, it.to);
                  return (
                    <div key={i} className="flex items-center gap-3 bg-surface border border-hairline rounded-xl px-3 py-2.5">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", it.type === 'work' ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600")}>
                        {it.type === 'work' ? <Truck size={15} /> : <Home size={15} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold leading-tight">
                          {it.type === 'work' ? <>{t('Dirbo')} · <span className="font-mono">{it.car}</span></> : t('Ilsėjosi')}
                        </p>
                        <p className="text-[11px] text-muted">{it.from} – {it.to || t('dabar')}</p>
                      </div>
                      <span className="text-[11px] font-medium text-muted shrink-0 tabular-nums">{days > 0 ? `${days} ${t('d.')}` : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Automobilio profilio šoninė panelė: dabartinis vairuotojas, priskyrimų
// istorija, susiję planai, žurnalas + greiti veiksmai.
function CarProfileDrawer({ car, canEdit, drivers, plans, carAssignments, history, onClose, onAssign, onEdit }: {
  car: Car; canEdit: boolean; drivers: Driver[]; plans: ReplacementPlan[]; carAssignments: CarAssignment[]; history: HistoryEntry[];
  onClose: () => void; onAssign: (c: Car) => void; onEdit: (c: Car) => void;
}) {
  const t = useT();
  const driver = drivers.find(d => d.currentCar === car.number);
  const relPlans = plans.filter(p => p.carNumber === car.number).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const assigns = carAssignments.filter(a => a.carNumber === car.number).sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 8);
  const log = history.filter(h => h.carNumber === car.number).slice(0, 10);
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-1.5"><span className="text-xs text-muted">{k}</span><span className="text-sm font-medium text-right">{v}</span></div>
  );
  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-canvas shadow-float flex flex-col slide-in-from-bottom-4">
        <div className="bg-ink text-white p-6 shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center ring-1", car.status === 'Aktyvus' ? "bg-gold/15 text-gold-soft ring-gold/30" : "bg-red-500/20 text-red-200 ring-red-400/30")}>
                {car.type === 'Refas' ? <Snowflake size={24} /> : <Container size={24} />}
              </div>
              <div>
                <p className="font-display text-xl font-medium leading-tight font-mono">{car.number}</p>
                <p className="text-xs text-white/70 mt-1">{[car.brand, car.year].filter(Boolean).join(' · ') || `${car.type} · ${car.registration}`}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={18} /></button>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", car.status === 'Aktyvus' ? "bg-emerald-400/20 text-emerald-100" : "bg-red-500/25 text-red-100")}><span className={cn("w-1.5 h-1.5 rounded-full", car.status === 'Aktyvus' ? "bg-emerald-300" : "bg-red-300")} />{t(car.status)}</span>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", driver ? "bg-blue-400/20 text-blue-100" : "bg-white/10")}>{driver ? t('Užimta') : t('Laisva')}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-surface rounded-2xl border border-hairline p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">{t('Dabartinis vairuotojas')}</p>
            {driver ? <>
              <div className="flex items-center gap-3 mt-1">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">{driver.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
                <div><p className="font-semibold text-sm">{driver.name}</p><p className="text-[11px] text-muted">{driver.companyType} · {t(driver.specialization)}</p></div>
              </div>
              <div className="mt-3 pt-3 border-t border-hairline"><Row k={t('Reiso pradžia')} v={driver.startDate || '—'} /><Row k={t('Numatomas grįžimas')} v={driver.plannedReturnDate || '—'} /></div>
            </> : (
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-muted italic">{t('Mašina laisva')}</span>
                {canEdit && <button onClick={() => onAssign(car)} className="px-3 py-1.5 bg-ink text-white text-xs font-semibold rounded-lg hover:bg-ink/85 transition-colors">{t('Priskirti')}</button>}
              </div>
            )}
          </div>

          {canEdit && (
          <div className="flex gap-2">
            {!driver && <button onClick={() => onAssign(car)} className="flex-1 inline-flex items-center justify-center gap-2 bg-ink text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-ink/85 transition-colors"><LogIn size={15} /> {t('Priskirti vairuotoją')}</button>}
            <button onClick={() => onEdit(car)} className={cn("inline-flex items-center justify-center gap-2 px-4 bg-ink/[0.05] text-ink rounded-xl text-sm font-semibold hover:bg-ink hover:text-white transition-all", !driver ? "" : "flex-1 py-2.5")}><Edit size={15} /> {driver && t('Redaguoti')}</button>
          </div>
          )}

          {relPlans.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">{t('Keitimas')}</p>
              <div className="space-y-1.5">
                {relPlans.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-xs bg-surface border border-hairline rounded-lg px-3 py-2">
                    <span className="font-mono text-muted w-12 shrink-0">{format(parseISO(p.date), 'MM.dd')}</span>
                    <span className="truncate">{p.leavingDriverName} → {p.incomingDriverName}</span>
                    <span className={cn("ml-auto w-1.5 h-1.5 rounded-full shrink-0", p.status === 'Suplanuota' ? "bg-blue-400" : "bg-emerald-400")} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {assigns.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">{t('Kas vairavo šią mašiną')}</p>
              <div className="space-y-1.5">
                {assigns.map(a => {
                  let days = 0; try { days = differenceInDays(a.endDate ? parseISO(a.endDate) : new Date(), parseISO(a.startDate)); } catch { /* ignore */ }
                  return (
                    <div key={a.id} className="flex items-center gap-3 bg-surface border border-hairline rounded-xl px-3 py-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-semibold shrink-0">{a.driverName.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold truncate leading-tight">{a.driverName}</p>
                        <p className="text-[11px] text-muted">{a.startDate} – {a.endDate || t('dabar')}</p>
                      </div>
                      <span className="text-[11px] font-medium text-muted shrink-0 tabular-nums">{days > 0 ? `${days} ${t('d.')}` : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageBanner({ img, bg, art, eyebrow, title, subtitle, h = 'tall' }: {
  img?: string; bg?: React.ReactNode; art?: React.ReactNode;
  eyebrow: string; title: string; subtitle: string; h?: 'tall' | 'xtall';
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-hairline shadow-card bg-ink", h === 'xtall' ? "h-36 sm:h-44" : "h-28 sm:h-32")}>
      {/* Fonas (žemėlapis) — dešinėje pusėje, telpa visas (meet, neapkarpomas) */}
      {bg
        ? <div className="absolute inset-y-0 right-0 w-full sm:w-[60%]">{bg}</div>
        : <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover kenburns" />}
      <div className={cn("absolute inset-0 bg-gradient-to-r", bg ? "from-ink via-ink/80 sm:via-ink/55 to-ink/20 sm:to-transparent" : "from-ink/90 via-ink/55 to-ink/10")} />
      {!bg && <div className="absolute inset-0 mix-blend-multiply bg-[#9C7B36]/10" />}
      {art && <div className="absolute right-3 bottom-2.5 hidden lg:block pointer-events-none">{art}</div>}
      <div className="relative h-full flex flex-col justify-center px-5 sm:px-7 text-white max-w-md">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-gold-soft drop-shadow">{eyebrow}</p>
        <h2 className="font-display text-xl sm:text-2xl font-medium tracking-tight mt-0.5 drop-shadow-sm">{title}</h2>
        <p className="text-xs text-white/80 mt-1 hidden sm:block">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon, text, variant = 'road' }: { icon?: React.ReactNode; text: string; variant?: 'road' | 'checklist' }) {
  void icon;
  return (
    <div className="py-14 px-6 text-center bg-surface rounded-2xl border border-hairline">
      {variant === 'checklist' ? <EmptyChecklist label={text} /> : <EmptyRoad label={text} />}
    </div>
  );
}

function HomeDriverCard({ driver, canEdit, onSendToTrip }: { driver: Driver; canEdit: boolean; onSendToTrip: () => void }) {
  const t = useT();
  // Ar jau galima siųsti (poilsis pasibaigęs)?
  const ready = driver.readinessDate ? !isAfter(parseISO(driver.readinessDate), new Date()) : true;
  return (
    <div className="group flex items-center gap-3 bg-surface rounded-xl border border-hairline pl-2.5 pr-2 py-2 hover:border-ink/25 transition-colors">
      <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-semibold text-xs shrink-0">
        {driver.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[13px] truncate leading-tight">{driver.name}</p>
        <p className="text-[10px] text-muted truncate mt-0.5">{driver.companyType} · {t(driver.specialization)} · {t(driver.homeStatus)}</p>
      </div>
      <div className="text-right shrink-0 leading-tight">
        <p className="text-[8px] uppercase tracking-wide text-muted">{ready ? t('Galima') : t('Poilsis iki')}</p>
        <p className={cn("text-[11px] font-semibold tabular-nums", ready ? "text-emerald-600" : "text-blue-600")}>{driver.readinessDate || '—'}</p>
      </div>
      {canEdit && <button onClick={onSendToTrip} title={t('Siųsti į reisą')} className="shrink-0 w-8 h-8 rounded-lg bg-ink/[0.06] text-ink hover:bg-ink hover:text-white flex items-center justify-center transition-all">
        <ArrowRight size={15}/>
      </button>}
    </div>
  );
}

function PlanCard({ plan, canEdit = true, drivers, cars, plans, onComplete, onDelete, onEdit, editingPlanId, setEditingPlanId, setPlans }: {
  canEdit?: boolean;
  plan: ReplacementPlan; drivers: Driver[]; cars: Car[]; plans: ReplacementPlan[];
  onComplete: () => void; onDelete: () => void; onEdit: () => void;
  editingPlanId: string | null; setEditingPlanId: (id: string | null) => void;
  setPlans: React.Dispatch<React.SetStateAction<ReplacementPlan[]>>;
}) {
  const dfLocale = useDateLocale();
  const t = useT();
  const car = cars.find(c => c.number === plan.carNumber);
  const leaving = drivers.find(d => d.id === plan.leavingDriverId);
  const incoming = drivers.find(d => d.id === plan.incomingDriverId);
  const initials = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <div className="group/plan relative overflow-hidden bg-surface border border-hairline rounded-2xl p-4 sm:p-5 hover:border-gold/40 hover:shadow-float transition-all">
      {/* Subtilus aukso akcentas kairėje */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-gold/0 via-gold to-gold/0 opacity-0 group-hover/plan:opacity-100 transition-opacity" />
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        {/* Data + mašina */}
        <div className="flex flex-row sm:flex-col items-center gap-2 sm:gap-1.5 sm:min-w-[64px]">
          <div className="w-12 h-12 rounded-2xl bg-ink text-white flex flex-col items-center justify-center shadow-card">
            <span className="text-lg font-display font-semibold leading-none">{format(parseISO(plan.date), 'dd')}</span>
            <span className="text-[8px] uppercase tracking-wide text-gold-soft">{format(parseISO(plan.date), 'EEE', { locale: dfLocale })}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[10px] font-bold text-ink bg-ink/[0.06] px-2 py-0.5 rounded">{plan.carNumber}</span>
            {car && <span className="text-[8px] uppercase tracking-wide text-muted">{car.type}</span>}
          </div>
        </div>

        {/* Keitimo „maršrutas": namo grįžtantis ╌╌🚛╌╌ į reisą einantis */}
        <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Namo grįžtantis */}
          <div className="flex items-center gap-2.5 justify-end text-right shrink min-w-0 basis-[38%]">
            <div className="min-w-0">
              <p className="text-[8px] text-red-500 font-bold uppercase tracking-wide flex items-center justify-end gap-1"><LogOut size={9}/>Namo</p>
              <p className="font-semibold text-sm truncate">{plan.leavingDriverName}</p>
              {leaving && <p className="text-[10px] text-muted truncate">{leaving.companyType} · {leaving.specialization}</p>}
            </div>
            <div className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-[11px] font-bold shrink-0">{initials(plan.leavingDriverName)}</div>
          </div>

          {/* Kelias su važiuojančia mašina (užpildo tarpą prasmingai) */}
          <div className="relative flex-1 h-9 min-w-[48px] flex items-center">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dotted border-hairline" />
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-400 ring-2 ring-red-100" />
            <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
            <div className="plan-truck absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-ink to-[#3a3122] text-gold-soft flex items-center justify-center shadow-card ring-1 ring-gold/20">
                <SemiTruck className="w-6 h-auto" stroke="currentColor" />
              </div>
            </div>
          </div>

          {/* Į reisą einantis (paryškintas — pakeitėjas) */}
          <div className="flex items-center gap-2.5 shrink min-w-0 basis-[38%]">
            <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold shrink-0 ring-2 ring-emerald-200">{initials(plan.incomingDriverName)}</div>
            <div className="min-w-0">
              <p className="text-[8px] text-emerald-600 font-bold uppercase tracking-wide flex items-center gap-1"><LogIn size={9}/>Į reisą</p>
              <p className="font-semibold text-sm truncate">{plan.incomingDriverName}</p>
              {incoming && <p className="text-[10px] text-muted truncate">{incoming.companyType} · {incoming.specialization}</p>}
            </div>
          </div>
        </div>

        {/* Veiksmai — tik turintiems redagavimo teises */}
        {canEdit && (
        <div className="flex sm:flex-col gap-2 border-t sm:border-t-0 sm:border-l border-hairline pt-3 sm:pt-0 sm:pl-4 w-full sm:w-auto">
          <button onClick={onComplete} className="flex-1 sm:flex-none p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all" title="Įvykdyta"><CheckCircle2 size={16}/></button>
          <button onClick={onEdit}    className="flex-1 sm:flex-none p-2.5 bg-ink/[0.05] text-ink hover:bg-ink hover:text-white rounded-xl transition-all" title="Redaguoti"><Edit size={16}/></button>
          <button onClick={onDelete}  className="flex-1 sm:flex-none p-2.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all" title="Ištrinti"><X size={16}/></button>
        </div>
        )}
      </div>

      {/* Keitimo taškas / užduotis (jei nustatyta koordinatoriaus) */}
      {plan.changeLocation && (
        <div className="mt-3 pt-3 border-t border-hairline flex items-center gap-2 text-[11px] text-muted">
          <MapPin size={12} className="text-gold shrink-0" />
          <span className="truncate">{plan.changeLocation}{plan.changeTask ? <> · <span className="text-amber-600">📦 {plan.changeTask}</span></> : ''}</span>
        </div>
      )}
    </div>
  );
}

// Stabili spalva pagal raktą (vairuotojui ar mašinai) — gretimi segmentai skiriasi.
const TL_PALETTE = ['#3F6CB0', '#4E9A87', '#B07F39', '#8769A8', '#AF5468', '#5C8A4E', '#3E8090', '#A8693C'];
function timelineColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TL_PALETTE[h % TL_PALETTE.length];
}

type TLSegment = {
  startIdx: number; endIdx: number; inclusiveEnd: boolean;
  type: 'active' | 'planned'; name: string; color: string;
  from: string; to: string | null;
  open?: boolean;          // tęsiamas reisas (assignment be pabaigos)
  estimated?: boolean;     // pabaiga = plannedReturnDate (numatoma grįžimo data)
  assignment?: CarAssignment;
  planId?: string;         // planuojamo segmento plano id (perkėlimui)
  planCar?: string;        // plano dabartinė mašina
};

function DriverTimeline({ drivers, cars, plans, carAssignments, month, showCars, onEditAssignment, onMoveAssignment, onResizeAssignment, onMovePlanDate, onMovePlanToCar }: {
  drivers: Driver[]; cars: Car[]; plans: ReplacementPlan[]; carAssignments: CarAssignment[]; month: Date; showCars?: boolean;
  onEditAssignment?: (a: CarAssignment) => void;
  onMoveAssignment?: (a: CarAssignment, deltaDays: number) => void;
  onResizeAssignment?: (a: CarAssignment, edge: 'start' | 'end', deltaDays: number) => void;
  onMovePlanDate?: (planId: string, deltaDays: number) => void;
  onMovePlanToCar?: (planId: string, newCar: string) => void;
}) {
  const dfLocale = useDateLocale();
  const monthStart = startOfMonth(month);
  const monthEnd   = endOfMonth(month);
  const totalDays  = getDaysInMonth(month);
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const pct        = (n: number) => `${(n / totalDays) * 100}%`;

  // ── Drag (pelės tempimas): juostos pastūmimas / kraštų tempimas / plano perkėlimas ──
  type DragMode = 'move' | 'start' | 'end';
  const dragInfo = useRef<null | { seg: TLSegment; segKey: string; startX: number; startY: number; dayPx: number; moved: boolean; mode: DragMode }>(null);
  const [drag, setDrag] = useState<null | { segKey: string; dx: number; dy: number; deltaDays: number; targetCar: string | null; mode: DragMode }>(null);
  const canDrag = (s: TLSegment) =>
    (s.type === 'active' && !!s.assignment && (!!onMoveAssignment || !!onResizeAssignment)) ||
    (s.type === 'planned' && !!s.planId && (!!onMovePlanDate || !!onMovePlanToCar));

  const EDGE = 11; // krašto „rankenėlės" plotis px
  const onSegDown = (e: React.PointerEvent, seg: TLSegment, segKey: string) => {
    if (!canDrag(seg)) return;
    const track = (e.currentTarget as HTMLElement).closest('[data-tl-track]') as HTMLElement | null;
    if (!track) return;
    e.preventDefault();
    const dayPx = track.getBoundingClientRect().width / totalDays;
    // Kraštai → resize (tik aktyvioms juostoms); vidurys → move.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offX = e.clientX - rect.left;
    let mode: DragMode = 'move';
    if (seg.type === 'active' && onResizeAssignment) {
      if (offX <= EDGE) mode = 'start';
      else if (offX >= rect.width - EDGE) mode = 'end';
    }
    dragInfo.current = { seg, segKey, startX: e.clientX, startY: e.clientY, dayPx, moved: false, mode };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onSegMove = (e: React.PointerEvent) => {
    const di = dragInfo.current; if (!di) return;
    const dx = e.clientX - di.startX, dy = e.clientY - di.startY;
    if (!di.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    di.moved = true;
    const deltaDays = Math.round(dx / di.dayPx);
    let targetCar: string | null = null;
    if (di.seg.type === 'planned' && di.mode === 'move' && showCars) {
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-car-number]') as HTMLElement | null;
      targetCar = el?.getAttribute('data-car-number') || null;
    }
    setDrag({ segKey: di.segKey, dx, dy, deltaDays, targetCar, mode: di.mode });
  };
  const onSegUp = (e: React.PointerEvent, seg: TLSegment) => {
    const di = dragInfo.current; const d = drag;
    dragInfo.current = null; setDrag(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!di) return;
    if (!di.moved) {
      if (seg.type === 'active' && seg.assignment && onEditAssignment) onEditAssignment(seg.assignment);
      return;
    }
    const deltaDays = d?.deltaDays ?? 0;
    if (seg.type === 'active' && seg.assignment) {
      if (di.mode === 'move') onMoveAssignment?.(seg.assignment, deltaDays);
      else onResizeAssignment?.(seg.assignment, di.mode, deltaDays);
    } else if (seg.type === 'planned' && seg.planId) {
      if (d?.targetCar && d.targetCar !== seg.planCar) onMovePlanToCar?.(seg.planId, d.targetCar);
      else if (deltaDays !== 0) onMovePlanDate?.(seg.planId, deltaDays);
    }
  };

  // ── Paieška (Excel stiliaus: datalist + filtravimas pagal pavardę/numerį) ──
  const t = useT();
  const [q, setQ] = useState('');
  const [fType, setFType] = useState<CarType | ''>('');
  const [fReg, setFReg] = useState<RegistrationType | ''>('');
  const ql = q.trim().toLowerCase();
  const allRows = showCars ? cars : drivers;
  const rows = allRows.filter(item => {
    // Tekstinė paieška
    if (ql) {
      if (!showCars) { if (!(item as Driver).name.toLowerCase().includes(ql)) return false; }
      else {
        const c = item as Car;
        if (!(c.number.toLowerCase().includes(ql) || carAssignments.some(a => a.carNumber === c.number && a.driverName.toLowerCase().includes(ql)))) return false;
      }
    }
    // Tipo / įmonės filtrai (Tentas/Refas, LT/PL)
    const typeVal = showCars ? (item as Car).type : (item as Driver).specialization;
    const regVal  = showCars ? (item as Car).registration : (item as Driver).companyType;
    if (fType && typeVal !== fType) return false;
    if (fReg && regVal !== fReg) return false;
    return true;
  });

  return (
    <div className="bg-surface rounded-2xl border border-hairline overflow-hidden">
      {/* Paieška */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-hairline">
        <Search size={15} className="text-muted shrink-0" />
        <input
          list="tl-search-list"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={showCars ? 'Ieškoti mašinos arba vairuotojo…' : 'Ieškoti vairuotojo (pavardė)…'}
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted"
        />
        <datalist id="tl-search-list">
          {drivers.map(d => <option key={d.id} value={d.name} />)}
          {cars.map(c => <option key={c.id} value={c.number} />)}
        </datalist>
        {q && <button onClick={() => setQ('')} className="text-muted hover:text-ink transition-colors"><X size={15} /></button>}
        <span className="text-[11px] text-muted shrink-0 tabular-nums">{rows.length}/{allRows.length}</span>
      </div>

      {/* Filtrai: tipas (Tentas/Refas) + įmonė (LT/PL) */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-hairline text-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted mr-0.5">{t('Tipas / Įmonė')}</span>
        <div className="flex bg-ink/[0.05] rounded-lg p-0.5">
          {([['', t('Visi tipai')], ['Tentas', t('Tentas')], ['Refas', t('Refas')]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFType(v as CarType | '')} className={cn('px-2.5 py-1 rounded-md font-medium transition-all', fType === v ? 'bg-surface shadow-card text-ink' : 'text-muted hover:text-ink')}>{l}</button>
          ))}
        </div>
        <div className="flex bg-ink/[0.05] rounded-lg p-0.5">
          {([['', t('Visos įmonės')], ['LT', 'LT'], ['PL', 'PL']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFReg(v as RegistrationType | '')} className={cn('px-2.5 py-1 rounded-md font-medium transition-all', fReg === v ? 'bg-surface shadow-card text-ink' : 'text-muted hover:text-ink')}>{l}</button>
          ))}
        </div>
        {(fType || fReg) && <button onClick={() => { setFType(''); setFReg(''); }} title={t('Išvalyti')} className="text-muted hover:text-red-500 transition-colors ml-0.5"><X size={14} /></button>}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[920px]">
          {/* Header */}
          <div className="flex border-b border-hairline bg-ink text-white">
            <div className="w-48 shrink-0 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">{showCars ? 'Auto' : 'Vairuotojas'}</div>
            <div className="flex flex-1">
              {days.map(d => {
                const today = isSameDay(d, new Date());
                const weekend = [0, 6].includes(d.getDay());
                return (
                  <div key={d.toString()} className={cn("flex-1 py-2 text-center border-r border-white/5", today && "bg-gold/30", weekend && !today && "bg-white/5")}>
                    <div className="text-[7px] uppercase opacity-50">{format(d, 'EEE', { locale: dfLocale })}</div>
                    <div className="text-[9px] font-semibold">{format(d, 'd')}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-hairline">
            {rows.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted">Nieko nerasta pagal „{q}"</div>}
            {rows.map(item => {
              const driver = !showCars ? item as Driver : null;
              const car    = showCars  ? item as Car    : null;

              const segs: TLSegment[] = [];

              const pushSeg = (startDate: string, endDate: string | null, type: 'active' | 'planned', name: string, seed: string, opts?: { open?: boolean; estimated?: boolean; assignment?: CarAssignment; planId?: string; planCar?: string }) => {
                const s = parseISO(startDate);
                const eRaw = endDate ? parseISO(endDate) : monthEnd;
                if (isAfter(s, monthEnd) || isBefore(eRaw, monthStart)) return;
                const startIdx = isBefore(s, monthStart) ? 0 : differenceInDays(s, monthStart);
                const closedInMonth = !!endDate && !isAfter(eRaw, monthEnd) && !isBefore(eRaw, monthStart);
                const endIdx = isAfter(eRaw, monthEnd) ? totalDays - 1 : differenceInDays(eRaw, monthStart);
                if (endIdx < startIdx) return;
                // Numatoma grįžimo data (estimated) — vairuotojas dirba IKI tos dienos imtinai.
                const inclusiveEnd = opts?.estimated ? true : !closedInMonth;
                segs.push({ startIdx, endIdx, inclusiveEnd, type, name, color: type === 'planned' ? '#9C7B36' : timelineColor(seed), from: startDate, to: endDate, open: opts?.open, estimated: opts?.estimated, assignment: opts?.assignment, planId: opts?.planId, planCar: opts?.planCar });
              };

              if (driver) {
                carAssignments.filter(a => a.driverId === driver.id).forEach(a => {
                  // Atviram reisui pabaigą riboja numatoma grįžimo data (plannedReturnDate).
                  const est = a.endDate == null && !!driver.plannedReturnDate;
                  pushSeg(a.startDate, a.endDate ?? driver.plannedReturnDate ?? null, 'active', a.carNumber, a.carNumber, { open: a.endDate == null, estimated: est, assignment: a });
                });
                plans.filter(p => p.status === 'Suplanuota' && p.incomingDriverId === driver.id)
                  .forEach(p => pushSeg(p.date, p.newPlannedReturnDate ?? format(addDays(parseISO(p.date), 42), 'yyyy-MM-dd'), 'planned', p.carNumber, p.carNumber, { planId: p.id, planCar: p.carNumber }));
              }
              if (car) {
                carAssignments.filter(a => a.carNumber === car.number).forEach(a => {
                  const drv = drivers.find(d => d.id === a.driverId);
                  const est = a.endDate == null && !!drv?.plannedReturnDate;
                  pushSeg(a.startDate, a.endDate ?? drv?.plannedReturnDate ?? null, 'active', a.driverName, a.driverId, { open: a.endDate == null, estimated: est, assignment: a });
                });
                plans.filter(p => p.status === 'Suplanuota' && p.carNumber === car.number)
                  .forEach(p => pushSeg(p.date, p.newPlannedReturnDate ?? format(addDays(parseISO(p.date), 42), 'yyyy-MM-dd'), 'planned', p.incomingDriverName, p.incomingDriverId, { planId: p.id, planCar: p.carNumber }));
              }

              segs.sort((a, b) => a.startIdx - b.startIdx);
              const handovers = segs
                .filter((s, i) => s.type === 'active' && s.startIdx > 0 && segs.some((o, j) => j < i && o.endIdx <= s.startIdx))
                .map(s => s.startIdx);
              // Vienas „dabartinis" segmentas eilutėje: tęsiamas reisas su vėliausia pradžia.
              const openActive = segs.filter(s => s.type === 'active' && s.open);
              const currentSeg = openActive.length ? openActive.reduce((a, b) => (b.startIdx >= a.startIdx ? b : a)) : null;

              const d = driver, c = car;

              const isDropTarget = !!drag && !!c && drag.targetCar === c.number;
              return (
                <div key={(d || c)!.id} data-car-number={c?.number} className={cn("flex group hover:bg-canvas/60 transition-colors h-16", isDropTarget && "bg-gold/15 ring-1 ring-inset ring-gold/50")}>
                  <div className="w-48 shrink-0 px-4 flex items-center gap-2.5 border-r border-hairline">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", d ? (d.status === 'Reise' ? 'bg-blue-400' : 'bg-emerald-400') : 'bg-gold')} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{d ? d.name : c!.number}</p>
                      <p className="text-[10px] text-muted truncate">{d ? (d.status === 'Reise' && d.currentCar !== 'Nėra' ? d.currentCar : 'Namuose') : `${c!.type} • ${c!.registration}`}</p>
                    </div>
                  </div>
                  <div className="flex-1 relative" data-tl-track>
                    {/* dienų tinklelis */}
                    {days.map((day, i) => (
                      <div key={i} className={cn("absolute top-0 bottom-0 border-r border-hairline/60", isSameDay(day, new Date()) && "bg-gold/10")} style={{ left: pct(i), width: pct(1) }} />
                    ))}

                    {/* segmentai: dabartinis (žiedas) · praeitis (blankesnis) · planuojama (punktyras) */}
                    {segs.map((seg, idx) => {
                      const widthDays = (seg.endIdx - seg.startIdx) + (seg.inclusiveEnd ? 1 : 0);
                      if (widthDays <= 0) return null;
                      const planned = seg.type === 'planned';
                      const isCurrent = seg === currentSeg;
                      const isPast = seg.type === 'active' && !isCurrent;
                      const clickable = seg.type === 'active' && !!onEditAssignment && !!seg.assignment;
                      const segKey = `${(d || c)!.id}:${idx}`;
                      const draggable = canDrag(seg);
                      const isDragging = drag?.segKey === segKey;
                      const resizable = seg.type === 'active' && !!onResizeAssignment && !!seg.assignment;
                      // Tempimo preview: aktyvų segmentą snap'inam prie dienų pagal režimą; planą — laisvai (transl).
                      let leftIdx = seg.startIdx, wDays = widthDays;
                      if (isDragging && seg.type === 'active') {
                        const dd = drag!.deltaDays;
                        if (drag!.mode === 'move') leftIdx += dd;
                        else if (drag!.mode === 'start') { leftIdx += dd; wDays -= dd; }
                        else if (drag!.mode === 'end') { wDays += dd; }
                        if (wDays < 1) wDays = 1;
                      }
                      const dragStyle: React.CSSProperties = isDragging
                        ? (seg.type === 'planned' ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px)`, zIndex: 50 } : { zIndex: 50 })
                        : {};
                      return (
                        <div
                          key={idx}
                          onPointerDown={(e) => onSegDown(e, seg, segKey)}
                          onPointerMove={onSegMove}
                          onPointerUp={(e) => onSegUp(e, seg)}
                          className={cn(
                            "absolute rounded-lg flex items-center gap-1 px-2 overflow-hidden shadow-card group/seg",
                            !isDragging && "transition-all",
                            // Atskiros juostos: faktinis viršuje, planuojamas apačioje — kad nepersidengtų
                            planned ? "top-9 h-4 border border-dashed border-white/45" : "top-2 h-7",
                            isCurrent && "ring-2 ring-gold/80",
                            isPast && "opacity-60",
                            isDragging && "ring-2 ring-gold shadow-float opacity-95",
                            draggable ? "cursor-grab active:cursor-grabbing touch-none select-none" : clickable && "cursor-pointer",
                            !isDragging && draggable && "hover:opacity-100 hover:brightness-110",
                          )}
                          style={{ left: `calc(${pct(leftIdx)})`, width: `calc(${pct(wDays)} - 2px)`, background: planned ? '#B08A3C' : seg.color, color: 'white', ...dragStyle }}
                          title={`${seg.name} · nuo ${seg.from}${seg.to ? `${seg.estimated ? ' · numatoma grįžti iki ' : ' iki '}${seg.to}` : ' (pabaiga nenurodyta)'}${planned ? ' · planuojama' : isCurrent ? ' · dabartinis' : ' · istorija'}${resizable ? ' · tempk kraštus (pradžia/pabaiga) arba vidurį' : planned ? ' · tempk ant kitos mašinos arba šonus' : ''}`}
                        >
                          {/* Kraštų rankenėlės — pradžia/pabaiga atskirai (cursor: ew-resize) */}
                          {resizable && <>
                            <div className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize z-10 flex items-center justify-start pl-0.5 opacity-0 group-hover/seg:opacity-100 transition-opacity"><span className="w-0.5 h-3.5 rounded bg-white/70" /></div>
                            <div className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize z-10 flex items-center justify-end pr-0.5 opacity-0 group-hover/seg:opacity-100 transition-opacity"><span className="w-0.5 h-3.5 rounded bg-white/70" /></div>
                          </>}
                          {planned && <span className="text-[8px] leading-none shrink-0">⟳</span>}
                          <span className="truncate text-[10px] font-semibold leading-none">{seg.name}</span>
                          {seg.to && !planned && widthDays > 4 && (
                            <span className="ml-auto shrink-0 text-[9px] font-semibold leading-none tabular-nums opacity-90 pl-1">
                              {seg.estimated ? '~' : ''}{format(parseISO(seg.to), 'MM-dd')}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* perdavimo žymekliai su diena */}
                    {handovers.map((hi, k) => (
                      <div key={`h${k}`} className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: pct(hi) }}>
                        <div className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 bg-gold" />
                        <div className="absolute top-0 left-0 -translate-x-1/2 bg-gold text-white text-[8px] font-bold leading-none px-1 py-0.5 rounded-b-md">
                          {format(addDays(monthStart, hi), 'd')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

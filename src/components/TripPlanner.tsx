// Keitimo kelionės planavimas su Leaflet žemėlapiu.
// Perkelta iš senosios public/index.html versijos į Vite+TS.
// Multi-vehicle flotas (iki 6), stotelės (vairuotojų keitimas / užduotys),
// atstumų skaičiavimas per OSRM, miestų paieška/reverse-geocode per Nominatim.
// Maršruto duomenys efemeriški (į DB nesaugomi) — planavimo įrankis.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Driver, Car, ReplacementPlan, TripVehicle, TripStop, RouteInfo } from '../types';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const ic = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 transition-all';
const sc = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 transition-all appearance-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</label>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border bg-stone-100 text-stone-600 border-stone-200">
      {children}
    </span>
  );
}

const BASE = { lat: 54.9127, lng: 23.9417, name: 'Ateities pl. 23, Kaunas' };
const VEH_COLORS = ['#003087', '#CC1427', '#15803d', '#7c3aed', '#c2780c', '#0891b2'];
const uid = () => Math.random().toString(36).slice(2, 9);
const mkVehicle = (idx: number): TripVehicle => ({
  id: uid(), number: '', capacity: 4, color: VEH_COLORS[idx] || VEH_COLORS[0], stops: [], additionalWork: '',
});

interface TripPlannerProps {
  drivers: Driver[];
  plans: ReplacementPlan[];
  cars?: Car[];
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export default function TripPlanner({ drivers, plans, cars = [], showToast }: TripPlannerProps) {
  const [tripFleet, setTripFleet] = useState<TripVehicle[]>([mkVehicle(0)]);
  const [activeVehIdx, setActiveVehIdx] = useState(0);
  const [tripSearch, setTripSearch] = useState('');
  const [tripSearching, setTripSearching] = useState(false);
  const [routeInfo, setRouteInfo] = useState<Record<string, RouteInfo | null>>({});
  const [tripMode, setTripMode] = useState<'driver' | 'task'>('driver');
  const [pendingTaskStop, setPendingTaskStop] = useState<{ lat: number; lng: number; city: string } | null>(null);
  const [pendingTaskDesc, setPendingTaskDesc] = useState('');

  const leafletMap = useRef<L.Map | null>(null);
  const leafletObjs = useRef<L.Layer[]>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const stopIdx = useRef(1);
  const tripModeRef = useRef<'driver' | 'task'>('driver');
  const activeVehIdxRef = useRef(0);

  useEffect(() => { tripModeRef.current = tripMode; }, [tripMode]);
  useEffect(() => { activeVehIdxRef.current = activeVehIdx; }, [activeVehIdx]);

  const showT = (msg: string, type: 'success' | 'error' = 'success') => showToast?.(msg, type);
  const activeVeh = tripFleet[activeVehIdx] || tripFleet[0];

  // ── Koordinatoriaus suplanuoti keitimo taškai (iš planų su changeLat) ──
  const carType = (n: string) => cars.find((c) => c.number === n)?.type ?? '';
  const loadedPlanIds = new Set(tripFleet.flatMap((v) => v.stops.map((s) => s.planId)));
  const plannedPoints = plans.filter((p) => p.status === 'Suplanuota' && p.changeLat != null && p.changeLng != null);

  // Įkelti koordinatoriaus tašką į aktyvų transportą — su jau suplanuotu vairuotoju.
  const loadPointIntoActive = (plan: ReplacementPlan) => {
    if (plan.changeLat == null || plan.changeLng == null) return;
    if (loadedPlanIds.has(plan.id)) { showT('Šis taškas jau įkeltas', 'error'); return; }
    if (activeVeh.stops.length >= activeVeh.capacity) { showT('Pasiekta transporto talpa', 'error'); return; }
    const vid = activeVeh.id;
    setTripFleet((p) => p.map((v) => (v.id === vid
      ? { ...v, stops: [...v.stops, {
          id: stopIdx.current++, lat: plan.changeLat!, lng: plan.changeLng!, city: plan.changeLocation || 'Keitimo taškas',
          type: 'driver', driverId: plan.incomingDriverId, planId: plan.id, addWork: '',
        }] }
      : v)));
    showT(`${plan.carNumber} → ${activeVeh.number || 'transportas'}`);
  };

  // ── Floto pagalbininkai ──────────────────────────────────────────────────
  const updFleet = (id: string, fn: (v: TripVehicle) => TripVehicle) =>
    setTripFleet((p) => p.map((v) => (v.id === id ? fn(v) : v)));
  const addVehicle = () => {
    if (tripFleet.length >= 6) { showT('Maksimalus 6 transporto priemonės', 'error'); return; }
    setTripFleet((p) => [...p, mkVehicle(p.length)]);
    setActiveVehIdx(tripFleet.length);
  };
  const removeVehicle = (id: string) => {
    if (tripFleet.length <= 1) { showT('Turi likti bent viena priemonė', 'error'); return; }
    setTripFleet((p) => p.filter((v) => v.id !== id));
    setActiveVehIdx(0);
  };

  // ── Stotelių pagalbininkai ───────────────────────────────────────────────
  const removeStop = (vehicleId: string, stopId: number) =>
    updFleet(vehicleId, (v) => ({ ...v, stops: v.stops.filter((s) => s.id !== stopId) }));
  const moveStop = (vehicleId: string, stopId: number, dir: number) =>
    updFleet(vehicleId, (v) => {
      const arr = [...v.stops];
      const i = arr.findIndex((s) => s.id === stopId);
      if (i < 0) return v;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return v;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...v, stops: arr };
    });
  const updStop = (vehicleId: string, stopId: number, field: keyof TripStop, val: string) =>
    updFleet(vehicleId, (v) => ({ ...v, stops: v.stops.map((s) => (s.id === stopId ? { ...s, [field]: val } : s)) }));

  // ── Maršruto atstumas per OSRM ───────────────────────────────────────────
  const calcRoute = async (veh: TripVehicle) => {
    if (veh.stops.length === 0) { setRouteInfo((p) => ({ ...p, [veh.id]: null })); return; }
    const pts = [BASE, ...veh.stops, BASE];
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(';');
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`);
      const d = await r.json();
      if (d.routes?.[0]) {
        setRouteInfo((p) => ({ ...p, [veh.id]: { km: Math.round(d.routes[0].distance / 1000), h: Math.round(d.routes[0].duration / 360) / 10 } }));
      }
    } catch { /* tinklo klaida — ignoruojam */ }
  };

  // Perskaičiuoti kai aktyvaus transporto stotelės pasikeičia.
  useEffect(() => { if (activeVeh) void calcRoute(activeVeh); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [JSON.stringify(activeVeh?.stops)]);

  // ── Leaflet inicializacija ───────────────────────────────────────────────
  useEffect(() => {
    if (leafletMap.current || !mapRef.current) return;
    const map = L.map(mapRef.current).setView([BASE.lat, BASE.lng], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OSM</a>',
    }).addTo(map);

    const baseIcon = L.divIcon({
      html: `<div style="background:#15803d;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.4)">🏢</div>`,
      iconSize: [32, 32], iconAnchor: [16, 16], className: '',
    });
    L.marker([BASE.lat, BASE.lng], { icon: baseIcon, zIndexOffset: 1000 })
      .addTo(map).bindPopup(`<b>🏢 Bazė</b><br>${BASE.name}`);

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      let city = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const d = await r.json();
        city = d.address?.city || d.address?.town || d.address?.village || d.address?.municipality || city;
      } catch { /* ignoruojam */ }
      if (tripModeRef.current === 'task') {
        setPendingTaskStop({ lat, lng, city });
        setPendingTaskDesc('');
      } else {
        setTripFleet((p) => p.map((v, i) => (i === activeVehIdxRef.current
          ? { ...v, stops: [...v.stops, { id: stopIdx.current++, lat, lng, city, type: 'driver', driverId: '', planId: '', addWork: '' }] }
          : v)));
      }
    });

    leafletMap.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => { map.remove(); leafletMap.current = null; };
  }, []);

  // ── Floto žymeklių/maršrutų perpiešimas ──────────────────────────────────
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    leafletObjs.current.forEach((o) => { try { o.remove(); } catch { /* ignore */ } });
    leafletObjs.current = [];
    tripFleet.forEach((veh) => {
      const col = veh.color;
      veh.stops.forEach((s, i) => {
        const isActive = veh.id === activeVeh?.id;
        const isTask = s.type === 'task';
        const size = isActive ? 28 : 22;
        const brd = isActive ? 3 : 2;
        const bg = isTask ? '#d97706' : col;
        const inner = isTask
          ? `<span style="font-size:${isActive ? 14 : 11}px">📦</span>`
          : `<span style="font-weight:900;font-size:${isActive ? 12 : 10}px">${i + 1}</span>`;
        const pin = L.divIcon({
          html: `<div style="background:${bg};color:white;width:${size}px;height:${size}px;border-radius:${isTask ? '6px' : '50%'};display:flex;align-items:center;justify-content:center;border:${brd}px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.4);opacity:${isActive ? 1 : 0.7}">${inner}</div>`,
          iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: '',
        });
        const popup = isTask
          ? `<b>📦 Užduotis ${i + 1}</b><br>${s.city}<br><i>${s.taskDesc || '(nėra aprašymo)'}</i>`
          : `<b>${veh.number || '?'} · ${i + 1}</b><br>${s.city}`;
        const mk = L.marker([s.lat, s.lng], { icon: pin }).addTo(map).bindPopup(popup);
        leafletObjs.current.push(mk);
      });
      if (veh.stops.length > 0) {
        const pts: L.LatLngExpression[] = [[BASE.lat, BASE.lng], ...veh.stops.map((s) => [s.lat, s.lng] as [number, number]), [BASE.lat, BASE.lng]];
        const isActive = veh.id === activeVeh?.id;
        const line = L.polyline(pts, { color: col, weight: isActive ? 4 : 2, opacity: isActive ? 0.9 : 0.5, dashArray: '10,6' }).addTo(map);
        leafletObjs.current.push(line);
      }
    });

    // Koordinatoriaus suplanuoti, dar neįkelti keitimo taškai — „šešėliniai" žymekliai.
    plannedPoints.forEach((p) => {
      if (loadedPlanIds.has(p.id)) return;
      const pin = L.divIcon({
        html: `<div style="background:#9C7B36;color:white;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px dashed white;box-shadow:0 2px 6px rgba(0,0,0,0.35);opacity:0.85"><span style="transform:rotate(45deg);font-size:9px;font-weight:900">${p.carNumber.split(' ').pop()}</span></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26], className: '',
      });
      const mk = L.marker([p.changeLat!, p.changeLng!], { icon: pin })
        .addTo(map)
        .bindPopup(`<b>⟳ ${p.carNumber}</b><br>${p.leavingDriverName} → ${p.incomingDriverName}<br>📍 ${p.changeLocation || ''}<br><i>Koordinatoriaus taškas — spausk „+ Į transportą"</i>`);
      leafletObjs.current.push(mk);
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tripFleet, activeVehIdx, plans]);

  // ── Miesto paieška (Nominatim) ───────────────────────────────────────────
  const searchCity = async () => {
    if (!tripSearch.trim()) return;
    setTripSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(tripSearch)}&format=json&limit=1`);
      const d = await r.json();
      if (d[0]) {
        const { lat, lon, display_name } = d[0];
        const city = display_name.split(',')[0];
        leafletMap.current?.setView([+lat, +lon], 11);
        const vid = activeVeh.id;
        setTripFleet((p) => p.map((v) => (v.id === vid
          ? { ...v, stops: [...v.stops, { id: stopIdx.current++, lat: +lat, lng: +lon, city, type: tripModeRef.current === 'task' ? 'task' : 'driver', driverId: '', planId: '', addWork: '', taskDesc: '' }] }
          : v)));
        setTripSearch('');
      } else { showT('Miestas nerastas', 'error'); }
    } catch { showT('Klaida', 'error'); }
    setTripSearching(false);
  };

  const commitTask = () => {
    if (!pendingTaskStop) return;
    const vid = activeVeh.id;
    setTripFleet((p) => p.map((v) => (v.id === vid
      ? { ...v, stops: [...v.stops, { id: stopIdx.current++, lat: pendingTaskStop.lat, lng: pendingTaskStop.lng, city: pendingTaskStop.city, type: 'task', driverId: '', planId: '', addWork: '', taskDesc: pendingTaskDesc }] }
      : v)));
    setPendingTaskStop(null);
  };

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#003087]">Keitimo kelionės planavimas</h2>
          <p className="text-xs text-slate-400 mt-0.5">Bazė: 🏢 {BASE.name} — maršrutas pirmyn ir atgal</p>
        </div>
      </div>

      {/* Fleet selector bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {tripFleet.map((veh, i) => (
          <button key={veh.id} onClick={() => setActiveVehIdx(i)}
            className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all',
              i === activeVehIdx ? 'text-white shadow-md border-transparent' : 'bg-surface text-slate-600 border-hairline hover:border-slate-300')}
            style={i === activeVehIdx ? { background: veh.color } : { borderLeft: `3px solid ${veh.color}` }}>
            <span style={{ color: i === activeVehIdx ? 'white' : veh.color }}>🚐</span>
            <span>{veh.number || `#${i + 1}`}</span>
            <span className="opacity-60">({veh.stops.length} stotelių)</span>
            {routeInfo[veh.id] && <span className="ml-1 font-black">{routeInfo[veh.id]!.km}km</span>}
            {tripFleet.length > 1 && <span onClick={(e) => { e.stopPropagation(); removeVehicle(veh.id); }} className="ml-1 hover:text-red-500 opacity-50 hover:opacity-100">✕</span>}
          </button>
        ))}
        {tripFleet.length < 6 && (
          <button onClick={addVehicle} className="px-3 py-2 rounded-xl text-xs font-bold border-2 border-dashed border-slate-300 text-slate-400 hover:border-[#003087] hover:text-[#003087] transition-all">
            + Pridėti transportą
          </button>
        )}
      </div>

      {/* Koordinatoriaus suplanuoti keitimo taškai */}
      {plannedPoints.length > 0 && (
        <div className="bg-surface rounded-2xl border border-[#9C7B36]/30 overflow-hidden shadow-sm">
          <div className="px-4 py-3 flex items-center gap-2 bg-[#9C7B36]/10 border-b border-[#9C7B36]/20">
            <span className="text-base">⟳</span>
            <p className="text-sm font-bold text-[#5b4a1f]">Suplanuoti keitimo taškai</p>
            <span className="text-xs text-[#9C7B36] font-semibold">
              {plannedPoints.filter((p) => !loadedPlanIds.has(p.id)).length} laukia · {plannedPoints.filter((p) => loadedPlanIds.has(p.id)).length} įkelta
            </span>
            <span className="ml-auto text-[11px] text-slate-400">Koordinatoriaus pažymėti — vairuotojas jau priskirtas</span>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {plannedPoints.map((p) => {
              const loaded = loadedPlanIds.has(p.id);
              return (
                <div key={p.id} className={cn('border rounded-xl p-2.5 flex items-center gap-2.5',
                  loaded ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-hairline')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold bg-[#003087] text-white px-1.5 py-0.5 rounded">{p.carNumber}</span>
                      {carType(p.carNumber) && <span className="text-[10px] text-slate-400">{carType(p.carNumber)}</span>}
                    </div>
                    <p className="text-xs font-semibold truncate mt-1">📍 {p.changeLocation}</p>
                    <p className="text-[11px] text-slate-500 truncate">{p.incomingDriverName} ↔ {p.leavingDriverName}</p>
                  </div>
                  {loaded ? (
                    <span className="shrink-0 text-[10px] font-bold text-emerald-600 inline-flex items-center gap-1">✓ Įkelta</span>
                  ) : (
                    <button onClick={() => loadPointIntoActive(p)}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-[#9C7B36] hover:bg-[#876829] transition-colors">
                      + Į transportą
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT column */}
        <div className="space-y-4">
          {/* Vehicle details */}
          <div className="bg-surface rounded-2xl border-2 p-4 shadow-sm space-y-3" style={{ borderColor: activeVeh.color }}>
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="w-4 h-4 rounded-full shrink-0" style={{ background: activeVeh.color }} />
              <h3 className="font-bold text-[#003087] text-sm">Transporto priemonė #{activeVehIdx + 1}</h3>
              {routeInfo[activeVeh.id] && (
                <div className="ml-auto flex items-center gap-3 text-xs">
                  <span className="font-black text-[#003087]">📏 {routeInfo[activeVeh.id]!.km} km</span>
                  <span className="text-slate-400">⏱ ~{routeInfo[activeVeh.id]!.h} val.</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Numeris">
                <input className={ic} placeholder="pvz. SPR 001" value={activeVeh.number}
                  onChange={(e) => updFleet(activeVeh.id, (v) => ({ ...v, number: e.target.value }))} />
              </Field>
              <Field label="Talpa (žmonių)">
                <select className={sc} value={activeVeh.capacity}
                  onChange={(e) => updFleet(activeVeh.id, (v) => ({ ...v, capacity: +e.target.value }))}>
                  {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n} žmonės</option>)}
                </select>
              </Field>
            </div>
            <Field label="📦 Papildomas darbas (pakeliui)">
              <textarea className={cn(ic, 'resize-none')} rows={2}
                placeholder="pvz. Pasiimti dokumentus Vilniuje, pristatyti krovinio raktus Klaipėdoje..."
                value={activeVeh.additionalWork}
                onChange={(e) => updFleet(activeVeh.id, (v) => ({ ...v, additionalWork: e.target.value }))} />
            </Field>
          </div>

          {/* Mode toggle + City search */}
          <div className="bg-surface rounded-2xl border border-hairline p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-[#003087] shrink-0">Pridėti:</p>
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1 flex-1">
                <button onClick={() => setTripMode('driver')}
                  className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                    tripMode === 'driver' ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                  style={tripMode === 'driver' ? { background: activeVeh.color } : {}}>🚗 Vairuotojas</button>
                <button onClick={() => setTripMode('task')}
                  className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                    tripMode === 'task' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700')}>📦 Užduotis</button>
              </div>
            </div>

            <div className={cn('text-xs px-3 py-2 rounded-xl font-medium',
              tripMode === 'task' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-[#003087]/5 text-[#003087]')}>
              {tripMode === 'task'
                ? '📦 Spusk ant žemėlapio — žymėsi užduoties tašką (pasiimti dokumentus, pristatyti krovinio raktus ir t.t.)'
                : '🚗 Spusk ant žemėlapio — žymėsi vairuotojo keitimo stotelę'}
            </div>

            <p className="text-xs text-slate-400">Arba įvesk miestą:</p>
            <div className="flex gap-2">
              <input className={ic} placeholder="Kaunas, Berlin, Paris..." value={tripSearch}
                onChange={(e) => setTripSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCity()} />
              <button onClick={searchCity} disabled={tripSearching}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white shrink-0 disabled:opacity-50 transition-all"
                style={{ background: tripMode === 'task' ? '#d97706' : activeVeh.color }}>{tripSearching ? '...' : 'Rasti'}</button>
            </div>
          </div>

          {/* Stops list */}
          <div className="bg-surface rounded-2xl border border-hairline p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <h3 className="font-bold text-[#003087] text-sm">Stotelės</h3>
              <span className="text-slate-400 text-xs">({activeVeh.stops.length}/{activeVeh.capacity})</span>
              {routeInfo[activeVeh.id] && (
                <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ background: activeVeh.color }}>
                  {routeInfo[activeVeh.id]!.km} km · {routeInfo[activeVeh.id]!.h} val.
                </span>
              )}
            </div>

            {activeVeh.stops.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-hairline rounded-xl text-slate-400">
                <p className="text-2xl mb-1">📍</p>
                <p className="text-xs font-medium">Spusk ant žemėlapio arba ieškok miesto</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 rounded-lg text-xs">
                  <span className="text-green-700 font-black">🏢 START</span>
                  <span className="text-green-700 font-semibold">{BASE.name}</span>
                </div>

                {activeVeh.stops.map((stop, i) => {
                  const isTask = stop.type === 'task';
                  return (
                    <div key={stop.id} className={cn('border rounded-xl p-3 space-y-2.5',
                      isTask ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-hairline')}>
                      <div className="flex items-center gap-2">
                        <div className={cn('w-6 h-6 text-white text-xs font-black flex items-center justify-center shrink-0',
                          isTask ? 'rounded-md bg-amber-500' : 'rounded-full')}
                          style={isTask ? {} : { background: activeVeh.color }}>
                          {isTask ? '📦' : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-bold text-sm truncate', isTask ? 'text-amber-800' : 'text-[#003087]')}>{stop.city}</p>
                          {isTask && <p className="text-xs text-amber-600 font-semibold">Užduoties taškas</p>}
                        </div>
                        <div className="flex gap-0.5 shrink-0">
                          <button onClick={() => moveStop(activeVeh.id, stop.id, -1)} disabled={i === 0} className="p-1 text-slate-300 hover:text-[#003087] disabled:opacity-20 text-xs">▲</button>
                          <button onClick={() => moveStop(activeVeh.id, stop.id, 1)} disabled={i === activeVeh.stops.length - 1} className="p-1 text-slate-300 hover:text-[#003087] disabled:opacity-20 text-xs">▼</button>
                          <button onClick={() => removeStop(activeVeh.id, stop.id)} className="p-1 text-[#CC1427]/40 hover:text-[#CC1427] text-xs ml-0.5">✕</button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 font-mono ml-8">{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</p>

                      {isTask ? (
                        <div className="ml-8">
                          <Field label="📋 Užduoties aprašymas">
                            <textarea className={cn(ic, 'resize-none')} rows={2}
                              placeholder="pvz. Pasiimti važtaraštį, priduoti dokumentus..."
                              value={stop.taskDesc || ''}
                              onChange={(e) => updStop(activeVeh.id, stop.id, 'taskDesc', e.target.value)} />
                          </Field>
                        </div>
                      ) : (
                        <div className="ml-8 space-y-2">
                          <Field label="Vairuotojas (išlips čia)">
                            <select className={sc} value={stop.driverId} onChange={(e) => updStop(activeVeh.id, stop.id, 'driverId', e.target.value)}>
                              <option value="">— Nepriskirta —</option>
                              <optgroup label="Namuose">
                                {drivers.filter((d) => d.status === 'Namuose').map((d) => (
                                  <option key={d.id} value={d.id}>{d.name} ({d.companyType}·{d.specialization})</option>
                                ))}
                              </optgroup>
                            </select>
                          </Field>
                          <Field label="Keičia (reise vairuotojas / planas)">
                            <select className={sc} value={stop.planId} onChange={(e) => updStop(activeVeh.id, stop.id, 'planId', e.target.value)}>
                              <option value="">— Pasirinkti —</option>
                              <optgroup label="Aktyvūs planai">
                                {plans.filter((p) => p.status === 'Suplanuota').map((p) => (
                                  <option key={p.id} value={p.id}>{p.carNumber}: {p.leavingDriverName} → {p.incomingDriverName} ({p.date})</option>
                                ))}
                              </optgroup>
                              <optgroup label="Reise vairuotojai">
                                {drivers.filter((d) => d.status === 'Reise').map((d) => (
                                  <option key={d.id} value={`DRV:${d.id}`}>{d.name} – {d.currentCar}</option>
                                ))}
                              </optgroup>
                            </select>
                          </Field>
                          <Field label="Papildomas darbas šioje stotelėje">
                            <input className={ic} placeholder="pvz. Pasiimti važtaraštį..."
                              value={stop.addWork || ''}
                              onChange={(e) => updStop(activeVeh.id, stop.id, 'addWork', e.target.value)} />
                          </Field>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 rounded-lg text-xs">
                  <span className="text-green-700 font-black">🏁 FINISH</span>
                  <span className="text-green-700 font-semibold">{BASE.name}</span>
                  {routeInfo[activeVeh.id] && <span className="ml-auto text-green-700 font-black">Iš viso: {routeInfo[activeVeh.id]!.km} km</span>}
                </div>
              </div>
            )}

            {activeVeh.stops.length >= activeVeh.capacity && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 font-bold">
                ⚠️ Pasiekta talpa ({activeVeh.capacity} viet.)
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Map */}
        <div>
          <div className="bg-surface rounded-2xl border border-hairline overflow-hidden shadow-sm" style={{ height: '560px' }}>
            <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ background: 'linear-gradient(90deg,#003087 0%,#004ab5 100%)' }}>
              <span className="text-white text-sm font-bold">🗺️ Žemėlapis</span>
              <div className="flex items-center gap-1.5 flex-wrap ml-2">
                {tripFleet.map((v, i) => (
                  <span key={v.id} className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ background: v.color + '99', border: `1px solid ${v.color}` }}>
                    {v.number || `#${i + 1}`} {v.stops.length > 0 && `(${v.stops.length})`}
                  </span>
                ))}
              </div>
              <span className="text-white/40 text-xs ml-auto">Spusk — stotelė → <span className="font-bold" style={{ color: activeVeh.color }}>#{activeVehIdx + 1}</span></span>
            </div>
            <div ref={mapRef} style={{ height: 'calc(100% - 46px)', width: '100%' }} />
          </div>
        </div>
      </div>

      {/* INSTRUCTIONS (all vehicles) */}
      {tripFleet.some((v) => v.stops.length > 0 || v.number) && (
        <div className="bg-surface rounded-2xl border border-[#003087]/15 overflow-hidden shadow-sm">
          <div className="px-5 py-4 flex items-center gap-3" style={{ background: 'linear-gradient(90deg,#003087 0%,#004ab5 100%)' }}>
            <span className="text-lg">📋</span>
            <div>
              <p className="text-white font-black text-sm uppercase tracking-wide">Viso floto instrukcija</p>
              <p className="text-white/50 text-xs">Bazė: {BASE.name} · Ratas: išvykimas → stotelės → grįžimas</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {tripFleet.filter((v) => routeInfo[v.id]).map((v) => (
                <span key={v.id} className="text-xs font-black px-2 py-1 rounded-lg text-white" style={{ background: v.color + 'cc' }}>
                  {v.number || '?'}: {routeInfo[v.id]!.km}km
                </span>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {tripFleet.map((veh, vi) => (
              <div key={veh.id} className="p-5 space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-5 h-5 rounded-full shrink-0" style={{ background: veh.color }} />
                  <span className="font-black text-[#003087]">🚐 {veh.number || `Transportas #${vi + 1}`}</span>
                  <Badge>{veh.capacity} viet.</Badge>
                  {routeInfo[veh.id] && <>
                    <span className="text-xs font-black text-[#003087]">📏 {routeInfo[veh.id]!.km} km</span>
                    <span className="text-xs text-slate-400">⏱ ~{routeInfo[veh.id]!.h} val.</span>
                  </>}
                  {veh.additionalWork && (
                    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-bold ml-auto">📦 Papild. darbas</span>
                  )}
                </div>

                {veh.additionalWork && (
                  <div className="ml-8 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    <p className="text-xs font-black text-amber-700 uppercase mb-1">📦 Papildomas darbas</p>
                    <p className="text-xs text-amber-800">{veh.additionalWork}</p>
                  </div>
                )}

                {veh.stops.length === 0 ? (
                  <p className="text-xs text-slate-400 italic ml-8">Stotelių nėra</p>
                ) : (
                  <div className="space-y-2 ml-2">
                    <div className="flex gap-3 items-center">
                      <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm shrink-0">🏢</div>
                      <div>
                        <p className="text-xs font-bold text-emerald-700">Išvykimas — {BASE.name}</p>
                        <p className="text-xs text-slate-400">Su {veh.stops.filter((s) => s.driverId).length} vairuotojais</p>
                      </div>
                    </div>

                    {veh.stops.map((stop, i) => {
                      const isTask = stop.type === 'task';
                      const drv = stop.driverId ? drivers.find((d) => d.id === stop.driverId) : null;
                      let replaces: string | null = null;
                      let replacesCar = '';
                      if (!isTask) {
                        if (stop.planId && !stop.planId.startsWith('DRV:')) {
                          const p = plans.find((x) => x.id === stop.planId);
                          if (p) { replaces = p.leavingDriverName; replacesCar = p.carNumber; }
                        } else if (stop.planId?.startsWith('DRV:')) {
                          const d = drivers.find((x) => x.id === stop.planId.replace('DRV:', ''));
                          if (d) { replaces = d.name; replacesCar = d.currentCar; }
                        }
                      }
                      return (
                        <div key={stop.id}>
                          <div className="ml-3.5 w-px h-3 bg-slate-200" />
                          {isTask ? (
                            <div className="flex gap-3 items-start">
                              <div className="w-7 h-7 rounded-lg bg-amber-500 text-white text-sm flex items-center justify-center shrink-0">📦</div>
                              <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                                <p className="text-sm font-bold text-amber-800">📦 Užduotis — {stop.city}</p>
                                <p className="text-xs font-mono text-slate-400">{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</p>
                                {stop.taskDesc
                                  ? <p className="text-xs text-amber-700 font-semibold border-t border-amber-200 pt-1.5">{stop.taskDesc}</p>
                                  : <p className="text-xs text-amber-400 italic border-t border-amber-200 pt-1.5">Aprašymas nepridėtas</p>}
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-3 items-start">
                              <div className="w-7 h-7 rounded-full text-white text-xs font-black flex items-center justify-center shrink-0" style={{ background: drv ? veh.color : '#94a3b8' }}>{i + 1}</div>
                              <div className="flex-1 bg-slate-50 border border-hairline rounded-xl p-3 space-y-1.5">
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <p className="text-sm font-bold text-[#003087]">📍 {stop.city}</p>
                                  {replacesCar && <span className="font-mono text-xs font-black bg-[#003087] text-white px-2 py-0.5 rounded">{replacesCar}</span>}
                                </div>
                                <p className="text-xs font-mono text-slate-400">{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</p>
                                <div className="border-t border-hairline pt-1.5 space-y-1">
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-emerald-600 font-bold">↓ Išlipa:</span>
                                    <span className={cn('font-semibold', drv ? 'text-[#003087]' : 'text-slate-400 italic')}>{drv ? drv.name : 'nepriskirta'}</span>
                                    {drv && <Badge>{drv.companyType}</Badge>}
                                  </div>
                                  {replaces && (
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-[#CC1427] font-bold">⇄ Keičia:</span>
                                      <span className="font-semibold">{replaces}</span>
                                      {replacesCar && <span className="text-slate-400 font-mono">→ {replacesCar}</span>}
                                    </div>
                                  )}
                                  {stop.addWork && (
                                    <div className="flex items-center gap-2 text-xs bg-amber-50 rounded-lg px-2 py-1">
                                      <span className="text-amber-600 font-bold">📦</span>
                                      <span className="text-amber-700">{stop.addWork}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="ml-3.5 w-px h-3 bg-slate-200" />
                    <div className="flex gap-3 items-center">
                      <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm shrink-0">🏁</div>
                      <div>
                        <p className="text-xs font-bold text-emerald-700">Grįžimas — {BASE.name}</p>
                        {routeInfo[veh.id] && <p className="text-xs text-slate-400">Iš viso: {routeInfo[veh.id]!.km} km · ~{routeInfo[veh.id]!.h} val.</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending task modal */}
      {pendingTaskStop && (
        <div className="fixed inset-0 bg-[#003087]/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setPendingTaskStop(null)}>
          <div className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-amber-200">
            <div className="px-5 py-4 flex items-center gap-3 bg-amber-500">
              <span className="text-2xl">📦</span>
              <div>
                <p className="text-white font-black text-sm">Nauja užduotis</p>
                <p className="text-white/70 text-xs">{pendingTaskStop.city}</p>
              </div>
              <button onClick={() => setPendingTaskStop(null)} className="ml-auto p-1.5 hover:bg-surface/20 rounded-lg text-white/70">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">📍 <span className="font-mono">{pendingTaskStop.lat.toFixed(4)}, {pendingTaskStop.lng.toFixed(4)}</span></p>
              <Field label="Užduoties aprašymas">
                <textarea autoFocus className={cn(ic, 'resize-none')} rows={3}
                  placeholder="pvz. Pasiimti dokumentus iš ekspedicijos, priduoti raktus, paimti krovinį..."
                  value={pendingTaskDesc}
                  onChange={(e) => setPendingTaskDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTask(); } }} />
              </Field>
              <p className="text-xs text-slate-400">Enter — išsaugoti · Shift+Enter — nauja eilutė</p>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setPendingTaskStop(null)}
                className="flex-1 py-2.5 border border-hairline rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-50">
                Atšaukti
              </button>
              <button onClick={commitTask}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors">
                📦 Pridėti užduotį
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Koordinatoriaus skiltis su dviem režimais:
//  1) „Keitimai" — kurios mašinos keičiasi (aktyvūs planai); žemėlapyje pažymimas
//     keitimo taškas. Galima pridėti papildomą užduotį (ką nuvežti) — tada į
//     Kelionę keliauja dviguba užduotis: keitimas + užduotis.
//  2) „Užduotys" — atskiros papildomos užduotys su vieta; galima išsaugoti
//     pasikartojančias ateičiai. Aktyvios užduotys atkeliauja į Kelionės skiltį.

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MapPin, Search, Check, X, ArrowRight, Crosshair, Navigation, Package, Plus, Bookmark, Send, Trash2 } from 'lucide-react';
import type { Car, Driver, ReplacementPlan, CarType, TaskPoint } from '../types';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
const BASE = { lat: 54.9127, lng: 23.9417, name: 'Ateities pl. 23, Kaunas' };

interface Props {
  plans: ReplacementPlan[];
  cars: Car[];
  drivers: Driver[];
  taskPoints: TaskPoint[];
  onSetPoint: (planId: string, lat: number, lng: number, location: string) => void;
  onClearPoint: (planId: string) => void;
  onSetPlanTask: (planId: string, task: string) => void;
  onAddTask: (t: Omit<TaskPoint, 'id'>) => string;
  onUpdateTask: (id: string, updates: Partial<TaskPoint>) => void;
  onDeleteTask: (id: string) => void;
  onActivateSaved: (tpl: TaskPoint) => void;
  onGoTrip: () => void;
}

type Mode = 'changes' | 'tasks';

export default function CoordinatorBoard({ plans, cars, taskPoints, onSetPoint, onClearPoint, onSetPlanTask, onAddTask, onUpdateTask, onDeleteTask, onActivateSaved, onGoTrip }: Props) {
  const active = useMemo(() => plans.filter(p => p.status === 'Suplanuota'), [plans]);
  const carType = (n: string): CarType | '' => (cars.find(c => c.number === n)?.type ?? '') as CarType | '';

  const [mode, setMode] = useState<Mode>('changes');
  // changes mode
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // tasks mode — kuriam objektui taikomas žemėlapio paspaudimas
  const [draftTask, setDraftTask] = useState<{ title: string; description: string; lat: number | null; lng: number | null; location: string; saved: boolean }>(
    { title: '', description: '', lat: null, lng: null, location: '', saved: false });
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  const activeTasks = taskPoints.filter(t => t.active);
  const savedTasks = taskPoints.filter(t => t.saved);

  useEffect(() => {
    if (mode !== 'changes') return;
    if (selectedId && active.some(p => p.id === selectedId)) return;
    const next = active.find(p => p.changeLat == null) ?? active[0];
    setSelectedId(next?.id ?? null);
  }, [active, selectedId, mode]);

  const selected = active.find(p => p.id === selectedId) ?? null;

  // Žemėlapio paspaudimas: changes → keitimo taškas; tasks → draft vieta.
  const clickCtx = useRef<{ mode: Mode; planId: string | null }>({ mode: 'changes', planId: null });
  useEffect(() => { clickCtx.current = { mode, planId: selectedId }; }, [mode, selectedId]);
  const onSetRef = useRef(onSetPoint); useEffect(() => { onSetRef.current = onSetPoint; }, [onSetPoint]);

  const leafletMap = useRef<L.Map | null>(null);
  const markers = useRef<L.Layer[]>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);

  // ── Leaflet init ──
  useEffect(() => {
    if (leafletMap.current || !mapRef.current) return;
    const map = L.map(mapRef.current).setView([BASE.lat, BASE.lng], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
    const baseIcon = L.divIcon({ html: `<div style="background:#9C7B36;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;border:3px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.35)">🏢</div>`, iconSize: [30, 30], iconAnchor: [15, 15], className: '' });
    L.marker([BASE.lat, BASE.lng], { icon: baseIcon, zIndexOffset: 1000 }).addTo(map).bindPopup(`<b>🏢 Bazė</b><br>${BASE.name}`);
    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      let city = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const d = await r.json();
        city = d.address?.city || d.address?.town || d.address?.village || d.address?.municipality || city;
      } catch { /* ignore */ }
      const ctx = clickCtx.current;
      if (ctx.mode === 'changes') { if (ctx.planId) onSetRef.current(ctx.planId, lat, lng, city); }
      else setDraftTask(prev => ({ ...prev, lat, lng, location: city }));
    });
    leafletMap.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); leafletMap.current = null; };
  }, []);

  // ── Žymeklių perpiešimas ──
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    markers.current.forEach(o => { try { o.remove(); } catch { /* ignore */ } });
    markers.current = [];
    const pts: L.LatLngExpression[] = [];

    if (mode === 'changes') {
      active.forEach(p => {
        if (p.changeLat == null || p.changeLng == null) return;
        const isSel = p.id === selectedId;
        const bg = isSel ? '#9C7B36' : '#272219';
        const size = isSel ? 32 : 26;
        const dbl = !!p.changeTask;
        const pin = L.divIcon({ html: `<div style="background:${bg};color:white;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.4)"><span style="transform:rotate(45deg);font-size:${isSel ? 11 : 9}px;font-weight:900">${dbl ? '📦' : p.carNumber.split(' ').pop()}</span></div>`, iconSize: [size, size], iconAnchor: [size / 2, size], className: '' });
        const mk = L.marker([p.changeLat, p.changeLng], { icon: pin, zIndexOffset: isSel ? 800 : 0 }).addTo(map)
          .bindPopup(`<b>${p.carNumber}</b><br>${p.leavingDriverName} → ${p.incomingDriverName}<br>📍 ${p.changeLocation || ''}${p.changeTask ? `<br>📦 ${p.changeTask}` : ''}`);
        markers.current.push(mk); pts.push([p.changeLat, p.changeLng]);
      });
    } else {
      activeTasks.forEach(t => {
        if (t.lat == null || t.lng == null) return;
        const pin = L.divIcon({ html: `<div style="background:#D97706;color:white;width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.4);font-size:12px">📦</div>`, iconSize: [26, 26], iconAnchor: [13, 13], className: '' });
        const mk = L.marker([t.lat, t.lng], { icon: pin }).addTo(map).bindPopup(`<b>📦 ${t.title || 'Užduotis'}</b><br>📍 ${t.location}<br>${t.description || ''}`);
        markers.current.push(mk); pts.push([t.lat, t.lng]);
      });
      if (draftTask.lat != null && draftTask.lng != null) {
        const pin = L.divIcon({ html: `<div style="background:#9C7B36;color:white;width:30px;height:30px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:2px dashed white;box-shadow:0 3px 8px rgba(0,0,0,0.45);font-size:13px">✚</div>`, iconSize: [30, 30], iconAnchor: [15, 15], className: '' });
        const mk = L.marker([draftTask.lat, draftTask.lng], { icon: pin, zIndexOffset: 900 }).addTo(map).bindPopup(`<b>Naujas taškas</b><br>📍 ${draftTask.location}`);
        markers.current.push(mk); pts.push([draftTask.lat, draftTask.lng]);
      }
    }
    if (pts.length) { try { map.fitBounds(L.latLngBounds([[BASE.lat, BASE.lng], ...pts]).pad(0.25), { maxZoom: 9, animate: false }); } catch { /* ignore */ } }
  }, [mode, active, selectedId, taskPoints, draftTask.lat, draftTask.lng]);

  // ── Miesto paieška ──
  const searchCity = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=1`);
      const d = await r.json();
      if (d[0]) {
        const { lat, lon, display_name } = d[0]; const loc = display_name.split(',')[0];
        leafletMap.current?.setView([+lat, +lon], 10);
        if (mode === 'changes') { if (selected) onSetPoint(selected.id, +lat, +lon, loc); }
        else setDraftTask(prev => ({ ...prev, lat: +lat, lng: +lon, location: loc }));
        setSearch('');
      }
    } catch { /* ignore */ }
    setSearching(false);
  };

  const commitTask = (asSaved: boolean) => {
    if (draftTask.lat == null) return;
    onAddTask({ title: draftTask.title.trim() || draftTask.location, description: draftTask.description.trim(), lat: draftTask.lat, lng: draftTask.lng, location: draftTask.location, saved: asSaved, active: true });
    setDraftTask({ title: '', description: '', lat: null, lng: null, location: '', saved: false });
  };

  const withPoint = active.filter(p => p.changeLat != null).length;

  // ── Keitimų grupė ──
  const ChangeGroup = ({ type, label }: { type: CarType; label: string }) => {
    const rows = active.filter(p => carType(p.carNumber) === type);
    if (!rows.length) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', type === 'Tentas' ? 'bg-blue-400' : 'bg-cyan-400')} />
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
          <span className="text-[11px] text-muted">· {rows.length}</span>
        </div>
        {rows.map(p => {
          const isSel = p.id === selectedId;
          const set = p.changeLat != null;
          return (
            <div key={p.id} className={cn('rounded-xl border transition-all', isSel ? 'border-gold bg-gold/[0.06] ring-1 ring-gold/30' : 'border-hairline bg-surface')}>
              <button onClick={() => { setSelectedId(p.id); if (set && p.changeLat != null) leafletMap.current?.setView([p.changeLat, p.changeLng!], 10); }} className="w-full text-left p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold bg-ink text-white px-2 py-0.5 rounded">{p.carNumber}</span>
                  <span className="text-xs text-muted">{p.date}</span>
                  <span className={cn('ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', set ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                    {set ? <><Check size={11} /> Taškas</> : <><MapPin size={11} /> Nenustatyta</>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[13px] mt-1.5">
                  <span className="text-muted truncate">{p.leavingDriverName}</span>
                  <ArrowRight size={13} className="text-gold shrink-0" />
                  <span className="font-semibold truncate">{p.incomingDriverName}</span>
                </div>
              </button>
              {set && (
                <div className="px-3 pb-3 -mt-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 truncate"><MapPin size={12} /> {p.changeLocation}</span>
                    <button onClick={() => onClearPoint(p.id)} className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors"><X size={12} /> Išvalyti</button>
                  </div>
                  {/* Dviguba užduotis: ką nuvežti į keitimo tašką */}
                  <div className="flex items-center gap-2">
                    <Package size={13} className="text-amber-500 shrink-0" />
                    <input
                      defaultValue={p.changeTask ?? ''}
                      onBlur={(e) => { if ((e.target.value || '') !== (p.changeTask ?? '')) onSetPlanTask(p.id, e.target.value); }}
                      placeholder="Papildoma užduotis (ką nuvežti)…"
                      className="flex-1 bg-canvas border border-hairline rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-gold/60"
                    />
                  </div>
                  {p.changeTask && <p className="text-[10px] text-amber-600 pl-5">→ Kelionėje: keitimas + užduotis</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Režimo perjungiklis + suvestinė */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-ink/[0.06] p-1 rounded-xl">
          <button onClick={() => setMode('changes')} className={cn('px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5', mode === 'changes' ? 'bg-surface shadow-card text-ink' : 'text-muted')}><Navigation size={13} /> Keitimai · {active.length}</button>
          <button onClick={() => setMode('tasks')} className={cn('px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5', mode === 'tasks' ? 'bg-surface shadow-card text-ink' : 'text-muted')}><Package size={13} /> Užduotys · {activeTasks.length}</button>
        </div>
        {mode === 'changes' && (
          <div className="flex items-center gap-2 bg-surface border border-hairline rounded-xl px-3 py-1.5 text-sm">
            <b className="font-semibold">{withPoint}</b><span className="text-muted">/ {active.length} taškų</span>
          </div>
        )}
        <button onClick={onGoTrip} className="ml-auto inline-flex items-center gap-2 bg-ink text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-ink/85 transition-all">
          Atidaryti Kelionę <ArrowRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,430px)_1fr] gap-5">
        {/* Kairė */}
        <div className="space-y-4">
          {mode === 'changes' ? (
            active.length === 0 ? (
              <div className="bg-surface border border-hairline rounded-2xl p-8 text-center text-muted">
                <MapPin size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">Aktyvių keitimo planų nėra</p>
              </div>
            ) : (
              <>
                <div className="bg-gold/[0.06] border border-gold/30 rounded-xl px-3.5 py-2.5 text-xs text-ink/80 flex items-center gap-2">
                  <Crosshair size={14} className="text-gold shrink-0" />
                  {selected ? <span>Pasirinktas <b className="font-semibold">{selected.carNumber}</b> — spustelėkite žemėlapyje / ieškokite miesto. Galite pridėti ir papildomą užduotį.</span> : <span>Pasirinkite planą.</span>}
                </div>
                <ChangeGroup type="Tentas" label="Tentai" />
                <ChangeGroup type="Refas" label="Refai" />
              </>
            )
          ) : (
            <>
              {/* Naujos užduoties kūrimas */}
              <div className="bg-surface border border-hairline rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2"><Plus size={15} className="text-gold" /><p className="text-sm font-semibold">Nauja užduotis</p></div>
                <input value={draftTask.title} onChange={(e) => setDraftTask(p => ({ ...p, title: e.target.value }))} placeholder="Pavadinimas (pvz. Pasiimti dokumentus)" className="w-full bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold/60" />
                <textarea value={draftTask.description} onChange={(e) => setDraftTask(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Aprašymas — ką reikia atlikti / kur užvažiuoti" className="w-full bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-gold/60" />
                <div className={cn('flex items-center gap-2 text-xs px-3 py-2 rounded-lg', draftTask.lat != null ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                  <MapPin size={13} className="shrink-0" />
                  {draftTask.lat != null ? <span className="truncate">{draftTask.location}</span> : <span>Spustelėkite žemėlapyje arba ieškokite miesto</span>}
                </div>
                <div className="flex gap-2">
                  <button disabled={draftTask.lat == null} onClick={() => commitTask(false)} className="flex-1 inline-flex items-center justify-center gap-1.5 bg-ink text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-ink/85 disabled:opacity-40 transition-all"><Send size={13} /> Į Kelionę</button>
                  <button disabled={draftTask.lat == null} onClick={() => commitTask(true)} title="Išsaugoti pasikartojančią (ateičiai)" className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gold/15 text-gold border border-gold/40 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-gold/25 disabled:opacity-40 transition-all"><Bookmark size={13} /> Išsaugoti</button>
                </div>
              </div>

              {/* Aktyvios užduotys */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted px-1">Aktyvios užduotys → Kelionė · {activeTasks.length}</p>
                {activeTasks.length === 0 && <p className="text-xs text-muted px-1">Nėra. Sukurkite naują arba aktyvuokite išsaugotą.</p>}
                {activeTasks.map(t => (
                  <div key={t.id} className="bg-surface border border-hairline rounded-xl p-3 flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><Package size={14} /></div>
                    <button onClick={() => t.lat != null && leafletMap.current?.setView([t.lat, t.lng!], 10)} className="min-w-0 flex-1 text-left">
                      <p className="text-[13px] font-semibold truncate">{t.title}</p>
                      <p className="text-[11px] text-muted truncate">📍 {t.location}{t.description ? ` · ${t.description}` : ''}</p>
                    </button>
                    {t.saved && <span title="Išsaugotas šablonas" className="shrink-0 text-gold"><Bookmark size={13} /></span>}
                    <button onClick={() => onDeleteTask(t.id)} className="shrink-0 text-muted hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>

              {/* Išsaugotos (pasikartojančios) užduotys */}
              {savedTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted px-1 flex items-center gap-1.5"><Bookmark size={12} className="text-gold" /> Išsaugotos (ateičiai) · {savedTasks.length}</p>
                  {savedTasks.map(t => (
                    <div key={`s${t.id}`} className="bg-gold/[0.05] border border-gold/25 rounded-xl p-3 flex items-center gap-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold truncate">{t.title}</p>
                        <p className="text-[11px] text-muted truncate">📍 {t.location}</p>
                      </div>
                      <button onClick={() => onActivateSaved(t)} className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-gold hover:text-ink transition-colors"><Send size={12} /> Į kelionę</button>
                      <button onClick={() => onDeleteTask(t.id)} className="shrink-0 text-muted hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Dešinė: žemėlapis + paieška */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-surface border border-hairline rounded-xl px-3">
              <Search size={15} className="text-muted shrink-0" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCity()}
                placeholder={mode === 'changes' ? (selected ? 'Miestas, pvz. Poznań…' : 'Pirma pasirinkite planą') : 'Miestas užduočiai…'}
                disabled={mode === 'changes' && !selected}
                className="flex-1 bg-transparent py-2.5 text-sm focus:outline-none disabled:opacity-50" />
            </div>
            <button onClick={searchCity} disabled={searching || (mode === 'changes' && !selected)} className="px-4 rounded-xl text-sm font-medium text-white bg-gold hover:bg-gold/90 disabled:opacity-40 transition-all">{searching ? '…' : 'Rasti'}</button>
          </div>
          <div className="bg-surface rounded-2xl border border-hairline overflow-hidden shadow-card" style={{ height: '560px' }}>
            <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

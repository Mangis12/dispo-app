// Koordinatoriaus skiltis: rodo, kurios mašinos keičiasi (aktyvūs planai),
// ir leidžia žemėlapyje pažymėti numatomą keitimo tašką. Taškas išsaugomas
// plane (changeLat/Lng/Location) ir automatiškai atsiranda „Kelionė" skiltyje,
// kur pagal jį priskiriamos keitiminės mašinos su suplanuotu vairuotoju.

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MapPin, Search, Check, X, ArrowRight, Crosshair, Navigation } from 'lucide-react';
import type { Car, Driver, ReplacementPlan, CarType } from '../types';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const BASE = { lat: 54.9127, lng: 23.9417, name: 'Ateities pl. 23, Kaunas' };

interface Props {
  plans: ReplacementPlan[];
  cars: Car[];
  drivers: Driver[];
  onSetPoint: (planId: string, lat: number, lng: number, location: string) => void;
  onClearPoint: (planId: string) => void;
  onGoTrip: () => void;
}

export default function CoordinatorBoard({ plans, cars, onSetPoint, onClearPoint, onGoTrip }: Props) {
  const active = useMemo(() => plans.filter(p => p.status === 'Suplanuota'), [plans]);
  const carType = (n: string): CarType | '' => (cars.find(c => c.number === n)?.type ?? '') as CarType | '';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  // Auto-pasirenkam pirmą planą be taško (arba pirmą iš viso).
  useEffect(() => {
    if (selectedId && active.some(p => p.id === selectedId)) return;
    const next = active.find(p => p.changeLat == null) ?? active[0];
    setSelectedId(next?.id ?? null);
  }, [active, selectedId]);

  const selected = active.find(p => p.id === selectedId) ?? null;
  const selectedRef = useRef<ReplacementPlan | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const leafletMap = useRef<L.Map | null>(null);
  const markers = useRef<L.Layer[]>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const onSetRef = useRef(onSetPoint);
  useEffect(() => { onSetRef.current = onSetPoint; }, [onSetPoint]);

  // ── Leaflet init ──
  useEffect(() => {
    if (leafletMap.current || !mapRef.current) return;
    const map = L.map(mapRef.current).setView([BASE.lat, BASE.lng], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OSM</a>',
    }).addTo(map);
    const baseIcon = L.divIcon({
      html: `<div style="background:#9C7B36;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;border:3px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.35)">🏢</div>`,
      iconSize: [30, 30], iconAnchor: [15, 15], className: '',
    });
    L.marker([BASE.lat, BASE.lng], { icon: baseIcon, zIndexOffset: 1000 }).addTo(map).bindPopup(`<b>🏢 Bazė</b><br>${BASE.name}`);

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const sel = selectedRef.current;
      if (!sel) return;
      const { lat, lng } = e.latlng;
      let city = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const d = await r.json();
        city = d.address?.city || d.address?.town || d.address?.village || d.address?.municipality || city;
      } catch { /* ignore */ }
      onSetRef.current(sel.id, lat, lng, city);
    });

    leafletMap.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); leafletMap.current = null; };
  }, []);

  // ── Žymeklių perpiešimas pagal planus su tašku ──
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    markers.current.forEach(o => { try { o.remove(); } catch { /* ignore */ } });
    markers.current = [];
    const pts: L.LatLngExpression[] = [];
    active.forEach(p => {
      if (p.changeLat == null || p.changeLng == null) return;
      const isSel = p.id === selectedId;
      const bg = isSel ? '#9C7B36' : '#272219';
      const size = isSel ? 32 : 26;
      const pin = L.divIcon({
        html: `<div style="background:${bg};color:white;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.4)"><span style="transform:rotate(45deg);font-size:${isSel ? 11 : 9}px;font-weight:900">${p.carNumber.split(' ').pop()}</span></div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size], className: '',
      });
      const mk = L.marker([p.changeLat, p.changeLng], { icon: pin, zIndexOffset: isSel ? 800 : 0 })
        .addTo(map)
        .bindPopup(`<b>${p.carNumber}</b><br>${p.leavingDriverName} → ${p.incomingDriverName}<br>📍 ${p.changeLocation || ''}<br>🗓 ${p.date}`);
      markers.current.push(mk);
      pts.push([p.changeLat, p.changeLng]);
    });
    if (pts.length) {
      try { map.fitBounds(L.latLngBounds([[BASE.lat, BASE.lng], ...pts]).pad(0.25), { maxZoom: 9, animate: false }); } catch { /* ignore */ }
    }
  }, [active, selectedId]);

  // ── Miesto paieška ──
  const searchCity = async () => {
    if (!search.trim() || !selected) return;
    setSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=1`);
      const d = await r.json();
      if (d[0]) {
        const { lat, lon, display_name } = d[0];
        leafletMap.current?.setView([+lat, +lon], 10);
        onSetPoint(selected.id, +lat, +lon, display_name.split(',')[0]);
        setSearch('');
      }
    } catch { /* ignore */ }
    setSearching(false);
  };

  const withPoint = active.filter(p => p.changeLat != null).length;

  const Group = ({ type, label }: { type: CarType; label: string }) => {
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
            <button key={p.id} onClick={() => { setSelectedId(p.id); if (set && p.changeLat != null) leafletMap.current?.setView([p.changeLat, p.changeLng!], 10); }}
              className={cn('w-full text-left rounded-xl border p-3 transition-all',
                isSel ? 'border-gold bg-gold/[0.06] ring-1 ring-gold/30' : 'border-hairline bg-surface hover:border-ink/25')}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold bg-ink text-white px-2 py-0.5 rounded">{p.carNumber}</span>
                <span className="text-xs text-muted">{p.date}</span>
                <span className={cn('ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  set ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                  {set ? <><Check size={11} /> Taškas</> : <><MapPin size={11} /> Nenustatyta</>}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[13px] mt-1.5">
                <span className="text-muted truncate">{p.leavingDriverName}</span>
                <ArrowRight size={13} className="text-gold shrink-0" />
                <span className="font-semibold truncate">{p.incomingDriverName}</span>
              </div>
              {set && (
                <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-hairline">
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 truncate"><MapPin size={12} /> {p.changeLocation}</span>
                  <span onClick={(e) => { e.stopPropagation(); onClearPoint(p.id); }}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors"><X size={12} /> Išvalyti</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Suvestinė */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-surface border border-hairline rounded-xl px-3.5 py-2">
          <Navigation size={15} className="text-gold" />
          <span className="text-sm"><b className="font-semibold">{withPoint}</b> / {active.length} taškų nustatyta</span>
        </div>
        <button onClick={onGoTrip} className="inline-flex items-center gap-2 bg-ink text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-ink/85 transition-all">
          Atidaryti Kelionę <ArrowRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-5">
        {/* Kairė: planų sąrašas */}
        <div className="space-y-4">
          {active.length === 0 ? (
            <div className="bg-surface border border-hairline rounded-2xl p-8 text-center text-muted">
              <MapPin size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Aktyvių keitimo planų nėra</p>
              <p className="text-xs mt-1">Sukurkite planą skiltyje „Planavimas".</p>
            </div>
          ) : (
            <>
              <div className="bg-gold/[0.06] border border-gold/30 rounded-xl px-3.5 py-2.5 text-xs text-ink/80 flex items-center gap-2">
                <Crosshair size={14} className="text-gold shrink-0" />
                {selected
                  ? <span>Pasirinktas <b className="font-semibold">{selected.carNumber}</b> — spustelėkite žemėlapyje arba ieškokite miesto, kad pažymėtumėte keitimo tašką.</span>
                  : <span>Pasirinkite planą iš sąrašo.</span>}
              </div>
              <Group type="Tentas" label="Tentai" />
              <Group type="Refas" label="Refai" />
            </>
          )}
        </div>

        {/* Dešinė: žemėlapis + paieška */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-surface border border-hairline rounded-xl px-3">
              <Search size={15} className="text-muted shrink-0" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} disabled={!selected}
                onKeyDown={(e) => e.key === 'Enter' && searchCity()}
                placeholder={selected ? 'Miestas, pvz. Poznań, Berlin…' : 'Pirma pasirinkite planą'}
                className="flex-1 bg-transparent py-2.5 text-sm focus:outline-none disabled:opacity-50" />
            </div>
            <button onClick={searchCity} disabled={searching || !selected}
              className="px-4 rounded-xl text-sm font-medium text-white bg-gold hover:bg-gold/90 disabled:opacity-40 transition-all">
              {searching ? '…' : 'Rasti'}
            </button>
          </div>
          <div className="bg-surface rounded-2xl border border-hairline overflow-hidden shadow-card" style={{ height: '560px' }}>
            <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

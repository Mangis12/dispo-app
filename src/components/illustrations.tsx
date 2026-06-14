// Line-art iliustracijos (premium, „Etihad" dvasia, mūsų paletėje).
// Aukso kontūrai (#9C7B36 / soft / pale) ant smėlio/kremo. Be išorinių
// priklausomybių — gryni SVG, visada aiškūs, lengvi, tinka minimalizmui.

import type { CSSProperties } from 'react';

const GOLD = '#9C7B36';
const GOLD_SOFT = '#BE9B5A';
const INK = '#272219';

// ── Vilkikas (puspriekabė) — šoninis kontūras ───────────────────────────────
export function SemiTruck({ className, stroke = GOLD, style }: { className?: string; stroke?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 220 96" fill="none" className={className} style={style}
      stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {/* Puspriekabė */}
      <rect x="8" y="20" width="120" height="50" rx="3" />
      <line x1="20" y1="20" x2="20" y2="70" opacity="0.45" />
      <line x1="116" y1="20" x2="116" y2="70" opacity="0.45" />
      {/* Vilkiko kabina */}
      <path d="M132 70 V40 q0-6 6-6 h24 l18 18 v18 z" />
      <path d="M150 34 v14 h22" opacity="0.7" />
      {/* Žibintas */}
      <path d="M180 56 h6" />
      {/* Rato kontaktai / ašys */}
      <path d="M128 70 h6 M186 70 h6" opacity="0.5" />
      {/* Ratai */}
      <circle cx="46" cy="74" r="10" />
      <circle cx="46" cy="74" r="3" opacity="0.6" />
      <circle cx="92" cy="74" r="10" />
      <circle cx="92" cy="74" r="3" opacity="0.6" />
      <circle cx="166" cy="74" r="10" />
      <circle cx="166" cy="74" r="3" opacity="0.6" />
      {/* Kelias */}
      <line x1="0" y1="86" x2="220" y2="86" opacity="0.35" />
      <line x1="2" y1="86" x2="20" y2="86" strokeWidth="2.4" />
      <line x1="40" y1="86" x2="58" y2="86" strokeWidth="2.4" opacity="0.7" />
      <line x1="78" y1="86" x2="96" y2="86" strokeWidth="2.4" opacity="0.45" />
    </svg>
  );
}

// ── Maršrutas su smeigtukais + kompasu ──────────────────────────────────────
export function RouteMark({ className, stroke = GOLD, style }: { className?: string; stroke?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className} style={style}
      stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 96 C 36 60, 70 80, 84 34" strokeDasharray="2 7" opacity="0.8" />
      {/* Pradžios smeigtukas */}
      <path d="M22 96 c -7 -9 -7 -16 0 -22 c 7 6 7 13 0 22 z" />
      <circle cx="22" cy="80" r="2.4" />
      {/* Pabaigos smeigtukas */}
      <path d="M84 34 c -7 -9 -7 -16 0 -22 c 7 6 7 13 0 22 z" fill={stroke} fillOpacity="0.12" />
      <circle cx="84" cy="18" r="2.4" />
      {/* Kompaso žvaigždutė */}
      <g opacity="0.55" transform="translate(98 92)">
        <path d="M0 -10 L2.5 0 L0 10 L-2.5 0 Z" />
        <path d="M-10 0 L0 2.5 L10 0 L0 -2.5 Z" />
      </g>
    </svg>
  );
}

// ── Kompasas (smulkus akcentas) ─────────────────────────────────────────────
export function Compass({ className, stroke = GOLD, style }: { className?: string; stroke?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} style={style}
      stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="20" opacity="0.5" />
      <circle cx="24" cy="24" r="15" opacity="0.25" />
      <path d="M24 10 L29 24 L24 38 L19 24 Z" fill={stroke} fillOpacity="0.12" />
      <circle cx="24" cy="24" r="2" fill={stroke} />
    </svg>
  );
}

// ── Kinematografinė scena: horizontas, saulė, kalvos, kelias, vilkikas ──────
// Naudojama prisijungimo fone ir plonoje „hero" juostoje (preserveAspectRatio).
export function RoadHorizonScene({ className, style, preserve = 'xMidYMid slice' }: { className?: string; style?: CSSProperties; preserve?: string }) {
  return (
    <svg viewBox="0 0 800 360" fill="none" className={className} style={style} preserveAspectRatio={preserve}>
      <defs>
        <linearGradient id="rh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7EFDD" />
          <stop offset="0.55" stopColor="#F2ECE1" />
          <stop offset="1" stopColor="#EBE2CE" />
        </linearGradient>
        <radialGradient id="rh-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={GOLD_SOFT} stopOpacity="0.55" />
          <stop offset="0.6" stopColor={GOLD_SOFT} stopOpacity="0.12" />
          <stop offset="1" stopColor={GOLD_SOFT} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="360" fill="url(#rh-sky)" />
      {/* Saulės švytėjimas */}
      <circle cx="560" cy="150" r="150" fill="url(#rh-sun)" />
      <circle cx="560" cy="150" r="46" fill="none" stroke={GOLD_SOFT} strokeWidth="1.4" opacity="0.7" />
      {/* Tolimos kalvos */}
      <path d="M0 224 Q 200 196 400 220 T 800 214 V 360 H 0 Z" fill={GOLD} fillOpacity="0.06" />
      <path d="M0 224 Q 200 196 400 220 T 800 214" stroke={GOLD} strokeWidth="1.4" opacity="0.35" fill="none" />
      <path d="M0 256 Q 260 236 520 252 T 800 248" stroke={GOLD} strokeWidth="1.2" opacity="0.22" fill="none" />
      {/* Kelias (konverguoja į horizontą) */}
      <path d="M250 360 L372 248 L428 248 L600 360 Z" fill={INK} fillOpacity="0.04" />
      <path d="M372 248 L250 360 M428 248 L600 360" stroke={GOLD} strokeWidth="1.3" opacity="0.4" />
      {/* Vidurio brūkšninė */}
      <path d="M400 256 L400 274 M400 292 L401 318 M401 330 L402 360" stroke={GOLD} strokeWidth="2.4" opacity="0.5" strokeLinecap="round" />
      {/* Vilkikas kelyje */}
      <g transform="translate(300 244) scale(0.72)" stroke={GOLD} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <rect x="8" y="20" width="120" height="50" rx="3" fill="#FBF8F2" />
        <path d="M132 70 V40 q0-6 6-6 h24 l18 18 v18 z" fill="#FBF8F2" />
        <path d="M150 34 v14 h22" opacity="0.7" />
        <circle cx="46" cy="74" r="10" fill="#FBF8F2" />
        <circle cx="92" cy="74" r="10" fill="#FBF8F2" />
        <circle cx="166" cy="74" r="10" fill="#FBF8F2" />
      </g>
      {/* Skraidančios dulkės / paukščiai (subtilu) */}
      <path d="M150 96 q 8 -6 16 0 q 8 -6 16 0" stroke={GOLD} strokeWidth="1.2" opacity="0.3" fill="none" />
    </svg>
  );
}

// ── Tuščios būsenos iliustracijos ───────────────────────────────────────────
export function EmptyRoad({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 200 120" fill="none" className="w-40 h-auto mx-auto" stroke={GOLD} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="100" cy="104" rx="74" ry="7" fill={GOLD} fillOpacity="0.06" stroke="none" />
        <path d="M64 104 L92 44 L108 44 L136 104 Z" fill={INK} fillOpacity="0.03" />
        <path d="M92 44 L64 104 M108 44 L136 104" opacity="0.5" />
        <path d="M100 50 L100 60 M100 70 L100 82 M100 92 L100 100" strokeWidth="2.4" opacity="0.6" />
        <circle cx="100" cy="30" r="12" opacity="0.5" />
        <path d="M100 18 L103 30 L100 42 L97 30 Z" fill={GOLD} fillOpacity="0.15" stroke="none" />
      </svg>
      {label && <p className="text-sm text-muted mt-3 text-center">{label}</p>}
    </div>
  );
}

// ── Europos maršrutų žemėlapis — miestai pasirodo taškais su jungiamomis dugomis
// (oro linijų žemėlapio dvasia, premium). Bazė = Kaunas (auksinė).
const EU_CITIES: { name: string; x: number; y: number; base?: boolean }[] = [
  { name: 'Kaunas', x: 566, y: 150, base: true },
  { name: 'Vilnius', x: 586, y: 162 },
  { name: 'Ryga', x: 560, y: 116 },
  { name: 'Tallinn', x: 575, y: 86 },
  { name: 'Warszawa', x: 520, y: 188 },
  { name: 'Berlin', x: 446, y: 196 },
  { name: 'Amsterdam', x: 388, y: 176 },
  { name: 'Praha', x: 462, y: 224 },
  { name: 'Wien', x: 484, y: 248 },
  { name: 'München', x: 430, y: 244 },
  { name: 'Paris', x: 338, y: 232 },
  { name: 'Milano', x: 420, y: 286 },
  { name: 'Roma', x: 452, y: 332 },
  { name: 'Barcelona', x: 322, y: 326 },
  { name: 'Madrid', x: 250, y: 348 },
];

export function EuropeMap({ className, style }: { className?: string; style?: CSSProperties }) {
  const base = EU_CITIES.find((c) => c.base)!;
  const arc = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const cx = mx - dy * 0.18, cy = my + dx * 0.18; // lenkimas
    return `M${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  };
  return (
    <svg viewBox="0 0 800 460" fill="none" className={className} style={style} preserveAspectRatio="xMidYMid meet">
      {/* Graticule — žemėlapio tinklelis */}
      <g stroke={GOLD_SOFT} strokeWidth="0.6" opacity="0.18">
        {[60, 130, 200, 270, 340, 410].map((y) => <path key={y} d={`M0 ${y} Q 400 ${y - 22} 800 ${y}`} />)}
        {[120, 240, 360, 480, 600, 720].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="460" />)}
      </g>
      {/* Maršrutų dugos iš bazės */}
      {EU_CITIES.filter((c) => !c.base).map((c, i) => (
        <path key={`a${c.name}`} className="map-arc" d={arc(base.x, base.y, c.x, c.y)}
          stroke={GOLD_SOFT} strokeWidth="1.2" fill="none" strokeLinecap="round"
          style={{ animationDelay: `${0.3 + i * 0.13}s, ${1.7 + i * 0.13}s` }} />
      ))}
      {/* Miestų taškai */}
      {EU_CITIES.map((c, i) => (
        <g key={c.name}>
          {!c.base && (
            <circle className="map-ring" cx={c.x} cy={c.y} r="5" fill="none" stroke={GOLD_SOFT} strokeWidth="1"
              style={{ animationDelay: `${0.9 + i * 0.13}s` }} />
          )}
          <g className="map-pin" style={{ animationDelay: `${0.5 + i * 0.13}s` }}>
            <circle cx={c.x} cy={c.y} r={c.base ? 5 : 3.2} fill={c.base ? GOLD : GOLD_SOFT} />
            {c.base && <circle cx={c.x} cy={c.y} r="9" fill="none" stroke={GOLD} strokeWidth="1.4" />}
            <text x={c.x + (c.x > 520 ? 9 : -9)} y={c.y + 3} fontSize="10.5"
              textAnchor={c.x > 520 ? 'start' : 'end'} fill="#F3E9D2" fontWeight={c.base ? 700 : 500}
              style={{ letterSpacing: '0.02em', paintOrder: 'stroke' }} stroke="#1c1710" strokeWidth="2.4">{c.name}</text>
          </g>
        </g>
      ))}
    </svg>
  );
}

// ── Mikroautobusas (Mercedes Sprinter tipo) — šoninis line-art ──────────────
export function SprinterVan({ className, stroke = GOLD, style }: { className?: string; stroke?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 200 110" fill="none" className={className} style={style}
      stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {/* Kėbulas — aukšta stoginė priekyje žemesnė */}
      <path d="M14 82 V44 q0-6 6-7 l40-9 q6-1 11 3 l20 16 h74 q8 0 8 8 V82" />
      {/* Priekinis stiklas + kapotas */}
      <path d="M60 31 l18 16 H60 z" />
      <path d="M60 47 V31" opacity="0.6" />
      {/* Šoninės durys / langai */}
      <path d="M96 47 h18 M120 47 h18 M144 47 h16" opacity="0.45" />
      <line x1="92" y1="47" x2="92" y2="82" opacity="0.4" />
      <line x1="166" y1="47" x2="166" y2="82" opacity="0.4" />
      {/* Žibintas */}
      <path d="M170 60 h8" />
      {/* Slenkstis */}
      <line x1="14" y1="82" x2="182" y2="82" />
      {/* Ratai */}
      <circle cx="50" cy="86" r="11" /><circle cx="50" cy="86" r="3.4" opacity="0.6" />
      <circle cx="150" cy="86" r="11" /><circle cx="150" cy="86" r="3.4" opacity="0.6" />
      {/* Kelias */}
      <line x1="0" y1="98" x2="200" y2="98" opacity="0.3" />
    </svg>
  );
}

// ── HERO: fura išvažiuoja keliu tolyn (kinematografinė animacija, Etihad dvasia) ──
// Perspektyvinis kelias su nykimo tašku, saulė ties horizontu, judantys kelkraščio
// stulpai (greičio pojūtis) ir vilkikas, važiuojantis tolyn (mažėja + nyksta).
export function HeroDrive({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      {/* Statiškas fonas: dangus, saulė, kelias */}
      <svg viewBox="0 0 1100 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="hd-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F6EEDC" />
            <stop offset="0.55" stopColor="#F1E7D3" />
            <stop offset="1" stopColor="#E9DcC2" />
          </linearGradient>
          <radialGradient id="hd-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#D8B36A" stopOpacity="0.7" />
            <stop offset="0.55" stopColor="#D8B36A" stopOpacity="0.18" />
            <stop offset="1" stopColor="#D8B36A" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hd-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c2519" stopOpacity="0.02" />
            <stop offset="1" stopColor="#2c2519" stopOpacity="0.14" />
          </linearGradient>
        </defs>
        <rect width="1100" height="300" fill="url(#hd-sky)" />
        {/* Šiltas horizonto ruožas */}
        <rect x="0" y="120" width="1100" height="48" fill="#E6C588" opacity="0.18" />
        <circle cx="772" cy="134" r="170" fill="url(#hd-sun)" />
        <circle cx="772" cy="134" r="42" fill="none" stroke="#C9A24E" strokeWidth="1.2" opacity="0.55" />
        {/* Tolima medžių linija */}
        <path d="M0 166 q 40 -14 70 0 q 36 -18 72 0 q 44 -12 80 0 q 40 -16 78 0 q 50 -10 90 2 l560 0 q 44 -14 80 0 V 300 H 0 Z" fill="#5C6B3E" fillOpacity="0.08" />
        {/* Tolimos kalvos */}
        <path d="M0 172 Q 300 156 600 168 T 1100 162 V 300 H 0 Z" fill="#9C7B36" fillOpacity="0.06" />
        {/* Kelias (perspektyva į nykimo tašką) */}
        <path d="M230 300 L758 140 L786 140 L1010 300 Z" fill="url(#hd-road)" />
        <path d="M758 140 L230 300 M786 140 L1010 300" stroke="#9C7B36" strokeWidth="1.5" opacity="0.45" />
        {/* Vidurio brūkšninė (juda link žiūrovo) */}
        <path className="road-dash" d="M772 150 L640 300" stroke="#C9A24E" strokeWidth="3.5" opacity="0.55"
          strokeDasharray="7 15" strokeLinecap="round" />
        {/* Statiški pakelės medžiai (gylis) */}
        <g fill="#5C6B3E" fillOpacity="0.16">
          <path d="M205 152 l7 0 -1 14 -5 0 z" /><circle cx="208" cy="148" r="9" />
          <path d="M150 158 l8 0 -1 18 -6 0 z" /><circle cx="154" cy="152" r="12" />
        </g>
      </svg>

      {/* Judantys kelkraščio stulpai — greičio pojūtis */}
      {['roadside-a', 'roadside-b', 'roadside-c'].map((c) => (
        <div key={c} className={`absolute ${c}`} style={{ left: '69%', top: '44%', width: '2.2%' }}>
          <svg viewBox="0 0 20 60" className="w-full h-auto"><path d="M10 60 V10" stroke="#9C7B36" strokeWidth="3" strokeLinecap="round" /><circle cx="10" cy="8" r="5" fill="#C9A24E" /></svg>
        </div>
      ))}

      {/* Vilkikas išvažiuoja tolyn */}
      <div className="absolute drive-away" style={{ left: '34%', bottom: '12%', width: '23%' }}>
        <SemiTruck className="w-full h-auto" stroke="#3a3122" />
      </div>
    </div>
  );
}

// ── Furgono SILUETAS (užpildytas) — Mercedes Sprinter tipo (aukštas kėbulas) ──
export function VanSilhouette({ className, fill = GOLD, style }: { className?: string; fill?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 220 120" fill="none" className={className} style={style}>
      {/* Aukštas uždaras kėbulas: trumpa nosis priekyje, vientisa „dėžė" iki galo */}
      <path fill={fill} d="M14 96 V44 q0-8 8-10 l30-6 q5-1 9 2 l14 11 q3 2 7 2 H196 q10 0 10 10 V96 q0 4-4 4 h-12 a17 17 0 0 0-34 0 H72 a17 17 0 0 0-34 0 H18 q-4 0-4-4 Z" />
      {/* Priekinis stiklas + šoninis langas (iškirpti) */}
      <path fill="#FBF8F2" fillOpacity="0.92" d="M58 40 l13 10 H58 z" />
      <rect x="78" y="40" width="22" height="12" rx="2" fill="#FBF8F2" fillOpacity="0.9" />
      <rect x="106" y="40" width="22" height="12" rx="2" fill="#FBF8F2" fillOpacity="0.55" />
      {/* Durų linija gale */}
      <line x1="150" y1="44" x2="150" y2="80" stroke="#1c1710" strokeOpacity="0.25" strokeWidth="2" />
      {/* Ratai */}
      <circle cx="55" cy="96" r="14" fill="#1c1710" /><circle cx="55" cy="96" r="5.5" fill={fill} />
      <circle cx="175" cy="96" r="14" fill="#1c1710" /><circle cx="175" cy="96" r="5.5" fill={fill} />
    </svg>
  );
}

export function EmptyChecklist({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 160 120" fill="none" className="w-36 h-auto mx-auto" stroke={GOLD} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="42" y="20" width="76" height="92" rx="6" fill="#FBF8F2" />
        <rect x="64" y="14" width="32" height="14" rx="4" fill="#FBF8F2" />
        <path d="M58 44 h44 M58 60 h44 M58 76 h30" opacity="0.4" />
        <path d="M52 44 l3 3 l5 -6" opacity="0.9" />
        <path d="M52 60 l3 3 l5 -6" opacity="0.9" />
        <circle cx="118" cy="92" r="16" fill="#FBF8F2" />
        <path d="M112 92 l4 4 l8 -9" opacity="0.9" />
      </svg>
      {label && <p className="text-sm text-muted mt-3 text-center">{label}</p>}
    </div>
  );
}

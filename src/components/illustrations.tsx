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

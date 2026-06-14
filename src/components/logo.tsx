// Vestex Transport ženklas — atkurtas SVG pavidalu (mėlyna „judesio" rodyklė +
// raudonas taškas). Naudojamas kaip logotipas (su užrašu) ir kaip ženklas
// (vienas simbolis) — įmonės „švyturys"/„vedlys" akcentas svetainėje.

import type { CSSProperties } from 'react';

export const VESTEX_BLUE = '#16409A';
export const VESTEX_RED = '#E2231A';

// Tik ženklas (be užrašo) — simbolis pasididžiavimui įmone.
export function VestexMark({ className, style, title }: { className?: string; style?: CSSProperties; title?: string }) {
  return (
    <svg viewBox="0 0 72 56" fill="none" className={className} style={style} role="img" aria-label={title || 'Vestex'}>
      {/* Mėlyna pakreipta „rodyklė pirmyn" su laipteliu (judesys) */}
      <path fill={VESTEX_BLUE} d="M22 6 H58 L46 28 H64 L50 50 H22 L36 28 L22 6 Z" />
      {/* Antras segmentas — gylis */}
      <path fill={VESTEX_BLUE} opacity="0.78" d="M8 6 H30 L16 28 L30 50 H8 L22 28 L8 6 Z" />
      {/* Raudonas taškas — „ratas"/akcentas */}
      <circle cx="17" cy="46" r="9" fill={VESTEX_RED} />
    </svg>
  );
}

// Pilnas logotipas: ženklas + užrašas „vestex / transport".
export function VestexLogo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <VestexMark className="h-8 w-auto shrink-0" />
      <div className="leading-none">
        <p className="font-display text-[20px] font-semibold tracking-tight" style={{ color: VESTEX_RED }}>
          vestex
        </p>
        <p className="text-[10px] font-bold tracking-[0.28em] uppercase -mt-0.5" style={{ color: dark ? '#cdd6ea' : VESTEX_BLUE }}>
          transport
        </p>
      </div>
    </div>
  );
}

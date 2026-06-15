// Excel (.xlsx/.xls/.csv) automobilių sąrašo importas.
// Stulpeliai: Mašinos nr, Markė, Ref/Tent, Gamybos metai (+ nebūtina Registracija).

import * as XLSX from 'xlsx';
import type { Car, CarType, RegistrationType } from '../types';

export interface ParsedCar {
  rowNr: number;
  number: string;
  brand?: string;
  type: CarType;
  year?: number;
  registration: RegistrationType;
}

const norm = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const CAR_FIELD_MATCHERS: { key: string; patterns: string[] }[] = [
  { key: 'number',       patterns: ['masinos nr', 'masinos numeris', 'masinos', 'masina', 'automobil', 'valstyb', 'vilkik', 'sunkvez', 'numeris', 'nr'] },
  { key: 'brand',        patterns: ['marke', 'gamintoj', 'modelis'] },
  { key: 'type',         patterns: ['ref/tent', 'ref / tent', 'tipas', 'puspriekab', 'ref', 'tent'] },
  { key: 'year',         patterns: ['gamybos metai', 'gamybos', 'pagaminimo', 'metai'] },
  { key: 'registration', patterns: ['registracij', 'salis', 'imone', 'lt/pl'] },
];

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

const mapType = (v: unknown): CarType => (norm(v).startsWith('ref') ? 'Refas' : 'Tentas');

const mapReg = (v: unknown): RegistrationType => (norm(v).includes('pl') ? 'PL' : 'LT');

const toYear = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  const m = String(v).match(/\d{4}/);
  if (m) { const y = parseInt(m[0], 10); if (y >= 1950 && y <= 2100) return y; }
  return undefined;
};

export function parseCarWorkbook(data: ArrayBuffer): { rows: ParsedCar[]; headerMap: Record<string, string>; sheetName: string } {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });

  // Antraštės eilutė — kurioje yra „nr/mašina" ir „mark...".
  let headerIdx = 0;
  for (let i = 0; i < Math.min(aoa.length, 12); i++) {
    const cells = (aoa[i] || []).map(norm);
    if (cells.some(c => /masin|nr|automobil|valstyb/.test(c)) && cells.some(c => c.includes('marke'))) { headerIdx = i; break; }
  }
  const header = (aoa[headerIdx] || []).map(norm);

  const esc = (p: string) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hMatch = (h: string, p: string) => new RegExp('(^|[^a-z0-9])' + esc(p)).test(h);
  const colKey: (string | null)[] = header.map(h => {
    for (const { key, patterns } of CAR_FIELD_MATCHERS) { if (patterns.some(p => hMatch(h, p))) return key; }
    return null;
  });

  const headerMap: Record<string, string> = {};
  colKey.forEach((k, i) => { if (k && !headerMap[k]) headerMap[k] = String((aoa[headerIdx] || [])[i] ?? ''); });

  const get = (row: unknown[], key: string): unknown => { const idx = colKey.indexOf(key); return idx >= 0 ? row[idx] : undefined; };

  const rows: ParsedCar[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] || [];
    const number = str(get(row, 'number'));
    if (!number) continue;
    rows.push({
      rowNr: i + 1,
      number,
      brand: str(get(row, 'brand')) || undefined,
      type: mapType(get(row, 'type')),
      year: toYear(get(row, 'year')),
      registration: mapReg(get(row, 'registration')),
    });
  }
  return { rows, headerMap, sheetName };
}

// ── Suderinimas pagal mašinos numerį ──────────────────────────────────────────
const carKey = (c: { number: string }): string => norm(c.number).replace(/\s+/g, '');

export function buildCarIndex<T extends { id: string; number: string }>(cars: T[]) {
  const byNr = new Map<string, T>();
  cars.forEach(c => byNr.set(carKey(c), c));
  return byNr;
}

export function findExistingCar<T extends { id: string; number: string }>(index: Map<string, T>, p: ParsedCar): T | undefined {
  return index.get(carKey(p));
}

export function mergeIntoCar(existing: Car | undefined, p: ParsedCar): Car {
  const base: Car = existing ?? {
    id: '', number: p.number, status: 'Aktyvus', type: p.type, registration: p.registration,
  };
  return {
    ...base,
    number: p.number || base.number,
    type: p.type,
    registration: p.registration,
    brand: p.brand ?? base.brand,
    year: p.year ?? base.year,
  };
}

// ── Pavyzdinis (šablono) failas ───────────────────────────────────────────────
export function buildCarTemplate(): Blob {
  const headers = ['Mašinos nr', 'Markė', 'Ref/Tent', 'Gamybos metai', 'Registracija (LT/PL)'];
  const examples = [
    ['ABC 123', 'DAF XF 480', 'Tent', '2021', 'LT'],
    ['XYZ 789', 'Scania R450', 'Ref', '2019', 'PL'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Automobiliai');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

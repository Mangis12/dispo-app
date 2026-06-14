// Excel (.xlsx/.xls/.csv) vairuotojų sąrašo importas.
// Antraščių automatinis atpažinimas pagal lietuviškus stulpelių pavadinimus
// (žr. įmonės sąrašą: Pavardė, Vardas, T/Š, Paso galiojimo data, Teisių galiojimas...).

import * as XLSX from 'xlsx';
import type { Driver, DriverDocs, DriverSpecialization, RegistrationType } from '../types';

export interface ParsedDriver {
  rowNr: number;
  name: string;            // „Vardas Pavardė"
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  tabNr?: string;
  companyType: RegistrationType;
  specialization: DriverSpecialization;
  docs: DriverDocs;
  raw: Record<string, unknown>;
}

// Antraščių normalizavimas: mažosios, be diakritikų (NFD), be tarpų pertekliaus.
// NFD išskaido ąčęėįšųūž ir kt. į raidę + jungiamąjį ženklą, kurį pašaliname.
const norm = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ').trim();

// Vidiniai laukai → galimi antraščių fragmentai (normalizuoti). Tikrinama „includes".
const FIELD_MATCHERS: { key: string; patterns: string[] }[] = [
  { key: 'lastName',       patterns: ['pavarde'] },
  { key: 'firstName',      patterns: ['vardas'] },
  { key: 'email',          patterns: ['e-mail', 'email', 'el. pastas', 'el.pastas', 'pastas'] },
  { key: 'phone',          patterns: ['tel'] },
  { key: 'tabNr',          patterns: ['ds'] },
  { key: 'spec',           patterns: ['t/s', 't/š', 'tipas'] },
  { key: 'personalCode',   patterns: ['asmens kodas', 'asmens kod'] },
  { key: 'passportNo',     patterns: ['paso nr', 'paso numeris'] },
  { key: 'passportExpiry', patterns: ['paso galiojim'] },
  { key: 'licenseExpiry',  patterns: ['teisiu galiojim', 'teisiu'] },
  { key: 'code95Expiry',   patterns: ['95 kodo', '95 kod', 'kodo galiojim'] },
  { key: 'tachoExpiry',    patterns: ['chip korteles', 'chip kortel', 'tacho galiojim'] },
  { key: 'tachoCountry',   patterns: ['tacho salis', 'tacho sal'] },
  { key: 'pinkSheetExpiry',patterns: ['rozinio lapo', 'rozinio'] },
  { key: 'llglExpiry',     patterns: ['llgl galiojim', 'llgl'] },
  { key: 'company',        patterns: ['imone', 'company'] },
];

// Excel serijinė data → JS Date.
const excelSerialToDate = (n: number): Date => {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms);
};

// Įvairios datos reikšmės → 'yyyy-MM-dd' arba undefined.
const toISO = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined;
  if (v instanceof Date && !isNaN(v.getTime())) return fmt(v);
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return fmt(excelSerialToDate(v)); // Excel serial
    return undefined;
  }
  const s = String(v).trim();
  // 2031-03-10 / 2031.03.10 / 2031/03/10
  let m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // 10.03.2031 / 10-03-2031 / 10/03/2031
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : fmt(d);
};

const fmt = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

const mapSpec = (v: unknown): DriverSpecialization => {
  const n = norm(v);
  if (n.startsWith('ref')) return 'Refas';
  if (n.startsWith('tent')) return 'Tentas';
  return 'Universalus'; // AUT ir kt.
};

const mapCompany = (tachoCountry: string, explicit: string): RegistrationType => {
  const n = norm(explicit || tachoCountry);
  if (n.includes('pl')) return 'PL';
  return 'LT';
};

// Pagrindinė funkcija: failo baitai → ParsedDriver[] + atpažintų stulpelių žemėlapis.
export function parseDriverWorkbook(data: ArrayBuffer): { rows: ParsedDriver[]; headerMap: Record<string, string>; sheetName: string } {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });

  // Surandame antraštės eilutę — tą, kurioje yra „Pavardė" ir „Vardas".
  let headerIdx = 0;
  for (let i = 0; i < Math.min(aoa.length, 12); i++) {
    const cells = (aoa[i] || []).map(norm);
    if (cells.some(c => c.includes('pavarde')) && cells.some(c => c.includes('vardas'))) {
      headerIdx = i; break;
    }
  }
  const header = (aoa[headerIdx] || []).map(norm);

  // Stulpelio indeksas → vidinis laukas. Šablonas turi prasidėti žodžio pradžioje
  // (kad „tel" nepagautų „kor-tel-ės"), bet leidžiama nepilna žodžio pradžia („galiojim").
  const esc = (p: string) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hMatch = (h: string, p: string) => new RegExp('(^|[^a-z0-9])' + esc(p)).test(h);
  const colKey: (string | null)[] = header.map(h => {
    for (const { key, patterns } of FIELD_MATCHERS) {
      if (patterns.some(p => hMatch(h, p))) return key;
    }
    return null;
  });

  const headerMap: Record<string, string> = {};
  colKey.forEach((k, i) => { if (k) headerMap[k] = String((aoa[headerIdx] || [])[i] ?? ''); });

  const get = (row: unknown[], key: string): unknown => {
    const idx = colKey.indexOf(key);
    return idx >= 0 ? row[idx] : undefined;
  };

  const rows: ParsedDriver[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] || [];
    const lastName = str(get(row, 'lastName'));
    const firstName = str(get(row, 'firstName'));
    if (!lastName && !firstName) continue; // tuščia eilutė

    const tachoCountry = str(get(row, 'tachoCountry'));
    const docs: DriverDocs = {
      personalCode:   str(get(row, 'personalCode')) || undefined,
      passportNo:     str(get(row, 'passportNo')) || undefined,
      passportExpiry: toISO(get(row, 'passportExpiry')),
      licenseExpiry:  toISO(get(row, 'licenseExpiry')),
      code95Expiry:   toISO(get(row, 'code95Expiry')),
      tachoCardExpiry:toISO(get(row, 'tachoExpiry')),
      tachoCountry:   tachoCountry || undefined,
      pinkSheetExpiry:toISO(get(row, 'pinkSheetExpiry')),
      llglExpiry:     toISO(get(row, 'llglExpiry')),
    };

    rows.push({
      rowNr: i + 1,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      phone: str(get(row, 'phone')),
      email: str(get(row, 'email')) || undefined,
      tabNr: str(get(row, 'tabNr')) || undefined,
      companyType: mapCompany(tachoCountry, str(get(row, 'company'))),
      specialization: mapSpec(get(row, 'spec')),
      docs,
      raw: {},
    });
  }
  return { rows, headerMap, sheetName };
}

// Sujungia importuotą eilutę su esamu vairuotoju (jei rastas) → atnaujinimo objektas.
export function mergeIntoDriver(existing: Driver | undefined, p: ParsedDriver): Driver {
  const base: Driver = existing ?? {
    id: '', name: p.name, phone: p.phone, status: 'Namuose', currentCar: 'Nėra',
    startDate: null, plannedReturnDate: null, homeStatus: 'Poilsis', readinessDate: null,
    companyType: p.companyType, specialization: p.specialization,
  };
  return {
    ...base,
    name: p.name || base.name,
    phone: p.phone || base.phone,
    email: p.email ?? base.email,
    tabNr: p.tabNr ?? base.tabNr,
    companyType: p.companyType,
    specialization: p.specialization,
    docs: { ...(base.docs ?? {}), ...p.docs },
  };
}

// Vairuotojo galimi suderinimo raktai (pagal asmens kodą, DS numerį, vardą).
function driverKeys(d: { docs?: DriverDocs; tabNr?: string; name: string }): { pc?: string; tab?: string; nm: string } {
  return {
    pc: d.docs?.personalCode ? 'pc:' + d.docs.personalCode.replace(/\s/g, '') : undefined,
    tab: d.tabNr ? 'tab:' + norm(d.tabNr) : undefined,
    nm: 'nm:' + norm(d.name),
  };
}

// Indeksas iš esamų vairuotojų — pagal visus raktų tipus, kad pirmas importas
// (kai esami vairuotojai dar be asmens kodo) atpažintų pagal vardą.
export function buildDriverIndex<T extends { id: string; docs?: DriverDocs; tabNr?: string; name: string }>(drivers: T[]) {
  const byPc = new Map<string, T>(), byTab = new Map<string, T>(), byNm = new Map<string, T>();
  drivers.forEach(d => {
    const k = driverKeys(d);
    if (k.pc) byPc.set(k.pc, d);
    if (k.tab) byTab.set(k.tab, d);
    byNm.set(k.nm, d);
  });
  return { byPc, byTab, byNm };
}

// Suranda esamą vairuotoją importuojamai eilutei (pc → tab → vardas).
export function findExisting<T extends { id: string; docs?: DriverDocs; tabNr?: string; name: string }>(
  index: ReturnType<typeof buildDriverIndex<T>>, p: ParsedDriver,
): T | undefined {
  const k = driverKeys({ docs: p.docs, tabNr: p.tabNr, name: p.name });
  return (k.pc && index.byPc.get(k.pc)) || (k.tab && index.byTab.get(k.tab)) || index.byNm.get(k.nm) || undefined;
}

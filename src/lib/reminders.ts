// Asmeniniai priminimai („Mano priminimai") + push pranešimai.
// Saugoma lokaliai (localStorage) — priminimai yra asmeniniai, prie įrenginio.
// Push throttle: vienu metu NIEKADA nesiunčiama krūva pranešimų — visi tą dieną
// suėję priminimai sujungiami į VIENĄ push pranešimą.

import { format, parseISO, addDays, isValid } from 'date-fns';

export type ReminderRepeat = 'none' | 'weekly' | 'biweekly' | 'monthly';
export type ReminderTarget = 'driver' | 'car' | 'document' | 'custom';

export interface Reminder {
  id: string;
  title: string;
  note?: string;
  target: ReminderTarget;
  driverId?: string;
  carId?: string;
  docKey?: string;            // kai target === 'document'
  dueDate: string;            // yyyy-MM-dd — kada kitą kartą priminti
  repeat: ReminderRepeat;     // kaip dažnai kartoti po suveikimo
  createdAt: string;
  lastFiredDate?: string | null; // yyyy-MM-dd, kada paskutinį kartą iššoko push (apsauga nuo dubliavimo)
  done?: boolean;
}

const KEY = 'dispo_reminders';
const todayISO = () => format(new Date(), 'yyyy-MM-dd');

export const REPEAT_DAYS: Record<ReminderRepeat, number> = { none: 0, weekly: 7, biweekly: 14, monthly: 30 };
export const REPEAT_LABELS: Record<ReminderRepeat, string> = {
  none: 'Vieną kartą', weekly: 'Kas savaitę', biweekly: 'Kas 2 savaites', monthly: 'Kas mėnesį',
};

export function loadReminders(): Reminder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveReminders(list: Reminder[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function isDue(r: Reminder, today: Date = new Date()): boolean {
  if (r.done) return false;
  if (!r.dueDate || !isValid(parseISO(r.dueDate))) return false;
  return r.dueDate <= format(today, 'yyyy-MM-dd');
}

// Atidėti savaitei (arba kitam dienų skaičiui). Naudoja „Priminti po savaitės".
export function snoozeReminder(r: Reminder, days = 7): Reminder {
  return { ...r, dueDate: format(addDays(new Date(), days), 'yyyy-MM-dd'), done: false };
}

// Po push: pažymim, kad šiandien jau iššoko; jei kartojasi — perkeliam kitą datą.
function afterFired(r: Reminder): Reminder {
  const days = REPEAT_DAYS[r.repeat];
  if (days > 0) return { ...r, lastFiredDate: todayISO(), dueDate: format(addDays(new Date(), days), 'yyyy-MM-dd') };
  return { ...r, lastFiredDate: todayISO() };
}

// ── Push pranešimai ──────────────────────────────────────────────────────────
export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}
export function pushPermission(): NotificationPermission {
  return pushSupported() ? Notification.permission : 'denied';
}
export async function ensurePushPermission(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}

// Suveda šiandien suėjusius priminimus į VIENĄ push (jokio srauto).
// Grąžina atnaujintą sąrašą (su pažymėtais iššovusiais) ir kiek buvo.
export function fireDueReminders(
  list: Reminder[],
  describe: (r: Reminder) => string,
): { list: Reminder[]; fired: Reminder[] } {
  const today = todayISO();
  // Suėję ir dar šiandien neiššauti.
  const due = list.filter(r => isDue(r) && r.lastFiredDate !== today);
  if (due.length === 0) return { list, fired: [] };

  if (pushPermission() === 'granted') {
    try {
      if (due.length === 1) {
        new Notification('Dispečeris · priminimas', { body: describe(due[0]), tag: 'dispo-reminders' });
      } else {
        const lines = due.slice(0, 5).map(r => '• ' + describe(r)).join('\n');
        const extra = due.length > 5 ? `\n…ir dar ${due.length - 5}` : '';
        new Notification(`Dispečeris · ${due.length} priminimai`, { body: lines + extra, tag: 'dispo-reminders' });
      }
    } catch { /* ignore */ }
  }

  const firedIds = new Set(due.map(r => r.id));
  const next = list.map(r => firedIds.has(r.id) ? afterFired(r) : r);
  return { list: next, fired: due };
}

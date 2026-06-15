// Vartotojų rolės (RBAC). Rolė nuskaitoma iš Supabase (lentelė user_roles)
// pagal prisijungusią paskyrą — vartotojas jos pats pakeisti negali.
// Offline režimu (be Supabase) — duomenų redagavimas leidžiamas (lokalus naudojimas).
//
//   kurejas      — Kūrėjas: aukščiausia rolė. Pilna prieiga prie VISŲ pakeitimų,
//                  rolių valdymo ir sistemos atstatymo. Įjungiama tik slaptu kodu.
//   replacement  — Keitimų vadybininkas: pilnas duomenų redagavimas, BET negali
//                  priskirti rolių ir atstatyti sistemos.
//   coordinator  — Koordinatorius: mato viską, bet dirba tik Koordinatoriaus skiltyje.
//   transport    — Transporto vadybininkas: tik stebi, nieko nekeičia.

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseEnabled } from './supabase';

export type Role = 'kurejas' | 'replacement' | 'coordinator' | 'transport';

// Slaptas Kūrėjo aktyvavimo kodas (žino tik savininkas).
export const KUREJAS_CODE = '1247';
const KUREJAS_KEY = 'dispo_kurejas';

export interface RoleState {
  role: Role;              // efektyvi rolė (su Kūrėjo atrakinimu)
  dbRole: Role;            // rolė iš Supabase / numatytoji
  loading: boolean;
  canEdit: boolean;        // pilnas duomenų redagavimas (kurejas + replacement)
  canCoordinate: boolean;  // dirbti Koordinatoriaus skiltyje (kurejas + replacement + coordinator)
  isAdmin: boolean;        // rolių valdymas + sistemos atstatymas (TIK kurejas)
  kurejasUnlocked: boolean;
  unlockKurejas: (code: string) => boolean;
  lockKurejas: () => void;
  refresh: () => void;
}

const Ctx = createContext<RoleState>({
  role: 'transport', dbRole: 'transport', loading: true, canEdit: false, canCoordinate: false,
  isAdmin: false, kurejasUnlocked: false, unlockKurejas: () => false, lockKurejas: () => {}, refresh: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [dbRole, setDbRole] = useState<Role>(isSupabaseEnabled ? 'transport' : 'replacement');
  const [loading, setLoading] = useState(isSupabaseEnabled);
  const [tick, setTick] = useState(0);
  const [kurejasUnlocked, setKurejasUnlocked] = useState<boolean>(() => {
    try { return localStorage.getItem(KUREJAS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    // Offline — duomenų redagavimas leidžiamas, bet ne admin teisės.
    if (!isSupabaseEnabled || !supabase) { setDbRole('replacement'); setLoading(false); return; }

    let active = true;
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase!.auth.getUser();
      if (!user) { if (active) { setDbRole('transport'); setLoading(false); } return; }
      const { data, error } = await supabase!
        .from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
      if (!active) return;
      const r = (!error && data?.role) ? (data.role as Role) : 'transport';
      setDbRole(r);
      setLoading(false);
    };
    void load();
    const { data: sub } = supabase!.auth.onAuthStateChange(() => { void load(); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [tick]);

  const unlockKurejas = (code: string) => {
    if (code.trim() === KUREJAS_CODE) {
      setKurejasUnlocked(true);
      try { localStorage.setItem(KUREJAS_KEY, '1'); } catch { /* ignore */ }
      return true;
    }
    return false;
  };
  const lockKurejas = () => {
    setKurejasUnlocked(false);
    try { localStorage.removeItem(KUREJAS_KEY); } catch { /* ignore */ }
  };

  // Atrakintas Kūrėjo režimas pakelia efektyvią rolę virš visko.
  const role: Role = kurejasUnlocked ? 'kurejas' : dbRole;

  const value: RoleState = {
    role, dbRole, loading,
    canEdit: role === 'kurejas' || role === 'replacement',
    canCoordinate: role === 'kurejas' || role === 'replacement' || role === 'coordinator',
    isAdmin: role === 'kurejas',
    kurejasUnlocked, unlockKurejas, lockKurejas,
    refresh: () => setTick(t => t + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);

// Pavadinimai UI rodymui (LT). Vertimą tvarko i18n žodynas.
export const ROLE_LABELS: Record<Role, string> = {
  kurejas: 'Kūrėjas',
  replacement: 'Keitimų vadybininkas',
  coordinator: 'Koordinatorius',
  transport: 'Transporto vadybininkas',
};

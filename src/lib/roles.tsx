// Vartotojų rolės (RBAC). Rolė nuskaitoma iš Supabase (lentelė user_roles)
// pagal prisijungusią paskyrą — vartotojas jos pats pakeisti negali.
// Offline režimu (be Supabase) — pilnos teisės (lokalus naudojimas).
//
//   replacement  — Keitimų vadybininkas: pilnos teisės su visa informacija.
//   coordinator  — Koordinatorius: mato viską, bet dirba tik Koordinatoriaus skiltyje.
//   transport    — Transporto vadybininkas: tik stebi, nieko nekeičia.

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseEnabled } from './supabase';

export type Role = 'replacement' | 'coordinator' | 'transport';

export interface RoleState {
  role: Role;
  loading: boolean;
  canEdit: boolean;        // pilnas redagavimas (tik replacement)
  canCoordinate: boolean;  // dirbti Koordinatoriaus skiltyje (replacement + coordinator)
  isAdmin: boolean;        // gali priskirti roles (replacement)
  refresh: () => void;
}

const Ctx = createContext<RoleState>({
  role: 'transport', loading: true, canEdit: false, canCoordinate: false, isAdmin: false, refresh: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>(isSupabaseEnabled ? 'transport' : 'replacement');
  const [loading, setLoading] = useState(isSupabaseEnabled);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Offline — pilnos teisės, nieko nekrauname.
    if (!isSupabaseEnabled || !supabase) { setRole('replacement'); setLoading(false); return; }

    let active = true;
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase!.auth.getUser();
      if (!user) { if (active) { setRole('transport'); setLoading(false); } return; }
      const { data, error } = await supabase!
        .from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
      if (!active) return;
      const r = (!error && data?.role) ? (data.role as Role) : 'transport';
      setRole(r);
      setLoading(false);
    };
    void load();
    const { data: sub } = supabase!.auth.onAuthStateChange(() => { void load(); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [tick]);

  const value: RoleState = {
    role, loading,
    canEdit: role === 'replacement',
    canCoordinate: role === 'replacement' || role === 'coordinator',
    isAdmin: role === 'replacement',
    refresh: () => setTick(t => t + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);

// Pavadinimai UI rodymui (LT). Vertimą tvarko i18n žodynas.
export const ROLE_LABELS: Record<Role, string> = {
  replacement: 'Keitimų vadybininkas',
  coordinator: 'Koordinatorius',
  transport: 'Transporto vadybininkas',
};

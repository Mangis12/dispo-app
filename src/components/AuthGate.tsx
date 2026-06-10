// Prisijungimo vartai. Supabase režimu reikalauja sesijos (email + slaptažodis);
// offline režimu (Supabase neįjungtas) praleidžia tiesiai į appsą.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Truck, LogIn } from 'lucide-react';
import { supabase, isSupabaseEnabled } from '../lib/supabase';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  // Offline režimu (Supabase neįjungtas) autentifikacijos nereikia.
  if (!isSupabaseEnabled || !supabase) return <>{children}</>;
  return <SupabaseAuthGate>{children}</SupabaseAuthGate>;
}

function SupabaseAuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setSubmitting(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (session) return <>{children}</>;

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4 font-sans">
      <form onSubmit={signIn} className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-stone-100 p-8 space-y-5">
        <div className="flex flex-col items-center gap-2">
          <div className="w-11 h-11 bg-stone-900 rounded-xl flex items-center justify-center">
            <Truck className="text-white w-6 h-6" />
          </div>
          <div className="text-center">
            <p className="text-base font-black tracking-tight">DISPEČERIS</p>
            <p className="text-xs text-stone-400 font-semibold">Prisijunkite, kad tęstumėte</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">El. paštas</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" placeholder="vardas@imone.lt"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Slaptažodis</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="••••••••"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 transition-all"
            />
          </div>
        </div>

        {error && <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

        <button
          type="submit" disabled={submitting}
          className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-stone-800 transition-all disabled:opacity-50"
        >
          <LogIn size={15} />{submitting ? 'Jungiamasi…' : 'Prisijungti'}
        </button>
      </form>
    </div>
  );
}

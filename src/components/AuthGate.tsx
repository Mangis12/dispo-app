// Prisijungimo vartai. Supabase režimu reikalauja sesijos (email + slaptažodis);
// offline režimu (Supabase neįjungtas) praleidžia tiesiai į appsą.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogIn } from 'lucide-react';
import { supabase, isSupabaseEnabled } from '../lib/supabase';
import { VestexLogo } from './logo';

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
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-hairline border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  if (session) return <>{children}</>;

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 font-sans text-ink overflow-hidden bg-gradient-to-br from-surface via-canvas to-[#dde8f3]">
      {/* DAF XF — visa mašina matoma (be apkarpymo), dešinėje pusėje */}
      <div className="absolute inset-y-0 right-0 w-full lg:w-3/4 pointer-events-none">
        <img src="/img/daf-xf.jpg" alt="DAF XF" className="absolute bottom-0 right-0 h-[62%] sm:h-[78%] w-auto max-w-full object-contain object-right-bottom opacity-95" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/70 to-transparent" />

      <form onSubmit={signIn} className="relative reveal bg-surface/85 backdrop-blur-2xl w-full max-w-sm rounded-3xl shadow-float border border-white/70 ring-1 ring-gold/15 p-8 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <VestexLogo />
          <div className="text-center">
            <div className="mx-auto mb-1.5 h-px w-8 bg-gold/50" />
            <p className="text-lg font-display font-medium tracking-tight">Dispečeris</p>
            <p className="text-xs text-muted mt-0.5">Prisijunkite, kad tęstumėte</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted">El. paštas</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" placeholder="vardas@imone.lt"
              className="w-full bg-canvas border border-hairline rounded-xl px-3.5 py-2.5 text-sm placeholder:text-stone-400 focus:outline-none focus:bg-white focus:border-ink/40 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted">Slaptažodis</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="••••••••"
              className="w-full bg-canvas border border-hairline rounded-xl px-3.5 py-2.5 text-sm placeholder:text-stone-400 focus:outline-none focus:bg-white focus:border-ink/40 transition-all"
            />
          </div>
        </div>

        {error && <p className="text-xs font-medium text-red-500 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>}

        <button
          type="submit" disabled={submitting}
          className="w-full flex items-center justify-center gap-2 bg-ink text-white px-4 py-3 rounded-xl text-sm font-medium hover:bg-ink/85 transition-all disabled:opacity-50"
        >
          <LogIn size={15} />{submitting ? 'Jungiamasi…' : 'Prisijungti'}
        </button>
      </form>
    </div>
  );
}

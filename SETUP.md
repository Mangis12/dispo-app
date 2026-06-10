# Dispo — paleidimas gyvai (Supabase + Vercel)

Appsas: Vite + React + TS. Backendas + DB + autentifikacija: **Supabase**.
Be `.env` veikia offline (localStorage, be prisijungimo). Su `.env` — debesų DB, login ir realaus laiko sinchronizacija.

---

## 0. Įsidiekite Node.js (būtina)

Šioje sistemoje Node nerastas. Įdiekite LTS versiją:

- Atsisiųskite iš https://nodejs.org (LTS), arba per Homebrew:
  ```bash
  brew install node
  ```
- Patikrinkite: `node -v` ir `npm -v` turi rodyti versijas.

## 1. Supabase projektas

1. https://supabase.com → sukurkite projektą.
2. **SQL Editor** → įklijuokite `supabase/schema.sql` turinį → **Run**. Sukurs lenteles, RLS ir realtime.
3. **Settings → API** → nusikopijuokite `Project URL` ir `anon public` raktą.
4. **Authentication → Providers → Email** → įjunkite. Viešos registracijos neatidarykite.
5. **Authentication → Users → Add user** → sukurkite dispečerių paskyras (el. paštas + slaptažodis).

## 2. Lokalus paleidimas

```bash
cd dispo-app
cp .env.example .env        # įrašykite VITE_SUPABASE_URL ir VITE_SUPABASE_ANON_KEY
npm install
npm run dev                 # http://localhost:5173
```

- Su užpildytu `.env` — pamatysite prisijungimo formą; prisijunkite sukurta paskyra.
- Be `.env` — appsas veikia offline per localStorage (login praleidžiamas).

Greitas patikrinimas: pridėkite vairuotoją → Supabase **Table editor → drivers** turi atsirasti nauja eilutė. Atidarykite du langus — pakeitimas viename atsispindi kitame be perkrovimo.

## 3. Deploy į Vercel (rekomendacija)

```bash
cd dispo-app
git init && git add -A && git commit -m "Dispo: Supabase backend + auth + map"
# sukurkite GitHub repo ir:
git remote add origin <jūsų-repo-url>
git push -u origin main
```

1. https://vercel.com → **Import** GitHub repo.
2. **Root Directory:** `dispo-app`. Framework (Vite), build `npm run build`, output `dist` — aptinkama automatiškai.
3. **Environment Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. **Deploy** → gausite viešą `https://...vercel.app` adresą.
5. Supabase → **Authentication → URL Configuration** → pridėkite Vercel domeną prie *Site URL* / *Redirect URLs*.

> Alternatyva: Netlify (lygiavertis). Vercel rekomenduojamas dėl sklandaus Vite palaikymo ir nemokamo tier'o.

---

## Architektūros santrauka

| Sluoksnis | Failas |
|---|---|
| DB schema + RLS + realtime | `supabase/schema.sql` |
| camel↔snake konversija | `src/lib/mappers.ts` |
| Įkėlimas / sync / realtime | `src/lib/repo.ts` |
| Supabase klientas | `src/lib/supabase.ts` |
| Prisijungimo vartai | `src/components/AuthGate.tsx` |
| Žemėlapis / maršrutai | `src/components/TripPlanner.tsx` |

Žemėlapis naudoja viešus OSRM (atstumai) ir Nominatim (miestų paieška) API — DB jiems nereikia.

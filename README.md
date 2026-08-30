# Skjuts

Familjeschema-app för att synka skjutsar. Next.js + Supabase + Vercel,
samma stack som Sprintdagboken (hundradel.se), men ett helt eget
projekt/deploy. Delar bara Supabase-projekt via den fristående tabellen
`training_schedule`.

## Kom igång

```bash
npm install
cp .env.local.example .env.local
```

Fyll i `.env.local` med samma `NEXT_PUBLIC_SUPABASE_URL` och
`NEXT_PUBLIC_SUPABASE_ANON_KEY` som Sprintdagboken använder (Supabase ->
Project settings -> API).

Kör `training_schedule.sql` (se separat fil) i Supabase SQL Editor om
det inte redan är gjort.

```bash
npm run dev
```

Öppna http://localhost:3000 — sidan listar raderna i `training_schedule`
som en enkel bekräftelse på att kopplingen fungerar.

## Struktur

```
app/
  layout.js       Root-layout, PWA-metadata, mörkt tema
  globals.css     Färgvariabler (samma tokens som prototypen)
  page.js         Startsida (tillfällig enkel lista, ersätts av
                   den riktiga tabellvyn i nästa steg)
lib/
  supabaseClient.js   Delad Supabase-klient
public/
  manifest.json   PWA-manifest
  icons/          Lägg till icon-192.png och icon-512.png här
```

## Kvarstår

- [ ] Portera prototypens tabellvy/"Idag"-sektion till riktiga
      React-komponenter mot `training_schedule`
- [ ] Koppla redigeringsläget (kugghjul + PIN) mot Supabase
      insert/update/delete
- [ ] Lägg till app-ikoner (se public/icons/README.txt)
- [ ] Deploy till Vercel + CNAME `skjuts.hundradel.se` -> Vercel
      (samma metod som hundradel.se)

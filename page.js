import { supabase } from '../lib/supabaseClient';

export const dynamic = 'force-dynamic';

const DAY_NAMES = {
  mon: 'Måndag',
  tue: 'Tisdag',
  wed: 'Onsdag',
  thu: 'Torsdag',
  fri: 'Fredag',
  sat: 'Lördag',
  sun: 'Söndag',
};

export default async function Home() {
  const { data: rows, error } = await supabase
    .from('training_schedule')
    .select('*')
    .order('day')
    .order('start_time');

  return (
    <main style={{ padding: '20px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Skjuts</h1>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 0 }}>
        Grundstruktur klar. Detta är en enkel lista rakt från Supabase, som
        bekräftar att kopplingen fungerar — själva tabellvyn/UI:t från
        prototypen porteras hit i nästa steg.
      </p>

      {error && (
        <p style={{ color: 'var(--busy)' }}>
          Kunde inte hämta data: {error.message}. Kontrollera att
          .env.local är ifylld och att tabellen training_schedule finns.
        </p>
      )}

      {!error && (!rows || rows.length === 0) && (
        <p style={{ color: 'var(--text-dim)' }}>
          Inga rader hittades i training_schedule än.
        </p>
      )}

      {!error && rows && rows.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rows.map((r) => (
            <li
              key={r.id}
              style={{
                border: '1px solid var(--card-border)',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 8,
                background: 'var(--card)',
              }}
            >
              <strong>{DAY_NAMES[r.day]}</strong>
              {' · '}
              {r.type === 'meal' ? 'Middag' : r.person}
              {' · '}
              {r.start_time}
              {r.end_time ? `–${r.end_time}` : ''}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

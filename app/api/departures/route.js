// Serverproxy för SL Transport-API:t.
// SL:s nyckelfria endpoint rate-limitar hårt per IP (429). Genom att hämta
// på serversidan med kort cache och "stale-on-error" (servera senaste lyckade
// svar om SL svarar 429) slipper familjens webbläsare prata med SL alls, och
// tillfälliga 429:or göms bakom cachad data istället för att bli felmeddelanden.

export const runtime = 'nodejs';

const TTL_MS = 25000; // servera färsk cache i 25 s
const mem = new Map(); // key -> { ts, body }  (färsk cache)
const lastGood = new Map(); // key -> { ts, body }  (senaste lyckade, för stale-on-error)

function jsonResponse(body, extraHeaders = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Låt även Vercels CDN coalesca anrop och servera under revalidering.
      'cache-control': 'public, s-maxage=25, stale-while-revalidate=90',
      ...extraHeaders,
    },
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const site = searchParams.get('site');
  const forecast = searchParams.get('forecast') || '90';
  if (!/^\d+$/.test(site || '') || !/^\d+$/.test(forecast)) {
    return new Response(JSON.stringify({ error: 'Ogiltiga parametrar' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const key = `${site}:${forecast}`;
  const now = Date.now();

  const cached = mem.get(key);
  if (cached && now - cached.ts < TTL_MS) {
    return jsonResponse(cached.body, { 'x-cache': 'HIT' });
  }

  const url = `https://transport.integration.sl.se/v1/sites/${site}/departures?forecast=${forecast}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'skjuts-familjeschema/1.0' },
    });
    clearTimeout(timer);

    if (res.ok) {
      const body = await res.text();
      mem.set(key, { ts: now, body });
      lastGood.set(key, { ts: now, body });
      return jsonResponse(body, { 'x-cache': 'MISS' });
    }

    // SL strypte oss (429) e.d. → servera senaste lyckade svar om vi har det.
    const stale = lastGood.get(key);
    if (stale) {
      return jsonResponse(stale.body, {
        'x-cache': 'STALE',
        'x-upstream-status': String(res.status),
      });
    }
    return new Response(JSON.stringify({ error: 'SL svarade ' + res.status }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'retry-after': '15' },
    });
  } catch (e) {
    const stale = lastGood.get(key);
    if (stale) {
      return jsonResponse(stale.body, { 'x-cache': 'STALE', 'x-error': '1' });
    }
    return new Response(JSON.stringify({ error: 'Kunde inte nå SL' }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'retry-after': '15' },
    });
  }
}

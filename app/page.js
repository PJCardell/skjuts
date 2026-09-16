'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { supabase } from '../lib/supabaseClient';

const PEOPLE = { P: 'Per', A: 'Anna', H: 'Hedvig', K: 'Klara', Z: 'Zoi', M: 'Moa', T: 'Tillsammans' };
const FAMILY = ['P', 'A', 'H', 'K', 'Z', 'M']; // vanliga familjemedlemmar, alltid synliga/valbara
const CHIP_BG = {
  P: '#16263f',
  A: '#3a2418',
  H: '#241b3d',
  K: '#3a1830',
  Z: '#3a2c10',
  M: '#123328',
  T: '#1a1e29',
};
const CHIP_FG = {
  P: 'var(--accent-p)',
  A: 'var(--accent-a)',
  H: 'var(--accent-h)',
  K: 'var(--accent-k)',
  Z: 'var(--accent-z)',
  M: 'var(--accent-m)',
  T: 'var(--accent-t)',
};
const DAYS = [
  { key: 'mon', abbr: 'Mån', full: 'Måndag' },
  { key: 'tue', abbr: 'Tis', full: 'Tisdag' },
  { key: 'wed', abbr: 'Ons', full: 'Onsdag' },
  { key: 'thu', abbr: 'Tor', full: 'Torsdag' },
  { key: 'fri', abbr: 'Fre', full: 'Fredag' },
  { key: 'sat', abbr: 'Lör', full: 'Lördag' },
  { key: 'sun', abbr: 'Sön', full: 'Söndag' },
];
// Hur många minuter innan aktiviteten man behöver ge sig av.
const LEAVE_MINUTES = { P: 20, M: 20, K: 15 };
// Enkel PIN-spärr för redigeringsläget. Ändra siffrorna nedan om ni vill
// byta kod (kräver en ny commit + deploy, ingen miljövariabel behövs).
const EDIT_PIN = '1234';
// Egen PIN för "Tillsammans"-läget (P + A). Håll den hemlig från barnen,
// och gärna en annan kod än EDIT_PIN så de inte råkar avslöja den när de
// får redigerings-koden för egna pass.
const TOGETHER_PIN = '7391';
const TOGETHER_STORAGE_KEY = 'skjuts_tillsammans_unlocked';

const COLOR_MAP = { red: 'var(--busy)', orange: 'var(--tight)', green: 'var(--ok)', white: 'var(--text)' };
const COLOR_OPTIONS = [
  ['white', 'Vit'],
  ['green', 'Grön'],
  ['orange', 'Orange'],
  ['red', 'Röd'],
];

// ---------- Kollektivtrafik (SL Transport API - kräver ingen nyckel) ----------
const SL_DEPARTURES_URL = (siteId) =>
  `https://transport.integration.sl.se/v1/sites/${siteId}/departures?forecast=90`;
// Kolumner (namn) och de två riktningsraderna i avgångstabellen.
const TRANSIT_PERSONS = ['A', 'K', 'M', 'P'];
const TRANSIT_ROWS = [0, 1]; // 0 = övre raden, 1 = nedre raden
const TRANSIT_MODE_LABEL = { TRAIN: 'Pendeltåg', BUS: 'Buss', METRO: 'Tunnelbana', TRAM: 'Spårvagn' };
// En ruta per `${person}:${rad}` (rad 0 = övre raden, rad 1 = nedre raden).
// directionCode: 2 = norrut, 1 = söderut för pendeltåg/tunnelbana; för tvärbanan
// är 1 = mot Solna station (norr via Alvik→Bällsta bro→Sundbyberg), 2 = mot Sickla.
// Valfri `lines` visar bara dessa linjebeteckningar; utelämnad = alla linjer i läget.
// Site-id: 1339 Södra station, 9325 Sundbyberg (alias Sundbybergs centrum),
// 9309 Rådhuset (tbana), 9509 Solna (alias Solna station), 9112 Alvik, 3680 Bällsta bro.
const TRANSIT_CELLS = {
  'P:0': { siteId: 1339, mode: 'TRAIN', directionCode: 2, lines: ['43', '43X'], short: 'Sthlm S → norr' },
  'P:1': { siteId: 9325, mode: 'TRAIN', directionCode: 1, short: 'Sbg → söder' },
  'M:0': { siteId: 9309, mode: 'METRO', directionCode: 1, lines: ['10'], short: 'Rådhuset → norr' },
  'M:1': { siteId: 9325, mode: 'METRO', directionCode: 2, short: 'Sbg C → söder' },
  'A:0': { siteId: 9509, mode: 'TRAM', directionCode: null, short: 'Solna st' },
  'A:1': { siteId: 9325, mode: 'TRAM', directionCode: 1, short: 'Sbg C → Solna' },
  'K:0': { siteId: 9112, mode: 'TRAM', directionCode: 1, lines: ['30'], short: 'Alvik → Sbg' },
  'K:1': { siteId: 3680, mode: 'TRAM', directionCode: 2, short: 'Bällsta → Alvik' },
};

function colorFor(c) {
  return COLOR_MAP[c] || COLOR_MAP.white;
}

// Supabase time-kolumner kommer som "HH:MM:SS" - klipp bort sekunderna.
function fmtTime(t) {
  return t ? t.slice(0, 5) : t;
}

function leaveTimeFor(person, start) {
  const mins = LEAVE_MINUTES[person];
  if (mins == null || !start) return null;
  const [h, m] = fmtTime(start).split(':').map(Number);
  let total = h * 60 + m - mins;
  total = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function Chip({ letter }) {
  return (
    <span className="chip" style={{ background: CHIP_BG[letter], color: CHIP_FG[letter] }}>
      {letter}
    </span>
  );
}

function emptyDraft(day) {
  return {
    day,
    type: 'activity',
    person: 'P',
    start_time: '17:00',
    end_time: '18:00',
    start_color: 'white',
    end_color: 'white',
    note: '',
    sync_out: [],
    sync_home: [],
  };
}

export default function Home() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editingRowId, setEditingRowId] = useState(null); // id, eller 'new'
  const [draft, setDraft] = useState(null);

  const [tillsammansUnlocked, setTillsammansUnlocked] = useState(false);

  // pinModal: null | 'edit' | 'together'
  const [pinModal, setPinModal] = useState(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState(false);

  // Kollektivtrafik: vilken ruta som är öppen + hämtad data per ruta.
  const [transitOpen, setTransitOpen] = useState(null);
  const [transitData, setTransitData] = useState({}); // key -> { loading, error, deps, at }

  const todayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];

  // Tillsammans-läget loggar INTE ut automatiskt - kolla sparat läge vid start.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem(TOGETHER_STORAGE_KEY) === '1') {
      setTillsammansUnlocked(true);
    }
  }, []);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase.from('training_schedule').select('*');
    if (error) setErrorMsg(error.message);
    else {
      setErrorMsg(null);
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  function sortedRowsForDay(dayKey) {
    return rows
      .filter((r) => r.day === dayKey)
      .filter((r) => tillsammansUnlocked || r.person !== 'T')
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'meal' ? -1 : 1;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });
  }

  function openEditor(row) {
    setDraft({ ...row });
    setEditingRowId(row.id);
  }
  function openAddEditor(dayKey) {
    setDraft(emptyDraft(dayKey));
    setEditingRowId('new');
  }
  function closeEditor() {
    setDraft(null);
    setEditingRowId(null);
  }
  function updateDraft(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }
  function setDraftType(type) {
    setDraft((d) => {
      const next = { ...d, type };
      if (type === 'meal') {
        next.end_time = null;
        next.person = null;
      } else {
        if (!next.end_time) next.end_time = '18:00';
        if (!next.person) next.person = 'P';
        if (!next.start_color) next.start_color = 'white';
        if (!next.end_color) next.end_color = 'white';
        if (!next.sync_out) next.sync_out = [];
        if (!next.sync_home) next.sync_home = [];
      }
      return next;
    });
  }
  function toggleSync(group, letter) {
    setDraft((d) => {
      const arr = d[group] || [];
      const next = arr.includes(letter) ? arr.filter((x) => x !== letter) : [...arr, letter];
      return { ...d, [group]: next };
    });
  }

  async function saveDraft() {
    setSaving(true);
    const payload = {
      day: draft.day,
      type: draft.type,
      person: draft.type === 'meal' ? null : draft.person,
      start_time: draft.start_time,
      end_time: draft.type === 'meal' ? null : draft.end_time,
      start_color: draft.type === 'meal' ? 'white' : draft.start_color || 'white',
      end_color: draft.type === 'meal' ? 'white' : draft.end_color || 'white',
      note: draft.note || null,
      sync_out: draft.type === 'meal' ? [] : draft.sync_out || [],
      sync_home: draft.type === 'meal' ? [] : draft.sync_home || [],
    };
    const result =
      editingRowId === 'new'
        ? await supabase.from('training_schedule').insert(payload)
        : await supabase.from('training_schedule').update(payload).eq('id', editingRowId);
    if (result.error) setErrorMsg(result.error.message);
    else {
      setErrorMsg(null);
      await fetchRows();
      closeEditor();
    }
    setSaving(false);
  }

  async function deleteRow(id) {
    setSaving(true);
    const { error } = await supabase.from('training_schedule').delete().eq('id', id);
    if (error) setErrorMsg(error.message);
    else {
      setErrorMsg(null);
      await fetchRows();
    }
    setSaving(false);
  }

  // ---------- Kollektivtrafik ----------
  const loadDepartures = useCallback(async (key) => {
    const cfg = TRANSIT_CELLS[key];
    if (!cfg) return;
    setTransitData((d) => ({ ...d, [key]: { ...(d[key] || {}), loading: true, error: null } }));
    try {
      const res = await fetch(SL_DEPARTURES_URL(cfg.siteId));
      if (!res.ok) throw new Error('SL svarade ' + res.status);
      const json = await res.json();
      const deps = (json.departures || [])
        .filter(
          (x) =>
            x.line?.transport_mode === cfg.mode &&
            (cfg.directionCode == null || x.direction_code === cfg.directionCode) &&
            (cfg.lines == null || cfg.lines.includes(x.line?.designation))
        )
        .slice(0, 3);
      setTransitData((d) => ({ ...d, [key]: { loading: false, error: null, deps, at: new Date() } }));
    } catch (e) {
      setTransitData((d) => ({
        ...d,
        [key]: { loading: false, error: e.message || 'Nätverksfel', deps: [], at: null },
      }));
    }
  }, []);

  function toggleTransit(key) {
    if (!TRANSIT_CELLS[key]) return;
    if (transitOpen === key) {
      setTransitOpen(null); // tryck på öppen ruta = stäng
    } else {
      setTransitOpen(key);
      loadDepartures(key);
    }
  }

  function openPinModal(mode) {
    setPinValue('');
    setPinError(false);
    setPinModal(mode);
  }
  function checkPin() {
    const expected = pinModal === 'together' ? TOGETHER_PIN : EDIT_PIN;
    if (pinValue === expected) {
      if (pinModal === 'together') {
        setTillsammansUnlocked(true);
        if (typeof window !== 'undefined') window.localStorage.setItem(TOGETHER_STORAGE_KEY, '1');
      } else {
        setEditing(true);
      }
      setPinModal(null);
    } else {
      setPinError(true);
      setPinValue('');
    }
  }
  function toggleGear() {
    if (editing) {
      setEditing(false);
      closeEditor();
    } else {
      openPinModal('edit');
    }
  }
  function toggleTogether() {
    if (tillsammansUnlocked) {
      setTillsammansUnlocked(false);
      if (typeof window !== 'undefined') window.localStorage.removeItem(TOGETHER_STORAGE_KEY);
    } else {
      openPinModal('together');
    }
  }

  // ---------- Idag-sektionen ----------
  function renderHero() {
    const dayInfo = DAYS.find((d) => d.key === todayKey);
    const todayRows = sortedRowsForDay(todayKey);
    return (
      <div className="today-hero">
        <div className="hero-head">
          <span className="tag">IDAG</span>
          <span className="dname">{dayInfo.full}</span>
        </div>
        {todayRows.length === 0 ? (
          <div className="hero-empty">Inget planerat idag.</div>
        ) : (
          <div className="hero-list">
            {todayRows.map((r) =>
              r.type === 'meal' ? (
                <div className="hero-row meal" key={r.id}>
                  <div className="hero-avatar meal">🍴</div>
                  <div className="hero-body">
                    <div className="hero-time" style={{ color: 'var(--meal)' }}>
                      {fmtTime(r.start_time)}
                      <small>Middag</small>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hero-row" key={r.id}>
                  <div
                    className="hero-avatar"
                    style={{ background: CHIP_BG[r.person], color: CHIP_FG[r.person] }}
                  >
                    {r.person}
                  </div>
                  <div className="hero-body">
                    <div className="hero-times">
                      <div className="hero-tblock">
                        <div className="hero-time" style={{ color: colorFor(r.start_color) }}>
                          {fmtTime(r.start_time)}
                        </div>
                        {leaveTimeFor(r.person, r.start_time) && (
                          <div className="hero-leave">
                            Gå <b>{leaveTimeFor(r.person, r.start_time)}</b>
                          </div>
                        )}
                      </div>
                      <div className="hero-sep">–</div>
                      <div className="hero-tblock">
                        <div className="hero-time" style={{ color: colorFor(r.end_color) }}>
                          {fmtTime(r.end_time)}
                        </div>
                        {leaveTimeFor(r.person, r.end_time) && (
                          <div className="hero-leave">
                            Gå <b>{leaveTimeFor(r.person, r.end_time)}</b>
                          </div>
                        )}
                      </div>
                      <div className="hero-name">{PEOPLE[r.person]}</div>
                    </div>
                    {(r.sync_out?.length > 0 || r.sync_home?.length > 0) && (
                      <div className="hero-sync">
                        {r.sync_out?.length > 0 && (
                          <div className="grp">
                            dit {r.sync_out.map((l) => <Chip key={l} letter={l} />)}
                          </div>
                        )}
                        {r.sync_home?.length > 0 && (
                          <div className="grp">
                            hem {r.sync_home.map((l) => <Chip key={l} letter={l} />)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------- Redigeringskortet ----------
  function renderEditorCard(key) {
    const isMeal = draft.type === 'meal';
    return (
      <div className="editor-card" key={key}>
        <div className="field">
          <label>Typ</label>
          <div className="pill-row">
            <button
              className={`pill ${isMeal ? 'on' : ''}`}
              style={isMeal ? { borderColor: 'var(--meal)', color: 'var(--meal)' } : undefined}
              onClick={() => setDraftType('meal')}
            >
              Middag
            </button>
            <button
              className={`pill ${!isMeal ? 'on' : ''}`}
              style={!isMeal ? { borderColor: 'var(--accent-m)', color: 'var(--accent-m)' } : undefined}
              onClick={() => setDraftType('activity')}
            >
              Aktivitet
            </button>
          </div>
        </div>

        <div className="field">
          <label>Dag</label>
          <select className="dsel" value={draft.day} onChange={(e) => updateDraft('day', e.target.value)}>
            {DAYS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.full}
              </option>
            ))}
          </select>
        </div>

        {!isMeal && (
          <div className="field">
            <label>Person</label>
            <div className="pill-row">
              {(tillsammansUnlocked ? [...FAMILY, 'T'] : FAMILY).map((k) => {
                const on = draft.person === k;
                return (
                  <button
                    key={k}
                    className={`pill ${on ? 'on' : ''}`}
                    style={on ? { borderColor: CHIP_FG[k], color: CHIP_FG[k], background: CHIP_BG[k] } : undefined}
                    onClick={() => updateDraft('person', k)}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="time-row">
          <div className="field">
            <label>Börjar</label>
            <input
              type="time"
              value={fmtTime(draft.start_time) || ''}
              onChange={(e) => updateDraft('start_time', e.target.value)}
            />
          </div>
          {!isMeal && (
            <div className="field">
              <label>Slutar</label>
              <input
                type="time"
                value={fmtTime(draft.end_time) || ''}
                onChange={(e) => updateDraft('end_time', e.target.value)}
              />
            </div>
          )}
        </div>

        {!isMeal && (
          <>
            <div className="field">
              <label>Färg – lämna ({fmtTime(draft.start_time)})</label>
              <div className="pill-row">
                {COLOR_OPTIONS.map(([val, label]) => {
                  const on = draft.start_color === val;
                  const c = COLOR_MAP[val];
                  return (
                    <button
                      key={val}
                      className={`pill ${on ? 'on' : ''}`}
                      style={on ? { borderColor: c, color: c } : undefined}
                      onClick={() => updateDraft('start_color', val)}
                    >
                      <span className="swatch" style={{ background: c }} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <label>Färg – hämta ({fmtTime(draft.end_time)})</label>
              <div className="pill-row">
                {COLOR_OPTIONS.map(([val, label]) => {
                  const on = draft.end_color === val;
                  const c = COLOR_MAP[val];
                  return (
                    <button
                      key={val}
                      className={`pill ${on ? 'on' : ''}`}
                      style={on ? { borderColor: c, color: c } : undefined}
                      onClick={() => updateDraft('end_color', val)}
                    >
                      <span className="swatch" style={{ background: c }} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <label>Samka – ditresa</label>
              <div className="pill-row">
                {FAMILY.map((k) => {
                  const on = (draft.sync_out || []).includes(k);
                  return (
                    <button
                      key={k}
                      className={`pill ${on ? 'on' : ''}`}
                      style={on ? { borderColor: CHIP_FG[k], color: CHIP_FG[k], background: CHIP_BG[k] } : undefined}
                      onClick={() => toggleSync('sync_out', k)}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <label>Samka – hemresa</label>
              <div className="pill-row">
                {FAMILY.map((k) => {
                  const on = (draft.sync_home || []).includes(k);
                  return (
                    <button
                      key={k}
                      className={`pill ${on ? 'on' : ''}`}
                      style={on ? { borderColor: CHIP_FG[k], color: CHIP_FG[k], background: CHIP_BG[k] } : undefined}
                      onClick={() => toggleSync('sync_home', k)}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="field">
          <label>Anteckning</label>
          <textarea
            className="note-input"
            rows={2}
            placeholder="T.ex. glöm inte matchkläder"
            value={draft.note || ''}
            onChange={(e) => updateDraft('note', e.target.value)}
          />
        </div>

        <div className="editor-actions">
          <button className="btn cancel" onClick={closeEditor} disabled={saving}>
            Avbryt
          </button>
          <button className="btn save" onClick={saveDraft} disabled={saving}>
            {saving ? 'Sparar…' : 'Klart'}
          </button>
        </div>
      </div>
    );
  }

  // ---------- Ett aktivitetskort i veckolistan ----------
  function renderRowCard(r) {
    if (r.type === 'meal') {
      return (
        <div className="row-card meal" key={r.id}>
          <div className="row-accent meal-accent" />
          <div className="row-avatar meal">🍴</div>
          <div className="row-main">
            <div className="row-time" style={{ color: 'var(--meal)' }}>
              {fmtTime(r.start_time)} <span className="row-meal-label">Middag</span>
            </div>
          </div>
          {editing && (
            <div className="row-actions">
              <button className="icon-btn" onClick={() => openEditor(r)}>✎</button>
              <button className="icon-btn danger" onClick={() => deleteRow(r.id)}>✕</button>
            </div>
          )}
        </div>
      );
    }

    const leaveOut = leaveTimeFor(r.person, r.start_time);
    const leaveHome = leaveTimeFor(r.person, r.end_time);

    return (
      <div className="row-card" key={r.id}>
        <div className="row-accent" style={{ background: colorFor(r.start_color) }} />
        <div className="row-avatar" style={{ background: CHIP_BG[r.person], color: CHIP_FG[r.person] }}>
          {r.person}
        </div>
        <div className="row-main">
          <div className="row-top">
            <div className="row-time">
              <span style={{ color: colorFor(r.start_color) }}>{fmtTime(r.start_time)}</span>
              {' – '}
              <span style={{ color: colorFor(r.end_color) }}>{fmtTime(r.end_time)}</span>
            </div>
            <div className="row-name">{PEOPLE[r.person]}</div>
          </div>
          {(leaveOut || leaveHome) && (
            <div className="row-leave">
              {leaveOut && <span>Gå <b>{leaveOut}</b></span>}
              {leaveHome && <span>Gå <b>{leaveHome}</b></span>}
            </div>
          )}
          {(r.sync_out?.length > 0 || r.sync_home?.length > 0) && (
            <div className="row-sync">
              {r.sync_out?.length > 0 && (
                <div className="grp">
                  dit {r.sync_out.map((l) => <Chip key={l} letter={l} />)}
                </div>
              )}
              {r.sync_home?.length > 0 && (
                <div className="grp">
                  hem {r.sync_home.map((l) => <Chip key={l} letter={l} />)}
                </div>
              )}
            </div>
          )}
        </div>
        {r.note && <div className="row-note">{r.note}</div>}
        {editing && (
          <div className="row-actions">
            <button className="icon-btn" onClick={() => openEditor(r)}>✎</button>
            <button className="icon-btn danger" onClick={() => deleteRow(r.id)}>✕</button>
          </div>
        )}
      </div>
    );
  }

  function renderDaySection(day) {
    const list = sortedRowsForDay(day.key);
    if (list.length === 0 && !editing) return null;
    const isToday = day.key === todayKey;

    return (
      <section className={`day-section ${isToday ? 'today' : ''}`} key={day.key}>
        <div className="day-header">
          <span className="day-name">{day.full}</span>
          {isToday && <span className="today-pill">IDAG</span>}
        </div>
        <div className="day-rows">
          {list.length === 0 && <div className="day-empty">Inget planerat</div>}
          {list.map((r) => (
            <div key={`wrap-${r.id}`}>
              {renderRowCard(r)}
              {editingRowId === r.id && draft && renderEditorCard(`ed-${r.id}`)}
            </div>
          ))}
          {editingRowId === 'new' && draft && draft.day === day.key && renderEditorCard('ed-new')}
        </div>
        {editing && (
          <button className="add-day-btn" onClick={() => openAddEditor(day.key)}>
            + Lägg till i {day.full.toLowerCase()}
          </button>
        )}
      </section>
    );
  }

  // ---------- Avgångstabell (kollektivtrafik) ----------
  function renderTransitPanel(key) {
    const cfg = TRANSIT_CELLS[key];
    const st = transitData[key] || {};
    const modeLabel = TRANSIT_MODE_LABEL[cfg.mode] || cfg.mode;
    const deps = st.deps || [];
    return (
      <div className="transit-panel">
        <div className="transit-panel-head">
          <span className="transit-panel-title">
            {cfg.short} · {modeLabel}
          </span>
          <button className="transit-refresh" onClick={() => loadDepartures(key)} aria-label="Uppdatera">
            ↻
          </button>
        </div>
        {st.loading && <div className="transit-msg">Hämtar avgångar…</div>}
        {st.error && <div className="transit-msg err">Kunde inte hämta: {st.error}</div>}
        {!st.loading && !st.error && deps.length === 0 && (
          <div className="transit-msg">Inga avgångar de närmaste 90 minuterna.</div>
        )}
        {!st.loading && !st.error && deps.length > 0 && (
          <div className="transit-deps">
            {deps.map((x, i) => {
              const cancelled = x.state === 'CANCELLED';
              const exp = x.expected ? new Date(x.expected) : null;
              const sched = x.scheduled ? new Date(x.scheduled) : null;
              const delayMin = exp && sched ? Math.round((exp - sched) / 60000) : 0;
              const clock = exp
                ? `${String(exp.getHours()).padStart(2, '0')}:${String(exp.getMinutes()).padStart(2, '0')}`
                : '';
              // Klockslagets färg: vitt i tid, orange om sent, rött om mer än 10 min sent.
              const clockColor =
                cancelled || delayMin > 10 ? 'var(--busy)' : delayMin >= 1 ? 'var(--tight)' : 'var(--text)';
              // SL:s "display" är antingen nedräkning ("5 min"/"Nu") eller redan ett klockslag.
              const displayIsClock = /^\d{1,2}:\d{2}$/.test(x.display || '');
              return (
                <div className="transit-dep" key={i}>
                  <span className="transit-line">{x.line?.designation}</span>
                  <span className="transit-dest">{x.destination}</span>
                  {cancelled ? (
                    <span className="transit-clock" style={{ color: 'var(--busy)' }}>
                      Inställd
                    </span>
                  ) : displayIsClock ? (
                    <span className="transit-clock" style={{ color: clockColor }}>
                      {clock}
                    </span>
                  ) : (
                    <>
                      <span className="transit-when">{x.display}</span>
                      <span className="transit-clock" style={{ color: clockColor }}>
                        {clock}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {st.at && !st.loading && (
          <div className="transit-updated">
            Uppdaterad {String(st.at.getHours()).padStart(2, '0')}:
            {String(st.at.getMinutes()).padStart(2, '0')}
          </div>
        )}
      </div>
    );
  }

  function renderTransit() {
    return (
      <section className="transit">
        {transitOpen && TRANSIT_CELLS[transitOpen] && renderTransitPanel(transitOpen)}
        <div className="transit-grid">
          <div className="transit-corner">🚆</div>
          {TRANSIT_PERSONS.map((p) => (
            <div
              key={`th-${p}`}
              className="transit-head"
              style={{ background: CHIP_BG[p], color: CHIP_FG[p] }}
            >
              {p}
            </div>
          ))}
          {TRANSIT_ROWS.map((r) => (
            <Fragment key={`tr-${r}`}>
              <div className="transit-rowlabel">{r === 0 ? '↑' : '↓'}</div>
              {TRANSIT_PERSONS.map((p) => {
                const key = `${p}:${r}`;
                const cfg = TRANSIT_CELLS[key];
                const open = transitOpen === key;
                return (
                  <button
                    key={key}
                    className={`transit-cell ${cfg ? 'has' : 'empty'} ${open ? 'open' : ''}`}
                    onClick={() => toggleTransit(key)}
                    disabled={!cfg}
                  >
                    {cfg ? cfg.short : '–'}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>Skjuts</h1>
          <p>Vem kör vem, och när</p>
        </div>
        <div className={`gear ${editing ? 'active' : ''}`} onClick={toggleGear}>
          ⚙
        </div>
      </header>

      {renderHero()}

      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      <div className="week-wrap">
        {loading ? (
          <p style={{ padding: '16px 4px', color: 'var(--text-dim)', fontSize: 14 }}>Laddar schema…</p>
        ) : (
          DAYS.map((day) => renderDaySection(day))
        )}
      </div>

      {renderTransit()}

      <footer>
        {(tillsammansUnlocked ? [...FAMILY, 'T'] : FAMILY).map((k) => (
          <span key={k}>
            <span className="dot" style={{ background: CHIP_FG[k] }}></span>
            {k} = {PEOPLE[k]}
          </span>
        ))}
        <button
          className={tillsammansUnlocked ? 'together-btn on' : 'together-btn'}
          onClick={toggleTogether}
        >
          {tillsammansUnlocked ? 'Familjeläge' : 'v1.0'}
        </button>
      </footer>

      {pinModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Ange kod</h3>
            <p>Kod krävs för att fortsätta</p>
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pinValue}
              onChange={(e) => {
                setPinValue(e.target.value);
                setPinError(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && checkPin()}
              style={pinError ? { borderColor: 'var(--busy)' } : undefined}
            />
            <div className="editor-actions">
              <button className="btn cancel" onClick={() => setPinModal(null)}>
                Avbryt
              </button>
              <button className="btn save" onClick={checkPin}>
                Lås upp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

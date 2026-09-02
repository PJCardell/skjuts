'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const PEOPLE = { P: 'Per', H: 'Hedvig', K: 'Klara', Z: 'Zoi', M: 'Moa' };
const CHIP_BG = { P: '#16263f', H: '#241b3d', K: '#3a1830', Z: '#3a2c10', M: '#123328' };
const CHIP_FG = {
  P: 'var(--accent-p)',
  H: 'var(--accent-h)',
  K: 'var(--accent-k)',
  Z: 'var(--accent-z)',
  M: 'var(--accent-m)',
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

const COLOR_MAP = { red: 'var(--busy)', orange: 'var(--tight)', green: 'var(--ok)', white: 'var(--text)' };
const COLOR_OPTIONS = [
  ['white', 'Vit'],
  ['green', 'Grön'],
  ['orange', 'Orange'],
  ['red', 'Röd'],
];

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

  const [showPin, setShowPin] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState(false);

  const todayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];

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

  function openPinModal() {
    setPinValue('');
    setPinError(false);
    setShowPin(true);
  }
  function checkPin() {
    if (pinValue === EDIT_PIN) {
      setEditing(true);
      setShowPin(false);
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
      openPinModal();
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
              {Object.keys(PEOPLE).map((k) => {
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
                {Object.keys(PEOPLE).map((k) => {
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
                {Object.keys(PEOPLE).map((k) => {
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

      <footer>
        {Object.entries(PEOPLE).map(([k, name]) => (
          <span key={k}>
            <span className="dot" style={{ background: CHIP_FG[k] }}></span>
            {k} = {name}
          </span>
        ))}
      </footer>

      {showPin && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Lås upp redigering</h3>
            <p>Ange PIN-kod</p>
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
              <button className="btn cancel" onClick={() => setShowPin(false)}>
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

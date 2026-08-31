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
// Hur många minuter innan aktiviteten man behöver ge sig av. Lägg till fler
// personer här om ni vill ha "Gå"-tider för fler än P/M/K.
const LEAVE_MINUTES = { P: 20, M: 20, K: 15 };
// Enkel PIN-spärr för redigeringsläget. Ändra siffrorna nedan om ni vill
// byta kod (kräver en ny commit + deploy, ingen miljövariabel behövs).
const EDIT_PIN = '1234';

const STATUS_COLOR = { busy: 'var(--busy)', tight: 'var(--tight)', ok: 'var(--ok)' };

function statusColor(s) {
  return STATUS_COLOR[s] || STATUS_COLOR.ok;
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
    status: 'ok',
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
        if (!next.status) next.status = 'ok';
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
      status: draft.type === 'meal' ? 'ok' : draft.status,
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
                        <div className="hero-time" style={{ color: statusColor(r.status) }}>
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
                        <div className="hero-time" style={{ color: statusColor(r.status) }}>
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

  // ---------- Redigeringsraden ----------
  function renderEditorRow(colSpan, key) {
    const isMeal = draft.type === 'meal';
    return (
      <tr className="editor-row" key={key}>
        <td colSpan={colSpan}>
          <div className="editor">
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
                    {d.abbr}
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
                  <label>Bilstatus</label>
                  <div className="pill-row">
                    {[
                      ['ok', 'Ledigt', 'var(--ok)'],
                      ['tight', 'Tajt', 'var(--tight)'],
                      ['busy', 'Upptaget', 'var(--busy)'],
                    ].map(([val, label, color]) => {
                      const on = draft.status === val;
                      return (
                        <button
                          key={val}
                          className={`pill ${on ? 'on' : ''}`}
                          style={on ? { borderColor: color, color } : undefined}
                          onClick={() => updateDraft('status', val)}
                        >
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

            <div className="editor-actions">
              <button className="btn cancel" onClick={closeEditor} disabled={saving}>
                Avbryt
              </button>
              <button className="btn save" onClick={saveDraft} disabled={saving}>
                {saving ? 'Sparar…' : 'Klart'}
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  // ---------- En rad i veckotabellen ----------
  function renderViewRow(r, isFirstOfDay, day) {
    const isToday = r.day === todayKey;
    const trCls = [isFirstOfDay ? 'day-first' : '', isToday ? 'today' : ''].filter(Boolean).join(' ');
    const dayCell = isFirstOfDay ? (
      <>
        <span className="day-lbl">{day.abbr}</span>
        {isToday && <span className="today-tag">IDAG</span>}
      </>
    ) : null;

    if (r.type === 'meal') {
      return (
        <tr className={`${trCls} meal-row`} key={r.id}>
          <td>{dayCell}</td>
          <td className="meal-who">🍴</td>
          <td className="time" style={{ color: 'var(--meal)' }}>
            {fmtTime(r.start_time)}
          </td>
          <td></td>
          <td>Middag</td>
          {editing && (
            <td className="actions-td">
              <div className="row-actions">
                <button className="icon-btn" onClick={() => openEditor(r)}>✎</button>
                <button className="icon-btn danger" onClick={() => deleteRow(r.id)}>✕</button>
              </div>
            </td>
          )}
        </tr>
      );
    }

    return (
      <tr className={trCls} key={r.id}>
        <td>{dayCell}</td>
        <td>
          <div className="who">
            <div className="avatar" style={{ background: CHIP_BG[r.person], color: CHIP_FG[r.person] }}>
              {r.person}
            </div>
          </div>
        </td>
        <td className="time" style={{ color: statusColor(r.status) }}>
          {fmtTime(r.start_time)}
        </td>
        <td className="time" style={{ color: statusColor(r.status) }}>
          {fmtTime(r.end_time)}
        </td>
        <td>
          {r.sync_out?.length > 0 || r.sync_home?.length > 0 ? (
            <div className="sync">
              {r.sync_out?.length > 0 && (
                <div className="grp">
                  <span className="arr">dit</span>
                  {r.sync_out.map((l) => <Chip key={l} letter={l} />)}
                </div>
              )}
              {r.sync_home?.length > 0 && (
                <div className="grp">
                  <span className="arr">hem</span>
                  {r.sync_home.map((l) => <Chip key={l} letter={l} />)}
                </div>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>–</span>
          )}
        </td>
        {editing && (
          <td className="actions-td">
            <div className="row-actions">
              <button className="icon-btn" onClick={() => openEditor(r)}>✎</button>
              <button className="icon-btn danger" onClick={() => deleteRow(r.id)}>✕</button>
            </div>
          </td>
        )}
      </tr>
    );
  }

  function renderDayGroup(day) {
    const list = sortedRowsForDay(day.key);
    const colSpan = editing ? 6 : 5;
    const nodes = [];

    if (list.length === 0 && !editing) return nodes;

    if (list.length === 0 && editing) {
      const isToday = day.key === todayKey;
      nodes.push(
        <tr className={`day-first ${isToday ? 'today' : ''}`} key={`${day.key}-empty`}>
          <td>
            <span className="day-lbl">{day.abbr}</span>
            {isToday && <span className="today-tag">IDAG</span>}
          </td>
          <td colSpan={colSpan - 1} style={{ color: 'var(--text-faint)', fontSize: 11 }}>
            Inget planerat
          </td>
        </tr>
      );
    }

    list.forEach((r, i) => {
      nodes.push(renderViewRow(r, i === 0, day));
      if (editingRowId === r.id && draft) nodes.push(renderEditorRow(colSpan, `ed-${r.id}`));
    });

    if (editingRowId === 'new' && draft && draft.day === day.key) {
      nodes.push(renderEditorRow(colSpan, 'ed-new'));
    }

    if (editing) {
      nodes.push(
        <tr className="add-link-row" key={`${day.key}-add`}>
          <td colSpan={colSpan}>
            <button className="add-link" onClick={() => openAddEditor(day.key)}>
              + Lägg till {day.abbr}
            </button>
          </td>
        </tr>
      );
    }

    return nodes;
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

      <div className="table-wrap">
        {loading ? (
          <p style={{ padding: '12px 4px', color: 'var(--text-dim)', fontSize: 13 }}>Laddar schema…</p>
        ) : (
          <table>
            <colgroup>
              <col className="c-day" />
              <col className="c-who" />
              <col className="c-start" />
              <col className="c-end" />
              <col className="c-sync" />
              {editing && <col style={{ width: '10%' }} />}
            </colgroup>
            <thead>
              <tr>
                <th>Dag</th>
                <th>Vem</th>
                <th>Börjar</th>
                <th>Slutar</th>
                <th>Synk</th>
                {editing && <th></th>}
              </tr>
            </thead>
            <tbody>{DAYS.map((day) => renderDayGroup(day))}</tbody>
          </table>
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

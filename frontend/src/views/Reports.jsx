import React, { useEffect, useState } from 'react';
import { api, download } from '../api.js';
import { todayStr } from '../util.js';

function RangeTabs({ range, setRange, options }) {
  return (
    <div className="btn-row section-gap">
      {options.map(([r, l]) => (
        <button key={r} className={'btn btn-sm ' + (range === r ? 'btn-dark' : 'btn-ghost')} onClick={() => setRange(r)}>{l}</button>
      ))}
    </div>
  );
}

// ── Room utilisation (unchanged from the boardrooms report) ────────────
function RoomUtilisation() {
  const [range, setRange] = useState('week');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null); setErr('');
    api.get(`/boardrooms/reports/utilisation?range=${range}`).then(setData).catch((e) => setErr(e.message));
  }, [range]);

  return (
    <>
      <RangeTabs range={range} setRange={setRange} options={[['week', 'Last 7 days'], ['month', 'Last 30 days']]} />
      {err && <div className="notice notice-err">{err}</div>}
      {!data && !err && <div className="empty">Loading…</div>}
      {data && (
        <>
          <div className="grid section-gap" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="card"><div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Bookings</div><div className="serif" style={{ fontSize: 26 }}>{data.totals.bookings}</div></div>
            <div className="card"><div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Hours booked</div><div className="serif" style={{ fontSize: 26 }}>{data.totals.hours}</div></div>
            <div className="card"><div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Active rooms</div><div className="serif" style={{ fontSize: 26 }}>{data.totals.rooms}</div></div>
          </div>
          {data.rooms.length === 0 && <div className="empty">No rooms to report on.</div>}
          {data.rooms.length > 0 && (
            <div className="table-card">
              <table>
                <thead><tr><th>Room</th><th>Bookings</th><th>Hours</th><th style={{ width: '40%' }}>Utilisation</th></tr></thead>
                <tbody>
                  {data.rooms.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.name}</strong></td>
                      <td>{r.bookings}</td>
                      <td>{r.hours}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 8, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${r.utilisation}%`, height: '100%', background: r.utilisation >= 70 ? 'var(--accent)' : 'var(--green)' }} />
                          </div>
                          <span style={{ fontSize: 12, width: 34, textAlign: 'right' }}>{r.utilisation}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="hint" style={{ marginTop: 10 }}>
            Utilisation = hours booked ÷ (weekdays × 11 business hours) over the period.
          </div>
        </>
      )}
    </>
  );
}

// ── Visitor report (period summary + breakdown + export) ───────────────
function VisitorReport() {
  const [range, setRange] = useState('week');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setD(null); setErr('');
    Promise.all([
      api.get(`/admin/stats?range=${range}`),
      api.get(`/admin/by-type?range=${range}`),
      api.get(`/admin/top-hosts?range=${range}`),
    ]).then(([stats, byType, topHosts]) => setD({ stats, byType, topHosts })).catch((e) => setErr(e.message));
  }, [range]);

  async function exportCsv() {
    setExporting(true); setErr('');
    try { await download(`/admin/export?range=${range}`, `vivo_visitors_${range}_${todayStr()}.csv`); }
    catch (e) { setErr(e.message); }
    finally { setExporting(false); }
  }

  const total = d ? d.byType.reduce((a, t) => a + Number(t.count), 0) : 0;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <RangeTabs range={range} setRange={setRange} options={[['week', 'Last 7 days'], ['month', 'Last 30 days']]} />
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={exporting} style={{ marginBottom: 26 }}>
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      {err && <div className="notice notice-err">{err}</div>}
      {!d && !err && <div className="empty">Loading…</div>}
      {d && (
        <>
          <div className="grid section-gap" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="card"><div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Visits</div><div className="serif" style={{ fontSize: 26 }}>{d.stats.total}</div></div>
            <div className="card"><div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Avg stay</div><div className="serif" style={{ fontSize: 26 }}>{d.stats.avgDuration ? `${d.stats.avgDuration}m` : '—'}</div></div>
            <div className="card"><div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Peak hour</div><div className="serif" style={{ fontSize: 26 }}>{d.stats.peakHour}</div></div>
          </div>

          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Visit types</div>
          {d.byType.length === 0 && <div className="empty">No visits in this period.</div>}
          {d.byType.length > 0 && (
            <div className="table-card section-gap">
              <table>
                <thead><tr><th>Type</th><th>Visits</th><th style={{ width: '45%' }}>Share</th></tr></thead>
                <tbody>
                  {d.byType.map((t, i) => {
                    const pct = total ? Math.round((Number(t.count) / total) * 100) : 0;
                    return (
                      <tr key={i}>
                        <td><strong>{t.visit_type || 'Unspecified'}</strong></td>
                        <td>{t.count}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 8, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
                            </div>
                            <span style={{ fontSize: 12, width: 34, textAlign: 'right' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Top hosts</div>
          {d.topHosts.length === 0 && <div className="empty">No hosts recorded in this period.</div>}
          {d.topHosts.length > 0 && (
            <div className="table-card">
              <table>
                <thead><tr><th>Host</th><th>Department</th><th>Visits</th></tr></thead>
                <tbody>
                  {d.topHosts.map((h, i) => (
                    <tr key={i}>
                      <td><strong>{h.host_name}</strong></td>
                      <td>{h.host_dept || '—'}</td>
                      <td>{h.visits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

const TABS = [['rooms', 'Room utilisation'], ['visitors', 'Visitors']];

export default function Reports() {
  const [tab, setTab] = useState('rooms');
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title">Reports</h1>
      <div className="page-sub">Room utilisation and visitor activity over time.</div>

      <div className="btn-row section-gap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {TABS.map(([t, label]) => (
          <button key={t} className={'btn btn-sm ' + (tab === t ? 'btn-dark' : 'btn-ghost')} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {tab === 'rooms' ? <RoomUtilisation /> : <VisitorReport />}
    </div>
  );
}

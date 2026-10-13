import React, { useEffect, useState } from 'react';
import { api, download } from '../api.js';
import { fmtDateTime, fmtTime, todayStr } from '../util.js';

const RANGES = [['today', 'Today'], ['week', 'This week'], ['month', 'This month']];
const PAGE_SIZE = 50;

const fmtDuration = (m) => {
  if (!m) return '—';
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function VisitorLog({ navigate }) {
  const [range, setRange] = useState('today');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);   // visit_id being checked out
  const [exporting, setExporting] = useState(false);

  const load = () => {
    setData(null); setErr('');
    api.get(`/admin/visitors?range=${range}&page=${page}&limit=${PAGE_SIZE}`)
      .then(setData).catch((e) => setErr(e.message));
  };
  useEffect(load, [range, page]);

  const pickRange = (r) => { setRange(r); setPage(1); };

  async function checkout(visitId) {
    setBusy(visitId); setErr('');
    try {
      await api.patch(`/visitors/${visitId}/checkout`);
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function exportCsv() {
    setExporting(true); setErr('');
    try {
      await download(`/admin/export?range=${range}`, `vivo_visitors_${range}_${todayStr()}.csv`);
    } catch (e) { setErr(e.message); }
    finally { setExporting(false); }
  }

  const pages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Visitor log</h1>
          <div className="page-sub">Everyone who has checked in, with checkout and export.</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={exporting}>
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      <div className="btn-row section-gap">
        {RANGES.map(([r, label]) => (
          <button key={r} className={'btn btn-sm ' + (range === r ? 'btn-dark' : 'btn-ghost')} onClick={() => pickRange(r)}>
            {label}
          </button>
        ))}
      </div>

      {err && <div className="notice notice-err">{err}</div>}
      {!data && !err && <div className="empty">Loading…</div>}
      {data && data.rows.length === 0 && <div className="empty">No visitors for this period.</div>}

      {data && data.rows.length > 0 && (
        <>
          <div className="table-card">
            <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Visitor</th><th>Company</th><th>Type</th><th>Purpose</th>
                  <th>Host</th><th>In</th><th>Out</th><th>Duration</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.visit_id}>
                    <td>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td>
                      <strong>{r.name || '—'}</strong>
                      {r.phone && <div className="muted" style={{ fontSize: 11 }}>{r.phone}</div>}
                    </td>
                    <td>{r.company || '—'}</td>
                    <td>{r.visit_type || '—'}</td>
                    <td style={{ maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.purpose || ''}>{r.purpose || '—'}</td>
                    <td>{r.host_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.check_in ? fmtDateTime(r.check_in) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.check_out ? fmtTime(r.check_out) : '—'}</td>
                    <td>{fmtDuration(r.duration_mins)}</td>
                    <td>
                      {r.check_out
                        ? <span className="badge badge-done">Departed</span>
                        : <span className="badge badge-open">In</span>}
                    </td>
                    <td>
                      {!r.check_out && (
                        <div className="btn-row" style={{ flexWrap: 'nowrap' }}>
                          <button className="btn btn-dark btn-sm" onClick={() => checkout(r.visit_id)} disabled={busy === r.visit_id}>
                            {busy === r.visit_id ? '…' : 'Check out'}
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => navigate('book', { prefillVisit: { visit_id: r.visit_id, name: r.name } })}>
                            Book
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13 }}>
            <span className="muted">{data.total} record{data.total !== 1 ? 's' : ''}</span>
            {pages > 1 && (
              <div className="btn-row">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span className="muted" style={{ alignSelf: 'center' }}>Page {page} of {pages}</span>
                <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

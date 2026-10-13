import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtTime } from '../util.js';

export default function MyVisitors({ navigate }) {
  const [range, setRange] = useState('today');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setRows(null); setErr('');
    api.get(`/staff/my-visitors?range=${range}`).then(setRows).catch((e) => setErr(e.message));
  }, [range]);

  return (
    <div>
      <h1 className="page-title">My visitors</h1>
      <div className="page-sub">People who have checked in to see you.</div>

      <div className="btn-row section-gap">
        {['today', 'week', 'month'].map((r) => (
          <button key={r} className={'btn btn-sm ' + (range === r ? 'btn-dark' : 'btn-ghost')}
            onClick={() => setRange(r)}>
            {r === 'today' ? 'Today' : r === 'week' ? 'This week' : 'This month'}
          </button>
        ))}
      </div>

      {err && <div className="notice notice-err">{err}</div>}
      {!rows && !err && <div className="empty">Loading…</div>}
      {rows && rows.length === 0 && (
        <div className="empty">No visitors yet for this period.</div>
      )}

      {rows && rows.length > 0 && (
        <div className="table-card">
          <table>
            <thead>
              <tr><th>Visitor</th><th>Company</th><th>Type</th><th>Checked in</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.visit_id}>
                  <td><strong>{v.name}</strong></td>
                  <td>{v.company || '—'}</td>
                  <td>{v.visit_type || '—'}</td>
                  <td>{fmtTime(v.check_in)}</td>
                  <td>
                    {v.check_out
                      ? <span className="badge badge-done">Left</span>
                      : <span className="badge badge-open">In</span>}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => navigate('book', { prefillVisit: { visit_id: v.visit_id, name: v.name } })}>
                      Book a room
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate, fmtRange } from '../util.js';

function statusOf(b) {
  if (b.state === 'cancelled') return { label: 'Cancelled', cls: 'badge-done' };
  const now = Date.now();
  const s = new Date(b.start_time).getTime();
  const e = new Date(b.ended_at || b.end_time).getTime();
  if (b.ended_at) return { label: 'Ended', cls: 'badge-done' };
  if (now < s) return { label: 'Upcoming', cls: 'badge-open' };
  if (now >= s && now < e) return { label: 'In progress', cls: 'badge-booked' };
  return { label: 'Ended', cls: 'badge-done' };
}

export default function MyBookings({ navigate }) {
  const [range, setRange] = useState('week');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    setRows(null); setErr('');
    api.get(`/boardrooms/bookings?mine=1&range=${range}`).then(setRows).catch((e) => setErr(e.message));
  };
  useEffect(load, [range]);

  async function act(id, kind) {
    try {
      await api.patch(`/boardrooms/bookings/${id}/${kind}`);
      load();
    } catch (e) { setErr(e.message); }
  }

  async function cancelSeries(seriesId) {
    if (!confirm('Cancel this and all future occurrences of the recurring booking?')) return;
    try {
      const res = await api.patch(`/boardrooms/series/${seriesId}/cancel`);
      setErr('');
      alert(`Cancelled ${res.cancelledOccurrences} upcoming occurrence(s).`);
      load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div>
      <h1 className="page-title">My bookings</h1>
      <div className="page-sub">Rooms you’ve reserved.</div>

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
        <div className="empty">
          No bookings yet. <button className="btn btn-ghost btn-sm" onClick={() => navigate('book')}>Book a room</button>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((b) => {
            const st = statusOf(b);
            const active = st.label === 'Upcoming' || st.label === 'In progress';
            return (
              <div key={b.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <strong className="serif" style={{ fontSize: 15 }}>{b.room_name}</strong>
                    <span className={'badge ' + st.cls}>{st.label}</span>
                    {b.recurrence_id && <span className="badge badge-repeat">Repeats</span>}
                  </div>
                  <div style={{ fontSize: 13 }}>{b.purpose || 'Meeting'}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {fmtDate(b.start_time)} · {fmtRange(b.start_time, b.end_time)} · {b.attendee_count} attendees
                  </div>
                </div>
                {active && (
                  <div className="btn-row" style={{ alignItems: 'flex-start' }}>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => navigate('book', { rescheduleBooking: b, roomName: b.room_name })}>Reschedule</button>
                    {st.label === 'In progress' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => act(b.id, 'end-early')}>End early</button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => act(b.id, 'cancel')}>Cancel</button>
                    {b.recurrence_id && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancelSeries(b.recurrence_id)}>Cancel series</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

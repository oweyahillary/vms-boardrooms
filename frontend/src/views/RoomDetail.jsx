import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { fmtTime, fmtRange, toISO, todayStr, hm } from '../util.js';

const DAY_START = '08:00';
const DAY_END = '19:00';
const AXIS = ['8am', '10am', '12pm', '2pm', '4pm', '6pm'];

function buildSegments(bookings, room, date) {
  const ws = Date.parse(toISO(date, DAY_START));
  const we = Date.parse(toISO(date, DAY_END));
  const graceMs = (room.grace_minutes || 0) * 60000;
  const segs = [];
  let cursor = ws;
  const sorted = [...bookings].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  for (const b of sorted) {
    let s = Date.parse(b.start_time);
    let e = Date.parse(b.ended_at || b.end_time);
    let g = e + graceMs;
    if (e <= ws || s >= we) continue;
    s = Math.max(s, ws); e = Math.min(e, we); g = Math.min(g, we);
    if (s > cursor) segs.push({ type: 'free', from: cursor, to: s });
    if (e > s) segs.push({ type: 'busy', from: s, to: e, booking: b });
    if (g > e) segs.push({ type: 'grace', from: e, to: g });
    cursor = Math.max(cursor, g);
  }
  if (cursor < we) segs.push({ type: 'free', from: cursor, to: we });
  return { segs, ws, we, span: we - ws };
}

function Countdown({ to }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, Date.parse(to) - Date.now());
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return <span>{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>;
}

export default function RoomDetail({ navigate, roomId, user }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const date = todayStr();
  const timer = useRef();

  const load = () => api.get(`/boardrooms/rooms/${roomId}/schedule?date=${date}`)
    .then(setData).catch((e) => setErr(e.message));

  useEffect(() => {
    load();
    // light auto-refresh so status/countdown stay honest
    timer.current = setInterval(load, 30000);
    return () => clearInterval(timer.current);
  }, [roomId]);

  if (err) return <div className="notice notice-err">{err}</div>;
  if (!data) return <div className="empty">Loading…</div>;

  const { room, bookings, status, current, nextFree } = data;
  const { segs, ws, span } = buildSegments(bookings, room, date);
  const canBook = user.role !== 'readonly';
  const owns = (b) => b.booked_by === user.id || user.role === 'superadmin';
  const nowPct = (() => {
    const now = Date.now();
    if (now < ws || now > ws + span) return null;
    return ((now - ws) / span) * 100;
  })();

  const bookAt = (fromMs) => navigate('book', { prefillRoomId: room.id, prefillStart: hm(fromMs) });

  async function act(id, kind) {
    try { await api.patch(`/boardrooms/bookings/${id}/${kind}`); load(); }
    catch (e) { setErr(e.message); }
  }

  const upcoming = bookings.filter((b) => Date.parse(b.end_time) > Date.now() && b.id !== current?.id);

  return (
    <div style={{ maxWidth: 720 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('rooms')} style={{ marginBottom: 14 }}>← Boardrooms</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">{room.name}</h1>
          <div className="page-sub">seats {room.capacity} · min {room.min_attendees} attendees{room.purpose_tag ? ` · ${room.purpose_tag}` : ''}</div>
        </div>
        <span className={'badge badge-' + status}>
          {status === 'open' ? 'Open now' : status === 'grace' ? 'Resetting' : status === 'ending' ? 'Ending soon' : 'In use'}
        </span>
      </div>

      {/* Current meeting */}
      {current && (
        <div className="card section-gap">
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>Current meeting</div>
          <div className="serif" style={{ fontSize: 17, margin: '4px 0 6px' }}>{current.purpose || 'Meeting'}</div>
          <div style={{ fontSize: 13 }}>until {fmtTime(current.end_time)} · {current.minsLeft} min left</div>
          {owns(current) && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('book', { rescheduleBooking: bookings.find((b) => b.id === current.id), roomName: room.name })}>Reschedule</button>
              <button className="btn btn-ghost btn-sm" onClick={() => act(current.id, 'end-early')}>End early</button>
              <button className="btn btn-danger btn-sm" onClick={() => act(current.id, 'cancel')}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Grace countdown */}
      {status === 'grace' && nextFree && (
        <div className="card section-gap" style={{ textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 12 }}>Free again in</div>
          <div className="serif" style={{ fontSize: 34, color: 'var(--muted)', margin: '4px 0' }}><Countdown to={nextFree} /></div>
          <div className="muted" style={{ fontSize: 12 }}>bookable at {fmtTime(nextFree)}</div>
        </div>
      )}

      {/* Timeline strip */}
      <div className="card section-gap">
        <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Today’s schedule</div>
        <div style={{ position: 'relative', display: 'flex', height: 44, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {segs.map((seg, i) => {
            const grow = (seg.to - seg.from);
            const common = { flexGrow: grow, flexBasis: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, overflow: 'hidden', whiteSpace: 'nowrap', padding: '0 4px' };
            if (seg.type === 'busy')
              return <div key={i} title={seg.booking.purpose || 'Meeting'} style={{ ...common, background: 'var(--accent)', color: '#fff' }}>{grow / 60000 >= 45 ? (seg.booking.purpose || 'Meeting') : ''}</div>;
            if (seg.type === 'grace')
              return <div key={i} title="Reset buffer" style={{ ...common, background: 'var(--surface2)', color: 'var(--muted)' }}>{grow / 60000 >= 30 ? 'grace' : ''}</div>;
            return <div key={i} onClick={canBook ? () => bookAt(seg.from) : undefined}
              style={{ ...common, background: '#e4efd6', color: '#2e5a3a', cursor: canBook ? 'pointer' : 'default' }}>{grow / 60000 >= 30 ? 'free' : ''}</div>;
          })}
          {nowPct != null && (
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${nowPct}%`, width: 2, background: 'var(--green-dark)' }} title="now" />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
          {AXIS.map((a) => <span key={a}>{a}</span>)}
        </div>
      </div>

      {canBook && (
        <button className="btn btn-primary btn-block section-gap" onClick={() => navigate('book', { prefillRoomId: room.id })}>
          Book a time in this boardroom
        </button>
      )}

      {/* Later today */}
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Booked today</div>
      {bookings.length === 0 && <div className="empty">Nothing booked today.</div>}
      {bookings.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {bookings.map((b) => (
            <div key={b.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{b.purpose || 'Meeting'}</div>
                <div className="muted" style={{ fontSize: 12 }}>{fmtRange(b.start_time, b.end_time)} · {b.attendee_count} attendees · {b.booked_by_name}</div>
              </div>
              {owns(b) && Date.parse(b.end_time) > Date.now() && !b.ended_at && (
                <div className="btn-row">
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('book', { rescheduleBooking: b, roomName: room.name })}>Reschedule</button>
                  <button className="btn btn-danger btn-sm" onClick={() => act(b.id, 'cancel')}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

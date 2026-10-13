import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtTime } from '../util.js';

const STATUS_LABEL = { open: 'Open now', booked: 'In use', ending: 'Ending soon', grace: 'Resetting' };
const BADGE = { open: 'badge-open', booked: 'badge-booked', ending: 'badge-ending', grace: 'badge-grace' };

export default function Rooms({ navigate, user }) {
  const [rooms, setRooms] = useState(null);
  const [err, setErr] = useState('');
  const canBook = user.role !== 'readonly';

  const load = () => {
    setErr('');
    api.get('/boardrooms/rooms').then(setRooms).catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  return (
    <div>
      <h1 className="page-title">Rooms</h1>
      <div className="page-sub">Live availability across the boardrooms.</div>

      {err && <div className="notice notice-err">{err}</div>}
      {!rooms && !err && <div className="empty">Loading…</div>}
      {rooms && rooms.length === 0 && <div className="empty">No rooms have been set up yet.</div>}

      {rooms && rooms.length > 0 && (
        <div className="grid">
          {rooms.map((r) => (
            <div key={r.id} className={`card room-card ${r.status}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <button
                  className="room-name serif"
                  onClick={() => navigate('detail', { roomId: r.id })}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit' }}
                >
                  {r.name}
                </button>
                <span className={'badge ' + BADGE[r.status]}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div className="room-meta">seats {r.capacity} · min {r.min_attendees}{r.purpose_tag ? ` · ${r.purpose_tag}` : ''}</div>
              <div className="room-status">
                {r.status === 'booked' || r.status === 'ending'
                  ? `${r.current?.purpose || 'Meeting'} · until ${fmtTime(r.current?.end_time)}${r.status === 'ending' ? ` (${r.current?.minsLeft} min left)` : ''}`
                  : r.status === 'grace'
                    ? `Free again at ${fmtTime(r.nextFree)}`
                    : 'Available to book'}
              </div>
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={!canBook}
                  onClick={() => navigate('book', { prefillRoomId: r.id })}
                >
                  {canBook ? 'Book' : 'View only'}
                </button>
                <button className="btn btn-ghost" onClick={() => navigate('detail', { roomId: r.id })}>Schedule</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

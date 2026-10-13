import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const blank = { name: '', capacity: 8, min_attendees: 3, purpose_tag: '', grace_minutes: 30, is_active: true };

export default function RoomAdmin() {
  const [rooms, setRooms] = useState(null);
  const [editing, setEditing] = useState(null); // room object or blank
  const [msg, setMsg] = useState(null);

  const load = () => api.get('/boardrooms/rooms?all=1').then(setRooms).catch((e) => setMsg({ type: 'err', text: e.message }));
  useEffect(() => { load(); }, []);

  async function save() {
    setMsg(null);
    try {
      const body = {
        name: editing.name, capacity: Number(editing.capacity),
        min_attendees: Number(editing.min_attendees), purpose_tag: editing.purpose_tag,
        grace_minutes: Number(editing.grace_minutes), is_active: editing.is_active,
      };
      if (editing.id) await api.put(`/boardrooms/rooms/${editing.id}`, body);
      else await api.post('/boardrooms/rooms', body);
      setEditing(null); load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
  }

  async function remove(r) {
    if (!confirm(`Delete ${r.name}? Rooms with bookings are deactivated instead.`)) return;
    try { await api.del(`/boardrooms/rooms/${r.id}`); load(); }
    catch (e) { setMsg({ type: 'err', text: e.message }); }
  }

  if (editing) {
    const e = editing;
    const set = (k, v) => setEditing({ ...e, [k]: v });
    return (
      <div style={{ maxWidth: 520 }}>
        <h1 className="page-title">{e.id ? 'Edit room' : 'New room'}</h1>
        <div className="page-sub">&nbsp;</div>
        {msg && <div className="notice notice-err">{msg.text}</div>}
        <div className="card">
          <div className="field"><label>Room name</label>
            <input value={e.name} onChange={(x) => set('name', x.target.value)} /></div>
          <div className="row2">
            <div className="field"><label>Capacity</label>
              <input type="number" min="1" value={e.capacity} onChange={(x) => set('capacity', x.target.value)} /></div>
            <div className="field"><label>Minimum attendees</label>
              <input type="number" min="1" value={e.min_attendees} onChange={(x) => set('min_attendees', x.target.value)} />
              <div className="hint">Bookings below this are flagged, not blocked.</div></div>
          </div>
          <div className="field"><label>Purpose tag</label>
            <input value={e.purpose_tag || ''} placeholder="e.g. Client meetings" onChange={(x) => set('purpose_tag', x.target.value)} /></div>
          <div className="field"><label>Grace period (minutes)</label>
            <input type="number" min="0" value={e.grace_minutes} onChange={(x) => set('grace_minutes', x.target.value)} />
            <div className="hint">Buffer to reset the room after each meeting.</div></div>
          <div className="field">
            <label>Availability</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: 14 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={e.is_active} onChange={(x) => set('is_active', x.target.checked)} />
              Room is active and bookable
            </label>
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={save}>{e.id ? 'Save changes' : 'Create room'}</button>
            <button className="btn btn-ghost" onClick={() => { setEditing(null); setMsg(null); }}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Manage rooms</h1>
          <div className="page-sub">Add, edit or retire boardrooms.</div>
        </div>
        <button className="btn btn-dark" onClick={() => setEditing({ ...blank })}>+ New room</button>
      </div>

      {msg && <div className="notice notice-err">{msg.text}</div>}
      {!rooms && <div className="empty">Loading…</div>}
      {rooms && rooms.length === 0 && <div className="empty">No rooms yet — add your first.</div>}

      {rooms && rooms.length > 0 && (
        <div className="table-card">
          <table>
            <thead><tr><th>Room</th><th>Capacity</th><th>Min</th><th>Grace</th><th>Tag</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.capacity}</td>
                  <td>{r.min_attendees}</td>
                  <td>{r.grace_minutes}m</td>
                  <td>{r.purpose_tag || '—'}</td>
                  <td>{r.is_active ? <span className="badge badge-open">Active</span> : <span className="badge badge-done">Inactive</span>}</td>
                  <td>
                    <div className="btn-row">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...r })}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Delete</button>
                    </div>
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

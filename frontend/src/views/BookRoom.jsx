import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { toISO, todayStr, addMinutesHM, hm } from '../util.js';

export default function BookRoom({ navigate, prefillRoomId, prefillVisit, prefillStart, rescheduleBooking, roomName }) {
  const isReschedule = !!rescheduleBooking;

  const [rooms, setRooms] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [roomId, setRoomId] = useState(
    isReschedule ? rescheduleBooking.room_id : (prefillRoomId || '')
  );
  const [date, setDate] = useState(
    isReschedule ? hm(rescheduleBooking.start_time) && rescheduleBooking.start_time.slice(0, 10) : todayStr()
  );
  const [start, setStart] = useState(
    isReschedule ? hm(rescheduleBooking.start_time) : (prefillStart || '09:00')
  );
  const [end, setEnd] = useState(
    isReschedule ? hm(rescheduleBooking.end_time) : (prefillStart ? addMinutesHM(prefillStart, 60) : '10:00')
  );
  const [purpose, setPurpose] = useState(isReschedule ? (rescheduleBooking.purpose || '') : '');
  const [attendeeCount, setAttendeeCount] = useState(isReschedule ? rescheduleBooking.attendee_count : 3);
  const [attendees, setAttendees] = useState(prefillVisit ? [prefillVisit] : []);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // ── Recurrence ──
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState([]);           // 0=Sun … 6=Sat
  const [endType, setEndType] = useState('count');
  const [endCount, setEndCount] = useState(10);
  const [endDate, setEndDate] = useState('');
  const DAY_PILLS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
  const toggleDay = (d) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
  const enableRepeat = (on) => {
    setRepeat(on);
    if (on && days.length === 0) {
      // preselect the weekday of the chosen date
      setDays([new Date(`${date}T00:00:00Z`).getUTCDay()]);
    }
  };

  useEffect(() => {
    api.get('/boardrooms/rooms').then((rs) => {
      setRooms(rs);
      if (!roomId && rs.length) setRoomId(rs[0].id);
    }).catch(() => {});
    if (!isReschedule) api.get('/staff/my-visitors?range=today').then(setVisitors).catch(() => {});
  }, []);

  const room = useMemo(() => rooms.find((r) => String(r.id) === String(roomId)), [rooms, roomId]);

  const addAttendee = (v) => {
    if (attendees.some((a) => a.visit_id === v.visit_id)) return;
    setAttendees([...attendees, { visit_id: v.visit_id, name: v.name }]);
  };
  const removeAttendee = (id) => setAttendees(attendees.filter((a) => a.visit_id !== id));
  const availableVisitors = visitors.filter((v) => !attendees.some((a) => a.visit_id === v.visit_id));

  async function submit() {
    setMsg(null);
    if (!roomId) return setMsg({ type: 'err', text: 'Pick a room first.' });
    if (toISO(date, end) <= toISO(date, start))
      return setMsg({ type: 'err', text: 'End time must be after the start time.' });
    setBusy(true);
    try {
      if (isReschedule) {
        await api.patch(`/boardrooms/bookings/${rescheduleBooking.id}/reschedule`, {
          startTime: toISO(date, start), endTime: toISO(date, end),
        });
        setMsg({ type: 'ok', text: 'Rescheduled. Redirecting…' });
        setTimeout(() => navigate('bookings'), 1100);
      } else if (repeat) {
        if (days.length === 0) { setBusy(false); return setMsg({ type: 'err', text: 'Pick at least one day to repeat on.' }); }
        if (endType === 'date' && (!endDate || endDate < date)) { setBusy(false); return setMsg({ type: 'err', text: 'End date must be on or after the first date.' }); }
        const res = await api.post('/boardrooms/series', {
          roomId: Number(roomId), purpose, firstDate: date,
          startHm: start, endHm: end, attendeeCount: Number(attendeeCount),
          daysOfWeek: days, endType,
          endCount: endType === 'count' ? Number(endCount) : undefined,
          endDate: endType === 'date' ? endDate : undefined,
        });
        const skipNote = res.skipped?.length
          ? ` ${res.skipped.length} skipped for clashes (${res.skipped.join(', ')}).` : '';
        setMsg({ type: 'ok', text: `Created ${res.created} occurrence${res.created === 1 ? '' : 's'}.${skipNote} Redirecting…` });
        setTimeout(() => navigate('bookings'), skipNote ? 2600 : 1200);
      } else {
        const res = await api.post('/boardrooms/bookings', {
          roomId: Number(roomId), purpose,
          startTime: toISO(date, start), endTime: toISO(date, end),
          attendeeCount: Number(attendeeCount),
          visitIds: attendees.map((a) => a.visit_id),
        });
        const flag = res.belowMinimum ? ' (below this room’s minimum — flagged)' : '';
        setMsg({ type: 'ok', text: `Booked${flag}. Redirecting…` });
        setTimeout(() => navigate('bookings'), 1100);
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="page-title">{isReschedule ? 'Reschedule booking' : 'Book a room'}</h1>
      <div className="page-sub">
        {isReschedule ? `Move your booking in ${roomName || 'this room'} to a new time.` : 'Reserve a boardroom and add who’s joining.'}
      </div>

      {msg && <div className={'notice ' + (msg.type === 'ok' ? 'notice-ok' : 'notice-err')}>{msg.text}</div>}

      <div className="card">
        <div className="field">
          <label>Room</label>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={isReschedule}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name} — seats {r.capacity}</option>
            ))}
          </select>
          {room && <div className="hint">Minimum {room.min_attendees} attendees · {room.grace_minutes}-min reset buffer after each meeting.</div>}
        </div>

        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="row2">
          <div className="field">
            <label>Start</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label>End</label>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        {!isReschedule && (
          <>
            <div className="field">
              <label>Purpose</label>
              <input type="text" value={purpose} placeholder="e.g. Quarterly review with Acme"
                onChange={(e) => setPurpose(e.target.value)} />
            </div>

            <div className="field">
              <label>Attendees</label>
              <input type="number" min="1" value={attendeeCount} onChange={(e) => setAttendeeCount(e.target.value)} />
              {room && <div className="hint">Room capacity: {room.capacity}</div>}
            </div>

            {/* ── Repeat / recurrence ── */}
            <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontWeight: 600, fontSize: 14 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={repeat} onChange={(e) => enableRepeat(e.target.checked)} />
                Repeat this meeting
              </label>
            </div>

            {repeat && (
              <>
                <div className="field">
                  <label>Repeat on</label>
                  <div className="day-pills">
                    {DAY_PILLS.map(([lbl, d]) => (
                      <button key={d} type="button"
                        className={'day-pill' + (days.includes(d) ? ' selected' : '')}
                        onClick={() => toggleDay(d)}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <div className="row2">
                  <div className="field">
                    <label>Ends</label>
                    <select value={endType} onChange={(e) => setEndType(e.target.value)}>
                      <option value="count">After N occurrences</option>
                      <option value="date">On a date</option>
                      <option value="never">Never (until cancelled)</option>
                    </select>
                  </div>
                  <div className="field">
                    {endType === 'count' && (<>
                      <label>Occurrences</label>
                      <input type="number" min="1" value={endCount} onChange={(e) => setEndCount(e.target.value)} />
                    </>)}
                    {endType === 'date' && (<>
                      <label>End date</label>
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </>)}
                    {endType === 'never' && (<>
                      <label>&nbsp;</label>
                      <div className="hint">Rolls forward automatically. Cancel any time.</div>
                    </>)}
                  </div>
                </div>
                <div className="hint" style={{ marginBottom: 14 }}>
                  Occurrences that clash with an existing booking are skipped and reported.
                </div>
              </>
            )}

            {!repeat && (
            <div className="field">
              <label>Visitors joining</label>
              {attendees.length === 0 && <div className="hint">Add any of today’s visitors who are attending.</div>}
              {attendees.length > 0 && (
                <div className="chips">
                  {attendees.map((a) => (
                    <span key={a.visit_id} className="chip">
                      {a.name}
                      <button onClick={() => removeAttendee(a.visit_id)} aria-label="Remove">×</button>
                    </span>
                  ))}
                </div>
              )}
              {availableVisitors.length > 0 && (
                <select value="" onChange={(e) => {
                  const v = visitors.find((x) => String(x.visit_id) === e.target.value);
                  if (v) addAttendee(v);
                }} style={{ marginTop: 8 }}>
                  <option value="">+ Add a visitor…</option>
                  {availableVisitors.map((v) => (
                    <option key={v.visit_id} value={v.visit_id}>{v.name}{v.company ? ` — ${v.company}` : ''}</option>
                  ))}
                </select>
              )}
            </div>
            )}
          </>
        )}

        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : isReschedule ? 'Confirm new time' : 'Confirm booking'}
        </button>
      </div>
    </div>
  );
}

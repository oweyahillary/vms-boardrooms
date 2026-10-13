const TZ = 'Africa/Nairobi';
const opts = { timeZone: TZ };

export const fmtTime = (t) =>
  t ? new Date(t).toLocaleTimeString('en-KE', { ...opts, hour: '2-digit', minute: '2-digit' }) : '';

export const fmtDate = (t) =>
  t ? new Date(t).toLocaleDateString('en-KE', { ...opts, weekday: 'short', day: 'numeric', month: 'short' }) : '';

export const fmtDateTime = (t) => (t ? `${fmtDate(t)} · ${fmtTime(t)}` : '');

export const fmtRange = (a, b) => `${fmtTime(a)} – ${fmtTime(b)}`;

// Build an ISO string in Kenya time (+03:00) from date + HH:MM inputs.
export const toISO = (date, time) => `${date}T${time}:00+03:00`;

export const todayStr = () => {
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// 24h HH:MM in Nairobi from an ISO string or ms timestamp.
export const hm = (t) =>
  new Date(t).toLocaleTimeString('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hour12: false });

// add minutes to an "HH:MM" string, clamped to 23:59
export const addMinutesHM = (time, mins) => {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 60))}:${p(total % 60)}`;
};

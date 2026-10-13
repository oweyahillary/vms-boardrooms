import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDateTime } from '../util.js';

const ICON = {
  visitor_waiting: '👤',
  occurrence_skipped: '⚠️',
  starting_soon: '⏰',
  ending_soon: '⏳',
};

export default function Notifications({ navigate, onRead }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/boardrooms/notifications')
      .then((d) => {
        setItems(d.items);
        // mark stored ones read once viewed
        if (d.unread > 0) api.post('/boardrooms/notifications/read').then(() => onRead && onRead()).catch(() => {});
        else onRead && onRead();
      })
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 className="page-title">Notifications</h1>
      <div className="page-sub">Visitor arrivals, meeting reminders and booking alerts.</div>

      {err && <div className="notice notice-err">{err}</div>}
      {!items && !err && <div className="empty">Loading…</div>}
      {items && items.length === 0 && <div className="empty">You’re all caught up.</div>}

      {items && items.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((n) => (
            <div key={n.id} className="card"
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: n.read ? '1px solid var(--border)' : '3px solid var(--accent)',
                cursor: n.link ? 'pointer' : 'default' }}
              onClick={() => n.link && navigate(n.link)}>
              <div style={{ fontSize: 20 }}>{ICON[n.type] || '🔔'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{n.title}</div>
                {n.body && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{n.body}</div>}
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{fmtDateTime(n.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

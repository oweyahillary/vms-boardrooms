import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDateTime } from '../util.js';

const ROLES = [
  ['staff', 'Staff'], ['manager', 'Manager'], ['security', 'Security'],
  ['readonly', 'Read only'], ['superadmin', 'Super admin'],
];
const STATUS_BADGE = { active: 'badge-open', invited: 'badge-flag', disabled: 'badge-done' };
const roleBadge = (r) => (r === 'superadmin' ? 'badge-booked' : r === 'manager' ? 'badge-repeat' : 'badge-done');

// One screen for both employee accounts and pending invitations.
// panel === null shows the list; otherwise a focused form:
//   {mode:'invite'} {mode:'create'} {mode:'edit',user} {mode:'reset',user}
export default function Users({ user }) {
  const [users, setUsers] = useState(null);
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/admin/users').then(setUsers).catch((e) => setMsg({ type: 'err', text: e.message }));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const copy = () => { try { navigator.clipboard?.writeText(link); } catch { /* ignore */ } };

  function open(mode, u) {
    setMsg(null); setLink('');
    if (mode === 'invite')      setForm({ name: '', email: '', role: 'staff', department: '' });
    else if (mode === 'create') setForm({ name: '', email: '', password: '', role: 'staff' });
    else if (mode === 'edit')   setForm({ name: u.name, role: u.role, is_active: u.is_active });
    else if (mode === 'reset')  setForm({ password: '' });
    setPanel({ mode, user: u });
  }
  const close = () => { setPanel(null); setForm({}); };

  async function resend(u) {
    setMsg(null); setLink('');
    try {
      const res = await api.post(`/admin/users/${u.id}/resend`, {});
      setLink(res.inviteLink);
      setMsg({ type: 'ok', text: `New invite link for ${u.name} — expires in 7 days.` });
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
  }

  async function submit() {
    setMsg(null);
    const { mode, user: target } = panel;
    try {
      setBusy(true);
      if (mode === 'invite') {
        if (!form.name || !form.email) throw new Error('Name and email are required.');
        const res = await api.post('/admin/users/invite', form);
        setLink(res.inviteLink);
        setMsg({ type: 'ok', text: `Invite created for ${res.user.name}. Share the link below — it expires in 7 days.` });
        setForm({ name: '', email: '', role: 'staff', department: '' });
        load();
      } else if (mode === 'create') {
        if (!form.name || !form.email || !form.password) throw new Error('All fields are required.');
        if (form.password.length < 8) throw new Error('Password must be at least 8 characters.');
        await api.post('/admin/users', form);
        setMsg({ type: 'ok', text: `${form.name} added.` });
        load(); close();
      } else if (mode === 'edit') {
        await api.put(`/admin/users/${target.id}`, {
          name: form.name, role: form.role, is_active: form.is_active,
        });
        load(); close();
      } else if (mode === 'reset') {
        if (!form.password || form.password.length < 8) throw new Error('Password must be at least 8 characters.');
        await api.post(`/admin/users/${target.id}/password`, { password: form.password });
        setMsg({ type: 'ok', text: `Password reset for ${target.name}.` });
        close();
      }
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setBusy(false); }
  }

  // ── Focused forms ──────────────────────────────────────
  if (panel) {
    const { mode, user: target } = panel;
    const title = { invite: 'Invite user', create: 'Add user', edit: `Edit ${target?.name}`, reset: `Reset password — ${target?.name}` }[mode];
    const isSelf = mode === 'edit' && target?.id === user?.id;
    return (
      <div style={{ maxWidth: 520 }}>
        <h1 className="page-title">{title}</h1>
        <div className="page-sub">
          {mode === 'invite' ? 'They set their own password from the invite link.'
            : mode === 'create' ? 'Creates an active account with a password you choose.'
            : mode === 'reset' ? 'Sets a new password immediately.'
            : 'Change name, role or access.'}
        </div>

        {msg && <div className={'notice ' + (msg.type === 'ok' ? 'notice-ok' : 'notice-err')}>{msg.text}</div>}
        {link && (
          <div className="card section-gap">
            <label>Invite link</label>
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={copy}>Copy link</button>
            </div>
            <div className="hint">Email delivery is coming — for now, send this link to the invitee.</div>
          </div>
        )}

        <div className="card">
          {(mode === 'invite' || mode === 'create') && (<>
            <div className="field"><label>Full name</label>
              <input value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
            <div className="field"><label>Email</label>
              <input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
          </>)}
          {mode === 'create' && (
            <div className="field"><label>Temporary password (min 8)</label>
              <input type="password" value={form.password || ''} onChange={(e) => set('password', e.target.value)} /></div>
          )}
          {mode === 'edit' && (
            <div className="field"><label>Full name</label>
              <input value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
          )}
          {(mode === 'invite' || mode === 'create' || mode === 'edit') && (
            <div className="row2">
              <div className="field"><label>Role</label>
                <select value={form.role} onChange={(e) => set('role', e.target.value)}>
                  {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
              {mode === 'invite' && (
                <div className="field"><label>Department</label>
                  <input value={form.department || ''} placeholder="e.g. Finance" onChange={(e) => set('department', e.target.value)} /></div>
              )}
            </div>
          )}
          {mode === 'edit' && (
            <div className="field">
              <label>Access</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: 14 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={!!form.is_active}
                  disabled={isSelf} onChange={(e) => set('is_active', e.target.checked)} />
                Account is active and can sign in
              </label>
              {isSelf && <div className="hint">You can’t deactivate your own account.</div>}
            </div>
          )}
          {mode === 'reset' && (
            <div className="field"><label>New password (min 8)</label>
              <input type="password" value={form.password || ''} onChange={(e) => set('password', e.target.value)} /></div>
          )}

          <div className="btn-row">
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : mode === 'invite' ? 'Create invite' : mode === 'create' ? 'Add user' : mode === 'reset' ? 'Reset password' : 'Save changes'}
            </button>
            <button className="btn btn-ghost" onClick={close}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // ── List ───────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Users &amp; invites</h1>
          <div className="page-sub">Employee accounts, roles and pending invitations.</div>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => open('create')}>+ Add user</button>
          <button className="btn btn-dark" onClick={() => open('invite')}>Invite user</button>
        </div>
      </div>

      {msg && <div className={'notice ' + (msg.type === 'ok' ? 'notice-ok' : 'notice-err')} style={{ marginTop: 14 }}>{msg.text}</div>}
      {!users && !msg && <div className="empty">Loading…</div>}

      {users && users.length > 0 && (
        <div className="table-card section-gap" style={{ marginTop: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>User</th><th>Role</th><th>Department</th><th>Status</th><th>Last login</th><th></th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>{u.email}</div>
                    </td>
                    <td><span className={'badge ' + roleBadge(u.role)}>{u.role}</span></td>
                    <td>{u.department || '—'}</td>
                    <td><span className={'badge ' + (STATUS_BADGE[u.status] || 'badge-done')}>{u.status}</span></td>
                    <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{u.last_login ? fmtDateTime(u.last_login) : 'Never'}</td>
                    <td>
                      <div className="btn-row" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => open('edit', u)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => open('reset', u)}>Reset PW</button>
                        {u.status === 'invited' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => resend(u)}>Resend</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

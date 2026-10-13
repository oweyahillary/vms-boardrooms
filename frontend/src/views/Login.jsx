import React, { useState } from 'react';
import { api, setSession } from '../api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      const { token, user } = await api.post('/admin/login', { email, password });
      setSession(token, user);
      onLogin(user);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Vivo VMS</h1>
        <div className="sub">Vivo Fashion Group</div>
        {err && <div className="notice notice-err">{err}</div>}
        <div className="field">
          <label>Email</label>
          <input
            type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <button className="btn btn-dark btn-block" onClick={submit} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}

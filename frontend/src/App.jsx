import React, { useEffect, useState, useCallback } from 'react';
import { api, getToken, getUser, clearSession } from './api.js';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import VisitorLog from './views/VisitorLog.jsx';
import MyVisitors from './views/MyVisitors.jsx';
import Rooms from './views/Rooms.jsx';
import RoomDetail from './views/RoomDetail.jsx';
import BookRoom from './views/BookRoom.jsx';
import MyBookings from './views/MyBookings.jsx';
import RoomAdmin from './views/RoomAdmin.jsx';
import Users from './views/Users.jsx';
import Notifications from './views/Notifications.jsx';
import Reports from './views/Reports.jsx';

// Roles allowed into the admin dashboard / visitor log. Mirrors the
// server-side gate in routes/admin.routes.js — the API is the real
// boundary; this just decides what the nav shows and where users land.
const DASHBOARD_ROLES = ['superadmin', 'manager', 'security'];
const canDashboard = (role) => DASHBOARD_ROLES.includes(role);
const landingView = (u) => (u && canDashboard(u.role) ? 'dashboard' : 'rooms');

export default function App() {
  const initialUser = getToken() ? getUser() : null;
  const [user, setUser] = useState(initialUser);
  const [view, setView] = useState(() => landingView(initialUser));
  const [viewProps, setViewProps] = useState({});
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    if (!getToken()) return;
    api.get('/boardrooms/notifications').then((d) => setUnread(d.unread || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshUnread();
    const id = setInterval(refreshUnread, 60000);
    return () => clearInterval(id);
  }, [user, refreshUnread]);

  // Deep link from the visitor log: /app/?book=<visitId>&name=<name>
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const bookVisit = params.get('book');
    if (bookVisit) {
      const name = params.get('name') || 'Visitor';
      setViewProps({ prefillVisit: { visit_id: Number(bookVisit), name } });
      setView('book');
      window.history.replaceState({}, '', '/app/');
    }
  }, [user]);

  if (!user) return <Login onLogin={(u) => { setUser(u); setView(landingView(u)); }} />;

  const navigate = (v, props = {}) => { setViewProps(props); setView(v); };
  const isSuper = user.role === 'superadmin';
  const isManager = isSuper || user.role === 'manager';
  const showDash = canDashboard(user.role);
  const activeNav = view === 'detail' ? 'rooms' : view;

  // Grouped, role-gated navigation. Items a role can't use are never
  // rendered (and the API rejects them anyway).
  const navGroups = [
    showDash && { label: 'Overview', items: [
      { id: 'dashboard',  label: 'Dashboard',   icon: '📊' },
      { id: 'visitorlog', label: 'Visitor log', icon: '📋' },
    ] },
    { label: 'My work', items: [
      { id: 'visitors',      label: 'My visitors',   icon: '👥' },
      { id: 'bookings',      label: 'My bookings',   icon: '🗓️' },
      { id: 'notifications', label: 'Notifications', icon: '🔔', badge: unread },
    ] },
    { label: 'Boardrooms', items: [
      { id: 'rooms', label: 'Boardrooms', icon: '🏢' },
    ] },
    isManager && { label: 'Admin', items: [
      { id: 'reports', label: 'Reports', icon: '📈' },
      ...(isSuper ? [
        { id: 'roomadmin', label: 'Manage boardrooms',   icon: '⚙️' },
        { id: 'users',     label: 'Users & invites', icon: '🔐' },
      ] : []),
    ] },
  ].filter(Boolean);

  const views = {
    dashboard:     <Dashboard />,
    visitorlog:    <VisitorLog navigate={navigate} />,
    rooms:         <Rooms navigate={navigate} user={user} />,
    detail:        <RoomDetail navigate={navigate} user={user} {...viewProps} />,
    book:          <BookRoom navigate={navigate} {...viewProps} />,
    visitors:      <MyVisitors navigate={navigate} />,
    bookings:      <MyBookings navigate={navigate} />,
    notifications: <Notifications navigate={navigate} onRead={refreshUnread} />,
    reports:       <Reports />,
    roomadmin:     <RoomAdmin />,
    users:         <Users user={user} />,
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-title">Vivo VMS</div>
          <div className="sidebar-logo-sub">Vivo Fashion Group</div>
        </div>
        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((n) => (
                <button key={n.id} className={'nav-item' + (activeNav === n.id ? ' active' : '')} onClick={() => navigate(n.id)}>
                  <span className="nav-icon">{n.icon}</span>
                  <span style={{ flex: 1 }}>{n.label}</span>
                  {n.badge > 0 && <span className="nav-count">{n.badge}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{user.name}</strong>
            {user.role}
          </div>
          <button className="logout-btn" onClick={() => { clearSession(); setUser(null); }}>Sign out</button>
        </div>
      </aside>
      <main className="main">{views[view]}</main>
    </div>
  );
}

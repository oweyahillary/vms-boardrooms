import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { api } from '../api.js';

const RANGES = [['today', 'Today'], ['week', 'This week'], ['month', 'This month']];
const RANGE_NOUN = { today: 'today', week: 'last 7 days', month: 'last 30 days' };

// App palette (kept in sync with styles.css tokens).
const COL = {
  accent: '#c8593a', accent2: '#a0401f', green: '#2e5a3a',
  muted: '#8a7e72', border: '#e0d9cf',
};
const PIE = ['#c8593a', '#2e5a3a', '#b7791f', '#8a7e72', '#d17a53', '#1a6632', '#e0a488'];

// Thin React wrapper around a Chart.js instance. Rebuilds when its inputs
// change and always destroys the old chart to avoid canvas leaks.
function ChartCanvas({ type, data, options, height = 220 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return undefined;
    chartRef.current = new Chart(canvasRef.current, { type, data, options });
    return () => chartRef.current?.destroy();
  }, [type, data, options]);
  return <div style={{ position: 'relative', height }}><canvas ref={canvasRef} /></div>;
}

function Stat({ label, value, sub }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div className="serif" style={{ fontSize: 26, marginTop: 2 }}>{value}</div>
      {sub != null && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

const NO_LEGEND = { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, maintainAspectRatio: false };

export default function Dashboard() {
  const [range, setRange] = useState('today');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setD(null); setErr('');
    Promise.all([
      api.get(`/admin/stats?range=${range}`),
      api.get(`/admin/hourly?range=${range}`),
      api.get(`/admin/by-type?range=${range}`),
      api.get(`/admin/trend?range=${range === 'month' ? 'month' : 'week'}`),
      api.get(`/admin/top-hosts?range=${range}`),
    ])
      .then(([stats, hourly, byType, trend, topHosts]) =>
        setD({ stats, hourly, byType, trend, topHosts }))
      .catch((e) => setErr(e.message));
  }, [range]);

  const hourlyChart = d && {
    labels: d.hourly.map((h) => `${String(h.hour).padStart(2, '0')}:00`),
    datasets: [{ label: 'Visitors', data: d.hourly.map((h) => h.count), backgroundColor: COL.accent, borderRadius: 3 }],
  };
  const typeChart = d && {
    labels: d.byType.map((t) => t.visit_type || 'Unspecified'),
    datasets: [{ data: d.byType.map((t) => Number(t.count)), backgroundColor: PIE, borderWidth: 0 }],
  };
  const trendChart = d && {
    labels: d.trend.map((t) => new Date(t.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })),
    datasets: [{
      label: 'Visits', data: d.trend.map((t) => Number(t.count)),
      borderColor: COL.green, backgroundColor: 'rgba(46,90,58,.12)', fill: true, tension: 0.3, pointRadius: 3,
    }],
  };

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <div className="page-sub">Reception activity across Vivo Fashion Group.</div>

      <div className="btn-row section-gap">
        {RANGES.map(([r, label]) => (
          <button key={r} className={'btn btn-sm ' + (range === r ? 'btn-dark' : 'btn-ghost')} onClick={() => setRange(r)}>
            {label}
          </button>
        ))}
      </div>

      {err && <div className="notice notice-err">{err}</div>}
      {!d && !err && <div className="empty">Loading…</div>}

      {d && (
        <>
          <div className="grid section-gap" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Stat label="Inside now" value={d.stats.active} sub="currently checked in" />
            <Stat label={`Visits ${RANGE_NOUN[range]}`} value={d.stats.total} />
            <Stat label="Avg stay" value={d.stats.avgDuration ? `${d.stats.avgDuration}m` : '—'} sub="checked-out visits" />
            <Stat label="Peak hour" value={d.stats.peakHour} sub={d.stats.peakCount ? `${d.stats.peakCount} visits` : null} />
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div className="card">
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Visitors by hour</div>
              <ChartCanvas type="bar" data={hourlyChart} options={NO_LEGEND} height={200} />
            </div>
            <div className="card">
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Visit types</div>
              {d.byType.length === 0
                ? <div className="empty">No visits in this period.</div>
                : <ChartCanvas type="doughnut" data={typeChart} options={{ plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 } } } }, maintainAspectRatio: false }} height={200} />}
            </div>
          </div>

          <div className="card section-gap">
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Visits trend</div>
            <ChartCanvas type="line" data={trendChart} options={NO_LEGEND} height={200} />
          </div>

          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Top hosts</div>
          {d.topHosts.length === 0 && <div className="empty">No hosts recorded in this period.</div>}
          {d.topHosts.length > 0 && (
            <div className="table-card">
              <table>
                <thead><tr><th>Host</th><th>Department</th><th>Visits</th></tr></thead>
                <tbody>
                  {d.topHosts.map((h, i) => (
                    <tr key={i}>
                      <td><strong>{h.host_name}</strong></td>
                      <td>{h.host_dept || '—'}</td>
                      <td>{h.visits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="hint" style={{ marginTop: 12 }}>
            Data quality: {d.stats.unsigned} unsigned · {d.stats.noPhoto} without a photo, {RANGE_NOUN[range]}.
          </div>
        </>
      )}
    </div>
  );
}

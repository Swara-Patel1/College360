import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API, SUPABASE_URL, SUPABASE_ANON } from '../../api/client.js';

const StatCard = ({ icon, label, value, sub, color, onClick, loading }) => (
  <div
    className={`admin-stat-card${onClick ? ' clickable' : ''}`}
    style={{ '--card-accent': color }}
    onClick={onClick}
  >
    <div className="stat-card-icon" style={{ background: color + '22', color }}>
      {icon}
    </div>
    <div className="stat-card-body">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">
        {loading ? <span className="stat-skeleton" /> : (value ?? '0')}
      </div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
    {onClick && <div className="stat-card-arrow">→</div>}
  </div>
);

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Use admin/stats route — sequential safe fetches through SupaFetch
    API.get('admin/stats')
      .then(data => setStats(data))
      .catch(e => {
        console.error('Dashboard stats failed:', e);
        setError(String(e?.message || e));
      })
      .finally(() => setLoading(false));
  }, []);

  const fmt     = (n) => n == null ? '0' : Number(n).toLocaleString('en-IN');
  const fmtCurr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <div className="admin-dashboard">
      <div className="admin-dash-header">
        <div>
          <h1 className="admin-dash-title">Admin Dashboard</h1>
          <p className="admin-dash-subtitle">Real-time overview of College360</p>
        </div>
        <div className="admin-dash-badge">
          <span className="live-dot" /> Live
        </div>
      </div>

      {error && (
        <div style={{ background: '#450a0a', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: 10, fontSize: '0.8rem' }}>
          ⚠ Load error: {error}
        </div>
      )}

      {/* ── People ── */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading">👥 People</h2>
        <div className="admin-stat-grid">
          <StatCard icon="🎓" label="Total Students"
            value={fmt(stats?.total_students)}
            sub={stats ? `${fmt(stats.active_users)} active · ${fmt(stats.inactive_users)} inactive` : null}
            color="#6366f1" loading={loading} onClick={() => navigate('/admin/students')} />
          <StatCard icon="🧑‍🏫" label="Total Faculty"
            value={fmt(stats?.total_faculty)}
            sub="Teaching staff"
            color="#0ea5e9" loading={loading} onClick={() => navigate('/admin/faculty')} />
          <StatCard icon="🏛️" label="HOD"
            value={fmt(stats?.total_hod)}
            sub="Heads of Department"
            color="#8b5cf6" loading={loading} onClick={() => navigate('/admin/hod')} />
          <StatCard icon="📚" label="Total Courses"
            value={fmt(stats?.total_courses)}
            sub={`Across ${fmt(stats?.total_departments)} departments`}
            color="#06b6d4" loading={loading} onClick={() => navigate('/admin/courses')} />
        </div>
      </section>

      {/* ── Fees ── */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading">💰 Fees Overview</h2>
        <div className="admin-stat-grid">
          <StatCard icon="✅" label="Fees Collected"
            value={fmtCurr(stats?.total_fees_collected)}
            sub="Paid by students" color="#22c55e" loading={loading} />
          <StatCard icon="⏳" label="Fees Pending Amount"
            value={fmtCurr(stats?.total_fees_pending)}
            sub="Pending payments" color="#f59e0b" loading={loading} />
          <StatCard icon="🚨" label="Students with Fees Due"
            value={fmt(stats?.fees_pending_students)}
            sub="No payment received yet" color="#ef4444" loading={loading}
            onClick={() => navigate('/admin/fees')} />
        </div>
      </section>

      {/* ── Quick Actions ── */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading">⚡ Quick Actions</h2>
        <div className="admin-quick-grid">
          {[
            { icon: '🎓', label: 'Students',    path: '/admin/students',    color: '#6366f1' },
            { icon: '🧑‍🏫', label: 'Faculty',     path: '/admin/faculty',     color: '#0ea5e9' },
            { icon: '🏷️', label: 'HODs',        path: '/admin/hod',         color: '#a855f7' },
            { icon: '📚', label: 'Courses',     path: '/admin/courses',     color: '#06b6d4' },
            { icon: '🏛️', label: 'Departments', path: '/admin/departments', color: '#8b5cf6' },
            { icon: '📝', label: 'Notices',     path: '/admin/notices',     color: '#f59e0b' },
            { icon: '💰', label: 'Fees',        path: '/admin/fees',        color: '#22c55e' },
            { icon: '📅', label: 'Timetable',   path: '/admin/timetable',   color: '#ec4899' },
            { icon: '📊', label: 'Grades',      path: '/admin/grades',      color: '#14b8a6' },
          ].map(({ icon, label, path, color }) => (
            <button key={path} className="admin-quick-btn" style={{ '--btn-color': color }} onClick={() => navigate(path)}>
              <span className="quick-btn-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      <style>{`
        .admin-dashboard { padding: 2rem; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
        .admin-dash-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
        .admin-dash-title { font-size: 1.8rem; font-weight: 800; background: linear-gradient(135deg,#a78bfa,#38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0 0 0.25rem; }
        .admin-dash-subtitle { color: #94a3b8; font-size: 0.9rem; margin: 0; }
        .admin-dash-badge { display: flex; align-items: center; gap: 0.5rem; background: #15803d22; border: 1px solid #22c55e44; color: #4ade80; padding: 0.4rem 0.9rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 6px #4ade80; animation: livePulse 1.5s infinite; }
        @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
        .admin-dash-section { display: flex; flex-direction: column; gap: 1rem; }
        .admin-section-heading { font-size: 1rem; font-weight: 700; color: #cbd5e1; margin: 0; letter-spacing: 0.03em; }
        .admin-stat-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(220px,1fr)); gap: 1rem; }
        .admin-stat-card { background: linear-gradient(135deg,#1e293b,#0f172a); border: 1px solid #1e293b; border-radius: 16px; padding: 1.2rem 1.4rem; display: flex; align-items: center; gap: 1rem; transition: transform .2s,box-shadow .2s,border-color .2s; position: relative; overflow: hidden; }
        .admin-stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:var(--card-accent,#6366f1); border-radius:16px 16px 0 0; }
        .admin-stat-card.clickable { cursor: pointer; }
        .admin-stat-card.clickable:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.4); border-color: var(--card-accent,#6366f1); }
        .stat-card-icon { width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.4rem; flex-shrink:0; }
        .stat-card-body { flex:1; min-width:0; }
        .stat-card-label { font-size:.72rem; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:.06em; margin-bottom:.2rem; }
        .stat-card-value { font-size:1.7rem; font-weight:800; color:#f1f5f9; line-height:1.1; }
        .stat-card-sub { font-size:.72rem; color:#475569; margin-top:.2rem; }
        .stat-card-arrow { color:#334155; font-size:1.1rem; transition:color .2s,transform .2s; }
        .admin-stat-card.clickable:hover .stat-card-arrow { color:var(--card-accent,#6366f1); transform:translateX(3px); }
        .stat-skeleton { display:inline-block; width:70px; height:26px; background:linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; border-radius:6px; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .admin-quick-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:.75rem; }
        .admin-quick-btn { display:flex; flex-direction:column; align-items:center; gap:.5rem; padding:1.1rem .5rem; background:#1e293b; border:1px solid #334155; border-radius:14px; color:#cbd5e1; font-size:.82rem; font-weight:600; cursor:pointer; transition:all .2s; text-align:center; }
        .admin-quick-btn:hover { background:#0f172a; border-color:var(--btn-color,#6366f1); color:var(--btn-color,#6366f1); transform:translateY(-2px); box-shadow:0 4px 16px rgba(0,0,0,.3); }
        .quick-btn-icon { font-size:1.5rem; }
      `}</style>
    </div>
  );
}

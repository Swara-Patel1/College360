import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const StatCard = ({ icon, label, value, sub, color, onClick, loading }) => (
  <div
    className={`admin-stat-card${onClick ? ' clickable' : ''}`}
    style={{ '--card-accent': color }}
    onClick={onClick}
  >
    <div className="stat-card-icon" style={{ background: color + '22', color }}>{icon}</div>
    <div className="stat-card-body">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">
        {loading ? <span className="stat-skeleton" /> : (value ?? '0')}
      </div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
    {onClick && <div className="stat-card-arrow"><i className="bi bi-arrow-right" /></div>}
  </div>
);

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [grades, setGrades] = useState([]);
  const [fees, setFees] = useState([]);
  const [attStats, setAttStats] = useState({ percentage: 0, present: 0, absent: 0, late: 0 });
  const [notices, setNotices] = useState([]);
  const [todayClasses, setTodayClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const loadDashboard = async () => {
      try {
        const profData = await API.get('students/my_profile');
        if (!isMounted) return;
        setProfile(profData);
        const studUuid = profData?.id;
        const safeGet = (url) => API.get(url).catch((e) => { console.warn('fetch failed:', url, e); return null; });
        const [gradesData, feesData, attData, noticesData, classesData] = await Promise.all([
          safeGet(`grades?student=${studUuid}`),
          safeGet(`fees?student=${studUuid}`),
          safeGet(`attendance/stats?student=${studUuid}`),
          safeGet('notices?audience=students'),
          safeGet(`timetable?day=${new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()}`)
        ]);
        if (!isMounted) return;
        setGrades(gradesData || []);
        setFees(feesData || []);
        setAttStats({ percentage: attData?.percentage || 0, present: attData?.present || 0, absent: attData?.absent || 0, late: attData?.late || 0 });
        setNotices((noticesData || []).slice(0, 5));
        setTodayClasses(classesData || []);
      } catch (err) {
        console.error('Failed to load student dashboard:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadDashboard();
    return () => { isMounted = false; };
  }, [user]);

  const enrolledCount = grades.length;
  const gradeOrder = { 'O': 10, 'AA': 9, 'A+': 9, 'AB': 8, 'A': 8, 'BB': 7, 'B+': 7, 'BC': 6, 'B': 6, 'CC': 5, 'C': 5, 'CD': 4, 'D': 4, 'DD': 3, 'F': 0 };
  const bestGrade = grades.length
    ? [...grades].sort((a, b) => (gradeOrder[b.grade] ?? b.percentage ?? 0) - (gradeOrder[a.grade] ?? a.percentage ?? 0))[0]?.grade
    : '—';
  const pendingFees = fees.filter(f => f.status === 'pending' || f.status === 'overdue');
  const totalPendingFees = pendingFees.reduce((s, f) => s + parseFloat(f.amount || 0), 0);

  const chartData = {
    labels: ['Present', 'Absent', 'Late'],
    datasets: [{ data: [parseFloat(attStats.present), parseFloat(attStats.absent), parseFloat(attStats.late)], backgroundColor: ['rgba(34,197,94,0.7)', 'rgba(239,68,68,0.7)', 'rgba(245,158,11,0.7)'], borderColor: ['#22c55e', '#ef4444', '#f59e0b'], borderWidth: 2 }]
  };
  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } } }, cutout: '65%' };

  const quickActions = [
    { icon: <i className="bi bi-book" />, label: 'Courses', path: '/student/courses', color: '#6366f1' },
    { icon: <i className="bi bi-person-check" />, label: 'Attendance', path: '/student/attendance', color: '#22c55e' },
    { icon: <i className="bi bi-journal-text" />, label: 'Grades', path: '/student/grades', color: '#0ea5e9' },
    { icon: <i className="bi bi-calendar3" />, label: 'Timetable', path: '/student/timetable', color: '#ec4899' },
    { icon: <i className="bi bi-book-half" />, label: 'Library', path: '/student/library', color: '#14b8a6' },
    { icon: <i className="bi bi-trophy" />, label: 'Portfolio', path: '/student/portfolio', color: '#f97316' },
    { icon: <i className="bi bi-question-circle" />, label: 'Doubts', path: '/student/doubts', color: '#a855f7' },
  ];

  return (
    <div className="admin-dashboard">
      {/* Stat Cards */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading"><i className="bi bi-speedometer2" /> Overview</h2>
        <div className="admin-stat-grid">
          <StatCard icon={<i className="bi bi-book" />} label="Enrolled Courses" value={enrolledCount} sub="Active this semester" color="#6366f1" loading={loading} onClick={() => navigate('/student/courses')} />
          <StatCard icon={<i className="bi bi-person-check" />} label="Attendance Rate" value={`${attStats.percentage}%`} sub={`${attStats.present} present · ${attStats.absent} absent`} color="#22c55e" loading={loading} onClick={() => navigate('/student/attendance')} />
          <StatCard icon={<i className="bi bi-award" />} label="Best Grade" value={bestGrade} sub="Highest this semester" color="#0ea5e9" loading={loading} onClick={() => navigate('/student/grades')} />
          <StatCard icon={<i className="bi bi-credit-card" />} label="Fees Due" value={Utils.formatCurrency(totalPendingFees)} sub={`${pendingFees.length} pending payment(s)`} color="#f59e0b" loading={loading} onClick={() => navigate('/student/fees')} />
        </div>
      </section>

      {/* Quick Actions */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading"><i className="bi bi-lightning-charge" /> Quick Access</h2>
        <div className="admin-quick-grid">
          {quickActions.map(({ icon, label, path, color }) => (
            <button key={path} className="admin-quick-btn" style={{ '--btn-color': color }} onClick={() => navigate(path)}>
              <span className="quick-btn-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Today's Schedule */}
      <section className="admin-dash-section">
        <div className="admin-inner-card">
          <div className="admin-inner-card-header">
            <span><i className="bi bi-calendar3" /> Today's Schedule</span>
            <Link to="/student/timetable" className="admin-inner-link">Full Schedule <i className="bi bi-arrow-right" /></Link>
          </div>
          {todayClasses.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', padding: '0.5rem 0' }}>
              {todayClasses.map((s, i) => (
                <div key={i} className="admin-class-card">
                  <div className="admin-class-code">{s.course_code}</div>
                  <div className="admin-class-name">{s.course_name}</div>
                  <div className="admin-class-meta"><i className="bi bi-clock" /> {s.start_time?.substring(0, 5)} – {s.end_time?.substring(0, 5)}</div>
                  <div className="admin-class-meta"><i className="bi bi-geo-alt" /> {s.room || 'TBD'}</div>
                  <div className="admin-class-meta"><i className="bi bi-person-video3" /> {s.faculty_name || 'TBD'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty" style={{ padding: '1.5rem' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.25rem', color: 'var(--primary-light)' }}><i className="bi bi-calendar-check" /></div>
              No classes scheduled for today — enjoy your free day!
            </div>
          )}
        </div>
      </section>

      {/* Grades + Attendance */}
      <section className="admin-dash-section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Grades */}
          <div className="admin-inner-card">
            <div className="admin-inner-card-header">
              <span><i className="bi bi-pencil-square" /> My Grades</span>
              <Link to="/student/grades" className="admin-inner-link">View All <i className="bi bi-arrow-right" /></Link>
            </div>
            {loading ? <div className="admin-inner-loading"><span className="stat-skeleton" style={{ width: '100%', height: 24 }} /></div> :
              grades.length ? (
                <table className="admin-table">
                  <thead><tr><th>Course</th><th>Marks</th><th>Grade</th></tr></thead>
                  <tbody>
                    {grades.slice(0, 6).map((g, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{g.course_code} <span style={{ color: '#64748b', fontWeight: 400 }}>{g.course_name}</span></td>
                        <td>{g.marks_obtained}/{g.total_marks}</td>
                        <td><span className={Utils.getGradeBadgeClass(g.grade)}>{g.grade}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="admin-empty">No grades posted yet.</div>
            }
          </div>

          {/* Attendance Chart */}
          <div className="admin-inner-card">
            <div className="admin-inner-card-header">
              <span><i className="bi bi-pie-chart" /> Attendance Breakdown</span>
            </div>
            <div style={{ height: 220, position: 'relative', padding: '1rem 0' }}>
              <Doughnut data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      </section>

      {/* Fees + Notices */}
      <section className="admin-dash-section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Fee Status */}
          <div className="admin-inner-card">
            <div className="admin-inner-card-header">
              <span><i className="bi bi-cash-coin" /> Fee Status</span>
              <Link to="/student/fees" className="admin-inner-link">Details <i className="bi bi-arrow-right" /></Link>
            </div>
            {fees.length ? fees.slice(0, 5).map((f, i) => (
              <div className="admin-list-item" key={i}>
                <div className="admin-list-icon" style={{ background: `rgba(${f.status === 'paid' ? '34,197,94' : '245,158,11'}, 0.15)`, color: f.status === 'paid' ? '#22c55e' : '#f59e0b' }}>
                  {f.status === 'paid' ? <i className="bi bi-check-circle-fill" /> : f.status === 'overdue' ? <i className="bi bi-exclamation-octagon-fill" /> : <i className="bi bi-clock-history" />}
                </div>
                <div className="admin-list-text">
                  <div className="admin-list-title" style={{ textTransform: 'capitalize' }}>{f.fee_type?.replace('_', ' ')} Fee</div>
                  <div className="admin-list-sub">Due: {Utils.formatDate(f.due_date)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{Utils.formatCurrency(f.amount)}</div>
                  <span className={Utils.getStatusBadgeClass(f.status)}>{f.status.toUpperCase()}</span>
                </div>
              </div>
            )) : <div className="admin-empty">No fee records found.</div>}
          </div>

          {/* Notices */}
          <div className="admin-inner-card">
            <div className="admin-inner-card-header">
              <span><i className="bi bi-megaphone" /> Latest Notices</span>
              <Link to="/student/notices" className="admin-inner-link">All <i className="bi bi-arrow-right" /></Link>
            </div>
            {notices.length ? notices.map((n, i) => (
              <div className="admin-list-item" key={i}>
                <div className="admin-list-icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}><i className="bi bi-megaphone" /></div>
                <div className="admin-list-text">
                  <div className="admin-list-title">{n.title}</div>
                  <div className="admin-list-sub">{n.content?.substring(0, 70)}...</div>
                </div>
                <div className="admin-list-meta">{Utils.formatDate(n.created_at)}</div>
              </div>
            )) : <div className="admin-empty">No notices available.</div>}
          </div>
        </div>
      </section>

      <style>{`
        .admin-dashboard { padding: 2rem; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
        .admin-dash-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
        .admin-dash-title { font-size: 1.8rem; font-weight: 800; background: linear-gradient(135deg,#a78bfa,#38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0 0 0.25rem; }
        .admin-dash-subtitle { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
        .admin-dash-badge { display: flex; align-items: center; gap: 0.5rem; background: #15803d22; border: 1px solid #22c55e44; color: #4ade80; padding: 0.4rem 0.9rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 6px #4ade80; animation: livePulse 1.5s infinite; }
        @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
        .admin-dash-section { display: flex; flex-direction: column; gap: 1rem; }
        .admin-section-heading { font-size: 1rem; font-weight: 700; color: var(--text-secondary); margin: 0; letter-spacing: 0.03em; }
        .admin-stat-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(220px,1fr)); gap: 1rem; }
        .admin-stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 1.2rem 1.4rem; display: flex; align-items: center; gap: 1rem; transition: transform .2s,box-shadow .2s,border-color .2s; position: relative; overflow: hidden; }
        .admin-stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:var(--card-accent,#6366f1); border-radius:16px 16px 0 0; }
        .admin-stat-card.clickable { cursor: pointer; }
        .admin-stat-card.clickable:hover { transform: translateY(-3px); box-shadow: var(--shadow-card); border-color: var(--card-accent,#6366f1); }
        .stat-card-icon { width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.4rem; flex-shrink:0; }
        .stat-card-body { flex:1; min-width:0; }
        .stat-card-label { font-size:.72rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:.06em; margin-bottom:.2rem; }
        .stat-card-value { font-size:1.7rem; font-weight:800; color:var(--text-primary); line-height:1.1; }
        .stat-card-sub { font-size:.72rem; color:var(--text-muted); margin-top:.2rem; }
        .stat-card-arrow { color:var(--border); font-size:1.1rem; transition:color .2s,transform .2s; }
        .admin-stat-card.clickable:hover .stat-card-arrow { color:var(--card-accent,#6366f1); transform:translateX(3px); }
        .stat-skeleton { display:inline-block; width:70px; height:26px; background:var(--bg-secondary); animation:shimmer 1.4s infinite; border-radius:6px; }
        @keyframes shimmer { 0%{opacity:0.5} 50%{opacity:1} 100%{opacity:0.5} }
        .admin-quick-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:.75rem; }
        .admin-quick-btn { display:flex; flex-direction:column; align-items:center; gap:.5rem; padding:1.1rem .5rem; background:var(--bg-card); border:1px solid var(--border); border-radius:14px; color:var(--text-primary); font-size:.82rem; font-weight:600; cursor:pointer; transition:all .2s; text-align:center; }
        .admin-quick-btn:hover { background:var(--bg-card-hover); border-color:var(--btn-color,#6366f1); color:var(--btn-color,#6366f1); transform:translateY(-2px); box-shadow:var(--shadow-card); }
        .quick-btn-icon { font-size:1.5rem; }
        .admin-inner-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 1.2rem 1.4rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .admin-inner-card-header { display: flex; align-items: center; justify-content: space-between; font-size: 0.88rem; font-weight: 700; color: var(--text-primary); border-bottom: 1px solid var(--border); padding-bottom: 0.75rem; }
        .admin-inner-link { font-size: 0.75rem; color: var(--primary-light); text-decoration: none; display: flex; align-items: center; gap: 0.25rem; transition: color .2s; }
        .admin-inner-link:hover { color: var(--primary); }
        .admin-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .admin-table th { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border); text-align: left; }
        .admin-table td { padding: 0.6rem; color: var(--text-primary); border-bottom: 1px solid var(--border); }
        .admin-table tr:last-child td { border-bottom: none; }
        .admin-table tr:hover td { background: var(--bg-card-hover); }
        .admin-list-item { display: flex; align-items: center; gap: 0.85rem; padding: 0.6rem 0; border-bottom: 1px solid var(--border); }
        .admin-list-item:last-child { border-bottom: none; }
        .admin-list-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
        .admin-list-text { flex: 1; min-width: 0; }
        .admin-list-title { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .admin-list-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 1px; }
        .admin-list-meta { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; }
        .admin-empty { color: var(--text-muted); font-size: 0.82rem; text-align: center; padding: 1.5rem 0; }
        .admin-inner-loading { padding: 1rem 0; }
        .admin-class-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.35rem; transition: border-color .2s,transform .2s; }
        .admin-class-card:hover { border-color: var(--primary); transform: translateY(-2px); }
        .admin-class-code { font-size: 0.72rem; color: var(--primary-light); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .admin-class-name { font-size: 0.88rem; font-weight: 700; color: var(--text-primary); }
        .admin-class-meta { font-size: 0.72rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.3rem; }
      `}</style>
    </div>
  );
}

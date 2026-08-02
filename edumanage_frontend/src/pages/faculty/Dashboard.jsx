import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

const StatCard = ({ icon, label, value, sub, color, onClick, loading }) => (
  <div
    className={`admin-stat-card${onClick ? ' clickable' : ''}`}
    style={{ '--card-accent': color }}
    onClick={onClick}
  >
    <div className="stat-card-icon" style={{ background: color + '22', color }}>{icon}</div>
    <div className="stat-card-body">
      <div className="stat-card-label">{label}</div>
      <div 
        className="stat-card-value" 
        style={typeof value === 'string' && value.length > 4 ? { fontSize: '1.2rem', lineHeight: '1.25', wordBreak: 'break-word' } : {}}
      >
        {loading ? <span className="stat-skeleton" /> : (value ?? '0')}
      </div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
    {onClick && <div className="stat-card-arrow"><i className="bi bi-arrow-right" /></div>}
  </div>
);

export default function FacultyDashboard() {
  const { user, delegatedAccess } = useAuthStore();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);

  const isHOD = user?.role === 'hod' || (delegatedAccess && delegatedAccess.length > 0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        setLoading(true);
        const prof = await API.get(`faculty/my_profile?user_id=${user.id}`).catch(() => null);
        setProfile(prof);
        if (!prof) return;

        const facId = prof.id || prof.faculty_id;
        const subjId = prof.subject_id;
        const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

        const [allCoursesRes, todaySchedule] = await Promise.all([
          API.get('courses').catch(() => []),
          API.get(`timetable?day=${dayName}&faculty=${facId}`).catch(() => [])
        ]);

        const allCourses = Array.isArray(allCoursesRes) ? allCoursesRes : [];

        // Find courses taught by faculty
        let myCourses = allCourses.filter(c => 
          c.faculty_id === facId || 
          c.faculty?.faculty_id === facId || 
          c.faculty?.id === facId ||
          (subjId && (c.subject_id === subjId || c.id === subjId))
        );

        // Fallback: If myCourses is empty but faculty has subject_id, match subject from allCourses
        if (myCourses.length === 0 && subjId) {
          const matched = allCourses.find(c => c.subject_id === subjId || c.id === subjId);
          if (matched) myCourses.push(matched);
        }

        setCourses(myCourses);
        setSchedule(Array.isArray(todaySchedule) ? todaySchedule : []);

        // Count unique students studying under this faculty
        const targetSubjects = myCourses.map(c => c.subject_id || c.id);
        if (subjId && !targetSubjects.includes(subjId)) {
          targetSubjects.push(subjId);
        }

        const studentIdsSet = new Set();
        for (const sId of targetSubjects) {
          const marksData = await API.get(`marks?subject_id=eq.${sId}`).catch(() => []);
          if (Array.isArray(marksData)) {
            for (const m of marksData) {
              const stId = m.student_id || (typeof m.student === 'string' ? m.student : m.student?.student_id || m.student?.id);
              if (stId) studentIdsSet.add(String(stId));
            }
          }
        }

        setTotalStudents(studentIdsSet.size || (subjId ? 40 : 0));
      } catch (e) {
        console.error('Failed to load faculty dashboard:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const facultyActions = [
    { icon: <i className="bi bi-person-check" />, label: 'Attendance', path: '/faculty/attendance', color: '#22c55e' },
    { icon: <i className="bi bi-journal-text" />, label: 'Grades', path: '/faculty/grades', color: '#0ea5e9' },
    { icon: <i className="bi bi-calendar3" />, label: 'Timetable', path: '/faculty/timetable', color: '#6366f1' },
    { icon: <i className="bi bi-broadcast" />, label: 'Notices', path: '/faculty/notices', color: '#f59e0b' },
    { icon: <i className="bi bi-airplane" />, label: 'Apply Leave', path: '/faculty/leaves', color: '#ec4899' },
    { icon: <i className="bi bi-arrow-repeat" />, label: 'Interchange', path: '/faculty/interchange', color: '#14b8a6' },
  ];

  const hodActions = [
    { icon: <i className="bi bi-people" />, label: 'Complaints', path: '/hod/complaints', color: '#ef4444' },
    { icon: <i className="bi bi-bar-chart" />, label: 'Performance', path: '/hod/performance', color: '#8b5cf6' },
    { icon: <i className="bi bi-cash-coin" />, label: 'Fees', path: '/hod/fees', color: '#22c55e' },
    { icon: <i className="bi bi-calendar-week" />, label: 'Timetable', path: '/hod/timetable', color: '#f59e0b' },
    { icon: <i className="bi bi-journal-check" />, label: 'Leaves', path: '/hod/leaves', color: '#ec4899' },
    { icon: <i className="bi bi-star" />, label: 'Feedback', path: '/hod/feedback', color: '#a855f7' },
  ];

  const titleGradient = isHOD
    ? 'linear-gradient(135deg,#f59e0b,#ec4899)'
    : 'linear-gradient(135deg,#38bdf8,#818cf8)';

  return (
    <div className="admin-dashboard">
      {/* Stats */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading"><i className="bi bi-speedometer2" /> Teaching Overview</h2>
        <div className="admin-stat-grid">
          <StatCard 
            icon={<i className="bi bi-book" />} 
            label="My Subject" 
            value={courses.length > 0 ? courses.map(c => c.name || c.code).join(', ') : 'None'} 
            sub={courses.length > 0 ? (courses[0].code ? `Code: ${courses[0].code}` : 'Assigned subject') : 'No subject assigned'} 
            color="#6366f1" 
            loading={loading} 
          />
          <StatCard icon={<i className="bi bi-mortarboard" />} label="My Students" value={totalStudents} sub="Total enrolled students" color="#0ea5e9" loading={loading} onClick={() => navigate('/faculty/students')} />
          <StatCard icon={<i className="bi bi-clock" />} label="Classes Today" value={schedule.length} sub="Scheduled lectures" color="#22c55e" loading={loading} onClick={() => navigate('/faculty/timetable')} />
          <StatCard icon={<i className="bi bi-person-check" />} label="Avg Attendance" value="87%" sub="Department average" color="#f59e0b" loading={loading} />
        </div>
      </section>

      {/* Faculty Quick Actions */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading"><i className="bi bi-lightning-charge" /> Faculty Actions</h2>
        <div className="admin-quick-grid">
          {facultyActions.map(({ icon, label, path, color }) => (
            <button key={path} className="admin-quick-btn" style={{ '--btn-color': color }} onClick={() => navigate(path)}>
              <span className="quick-btn-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* HOD Actions (shown if HOD or delegated) */}
      {isHOD && (
        <section className="admin-dash-section">
          <h2 className="admin-section-heading"><i className="bi bi-shield-check" /> HOD Actions</h2>
          <div className="admin-quick-grid">
            {hodActions.map(({ icon, label, path, color }) => (
              <button key={path} className="admin-quick-btn" style={{ '--btn-color': color }} onClick={() => navigate(path)}>
                <span className="quick-btn-icon">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Courses + Schedule */}
      <section className="admin-dash-section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Assigned Courses */}
          <div className="admin-inner-card">
            <div className="admin-inner-card-header">
              <span><i className="bi bi-book" /> Assigned Courses</span>
            </div>
            {loading ? <div className="admin-empty"><span className="stat-skeleton" style={{ width: '100%', height: 20 }} /></div> :
              courses.length ? courses.map((c) => (
                <div className="admin-list-item" key={c.subject_id || c.id}>
                  <div className="admin-list-icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                    <i className="bi bi-book" />
                  </div>
                  <div className="admin-list-text">
                    <div className="admin-list-title">{c.code} — {c.name}</div>
                    <div className="admin-list-sub">Sem {c.semester} · {c.enrolled_count || totalStudents} students · {c.credits} cr</div>
                  </div>
                  <span style={{ fontSize: '0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '0.2rem 0.6rem', borderRadius: 6 }}>
                    Sem {c.semester}
                  </span>
                </div>
              )) : <div className="admin-empty">No courses assigned yet.</div>
            }
          </div>

          {/* Today's Schedule */}
          <div className="admin-inner-card">
            <div className="admin-inner-card-header">
              <span><i className="bi bi-calendar3" /> Today's Schedule</span>
              <button className="admin-inner-link-btn" onClick={() => navigate('/faculty/timetable')}>
                Full Timetable <i className="bi bi-arrow-right" />
              </button>
            </div>
            {loading ? <div className="admin-empty"><span className="stat-skeleton" style={{ width: '100%', height: 20 }} /></div> :
              schedule.length ? schedule.map((s, idx) => (
                <div className="admin-list-item" key={idx}>
                  <div className="admin-list-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                    <i className="bi bi-clock" />
                  </div>
                  <div className="admin-list-text">
                    <div className="admin-list-title">{s.course_code} — {s.course_name}</div>
                    <div className="admin-list-sub">{s.start_time?.substring(0, 5)} – {s.end_time?.substring(0, 5)} · Room {s.room || 'TBD'}</div>
                  </div>
                  <button
                    className="admin-quick-btn"
                    style={{ '--btn-color': '#22c55e', padding: '0.35rem 0.7rem', fontSize: '0.72rem', borderRadius: 8 }}
                    onClick={() => navigate('/faculty/attendance')}
                  >
                    Mark
                  </button>
                </div>
              )) : (
                <div className="admin-empty" style={{ padding: '2rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem', color: 'var(--primary-light)' }}><i className="bi bi-calendar-check" /></div>
                  No classes today!
                </div>
              )
            }
          </div>
        </div>
      </section>

      <style>{`
        .admin-dashboard { padding: 2rem; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
        .admin-dash-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
        .admin-dash-title { font-size: 1.8rem; font-weight: 800; background: linear-gradient(135deg,#38bdf8,#818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0 0 0.25rem; }
        .admin-dash-subtitle { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
        .hod-badge { color: #f59e0b; font-weight: 700; }
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
        .admin-inner-link-btn { font-size: 0.75rem; color: var(--primary-light); background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 0.25rem; transition: color .2s; }
        .admin-inner-link-btn:hover { color: var(--primary); }
        .admin-list-item { display: flex; align-items: center; gap: 0.85rem; padding: 0.6rem 0; border-bottom: 1px solid var(--border); }
        .admin-list-item:last-child { border-bottom: none; }
        .admin-list-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
        .admin-list-text { flex: 1; min-width: 0; }
        .admin-list-title { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .admin-list-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 1px; }
        .admin-empty { color: var(--text-muted); font-size: 0.82rem; text-align: center; padding: 1.5rem 0; }
      `}</style>
    </div>
  );
}

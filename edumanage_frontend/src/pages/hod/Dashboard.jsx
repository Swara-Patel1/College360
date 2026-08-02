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
      <div className="stat-card-value">
        {loading ? <span className="stat-skeleton" /> : (value ?? '0')}
      </div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
    {onClick && <div className="stat-card-arrow"><i className="bi bi-arrow-right" /></div>}
  </div>
);

export default function HODDashboard() {
  const { user, delegatedAccess } = useAuthStore();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [deptFaculty, setDeptFaculty] = useState([]);
  const [deptStudents, setDeptStudents] = useState([]);
  const [deptCourses, setDeptCourses] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const loadHODData = async () => {
      try {
        const prof = await API.get('faculty/my_profile');
        setProfile(prof);

        let deptId = prof?.department_id || prof?.department?.id || (typeof prof?.department === 'string' ? prof.department : '');
        try {
          const query = user?.id ? `hod/check?user_id=eq.${user.id}` : (user?.email ? `hod/check?email=eq.${user.email}` : 'hod/check');
          const hodCheck = await API.get(query);
          if (hodCheck && (hodCheck.department_id || hodCheck.hod?.department_id)) {
            deptId = hodCheck.department_id || hodCheck.hod?.department_id || deptId;
          }
        } catch (_) {}

        const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const facultyEndpoint = deptId ? `faculty?department_id=${deptId}&limit=1000` : 'faculty?limit=1000';
        const studentsEndpoint = deptId ? `students?department_id=${deptId}&limit=1000` : 'students?limit=1000';

        const [facList, studList, courseList, compList, todaySchedule] = await Promise.all([
          API.get(facultyEndpoint),
          API.get(studentsEndpoint),
          API.get('courses'),
          API.get('complaints'),
          prof?.id ? API.get(`timetable?day=${todayName}&faculty=${prof.id}`) : []
        ]);

        if (deptId) {
          const targetId = String(deptId).toLowerCase();
          setDeptFaculty((facList || []).filter(f => String(f.department_id || f.department?.id || f.department || '').toLowerCase() === targetId));
          setDeptStudents((studList || []).filter(s => String(s.department_id || s.department?.id || s.department?.department_id || s.department || '').toLowerCase() === targetId));
          setDeptCourses((courseList || []).filter(c => String(c.department_id || c.department?.id || c.department || '').toLowerCase() === targetId));
        } else {
          setDeptFaculty(facList || []);
          setDeptStudents(studList || []);
          setDeptCourses(courseList || []);
        }

        setComplaints((compList || []).filter(c => c.status === 'pending' || c.status === 'open'));
        setSchedule(todaySchedule || []);
      } catch (e) {
        console.error('Failed to load HOD dashboard data:', e);
      } finally {
        setLoading(false);
      }
    };

    loadHODData();
  }, [user]);

  const hodActions = [
    { icon: <i className="bi bi-clipboard-check" />, label: 'Leave Requests', path: '/hod/leaves', color: '#ec4899' },
    { icon: <i className="bi bi-megaphone" />, label: 'Complaints', path: '/hod/complaints', color: '#ef4444' },
    { icon: <i className="bi bi-exclamation-triangle" />, label: 'Academic Alerts', path: '/hod/performance', color: '#8b5cf6' },
    { icon: <i className="bi bi-cash-coin" />, label: 'Pending Fees', path: '/hod/fees', color: '#22c55e' },
    { icon: <i className="bi bi-star" />, label: 'Faculty Feedback', path: '/hod/feedback', color: '#a855f7' },
  ];

  const teachingActions = [
    { icon: <i className="bi bi-person-check" />, label: 'Students Attendance', path: '/faculty/attendance', color: '#22c55e' },
    { icon: <i className="bi bi-journal-text" />, label: 'Students Grades', path: '/faculty/grades', color: '#0ea5e9' },
    { icon: <i className="bi bi-broadcast" />, label: 'Notices', path: '/faculty/notices', color: '#f59e0b' },
  ];

  const deptName = profile?.department_name || 'Department';

  return (
    <div className="admin-dashboard">
      {/* Department Metrics Overview */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading">
          <i className="bi bi-building" /> {deptName} Overview
        </h2>
        <div className="admin-stat-grid">
          <StatCard
            icon={<i className="bi bi-person-badge" />}
            label="Department Faculty"
            value={deptFaculty.length}
            sub="Active teaching staff"
            color="#6366f1"
            loading={loading}
            onClick={() => navigate('/faculty/students')}
          />
          <StatCard
            icon={<i className="bi bi-mortarboard-fill" />}
            label="Enrolled Students"
            value={deptStudents.length}
            sub="Department total"
            color="#0ea5e9"
            loading={loading}
            onClick={() => navigate('/faculty/students')}
          />
          <StatCard
            icon={<i className="bi bi-book-half" />}
            label="Active Courses"
            value={deptCourses.length}
            sub="Curriculum subjects"
            color="#22c55e"
            loading={loading}
            onClick={() => navigate('/faculty/courses')}
          />
          <StatCard
            icon={<i className="bi bi-exclamation-circle-fill" />}
            label="Open Complaints"
            value={complaints.length}
            sub="Requires HOD attention"
            color="#ef4444"
            loading={loading}
            onClick={() => navigate('/hod/complaints')}
          />
        </div>
      </section>

      {/* HOD Administration Quick Actions */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading">
          <i className="bi bi-shield-check" /> HOD Administration & Governance
        </h2>
        <div className="admin-quick-grid">
          {hodActions.map(({ icon, label, path, color }) => (
            <button
              key={path}
              className="admin-quick-btn"
              style={{ '--btn-color': color }}
              onClick={() => navigate(path)}
            >
              <span className="quick-btn-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Personal Teaching & Lecture Actions */}
      <section className="admin-dash-section">
        <h2 className="admin-section-heading">
          <i className="bi bi-journal-bookmark" /> Personal Teaching Duties
        </h2>
        <div className="admin-quick-grid">
          {teachingActions.map(({ icon, label, path, color }) => (
            <button
              key={path}
              className="admin-quick-btn"
              style={{ '--btn-color': color }}
              onClick={() => navigate(path)}
            >
              <span className="quick-btn-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Bottom Section: Pending Complaints & Today's Schedule */}
      <section className="admin-dash-section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Pending Complaints Widget */}
          <div className="admin-inner-card">
            <div className="admin-inner-card-header">
              <span><i className="bi bi-megaphone" /> Recent Student Complaints</span>
              <button className="admin-inner-link-btn" onClick={() => navigate('/hod/complaints')}>
                View All <i className="bi bi-arrow-right" />
              </button>
            </div>
            {loading ? (
              <div className="admin-empty"><span className="stat-skeleton" style={{ width: '100%', height: 20 }} /></div>
            ) : complaints.length ? (
              complaints.slice(0, 5).map((comp) => (
                <div className="admin-list-item" key={comp.id}>
                  <div className="admin-list-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                    <i className="bi bi-exclamation-triangle" />
                  </div>
                  <div className="admin-list-text">
                    <div className="admin-list-title">{comp.title || comp.subject || 'Student Grievance'}</div>
                    <div className="admin-list-sub">{comp.student_name || 'Student'} · {comp.category || 'General'}</div>
                  </div>
                  <button
                    className="admin-quick-btn"
                    style={{ '--btn-color': '#ef4444', padding: '0.35rem 0.7rem', fontSize: '0.72rem', borderRadius: 8 }}
                    onClick={() => navigate('/hod/complaints')}
                  >
                    Review
                  </button>
                </div>
              ))
            ) : (
              <div className="admin-empty" style={{ padding: '2rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#22c55e' }}><i className="bi bi-check-circle" /></div>
                No pending complaints! All clear.
              </div>
            )}
          </div>

          {/* Today's Schedule */}
          <div className="admin-inner-card">
            <div className="admin-inner-card-header">
              <span><i className="bi bi-calendar3" /> My Today's Lectures</span>
              <button className="admin-inner-link-btn" onClick={() => navigate('/faculty/timetable')}>
                Full Timetable <i className="bi bi-arrow-right" />
              </button>
            </div>
            {loading ? (
              <div className="admin-empty"><span className="stat-skeleton" style={{ width: '100%', height: 20 }} /></div>
            ) : schedule.length ? (
              schedule.map((s, idx) => (
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
              ))
            ) : (
              <div className="admin-empty" style={{ padding: '2rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', color: 'var(--primary-light)' }}><i className="bi bi-calendar-check" /></div>
                No lectures scheduled for today!
              </div>
            )}
          </div>
        </div>
      </section>

      <style>{`
        .admin-dashboard { padding: 2rem; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
        .admin-dash-section { display: flex; flex-direction: column; gap: 1rem; }
        .admin-section-heading { font-size: 1rem; font-weight: 700; color: var(--text-secondary); margin: 0; letter-spacing: 0.03em; display: flex; align-items: center; gap: 0.5rem; }
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

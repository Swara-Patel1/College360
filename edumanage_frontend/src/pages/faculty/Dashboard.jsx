import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

export default function Dashboard() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentDateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const prof = await API.get('faculty/my_profile');
      setProfile(prof);
      if (!prof) return;

      const [allCourses, todaySchedule] = await Promise.all([
        API.get('courses'),
        API.get(`timetable?day=${new Date().toLocaleDateString('en-US', { weekday: 'long' })}&faculty=${prof.id}`)
      ]);

      const myCoursesList = (allCourses || []).filter(c => c.faculty_id === prof.id);
      setCourses(myCoursesList);
      setSchedule(todaySchedule || []);
    } catch (e) {
      console.error('Failed to load faculty dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadDashboardData();
  }, [user]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  const totalStudents = courses.reduce((acc, c) => acc + (c.enrolled_count || 0), 0);

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Welcome back, {user?.first_name || 'Faculty'}! 👋</h1>
          <p>Here's your teaching overview for today.</p>
        </div>
        <div className="page-header-right">
          <NavLink to="/faculty/attendance" className="btn btn-primary">
            ✅ Mark Attendance
          </NavLink>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">📚</div>
          <div className="stat-value">{courses.length}</div>
          <div className="stat-label">My Courses</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">🎓</div>
          <div className="stat-value">{totalStudents}</div>
          <div className="stat-label">My Students</div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon">⏰</div>
          <div className="stat-value">{schedule.length}</div>
          <div className="stat-label">Classes Today</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">📊</div>
          <div className="stat-value">87%</div>
          <div className="stat-label">Avg Attendance</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* My Courses Section */}
        <div className="card col-6">
          <div className="card-header">
            <div className="card-title">📚 Assigned Courses</div>
            <NavLink to="/faculty/courses" className="btn btn-ghost btn-sm">View All</NavLink>
          </div>
          <div className="card-body">
            {courses.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {courses.map((c) => (
                  <div className="list-item" key={c.subject_id}>
                    <div className="list-icon" style={{ background: 'rgba(108,99,255,0.15)' }}>📚</div>
                    <div className="list-text">
                      <div className="list-title" style={{ fontWeight: 700 }}>{c.code} — {c.name}</div>
                      <div className="list-subtitle">Sem {c.semester} · {c.enrolled_count || 0} students · {c.credits} credits</div>
                    </div>
                    <span className="badge badge-primary">Sem {c.semester}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📚</div>
                <p>No courses assigned yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="card col-6">
          <div className="card-header">
            <div className="card-title">📅 Today's Schedule</div>
            <NavLink to="/faculty/timetable" className="btn btn-ghost btn-sm">Full Timetable</NavLink>
          </div>
          <div className="card-body">
            {schedule.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {schedule.map((s, idx) => (
                  <div className="list-item" key={idx}>
                    <div className="list-icon" style={{ background: 'rgba(0,212,170,0.15)' }}>📅</div>
                    <div className="list-text">
                      <div className="list-title" style={{ fontWeight: 700 }}>{s.course_code} — {s.course_name}</div>
                      <div className="list-subtitle">{s.start_time?.substring(0, 5)} – {s.end_time?.substring(0, 5)} · Room {s.room || 'TBD'}</div>
                    </div>
                    <NavLink to="/faculty/attendance" className="btn btn-success btn-sm">Mark</NavLink>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">🎉</div>
                <h3>No Classes Today</h3>
                <p>Enjoy your day off!</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card col-12">
          <div className="card-header">
            <div className="card-title">⚡ Quick Actions</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
              <NavLink to="/faculty/attendance" className="btn btn-secondary" style={{ height: '80px', flexDirection: 'column', gap: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.5rem' }}>✅</span>
                <span>Mark Attendance</span>
              </NavLink>
              <NavLink to="/faculty/grades" className="btn btn-secondary" style={{ height: '80px', flexDirection: 'column', gap: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.5rem' }}>📝</span>
                <span>Enter Grades</span>
              </NavLink>
              <NavLink to="/faculty/timetable" className="btn btn-secondary" style={{ height: '80px', flexDirection: 'column', gap: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.5rem' }}>📅</span>
                <span>My Timetable</span>
              </NavLink>
              <NavLink to="/faculty/notices" className="btn btn-secondary" style={{ height: '80px', flexDirection: 'column', gap: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.5rem' }}>📢</span>
                <span>Post Notice</span>
              </NavLink>
              <NavLink to="/faculty/leaves" className="btn btn-secondary" style={{ height: '80px', flexDirection: 'column', gap: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(255,159,67,0.4)', background: 'rgba(255,159,67,0.06)' }}>
                <span style={{ fontSize: '1.5rem' }}>🏖️</span>
                <span style={{ color: '#FF9F43' }}>Apply Leave</span>
              </NavLink>
              <NavLink to="/faculty/interchange" className="btn btn-secondary" style={{ height: '80px', flexDirection: 'column', gap: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(0,212,170,0.4)', background: 'rgba(0,212,170,0.06)' }}>
                <span style={{ fontSize: '1.5rem' }}>🔄</span>
                <span style={{ color: '#00D4AA' }}>Swap Lecture</span>
              </NavLink>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}

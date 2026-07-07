import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [grades, setGrades] = useState([]);
  const [fees, setFees] = useState([]);
  const [attStats, setAttStats] = useState({ percentage: 0, present: 0, absent: 0, late: 0 });
  const [notices, setNotices] = useState([]);
  const [todayClasses, setTodayClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Synchronous page data loading
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const loadDashboard = async () => {
      try {
        // Step 1: Load student profile first
        const profData = await API.get('students/my_profile');
        if (!isMounted) return;
        setProfile(profData);

        const studUuid = profData?.id;

        // Step 2: Fire dashboard requests individually so one failure doesn't blank the whole page
        const safeGet = (url) => API.get(url).catch((e) => { console.warn('Dashboard fetch failed:', url, e); return null; });

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
        setAttStats({
          percentage: attData?.percentage || 0,
          present: attData?.present || 0,
          absent: attData?.absent || 0,
          late: attData?.late || 0
        });
        setNotices((noticesData || []).slice(0, 5));
        setTodayClasses(classesData || []);
      } catch (err) {
        console.error('Failed to load student dashboard:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDashboard();

    // Listen to real-time events to update details dynamically
    const handleGradeNew = (e) => {
      const g = e.detail;
      // Refresh grades
      API.get(`grades?student=${profile?.id || user.id}`).then((data) => {
        if (isMounted && data) setGrades(data);
      });
    };

    const handleAttendanceUpdate = () => {
      API.get(`attendance/stats?student=${profile?.id || user.id}`).then((data) => {
        if (isMounted && data) {
          setAttStats((prev) => ({
            ...prev,
            percentage: data.percentage || 0
          }));
        }
      });
    };

    window.addEventListener('socket:grade:new', handleGradeNew);
    window.addEventListener('socket:attendance:updated', handleAttendanceUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('socket:grade:new', handleGradeNew);
      window.removeEventListener('socket:attendance:updated', handleAttendanceUpdate);
    };
  }, [user]);

  // Calculate stats values
  const enrolledCount = grades.length;

  // Map Indian grading system (O, AA, AB, BB, BC, CC, CD, DD, F) to sort order
  const gradeOrder = { 'O': 10, 'AA': 9, 'A+': 9, 'AB': 8, 'A': 8, 'BB': 7, 'B+': 7, 'BC': 6, 'B': 6, 'CC': 5, 'C': 5, 'CD': 4, 'D': 4, 'DD': 3, 'F': 0 };
  const bestGrade = grades.length
    ? [...grades].sort((a, b) => (gradeOrder[b.grade] ?? b.percentage ?? 0) - (gradeOrder[a.grade] ?? a.percentage ?? 0))[0]?.grade
    : '—';
  
  const pendingFees = fees.filter(f => f.status === 'pending' || f.status === 'overdue');
  const totalPendingFees = pendingFees.reduce((s, f) => s + parseFloat(f.amount || 0), 0);

  // Doughnut chart options and data
  const chartData = {
    labels: ['Present', 'Absent', 'Late'],
    datasets: [{
      data: [
        parseFloat(attStats.present),
        parseFloat(attStats.absent),
        parseFloat(attStats.late)
      ],
      backgroundColor: ['rgba(0,212,170,0.7)', 'rgba(255,107,107,0.7)', 'rgba(255,159,67,0.7)'],
      borderColor: ['#00D4AA', '#FF6B6B', '#FF9F43'],
      borderWidth: 2,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#A0A0C0',
          font: { family: 'Inter', size: 11 }
        }
      }
    },
    cutout: '65%'
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 id="welcomeMsg">Hello, {user?.first_name}! 👋</h1>
          <p id="studentInfo">
            {profile 
              ? `${profile.student_id} · ${profile.department_name || 'N/A'} · Year ${profile.year_of_study} · Sem ${profile.semester}`
              : 'Loading student information...'}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">📚</div>
          <div className="stat-value" id="enrolledCourses">{enrolledCount}</div>
          <div className="stat-label">Enrolled Courses</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">✅</div>
          <div className="stat-value" id="myAttendance">{attStats.percentage}%</div>
          <div className="stat-label">Attendance Rate</div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon">📊</div>
          <div className="stat-value" id="myGrade">{bestGrade}</div>
          <div className="stat-label">Overall Grade</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">💰</div>
          <div className="stat-value" id="pendingFees">{Utils.formatCurrency(totalPendingFees)}</div>
          <div className="stat-label">Fees Due</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* My Grades */}
        <div className="card col-6">
          <div className="card-header">
            <div className="card-title">📝 My Grades</div>
            <Link to="/student/grades" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          <div className="card-body" id="myGradesSection" style={{ padding: 0 }}>
            {grades.length ? (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Marks</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grades.slice(0, 6).map((g, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{g.course_code} {g.course_name}</td>
                        <td>{g.marks_obtained}/{g.total_marks}</td>
                        <td>
                          <span className={Utils.getGradeBadgeClass(g.grade)}>{g.grade}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-state-icon">📝</div>
                <p>No grades posted yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Attendance Chart */}
        <div className="card col-6">
          <div className="card-header">
            <div className="card-title">✅ Attendance by Course</div>
          </div>
          <div className="card-body">
            <div className="chart-container" style={{ height: '220px', position: 'relative' }}>
              <Doughnut data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* My Fees */}
        <div className="card col-5">
          <div className="card-header">
            <div className="card-title">💰 Fee Status</div>
            <Link to="/student/fees" className="btn btn-ghost btn-sm">Details</Link>
          </div>
          <div className="card-body" id="myFeesSection">
            {fees.length ? (
              fees.slice(0, 5).map((f, i) => (
                <div className="list-item" key={i}>
                  <div 
                    className="list-icon" 
                    style={{ background: `rgba(${f.status === 'paid' ? '0,212,170' : '255,159,67'}, 0.15)` }}
                  >
                    {f.status === 'paid' ? '✅' : f.status === 'overdue' ? '🚨' : '⏳'}
                  </div>
                  <div className="list-text">
                    <div className="list-title" style={{ textTransform: 'capitalize' }}>
                      {f.fee_type?.replace('_', ' ')} Fee
                    </div>
                    <div className="list-subtitle">Due: {Utils.formatDate(f.due_date)}</div>
                  </div>
                  <div className="text-right">
                    <div style={{ fontWeight: 700 }}>{Utils.formatCurrency(f.amount)}</div>
                    <span className={Utils.getStatusBadgeClass(f.status)}>
                      {f.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">💰</div>
                <p>No fee records.</p>
              </div>
            )}
          </div>
        </div>

        {/* Notices */}
        <div className="card col-7">
          <div className="card-header">
            <div className="card-title">📢 Latest Notices</div>
            <Link to="/student/notices" className="btn btn-ghost btn-sm">All</Link>
          </div>
          <div className="card-body" id="studentNotices">
            {notices.length ? (
              notices.map((n, i) => (
                <div className="list-item" key={i}>
                  <div className="list-icon" style={{ background: 'rgba(108,99,255,0.1)' }}>📢</div>
                  <div className="list-text">
                    <div className="list-title">{n.title}</div>
                    <div className="list-subtitle">{n.content.substring(0, 80)}...</div>
                  </div>
                  <div className="list-meta">{Utils.formatDate(n.created_at)}</div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No notices.</p>
              </div>
            )}
          </div>
        </div>

        {/* Today's Timetable */}
        <div className="card col-12">
          <div className="card-header">
            <div className="card-title">📅 Today's Classes</div>
            <Link to="/student/timetable" className="btn btn-ghost btn-sm">Full Schedule</Link>
          </div>
          <div className="card-body" id="todayClasses">
            {todayClasses.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {todayClasses.map((s, i) => (
                  <div 
                    key={i} 
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', fontWeight: 700, marginBottom: '4px' }}>
                      {s.course_code}
                    </div>
                    <div style={{ fontWeight: 700, marginBottom: '8px' }}>{s.course_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      🕐 {s.start_time?.substring(0, 5)} – {s.end_time?.substring(0, 5)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📍 {s.room || 'TBD'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>👨‍🏫 {s.faculty_name || 'TBD'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">🎉</div>
                <h3>No Classes Today!</h3>
                <p>Enjoy your free day.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

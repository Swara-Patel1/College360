import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Attendance() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ percentage: 0, present: 0, absent: 0, late: 0, excused: 0 });
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [courseStats, setCourseStats] = useState([]);
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  
  // Filters state
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const loadAttendancePage = async () => {
      try {
        // Load student profile first
        const profData = await API.get('students/my_profile');
        if (!isMounted) return;
        setProfile(profData);
        const studUuid = profData?.id;

        // Fetch general stats, enrollments and logs in parallel
        const [statsData, enrollData, logsData] = await Promise.all([
          API.get(`attendance/stats?student=${studUuid}`),
          API.get(`courses/enrollments?student=${studUuid}`),
          API.get(`attendance?student=${studUuid}`)
        ]);

        if (!isMounted) return;

        setStats({
          percentage: statsData?.percentage || 0,
          present: statsData?.present || 0,
          absent: statsData?.absent || 0,
          late: statsData?.late || 0,
          excused: statsData?.excused || 0
        });

        setEnrolledCourses(enrollData || []);
        setLogs(logsData || []);
        setFilteredLogs(logsData || []);

        // Load stats for each individual course
        if (enrollData?.length) {
          const breakdown = await Promise.all(
            enrollData.map(async (e) => {
              try {
                const cStats = await API.get(`attendance/stats?student=${studUuid}&course=${e.course}`);
                return { ...e, stats: cStats };
              } catch {
                return {
                  ...e,
                  stats: { total: 0, present: 0, absent: 0, late: 0, percentage: 0 }
                };
              }
            })
          );
          if (isMounted) setCourseStats(breakdown);
        }
      } catch (err) {
        console.error('Failed to load student attendance:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAttendancePage();

    // Listen for real-time WebSocket attendance updates
    const handleAttUpdated = () => {
      loadAttendancePage();
    };

    window.addEventListener('socket:attendance:updated', handleAttUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('socket:attendance:updated', handleAttUpdated);
    };
  }, [user]);

  // Handle local logs filtering
  useEffect(() => {
    let result = [...logs];
    
    if (selectedCourse) {
      result = result.filter(log => log.course == selectedCourse);
    }
    
    if (selectedStatus) {
      result = result.filter(log => log.status === selectedStatus);
    }
    
    setFilteredLogs(result);
  }, [selectedCourse, selectedStatus, logs]);

  const rate = parseFloat(stats.percentage) || 0;
  
  // Rate style classes
  let rateCardClass = 'stat-card';
  if (rate >= 80) rateCardClass += ' success';
  else if (rate >= 75) rateCardClass += ' warning';
  else rateCardClass += ' danger';

  // Advice details depending on percentage
  const getPolicyAdvice = () => {
    if (rate >= 80) {
      return {
        emoji: '🏆',
        bg: 'rgba(0,212,170,0.15)',
        color: '#00D4AA',
        title: 'Excellent Standing!',
        text: `Your overall attendance rate of ${rate}% is outstanding and well above the university threshold. Keep it up!`
      };
    } else if (rate >= 75) {
      return {
        emoji: '⚠️',
        bg: 'rgba(255,159,67,0.15)',
        color: '#FF9F43',
        title: 'Warning Status',
        text: `You are currently close to the minimum requirements with ${rate}%. Avoid taking any unnecessary leaves.`
      };
    } else {
      return {
        emoji: '🚨',
        bg: 'rgba(255,107,107,0.15)',
        color: '#FF6B6B',
        title: 'Critical Status: Risk of Shortage',
        text: `Warning: Your attendance rate is ${rate}%, which is below the 75% exam eligibility threshold. Contact your HOD immediately.`
      };
    }
  };

  const advice = getPolicyAdvice();

  // Doughnut configuration
  const chartData = {
    labels: rate === 0 ? ['No Data'] : ['Present', 'Absent', 'Late', 'Excused'],
    datasets: [{
      data: rate === 0 ? [1] : [
        parseFloat(stats.present),
        parseFloat(stats.absent),
        parseFloat(stats.late),
        parseFloat(stats.excused)
      ],
      backgroundColor: rate === 0 ? ['rgba(96,96,160,0.1)'] : [
        'rgba(0,212,170,0.7)',
        'rgba(255,107,107,0.7)',
        'rgba(255,159,67,0.7)',
        'rgba(84,160,255,0.7)'
      ],
      borderColor: rate === 0 ? ['rgba(96,96,160,0.2)'] : [
        '#00D4AA',
        '#FF6B6B',
        '#FF9F43',
        '#54A0FF'
      ],
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
          font: { family: 'Inter', size: 12 }
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
      {/* Row 1: Attendance Tracker full width */}
      <div className="stat-card primary" style={{ marginBottom: '20px' }}>
        <div className="stat-icon">📋</div>
        <div className="stat-value">Attendance Tracker</div>
        <p id="attSubtitle" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
          {profile 
            ? `${profile.student_id} · ${profile.department_name || 'N/A'} · Year ${profile.year_of_study} · Sem ${profile.semester}`
            : 'Loading...'}
        </p>
      </div>

      {/* Row 2: 4 stat cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className={rateCardClass}>
          <div className="stat-icon">📈</div>
          <div className="stat-value" id="overallRate">{rate}%</div>
          <div className="stat-label">Overall Rate</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">Present</div>
          <div className="stat-value" id="statPresent">{stats.present}</div>
          <div className="stat-label">Sessions</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">Late</div>
          <div className="stat-value" id="statLate">{stats.late}</div>
          <div className="stat-label">Sessions</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-icon">Absent</div>
          <div className="stat-value" id="statAbsent">{stats.absent}</div>
          <div className="stat-label">Sessions</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Attendance Chart */}
        <div className="card col-5">
          <div className="card-header">
            <div className="card-title">📊 Visual Breakdown</div>
          </div>
          <div className="card-body">
            <div className="chart-container" style={{ height: '220px', position: 'relative' }}>
              <Doughnut data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Policy Advice Card */}
        <div className="card col-7">
          <div className="card-header">
            <div className="card-title">📜 Attendance Policy</div>
          </div>
          <div className="card-body" style={{ display: 'flex', gap: '20px', alignItems: 'center', height: '100%' }}>
            <div 
              id="adviceIcon" 
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                flexShrink: 0,
                background: advice.bg,
                color: advice.color
              }}
            >
              {advice.emoji}
            </div>
            <div>
              <h3 id="adviceTitle" style={{ color: advice.color, fontWeight: 700, marginBottom: '6px', fontSize: '1.1rem' }}>
                {advice.title}
              </h3>
              <p id="adviceText" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                {advice.text}
              </p>
            </div>
          </div>
        </div>

        {/* Subject Breakdowns */}
        <div className="card col-12">
          <div className="card-header">
            <div className="card-title">🏛️ Subject-wise Analysis</div>
          </div>
          <div className="card-body">
            <div className="dashboard-grid" id="courseBreakdown" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', padding: 0 }}>
              {courseStats.map((c, i) => {
                const cRate = parseFloat(c.stats?.percentage) || 0;
                const cTotal = c.stats?.total || 0;
                const cPresent = c.stats?.present || 0;
                const cAbsent = c.stats?.absent || 0;
                const cLate = c.stats?.late || 0;

                let barColor = '#FF6B6B';
                let textColor = '#FF6B6B';
                if (cRate >= 80) {
                  barColor = '#00D4AA';
                  textColor = '#00D4AA';
                } else if (cRate >= 75) {
                  barColor = '#FF9F43';
                  textColor = '#FF9F43';
                }

                return (
                  <div className="course-att-card" key={i}>
                    <div className="course-head">
                      <span className="course-code">{c.course_code}</span>
                      <span className="course-pct-label" style={{ color: textColor }}>{cRate}%</span>
                    </div>
                    <div className="course-name" title={c.course_name}>{c.course_name}</div>
                    <div className="course-stats-mini">
                      <span className="c-stat">Present: <strong>{cPresent}</strong></span>
                      <span className="c-stat">Absent: <strong>{cAbsent}</strong></span>
                      <span className="c-stat">Late: <strong>{cLate}</strong></span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar-fill" style={{ width: `${cRate}%`, background: barColor }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      <span>Sessions Attended</span>
                      <span>{cPresent + cLate}/{cTotal} classes</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filters and logs list */}
        <div className="card col-12">
          <div className="card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
            <div className="card-title">📅 Daily Attendance Log</div>
            <div className="header-actions" style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
              <select 
                className="form-control" 
                id="logFilterCourse"
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
              >
                <option value="">All Courses</option>
                {enrolledCourses.map((e, idx) => (
                  <option value={e.course} key={idx}>{e.course_code}</option>
                ))}
              </select>
              <select 
                className="form-control" 
                id="logFilterStatus"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
              >
                <option value="">All Statuses</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="excused">Excused</option>
              </select>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Course</th>
                    <th>Status</th>
                    <th>Remarks</th>
                    <th>Marked By</th>
                  </tr>
                </thead>
                <tbody id="attendanceLogBody">
                  {filteredLogs.length ? (
                    filteredLogs.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{Utils.formatDate(r.date)}</td>
                        <td style={{ color: 'var(--primary-light)', fontWeight: 500 }}>
                          {r.course_name || `Course ${r.course}`}
                        </td>
                        <td>
                          <span className={Utils.getStatusBadgeClass(r.status)}>
                            {r.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontStyle: 'italic' }}>{r.remarks || '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{r.marked_by || 'System'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="text-center" style={{ padding: '40px', color: 'var(--text-muted)' }}>
                        <div className="no-records-icon">📭</div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>No records found</div>
                        <div style={{ fontSize: '0.75rem' }}>Your daily logs will appear here when marked.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

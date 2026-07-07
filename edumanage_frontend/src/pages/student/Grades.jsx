import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

export default function Grades() {
  const { user } = useAuthStore();
  const [allGrades, setAllGrades] = useState([]);
  const [activeExam, setActiveExam] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;

    const fetchGrades = async () => {
      try {
        const data = await API.get('grades/my_grades');
        if (isMounted && data) {
          setAllGrades(Array.isArray(data) ? data : (data.results || []));
        }
      } catch (e) {
        console.error('Failed to load grades:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchGrades();
    return () => { isMounted = false; };
  }, [user]);

  const gradeOrder = ['O', 'A+', 'A', 'B+', 'B', 'C', 'D', 'F'];
  const gradeClass = {
    'O': 'g-O', 'A+': 'g-Ap', 'A': 'g-A', 'B+': 'g-Bp',
    'B': 'g-B', 'C': 'g-C', 'D': 'g-D', 'F': 'g-F'
  };
  const gradeColor = {
    'O': '#00D4AA', 'A+': '#8B85FF', 'A': '#54A0FF', 'B+': '#FF9F43',
    'B': '#FFC107', 'C': '#C084FC', 'D': '#A0A0C0', 'F': '#FF6B6B'
  };

  const getPercentage = (g) => {
    const total = parseFloat(g.total_marks) || 100;
    return total > 0 ? Math.round((parseFloat(g.marks_obtained) / total) * 100) : 0;
  };

  // Calculate summary values
  const totalCount = allGrades.length;
  const averagePercentage = totalCount
    ? Math.round(allGrades.reduce((sum, g) => sum + getPercentage(g), 0) / totalCount)
    : 0;
  const failedCount = allGrades.filter(g => g.grade === 'F').length;
  const bestGrade = totalCount
    ? [...allGrades].map(g => g.grade).sort((a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b))[0]
    : '—';

  // Get unique exam types
  const examTypes = ['All', ...new Set(allGrades.map(g => g.exam_type).filter(Boolean))];

  // Filter and sort grades
  const filteredGrades = activeExam === 'All'
    ? allGrades
    : allGrades.filter(g => g.exam_type === activeExam);

  const sortedGrades = [...filteredGrades].sort((a, b) => getPercentage(b) - getPercentage(a));

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
          <h1>My Grades & transcripts</h1>
          <p id="reportSubtitle">
            {allGrades.length > 0 
              ? `${sortedGrades.length} grade record${sortedGrades.length > 1 ? 's' : ''} found.`
              : 'No grades published yet.'}
          </p>
        </div>
      </div>

      {/* Summary Row */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary">
          <div className="stat-icon">📚</div>
          <div className="stat-value" id="sumTotal">{totalCount || '—'}</div>
          <div className="stat-label">Total Courses</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">📈</div>
          <div className="stat-value" id="sumAvg">{totalCount ? `${averagePercentage}%` : '—'}</div>
          <div className="stat-label">Average Marks</div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon">🏆</div>
          <div className="stat-value" id="sumBest">{bestGrade}</div>
          <div className="stat-label">Best Grade</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-icon">❌</div>
          <div className="stat-value" id="sumFailed">{totalCount ? failedCount : '—'}</div>
          <div className="stat-label">Failed Courses</div>
        </div>
      </div>

      {/* Main Container */}
      <div className="card col-12">
        <div className="card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div className="card-title">📖 Subject Transcripts</div>
          <div id="examChips" style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            {examTypes.map((type, idx) => (
              <button 
                key={idx}
                className={`exam-chip ${type === activeExam ? 'active' : ''}`}
                onClick={() => setActiveExam(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body">
          <div className="grades-container" id="gradesList" style={{ display: 'grid', gap: '12px' }}>
            {sortedGrades.length ? (
              sortedGrades.map((g, i) => {
                const percentage = getPercentage(g);
                const grade = g.grade || '—';
                const color = gradeColor[grade] || '#6C63FF';
                const cls = gradeClass[grade] || 'g-O';
                const dateStr = g.exam_date 
                  ? new Date(g.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—';

                return (
                  <div className="grade-card" key={i}>
                    <div className={`grade-pill ${cls}`}>{grade}</div>

                    <div className="grade-info">
                      <div className="grade-course-name">{g.course_name || 'Unknown Course'}</div>
                      <span className="grade-course-code">{g.course_code || ''}</span>
                      <div className="grade-meta">
                        <span className="grade-meta-item">📋 {g.exam_type || 'Exam'}</span>
                        <span className="grade-meta-item">📅 {dateStr}</span>
                        {g.remarks && <span className="grade-meta-item">💬 {g.remarks}</span>}
                      </div>
                    </div>

                    <div className="score-section">
                      <div className="score-nums">
                        {g.marks_obtained} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/ {g.total_marks}</span>
                      </div>
                      <div className="score-pct">{percentage}%</div>
                      <div className="score-bar">
                        <div className="score-fill" style={{ width: `${percentage}%`, background: color }}></div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="no-grades">
                <div className="no-grades-icon">📭</div>
                <h3>No grades yet</h3>
                <p>Grades will appear here once they are published by your faculty.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

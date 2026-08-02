import { useState, useEffect, useMemo } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

const EXAM_TYPES = [
  { id: 'All', label: 'All', maxMarks: 100 },
  { id: 'Mid-Sem', label: 'Mid-Sem', keys: ['mid-sem', 'mid_sem', 'midsem'], maxMarks: 20 },
  { id: 'End-Sem', label: 'End-Sem', keys: ['end-sem', 'end_sem', 'endsem', 'external_marks'], maxMarks: 80 },
  { id: 'Practical', label: 'Practical', keys: ['practical'], maxMarks: 50 },
  { id: 'Viva', label: 'Viva', keys: ['viva'], maxMarks: 20 },
  { id: 'Projects', label: 'Projects', keys: ['projects', 'project'], maxMarks: 30 },
];

export default function Grades() {
  const { user, studentProfile } = useAuthStore();
  const [allGrades, setAllGrades] = useState([]);
  const [activeExam, setActiveExam] = useState('All');
  const [selectedSemester, setSelectedSemester] = useState('3');
  const [currentSemester, setCurrentSemester] = useState('3');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;

    const fetchGrades = async () => {
      try {
        setLoading(true);
        const studentId = studentProfile?.student_id || studentProfile?.id || user?.id;
        const data = await API.get(`marks?student_id=eq.${studentId}`);
        if (isMounted && data) {
          const list = Array.isArray(data) ? data : (data.results || []);
          setAllGrades(list);

          // Find current/highest semester present in student grades
          const semNums = list.map(g => {
            let sem = g.semester || g.semester_id || '';
            if (!sem && g.subject_code) {
              const m = g.subject_code.match(/\d/);
              if (m) sem = m[0];
            }
            return Number(sem);
          }).filter(n => !isNaN(n) && n > 0);

          const latestSem = semNums.length > 0 ? Math.max(...semNums) : 3;
          setCurrentSemester(String(latestSem));
          setSelectedSemester(String(latestSem));
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

  const availableSemesters = useMemo(() => {
    const sems = new Set();
    allGrades.forEach(g => {
      let sem = g.semester || g.semester_id || '';
      if (!sem && g.subject_code) {
        const m = g.subject_code.match(/\d/);
        if (m) sem = m[0];
      }
      if (sem) sems.add(String(sem));
    });
    const list = Array.from(sems).sort((a, b) => Number(a) - Number(b));
    return list.length > 0 ? list : ['1', '2', '3'];
  }, [allGrades]);

  const getScoreForExamType = (g, examTypeId) => {
    const rawM = g.marks || {};

    if (examTypeId === 'All') {
      let totalMax = 0;
      let totalObtained = 0;

      if (rawM && typeof rawM === 'object' && Object.keys(rawM).length > 0) {
        Object.entries(rawM).forEach(([key, val]) => {
          if (key === 'total_marks' || key === 'obtained_marks') return;

          const k = key.toLowerCase();
          let maxM = 100;
          if (k.includes('mid')) maxM = 20;
          else if (k.includes('end') || k.includes('external')) maxM = 80;
          else if (k.includes('practical')) maxM = 50;
          else if (k.includes('viva')) maxM = 20;
          else if (k.includes('project')) maxM = 30;

          totalMax += maxM;
          totalObtained += parseFloat(val) || 0;
        });
      }

      if (totalMax === 0) {
        totalMax = parseFloat(g.total_marks) || 100;
        totalObtained = parseFloat(g.marks_obtained) || 0;
      }

      const pct = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;

      let gradeLetter = 'F';
      if (pct >= 85) gradeLetter = 'A+';
      else if (pct >= 75) gradeLetter = 'A';
      else if (pct >= 65) gradeLetter = 'B+';
      else if (pct >= 60) gradeLetter = 'B';
      else if (pct >= 50) gradeLetter = 'C+';
      else if (pct >= 40) gradeLetter = 'C';
      else if (pct >= 35) gradeLetter = 'D';

      return {
        obtained: totalObtained,
        maxMarks: totalMax,
        percentage: pct,
        label: 'Overall Grade',
        gradePill: gradeLetter
      };
    }

    const config = EXAM_TYPES.find(t => t.id === examTypeId);
    if (!config) return { obtained: 0, maxMarks: 100, percentage: 0, label: examTypeId, gradePill: '—' };

    let val = null;
    for (const k of config.keys) {
      if (rawM[k] !== undefined && rawM[k] !== null) {
        val = parseFloat(rawM[k]);
        break;
      }
    }

    const obtained = val !== null ? val : 0;
    const maxMarks = config.maxMarks;
    const pct = maxMarks > 0 ? Math.round((obtained / maxMarks) * 100) : 0;

    let gradeLetter = 'F';
    if (pct >= 85) gradeLetter = 'A+';
    else if (pct >= 75) gradeLetter = 'A';
    else if (pct >= 65) gradeLetter = 'B+';
    else if (pct >= 60) gradeLetter = 'B';
    else if (pct >= 50) gradeLetter = 'C+';
    else if (pct >= 40) gradeLetter = 'C';
    else if (pct >= 35) gradeLetter = 'D';

    return {
      obtained,
      maxMarks,
      percentage: pct,
      label: config.label,
      gradePill: gradeLetter
    };
  };

  // Filter grades by selected semester
  const filteredGrades = useMemo(() => {
    return allGrades.filter(g => {
      let gSem = g.semester || g.semester_id || '';
      if (!gSem && g.subject_code) {
        const m = g.subject_code.match(/\d/);
        if (m) gSem = m[0];
      }
      return selectedSemester === 'all' || !selectedSemester || String(gSem) === String(selectedSemester);
    });
  }, [allGrades, selectedSemester]);

  // Calculate summary values for filtered grades based on selected exam type
  const totalCount = filteredGrades.length;
  const averagePercentage = totalCount
    ? Math.round(filteredGrades.reduce((sum, g) => sum + getScoreForExamType(g, activeExam).percentage, 0) / totalCount)
    : 0;
  const failedCount = filteredGrades.filter(g => getScoreForExamType(g, activeExam).percentage < 35).length;
  const bestGrade = totalCount
    ? [...filteredGrades].map(g => getScoreForExamType(g, activeExam).gradePill).sort((a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b))[0]
    : '—';

  const sortedGrades = [...filteredGrades].sort((a, b) => getScoreForExamType(b, activeExam).percentage - getScoreForExamType(a, activeExam).percentage);

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
          <div className="stat-icon" style={{ background: 'rgba(108, 99, 255, 0.2)', color: '#6C63FF' }}>
            <i className="bi bi-journal-check"></i>
          </div>
          <div>
            <h1>My Grades & Transcripts</h1>
            <p id="reportSubtitle">
              {filteredGrades.length > 0 
                ? `${sortedGrades.length} grade record${sortedGrades.length > 1 ? 's' : ''} shown for ${selectedSemester === 'all' ? 'All Semesters' : `Semester ${selectedSemester}`} · ${activeExam === 'All' ? 'All Exams' : activeExam}.`
                : 'No grades published for selected filters.'}
            </p>
          </div>
        </div>
      </div>

      {/* Semester Filter Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justify: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px',
        padding: '12px 18px',
        background: 'linear-gradient(135deg, rgba(26, 31, 55, 0.85) 0%, rgba(19, 23, 46, 0.85) 100%)',
        border: '1px solid rgba(108, 99, 255, 0.25)',
        borderRadius: '14px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(108, 99, 255, 0.15)',
            color: '#6C63FF',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            fontSize: '0.95rem'
          }}>
            <i className="bi bi-layers"></i>
          </div>
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Semester:</span>
          <select
            className="form-control"
            style={{
              minWidth: '170px',
              background: 'rgba(20, 24, 40, 0.8)',
              color: '#FFFFFF',
              border: '1px solid rgba(108, 99, 255, 0.35)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '0.875rem',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer'
            }}
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
          >
            <option value="all" style={{ background: '#141828', color: '#FFF' }}>All Semesters</option>
            {availableSemesters.map(s => (
              <option key={s} value={s} style={{ background: '#141828', color: '#FFF' }}>
                Semester {s} {String(s) === String(currentSemester) ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedSemester === String(currentSemester) ? (
            <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '8px' }}>
              <i className="bi bi-star-fill me-1"></i> Current Semester {currentSemester}
            </span>
          ) : selectedSemester === 'all' ? (
            <span className="badge badge-info" style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '8px' }}>
              All Semesters ({allGrades.length} Records)
            </span>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              style={{ borderRadius: '8px', color: 'var(--primary-light)', borderColor: 'rgba(108, 99, 255, 0.4)', fontSize: '0.8rem' }}
              onClick={() => setSelectedSemester(String(currentSemester))}
            >
              <i className="bi bi-arrow-counterclockwise me-1"></i> Show Current Semester ({currentSemester})
            </button>
          )}
        </div>
      </div>

      {/* Summary Row */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary">
          <div className="stat-icon"><i className="bi bi-book"></i></div>
          <div>
            <div className="stat-value" id="sumTotal">{totalCount || '—'}</div>
            <div className="stat-label">Total Courses</div>
          </div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon"><i className="bi bi-graph-up-arrow"></i></div>
          <div>
            <div className="stat-value" id="sumAvg">{totalCount ? `${averagePercentage}%` : '—'}</div>
            <div className="stat-label">Average Marks</div>
          </div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon"><i className="bi bi-trophy"></i></div>
          <div>
            <div className="stat-value" id="sumBest">{bestGrade}</div>
            <div className="stat-label">Best Grade</div>
          </div>
        </div>
        <div className="stat-card danger">
          <div className="stat-icon"><i className="bi bi-x-circle"></i></div>
          <div>
            <div className="stat-value" id="sumFailed">{totalCount ? failedCount : '—'}</div>
            <div className="stat-label">Failed Courses</div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="card col-12">
        <div className="card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div className="card-title"><i className="bi bi-journal-bookmark"></i> Subject Transcripts</div>
          
          {/* Exam Type Filter Chips */}
          <div id="examChips" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {EXAM_TYPES.map((t) => (
              <button 
                key={t.id}
                className={`exam-chip ${t.id === activeExam ? 'active' : ''}`}
                onClick={() => setActiveExam(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body">
          <div className="grades-container" id="gradesList" style={{ display: 'grid', gap: '12px' }}>
            {sortedGrades.length ? (
              sortedGrades.map((g, i) => {
                const scoreObj = getScoreForExamType(g, activeExam);
                const color = gradeColor[scoreObj.gradePill] || '#6C63FF';
                const cls = gradeClass[scoreObj.gradePill] || 'g-O';

                return (
                  <div className="grade-card" key={i}>
                    <div className={`grade-pill ${cls}`}>{scoreObj.gradePill}</div>

                    <div className="grade-info">
                      <div className="grade-course-name">{g.course_name || 'Unknown Course'}</div>
                      <span className="grade-course-code">{g.course_code || ''}</span>

                      {/* Component breakdown when All is selected */}
                      {activeExam === 'All' && g.marks && typeof g.marks === 'object' && Object.keys(g.marks).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                          {Object.entries(g.marks)
                            .filter(([key]) => key !== 'total_marks' && key !== 'obtained_marks')
                            .map(([key, val]) => {
                              const label = key
                                .replace(/[-_]/g, ' ')
                                .replace(/marks/gi, '')
                                .trim()
                                .replace(/\b\w/g, l => l.toUpperCase());
                              
                              // Determine max marks for label
                              let maxM = '';
                              if (key.includes('mid')) maxM = '/ 20';
                              else if (key.includes('end') || key.includes('external')) maxM = '/ 80';
                              else if (key.includes('practical')) maxM = '/ 50';
                              else if (key.includes('viva')) maxM = '/ 20';
                              else if (key.includes('project')) maxM = '/ 30';

                              return (
                                <span 
                                  key={key} 
                                  style={{
                                    padding: '3px 9px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    background: 'rgba(108, 99, 255, 0.12)',
                                    color: '#E2E8F0',
                                    border: '1px solid rgba(108, 99, 255, 0.25)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <span style={{ color: '#A0AEC0', fontWeight: 500 }}>{label}:</span>
                                  <span style={{ color: '#818CF8', fontWeight: 700 }}>{val} {maxM}</span>
                                </span>
                              );
                            })}
                        </div>
                      )}

                      <div className="grade-meta" style={{ marginTop: '8px' }}>
                        <span className="grade-meta-item">
                          <i className="bi bi-clipboard"></i> {activeExam === 'All' ? (g.exam_type || 'Semester End Exam') : scoreObj.label}
                        </span>
                        {g.remarks && <span className="grade-meta-item"><i className="bi bi-chat-dots"></i> {g.remarks}</span>}
                      </div>
                    </div>

                    <div className="score-section">
                      <div className="score-nums">
                        {scoreObj.obtained} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/ {scoreObj.maxMarks}</span>
                      </div>
                      <div className="score-pct">{scoreObj.percentage}%</div>
                      <div className="score-bar">
                        <div className="score-fill" style={{ width: `${scoreObj.percentage}%`, background: color }}></div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="no-grades">
                <div className="no-grades-icon"><i className="bi bi-inbox"></i></div>
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

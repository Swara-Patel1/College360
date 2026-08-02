import { useState, useEffect, useMemo } from 'react';
import { API } from '../../api/client.js';
import { Toast } from '../../store/useNotifStore.js';
import DownloadDropdown from '../../components/DownloadDropdown.jsx';

export default function AdminGrades() {
  const [grades, setGrades] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Load data from PostgreSQL backend marks table
  const loadData = async () => {
    try {
      setLoading(true);
      
      const [marksRes, subjectsRes, semestersRes] = await Promise.all([
        fetch('http://localhost:8000/rest/v1/marks?limit=5000').catch(() => null),
        fetch('http://localhost:8000/rest/v1/subjects').catch(() => null),
        fetch('http://localhost:8000/rest/v1/semesters').catch(() => null),
      ]);

      const marksData = marksRes && marksRes.ok ? await marksRes.json() : [];
      const subjectsData = subjectsRes && subjectsRes.ok ? await subjectsRes.json() : [];
      const semestersData = semestersRes && semestersRes.ok ? await semestersRes.json() : [];

      const marksList = Array.isArray(marksData) ? marksData : [];
      const subjectsList = Array.isArray(subjectsData) ? subjectsData : [];
      const semestersList = Array.isArray(semestersData) ? semestersData : [];

      setGrades(marksList);
      setSubjects(subjectsList);
      setSemesters(semestersList);
    } catch (err) {
      console.error('Error loading marks from PostgreSQL:', err);
      Toast.error('Failed to load marks from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered grades list
  const filteredGrades = useMemo(() => {
    return grades.filter(g => {
      // Extract student name
      const stFirst = g.student?.first_name || g.first_name || '';
      const stLast = g.student?.last_name || g.last_name || '';
      const stName = (g.student_name || `${stFirst} ${stLast}`.trim() || 'Student').toLowerCase();
      
      // Extract enrollment number
      const enroll = (g.enrollment_no || g.student?.enrollment_no || '').toLowerCase();
      
      // Extract subject name & code
      const subName = (g.subject_name || g.course_name || g.course?.name || '').toLowerCase();
      const subCode = (g.subject_code || g.course_code || g.course?.code || '').toLowerCase();
      
      const q = search.toLowerCase().trim();

      const matchesSearch = !q || stName.includes(q) || enroll.includes(q) || subName.includes(q) || subCode.includes(q);
      const matchesSubject = !selectedSubject || g.subject_id === selectedSubject || g.course_id === selectedSubject || subCode === selectedSubject.toLowerCase();
      
      // Semester match
      const semVal = String(g.semester || g.sem_number || g.semester_number || g.semester_id || '');
      const matchesSemester = !selectedSemester || semVal === String(selectedSemester) || String(g.semester_id) === String(selectedSemester);

      const matchesGrade = !selectedGrade || (g.grade || '').toUpperCase() === selectedGrade.toUpperCase();

      return matchesSearch && matchesSubject && matchesSemester && matchesGrade;
    });
  }, [grades, search, selectedSubject, selectedSemester, selectedGrade]);

  // Pagination reset
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedSubject, selectedSemester, selectedGrade]);

  const totalPages = Math.ceil(filteredGrades.length / pageSize) || 1;
  const paginatedGrades = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredGrades.slice(start, start + pageSize);
  }, [filteredGrades, currentPage]);

  // Statistics
  const totalRecords = grades.length;
  const passCount = useMemo(() => grades.filter(g => (g.grade || '').toUpperCase() !== 'F').length, [grades]);
  const failCount = useMemo(() => grades.filter(g => (g.grade || '').toUpperCase() === 'F').length, [grades]);
  const avgPct = useMemo(() => {
    if (!grades.length) return 0;
    const sum = grades.reduce((acc, g) => acc + (parseFloat(g.percentage) || 0), 0);
    return (sum / grades.length).toFixed(1);
  }, [grades]);

  // Data Exports
  const getExportRows = () => filteredGrades.map((g, i) => {
    const stFirst = g.student?.first_name || g.first_name || '';
    const stLast = g.student?.last_name || g.last_name || '';
    const stName = g.student_name || `${stFirst} ${stLast}`.trim() || 'Student';
    const enroll = g.enrollment_no || g.student?.enrollment_no || '—';
    const subName = g.subject_name || g.course_name || g.course?.name || '—';
    const subCode = g.subject_code || g.course_code || g.course?.code || '—';
    const sem = g.semester || g.sem_number || '—';
    return [
      i + 1,
      stName,
      enroll,
      subName,
      subCode,
      `Sem ${sem}`,
      g.marks_obtained ?? 0,
      g.total_marks ?? 100,
      `${g.percentage ?? 0}%`,
      g.grade || 'N/A'
    ];
  });

  const exportCSV = () => {
    if (!filteredGrades.length) { Toast.error('No grade records to export.'); return; }
    const headers = ['#', 'Student Name', 'Enrollment No', 'Subject Name', 'Subject Code', 'Semester', 'Marks Obtained', 'Total Marks', 'Percentage', 'Grade'];
    const rows = getExportRows().map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `grades_export_${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
    Toast.success('Exported CSV successfully!');
  };

  const exportExcel = () => {
    if (!filteredGrades.length) { Toast.error('No grade records to export.'); return; }
    exportCSV();
  };

  const exportPDF = () => {
    if (!filteredGrades.length) { Toast.error('No grade records to export.'); return; }
    exportCSV();
  };

  const getGradeBadgeClass = (grade) => {
    const g = (grade || '').toUpperCase();
    if (['O', 'A+', 'A'].includes(g)) return 'badge badge-success';
    if (['B+', 'B'].includes(g)) return 'badge badge-info';
    if (['C', 'D'].includes(g)) return 'badge badge-warning';
    if (g === 'F') return 'badge badge-danger';
    return 'badge badge-muted';
  };

  if (loading && !grades.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <h1><i className="bi bi-journal-check"></i> Grades & Marks Management</h1>
          <p>View, track, and manage all student academic grades loaded from PostgreSQL database <code style={{ background: 'rgba(108,99,255,0.15)', color: '#8B5CF6', padding: '2px 6px', borderRadius: '4px' }}>marks</code> table.</p>
        </div>
        <div className="page-header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <DownloadDropdown
            onCSV={exportCSV}
            onExcel={exportExcel}
            onPDF={exportPDF}
          />
          <button className="btn btn-primary" onClick={loadData}>
            <i className="bi bi-arrow-clockwise"></i> Refresh Data
          </button>
        </div>
      </div>

      {/* ── Mini Stats Grid ── */}
      <div className="stats-mini">
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(108,99,255,0.2)' }}><i className="bi bi-collection-fill"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: '#6C63FF' }}>{totalRecords}</div>
            <div className="stats-mini-lbl">TOTAL MARKS RECORDS</div>
          </div>
        </div>

        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(16,185,129,0.2)' }}><i className="bi bi-check-circle-fill"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: '#10B981' }}>{passCount}</div>
            <div className="stats-mini-lbl">PASSED RECORDS</div>
          </div>
        </div>

        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(239,68,68,0.2)' }}><i className="bi bi-x-circle-fill"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: '#EF4444' }}>{failCount}</div>
            <div className="stats-mini-lbl">FAILED RECORDS</div>
          </div>
        </div>

        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(59,130,246,0.2)' }}><i className="bi bi-graph-up-arrow"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: '#3B82F6' }}>{avgPct}%</div>
            <div className="stats-mini-lbl">AVERAGE PERCENTAGE</div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar & Table Card ── */}
      <div className="card">
        {/* Filters */}
        <div className="filters-bar" style={{ display: 'flex', gap: '10px', padding: '15px 20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 2, minWidth: '220px' }}>
            <input
              type="text"
              className="form-input"
              style={{ width: '100%' }}
              placeholder="Search by student name, enrollment no, or subject code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-input"
            style={{ flex: 1, minWidth: '160px' }}
            value={selectedSubject}
            onChange={e => setSelectedSubject(e.target.value)}
          >
            <option value="" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>All Subjects ({subjects.length})</option>
            {subjects.map(sub => (
              <option key={sub.subject_id || sub.id} value={sub.code || sub.subject_id || sub.id} style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>
                {sub.name} ({sub.code})
              </option>
            ))}
          </select>
          <select
            className="form-input"
            style={{ flex: 1, minWidth: '140px' }}
            value={selectedSemester}
            onChange={e => setSelectedSemester(e.target.value)}
          >
            <option value="" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>All Semesters</option>
            {semesters.map(s => (
              <option key={s.semester_id || s.id} value={s.number || s.semester_id} style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>
                Semester {s.number || s.name?.replace('Semester ', '')}
              </option>
            ))}
          </select>
          <select
            className="form-input"
            style={{ flex: 1, minWidth: '130px' }}
            value={selectedGrade}
            onChange={e => setSelectedGrade(e.target.value)}
          >
            <option value="" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>All Grades</option>
            <option value="O" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>Grade O (Outstanding)</option>
            <option value="A+" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>Grade A+</option>
            <option value="A" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>Grade A</option>
            <option value="B+" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>Grade B+</option>
            <option value="B" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>Grade B</option>
            <option value="C" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>Grade C</option>
            <option value="D" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>Grade D</option>
            <option value="F" style={{ background: 'var(--bg-card, #0f172a)', color: '#fff' }}>Grade F (Fail)</option>
          </select>
        </div>

        {/* Table */}
        {!paginatedGrades.length ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <i className="bi bi-file-earmark-x" style={{ fontSize: '3rem', color: 'var(--text-secondary, #94a3b8)', opacity: 0.5 }}></i>
            <h3 style={{ marginTop: '16px', color: 'var(--text-primary, #fff)' }}>No Grade Records Found</h3>
            <p style={{ color: 'var(--text-secondary, #94a3b8)' }}>Try clearing your search query or subject filters.</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover, rgba(255,255,255,0.03))', borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>Student Name</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>Enrollment No</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>Subject</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center' }}>Semester</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center' }}>Marks Obtained</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center' }}>Percentage</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center' }}>Grade</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center' }}>Result Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedGrades.map((g, idx) => {
                    const rowIndex = (currentPage - 1) * pageSize + idx + 1;
                    const stFirst = g.student?.first_name || g.first_name || '';
                    const stLast = g.student?.last_name || g.last_name || '';
                    const stName = g.student_name || `${stFirst} ${stLast}`.trim() || 'Student';
                    const enroll = g.enrollment_no || g.student?.enrollment_no || '—';
                    const subName = g.subject_name || g.course_name || g.course?.name || 'Subject';
                    const subCode = g.subject_code || g.course_code || g.course?.code || '—';
                    const semNumber = g.semester || g.sem_number || '—';
                    const obtained = g.marks_obtained ?? 0;
                    const total = g.total_marks ?? 100;
                    const pct = parseFloat(g.percentage ?? 0);
                    const gradeLetter = (g.grade || 'N/A').toUpperCase();
                    const isFail = gradeLetter === 'F';

                    return (
                      <tr key={g.mark_id || g.id || idx} style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.05))' }}>
                        <td style={{ padding: '14px 20px', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.88rem' }}>
                          {rowIndex}
                        </td>
                        <td style={{ padding: '14px 20px', fontWeight: '600', color: 'var(--text-primary, #fff)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(108,99,255,0.2)', color: '#6C63FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: '700' }}>
                              {stName.charAt(0)}
                            </div>
                            <span>{stName}</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px', color: 'var(--text-secondary, #94a3b8)', fontFamily: 'monospace' }}>
                          {enroll}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary, #fff)' }}>{subName}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)', marginTop: '2px' }}>
                            <span className="badge badge-muted" style={{ fontSize: '0.72rem', padding: '2px 6px' }}>{subCode}</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <span className="badge badge-muted" style={{ fontSize: '0.8rem', padding: '3px 8px' }}>
                            Sem {semNumber}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: '700' }}>
                          {obtained} <span style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: '400', fontSize: '0.85rem' }}>/ {total}</span>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, maxWidth: '80px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: isFail ? '#EF4444' : '#10B981', borderRadius: '3px' }}></div>
                            </div>
                            <span style={{ fontWeight: '600', fontSize: '0.88rem' }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <span className={getGradeBadgeClass(gradeLetter)} style={{ padding: '4px 10px', fontSize: '0.82rem', fontWeight: '700' }}>
                            {gradeLetter}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <span className={isFail ? 'badge badge-danger' : 'badge badge-success'} style={{ padding: '4px 10px', fontSize: '0.82rem' }}>
                            {isFail ? 'FAIL' : 'PASS'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border, rgba(255,255,255,0.1))', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.88rem' }}>
                Showing <strong style={{ color: 'var(--text-primary, #fff)' }}>{Math.min((currentPage - 1) * pageSize + 1, filteredGrades.length)}</strong> to <strong style={{ color: 'var(--text-primary, #fff)' }}>{Math.min(currentPage * pageSize, filteredGrades.length)}</strong> of <strong style={{ color: 'var(--text-primary, #fff)' }}>{filteredGrades.length}</strong> grade records
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="btn btn-ghost"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
                >
                  <i className="bi bi-chevron-left"></i> Previous
                </button>
                <span style={{ padding: '0 8px', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.88rem' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-ghost"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  style={{ opacity: currentPage >= totalPages ? 0.5 : 1 }}
                >
                  Next <i className="bi bi-chevron-right"></i>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

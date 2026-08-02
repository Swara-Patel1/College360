import { useState, useEffect } from 'react';
import { API } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';

export default function Grades() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({}); // student_id -> marks_obtained
  const [totalMarks, setTotalMarks] = useState(100);
  const [gradesLog, setGradesLog] = useState([]);
  const [filterCourse, setFilterCourse] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEntryMode, setIsEntryMode] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      // Determine if user is HOD or Faculty
      const isHod = user?.role === 'hod' || (Array.isArray(user?.roles) ? user.roles.includes('hod') : user?.roles === 'hod');

      // Resolve Faculty profile
      let prof = await API.get(`faculty/my_profile?user_id=${user.id}`).catch(() => null);
      setProfile(prof);

      // Resolve HOD Department ID
      let hodDeptId = user?.department_id || user?.department?.id || user?.department?.department_id || '';
      
      if (isHod || !hodDeptId) {
        const allHods = await API.get('hod').catch(() => []);
        if (Array.isArray(allHods)) {
          const match = allHods.find(h => 
            String(h.user_id || h.user?.id || h.user?.user_id || '').toLowerCase() === String(user.id).toLowerCase() ||
            (user.email && String(h.email || h.user?.email || '').toLowerCase() === String(user.email).toLowerCase())
          );
          if (match) {
            hodDeptId = match.department_id || match.department?.department_id || match.department?.id || hodDeptId;
          }
        }
      }

      if (!hodDeptId && prof) {
        hodDeptId = prof.department_id || prof.department?.department_id || prof.department?.id || '';
      }

      // Fetch all subjects, grades, department students, and semesters
      const [allCoursesRes, allGradesRes, deptStudentsRes, semestersRes] = await Promise.all([
        fetch('http://localhost:8000/rest/v1/subjects').catch(() => null),
        fetch('http://localhost:8000/rest/v1/marks?limit=5000').catch(() => null),
        hodDeptId
          ? fetch(`http://localhost:8000/rest/v1/students?department_id=eq.${hodDeptId}&limit=2000`).catch(() => null)
          : fetch('http://localhost:8000/rest/v1/students?limit=2000').catch(() => null),
        fetch('http://localhost:8000/rest/v1/semesters').catch(() => null)
      ]);

      const allCourses = allCoursesRes && allCoursesRes.ok ? await allCoursesRes.json() : [];
      const allGrades = allGradesRes && allGradesRes.ok ? await allGradesRes.json() : [];
      const deptStudents = deptStudentsRes && deptStudentsRes.ok ? await deptStudentsRes.json() : [];
      const semestersData = semestersRes && semestersRes.ok ? await semestersRes.json() : [];

      const deptStudentIds = new Set((deptStudents || []).map(s => String(s.student_id || s.id)));

      setSemesters(Array.isArray(semestersData) ? semestersData : []);

      // Courses for HOD: ONLY subjects where subject department_id matches HOD department_id
      let myCoursesList = [];
      if (isHod && hodDeptId) {
        myCoursesList = (allCourses || []).filter(c => {
          const cDeptId = String(c.department_id || c.department?.department_id || c.department?.id || c.department || '').toLowerCase();
          return cDeptId === String(hodDeptId).toLowerCase();
        });
      } else if (prof) {
        const facId = prof.id || prof.faculty_id;
        const subjId = prof.subject_id;
        myCoursesList = (allCourses || []).filter(c => 
          c.faculty_id === facId || 
          c.faculty?.faculty_id === facId || 
          c.faculty?.id === facId ||
          (subjId && (c.subject_id === subjId || c.id === subjId))
        );
      } else {
        myCoursesList = allCourses || [];
      }

      setCourses(myCoursesList);

      const mySubjectIds = new Set(myCoursesList.map(c => String(c.subject_id || c.id)));

      // Filter Grades Log for HOD
      let myGradesLog = [];
      if (isHod && hodDeptId) {
        myGradesLog = (allGrades || []).filter(g => {
          const subId = String(g.subject_id || g.course?.subject_id || g.course_id || '');
          const studId = String(g.student_id || g.student?.student_id || g.student?.id || '');
          const gDeptId = String(g.student?.department_id || g.department_id || '');

          return (
            mySubjectIds.has(subId) ||
            (gDeptId && gDeptId.toLowerCase() === String(hodDeptId).toLowerCase()) ||
            (deptStudentIds.size > 0 && deptStudentIds.has(studId))
          );
        });
      } else if (prof) {
        const subjId = prof.subject_id;
        myGradesLog = (allGrades || []).filter(g => 
          mySubjectIds.has(String(g.subject_id || g.course?.subject_id || g.course_id)) ||
          (subjId && (g.subject_id === subjId || g.course?.subject_id === subjId))
        );
      } else {
        myGradesLog = allGrades || [];
      }

      setGradesLog(myGradesLog);
    } catch (e) {
      console.error('Failed to load grades entry data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadInitialData();
  }, [user]);

  const loadStudentsForCourse = async (courseId) => {
    if (!courseId) {
      setStudents([]);
      return;
    }
    try {
      setLoading(true);
      const marksData = await API.get(`marks?subject_id=eq.${courseId}`).catch(() => []);
      let roster = [];
      if (Array.isArray(marksData) && marksData.length > 0) {
        roster = marksData.map(m => ({
          student: m.student_id || m.student?.student_id || m.student?.id,
          student_name: m.student ? `${m.student.first_name || ''} ${m.student.last_name || ''}`.trim() : (m.student_name || 'Student'),
          current_rollno: m.student?.enrollment_no || m.student?.current_rollno || '—',
          existing_marks: m.marks_obtained || (m.internal_marks + m.external_marks) || ''
        }));
      } else {
        const enrolled = await API.get(`enrollments?course=${courseId}`).catch(() => []);
        if (Array.isArray(enrolled)) {
          roster = enrolled.map(s => ({
            student: s.student,
            student_name: s.student_name || 'Student',
            current_rollno: s.current_rollno || '—',
            existing_marks: ''
          }));
        }
      }

      setStudents(roster);
      
      const initialMarks = {};
      roster.forEach(s => {
        initialMarks[s.student] = s.existing_marks !== undefined ? String(s.existing_marks) : '';
      });
      setMarks(initialMarks);
    } catch (e) {
      console.error('Failed to load students for course:', e);
      Toast.error('Could not load student list.');
    } finally {
      setLoading(false);
    }
  };

  const handleCourseChange = (e) => {
    const courseId = e.target.value;
    setSelectedCourse(courseId);
    loadStudentsForCourse(courseId);
  };

  const handleMarkChange = (studentId, val) => {
    setMarks(prev => ({
      ...prev,
      [studentId]: val
    }));
  };

  const submitGrades = async () => {
    if (!selectedCourse) {
      Toast.warning('Please select a subject.');
      return;
    }
    if (!students.length) {
      Toast.warning('No students to enter grades for.');
      return;
    }

    const incomplete = students.some(s => marks[s.student] === undefined || marks[s.student] === '');
    if (incomplete) {
      Toast.warning('Please enter marks for all students.');
      return;
    }

    try {
      setSubmitting(true);
      
      const promises = students.map(s => {
        return API.post('grades', {
          student: s.student,
          course: selectedCourse,
          subject_id: selectedCourse,
          marks_obtained: parseFloat(marks[s.student]),
          total_marks: parseFloat(totalMarks)
        });
      });

      await Promise.all(promises);
      Toast.success('Grades saved successfully!');
      setIsEntryMode(false);
      setSelectedCourse('');
      setStudents([]);
      loadInitialData();
    } catch (e) {
      console.error('Failed to submit grades:', e);
      Toast.error('Failed to save grades.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCsvImport = async (file) => {
    if (!file) return;
    if (!selectedCourse) {
      Toast.warning('Select a subject before importing.');
      return;
    }
    if (!/\.(csv|txt)$/i.test(file.name)) {
      Toast.warning('Please upload a .csv file (roll number / enrollment / name, marks).');
      return;
    }
    try {
      setImporting(true);
      setImportResult(null);
      const csvText = await file.text();
      const result = await API.post('grades/bulk-import', {
        course_id: selectedCourse,
        subject_id: selectedCourse,
        total_marks: parseFloat(totalMarks) || 100,
        csv_text: csvText,
      });
      setImportResult(result);
      if (result.imported > 0) {
        Toast.success(`Imported ${result.imported} grade(s)${result.skipped ? `, skipped ${result.skipped}` : ''}.`);
        loadInitialData();
      } else {
        Toast.warning('No rows matched enrolled students. Check the identifiers in your CSV.');
      }
    } catch (e) {
      console.error('CSV import failed:', e);
      Toast.error('Failed to import CSV.');
    } finally {
      setImporting(false);
    }
  };

  const filteredGrades = gradesLog.filter(g => {
    const matchesCourse = filterCourse 
      ? (g.subject_id === filterCourse || g.course?.subject_id === filterCourse || g.course_code === filterCourse) 
      : true;

    const semVal = String(g.semester || g.sem_number || g.semester_number || g.semester_id || '');
    const matchesSemester = filterSemester
      ? (semVal === String(filterSemester) || String(g.semester_id) === String(filterSemester))
      : true;

    return matchesCourse && matchesSemester;
  });

  if (loading && !students.length && !gradesLog.length) {
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
          <h1>Grades Management</h1>
          <p>Enter exam grades and track class performance.</p>
        </div>
        <div className="page-header-right">
          <button 
            className="btn btn-primary" 
            onClick={() => setIsEntryMode(!isEntryMode)}
          >
            {isEntryMode ? <><i className="bi bi-clipboard me-1"></i>View Records</> : <><i className="bi bi-pencil-square me-1"></i>Enter Grades</>}
          </button>
        </div>
      </div>

      {isEntryMode ? (
        /* ENTER GRADES MODE */
        <div className="card col-12">
          <div className="card-header">
            <div className="card-title"><i className="bi bi-pencil-square"></i> Enter Semester Grades</div>
          </div>
          <div className="card-body">
            <div className="form-row" style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 2, minWidth: '240px' }}>
                <label className="form-label">Subject</label>
                <select className="form-input" value={selectedCourse} onChange={handleCourseChange}>
                  <option value="">Select Subject</option>
                  {courses.map(c => (
                    <option key={c.subject_id || c.id} value={c.subject_id || c.id}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: '160px' }}>
                <label className="form-label">Total Marks</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={totalMarks} 
                  onChange={e => setTotalMarks(e.target.value)} 
                />
              </div>
            </div>

            {/* CSV Import */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleCsvImport(e.dataTransfer.files?.[0]); }}
              style={{
                border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: '12px', padding: '20px', textAlign: 'center', marginBottom: '20px',
                background: dragOver ? 'rgba(108,99,255,0.08)' : 'var(--bg-secondary)', transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}><i className="bi bi-box-arrow-in-down"></i></div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                {importing ? 'Importing…' : 'Bulk import marks from CSV'}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                Drag &amp; drop or browse a <code>.csv</code> — columns: <strong>roll no / enrollment / name</strong>, <strong>marks</strong>.
                Grades are matched &amp; computed on the server.
              </p>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                Browse file
                <input
                  type="file" accept=".csv,.txt" hidden disabled={importing}
                  onChange={(e) => { handleCsvImport(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </div>

            {importResult && (
              <div className="card" style={{ marginBottom: '20px', padding: '14px 18px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '0.85rem', marginBottom: importResult.rows?.length ? '10px' : 0 }}>
                  <span><i className="bi bi-check-circle-fill"></i> Imported: <strong>{importResult.imported}</strong></span>
                  <span><i className="bi bi-skip-end"></i> Skipped: <strong>{importResult.skipped}</strong></span>
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setImportResult(null)}>Dismiss</button>
                </div>
                {importResult.rows?.some(r => r.status === 'skipped') && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Skipped rows: {importResult.rows.filter(r => r.status === 'skipped').map(r => `${r.identifier} (${r.reason})`).join(', ')}
                  </div>
                )}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner"></div></div>
            ) : students.length > 0 ? (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Roll No</th>
                      <th>Student Name</th>
                      <th>Marks Obtained (Max: {totalMarks})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.student}>
                        <td>{s.current_rollno || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{s.student_name}</td>
                        <td>
                          <input 
                            type="number"
                            min="0"
                            max={totalMarks}
                            className="form-input"
                            style={{ width: '140px' }}
                            placeholder="Enter marks"
                            value={marks[s.student] || ''}
                            onChange={(e) => handleMarkChange(s.student, e.target.value)} 
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
                  <button className="btn btn-ghost" onClick={() => setIsEntryMode(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={submitGrades} disabled={submitting}>
                    {submitting ? 'Saving...' : <><i className="bi bi-save me-1"></i>Save Grades</>}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><i className="bi bi-pencil-square"></i></div>
                <p>Select a subject to view students and enter grades</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VIEW RECORDS LOG MODE */
        <div className="card col-12">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div className="card-title"><i className="bi bi-clipboard"></i> Grades Log</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select className="form-input" style={{ width: '220px', padding: '6px 10px', fontSize: '0.8rem' }} value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
                <option value="" style={{ background: '#141828', color: '#FFF' }}>All Subjects ({courses.length})</option>
                {courses.map(c => (
                  <option key={c.subject_id || c.id} value={c.subject_id || c.id} style={{ background: '#141828', color: '#FFF' }}>{c.code} — {c.name}</option>
                ))}
              </select>
              <select className="form-input" style={{ width: '160px', padding: '6px 10px', fontSize: '0.8rem' }} value={filterSemester} onChange={e => setFilterSemester(e.target.value)}>
                <option value="" style={{ background: '#141828', color: '#FFF' }}>All Semesters</option>
                {semesters.map(s => (
                  <option key={s.semester_id || s.id} value={s.number || s.semester_id} style={{ background: '#141828', color: '#FFF' }}>Semester {s.number || s.name?.replace('Semester ', '')}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {filteredGrades.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Subject Code</th>
                    <th>Subject Name</th>
                    <th>Semester</th>
                    <th>Marks Obtained</th>
                    <th>Percentage</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrades.map((g, idx) => {
                    const semNumber = g.semester || g.sem_number || '—';
                    return (
                      <tr key={g.mark_id || idx}>
                        <td style={{ fontWeight: 600 }}>{g.student_name || (g.student ? `${g.student.first_name || ''} ${g.student.last_name || ''}`.trim() : 'Student')}</td>
                        <td><strong>{g.course_code || g.course?.code || 'CE204'}</strong></td>
                        <td>{g.subject_name || g.course_name || g.course?.name || 'Data Structures'}</td>
                        <td>
                          <span className="badge badge-muted" style={{ fontSize: '0.78rem', padding: '3px 8px' }}>
                            Sem {semNumber}
                          </span>
                        </td>
                        <td>{g.marks_obtained} / {g.total_marks || 100}</td>
                        <td>{g.percentage}%</td>
                        <td>
                          <span className={`badge badge-${g.grade === 'F' ? 'danger' : 'primary'}`}>
                            {g.grade || 'A'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><i className="bi bi-clipboard"></i></div>
                <p>No student grade records found.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

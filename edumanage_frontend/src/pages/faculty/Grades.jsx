import { useState, useEffect } from 'react';
import { API } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';

export default function Grades() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({}); // student_id -> marks_obtained
  const [totalMarks, setTotalMarks] = useState(100);
  const [gradesLog, setGradesLog] = useState([]);
  const [filterCourse, setFilterCourse] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEntryMode, setIsEntryMode] = useState(false);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const prof = await API.get('faculty/my_profile');
      setProfile(prof);
      if (!prof) return;

      const [allCourses, allGrades] = await Promise.all([
        API.get('courses'),
        API.get('grades')
      ]);

      const myCoursesList = (allCourses || []).filter(c => c.faculty_id === prof.id);
      setCourses(myCoursesList);
      
      const myCourseIds = myCoursesList.map(c => c.subject_id);
      const myGradesLog = (allGrades || []).filter(g => myCourseIds.includes(g.subject_id));
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
      const enrolled = await API.get(`enrollments?course=${courseId}`);
      setStudents(enrolled || []);
      
      // Initialize marks with empty strings
      const initialMarks = {};
      (enrolled || []).forEach(s => {
        initialMarks[s.student] = '';
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
      Toast.warning('Please select a course.');
      return;
    }
    if (!students.length) {
      Toast.warning('No students to enter grades for.');
      return;
    }

    // Check if any mark field is empty
    const incomplete = students.some(s => marks[s.student] === undefined || marks[s.student] === '');
    if (incomplete) {
      Toast.warning('Please enter marks for all students.');
      return;
    }

    try {
      setSubmitting(true);
      
      // Save grades for each student sequentially
      const promises = students.map(s => {
        return API.post('grades', {
          student: s.student,
          course: selectedCourse,
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

  const filteredGrades = gradesLog.filter(g => {
    return filterCourse ? g.subject_id === filterCourse : true;
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
            {isEntryMode ? '📋 View Records' : '📝 Enter Grades'}
          </button>
        </div>
      </div>

      {isEntryMode ? (
        /* ENTER GRADES MODE */
        <div className="card col-12">
          <div className="card-header">
            <div className="card-title">📝 Enter Semester Grades</div>
          </div>
          <div className="card-body">
            <div className="form-row" style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Course</label>
                <select className="form-input" value={selectedCourse} onChange={handleCourseChange}>
                  <option value="">Select Course</option>
                  {courses.map(c => (
                    <option key={c.subject_id} value={c.subject_id}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Total Marks</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={totalMarks} 
                  onChange={(e) => setTotalMarks(e.target.value)} 
                />
              </div>
            </div>

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
                            style={{ width: '120px' }}
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
                    {submitting ? 'Saving...' : '📝 Save Grades'}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <p>Select a course to view students and enter grades</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VIEW RECORDS LOG MODE */
        <div className="card col-12">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title">📋 Grades Log</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select className="form-input" style={{ width: '200px', padding: '6px 10px', fontSize: '0.8rem' }} value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
                <option value="">All Courses</option>
                {courses.map(c => (
                  <option key={c.subject_id} value={c.subject_id}>{c.code} — {c.name}</option>
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
                    <th>Course Code</th>
                    <th>Course Name</th>
                    <th>Marks Obtained</th>
                    <th>Percentage</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrades.map((g, idx) => (
                    <tr key={g.mark_id || idx}>
                      <td style={{ fontWeight: 600 }}>{g.student_name}</td>
                      <td><strong>{g.course_code}</strong></td>
                      <td>{g.course_name}</td>
                      <td>{g.marks_obtained} / {g.total_marks}</td>
                      <td>{g.percentage}%</td>
                      <td>
                        <span className={`badge badge-${g.grade === 'F' ? 'danger' : 'primary'}`}>
                          {g.grade}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <p>No student grade records found.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';

export default function Attendance() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState([]);
  const [attendanceStatuses, setAttendanceStatuses] = useState({});
  const [history, setHistory] = useState([]);
  
  // Filter States for View Records
  const [filterCourse, setFilterCourse] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isMarkingMode, setIsMarkingMode] = useState(false);

  // Stats
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, percentage: '0.0' });

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const prof = await API.get('faculty/my_profile');
      setProfile(prof);
      if (!prof) return;

      const [allCourses, allAttendance] = await Promise.all([
        API.get('courses'),
        API.get('attendance')
      ]);

      const myCoursesList = (allCourses || []).filter(c => c.faculty_id === prof.id);
      setCourses(myCoursesList);
      
      // Filter attendance history to only display records for courses taught by this faculty member
      const myCourseIds = myCoursesList.map(c => c.subject_id);
      const myAttendance = (allAttendance || []).filter(r => myCourseIds.includes(r.subject_id));
      setHistory(myAttendance);
      
      calculateStats(myAttendance);
    } catch (e) {
      console.error('Failed to load initial attendance data:', e);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (records) => {
    if (!records.length) {
      setStats({ present: 0, absent: 0, late: 0, percentage: '0.0' });
      return;
    }
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const attended = present + late;
    const percentage = ((attended / records.length) * 100).toFixed(1);
    setStats({ present, absent, late, percentage });
  };

  useEffect(() => {
    if (!user) return;
    loadInitialData();
  }, [user]);

  // Load students when course is selected for marking
  const loadStudentsForCourse = async (courseId) => {
    if (!courseId) {
      setStudents([]);
      return;
    }
    try {
      setLoading(true);
      const enrolled = await API.get(`enrollments?course=${courseId}`);
      setStudents(enrolled || []);
      
      // Default all statuses to 'present'
      const initialStatuses = {};
      (enrolled || []).forEach(s => {
        initialStatuses[s.student] = 'present';
      });
      setAttendanceStatuses(initialStatuses);
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

  const handleStatusChange = (studentId, status) => {
    setAttendanceStatuses(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const submitBulkAttendance = async () => {
    if (!selectedCourse) {
      Toast.warning('Please select a course.');
      return;
    }
    if (!students.length) {
      Toast.warning('No students to mark attendance for.');
      return;
    }

    try {
      setSubmitting(true);
      const records = students.map(s => ({
        student: s.student,
        course: selectedCourse,
        date: attendanceDate,
        status: attendanceStatuses[s.student] || 'present'
      }));

      await API.post('attendance/bulk-mark', { records });
      Toast.success('Attendance saved successfully!');
      setIsMarkingMode(false);
      setSelectedCourse('');
      setStudents([]);
      loadInitialData();
    } catch (e) {
      console.error('Failed to submit attendance:', e);
      Toast.error('Failed to submit attendance.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter attendance log
  const filteredHistory = history.filter(r => {
    const matchesCourse = filterCourse ? r.subject_id === filterCourse : true;
    const matchesDate = filterDate ? r.date === filterDate : true;
    const matchesStatus = filterStatus ? r.status === filterStatus : true;
    return matchesCourse && matchesDate && matchesStatus;
  });

  if (loading && !students.length && !history.length) {
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
          <h1>Attendance Tracking</h1>
          <p>Mark attendance for courses, view stats, and track trends.</p>
        </div>
        <div className="page-header-right">
          <button 
            className="btn btn-primary" 
            onClick={() => setIsMarkingMode(!isMarkingMode)}
          >
            {isMarkingMode ? '📋 View Records' : '✅ Mark Attendance'}
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="stats-grid">
        <div className="stat-card success">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{stats.present}</div>
          <div className="stat-label">Present Records</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-icon">❌</div>
          <div className="stat-value">{stats.absent}</div>
          <div className="stat-label">Absent Records</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">⏰</div>
          <div className="stat-value">{stats.late}</div>
          <div className="stat-label">Late Records</div>
        </div>
        <div className="stat-card primary">
          <div className="stat-icon">📊</div>
          <div className="stat-value">{stats.percentage}%</div>
          <div className="stat-label">Avg Attendance Rate</div>
        </div>
      </div>

      {isMarkingMode ? (
        /* MARK ATTENDANCE MODE */
        <div className="card col-12">
          <div className="card-header">
            <div className="card-title">✅ Mark Attendance</div>
          </div>
          <div className="card-body">
            <div className="form-row" style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Course</label>
                <select className="form-input" value={selectedCourse} onChange={handleCourseChange}>
                  <option value="">Select Course</option>
                  {courses.map(c => (
                    <option key={c.subject_id} value={c.subject_id}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={attendanceDate} 
                  onChange={(e) => setAttendanceDate(e.target.value)} 
                />
              </div>
            </div>

            {loading ? (
              <div style={{ textalign: 'center', padding: '40px' }}><div className="loading-spinner"></div></div>
            ) : students.length > 0 ? (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Roll No</th>
                      <th>Student Name</th>
                      <th style={{ textAlign: 'center' }}>Present</th>
                      <th style={{ textAlign: 'center' }}>Absent</th>
                      <th style={{ textAlign: 'center' }}>Late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.student}>
                        <td>{s.current_rollno || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{s.student_name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="radio" 
                            name={`status-${s.student}`} 
                            checked={attendanceStatuses[s.student] === 'present'} 
                            onChange={() => handleStatusChange(s.student, 'present')} 
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="radio" 
                            name={`status-${s.student}`} 
                            checked={attendanceStatuses[s.student] === 'absent'} 
                            onChange={() => handleStatusChange(s.student, 'absent')} 
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="radio" 
                            name={`status-${s.student}`} 
                            checked={attendanceStatuses[s.student] === 'late'} 
                            onChange={() => handleStatusChange(s.student, 'late')} 
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
                  <button className="btn btn-ghost" onClick={() => setIsMarkingMode(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={submitBulkAttendance} disabled={submitting}>
                    {submitting ? 'Saving...' : '✅ Save Attendance'}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📚</div>
                <p>Select a course to load the student roster</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VIEW RECORDS MODE */
        <div className="card col-12">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title">📋 Attendance Log</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select className="form-input" style={{ width: '160px', padding: '6px 10px', fontSize: '0.8rem' }} value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
                <option value="">All Courses</option>
                {courses.map(c => (
                  <option key={c.subject_id} value={c.subject_id}>{c.code}</option>
                ))}
              </select>
              <input 
                type="date" 
                className="form-input" 
                style={{ width: 'auto', padding: '6px 10px', fontSize: '0.8rem' }} 
                value={filterDate} 
                onChange={e => setFilterDate(e.target.value)} 
              />
              <select className="form-input" style={{ width: '120px', padding: '6px 10px', fontSize: '0.8rem' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
              </select>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {filteredHistory.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Course</th>
                    <th>Student Name</th>
                    <th>Status</th>
                    <th>Marked By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((r, idx) => (
                    <tr key={r.attendance_id || idx}>
                      <td>{r.date}</td>
                      <td><strong>{r.course_code}</strong></td>
                      <td>{r.student_name}</td>
                      <td>
                        <span className={`badge badge-${r.status === 'present' ? 'success' : r.status === 'absent' ? 'danger' : 'warning'}`}>
                          {r.status?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.marked_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <p>No matching attendance records found.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

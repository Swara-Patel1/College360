import { useState, useEffect, useMemo } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';

export default function Attendance() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedLecture, setSelectedLecture] = useState('Lecture 1');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState([]);
  const [attendanceStatuses, setAttendanceStatuses] = useState({});
  const [history, setHistory] = useState([]);
  const [timetableEntries, setTimetableEntries] = useState([]);
  const [scheduledLectures, setScheduledLectures] = useState([]);

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
      const prof = await API.get(`faculty/my_profile?user_id=${user.id}`).catch(() => null);
      setProfile(prof);
      if (!prof) return;

      const facId = prof.id || prof.faculty_id;
      const subjId = prof.subject_id;

      const [allCourses, allAttendance, ttList] = await Promise.all([
        API.get('courses').catch(() => []),
        API.get('attendance').catch(() => []),
        API.get(`timetable?faculty_id=eq.${facId}`).catch(() => [])
      ]);

      setTimetableEntries(Array.isArray(ttList) ? ttList : []);

      let myCoursesList = (allCourses || []).filter(c => 
        c.faculty_id === facId || 
        c.faculty?.faculty_id === facId || 
        c.faculty?.id === facId ||
        (subjId && (c.subject_id === subjId || c.id === subjId))
      );

      if (myCoursesList.length === 0 && subjId) {
        const matched = (allCourses || []).find(c => c.subject_id === subjId || c.id === subjId);
        if (matched) myCoursesList.push(matched);
      }

      setCourses(myCoursesList);

      // Filter attendance history to only display records for subjects taught by this faculty member
      const mySubjectIds = myCoursesList.map(c => c.subject_id || c.id);
      const myAttendance = (allAttendance || []).filter(r => mySubjectIds.includes(r.subject_id || r.course));
      setHistory(myAttendance);

      calculateStats(myAttendance);
    } catch (e) {
      console.error('Failed to load initial attendance data:', e);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (records) => {
    if (!records || !records.length) {
      setStats({ present: 0, absent: 0, late: 0, percentage: '0.0' });
      return;
    }
    let present = 0;
    let absent = 0;
    let late = 0;

    records.forEach(r => {
      const s = String(r.status || '').toLowerCase();
      if (s === 'present' || s === 'p') present++;
      else if (s === 'absent' || s === 'a') absent++;
      else if (s === 'late' || s === 'l') late++;
    });

    const total = present + absent + late;
    const attended = present + late;
    const percentage = total > 0 ? ((attended / total) * 100).toFixed(1) : '0.0';
    setStats({ present, absent, late, percentage });
  };

  useEffect(() => {
    if (!user) return;
    loadInitialData();
  }, [user]);

  // Compute scheduled lectures whenever selectedCourse or attendanceDate changes
  useEffect(() => {
    if (!selectedCourse || !attendanceDate) {
      setScheduledLectures([]);
      return;
    }

    const dateObj = new Date(attendanceDate);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Filter timetable for matching day of week and subject
    const matchingSlots = timetableEntries.filter(t => {
      const matchDay = (t.day_of_week || t.day || '').toLowerCase() === dayName;
      const matchSubj = t.subject_id === selectedCourse || t.subject?.subject_id === selectedCourse || t.subject?.id === selectedCourse;
      return matchDay && matchSubj;
    });

    if (matchingSlots.length > 0) {
      const slots = matchingSlots.map((slot, idx) => {
        const num = idx + 1;
        const st = slot.start_time ? String(slot.start_time).slice(0, 5) : '';
        const et = slot.end_time ? String(slot.end_time).slice(0, 5) : '';
        const rm = slot.room_no || slot.room ? ` (Room ${slot.room_no || slot.room})` : '';
        const timeStr = st && et ? ` (${st} - ${et}${rm})` : rm;
        return {
          id: `Lecture ${num}`,
          label: `Lecture ${num}${timeStr}`,
          slot
        };
      });

      // If faculty has 2 or more lectures, add an 'All Lectures' option
      if (slots.length > 1) {
        slots.push({
          id: 'All Lectures',
          label: `All Lectures (${slots.map(s => s.id).join(' & ')})`,
          slot: null
        });
      }

      setScheduledLectures(slots);
      setSelectedLecture(slots[0].id);
    } else {
      // If timetable has no specific entry for this day, check if timetable is empty overall
      const anyTtForSubj = timetableEntries.some(t => t.subject_id === selectedCourse || t.subject?.subject_id === selectedCourse);
      if (!anyTtForSubj) {
        // Default single lecture slot if no timetable defined at all
        setScheduledLectures([
          { id: 'Lecture 1', label: 'Lecture 1 (09:00 - 10:00)', slot: null }
        ]);
        setSelectedLecture('Lecture 1');
      } else {
        // Faculty has timetable defined, but 0 lectures on this day
        setScheduledLectures([]);
        setSelectedLecture('');
      }
    }
  }, [selectedCourse, attendanceDate, timetableEntries]);

  // Check if attendance for selected (Subject, Date, Lecture) is already submitted in database
  const isAlreadySubmitted = useMemo(() => {
    if (!selectedCourse || !attendanceDate || !selectedLecture) return false;
    return history.some(r => {
      const matchSubj = (r.subject_id === selectedCourse || r.course === selectedCourse);
      const recDate = r.date ? String(r.date).slice(0, 10) : '';
      const matchDate = recDate === attendanceDate;
      const rLec = r.lecture || 'Lecture 1';
      const matchLec = (selectedLecture === 'All Lectures' || rLec === selectedLecture);
      return matchSubj && matchDate && matchLec;
    });
  }, [selectedCourse, attendanceDate, selectedLecture, history]);

  // Pre-populate saved attendance statuses if already submitted
  useEffect(() => {
    if (!selectedCourse || !attendanceDate || !selectedLecture || !history.length) return;

    const existingRecords = history.filter(r => {
      const matchSubj = (r.subject_id === selectedCourse || r.course === selectedCourse);
      const recDate = r.date ? String(r.date).slice(0, 10) : '';
      const matchDate = recDate === attendanceDate;
      const rLec = r.lecture || 'Lecture 1';
      const matchLec = (selectedLecture === 'All Lectures' || rLec === selectedLecture);
      return matchSubj && matchDate && matchLec;
    });

    if (existingRecords.length > 0) {
      const savedMap = {};
      existingRecords.forEach(r => {
        const sId = r.student_id || r.student?.student_id || r.student?.id || r.student;
        if (sId) savedMap[sId] = String(r.status || 'present').toLowerCase();
      });
      setAttendanceStatuses(prev => ({ ...prev, ...savedMap }));
    }
  }, [selectedCourse, attendanceDate, selectedLecture, history]);

  // Load students when subject is selected for marking
  const loadStudentsForCourse = async (subjectId) => {
    if (!subjectId) {
      setStudents([]);
      return;
    }
    try {
      setLoading(true);
      // Fetch enrolled students for this subject
      const marksData = await API.get(`marks?subject_id=eq.${subjectId}`).catch(() => []);
      let roster = [];
      if (Array.isArray(marksData) && marksData.length > 0) {
        roster = marksData.map(m => ({
          student: m.student_id || m.student?.student_id || m.student?.id,
          student_name: m.student ? `${m.student.first_name || ''} ${m.student.last_name || ''}`.trim() : 'Student',
          current_rollno: m.student?.enrollment_no || m.student?.current_rollno || '—'
        }));
      } else {
        const enrolled = await API.get(`enrollments?course=${subjectId}`).catch(() => []);
        if (Array.isArray(enrolled)) {
          roster = enrolled.map(s => ({
            student: s.student,
            student_name: s.student_name || 'Student',
            current_rollno: s.current_rollno || '—'
          }));
        }
      }

      setStudents(roster);

      // Default all statuses to 'present'
      const initialStatuses = {};
      roster.forEach(s => {
        initialStatuses[s.student] = 'present';
      });
      setAttendanceStatuses(initialStatuses);
    } catch (e) {
      console.error('Failed to load students for subject:', e);
      Toast.error('Could not load student roster.');
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
    if (isAlreadySubmitted) return;
    setAttendanceStatuses(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const submitBulkAttendance = async () => {
    if (!selectedCourse) {
      Toast.warning('Please select a subject.');
      return;
    }
    if (scheduledLectures.length === 0) {
      Toast.warning('No lectures scheduled for this date. Attendance cannot be submitted.');
      return;
    }
    if (isAlreadySubmitted) {
      Toast.warning(`Attendance for ${selectedLecture} on ${attendanceDate} has already been submitted.`);
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
        subject_id: selectedCourse,
        date: attendanceDate,
        lecture: selectedLecture,
        status: attendanceStatuses[s.student] || 'present'
      }));

      await API.post('attendance/bulk-mark', { records });
      Toast.success(`Attendance for ${selectedLecture} saved successfully!`);
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

  // Filter attendance log by Subject, Date, and Status
  const filteredHistory = history.filter(r => {
    const matchesCourse = filterCourse 
      ? (r.subject_id === filterCourse || r.course === filterCourse || r.course_code === filterCourse || r.subject_name === filterCourse) 
      : true;

    // Date format fix: compare first 10 chars (YYYY-MM-DD)
    const recDateStr = r.date ? String(r.date).slice(0, 10) : '';
    const matchesDate = filterDate ? recDateStr === filterDate : true;

    const rStat = String(r.status || '').toLowerCase();
    const fStat = String(filterStatus || '').toLowerCase();
    const matchesStatus = fStat 
      ? (rStat === fStat || (fStat === 'present' && rStat === 'p') || (fStat === 'absent' && rStat === 'a') || (fStat === 'late' && rStat === 'l')) 
      : true;

    return matchesCourse && matchesDate && matchesStatus;
  });

  const selectedSubjectObj = courses.find(c => (c.subject_id || c.id) === selectedCourse);
  const dayNameStr = new Date(attendanceDate).toLocaleDateString('en-US', { weekday: 'long' });

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
          <p>Mark attendance for subjects, view stats, and track trends.</p>
        </div>
        <div className="page-header-right">
          <button
            className="btn btn-primary"
            onClick={() => setIsMarkingMode(!isMarkingMode)}
          >
            {isMarkingMode ? <><i className="bi bi-clipboard me-1"></i>View Records</> : <><i className="bi bi-check-circle me-1"></i>Mark Attendance</>}
          </button>
        </div>
      </div>

      {/* Interactive Stats Section: Click stat boxes to filter Present, Absent, or Late records */}
      <div className="stats-grid">
        <div 
          className={`stat-card success ${filterStatus === 'present' ? 'active-filter' : ''}`}
          style={{ 
            cursor: 'pointer', 
            border: filterStatus === 'present' ? '2px solid #22c55e' : '1px solid transparent', 
            boxShadow: filterStatus === 'present' ? '0 0 12px #22c55e44' : 'none',
            transition: 'all 0.2s ease' 
          }}
          onClick={() => setFilterStatus(prev => prev === 'present' ? '' : 'present')}
          title="Click to filter log by Present records"
        >
          <div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div>
          <div>
            <div className="stat-value">{stats.present}</div>
            <div className="stat-label">Present Records {filterStatus === 'present' && '✓'}</div>
          </div>
        </div>

        <div 
          className={`stat-card danger ${filterStatus === 'absent' ? 'active-filter' : ''}`}
          style={{ 
            cursor: 'pointer', 
            border: filterStatus === 'absent' ? '2px solid #ef4444' : '1px solid transparent',
            boxShadow: filterStatus === 'absent' ? '0 0 12px #ef444444' : 'none', 
            transition: 'all 0.2s ease' 
          }}
          onClick={() => setFilterStatus(prev => prev === 'absent' ? '' : 'absent')}
          title="Click to filter log by Absent records"
        >
          <div className="stat-icon"><i className="bi bi-x-circle"></i></div>
          <div>
            <div className="stat-value">{stats.absent}</div>
            <div className="stat-label">Absent Records {filterStatus === 'absent' && '✓'}</div>
          </div>
        </div>

        <div 
          className={`stat-card warning ${filterStatus === 'late' ? 'active-filter' : ''}`}
          style={{ 
            cursor: 'pointer', 
            border: filterStatus === 'late' ? '2px solid #f59e0b' : '1px solid transparent', 
            boxShadow: filterStatus === 'late' ? '0 0 12px #f59e0b44' : 'none',
            transition: 'all 0.2s ease' 
          }}
          onClick={() => setFilterStatus(prev => prev === 'late' ? '' : 'late')}
          title="Click to filter log by Late records"
        >
          <div className="stat-icon"><i className="bi bi-alarm"></i></div>
          <div>
            <div className="stat-value">{stats.late}</div>
            <div className="stat-label">Late Records {filterStatus === 'late' && '✓'}</div>
          </div>
        </div>

        <div 
          className="stat-card primary"
          style={{ cursor: 'pointer' }}
          onClick={() => { setFilterStatus(''); setFilterCourse(''); setFilterDate(''); }}
          title="Click to reset all filters"
        >
          <div className="stat-icon"><i className="bi bi-bar-chart"></i></div>
          <div>
            <div className="stat-value">{stats.percentage}%</div>
            <div className="stat-label">Avg Attendance Rate</div>
          </div>
        </div>
      </div>

      {isMarkingMode ? (
        /* MARK ATTENDANCE MODE */
        <div className="card col-12">
          <div className="card-header">
            <div className="card-title"><i className="bi bi-check-circle-fill"></i> Mark Attendance</div>
          </div>
          <div className="card-body">
            <div className="form-row" style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
                <label className="form-label">Subject</label>
                <select className="form-input" value={selectedCourse} onChange={handleCourseChange}>
                  <option value="">Select Subject</option>
                  {courses.map(c => (
                    <option key={c.subject_id || c.id} value={c.subject_id || c.id}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
                <label className="form-label">Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
                <label className="form-label">Lecture / Slot</label>
                <select 
                  className="form-input" 
                  value={selectedLecture} 
                  onChange={(e) => setSelectedLecture(e.target.value)}
                  disabled={!selectedCourse || scheduledLectures.length === 0}
                >
                  {scheduledLectures.length > 0 ? (
                    scheduledLectures.map(lec => (
                      <option key={lec.id} value={lec.id}>{lec.label}</option>
                    ))
                  ) : (
                    <option value="">No lectures scheduled</option>
                  )}
                </select>
              </div>
            </div>

            {/* Timetable constraint warning */}
            {selectedCourse && scheduledLectures.length === 0 && (
              <div style={{ background: '#ef444415', border: '1px solid #ef444444', color: '#f87171', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="bi bi-calendar-x" style={{ fontSize: '1.2rem' }} />
                <span>
                  No lectures scheduled for <strong>{selectedSubjectObj?.name || 'this subject'}</strong> on <strong>{dayNameStr}</strong> ({attendanceDate}). Attendance cannot be submitted for unscheduled days.
                </span>
              </div>
            )}

            {/* Already Submitted Warning Banner */}
            {selectedCourse && isAlreadySubmitted && (
              <div style={{ 
                background: 'rgba(16, 185, 129, 0.12)', 
                border: '1px solid rgba(16, 185, 129, 0.35)', 
                color: '#34d399', 
                padding: '14px 18px', 
                borderRadius: '10px', 
                marginBottom: '20px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="bi bi-shield-check" style={{ fontSize: '1.4rem' }} />
                  <div>
                    <strong>Attendance Already Submitted</strong>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '2px' }}>
                      Attendance for <strong>{selectedSubjectObj?.name}</strong> ({selectedLecture}) on <strong>{attendanceDate}</strong> has already been submitted and saved. Re-submission is locked.
                    </div>
                  </div>
                </div>
                <span className="badge badge-success" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                  <i className="bi bi-lock-fill me-1" />SUBMITTED & LOCKED
                </span>
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner"></div></div>
            ) : selectedCourse && scheduledLectures.length > 0 && students.length > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Showing {students.length} enrolled student(s) · {selectedLecture || 'Lecture'}
                  </span>
                  <span className="badge badge-info">{scheduledLectures.length} Lecture(s) Scheduled Today</span>
                </div>
                <table className="table" style={{ opacity: isAlreadySubmitted ? 0.75 : 1 }}>
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
                            disabled={isAlreadySubmitted}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="radio"
                            name={`status-${s.student}`}
                            checked={attendanceStatuses[s.student] === 'absent'}
                            onChange={() => handleStatusChange(s.student, 'absent')}
                            disabled={isAlreadySubmitted}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="radio"
                            name={`status-${s.student}`}
                            checked={attendanceStatuses[s.student] === 'late'}
                            onChange={() => handleStatusChange(s.student, 'late')}
                            disabled={isAlreadySubmitted}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
                  <button className="btn btn-ghost" onClick={() => setIsMarkingMode(false)}>Cancel</button>
                  {isAlreadySubmitted ? (
                    <button className="btn btn-secondary" disabled style={{ cursor: 'not-allowed', opacity: 0.7 }}>
                      <i className="bi bi-lock-fill me-1"></i>Attendance Already Submitted
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={submitBulkAttendance} disabled={submitting}>
                      {submitting ? 'Saving...' : <><i className="bi bi-check-lg me-1"></i>Save Attendance for {selectedLecture}</>}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><i className="bi bi-book"></i></div>
                <p>
                  {!selectedCourse 
                    ? 'Select a subject to load the scheduled lectures and student roster' 
                    : scheduledLectures.length === 0 
                      ? 'No lectures scheduled today for this subject.' 
                      : 'No students found for this subject.'}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VIEW RECORDS MODE */
        <div className="card col-12">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div className="card-title"><i className="bi bi-clipboard"></i> Attendance Log {filterStatus && <span className="badge badge-info ms-2">Filter: {filterStatus.toUpperCase()}</span>}</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="form-input" style={{ width: '180px', padding: '6px 10px', fontSize: '0.8rem' }} value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
                <option value="">All Subjects</option>
                {courses.map(c => (
                  <option key={c.subject_id || c.id} value={c.subject_id || c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
              <input
                type="date"
                className="form-input"
                style={{ width: 'auto', padding: '6px 10px', fontSize: '0.8rem' }}
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
              />
              <select className="form-input" style={{ width: '130px', padding: '6px 10px', fontSize: '0.8rem' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
              </select>
              {(filterCourse || filterDate || filterStatus) && (
                <button 
                  className="btn btn-ghost" 
                  style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#ef4444' }} 
                  onClick={() => { setFilterCourse(''); setFilterDate(''); setFilterStatus(''); }}
                >
                  <i className="bi bi-x-circle me-1" />Reset Filters
                </button>
              )}
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {filteredHistory.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Subject</th>
                    <th>Lecture</th>
                    <th>Student Name</th>
                    <th>Status</th>
                    <th>Marked By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((r, idx) => (
                    <tr key={r.attendance_id || idx}>
                      <td>{r.date ? String(r.date).slice(0, 10) : '—'}</td>
                      <td><strong>{r.course_code || r.subject_name || 'Subject'}</strong></td>
                      <td><span className="badge badge-info">{r.lecture || 'Lecture 1'}</span></td>
                      <td>{r.student_name}</td>
                      <td>
                        <span className={`badge badge-${r.status === 'present' ? 'success' : r.status === 'absent' ? 'danger' : 'warning'}`}>
                          {r.status?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.marked_by || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><i className="bi bi-clipboard"></i></div>
                <p>No matching attendance records found for the selected filters.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

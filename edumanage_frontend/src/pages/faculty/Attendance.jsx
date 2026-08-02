import { useState, useEffect, useMemo } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';

export default function Attendance() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [departments, setDepartments] = useState([]);
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
  const [filterDept, setFilterDept] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewTab, setViewTab] = useState((user?.role === 'admin' || user?.role === 'hod') ? 'summary' : 'detailed');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isMarkingMode, setIsMarkingMode] = useState(false);

  // Stats
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, percentage: '0.0' });

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const isAdmin = user?.role === 'admin';
      const prof = await API.get(`faculty/my_profile?user_id=${user.id}`).catch(() => null);
      setProfile(prof);

      const facId = prof?.id || prof?.faculty_id;
      const subjId = prof?.subject_id;

      const [allCourses, allAttendance, deptsData, ttList] = await Promise.all([
        API.get('courses').catch(() => []),
        API.get('attendance').catch(() => []),
        API.get('departments').catch(() => []),
        facId ? API.get(`timetable?faculty_id=eq.${facId}`).catch(() => []) : API.get('timetable').catch(() => []),
      ]);

      const deptArr = Array.isArray(deptsData) ? deptsData : [];
      const courseArr = Array.isArray(allCourses) ? allCourses : [];
      const attArr = Array.isArray(allAttendance) ? allAttendance : [];

      setDepartments(deptArr);
      setTimetableEntries(Array.isArray(ttList) ? ttList : []);

      if (isAdmin) {
        setCourses(courseArr);
        setHistory(attArr);
        calculateStats(attArr);
        return;
      }

      if (user?.role === 'hod') {
        const hodInfo = await API.get('hod/check').catch(() => null);
        const hodDeptId = hodInfo?.department_id || hodInfo?.hod?.department_id || prof?.department_id;

        let deptCourses = (courseArr || []).filter(c => {
          const cDeptId = String(c.department_id || c.department?.department_id || c.department?.id || '');
          return hodDeptId && cDeptId === String(hodDeptId);
        });

        if (deptCourses.length === 0 && prof?.department_id) {
          deptCourses = (courseArr || []).filter(c => String(c.department_id) === String(prof.department_id));
        }

        setCourses(deptCourses);

        const deptSubjIds = deptCourses.map(c => String(c.subject_id || c.id));
        const hodAttendance = (attArr || []).filter(r => {
          const rDeptId = String(r.department_id || r.department?.department_id || r.department?.id || '');
          const rSubjId = String(r.subject_id || r.course?.subject_id || r.course?.id || r.course || r.subject || '');
          return (hodDeptId && rDeptId === String(hodDeptId)) || deptSubjIds.includes(rSubjId);
        });

        setHistory(hodAttendance);
        calculateStats(hodAttendance);

        if (deptCourses.length > 0) {
          const defaultSubj = String(deptCourses[0].subject_id || deptCourses[0].id || '');
          setSelectedCourse(defaultSubj);
          loadStudentsForCourse(defaultSubj);
        }
        return;
      }

      // Collect all assigned subject IDs from timetable for this faculty
      const ttSubjectIds = (Array.isArray(ttList) ? ttList : [])
        .map(t => String(t.subject_id || t.subject?.subject_id || t.subject?.id || t.subject || ''))
        .filter(Boolean);

      let myCoursesList = (courseArr || []).filter(c => {
        const cSubjId = String(c.subject_id || c.id || '');
        const cFacId = String(c.faculty_id || c.faculty?.faculty_id || c.faculty?.id || '');
        
        return (
          (facId && cFacId === String(facId)) ||
          (subjId && cSubjId === String(subjId)) ||
          (ttSubjectIds.length > 0 && ttSubjectIds.includes(cSubjId))
        );
      });

      if (myCoursesList.length === 0 && subjId) {
        const matched = (courseArr || []).find(c => String(c.subject_id || c.id) === String(subjId));
        if (matched) myCoursesList.push(matched);
      }

      setCourses(myCoursesList);

      // Auto-select the subject the faculty teaches
      if (myCoursesList.length > 0) {
        const defaultSubj = String(myCoursesList[0].subject_id || myCoursesList[0].id || '');
        setSelectedCourse(defaultSubj);
        loadStudentsForCourse(defaultSubj);
      }

      const mySubjectIds = myCoursesList.map(c => String(c.subject_id || c.id));
      const myAttendance = (attArr || []).filter(r => {
        const rSubjId = String(r.subject_id || r.course?.subject_id || r.course?.id || r.course || r.subject || '');
        return mySubjectIds.includes(rSubjId);
      });
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
    if (user?.role !== 'admin' && user?.role !== 'hod') {
      setViewTab('detailed');
    }
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

  // Filter attendance log by Department, Subject, Date, and Status
  const filteredHistory = useMemo(() => {
    return history.filter(r => {
      let matchesDept = true;
      if (filterDept) {
        const dId = r.department_id || r.student?.department_id || r.course?.department_id;
        const targetDept = departments.find(d => String(d.department_id || d.id) === String(filterDept));
        const targetName = (targetDept?.name || '').toLowerCase();
        const targetCode = (targetDept?.code || '').toLowerCase();

        const matchId = dId && String(dId) === String(filterDept);
        const matchName = r.department_name && (
          r.department_name.toLowerCase() === filterDept.toLowerCase() ||
          (targetName && r.department_name.toLowerCase() === targetName)
        );
        const matchCode = r.course_code && targetCode && r.course_code.toLowerCase().startsWith(targetCode);

        matchesDept = matchId || matchName || matchCode;
      }

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

      return matchesDept && matchesCourse && matchesDate && matchesStatus;
    });
  }, [history, filterDept, filterCourse, filterDate, filterStatus, departments]);

  useEffect(() => {
    calculateStats(filteredHistory);
  }, [filteredHistory]);

  const availableFilterCourses = useMemo(() => {
    if (!filterDept) return courses;
    return courses.filter(c => !c.department_id || String(c.department_id) === String(filterDept));
  }, [courses, filterDept]);

  const subjectSummaries = useMemo(() => {
    const map = new Map();

    courses.forEach(c => {
      const cId = String(c.subject_id || c.id || '');
      const dept = departments.find(d => String(d.department_id || d.id) === String(c.department_id));
      map.set(cId, {
        subject_id: cId,
        code: c.code || '—',
        name: c.name || 'Subject',
        department_id: c.department_id || '',
        department_name: dept?.name || c.department_name || 'General',
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        datesSet: new Set(),
      });
    });

    history.forEach(r => {
      const sId = String(r.subject_id || r.course || '');
      let entry = map.get(sId);
      if (!entry) {
        for (const [, v] of map.entries()) {
          if (v.code && r.course_code && v.code.toLowerCase() === r.course_code.toLowerCase()) {
            entry = v;
            break;
          }
        }
      }

      if (!entry && (user?.role === 'admin') && (r.subject_name || r.course_code)) {
        entry = {
          subject_id: sId || r.course_code,
          code: r.course_code || '—',
          name: r.subject_name || 'Subject',
          department_id: r.department_id || '',
          department_name: r.department_name || 'General',
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          datesSet: new Set(),
        };
        map.set(entry.subject_id, entry);
      }

      if (entry) {
        entry.total++;
        const st = String(r.status || '').toLowerCase();
        if (st === 'present' || st === 'p') entry.present++;
        else if (st === 'absent' || st === 'a') entry.absent++;
        else if (st === 'late' || st === 'l') entry.late++;

        if (r.date) entry.datesSet.add(String(r.date).slice(0, 10));
      }
    });

    let list = Array.from(map.values()).map(item => {
      const attended = item.present + item.late;
      const percentage = item.total > 0 ? parseFloat(((attended / item.total) * 100).toFixed(1)) : 0.0;
      return {
        ...item,
        sessionsCount: item.datesSet.size,
        percentage,
      };
    });

    if (filterDept) {
      list = list.filter(item => {
        const targetDept = departments.find(d => String(d.department_id || d.id) === String(filterDept));
        const targetName = (targetDept?.name || '').toLowerCase();
        const targetCode = (targetDept?.code || '').toLowerCase();

        const matchId = item.department_id && String(item.department_id) === String(filterDept);
        const matchName = item.department_name && (
          item.department_name.toLowerCase() === filterDept.toLowerCase() ||
          (targetName && item.department_name.toLowerCase() === targetName)
        );
        const matchCode = item.code && targetCode && item.code.toLowerCase().startsWith(targetCode);
        return matchId || matchName || matchCode;
      });
    }

    if (filterCourse) {
      list = list.filter(item => item.subject_id === filterCourse || item.code === filterCourse);
    }

    if (user?.role === 'hod') {
      list = list.filter(item => {
        return courses.some(c => String(c.subject_id || c.id) === String(item.subject_id));
      });
    } else if (user?.role !== 'admin') {
      list = list.filter(item => {
        const isAssigned = courses.some(c => String(c.subject_id || c.id) === String(item.subject_id));
        return isAssigned && item.sessionsCount > 0;
      });
    }

    list.sort((a, b) => a.department_name.localeCompare(b.department_name) || a.code.localeCompare(b.code));
    return list;
  }, [history, courses, departments, filterDept, filterCourse]);

  const selectedSubjectObj = courses.find(c => String(c.subject_id || c.id) === String(selectedCourse)) || courses[0];
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
              <div className="form-group" style={{ flex: 1, minWidth: '240px' }}>
                <label className="form-label">Subject</label>
                {(user?.role === 'admin' || user?.role === 'hod') && courses.length > 1 ? (
                  <select className="form-input" value={selectedCourse} onChange={handleCourseChange}>
                    {courses.map(c => (
                      <option key={c.subject_id || c.id} value={c.subject_id || c.id}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="form-input" style={{ display: 'flex', alignItems: 'center', fontWeight: '600', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '8px', padding: '10px 14px', cursor: 'default' }}>
                    <i className="bi bi-journal-bookmark-fill me-2" style={{ color: '#38bdf8' }}></i>
                    {selectedSubjectObj ? `${selectedSubjectObj.code} — ${selectedSubjectObj.name}` : (courses[0] ? `${courses[0].code} — ${courses[0].name}` : 'No Subject Assigned')}
                  </div>
                )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div className="card-title" style={{ margin: 0 }}>
                <i className="bi bi-bar-chart-fill me-2"></i> Attendance Overview
              </div>
              {(user?.role === 'admin' || user?.role === 'hod') && (
                <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '3px' }}>
                  <button
                    className={`btn btn-sm ${viewTab === 'summary' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: '6px', padding: '4px 12px', fontSize: '0.78rem' }}
                    onClick={() => setViewTab('summary')}
                  >
                    <i className="bi bi-grid-3x3-gap-fill me-1"></i> Subject Summary
                  </button>
                  <button
                    className={`btn btn-sm ${viewTab === 'detailed' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: '6px', padding: '4px 12px', fontSize: '0.78rem' }}
                    onClick={() => setViewTab('detailed')}
                  >
                    <i className="bi bi-person-lines-fill me-1"></i> Detailed Logs
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select 
                className="form-input" 
                style={{ width: '180px', padding: '6px 10px', fontSize: '0.8rem' }} 
                value={filterDept} 
                onChange={e => { setFilterDept(e.target.value); setFilterCourse(''); }}
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.department_id || d.id} value={d.department_id || d.id}>{d.name}</option>
                ))}
              </select>
              <select className="form-input" style={{ width: '180px', padding: '6px 10px', fontSize: '0.8rem' }} value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
                <option value="">All Subjects</option>
                {availableFilterCourses.map(c => (
                  <option key={c.subject_id || c.id} value={c.subject_id || c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
              {viewTab === 'detailed' && (
                <>
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
                </>
              )}
              {(filterDept || filterCourse || filterDate || filterStatus) && (
                <button 
                  className="btn btn-ghost" 
                  style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#ef4444' }} 
                  onClick={() => { setFilterDept(''); setFilterCourse(''); setFilterDate(''); setFilterStatus(''); }}
                >
                  <i className="bi bi-x-circle me-1" />Reset Filters
                </button>
              )}
            </div>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {viewTab === 'summary' ? (
              /* SUBJECT SUMMARY TABLE */
              subjectSummaries.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Subject / Course</th>
                      <th>Sessions Held</th>
                      <th style={{ minWidth: '180px' }}>Attendance Rate</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectSummaries.map((item, idx) => {
                      const color = item.percentage >= 75 ? '#22c55e' : item.percentage >= 60 ? '#f59e0b' : '#ef4444';
                      return (
                        <tr key={item.subject_id || idx}>
                          <td>
                            <span className="badge badge-secondary" style={{ fontSize: '0.75rem', background: 'rgba(108, 99, 255, 0.15)', color: '#6C63FF', border: '1px solid rgba(108, 99, 255, 0.3)' }}>
                              {item.department_name}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.code}</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{item.name}</div>
                          </td>
                          <td>
                            <span className="badge badge-info" style={{ borderRadius: '6px' }}>
                              <i className="bi bi-calendar-event me-1"></i>{item.sessionsCount} {item.sessionsCount === 1 ? 'Session' : 'Sessions'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ flex: 1, height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, item.percentage)}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.3s ease' }}></div>
                              </div>
                              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: color, minWidth: '48px', textAlign: 'right' }}>
                                {item.percentage}%
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ borderRadius: '8px', fontSize: '0.78rem', color: 'var(--primary-light)', borderColor: 'rgba(108, 99, 255, 0.3)' }}
                              onClick={() => {
                                setFilterCourse(item.subject_id);
                                setViewTab('detailed');
                              }}
                            >
                              View Logs →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon"><i className="bi bi-book"></i></div>
                  <p>No subjects found for the selected department filter.</p>
                </div>
              )
            ) : (
              /* DETAILED LOGS TABLE */
              filteredHistory.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Student Name</th>
                      <th>Department</th>
                      <th>Subject / Course</th>
                      <th>Lecture</th>
                      <th>Status</th>
                      <th>Marked By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((r, idx) => (
                      <tr key={r.attendance_id || r.record_id || idx}>
                        <td>{r.date ? String(r.date).slice(0, 10) : '—'}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.student_name || 'Student'}</div>
                          {(r.student?.enrollment_no || r.enrollment_no) && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {r.student?.enrollment_no || r.enrollment_no}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-secondary" style={{ fontSize: '0.75rem', background: 'rgba(108, 99, 255, 0.15)', color: '#6C63FF', border: '1px solid rgba(108, 99, 255, 0.3)' }}>
                            {r.department_name || 'General'}
                          </span>
                        </td>
                        <td><strong>{r.course_code || r.subject_name || 'Subject'}</strong></td>
                        <td><span className="badge badge-info">{r.lecture || 'Lecture 1'}</span></td>
                        <td>
                          <span className={`badge badge-${r.status === 'present' ? 'success' : r.status === 'absent' ? 'danger' : 'warning'}`}>
                            {r.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.marked_by || 'Faculty'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon"><i className="bi bi-clipboard"></i></div>
                  <p>No matching attendance records found for the selected filters.</p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';
import { sendPerformanceAlertEmail } from '../../course_utilities/mailer.js';

export default function HODPerformance() {
  const { user } = useAuthStore();
  const [lowPerformers, setLowPerformers] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deptId, setDeptId] = useState('');

  // Email Modal State
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Extra Lecture Modal State
  const [isLectureOpen, setIsLectureOpen] = useState(false);
  const [targetStudent, setTargetStudent] = useState(null);
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('MON');
  const [startTime, setStartTime] = useState('09:00:00');
  const [endTime, setEndTime] = useState('10:00:00');
  const [roomNo, setRoomNo] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);

      // 1. Get HOD info safely
      let currentDeptId = '';
      try {
        const hodInfo = await API.get('hod/check');
        if (hodInfo && hodInfo.isHod) {
          currentDeptId = hodInfo.hod?.department_id || hodInfo.department_id || '';
          setDeptId(currentDeptId);
        }
      } catch (_) {}

      // 2. Fetch dependencies safely
      const [gradesData, facData, coursesData, sectionsData, allStudents] = await Promise.all([
        API.get('grades').catch(() => []),
        API.get('faculty').catch(() => []),
        API.get('courses').catch(() => []),
        API.get('class_sections').catch(() => []),
        API.get('students').catch(() => [])
      ]);

      const studentMap = {};
      (allStudents || []).forEach(s => {
        if (s.id) studentMap[String(s.id)] = s;
        if (s.student_id) studentMap[String(s.student_id)] = s;
        if (s.user_id) studentMap[String(s.user_id)] = s;
      });

      // Low performers strictly within HOD department
      const rawGrades = Array.isArray(gradesData) ? gradesData : [];
      const lowAlerts = rawGrades.filter(r => {
        const st = studentMap[String(r.student_id)] || r.student || {};
        const sDept = st.department_id || st.department?.id || st.department || r.student?.department_id;
        const isDept = currentDeptId ? (sDept && String(sDept).toLowerCase() === String(currentDeptId).toLowerCase()) : true;

        const obtained = parseFloat(r.marks_obtained ?? 0);
        const isLow = obtained < 70;

        return isDept && isLow;
      });

      const formatted = lowAlerts.map(r => {
        const st = studentMap[String(r.student_id)] || r.student || {};
        const stName = (st.first_name || st.last_name) 
          ? `${st.first_name || ''} ${st.last_name || ''}`.trim() 
          : (r.student_name || 'Student');
        
        const total = parseFloat(r.total_marks || 100);
        const obtained = parseFloat(r.marks_obtained || 0);
        const pct = r.percentage != null ? r.percentage : Math.round((obtained / total) * 100);

        return {
          ...r,
          marks_obtained: obtained,
          total_marks: total,
          percentage: pct,
          student_name: stName,
          student: {
            ...st,
            ...(r.student || {}),
            parent_email: st.parent_email || r.student?.parent_email || '',
            parent_phone: st.parent_phone || st.guardian_phone || r.student?.parent_phone || '',
            enrollment_no: st.enrollment_no || st.student_id || r.student?.enrollment_no || '',
            roll_number: st.roll_number || st.current_rollno || r.student?.roll_number || '',
          }
        };
      });

      // Filter faculty by department
      const deptFaculty = currentDeptId ? (facData || []).filter(f => f.department_id === currentDeptId) : (facData || []);
      const deptSubjects = currentDeptId ? (coursesData || []).filter(c => c.department_id === currentDeptId) : (coursesData || []);

      setLowPerformers(formatted);
      setFaculty(deptFaculty.length ? deptFaculty : (facData || []));
      setSubjects(deptSubjects.length ? deptSubjects : (coursesData || []));
      setSections(sectionsData || []);
    } catch (e) {
      console.error('Error loading performance alerts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleOpenEmail = (alertItem) => {
    setEmailTarget(alertItem);
    setEmailSubject(`Academic Alert: Performance Update for ${alertItem.student_name}`);
    setEmailBody(
      `Dear Parent,\n\nThis is to notify you regarding your child ${alertItem.student_name}'s performance in the subject "${alertItem.course?.name || alertItem.course_name || 'Course'}".\n\nThey obtained ${alertItem.marks_obtained}/${alertItem.total_marks} (${alertItem.percentage}%) and received a grade of "${alertItem.grade}".\n\nWe would like to schedule a review discussion or direct them to extra lectures to improve their scoring.\n\nBest regards,\nHOD Office`
    );
    setIsEmailOpen(true);
  };

  const [sendingEmail, setSendingEmail] = useState(false);

  const handleSendEmail = async (e) => {
    e.preventDefault();
    const recipientEmail = emailTarget?.student?.parent_email || emailTarget?.student?.user?.email || emailTarget?.student_email;
    if (!recipientEmail || recipientEmail === '—') {
      Toast.error('Recipient email address is missing.');
      return;
    }

    setSendingEmail(true);
    try {
      await sendPerformanceAlertEmail(
        recipientEmail,
        emailTarget?.student_name || 'Student',
        emailSubject,
        emailBody,
      );
      Toast.success(`Email sent to ${recipientEmail}!`);
      setIsEmailOpen(false);
    } catch (err) {
      Toast.error(err?.message || 'Failed to send email. Check SMTP settings.');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleOpenLecture = (alertItem) => {
    setTargetStudent(alertItem);
    setSelectedSubject(alertItem.course?.subject_id || alertItem.subject_id || '');
    if (sections.length > 0) {
      setSelectedSection(sections[0].section_id);
    }
    if (faculty.length > 0) {
      setSelectedFaculty(faculty[0].faculty_id);
    }
    setRoomNo('');
    setIsLectureOpen(true);
  };

  const handleLectureSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFaculty || !selectedSubject || !selectedSection || !roomNo) {
      Toast.warning('Please fill in all required fields.');
      return;
    }

    try {
      setLoading(true);
      await API.post('timetable', {
        class_section_id: selectedSection,
        subject_id: selectedSubject,
        faculty_id: selectedFaculty,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        room_no: roomNo,
        academic_year: '2025-26',
        is_active: true
      });
      
      // Also post an urgent notice alerting the student about the extra lecture
      await API.post('notices', {
        title: `Extra Lecture Alert: ${subjects.find(s => s.subject_id === selectedSubject)?.name || 'Course'}`,
        content: `HOD has scheduled an extra lecture for the subject. Time: ${dayOfWeek} from ${startTime} to ${endTime} in Room ${roomNo}. Attendance is mandatory for academic review.`,
        audience: 'students',
        notice_type: 'urgent'
      });

      Toast.success('Extra lecture scheduled and notification notice sent.');
      setIsLectureOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to schedule extra lecture.');
      setLoading(false);
    }
  };

  if (loading && !lowPerformers.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1><i className="bi bi-exclamation-triangle me-2"></i>Academic Performance Alerts</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Monitor students with low marks, coordinate with parents, and schedule remedial extra classes.
          </p>
        </div>
      </div>

      {/* Main Alert Table */}
      <div className="card">
        <div className="card-header" style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Low Marks Performance Alert Board</h3>
          <span className="badge badge-warning" style={{ fontSize: '0.85rem' }}>
            {lowPerformers.length} {lowPerformers.length === 1 ? 'Student Alert' : 'Student Alerts'}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {lowPerformers.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Student Details</th>
                  <th>Subject</th>
                  <th>Marks Score</th>
                  <th>Grade</th>
                  <th>Parent Info</th>
                  <th style={{ textAlign: 'center' }}>Remedial Actions</th>
                </tr>
              </thead>
              <tbody>
                {lowPerformers.map((alert, idx) => (
                  <tr key={alert.mark_id || idx}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                        {alert.student_name}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                        <span>Enr: <strong>{alert.student?.enrollment_no || '—'}</strong></span>
                        {alert.student?.roll_number && <span>Roll: <strong>{alert.student.roll_number}</strong></span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {alert.course?.name || alert.course_name || '—'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {alert.course?.code || alert.course_code || '—'}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: '#ef4444', fontSize: '0.95rem' }}>
                        {alert.marks_obtained} / {alert.total_marks} ({alert.percentage}%)
                      </strong>
                    </td>
                    <td>
                      <span className={`badge badge-${['F','FF'].includes(String(alert.grade).toUpperCase()) ? 'danger' : 'warning'}`}>
                        {alert.grade || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <i className="bi bi-envelope" style={{ color: 'var(--primary-light)' }}></i>
                        {alert.student?.parent_email || '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="bi bi-telephone" style={{ color: '#22c55e' }}></i>
                        {alert.student?.parent_phone || '—'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          onClick={() => handleOpenEmail(alert)}
                          title="Contact Parent via Email"
                        >
                          <i className="bi bi-envelope me-1"></i>Email Parent
                        </button>
                        {alert.student?.parent_phone && (
                          <a 
                            href={`tel:${alert.student.parent_phone}`} 
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#22c55e' }}
                            title="Call Parent Phone"
                          >
                            <i className="bi bi-telephone me-1"></i>Call
                          </a>
                        )}
                        <button 
                          className="btn btn-primary btn-sm" 
                          onClick={() => handleOpenLecture(alert)}
                        >
                          <i className="bi bi-calendar-week me-1"></i>Extra Lecture
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state" style={{ padding: '40px' }}>
              <div className="empty-state-icon"><i className="bi bi-check-lg"></i></div>
              <p>Excellent! No students currently fall under academic alerts.</p>
            </div>
          )}
        </div>
      </div>

      {/* ======================== EMAIL PARENT MODAL ======================== */}
      {isEmailOpen && emailTarget && (
        <Modal isOpen={isEmailOpen} onClose={() => setIsEmailOpen(false)} title={<><i className="bi bi-envelope me-2"></i>Contact Parent of {emailTarget.student_name}</>}>
          <form onSubmit={handleSendEmail}>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Parent Email Address</label>
              <input type="text" className="form-input" disabled value={emailTarget.student?.parent_email || '—'} />
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Email Subject</label>
              <input type="text" className="form-input" required value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Email Content</label>
              <textarea className="form-input" rows="6" required value={emailBody} onChange={e => setEmailBody(e.target.value)} />
            </div>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsEmailOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={sendingEmail}>
                {sendingEmail ? <><div className="spinner"></div> Sending...</> : <><i className="bi bi-send me-1"></i> Send Email</>}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================== EXTRA LECTURE MODAL ======================== */}
      {isLectureOpen && targetStudent && (
        <Modal isOpen={isLectureOpen} onClose={() => setIsLectureOpen(false)} title={<><i className="bi bi-calendar-event me-2"></i>Set Remedial Extra Lecture</>}>
          <form onSubmit={handleLectureSubmit}>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Remedial Course</label>
              <select className="form-input" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                {subjects.map(s => (
                  <option key={s.subject_id || s.id} value={s.subject_id || s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Assign Faculty</label>
                <select className="form-input" value={selectedFaculty} onChange={e => setSelectedFaculty(e.target.value)}>
                  {faculty.map(f => (
                    <option key={f.faculty_id || f.id} value={f.faculty_id || f.id}>{f.first_name} {f.last_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Target Section</label>
                <select className="form-input" value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
                  {sections.map(sec => (
                    <option key={sec.section_id || sec.id} value={sec.section_id || sec.id}>Section {sec.section_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Day of Week</label>
                <select className="form-input" value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
                  <option value="MON">Monday</option>
                  <option value="TUE">Tuesday</option>
                  <option value="WED">Wednesday</option>
                  <option value="THU">Thursday</option>
                  <option value="FRI">Friday</option>
                  <option value="SAT">Saturday</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Room Number *</label>
                <input type="text" className="form-input" required placeholder="e.g. CSE-102" value={roomNo} onChange={e => setRoomNo(e.target.value)} />
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Start Time</label>
                <input type="time" className="form-input" required value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">End Time</label>
                <input type="time" className="form-input" required value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsLectureOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>Schedule Lecture</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

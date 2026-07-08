import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

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

      // 1. Get HOD info
      const hodInfo = await API.get('hod/check');
      let currentDeptId = '';
      if (hodInfo && hodInfo.isHod) {
        currentDeptId = hodInfo.hod.department_id;
        setDeptId(currentDeptId);
      }

      // 2. Fetch dependencies
      const [gradesData, facData, coursesData, sectionsData] = await Promise.all([
        API.get('grades'),
        API.get(`faculty`),
        API.get(`courses`),
        API.get(`class_sections?department_id=eq.${currentDeptId}`)
      ]);

      // 3. Filter low marks records (percentage < 40 or grade === 'F')
      const lowAlerts = (gradesData || []).filter(r => {
        const isDept = r.student?.department_id === currentDeptId;
        const isLow = r.percentage < 40 || r.grade === 'F';
        return isDept && isLow;
      });

      // Filter faculty by department
      const deptFaculty = (facData || []).filter(f => f.department_id === currentDeptId);
      // Filter subjects/courses
      const deptSubjects = (coursesData || []).filter(c => c.department_id === currentDeptId);

      setLowPerformers(lowAlerts);
      setFaculty(deptFaculty);
      setSubjects(deptSubjects);
      setSections(sectionsData || []);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load performance data.');
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
      `Dear Parent,\n\nThis is to notify you regarding your child ${alertItem.student_name}'s performance in the subject "${alertItem.course?.name || 'Course'}".\n\nThey obtained ${alertItem.marks_obtained}/${alertItem.total_marks} (${alertItem.percentage}%) and received a grade of "${alertItem.grade}".\n\nWe would like to schedule a review discussion or direct them to extra lectures to improve their scoring.\n\nBest regards,\nHOD Office`
    );
    setIsEmailOpen(true);
  };

  const handleSendEmail = (e) => {
    e.preventDefault();
    const mailtoUrl = `mailto:${emailTarget.student?.parent_email || ''}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(mailtoUrl, '_blank');
    Toast.success('Email client triggered.');
    setIsEmailOpen(false);
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
        title: `📢 Extra Lecture Alert: ${subjects.find(s => s.subject_id === selectedSubject)?.name || 'Course'}`,
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
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>⚠️ Academic Performance Alerts</h1>
          <p>Monitor students with low marks, coordinate with parents, and schedule remedial extra classes.</p>
        </div>
      </div>

      {/* Main Alert List */}
      <div className="card">
        <div className="card-header" style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Low Marks Performance Alert Board</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {lowPerformers.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Score</th>
                  <th>Grade</th>
                  <th>Parent Info</th>
                  <th style={{ textAlign: 'center' }}>Remedial Actions</th>
                </tr>
              </thead>
              <tbody>
                {lowPerformers.map((alert, idx) => (
                  <tr key={alert.mark_id || idx}>
                    <td style={{ fontWeight: 600 }}>{alert.student_name}</td>
                    <td>{alert.course?.name || '—'}</td>
                    <td>
                      <strong style={{ color: '#FF6B6B' }}>
                        {alert.marks_obtained} / {alert.total_marks} ({alert.percentage}%)
                      </strong>
                    </td>
                    <td>
                      <span className="badge badge-danger">{alert.grade}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <div>📧 {alert.student?.parent_email || '—'}</div>
                      <div>📞 {alert.student?.parent_phone || '—'}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          onClick={() => handleOpenEmail(alert)}
                        >
                          ✉️ Contact Parent
                        </button>
                        <a 
                          href={`tel:${alert.student?.parent_phone || ''}`} 
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#00D4AA' }}
                        >
                          📞 Call Parent
                        </a>
                        <button 
                          className="btn btn-primary btn-sm" 
                          onClick={() => handleOpenLecture(alert)}
                        >
                          🗓️ Extra Lecture
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state" style={{ padding: '40px' }}>
              <div className="empty-state-icon">✔️</div>
              <p>Excellent! No students currently fall under academic alerts.</p>
            </div>
          )}
        </div>
      </div>

      {/* ======================== EMAIL PARENT MODAL ======================== */}
      {isEmailOpen && emailTarget && (
        <Modal isOpen={isEmailOpen} onClose={() => setIsEmailOpen(false)} title={`✉️ Contact Parent of ${emailTarget.student_name}`}>
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
              <button type="submit" className="btn btn-primary">Open Mailer</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================== EXTRA LECTURE MODAL ======================== */}
      {isLectureOpen && targetStudent && (
        <Modal isOpen={isLectureOpen} onClose={() => setIsLectureOpen(false)} title="🗓️ Set Remedial Extra Lecture">
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
    </>
  );
}

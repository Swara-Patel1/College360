import { useState, useEffect } from 'react';
import { API, SupaAPI, Utils } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import Modal from '../components/Modal.jsx';

const TYPE_LABEL = { endsem: 'End-Sem', midterm: 'Mid-Term', practical: 'Practical', quiz: 'Quiz', viva: 'Viva' };

export default function ExamSchedule() {
  const { user, studentProfile } = useAuthStore();
  const role = (user?.role || '').toLowerCase();
  const isFaculty = role === 'faculty' || role === 'hod';

  const [exams, setExams] = useState([]);
  const [profile, setProfile] = useState(studentProfile);
  const [loading, setLoading] = useState(true);
  const [seatPlan, setSeatPlan] = useState(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const loadExams = async () => {
      try {
        setLoading(true);
        let data = [];
        let deptId = '';

        if (isFaculty) {
          const prof = await API.get('faculty/my_profile').catch(() => null);
          if (isMounted && prof) setProfile(prof);
          data = prof?.id ? await SupaAPI.exams.byFaculty(prof.id) : [];
        } else {
          let prof = studentProfile;
          if (!prof) {
            prof = await API.get('students/my_profile').catch(() => null);
          }
          if (isMounted && prof) setProfile(prof);
          deptId = prof?.department_id || prof?.department?.department_id || prof?.department?.id || '';
          const semId = prof?.current_semester_id || prof?.current_semester?.semester_id || prof?.semester || '';

          const url = `exams?student_id=${user.id}${deptId ? `&department_id=${deptId}` : ''}${semId ? `&semester_id=${semId}` : ''}`;
          data = await API.get(url).catch(() => []);
        }

        if (!isMounted) return;
        const rawExams = Array.isArray(data) ? data : (data.results || []);
        setExams(rawExams);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadExams();
    return () => { isMounted = false; };
  }, [user, studentProfile]);

  const openSeatPlan = async (e) => {
    setSeatPlan({ loading: true });
    try {
      setSeatPlan(await SupaAPI.exams.seatPlan(e.id));
    } catch { setSeatPlan(null); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = exams.filter(e => e.date >= today);
  const nextExam = upcoming[0];
  const deptName = profile?.department_name || profile?.department?.name || '';

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="stat-icon" style={{ background: 'rgba(108, 99, 255, 0.2)', color: '#6C63FF' }}>
            <i className="bi bi-calendar-week"></i>
          </div>
          <div>
            <h1>Exam Schedule</h1>
            <p>
              {isFaculty
                ? 'Examinations for the courses you teach.'
                : (deptName ? `${deptName} Department Examinations` : 'Your department upcoming examinations.')}
            </p>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-clipboard"></i></div><div><div className="stat-value">{exams.length}</div><div className="stat-label">Total Department Exams</div></div></div>
        <div className="stat-card warning"><div className="stat-icon"><i className="bi bi-hourglass-split"></i></div><div><div className="stat-value">{upcoming.length}</div><div className="stat-label">Upcoming</div></div></div>
        <div className="stat-card info"><div className="stat-icon"><i className="bi bi-calendar3"></i></div><div><div className="stat-value" style={{ fontSize: '1.1rem' }}>{nextExam ? Utils.formatDate(nextExam.date) : '—'}</div><div className="stat-label">Next Exam</div></div></div>
      </div>

      <div className="card col-12">
        <div className="card-header"><div className="card-title"><i className="bi bi-journal-bookmark"></i> Examination Timetable</div></div>
        <div className="card-body" style={{ padding: 0 }}>
          {exams.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Course</th>
                    <th>Type</th>
                    <th>Room & Building</th>
                    <th>Max Marks</th>
                    {isFaculty && <th>Seat Plan</th>}
                  </tr>
                </thead>
                <tbody>
                  {exams.map(e => {
                    const isNext = nextExam && e.id === nextExam.id;
                    const typeText = TYPE_LABEL[e.exam_type?.toLowerCase()] || e.exam_type || 'Internal';
                    return (
                      <tr key={e.id} style={isNext ? { background: 'rgba(108,99,255,0.08)' } : undefined}>
                        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {Utils.formatDate(e.date)} 
                          {isNext && <span className="badge badge-primary" style={{ marginLeft: 8, background: '#6C63FF', color: '#FFF', fontSize: '0.68rem' }}>NEXT</span>}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                          {e.start_time} – {e.end_time}
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--primary-light)', marginRight: '6px' }}>{e.course_code}</span>
                          <span style={{ color: 'var(--text-main)' }}>· {e.course_name}</span>
                        </td>
                        <td>
                          <span className="badge badge-secondary" style={{ textTransform: 'uppercase', fontSize: '0.7rem', padding: '4px 8px' }}>
                            {typeText}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          <i className="bi bi-geo-alt me-1" style={{ color: 'var(--primary-light)' }}></i>
                          {e.room || 'TBA'}{e.building ? `, ${e.building}` : ''}
                        </td>
                        <td style={{ fontWeight: 600 }}>{e.max_marks}</td>
                        {isFaculty && (
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => openSeatPlan(e)}>
                              <i className="bi bi-grid-3x3-gap me-1"></i> View
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
              <div className="empty-state-icon"><i className="bi bi-calendar-week"></i></div>
              <h3>No exams scheduled</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your department exam timetable will appear here once published.</p>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={!!seatPlan} onClose={() => setSeatPlan(null)} title={<><i className="bi bi-grid-3x3-gap me-2"></i>Seat Plan</>}>
        {seatPlan?.loading ? (
          <div style={{ textAlign: 'center', padding: '30px' }}><div className="loading-spinner" /></div>
        ) : seatPlan ? (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {seatPlan.exam?.course_code} · {seatPlan.total_students} students · {seatPlan.rooms} room(s)
            </p>
            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              <table className="table">
                <thead><tr><th>Seat</th><th>Room</th><th>Enrollment</th><th>Student</th></tr></thead>
                <tbody>
                  {(seatPlan.seats || []).map(s => (
                    <tr key={s.seat}><td>#{s.seat_in_room}</td><td>{s.room}</td><td>{s.enrollment_no}</td><td>{s.student_name}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

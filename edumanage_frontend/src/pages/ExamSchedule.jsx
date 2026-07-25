import { useState, useEffect } from 'react';
import { API, SupaAPI, Utils } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import Modal from '../components/Modal.jsx';

const TYPE_LABEL = { endsem: 'End-Sem', midterm: 'Mid-Term', practical: 'Practical', quiz: 'Quiz', viva: 'Viva' };

export default function ExamSchedule() {
  const { user } = useAuthStore();
  const role = (user?.role || '').toLowerCase();
  const isFaculty = role === 'faculty' || role === 'hod';

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seatPlan, setSeatPlan] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setLoading(true);
        let data;
        if (isFaculty) {
          const prof = await API.get('faculty/my_profile').catch(() => null);
          data = prof?.id ? await SupaAPI.exams.byFaculty(prof.id) : [];
        } else {
          data = await SupaAPI.exams.byStudent(user.id);
        }
        setExams(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

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

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1><i className="bi bi-calendar-week"></i> Exam Schedule</h1>
          <p>{isFaculty ? 'Examinations for the courses you teach.' : 'Your upcoming examinations.'}</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-clipboard"></i></div><div className="stat-value">{exams.length}</div><div className="stat-label">Total Exams</div></div>
        <div className="stat-card warning"><div className="stat-icon"><i className="bi bi-hourglass-split"></i></div><div className="stat-value">{upcoming.length}</div><div className="stat-label">Upcoming</div></div>
        <div className="stat-card info"><div className="stat-icon"><i className="bi bi-calendar3"></i></div><div className="stat-value" style={{ fontSize: '1.1rem' }}>{nextExam ? Utils.formatDate(nextExam.date) : '—'}</div><div className="stat-label">Next Exam</div></div>
      </div>

      <div className="card col-12">
        <div className="card-header"><div className="card-title"><i className="bi bi-journal-bookmark"></i> Timetable</div></div>
        <div className="card-body" style={{ padding: 0 }}>
          {exams.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Time</th><th>Course</th><th>Type</th><th>Room</th><th>Max Marks</th>{isFaculty && <th>Seats</th>}</tr>
                </thead>
                <tbody>
                  {exams.map(e => {
                    const isNext = nextExam && e.id === nextExam.id;
                    return (
                      <tr key={e.id} style={isNext ? { background: 'rgba(108,99,255,0.08)' } : undefined}>
                        <td>{Utils.formatDate(e.date)} {isNext && <span className="badge badge-primary" style={{ marginLeft: 6 }}>next</span>}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{e.start_time}–{e.end_time}</td>
                        <td><strong>{e.course_code}</strong> · {e.course_name}</td>
                        <td>{TYPE_LABEL[e.exam_type] || e.exam_type}</td>
                        <td>{e.room || 'TBA'}{e.building ? `, ${e.building}` : ''}</td>
                        <td>{e.max_marks}</td>
                        {isFaculty && <td><button className="btn btn-ghost btn-sm" onClick={() => openSeatPlan(e)}><i className="bi bi-grid-3x3-gap"></i> View</button></td>}
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
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your exam timetable will appear here once published.</p>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={!!seatPlan} onClose={() => setSeatPlan(null)} title="🪑 Seat Plan">
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

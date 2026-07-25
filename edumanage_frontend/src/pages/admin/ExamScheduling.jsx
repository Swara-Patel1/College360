import { useState, useEffect } from 'react';
import { API, SupaAPI, Utils } from '../../api/client.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

const EXAM_TYPES = [
  { value: 'endsem', label: 'End-Semester' },
  { value: 'midterm', label: 'Mid-Term' },
  { value: 'practical', label: 'Practical' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'viva', label: 'Viva' },
];

const emptyForm = () => ({
  course_id: '', exam_type: 'endsem', date: '', start_time: '10:00', end_time: '13:00',
  room: '', building: 'Main Campus', max_marks: 100, seats_per_room: 30,
});

export default function ExamScheduling() {
  const [exams, setExams] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const [seatPlan, setSeatPlan] = useState(null);
  const [seatLoading, setSeatLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [ex, cs] = await Promise.all([SupaAPI.exams.all(), API.get('courses').catch(() => [])]);
      setExams(Array.isArray(ex) ? ex : []);
      setCourses(Array.isArray(cs) ? cs : []);
    } catch (e) {
      Toast.error('Failed to load exam schedule.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setFormOpen(true); };
  const openEdit = (e) => {
    setEditing(e);
    setForm({
      course_id: e.course_id, exam_type: e.exam_type, date: e.date,
      start_time: e.start_time, end_time: e.end_time, room: e.room,
      building: e.building, max_marks: e.max_marks, seats_per_room: e.seats_per_room,
    });
    setFormOpen(true);
  };

  const save = async (ev) => {
    ev.preventDefault();
    if (!form.course_id || !form.date) { Toast.warning('Course and date are required.'); return; }
    try {
      setSaving(true);
      if (editing) await SupaAPI.exams.update(editing.id, form);
      else await SupaAPI.exams.create(form);
      Toast.success(`Exam ${editing ? 'updated' : 'scheduled'}.`);
      setFormOpen(false);
      load();
    } catch {
      Toast.error('Failed to save exam.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e) => {
    if (!window.confirm(`Delete the ${e.exam_type} exam for ${e.course_code}?`)) return;
    try {
      await SupaAPI.exams.remove(e.id);
      setExams(prev => prev.filter(x => x.id !== e.id));
      Toast.success('Exam removed.');
    } catch { Toast.error('Failed to delete.'); }
  };

  const openSeatPlan = async (e) => {
    try {
      setSeatLoading(true);
      setSeatPlan({ loading: true, exam: e });
      const plan = await SupaAPI.exams.seatPlan(e.id);
      setSeatPlan(plan);
    } catch {
      Toast.error('Failed to build seat plan.');
      setSeatPlan(null);
    } finally {
      setSeatLoading(false);
    }
  };

  // Detect clashes: same room + date + overlapping time.
  const clashIds = new Set();
  for (let a = 0; a < exams.length; a++) {
    for (let b = a + 1; b < exams.length; b++) {
      const x = exams[a], y = exams[b];
      if (x.date === y.date && x.room && x.room === y.room &&
          x.start_time < y.end_time && y.start_time < x.end_time) {
        clashIds.add(x.id); clashIds.add(y.id);
      }
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left"><h1><i className="bi bi-calendar-week"></i> Examination Scheduling</h1><p>Create the exam timetable and generate seat plans.</p></div>
        <div className="page-header-right"><button className="btn btn-primary" onClick={openCreate}><i className="bi bi-plus-lg"></i> Schedule Exam</button></div>
      </div>

      {clashIds.size > 0 && (
        <div className="card col-12" style={{ marginBottom: '16px', borderLeft: '3px solid var(--accent, #FF6B6B)' }}>
          <div className="card-body" style={{ fontSize: '0.85rem' }}>
            <i className="bi bi-exclamation-triangle"></i> <strong>{clashIds.size} exam(s)</strong> share a room at overlapping times — highlighted below.
          </div>
        </div>
      )}

      <div className="card col-12">
        <div className="card-body" style={{ padding: 0 }}>
          {exams.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Date</th><th>Time</th><th>Course</th><th>Type</th><th>Room</th><th>Actions</th></tr></thead>
                <tbody>
                  {exams.map(e => (
                    <tr key={e.id} style={clashIds.has(e.id) ? { background: 'rgba(255,107,107,0.08)' } : undefined}>
                      <td>{Utils.formatDate(e.date)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{e.start_time}–{e.end_time}</td>
                      <td><strong>{e.course_code}</strong> · {e.course_name}</td>
                      <td style={{ textTransform: 'capitalize' }}>{e.exam_type}</td>
                      <td>{e.room || '—'} {clashIds.has(e.id) && <span className="badge badge-danger" style={{ marginLeft: 6 }}>clash</span>}</td>
                      <td style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openSeatPlan(e)}><i className="bi bi-grid-3x3-gap"></i> Seats</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}><i className="bi bi-pencil"></i></button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent, #FF6B6B)' }} onClick={() => remove(e)}><i className="bi bi-trash"></i></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
              <div className="empty-state-icon"><i className="bi bi-calendar-week"></i></div><h3>No exams scheduled</h3>
              <button className="btn btn-primary" onClick={openCreate} style={{ marginTop: '12px' }}>Schedule your first exam</button>
            </div>
          )}
        </div>
      </div>

      {/* Create / edit modal */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? <><i className="bi bi-pencil-square me-2"></i>Edit Exam</> : <><i className="bi bi-plus-circle me-2"></i>Schedule Exam</>}>
        <form onSubmit={save}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Course *</label>
            <select className="form-control" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })} required>
              <option value="">Select course…</option>
              {courses.map(c => <option key={c.subject_id || c.id} value={c.subject_id || c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group">
              <label className="form-label">Exam Type</label>
              <select className="form-control" value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })}>
                {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input type="date" className="form-control" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <input type="time" className="form-control" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">End Time</label>
              <input type="time" className="form-control" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Room / Hall</label>
              <input className="form-control" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Exam Hall A" />
            </div>
            <div className="form-group">
              <label className="form-label">Seats / Room</label>
              <input type="number" className="form-control" value={form.seats_per_room} onChange={(e) => setForm({ ...form, seats_per_room: e.target.value })} />
            </div>
          </div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Schedule'}</button>
          </div>
        </form>
      </Modal>

      {/* Seat plan modal */}
      <Modal isOpen={!!seatPlan} onClose={() => setSeatPlan(null)} title={<><i className="bi bi-grid-3x3-gap me-2"></i>Seat Plan</>}>
        {seatLoading || seatPlan?.loading ? (
          <div style={{ textAlign: 'center', padding: '30px' }}><div className="loading-spinner" /></div>
        ) : seatPlan ? (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {seatPlan.exam?.course_code} · {Utils.formatDate(seatPlan.exam?.date)} · {seatPlan.total_students} students across {seatPlan.rooms} room(s)
            </p>
            {seatPlan.seats?.length ? (
              <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Seat</th><th>Room</th><th>Enrollment</th><th>Student</th></tr></thead>
                  <tbody>
                    {seatPlan.seats.map(s => (
                      <tr key={s.seat}>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>#{s.seat_in_room}</td>
                        <td>{s.room}</td>
                        <td>{s.enrollment_no}</td>
                        <td>{s.student_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p style={{ color: 'var(--text-muted)' }}>No enrolled students to seat.</p>}
          </>
        ) : null}
      </Modal>
    </>
  );
}

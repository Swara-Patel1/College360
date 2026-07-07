import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

export default function HODSeminars() {
  const { user } = useAuthStore();
  const [seminars, setSeminars] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [description, setDescription] = useState('');
  const [seminarDate, setSeminarDate] = useState('');
  const [room, setRoom] = useState('');
  const [target, setTarget] = useState('all');

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await API.get('seminars');
      setSeminars(data || []);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load seminars list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!title || !speaker || !description || !seminarDate || !room) {
      Toast.warning('Please fill in all fields.');
      return;
    }

    try {
      setLoading(true);
      await API.post('seminars', {
        title,
        speaker,
        description,
        seminar_date: new Date(seminarDate).toISOString(),
        room,
        target
      });

      // Also post a notice about the new seminar
      const audienceAlert = target === 'all' ? 'All Students' : 'Students with Low Placement Predictor Scores';
      await API.post('notices', {
        title: `🎙️ New Seminar Scheduled: ${title}`,
        content: `Expert speaker ${speaker} will conduct a seminar on "${title}". Targeted for: ${audienceAlert}. Time: ${new Date(seminarDate).toLocaleString()}. Venue: ${room}. Attendance is recommended.`,
        audience: 'students',
        notice_type: 'general'
      });

      Toast.success('Seminar scheduled successfully and alert notice posted.');
      setIsAddOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to schedule seminar.');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setSpeaker('');
    setDescription('');
    setSeminarDate('');
    setRoom('');
    setTarget('all');
  };

  if (loading && !seminars.length) {
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
          <h1>🎙️ Seminar Scheduling & Management</h1>
          <p>Schedule academic and career counseling seminars for your students.</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => { resetForm(); setIsAddOpen(true); }}>
            ➕ Schedule Seminar
          </button>
        </div>
      </div>

      {/* Seminars List Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px', marginTop: '10px' }}>
        {seminars.map((sem) => (
          <div key={sem.id} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="card-header" style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)', display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className={`badge badge-${sem.target === 'all' ? 'success' : 'warning'}`}>
                  🎯 {sem.target === 'all' ? 'All Students' : 'Low Placement Prep Only'}
                </span>
                <span className="badge badge-info">📍 {sem.room}</span>
              </div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>{sem.title}</h3>
            </div>
            <div className="card-body" style={{ padding: '15px 20px', flex: 1 }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {sem.description}
              </p>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <div>👨‍🏫 <strong>Speaker:</strong> {sem.speaker}</div>
                <div style={{ marginTop: '4px' }}>📅 <strong>Date:</strong> {new Date(sem.seminar_date).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ======================== SCHEDULE SEMINAR MODAL ======================== */}
      {isAddOpen && (
        <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="🎙️ Schedule New Expert Seminar">
          <form onSubmit={handleAddSubmit}>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Seminar Title *</label>
              <input type="text" className="form-input" required placeholder="e.g. Preparing for FAANG Interviews" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Speaker / Expert *</label>
              <input type="text" className="form-input" required placeholder="e.g. Jane Doe (Tech Lead, Google)" value={speaker} onChange={e => setSpeaker(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Seminar Description *</label>
              <textarea className="form-input" rows="3" required placeholder="Outline key topics covered in the session..." value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Date & Time *</label>
                <input type="datetime-local" className="form-input" required value={seminarDate} onChange={e => setSeminarDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Venue / Room *</label>
                <input type="text" className="form-input" required placeholder="e.g. Auditorium A" value={room} onChange={e => setRoom(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Target Audience</label>
              <select className="form-input" value={target} onChange={e => setTarget(e.target.value)}>
                <option value="all">All Department Students</option>
                <option value="low_placement">Students with Low Placement Predictor Score Only</option>
              </select>
            </div>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsAddOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>Schedule Seminar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

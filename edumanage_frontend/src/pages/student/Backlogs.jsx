import { useState, useEffect } from 'react';
import { SupaAPI, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

const STATUS_LABEL = { active: 'Active KT', registered: 'Registered', cleared: 'Cleared' };
const STATUS_BADGE = { active: 'badge badge-danger', registered: 'badge badge-warning', cleared: 'badge badge-success' };

export default function Backlogs() {
  const { user } = useAuthStore();
  const [backlogs, setBacklogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState(null);   // backlog being registered
  const [reexamDate, setReexamDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await SupaAPI.backlogs.byStudent(user.id);
      setBacklogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) load(); }, [user]);

  const counts = {
    total: backlogs.length,
    active: backlogs.filter(b => b.status === 'active').length,
    registered: backlogs.filter(b => b.status === 'registered').length,
    cleared: backlogs.filter(b => b.status === 'cleared').length,
  };

  const openRegister = (b) => {
    setActive(b);
    setReexamDate('');
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    if (!reexamDate) { Toast.warning('Pick a re-exam date.'); return; }
    try {
      setSubmitting(true);
      await SupaAPI.backlogs.register(active.id, reexamDate);
      Toast.success('Registered for the re-exam.');
      setActive(null);
      load();
    } catch {
      Toast.error('Failed to register.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;
  }

  return (
    <>
      <div className="stat-card primary" style={{ marginBottom: '20px' }}>
        <div className="stat-icon"><i className="bi bi-graph-down-arrow"></i></div>
        <div className="stat-value">Backlog / KT Tracker</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
          Track failed subjects, register for re-examinations, and see your clearance history.
        </p>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-book"></i></div><div className="stat-value">{counts.total}</div><div className="stat-label">Total KTs</div></div>
        <div className="stat-card danger"><div className="stat-icon"><i className="bi bi-exclamation-triangle"></i></div><div className="stat-value">{counts.active}</div><div className="stat-label">Active (register now)</div></div>
        <div className="stat-card warning"><div className="stat-icon"><i className="bi bi-pencil-square"></i></div><div className="stat-value">{counts.registered}</div><div className="stat-label">Registered</div></div>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div><div className="stat-value">{counts.cleared}</div><div className="stat-label">Cleared</div></div>
      </div>

      <div className="card col-12">
        <div className="card-header"><div className="card-title"><i className="bi bi-journal-bookmark"></i> My Backlog Records</div></div>
        <div className="card-body" style={{ display: 'grid', gap: '14px' }}>
          {backlogs.length ? backlogs.map(b => (
            <div key={b.id} style={{ padding: '16px 20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <div style={{ fontWeight: 700 }}>{b.course_code} · {b.course_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Semester {b.semester} · Attempt {b.attempts}
                  {b.reexam_date && b.status !== 'cleared' && <> · Re-exam {Utils.formatDate(b.reexam_date)}</>}
                  {b.status === 'cleared' && b.cleared_date && <> · Cleared {Utils.formatDate(b.cleared_date)}</>}
                </div>
              </div>
              <span className={STATUS_BADGE[b.status] || 'badge badge-muted'}>{STATUS_LABEL[b.status] || b.status}</span>
              {b.status === 'active' && (
                <button className="btn btn-primary btn-sm" onClick={() => openRegister(b)}>Register Re-exam</button>
              )}
            </div>
          )) : (
            <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
              <div className="empty-state-icon"><i className="bi bi-balloon"></i></div>
              <h3>No backlogs — you're all clear!</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Keep it up. Failed subjects would appear here for re-registration.</p>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={!!active} onClose={() => setActive(null)} title="📝 Register for Re-exam">
        {active && (
          <form onSubmit={submitRegister}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {active.course_code} · {active.course_name} (Semester {active.semester})
            </p>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Preferred re-exam date *</label>
              <input type="date" className="form-control" value={reexamDate} onChange={(e) => setReexamDate(e.target.value)} required />
            </div>
            <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setActive(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Registering…' : 'Confirm Registration'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

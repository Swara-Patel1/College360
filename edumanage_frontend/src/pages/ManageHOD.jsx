import { useState, useEffect } from 'react';
import { API } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Toast } from '../store/useNotifStore.js';
import Modal from '../components/Modal.jsx';

export default function ManageHOD() {
  const { user } = useAuthStore();
  const [hods, setHods] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  const [assignDept, setAssignDept] = useState('');
  const [assignFaculty, setAssignFaculty] = useState('');
  const [removing, setRemoving] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === 'admin';

  const loadData = async () => {
    try {
      setLoading(true);
      const [hodData, deptData, facData] = await Promise.all([
        API.get('hod'),
        API.get('departments'),
        API.get('faculty'),
      ]);
      setHods(Array.isArray(hodData) ? hodData : []);
      setDepartments(Array.isArray(deptData) ? deptData : []);
      setFaculty(Array.isArray(facData) ? facData : []);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load HOD data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  const openAssign = (deptId = '') => {
    setAssignDept(deptId);
    setAssignFaculty('');
    setIsAssignOpen(true);
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignDept || !assignFaculty) { Toast.warning('Select a department and a faculty member.'); return; }
    try {
      setSubmitting(true);
      await API.post('hod', { department_id: assignDept, faculty_id: assignFaculty });
      Toast.success('HOD assigned successfully!');
      setIsAssignOpen(false); loadData();
    } catch (err) {
      console.error(err);
      Toast.error(err?.message || 'Failed to assign HOD.');
    } finally { setSubmitting(false); }
  };

  const handleRemoveClick = (h) => { setRemoving(h); setIsRemoveOpen(true); };

  const handleRemoveConfirm = async () => {
    try {
      setSubmitting(true);
      await API.delete(`hod/${removing.id}`);
      Toast.success('HOD removed. Member reverted to faculty.');
      setIsRemoveOpen(false); setRemoving(null); loadData();
    } catch (err) {
      console.error(err);
      Toast.error(err?.message || 'Failed to remove HOD.');
    } finally { setSubmitting(false); }
  };

  // Faculty available to become HOD of the selected department (same department, not already HOD)
  const hodUserIds = new Set(hods.map(h => h.user_id));
  const eligibleFaculty = faculty.filter(f =>
    (!assignDept || f.department_id === assignDept) && !hodUserIds.has(f.user_id)
  );

  const departmentsWithoutHod = departments.filter(d => !hods.some(h => h.department_id === d.id));

  const filtered = hods.filter(h => {
    const q = searchQuery.toLowerCase();
    const name = `${h.first_name || ''} ${h.last_name || ''}`.toLowerCase();
    return name.includes(q) || (h.email || '').toLowerCase().includes(q) || (h.department_name || '').toLowerCase().includes(q);
  });

  if (loading && !hods.length) {
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
          <h1>🏛️ Manage HODs</h1>
          <p>Assign and manage Heads of Department. Assigning promotes a faculty member to HOD.</p>
        </div>
        {isAdmin && (
          <div className="page-header-right">
            <button className="btn btn-primary" onClick={() => openAssign()}>➕ Assign HOD</button>
          </div>
        )}
      </div>

      <div className="stats-mini">
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(139,92,246,0.2)' }}>🏛️</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#8b5cf6' }}>{hods.length}</div>
            <div className="stats-mini-lbl">HODs Assigned</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(255,159,67,0.2)' }}>⚠️</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#FF9F43' }}>{departmentsWithoutHod.length}</div>
            <div className="stats-mini-lbl">Without HOD</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(14,165,233,0.2)' }}>🧑‍🏫</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#0ea5e9' }}>{faculty.length}</div>
            <div className="stats-mini-lbl">Total Faculty</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(108,99,255,0.2)' }}>🏢</div>
          <div>
            <div className="stats-mini-val" style={{ color: 'var(--primary)' }}>{departments.length}</div>
            <div className="stats-mini-lbl">Departments</div>
          </div>
        </div>
      </div>

      {/* Departments still needing an HOD */}
      {isAdmin && departmentsWithoutHod.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>⚠️ Departments without an HOD:</span>
            {departmentsWithoutHod.map(d => (
              <button key={d.id} className="btn btn-ghost btn-sm" onClick={() => openAssign(d.id)}>
                {d.name} ➕
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="filters-bar" style={{ display: 'flex', gap: '10px', padding: '15px 20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input
              type="text" className="form-input"
              placeholder="Search by name, email, department..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {filtered.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>HOD</th>
                  <th>Department</th>
                  <th>Employee ID</th>
                  <th>Email</th>
                  {isAdmin && <th style={{ textAlign: 'center' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 600 }}>
                      {`${h.first_name || ''} ${h.last_name || ''}`.trim() || h.email}
                      <span className="badge badge-info" style={{ marginLeft: '8px' }}>HOD</span>
                    </td>
                    <td>{h.department_name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{h.employee_id || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{h.email || '—'}</td>
                    {isAdmin && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openAssign(h.department_id)}>🔄 Change</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#FF6B6B' }} onClick={() => handleRemoveClick(h)}>🗑️ Remove</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🏛️</div>
              <p>No HODs assigned yet.</p>
            </div>
          )}
        </div>
      </div>

      {isAssignOpen && (
        <Modal onClose={() => setIsAssignOpen(false)} title="➕ Assign Head of Department">
          <form onSubmit={handleAssignSubmit}>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Department *</label>
              <select className="form-input" required value={assignDept} onChange={e => { setAssignDept(e.target.value); setAssignFaculty(''); }}>
                <option value="">Select Department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Faculty Member *</label>
              <select className="form-input" required value={assignFaculty} onChange={e => setAssignFaculty(e.target.value)}>
                <option value="">{assignDept ? 'Select Faculty' : 'Select a department first'}</option>
                {eligibleFaculty.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.first_name} {f.last_name} {f.employee_id ? `(${f.employee_id})` : ''}
                  </option>
                ))}
              </select>
              {assignDept && eligibleFaculty.length === 0 && (
                <small style={{ color: 'var(--text-muted)' }}>No eligible faculty in this department. Add faculty first.</small>
              )}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
              ℹ️ The selected faculty will be promoted to HOD. Any existing HOD for this department will be reverted to faculty.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsAssignOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? '⏳ Assigning...' : '➕ Assign HOD'}</button>
            </div>
          </form>
        </Modal>
      )}

      {isRemoveOpen && (
        <Modal onClose={() => setIsRemoveOpen(false)} title="🗑️ Remove HOD">
          <div style={{ padding: '10px 0' }}>
            <h3 style={{ marginBottom: '10px' }}>{`${removing?.first_name || ''} ${removing?.last_name || ''}`.trim() || removing?.email}</h3>
            <p>Remove this person as HOD of <strong>{removing?.department_name}</strong>? They will revert to a regular faculty member.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setIsRemoveOpen(false)} disabled={submitting}>Cancel</button>
              <button className="btn btn-danger" onClick={handleRemoveConfirm} disabled={submitting}>{submitting ? '⏳ Removing...' : '🗑️ Remove HOD'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

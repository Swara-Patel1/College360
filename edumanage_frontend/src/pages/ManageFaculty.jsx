import { useState, useEffect } from 'react';
import { API } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Toast } from '../store/useNotifStore.js';
import Modal from '../components/Modal.jsx';

export default function ManageFaculty() {
  const { user } = useAuthStore();
  const [faculty, setFaculty] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals
  const [isAddOpen,    setIsAddOpen]    = useState(false);
  const [isEditOpen,   setIsEditOpen]   = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isViewOpen,   setIsViewOpen]   = useState(false);

  // Form fields
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [employeeId,  setEmployeeId]  = useState('');
  const [deptId,      setDeptId]      = useState('');
  const [role,        setRole]        = useState('faculty');
  const [status,      setStatus]      = useState('active');
  const [password,    setPassword]    = useState('');

  const [editingFaculty,  setEditingFaculty]  = useState(null);
  const [deletingFaculty, setDeletingFaculty] = useState(null);
  const [viewingFaculty,  setViewingFaculty]  = useState(null);

  const isAdmin = user?.role === 'admin';

  const loadData = async () => {
    try {
      setLoading(true);
      const [facData, deptData] = await Promise.all([
        API.get('faculty'),
        API.get('departments'),
      ]);
      setFaculty(Array.isArray(facData) ? facData : []);
      setDepartments(Array.isArray(deptData) ? deptData : []);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load faculty data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  const resetForm = () => {
    setFirstName(''); setLastName(''); setEmail('');
    setEmployeeId(''); setDeptId(''); setRole('faculty');
    setStatus('active'); setPassword('');
    setEditingFaculty(null);
  };

  // ─── ADD ───────────────────────────────────────────────────────────────────
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !deptId) {
      Toast.warning('Please fill in all required fields.');
      return;
    }
    try {
      setLoading(true);
      await API.post('faculty', {
        first_name: firstName, last_name: lastName,
        email, employee_id: employeeId,
        department_id: deptId, role, status,
        password: password || undefined,
      });
      Toast.success('Faculty added successfully!');
      setIsAddOpen(false); resetForm(); loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to add faculty.');
      setLoading(false);
    }
  };

  // ─── EDIT ──────────────────────────────────────────────────────────────────
  const handleEditClick = (f) => {
    setEditingFaculty(f);
    setFirstName(f.first_name || '');
    setLastName(f.last_name || '');
    setEmail(f.email || '');
    setEmployeeId(f.employee_id || '');
    setDeptId(f.department_id || '');
    setRole(f.user?.roles || 'faculty');
    setStatus(f.status || 'active');
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !deptId) {
      Toast.warning('Please fill in all required fields.');
      return;
    }
    try {
      setLoading(true);
      await API.patch(`faculty/${editingFaculty.id}`, {
        first_name: firstName, last_name: lastName,
        email, employee_id: employeeId,
        department_id: deptId, status,
      });
      Toast.success('Faculty updated successfully!');
      setIsEditOpen(false); resetForm(); loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to update faculty.');
      setLoading(false);
    }
  };

  // ─── VIEW ──────────────────────────────────────────────────────────────────
  const handleViewClick = (f) => { setViewingFaculty(f); setIsViewOpen(true); };

  // ─── DELETE ────────────────────────────────────────────────────────────────
  const handleDeleteClick   = (f) => { setDeletingFaculty(f); setIsDeleteOpen(true); };
  const handleDeleteConfirm = async () => {
    try {
      setLoading(true);
      await API.delete(`faculty/${deletingFaculty.id}`);
      Toast.success('Faculty deleted successfully!');
      setIsDeleteOpen(false); setDeletingFaculty(null); loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to delete faculty.');
      setLoading(false);
    }
  };

  // ─── FILTER ────────────────────────────────────────────────────────────────
  const filtered = faculty.filter(f => {
    const name  = `${f.first_name || ''} ${f.last_name || ''}`.toLowerCase();
    const em    = (f.email || '').toLowerCase();
    const empid = String(f.employee_id || '').toLowerCase();
    const q     = searchQuery.toLowerCase();
    return (
      (name.includes(q) || em.includes(q) || empid.includes(q)) &&
      (selectedDept   ? f.department_id === selectedDept   : true) &&
      (selectedStatus ? f.status === selectedStatus         : true)
    );
  });

  const totalCount    = faculty.length;
  const activeCount   = faculty.filter(f => f.status === 'active').length;
  const inactiveCount = faculty.filter(f => f.status === 'inactive').length;
  const hodCount      = faculty.filter(f => (f.user?.roles || f.user?.role) === 'hod').length;

  if (loading && !faculty.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>🧑‍🏫 Manage Faculty</h1>
          <p>Manage faculty profiles, departments, and employment status.</p>
        </div>
        {isAdmin && (
          <div className="page-header-right">
            <button className="btn btn-primary" onClick={() => { resetForm(); setIsAddOpen(true); }}>
              ➕ Add Faculty
            </button>
          </div>
        )}
      </div>

      {/* ── Mini Stats ── */}
      <div className="stats-mini">
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(14,165,233,0.2)' }}>🧑‍🏫</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#0ea5e9' }}>{totalCount}</div>
            <div className="stats-mini-lbl">Total Faculty</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(0,212,170,0.2)' }}>✅</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#00D4AA' }}>{activeCount}</div>
            <div className="stats-mini-lbl">Active</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(139,92,246,0.2)' }}>🏛️</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#8b5cf6' }}>{hodCount}</div>
            <div className="stats-mini-lbl">HODs</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(255,107,107,0.2)' }}>⏸️</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#FF6B6B' }}>{inactiveCount}</div>
            <div className="stats-mini-lbl">Inactive</div>
          </div>
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="card">
        {/* Filters */}
        <div className="filters-bar" style={{ display: 'flex', gap: '10px', padding: '15px 20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <input
              type="text" className="form-input"
              placeholder="Search by name, email, employee ID..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="form-input" style={{ flex: 1, minWidth: '150px' }} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="form-input" style={{ flex: 1, minWidth: '130px' }} value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Table */}
        <div className="card-body" style={{ padding: 0 }}>
          {filtered.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Faculty</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.first_name} {f.last_name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{f.employee_id || '—'}</td>
                    <td>{f.department_name}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{f.email || '—'}</td>
                    <td>
                      <span className={`badge badge-${f.status === 'active' ? 'success' : 'danger'}`}>
                        {f.status?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleViewClick(f)}>🔍 View</button>
                        {isAdmin && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleEditClick(f)}>📝 Edit</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: '#FF6B6B' }} onClick={() => handleDeleteClick(f)}>🗑️ Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🧑‍🏫</div>
              <p>No faculty records match the filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── ADD FACULTY MODAL ── */}
      {isAddOpen && (
        <Modal onClose={() => setIsAddOpen(false)} title="➕ Add New Faculty">
          <form onSubmit={handleAddSubmit}>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">First Name *</label>
                <input type="text" className="form-input" required value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Last Name *</label>
                <input type="text" className="form-input" required value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Email Address *</label>
              <input type="email" className="form-input" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Employee ID</label>
                <input type="text" className="form-input" placeholder="e.g. F007" value={employeeId} onChange={e => setEmployeeId(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Temporary Password</label>
                <input type="password" className="form-input" placeholder="faculty123" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Department *</label>
                <select className="form-input" required value={deptId} onChange={e => setDeptId(e.target.value)}>
                  <option value="">Select Department</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Role</label>
                <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
                  <option value="faculty">Faculty</option>
                  <option value="hod">HOD</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Status</label>
              <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsAddOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">➕ Save Faculty</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── EDIT FACULTY MODAL ── */}
      {isEditOpen && (
        <Modal onClose={() => setIsEditOpen(false)} title="📝 Edit Faculty Profile">
          <form onSubmit={handleEditSubmit}>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">First Name *</label>
                <input type="text" className="form-input" required value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Last Name *</label>
                <input type="text" className="form-input" required value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Email Address *</label>
              <input type="email" className="form-input" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Employee ID</label>
              <input type="text" className="form-input" value={employeeId} onChange={e => setEmployeeId(e.target.value)} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Department *</label>
                <select className="form-input" required value={deptId} onChange={e => setDeptId(e.target.value)}>
                  <option value="">Select Department</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Status</label>
                <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsEditOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">💾 Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── DELETE MODAL ── */}
      {isDeleteOpen && (
        <Modal onClose={() => setIsDeleteOpen(false)} title="🗑️ Delete Faculty">
          <div style={{ padding: '10px 0' }}>
            <h3 style={{ marginBottom: '10px' }}>{deletingFaculty?.first_name} {deletingFaculty?.last_name}</h3>
            <p>Are you sure you want to delete this faculty profile? This will permanently remove their records from the portal.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm}>🗑️ Delete Faculty</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── VIEW DETAILS MODAL ── */}
      {isViewOpen && viewingFaculty && (
        <Modal onClose={() => setIsViewOpen(false)} title="🔍 Faculty Details">
          <div style={{ display: 'grid', gap: '20px', padding: '10px 0' }}>
            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', borderBottom: '1px solid var(--border)', paddingBottom: '15px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(14,165,233,0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                {`${(viewingFaculty.first_name || '')[0] || ''}${(viewingFaculty.last_name || '')[0] || ''}`.toUpperCase()}
              </div>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{viewingFaculty.first_name} {viewingFaculty.last_name}</h3>
                <span className={`badge badge-${viewingFaculty.status === 'active' ? 'success' : 'danger'}`} style={{ marginTop: '5px', display: 'inline-block' }}>
                  {viewingFaculty.status?.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              {[
                { label: 'Employee ID',  value: viewingFaculty.employee_id || '—' },
                { label: 'Email',        value: viewingFaculty.email || '—' },
                { label: 'Department',   value: viewingFaculty.department_name || '—' },
                { label: 'Role',         value: (viewingFaculty.user?.roles || viewingFaculty.user?.role || 'faculty').toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>{label}</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{value}</strong>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button className="btn btn-primary" onClick={() => setIsViewOpen(false)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

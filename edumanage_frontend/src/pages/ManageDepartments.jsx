import { useState, useEffect } from 'react';
import { API } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Toast } from '../store/useNotifStore.js';
import Modal from '../components/Modal.jsx';

const emptyFaculty = () => ({ first_name: '', last_name: '', email: '', employee_id: '' });
const emptyStudent = () => ({ first_name: '', last_name: '', email: '', roll_number: '', semester_id: '' });

export default function ManageDepartments() {
  const { user } = useAuthStore();
  const [departments, setDepartments] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [students, setStudents] = useState([]);
  const [hods, setHods] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [facultyRows, setFacultyRows] = useState([emptyFaculty()]);
  const [hodIndex, setHodIndex] = useState('');
  const [studentRows, setStudentRows] = useState([emptyStudent()]);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');

  const isAdmin = user?.role === 'admin';

  const loadData = async () => {
    try {
      setLoading(true);
      const [deptData, facData, studData, hodData, semData] = await Promise.all([
        API.get('departments'),
        API.get('faculty').catch(() => []),
        API.get('students').catch(() => []),
        API.get('hod').catch(() => []),
        API.get('semesters').catch(() => []),
      ]);
      setDepartments(Array.isArray(deptData) ? deptData : []);
      setFaculty(Array.isArray(facData) ? facData : []);
      setStudents(Array.isArray(studData) ? studData : []);
      setHods(Array.isArray(hodData) ? hodData : []);
      setSemesters(Array.isArray(semData) ? semData : []);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load departments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  const resetForm = () => {
    setName(''); setCode('');
    setFacultyRows([emptyFaculty()]); setHodIndex('');
    setStudentRows([emptyStudent()]);
    setEditing(null); setProgress('');
  };

  // ─── dynamic row helpers ────────────────────────────────────────────────
  const updateFacultyRow = (i, field, val) =>
    setFacultyRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addFacultyRow = () => setFacultyRows(rows => [...rows, emptyFaculty()]);
  const removeFacultyRow = (i) => setFacultyRows(rows => {
    const next = rows.filter((_, idx) => idx !== i);
    if (String(hodIndex) === String(i)) setHodIndex('');
    return next.length ? next : [emptyFaculty()];
  });

  const updateStudentRow = (i, field, val) =>
    setStudentRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addStudentRow = () => setStudentRows(rows => [...rows, emptyStudent()]);
  const removeStudentRow = (i) => setStudentRows(rows => {
    const next = rows.filter((_, idx) => idx !== i);
    return next.length ? next : [emptyStudent()];
  });

  // ─── ADD (department + faculty + HOD + students in one flow) ─────────────
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!name || !code) { Toast.warning('Please fill in department name and code.'); return; }

    const filledFaculty = facultyRows.filter(f => f.first_name.trim() && f.email.trim());
    const filledStudents = studentRows.filter(s => s.first_name.trim() && s.email.trim());

    try {
      setSubmitting(true);

      // 1) department
      setProgress('Creating department…');
      const dept = await API.post('departments', { name, code: code.toUpperCase() });
      const deptId = dept.id || dept.department_id;

      // 2) faculty
      const createdFaculty = [];
      for (let i = 0; i < filledFaculty.length; i++) {
        const f = filledFaculty[i];
        setProgress(`Adding faculty ${i + 1} of ${filledFaculty.length}…`);
        const res = await API.post('faculty', {
          first_name: f.first_name, last_name: f.last_name,
          email: f.email, employee_id: f.employee_id || undefined,
          department_id: deptId, role: 'faculty', status: 'active',
        });
        const row = Array.isArray(res) ? res[0] : res;
        createdFaculty.push({ ...row, _rowIndex: facultyRows.indexOf(f) });
      }

      // 3) HOD (promote one of the just-added faculty)
      if (hodIndex !== '' && filledFaculty.length) {
        const chosen = facultyRows[Number(hodIndex)];
        const match = createdFaculty.find(cf => cf._rowIndex === Number(hodIndex))
          || createdFaculty.find(cf => cf.email === chosen?.email);
        if (match?.faculty_id) {
          setProgress('Assigning HOD…');
          await API.post('hod', { faculty_id: match.faculty_id, department_id: deptId });
        }
      }

      // 4) students
      for (let i = 0; i < filledStudents.length; i++) {
        const s = filledStudents[i];
        setProgress(`Adding student ${i + 1} of ${filledStudents.length}…`);
        await API.post('students', {
          first_name: s.first_name, last_name: s.last_name,
          email: s.email, roll_number: s.roll_number || undefined,
          department_id: deptId,
          current_semester_id: s.semester_id || null,
          status: 'active',
        });
      }

      Toast.success(`Department created with ${createdFaculty.length} faculty and ${filledStudents.length} students.`);
      setIsAddOpen(false); resetForm(); loadData();
    } catch (err) {
      console.error(err);
      Toast.error(err?.message || 'Failed to create department. Some records may have been partially saved.');
    } finally {
      setSubmitting(false); setProgress('');
    }
  };

  // ─── EDIT / DELETE / VIEW ───────────────────────────────────────────────
  const handleEditClick = (d) => { setEditing(d); setName(d.name || ''); setCode(d.code || ''); setIsEditOpen(true); };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!name || !code) { Toast.warning('Please fill in name and code.'); return; }
    try {
      setSubmitting(true);
      await API.patch(`departments/${editing.id}`, { name, code: code.toUpperCase() });
      Toast.success('Department updated successfully!');
      setIsEditOpen(false); resetForm(); loadData();
    } catch (err) {
      console.error(err); Toast.error(err?.message || 'Failed to update department.');
    } finally { setSubmitting(false); }
  };

  const handleDeleteClick = (d) => { setDeleting(d); setIsDeleteOpen(true); };
  const handleDeleteConfirm = async () => {
    try {
      setSubmitting(true);
      await API.delete(`departments/${deleting.id}`);
      Toast.success('Department deleted successfully!');
      setIsDeleteOpen(false); setDeleting(null); loadData();
    } catch (err) {
      console.error(err); Toast.error(err?.message || 'Failed to delete department.');
    } finally { setSubmitting(false); }
  };

  const handleViewClick = (d) => { setViewing(d); setIsViewOpen(true); };

  // ─── derived ────────────────────────────────────────────────────────────
  const deptFaculty = (deptId) => faculty.filter(f => f.department_id === deptId);
  const deptStudents = (deptId) => students.filter(s => s.department_id === deptId);
  const hodFor = (deptId) => hods.find(h => h.department_id === deptId);
  const hodName = (deptId) => {
    const h = hodFor(deptId);
    return h ? (`${h.first_name || ''} ${h.last_name || ''}`.trim() || h.email) : null;
  };

  const filtered = departments.filter(d => {
    const q = searchQuery.toLowerCase();
    return (d.name || '').toLowerCase().includes(q) || (d.code || '').toLowerCase().includes(q);
  });

  if (loading && !departments.length) {
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
          <h1>🏛️ Manage Departments</h1>
          <p>Create departments with their HOD, faculty, and students — all in one place.</p>
        </div>
        {isAdmin && (
          <div className="page-header-right">
            <button className="btn btn-primary" onClick={() => { resetForm(); setIsAddOpen(true); }}>
              ➕ Add Department
            </button>
          </div>
        )}
      </div>

      <div className="stats-mini">
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(139,92,246,0.2)' }}>🏛️</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#8b5cf6' }}>{departments.length}</div>
            <div className="stats-mini-lbl">Departments</div>
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
          <div className="stats-mini-icon" style={{ background: 'rgba(108,99,255,0.2)' }}>🎓</div>
          <div>
            <div className="stats-mini-val" style={{ color: 'var(--primary)' }}>{students.length}</div>
            <div className="stats-mini-lbl">Total Students</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(0,212,170,0.2)' }}>🏷️</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#00D4AA' }}>{hods.length}</div>
            <div className="stats-mini-lbl">HODs Assigned</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="filters-bar" style={{ display: 'flex', gap: '10px', padding: '15px 20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input type="text" className="form-input" placeholder="Search by name or code..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {filtered.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Code</th>
                  <th>HOD</th>
                  <th style={{ textAlign: 'center' }}>Faculty</th>
                  <th style={{ textAlign: 'center' }}>Students</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td><span className="badge badge-info">{d.code}</span></td>
                    <td>{hodName(d.id) || <span style={{ color: 'var(--text-muted)' }}>Not assigned</span>}</td>
                    <td style={{ textAlign: 'center' }}>{deptFaculty(d.id).length}</td>
                    <td style={{ textAlign: 'center' }}>{deptStudents(d.id).length}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleViewClick(d)}>🔍 View</button>
                        {isAdmin && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleEditClick(d)}>📝 Edit</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: '#FF6B6B' }} onClick={() => handleDeleteClick(d)}>🗑️ Delete</button>
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
              <div className="empty-state-icon">🏛️</div>
              <p>No departments found.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── ADD DEPARTMENT (with faculty, HOD, students) ── */}
      {isAddOpen && (
        <Modal onClose={() => !submitting && setIsAddOpen(false)} title="➕ Add New Department">
          <form onSubmit={handleAddSubmit}>
            {/* Department details */}
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Department Name *</label>
                <input type="text" className="form-input" required placeholder="e.g. Civil Engineering"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Code *</label>
                <input type="text" className="form-input" required placeholder="e.g. CV"
                  value={code} onChange={e => setCode(e.target.value)} style={{ textTransform: 'uppercase' }} />
              </div>
            </div>

            {/* Faculty */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '15px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, color: 'var(--primary-light)' }}>🧑‍🏫 Faculty</h4>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addFacultyRow}>➕ Add Faculty</button>
              </div>
              {facultyRows.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input className="form-input" placeholder="First name" style={{ flex: 1, minWidth: '90px' }}
                    value={f.first_name} onChange={e => updateFacultyRow(i, 'first_name', e.target.value)} />
                  <input className="form-input" placeholder="Last name" style={{ flex: 1, minWidth: '90px' }}
                    value={f.last_name} onChange={e => updateFacultyRow(i, 'last_name', e.target.value)} />
                  <input className="form-input" type="email" placeholder="Email" style={{ flex: 1.5, minWidth: '130px' }}
                    value={f.email} onChange={e => updateFacultyRow(i, 'email', e.target.value)} />
                  <input className="form-input" placeholder="Emp ID" style={{ flex: 0.7, minWidth: '70px' }}
                    value={f.employee_id} onChange={e => updateFacultyRow(i, 'employee_id', e.target.value)} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    <input type="radio" name="hodPick" checked={String(hodIndex) === String(i)}
                      onChange={() => setHodIndex(i)} /> HOD
                  </label>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#FF6B6B' }} onClick={() => removeFacultyRow(i)}>✕</button>
                </div>
              ))}
              <small style={{ color: 'var(--text-muted)' }}>Select the radio button to mark one faculty as this department's HOD.</small>
            </div>

            {/* Students */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '15px', marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, color: 'var(--primary-light)' }}>🎓 Students</h4>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addStudentRow}>➕ Add Student</button>
              </div>
              {studentRows.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input className="form-input" placeholder="First name" style={{ flex: 1, minWidth: '90px' }}
                    value={s.first_name} onChange={e => updateStudentRow(i, 'first_name', e.target.value)} />
                  <input className="form-input" placeholder="Last name" style={{ flex: 1, minWidth: '90px' }}
                    value={s.last_name} onChange={e => updateStudentRow(i, 'last_name', e.target.value)} />
                  <input className="form-input" type="email" placeholder="Email" style={{ flex: 1.5, minWidth: '130px' }}
                    value={s.email} onChange={e => updateStudentRow(i, 'email', e.target.value)} />
                  <input className="form-input" placeholder="Roll no" style={{ flex: 0.7, minWidth: '70px' }}
                    value={s.roll_number} onChange={e => updateStudentRow(i, 'roll_number', e.target.value)} />
                  <select className="form-input" style={{ flex: 1, minWidth: '100px' }}
                    value={s.semester_id} onChange={e => updateStudentRow(i, 'semester_id', e.target.value)}>
                    <option value="">Semester</option>
                    {semesters.map(sem => <option key={sem.semester_id || sem.id} value={sem.semester_id || sem.id}>Sem {sem.number}</option>)}
                  </select>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#FF6B6B' }} onClick={() => removeStudentRow(i)}>✕</button>
                </div>
              ))}
              <small style={{ color: 'var(--text-muted)' }}>Leave rows blank to skip — you can always add faculty/students later.</small>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{progress}</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsAddOpen(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? '⏳ Saving…' : '➕ Create Department'}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ── EDIT ── */}
      {isEditOpen && (
        <Modal onClose={() => setIsEditOpen(false)} title="📝 Edit Department">
          <form onSubmit={handleEditSubmit}>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Department Name *</label>
              <input type="text" className="form-input" required value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Department Code *</label>
              <input type="text" className="form-input" required value={code} onChange={e => setCode(e.target.value)} style={{ textTransform: 'uppercase' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsEditOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? '⏳ Saving...' : '💾 Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── DELETE ── */}
      {isDeleteOpen && (
        <Modal onClose={() => setIsDeleteOpen(false)} title="🗑️ Delete Department">
          <div style={{ padding: '10px 0' }}>
            <h3 style={{ marginBottom: '10px' }}>{deleting?.name} ({deleting?.code})</h3>
            <p>Are you sure you want to delete this department? Faculty and students in it will be unassigned. This cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setIsDeleteOpen(false)} disabled={submitting}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm} disabled={submitting}>{submitting ? '⏳ Deleting...' : '🗑️ Delete Department'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── VIEW (department people) ── */}
      {isViewOpen && viewing && (
        <Modal onClose={() => setIsViewOpen(false)} title={`🔍 ${viewing.name} (${viewing.code})`}>
          <div style={{ display: 'grid', gap: '18px', padding: '5px 0' }}>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>HOD</span>
                <strong>{hodName(viewing.id) || 'Not assigned'}</strong></div>
              <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Faculty</span>
                <strong>{deptFaculty(viewing.id).length}</strong></div>
              <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Students</span>
                <strong>{deptStudents(viewing.id).length}</strong></div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', color: 'var(--primary-light)' }}>🧑‍🏫 Faculty ({deptFaculty(viewing.id).length})</h4>
              {deptFaculty(viewing.id).length ? (
                <table className="table" style={{ fontSize: '0.85rem' }}>
                  <thead><tr><th>Name</th><th>Emp ID</th><th>Email</th><th>Role</th></tr></thead>
                  <tbody>
                    {deptFaculty(viewing.id).map(f => (
                      <tr key={f.id}>
                        <td>{f.first_name} {f.last_name}</td>
                        <td>{f.employee_id || '—'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{f.email || '—'}</td>
                        <td>{hodFor(viewing.id)?.user_id === f.user_id
                          ? <span className="badge badge-info">HOD</span>
                          : <span className="badge badge-muted">Faculty</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ color: 'var(--text-muted)' }}>No faculty in this department.</p>}
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', color: 'var(--primary-light)' }}>🎓 Students ({deptStudents(viewing.id).length})</h4>
              {deptStudents(viewing.id).length ? (
                <table className="table" style={{ fontSize: '0.85rem' }}>
                  <thead><tr><th>Name</th><th>Enrollment</th><th>Semester</th><th>Status</th></tr></thead>
                  <tbody>
                    {deptStudents(viewing.id).map(s => (
                      <tr key={s.id}>
                        <td>{s.first_name} {s.last_name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{s.enrollment_no || s.roll_number || '—'}</td>
                        <td>{s.semester || '—'}</td>
                        <td><span className={`badge badge-${s.status === 'active' ? 'success' : s.status === 'graduated' ? 'primary' : 'danger'}`}>{(s.status || 'active').toUpperCase()}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ color: 'var(--text-muted)' }}>No students in this department.</p>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setIsViewOpen(false)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

import { useState, useEffect } from 'react';
import { API } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Toast } from '../store/useNotifStore.js';
import Modal from '../components/Modal.jsx';
import {
  downloadStudentsCSV,
  downloadStudentsExcel,
  downloadStudentsPDF,
} from '../course_utilities/studentExport.js';

export default function ManageStudents() {
  const { user } = useAuthStore();
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSem, setSelectedSem] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modal States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [deptId, setDeptId] = useState('');
  const [semId, setSemId] = useState('');
  const [status, setStatus] = useState('active');
  const [password, setPassword] = useState('');
  const [editingStudent, setEditingStudent] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [viewingStudent, setViewingStudent] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.roles === 'admin';

  const loadData = async () => {
    try {
      setLoading(true);

      let filterDeptId = user?.department_id || user?.department?.id || user?.department?.department_id || '';
      let filterDeptName = user?.department_name || user?.department?.name || user?.dept_name || '';

      if (!isAdmin) {
        try {
          const hodInfo = await API.get('hod/check');
          if (hodInfo && (hodInfo.isHod || hodInfo.hod)) {
            filterDeptId = hodInfo.hod?.department_id || hodInfo.department_id || filterDeptId;
            filterDeptName = hodInfo.hod?.dept_name || hodInfo.dept_name || filterDeptName;
          }
        } catch (_) {}

        if (!filterDeptId && user?.id) {
          try {
            const hodInfo = await API.get(`hod/check?user_id=eq.${user.id}`);
            if (hodInfo && (hodInfo.isHod || hodInfo.hod)) {
              filterDeptId = hodInfo.hod?.department_id || hodInfo.department_id || filterDeptId;
              filterDeptName = hodInfo.hod?.dept_name || hodInfo.dept_name || filterDeptName;
            }
          } catch (_) {}
        }

        if (!filterDeptId && user?.email) {
          try {
            const hodInfo = await API.get(`hod/check?email=eq.${user.email}`);
            if (hodInfo && (hodInfo.isHod || hodInfo.hod)) {
              filterDeptId = hodInfo.hod?.department_id || hodInfo.department_id || filterDeptId;
              filterDeptName = hodInfo.hod?.dept_name || hodInfo.dept_name || filterDeptName;
            }
          } catch (_) {}
        }

        if (!filterDeptId) {
          try {
            const prof = await API.get('faculty/my_profile');
            if (prof) {
              filterDeptId = prof.department_id || prof.department?.id || (typeof prof.department === 'string' ? prof.department : '') || filterDeptId;
              filterDeptName = prof.department_name || prof.department?.name || filterDeptName;
            }
          } catch (_) {}
        }
      }

      const studentsEndpoint = (!isAdmin && filterDeptId)
        ? `students?department_id=${filterDeptId}&limit=1000`
        : 'students?limit=1000';

      const [studentsData, deptsData, semsData] = await Promise.all([
        API.get(studentsEndpoint),
        API.get('departments'),
        API.get('semesters')
      ]);

      let allowedStudents = Array.isArray(studentsData) ? studentsData : [];
      const deptsList = Array.isArray(deptsData) ? deptsData : [];
      const semsList = Array.isArray(semsData) ? semsData : [];

      if (!isAdmin && (filterDeptId || filterDeptName)) {
        const targetId = String(filterDeptId || '').toLowerCase();
        const targetName = String(filterDeptName || '').toLowerCase();

        allowedStudents = allowedStudents.filter(s => {
          const sDeptId = String(s.department_id || s.department?.department_id || s.department?.id || s.department || '').toLowerCase();
          const sDeptName = String(s.department_name || s.department?.name || s.dept_name || '').toLowerCase();

          if (targetId && sDeptId && sDeptId === targetId) return true;
          if (targetName && sDeptName && sDeptName === targetName) return true;
          return false;
        });
      }

      setStudents(allowedStudents);
      setDepartments(deptsList);
      setSemesters(semsList);
      if (!isAdmin && filterDeptId) {
        setSelectedDept(filterDeptId);
      }
    } catch (e) {
      console.error('Failed to load students data:', e);
      Toast.error('Failed to load students data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !rollNumber || !deptId) {
      Toast.warning('Please fill in all required fields.');
      return;
    }
    try {
      setSubmitting(true);
      await API.post('students', {
        first_name: firstName,
        last_name: lastName,
        email,
        roll_number: rollNumber,
        department_id: deptId,
        current_semester_id: semId || null,
        status,
        password: password || undefined
      });
      Toast.success('Student added successfully!');
      setIsAddOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      console.error(err);
      const msg = err?.message || err?.error || (typeof err === 'string' ? err : null);
      Toast.error(msg ? `Failed to add student: ${msg}` : 'Failed to add student. Please check the details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (student) => {
    setEditingStudent(student);
    setFirstName(student.first_name || '');
    setLastName(student.last_name || '');
    setEmail(student.email || '');
    setRollNumber(student.roll_number || '');
    setDeptId(student.department_id || '');
    setSemId(student.current_semester_id || '');
    setStatus(student.status || 'active');
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !rollNumber || !deptId) {
      Toast.warning('Please fill in all required fields.');
      return;
    }
    try {
      setSubmitting(true);
      await API.patch(`students/${editingStudent.id}`, {
        first_name: firstName,
        last_name: lastName,
        email,
        roll_number: rollNumber,
        department_id: deptId,
        current_semester_id: semId || null,
        status
      });
      Toast.success('Student updated successfully!');
      setIsEditOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      console.error(err);
      const msg = err?.message || err?.error || (typeof err === 'string' ? err : null);
      Toast.error(msg ? `Failed to update student: ${msg}` : 'Failed to update student.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewClick = (student) => {
    setViewingStudent(student);
    setIsViewOpen(true);
  };

  const handleDeleteClick = (student) => {
    setDeletingStudent(student);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      setSubmitting(true);
      await API.delete(`students/${deletingStudent.id}`);
      Toast.success('Student deleted successfully!');
      setIsDeleteOpen(false);
      setDeletingStudent(null);
      loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to delete student.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setRollNumber('');
    setDeptId('');
    setSemId('');
    setStatus('active');
    setPassword('');
    setEditingStudent(null);
  };

  // ─── Download handlers (logic lives in course_utilities/studentExport.js) ─────
  const [dlOpen, setDlOpen] = useState(false);

  const downloadCSV = () => {
    setDlOpen(false);
    downloadStudentsCSV(filteredStudents, Toast);
  };

  const downloadExcel = () => {
    setDlOpen(false);
    downloadStudentsExcel(filteredStudents, Toast);
  };

  const downloadPDF = async () => {
    setDlOpen(false);
    await downloadStudentsPDF(filteredStudents, Toast);
  };

  // Filter Logic
  const filteredStudents = students.filter(s => {
    const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
    const email = (s.email || '').toLowerCase();
    const roll = String(s.roll_number || '').toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesSearch = name.includes(query) || email.includes(query) || roll.includes(query);
    const matchesDept = (isAdmin && selectedDept) ? (String(s.department_id || s.department?.department_id || s.department?.id || s.department || '').toLowerCase() === String(selectedDept).toLowerCase()) : true;
    const matchesSem = (isAdmin && selectedSem) ? s.current_semester_id === selectedSem : true;
    const matchesStatus = (isAdmin && selectedStatus) ? s.status === selectedStatus : true;

    return matchesSearch && matchesDept && matchesSem && matchesStatus;
  });

  // Calculate mini stats
  const totalCount = students.length;
  const activeCount = students.filter(s => s.status === 'active').length;
  const graduatedCount = students.filter(s => s.status === 'graduated').length;
  const inactiveCount = students.filter(s => s.status === 'inactive').length;

  if (loading && !students.length) {
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
          <h1><i className="bi bi-mortarboard"></i> {isAdmin ? 'Manage Students' : 'Students Directory'}</h1>
          <p>{isAdmin ? 'Manage student enrollments, profiles, and academic status.' : 'View student listings and directory profiles.'}</p>
        </div>
        {isAdmin && (
          <div className="page-header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* Download Data dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost"
                id="dl-btn"
                onClick={() => setDlOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <i className="bi bi-download"></i> Download Data <i className="bi bi-chevron-down" style={{ fontSize: '0.75rem' }}></i>
              </button>
              {dlOpen && (
                <>
                  {/* Backdrop to close on outside click */}
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                    onClick={() => setDlOpen(false)}
                  />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '12px', padding: '6px', minWidth: '170px',
                    boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: '2px',
                  }}>
                    <button
                      id="dl-pdf"
                      onClick={downloadPDF}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 14px', borderRadius: '8px', border: 'none',
                        background: 'transparent', color: 'var(--text-primary)',
                        cursor: 'pointer', fontSize: '0.9rem', width: '100%', textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <i className="bi bi-file-earmark-pdf" style={{ color: '#EF4444', fontSize: '1.1rem' }}></i>
                      Export as PDF
                    </button>
                    <button
                      id="dl-csv"
                      onClick={downloadCSV}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 14px', borderRadius: '8px', border: 'none',
                        background: 'transparent', color: 'var(--text-primary)',
                        cursor: 'pointer', fontSize: '0.9rem', width: '100%', textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <i className="bi bi-filetype-csv" style={{ color: '#10B981', fontSize: '1.1rem' }}></i>
                      Export as CSV
                    </button>
                    <button
                      id="dl-excel"
                      onClick={downloadExcel}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 14px', borderRadius: '8px', border: 'none',
                        background: 'transparent', color: 'var(--text-primary)',
                        cursor: 'pointer', fontSize: '0.9rem', width: '100%', textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <i className="bi bi-file-earmark-excel" style={{ color: '#22C55E', fontSize: '1.1rem' }}></i>
                      Export as Excel
                    </button>
                  </div>
                </>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => { resetForm(); setIsAddOpen(true); }}>
              <i className="bi bi-plus-lg"></i> Add Student
            </button>
          </div>
        )}
      </div>

      {/* Mini Stats */}
      <div className="stats-mini">
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(108,99,255,0.2)' }}><i className="bi bi-mortarboard"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: 'var(--primary)' }}>{totalCount}</div>
            <div className="stats-mini-lbl">Total Students</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(0,212,170,0.2)' }}><i className="bi bi-check-circle-fill"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: '#00D4AA' }}>{activeCount}</div>
            <div className="stats-mini-lbl">Active</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(84,160,255,0.2)' }}><i className="bi bi-trophy"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: '#54A0FF' }}>{graduatedCount}</div>
            <div className="stats-mini-lbl">Graduated</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(255,107,107,0.2)' }}><i className="bi bi-pause"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: '#FF6B6B' }}>{inactiveCount}</div>
            <div className="stats-mini-lbl">Inactive</div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card">
        {/* Filters Bar */}
        <div className="filters-bar" style={{ display: 'flex', gap: '10px', padding: '15px 20px', flexWrap: 'wrap' }}>
          <div className="search-input-wrap" style={{ flex: 2, minWidth: '200px' }}>
            <input 
              type="text" 
              className="form-input"
              placeholder="Search by name, ID, email..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {isAdmin && (
            <>
              <select className="form-input" style={{ flex: 1, minWidth: '150px' }} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select className="form-input" style={{ flex: 1, minWidth: '150px' }} value={selectedSem} onChange={e => setSelectedSem(e.target.value)}>
                <option value="">All Semesters</option>
                {semesters.map(s => (
                  <option key={s.semester_id} value={s.semester_id}>Semester {s.number}</option>
                ))}
              </select>
              <select className="form-input" style={{ flex: 1, minWidth: '120px' }} value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="graduated">Graduated</option>
              </select>
            </>
          )}
        </div>

        {/* Students Table */}
        <div className="card-body" style={{ padding: 0 }}>
          {filteredStudents.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Enrollment No.</th>
                  <th>Department</th>
                  <th>Semester</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s.enrollment_no || s.student_id}</td>
                    <td>{s.department_name}</td>
                    <td>{s.semester}</td>
                    <td>
                      <span className={`badge badge-${s.status === 'active' ? 'success' : s.status === 'graduated' ? 'primary' : 'danger'}`}>
                        {s.status?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleViewClick(s)}><i className="bi bi-search"></i> View</button>
                        {isAdmin && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleEditClick(s)}><i className="bi bi-pencil-square"></i> Edit</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: '#FF6B6B' }} onClick={() => handleDeleteClick(s)}><i className="bi bi-trash"></i> Delete</button>
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
              <div className="empty-state-icon"><i className="bi bi-mortarboard"></i></div>
              <p>No student records match the filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* ======================== ADD STUDENT MODAL ======================== */}
      {isAddOpen && (
        <Modal onClose={() => setIsAddOpen(false)} title={<><i className="bi bi-person-plus me-2"></i>Add New Student</>}>
          <form onSubmit={handleAddSubmit}>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">First Name *</label>
                <input type="text" className="form-input" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Last Name *</label>
                <input type="text" className="form-input" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Email Address *</label>
              <input type="email" className="form-input" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Roll Number *</label>
                <input type="text" className="form-input" required value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Temporary Password</label>
                <input type="password" className="form-input" placeholder="student123" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Department *</label>
                <select className="form-input" required value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Current Semester</label>
                <select className="form-input" value={semId} onChange={(e) => setSemId(e.target.value)}>
                  <option value="">Select Semester</option>
                  {semesters.map((s) => (
                    <option key={s.semester_id} value={s.semester_id}>Semester {s.number}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Status</label>
              <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="graduated">Graduated</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsAddOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : <><i className="bi bi-person-plus me-1"></i>Save Student</>}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================== EDIT STUDENT MODAL ======================== */}
      {isEditOpen && (
        <Modal onClose={() => setIsEditOpen(false)} title={<><i className="bi bi-pencil-square me-2"></i>Edit Student Profile</>}>
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
              <label className="form-label">Roll Number *</label>
              <input type="text" className="form-input" required value={rollNumber} onChange={e => setRollNumber(e.target.value)} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Department *</label>
                <select className="form-input" required value={deptId} onChange={e => setDeptId(e.target.value)}>
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Semester</label>
                <select className="form-input" value={semId} onChange={e => setSemId(e.target.value)}>
                  <option value="">Select Semester</option>
                  {semesters.map(s => (
                    <option key={s.semester_id} value={s.semester_id}>Semester {s.number}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Status</label>
              <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="graduated">Graduated</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsEditOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : <><i className="bi bi-save me-1"></i>Save Changes</>}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================== DELETE STUDENT MODAL ======================== */}
      {isDeleteOpen && (
        <Modal onClose={() => setIsDeleteOpen(false)} title={<><i className="bi bi-trash me-2"></i>Delete Student</>}>
          <div style={{ textalign: 'center', padding: '10px 0' }}>
            <h3 style={{ marginBottom: '10px' }}>{deletingStudent?.first_name} {deletingStudent?.last_name}</h3>
            <p>Are you sure you want to delete this student profile? This action will permanently remove their records from the portal.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setIsDeleteOpen(false)} disabled={submitting}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm} disabled={submitting}>
                {submitting ? 'Deleting...' : <><i className="bi bi-trash me-1"></i>Delete Student</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ======================== VIEW DETAILS MODAL ======================== */}
      {isViewOpen && viewingStudent && (
        <Modal onClose={() => setIsViewOpen(false)} title={<><i className="bi bi-person-badge me-2"></i>Student Profile</>}>
          <div style={{ padding: '4px 0' }}>

            {/* ── Header: Avatar + Name + Badge ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '16px 20px', marginBottom: '20px',
              background: 'linear-gradient(135deg, rgba(108,99,255,0.12) 0%, rgba(108,99,255,0.04) 100%)',
              borderRadius: '12px', border: '1px solid rgba(108,99,255,0.2)',
            }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #6C63FF 0%, #a78bfa 100%)',
                color: '#fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800,
                boxShadow: '0 4px 14px rgba(108,99,255,0.4)',
              }}>
                {`${(viewingStudent.first_name || '')[0] || ''}${(viewingStudent.last_name || '')[0] || ''}`.toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {viewingStudent.first_name} {viewingStudent.last_name}
                </h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={`badge badge-${viewingStudent.status === 'active' ? 'success' : viewingStudent.status === 'graduated' ? 'primary' : 'danger'}`}>
                    {(viewingStudent.status || 'active').toUpperCase()}
                  </span>
                  {viewingStudent.department_name && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <i className="bi bi-building" style={{ marginRight: '4px' }}></i>
                      {viewingStudent.department_name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Two-column body ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* ────── LEFT: Student Details ────── */}
              <div style={{
                background: 'var(--surface)', borderRadius: '12px',
                border: '1px solid var(--border)', overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 16px', background: 'rgba(108,99,255,0.08)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <i className="bi bi-person-vcard" style={{ color: '#6C63FF', fontSize: '1rem' }}></i>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Student Information</span>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                  {/* Enrollment */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enrollment No.</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#6C63FF', fontFamily: 'monospace' }}>
                      {viewingStudent.enrollment_no || viewingStudent.student_id || '—'}
                    </div>
                  </div>

                  {/* Roll Number */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Roll Number</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {viewingStudent.roll_number || '—'}
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</div>
                    <div style={{ fontWeight: 500, fontSize: '0.83rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      {viewingStudent.email || '—'}
                    </div>
                  </div>

                  {/* Semester */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Semester</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {viewingStudent.semester ? `Semester ${viewingStudent.semester}` : '—'}
                    </div>
                  </div>

                  {/* DOB */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date of Birth</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {viewingStudent.date_of_birth
                        ? new Date(viewingStudent.date_of_birth).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                        : '—'}
                    </div>
                  </div>

                  {/* Attendance */}
                  <div style={{ paddingTop: '6px', borderTop: '1px dashed var(--border)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attendance</div>
                    {viewingStudent.attendance_percentage != null ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: viewingStudent.attendance_percentage >= 75 ? '#22c55e' : '#f59e0b' }}>
                            {viewingStudent.attendance_percentage}%
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {viewingStudent.attendance_percentage >= 75 ? 'Good' : 'Low'}
                          </span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: '3px',
                            width: `${Math.min(viewingStudent.attendance_percentage, 100)}%`,
                            background: viewingStudent.attendance_percentage >= 75
                              ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                              : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                          }} />
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>—</span>
                    )}
                  </div>

                  {/* CGPA / Grade */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CGPA / Grade</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#a78bfa' }}>
                      {viewingStudent.cgpa || viewingStudent.gpa || viewingStudent.grade || '—'}
                    </div>
                  </div>

                </div>
              </div>

              {/* ────── RIGHT: Parent Details ────── */}
              <div style={{
                background: 'var(--surface)', borderRadius: '12px',
                border: '1px solid var(--border)', overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 16px', background: 'rgba(34,197,94,0.08)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <i className="bi bi-people-fill" style={{ color: '#22c55e', fontSize: '1rem' }}></i>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Parent / Guardian</span>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                  {/* Guardian Name */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Guardian Name</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="bi bi-person" style={{ color: '#22c55e' }}></i>
                      {viewingStudent.guardian_name || viewingStudent.parent_name || '—'}
                    </div>
                  </div>

                  {/* Parent Phone */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone Number</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="bi bi-telephone-fill" style={{ color: '#22c55e', fontSize: '0.8rem' }}></i>
                      {viewingStudent.parent_phone || viewingStudent.guardian_phone || '—'}
                    </div>
                  </div>

                  {/* Parent Email */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address</div>
                    <div style={{ fontWeight: 500, fontSize: '0.83rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: '6px', wordBreak: 'break-all' }}>
                      <i className="bi bi-envelope-fill" style={{ color: '#22c55e', fontSize: '0.8rem', marginTop: '2px', flexShrink: 0 }}></i>
                      {viewingStudent.parent_email || '—'}
                    </div>
                  </div>

                  {/* Home Address */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Home Address</div>
                    <div style={{ fontWeight: 500, fontSize: '0.83rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: '6px', lineHeight: 1.5 }}>
                      <i className="bi bi-geo-alt-fill" style={{ color: '#22c55e', fontSize: '0.8rem', marginTop: '2px', flexShrink: 0 }}></i>
                      {viewingStudent.address || viewingStudent.home_address || '—'}
                    </div>
                  </div>

                  {/* Emergency Contact separator */}
                  <div style={{ paddingTop: '6px', borderTop: '1px dashed var(--border)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Relation</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {viewingStudent.guardian_relation || 'Parent'}
                    </div>
                  </div>

                  {/* Admission Date */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admission Date</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {viewingStudent.admission_date
                        ? new Date(viewingStudent.admission_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                        : '—'}
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* ── Footer Button ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={() => setIsViewOpen(false)}>
                <i className="bi bi-x-circle me-1"></i>Close
              </button>
            </div>

          </div>
        </Modal>
      )}
    </>
  );
}

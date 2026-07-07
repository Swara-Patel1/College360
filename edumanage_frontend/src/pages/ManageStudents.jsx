import { useState, useEffect } from 'react';
import { API } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Toast } from '../store/useNotifStore.js';
import Modal from '../components/Modal.jsx';

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

  const isAdmin = user?.role === 'admin';

  const loadData = async () => {
    try {
      setLoading(true);
      const [studentsData, deptsData, semsData] = await Promise.all([
        API.get('students'),
        API.get('departments'),
        API.get('semesters')
      ]);

      let allowedStudents = Array.isArray(studentsData) ? studentsData : [];
      const deptsList = Array.isArray(deptsData) ? deptsData : [];
      const semsList = Array.isArray(semsData) ? semsData : [];

      if (user?.role === 'faculty') {
        const prof = await API.get('faculty/my_profile');
        if (prof) {
          const allCourses = await API.get('courses');
          const myCourses = (allCourses || []).filter(c => c.faculty_id === prof.id);
          
          const allEnrolled = [];
          for (const course of myCourses) {
            const enrolls = await API.get(`enrollments?course=${course.subject_id}`);
            allEnrolled.push(...(enrolls || []));
          }
          
          const studentIds = [...new Set(allEnrolled.map(e => e.student))];
          allowedStudents = allowedStudents.filter(s => studentIds.includes(s.id));
        }
      }

      setStudents(allowedStudents);
      setDepartments(deptsList);
      setSemesters(semsList);
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
    if (!firstName || !lastName || !email || !rollNumber || !deptId || !semId) {
      Toast.warning('Please fill in all required fields.');
      return;
    }
    try {
      setLoading(true);
      await API.post('students', {
        first_name: firstName,
        last_name: lastName,
        email,
        roll_number: rollNumber,
        department_id: deptId,
        current_semester_id: semId,
        status,
        password: password || undefined
      });
      Toast.success('Student added successfully!');
      setIsAddOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to add student.');
      setLoading(false);
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
    if (!firstName || !lastName || !email || !rollNumber || !deptId || !semId) {
      Toast.warning('Please fill in all required fields.');
      return;
    }
    try {
      setLoading(true);
      await API.patch(`students/${editingStudent.id}`, {
        first_name: firstName,
        last_name: lastName,
        email,
        roll_number: rollNumber,
        department_id: deptId,
        current_semester_id: semId,
        status
      });
      Toast.success('Student updated successfully!');
      setIsEditOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to update student.');
      setLoading(false);
    }
  };

  const handleDeleteClick = (student) => {
    setDeletingStudent(student);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      setLoading(true);
      await API.delete(`students/${deletingStudent.id}`);
      Toast.success('Student deleted successfully!');
      setIsDeleteOpen(false);
      setDeletingStudent(null);
      loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to delete student.');
      setLoading(false);
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

  // Filter Logic
  const filteredStudents = students.filter(s => {
    const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
    const email = (s.email || '').toLowerCase();
    const roll = String(s.roll_number || '').toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesSearch = name.includes(query) || email.includes(query) || roll.includes(query);
    const matchesDept = selectedDept ? s.department_id === selectedDept : true;
    const matchesSem = selectedSem ? s.current_semester_id === selectedSem : true;
    const matchesStatus = selectedStatus ? s.status === selectedStatus : true;

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
          <h1>🎓 {isAdmin ? 'Manage Students' : 'Students Directory'}</h1>
          <p>{isAdmin ? 'Manage student enrollments, profiles, and academic status.' : 'View student listings and directory profiles.'}</p>
        </div>
        {isAdmin && (
          <div className="page-header-right">
            <button className="btn btn-primary" onClick={() => { resetForm(); setIsAddOpen(true); }}>
              ➕ Add Student
            </button>
          </div>
        )}
      </div>

      {/* Mini Stats */}
      <div className="stats-mini">
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(108,99,255,0.2)' }}>🎓</div>
          <div>
            <div className="stats-mini-val" style={{ color: 'var(--primary)' }}>{totalCount}</div>
            <div className="stats-mini-lbl">Total Students</div>
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
          <div className="stats-mini-icon" style={{ background: 'rgba(84,160,255,0.2)' }}>🏆</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#54A0FF' }}>{graduatedCount}</div>
            <div className="stats-mini-lbl">Graduated</div>
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
        </div>

        {/* Students Table */}
        <div className="card-body" style={{ padding: 0 }}>
          {filteredStudents.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Semester</th>
                  <th>Roll No.</th>
                  <th>Status</th>
                  {isAdmin && <th style={{ textAlign: 'center' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s.email}</td>
                    <td>{s.department_name}</td>
                    <td>Semester {s.semester}</td>
                    <td><strong>{s.roll_number || '—'}</strong></td>
                    <td>
                      <span className={`badge badge-${s.status === 'active' ? 'success' : s.status === 'graduated' ? 'primary' : 'danger'}`}>
                        {s.status?.toUpperCase()}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleEditClick(s)}>📝 Edit</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#FF6B6B' }} onClick={() => handleDeleteClick(s)}>🗑️ Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🎓</div>
              <p>No student records match the filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* ======================== ADD STUDENT MODAL ======================== */}
      {isAddOpen && (
        <Modal onClose={() => setIsAddOpen(false)} title="➕ Add New Student">
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
                <label className="form-label">Roll Number *</label>
                <input type="text" className="form-input" required value={rollNumber} onChange={e => setRollNumber(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Temporary Password</label>
                <input type="password" className="form-input" placeholder="student123" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
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
                <label className="form-label">Current Semester *</label>
                <select className="form-input" required value={semId} onChange={e => setSemId(e.target.value)}>
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
              <button type="button" className="btn btn-ghost" onClick={() => setIsAddOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">➕ Save Student</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================== EDIT STUDENT MODAL ======================== */}
      {isEditOpen && (
        <Modal onClose={() => setIsEditOpen(false)} title="📝 Edit Student Profile">
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
                <label className="form-label">Semester *</label>
                <select className="form-input" required value={semId} onChange={e => setSemId(e.target.value)}>
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
              <button type="button" className="btn btn-ghost" onClick={() => setIsEditOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">💾 Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================== DELETE STUDENT MODAL ======================== */}
      {isDeleteOpen && (
        <Modal onClose={() => setIsDeleteOpen(false)} title="🗑️ Delete Student">
          <div style={{ textalign: 'center', padding: '10px 0' }}>
            <h3 style={{ marginBottom: '10px' }}>{deletingStudent?.first_name} {deletingStudent?.last_name}</h3>
            <p>Are you sure you want to delete this student profile? This action will permanently remove their records from the portal.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm}>🗑️ Delete Student</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

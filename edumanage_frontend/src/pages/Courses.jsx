import { useState, useEffect } from 'react';
import { API, Utils } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Toast } from '../store/useNotifStore.js';
import Modal from '../components/Modal.jsx';
import DownloadDropdown from '../components/DownloadDropdown.jsx';
import { downloadSubjectsCSV, downloadSubjectsExcel, downloadSubjectsPDF } from '../course_utilities/dataExport.js';

export default function Courses() {
  const { user } = useAuthStore();
  const [courses, setCourses] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [activeTab, setActiveTab] = useState('courses'); // 'courses' or 'enrollments'
  const [loading, setLoading] = useState(true);
  const [studentCurrentSem, setStudentCurrentSem] = useState(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSem, setSelectedSem] = useState('');
  const [selectedActive, setSelectedActive] = useState('');
  const [enrollSearchQuery, setEnrollSearchQuery] = useState('');
  const [dlOpen, setDlOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  // Add / Edit Modal States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Form Fields State
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formFac, setFormFac] = useState('');
  const [formCredits, setFormCredits] = useState(4);
  const [formSem, setFormSem] = useState(1);
  const [formMaxStudents, setFormMaxStudents] = useState(60);
  const [formDesc, setFormDesc] = useState('');
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [deletingCourse, setDeletingCourse] = useState(null);

  const userRole = (user?.role || user?.roles || '').toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'hod';
  const isHod = userRole === 'hod';
  const isFaculty = userRole === 'faculty';
  const isStudent = userRole === 'student';

  const loadData = async () => {
    try {
      setLoading(true);
      const [coursesData, facultyData, deptsData, semData] = await Promise.all([
        API.get('courses'),
        API.get('faculty'),
        API.get('departments'),
        API.get('semesters?is_active=eq.true'),
      ]);

      let loadedCourses = coursesData || [];
      setFaculty(facultyData || []);
      setDepartments(deptsData || []);

      let currentSem = null;
      if (isStudent) {
        const cached = localStorage.getItem('student_profile');
        if (cached) {
          try {
            const p = JSON.parse(cached);
            currentSem = p.semester || p.current_semester;
          } catch(e) {}
        }
        if (!currentSem) {
          try {
            const profile = await API.get('students/my_profile');
            currentSem = profile?.semester || profile?.current_semester;
          } catch (e) {}
        }
        setStudentCurrentSem(currentSem);
      } else {
        const activeSemesters = semData || [];
        if (activeSemesters.length > 0) {
          const sorted = [...activeSemesters].sort((a, b) => a.number - b.number);
          currentSem = sorted[0].number;
        }
      }

      // Check HOD department if HOD user
      if (isHod) {
        try {
          const hodInfo = await API.get('hod/check');
          if (hodInfo && (hodInfo.isHod || hodInfo.hod)) {
            const hDept = hodInfo.hod?.department_id || hodInfo.department_id;
            if (hDept && !selectedDept) {
              setSelectedDept(String(hDept));
            }
          }
        } catch (_) {}
      }

      // Role-based filtering
      if (isStudent) {
        const enrollData = await API.get('enrollments');
        const myCourseIds = new Set((enrollData || []).map(e => String(e.course || e.course_id || e.subject_id || '')));
        loadedCourses = loadedCourses.filter(c => myCourseIds.has(String(c.id)) || myCourseIds.has(String(c.subject_id)));
        if (currentSem && currentSem !== '—') {
          loadedCourses = loadedCourses.filter(c => String(c.semester) === String(currentSem));
        }
      } else if (isFaculty && !isHod) {
        const facProfile = await API.get('faculty/my_profile');
        const facId = facProfile?.id;
        if (facId) {
          loadedCourses = loadedCourses.filter(c => c.faculty === facId || c.faculty_id === facId);
        }
      }
      // Note: Admin and HOD retain all loaded courses so dropdown filters (dept, sem, search) work dynamically

      setCourses(loadedCourses);
    } catch (e) {
      console.error('Error loading courses page:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadEnrollments = async () => {
    try {
      const data = await API.get('enrollments');
      setEnrollments(data || []);
    } catch (e) {
      console.error('Failed to load enrollments:', e);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'enrollments') {
      loadEnrollments();
    }
  }, [activeTab]);

  // Filter Catalog Courses
  const getFilteredCourses = () => {
    return courses.filter(c => {
      const name = (c.name || '').toLowerCase();
      const code = (c.code || c.course_code || '').toLowerCase();
      const query = searchQuery.toLowerCase().trim();
      const matchSearch = !query || name.includes(query) || code.includes(query);

      const cDeptId = String(c.department?.id || c.department_id || c.department || '');
      const cDeptName = String(c.department_name || c.department?.name || '').toLowerCase();
      const selDept = String(selectedDept || '').toLowerCase();

      const matchDept = !selectedDept || 
        cDeptId === selDept || 
        cDeptName === selDept ||
        (departments.find(d => String(d.id) === selDept || String(d.department_id) === selDept || String(d.code || '').toLowerCase() === selDept)?.name || '').toLowerCase() === cDeptName;

      const matchSem = !selectedSem || String(c.semester) === String(selectedSem);
      const matchActive = !selectedActive || (selectedActive === 'true' ? c.is_active !== false : c.is_active === false);

      return matchSearch && matchDept && matchSem && matchActive;
    });
  };

  const filtered = getFilteredCourses();
  const paginatedCourses = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  // CRUD Actions
  const handleOpenAdd = () => {
    setFormName('');
    setFormCode('');
    setFormDept('');
    setFormFac('');
    setFormCredits(4);
    setFormSem(1);
    setFormMaxStudents(60);
    setFormDesc('');
    setIsAddOpen(true);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formName || !formCode || !formDept || !formFac) {
      alert('Please fill out all required fields.');
      return;
    }
    try {
      await API.post('courses', {
        name: formName,
        code: formCode.toUpperCase(),
        department_id: formDept,
        faculty_id: formFac,
        credits: parseInt(formCredits),
        semester: parseInt(formSem),
        max_students: parseInt(formMaxStudents),
        description: formDesc
      });
      setIsAddOpen(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Error creating course');
    }
  };

  const handleOpenEdit = (c) => {
    setEditingCourseId(c.id);
    setFormName(c.name || '');
    setFormCode(c.code || c.course_code || '');
    setFormDept(c.department || c.department_id || '');
    setFormFac(c.faculty || c.faculty_id || '');
    setFormCredits(c.credits || 4);
    setFormSem(c.semester || 1);
    setFormMaxStudents(c.max_students || 60);
    setFormDesc(c.description || '');
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await API.patch(`courses?subject_id=eq.${editingCourseId}`, {
        name: formName,
        code: formCode.toUpperCase(),
        department_id: formDept,
        faculty_id: formFac,
        credits: parseInt(formCredits),
        semester: parseInt(formSem),
        max_students: parseInt(formMaxStudents),
        description: formDesc
      });
      setIsEditOpen(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Error updating course');
    }
  };

  const handleOpenDelete = (c) => {
    setDeletingCourse(c);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await API.delete(`courses?subject_id=eq.${deletingCourse.id}`);
      setIsDeleteOpen(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Error deleting course');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  const activeSemesterNumber = studentCurrentSem || (courses.length ? (courses.find(c => c.is_active)?.semester || courses[courses.length - 1]?.semester || 3) : '3');
  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="stat-icon" style={{ background: 'rgba(108, 99, 255, 0.2)', color: '#6C63FF' }}>
            <i className="bi bi-book"></i>
          </div>
          <div>
            <h1>Subject Catalog</h1>
            <p id="pageDesc">
              {isStudent 
                ? `You are enrolled in ${filtered.length} subject${filtered.length !== 1 ? 's' : ''} for your current semester.`
                : `Showing ${filtered.length} subject${filtered.length !== 1 ? 's' : ''} in catalog.`}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div className="page-header-right" id="addCourseWrap" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <DownloadDropdown
              open={dlOpen} setOpen={setDlOpen}
              onCSV={() => { setDlOpen(false); downloadSubjectsCSV(filtered, Toast); }}
              onExcel={() => { setDlOpen(false); downloadSubjectsExcel(filtered, Toast); }}
              onPDF={async () => { setDlOpen(false); await downloadSubjectsPDF(filtered, Toast); }}
            />
            <button className="btn btn-primary" onClick={handleOpenAdd}><i className="bi bi-plus-lg"></i> Add Subject</button>
          </div>
        )}
      </div>

      {/* Stats Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary">
          <div className="stat-icon"><i className="bi bi-book"></i></div>
          <div>
            <div className="stat-value" id="totalCourses">{courses.length}</div>
            <div className="stat-label">Total Subjects</div>
          </div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div>
          <div>
            <div className="stat-value" id="activeCourses">
              {courses.filter(c => c.is_active !== false).length}
            </div>
            <div className="stat-label">Active Subjects</div>
          </div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon"><i className="bi bi-award"></i></div>
          <div>
            <div className="stat-value" id="totalCredits">{totalCredits || '—'}</div>
            <div className="stat-label">Total Credits</div>
          </div>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="card col-12">
        <div className="tab-panel active">
            <div className="filters-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '16px' }}>
              <div className="search-input-wrap">
                <span><i className="bi bi-search"></i></span>
                <input 
                  type="text" 
                  id="searchInput" 
                  placeholder="Search by name or code..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                />
              </div>

              <select 
                className="form-control" 
                id="deptFilter"
                value={selectedDept}
                onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
                style={{ width: 'auto' }}
              >
                <option value="">All Departments</option>
                {departments.map((d, idx) => (
                  <option value={d.id} key={idx}>{d.name}</option>
                ))}
              </select>

              <select 
                className="form-control" 
                id="semFilter"
                value={selectedSem}
                onChange={(e) => { setSelectedSem(e.target.value); setCurrentPage(1); }}
                style={{ width: 'auto' }}
              >
                <option value="">All Semesters</option>
                {[1,2,3,4,5,6,7,8].map(s => (
                  <option value={s} key={s}>Semester {s}</option>
                ))}
              </select>
            </div>

            <div className="table-wrapper" style={{ padding: 0 }}>
              <table className="table" id="coursesTable">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Code</th>
                    <th>Department</th>
                    <th>Faculty</th>
                    <th>Credits</th>
                    <th>Semester</th>
                    {isAdmin && <th style={{ textAlign: 'center' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody id="coursesTableBody">
                  {filtered.length ? (
                    filtered.map((c, idx) => {
                      const code = c.code || c.course_code || '—';
                      const deptName = c.department_name || departments.find(d => d.id == c.department)?.name || '—';
                      const facultyObj = faculty.find(f => f.id == c.faculty || f.id == c.faculty_id);
                      const facultyName = c.faculty_name || (facultyObj ? `${facultyObj.user?.first_name} ${facultyObj.user?.last_name}` : '—');

                      return (
                        <tr key={idx}>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.name || '—'}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {c.description ? c.description.slice(0, 50) + '...' : ''}
                            </div>
                          </td>
                          <td><span className="course-code">{code}</span></td>
                          <td style={{ color: 'var(--text-secondary)' }}>{deptName}</td>
                          <td>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{facultyName}</div>
                          </td>
                          <td><span className="badge badge-primary">{c.credits || '—'} cr</span></td>
                          <td><span className="badge badge-info">Sem {c.semester || '—'}</span></td>
                          {isAdmin && (
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => handleOpenEdit(c)}>
                                  <i className="bi bi-pencil-square me-1"></i> Edit
                                </button>
                                <button className="btn btn-ghost btn-sm" style={{ color: '#FF6B6B' }} onClick={() => handleOpenDelete(c)}>
                                  <i className="bi bi-trash me-1"></i> Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6}>
                        <div className="empty-state" style={{ padding: '40px' }}>
                          <div className="empty-state-icon"><i className="bi bi-book"></i></div>
                          <h3>No Subjects Found</h3>
                          <p>
                            {isAdmin 
                              ? 'Try adjusting your filters, or add a new subject.'
                              : isStudent
                                ? 'You are not enrolled in any subjects yet.'
                                : 'No subjects assigned to you yet.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </div>

      {/* ======================== ADD COURSE MODAL ======================== */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title={<><i className="bi bi-plus-circle me-2"></i>Add New Course</>}>
        <form onSubmit={handleAddSubmit}>
          <div className="section-divider" style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            <i className="bi bi-book"></i> Course Information
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Course Name *</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. Data Structures"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Course Code *</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. CS301"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Department *</label>
              <select 
                className="form-control"
                value={formDept}
                onChange={(e) => setFormDept(e.target.value)}
                required
              >
                <option value="">Select Department</option>
                {departments.map((d, idx) => (
                  <option value={d.id} key={idx}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Faculty *</label>
              <select 
                className="form-control"
                value={formFac}
                onChange={(e) => setFormFac(e.target.value)}
                required
              >
                <option value="">Select Faculty</option>
                {faculty.map((f, idx) => (
                  <option value={f.id} key={idx}>{f.user?.first_name} {f.user?.last_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Credits *</label>
              <input 
                type="number" 
                className="form-control" 
                min="1" 
                max="10" 
                value={formCredits}
                onChange={(e) => setFormCredits(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Semester *</label>
              <select 
                className="form-control"
                value={formSem}
                onChange={(e) => setFormSem(e.target.value)}
                required
              >
                {[1,2,3,4,5,6,7,8].map(s => (
                  <option value={s} key={s}>Semester {s}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Max Students</label>
              <input 
                type="number" 
                className="form-control" 
                min="1" 
                value={formMaxStudents}
                onChange={(e) => setFormMaxStudents(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Description</label>
            <textarea 
              className="form-control" 
              rows="3" 
              placeholder="Brief course description..."
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setIsAddOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary"><i className="bi bi-plus-lg"></i> Add Course</button>
          </div>
        </form>
      </Modal>

      {/* ======================== EDIT COURSE MODAL ======================== */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={<><i className="bi bi-pencil-square me-2"></i>Edit Course</>}>
        <form onSubmit={handleEditSubmit}>
          <div className="section-divider" style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            <i className="bi bi-book"></i> Course Information
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Course Name *</label>
              <input 
                type="text" 
                className="form-control"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Course Code *</label>
              <input 
                type="text" 
                className="form-control"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Department *</label>
              <select 
                className="form-control"
                value={formDept}
                onChange={(e) => setFormDept(e.target.value)}
                required
              >
                {departments.map((d, idx) => (
                  <option value={d.id} key={idx}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Faculty *</label>
              <select 
                className="form-control"
                value={formFac}
                onChange={(e) => setFormFac(e.target.value)}
                required
              >
                {faculty.map((f, idx) => (
                  <option value={f.id} key={idx}>{f.user?.first_name} {f.user?.last_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Credits *</label>
              <input 
                type="number" 
                className="form-control" 
                min="1" 
                max="10" 
                value={formCredits}
                onChange={(e) => setFormCredits(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Semester *</label>
              <select 
                className="form-control"
                value={formSem}
                onChange={(e) => setFormSem(e.target.value)}
                required
              >
                {[1,2,3,4,5,6,7,8].map(s => (
                  <option value={s} key={s}>Semester {s}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Max Students</label>
              <input 
                type="number" 
                className="form-control" 
                min="1" 
                value={formMaxStudents}
                onChange={(e) => setFormMaxStudents(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Description</label>
            <textarea 
              className="form-control" 
              rows="3"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setIsEditOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary"><i className="bi bi-pencil"></i> Update Course</button>
          </div>
        </form>
      </Modal>

      {/* ======================== DELETE COURSE MODAL ======================== */}
      <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title={<><i className="bi bi-trash me-2"></i>Delete Course</>}>
        <div style={{ marginBottom: '20px' }}>
          Are you sure you want to delete course <strong>{deletingCourse?.name}</strong> (<strong>{deletingCourse?.code || deletingCourse?.course_code}</strong>)?
          <br />
          <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}><i className="bi bi-exclamation-triangle"></i> This action is permanent.</span>
        </div>
        <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-accent" onClick={handleDeleteConfirm}><i className="bi bi-trash"></i> Delete</button>
        </div>
      </Modal>
    </>
  );
}

import { useState, useEffect } from 'react';
import { API, Utils } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import Modal from '../components/Modal.jsx';

export default function Courses() {
  const { user } = useAuthStore();
  const [courses, setCourses] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [activeTab, setActiveTab] = useState('courses'); // 'courses' or 'enrollments'
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSem, setSelectedSem] = useState('');
  const [selectedActive, setSelectedActive] = useState('');
  const [enrollSearchQuery, setEnrollSearchQuery] = useState('');

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

  const isAdmin = user?.role === 'admin';
  const isFaculty = user?.role === 'faculty';
  const isStudent = user?.role === 'student';

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
          currentSem = JSON.parse(cached).semester;
        } else {
          const profile = await API.get('students/my_profile');
          currentSem = profile?.semester;
        }
      } else {
        const activeSemesters = semData || [];
        if (activeSemesters.length > 0) {
          const sorted = [...activeSemesters].sort((a, b) => a.number - b.number);
          currentSem = sorted[0].number;
        }
      }

      // Role-based filtering
      if (isStudent) {
        const enrollData = await API.get('enrollments');
        const myCourseIds = new Set((enrollData || []).map(e => String(e.course || e.course_id || e.subject_id || '')));
        loadedCourses = loadedCourses.filter(c => myCourseIds.has(String(c.id)) || myCourseIds.has(String(c.subject_id)));
        // Students: don't filter further by semester — enrolled courses ARE their courses
      } else if (isFaculty) {
        const facProfile = await API.get('faculty/my_profile');
        const facId = facProfile?.id;
        loadedCourses = loadedCourses.filter(c => c.faculty === facId || c.faculty_id === facId);
        // Filter by semester for faculty/admin
        if (currentSem && currentSem !== '—') {
          loadedCourses = loadedCourses.filter(c => String(c.semester) === String(currentSem));
        }
      } else {
        // Filter by semester for admin
        if (currentSem && currentSem !== '—') {
          loadedCourses = loadedCourses.filter(c => String(c.semester) === String(currentSem));
        }
      }

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
      const matchDept = !selectedDept || String(c.department) === selectedDept || String(c.department_id) === selectedDept;
      const matchSem = !selectedSem || String(c.semester) === selectedSem;
      const matchActive = !selectedActive || (selectedActive === 'true' ? c.is_active !== false : c.is_active === false);
      return matchSearch && matchDept && matchSem && matchActive;
    });
  };

  // Filter Enrollments
  const getFilteredEnrollments = () => {
    const query = enrollSearchQuery.toLowerCase().trim();
    return enrollments.filter(e => {
      const studentName = e.student_name || `${e.student?.user?.first_name || ''} ${e.student?.user?.last_name || ''}`.toLowerCase();
      const courseName = (e.course_name || e.course?.name || '').toLowerCase();
      return !query || studentName.includes(query) || courseName.includes(query);
    });
  };

  const filtered = getFilteredCourses();
  const paginatedCourses = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedDept('');
    setSelectedSem('');
    setSelectedActive('');
    setCurrentPage(1);
  };

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

  const activeSemesterNumber = courses.length ? courses[0].semester : '—';
  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>📚 Course Catalog</h1>
          <p id="pageDesc">
            {isStudent 
              ? `You are enrolled in ${courses.length} course${courses.length !== 1 ? 's' : ''} for your current semester (Semester ${activeSemesterNumber}).`
              : isFaculty
                ? `You are teaching ${courses.length} course${courses.length !== 1 ? 's' : ''} in the current active semester (Semester ${activeSemesterNumber}).`
                : `Showing ${courses.length} course${courses.length !== 1 ? 's' : ''} for the current active semester (Semester ${activeSemesterNumber}).`}
          </p>
        </div>
        {isAdmin && (
          <div className="page-header-right" id="addCourseWrap">
            <button className="btn btn-primary" onClick={handleOpenAdd}>➕ Add Course</button>
          </div>
        )}
      </div>

      {/* Stats Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary">
          <div className="stat-icon">📚</div>
          <div className="stat-value" id="totalCourses">{courses.length}</div>
          <div className="stat-label">Total Courses</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">✅</div>
          <div className="stat-value" id="activeCourses">
            {courses.filter(c => c.is_active !== false).length}
          </div>
          <div className="stat-label">Active Courses</div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon">🏅</div>
          <div className="stat-value" id="totalCredits">{totalCredits || '—'}</div>
          <div className="stat-label">Total Credits</div>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="card col-12">
        {isAdmin && (
          <div className="tabs-header" style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            <button 
              className={`tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
              onClick={() => setActiveTab('courses')}
            >
              Courses Catalog
            </button>
            <button 
              className={`tab-btn ${activeTab === 'enrollments' ? 'active' : ''}`}
              onClick={() => setActiveTab('enrollments')}
            >
              Enrollments
            </button>
          </div>
        )}

        {/* Catalog Tab */}
        {activeTab === 'courses' && (
          <div className="tab-panel active">
            <div className="filters-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '16px' }}>
              <div className="search-input-wrap">
                <span>🔍</span>
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

              <select 
                className="form-control" 
                id="activeFilter"
                value={selectedActive}
                onChange={(e) => { setSelectedActive(e.target.value); setCurrentPage(1); }}
                style={{ width: 'auto' }}
              >
                <option value="">All Statuses</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>

              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>🧹 Clear Filters</button>
            </div>

            <div className="table-wrapper" style={{ padding: 0 }}>
              <table className="table" id="coursesTable">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Code</th>
                    <th>Department</th>
                    <th>Faculty</th>
                    <th>Credits</th>
                    <th>Semester</th>
                    <th>Status</th>
                    {isAdmin && <th style={{ textAlign: 'center' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody id="coursesTableBody">
                  {paginatedCourses.length ? (
                    paginatedCourses.map((c, idx) => {
                      const code = c.code || c.course_code || '—';
                      const deptName = c.department_name || departments.find(d => d.id == c.department)?.name || '—';
                      const facultyObj = faculty.find(f => f.id == c.faculty || f.id == c.faculty_id);
                      const facultyName = c.faculty_name || (facultyObj ? `${facultyObj.user?.first_name} ${facultyObj.user?.last_name}` : '—');
                      const isActive = c.is_active !== false;

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
                          <td>
                            <span className={`badge ${isActive ? 'badge-success' : 'badge-muted'}`}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          {isAdmin && (
                            <td>
                              <div className="table-actions" style={{ justifyContent: 'center' }}>
                                <button className="action-btn edit" title="Edit" onClick={() => handleOpenEdit(c)}>✏️</button>
                                <button className="action-btn delete" title="Delete" onClick={() => handleOpenDelete(c)}>🗑️</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={isAdmin ? 8 : 7}>
                        <div className="empty-state" style={{ padding: '40px' }}>
                          <div className="empty-state-icon">📚</div>
                          <h3>No Courses Found</h3>
                          <p>
                            {isAdmin 
                              ? 'Try adjusting your filters, or add a new course.'
                              : isStudent
                                ? 'You are not enrolled in any courses yet.'
                                : 'No courses assigned to you yet.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > perPage && (
              <div className="pagination" style={{ display: 'flex', padding: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
                <span id="paginationInfo">
                  Showing { (currentPage - 1) * perPage + 1 }–{ Math.min(currentPage * perPage, filtered.length) } of { filtered.length } courses
                </span>
                <div className="pagination-btns" id="paginationBtns">
                  <button 
                    className="page-btn" 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    &lt;
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button 
                      key={i}
                      className={`page-btn ${currentPage === i + 1 ? 'active' : ''}`}
                      onClick={() => setCurrentPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button 
                    className="page-btn" 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    &gt;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Enrollments Tab */}
        {activeTab === 'enrollments' && isAdmin && (
          <div className="tab-panel active" id="tab-enrollments">
            <div className="filters-bar" style={{ display: 'flex', gap: '12px', padding: '16px' }}>
              <div className="search-input-wrap">
                <span>🔍</span>
                <input 
                  type="text" 
                  id="enrollSearchInput" 
                  placeholder="Search by student or course..."
                  value={enrollSearchQuery}
                  onChange={(e) => setEnrollSearchQuery(e.target.value)}
                />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={loadEnrollments}>🔄 Refresh</button>
            </div>
            
            <div id="enrollmentsBody" style={{ padding: '0 20px 20px' }}>
              {getFilteredEnrollments().length > 0 ? (
                <div style={{ paddingTop: '20px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '16px' }}>
                    {getFilteredEnrollments().length} enrollment records
                  </div>
                  {getFilteredEnrollments().map((e, idx) => {
                    const studentName = e.student_name || `${e.student?.user?.first_name || ''} ${e.student?.user?.last_name || ''}`.trim() || 'Unknown';
                    const courseName = e.course_name || e.course?.name || 'Unknown Course';
                    const courseCode = e.course_code || e.course?.code || '';
                    const enrollDate = Utils.formatDate(e.enrollment_date || e.created_at);
                    const initials = Utils.getInitials(studentName);
                    return (
                      <div className="enrollment-item" key={idx} style={{ display: 'flex', alignItems: 'center', padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="table-avatar" style={{ background: Utils.getRandomColor(studentName), width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px', fontWeight: 600 }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{studentName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{e.student?.student_id || ''}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{courseName}</div>
                          <span className="course-code" style={{ fontSize: '0.7rem' }}>{courseCode}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Enrolled {enrollDate}</div>
                          <span className={`badge ${e.is_active !== false ? 'badge-success' : 'badge-muted'}`} style={{ marginTop: '4px' }}>
                            {e.is_active !== false ? 'Active' : 'Dropped'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: '40px' }}>
                  <div className="empty-state-icon">📋</div>
                  <h3>No Enrollments Found</h3>
                  <p>No enrollment records match your search.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ======================== ADD COURSE MODAL ======================== */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="➕ Add New Course">
        <form onSubmit={handleAddSubmit}>
          <div className="section-divider" style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            📚 Course Information
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
            <button type="submit" className="btn btn-primary">➕ Add Course</button>
          </div>
        </form>
      </Modal>

      {/* ======================== EDIT COURSE MODAL ======================== */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="✏️ Edit Course">
        <form onSubmit={handleEditSubmit}>
          <div className="section-divider" style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            📚 Course Information
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
            <button type="submit" className="btn btn-primary">✏️ Update Course</button>
          </div>
        </form>
      </Modal>

      {/* ======================== DELETE COURSE MODAL ======================== */}
      <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title="🗑️ Delete Course">
        <div style={{ marginBottom: '20px' }}>
          Are you sure you want to delete course <strong>{deletingCourse?.name}</strong> (<strong>{deletingCourse?.code || deletingCourse?.course_code}</strong>)?
          <br />
          <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>⚠️ This action is permanent.</span>
        </div>
        <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-accent" onClick={handleDeleteConfirm}>🗑️ Delete</button>
        </div>
      </Modal>
    </>
  );
}

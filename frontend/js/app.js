/* ============================================================
   EDUPULSE — Unified Supabase UUID API & Auth Adapter
   Maps all legacy Django REST endpoints to the new UUID-based
   Supabase PostgreSQL tables on-the-fly.
   ============================================================ */

const SUPABASE_URL  = 'https://olaqwoxycxdbcmqegifi.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sYXF3b3h5Y3hkYmNtcWVnaWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDYyODgsImV4cCI6MjA5ODM4MjI4OH0.JUYUKKGAAd7fx8s840meU0Ayd5VE7sfSMwDbiG8twlU';
var SOCKET_URL      = 'http://127.0.0.1:3001';

// ---- Auth Utilities ----
const Auth = {
  getToken: () => localStorage.getItem('access_token'),
  getUser: () => JSON.parse(localStorage.getItem('user') || 'null'),
  isLoggedIn: () => !!localStorage.getItem('access_token'),

  logout() {
    localStorage.clear();
    window.location.href = '../index.html';
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '../index.html';
      return null;
    }
    return this.getUser();
  },

  requireRole(role) {
    const user = this.requireAuth();
    if (!user) return null;
    const userRole = (user.role || '').toLowerCase();
    const reqRole = (role || '').toLowerCase();
    if (userRole !== reqRole) {
      const base = window.location.pathname.includes('/pages/') ? '../dashboard/' : 'dashboard/';
      const destinations = { admin: base + 'admin.html', faculty: base + 'faculty.html', student: base + 'student.html' };
      window.location.href = destinations[userRole] || '../index.html';
      return null;
    }
    return user;
  }
};

// ---- Raw Supabase REST Fetcher ----
const SupaFetch = {
  headers(token) {
    return {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${token || SUPABASE_ANON}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    };
  },

  async request(path, method = 'GET', body = null, token = null) {
    const isAuthPath = path.startsWith('auth/');
    const url = isAuthPath
      ? `${SUPABASE_URL}/${path}`
      : `${SUPABASE_URL}/rest/v1/${path}`;

    const headers = this.headers(token);
    if (isAuthPath) delete headers['Prefer'];

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw data;
    return data;
  }
};

// ---- Translation/Adapter Layer ----
const API = {
  async request(endpoint, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    const loggedInUser = Auth.getUser();

    // Parse path and query parameters
    const [pathWithSlash, queryStr] = endpoint.split('?');
    const path = pathWithSlash.replace(/^\//, '').replace(/\/$/, '');
    const params = new URLSearchParams(queryStr || '');

    try {
      // 1. AUTH LOGIN (Direct database check bypassing Supabase Auth completely)
      if (path === 'auth/login') {
        const emailInput = body.email || body.username;
        const password = body.password;

        const encEmail = encodeURIComponent(emailInput);
        const encPassword = encodeURIComponent(password);
        
        // Find user by email AND password_hash
        const rows = await SupaFetch.request(`users?select=*&email=eq.${encEmail}&password_hash=eq.${encPassword}`);

        if (!rows || rows.length === 0) {
          throw { error: 'invalid_credentials', message: 'Invalid username/email or password.' };
        }

        const dbUser = rows[0];
        const emailPrefix = dbUser.email.split('@')[0];
        const firstName = emailPrefix.split('.')[0] || 'User';
        const lastName = emailPrefix.split('.')[1] || '';
        const role = (dbUser.role || '').toLowerCase();

        const loginResponse = {
          access: 'mock_access_token_' + Math.floor(Math.random() * 1000000),
          refresh: 'mock_refresh_token_' + Math.floor(Math.random() * 1000000),
          user: {
            id: dbUser.id,
            email: dbUser.email,
            username: emailPrefix,
            first_name: firstName.charAt(0).toUpperCase() + firstName.slice(1),
            last_name: lastName ? lastName.charAt(0).toUpperCase() + lastName.slice(1) : '',
            role,
            phone: '',
          }
        };

        localStorage.setItem('access_token', loginResponse.access);
        localStorage.setItem('refresh_token', loginResponse.refresh);
        localStorage.setItem('user', JSON.stringify(loginResponse.user));
        localStorage.removeItem('student_profile'); // clear stale cache

        // Pre-fetch role-specific profile in background so dashboard loads instantly
        if (role === 'student') {
          SupaFetch.request(`students?select=*,user:users(*),department:departments(*),current_semester:semesters(*)&user_id=eq.${dbUser.id}`)
            .then(sRows => {
              if (sRows && sRows.length) {
                const s = sRows[0];
                localStorage.setItem('student_profile', JSON.stringify({
                  ...s,
                  id: s.student_id,
                  student_id: s.enrollment_no,
                  department_name: s.department?.name || '—',
                  semester: s.current_semester?.number || '—',
                  year_of_study: s.current_semester?.number ? Math.ceil(s.current_semester.number / 2) : '—',
                  user: s.user
                }));
              }
            }).catch(() => {});
        }

        return loginResponse;
      }

      // 2. ADMIN DASHBOARD STATS
      if (path === 'auth/dashboard/stats') {
        const [students, faculty, subjects, users, feePayments] = await Promise.all([
          SupaFetch.request('students?select=student_id'),
          SupaFetch.request('faculty?select=faculty_id'),
          SupaFetch.request('subjects?select=subject_id'),
          SupaFetch.request('users?select=id'),
          SupaFetch.request('fee_payments?select=amount_paid,status')
        ]);
        const paidFees = (feePayments || []).filter(f => f.status === 'paid').reduce((acc, curr) => acc + parseFloat(curr.amount_paid), 0);
        const pendFees = (feePayments || []).filter(f => f.status === 'pending').reduce((acc, curr) => acc + parseFloat(curr.amount_paid), 0);
        return {
          total_students: students.length,
          total_faculty: faculty.length,
          total_courses: subjects.length,
          total_fees_collected: paidFees,
          total_fees_pending: pendFees,
          total_users: users.length
        };
      }

      // 3. STUDENT PROFILE — serve from localStorage cache first for instant load
      if (path === 'students/my_profile') {
        const cached = localStorage.getItem('student_profile');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.semester && parsed.year_of_study) {
            // Refresh cache in background without blocking the page
            SupaFetch.request(`students?select=*,user:users(*),department:departments(*),current_semester:semesters(*)&user_id=eq.${loggedInUser.id}`)
              .then(rows => {
                if (rows && rows.length) {
                  const s = rows[0];
                  localStorage.setItem('student_profile', JSON.stringify({
                    ...s,
                    id: s.student_id,
                    student_id: s.enrollment_no,
                    department_name: s.department?.name || '—',
                    semester: s.current_semester?.number || '—',
                    year_of_study: s.current_semester?.number ? Math.ceil(s.current_semester.number / 2) : '—',
                    user: s.user
                  }));
                }
              }).catch(() => {});
            return parsed;
          }
        }
        const rows = await SupaFetch.request(`students?select=*,user:users(*),department:departments(*),current_semester:semesters(*)&user_id=eq.${loggedInUser.id}`);
        if (!rows || rows.length === 0) return null;
        const result = {
          ...rows[0],
          id: rows[0].student_id,
          student_id: rows[0].enrollment_no,
          department_name: rows[0].department?.name || '—',
          semester: rows[0].current_semester?.number || '—',
          year_of_study: rows[0].current_semester?.number ? Math.ceil(rows[0].current_semester.number / 2) : '—',
          user: rows[0].user
        };
        localStorage.setItem('student_profile', JSON.stringify(result));
        return result;
      }

      // 4. FACULTY PROFILE
      if (path === 'faculty/my_profile') {
        const rows = await SupaFetch.request(`faculty?select=*,user:users(*),department:departments(*)&user_id=eq.${loggedInUser.id}`);
        if (!rows || rows.length === 0) return null;
        return {
          ...rows[0],
          id: rows[0].faculty_id,
          department_name: rows[0].department?.name || '—',
          user: rows[0].user
        };
      }

      // 5. ALL STUDENTS LIST
      if (path === 'students') {
        if (method === 'GET') {
          const rows = await SupaFetch.request('students?select=*,user:users(*),department:departments(*)&order=enrollment_no.asc');
          return rows.map(s => ({
            ...s,
            id: s.student_id,
            student_id: s.enrollment_no,
            department_name: s.department?.name || '—',
            user: s.user
          }));
        }
        if (method === 'POST') {
          const newUser = await SupaFetch.request('users', 'POST', {
            email: body.email || `${body.username}@student.college.edu`,
            username: body.username,
            password_hash: 'student123',
            role: 'student'
          });
          const createdUser = Array.isArray(newUser) ? newUser[0] : newUser;
          const newStudent = await SupaFetch.request('students', 'POST', {
            user_id: createdUser.id,
            enrollment_no: body.roll_number || body.student_id,
            first_name: body.first_name || body.username,
            last_name: body.last_name || '',
            date_of_birth: body.date_of_birth || '2005-01-01',
            parent_email: body.parent_email || 'parent@college.edu',
            parent_phone: body.parent_phone || '',
            department_id: body.department_id || 'd0000000-0000-0000-0000-000000000001',
            current_semester_id: 'e0000000-0000-0000-0000-000000000005'
          });
          return Array.isArray(newStudent) ? newStudent[0] : newStudent;
        }
      }

      // 6. STUDENT EDIT / DELETE
      if (path.startsWith('students/')) {
        const studentUuid = path.split('/')[1];
        if (method === 'PATCH' || method === 'PUT') {
          const row = await SupaFetch.request(`students?student_id=eq.${studentUuid}`, 'PATCH', body);
          return Array.isArray(row) ? row[0] : row;
        }
        if (method === 'DELETE') {
          const student = await SupaFetch.request(`students?student_id=eq.${studentUuid}`);
          if (student && student.length > 0) {
            await SupaFetch.request(`users?id=eq.${student[0].user_id}`, 'DELETE');
          }
          return null;
        }
      }

      // 7. ALL FACULTY LIST
      if (path === 'faculty') {
        const rows = await SupaFetch.request('faculty?select=*,user:users(*),department:departments(*)&order=employee_id.asc');
        return rows.map(f => ({
          ...f,
          id: f.faculty_id,
          department_name: f.department?.name || '—',
          user: f.user
        }));
      }

      // 8. ALL COURSES / SUBJECTS
      if (path === 'courses') {
        const rows = await SupaFetch.request('subjects?select=*,faculty:faculty(*,user:users(*)),department:departments(*)');
        return rows.map(c => ({
          ...c,
          id: c.subject_id,
          department_name: c.department?.name || '—',
          faculty_name: c.faculty?.user ? `${c.faculty.user.first_name || c.faculty.user.username} ${c.faculty.user.last_name || ''}` : '—'
        }));
      }

      // 9. ENROLLMENTS
      if (path === 'enrollments' || path === 'courses/enrollments') {
        const studentRow = await SupaFetch.request(`students?user_id=eq.${loggedInUser.id}`);
        if (!studentRow || studentRow.length === 0) return [];
        const rows = await SupaFetch.request(`enrollments?select=*,course:subjects(*)&student_id=eq.${studentRow[0].student_id}`);
        return rows.map(e => ({
          ...e,
          course: e.course?.subject_id,
          course_code: e.course?.code,
          course_name: e.course?.name
        }));
      }

      // 10. GRADES / MARKS
      if (path === 'grades/my_grades' || path === 'grades') {
        let studentUuid = params.get('student');
        if (!studentUuid && path === 'grades/my_grades') {
          const studentRow = await SupaFetch.request(`students?select=student_id&user_id=eq.${loggedInUser.id}`);
          if (!studentRow || studentRow.length === 0) return [];
          studentUuid = studentRow[0].student_id;
        }
        const rows = await SupaFetch.request(`marks?select=*,course:subjects(*)&student_id=eq.${studentUuid || 'st000000-0000-0000-0000-000000000001'}`);
        return rows.map(r => {
          const obtained = parseFloat(r.total_marks || (r.internal_marks + r.external_marks) || 0);
          const maxMarks = obtained > 100 ? 150 : 100;
          const percentage = Math.round((obtained / maxMarks) * 100);
          return {
            ...r,
            marks_obtained: obtained,
            total_marks: maxMarks,
            percentage: percentage,
            course_name: r.course?.name || '—',
            course_code: r.course?.code || '—',
            exam_type: 'Semester End Exam',
            exam_date: r.entered_at
          };
        });
      }

      // 11. TIMETABLE
      if (path === 'timetable') {
        const day = params.get('day');
        const facultyUuid = params.get('faculty');
        let query = 'timetable?select=*,course:subjects(*),faculty:faculty(*,user:users(*))';
        if (day) query += `&day_of_week=eq.${day}`;
        if (facultyUuid) query += `&faculty_id=eq.${facultyUuid}`;
        const rows = await SupaFetch.request(query);
        const dayMap = {
          'MON': 'monday', 'TUE': 'tuesday', 'WED': 'wednesday',
          'THU': 'thursday', 'FRI': 'friday', 'SAT': 'saturday', 'SUN': 'sunday'
        };
        return rows.map(t => ({
          ...t,
          day: dayMap[t.day_of_week] || t.day_of_week?.toLowerCase() || 'monday',
          room: t.room_no || '—',
          course_name: t.course?.name || '—',
          course_code: t.course?.code || '—',
          faculty_name: t.faculty ? `${t.faculty.first_name} ${t.faculty.last_name}` : '—'
        }));
      }

      // 12. ATTENDANCE STATS
      if (path === 'attendance/stats') {
        const studentUuid = params.get('student');
        const subjectUuid = params.get('course');
        let query = `attendance_records?student_id=eq.${studentUuid}`;
        if (subjectUuid) query += `&subject_id=eq.${subjectUuid}`;
        const records = await SupaFetch.request(query);
        
        const present = records.filter(r => r.status === 'present' || r.status === 'P' || r.status === 'p').length;
        const absent  = records.filter(r => r.status === 'absent' || r.status === 'A' || r.status === 'a').length;
        const late    = records.filter(r => r.status === 'late' || r.status === 'L' || r.status === 'l').length;
        const excused = records.filter(r => r.status === 'excused' || r.status === 'E' || r.status === 'e').length;
        const total   = records.length;
        const totalEligible = total || 1;
        
        // Calculate attended (present + late)
        const attended = present + late;
        const percentage = ((attended / totalEligible) * 100).toFixed(1);

        return {
          total,
          present,
          absent,
          late,
          excused,
          percentage
        };
      }
      if (path === 'attendance') {
        const studentUuid = params.get('student');
        const rows = await SupaFetch.request(`attendance_records?select=*,course:subjects(*),marker:faculty(*)&student_id=eq.${studentUuid}`);
        return rows.map(r => ({
          ...r,
          course_name: r.course?.name || '—',
          course_code: r.course?.code || '—',
          marked_by: r.marker ? `${r.marker.first_name} ${r.marker.last_name}` : 'System'
        }));
      }

      // 13. FEES / FEE STRUCTURE & PAYMENTS
      if (path === 'fees') {
        const studentUuid = params.get('student');
        const payments = await SupaFetch.request(`fee_payments?select=*,fee_structures(*)&student_id=eq.${studentUuid || 'st000000-0000-0000-0000-000000000001'}`);
        return payments.map(p => ({
          ...p,
          fee_type: p.fee_structures?.component_name?.toLowerCase() || 'tuition',
          amount: p.fee_structures?.amount || 0,
          due_date: p.fee_structures?.due_date || '',
          remarks: p.transaction_ref || ''
        }));
      }

      // 14. GLOBAL NOTICES
      if (path === 'notices') {
        if (method === 'GET') {
          const audience = params.get('audience');
          let query = 'notices?select=*,author:users(*)&order=published_at.desc';
          if (audience) {
            if (audience === 'students') {
              query += '&target_audience=in.(ALL,STUDENTS_ONLY)';
            } else if (audience === 'faculty') {
              query += '&target_audience=in.(ALL,FACULTY_ONLY)';
            } else {
              query += `&target_audience=in.(ALL,${audience.toUpperCase()})`;
            }
          }
          const rows = await SupaFetch.request(query);
          return rows.map(n => {
            let notice_type = 'general';
            const prio = (n.priority || '').toUpperCase();
            if (prio === 'URGENT') notice_type = 'urgent';
            else if (prio === 'HIGH') notice_type = 'exam';
            else if (prio === 'LOW') notice_type = 'holiday';
            else if (prio === 'NORMAL') notice_type = 'general';

            let audienceVal = 'all';
            const aud = (n.target_audience || '').toUpperCase();
            if (aud === 'STUDENTS_ONLY') audienceVal = 'students';
            else if (aud === 'FACULTY_ONLY') audienceVal = 'faculty';

            return {
              ...n,
              id: n.notice_id,
              audience: audienceVal,
              notice_type: notice_type,
              created_at: n.published_at,
              posted_by_name: n.author ? `${n.author.email.split('@')[0].replace('.', ' ')}` : 'Admin'
            };
          });
        }
        if (method === 'POST') {
          let role = (loggedInUser.role || 'admin').toLowerCase();
          if (role === 'student') {
            throw { error: 'unauthorized', message: 'Students are not authorized to post notices.' };
          }
          let dbAudience = 'ALL';
          if (body.audience === 'students') dbAudience = 'STUDENTS_ONLY';
          else if (body.audience === 'faculty') dbAudience = 'FACULTY_ONLY';

          let dbPriority = 'NORMAL';
          if (body.notice_type === 'urgent') dbPriority = 'URGENT';
          else if (body.notice_type === 'exam') dbPriority = 'HIGH';
          else if (body.notice_type === 'holiday') dbPriority = 'LOW';
          else if (body.notice_type === 'event') dbPriority = 'NORMAL';

          let dbRole = 'ADMIN';
          if (role === 'faculty') dbRole = 'FACULTY';
          else if (role === 'hod') dbRole = 'HOD';

          const row = await SupaFetch.request('notices', 'POST', {
            author_id: loggedInUser.id,
            author_role: dbRole,
            title: body.title,
            content: body.content,
            target_audience: dbAudience,
            priority: dbPriority
          });
          const created = Array.isArray(row) ? row[0] : row;
          if (created) {
            return {
              ...created,
              id: created.notice_id,
              audience: body.audience,
              notice_type: body.notice_type,
              created_at: created.published_at,
            };
          }
          return created;
        }
      }

      // notices EDIT / DELETE
      if (path.startsWith('notices/')) {
        const noticeUuid = path.split('/')[1];
        let role = (loggedInUser.role || 'admin').toLowerCase();
        if (role === 'student') {
          throw { error: 'unauthorized', message: 'Students are not authorized to modify notices.' };
        }
        if (method === 'PATCH' || method === 'PUT') {
          const patchBody = {};
          if (body.title !== undefined) patchBody.title = body.title;
          if (body.content !== undefined) patchBody.content = body.content;
          if (body.audience !== undefined) {
            let dbAudience = 'ALL';
            if (body.audience === 'students') dbAudience = 'STUDENTS_ONLY';
            else if (body.audience === 'faculty') dbAudience = 'FACULTY_ONLY';
            patchBody.target_audience = dbAudience;
          }
          if (body.notice_type !== undefined) {
            let dbPriority = 'NORMAL';
            if (body.notice_type === 'urgent') dbPriority = 'URGENT';
            else if (body.notice_type === 'exam') dbPriority = 'HIGH';
            else if (body.notice_type === 'holiday') dbPriority = 'LOW';
            else if (body.notice_type === 'event') dbPriority = 'NORMAL';
            patchBody.priority = dbPriority;
          }

          const row = await SupaFetch.request(`notices?notice_id=eq.${noticeUuid}`, 'PATCH', patchBody);
          const updated = Array.isArray(row) ? row[0] : row;
          if (updated) {
            return {
              ...updated,
              id: updated.notice_id,
              audience: body.audience || 'all',
              notice_type: body.notice_type || 'general',
              created_at: updated.published_at
            };
          }
          return updated;
        }
        if (method === 'DELETE') {
          await SupaFetch.request(`notices?notice_id=eq.${noticeUuid}`, 'DELETE');
          return null;
        }
      }

      // 15. COMPLAINTS / GRIEVANCES
      if (path === 'complaints') {
        if (method === 'GET') {
          const query = 'grievances?select=*,student:students(*,user:users(*))&order=submitted_at.desc';
          const rows = await SupaFetch.request(query);
          return rows.map(c => ({
            ...c,
            created_at: c.submitted_at,
            student_name: c.is_anonymous ? 'Anonymous Student' : `${c.student?.first_name || ''} ${c.student?.last_name || ''}`,
          }));
        }
        if (method === 'POST') {
          const studentRow = await SupaFetch.request(`students?user_id=eq.${loggedInUser.id}`);
          const row = await SupaFetch.request('grievances', 'POST', {
            student_id: studentRow[0].student_id,
            title: body.title,
            description: body.description,
            category: body.category || 'other',
            is_anonymous: body.is_anonymous || false,
            status: 'pending'
          });
          return Array.isArray(row) ? row[0] : row;
        }
      }

      // Fallback API Call
      const token = Auth.getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      };
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers });
      return response.status === 204 ? null : await response.json();

    } catch (err) {
      console.error('Translation error:', err);
      throw err;
    }
  },

  async refreshToken() { return true; },
  get: (url) => API.request(url),
  post: (url, data) => API.request(url, { method: 'POST', body: JSON.stringify(data) }),
  put: (url, data) => API.request(url, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (url, data) => API.request(url, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (url) => API.request(url, { method: 'DELETE' }),
};

// ---- Toast Notifications ----
const Toast = {
  container: null,
  icons: { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' },
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', title = null, duration = 4000) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${this.icons[type]}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        <div class="toast-message">${message}</div>
      </div>
    `;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success: (msg, title) => Toast.show(msg, 'success', title),
  error: (msg, title) => Toast.show(msg, 'error', title),
  info: (msg, title) => Toast.show(msg, 'info', title),
  warning: (msg, title) => Toast.show(msg, 'warning', title),
};

// ---- Modal ----
const Modal = {
  open(id) { document.getElementById(id)?.classList.add('open'); },
  close(id) { document.getElementById(id)?.classList.remove('open'); },
  closeAll() { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); },
};
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) Modal.closeAll();
});

// ---- Helpers ----
const Utils = {
  formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  },
  formatCurrency(amount) {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN')}`;
  },
  getInitials(name) {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  },
  getRandomColor(seed) {
    const colors = ['#6C63FF', '#00D4AA', '#FF6B6B', '#FF9F43', '#54A0FF', '#C084FC', '#06B6D4'];
    const idx = seed ? seed.toString().charCodeAt(0) % colors.length : 0;
    return colors[idx];
  },
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },
  paginateArray(arr, page, perPage = 10) {
    const start = (page - 1) * perPage;
    return arr.slice(start, start + perPage);
  },
  getStatusBadge(status) {
    const s = (status || '').toLowerCase();
    const cleanStatus = s === 'p' ? 'present' : s === 'a' ? 'absent' : s === 'l' ? 'late' : s === 'e' ? 'excused' : s;
    const map = {
      active: 'success', inactive: 'muted', graduated: 'info',
      paid: 'success', pending: 'warning', overdue: 'danger', waived: 'muted',
      present: 'success', absent: 'danger', late: 'warning', excused: 'info',
    };
    const label = cleanStatus.charAt(0).toUpperCase() + cleanStatus.slice(1);
    return `<span class="badge badge-${map[cleanStatus] || 'muted'}">${label}</span>`;
  },
  getGradeBadge(grade) {
    const map = { 'O': 'success', 'A+': 'success', 'A': 'info', 'B+': 'info', 'B': 'primary', 'C': 'warning', 'D': 'warning', 'F': 'danger' };
    return `<span class="badge badge-${map[grade] || 'muted'}">${grade}</span>`;
  }
};

// ---- Navigation & Dynamic Sidebar ----
function generateNavItems(items, currentPage) {
  return items.map(item => {
    if (item.section) {
      return `<div class="nav-section-title">${item.section}</div>`;
    }
    const isActive = item.page === currentPage ? 'active' : '';
    return `<a class="nav-item ${isActive}" href="${item.href}"><span class="nav-icon">${item.icon}</span> ${item.label}</a>`;
  }).join('');
}

function buildGlobalSidebar() {
  const sidebarEl = document.querySelector('.sidebar');
  if (!sidebarEl) return;

  const user = Auth.getUser();
  if (!user) return;

  const role = (user.role || '').toLowerCase();
  const isDashboard = window.location.pathname.includes('/dashboard/');
  const pagesBase = isDashboard ? '../pages/' : '';
  const dashBase = isDashboard ? '' : '../dashboard/';

  const currentPath = window.location.pathname;
  const currentPage = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'index.html';

  const initials = (user.first_name?.[0] || '') + (user.last_name?.[0] || '');
  const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User';

  let brandTitle = 'EduPulse';
  let brandSubtitle = 'Portal';
  let brandHref = '#';
  let navHtml = '';

  if (role === 'student') {
    brandTitle = 'EduPulse';
    brandSubtitle = 'Student Portal';
    brandHref = `${dashBase}student.html`;

    const items = [
      { section: 'Main' },
      { label: 'My Dashboard', icon: '📊', href: `${dashBase}student.html`, page: 'student.html' },
      { section: 'Academics' },
      { label: 'My Attendance', icon: '✅', href: `${pagesBase}student_attendance.html`, page: 'student_attendance.html' },
      { label: 'My Grades', icon: '📝', href: `${pagesBase}student_grades.html`, page: 'student_grades.html' },
      { label: 'Timetable', icon: '📅', href: `${pagesBase}student_timetable.html`, page: 'student_timetable.html' },
      { label: 'Courses', icon: '📚', href: `${pagesBase}courses.html`, page: 'courses.html' },
      { label: 'Study Materials', icon: '📖', href: `${pagesBase}student_content.html`, page: 'student_content.html' },
      { label: 'My Doubts Q&A', icon: '❓', href: `${pagesBase}student_doubts.html`, page: 'student_doubts.html' },
      { section: 'Support & Info' },
      { label: 'My Complaints', icon: '📣', href: `${pagesBase}student_complaints.html`, page: 'student_complaints.html' },
      { label: 'Notices', icon: '📢', href: `${pagesBase}notices.html`, page: 'notices.html' },
      { section: 'Career & Wellness' },
      { label: 'Placement Score', icon: '🎯', href: `${pagesBase}student_placement.html`, page: 'student_placement.html' },
      { label: 'Wellness Tracker', icon: '💚', href: `${pagesBase}student_wellness.html`, page: 'student_wellness.html' }
    ];

    navHtml = generateNavItems(items, currentPage);
  } else if (role === 'faculty' || role === 'hod') {
    brandTitle = 'EduPulse';
    brandSubtitle = role === 'hod' ? 'HOD Portal' : 'Faculty Portal';
    brandHref = `${dashBase}faculty.html`;

    const items = [
      { section: 'Main' },
      { label: 'My Dashboard', icon: '📊', href: `${dashBase}faculty.html`, page: 'faculty.html' },
      { section: 'My Classes' },
      { label: 'Mark Attendance', icon: '✅', href: `${pagesBase}attendance.html`, page: 'attendance.html' },
      { label: 'Enter Grades', icon: '📝', href: `${pagesBase}grades.html`, page: 'grades.html' },
      { label: 'My Timetable', icon: '📅', href: `${pagesBase}faculty_timetable.html`, page: 'faculty_timetable.html' }
    ];

    if (role === 'hod') {
      items.push(
        { section: 'HOD Actions' },
        { label: 'Student Complaints', icon: '📣', href: `${pagesBase}hod_complaints.html`, page: 'hod_complaints.html' },
        { label: 'Manage Timetable', icon: '🗓️', href: `${pagesBase}timetable.html`, page: 'timetable.html' }
      );
    }

    items.push(
      { section: 'Information' },
      { label: 'View Students', icon: '🎓', href: `${pagesBase}students.html`, page: 'students.html' },
      { label: 'Courses', icon: '📚', href: `${pagesBase}courses.html`, page: 'courses.html' },
      { label: 'Notices', icon: '📢', href: `${pagesBase}notices.html`, page: 'notices.html' }
    );

    navHtml = generateNavItems(items, currentPage);
  } else if (role === 'admin') {
    brandTitle = 'EduPulse';
    brandSubtitle = 'Admin Panel';
    brandHref = `${dashBase}admin.html`;

    const items = [
      { section: 'Main' },
      { label: 'Dashboard', icon: '📊', href: `${dashBase}admin.html`, page: 'admin.html' },
      { section: 'Management' },
      { label: 'Students', icon: '🎓', href: `${pagesBase}students.html`, page: 'students.html' },
      { label: 'Faculty', icon: '👨‍🏫', href: `${pagesBase}faculty.html`, page: 'faculty.html' },
      { label: 'Courses', icon: '📚', href: `${pagesBase}courses.html`, page: 'courses.html' },
      { label: 'Departments', icon: '🏛️', href: `${pagesBase}departments.html`, page: 'departments.html' },
      { section: 'Academic' },
      { label: 'Attendance', icon: '✅', href: `${pagesBase}attendance.html`, page: 'attendance.html' },
      { label: 'Grades', icon: '📝', href: `${pagesBase}grades.html`, page: 'grades.html' },
      { label: 'Timetable', icon: '📅', href: `${pagesBase}timetable.html`, page: 'timetable.html' },
      { section: 'Finance & Comms' },
      { label: 'Fee Management', icon: '💰', href: `${pagesBase}fees.html`, page: 'fees.html' },
      { label: 'Notices', icon: '📢', href: `${pagesBase}notices.html`, page: 'notices.html' }
    ];

    navHtml = generateNavItems(items, currentPage);
  }

  sidebarEl.innerHTML = `
    <a class="sidebar-brand" href="${brandHref}">
      <div class="sidebar-brand-icon">🎓</div>
      <div class="sidebar-brand-text">
        <div class="sidebar-brand-title">${brandTitle}</div>
        <div class="sidebar-brand-subtitle">${brandSubtitle}</div>
      </div>
    </a>
    <nav class="sidebar-nav">
      ${navHtml}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user" onclick="Auth.logout()">
        <div class="user-avatar">${initials.toUpperCase() || 'U'}</div>
        <div class="user-info">
          <div class="user-name">${userName}</div>
          <div class="user-role">${role === 'hod' ? 'HOD' : role.charAt(0).toUpperCase() + role.slice(1)}</div>
        </div>
        <span style="color:var(--text-muted); cursor:pointer;">⏻</span>
      </div>
    </div>
  `;
}

// ---- User Display ----
function initUserDisplay() {
  const user = Auth.getUser();
  if (!user) return;
  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user.first_name + ' ' + user.last_name);
  document.querySelectorAll('[data-user-role]').forEach(el => el.textContent = user.role);
  document.querySelectorAll('[data-user-initials]').forEach(el => el.textContent = Utils.getInitials(user.first_name + ' ' + user.last_name));
}

document.addEventListener('DOMContentLoaded', () => {
  buildGlobalSidebar();
  initUserDisplay();
});

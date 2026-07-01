/* ============================================================
   EDUPULSE — Unified Supabase UUID API & Auth Adapter
   Maps all legacy Django REST endpoints to the new UUID-based
   Supabase PostgreSQL tables on-the-fly.
   ============================================================ */

const SUPABASE_URL  = 'https://olaqwoxycxdbcmqegifi.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sYXF3b3h5Y3hkYmNtcWVnaWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDYyODgsImV4cCI6MjA5ODM4MjI4OH0.JUYUKKGAAd7fx8s840meU0Ayd5VE7sfSMwDbiG8twlU';

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

        const loginResponse = {
          access: 'mock_access_token_' + Math.floor(Math.random() * 1000000),
          refresh: 'mock_refresh_token_' + Math.floor(Math.random() * 1000000),
          user: {
            id: dbUser.id,
            email: dbUser.email,
            username: emailPrefix,
            first_name: firstName.charAt(0).toUpperCase() + firstName.slice(1),
            last_name: lastName ? lastName.charAt(0).toUpperCase() + lastName.slice(1) : '',
            role: (dbUser.role || '').toLowerCase(),
            phone: '',
          }
        };

        localStorage.setItem('access_token', loginResponse.access);
        localStorage.setItem('refresh_token', loginResponse.refresh);
        localStorage.setItem('user', JSON.stringify(loginResponse.user));

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

      // 3. STUDENT PROFILE
      if (path === 'students/my_profile') {
        const rows = await SupaFetch.request(`students?select=*,user:users(*),department:departments(*)&user_id=eq.${loggedInUser.id}`);
        if (!rows || rows.length === 0) return null;
        return {
          ...rows[0],
          id: rows[0].student_id,
          student_id: rows[0].enrollment_no,
          department_name: rows[0].department?.name || '—',
          user: rows[0].user
        };
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
      if (path === 'enrollments') {
        const studentRow = await SupaFetch.request(`students?user_id=eq.${loggedInUser.id}`);
        if (!studentRow || studentRow.length === 0) return [];
        const rows = await SupaFetch.request(`enrollments?select=*,course:subjects(*)&student_id=eq.${studentRow[0].student_id}`);
        return rows.map(e => ({
          ...e,
          course: e.course
        }));
      }

      // 10. GRADES / MARKS
      if (path === 'grades/my_grades') {
        const studentRow = await SupaFetch.request(`students?user_id=eq.${loggedInUser.id}`);
        if (!studentRow || studentRow.length === 0) return [];
        const rows = await SupaFetch.request(`marks?select=*,course:subjects(*)&student_id=eq.${studentRow[0].student_id}`);
        return rows;
      }
      if (path === 'grades') {
        const studentUuid = params.get('student');
        const rows = await SupaFetch.request(`marks?select=*,course:subjects(*)&student_id=eq.${studentUuid || 'st000000-0000-0000-0000-000000000001'}`);
        return rows;
      }

      // 11. TIMETABLE
      if (path === 'timetable') {
        const day = params.get('day');
        const facultyUuid = params.get('faculty');
        let query = 'timetable?select=*,course:subjects(*),faculty:faculty(*,user:users(*))';
        if (day) query += `&day_of_week=eq.${day}`;
        if (facultyUuid) query += `&faculty_id=eq.${facultyUuid}`;
        const rows = await SupaFetch.request(query);
        return rows.map(t => ({
          ...t,
          day: t.day_of_week,
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
        const presentCount = records.filter(r => r.status === 'present').length;
        const totalCount = records.length || 1;
        return {
          present_count: presentCount,
          total_lectures: records.length,
          percentage: ((presentCount / totalCount) * 100).toFixed(1)
        };
      }
      if (path === 'attendance') {
        const studentUuid = params.get('student');
        const rows = await SupaFetch.request(`attendance_records?select=*,course:subjects(*)&student_id=eq.${studentUuid}`);
        return rows;
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
          if (audience) query += `&target_audience=in.(all,${audience})`;
          const rows = await SupaFetch.request(query);
          return rows.map(n => ({
            ...n,
            created_at: n.published_at,
            posted_by_name: n.author ? `${n.author.username.replace('.',' ')}` : 'Admin'
          }));
        }
        if (method === 'POST') {
          const row = await SupaFetch.request('notices', 'POST', {
            author_id: loggedInUser.id,
            author_role: loggedInUser.role === 'admin' ? 'admin' : 'faculty',
            title: body.title,
            content: body.content,
            target_audience: body.audience || 'all',
            priority: body.notice_type === 'urgent' ? 'urgent' : 'medium'
          });
          return Array.isArray(row) ? row[0] : row;
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
    const map = {
      active: 'success', inactive: 'muted', graduated: 'info',
      paid: 'success', pending: 'warning', overdue: 'danger', waived: 'muted',
      present: 'success', absent: 'danger', late: 'warning', excused: 'info',
    };
    return `<span class="badge badge-${map[status] || 'muted'}">${status}</span>`;
  },
  getGradeBadge(grade) {
    const map = { 'O': 'success', 'A+': 'success', 'A': 'info', 'B+': 'info', 'B': 'primary', 'C': 'warning', 'D': 'warning', 'F': 'danger' };
    return `<span class="badge badge-${map[grade] || 'muted'}">${grade}</span>`;
  }
};

// ---- Navigation ----
function initNav() {
  const currentPage = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href');
    if (href && href.includes(currentPage)) {
      item.classList.add('active');
    }
  });
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
  initNav();
  initUserDisplay();
});

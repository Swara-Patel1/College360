// Data API — served by the Django DRF backend (backend/),
// which exposes all data via REST endpoints on port 8000.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const API_KEY = 'local-django';
export const SUPABASE_URL = API_URL;
export const SUPABASE_ANON = API_KEY;

export const Auth = {
  getToken: () => localStorage.getItem('access_token'),
  getUser: () => JSON.parse(localStorage.getItem('user') || 'null'),
  isLoggedIn: () => !!localStorage.getItem('access_token'),
};

export const SupaFetch = {
  headers(token) {
    const userToken = token || Auth.getToken();
    return {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${userToken || SUPABASE_ANON}`,
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
    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw { error: `Server error (${res.status}): ${res.statusText}` };
    }
    if (!res.ok) throw data;
    return data;
  }
};

/**
 * Resolve the HOD context for a user — either a real HOD or a deputy holding an
 * active delegation that covers `requiredScope`. Returns null if neither applies.
 */
async function resolveHodContext(userId, requiredScope = null) {
  const hodRow = await SupaFetch.request(`hod?user_id=eq.${userId}`).catch(() => null);
  if (hodRow?.length) {
    return { departmentId: hodRow[0].department_id, hodId: hodRow[0].hod_id, viaDelegation: false };
  }
  const acc = await SupaFetch.request(`hod/my-access?user_id=eq.${userId}`).catch(() => null);
  if (acc?.isDelegate && (!requiredScope || (acc.scopes || []).includes(requiredScope))) {
    return { departmentId: acc.department_id, hodId: acc.delegator_hod_id, viaDelegation: true, scopes: acc.scopes };
  }
  return null;
}

export const API = {
  async request(endpoint, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    const loggedInUser = Auth.getUser();

    // Parse path and query parameters
    const [pathWithSlash, queryStr] = endpoint.split('?');
    const path = pathWithSlash.replace(/^\//, '').replace(/\/$/, '');
    const params = new URLSearchParams(queryStr || '');

    try {
      if (path === 'auth/login') {
        const emailInput = body.email || body.username;
        const password = body.password;

        const res = await fetch(`${SUPABASE_URL}/api/auth/login/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailInput, password }),
        });
        const contentType = res.headers.get('content-type') || '';
        let loginData;
        if (contentType.includes('application/json')) {
          loginData = await res.json();
        } else {
          const text = await res.text();
          throw { error: `Server error (${res.status}): Please check backend server` };
        }
        if (!res.ok) throw loginData;

        const dbUser = loginData.user;
        const role = (dbUser.role || '').toLowerCase();

        const loginResponse = {
          access: loginData.access,
          refresh: loginData.refresh,
          user: {
            id: String(dbUser.id),
            email: dbUser.email,
            username: dbUser.username || dbUser.email.split('@')[0],
            first_name: dbUser.first_name,
            last_name: dbUser.last_name,
            role,
            phone: dbUser.phone || '',
          }
        };

        localStorage.setItem('access_token', loginResponse.access);
        localStorage.setItem('refresh_token', loginResponse.refresh);
        localStorage.setItem('user', JSON.stringify(loginResponse.user));
        localStorage.removeItem('student_profile'); // clear stale cache

        // Pre-fetch role-specific profile in background
        if (role === 'student') {
          fetch(`${SUPABASE_URL}/api/students/my_profile/`, {
            headers: { 'Authorization': `Bearer ${loginResponse.access}`, 'Content-Type': 'application/json' }
          }).then(r => r.json()).then(s => {
            if (s && s.student_id) {
              localStorage.setItem('student_profile', JSON.stringify({
                ...s,
                id: s.student_id,
                department_name: s.department_name || '—',
                semester: s.semester || '—',
                year_of_study: s.year_of_study || '—',
              }));
            }
          }).catch(() => {});
        }

        return loginResponse;
      }

      // 2. ADMIN DASHBOARD STATS — aggregated server-side (rest_compat.handle_admin_stats).
      if (path === 'auth/dashboard/stats' || path === 'admin/stats') {
        return await SupaFetch.request('admin/stats');
      }

      // 3. STUDENT PROFILE
      if (path === 'students/my_profile') {
        const cached = localStorage.getItem('student_profile');
        if (cached) {
          const parsed = JSON.parse(cached);
          // Validate cache belongs to this user and has real data
          const cacheUserId = parsed?.user_id || parsed?.user?.id;
          const cacheValid = parsed && parsed.semester && parsed.year_of_study &&
                             parsed.department_name && parsed.department_name !== '—' &&
                             cacheUserId === loggedInUser.id;
          if (cacheValid) {
            // Refresh in background
            SupaFetch.request(`students?select=*,user:users(*),department:departments(*),current_semester:semesters(*)&user_id=eq.${loggedInUser.id}`)
              .then(rows => {
                if (rows && rows.length) {
                  const s = rows[0];
                  localStorage.setItem('student_profile', JSON.stringify({
                    ...s,
                    id: s.student_id || s.id,
                    student_id: s.student_id || s.id,
                    enrollment_no: s.enrollment_no || '',
                    user_id: loggedInUser.id,
                    department_name: s.department?.name || s.department_name || '—',
                    semester: s.current_semester?.number || s.semester || '—',
                    year_of_study: s.current_semester?.number ? Math.ceil(s.current_semester.number / 2) : (s.year_of_study || '—'),
                    user: s.user
                  }));
                }
              }).catch(() => {});
            return parsed;
          }
          // Cache is stale or wrong user — clear it
          localStorage.removeItem('student_profile');
        }
        const rows = await SupaFetch.request(`students?select=*,user:users(*),department:departments(*),current_semester:semesters(*)&user_id=eq.${loggedInUser.id}`);
        if (!rows || rows.length === 0) return null;
        const s = rows[0];
        const result = {
          ...s,
          id: s.student_id || s.id,
          student_id: s.student_id || s.id,
          enrollment_no: s.enrollment_no || '',
          user_id: loggedInUser.id,
          department_name: s.department?.name || s.department_name || '—',
          semester: s.current_semester?.number || s.semester || '—',
          year_of_study: s.year_of_study || (s.current_semester?.number ? Math.ceil(s.current_semester.number / 2) : '—'),
          user: s.user || { first_name: s.first_name, last_name: s.last_name, email: s.email },
          status: s.status || (s.user?.is_active !== false ? 'active' : 'inactive')
        };
        localStorage.setItem('student_profile', JSON.stringify(result));
        return result;
      }

      // 4. FACULTY PROFILE
      if (path === 'faculty/my_profile') {
        const uid = params.get('user_id') || loggedInUser?.id;
        if (!uid) return null;
        const rows = await SupaFetch.request(`faculty?select=*,user:users(*),department:departments(*)&user_id=eq.${uid}`);
        if (!rows || !rows.length) return null;
        const f = rows[0];
        return {
          ...f,
          id: f.faculty_id || f.id,
          faculty_id: f.faculty_id || f.id,
          department_name: f.department_name || f.department?.name || '—',
          user: f.user
        };
      }

      // 4b. COURSES / SUBJECTS LIST
      if (path === 'courses' || path === 'subjects') {
        const qStr = queryStr || '';
        const reqUrl = `courses${qStr ? '?' + qStr : ''}`;
        const rows = await SupaFetch.request(reqUrl);
        return (Array.isArray(rows) ? rows : []).map(c => ({
          ...c,
          id: c.subject_id || c.id,
          faculty_id: c.faculty_id || c.faculty?.faculty_id || c.faculty?.id,
          subject_id: c.subject_id || c.id,
          department_id: c.department_id || c.department?.department_id || c.department?.id || '',
          department_name: c.department_name || c.department?.name || (typeof c.department === 'string' ? c.department : '—'),
        }));
      }

      // 5. ALL STUDENTS LIST
      // 5. ALL STUDENTS LIST
      if (path === 'students') {
        if (method === 'GET') {
          const qStr = queryStr || '';
          const reqUrl = `students?select=*,user:users(*),department:departments(*),current_semester:semesters(*)&order=enrollment_no.asc${qStr ? '&' + qStr : ''}`;
          const rows = await SupaFetch.request(reqUrl);
          return (Array.isArray(rows) ? rows : []).map(s => ({
            ...s,
            id: s.student_id || s.id,
            student_id: s.student_id || s.id,
            department_id: s.department_id || s.department?.department_id || s.department?.id || '',
            enrollment_no: s.enrollment_no || '',
            department_name: s.department?.name || s.department_name || '—',
            semester: s.current_semester?.number || s.semester || '—',
            year_of_study: s.year_of_study || (s.current_semester?.number ? Math.ceil(s.current_semester.number / 2) : '—'),
            user: {
              ...(s.user || {}),
              first_name: s.first_name || s.user?.first_name || '',
              last_name: s.last_name || s.user?.last_name || ''
            },
            roll_number: s.current_rollno || s.roll_number || '',
            email: s.user?.email || s.email || '',
            status: s.status || (s.user?.is_active === false ? 'inactive' : 'active'),
            parent_email: s.parent_email || '',
            parent_phone: s.parent_phone || s.guardian_phone || '',
            guardian_name: s.guardian_name || (s.first_name ? `Parent of ${s.first_name} ${s.last_name || ''}`.trim() : 'Parent / Guardian'),
            guardian_phone: s.guardian_phone || s.parent_phone || '',
            address: s.address || '',
            date_of_birth: s.date_of_birth || null,
            attendance_percentage: s.attendance_percentage != null ? Number(s.attendance_percentage) : null,
            cgpa: s.cgpa != null ? Number(s.cgpa) : null,
            gpa: s.gpa != null ? Number(s.gpa) : null,
            grade: s.grade || (s.cgpa != null ? `${s.cgpa} CGPA` : '—'),
          }));
        }
        if (method === 'POST') {
          // Django creates the user + student record and auto-enrols in one call.
          const created = await SupaFetch.request('students', 'POST', body);
          return Array.isArray(created) ? created[0] : created;
        }
      }

      // 6. STUDENT EDIT / DELETE — orchestrated server-side.
      if (path.startsWith('students/')) {
        const studentUuid = path.split('/')[1];
        if (method === 'PATCH' || method === 'PUT') {
          const row = await SupaFetch.request(`students?id=eq.${studentUuid}`, 'PATCH', body);
          return Array.isArray(row) ? row[0] : row;
        }
        if (method === 'DELETE') {
          await SupaFetch.request(`students?id=eq.${studentUuid}`, 'DELETE');
          return null;
        }
      }

      // 7. ALL FACULTY LIST / CRUD
      if (path === 'faculty') {
        if (method === 'GET') {
          const qStr = queryStr || '';
          const reqUrl = `faculty?select=*,user:users(*),department:departments(*)&order=employee_id.asc${qStr ? '&' + qStr : ''}`;
          const rows = await SupaFetch.request(reqUrl);
          return (Array.isArray(rows) ? rows : []).map(f => ({
            ...f,
            id: f.faculty_id,
            faculty_id: f.faculty_id,
            department_id: f.department_id || f.department?.department_id || f.department?.id || '',
            email: f.user?.email || '',
            status: f.user?.is_active !== false ? 'active' : 'inactive',
            department_name: f.department?.name || '—',
            user: {
              ...(f.user || {}),
              first_name: f.first_name || f.user?.email?.split('@')[0] || '',
              last_name: f.last_name || ''
            }
          }));
        }
        if (method === 'POST') {
          // Django creates the user + faculty record in one call.
          const created = await SupaFetch.request('faculty', 'POST', body);
          return Array.isArray(created) ? created[0] : created;
        }
      }

      // 7a. FACULTY BY ID (PATCH / DELETE) — orchestrated server-side.
      const facultyIdMatch = path.match(/^faculty\/([0-9a-fA-F-]{36})$/);
      if (facultyIdMatch) {
        const facultyUuid = facultyIdMatch[1];
        if (method === 'PATCH' || method === 'PUT') {
          await SupaFetch.request(`faculty?id=eq.${facultyUuid}`, 'PATCH', body);
          return { success: true };
        }
        if (method === 'DELETE') {
          await SupaFetch.request(`faculty?id=eq.${facultyUuid}`, 'DELETE');
          return null;
        }
      }

      // 7a-ii. FACULTY LEAVE REQUESTS
      if (path === 'faculty/leave' || path === 'faculty/leaves' || path === 'leaves') {
        const uid = params.get('user_id') || loggedInUser?.id;
        if (method === 'GET') {
          const rows = await SupaFetch.request(`faculty/leave?user_id=${uid}`);
          return Array.isArray(rows) ? rows : [];
        }
        if (method === 'POST') {
          return await SupaFetch.request(`faculty/leave?user_id=${uid}`, 'POST', body);
        }
      }

      // 7a-iii. HOD LEAVE APPROVALS
      if (path === 'hod/leaves') {
        const uid = params.get('user_id') || loggedInUser?.id;
        const rows = await SupaFetch.request(`hod/leaves?user_id=${uid}`);
        return Array.isArray(rows) ? rows : [];
      }
      const hodActionMatch = path.match(/^hod\/leaves\/([^/]+)\/(approve|reject)$/);
      if (hodActionMatch) {
        const leaveId = hodActionMatch[1];
        const action = hodActionMatch[2];
        return await SupaFetch.request('hod/leaves/action', 'POST', { leave_id: leaveId, action, remarks: body?.remarks });
      }

      // 7a-iv. FACULTY LECTURE INTERCHANGE
      if (path === 'faculty/interchange') {
        const uid = params.get('user_id') || loggedInUser?.id;
        if (method === 'GET') {
          const rows = await SupaFetch.request(`faculty/interchange?user_id=${uid}`);
          return Array.isArray(rows) ? rows : [];
        }
        if (method === 'POST') {
          return await SupaFetch.request(`faculty/interchange?user_id=${uid}`, 'POST', body);
        }
      }
      const interchangeAcceptMatch = path.match(/^faculty\/interchange\/([^/]+)\/accept$/);
      if (interchangeAcceptMatch) {
        const interchangeId = interchangeAcceptMatch[1];
        return await SupaFetch.request('faculty/interchange/accept', 'POST', { interchange_id: interchangeId });
      }
      const interchangeRejectMatch = path.match(/^faculty\/interchange\/([^/]+)\/reject$/);
      if (interchangeRejectMatch) {
        const interchangeId = interchangeRejectMatch[1];
        return await SupaFetch.request('faculty/interchange/reject', 'POST', { interchange_id: interchangeId, reason: body?.reason });
      }

      // 7a-v. NOTICES
      if (path === 'notices' || path.startsWith('notices?') || path.startsWith('notices/')) {
        if (method === 'GET') {
          const uid = params.get('user_id') || loggedInUser?.id;
          const dept = params.get('department_id');
          let reqPath = 'notices';
          const queryParts = [];
          if (uid) queryParts.push(`user_id=${uid}`);
          if (dept) queryParts.push(`department_id=${dept}`);
          if (queryParts.length > 0) {
            reqPath += `?${queryParts.join('&')}`;
          }
          const rows = await SupaFetch.request(reqPath);
          return Array.isArray(rows) ? rows : [];
        }
      }

      // 7a-vi. LIBRARY (books, loans, stats)
      if (path === 'library/books' || path.startsWith('library/books?') || path.startsWith('library/books/')) {
        if (method === 'GET') {
          const q = params.get('q') || '';
          const avail = params.get('available') || '';
          const qParts = [];
          if (q) qParts.push(`q=${encodeURIComponent(q)}`);
          if (avail) qParts.push(`available=${encodeURIComponent(avail)}`);
          const reqPath = qParts.length ? `library/books?${qParts.join('&')}` : 'library/books';
          const rows = await SupaFetch.request(reqPath);
          return Array.isArray(rows) ? rows : [];
        }
        return await SupaFetch.request(endpoint, method, body);
      }

      if (path === 'library/loans' || path.startsWith('library/loans?') || path.startsWith('library/loans/')) {
        if (method === 'GET') {
          const studentId = params.get('student_id') ? params.get('student_id').replace('eq.', '') : '';
          const reqPath = studentId ? `library/loans?student_id=${encodeURIComponent(studentId)}` : 'library/loans';
          const rows = await SupaFetch.request(reqPath);
          return Array.isArray(rows) ? rows : [];
        }
        return await SupaFetch.request(endpoint, method, body);
      }

      if (path === 'library/stats' || path.startsWith('library/stats?')) {
        return await SupaFetch.request('library/stats');
      }

      // 7a-vi-b. STUDY MATERIALS / CONTENT (from PostgreSQL content table)
      if (path === 'content' || path.startsWith('content?') || path.startsWith('content/')) {
        if (method === 'GET') {
          const uid = params.get('user_id') || loggedInUser?.id;
          const subjectId = params.get('subject_id') || '';
          const qParts = [];
          if (uid) qParts.push(`user_id=${encodeURIComponent(uid)}`);
          if (subjectId) qParts.push(`subject_id=${encodeURIComponent(subjectId)}`);
          const reqPath = qParts.length ? `content?${qParts.join('&')}` : 'content';
          const rows = await SupaFetch.request(reqPath);
          return Array.isArray(rows) ? rows : [];
        }
        return await SupaFetch.request(endpoint, method, body);
      }

      // 7a-vii. DOUBTS
      if (path === 'doubts' || path.startsWith('doubts?') || path.startsWith('doubts/')) {
        if (method === 'GET') {
          const studentId = params.get('student_id') ? params.get('student_id').replace('eq.', '') : '';
          const facultyId = params.get('assigned_faculty_id') ? params.get('assigned_faculty_id').replace('eq.', '') : '';
          const uid = params.get('user_id') || loggedInUser?.id;

          const qParts = [];
          if (studentId) qParts.push(`student_id=${encodeURIComponent(studentId)}`);
          else if (uid) qParts.push(`user_id=${encodeURIComponent(uid)}`);
          if (facultyId) qParts.push(`assigned_faculty_id=${encodeURIComponent(facultyId)}`);

          const reqPath = qParts.length ? `doubts?${qParts.join('&')}` : 'doubts';
          const rows = await SupaFetch.request(reqPath);
          return Array.isArray(rows) ? rows : [];
        }
        return await SupaFetch.request(endpoint, method, body);
      }

      // 7a-vii-b. FACULTY DOUBTS (assigned doubts)
      if (path === 'faculty/doubts' || path.startsWith('faculty/doubts?')) {
        if (method === 'GET') {
          const uid = params.get('user_id') || loggedInUser?.id;
          const reqPath = uid ? `faculty/doubts?user_id=${encodeURIComponent(uid)}` : 'faculty/doubts';
          const rows = await SupaFetch.request(reqPath);
          return Array.isArray(rows) ? rows : [];
        }
        return await SupaFetch.request(endpoint, method, body);
      }
      if (path === 'faculty/doubts/resolve') {
        return await SupaFetch.request('faculty/doubts/resolve', 'POST', body);
      }

      // 7a-viii. COURSES & ENROLLMENTS
      if (path === 'courses' || path.startsWith('courses?') || path.startsWith('courses/')) {
        if (method === 'GET') {
          const uid = params.get('user_id') || loggedInUser?.id;
          const studentId = params.get('student_id') ? params.get('student_id').replace('eq.', '') : '';
          const qParts = [];
          if (studentId) qParts.push(`student_id=${encodeURIComponent(studentId)}`);
          else if (uid) qParts.push(`user_id=${encodeURIComponent(uid)}`);

          const reqPath = qParts.length ? `courses?${qParts.join('&')}` : 'courses';
          const rows = await SupaFetch.request(reqPath);
          return Array.isArray(rows) ? rows : [];
        }
        return await SupaFetch.request(endpoint, method, body);
      }

      if (path === 'enrollments' || path.startsWith('enrollments?') || path.startsWith('enrollments/')) {
        if (method === 'GET') {
          const uid = params.get('user_id') || loggedInUser?.id;
          const studentId = params.get('student_id') ? params.get('student_id').replace('eq.', '') : '';
          const qParts = [];
          if (studentId) qParts.push(`student_id=${encodeURIComponent(studentId)}`);
          else if (uid) qParts.push(`user_id=${encodeURIComponent(uid)}`);

          const reqPath = qParts.length ? `enrollments?${qParts.join('&')}` : 'enrollments';
          const rows = await SupaFetch.request(reqPath);
          return Array.isArray(rows) ? rows : [];
        }
        return await SupaFetch.request(endpoint, method, body);
      }

      // 7b. DEPARTMENTS
      if (path === 'faculty/departments' || path === 'departments') {
        if (method === 'GET') {
          const rows = await SupaFetch.request('departments?select=*&order=name.asc');
          return rows.map(d => ({
            ...d,
            id: d.department_id,
            name: d.name,
            code: d.code,
          }));
        }
        if (method === 'POST') {
          if (!body.name || !body.code) throw { error: 'validation_error', message: 'Name and code are required.' };
          const created = await SupaFetch.request('departments', 'POST', {
            name: body.name,
            code: body.code,
          });
          const dept = Array.isArray(created) ? created[0] : created;
          return { ...dept, id: dept?.department_id };
        }
      }

      // 7b-ii. DEPARTMENT BY ID (PATCH / DELETE)
      const deptIdMatch = path.match(/^departments\/([^/]+)$/);
      if (deptIdMatch) {
        const deptUuid = deptIdMatch[1];
        if (method === 'PATCH' || method === 'PUT') {
          const patch = {};
          if (body.name !== undefined) patch.name = body.name;
          if (body.code !== undefined) patch.code = body.code;
          const row = await SupaFetch.request(`departments?department_id=eq.${deptUuid}`, 'PATCH', patch);
          const dept = Array.isArray(row) ? row[0] : row;
          return { ...dept, id: dept?.department_id };
        }
        if (method === 'DELETE') {
          await SupaFetch.request(`departments?department_id=eq.${deptUuid}`, 'DELETE');
          return null;
        }
      }

      // 7d. HOD MANAGEMENT (assign / list / remove Heads of Department)
      if (path === 'hod') {
        if (method === 'GET') {
          const rows = await SupaFetch.request('hod');
          return (Array.isArray(rows) ? rows : []).map(h => ({
            ...h,
            id: h.hod_id || h.id,
            department_id: h.department_id || h.department?.id || h.department?.department_id,
            department_name: h.department_name || h.department?.name || '—',
            email: h.email || h.user?.email || '',
            first_name: h.first_name || h.user?.first_name || '',
            last_name: h.last_name || h.user?.last_name || '',
            employee_id: h.employee_id || '',
            faculty_id: h.faculty_id || null,
          }));
        }
        if (method === 'POST') {
          const created = await SupaFetch.request('hod', 'POST', body);
          return Array.isArray(created) ? created[0] : created;
        }
      }

      // 7d-ii. HOD BY ID (DELETE — demote back to faculty), server-side.
      const hodIdMatch = path.match(/^hod\/([^/]+)$/);
      if (hodIdMatch && hodIdMatch[1] !== 'check' && hodIdMatch[1] !== 'leaves' && hodIdMatch[1] !== 'leave') {
        const hodUuid = hodIdMatch[1];
        if (method === 'DELETE') {
          await SupaFetch.request(`hod?hod_id=eq.${hodUuid}`, 'DELETE');
          return null;
        }
      }

      // 7c. SEMESTERS
      if (path === 'semesters') {
        const rows = await SupaFetch.request('semesters?select=*&order=number.asc');
        return rows.map(s => ({
          ...s,
          id: s.semester_id,
          name: `Semester ${s.number}`,
          number: s.number,
        }));
      }

      // 8. ALL COURSES / SUBJECTS
      if (path === 'courses') {
        const rows = await SupaFetch.request('subjects?select=*,faculty:faculty(*,user:users(*)),department:departments(*),semester:semesters(*),enrollments(student_id)');
        return rows.map(c => {
          const enrolledCount = c.enrollments ? c.enrollments.length : 0;
          return {
            ...c,
            id: c.subject_id,
            enrolled_count: enrolledCount,
            department_name: c.department?.name || '—',
            faculty_name: c.faculty
              ? `${c.faculty.first_name || ''} ${c.faculty.last_name || ''}`.trim() || '—'
              : '—',
            semester: c.semester?.number || '—',
            is_active: true
          };
        });
      }

      // 9. ENROLLMENTS
      if (path === 'enrollments' || path === 'courses/enrollments') {
        let courseUuid = params.get('course');
        if (courseUuid) {
          const rows = await SupaFetch.request(`enrollments?select=*,student:students(*),course:subjects(*)&subject_id=eq.${courseUuid}`);
          return rows.map(e => ({
            ...e,
            course: e.course?.subject_id,
            course_code: e.course?.code,
            course_name: e.course?.name,
            student: e.student?.student_id,
            student_name: e.student ? `${e.student.first_name || ''} ${e.student.last_name || ''}`.trim() : 'Student'
          }));
        } else {
          const studentRow = await SupaFetch.request(`students?user_id=eq.${loggedInUser.id}`);
          if (!studentRow || studentRow.length === 0) return [];
          const rows = await SupaFetch.request(`enrollments?select=*,course:subjects(*)&student_id=eq.${studentRow[0].student_id}`);
          return rows.map(e => {
            const cId = String(e.course?.subject_id || e.course?.id || e.course_id || e.subject_id || e.course || '');
            return {
              ...e,
              course: cId,
              course_id: cId,
              subject_id: cId,
              course_code: e.course?.code || e.course_code || '—',
              course_name: e.course?.name || e.course_name || '—'
            };
          });
        }
      }

      // 10. GRADES / MARKS
      if (path === 'grades/my_grades' || path === 'grades' || path === 'marks') {
        if (method === 'GET') {
          let studentUuid = params.get('student') || params.get('student_id');
          let courseUuid = params.get('course') || params.get('subject_id');
          const limit = params.get('limit') || 5000;
          if (!studentUuid && path === 'grades/my_grades') {
            if (!loggedInUser) return [];
            const studentRow = await SupaFetch.request(`students?select=student_id&user_id=eq.${loggedInUser?.id}`).catch(() => []);
            if (!studentRow || studentRow.length === 0) return [];
            studentUuid = studentRow[0].student_id;
          }
          let query = `marks?limit=${limit}`;
          if (studentUuid) query += `&student_id=${studentUuid}`;
          if (courseUuid) query += `&subject_id=${courseUuid}`;
          const rows = await SupaFetch.request(query);
          return (Array.isArray(rows) ? rows : []).map(r => ({
            ...r,
            id: r.mark_id || r.id,
            mark_id: r.mark_id || r.id,
            marks_obtained: parseFloat(r.marks_obtained ?? r.total_marks ?? 0),
            total_marks: parseFloat(r.total_marks ?? 100),
            percentage: r.percentage,
            grade: r.grade,
            gpa: r.gpa,
            course_name: r.course_name || r.subject_name || r.course?.name || '—',
            course_code: r.course_code || r.subject_code || r.course?.code || '—',
            student_name: r.student_name || (r.student ? `${r.student.first_name || ''} ${r.student.last_name || ''}`.trim() : '') || 'Student',
            enrollment_no: r.enrollment_no || r.student?.enrollment_no || '—',
            exam_type: r.exam_type || 'Semester End Exam',
            exam_date: r.exam_date || r.entered_at
          }));
        }
        if (method === 'POST') {
          // Grade + GPA are derived by Django on save — send raw marks only.
          const row = await SupaFetch.request('marks', 'POST', {
            student_id: body.student,
            subject_id: body.course,
            marks_obtained: body.marks_obtained,
            total_marks: body.total_marks || 100,
            entered_by: loggedInUser.id
          });
          return row;
        }
      }

      // BULK CSV IMPORT — parsed & matched server-side (rest_compat.handle_grades_bulk_import)
      if (path === 'grades/bulk-import' && method === 'POST') {
        return await SupaFetch.request('grades/bulk-import', 'POST', body);
      }

      // marks EDIT / DELETE
      if (path.startsWith('grades/')) {
        const gradeId = path.split('/')[1];
        if (method === 'PATCH' || method === 'PUT') {
          // Django recomputes grade + GPA from the raw marks.
          const row = await SupaFetch.request(`marks?mark_id=eq.${gradeId}`, 'PATCH', {
            marks_obtained: body.marks_obtained,
            total_marks: body.total_marks || 100
          });
          return row;
        }
        if (method === 'DELETE') {
          await SupaFetch.request(`marks?mark_id=eq.${gradeId}`, 'DELETE');
          return null;
        }
      }

      // 11. TIMETABLE
      if (path === 'timetable') {
        const apiDayMap = {
          'monday': 'monday', 'tuesday': 'tuesday', 'wednesday': 'wednesday',
          'thursday': 'thursday', 'friday': 'friday', 'saturday': 'saturday', 'sunday': 'sunday',
          'mon': 'monday', 'tue': 'tuesday', 'wed': 'wednesday',
          'thu': 'thursday', 'fri': 'friday', 'sat': 'saturday', 'sun': 'sunday'
        };

        if (method === 'GET') {
          const day = params.get('day');
          const facultyUuid = params.get('faculty');
          let query = 'timetable?select=*,course:subjects(*),faculty:faculty(*,user:users(*))';
          if (day) {
            const dbDay = apiDayMap[day.toLowerCase()] || day.toLowerCase();
            query += `&day_of_week=eq.${dbDay}`;
          }
          if (facultyUuid) query += `&faculty_id=eq.${facultyUuid}`;
          const rows = await SupaFetch.request(query);
          return rows.map(t => ({
            ...t,
            day: t.day_of_week?.toLowerCase() || 'monday',
            room: t.room_no || '—',
            course_name: t.course?.name || '—',
            course_code: t.course?.code || '—',
            faculty_name: t.faculty ? `${t.faculty.first_name} ${t.faculty.last_name}` : '—'
          }));
        } else {
          if (body && body.day_of_week) {
            body.day_of_week = apiDayMap[body.day_of_week.toLowerCase()] || body.day_of_week.toLowerCase();
          }
          const token = Auth.getToken();
          const useToken = (token && !token.startsWith('mock_')) ? token : SUPABASE_ANON;
          const headers = {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${useToken}`,
            'Prefer': 'return=representation'
          };
          const querySuffix = queryStr ? `?${queryStr}` : '';
          const response = await fetch(`${SUPABASE_URL}/rest/v1/timetable${querySuffix}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
          });
          if (response.status === 204) return null;
          const text = await response.text();
          return text ? JSON.parse(text) : null;
        }
      }

      // 12. ATTENDANCE STATS — computed server-side (rest_compat.handle_attendance_stats).
      if (path === 'attendance/stats') {
        const qp = new URLSearchParams();
        if (params.get('student')) qp.set('student', params.get('student'));
        if (params.get('course')) qp.set('course', params.get('course'));
        const suffix = qp.toString() ? `?${qp.toString()}` : '';
        return await SupaFetch.request(`attendance/stats${suffix}`);
      }
      
      if (path === 'attendance') {
        if (method === 'GET') {
          const studentUuid = params.get('student');
          const courseUuid = params.get('course');
          const date = params.get('date');
          const status = params.get('status');
          
          let query = 'attendance_records?select=*,course:subjects(*),student:students(*)';
          if (studentUuid) query += `&student_id=eq.${studentUuid}`;
          if (courseUuid) query += `&subject_id=eq.${courseUuid}`;
          if (date) query += `&date=eq.${date}`;
          if (status) {
            const uiToDbStatus = { 'present': 'present', 'absent': 'absent', 'late': 'late' };
            query += `&status=eq.${uiToDbStatus[status] || status}`;
          }
          
          const rows = await SupaFetch.request(query);
          const uniqueMarkerIds = [...new Set(rows.map(r => r?.marked_by).filter(Boolean))];
          let markerMap = {};
          if (uniqueMarkerIds.length > 0) {
            try {
              const facultyRows = await SupaFetch.request(`faculty?select=faculty_id,first_name,last_name&faculty_id=in.(${uniqueMarkerIds.join(',')})`);
              if (Array.isArray(facultyRows)) {
                facultyRows.forEach(f => {
                  markerMap[f.faculty_id] = `${f.first_name || ''} ${f.last_name || ''}`.trim();
                });
              }
            } catch (err) {}
          }

          return rows.map(r => {
            if (!r) return null;
            const studentName = r.student ? `${r.student.first_name || ''} ${r.student.last_name || ''}`.trim() : 'Student';
            const markedByName = markerMap[r.marked_by] || 'System';
            const dbToUiStatus = { 'P': 'present', 'A': 'absent', 'L': 'late', 'p': 'present', 'a': 'absent', 'l': 'late' };
            return {
              ...r,
              status: dbToUiStatus[r.status] || r.status || 'present',
              student_name: studentName,
              course_name: r.course?.name || '—',
              course_code: r.course?.code || '—',
              marked_by: markedByName
            };
          }).filter(Boolean);
        }
      }

      if (path === 'attendance/bulk-mark' && method === 'POST') {
        // Faculty resolution + status mapping happen server-side.
        return await SupaFetch.request('attendance/bulk-mark', 'POST', {
          marked_by: loggedInUser?.id,
          records: body.records,
        });
      }

      // 13. FEES — ADMIN / GENERAL LIST (or a single student's fees when scoped)
      if (path === 'admin/fees' || path === 'fee_payments') {
        // Honor a student_id/student filter — otherwise a student's dashboard would
        // sum every student's dues (the "Fees Due" card showed the whole college's total).
        const studentUuid = (params.get('student_id') || params.get('student') || '').replace('eq.', '');
        if (studentUuid) {
          const rows = await SupaFetch.request(`fee_payments?student_id=eq.${encodeURIComponent(studentUuid)}`);
          return Array.isArray(rows) ? rows : [];
        }
        const rows = await SupaFetch.request('admin/fees');
        return Array.isArray(rows) ? rows : [];
      }

      // 13a. FEES — mark a payment paid (server stamps date + txn ref)
      if (path.startsWith('fees/') && path.endsWith('/mark-paid') && method === 'POST') {
        const paymentId = path.split('/')[1];
        const row = await SupaFetch.request('fees/mark-paid', 'POST', {
          payment_id: paymentId,
          transaction_ref: body?.transaction_ref,
        });
        return Array.isArray(row) ? row[0] : row;
      }

      // 13b. FEES BY STUDENT
      if (path === 'fees' || path.startsWith('fees?')) {
        const studentUuid = params.get('student') || params.get('student_id');
        if (!studentUuid) {
          const rows = await SupaFetch.request('admin/fees');
          return Array.isArray(rows) ? rows : [];
        }
        const payments = await SupaFetch.request(`fees?student_id=${encodeURIComponent(studentUuid)}`);
        return Array.isArray(payments) ? payments : [];
      }

      // 14. NOTICES
      if (path === 'notices') {
        if (method === 'GET') {
          const audience = params.get('audience');
          let query = 'notices?select=*,author:users(*)&order=published_at.desc';
          if (audience) {
            if (audience === 'students') query += '&target_audience=in.(all,students)';
            else if (audience === 'faculty') query += '&target_audience=in.(all,faculty)';
            else query += `&target_audience=in.(all,${audience.toLowerCase()})`;
          }
          const rows = await SupaFetch.request(query);
          return rows.map(n => {
            let notice_type = 'general';
            const prio = (n.priority || '').toUpperCase();
            if (prio === 'URGENT') notice_type = 'urgent';
            else if (prio === 'HIGH') notice_type = 'exam';
            else if (prio === 'LOW') notice_type = 'holiday';
            
            let audienceVal = 'all';
            const aud = (n.target_audience || '').toLowerCase();
            if (aud === 'students') audienceVal = 'students';
            else if (aud === 'faculty') audienceVal = 'faculty';

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
          let role = (loggedInUser?.role || 'admin').toLowerCase();
          if (role === 'student') throw { error: 'unauthorized', message: 'Students not authorized.' };
          
          let dbAudience = 'all';
          if (body.audience === 'students') dbAudience = 'students';
          else if (body.audience === 'faculty') dbAudience = 'faculty';

          let dbPriority = 'NORMAL';
          if (body.notice_type === 'urgent') dbPriority = 'URGENT';
          else if (body.notice_type === 'exam') dbPriority = 'HIGH';
          else if (body.notice_type === 'holiday') dbPriority = 'LOW';

          let dbRole = role.toUpperCase();
          const row = await SupaFetch.request('notices', 'POST', {
            author_id: loggedInUser.id,
            author_role: dbRole,
            title: body.title,
            content: body.content,
            target_audience: dbAudience,
            // The backend derives the stored priority from `notice_type`; send it
            // explicitly so "urgent"/"exam"/etc. are preserved (previously only
            // `priority` was sent, so every notice fell back to general/normal).
            notice_type: body.notice_type,
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

      if (path.startsWith('notices/')) {
        const noticeUuid = path.split('/')[1];
        if (method === 'PATCH' || method === 'PUT') {
          const patchBody = {};
          if (body.title !== undefined) patchBody.title = body.title;
          if (body.content !== undefined) patchBody.content = body.content;
          if (body.audience !== undefined) {
            patchBody.target_audience = body.audience === 'students' ? 'students' : body.audience === 'faculty' ? 'faculty' : 'all';
          }
          if (body.notice_type !== undefined) {
            patchBody.priority = body.notice_type === 'urgent' ? 'URGENT' : body.notice_type === 'exam' ? 'HIGH' : body.notice_type === 'holiday' ? 'LOW' : 'NORMAL';
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

      // 15. COMPLAINTS
      if (path === 'complaints') {
        if (method === 'GET') {
          const qStr = queryStr || '';
          const reqUrl = `grievances?select=*,student:students(*,user:users(*))&order=submitted_at.desc${qStr ? '&' + qStr : ''}`;
          const rows = await SupaFetch.request(reqUrl);
          return (Array.isArray(rows) ? rows : []).map(c => ({
            ...c,
            created_at: c.submitted_at,
            department_id: c.department_id || c.student_department_id || c.student?.department_id || c.student?.department?.department_id || '',
            department_name: c.dept_name || c.department_name || c.student?.department_name || c.student?.department?.name || '—',
            student_name: c.is_anonymous ? 'Anonymous Student' : `${c.student?.first_name || ''} ${c.student?.last_name || ''}`.trim() || 'Student',
          }));
        }
        if (method === 'POST') {
          const studentRow = await SupaFetch.request(`students?user_id=eq.${loggedInUser.id}`);
          const row = await SupaFetch.request('grievances', 'POST', {
            student_id: studentRow[0].student_id,
            description: body.title ? `[${body.title}] ${body.description}` : body.description,
            category: body.category || 'other',
            is_anonymous: body.is_anonymous || false,
            status: 'OPEN'
          });
          return Array.isArray(row) ? row[0] : row;
        }
      }

      // 16. HOD CHECK (real HOD, or a deputy acting via delegation)
      if (path === 'hod/check') {
        // Primary HOD resolution happens server-side: the backend endpoint maps the
        // user (by id or email) to a department robustly. The old client-side lookup
        // queried `hod?user_id=eq.<numeric id>`, but hod.user_id holds UUIDs, so it
        // never matched and returned no department_id (all HOD dashboard cards read 0).
        const suffix = queryStr ? `?${queryStr}` : `?user_id=eq.${loggedInUser?.id || ''}`;
        const serverCheck = await SupaFetch.request(`hod/check${suffix}`).catch(() => null);
        if (serverCheck?.isHod && (serverCheck.department_id || serverCheck.hod?.department_id)) {
          return { viaDelegation: false, ...serverCheck };
        }
        // Fall back to a delegation (deputy HOD) grant.
        const acc = await SupaFetch.request(`hod/my-access?user_id=eq.${loggedInUser.id}`).catch(() => null);
        if (acc?.isDelegate) {
          return {
            isHod: true, viaDelegation: true, scopes: acc.scopes,
            department_id: acc.department_id, dept_name: acc.department_name,
            hod: { hod_id: acc.delegator_hod_id, department_id: acc.department_id, dept_name: acc.department_name, delegator_name: acc.delegator_name },
          };
        }
        return serverCheck || { isHod: false, hod: null };
      }

      // 17. FACULTY LEAVE
      if (path === 'faculty/leave') {
        const facultyRow = await SupaFetch.request(`faculty?user_id=eq.${loggedInUser.id}`);
        if (!facultyRow?.length) throw { error: 'not_found', message: 'Faculty not found.' };
        const facId = facultyRow[0].faculty_id;
        
        if (method === 'GET') {
          return await SupaFetch.request(`leave_requests?select=*&faculty_id=eq.${facId}&order=applied_at.desc`);
        }
        if (method === 'POST') {
          const approved = await SupaFetch.request(`leave_requests?select=*&faculty_id=eq.${facId}&status=eq.approved`);
          const fromDateVal = new Date(body.fromDate);
          const toDateVal = new Date(body.toDate);
          const overlap = approved.some(l => fromDateVal <= new Date(l.to_date) && toDateVal >= new Date(l.from_date));
          if (overlap) throw { error: 'validation_error', message: 'Dates overlap approved leaves.' };
          
          const row = await SupaFetch.request('leave_requests', 'POST', {
            faculty_id: facId,
            from_date: body.fromDate,
            to_date: body.toDate,
            leave_type: body.leaveType || 'casual',
            reason: body.reason || '',
            status: 'pending'
          });
          return Array.isArray(row) ? row[0] : row;
        }
      }

      // 18. HOD LEAVE MANAGEMENT (HOD, or a deputy with a 'leaves' delegation)
      if (path === 'hod/leaves') {
        const ctx = await resolveHodContext(loggedInUser.id, 'leaves');
        if (!ctx) throw { error: 'unauthorized', message: 'HOD access only.' };
        const faculty = await SupaFetch.request(`faculty?select=faculty_id&department_id=eq.${ctx.departmentId}`);
        if (!faculty?.length) return [];
        return await SupaFetch.request(`leave_requests?select=*,faculty:faculty(*)&faculty_id=in.(${faculty.map(f => f.faculty_id).join(',')})&order=applied_at.desc`);
      }

      if (path.startsWith('hod/leaves/')) {
        const parts = path.split('/');
        const leaveUuid = parts[2];
        const action = parts[3];
        const ctx = await resolveHodContext(loggedInUser.id, 'leaves');
        if (!ctx) throw { error: 'unauthorized', message: 'HOD only.' };
        const status = action === 'approve' ? 'approved' : 'rejected';
        const row = await SupaFetch.request(`leave_requests?leave_id=eq.${leaveUuid}`, 'PATCH', {
          status,
          approved_by_hod: ctx.hodId,
          decision_at: new Date().toISOString(),
          hod_remarks: body?.remarks || ''
        });
        return Array.isArray(row) ? row[0] : row;
      }

      // 19. STUDY MATERIALS / CONTENT
      if (path === 'content' || path === 'study_materials') {
        // CREATE (faculty upload) — Django persists it in campus.StudyMaterial.
        if (method === 'POST') {
          const created = await SupaFetch.request('content', 'POST', {
            subject_id:   body.subject_id || body.course,
            faculty_id:   body.faculty_id,
            content_type: body.content_type || 'notes',
            title:        body.title,
            description:  body.description || '',
            file_url:     body.file_url || '',
            video_url:    body.video_url || '',
            topic_tag:    body.topic_tag || 'General',
          });
          const row = Array.isArray(created) ? created[0] : created;
          return row ? { ...row, id: row.content_id } : row;
        }
        // DELETE — forward the ?content_id=eq.X filter straight through.
        if (method === 'DELETE') {
          const suffix = queryStr ? `?${queryStr}` : '';
          await SupaFetch.request(`content${suffix}`, 'DELETE');
          return null;
        }
        // GET (list) — honor optional subject_id / faculty_id filters from the query string.
        const suffix = queryStr ? `?${queryStr}` : '?is_active=eq.true&order=uploaded_at.desc';
        const rows = await SupaFetch.request(`content${suffix}`);
        return (rows || []).map(c => ({
          ...c,
          id: c.content_id,
          content_type: (c.content_type || 'notes').toLowerCase(),
          subject_code: c.subject_code || '—',
          subject_name: c.subject_name || '—',
          faculty_name: c.faculty_name || '—'
        }));
      }

      // 20. LECTURE INTERCHANGE (localStorage mock)
      if (path === 'faculty/interchange') {
        const facultyRow = await SupaFetch.request(`faculty?user_id=eq.${loggedInUser.id}`);
        if (!facultyRow?.length) throw { error: 'not_found', message: 'Faculty not found.' };
        const myFacId = facultyRow[0].faculty_id;

        if (method === 'GET') {
          const all = JSON.parse(localStorage.getItem('mock_interchange_requests') || '[]');
          // Return requests where I'm sender or receiver
          return all.filter(r => r.requester_faculty_id === myFacId || r.target_faculty_id === myFacId);
        }

        if (method === 'POST') {
          // Validate same-department constraint
          const targetFacultyRow = await SupaFetch.request(`faculty?faculty_id=eq.${body.target_faculty_id}`);
          if (!targetFacultyRow?.length) throw { error: 'not_found', message: 'Target faculty not found.' };
          if (facultyRow[0].department_id !== targetFacultyRow[0].department_id) {
            throw { error: 'department_mismatch', message: 'Lecture interchange is only allowed between faculty of the same department.' };
          }

          const all = JSON.parse(localStorage.getItem('mock_interchange_requests') || '[]');
          const newReq = {
            interchange_id: 'ic-' + Date.now(),
            requester_faculty_id: myFacId,
            requester_faculty_name: body.requester_faculty_name || `${facultyRow[0].first_name || ''} ${facultyRow[0].last_name || ''}`.trim(),
            target_faculty_id: body.target_faculty_id,
            target_faculty_name: body.target_faculty_name || '',
            requester_slot: body.requester_slot,   // { day, start_time, end_time, course_name, course_code, room, date }
            target_slot: body.target_slot,         // { day, start_time, end_time, course_name, course_code, room, date }
            reason: body.reason || '',
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          all.push(newReq);
          localStorage.setItem('mock_interchange_requests', JSON.stringify(all));
          return newReq;
        }
      }

      if (path.startsWith('faculty/interchange/')) {
        const parts = path.split('/');
        const interchangeId = parts[2];
        const action = parts[3]; // accept | reject

        const all = JSON.parse(localStorage.getItem('mock_interchange_requests') || '[]');
        const idx = all.findIndex(r => r.interchange_id === interchangeId);
        if (idx === -1) throw { error: 'not_found', message: 'Request not found.' };

        const req = all[idx];

        if (action === 'accept') {
          all[idx] = { ...req, status: 'accepted', updated_at: new Date().toISOString() };
          localStorage.setItem('mock_interchange_requests', JSON.stringify(all));

          // Auto-notify: create notice for students
          try {
            await SupaFetch.request('notices', 'POST', {
              author_id: loggedInUser.id,
              author_role: 'FACULTY',
              title: `Lecture Interchange: ${req.requester_slot?.course_name || 'Course'}`,
              content: `Dear Students,\n\nPlease note that there will be a lecture interchange on ${req.requester_slot?.date || 'the scheduled date'}.\n\n• ${req.requester_faculty_name}'s ${req.requester_slot?.course_name} lecture (${req.requester_slot?.start_time?.substring(0,5)} – ${req.requester_slot?.end_time?.substring(0,5)}) will be taken by ${req.target_faculty_name}.\n• ${req.target_faculty_name}'s ${req.target_slot?.course_name} lecture will be taken by ${req.requester_faculty_name}.\n\nKindly plan accordingly.`,
              target_audience: 'students',
              priority: 'NORMAL'
            });
          } catch (e) { /* notices are non-critical */ }

          // Auto-notify HOD via notice
          try {
            await SupaFetch.request('notices', 'POST', {
              author_id: loggedInUser.id,
              author_role: 'FACULTY',
              title: `Lecture Interchange Approved — ${req.requester_slot?.course_name}`,
              content: `For HOD Information:\n\n${req.requester_faculty_name} and ${req.target_faculty_name} have agreed to interchange their lectures on ${req.requester_slot?.date || 'the scheduled date'}.\n\nDetails:\n• ${req.requester_faculty_name}: ${req.requester_slot?.course_name} → ${req.requester_slot?.day} ${req.requester_slot?.start_time?.substring(0,5)}\n• ${req.target_faculty_name}: ${req.target_slot?.course_name} → ${req.target_slot?.day} ${req.target_slot?.start_time?.substring(0,5)}`,
              target_audience: 'faculty',
              priority: 'NORMAL'
            });
          } catch (e) { /* non-critical */ }

          return all[idx];
        }

        if (action === 'reject') {
          all[idx] = { ...req, status: 'rejected', reject_reason: body?.reason || '', updated_at: new Date().toISOString() };
          localStorage.setItem('mock_interchange_requests', JSON.stringify(all));
          return all[idx];
        }
      }

      // 20b. HOD LEAVE APPROVE / REJECT with auto-notification
      if (path.startsWith('hod/leaves/') && (path.endsWith('/approve') || path.endsWith('/reject'))) {
        const parts = path.split('/');
        const leaveUuid = parts[2];
        const action = parts[3];

        const hodRow = await SupaFetch.request(`hod?user_id=eq.${loggedInUser.id}`);
        if (!hodRow?.length) throw { error: 'unauthorized', message: 'HOD only.' };

        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        const row = await SupaFetch.request(`leave_requests?leave_id=eq.${leaveUuid}`, 'PATCH', {
          status: newStatus,
          approved_by_hod: hodRow[0].hod_id,
          decision_at: new Date().toISOString(),
          hod_remarks: body?.remarks || ''
        });

        if (action === 'approve') {
          // Fetch the leave request details
          const leaveDetails = await SupaFetch.request(`leave_requests?leave_id=eq.${leaveUuid}&select=*,faculty:faculty(*)`);
          const leave = leaveDetails?.[0];
          const facultyName = leave?.faculty ? `${leave.faculty.first_name || ''} ${leave.faculty.last_name || ''}`.trim() : 'Faculty';

          // Try to find substitute faculty from same department
          let substituteMsg = 'A substitute faculty from the same department will be assigned shortly.';
          let deptName = '';
          try {
            // Fetch department name for the notice
            const deptRow = await SupaFetch.request(`departments?department_id=eq.${hodRow[0].department_id}`);
            deptName = deptRow?.[0]?.name || '';

            const deptFaculty = await SupaFetch.request(`faculty?department_id=eq.${hodRow[0].department_id}&faculty_id=neq.${leave?.faculty_id}`);
            if (deptFaculty?.length) {
              const substitute = deptFaculty[0];
              const subName = `${substitute.first_name || ''} ${substitute.last_name || ''}`.trim();
              substituteMsg = `${subName} (${deptName || 'same department'}) has been assigned as substitute faculty for the affected lectures.`;
            }
          } catch (e) { /* non-critical */ }

          // Post student notice
          try {
            await SupaFetch.request('notices', 'POST', {
              author_id: loggedInUser.id,
              author_role: 'HOD',
              title: `Lecture Change: ${facultyName} on Leave`,
              content: `Dear Students,\n\nPlease be informed that ${facultyName} will be on leave from ${leave?.from_date || 'N/A'} to ${leave?.to_date || 'N/A'}.\n\n${substituteMsg}\n\nKindly check the updated timetable for any changes. Apologies for any inconvenience.`,
              target_audience: 'students',
              priority: 'HIGH'
            });
          } catch (e) { /* non-critical */ }
        }

        return Array.isArray(row) ? row[0] : row;
      }



      // Fallback
      const token = Auth.getToken();
      const useToken = (token && !token.startsWith('mock_')) ? token : SUPABASE_ANON;
      const headers = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${useToken}`
      };
      const querySuffix = queryStr ? `?${queryStr}` : '';
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}${querySuffix}`, { ...options, headers });
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
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

export const DataAPI = {
  content: {
    bySubject: (subjId)  => API.get(`content?select=*,subject:subjects(code,name),faculty:faculty(first_name,last_name)&subject_id=eq.${subjId}&is_active=eq.true&order=uploaded_at.desc`),
    byFaculty: (facId)   => API.get(`content?select=*,subject:subjects(code,name),faculty:faculty(first_name,last_name)&faculty_id=eq.${facId}&is_active=eq.true&order=uploaded_at.desc`),
    all:       ()        => API.get('content?select=*,subject:subjects(code,name),faculty:faculty(first_name,last_name)&is_active=eq.true&order=uploaded_at.desc'),
    add:       (data)    => API.post('content', data),
    delete:    (id)      => API.delete(`content?content_id=eq.${id}`),
  },

  doubts: {
    byStudent: (studId) => API.get(`doubts?student_id=eq.${studId}&order=submitted_at.desc`),
    byFaculty: (facId)  => API.get(`doubts?assigned_faculty_id=eq.${facId}&order=submitted_at.desc`),
    all:       ()       => API.get('doubts?order=submitted_at.desc'),
    add:       (data)   => API.post('doubts', data),
    resolve:   (id, res)=> API.patch(`doubts?doubt_id=eq.${id}`, { status: 'resolved', resolution: res, resolved_at: new Date().toISOString() }),
    acceptAI:  (id)     => API.patch(`doubts?doubt_id=eq.${id}`, { action: 'accept_ai' }),
    escalate:  (id)     => API.patch(`doubts?doubt_id=eq.${id}`, { action: 'escalate' }),
    retryAI:   (id)     => API.patch(`doubts?doubt_id=eq.${id}`, { action: 'ai_retry' }),
  },

  parent: {
    child: (userId) => API.get(`parents/child?user_id=eq.${userId}`),
  },

  users: {
    all:           ()          => API.get('users?limit=2000'),
    setActive:     (id, active) => API.patch(`users?id=eq.${id}`, { is_active: active }),
    setRole:       (id, role)  => API.patch(`users?id=eq.${id}`, { roles: role }),
    resetPassword: (id, pw)    => API.patch(`users?id=eq.${id}`, { new_password: pw }),
    remove:        (id)        => API.delete(`users?id=eq.${id}`),
  },

  exams: {
    all:       ()        => API.get('exams?order=date.asc'),
    byStudent: (studId)  => API.get(`exams?student_id=eq.${studId}&order=date.asc`),
    byFaculty: (facId)   => API.get(`exams?faculty_id=eq.${facId}&order=date.asc`),
    create:    (data)    => API.post('exams', data),
    update:    (id, d)   => API.patch(`exams?exam_id=eq.${id}`, d),
    remove:    (id)      => API.delete(`exams?exam_id=eq.${id}`),
    seatPlan:  (id)      => API.get(`exams/seat-plan?exam_id=${id}`),
  },

  backlogs: {
    byStudent: (studId) => API.get(`backlogs?student_id=eq.${studId}&order=status.asc`),
    all:       ()       => API.get('backlogs'),
    register:  (id, date) => API.patch(`backlogs?backlog_id=eq.${id}`, { action: 'register', reexam_date: date }),
    clear:     (id, marks) => API.patch(`backlogs?backlog_id=eq.${id}`, { action: 'clear', marks_obtained: marks }),
  },

  sendEmail: (data) => API.post('send-email', data),



  payments: {
    config:       ()        => API.get('payments/config'),
    createOrder:  (feeId)   => API.post('payments/create-order', { fee_id: feeId }),
    mockCheckout: (orderId, outcome = 'success', method = 'card') =>
      API.post('payments/mock-checkout', { order_id: orderId, outcome, method }),
    verify:       (data)    => API.post('payments/verify', data),
    history:      (studId)  => API.get(`payments?student_id=eq.${studId}&order=created_at.desc`),
  },

  delegation: {
    byDepartment: (deptId) => API.get(`hod/delegations?department_id=eq.${deptId}&order=start_date.desc`),
    myAccess:     (userId) => API.get(`hod/my-access?user_id=eq.${userId}`),
    create:       (data)   => API.post('hod/delegations', data),
    revoke:       (id)     => API.patch(`hod/delegations?delegation_id=eq.${id}`, { action: 'revoke' }),
    update:       (id, d)  => API.patch(`hod/delegations?delegation_id=eq.${id}`, d),
    remove:       (id)     => API.delete(`hod/delegations?delegation_id=eq.${id}`),
  },

  internships: {
    byStudent: (sid) => API.get(`internships?student_id=eq.${sid}&order=start_date.desc`),
    all:       ()    => API.get('internships?order=start_date.desc'),
    add:       (d)   => API.post('internships', d),
    update:    (id, d) => API.patch(`internships?internship_id=eq.${id}`, d),
    verify:    (id, status) => API.patch(`internships?internship_id=eq.${id}`, { verification: status }),
    remove:    (id)  => API.delete(`internships?internship_id=eq.${id}`),
  },

  achievements: {
    byStudent: (sid) => API.get(`achievements?student_id=eq.${sid}&order=date_awarded.desc`),
    all:       ()    => API.get('achievements?order=date_awarded.desc'),
    add:       (d)   => API.post('achievements', d),
    update:    (id, d) => API.patch(`achievements?achievement_id=eq.${id}`, d),
    verify:    (id, status) => API.patch(`achievements?achievement_id=eq.${id}`, { verification: status }),
    remove:    (id)  => API.delete(`achievements?achievement_id=eq.${id}`),
  },

  library: {
    books:       (q = '') => API.get(`library/books${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    available:   (q = '') => API.get(`library/books?available=eq.true${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    addBook:     (data)   => API.post('library/books', data),
    updateBook:  (id, d)  => API.patch(`library/books?book_id=eq.${id}`, d),
    removeBook:  (id)     => API.delete(`library/books?book_id=eq.${id}`),
    loans:       ()       => API.get('library/loans?order=issued_at.desc'),
    loansByStudent: (sid) => API.get(`library/loans?student_id=eq.${sid}&order=issued_at.desc`),
    issue:       (data)   => API.post('library/loans', data),
    returnBook:  (id, paid = true) => API.patch(`library/loans?loan_id=eq.${id}`, { action: 'return', fine_paid: paid }),
    markFinePaid:(id)     => API.patch(`library/loans?loan_id=eq.${id}`, { fine_paid: true }),
    removeLoan:  (id)     => API.delete(`library/loans?loan_id=eq.${id}`),
    stats:       ()       => API.get('library/stats'),
  },

  companies: {
    all: () => API.get('placement_companies?is_active=eq.true'),
  },

  placement: {
    forStudent: (studId) => API.get(`placement_scores?student_id=eq.${studId}`),
    all:        ()       => API.get('placement_scores?order=total_score.desc'),
  },



  wellness: {
    history: (studId, limit = 12) => API.get(`wellness_records?student_id=eq.${studId}&order=assessment_date.desc&limit=${limit}`),
    submit:  (data)               => API.post('wellness_records', data),
  },

  leave: {
    byFaculty: (facId) => API.get(`leave_requests?faculty_id=eq.${facId}&order=applied_at.desc`),
    pending:   ()      => API.get('leave_requests?status=eq.pending&order=applied_at.asc'),
    apply:     (data)  => API.post('leave_requests', data),
  },

  lectureChanges: {
    upcoming: () => API.get('lecture_changes?order=change_date.asc'),
  },

  interchange: {
    myRequests: () => API.get('faculty/interchange'),
    send: (data) => API.post('faculty/interchange', data),
    accept: (id) => API.post(`faculty/interchange/${id}/accept`, {}),
    reject: (id, reason) => API.post(`faculty/interchange/${id}/reject`, { reason }),
  },


  notifications: {
    forUser:  (uId, limit = 20) => API.get(`notifications?recipient_id=eq.${uId}&order=sent_at.desc&limit=${limit}`),
    unread:   (uId)             => API.get(`notifications?recipient_id=eq.${uId}&is_read=eq.false&order=sent_at.desc`),
    markRead: (id)              => API.patch(`notifications?notification_id=eq.${id}`, { is_read: true }),
  },



  audit: {
    log: (actId, act, type, entId) =>
      API.post('audit_logs', { actor_id: actId, action: act, entity_type: type, entity_id: entId, ip_address: '127.0.0.1' }),
  },
};

export const Utils = {
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
  getStatusBadgeClass(status) {
    const s = (status || '').toLowerCase();
    const cleanStatus = s === 'p' ? 'present' : s === 'a' ? 'absent' : s === 'l' ? 'late' : s === 'e' ? 'excused' : s;
    const map = {
      active: 'success', inactive: 'muted', graduated: 'info',
      paid: 'success', pending: 'warning', overdue: 'danger', partial: 'info', waived: 'muted',
      present: 'success', absent: 'danger', late: 'warning', excused: 'info',
      approved: 'success', rejected: 'danger',
      ai_answered: 'primary', under_review: 'info', open: 'warning',
      resolved: 'success', escalated: 'danger'
    };
    return `badge badge-${map[cleanStatus] || 'muted'}`;
  },
  getGradeBadgeClass(grade) {
    const map = {
      // Standard
      'O': 'success', 'A+': 'success', 'A': 'info', 'B+': 'info', 'B': 'primary', 'C': 'warning', 'D': 'warning', 'F': 'danger',
      // Indian grading system
      'AA': 'success', 'AB': 'info', 'BB': 'primary', 'BC': 'primary', 'CC': 'warning', 'CD': 'warning', 'DD': 'muted'
    };
    return `badge badge-${map[grade] || 'muted'}`;
  }
};

export const SupaAPI = DataAPI;

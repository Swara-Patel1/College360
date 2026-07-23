// Data API — now served by the Django DRF backend (backend/),
// which exposes all data via REST endpoints on port 8000.
export const SUPABASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const SUPABASE_ANON = 'local-django'; // kept for header compatibility

export const Auth = {
  getToken: () => localStorage.getItem('access_token'),
  getUser: () => JSON.parse(localStorage.getItem('user') || 'null'),
  isLoggedIn: () => !!localStorage.getItem('access_token'),
};

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

        // Call Django DRF login endpoint
        const res = await fetch(`${SUPABASE_URL}/api/auth/login/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailInput, password }),
        });
        const loginData = await res.json();
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

      // 2. ADMIN DASHBOARD STATS
      if (path === 'auth/dashboard/stats' || path === 'admin/stats') {
        const safeReq = async (q) => {
          try {
            const r = await SupaFetch.request(q);
            return Array.isArray(r) ? r : [];
          } catch (e) {
            console.warn('Stats query failed:', q, e);
            return [];
          }
        };

        const students   = await safeReq('students?select=student_id');
        const faculty    = await safeReq('faculty?select=faculty_id');
        const hods       = await safeReq('hod?select=hod_id');
        const subjects   = await safeReq('subjects?select=subject_id');
        const feePayments = await safeReq('fee_payments?select=student_id,amount_paid,status');
        const users      = await safeReq('users?select=id,is_active');

        const paidFees    = feePayments.filter(f => f.status === 'paid').reduce((a, c) => a + parseFloat(c.amount_paid || c.amount || 0), 0);
        const pendingFees = feePayments.filter(f => f.status !== 'paid').reduce((a, c) => a + parseFloat(c.amount || c.amount_paid || 0), 0);
        const paidIds     = new Set(feePayments.filter(f => f.status === 'paid').map(f => f.student_id));
        const feesDue     = students.filter(s => !paidIds.has(s.student_id)).length;
        const activeU     = users.filter(u => u.is_active !== false).length;
        const inactiveU   = users.filter(u => u.is_active === false).length;

        return {
          total_students:        students.length,
          active_users:          activeU,
          inactive_users:        inactiveU,
          total_faculty:         faculty.length,
          total_hod:             hods.length,
          total_courses:         subjects.length,
          total_fees_collected:  paidFees,
          total_fees_pending:    pendingFees,
          fees_pending_students: feesDue,
        };
      }

      // 3. STUDENT PROFILE
      if (path === 'students/my_profile') {
        const cached = localStorage.getItem('student_profile');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.semester && parsed.year_of_study) {
            // Refresh in background
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
        const s = rows[0];
        const result = {
          ...s,
          id: s.student_id || s.id,
          student_id: s.enrollment_no || s.student_id,
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
          const rows = await SupaFetch.request('students?select=*,user:users(*),department:departments(*),current_semester:semesters(*)&order=enrollment_no.asc');
          return rows.map(s => ({
            ...s,
            id: s.student_id || s.id,
            student_id: s.enrollment_no || s.student_id,
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
            status: s.status || (s.user?.is_active === false ? 'inactive' : 'active')
          }));
        }
        if (method === 'POST') {
          const username = body.username || (body.email ? body.email.split('@')[0] : `std_${Math.floor(100000 + Math.random() * 900000)}`);
          const passwordHash = body.password || 'student123';
          // is_active is false for both inactive and graduated students
          const is_active = body.status !== 'inactive' && body.status !== 'graduated';
          
          // Production users table: email, password_hash, roles, is_active (NO username column)
          const newUser = await SupaFetch.request('users', 'POST', {
            email: body.email || `${username}@student.college.edu`,
            password_hash: passwordHash,
            roles: 'student',
            is_active: is_active
          });
          const createdUser = Array.isArray(newUser) ? newUser[0] : newUser;
          
          const enrollmentNo = body.student_id || body.roll_number || `ENR${Math.floor(100000 + Math.random() * 900000)}`;
          // Use provided semester UUID directly; only fall back if truly absent (not empty string)
          const currentSemesterId = (body.current_semester_id && body.current_semester_id.trim())
            ? body.current_semester_id
            : (body.semester ? `e0000000-0000-0000-0000-00000000000${body.semester}` : null);
          
          const studentPayload = {
            user_id: createdUser.id,
            enrollment_no: enrollmentNo,
            first_name: body.first_name || username,
            last_name: body.last_name || '',
            date_of_birth: body.date_of_birth || '2005-01-01',
            parent_email: body.parent_email || 'parent@college.edu',
            parent_phone: body.parent_phone || '',
            department_id: body.department_id || 'd0000000-0000-0000-0000-000000000001',
            current_rollno: body.roll_number || body.current_rollno || '',
            status: body.status || 'active',
          };
          // Only include current_semester_id if we have a valid UUID
          if (currentSemesterId) studentPayload.current_semester_id = currentSemesterId;
          const newStudent = await SupaFetch.request('students', 'POST', studentPayload);
          const createdStudent = Array.isArray(newStudent) ? newStudent[0] : newStudent;
          
          if (createdStudent && createdStudent.student_id) {
            const subjects = await SupaFetch.request(`subjects?department_id=eq.${createdStudent.department_id}&semester_id=eq.${createdStudent.current_semester_id}`);
            if (subjects && subjects.length > 0) {
              const enrollmentPayload = subjects.map(sub => ({
                student_id: createdStudent.student_id,
                subject_id: sub.subject_id,
                semester_id: createdStudent.current_semester_id
              }));
              await SupaFetch.request('enrollments', 'POST', enrollmentPayload).catch(() => {});
            }
          }
          return createdStudent;
        }
      }

      // 6. STUDENT EDIT / DELETE
      if (path.startsWith('students/')) {
        const studentUuid = path.split('/')[1];
        if (method === 'PATCH' || method === 'PUT') {
          const updateBody = { ...body };
          if (updateBody.semester !== undefined) {
            updateBody.current_semester_id = `e0000000-0000-0000-0000-00000000000${updateBody.semester}`;
            delete updateBody.semester;
          }
          if (updateBody.year_of_study !== undefined) delete updateBody.year_of_study;
          
          let is_active = undefined;
          if (updateBody.status !== undefined) {
            is_active = updateBody.status === 'active';
            delete updateBody.status;
          }
          
          if (updateBody.roll_number !== undefined) {
            updateBody.current_rollno = updateBody.roll_number;
            delete updateBody.roll_number;
          }
          if (updateBody.email !== undefined || updateBody.phone !== undefined || is_active !== undefined) {
            const stRows = await SupaFetch.request(`students?select=user_id&student_id=eq.${studentUuid}`);
            if (stRows && stRows.length) {
              const uId = stRows[0].user_id;
              const userUpdate = {};
              if (updateBody.email !== undefined) userUpdate.email = updateBody.email;
              if (is_active !== undefined) userUpdate.is_active = is_active;
              if (Object.keys(userUpdate).length > 0) {
                await SupaFetch.request(`users?id=eq.${uId}`, 'PATCH', userUpdate);
              }
            }
            delete updateBody.email;
            delete updateBody.phone;
          }
          const row = await SupaFetch.request(`students?student_id=eq.${studentUuid}`, 'PATCH', updateBody);
          const updatedStudent = Array.isArray(row) ? row[0] : row;

          if (updatedStudent && updatedStudent.student_id) {
            const subjects = await SupaFetch.request(`subjects?department_id=eq.${updatedStudent.department_id}&semester_id=eq.${updatedStudent.current_semester_id}`);
            if (subjects && subjects.length > 0) {
              const enrollmentPayload = subjects.map(sub => ({
                student_id: updatedStudent.student_id,
                subject_id: sub.subject_id,
                semester_id: updatedStudent.current_semester_id
              }));
              await SupaFetch.request('enrollments', 'POST', enrollmentPayload).catch(() => {});
            }
          }
          return updatedStudent;
        }
        if (method === 'DELETE') {
          const student = await SupaFetch.request(`students?student_id=eq.${studentUuid}`);
          if (student && student.length > 0) {
            await SupaFetch.request(`users?id=eq.${student[0].user_id}`, 'DELETE');
          }
          return null;
        }
      }

      // 7. ALL FACULTY LIST / CRUD
      if (path === 'faculty') {
        if (method === 'GET') {
          const rows = await SupaFetch.request('faculty?select=*,user:users(*),department:departments(*)&order=employee_id.asc');
          return rows.map(f => ({
            ...f,
            id: f.faculty_id,
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
          const username = body.username || (body.email ? body.email.split('@')[0] : `fac_${Math.floor(100000 + Math.random() * 900000)}`);
          const passwordHash = body.password || 'faculty123';
          const is_active = body.status !== 'inactive';
          // Production users table: email, password_hash, roles, is_active (NO username column)
          const newUser = await SupaFetch.request('users', 'POST', {
            email: body.email || `${username}@college.edu`,
            password_hash: passwordHash,
            roles: body.role === 'hod' ? 'hod' : 'faculty',
            is_active
          });
          const createdUser = Array.isArray(newUser) ? newUser[0] : newUser;
          const empId = body.employee_id || `F${Math.floor(100 + Math.random() * 900)}`;
          const newFaculty = await SupaFetch.request('faculty', 'POST', {
            user_id: createdUser.id,
            employee_id: empId,
            first_name: body.first_name || username,
            last_name: body.last_name || '',
            department_id: body.department_id || 'd0000000-0000-0000-0000-000000000001',
          });
          return Array.isArray(newFaculty) ? newFaculty[0] : newFaculty;
        }
      }

      // 7a. FACULTY BY ID (PATCH / DELETE)
      const facultyIdMatch = path.match(/^faculty\/([^/]+)$/);
      if (facultyIdMatch) {
        const facultyUuid = facultyIdMatch[1];
        if (method === 'PATCH' || method === 'PUT') {
          const updateBody = { ...body };
          const facultyUpdate = {};
          if (updateBody.first_name !== undefined) facultyUpdate.first_name = updateBody.first_name;
          if (updateBody.last_name  !== undefined) facultyUpdate.last_name  = updateBody.last_name;
          if (updateBody.department_id !== undefined) facultyUpdate.department_id = updateBody.department_id;
          if (updateBody.employee_id !== undefined) facultyUpdate.employee_id = updateBody.employee_id;
          if (Object.keys(facultyUpdate).length) {
            await SupaFetch.request(`faculty?faculty_id=eq.${facultyUuid}`, 'PATCH', facultyUpdate);
          }
          if (updateBody.status !== undefined || updateBody.email !== undefined) {
            const fRow = await SupaFetch.request(`faculty?select=user_id&faculty_id=eq.${facultyUuid}`);
            if (fRow && fRow.length > 0) {
              const userUpdate = {};
              if (updateBody.status !== undefined) userUpdate.is_active = updateBody.status !== 'inactive';
              if (updateBody.email   !== undefined) userUpdate.email = updateBody.email;
              await SupaFetch.request(`users?id=eq.${fRow[0].user_id}`, 'PATCH', userUpdate);
            }
          }
          return { success: true };
        }
        if (method === 'DELETE') {
          const fRow = await SupaFetch.request(`faculty?select=user_id&faculty_id=eq.${facultyUuid}`);
          await SupaFetch.request(`faculty?faculty_id=eq.${facultyUuid}`, 'DELETE');
          if (fRow && fRow.length > 0) {
            await SupaFetch.request(`users?id=eq.${fRow[0].user_id}`, 'DELETE').catch(() => {});
          }
          return null;
        }
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
          const rows = await SupaFetch.request('hod?select=*,user:users(*),department:departments!hod_department_id_fkey(*)');
          // HOD names live in the faculty table, keyed by user_id
          const userIds = (rows || []).map(h => h.user_id).filter(Boolean);
          let facMap = {};
          if (userIds.length) {
            const facs = await SupaFetch.request(`faculty?select=user_id,faculty_id,first_name,last_name,employee_id&user_id=in.(${userIds.join(',')})`);
            (facs || []).forEach(f => { facMap[f.user_id] = f; });
          }
          return (rows || []).map(h => {
            const fac = facMap[h.user_id] || {};
            return {
              ...h,
              id: h.hod_id,
              department_id: h.department_id,
              department_name: h.department?.name || '—',
              email: h.user?.email || '',
              first_name: fac.first_name || h.user?.email?.split('@')[0] || '',
              last_name: fac.last_name || '',
              employee_id: fac.employee_id || '',
              faculty_id: fac.faculty_id || null,
            };
          });
        }
        if (method === 'POST') {
          // body: { faculty_id, department_id } — promote an existing faculty member to HOD
          if (!body.faculty_id || !body.department_id) {
            throw { error: 'validation_error', message: 'Faculty and department are required.' };
          }
          const facRow = await SupaFetch.request(`faculty?select=user_id&faculty_id=eq.${body.faculty_id}`);
          if (!facRow || !facRow.length) throw { error: 'not_found', message: 'Faculty not found.' };
          const userId = facRow[0].user_id;

          // Clear any existing HOD on this department (department_id is UNIQUE)
          const existingByDept = await SupaFetch.request(`hod?select=hod_id,user_id&department_id=eq.${body.department_id}`);
          for (const ex of (existingByDept || [])) {
            await SupaFetch.request(`departments?department_id=eq.${body.department_id}`, 'PATCH', { hod_id: null }).catch(() => {});
            await SupaFetch.request(`hod?hod_id=eq.${ex.hod_id}`, 'DELETE').catch(() => {});
            await SupaFetch.request(`users?id=eq.${ex.user_id}`, 'PATCH', { roles: 'faculty' }).catch(() => {});
          }
          // Clear any existing HOD row for this user (user_id is UNIQUE)
          const existingByUser = await SupaFetch.request(`hod?select=hod_id,department_id&user_id=eq.${userId}`);
          for (const ex of (existingByUser || [])) {
            await SupaFetch.request(`departments?department_id=eq.${ex.department_id}`, 'PATCH', { hod_id: null }).catch(() => {});
            await SupaFetch.request(`hod?hod_id=eq.${ex.hod_id}`, 'DELETE').catch(() => {});
          }

          const created = await SupaFetch.request('hod', 'POST', {
            user_id: userId,
            department_id: body.department_id,
          });
          const hodRow = Array.isArray(created) ? created[0] : created;
          await SupaFetch.request(`users?id=eq.${userId}`, 'PATCH', { roles: 'hod' }).catch(() => {});
          if (hodRow?.hod_id) {
            await SupaFetch.request(`departments?department_id=eq.${body.department_id}`, 'PATCH', { hod_id: hodRow.hod_id }).catch(() => {});
          }
          return hodRow;
        }
      }

      // 7d-ii. HOD BY ID (DELETE — demote back to faculty)
      const hodIdMatch = path.match(/^hod\/([^/]+)$/);
      if (hodIdMatch && hodIdMatch[1] !== 'check' && hodIdMatch[1] !== 'leaves' && hodIdMatch[1] !== 'leave') {
        const hodUuid = hodIdMatch[1];
        if (method === 'DELETE') {
          const hRow = await SupaFetch.request(`hod?select=user_id,department_id&hod_id=eq.${hodUuid}`);
          if (hRow && hRow.length) {
            await SupaFetch.request(`departments?department_id=eq.${hRow[0].department_id}`, 'PATCH', { hod_id: null }).catch(() => {});
          }
          await SupaFetch.request(`hod?hod_id=eq.${hodUuid}`, 'DELETE');
          if (hRow && hRow.length) {
            await SupaFetch.request(`users?id=eq.${hRow[0].user_id}`, 'PATCH', { roles: 'faculty' }).catch(() => {});
          }
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
      if (path === 'grades/my_grades' || path === 'grades') {
        if (method === 'GET') {
          let studentUuid = params.get('student');
          let courseUuid = params.get('course');
          if (!studentUuid && path === 'grades/my_grades') {
            const studentRow = await SupaFetch.request(`students?select=student_id&user_id=eq.${loggedInUser.id}`);
            if (!studentRow || studentRow.length === 0) return [];
            studentUuid = studentRow[0].student_id;
          }
          let query = 'marks?select=*,course:subjects(*),student:students(*)';
          if (studentUuid) query += `&student_id=eq.${studentUuid}`;
          if (courseUuid) query += `&subject_id=eq.${courseUuid}`;
          const rows = await SupaFetch.request(query);
          return rows.map(r => {
            const internal = parseFloat(r.internal_marks || 0);
            const external = parseFloat(r.external_marks || 0);
            const obtained = parseFloat(r.total_marks || (internal + external) || 0);
            const maxMarks = obtained > 100 ? 150 : 100;
            const percentage = Math.round((obtained / maxMarks) * 100);
            const studentName = r.student ? `${r.student.first_name || ''} ${r.student.last_name || ''}`.trim() : 'Student';
            
            // Use DB grade as-is (Indian system: O, AA, AB, BB, BC, CC, CD, DD, F)
            // Only recompute if the DB grade field is empty
            let displayGrade = r.grade || '';
            if (!displayGrade) {
              if (percentage >= 90) displayGrade = 'O';
              else if (percentage >= 80) displayGrade = 'AA';
              else if (percentage >= 70) displayGrade = 'AB';
              else if (percentage >= 60) displayGrade = 'BB';
              else if (percentage >= 55) displayGrade = 'BC';
              else if (percentage >= 50) displayGrade = 'CC';
              else if (percentage >= 45) displayGrade = 'CD';
              else if (percentage >= 40) displayGrade = 'DD';
              else displayGrade = 'F';
            }

            return {
              ...r,
              id: r.mark_id,
              marks_obtained: obtained,
              total_marks: maxMarks,
              percentage: percentage,
              grade: displayGrade,
              course_name: r.course?.name || '—',
              course_code: r.course?.code || '—',
              student_name: studentName,
              exam_type: 'Semester End Exam',
              exam_date: r.entered_at
            };
          });
        }
        if (method === 'POST') {
          const percentage = Math.round((body.marks_obtained / body.total_marks) * 100);
          let computedGrade = 'F';
          let gpa = 0.0;
          if (percentage >= 90) { computedGrade = 'O'; gpa = 10.0; }
          else if (percentage >= 85) { computedGrade = 'A+'; gpa = 9.0; }
          else if (percentage >= 75) { computedGrade = 'A'; gpa = 8.0; }
          else if (percentage >= 65) { computedGrade = 'B+'; gpa = 7.0; }
          else if (percentage >= 55) { computedGrade = 'B'; gpa = 6.0; }
          else if (percentage >= 45) { computedGrade = 'C'; gpa = 5.0; }
          else if (percentage >= 35) { computedGrade = 'D'; gpa = 4.0; }
          
          const activeSem = 'e0000000-0000-0000-0000-000000000005';
          
          const row = await SupaFetch.request('marks', 'POST', {
            student_id: body.student,
            subject_id: body.course,
            semester_id: activeSem,
            internal_marks: body.marks_obtained * 0.4,
            external_marks: body.marks_obtained * 0.6,
            total_marks: body.marks_obtained,
            grade: computedGrade,
            gpa: gpa,
            entered_by: loggedInUser.id
          });
          return row;
        }
      }

      // marks EDIT / DELETE
      if (path.startsWith('grades/')) {
        const gradeId = path.split('/')[1];
        if (method === 'PATCH' || method === 'PUT') {
          const percentage = Math.round((body.marks_obtained / body.total_marks) * 100);
          let computedGrade = 'F';
          let gpa = 0.0;
          if (percentage >= 90) { computedGrade = 'O'; gpa = 10.0; }
          else if (percentage >= 85) { computedGrade = 'A+'; gpa = 9.0; }
          else if (percentage >= 75) { computedGrade = 'A'; gpa = 8.0; }
          else if (percentage >= 65) { computedGrade = 'B+'; gpa = 7.0; }
          else if (percentage >= 55) { computedGrade = 'B'; gpa = 6.0; }
          else if (percentage >= 45) { computedGrade = 'C'; gpa = 5.0; }
          else if (percentage >= 35) { computedGrade = 'D'; gpa = 4.0; }

          const row = await SupaFetch.request(`marks?mark_id=eq.${gradeId}`, 'PATCH', {
            student_id: body.student,
            subject_id: body.course,
            internal_marks: body.marks_obtained * 0.4,
            external_marks: body.marks_obtained * 0.6,
            total_marks: body.marks_obtained,
            grade: computedGrade,
            gpa: gpa
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

      // 12. ATTENDANCE STATS
      if (path === 'attendance/stats') {
        const studentUuid = params.get('student');
        const subjectUuid = params.get('course');
        const date = params.get('date');
        let query = 'attendance_records?select=*';
        if (studentUuid) query += `&student_id=eq.${studentUuid}`;
        if (subjectUuid) query += `&subject_id=eq.${subjectUuid}`;
        if (date) query += `&date=eq.${date}`;
        const records = await SupaFetch.request(query);
        
        const present = records.filter(r => r.status === 'present' || r.status === 'P' || r.status === 'p').length;
        const absent  = records.filter(r => r.status === 'absent' || r.status === 'A' || r.status === 'a').length;
        const late    = records.filter(r => r.status === 'late' || r.status === 'L' || r.status === 'l').length;
        const excused = records.filter(r => r.status === 'excused' || r.status === 'E' || r.status === 'e').length;
        const total   = records.length;
        const totalEligible = total || 1;
        
        const attended = present + late;
        const percentage = ((attended / totalEligible) * 100).toFixed(1);

        return { total, present, absent, late, excused, percentage };
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
        let facultyId = null;
        if (loggedInUser?.id) {
          const facultyRow = await SupaFetch.request(`faculty?select=faculty_id&user_id=eq.${loggedInUser.id}`);
          if (facultyRow && facultyRow.length > 0) facultyId = facultyRow[0].faculty_id;
        }

        const uiToDbStatus = { 'present': 'present', 'absent': 'absent', 'late': 'late' };
        const payload = body.records.map(r => ({
          student_id: r.student,
          subject_id: r.course,
          date: r.date,
          status: uiToDbStatus[r.status] || r.status || 'present',
          marked_by: facultyId,
          ip_address: '127.0.0.1'
        }));
        return await SupaFetch.request('attendance_records', 'POST', payload);
      }

      // 13. FEES — ADMIN (all payments across students)
      if (path === 'admin/fees') {
        const payments = await SupaFetch.request('fee_payments?select=*,student:students(*,department:departments(*)),fee_structures(*)');
        return (payments || []).map(p => ({
          ...p,
          id: p.payment_id,
          student_name: p.student ? `${p.student.first_name || ''} ${p.student.last_name || ''}`.trim() || '—' : '—',
          enrollment_no: p.student?.enrollment_no || '—',
          department_name: p.student?.department?.name || '—',
          component_name: p.fee_structures?.component_name || 'Tuition Fee',
          amount: parseFloat(p.fee_structures?.amount ?? p.amount_paid ?? 0),
          amount_paid: parseFloat(p.amount_paid || 0),
          due_date: p.fee_structures?.due_date || '',
          status: p.status || 'pending',
          transaction_ref: p.transaction_ref || '',
        }));
      }

      // 13a. FEES — mark a payment paid (admin action)
      if (path.startsWith('fees/') && path.endsWith('/mark-paid') && method === 'POST') {
        const paymentId = path.split('/')[1];
        const row = await SupaFetch.request(`fee_payments?payment_id=eq.${paymentId}`, 'PATCH', {
          status: 'paid',
          payment_date: new Date().toISOString().split('T')[0],
          transaction_ref: body?.transaction_ref || ('TXN' + Date.now()),
        });
        return Array.isArray(row) ? row[0] : row;
      }

      // 13. FEES
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
          const rows = await SupaFetch.request('grievances?select=*,student:students(*,user:users(*))&order=submitted_at.desc');
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
            description: body.title ? `[${body.title}] ${body.description}` : body.description,
            category: body.category || 'other',
            is_anonymous: body.is_anonymous || false,
            status: 'OPEN'
          });
          return Array.isArray(row) ? row[0] : row;
        }
      }

      // 16. HOD CHECK
      if (path === 'hod/check') {
        const hodRow = await SupaFetch.request(`hod?user_id=eq.${loggedInUser.id}`);
        return { isHod: !!hodRow?.length, hod: hodRow?.[0] || null };
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

      // 18. HOD LEAVE MANAGEMENT
      if (path === 'hod/leaves') {
        const hodRow = await SupaFetch.request(`hod?user_id=eq.${loggedInUser.id}`);
        if (!hodRow?.length) throw { error: 'unauthorized', message: 'HOD access only.' };
        const faculty = await SupaFetch.request(`faculty?select=faculty_id&department_id=eq.${hodRow[0].department_id}`);
        if (!faculty?.length) return [];
        return await SupaFetch.request(`leave_requests?select=*,faculty:faculty(*)&faculty_id=in.(${faculty.map(f => f.faculty_id).join(',')})&order=applied_at.desc`);
      }

      if (path.startsWith('hod/leaves/')) {
        const parts = path.split('/');
        const leaveUuid = parts[2];
        const action = parts[3];
        const hodRow = await SupaFetch.request(`hod?user_id=eq.${loggedInUser.id}`);
        if (!hodRow?.length) throw { error: 'unauthorized', message: 'HOD only.' };
        const status = action === 'approve' ? 'approved' : 'rejected';
        const row = await SupaFetch.request(`leave_requests?leave_id=eq.${leaveUuid}`, 'PATCH', {
          status,
          approved_by_hod: hodRow[0].hod_id,
          decision_at: new Date().toISOString()
        });
        return Array.isArray(row) ? row[0] : row;
      }

      // 19. STUDY MATERIALS / CONTENT
      if (path === 'content' || path === 'study_materials') {
        const rows = await SupaFetch.request('content?select=*,subject:subjects(*),faculty:faculty(*,user:users(*))&is_active=eq.true&order=uploaded_at.desc');
        return (rows || []).map(c => ({
          ...c,
          id: c.content_id,
          content_type: c.content_type?.toLowerCase() || 'note',
          subject_code: c.subject?.code || '—',
          subject_name: c.subject?.name || '—',
          faculty_name: c.faculty ? `${c.faculty.first_name || ''} ${c.faculty.last_name || ''}`.trim() : '—'
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
              title: `📅 Lecture Interchange: ${req.requester_slot?.course_name || 'Course'}`,
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
              title: `🔄 Lecture Interchange Approved — ${req.requester_slot?.course_name}`,
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
              title: `📢 Lecture Change: ${facultyName} on Leave`,
              content: `Dear Students,\n\nPlease be informed that ${facultyName} will be on leave from ${leave?.from_date || 'N/A'} to ${leave?.to_date || 'N/A'}.\n\n${substituteMsg}\n\nKindly check the updated timetable for any changes. Apologies for any inconvenience.`,
              target_audience: 'students',
              priority: 'HIGH'
            });
          } catch (e) { /* non-critical */ }
        }

        return Array.isArray(row) ? row[0] : row;
      }

      // 21. SEMINARS
      if (path === 'seminars') {
        if (method === 'GET') {
          const localSeminars = localStorage.getItem('mock_seminars');
          if (localSeminars) return JSON.parse(localSeminars);
          
          const defaultSeminars = [
            {
              id: 'sem-001',
              title: 'Introduction to Cloud Computing & AWS',
              description: 'Learn the fundamentals of cloud infrastructure, virtualization, and key AWS services.',
              speaker: 'Dr. Rajesh Kumar',
              seminar_date: '2026-07-15T10:00:00Z',
              room: 'Seminar Hall 1',
              target: 'all'
            },
            {
              id: 'sem-002',
              title: 'Resume Building & Technical Interview Prep',
              description: 'Crack coding interviews and build an outstanding resume to attract top recruiters.',
              speaker: 'Swara Mehta (HR Recruiter)',
              seminar_date: '2026-07-18T14:00:00Z',
              room: 'Placement Auditorium',
              target: 'low_placement'
            }
          ];
          localStorage.setItem('mock_seminars', JSON.stringify(defaultSeminars));
          return defaultSeminars;
        }
        if (method === 'POST') {
          const newSem = {
            id: 'sem-' + Math.floor(Math.random() * 1000000),
            title: body.title,
            description: body.description,
            speaker: body.speaker,
            seminar_date: body.seminar_date || new Date().toISOString(),
            room: body.room || 'TBD',
            target: body.target || 'all'
          };
          const current = JSON.parse(localStorage.getItem('mock_seminars') || '[]');
          current.push(newSem);
          localStorage.setItem('mock_seminars', JSON.stringify(current));
          return newSem;
        }
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

export const SupaAPI = {
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

  seminars: {
    upcoming: () => API.get('seminars?order=seminar_date.asc'),
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
      paid: 'success', pending: 'warning', overdue: 'danger', waived: 'muted',
      present: 'success', absent: 'danger', late: 'warning', excused: 'info',
      approved: 'success', rejected: 'danger'
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

export const SUPABASE_URL = 'https://olaqwoxycxdbcmqegifi.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sYXF3b3h5Y3hkYmNtcWVnaWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDYyODgsImV4cCI6MjA5ODM4MjI4OH0.JUYUKKGAAd7fx8s840meU0Ayd5VE7sfSMwDbiG8twlU';

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
      // 1. AUTH LOGIN
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
        const role = (dbUser.roles || dbUser.role || '').toLowerCase();

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

        // Pre-fetch role-specific profile in background
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
        const result = {
          ...rows[0],
          id: rows[0].student_id,
          student_id: rows[0].enrollment_no,
          department_name: rows[0].department?.name || '—',
          semester: rows[0].current_semester?.number || '—',
          year_of_study: rows[0].current_semester?.number ? Math.ceil(rows[0].current_semester.number / 2) : '—',
          user: rows[0].user,
          status: rows[0].user?.is_active ? 'active' : 'inactive'
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
            id: s.student_id,
            student_id: s.enrollment_no,
            department_name: s.department?.name || '—',
            semester: s.current_semester?.number || '—',
            year_of_study: s.current_semester?.number ? Math.ceil(s.current_semester.number / 2) : '—',
            user: {
              ...(s.user || {}),
              first_name: s.first_name || '',
              last_name: s.last_name || ''
            },
            roll_number: s.current_rollno,
            status: s.user?.is_active ? 'active' : 'inactive'
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
            enrollment_no: body.student_id,
            first_name: body.first_name || body.username,
            last_name: body.last_name || '',
            date_of_birth: body.date_of_birth || '2005-01-01',
            parent_email: body.parent_email || 'parent@college.edu',
            parent_phone: body.parent_phone || '',
            department_id: body.department_id || 'd0000000-0000-0000-0000-000000000001',
            current_semester_id: body.semester ? `e0000000-0000-0000-0000-00000000000${body.semester}` : 'e0000000-0000-0000-0000-000000000005',
            current_rollno: body.roll_number || body.current_rollno || ''
          });
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
          if (updateBody.status !== undefined) delete updateBody.status;
          if (updateBody.roll_number !== undefined) {
            updateBody.current_rollno = updateBody.roll_number;
            delete updateBody.roll_number;
          }
          if (updateBody.email !== undefined || updateBody.phone !== undefined) {
            const stRows = await SupaFetch.request(`students?select=user_id&student_id=eq.${studentUuid}`);
            if (stRows && stRows.length) {
              const uId = stRows[0].user_id;
              const userUpdate = {};
              if (updateBody.email !== undefined) userUpdate.email = updateBody.email;
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

      // 7. ALL FACULTY LIST
      if (path === 'faculty') {
        const rows = await SupaFetch.request('faculty?select=*,user:users(*),department:departments(*)&order=employee_id.asc');
        return rows.map(f => ({
          ...f,
          id: f.faculty_id,
          department_name: f.department?.name || '—',
          user: {
            ...(f.user || {}),
            first_name: f.first_name || f.user?.email?.split('@')[0] || '',
            last_name: f.last_name || ''
          }
        }));
      }

      // 7b. DEPARTMENTS
      if (path === 'faculty/departments' || path === 'departments') {
        const rows = await SupaFetch.request('departments?select=*&order=name.asc');
        return rows.map(d => ({
          ...d,
          id: d.department_id,
          name: d.name,
          code: d.code,
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
          return rows.map(e => ({
            ...e,
            course: e.course?.subject_id,
            course_code: e.course?.code,
            course_name: e.course?.name
          }));
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
      if (path === 'timetable' && method === 'GET') {
        const day = params.get('day');
        const facultyUuid = params.get('faculty');
        let query = 'timetable?select=*,course:subjects(*),faculty:faculty(*,user:users(*))';
        if (day) {
          const apiDayMap = {
            'monday': 'MON', 'tuesday': 'TUE', 'wednesday': 'WED',
            'thursday': 'THU', 'friday': 'FRI', 'saturday': 'SAT', 'sunday': 'SUN'
          };
          const dbDay = apiDayMap[day.toLowerCase()] || day.toUpperCase();
          query += `&day_of_week=eq.${dbDay}`;
        }
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
            const uiToDbStatus = { 'present': 'P', 'absent': 'A', 'late': 'L' };
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
            const dbToUiStatus = { 'P': 'present', 'A': 'absent', 'L': 'late' };
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

        const uiToDbStatus = { 'present': 'P', 'absent': 'A', 'late': 'L' };
        const payload = body.records.map(r => ({
          student_id: r.student,
          subject_id: r.course,
          date: r.date,
          status: uiToDbStatus[r.status] || r.status || 'P',
          marked_by: facultyId,
          ip_address: '127.0.0.1'
        }));
        return await SupaFetch.request('attendance_records', 'POST', payload);
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
            if (audience === 'students') query += '&target_audience=in.(ALL,STUDENTS_ONLY)';
            else if (audience === 'faculty') query += '&target_audience=in.(ALL,FACULTY_ONLY)';
            else query += `&target_audience=in.(ALL,${audience.toUpperCase()})`;
          }
          const rows = await SupaFetch.request(query);
          return rows.map(n => {
            let notice_type = 'general';
            const prio = (n.priority || '').toUpperCase();
            if (prio === 'URGENT') notice_type = 'urgent';
            else if (prio === 'HIGH') notice_type = 'exam';
            else if (prio === 'LOW') notice_type = 'holiday';
            
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
          let role = (loggedInUser?.role || 'admin').toLowerCase();
          if (role === 'student') throw { error: 'unauthorized', message: 'Students not authorized.' };
          
          let dbAudience = 'ALL';
          if (body.audience === 'students') dbAudience = 'STUDENTS_ONLY';
          else if (body.audience === 'faculty') dbAudience = 'FACULTY_ONLY';

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
            patchBody.target_audience = body.audience === 'students' ? 'STUDENTS_ONLY' : body.audience === 'faculty' ? 'FACULTY_ONLY' : 'ALL';
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

      // 20. SEMINARS
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

// Primary-key column for each table (used to auto-generate ids on insert)
export const PKS = {
  users: 'id',
  departments: 'department_id',
  semesters: 'semester_id',
  students: 'student_id',
  faculty: 'faculty_id',
  hod: 'hod_id',
  class_sections: 'section_id',
  subjects: 'subject_id',
  enrollments: 'enrollment_id',
  marks: 'mark_id',
  timetable: 'timetable_id',
  lecture_changes: 'change_id',
  leave_requests: 'leave_id',
  attendance_records: 'record_id',
  attendance_summary: 'summary_id',
  grievances: 'grievance_id',
  notices: 'notice_id',
  content: 'content_id',
  placement_companies: 'company_id',
  placement_scores: 'score_id',
  wellness_records: 'record_id',
  doubts: 'doubt_id',
  fee_structures: 'fee_id',
  fee_payments: 'payment_id',
  notifications: 'notification_id',
  audit_logs: 'log_id',
};

// Embed relationships, keyed by `${baseTable}.${embeddedTable}`.
// local  = field on the base row
// foreign = field on the embedded/target row
// many   = true for reverse (one-to-many) embeds returning an array
export const REL = {
  'students.users':        { local: 'user_id',             foreign: 'id' },
  'students.departments':  { local: 'department_id',        foreign: 'department_id' },
  'students.semesters':    { local: 'current_semester_id',  foreign: 'semester_id' },

  'faculty.users':         { local: 'user_id',             foreign: 'id' },
  'faculty.departments':   { local: 'department_id',        foreign: 'department_id' },

  'hod.users':             { local: 'user_id',             foreign: 'id' },
  'hod.departments':       { local: 'department_id',        foreign: 'department_id' },

  'subjects.faculty':      { local: 'faculty_id',           foreign: 'faculty_id' },
  'subjects.departments':  { local: 'department_id',        foreign: 'department_id' },
  'subjects.semesters':    { local: 'semester_id',          foreign: 'semester_id' },
  'subjects.enrollments':  { local: 'subject_id',           foreign: 'subject_id', many: true },

  'marks.subjects':        { local: 'subject_id',           foreign: 'subject_id' },
  'marks.students':        { local: 'student_id',           foreign: 'student_id' },

  'enrollments.students':  { local: 'student_id',           foreign: 'student_id' },
  'enrollments.subjects':  { local: 'subject_id',           foreign: 'subject_id' },

  'attendance_records.subjects': { local: 'subject_id',     foreign: 'subject_id' },
  'attendance_records.students': { local: 'student_id',     foreign: 'student_id' },

  'timetable.subjects':    { local: 'subject_id',           foreign: 'subject_id' },
  'timetable.faculty':     { local: 'faculty_id',           foreign: 'faculty_id' },

  'fee_payments.students':        { local: 'student_id',        foreign: 'student_id' },
  'fee_payments.fee_structures':  { local: 'fee_structure_id',  foreign: 'fee_id' },

  'notices.users':         { local: 'author_id',            foreign: 'id' },

  'grievances.students':   { local: 'student_id',           foreign: 'student_id' },

  'leave_requests.faculty':{ local: 'faculty_id',           foreign: 'faculty_id' },

  'content.subjects':      { local: 'subject_id',           foreign: 'subject_id' },
  'content.faculty':       { local: 'faculty_id',           foreign: 'faculty_id' },
};

// Fields defaulted on INSERT when the client omits them (Supabase did this via
// column DEFAULTs). 'ts' => current ISO timestamp, 'true' => boolean true.
export const DEFAULTS = {
  users:              { is_active: 'true' },
  notices:            { published_at: 'ts', is_active: 'true' },
  grievances:         { submitted_at: 'ts' },
  leave_requests:     { applied_at: 'ts' },
  marks:              { entered_at: 'ts' },
  attendance_records: { marked_at: 'ts' },
  enrollments:        { enrolled_date: 'ts' },
  content:            { uploaded_at: 'ts', is_active: 'true' },
  doubts:             { submitted_at: 'ts' },
  notifications:      { sent_at: 'ts', is_read: 'false' },
};

// Every table we migrate / expose.
export const TABLES = Object.keys(PKS);

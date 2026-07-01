-- ============================================================
-- EduManagePro Unified UUID Database Schema for Supabase
-- Fully aligns with the user's defined table and column specs.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 0. CUSTOM ENUMS DEFINITIONS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'faculty', 'student', 'hod');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE subject_type AS ENUM ('theory', 'practical', 'elective');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE day_of_week_enum AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE change_type_enum AS ENUM ('substitution', 'cancellation', 'extra', 'swap', 'remedial');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE leave_type_enum AS ENUM ('full_day', 'half_day', 'multiple_days', 'casual', 'medical', 'duty');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE leave_status_enum AS ENUM ('pending', 'approved', 'rejected', 'substitute_searching', 'substitute_assigned', 'completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE grievance_status AS ENUM ('pending', 'in_review', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notice_author_role AS ENUM ('admin', 'faculty', 'hod');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notice_target_enum AS ENUM ('all', 'students', 'faculty');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notice_priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE content_type_enum AS ENUM ('note', 'video', 'link', 'ppt');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE placement_category AS ENUM ('high', 'medium', 'low', 'critical', 'insufficient');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE wellness_status_enum AS ENUM ('healthy', 'watch', 'concern', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE doubt_status_enum AS ENUM ('open', 'under_review', 'resolved', 'escalated', 'reassigned');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE fee_payment_status AS ENUM ('pending', 'paid', 'overdue', 'waived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notification_role AS ENUM ('student', 'faculty', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'push');
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ============================================================
-- 1. users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          user_role NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  last_login    TIMESTAMP
);

-- ============================================================
-- 2. departments
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  department_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  code          VARCHAR(10) UNIQUE NOT NULL,
  hod_id        UUID UNIQUE -- Nullable (resolved after HOD is created)
);

-- ============================================================
-- 3. semesters
-- ============================================================
CREATE TABLE IF NOT EXISTS semesters (
  semester_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number        INTEGER NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- 4. students
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  student_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_no       VARCHAR(50) UNIQUE NOT NULL,
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  date_of_birth       DATE NOT NULL,
  parent_email        VARCHAR(255) NOT NULL,
  parent_phone        VARCHAR(20),
  department_id       UUID REFERENCES departments(department_id) ON DELETE SET NULL,
  current_semester_id UUID REFERENCES semesters(semester_id) ON DELETE SET NULL
);

-- ============================================================
-- 5. faculty
-- ============================================================
CREATE TABLE IF NOT EXISTS faculty (
  faculty_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id   VARCHAR(50) UNIQUE NOT NULL,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL
);

-- ============================================================
-- 6. hod
-- ============================================================
CREATE TABLE IF NOT EXISTS hod (
  hod_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID UNIQUE NOT NULL REFERENCES departments(department_id) ON DELETE CASCADE
);

-- Loop back relationship department -> HOD
ALTER TABLE departments ADD CONSTRAINT fk_dept_hod FOREIGN KEY (hod_id) REFERENCES hod(hod_id) ON DELETE SET NULL;

-- ============================================================
-- 7. class_sections
-- ============================================================
CREATE TABLE IF NOT EXISTS class_sections (
  section_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id  UUID REFERENCES departments(department_id) ON DELETE SET NULL,
  semester_id    UUID REFERENCES semesters(semester_id) ON DELETE SET NULL,
  section_name   VARCHAR(50) NOT NULL,
  capacity       INTEGER NOT NULL DEFAULT 60,
  created_by_hod UUID REFERENCES hod(hod_id) ON DELETE SET NULL
);

-- ============================================================
-- 8. subjects
-- ============================================================
CREATE TABLE IF NOT EXISTS subjects (
  subject_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  credits       INTEGER NOT NULL DEFAULT 3,
  subject_type  subject_type NOT NULL DEFAULT 'theory',
  department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL,
  semester_id   UUID REFERENCES semesters(semester_id) ON DELETE SET NULL,
  faculty_id    UUID REFERENCES faculty(faculty_id) ON DELETE SET NULL
);

-- ============================================================
-- 9. enrollments
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollments (
  enrollment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
  semester_id   UUID REFERENCES semesters(semester_id) ON DELETE CASCADE,
  enrolled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(student_id, subject_id, semester_id)
);

-- ============================================================
-- 10. marks
-- ============================================================
CREATE TABLE IF NOT EXISTS marks (
  mark_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  subject_id     UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
  semester_id    UUID NOT NULL REFERENCES semesters(semester_id) ON DELETE CASCADE,
  internal_marks NUMERIC(5,2) NOT NULL,
  external_marks NUMERIC(5,2) NOT NULL,
  total_marks    NUMERIC(5,2),
  grade          VARCHAR(5) NOT NULL,
  grade_points   NUMERIC(3,1) NOT NULL,
  entered_at     TIMESTAMP DEFAULT NOW(),
  entered_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(student_id, subject_id, semester_id)
);

-- ============================================================
-- 11. timetable
-- ============================================================
CREATE TABLE IF NOT EXISTS timetable (
  timetable_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_section_id UUID REFERENCES class_sections(section_id) ON DELETE CASCADE,
  subject_id       UUID REFERENCES subjects(subject_id) ON DELETE CASCADE,
  faculty_id       UUID REFERENCES faculty(faculty_id) ON DELETE SET NULL,
  day_of_week      day_of_week_enum NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  room_no          VARCHAR(50),
  academic_year    VARCHAR(20) NOT NULL,
  is_active        BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- 12. lecture_changes
-- ============================================================
CREATE TABLE IF NOT EXISTS lecture_changes (
  change_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timetable_id          UUID NOT NULL REFERENCES timetable(timetable_id) ON DELETE CASCADE,
  change_date           DATE NOT NULL,
  change_type           change_type_enum NOT NULL,
  substitute_faculty_id UUID REFERENCES faculty(faculty_id) ON DELETE SET NULL,
  is_cancelled          BOOLEAN DEFAULT FALSE,
  reason                VARCHAR(255),
  approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 13. leave_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_requests (
  leave_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  faculty_id       UUID NOT NULL REFERENCES faculty(faculty_id) ON DELETE CASCADE,
  from_date        DATE NOT NULL,
  to_date          DATE NOT NULL,
  leave_type       leave_type_enum NOT NULL,
  reason           VARCHAR(255),
  status           leave_status_enum NOT NULL DEFAULT 'pending',
  approved_by_hod  UUID REFERENCES hod(hod_id) ON DELETE SET NULL,
  applied_at       TIMESTAMP DEFAULT NOW(),
  decision_at      TIMESTAMP
);

-- ============================================================
-- 14. attendance_records
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_records (
  record_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
  lecture_id UUID REFERENCES timetable(timetable_id) ON DELETE SET NULL,
  date       DATE NOT NULL,
  status     attendance_status NOT NULL,
  marked_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45) NOT NULL,
  marked_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, subject_id, date)
);

-- ============================================================
-- 15. attendance_summary
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_summary (
  summary_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  subject_id     UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
  total_lectures INTEGER NOT NULL DEFAULT 0,
  present_count  INTEGER NOT NULL DEFAULT 0,
  percentage     NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  is_shortage    BOOLEAN DEFAULT FALSE,
  updated_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, subject_id)
);

-- ============================================================
-- 16. grievances
-- ============================================================
CREATE TABLE IF NOT EXISTS grievances (
  grievance_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  category        VARCHAR(100) NOT NULL,
  description     TEXT NOT NULL,
  attachment_url  VARCHAR(500),
  status          grievance_status NOT NULL DEFAULT 'pending',
  is_critical     BOOLEAN DEFAULT FALSE,
  resolution_note TEXT,
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at    TIMESTAMP DEFAULT NOW(),
  resolved_at     TIMESTAMP,
  sla_deadline    TIMESTAMP
);

-- ============================================================
-- 17. notices
-- ============================================================
CREATE TABLE IF NOT EXISTS notices (
  notice_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role     notice_author_role NOT NULL,
  title           VARCHAR(255) NOT NULL,
  content         TEXT NOT NULL,
  target_audience notice_target_enum NOT NULL DEFAULT 'all',
  priority        notice_priority_enum NOT NULL DEFAULT 'medium',
  published_at    TIMESTAMP DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- 18. content
-- ============================================================
CREATE TABLE IF NOT EXISTS content (
  content_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id   UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
  faculty_id   UUID NOT NULL REFERENCES faculty(faculty_id) ON DELETE CASCADE,
  content_type content_type_enum NOT NULL DEFAULT 'note',
  title        VARCHAR(255) NOT NULL,
  file_url     VARCHAR(500),
  video_url    VARCHAR(500),
  topic_tag    VARCHAR(100),
  uploaded_at  TIMESTAMP DEFAULT NOW(),
  is_active    BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- 19. placement_companies
-- ============================================================
CREATE TABLE IF NOT EXISTS placement_companies (
  company_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(255) NOT NULL,
  min_cpi        NUMERIC(4,2) NOT NULL DEFAULT 6.0,
  max_backlogs   INTEGER NOT NULL DEFAULT 0,
  min_attendance NUMERIC(5,2) NOT NULL DEFAULT 75.0,
  other_criteria TEXT,
  is_active      BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- 20. placement_scores
-- ============================================================
CREATE TABLE IF NOT EXISTS placement_scores (
  score_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id       UUID UNIQUE NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  cpi_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
  attendance_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  backlog_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
  extra_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  category         placement_category NOT NULL DEFAULT 'insufficient',
  computed_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 21. wellness_records
-- ============================================================
CREATE TABLE IF NOT EXISTS wellness_records (
  record_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id          UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  encrypted_responses TEXT NOT NULL,
  sentiment_score     NUMERIC(5,2) NOT NULL,
  status              wellness_status_enum NOT NULL DEFAULT 'healthy',
  assessment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  is_flagged          BOOLEAN DEFAULT FALSE,
  UNIQUE(student_id, assessment_date)
);

-- ============================================================
-- 22. doubts
-- ============================================================
CREATE TABLE IF NOT EXISTS doubts (
  doubt_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id          UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  subject_id          UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
  question            TEXT NOT NULL,
  attachment_url      VARCHAR(500),
  status              doubt_status_enum NOT NULL DEFAULT 'open',
  assigned_faculty_id UUID REFERENCES faculty(faculty_id) ON DELETE SET NULL,
  resolution          TEXT,
  submitted_at        TIMESTAMP DEFAULT NOW(),
  resolved_at         TIMESTAMP
);

-- ============================================================
-- 23. fee_structures
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_structures (
  fee_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id    UUID NOT NULL REFERENCES semesters(semester_id) ON DELETE CASCADE,
  program_code   VARCHAR(50) NOT NULL,
  component_name VARCHAR(100) NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  due_date       DATE NOT NULL,
  is_optional    BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- 24. fee_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_payments (
  payment_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id       UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  fee_structure_id UUID NOT NULL REFERENCES fee_structures(fee_id) ON DELETE CASCADE,
  amount_paid      NUMERIC(10,2) NOT NULL,
  payment_date     DATE,
  status           fee_payment_status NOT NULL DEFAULT 'pending',
  transaction_ref  VARCHAR(100),
  UNIQUE(student_id, fee_structure_id)
);

-- ============================================================
-- 25. notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  notification_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_role   notification_role NOT NULL,
  title            VARCHAR(255) NOT NULL,
  body             TEXT NOT NULL,
  channel          notification_channel NOT NULL DEFAULT 'in_app',
  is_read          BOOLEAN DEFAULT FALSE,
  delivery_success BOOLEAN DEFAULT TRUE,
  sent_at          TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 26. audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id   UUID NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  VARCHAR(45) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- DEV ACCESS ROW LEVEL SECURITY POLICIES (anon key allowed)
-- ============================================================
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters           ENABLE ROW LEVEL SECURITY;
ALTER TABLE students            ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty             ENABLE ROW LEVEL SECURITY;
ALTER TABLE hod                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecture_changes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_summary  ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievances          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE content             ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_scores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellness_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_users"               ON users               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_departments"         ON departments         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_semesters"           ON semesters           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_students"            ON students            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_faculty"             ON faculty             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_hod"                 ON hod                 FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_class_sections"      ON class_sections      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_subjects"            ON subjects            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_enrollments"         ON enrollments         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_marks"               ON marks               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_timetable"           ON timetable           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_lecture_changes"     ON lecture_changes     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_leave_requests"      ON leave_requests      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_attendance_records"  ON attendance_records  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_attendance_summary"  ON attendance_summary  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_grievances"          ON grievances          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_notices"             ON notices             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_content"             ON content             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_placement_companies" ON placement_companies FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_placement_scores"    ON placement_scores    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_wellness_records"    ON wellness_records    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_doubts"              ON doubts              FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_fee_structures"      ON fee_structures      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_fee_payments"        ON fee_payments        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_notifications"       ON notifications       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_audit_logs"          ON audit_logs          FOR ALL TO anon USING (true) WITH CHECK (true);

# Remaining Implementation Gaps & Curriculum Roadmap

This document outlines all remaining features, system implementation gaps, and curriculum integration tasks for both the **Frontend** and **Backend** of the College Management System (**EduManage Pro**).

---

## 1. System Implementation Gaps (Frontend & Backend)

The following table details all un-implemented or partially remaining system modules required for full platform completion:

| # | Feature / Module | Affected Layer | Current Status | Description & Action Required |
|---|---|---|---|---|
| 1 | **Admin Portal Master CRUD UI** | Frontend & Backend | **✅ Implemented** | Full master-data CRUD: Students, Faculty, Departments, HODs, Courses (existing) **+ new Users console** at `/admin/users` — search/filter by role, inline role change, activate/deactivate, **password reset** (re-hashes server-side), and delete. `users` PATCH handler upgraded to support these. |
| 2 | **Alumni Portal** | Frontend & Backend | **✅ Implemented** | Django `campus.Alumnus` model + `/rest/v1/alumni` API + searchable directory dashboard at `/student/alumni` & `/admin/alumni` (filter by batch/company/mentors; admin add/remove). |
| 3 | **Online Fee Payment Gateway** | Frontend & Backend | **Remaining** | Integrate third-party payment gateways (e.g., Stripe, Razorpay) into the fee management workflow. |
| 4 | **Examination Scheduling System** | Frontend & Backend | **✅ Implemented** | New `campus.Exam` model + `/rest/v1/exams` CRUD. Admin timetable editor at `/admin/exams` (with room-clash detection & auto **seat planning** via `exams/seat-plan`); read-only synced views for students (`/student/exams`, enrolled courses only) and faculty (`/faculty/exams`, taught courses + seat plans). |
| 5 | **Library Management System** | Frontend & Backend | **Remaining** | Create book inventory schema, barcode search, checkout/return logs, and fine tracking UI. |
| 6 | **Native Mobile Application** | Mobile Wrapper | **Remaining** | Build cross-platform iOS/Android wrappers using React Native or Capacitor. |
| 7 | **Parent Portal (Read-Only)** | Frontend & Backend | **✅ Implemented** | New `parent` user role + `campus.Parent` link model. Dedicated read-only portal (`/dashboard/parent` + attendance/grades/fees/notices pages) scoped to the linked student via `/rest/v1/parents/child`. Login: `parent1@lju.edu.in / parent123`. |
| 8 | **HOD Permission Delegation** | Backend & Frontend | **Remaining** | Support temporary role delegation to Deputy/Assistant HODs for leave approvals and timetable updates. |
| 9 | **Backlog & KT Tracking Module** | Frontend & Backend | **✅ Implemented** | New `campus.Backlog` table (active/registered/cleared, attempts, re-exam & clearance dates). Student UI at `/student/backlogs` to view KTs and register for re-exams; `/rest/v1/backlogs` supports register/clear (clearing lifts the underlying failing grade). |
| 10 | **Student Internships & Achievements** | Frontend & Backend | **Remaining** | Create student forms for submitting internship certificates, achievements, and extracurricular logs. |
| 11 | **Visual Clash Detection for Timetable** | Frontend (HOD) | **Remaining** | Add visual conflict/clash detection wizard in HOD timetable manager for overlapping rooms and faculty. |
| 12 | **Bulk Marks Import (CSV / Excel)** | Frontend & Backend | **✅ Implemented** | Drag-and-drop CSV upload on the faculty Grades screen; CSV is **parsed and matched to students server-side** (`rest_compat.handle_grades_bulk_import`), grades derived on save. Returns imported/skipped summary. |
| 13 | **Faculty Feedback & Rating Surveys** | Frontend & Backend | **✅ Implemented** | `campus.FacultyFeedback` model (4 Likert dimensions, anonymous-capable); student form at `/student/feedback`; HOD aggregate dashboard at `/hod/feedback` (`faculty_feedback/summary` averages per faculty). |
| 14 | **AI RAG (Retrieval-Augmented Generation)** | Backend AI | **Remaining** | Integrate LLM syllabus context to auto-answer student doubts before assigning to faculty. |
| 15 | **ML Placement Predictor Service** | Backend ML API | **✅ Implemented** | New `placement` app: a **numpy-trained logistic-regression** model (`placement/ml.py`) scores placement readiness from each student's **real** CPI, attendance & backlogs (`placement/service.py`). Served at `/rest/v1/placement_scores`; eligibility matched against `/rest/v1/placement_companies`. Replaces the old static calc. |

---

### React → Django rebalance (ongoing)

Business logic and multi-request orchestration were moved out of `client.js` into Django handlers
(`rest_compat.py`), shrinking the client from ~1414 → ~1188 lines:
- **Student create/edit/delete** — user creation, semester parsing, and **auto-enrollment** now happen
  server-side (`handle_students` + `_create_account`/`_parse_semester`/`_auto_enroll` helpers).
- **Faculty create/edit/delete** — user+faculty creation and cascade delete server-side.
- **HOD assignment** — promote/demote (one HOD per department) enforced in `handle_hod`.
- **Attendance bulk-mark** — faculty resolution + status mapping in `attendance/bulk-mark`.
- **Admin fee console** aggregation (`admin/fees`) and **mark-paid** (`fees/mark-paid`) server-side.
- (Earlier) grade/GPA computation, admin & attendance stats.

### Recently completed (this iteration)

- **Study Materials (Content)** and **Doubts Q&A** are now backed by real Django models
  (`campus.StudyMaterial`, `campus.Doubt`) instead of hardcoded mock lists in `rest_compat.py`.
  Doubts compute a 72-hour SLA deadline server-side.
- **Alumni Portal** built end-to-end (see row 2).
- **Bulk Marks CSV Import** (row 12) and **Faculty Feedback surveys** (row 13) built end-to-end.
- Fixed the `content` upload branch in `client.js` — POST/DELETE were previously swallowed by the GET path.
- **ML Placement Predictor** (row 15) built end-to-end — the `placement_scores`/`placement_companies`
  tables had no Django handler before, so the Placement page was blank; it now runs on a trained model
  fed by real student data.
- **Parent Portal** (row 7) built end-to-end — new `parent` role, `campus.Parent` link model, and a
  read-only child dashboard (overview + attendance + grades + fees + notices).
- **Backlog/KT Tracking** (row 9) built end-to-end — `campus.Backlog` table + student re-exam
  registration UI. Also fixed a latent `Grade.percentage` bug (float/Decimal division crash).
- **Examination Scheduling** (row 4) built end-to-end — `campus.Exam` model, admin timetable editor
  with clash detection + seat planning, and synced read-only views for students & faculty.
- **Admin Master CRUD** (row 1) completed — added the Users management console (roles, access,
  password reset) to round out the existing student/faculty/department/course/HOD management.
- **React → Django rebalance:** grade/GPA/percentage computation now lives solely in
  `grades.models.Grade` (removed from 3 places in `client.js`); admin & attendance stats are
  computed server-side and the client just calls those endpoints.
- **Public landing page** added at `/` (`pages/Landing.jsx`).
- `seed_data.py` Windows encoding crash fixed; import now covers content/doubts/alumni.

---


## 2. Implementation Roadmap & Priority Phases

```mermaid
flowchart TD
    subgraph Phase 1: Core Portal Expansion
        A[Admin Master CRUD UI]
        B[Bulk Marks CSV Import]
        C[Timetable Clash Wizard]
    end
    
    subgraph Phase 2: User Portals & Payments
        D[Parent Portal]
        E[Alumni Directory]
        F[Stripe/Razorpay Gateway]
        G[Exam & Library Modules]
    end

    subgraph Phase 3: AI & Automation
        H[ML Placement Predictor API]
        I[AI RAG Doubt Solver]
        J[SMS & WhatsApp Gateway]
    end

    Phase 1 --> Phase 2 --> Phase 3
```

---

*Generated for EduManage Pro — Workspace Status Report*

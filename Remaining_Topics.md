# Remaining Implementation Gaps & Curriculum Roadmap

This document outlines all remaining features, system implementation gaps, and curriculum integration tasks for both the **Frontend** and **Backend** of the College Management System (**EduManage Pro**).

---

## 1. System Implementation Gaps (Frontend & Backend)

The following table details all un-implemented or partially remaining system modules required for full platform completion:

| # | Feature / Module | Affected Layer | Current Status | Description & Action Required |
|---|---|---|---|---|
| 1 | **Admin Portal Master CRUD UI** | Frontend & Backend | **✅ Implemented** | Full master-data CRUD: Students, Faculty, Departments, HODs, Courses (existing) **+ new Users console** at `/admin/users` — search/filter by role, inline role change, activate/deactivate, **password reset** (re-hashes server-side), and delete. `users` PATCH handler upgraded to support these. |
| 2 | **Alumni Portal** | Frontend & Backend | **✅ Implemented** | Django `campus.Alumnus` model + `/rest/v1/alumni` API + searchable directory dashboard at `/student/alumni` & `/admin/alumni` (filter by batch/company/mentors; admin add/remove). |
| 3 | **Online Fee Payment Gateway** | Frontend & Backend | **✅ Implemented** | **Razorpay-compatible** gateway (`fees/gateway.py`) implementing the real order → checkout → **HMAC-SHA256 signature verify** handshake, plus a `fees.PaymentTransaction` ledger. Runs in **test mode** offline (self-contained, no external SDK) and flips to live when `RAZORPAY_KEY_ID/SECRET` are set. Student fee page at `/student/fees` — dues, a Razorpay-style checkout modal (method selection, success/failure simulation) and payment history. APIs: `/rest/v1/payments/config`, `/payments/create-order`, `/payments/verify` (signature-checked; settles the `Fee`), `/payments`. Existing admin mark-paid retained. |
| 4 | **Examination Scheduling System** | Frontend & Backend | **✅ Implemented** | New `campus.Exam` model + `/rest/v1/exams` CRUD. Admin timetable editor at `/admin/exams` (with room-clash detection & auto **seat planning** via `exams/seat-plan`); read-only synced views for students (`/student/exams`, enrolled courses only) and faculty (`/faculty/exams`, taught courses + seat plans). |
| 5 | **Library Management System** | Frontend & Backend | **✅ Implemented** | New `campus.Book` (inventory with copy accounting) + `campus.BookLoan` (checkout/return logs, ₹5/day overdue fines) models. Admin console at `/admin/library` — catalogue CRUD, barcode/ISBN/title search, **issue & return** with live availability, and fine collection. Student catalogue + borrowing/fines view at `/student/library`. APIs: `/rest/v1/library/books`, `/library/loans`, `/library/stats`. |
| 6 | **Native Mobile Application** | Mobile Wrapper | **Remaining** | Build cross-platform iOS/Android wrappers using React Native or Capacitor. |
| 7 | **Parent Portal (Read-Only)** | Frontend & Backend | **✅ Implemented** | New `parent` user role + `campus.Parent` link model. Dedicated read-only portal (`/dashboard/parent` + attendance/grades/fees/notices pages) scoped to the linked student via `/rest/v1/parents/child`. Login: `parent1@lju.edu.in / parent123`. |
| 8 | **HOD Permission Delegation** | Backend & Frontend | **✅ Implemented** | New `campus.Delegation` model (delegator HOD → deputy faculty, per-scope: leave approvals / timetable, with a date window & revoke). HOD console at `/hod/delegation` to grant/revoke duties to a department deputy. A deputy faculty then transparently gains the delegated screens: `resolveHodContext` in `client.js` lets them use `hod/leaves` approve/reject, `hod/check` & timetable resolve to the delegated department, `ProtectedRoute` unlocks routes via `delegationScope`, and the sidebar shows an **"Acting HOD (Delegated)"** section. APIs: `/rest/v1/hod/delegations`, `/rest/v1/hod/my-access`. Also fixed the seed so each department actually has a role=`hod` head (the legacy `hod.json` ids never matched). |
| 9 | **Backlog & KT Tracking Module** | Frontend & Backend | **✅ Implemented** | New `campus.Backlog` table (active/registered/cleared, attempts, re-exam & clearance dates). Student UI at `/student/backlogs` to view KTs and register for re-exams; `/rest/v1/backlogs` supports register/clear (clearing lifts the underlying failing grade). |
| 10 | **Student Internships & Achievements** | Frontend & Backend | **✅ Implemented** | New `campus.Internship` (company/role/stipend/certificate + ongoing/completed) & `campus.Achievement` (category/level/position + certificate) models with a `pending/verified/rejected` workflow. Student portfolio at `/student/portfolio` — tabbed submission forms for internships & achievements with edit/delete. Admin verification console at `/admin/student-records` (filter by status, verify/reject, view certificates). APIs: `/rest/v1/internships`, `/rest/v1/achievements`. |
| 11 | **Visual Clash Detection for Timetable** | Frontend (HOD) | **✅ Implemented** | HOD timetable manager (`/hod/timetable`) now detects **room & faculty double-bookings** across the department's schedule. Clashing lectures are outlined in red on the weekly grid; a header button + banner open a **Clash Detection wizard** listing each conflict (day, overlapping times, room/faculty reason) with jump-to-edit. The add/edit modal shows a **live pre-save clash warning**. Also normalised the slot data shape so the weekly grid renders lectures correctly. |
| 12 | **Bulk Marks Import (CSV / Excel)** | Frontend & Backend | **✅ Implemented** | Drag-and-drop CSV upload on the faculty Grades screen; CSV is **parsed and matched to students server-side** (`rest_compat.handle_grades_bulk_import`), grades derived on save. Returns imported/skipped summary. |
| 13 | **Faculty Feedback & Rating Surveys** | Frontend & Backend | **✅ Implemented** | `campus.FacultyFeedback` model (4 Likert dimensions, anonymous-capable); student form at `/student/feedback`; HOD aggregate dashboard at `/hod/feedback` (`faculty_feedback/summary` averages per faculty). |
| 14 | **AI RAG (Retrieval-Augmented Generation)** | Backend AI | **✅ Implemented** | New `chatbot/services/doubt_ai.py` — on doubt submission it **retrieves syllabus context** (course description + most relevant `StudyMaterial`s ranked by keyword overlap) from the ORM and asks the **Groq LLM** (llama-3.3-70b) to answer, grounded in that context, with an offline extractive fallback and a 0–100 confidence score. `campus.Doubt` gains `ai_answer/ai_confidence/ai_sources/ai_answered_at/ai_helpful` + an `ai_answered` status. Student Doubts page (`/student/doubts`) shows the instant AI answer with confidence, sources, and **“This solved it” / “Ask a faculty member”** actions (accept resolves; escalate routes to the course faculty). |
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

- **Online Fee Payment Gateway** (row 3) built end-to-end — a Razorpay-compatible gateway with the
  genuine order → checkout → HMAC-SHA256 signature-verify handshake (`fees/gateway.py`) and a
  `PaymentTransaction` ledger. Student fee page (`/student/fees`) with a Razorpay-style checkout
  (method selection + success/failure simulation) and payment history; signature is verified
  server-side before the fee is settled. Runs in self-contained test mode offline; live keys via
  env. Seed pays 6 fees through the full handshake.
- **AI RAG Doubt Solver** (row 14) built end-to-end — `chatbot/services/doubt_ai.py` retrieves
  syllabus context (course + relevant study materials) and answers via the Groq LLM (grounded/RAG),
  with an offline extractive fallback and a confidence score. Doubts get an instant AI first-response
  (`ai_answered`); the student can accept it (resolve) or escalate to the course faculty. Seed now
  demos the flow on 4 doubts (accepted / escalated / pending). Also made the `seed_data.py` login
  summary print the real, working demo credentials per role.
- **HOD Permission Delegation** (row 8) built end-to-end — `campus.Delegation` model with per-scope
  grants (leave approvals / timetable) and a date window. HOD delegation console (`/hod/delegation`)
  to assign/revoke a deputy; the deputy faculty transparently gains the delegated screens via a
  `resolveHodContext` fallback (real HOD → active delegation), a `delegationScope`-aware
  `ProtectedRoute`, delegated-access state in the auth store, and an "Acting HOD" sidebar section.
  Fixed a latent seed bug so every department now has a real role=`hod` head (**primary HOD:
  `faculty.ce1@edumanagepro.edu` / `hod123`; deputy: `faculty.ce2@edumanagepro.edu` / `deputy123`**).
- **Visual Timetable Clash Detection** (row 11) built end-to-end — the HOD timetable manager now
  flags room & faculty double-bookings (same day + overlapping time), outlines clashing cells in red,
  offers a Clash Detection wizard listing every conflict with jump-to-edit, and shows a live pre-save
  clash warning in the add/edit modal. Fixed the underlying grid, which previously read mismatched
  field names and rendered no lectures; seed now injects demo clash pairs per department.
- **Student Internships & Achievements** (row 10) built end-to-end — `campus.Internship` and
  `campus.Achievement` models with a pending/verified/rejected review workflow. Student portfolio
  (`/student/portfolio`) with tabbed submission forms + edit/delete; admin verification console
  (`/admin/student-records`) to review, verify/reject and open certificates. Seeded 14 internships
  and 14 achievements across students.
- **Library Management** (row 5) built end-to-end — `campus.Book` inventory (copy tracking) +
  `campus.BookLoan` checkout/return logs with automatic ₹5/day overdue fines. Admin librarian
  console (`/admin/library`) for catalogue CRUD, barcode/ISBN search, issuing, returns and fine
  collection; student catalogue + "My Books" fines view (`/student/library`). Seeded with 12
  titles and sample loans (on-time / due-soon / overdue).

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

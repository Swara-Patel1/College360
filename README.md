# 🎓 College360 - AI-Driven College Management System

An all-in-one, next-generation web application for managing academic workflows, department operations, student analytics, AI-assisted learning, and campus administration.

---

## 🚀 Features & Highlights

### 👨‍🎓 Student Portal
- **Dashboard & Overview:** Real-time metrics on attendance, grades, and upcoming schedules.
- **Attendance & Grades:** Course-wise attendance tracking and examination performance metrics.
- **Timetable & Exam Schedule:** Live schedules for lectures and upcoming term exams.
- **Study Materials:** Access verified notes, video tutorials, reference links, and assignments.
- **AI Chatbot & Doubts Q&A:** Groq AI-powered study companion and student-faculty interactive Q&A forum.
- **Library & Fee Management:** Book search, transaction logs, fee structure details, and payment tracking.
- **Placement Predictor:** Machine-learning-assisted placement readiness scoring.

### 👩‍🏫 Faculty & HOD Portal
- **Attendance & Grade Management:** Easily mark attendance and upload student grades per subject/semester.
- **Timetable Management & Lecture Interchange:** Faculty-to-faculty lecture substitution and interchange requests.
- **Leave Requests & Approval:** HOD and faculty workflow for leave applications and approvals.
- **Grievance Redressal:** Department-level student complaint and doubt resolution platform.

### ⚙️ Admin Portal
- **Full User & System Control:** Manage Students, Faculty, HODs, and Departments.
- **Course & Department Administration:** Configure semester plans, subject assignments, and fee structures.
- **Exam Scheduling & Reports:** System-wide schedule orchestration and export capabilities.

---

## 🛠️ Tech Stack

- **Frontend:** React, Vite, React Router, CSS Design System, Bootstrap Icons
- **Backend:** Django, Django REST Framework (DRF), SimpleJWT
- **Database:** PostgreSQL 18
- **AI Integration:** Groq AI API
- **Machine Learning:** Scikit-Learn, NumPy, Joblib (Placement Prediction Model)

---

## 📋 Prerequisites

- **Python:** 3.10+
- **Node.js:** 18+
- **PostgreSQL:** 14+ (Configured for database `College360`)

---

## ⚙️ Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/Swara-Patel1/College360.git
cd College360
```

### 2. Backend Setup (Django)
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
```

#### Configure `.env` in `backend/`:
```env
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=True

DB_ENGINE=django.db.backends.postgresql
DB_NAME=College360
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432

GROQ_API_KEY=your_groq_api_key
```

### 3. Database Restore
Import the provided PostgreSQL database dump:
```bash
psql -U postgres -d College360 -f College360(1).sql
```

### 4. Frontend Setup (React + Vite)
```bash
cd ../edumanage_frontend
npm install
```

---

## 🏃 Running the Application

### Option A: Using `start.bat` (Windows)
Double-click `start.bat` or run:
```cmd
start.bat
```

### Option B: Manual Launch

#### Start Backend:
```bash
cd backend
python manage.py runserver 8000
```
Backend runs at `http://localhost:8000`

#### Start Frontend:
```bash
cd edumanage_frontend
npm run dev
```
Frontend runs at `http://localhost:5173`

---

## 🔑 Demo Credentials

| Role | Username / Email | Password |
|---|---|---|
| **Admin** | `admin@lju.edu.in` | `admin123` |
| **Faculty** | `faculty1@lju.edu.in` | `fac123` |
| **Student** | `rushi@lju.edu.in` | `rushi123` |

---

## 📄 License
This project is licensed under the MIT License.

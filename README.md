# 🎓 EduPulse — College Management System

A full-stack College Management System built with **Django + Node.js + Modern HTML/CSS/JS**.

## 🚀 Quick Start

### Option 1: Double-click `start.bat`
Just run the batch file in the root directory — it starts everything automatically.

### Option 2: Manual Start

**1. Start Django Backend (Terminal 1)**
```bash
cd backend
python manage.py runserver 8000
```

**2. Start Node.js Real-time Server (Terminal 2)**
```bash
cd realtime
node server.js
```

**3. Open Frontend**
Open `frontend/index.html` in your browser.

---

## 🔑 Demo Login Credentials

| Role | Username | Password |
|------|----------|----------|
| 🛡️ Admin | `admin` | `admin123` |
| 👨‍🏫 Faculty | `rajesh.kumar` | `faculty123` |
| 🎓 Student | `arjun.verma` | `student123` |

---

## 📁 Project Structure

```
College_Management/
├── start.bat                    # Start all services
├── backend/                     # Django REST API
│   ├── manage.py
│   ├── seed_data.py             # Run once to populate sample data
│   ├── db.sqlite3               # SQLite database
│   ├── college_management/      # Django project settings
│   ├── accounts/                # User auth (JWT)
│   ├── students/                # Student management
│   ├── faculty/                 # Faculty & departments
│   ├── courses/                 # Courses & enrollments
│   ├── attendance/              # Attendance tracking
│   ├── grades/                  # Grades & results
│   ├── fees/                    # Fee management
│   ├── timetable/               # Schedule management
│   └── notices/                 # Announcements
├── realtime/                    # Node.js + Socket.io
│   ├── server.js
│   └── package.json
└── frontend/                    # HTML/CSS/JS Frontend
    ├── index.html               # Login page
    ├── css/main.css             # Design system
    ├── js/app.js                # Shared API & utils
    ├── dashboard/
    │   ├── admin.html           # Admin dashboard
    │   ├── faculty.html         # Faculty dashboard
    │   └── student.html         # Student dashboard
    └── pages/
        ├── students.html        # Student management
        ├── faculty.html         # Faculty management
        ├── courses.html         # Course management
        ├── departments.html     # Departments
        ├── attendance.html      # Attendance tracking
        ├── grades.html          # Grades & results
        ├── fees.html            # Fee management
        ├── timetable.html       # Timetable
        └── notices.html         # Notices
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.14, Django 6.0, Django REST Framework |
| Authentication | JWT (djangorestframework-simplejwt) |
| Real-time | Node.js 25, Express, Socket.io 4 |
| Frontend | Pure HTML5, CSS3, JavaScript (ES6+) |
| Charts | Chart.js |
| Fonts | Google Fonts (Inter, Outfit) |
| Database | SQLite (dev) |

---

## 🌐 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login/` | Login & get JWT tokens |
| `GET /api/auth/dashboard/stats/` | Admin dashboard stats |
| `GET/POST /api/students/` | Student CRUD |
| `GET/POST /api/faculty/` | Faculty CRUD |
| `GET/POST /api/courses/` | Course CRUD |
| `GET/POST /api/attendance/` | Attendance records |
| `POST /api/attendance/bulk-mark/` | Mark bulk attendance |
| `GET /api/attendance/stats/` | Attendance statistics |
| `GET/POST /api/grades/` | Grade records |
| `GET/POST /api/fees/` | Fee records |
| `POST /api/fees/{id}/mark-paid/` | Mark fee as paid |
| `GET /api/fees/summary/` | Fee summary |
| `GET/POST /api/timetable/` | Schedule management |
| `GET/POST /api/notices/` | Notices CRUD |

---

## ⚡ Real-time Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `attendance:mark` | Client → Server | Mark attendance |
| `attendance:updated` | Server → Clients | Live attendance update |
| `notification:send` | Client → Server | Send notification |
| `notification:new` | Server → Clients | Receive notification |
| `notice:posted` | Client → Server | New notice posted |
| `notice:new` | Server → Clients | Receive new notice |
| `grade:posted` | Client → Server | Grade posted |
| `grade:new` | Server → Clients | Receive grade update |
| `online_count` | Server → All | Online user count |

---

## 📊 Sample Data (Pre-loaded)

- **5 Departments**: CS, EC, ME, CE, MBA
- **6 Faculty Members** across departments
- **15 Students** with full profiles
- **12 Courses** across semesters
- **33 Enrollments**
- **170 Attendance Records** (last 20 days)
- **21 Grade Records**
- **60 Fee Records**
- **6 Notice Announcements**

---

## 🎨 Features

- 🌙 **Dark Theme** with purple/blue gradient accents
- ✨ **Glassmorphism** cards with blur effects
- 📊 **Interactive Charts** (Bar, Line, Doughnut, Polar Area)
- 🔴 **Real-time Updates** via Socket.io
- 🔒 **JWT Authentication** with 3 role levels
- 📱 **Responsive Design** for all screen sizes
- 🔔 **Toast Notifications** with animations
- ⚡ **Live Attendance Marking** with instant updates

---

## 🔄 Re-seed Database

```bash
cd backend
python seed_data.py
```

import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { useAuthStore } from '../store/useAuthStore.js';
import { initSocket, disconnectSocket } from '../api/socket.js';
import Login from '../pages/Login.jsx';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import StudentDashboard from '../pages/student/Dashboard.jsx';
import StudentAttendance from '../pages/student/Attendance.jsx';
import StudentGrades from '../pages/student/Grades.jsx';
import StudentTimetable from '../pages/student/Timetable.jsx';
import Courses from '../pages/Courses.jsx';
import StudentContent from '../pages/student/Content.jsx';
import StudentDoubts from '../pages/student/Doubts.jsx';
import StudentComplaints from '../pages/student/Complaints.jsx';
import StudentPlacement from '../pages/student/Placement.jsx';
import Notices from '../pages/Notices.jsx';


import FacultyDashboard from '../pages/faculty/Dashboard.jsx';
import AttendanceMarking from '../pages/faculty/Attendance.jsx';
import GradesEntry from '../pages/faculty/Grades.jsx';
import FacultyTimetable from '../pages/faculty/Timetable.jsx';
import ManageStudents from '../pages/ManageStudents.jsx';
import HODComplaints from '../pages/hod/Complaints.jsx';
import HODPerformance from '../pages/hod/Performance.jsx';
import HODFees from '../pages/hod/Fees.jsx';
import HODSeminars from '../pages/hod/Seminars.jsx';
import HODClasses from '../pages/hod/Classes.jsx';
import TimetableManagement from '../pages/hod/TimetableManagement.jsx';
const Leaves = () => <div><h1>Leaves Placeholder</h1></div>;

const AdminDashboard = () => <div><h1>Admin Dashboard Placeholder</h1></div>;
const ManageFaculty = () => <div><h1>Manage Faculty Placeholder</h1></div>;
const ManageDepartments = () => <div><h1>Manage Departments Placeholder</h1></div>;
const FeeManagement = () => <div><h1>Fee Management Placeholder</h1></div>;

const MainLayout = ({ children, title }) => {
  const { isLoggedIn } = useAuthStore();

  useEffect(() => {
    if (isLoggedIn) {
      initSocket();
    }
    return () => {
      disconnectSocket();
    };
  }, [isLoggedIn]);

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <Header title={title} />
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export const AppRoutes = () => {
  const { user, isLoggedIn } = useAuthStore();

  // Root redirect logic based on login status and role
  const getRootRedirect = () => {
    if (!isLoggedIn) return '/login';
    const role = user?.role?.toLowerCase();
    if (role === 'admin') return '/dashboard/admin';
    if (role === 'faculty' || role === 'hod') return '/dashboard/faculty';
    if (role === 'student') return '/dashboard/student';
    return '/login';
  };

  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<Login />} />

      {/* Student Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route path="/dashboard/student" element={<MainLayout><StudentDashboard /></MainLayout>} />
        <Route path="/student/attendance" element={<MainLayout><StudentAttendance /></MainLayout>} />
        <Route path="/student/grades" element={<MainLayout><StudentGrades /></MainLayout>} />
        <Route path="/student/timetable" element={<MainLayout><StudentTimetable /></MainLayout>} />
        <Route path="/student/courses" element={<MainLayout><Courses /></MainLayout>} />
        <Route path="/student/content" element={<MainLayout><StudentContent /></MainLayout>} />
        <Route path="/student/doubts" element={<MainLayout><StudentDoubts /></MainLayout>} />
        <Route path="/student/complaints" element={<MainLayout><StudentComplaints /></MainLayout>} />
        <Route path="/student/notices" element={<MainLayout><Notices /></MainLayout>} />
        <Route path="/student/placement" element={<MainLayout><StudentPlacement /></MainLayout>} />
      </Route>

      {/* Faculty & HOD Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={['faculty', 'hod']} />}>
        <Route path="/dashboard/faculty" element={<MainLayout><FacultyDashboard /></MainLayout>} />
        <Route path="/faculty/attendance" element={<MainLayout><AttendanceMarking /></MainLayout>} />
        <Route path="/faculty/grades" element={<MainLayout><GradesEntry /></MainLayout>} />
        <Route path="/faculty/timetable" element={<MainLayout><FacultyTimetable /></MainLayout>} />
        <Route path="/faculty/leaves" element={<MainLayout><Leaves /></MainLayout>} />
        <Route path="/faculty/students" element={<MainLayout><ManageStudents /></MainLayout>} />
        <Route path="/faculty/courses" element={<MainLayout><Courses /></MainLayout>} />
        <Route path="/faculty/notices" element={<MainLayout><Notices /></MainLayout>} />
      </Route>

      {/* HOD Specific Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={['hod']} />}>
        <Route path="/hod/complaints" element={<MainLayout><HODComplaints /></MainLayout>} />
        <Route path="/hod/performance" element={<MainLayout><HODPerformance /></MainLayout>} />
        <Route path="/hod/fees" element={<MainLayout><HODFees /></MainLayout>} />
        <Route path="/hod/timetable" element={<MainLayout><TimetableManagement /></MainLayout>} />
        <Route path="/hod/seminars" element={<MainLayout><HODSeminars /></MainLayout>} />
        <Route path="/hod/classes" element={<MainLayout><HODClasses /></MainLayout>} />
      </Route>

      {/* Admin Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/dashboard/admin" element={<MainLayout><AdminDashboard /></MainLayout>} />
        <Route path="/admin/students" element={<MainLayout><ManageStudents /></MainLayout>} />
        <Route path="/admin/faculty" element={<MainLayout><ManageFaculty /></MainLayout>} />
        <Route path="/admin/courses" element={<MainLayout><Courses /></MainLayout>} />
        <Route path="/admin/departments" element={<MainLayout><ManageDepartments /></MainLayout>} />
        <Route path="/admin/attendance" element={<MainLayout><AttendanceMarking /></MainLayout>} />
        <Route path="/admin/grades" element={<MainLayout><GradesEntry /></MainLayout>} />
        <Route path="/admin/timetable" element={<MainLayout><TimetableManagement /></MainLayout>} />
        <Route path="/admin/fees" element={<MainLayout><FeeManagement /></MainLayout>} />
        <Route path="/admin/notices" element={<MainLayout><Notices /></MainLayout>} />
      </Route>

      {/* Fallback Redirects */}
      <Route path="/" element={<Navigate to={getRootRedirect()} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

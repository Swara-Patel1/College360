import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { useAuthStore } from '../store/useAuthStore.js';
import { initSocket, disconnectSocket } from '../api/socket.js';
import Login from '../pages/Login.jsx';
import Landing from '../pages/Landing.jsx';
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
import Alumni from '../pages/Alumni.jsx';
import StudentFeedback from '../pages/student/Feedback.jsx';
import StudentBacklogs from '../pages/student/Backlogs.jsx';
import ExamSchedule from '../pages/ExamSchedule.jsx';
import ExamScheduling from '../pages/admin/ExamScheduling.jsx';
import LibraryManagement from '../pages/admin/LibraryManagement.jsx';
import StudentLibrary from '../pages/student/Library.jsx';
import StudentPortfolio from '../pages/student/Portfolio.jsx';
import StudentFees from '../pages/student/Fees.jsx';
import StudentRecords from '../pages/admin/StudentRecords.jsx';
import HODFeedback from '../pages/hod/Feedback.jsx';
import ParentDashboard from '../pages/parent/Dashboard.jsx';
import ParentAttendance from '../pages/parent/Attendance.jsx';
import ParentGrades from '../pages/parent/Grades.jsx';
import ParentFees from '../pages/parent/Fees.jsx';


import FacultyDashboard from '../pages/faculty/Dashboard.jsx';
import AttendanceMarking from '../pages/faculty/Attendance.jsx';
import GradesEntry from '../pages/faculty/Grades.jsx';
import FacultyTimetable from '../pages/faculty/Timetable.jsx';
import FacultyLeaves from '../pages/faculty/Leaves.jsx';
import FacultyInterchange from '../pages/faculty/Interchange.jsx';
import ManageStudents from '../pages/ManageStudents.jsx';
import HODComplaints from '../pages/hod/Complaints.jsx';
import HODPerformance from '../pages/hod/Performance.jsx';
import HODFees from '../pages/hod/Fees.jsx';
import HODSeminars from '../pages/hod/Seminars.jsx';
import HODClasses from '../pages/hod/Classes.jsx';
import HODLeaves from '../pages/hod/Leaves.jsx';
import TimetableManagement from '../pages/hod/TimetableManagement.jsx';
import HODDelegation from '../pages/hod/Delegation.jsx';

import AdminDashboard from '../pages/admin/AdminDashboard.jsx';
import ManageFaculty from '../pages/ManageFaculty.jsx';
import ManageUsers from '../pages/admin/ManageUsers.jsx';
import ManageDepartments from '../pages/ManageDepartments.jsx';
import ManageHOD from '../pages/ManageHOD.jsx';
import FeeManagement from '../pages/FeeManagement.jsx';

const MainLayout = ({ children, title }) => {
  const { isLoggedIn, user, refreshDelegatedAccess } = useAuthStore();

  useEffect(() => {
    if (isLoggedIn) {
      initSocket();
      const role = user?.role?.toLowerCase();
      if (role === 'faculty' || role === 'hod') refreshDelegatedAccess();
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
    if (role === 'parent') return '/dashboard/parent';
    return '/login';
  };

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={isLoggedIn ? <Navigate to={getRootRedirect()} replace /> : <Landing />}
      />

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
        <Route path="/student/alumni" element={<MainLayout><Alumni /></MainLayout>} />
        <Route path="/student/feedback" element={<MainLayout><StudentFeedback /></MainLayout>} />
        <Route path="/student/backlogs" element={<MainLayout><StudentBacklogs /></MainLayout>} />
        <Route path="/student/exams" element={<MainLayout><ExamSchedule /></MainLayout>} />
        <Route path="/student/library" element={<MainLayout><StudentLibrary /></MainLayout>} />
        <Route path="/student/portfolio" element={<MainLayout><StudentPortfolio /></MainLayout>} />
        <Route path="/student/fees" element={<MainLayout><StudentFees /></MainLayout>} />
      </Route>

      {/* Faculty & HOD Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={['faculty', 'hod']} />}>
        <Route path="/dashboard/faculty" element={<MainLayout><FacultyDashboard /></MainLayout>} />
        <Route path="/faculty/attendance" element={<MainLayout><AttendanceMarking /></MainLayout>} />
        <Route path="/faculty/grades" element={<MainLayout><GradesEntry /></MainLayout>} />
        <Route path="/faculty/timetable" element={<MainLayout><FacultyTimetable /></MainLayout>} />
        <Route path="/faculty/leaves" element={<MainLayout><FacultyLeaves /></MainLayout>} />
        <Route path="/faculty/interchange" element={<MainLayout><FacultyInterchange /></MainLayout>} />
        <Route path="/faculty/students" element={<MainLayout><ManageStudents /></MainLayout>} />
        <Route path="/faculty/courses" element={<MainLayout><Courses /></MainLayout>} />
        <Route path="/faculty/notices" element={<MainLayout><Notices /></MainLayout>} />
        <Route path="/faculty/exams" element={<MainLayout><ExamSchedule /></MainLayout>} />
      </Route>

      {/* HOD Specific Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={['hod']} />}>
        <Route path="/hod/complaints" element={<MainLayout><HODComplaints /></MainLayout>} />
        <Route path="/hod/performance" element={<MainLayout><HODPerformance /></MainLayout>} />
        <Route path="/hod/fees" element={<MainLayout><HODFees /></MainLayout>} />
        <Route path="/hod/seminars" element={<MainLayout><HODSeminars /></MainLayout>} />
        <Route path="/hod/classes" element={<MainLayout><HODClasses /></MainLayout>} />
        <Route path="/hod/feedback" element={<MainLayout><HODFeedback /></MainLayout>} />
        <Route path="/hod/delegation" element={<MainLayout><HODDelegation /></MainLayout>} />
      </Route>

      {/* Delegatable HOD duties — reachable by the HOD or a deputy with the matching delegation */}
      <Route element={<ProtectedRoute allowedRoles={['hod']} delegationScope="leaves" />}>
        <Route path="/hod/leaves" element={<MainLayout><HODLeaves /></MainLayout>} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['hod']} delegationScope="timetable" />}>
        <Route path="/hod/timetable" element={<MainLayout><TimetableManagement /></MainLayout>} />
      </Route>

      {/* Parent Protected Routes (read-only) */}
      <Route element={<ProtectedRoute allowedRoles={['parent']} />}>
        <Route path="/dashboard/parent" element={<MainLayout><ParentDashboard /></MainLayout>} />
        <Route path="/parent/attendance" element={<MainLayout><ParentAttendance /></MainLayout>} />
        <Route path="/parent/grades" element={<MainLayout><ParentGrades /></MainLayout>} />
        <Route path="/parent/fees" element={<MainLayout><ParentFees /></MainLayout>} />
        <Route path="/parent/notices" element={<MainLayout><Notices /></MainLayout>} />
      </Route>

      {/* Admin Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/dashboard/admin" element={<MainLayout><AdminDashboard /></MainLayout>} />
        <Route path="/admin/users" element={<MainLayout><ManageUsers /></MainLayout>} />
        <Route path="/admin/students" element={<MainLayout><ManageStudents /></MainLayout>} />
        <Route path="/admin/faculty" element={<MainLayout><ManageFaculty /></MainLayout>} />
        <Route path="/admin/hod" element={<MainLayout><ManageHOD /></MainLayout>} />
        <Route path="/admin/courses" element={<MainLayout><Courses /></MainLayout>} />
        <Route path="/admin/departments" element={<MainLayout><ManageDepartments /></MainLayout>} />
        <Route path="/admin/attendance" element={<MainLayout><AttendanceMarking /></MainLayout>} />
        <Route path="/admin/grades" element={<MainLayout><GradesEntry /></MainLayout>} />
        <Route path="/admin/timetable" element={<MainLayout><TimetableManagement /></MainLayout>} />
        <Route path="/admin/fees" element={<MainLayout><FeeManagement /></MainLayout>} />
        <Route path="/admin/notices" element={<MainLayout><Notices /></MainLayout>} />
        <Route path="/admin/alumni" element={<MainLayout><Alumni /></MainLayout>} />
        <Route path="/admin/exams" element={<MainLayout><ExamScheduling /></MainLayout>} />
        <Route path="/admin/library" element={<MainLayout><LibraryManagement /></MainLayout>} />
        <Route path="/admin/student-records" element={<MainLayout><StudentRecords /></MainLayout>} />
      </Route>

      {/* Fallback Redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

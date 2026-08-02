import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';

export default function Sidebar() {
  const { user, delegatedAccess } = useAuthStore();

  if (!user) return null;

  const role = (user.role || '').toLowerCase();
  let navItems = [];

  if (role === 'student') {
    navItems = [
      { type: 'section', label: 'Main' },
      { type: 'link', label: 'My Dashboard', icon: 'bi-speedometer2', to: '/dashboard/student' },
      { type: 'section', label: 'Academics' },
      { type: 'link', label: 'My Attendance', icon: 'bi-check2-square', to: '/student/attendance' },
      { type: 'link', label: 'My Grades', icon: 'bi-journal-text', to: '/student/grades' },
      { type: 'link', label: 'Timetable', icon: 'bi-calendar3', to: '/student/timetable' },
      { type: 'link', label: 'Exam Schedule', icon: 'bi-calendar-week', to: '/student/exams' },
      { type: 'link', label: 'Subjects', icon: 'bi-book', to: '/student/courses' },
      { type: 'link', label: 'Study Materials', icon: 'bi-journal-bookmark', to: '/student/content' },
      { type: 'link', label: 'Library', icon: 'bi-book-half', to: '/student/library' },
      { type: 'link', label: 'My Doubts Q&A', icon: 'bi-question-circle', to: '/student/doubts' },
      { type: 'section', label: 'Finance' },
      { type: 'link', label: 'Fee Payment', icon: 'bi-credit-card', to: '/student/fees' },
      { type: 'section', label: 'Support & Info' },
      { type: 'link', label: 'My Complaints', icon: 'bi-megaphone', to: '/student/complaints' },
      { type: 'link', label: 'Notices', icon: 'bi-broadcast', to: '/student/notices' },
      { type: 'section', label: 'Career' },
      { type: 'link', label: 'Placement Predictor', icon: 'bi-graph-up', to: '/student/placement' },
    ];
  } else if (role === 'faculty' || role === 'hod') {
    navItems = [
      { type: 'section', label: 'Main' },
      { type: 'link', label: 'My Dashboard', icon: 'bi-speedometer2', to: role === 'hod' ? '/hod/dashboard' : '/dashboard/faculty' },
      { type: 'section', label: 'My Classes' },
      { type: 'link', label: role === 'hod' ? 'Students Attendance' : 'Mark Attendance', icon: 'bi-check2-square', to: '/faculty/attendance' },
      { type: 'link', label: role === 'hod' ? 'Students Grades' : 'Enter Grades', icon: 'bi-journal-text', to: '/faculty/grades' },
      ...(role !== 'hod' ? [
        { type: 'link', label: 'My Timetable', icon: 'bi-calendar3', to: '/faculty/timetable' },
      ] : []),
      { type: 'link', label: 'Exam Schedule', icon: 'bi-calendar-week', to: '/faculty/exams' },
      ...(role !== 'hod' ? [
        { type: 'link', label: 'Solve Doubts', icon: 'bi-patch-question-fill', to: '/faculty/doubts' },
      ] : []),
      ...(role !== 'hod' ? [
        { type: 'section', label: 'Leave & Schedule' },
        { type: 'link', label: 'Apply Leave', icon: 'bi-airplane', to: '/faculty/leaves' },
        { type: 'link', label: 'Lecture Interchange', icon: 'bi-arrow-repeat', to: '/faculty/interchange' }
      ] : [])
    ];

    if (role === 'hod') {
      navItems.push(
        { type: 'section', label: 'HOD Actions' },
        { type: 'link', label: 'Leave Requests', icon: 'bi-clipboard-check', to: '/hod/leaves' },
        { type: 'link', label: 'Student Complaints', icon: 'bi-megaphone', to: '/hod/complaints' },
        { type: 'link', label: 'Academic Alerts', icon: 'bi-exclamation-triangle', to: '/hod/performance' },
        { type: 'link', label: 'Pending Fees', icon: 'bi-cash-coin', to: '/hod/fees' }
      );
    }

    navItems.push(
      { type: 'section', label: 'Information' },
      { type: 'link', label: 'View Students', icon: 'bi-mortarboard', to: '/faculty/students' },
      { type: 'link', label: 'View Faculty', icon: 'bi-person-video3', to: '/faculty/hod' },
      { type: 'link', label: 'Notices', icon: 'bi-broadcast', to: '/faculty/notices' }
    );

  } else if (role === 'admin') {
    navItems = [
      { type: 'section', label: 'Main' },
      { type: 'link', label: 'Dashboard', icon: 'bi-speedometer2', to: '/dashboard/admin' },
      { type: 'section', label: 'Management' },
      { type: 'link', label: 'Users', icon: 'bi-people', to: '/admin/users' },
      { type: 'link', label: 'Students', icon: 'bi-mortarboard', to: '/admin/students' },
      { type: 'link', label: 'Faculty', icon: 'bi-person-video3', to: '/admin/faculty' },
      { type: 'link', label: 'HODs', icon: 'bi-person-badge', to: '/admin/hod' },
      { type: 'link', label: 'Subjects', icon: 'bi-book', to: '/admin/courses' },
      { type: 'link', label: 'Departments', icon: 'bi-building', to: '/admin/departments' },
      { type: 'section', label: 'Academic' },
      { type: 'link', label: 'Attendance', icon: 'bi-check2-square', to: '/admin/attendance' },
      { type: 'link', label: 'Grades', icon: 'bi-journal-text', to: '/admin/grades' },
      { type: 'link', label: 'Timetable', icon: 'bi-calendar3', to: '/admin/timetable' },
      { type: 'link', label: 'Exam Scheduling', icon: 'bi-calendar-week', to: '/admin/exams' },
      { type: 'link', label: 'Library', icon: 'bi-book-half', to: '/admin/library' },
      { type: 'section', label: 'Finance & Comms' },
      { type: 'link', label: 'Fee Management', icon: 'bi-cash-coin', to: '/admin/fees' },
      { type: 'link', label: 'Notices', icon: 'bi-broadcast', to: '/admin/notices' }
    ];
  }

  return (
    <aside className="sidebar" id="sidebar">
      <nav className="sidebar-nav">
        {navItems.map((item, idx) => {
          if (item.type === 'section') {
            return (
              <div key={`sec-${idx}`} className="nav-section-title">
                {item.label}
              </div>
            );
          }
          return (
            <NavLink
              key={`link-${idx}`}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <i className={`bi ${item.icon} nav-icon`}></i> {item.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

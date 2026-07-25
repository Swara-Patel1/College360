import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';
import { Utils } from '../api/client.js';

export default function Sidebar() {
  const { user, logout, delegatedAccess } = useAuthStore();
  const navigate = useNavigate();

  if (!user) return null;

  const role = (user.role || '').toLowerCase();
  const initials = Utils.getInitials(`${user.first_name || ''} ${user.last_name || ''}`);
  const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User';

  let brandSubtitle = 'Portal';
  let brandHref = '#';
  let navItems = [];

  if (role === 'student') {
    brandSubtitle = 'Student Portal';
    brandHref = '/dashboard/student';
    navItems = [
      { type: 'section', label: 'Main' },
      { type: 'link', label: 'My Dashboard', icon: 'bi-speedometer2', to: '/dashboard/student' },
      { type: 'section', label: 'Academics' },
      { type: 'link', label: 'My Attendance', icon: 'bi-check2-square', to: '/student/attendance' },
      { type: 'link', label: 'My Grades', icon: 'bi-journal-text', to: '/student/grades' },
      { type: 'link', label: 'Backlogs / KT', icon: 'bi-graph-down-arrow', to: '/student/backlogs' },
      { type: 'link', label: 'Timetable', icon: 'bi-calendar3', to: '/student/timetable' },
      { type: 'link', label: 'Exam Schedule', icon: 'bi-calendar-week', to: '/student/exams' },
      { type: 'link', label: 'Courses', icon: 'bi-book', to: '/student/courses' },
      { type: 'link', label: 'Study Materials', icon: 'bi-journal-bookmark', to: '/student/content' },
      { type: 'link', label: 'Library', icon: 'bi-book-half', to: '/student/library' },
      { type: 'link', label: 'My Doubts Q&A', icon: 'bi-question-circle', to: '/student/doubts' },
      { type: 'link', label: 'Faculty Feedback', icon: 'bi-star', to: '/student/feedback' },
      { type: 'section', label: 'Finance' },
      { type: 'link', label: 'Fee Payment', icon: 'bi-credit-card', to: '/student/fees' },
      { type: 'section', label: 'Support & Info' },
      { type: 'link', label: 'My Complaints', icon: 'bi-megaphone', to: '/student/complaints' },
      { type: 'link', label: 'Notices', icon: 'bi-broadcast', to: '/student/notices' },
      { type: 'section', label: 'Career' },
      { type: 'link', label: 'My Portfolio', icon: 'bi-trophy', to: '/student/portfolio' },
      { type: 'link', label: 'Placement Score', icon: 'bi-bullseye', to: '/student/placement' },
      { type: 'link', label: 'Alumni Network', icon: 'bi-mortarboard', to: '/student/alumni' }
    ];
  } else if (role === 'faculty' || role === 'hod') {
    brandSubtitle = role === 'hod' ? 'HOD Portal' : 'Faculty Portal';
    brandHref = '/dashboard/faculty';
    navItems = [
      { type: 'section', label: 'Main' },
      { type: 'link', label: 'My Dashboard', icon: 'bi-speedometer2', to: '/dashboard/faculty' },
      { type: 'section', label: 'My Classes' },
      { type: 'link', label: 'Mark Attendance', icon: 'bi-check2-square', to: '/faculty/attendance' },
      { type: 'link', label: 'Enter Grades', icon: 'bi-journal-text', to: '/faculty/grades' },
      { type: 'link', label: 'My Timetable', icon: 'bi-calendar3', to: '/faculty/timetable' },
      { type: 'link', label: 'Exam Schedule', icon: 'bi-calendar-week', to: '/faculty/exams' },
      { type: 'section', label: 'Leave & Schedule' },
      { type: 'link', label: 'Apply Leave', icon: 'bi-airplane', to: '/faculty/leaves' },
      { type: 'link', label: 'Lecture Interchange', icon: 'bi-arrow-repeat', to: '/faculty/interchange' }
    ];

    if (role === 'hod') {
      navItems.push(
        { type: 'section', label: 'HOD Actions' },
        { type: 'link', label: 'Leave Requests', icon: 'bi-clipboard-check', to: '/hod/leaves' },
        { type: 'link', label: 'Student Complaints', icon: 'bi-megaphone', to: '/hod/complaints' },
        { type: 'link', label: 'Academic Alerts', icon: 'bi-exclamation-triangle', to: '/hod/performance' },
        { type: 'link', label: 'Pending Fees', icon: 'bi-cash-coin', to: '/hod/fees' },
        { type: 'link', label: 'Manage Timetable', icon: 'bi-calendar-week', to: '/hod/timetable' },
        { type: 'link', label: 'Seminars', icon: 'bi-mic', to: '/hod/seminars' },
        { type: 'link', label: 'Class Rankings', icon: 'bi-bar-chart', to: '/hod/classes' },
        { type: 'link', label: 'Faculty Feedback', icon: 'bi-star', to: '/hod/feedback' },
        { type: 'link', label: 'Delegate Duties', icon: 'bi-people', to: '/hod/delegation' }
      );
    }

    // Deputy faculty: surface any HOD duties temporarily delegated to them.
    const scopes = delegatedAccess || [];
    if (role === 'faculty' && scopes.length) {
      navItems.push({ type: 'section', label: 'Acting HOD (Delegated)' });
      if (scopes.includes('leaves')) navItems.push({ type: 'link', label: 'Leave Requests', icon: 'bi-clipboard-check', to: '/hod/leaves' });
      if (scopes.includes('timetable')) navItems.push({ type: 'link', label: 'Manage Timetable', icon: 'bi-calendar-week', to: '/hod/timetable' });
    }

    navItems.push(
      { type: 'section', label: 'Information' },
      { type: 'link', label: 'View Students', icon: 'bi-mortarboard', to: '/faculty/students' },
      { type: 'link', label: 'Courses', icon: 'bi-book', to: '/faculty/courses' },
      { type: 'link', label: 'Notices', icon: 'bi-broadcast', to: '/faculty/notices' }
    );
  } else if (role === 'parent') {
    brandSubtitle = 'Parent Portal';
    brandHref = '/dashboard/parent';
    navItems = [
      { type: 'section', label: 'Main' },
      { type: 'link', label: 'Overview', icon: 'bi-speedometer2', to: '/dashboard/parent' },
      { type: 'section', label: 'My Child' },
      { type: 'link', label: 'Attendance', icon: 'bi-check2-square', to: '/parent/attendance' },
      { type: 'link', label: 'Grades', icon: 'bi-journal-text', to: '/parent/grades' },
      { type: 'link', label: 'Fee Status', icon: 'bi-cash-coin', to: '/parent/fees' },
      { type: 'section', label: 'Info' },
      { type: 'link', label: 'Notices', icon: 'bi-broadcast', to: '/parent/notices' },
    ];
  } else if (role === 'admin') {
    brandSubtitle = 'Admin Panel';
    brandHref = '/dashboard/admin';
    navItems = [
      { type: 'section', label: 'Main' },
      { type: 'link', label: 'Dashboard', icon: 'bi-speedometer2', to: '/dashboard/admin' },
      { type: 'section', label: 'Management' },
      { type: 'link', label: 'Users', icon: 'bi-people', to: '/admin/users' },
      { type: 'link', label: 'Students', icon: 'bi-mortarboard', to: '/admin/students' },
      { type: 'link', label: 'Faculty', icon: 'bi-person-video3', to: '/admin/faculty' },
      { type: 'link', label: 'HODs', icon: 'bi-person-badge', to: '/admin/hod' },
      { type: 'link', label: 'Courses', icon: 'bi-book', to: '/admin/courses' },
      { type: 'link', label: 'Departments', icon: 'bi-building', to: '/admin/departments' },
      { type: 'link', label: 'Alumni', icon: 'bi-mortarboard', to: '/admin/alumni' },
      { type: 'link', label: 'Student Records', icon: 'bi-trophy', to: '/admin/student-records' },
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

  const handleUserLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar" id="sidebar">
      <NavLink className="sidebar-brand" to={brandHref}>
        <div className="sidebar-brand-icon"><i className="bi bi-mortarboard-fill"></i></div>
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-title">EduPulse</div>
          <div className="sidebar-brand-subtitle">{brandSubtitle}</div>
        </div>
      </NavLink>

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

      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={handleUserLogout}>
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{userName}</div>
            <div className="user-role">
              {role === 'hod' ? 'HOD' : role.charAt(0).toUpperCase() + role.slice(1)}
            </div>
          </div>
          <span style={{ color: 'var(--text-muted)', cursor: 'pointer' }}><i className="bi bi-power"></i></span>
        </div>
      </div>
    </aside>
  );
}

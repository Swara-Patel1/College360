import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';
import { Utils } from '../api/client.js';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
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
      { type: 'link', label: 'My Dashboard', icon: '📊', to: '/dashboard/student' },
      { type: 'section', label: 'Academics' },
      { type: 'link', label: 'My Attendance', icon: '✅', to: '/student/attendance' },
      { type: 'link', label: 'My Grades', icon: '📝', to: '/student/grades' },
      { type: 'link', label: 'Timetable', icon: '📅', to: '/student/timetable' },
      { type: 'link', label: 'Courses', icon: '📚', to: '/student/courses' },
      { type: 'link', label: 'Study Materials', icon: '📖', to: '/student/content' },
      { type: 'link', label: 'My Doubts Q&A', icon: '❓', to: '/student/doubts' },
      { type: 'section', label: 'Support & Info' },
      { type: 'link', label: 'My Complaints', icon: '📣', to: '/student/complaints' },
      { type: 'link', label: 'Notices', icon: '📢', to: '/student/notices' },
      { type: 'section', label: 'Career' },
      { type: 'link', label: 'Placement Score', icon: '🎯', to: '/student/placement' }
    ];
  } else if (role === 'faculty' || role === 'hod') {
    brandSubtitle = role === 'hod' ? 'HOD Portal' : 'Faculty Portal';
    brandHref = '/dashboard/faculty';
    navItems = [
      { type: 'section', label: 'Main' },
      { type: 'link', label: 'My Dashboard', icon: '📊', to: '/dashboard/faculty' },
      { type: 'section', label: 'My Classes' },
      { type: 'link', label: 'Mark Attendance', icon: '✅', to: '/faculty/attendance' },
      { type: 'link', label: 'Enter Grades', icon: '📝', to: '/faculty/grades' },
      { type: 'link', label: 'My Timetable', icon: '📅', to: '/faculty/timetable' },
      { type: 'section', label: 'Leave & Schedule' },
      { type: 'link', label: 'Apply Leave', icon: '🏖️', to: '/faculty/leaves' },
      { type: 'link', label: 'Lecture Interchange', icon: '🔄', to: '/faculty/interchange' }
    ];

    if (role === 'hod') {
      navItems.push(
        { type: 'section', label: 'HOD Actions' },
        { type: 'link', label: 'Leave Requests', icon: '📋', to: '/hod/leaves' },
        { type: 'link', label: 'Student Complaints', icon: '📣', to: '/hod/complaints' },
        { type: 'link', label: 'Academic Alerts', icon: '⚠️', to: '/hod/performance' },
        { type: 'link', label: 'Pending Fees', icon: '💰', to: '/hod/fees' },
        { type: 'link', label: 'Manage Timetable', icon: '🗓️', to: '/hod/timetable' },
        { type: 'link', label: 'Seminars', icon: '🎙️', to: '/hod/seminars' },
        { type: 'link', label: 'Class Rankings', icon: '📊', to: '/hod/classes' }
      );
    }

    navItems.push(
      { type: 'section', label: 'Information' },
      { type: 'link', label: 'View Students', icon: '🎓', to: '/faculty/students' },
      { type: 'link', label: 'Courses', icon: '📚', to: '/faculty/courses' },
      { type: 'link', label: 'Notices', icon: '📢', to: '/faculty/notices' }
    );
  } else if (role === 'admin') {
    brandSubtitle = 'Admin Panel';
    brandHref = '/dashboard/admin';
    navItems = [
      { type: 'section', label: 'Main' },
      { type: 'link', label: 'Dashboard', icon: '📊', to: '/dashboard/admin' },
      { type: 'section', label: 'Management' },
      { type: 'link', label: 'Students', icon: '🎓', to: '/admin/students' },
      { type: 'link', label: 'Faculty', icon: '👨‍🏫', to: '/admin/faculty' },
      { type: 'link', label: 'HODs', icon: '🏷️', to: '/admin/hod' },
      { type: 'link', label: 'Courses', icon: '📚', to: '/admin/courses' },
      { type: 'link', label: 'Departments', icon: '🏛️', to: '/admin/departments' },
      { type: 'section', label: 'Academic' },
      { type: 'link', label: 'Attendance', icon: '✅', to: '/admin/attendance' },
      { type: 'link', label: 'Grades', icon: '📝', to: '/admin/grades' },
      { type: 'link', label: 'Timetable', icon: '📅', to: '/admin/timetable' },
      { type: 'section', label: 'Finance & Comms' },
      { type: 'link', label: 'Fee Management', icon: '💰', to: '/admin/fees' },
      { type: 'link', label: 'Notices', icon: '📢', to: '/admin/notices' }
    ];
  }

  const handleUserLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar" id="sidebar">
      <NavLink className="sidebar-brand" to={brandHref}>
        <div className="sidebar-brand-icon">🎓</div>
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
              <span className="nav-icon">{item.icon}</span> {item.label}
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
          <span style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>⏻</span>
        </div>
      </div>
    </aside>
  );
}

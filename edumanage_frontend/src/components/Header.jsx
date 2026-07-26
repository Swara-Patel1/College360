import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';
import { useNotifStore } from '../store/useNotifStore.js';
import { API, Utils } from '../api/client.js';

export default function Header({ title = 'College360', showSearch = false, onSearchChange = null }) {
  const { user, logout, studentProfile } = useAuthStore();
  const navigate = useNavigate();

  const notifications = useNotifStore((state) => state.notifications);
  const unreadCount = useNotifStore((state) => state.unreadCount);
  const setNotifications = useNotifStore((state) => state.setNotifications);

  // Profile Dropdown & Theme State
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeSubmenuOpen, setThemeSubmenuOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  const dropdownRef = useRef(null);

  // Initialize theme on document attribute and body class
  useEffect(() => {
    if (currentTheme === 'light') {
      document.body.classList.add('light-theme');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.body.classList.remove('light-theme');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    localStorage.setItem('theme', currentTheme);
  }, [currentTheme]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setMenuOpen(false);
        setThemeSubmenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-load studentProfile if logged in as student but profile not yet in store
  const { refreshStudentProfile } = useAuthStore();
  useEffect(() => {
    const role = (user?.role || '').toLowerCase();
    if (role === 'student' && !studentProfile) {
      refreshStudentProfile();
    }
  }, [user, studentProfile, refreshStudentProfile]);

  const handleThemeChange = (theme) => {
    setCurrentTheme(theme);
    setThemeSubmenuOpen(false);
    setMenuOpen(false);
  };

  // Determine brand subtitle & link based on role
  const role = (user?.role || '').toLowerCase();
  let brandSubtitle = 'Portal';
  let brandHref = '#';
  if (role === 'student') {
    brandSubtitle = 'Student Portal';
    brandHref = '/dashboard/student';
  } else if (role === 'faculty' || role === 'hod') {
    brandSubtitle = role === 'hod' ? 'HOD Portal' : 'Faculty Portal';
    brandHref = role === 'hod' ? '/hod/dashboard' : '/dashboard/faculty';
  } else if (role === 'parent') {
    brandSubtitle = 'Parent Portal';
    brandHref = '/dashboard/parent';
  } else if (role === 'admin') {
    brandSubtitle = 'Admin Panel';
    brandHref = '/dashboard/admin';
  }

  const initials = Utils.getInitials(`${user?.first_name || ''} ${user?.last_name || ''}`);
  const userName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'User';

  useEffect(() => {
    if (!user) return;

    const loadNotifs = async () => {
      try {
        const rows = await API.get(`notifications?recipient_id=eq.${user.id}&order=sent_at.desc&limit=10`);
        if (rows) setNotifications(rows);
      } catch (e) {
        console.warn('Failed to load notifications in Header:', e);
      }
    };

    loadNotifs();

    const handleNewNotif = () => loadNotifs();
    window.addEventListener('socket:notification:new', handleNewNotif);
    window.addEventListener('socket:notice:new', handleNewNotif);

    return () => {
      window.removeEventListener('socket:notification:new', handleNewNotif);
      window.removeEventListener('socket:notice:new', handleNewNotif);
    };
  }, [user, setNotifications]);

  const handleBellClick = () => {
    if (!user) return;
    if (role === 'admin') {
      navigate('/admin/notices');
    } else if (role === 'faculty' || role === 'hod') {
      navigate('/faculty/notices');
    } else {
      navigate('/student/notices');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentDateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const firstName = user?.first_name || user?.username || 'User';
  const greetingTitle = `Hello, ${firstName}!`;

  let detailsSubtitle = currentDateStr;
  if (role === 'student') {
    const prof = studentProfile || JSON.parse(localStorage.getItem('student_profile') || 'null');
    const code = prof?.enrollment_no || user?.enrollment_no || user?.username || '';
    const dept = prof?.department_name || prof?.department?.name || '';
    const semNum = prof?.semester || prof?.current_semester?.number || '';
    const yr = prof?.year_of_study || (semNum ? Math.ceil(Number(semNum) / 2) : '');
    const parts = [user?.email, dept, yr ? `Year ${yr}` : null, semNum ? `Semester ${semNum}` : null].filter(Boolean);
    detailsSubtitle = parts.join(' · ');
  } else if (role === 'faculty' || role === 'hod') {
    const desig = user?.designation || (role === 'hod' ? 'Head of Department' : 'Faculty');
    const dept = user?.department || 'Department';
    const exp = user?.experience !== undefined ? `Exp: ${user.experience} yrs` : null;
    const parts = [desig, dept, exp].filter(Boolean);
    detailsSubtitle = parts.join(' · ');
  } else if (role === 'admin') {
    detailsSubtitle = 'System Administrator · College360 Operations';
  }

  const displayTitle = (!title || title === 'College360' || title === 'Dashboard') ? greetingTitle : title;

  return (
    <header className="header">
      {/* Integrated Brand Logo & Subtitle */}
      <Link className="header-brand" to={brandHref}>
        <div className="header-brand-icon">
          <i className="bi bi-mortarboard-fill"></i>
        </div>
        <div className="header-brand-text">
          <div className="header-brand-title">College360</div>
          <div className="header-brand-subtitle">{brandSubtitle}</div>
        </div>
      </Link>

      <div className="header-divider"></div>

      {/* Greeting Title & Profile Details */}
      <div className="header-info">
        <div className="header-title">{displayTitle}</div>
        <div className="header-subtitle">{detailsSubtitle}</div>
      </div>

      <div className="header-spacer"></div>

      {showSearch && (
        <div className="header-search">
          <span><i className="bi bi-search"></i></span>
          <input
            type="text"
            placeholder="Search anything..."
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          />
        </div>
      )}

      {/* Header Right Actions */}
      <div className="header-actions">
        {/* Notice Bell */}
        <button
          className="header-btn"
          id="notifBtn"
          title="Notices"
          onClick={handleBellClick}
        >
          <i className="bi bi-bell"></i>
          {unreadCount > 0 && <span className="notif-dot" id="notifDot"></span>}
        </button>

        {/* Profile Pill & Dropdown Menu */}
        <div className="header-user-dropdown-wrapper" ref={dropdownRef}>
          <div
            className={`header-user-badge ${menuOpen ? 'active' : ''}`}
            onClick={() => {
              setMenuOpen(!menuOpen);
              if (menuOpen) setThemeSubmenuOpen(false);
            }}
            title="Profile & Theme Settings"
          >
            <div className="header-user-avatar">{initials}</div>
            <div className="header-user-info">
              <span className="header-user-name">{userName}</span>
              <span className="header-user-role">{role === 'hod' ? 'HOD' : role.toUpperCase()}</span>
            </div>
            <i className={`bi bi-chevron-${menuOpen ? 'up' : 'down'}`} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}></i>
          </div>

          {/* Dropdown Box */}
          {menuOpen && (
            <div className="header-user-dropdown">
              {/* Option 1: Theme */}
              <div
                className="dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setThemeSubmenuOpen(!themeSubmenuOpen);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="bi bi-palette" style={{ fontSize: '1rem', color: 'var(--primary-light)' }}></i>
                  <span>Theme</span>
                </div>
                <i className={`bi bi-chevron-${themeSubmenuOpen ? 'down' : 'right'}`} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}></i>
              </div>

              {/* Theme Submenu (Light & Dark options) */}
              {themeSubmenuOpen && (
                <div className="theme-submenu">
                  <div
                    className={`theme-option ${currentTheme === 'light' ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleThemeChange('light');
                    }}
                  >
                    <i className="bi bi-sun-fill" style={{ color: '#f59e0b' }}></i>
                    <span>Light</span>
                    {currentTheme === 'light' && <i className="bi bi-check2 check-mark"></i>}
                  </div>

                  <div
                    className={`theme-option ${currentTheme === 'dark' ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleThemeChange('dark');
                    }}
                  >
                    <i className="bi bi-moon-stars-fill" style={{ color: '#818cf8' }}></i>
                    <span>Dark</span>
                    {currentTheme === 'dark' && <i className="bi bi-check2 check-mark"></i>}
                  </div>
                </div>
              )}

              <div className="dropdown-divider"></div>

              {/* Option 2: Logout */}
              <div
                className="dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="bi bi-box-arrow-right" style={{ fontSize: '1rem', color: '#ef4444' }}></i>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>Logout</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

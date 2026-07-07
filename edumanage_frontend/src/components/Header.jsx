import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';
import { useNotifStore } from '../store/useNotifStore.js';
import { API, Utils } from '../api/client.js';

export default function Header({ title = 'College360', showSearch = false, onSearchChange = null }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const notifications = useNotifStore((state) => state.notifications);
  const unreadCount = useNotifStore((state) => state.unreadCount);
  const setNotifications = useNotifStore((state) => state.setNotifications);
  const markAsRead = useNotifStore((state) => state.markAsRead);

  // Sync notifications count
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

    // Listen to real-time notifications/notice events to refresh notifications list
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
    const role = (user.role || '').toLowerCase();
    if (role === 'admin') {
      navigate('/admin/notices');
    } else if (role === 'faculty' || role === 'hod') {
      navigate('/faculty/notices');
    } else {
      navigate('/student/notices');
    }
  };

  const handleMarkRead = async (notifId) => {
    try {
      await API.patch(`notifications?notification_id=eq.${notifId}`, { is_read: true });
      markAsRead(notifId);
    } catch (e) {
      console.warn('Failed to mark notification as read:', e);
    }
  };

  const currentDateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <header className="header" style={{ position: 'relative', zIndex: 10 }}>
      <div>
        <div className="header-title">{title}</div>
        <div className="header-subtitle" id="currentDate">{currentDateStr}</div>
      </div>

      <div className="header-spacer"></div>

      {showSearch && (
        <div className="header-search">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search anything..."
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          />
        </div>
      )}

      <div className="header-actions">
        <button
          className="header-btn"
          id="notifBtn"
          title="Notices"
          onClick={handleBellClick}
          style={{ position: 'relative' }}
        >
          🔔
          {unreadCount > 0 && <span className="notif-dot" id="notifDot"></span>}
        </button>
      </div>
    </header>
  );
}

import { create } from 'zustand';

export const useNotifStore = create((set) => ({
  toasts: [],
  notifications: [],
  unreadCount: 0,
  
  addToast: (message, type = 'info', title = null) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, title }],
    }));
    
    // Auto-remove toast after 4 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4000);
  },
  
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  
  setNotifications: (notifications) => {
    const list = Array.isArray(notifications) ? notifications : [];
    const unread = list.filter(n => !n.is_read).length;
    set({ notifications: list, unreadCount: unread });
  },
  
  markAsRead: (notificationId) => {
    set((state) => {
      const updated = state.notifications.map(n => 
        n.notification_id === notificationId ? { ...n, is_read: true } : n
      );
      return {
        notifications: updated,
        unreadCount: updated.filter(n => !n.is_read).length
      };
    });
  }
}));

// Quick API helper to mimic original Toast global usage
export const Toast = {
  success: (msg, title) => useNotifStore.getState().addToast(msg, 'success', title),
  error: (msg, title) => useNotifStore.getState().addToast(msg, 'error', title),
  info: (msg, title) => useNotifStore.getState().addToast(msg, 'info', title),
  warning: (msg, title) => useNotifStore.getState().addToast(msg, 'warning', title),
};

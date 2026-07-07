import { io } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore.js';
import { useNotifStore, Toast } from '../store/useNotifStore.js';

let socket = null;

export const getSocket = () => socket;

export const initSocket = () => {
  const token = localStorage.getItem('access_token');
  if (!token) return null;

  if (socket?.connected) return socket;

  socket = io('http://localhost:3001', {
    auth: { token },
    timeout: 2000,
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log('⚡ Connected to real-time Socket.io server.');
  });

  socket.on('disconnect', () => {
    console.log('🔌 Disconnected from Socket.io server.');
  });

  socket.on('online_count', (count) => {
    // We can store this count globally or let pages check it
    window.dispatchEvent(new CustomEvent('socket:online_count', { detail: count }));
  });

  socket.on('notification:new', (notif) => {
    Toast.info(notif.message, notif.title || 'New Notification');
    // Fetch notifications again or append it
    window.dispatchEvent(new CustomEvent('socket:notification:new', { detail: notif }));
  });

  socket.on('notice:new', (notice) => {
    Toast.info(`Announcement: ${notice.title}`, 'New Notice Posted');
    window.dispatchEvent(new CustomEvent('socket:notice:new', { detail: notice }));
  });

  socket.on('attendance:updated', (data) => {
    window.dispatchEvent(new CustomEvent('socket:attendance:updated', { detail: data }));
  });

  socket.on('grade:new', (grade) => {
    Toast.success(`Grade entered for ${grade.course_name || 'Subject'}: ${grade.grade}`, 'New Grade Posted');
    window.dispatchEvent(new CustomEvent('socket:grade:new', { detail: grade }));
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

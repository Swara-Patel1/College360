import { create } from 'zustand';
import { API } from '../api/client.js';
import { Toast } from './useNotifStore.js';

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('access_token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  studentProfile: JSON.parse(localStorage.getItem('student_profile') || 'null'),
  isLoggedIn: !!localStorage.getItem('access_token'),

  login: async (usernameOrEmail, password) => {
    try {
      const data = await API.post('auth/login', {
        email: usernameOrEmail,
        username: usernameOrEmail,
        password: password
      });
      
      if (data && data.access) {
        // Persist auth to localStorage so ProtectedRoute checks pass after redirect
        localStorage.setItem('access_token', data.access);
        localStorage.setItem('user', JSON.stringify(data.user));

        set({
          token: data.access,
          user: data.user,
          isLoggedIn: true
        });
        
        // Wait briefly for background student profile fetch to execute
        if (data.user.role === 'student') {
          setTimeout(() => {
            const cachedProfile = localStorage.getItem('student_profile');
            if (cachedProfile) {
              set({ studentProfile: JSON.parse(cachedProfile) });
            }
          }, 800);
        }
        
        Toast.success(`Welcome back, ${data.user.first_name}!`);
        return data.user;
      }
    } catch (err) {
      console.error('Login error:', err);
      const errMsg = err?.message || err?.error || 'Invalid credentials or network error.';
      Toast.error(errMsg, 'Authentication Failed');
      throw err;
    }
  },

  logout: () => {
    localStorage.clear();
    set({
      token: null,
      user: null,
      studentProfile: null,
      isLoggedIn: false
    });
    Toast.info('Logged out successfully.');
  },

  refreshStudentProfile: async () => {
    const user = get().user;
    if (!user || user.role !== 'student') return;
    
    try {
      const profile = await API.get('students/my_profile');
      if (profile) {
        set({ studentProfile: profile });
        localStorage.setItem('student_profile', JSON.stringify(profile));
      }
    } catch (e) {
      console.error('Could not refresh student profile:', e);
    }
  }
}));

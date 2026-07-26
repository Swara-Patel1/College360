import { create } from 'zustand';
import { API } from '../api/client.js';
import { Toast } from './useNotifStore.js';

// Invalidate stale student_profile cache that has no user_id (from before the fix)
const _cachedProfile = JSON.parse(localStorage.getItem('student_profile') || 'null');
const _cachedUser = JSON.parse(localStorage.getItem('user') || 'null');
if (_cachedProfile && (!_cachedProfile.user_id || _cachedProfile.user_id !== _cachedUser?.id)) {
  localStorage.removeItem('student_profile');
}

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('access_token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  studentProfile: JSON.parse(localStorage.getItem('student_profile') || 'null'),
  delegatedAccess: JSON.parse(localStorage.getItem('delegated_access') || '[]'),
  isLoggedIn: !!localStorage.getItem('access_token'),

  login: async (usernameOrEmail, password) => {
    try {
      localStorage.removeItem('student_profile');
      localStorage.removeItem('delegated_access');

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
          studentProfile: null,
          isLoggedIn: true
        });

        // Faculty may hold temporary delegated HOD powers — load them.
        if (data.user.role === 'faculty' || data.user.role === 'hod') {
          get().refreshDelegatedAccess();
        }

        // Refresh student profile for the newly logged in student
        if (data.user.role === 'student') {
          get().refreshStudentProfile();
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
      delegatedAccess: [],
      isLoggedIn: false
    });
    Toast.info('Logged out successfully.');
  },

  /** Refresh the set of delegated HOD scopes (e.g. ['leaves','timetable']) held by this user. */
  refreshDelegatedAccess: async () => {
    const user = get().user;
    if (!user) return;
    try {
      const acc = await API.get(`hod/my-access?user_id=eq.${user.id}`);
      const scopes = (acc && acc.isDelegate) ? (acc.scopes || []) : [];
      localStorage.setItem('delegated_access', JSON.stringify(scopes));
      set({ delegatedAccess: scopes });
    } catch (e) {
      console.error('Could not load delegated access:', e);
    }
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

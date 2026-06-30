/* ============================================================
   EDUPULSE — Shared API & Auth Utilities
   ============================================================ */

const API_BASE = 'http://127.0.0.1:8000/api';
const SOCKET_URL = 'http://localhost:3001';

// ---- Auth ----
const Auth = {
  getToken: () => localStorage.getItem('access_token'),
  getUser: () => JSON.parse(localStorage.getItem('user') || 'null'),
  isLoggedIn: () => !!localStorage.getItem('access_token'),

  logout() {
    localStorage.clear();
    window.location.href = '../index.html';
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '../index.html';
      return null;
    }
    return this.getUser();
  },

  requireRole(role) {
    const user = this.requireAuth();
    if (!user) return null;
    if (user.role !== role) {
      const destinations = { admin: 'admin.html', faculty: 'faculty.html', student: 'student.html' };
      window.location.href = destinations[user.role] || '../index.html';
      return null;
    }
    return user;
  }
};

// ---- API ----
const API = {
  async request(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        // Try to refresh token
        const refreshed = await this.refreshToken();
        if (!refreshed) { Auth.logout(); return null; }
        return this.request(endpoint, options);
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw err;
      }

      return response.status === 204 ? null : await response.json();
    } catch (err) {
      if (err instanceof TypeError) {
        Toast.show('Cannot connect to server. Make sure Django is running.', 'error');
      }
      throw err;
    }
  },

  async refreshToken() {
    const refresh = localStorage.getItem('refresh_token');
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem('access_token', data.access);
      return true;
    } catch { return false; }
  },

  get: (url) => API.request(url),
  post: (url, data) => API.request(url, { method: 'POST', body: JSON.stringify(data) }),
  put: (url, data) => API.request(url, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (url, data) => API.request(url, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (url) => API.request(url, { method: 'DELETE' }),
};

// ---- Toast Notifications ----
const Toast = {
  container: null,
  icons: { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' },

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'info', title = null, duration = 4000) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${this.icons[type]}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        <div class="toast-message">${message}</div>
      </div>
    `;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success: (msg, title) => Toast.show(msg, 'success', title),
  error: (msg, title) => Toast.show(msg, 'error', title),
  info: (msg, title) => Toast.show(msg, 'info', title),
  warning: (msg, title) => Toast.show(msg, 'warning', title),
};

// ---- Modal ----
const Modal = {
  open(id) { document.getElementById(id)?.classList.add('open'); },
  close(id) { document.getElementById(id)?.classList.remove('open'); },
  closeAll() { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); },
};

// Click outside to close modals
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) Modal.closeAll();
});

// ---- Helpers ----
const Utils = {
  formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  formatCurrency(amount) {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN')}`;
  },

  getInitials(name) {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  },

  getRandomColor(seed) {
    const colors = ['#6C63FF', '#00D4AA', '#FF6B6B', '#FF9F43', '#54A0FF', '#C084FC', '#06B6D4'];
    const idx = seed ? seed.toString().charCodeAt(0) % colors.length : 0;
    return colors[idx];
  },

  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  paginateArray(arr, page, perPage = 10) {
    const start = (page - 1) * perPage;
    return arr.slice(start, start + perPage);
  },

  getStatusBadge(status) {
    const map = {
      active: 'success', inactive: 'muted', graduated: 'info',
      paid: 'success', pending: 'warning', overdue: 'danger', waived: 'muted',
      present: 'success', absent: 'danger', late: 'warning', excused: 'info',
    };
    return `<span class="badge badge-${map[status] || 'muted'}">${status}</span>`;
  },

  getGradeBadge(grade) {
    const map = { 'O': 'success', 'A+': 'success', 'A': 'info', 'B+': 'info', 'B': 'primary', 'C': 'warning', 'D': 'warning', 'F': 'danger' };
    return `<span class="badge badge-${map[grade] || 'muted'}">${grade}</span>`;
  }
};

// ---- Sidebar Active State ----
function initNav() {
  const currentPage = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href');
    if (href && href.includes(currentPage)) {
      item.classList.add('active');
    }
  });
}

// ---- User Display ----
function initUserDisplay() {
  const user = Auth.getUser();
  if (!user) return;
  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user.first_name + ' ' + user.last_name);
  document.querySelectorAll('[data-user-role]').forEach(el => el.textContent = user.role);
  document.querySelectorAll('[data-user-initials]').forEach(el => el.textContent = Utils.getInitials(user.first_name + ' ' + user.last_name));
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initUserDisplay();
});

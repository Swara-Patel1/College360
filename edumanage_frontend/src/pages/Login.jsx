import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';
import { API } from '../api/client.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const user = useAuthStore((state) => state.user);
  const userRole = user?.role;

  const canvasRef = useRef(null);
  const hasNavigated = useRef(false);

  // Redirect if already logged in — use primitive `userRole` (string) not the
  // full `user` object to avoid infinite re-render loop (object ref changes each render).
  useEffect(() => {
    if (isLoggedIn && userRole && !hasNavigated.current) {
      hasNavigated.current = true;
      const role = userRole.toLowerCase();
      const destinations = {
        admin: '/dashboard/admin',
        faculty: '/dashboard/faculty',
        hod: '/dashboard/faculty',
        student: '/dashboard/student',
      };
      navigate(destinations[role] || '/dashboard/admin', { replace: true });
    }
  }, [isLoggedIn, userRole, navigate]);

  // Particle background animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);

    const particles = [];
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.5,
        dy: -Math.random() * 0.8 - 0.2,
        opacity: Math.random() * 0.5 + 0.1,
        color: Math.random() > 0.5 ? '108, 99, 255' : '6, 182, 212'
      });
    }

    let animationId;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.dx;
        p.y += p.dy;
        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -10 || p.x > canvas.width + 10) {
          p.x = Math.random() * canvas.width;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
        ctx.fill();
      });
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(email, password);
    } catch (err) {
      setError(err?.message || err?.error || 'Invalid credentials or connection issue.');
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      {/* Particles Canvas */}
      <canvas ref={canvasRef} className="bg-canvas" id="particleCanvas"></canvas>

      {/* Left Panel */}
      <div className="left-panel">
        <div className="brand-logo">
          <div className="brand-icon">🎓</div>
          <div className="brand-name">EduPulse</div>
        </div>

        <div className="left-content">
          <h1>Manage Your <span>College</span> Smarter</h1>
          <p>A comprehensive college management platform with real-time notifications, attendance tracking, grade management, and more — all in one beautiful dashboard.</p>

          <div className="features-list">
            <div className="feature-item">
              <div className="feature-icon">👥</div>
              <span>Student & Faculty Management with role-based access</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">✅</div>
              <span>Real-time Attendance Tracking with live updates</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">📊</div>
              <span>Analytics Dashboard with insightful charts</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">💰</div>
              <span>Fee Management & Payment Tracking</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🔔</div>
              <span>Real-time Notifications & Announcements</span>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-item">
              <div className="stat-num">15+</div>
              <div className="stat-lbl">Students</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">6</div>
              <div className="stat-lbl">Faculty</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">12</div>
              <div className="stat-lbl">Courses</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">5</div>
              <div className="stat-lbl">Departments</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Login */}
      <div className="right-panel">
        <div className="login-header">
          <h2>Welcome Back 👋</h2>
          <p>Sign in to your account to continue</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="error-msg show" id="errorMsg">
            ❌ {error}
          </div>
        )}

        {/* Login Form */}
        <form id="loginForm" onSubmit={handleLoginSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Username</label>
            <div className="input-wrapper">
              <span className="input-icon">👤</span>
              <input
                type="text"
                id="email"
                className="form-input"
                placeholder="Enter your username or email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                className="form-input"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={togglePasswordVisibility}
                id="togglePwdBtn"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="form-footer">
            <label className="remember-me">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Remember me
            </label>
            <a href="#" className="forgot-link">Forgot password?</a>
          </div>

          <button type="submit" className="login-btn" id="loginBtn" disabled={loading}>
            <span id="loginBtnText">
              {loading ? (
                <>
                  <div className="spinner"></div> Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

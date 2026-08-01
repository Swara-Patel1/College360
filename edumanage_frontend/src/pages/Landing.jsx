import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

const FEATURES = [
  { icon: <i className="bi bi-speedometer2" />, title: 'Unified Dashboards', desc: 'Role-aware dashboards for students, faculty, HODs and admins — the right data, the moment you log in.' },
  { icon: <i className="bi bi-check-circle" />, title: 'Smart Attendance', desc: 'Bulk-mark attendance, auto-computed percentages, and low-attendance alerts pushed straight to HODs.' },
  { icon: <i className="bi bi-journal-text" />, title: 'Grades & Analytics', desc: 'Server-computed grades on the Indian scale and performance insights in real time.' },
  { icon: <i className="bi bi-robot" />, title: 'AI Student Assistant', desc: 'Smart RAG chatbot providing real-time queries for CGPA, attendance %, timetable & study notes.' },
  { icon: <i className="bi bi-question-circle" />, title: 'Doubts with SLA', desc: 'Students raise conceptual doubts; faculty resolve them within a tracked 72-hour service window.' },
  { icon: <i className="bi bi-cash-stack" />, title: 'Fees & Finance', desc: 'Track collections, pending dues and payment history across every department from one console.' },
];

const ROLES = [
  { tag: 'Students', color: '#6C63FF', points: ['Attendance, grades & timetable at a glance', 'Ask doubts and get faculty answers', 'Placement score & AI chatbot support'] },
  { tag: 'Faculty', color: '#00D4AA', points: ['One-tap bulk attendance marking', 'Grade entry with instant analytics', 'Leave requests & lecture interchange'] },
  { tag: 'HOD', color: '#FF9F43', points: ['Approve leaves & manage timetables', 'Academic alerts & department analytics', 'Resolve grievances department-wide'] },
  { tag: 'Admin', color: '#54A0FF', points: ['Master CRUD for the whole institute', 'Fee management & finance overview', 'Broadcast notices to any audience'] },
];

const STATS = [
  { value: '4', label: 'Departments' },
  { value: '40+', label: 'Active Courses' },
  { value: '86', label: 'Users Onboarded' },
  { value: '99.9%', label: 'Uptime' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Apply + persist the theme (same mechanism the dashboard Header uses)
  useEffect(() => {
    const isLight = theme === 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('light-theme', isLight);
    document.body.classList.toggle('light-theme', isLight);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  // The CTAs always take the user to the login screen — no silent auto-login.
  const goPrimary = () => navigate('/login');
  const goLogin = goPrimary;
  const ctaLabel = 'Sign In';

  return (
    <div className="lp">
      <style>{LP_STYLES}</style>

      {/* Ambient gradient orbs */}
      <div className="lp-orb lp-orb-1" />
      <div className="lp-orb lp-orb-2" />
      <div className="lp-orb lp-orb-3" />

      {/* Nav */}
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <a className="lp-brand" href="#top">
            <span className="lp-brand-icon"><i className="bi bi-mortarboard"></i></span>
            <span className="lp-brand-text">College360<span className="lp-brand-dim"> Pro</span></span>
          </a>
          <nav className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#roles">For Everyone</a>
            <a href="#how">How it works</a>
          </nav>
          <button
            className="lp-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <i className="bi bi-moon-stars"></i> : <i className="bi bi-sun"></i>}
          </button>
          <button className="lp-btn lp-btn-primary lp-btn-sm" onClick={goPrimary}>{ctaLabel} →</button>
        </div>
      </header>

      {/* Hero */}
      <section className="lp-hero" id="top">
        <span className="lp-pill"><i className="bi bi-stars"></i> The all-in-one campus operating system</span>
        <h1 className="lp-h1">
          Run your entire college<br />
          from <span className="lp-grad">one intelligent portal</span>
        </h1>
        <p className="lp-sub">
          College360 Pro unifies attendance, grades, fees, timetables, doubts and placement readiness into a single
          fast, role-aware platform — powered by a Django backend and a modern React interface.
        </p>
        <div className="lp-hero-cta">
          <button className="lp-btn lp-btn-primary" onClick={goLogin}>Get Started</button>
          <a className="lp-btn lp-btn-ghost" href="#features">Explore Features</a>
        </div>

        <div className="lp-stats">
          {STATS.map((s) => (
            <div className="lp-stat" key={s.label}>
              <div className="lp-stat-value">{s.value}</div>
              <div className="lp-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="lp-section" id="features">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Everything, in one place</span>
          <h2 className="lp-h2">Built for the way campuses actually work</h2>
          <p className="lp-section-sub">Every module talks to the same source of truth — no spreadsheets, no silos.</p>
        </div>
        <div className="lp-grid">
          {FEATURES.map((f) => (
            <div className="lp-card" key={f.title}>
              <div className="lp-card-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="lp-section" id="roles">
        <div className="lp-section-head">
          <span className="lp-eyebrow">One platform, four experiences</span>
          <h2 className="lp-h2">Tailored to every role</h2>
        </div>
        <div className="lp-roles">
          {ROLES.map((r) => (
            <div className="lp-role" key={r.tag} style={{ '--role-color': r.color }}>
              <div className="lp-role-tag">{r.tag}</div>
              <ul>
                {r.points.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="lp-section" id="how">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Up and running in minutes</span>
          <h2 className="lp-h2">How it works</h2>
        </div>
        <div className="lp-steps">
          <div className="lp-step"><span className="lp-step-num">1</span><h3>Sign in by role</h3><p>Students, faculty, HODs and admins each get a secure, purpose-built workspace.</p></div>
          <div className="lp-step"><span className="lp-step-num">2</span><h3>Work in real time</h3><p>Mark attendance, enter grades, raise doubts and approve leaves — all instantly synced.</p></div>
          <div className="lp-step"><span className="lp-step-num">3</span><h3>Decide with insight</h3><p>Dashboards turn everyday activity into actionable alerts and finance overviews.</p></div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta">
        <h2 className="lp-h2">Ready to bring your campus online?</h2>
        <p className="lp-section-sub">Log in with your institute credentials and pick up right where your college left off.</p>
        <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={goPrimary}>Sign In to College360</button>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-brand">
          <span className="lp-brand-icon"><i className="bi bi-mortarboard"></i></span>
          <span className="lp-brand-text">College360<span className="lp-brand-dim"> Pro</span></span>
        </div>
        <p>© {new Date().getFullYear()} College360 Pro — College Management System. Built with Django + React.</p>
      </footer>
    </div>
  );
}

const LP_STYLES = `
.lp { --lp-primary:#6C63FF; --lp-cyan:#06B6D4; --lp-teal:#00D4AA;
  --lp-bg:#0F0F1A; --lp-card:#1E1E35; --lp-text:#F0F0FF; --lp-muted:#A0A0C0; --lp-border:rgba(108,99,255,.2);
  position:relative; min-height:100vh; background:var(--lp-bg); color:var(--lp-text);
  font-family:'Inter',system-ui,sans-serif; overflow-x:hidden; scroll-behavior:smooth; }
.lp * { box-sizing:border-box; }
.lp a { color:inherit; text-decoration:none; }

.lp-orb { position:fixed; border-radius:50%; filter:blur(90px); opacity:.5; z-index:0; pointer-events:none; }
.lp-orb-1 { width:520px; height:520px; background:#6C63FF; top:-160px; left:-120px; animation:lpFloat 14s ease-in-out infinite; }
.lp-orb-2 { width:440px; height:440px; background:#06B6D4; top:30%; right:-160px; animation:lpFloat 18s ease-in-out infinite reverse; }
.lp-orb-3 { width:380px; height:380px; background:#00D4AA; bottom:-140px; left:20%; opacity:.32; animation:lpFloat 16s ease-in-out infinite; }
@keyframes lpFloat { 0%,100%{ transform:translate(0,0);} 50%{ transform:translate(30px,-40px);} }

.lp-nav { position:fixed; top:0; left:0; right:0; z-index:20; transition:all .3s ease; }
.lp-nav.scrolled { background:rgba(15,15,26,.8); backdrop-filter:blur(20px); border-bottom:1px solid var(--lp-border); }
.lp-nav-inner { max-width:1180px; margin:0 auto; padding:18px 24px; display:flex; align-items:center; gap:24px; }
.lp-brand { display:flex; align-items:center; gap:10px; font-weight:800; font-size:1.15rem; }
.lp-brand-icon { font-size:1.4rem; }
.lp-brand-dim { color:var(--lp-muted); font-weight:600; }
.lp-nav-links { display:flex; gap:28px; margin-left:auto; font-size:.9rem; color:var(--lp-muted); }
.lp-nav-links a:hover { color:var(--lp-text); }

.lp-btn { border:none; cursor:pointer; font-weight:700; font-family:inherit; border-radius:12px;
  padding:14px 28px; font-size:.95rem; transition:transform .2s ease, box-shadow .2s ease; display:inline-block; }
.lp-btn-sm { padding:10px 18px; font-size:.85rem; }
.lp-btn-lg { padding:18px 40px; font-size:1.05rem; }
.lp-btn-primary { background:linear-gradient(135deg,#6C63FF 0%,#8B5CF6 50%,#06B6D4 100%); color:#fff;
  box-shadow:0 8px 30px rgba(108,99,255,.4); }
.lp-btn-primary:hover { transform:translateY(-2px); box-shadow:0 12px 40px rgba(108,99,255,.55); }
.lp-btn-ghost { background:rgba(255,255,255,.05); color:var(--lp-text); border:1px solid var(--lp-border); }
.lp-btn-ghost:hover { background:rgba(255,255,255,.1); transform:translateY(-2px); }

.lp-hero { position:relative; z-index:1; max-width:900px; margin:0 auto; padding:180px 24px 90px; text-align:center; }
.lp-pill { display:inline-block; padding:8px 18px; border-radius:999px; font-size:.8rem; font-weight:600;
  background:rgba(108,99,255,.12); border:1px solid var(--lp-border); color:#8B85FF; margin-bottom:28px; }
.lp-h1 { font-size:clamp(2.4rem,6vw,4rem); line-height:1.08; font-weight:800; letter-spacing:-1.5px; margin:0 0 24px; color:var(--lp-text); }
.lp-grad { background:linear-gradient(120deg,#8B85FF,#06B6D4,#00D4AA); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.lp-sub { font-size:clamp(1rem,2vw,1.2rem); color:var(--lp-muted); max-width:640px; margin:0 auto 40px; line-height:1.6; }
.lp-hero-cta { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; }

.lp-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; margin-top:72px; }
.lp-stat { display:flex; flex-direction:column; align-items:center; justify-content:center; }
.lp-stat-value { display:inline-block; line-height:1.25; padding:6px 2px; font-size:clamp(1.6rem,3vw,2.5rem); font-weight:800;
  background:linear-gradient(120deg,#8B85FF,#06B6D4); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.lp-stat-label { font-size:.8rem; color:var(--lp-muted); margin-top:4px; }

.lp-section { position:relative; z-index:1; max-width:1180px; margin:0 auto; padding:70px 24px; }
.lp-section-head { text-align:center; max-width:620px; margin:0 auto 50px; }
.lp-eyebrow { display:block; text-transform:uppercase; letter-spacing:2px; font-size:.72rem; font-weight:700; color:var(--lp-teal); margin-bottom:14px; }
.lp-h2 { font-size:clamp(1.7rem,4vw,2.6rem); font-weight:800; letter-spacing:-.8px; margin:0 0 14px; color:var(--lp-text); }
.lp-section-sub { color:var(--lp-muted); font-size:1.02rem; line-height:1.6; margin:0; }

.lp-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:22px; }
.lp-card { background:linear-gradient(135deg,rgba(108,99,255,.1),rgba(139,91,246,.04));
  border:1px solid var(--lp-border); border-radius:20px; padding:30px; transition:transform .25s ease, border-color .25s ease; }
.lp-card:hover { transform:translateY(-6px); border-color:rgba(108,99,255,.5); }
.lp-card-icon { font-size:2rem; margin-bottom:16px; }
.lp-card h3 { margin:0 0 10px; font-size:1.2rem; font-weight:700; }
.lp-card p { margin:0; color:var(--lp-muted); font-size:.92rem; line-height:1.6; }

.lp-roles { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:20px; }
.lp-role { background:var(--lp-card); border:1px solid var(--lp-border); border-top:3px solid var(--role-color);
  border-radius:18px; padding:28px; }
.lp-role-tag { display:inline-block; font-weight:800; font-size:1.1rem; color:var(--role-color); margin-bottom:16px; }
.lp-role ul { list-style:none; padding:0; margin:0; display:grid; gap:12px; }
.lp-role li { position:relative; padding-left:26px; color:var(--lp-muted); font-size:.9rem; line-height:1.5; }
.lp-role li::before { content:'✓'; position:absolute; left:0; color:var(--role-color); font-weight:800; }

.lp-steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:22px; }
.lp-step { background:linear-gradient(135deg,rgba(108,99,255,.08),transparent); border:1px solid var(--lp-border); border-radius:18px; padding:30px; }
.lp-step-num { display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:12px;
  background:linear-gradient(135deg,#6C63FF,#06B6D4); font-weight:800; font-size:1.2rem; margin-bottom:18px; }
.lp-step h3 { margin:0 0 8px; font-size:1.15rem; }
.lp-step p { margin:0; color:var(--lp-muted); font-size:.9rem; line-height:1.6; }

.lp-cta { position:relative; z-index:1; max-width:760px; margin:40px auto; padding:64px 32px; text-align:center;
  background:linear-gradient(135deg,rgba(108,99,255,.16),rgba(6,182,212,.1)); border:1px solid var(--lp-border); border-radius:28px; }
.lp-cta .lp-section-sub { margin:14px 0 30px; }

.lp-footer { position:relative; z-index:1; border-top:1px solid var(--lp-border); padding:40px 24px; text-align:center; }
.lp-footer .lp-brand { justify-content:center; margin-bottom:12px; }
.lp-footer p { color:var(--lp-muted); font-size:.85rem; margin:0; }

.lp-theme-toggle { width:40px; height:40px; border-radius:10px; margin-left:4px; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; font-size:1rem;
  background:rgba(255,255,255,.06); border:1px solid var(--lp-border); color:var(--lp-text);
  transition:background .2s ease, transform .2s ease; }
.lp-theme-toggle:hover { background:rgba(108,99,255,.16); transform:translateY(-1px); }

/* ==========================================================================
   LIGHT THEME — driven by the app-wide theme toggle (body.light-theme / [data-theme])
   ========================================================================== */
body.light-theme .lp, [data-theme="light"] .lp {
  --lp-bg:#F5F7FB; --lp-card:#FFFFFF; --lp-text:#0F172A; --lp-muted:#5B6478;
  --lp-border:rgba(37,99,235,.16);
}
body.light-theme .lp-nav.scrolled, [data-theme="light"] .lp-nav.scrolled {
  background:rgba(255,255,255,.85); border-bottom:1px solid var(--lp-border); }
body.light-theme .lp-orb, [data-theme="light"] .lp-orb { opacity:.20; }
body.light-theme .lp-pill, [data-theme="light"] .lp-pill { color:#4F46E5; }
body.light-theme .lp-theme-toggle, [data-theme="light"] .lp-theme-toggle {
  background:#FFFFFF; }
body.light-theme .lp-btn-ghost, [data-theme="light"] .lp-btn-ghost {
  background:#FFFFFF; border:1px solid var(--lp-border); color:var(--lp-text); }
body.light-theme .lp-btn-ghost:hover, [data-theme="light"] .lp-btn-ghost:hover {
  background:#EEF2F7; }
body.light-theme .lp-card, [data-theme="light"] .lp-card {
  background:#FFFFFF; box-shadow:0 4px 16px rgba(15,23,42,.05); }
body.light-theme .lp-step, [data-theme="light"] .lp-step {
  background:#FFFFFF; box-shadow:0 4px 16px rgba(15,23,42,.05); }
body.light-theme .lp-cta, [data-theme="light"] .lp-cta {
  background:linear-gradient(135deg,rgba(108,99,255,.10),rgba(6,182,212,.08)); }

/* Gradient & accent text turns invisible on white — darken the stops for contrast */
body.light-theme .lp-grad, [data-theme="light"] .lp-grad {
  background:linear-gradient(120deg,#6D28D9,#0891B2,#0F766E);
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
body.light-theme .lp-stat-value, [data-theme="light"] .lp-stat-value {
  background:linear-gradient(120deg,#6D28D9,#0E7490);
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
body.light-theme .lp-eyebrow, [data-theme="light"] .lp-eyebrow { color:#0F766E; }
body.light-theme .lp-step-num, [data-theme="light"] .lp-step-num { color:#FFFFFF; }
body.light-theme .lp-brand-text, [data-theme="light"] .lp-brand-text { color:var(--lp-text); }

@media (max-width:640px){
  .lp-nav-links { display:none; }
  .lp-stats { grid-template-columns:repeat(2,1fr); gap:28px; }
}
`;

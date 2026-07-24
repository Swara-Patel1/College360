import { useState, useEffect, useMemo } from 'react';
import { SupaAPI, Utils } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Toast } from '../store/useNotifStore.js';
import Modal from '../components/Modal.jsx';

const emptyAlumnus = () => ({
  first_name: '', last_name: '', email: '', graduation_year: new Date().getFullYear(),
  degree: 'B.Tech', current_company: '', designation: '', location: '',
  linkedin_url: '', available_for_mentorship: false,
});

export default function Alumni() {
  const { user } = useAuthStore();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const [alumni, setAlumni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [mentorOnly, setMentorOnly] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(emptyAlumnus());
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await SupaAPI.alumni.all();
      setAlumni(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load alumni directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const years = useMemo(
    () => [...new Set(alumni.map(a => a.graduation_year))].sort((a, b) => b - a),
    [alumni]
  );

  const filtered = useMemo(() => alumni.filter(a => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q ||
      a.name.toLowerCase().includes(q) ||
      (a.current_company || '').toLowerCase().includes(q) ||
      (a.department_name || '').toLowerCase().includes(q);
    const matchesYear = yearFilter === 'all' || String(a.graduation_year) === String(yearFilter);
    const matchesMentor = !mentorOnly || a.available_for_mentorship;
    return matchesSearch && matchesYear && matchesMentor;
  }), [alumni, search, yearFilter, mentorOnly]);

  const stats = useMemo(() => ({
    total: alumni.length,
    mentors: alumni.filter(a => a.available_for_mentorship).length,
    companies: new Set(alumni.map(a => a.current_company).filter(Boolean)).size,
    latestBatch: years[0] || '—',
  }), [alumni, years]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.graduation_year) {
      Toast.error('Name and graduation year are required.');
      return;
    }
    try {
      setSubmitting(true);
      await SupaAPI.alumni.add(form);
      Toast.success('Alumnus added to directory.');
      setIsAddOpen(false);
      setForm(emptyAlumnus());
      load();
    } catch (err) {
      Toast.error('Failed to add alumnus.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (a) => {
    if (!window.confirm(`Remove ${a.name} from the alumni directory?`)) return;
    try {
      await SupaAPI.alumni.delete(a.id);
      setAlumni(prev => prev.filter(x => x.id !== a.id));
      Toast.success('Alumnus removed.');
    } catch {
      Toast.error('Failed to remove alumnus.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <>
      {/* Header card */}
      <div className="stat-card primary" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div className="stat-icon">🎓</div>
          <div className="stat-value">Alumni Network</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Connect with graduates, explore career paths, and find mentors across companies.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setIsAddOpen(true)} style={{ flexShrink: 0 }}>
            ➕ Add Alumnus
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary"><div className="stat-icon">👥</div><div className="stat-value">{stats.total}</div><div className="stat-label">Total Alumni</div></div>
        <div className="stat-card success"><div className="stat-icon">🤝</div><div className="stat-value">{stats.mentors}</div><div className="stat-label">Open to Mentorship</div></div>
        <div className="stat-card info"><div className="stat-icon">🏢</div><div className="stat-value">{stats.companies}</div><div className="stat-label">Companies</div></div>
        <div className="stat-card warning"><div className="stat-icon">🗓️</div><div className="stat-value">{stats.latestBatch}</div><div className="stat-label">Latest Batch</div></div>
      </div>

      {/* Filters */}
      <div className="card col-12" style={{ marginBottom: '20px' }}>
        <div className="card-body" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-control"
            style={{ flex: '1 1 240px' }}
            placeholder="🔍 Search by name, company or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-control" style={{ maxWidth: '180px' }} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="all">All Batches</option>
            {years.map(y => <option key={y} value={y}>Batch {y}</option>)}
          </select>
          <label className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={mentorOnly} onChange={(e) => setMentorOnly(e.target.checked)} />
            Mentors only
          </label>
        </div>
      </div>

      {/* Alumni grid */}
      {filtered.length ? (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filtered.map(a => (
            <div key={a.id} className="card" style={{ padding: '20px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div className="user-avatar" style={{ background: Utils.getRandomColor(a.name), width: '48px', height: '48px', fontSize: '1rem', flexShrink: 0 }}>
                  {Utils.getInitials(a.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.975rem', color: 'var(--text-primary)' }}>{a.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.degree} · Batch {a.graduation_year}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <div>💼 <strong>{a.designation || '—'}</strong>{a.current_company ? ` @ ${a.current_company}` : ''}</div>
                <div>🏛️ {a.department_name}</div>
                {a.location && <div>📍 {a.location}</div>}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                {a.available_for_mentorship && <span className="badge badge-success">🤝 Mentor</span>}
                {a.linkedin_url && (
                  <a href={a.linkedin_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">🔗 LinkedIn</a>
                )}
                {isAdmin && (
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--accent, #FF6B6B)' }} onClick={() => handleDelete(a)}>🗑️</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
          <div className="empty-state-icon">🔍</div>
          <h3>No alumni match your filters</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Try a different search term or batch year.</p>
        </div>
      )}

      {/* Add modal (admin) */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="➕ Add Alumnus">
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input className="form-control" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input className="form-control" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Graduation Year *</label>
              <input type="number" className="form-control" value={form.graduation_year} onChange={(e) => setForm({ ...form, graduation_year: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Degree</label>
              <input className="form-control" value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Company</label>
              <input className="form-control" value={form.current_company} onChange={(e) => setForm({ ...form, current_company: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Designation</label>
              <input className="form-control" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-control" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">LinkedIn URL</label>
            <input className="form-control" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={form.available_for_mentorship} onChange={(e) => setForm({ ...form, available_for_mentorship: e.target.checked })} />
            Available for student mentorship
          </label>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setIsAddOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Add Alumnus'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

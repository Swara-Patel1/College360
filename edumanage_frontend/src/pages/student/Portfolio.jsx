import { useState, useEffect } from 'react';
import { SupaAPI, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

const VERIFY_BADGE = { verified: 'badge badge-success', pending: 'badge badge-warning', rejected: 'badge badge-danger' };
const CATEGORIES = [
  { value: 'technical', label: 'Technical' }, { value: 'sports', label: 'Sports' },
  { value: 'cultural', label: 'Cultural' }, { value: 'academic', label: 'Academic' },
  { value: 'social', label: 'Social / Volunteering' }, { value: 'other', label: 'Other' },
];
const LEVELS = [
  { value: 'college', label: 'College' }, { value: 'state', label: 'State' },
  { value: 'national', label: 'National' }, { value: 'international', label: 'International' },
];
const WORK_MODES = [
  { value: 'onsite', label: 'On-site' }, { value: 'remote', label: 'Remote' }, { value: 'hybrid', label: 'Hybrid' },
];

const emptyIntern = () => ({
  company: '', role: '', location: '', work_mode: 'onsite', start_date: '', end_date: '',
  stipend: 0, description: '', skills: '', certificate_url: '', status: 'ongoing',
});
const emptyAch = () => ({
  title: '', category: 'technical', level: 'college', organization: '', date_awarded: '',
  position: '', description: '', certificate_url: '',
});

export default function Portfolio() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('internships');
  const [internships, setInternships] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);

  const [iModal, setIModal] = useState(false);
  const [aModal, setAModal] = useState(false);
  const [iEditing, setIEditing] = useState(null);
  const [aEditing, setAEditing] = useState(null);
  const [iForm, setIForm] = useState(emptyIntern());
  const [aForm, setAForm] = useState(emptyAch());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [ints, achs] = await Promise.all([
        SupaAPI.internships.byStudent(user.id),
        SupaAPI.achievements.byStudent(user.id),
      ]);
      setInternships(Array.isArray(ints) ? ints : []);
      setAchievements(Array.isArray(achs) ? achs : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (user) load(); }, [user]);

  // ── Internship handlers ──
  const openIAdd = () => { setIEditing(null); setIForm(emptyIntern()); setIModal(true); };
  const openIEdit = (i) => {
    setIEditing(i);
    setIForm({
      company: i.company, role: i.role, location: i.location, work_mode: i.work_mode,
      start_date: i.start_date || '', end_date: i.end_date || '', stipend: i.stipend,
      description: i.description, skills: i.skills, certificate_url: i.certificate_url, status: i.status,
    });
    setIModal(true);
  };
  const saveIntern = async (e) => {
    e.preventDefault();
    if (!iForm.company.trim() || !iForm.role.trim() || !iForm.start_date) {
      Toast.warning('Company, role and start date are required.'); return;
    }
    try {
      setSaving(true);
      if (iEditing) await SupaAPI.internships.update(iEditing.id, iForm);
      else await SupaAPI.internships.add({ ...iForm, student_id: user.id });
      Toast.success(`Internship ${iEditing ? 'updated' : 'submitted'}.`);
      setIModal(false); load();
    } catch { Toast.error('Failed to save internship.'); }
    finally { setSaving(false); }
  };
  const removeIntern = async (i) => {
    if (!window.confirm(`Delete your internship at ${i.company}?`)) return;
    try { await SupaAPI.internships.remove(i.id); setInternships(p => p.filter(x => x.id !== i.id)); Toast.success('Removed.'); }
    catch { Toast.error('Failed to delete.'); }
  };

  // ── Achievement handlers ──
  const openAAdd = () => { setAEditing(null); setAForm(emptyAch()); setAModal(true); };
  const openAEdit = (a) => {
    setAEditing(a);
    setAForm({
      title: a.title, category: a.category, level: a.level, organization: a.organization,
      date_awarded: a.date_awarded || '', position: a.position, description: a.description,
      certificate_url: a.certificate_url,
    });
    setAModal(true);
  };
  const saveAch = async (e) => {
    e.preventDefault();
    if (!aForm.title.trim() || !aForm.date_awarded) { Toast.warning('Title and date are required.'); return; }
    try {
      setSaving(true);
      if (aEditing) await SupaAPI.achievements.update(aEditing.id, aForm);
      else await SupaAPI.achievements.add({ ...aForm, student_id: user.id });
      Toast.success(`Achievement ${aEditing ? 'updated' : 'submitted'}.`);
      setAModal(false); load();
    } catch { Toast.error('Failed to save achievement.'); }
    finally { setSaving(false); }
  };
  const removeAch = async (a) => {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    try { await SupaAPI.achievements.remove(a.id); setAchievements(p => p.filter(x => x.id !== a.id)); Toast.success('Removed.'); }
    catch { Toast.error('Failed to delete.'); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  const verifiedCount = internships.filter(i => i.verification === 'verified').length + achievements.filter(a => a.verification === 'verified').length;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="stat-icon" style={{ background: 'rgba(108, 99, 255, 0.2)', color: '#6C63FF' }}>
            <i className="bi bi-trophy"></i>
          </div>
          <div>
            <h1>My Portfolio</h1>
            <p>Log your internships, achievements and extracurricular activities. Submissions are reviewed and verified by the department.</p>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-briefcase"></i></div><div><div className="stat-value">{internships.length}</div><div className="stat-label">Internships</div></div></div>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-award"></i></div><div><div className="stat-value">{achievements.length}</div><div className="stat-label">Achievements</div></div></div>
        <div className="stat-card"><div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div><div><div className="stat-value">{verifiedCount}</div><div className="stat-label">Verified</div></div></div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className={`btn ${tab === 'internships' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('internships')}><i className="bi bi-briefcase"></i> Internships</button>
        <button className={`btn ${tab === 'achievements' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('achievements')}><i className="bi bi-award"></i> Achievements</button>
        <div style={{ flex: 1 }} />
        {tab === 'internships'
          ? <button className="btn btn-primary" onClick={openIAdd}><i className="bi bi-plus-lg"></i> Add Internship</button>
          : <button className="btn btn-primary" onClick={openAAdd}><i className="bi bi-plus-lg"></i> Add Achievement</button>}
      </div>

      {tab === 'internships' && (
        <div className="card col-12">
          <div className="card-header"><div className="card-title"><i className="bi bi-briefcase"></i> My Internships</div></div>
          <div className="card-body" style={{ display: 'grid', gap: '14px' }}>
            {internships.length ? internships.map(i => (
              <div key={i.id} style={{ padding: '16px 20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px' }}>
                    <div style={{ fontWeight: 700 }}>{i.role} · {i.company}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {Utils.formatDate(i.start_date)} – {i.end_date ? Utils.formatDate(i.end_date) : 'Present'}
                      {i.location && <> · {i.location}</>} · <span style={{ textTransform: 'capitalize' }}>{i.work_mode}</span>
                      {Number(i.stipend) > 0 && <> · {Utils.formatCurrency(i.stipend)}/mo</>}
                    </div>
                    {i.skills && <div style={{ fontSize: '0.75rem', marginTop: '6px' }}><i className="bi bi-tools"></i> {i.skills}</div>}
                    {i.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>{i.description}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                    <span className={`badge ${i.status === 'completed' ? 'badge-success' : 'badge-info'}`} style={{ textTransform: 'capitalize' }}>{i.status}</span>
                    <span className={VERIFY_BADGE[i.verification]} style={{ textTransform: 'capitalize' }}>{i.verification}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  {i.certificate_url && <a className="btn btn-ghost btn-sm" href={i.certificate_url} target="_blank" rel="noreferrer"><i className="bi bi-file-earmark-text"></i> Certificate</a>}
                  <button className="btn btn-ghost btn-sm" onClick={() => openIEdit(i)}><i className="bi bi-pencil"></i> Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent, #FF6B6B)' }} onClick={() => removeIntern(i)}><i className="bi bi-trash"></i></button>
                </div>
              </div>
            )) : (
              <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
                <div className="empty-state-icon"><i className="bi bi-briefcase"></i></div><h3>No internships logged yet</h3>
                <button className="btn btn-primary" onClick={openIAdd} style={{ marginTop: '12px' }}>Add your first internship</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'achievements' && (
        <div className="card col-12">
          <div className="card-header"><div className="card-title"><i className="bi bi-award"></i> My Achievements</div></div>
          <div className="card-body" style={{ display: 'grid', gap: '14px' }}>
            {achievements.length ? achievements.map(a => (
              <div key={a.id} style={{ padding: '16px 20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px' }}>
                    <div style={{ fontWeight: 700 }}>{a.title}{a.position && <span style={{ color: 'var(--primary, #6C63FF)' }}> · {a.position}</span>}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span style={{ textTransform: 'capitalize' }}>{a.category}</span> · <span style={{ textTransform: 'capitalize' }}>{a.level}</span> level
                      {a.organization && <> · {a.organization}</>} · {Utils.formatDate(a.date_awarded)}
                    </div>
                    {a.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>{a.description}</div>}
                  </div>
                  <span className={VERIFY_BADGE[a.verification]} style={{ textTransform: 'capitalize' }}>{a.verification}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  {a.certificate_url && <a className="btn btn-ghost btn-sm" href={a.certificate_url} target="_blank" rel="noreferrer"><i className="bi bi-file-earmark-text"></i> Certificate</a>}
                  <button className="btn btn-ghost btn-sm" onClick={() => openAEdit(a)}><i className="bi bi-pencil"></i> Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent, #FF6B6B)' }} onClick={() => removeAch(a)}><i className="bi bi-trash"></i></button>
                </div>
              </div>
            )) : (
              <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
                <div className="empty-state-icon"><i className="bi bi-award"></i></div><h3>No achievements logged yet</h3>
                <button className="btn btn-primary" onClick={openAAdd} style={{ marginTop: '12px' }}>Add your first achievement</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Internship modal */}
      <Modal isOpen={iModal} onClose={() => setIModal(false)} title={iEditing ? <><i className="bi bi-pencil-square me-2"></i>Edit Internship</> : <><i className="bi bi-plus-circle me-2"></i>Add Internship</>}>
        <form onSubmit={saveIntern}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group"><label className="form-label">Company *</label><input className="form-control" value={iForm.company} onChange={(e) => setIForm({ ...iForm, company: e.target.value })} required /></div>
            <div className="form-group"><label className="form-label">Role *</label><input className="form-control" value={iForm.role} onChange={(e) => setIForm({ ...iForm, role: e.target.value })} required /></div>
            <div className="form-group"><label className="form-label">Location</label><input className="form-control" value={iForm.location} onChange={(e) => setIForm({ ...iForm, location: e.target.value })} /></div>
            <div className="form-group">
              <label className="form-label">Work Mode</label>
              <select className="form-control" value={iForm.work_mode} onChange={(e) => setIForm({ ...iForm, work_mode: e.target.value })}>
                {WORK_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Start Date *</label><input type="date" className="form-control" value={iForm.start_date} onChange={(e) => setIForm({ ...iForm, start_date: e.target.value })} required /></div>
            <div className="form-group"><label className="form-label">End Date</label><input type="date" className="form-control" value={iForm.end_date} onChange={(e) => setIForm({ ...iForm, end_date: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Stipend (₹/month)</label><input type="number" min="0" className="form-control" value={iForm.stipend} onChange={(e) => setIForm({ ...iForm, stipend: e.target.value })} /></div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={iForm.status} onChange={(e) => setIForm({ ...iForm, status: e.target.value })}>
                <option value="ongoing">Ongoing</option><option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}><label className="form-label">Skills / Tech</label><input className="form-control" value={iForm.skills} onChange={(e) => setIForm({ ...iForm, skills: e.target.value })} placeholder="e.g. React, Django, SQL" /></div>
          <div className="form-group" style={{ marginBottom: '12px' }}><label className="form-label">Description</label><textarea className="form-control" rows="2" value={iForm.description} onChange={(e) => setIForm({ ...iForm, description: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: '20px' }}><label className="form-label">Certificate URL</label><input className="form-control" value={iForm.certificate_url} onChange={(e) => setIForm({ ...iForm, certificate_url: e.target.value })} placeholder="https://…" /></div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setIModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : iEditing ? 'Update' : 'Submit'}</button>
          </div>
        </form>
      </Modal>

      {/* Achievement modal */}
      <Modal isOpen={aModal} onClose={() => setAModal(false)} title={aEditing ? <><i className="bi bi-pencil-square me-2"></i>Edit Achievement</> : <><i className="bi bi-plus-circle me-2"></i>Add Achievement</>}>
        <form onSubmit={saveAch}>
          <div className="form-group" style={{ marginBottom: '12px' }}><label className="form-label">Title *</label><input className="form-control" value={aForm.title} onChange={(e) => setAForm({ ...aForm, title: e.target.value })} required placeholder="e.g. Won Smart India Hackathon" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={aForm.category} onChange={(e) => setAForm({ ...aForm, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Level</label>
              <select className="form-control" value={aForm.level} onChange={(e) => setAForm({ ...aForm, level: e.target.value })}>
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Organization / Event</label><input className="form-control" value={aForm.organization} onChange={(e) => setAForm({ ...aForm, organization: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Position / Rank</label><input className="form-control" value={aForm.position} onChange={(e) => setAForm({ ...aForm, position: e.target.value })} placeholder="e.g. 1st Prize" /></div>
            <div className="form-group"><label className="form-label">Date *</label><input type="date" className="form-control" value={aForm.date_awarded} onChange={(e) => setAForm({ ...aForm, date_awarded: e.target.value })} required /></div>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}><label className="form-label">Description</label><textarea className="form-control" rows="2" value={aForm.description} onChange={(e) => setAForm({ ...aForm, description: e.target.value })} /></div>
          <div className="form-group" style={{ marginBottom: '20px' }}><label className="form-label">Certificate URL</label><input className="form-control" value={aForm.certificate_url} onChange={(e) => setAForm({ ...aForm, certificate_url: e.target.value })} placeholder="https://…" /></div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setAModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : aEditing ? 'Update' : 'Submit'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

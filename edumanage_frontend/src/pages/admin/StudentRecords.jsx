import { useState, useEffect, useMemo } from 'react';
import { SupaAPI, Utils } from '../../api/client.js';
import { Toast } from '../../store/useNotifStore.js';

const VERIFY_BADGE = { verified: 'badge badge-success', pending: 'badge badge-warning', rejected: 'badge badge-danger' };

export default function StudentRecords() {
  const [tab, setTab] = useState('internships');
  const [internships, setInternships] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const [ints, achs] = await Promise.all([SupaAPI.internships.all(), SupaAPI.achievements.all()]);
      setInternships(Array.isArray(ints) ? ints : []);
      setAchievements(Array.isArray(achs) ? achs : []);
    } catch { Toast.error('Failed to load records.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const verifyIntern = async (i, status) => {
    try { await SupaAPI.internships.verify(i.id, status); setInternships(p => p.map(x => x.id === i.id ? { ...x, verification: status } : x)); Toast.success(`Marked ${status}.`); }
    catch { Toast.error('Failed to update.'); }
  };
  const verifyAch = async (a, status) => {
    try { await SupaAPI.achievements.verify(a.id, status); setAchievements(p => p.map(x => x.id === a.id ? { ...x, verification: status } : x)); Toast.success(`Marked ${status}.`); }
    catch { Toast.error('Failed to update.'); }
  };

  const items = tab === 'internships' ? internships : achievements;
  const filtered = useMemo(
    () => filter === 'all' ? items : items.filter(x => x.verification === filter),
    [items, filter]);
  const pendingCount = items.filter(x => x.verification === 'pending').length;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left"><h1><i className="bi bi-trophy"></i> Student Records</h1><p>Review and verify student-submitted internships &amp; achievements.</p></div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-briefcase"></i></div><div className="stat-value">{internships.length}</div><div className="stat-label">Internships</div></div>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-award"></i></div><div className="stat-value">{achievements.length}</div><div className="stat-label">Achievements</div></div>
        <div className="stat-card warning"><div className="stat-icon"><i className="bi bi-hourglass-split"></i></div><div className="stat-value">{[...internships, ...achievements].filter(x => x.verification === 'pending').length}</div><div className="stat-label">Pending Review</div></div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn ${tab === 'internships' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('internships')}><i className="bi bi-briefcase"></i> Internships</button>
        <button className={`btn ${tab === 'achievements' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('achievements')}><i className="bi bi-award"></i> Achievements</button>
        <div style={{ flex: 1 }} />
        <select className="form-control" style={{ maxWidth: '180px' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending ({pendingCount})</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="card col-12">
        <div className="card-body" style={{ padding: 0 }}>
          {filtered.length ? (
            <div style={{ overflowX: 'auto' }}>
              {tab === 'internships' ? (
                <table className="table">
                  <thead><tr><th>Student</th><th>Company / Role</th><th>Period</th><th>Stipend</th><th>Status</th><th>Verification</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filtered.map(i => (
                      <tr key={i.id}>
                        <td>{i.student_name}<br /><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{i.enrollment_no}</span></td>
                        <td><strong>{i.company}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{i.role}</span></td>
                        <td style={{ fontSize: '0.8rem' }}>{Utils.formatDate(i.start_date)} – {i.end_date ? Utils.formatDate(i.end_date) : 'Present'}</td>
                        <td>{Number(i.stipend) > 0 ? Utils.formatCurrency(i.stipend) : '—'}</td>
                        <td><span className={`badge ${i.status === 'completed' ? 'badge-success' : 'badge-info'}`} style={{ textTransform: 'capitalize' }}>{i.status}</span></td>
                        <td><span className={VERIFY_BADGE[i.verification]} style={{ textTransform: 'capitalize' }}>{i.verification}</span></td>
                        <td style={{ display: 'flex', gap: '6px' }}>
                          {i.certificate_url && <a className="btn btn-ghost btn-sm" href={i.certificate_url} target="_blank" rel="noreferrer"><i className="bi bi-file-earmark-text"></i></a>}
                          {i.verification !== 'verified' && <button className="btn btn-primary btn-sm" onClick={() => verifyIntern(i, 'verified')}><i className="bi bi-check"></i> Verify</button>}
                          {i.verification !== 'rejected' && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent, #FF6B6B)' }} onClick={() => verifyIntern(i, 'rejected')}><i className="bi bi-x-lg"></i> Reject</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="table">
                  <thead><tr><th>Student</th><th>Achievement</th><th>Category / Level</th><th>Date</th><th>Verification</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filtered.map(a => (
                      <tr key={a.id}>
                        <td>{a.student_name}<br /><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{a.enrollment_no}</span></td>
                        <td><strong>{a.title}</strong>{a.position && <><br /><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{a.position}</span></>}</td>
                        <td style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>{a.category} · {a.level}</td>
                        <td style={{ fontSize: '0.8rem' }}>{Utils.formatDate(a.date_awarded)}</td>
                        <td><span className={VERIFY_BADGE[a.verification]} style={{ textTransform: 'capitalize' }}>{a.verification}</span></td>
                        <td style={{ display: 'flex', gap: '6px' }}>
                          {a.certificate_url && <a className="btn btn-ghost btn-sm" href={a.certificate_url} target="_blank" rel="noreferrer"><i className="bi bi-file-earmark-text"></i></a>}
                          {a.verification !== 'verified' && <button className="btn btn-primary btn-sm" onClick={() => verifyAch(a, 'verified')}><i className="bi bi-check"></i> Verify</button>}
                          {a.verification !== 'rejected' && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent, #FF6B6B)' }} onClick={() => verifyAch(a, 'rejected')}><i className="bi bi-x-lg"></i> Reject</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
              <div className="empty-state-icon"><i className="bi bi-trophy"></i></div><h3>No {tab} to show</h3>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

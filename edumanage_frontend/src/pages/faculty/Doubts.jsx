import { useState, useEffect } from 'react';
import { API } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

const STATUS_CONFIG = {
  pending:    { label: 'Pending',    cls: 'badge-warning',  icon: 'bi-hourglass-split' },
  resolved:   { label: 'Resolved',   cls: 'badge-success',  icon: 'bi-check-circle-fill' },
  in_review:  { label: 'In Review',  cls: 'badge-info',     icon: 'bi-eye-fill' },
  open:       { label: 'Open',       cls: 'badge-warning',  icon: 'bi-hourglass-split' },
};

export default function FacultyDoubts() {
  const { user } = useAuthStore();
  const [doubts, setDoubts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [resolutionText, setResolutionText] = useState({});
  const [submitting, setSubmitting] = useState(null);
  const [successId, setSuccessId] = useState(null);

  const fetchDoubts = async () => {
    try {
      setLoading(true);
      const data = await API.get(`faculty/doubts`);
      setDoubts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load doubts:', e);
      setDoubts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchDoubts();
  }, [user]);

  const filtered = doubts.filter(d => {
    if (filter === 'pending') return d.status === 'pending' || d.status === 'open';
    if (filter === 'resolved') return d.status === 'resolved';
    return true;
  });

  const pendingCount  = doubts.filter(d => d.status === 'pending' || d.status === 'open').length;
  const resolvedCount = doubts.filter(d => d.status === 'resolved').length;

  const handleResolve = async (doubtId) => {
    const resolution = (resolutionText[doubtId] || '').trim();
    if (!resolution) { alert('Please enter a resolution before submitting.'); return; }

    setSubmitting(doubtId);
    try {
      await API.request('faculty/doubts/resolve', {
        method: 'POST',
        body: JSON.stringify({ doubt_id: doubtId, resolution }),
      });
      setSuccessId(doubtId);
      setResolutionText(prev => ({ ...prev, [doubtId]: '' }));
      await fetchDoubts();
      setTimeout(() => setSuccessId(null), 3000);
    } catch (e) {
      alert('Failed to submit resolution. Please try again.');
    } finally {
      setSubmitting(null);
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
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="stat-icon" style={{ background: 'rgba(108, 99, 255, 0.2)', color: '#6C63FF' }}>
            <i className="bi bi-patch-question-fill"></i>
          </div>
          <div>
            <h1>Solve Doubts</h1>
            <p>Doubts assigned to you — review and provide resolutions for your students.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary">
          <div className="stat-icon"><i className="bi bi-patch-question-fill"></i></div>
          <div>
            <div className="stat-value">{doubts.length}</div>
            <div className="stat-label">Total Assigned</div>
          </div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon"><i className="bi bi-hourglass-split"></i></div>
          <div>
            <div className="stat-value">{pendingCount}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div>
          <div>
            <div className="stat-value">{resolvedCount}</div>
            <div className="stat-label">Resolved</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="card col-12" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '8px', padding: '16px', borderBottom: '1px solid var(--border)' }}>
          {[
            { key: 'all',      label: `All (${doubts.length})` },
            { key: 'pending',  label: `Pending (${pendingCount})` },
            { key: 'resolved', label: `Resolved (${resolvedCount})` },
          ].map(tab => (
            <button
              key={tab.key}
              className={`btn btn-sm ${filter === tab.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Doubts List */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px' }}>
              <div className="empty-state-icon"><i className="bi bi-patch-question"></i></div>
              <h3>No {filter !== 'all' ? filter : ''} doubts found</h3>
              <p>No doubts have been assigned to you{filter !== 'all' ? ` with "${filter}" status` : ''} yet.</p>
            </div>
          ) : (
            filtered.map(doubt => {
              const statusCfg = STATUS_CONFIG[doubt.status] || STATUS_CONFIG.pending;
              const isExpanded = expandedId === doubt.doubt_id;
              const isResolved = doubt.status === 'resolved';

              return (
                <div
                  key={doubt.doubt_id}
                  style={{
                    border: `1px solid ${isResolved ? 'rgba(34, 197, 94, 0.3)' : 'var(--border)'}`,
                    borderRadius: '12px',
                    background: isResolved ? 'rgba(34, 197, 94, 0.05)' : 'var(--surface)',
                    overflow: 'hidden',
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Doubt Header */}
                  <div
                    style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '14px' }}
                    onClick={() => setExpandedId(isExpanded ? null : doubt.doubt_id)}
                  >
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                      background: isResolved ? 'rgba(34,197,94,0.15)' : 'rgba(108,99,255,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isResolved ? '#22c55e' : '#6C63FF', fontSize: '1.1rem',
                    }}>
                      <i className={`bi ${statusCfg.icon}`}></i>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {doubt.student_name || 'Student'}
                        </span>
                        <span className={`badge ${statusCfg.cls}`} style={{ fontSize: '0.7rem' }}>
                          <i className={`bi ${statusCfg.icon}`} style={{ marginRight: '4px' }}></i>
                          {statusCfg.label}
                        </span>
                        {doubt.subject_code && (
                          <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                            {doubt.subject_code}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.87rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {doubt.question}
                      </p>
                      <div style={{ marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        <i className="bi bi-clock" style={{ marginRight: '4px' }}></i>
                        {doubt.submitted_at ? new Date(doubt.submitted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        {doubt.subject_name && (
                          <span style={{ marginLeft: '12px' }}>
                            <i className="bi bi-book" style={{ marginRight: '4px' }}></i>
                            {doubt.subject_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <i
                      className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`}
                      style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0, marginTop: '4px' }}
                    ></i>
                  </div>

                  {/* Expanded Panel */}
                  {isExpanded && (
                    <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
                      {/* Existing resolution */}
                      {isResolved && doubt.resolution && (
                        <div style={{
                          marginTop: '16px', padding: '14px', borderRadius: '10px',
                          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                        }}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#22c55e', marginBottom: '8px' }}>
                            <i className="bi bi-check-circle-fill" style={{ marginRight: '6px' }}></i>
                            Your Resolution
                          </div>
                          <p style={{ margin: 0, fontSize: '0.87rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {doubt.resolution}
                          </p>
                          {doubt.resolved_at && (
                            <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Resolved on {new Date(doubt.resolved_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Resolution input (only for unresolved) */}
                      {!isResolved && (
                        <div style={{ marginTop: '16px' }}>
                          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                            <i className="bi bi-pencil-fill" style={{ marginRight: '6px', color: '#6C63FF' }}></i>
                            Write Your Resolution
                          </label>
                          <textarea
                            rows={4}
                            className="form-control"
                            placeholder="Explain the solution clearly for the student..."
                            value={resolutionText[doubt.doubt_id] || ''}
                            onChange={e => setResolutionText(prev => ({ ...prev, [doubt.doubt_id]: e.target.value }))}
                            style={{ width: '100%', resize: 'vertical', fontSize: '0.87rem', lineHeight: 1.6 }}
                          />
                          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={submitting === doubt.doubt_id || !resolutionText[doubt.doubt_id]?.trim()}
                              onClick={() => handleResolve(doubt.doubt_id)}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              {submitting === doubt.doubt_id ? (
                                <><div className="loading-spinner" style={{ width: '14px', height: '14px' }}></div> Submitting...</>
                              ) : (
                                <><i className="bi bi-send-fill"></i> Submit Resolution</>
                              )}
                            </button>
                            {successId === doubt.doubt_id && (
                              <span style={{ color: '#22c55e', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <i className="bi bi-check-circle-fill"></i> Resolved successfully!
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

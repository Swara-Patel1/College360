import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

export default function HODComplaints() {
  const { user } = useAuthStore();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deptId, setDeptId] = useState('');
  
  // Resolution Modal State
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [resolutionText, setResolutionText] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      
      // 1. Get HOD info
      const hodInfo = await API.get('hod/check');
      let currentDeptId = '';
      if (hodInfo && hodInfo.isHod) {
        currentDeptId = hodInfo.hod.department_id;
        setDeptId(currentDeptId);
      }

      // 2. Get complaints
      const allComplaints = await API.get('complaints');
      const deptComplaints = (allComplaints || []).filter(
        c => c.student?.department_id === currentDeptId
      );
      setComplaints(deptComplaints);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load complaints.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  // Aggregate stats by category
  const categoryCounts = {};
  complaints.forEach(c => {
    if (c.status?.toUpperCase() !== 'RESOLVED') {
      const cat = c.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  });

  // Check if any category has 10 or more open/pending problems
  const criticalCategories = Object.keys(categoryCounts).filter(
    cat => categoryCounts[cat] >= 10
  );

  // Sorting: Pinned critical category complaints first, then others
  const sortedComplaints = [...complaints].sort((a, b) => {
    const aCritical = criticalCategories.includes(a.category) && a.status?.toUpperCase() !== 'RESOLVED';
    const bCritical = criticalCategories.includes(b.category) && b.status?.toUpperCase() !== 'RESOLVED';
    if (aCritical && !bCritical) return -1;
    if (!aCritical && bCritical) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    if (!resolutionText.trim()) {
      Toast.warning('Please enter resolution note.');
      return;
    }

    try {
      setLoading(true);
      await API.patch(`grievances?grievance_id=eq.${selectedComplaint.grievance_id}`, {
        status: 'RESOLVED',
        resolution_note: resolutionText,
        resolved_at: new Date().toISOString()
      });
      Toast.success('Complaint resolved successfully.');
      setIsResolveOpen(false);
      setResolutionText('');
      loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to resolve complaint.');
      setLoading(false);
    }
  };

  const totalCount = complaints.length;
  const pendingCount = complaints.filter(c => c.status?.toUpperCase() !== 'RESOLVED').length;
  const resolvedCount = totalCount - pendingCount;

  if (loading && !complaints.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>📣 Student Grievances</h1>
          <p>Review and address complaints submitted by students in your department.</p>
        </div>
      </div>

      {/* Mini Stats */}
      <div className="stats-mini">
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(108,99,255,0.2)' }}>📣</div>
          <div>
            <div className="stats-mini-val" style={{ color: 'var(--primary)' }}>{totalCount}</div>
            <div className="stats-mini-lbl">Total Problems</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(255,107,107,0.2)' }}>⏳</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#FF6B6B' }}>{pendingCount}</div>
            <div className="stats-mini-lbl">Pending</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(0,212,170,0.2)' }}>✅</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#00D4AA' }}>{resolvedCount}</div>
            <div className="stats-mini-lbl">Resolved</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(84,160,255,0.2)' }}>🏢</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#54A0FF' }}>{Object.keys(categoryCounts).length}</div>
            <div className="stats-mini-lbl">Active Categories</div>
          </div>
        </div>
      </div>

      {/* Critical Categories Warning Banner */}
      {criticalCategories.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: '24px', padding: '16px', borderRadius: '10px', borderLeft: '5px solid #FF6B6B', background: 'rgba(255,107,107,0.08)' }}>
          <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#FF6B6B' }}>
            🚨 CRITICAL ATTENTION REQUIRED
          </h4>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            The following categories have <strong>10 or more open complaints</strong>. Under SLA policies, these must be resolved <strong>within 3 days</strong>:
          </p>
          <ul style={{ margin: '8px 0 0 20px', padding: 0, color: '#FF6B6B' }}>
            {criticalCategories.map(cat => (
              <li key={cat}>
                <strong>{cat}</strong>: {categoryCounts[cat]} unresolved problems.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Complaints List */}
      <div className="card">
        <div className="card-header" style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Grievances Log</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {sortedComplaints.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Date Filed</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedComplaints.map((c) => {
                  const isCritical = criticalCategories.includes(c.category) && c.status?.toUpperCase() !== 'RESOLVED';
                  return (
                    <tr key={c.grievance_id} style={isCritical ? { background: 'rgba(255,107,107,0.03)' } : {}}>
                      <td style={{ fontWeight: 600 }}>
                        {c.student_name}
                        {isCritical && <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#FF6B6B', border: '1px solid #FF6B6B', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>SLA 3-Day Alert</span>}
                      </td>
                      <td>
                        <span className="badge badge-info">{c.category}</span>
                      </td>
                      <td style={{ maxWidth: '400px', whiteSpace: 'normal', wordBreak: 'break-word', color: 'var(--text-secondary)' }}>
                        {c.description}
                        {c.resolution_note && (
                          <div style={{ marginTop: '8px', fontSize: '0.8rem', padding: '8px', borderRadius: '6px', background: 'rgba(0,212,170,0.06)', borderLeft: '3px solid #00D4AA', color: 'var(--text-primary)' }}>
                            <strong>Resolution Note:</strong> {c.resolution_note}
                          </div>
                        )}
                      </td>
                      <td>{Utils.formatDate(c.created_at)}</td>
                      <td>
                        <span className={`badge badge-${c.status?.toUpperCase() === 'RESOLVED' ? 'success' : 'warning'}`}>
                          {c.status?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {c.status?.toUpperCase() !== 'RESOLVED' ? (
                          <button 
                            className="btn btn-ghost btn-sm" 
                            style={{ color: 'var(--primary)' }}
                            onClick={() => { setSelectedComplaint(c); setIsResolveOpen(true); }}
                          >
                            ✏️ Resolve
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>✔️ Resolved</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty-state" style={{ padding: '40px' }}>
              <div className="empty-state-icon">📣</div>
              <p>No complaints reported in your department.</p>
            </div>
          )}
        </div>
      </div>

      {/* ======================== RESOLVE COMPLAINT MODAL ======================== */}
      {isResolveOpen && selectedComplaint && (
        <Modal isOpen={isResolveOpen} onClose={() => setIsResolveOpen(false)} title="✏️ Resolve Student Grievance">
          <form onSubmit={handleResolveSubmit}>
            <div style={{ marginBottom: '15px' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <strong>Grievance:</strong> {selectedComplaint.description}
              </p>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Resolution Actions & Note *</label>
              <textarea 
                className="form-input" 
                rows="4" 
                required 
                placeholder="Detail what steps have been taken to solve this problem..."
                value={resolutionText} 
                onChange={e => setResolutionText(e.target.value)}
              />
            </div>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsResolveOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>Submit Resolution</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

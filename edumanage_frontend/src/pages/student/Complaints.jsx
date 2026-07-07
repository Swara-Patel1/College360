import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import Modal from '../../components/Modal.jsx';

export default function Complaints() {
  const { user } = useAuthStore();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  // Raise New Complaint Modal State
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('academic');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchComplaints = async () => {
    try {
      const data = await API.get('complaints');
      setComplaints(Array.isArray(data) ? data : (data.results || []));
    } catch (e) {
      console.error('Failed to load complaints:', e);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;
    const initPage = async () => {
      setLoading(true);
      await fetchComplaints();
      if (isMounted) setLoading(false);
    };

    initPage();
    return () => { isMounted = false; };
  }, [user]);

  const catLabel = {
    academic: 'Academic',
    facility: 'Facility',
    faculty: 'Faculty Behaviour',
    administrative: 'Administrative',
    other: 'Other'
  };

  const getStatusLabel = (status) => {
    return {
      pending: '⏳ Pending',
      in_review: '🔍 In Review',
      resolved: '✅ Resolved',
      dismissed: '❌ Dismissed'
    }[status] || status;
  };

  const getStatusClass = (status) => {
    return {
      pending: 'badge badge-warning',
      in_review: 'badge badge-info',
      resolved: 'badge badge-success',
      dismissed: 'badge badge-muted'
    }[status] || 'badge badge-muted';
  };

  const handleOpenModal = () => {
    setTitle('');
    setDescription('');
    setCategory('academic');
    setIsAnonymous(false);
    setIsOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !description) {
      alert('Please fill out all required fields.');
      return;
    }

    try {
      setIsSubmitting(true);
      await API.post('complaints', {
        title,
        description,
        category,
        is_anonymous: isAnonymous
      });
      setIsOpen(false);
      fetchComplaints();
    } catch (err) {
      alert('Failed to submit complaint: ' + (err.message || JSON.stringify(err)));
    } finally {
      setIsSubmitting(false);
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
      <div className="page-header">
        <div className="page-header-left">
          <h1>📣 Support & Complaints</h1>
          <p id="pageSubtitle">
            {complaints.length} complaint{complaints.length !== 1 ? 's' : ''} raised by you.
          </p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={handleOpenModal}>📣 Raise New Complaint</button>
        </div>
      </div>

      <div className="card col-12">
        <div className="card-header">
          <div className="card-title">📋 Complaint Log & Status</div>
        </div>
        
        <div className="card-body" id="complaintsList" style={{ display: 'grid', gap: '16px' }}>
          {complaints.length ? (
            complaints.map((c, i) => (
              <div 
                className="complaint-card" 
                key={i} 
                style={{
                  padding: '20px',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  background: 'var(--bg-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div className="complaint-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div className="complaint-title" style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
                      {c.title}
                    </div>
                    <div className="complaint-meta" style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="cat-chip" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                        {catLabel[c.category] || c.category}
                      </span>
                      <span>🗓️ {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      {c.is_anonymous && <span style={{ color: 'var(--accent)' }}>🕵️ Anonymous</span>}
                    </div>
                  </div>
                  <span className={getStatusClass(c.status)} style={{ textTransform: 'capitalize' }}>
                    {getStatusLabel(c.status)}
                  </span>
                </div>
                
                <div className="complaint-body" style={{ fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {c.description}
                </div>

                {c.hod_response && (
                  <div className="hod-response" style={{ background: 'rgba(108,99,255,0.04)', borderLeft: '3px solid #6C63FF', padding: '12px', borderRadius: '0 8px 8px 0', marginTop: '4px' }}>
                    <div className="hod-response-label" style={{ color: '#6C63FF', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>🎓 HOD Response</div>
                    <div className="hod-response-text" style={{ fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{c.hod_response}</div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
              <div className="empty-icon" style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📭</div>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>No Complaints Yet</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                If you have any issue, click <strong>Raise New Complaint</strong> to notify the HOD.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ======================== NEW COMPLAINT MODAL ======================== */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="📣 Raise New Complaint">
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Category *</label>
            <select 
              className="form-control"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="academic">Academic</option>
              <option value="facility">Facility</option>
              <option value="faculty">Faculty Behaviour</option>
              <option value="administrative">Administrative</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Subject / Title *</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Brief summary of the issue..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Detailed Description *</label>
            <textarea 
              className="form-control" 
              rows="4" 
              placeholder="Describe the issue, include date, time and specific details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" 
              id="c_anonymous" 
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <label htmlFor="c_anonymous" className="form-label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>
              Submit anonymously to Head of Department
            </label>
          </div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setIsOpen(false)}>Cancel</button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Complaint'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

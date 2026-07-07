import { useState, useEffect } from 'react';
import { API, Utils, SupaAPI } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import Modal from '../../components/Modal.jsx';

export default function Doubts() {
  const { user } = useAuthStore();
  const [allDoubts, setAllDoubts] = useState([]);
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Ask Doubt Modal State
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchDoubts = async () => {
    try {
      const data = await SupaAPI.doubts.byStudent(user.id);
      setAllDoubts(Array.isArray(data) ? data : (data?.results || []));
    } catch (e) {
      console.error('Failed to load doubts:', e);
    }
  };

  const fetchCourses = async () => {
    try {
      const data = await API.get('courses/enrollments');
      setEnrolledCourses(Array.isArray(data) ? data : (data?.results || []));
    } catch {
      try {
        const data = await API.get('courses');
        setEnrolledCourses(Array.isArray(data) ? data : (data?.results || []));
      } catch (err) {
        console.error('Failed to load courses:', err);
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;
    const initPage = async () => {
      setLoading(true);
      await Promise.all([fetchDoubts(), fetchCourses()]);
      if (isMounted) setLoading(false);
    };

    initPage();
    return () => { isMounted = false; };
  }, [user]);

  // SLA warn calculation helper
  const renderSlaBadge = (d) => {
    if (d.status === 'resolved' || !d.sla_deadline) return null;
    const deadline = new Date(d.sla_deadline);
    const now = new Date();
    const hoursLeft = (deadline - now) / 3600000;
    
    if (hoursLeft < 0) {
      return <span className="sla-warn" style={{ color: 'var(--accent)', background: 'rgba(255,107,107,0.15)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, marginLeft: '8px' }}>⚠️ SLA Breached — Escalating to HOD</span>;
    }
    return <span className="sla-warn" style={{ color: 'var(--primary-light)', background: 'rgba(108,99,255,0.15)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, marginLeft: '8px' }}>⏰ {Math.round(hoursLeft)}h left for reply</span>;
  };

  const totalCount = allDoubts.length;
  const openCount = allDoubts.filter(d => d.status === 'open' || d.status === 'under_review').length;
  const resolvedCount = allDoubts.filter(d => d.status === 'resolved').length;
  const escalatedCount = allDoubts.filter(d => d.status === 'escalated').length;

  const filteredDoubts = selectedFilter === 'all'
    ? allDoubts
    : allDoubts.filter(d => d.status === selectedFilter);

  const handleOpenModal = () => {
    setSelectedSubjectId('');
    setQuestionText('');
    setIsOpen(true);
  };

  const handleSubmitDoubt = async (e) => {
    e.preventDefault();
    if (!selectedSubjectId) {
      alert('Please select a subject.');
      return;
    }
    if (questionText.trim().length < 20) {
      alert('Please describe your doubt in at least 20 characters.');
      return;
    }

    const courseObj = enrolledCourses.find(c => String(c.course || c.id) === String(selectedSubjectId));
    const code = courseObj?.course_code || courseObj?.code || 'SUBJ';
    const name = courseObj?.course_name || courseObj?.name || 'Subject';

    try {
      setIsSubmitting(true);
      
      // Calculate SLA deadline: +72 hours (3 days) from now
      const slaDeadline = new Date();
      slaDeadline.setHours(slaDeadline.getHours() + 72);

      await SupaAPI.doubts.add({
        student_id: user.id,
        student_name: `${user.first_name} ${user.last_name}`.trim(),
        subject_id: selectedSubjectId,
        subject_name: name,
        subject_code: code,
        question: questionText.trim(),
        status: 'open',
        submitted_at: new Date().toISOString(),
        sla_deadline: slaDeadline.toISOString()
      });

      setIsOpen(false);
      fetchDoubts();
    } catch (err) {
      alert('Failed to submit doubt: ' + (err.message || JSON.stringify(err)));
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
      {/* Row 1: Doubts Q&A title card */}
      <div className="stat-card primary" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="stat-icon">📋</div>
          <div className="stat-value">Doubts Q&A</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Get answers to your conceptual doubts from faculty experts.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenModal} style={{ flexShrink: 0 }}>❓ Ask a Doubt</button>
      </div>

      {/* Stats row */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary">
          <div className="stat-icon">❓</div>
          <div className="stat-value" id="st-total">{totalCount}</div>
          <div className="stat-label">Total Doubts</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">⏳</div>
          <div className="stat-value" id="st-open">{openCount}</div>
          <div className="stat-label">Pending Response</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">✅</div>
          <div className="stat-value" id="st-resolved">{resolvedCount}</div>
          <div className="stat-label">Resolved</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-icon">🚨</div>
          <div className="stat-value" id="st-escalated">{escalatedCount}</div>
          <div className="stat-label">Escalated to HOD</div>
        </div>
      </div>

      {/* Doubts Browser */}
      <div className="card col-12">
        <div className="card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div className="card-title">📖 Doubt History</div>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button 
              className={`btn ${selectedFilter === 'all' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedFilter('all')}
            >
              All
            </button>
            <button 
              className={`btn ${selectedFilter === 'open' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedFilter('open')}
            >
              Open
            </button>
            <button 
              className={`btn ${selectedFilter === 'under_review' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedFilter('under_review')}
            >
              Under Review
            </button>
            <button 
              className={`btn ${selectedFilter === 'resolved' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedFilter('resolved')}
            >
              Resolved
            </button>
            <button 
              className={`btn ${selectedFilter === 'escalated' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedFilter('escalated')}
            >
              Escalated
            </button>
          </div>
        </div>

        <div className="card-body" id="doubtsList" style={{ display: 'grid', gap: '16px' }}>
          {filteredDoubts.length ? (
            filteredDoubts.map((d, i) => (
              <div className="doubt-card" key={i} style={{ padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-secondary)' }}>
                <div className="doubt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span className="doubt-subject-chip" style={{ background: 'rgba(108,99,255,0.15)', color: 'var(--primary-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                      {d.subject_code || 'Course'}
                    </span>
                    <span className={Utils.getStatusBadgeClass(d.status)}>
                      {d.status.replace('_', ' ').toUpperCase()}
                    </span>
                    {renderSlaBadge(d)}
                  </div>
                  <div className="doubt-meta" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(d.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                
                <div className="doubt-question" style={{ fontWeight: 600, fontSize: '0.975rem', lineHeight: 1.5, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  {d.question}
                </div>
                
                <div className="doubt-meta" style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: d.resolution ? '16px' : '0' }}>
                  <span>📚 {d.subject_name || '—'}</span>
                  {d.assigned_faculty_name && <span>👨‍🏫 {d.assigned_faculty_name}</span>}
                  {d.resolved_at && <span>✅ Resolved {new Date(d.resolved_at).toLocaleDateString('en-IN')}</span>}
                </div>

                {d.resolution && (
                  <div className="resolution-box" style={{ background: 'rgba(0,212,170,0.04)', borderLeft: '3px solid #00D4AA', padding: '14px', borderRadius: '0 8px 8px 0', marginTop: '12px' }}>
                    <h4 style={{ color: '#00D4AA', margin: '0 0 6px 0', fontSize: '0.85rem', fontWeight: 700 }}>📖 Faculty Answer:</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{d.resolution}</p>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
              <div className="empty-state-icon">📭</div>
              <h3>No doubts in this category</h3>
              <p style={{ margin: '8px 0 16px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Your doubts and faculty responses will appear here.
              </p>
              <button className="btn btn-primary" onClick={handleOpenModal}>Ask your first doubt</button>
            </div>
          )}
        </div>
      </div>

      {/* ======================== ASK DOUBT MODAL ======================== */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="❓ Ask a New Doubt">
        <form onSubmit={handleSubmitDoubt}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Select Course / Subject *</label>
            <select 
              className="form-control"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              required
            >
              <option value="">Choose Course...</option>
              {enrolledCourses.map((e, idx) => {
                const c = e.course || e;
                return (
                  <option value={c.id} key={idx}>
                    {c.name} ({c.code || c.course_code})
                  </option>
                );
              })}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Doubt Description *</label>
            <textarea 
              className="form-control" 
              rows="5"
              placeholder="Describe your conceptual or project doubt in details. Minimum 20 characters..."
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              required
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
              {questionText.length}/20 characters minimum.
            </span>
          </div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setIsOpen(false)}>Cancel</button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSubmitting || questionText.trim().length < 20}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Doubt'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

import { useState, useEffect } from 'react';
import { API, Utils } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import Modal from '../components/Modal.jsx';

export default function Notices() {
  const { user } = useAuthStore();
  const [notices, setNotices] = useState([]);
  const [filteredNotices, setFilteredNotices] = useState([]);
  const [selectedType, setSelectedType] = useState('all');
  const [loading, setLoading] = useState(true);

  // Modal form states
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('general');
  const [audience, setAudience] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isStudent = user?.role === 'student';
  const isAdmin = user?.role === 'admin' || user?.role === 'hod';

  const fetchNotices = async () => {
    try {
      const data = await API.get('notices');
      const list = data || [];
      setNotices(list);
      setFilteredNotices(list);
    } catch (e) {
      console.error('Failed to load notices:', e);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;
    const init = async () => {
      setLoading(true);
      await fetchNotices();
      if (isMounted) setLoading(false);
    };

    init();
    
    // Realtime events
    const handleNewNotice = () => {
      fetchNotices();
    };

    window.addEventListener('socket:notice:new', handleNewNotice);
    return () => {
      isMounted = false;
      window.removeEventListener('socket:notice:new', handleNewNotice);
    };
  }, [user]);

  // Handle local filter update
  useEffect(() => {
    if (selectedType === 'all') {
      setFilteredNotices(notices);
    } else {
      setFilteredNotices(notices.filter(n => n.notice_type === selectedType));
    }
  }, [selectedType, notices]);

  const typeConfig = {
    general: { color: '#54A0FF', bg: 'rgba(84,160,255,0.1)', border: 'rgba(84,160,255,0.3)', icon: '📋', label: 'General' },
    exam:    { color: '#FF9F43', bg: 'rgba(255,159,67,0.1)',  border: 'rgba(255,159,67,0.3)',  icon: '📝', label: 'Exam' },
    holiday: { color: '#00D4AA', bg: 'rgba(0,212,170,0.1)',   border: 'rgba(0,212,170,0.3)',   icon: '🎉', label: 'Holiday' },
    event:   { color: '#6C63FF', bg: 'rgba(108,99,255,0.1)',  border: 'rgba(108,99,255,0.3)',  icon: '🎪', label: 'Event' },
    urgent:  { color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.3)', icon: '🚨', label: 'Urgent' },
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setType('general');
    setAudience('all');
    setIsOpen(true);
  };

  const handleOpenEdit = (n) => {
    setEditingId(n.id);
    setTitle(n.title || '');
    setContent(n.content || '');
    setType(n.notice_type || 'general');
    setAudience(n.audience || 'all');
    setIsOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !content) {
      alert('Please fill out all required fields.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        title,
        content,
        notice_type: type,
        audience,
        posted_by_name: `${user.first_name} ${user.last_name}`.trim()
      };

      if (editingId) {
        await API.patch(`notices?notice_id=eq.${editingId}`, payload);
      } else {
        await API.post('notices', payload);
      }
      setIsOpen(false);
      fetchNotices();
    } catch (err) {
      alert('Failed to save notice: ' + (err.message || JSON.stringify(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this notice?')) return;
    try {
      await API.delete(`notices?notice_id=eq.${id}`);
      fetchNotices();
    } catch (err) {
      alert('Failed to delete notice: ' + (err.message || JSON.stringify(err)));
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
          <h1>📢 Bulletin Notice Board</h1>
          <p>Official notices and academic announcements.</p>
        </div>
        {!isStudent && (
          <div className="page-header-right">
            <button className="btn btn-primary" onClick={handleOpenAdd}>📢 Post Notice</button>
          </div>
        )}
      </div>

      {/* Filters bar */}
      <div className="card col-12" style={{ marginBottom: '24px' }}>
        <div className="card-body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            className={`btn ${selectedType === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSelectedType('all')}
          >
            All Notices
          </button>
          {Object.keys(typeConfig).map(t => (
            <button 
              key={t}
              className={`btn ${selectedType === t ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSelectedType(t)}
            >
              {typeConfig[t].icon} {typeConfig[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of notices */}
      <div 
        id="noticesGrid" 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px',
          marginBottom: '32px'
        }}
      >
        {filteredNotices.length ? (
          filteredNotices.map((n, i) => {
            const cfg = typeConfig[n.notice_type] || typeConfig.general;
            const audLabel = n.audience === 'all' ? '👥 Everyone' : n.audience === 'students' ? '🎓 Students' : '👨‍🏫 Faculty';
            return (
              <div 
                className="card" 
                key={i}
                style={{
                  borderColor: cfg.border,
                  transition: 'all 0.3s',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ padding: '20px 24px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', border: `1px solid ${cfg.border}` }}>
                        {cfg.icon}
                      </div>
                      <div>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                          {cfg.label}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{audLabel}</div>
                      </div>
                    </div>
                    {!isStudent && (
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleOpenEdit(n)} title="Edit">✏️</button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(n.id)} title="Delete">🗑️</button>
                      </div>
                    )}
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', lineHeight: 1.3 }}>
                    {n.title}
                  </h3>
                  <p style={{ fontSize: '0.825rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    {n.content}
                  </p>
                </div>
                
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-light)', marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>By <strong style={{ color: 'var(--text-secondary)' }}>{n.posted_by_name || 'Admin'}</strong></span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{Utils.formatDate(n.created_at)}</div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="card col-12 text-center" style={{ padding: '60px', gridColumn: '1 / -1' }}>
            <div className="empty-state">
              <div className="empty-state-icon">📢</div>
              <h3>No Notices Found</h3>
              <p style={{ margin: '8px 0 16px 0', color: 'var(--text-muted)' }}>No notices match the selected filter.</p>
            </div>
          </div>
        )}
      </div>

      {/* ======================== POST / EDIT NOTICE MODAL ======================== */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editingId ? '✏️ Edit Notice' : '📢 Post New Notice'}>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Notice Type *</label>
            <select 
              className="form-control"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
            >
              <option value="general">General</option>
              <option value="exam">Exam</option>
              <option value="holiday">Holiday</option>
              <option value="event">Event</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Audience *</label>
            <select 
              className="form-control"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              required
            >
              <option value="all">Everyone</option>
              <option value="students">Students Only</option>
              <option value="faculty">Faculty Only</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Title *</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Notice title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Content *</label>
            <textarea 
              className="form-control" 
              rows="6" 
              placeholder="Write announcement body here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
          </div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setIsOpen(false)}>Cancel</button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Posting...' : editingId ? 'Update' : 'Post Notice'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

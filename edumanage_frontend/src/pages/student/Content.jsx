import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

export default function Content() {
  const { user } = useAuthStore();
  const [allContent, setAllContent] = useState([]);
  const [selectedType, setSelectedType] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [enrolledSubjectIds, setEnrolledSubjectIds] = useState(null); // null = not yet loaded
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;

    const fetchContent = async () => {
      try {
        // Load enrollments first to know which subjects the student belongs to
        let enrolledIds = null;
        if (user.role === 'student') {
          const enrollData = await API.get('enrollments').catch(() => []);
          enrolledIds = new Set((enrollData || []).map(e => e.course || e.course_id || e.subject_id).filter(Boolean));
          if (isMounted) setEnrolledSubjectIds(enrolledIds);
        }

        const data = await API.get('content');
        if (isMounted) {
          let content = Array.isArray(data) ? data : (data?.results || []);
          // For students: only show content from their enrolled subjects
          if (enrolledIds && enrolledIds.size > 0) {
            content = content.filter(c => !c.subject_id || enrolledIds.has(c.subject_id));
          }
          setAllContent(content);
        }
      } catch (e) {
        console.error('Failed to load study materials:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchContent();
    return () => { isMounted = false; };
  }, [user]);

  const getTypeConfig = (type) => {
    return {
      notes:      { icon: '📄', label: 'Note',       cls: 'type-note',  action: 'Download' },
      video:      { icon: '▶️', label: 'Video',      cls: 'type-video', action: 'Watch' },
      reference:  { icon: '🔗', label: 'Reference',  cls: 'type-link',  action: 'Open' },
      assignment: { icon: '📝', label: 'Assignment', cls: 'type-ppt',   action: 'View' },
    }[type] || { icon: '📎', label: type || 'Resource', cls: 'type-link', action: 'Open' };
  };

  // Build subject map — for students, only enrolled subjects
  const subjectMap = new Map();
  allContent.forEach(c => {
    if (c.subject_id && c.subject_name && c.subject_name !== '—') {
      // If we have enrollment data, only show enrolled subjects in the pills
      if (!enrolledSubjectIds || enrolledSubjectIds.has(c.subject_id)) {
        subjectMap.set(c.subject_id, c.subject_name);
      }
    }
  });

  // Calculate statistics counts
  const totalCount    = allContent.length;
  const notesCount    = allContent.filter(c => c.content_type === 'notes').length;
  const videosCount   = allContent.filter(c => c.content_type === 'video').length;
  const refCount      = allContent.filter(c => c.content_type === 'reference').length;
  const assignCount   = allContent.filter(c => c.content_type === 'assignment').length;

  // Filter content
  const filteredContent = allContent.filter(c => {
    const matchType = selectedType === 'all' || c.content_type === selectedType;
    const matchSubject = selectedSubject === null || c.subject_id === selectedSubject;
    const query = searchQuery.toLowerCase().trim();
    const matchSearch = !query || 
      (c.title || '').toLowerCase().includes(query) || 
      (c.topic_tag || '').toLowerCase().includes(query) || 
      (c.description || '').toLowerCase().includes(query);
    return matchType && matchSubject && matchSearch;
  });

  const openContent = (c) => {
    const url = c.file_url || c.video_url;
    if (url && url !== '#') {
      window.open(url, '_blank');
    } else {
      alert('No link available for this resource yet.');
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
          <h1>📖 Study Materials</h1>
          <p>Browse course materials, lectures, notes, and links.</p>
        </div>
      </div>

      {/* Stats Summary cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary">
          <div className="stat-icon">📚</div>
          <div className="stat-value" id="st-all">{totalCount}</div>
          <div className="stat-label">Total Resources</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">📄</div>
          <div className="stat-value" id="st-notes">{notesCount}</div>
          <div className="stat-label">Notes</div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon">▶️</div>
          <div className="stat-value" id="st-videos">{videosCount}</div>
          <div className="stat-label">Video Tutorials</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">🔗</div>
          <div className="stat-value" id="st-ref">{refCount}</div>
          <div className="stat-label">References</div>
        </div>
        <div className="stat-card" style={{ background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)' }}>
          <div className="stat-icon">📝</div>
          <div className="stat-value" id="st-assign">{assignCount}</div>
          <div className="stat-label">Assignments</div>
        </div>
      </div>

      {/* Filter and Browse Card */}
      <div className="card col-12" style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div className="card-title">🔍 Search Materials</div>
          <div className="search-input-wrap" style={{ width: '300px', marginLeft: 'auto' }}>
            <span>🔍</span>
            <input 
              type="text" 
              placeholder="Search by title, tag, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="card-body">
          {/* Content Type Filter buttons */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button
              className={`btn ${selectedType === 'all' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedType('all')}
            >
              All Types
            </button>
            <button
              className={`btn ${selectedType === 'notes' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedType('notes')}
            >
              📄 Notes
            </button>
            <button
              className={`btn ${selectedType === 'video' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedType('video')}
            >
              ▶️ Videos
            </button>
            <button
              className={`btn ${selectedType === 'reference' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedType('reference')}
            >
              🔗 Reference
            </button>
            <button
              className={`btn ${selectedType === 'assignment' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setSelectedType('assignment')}
            >
              📝 Assignment
            </button>
          </div>

          {/* Subject Pills Filter */}
          {subjectMap.size > 0 && (
            <div id="subjectPills" style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap' }}>
              <button 
                className={`btn ${selectedSubject === null ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
                onClick={() => setSelectedSubject(null)}
              >
                All Subjects
              </button>
              {[...subjectMap.entries()].map(([id, name]) => (
                <button 
                  key={id}
                  className={`btn ${selectedSubject === id ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
                  onClick={() => setSelectedSubject(id)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Materials Grid list */}
      <div 
        id="contentGrid" 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px',
          marginBottom: '32px'
        }}
      >
        {filteredContent.length ? (
          filteredContent.map((c, i) => {
            const cfg = getTypeConfig(c.content_type);
            return (
              <div className="content-card" key={i} onClick={() => openContent(c)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`content-type-badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
                  {c.topic_tag && <span className="content-tag">{c.topic_tag}</span>}
                </div>
                <div className="content-title" style={{ fontWeight: 700, fontSize: '1.05rem', margin: '12px 0 6px 0', color: 'var(--text-primary)' }}>
                  {c.title}
                </div>
                {c.description && (
                  <div className="content-desc" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.4, marginBottom: '16px' }}>
                    {c.description.substring(0, 100)}{c.description.length > 100 ? '…' : ''}
                  </div>
                )}
                <div className="content-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>📚 {c.subject_code || c.subject_name || '—'}</span>
                  <span>👨‍🏫 {c.faculty_name || '—'}</span>
                  <span className="btn btn-primary btn-sm">{cfg.action} →</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="card col-12 text-center" style={{ padding: '60px', gridColumn: '1 / -1' }}>
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <p>No materials found matching your filters.</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

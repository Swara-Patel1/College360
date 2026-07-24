import { useState, useEffect } from 'react';
import { API, SupaAPI } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

const DIMENSIONS = [
  { key: 'teaching', label: 'Teaching Quality' },
  { key: 'knowledge', label: 'Subject Knowledge' },
  { key: 'communication', label: 'Communication' },
  { key: 'punctuality', label: 'Punctuality' },
];

function Stars({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          role="button"
          onClick={() => onChange(n)}
          style={{ cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, filter: n <= value ? 'none' : 'grayscale(1) opacity(0.35)' }}
        >⭐</span>
      ))}
    </div>
  );
}

export default function Feedback() {
  const { user } = useAuthStore();
  const [items, setItems] = useState([]);   // { courseId, courseName, courseCode, facultyId, facultyName }
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(() => JSON.parse(localStorage.getItem('feedback_given') || '{}'));

  const [active, setActive] = useState(null);
  const [ratings, setRatings] = useState({ teaching: 0, knowledge: 0, communication: 0, punctuality: 0 });
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [enrolled, allCourses] = await Promise.all([
          API.get('courses/enrollments').catch(() => []),
          API.get('courses').catch(() => []),
        ]);
        const facById = {};
        (allCourses || []).forEach(c => {
          facById[String(c.subject_id || c.id)] = { facultyId: c.faculty_id, facultyName: c.faculty_name };
        });
        const list = (enrolled || []).map(e => {
          const cid = String(e.course || e.subject_id || e.course_id);
          const f = facById[cid] || {};
          return {
            courseId: cid,
            courseName: e.course_name || '—',
            courseCode: e.course_code || '—',
            facultyId: f.facultyId,
            facultyName: f.facultyName || 'Faculty',
          };
        }).filter(x => x.facultyId);
        setItems(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const openForm = (item) => {
    setActive(item);
    setRatings({ teaching: 0, knowledge: 0, communication: 0, punctuality: 0 });
    setComment('');
    setAnonymous(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (Object.values(ratings).some(v => v === 0)) {
      Toast.warning('Please rate all four dimensions.');
      return;
    }
    try {
      setSubmitting(true);
      await SupaAPI.feedback.submit({
        student_id: user.id,
        faculty_id: active.facultyId,
        course_id: active.courseId,
        ...ratings,
        comment,
        is_anonymous: anonymous,
      });
      const nextDone = { ...done, [active.courseId]: true };
      setDone(nextDone);
      localStorage.setItem('feedback_given', JSON.stringify(nextDone));
      Toast.success('Thank you! Your feedback was submitted.');
      setActive(null);
    } catch (err) {
      Toast.error('Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;
  }

  return (
    <>
      <div className="stat-card primary" style={{ marginBottom: '20px' }}>
        <div className="stat-icon">⭐</div>
        <div className="stat-value">Faculty Feedback</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
          Rate your instructors. Feedback can be submitted anonymously and helps your department improve teaching.
        </p>
      </div>

      {items.length ? (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {items.map(item => (
            <div key={item.courseId} className="card" style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>{item.courseName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>{item.courseCode}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>👨‍🏫 {item.facultyName}</div>
              {done[item.courseId] ? (
                <span className="badge badge-success">✓ Feedback submitted</span>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => openForm(item)}>Give Feedback</button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
          <div className="empty-state-icon">📭</div>
          <h3>No courses to review yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Once you're enrolled in courses, you can rate their faculty here.</p>
        </div>
      )}

      <Modal isOpen={!!active} onClose={() => setActive(null)} title={`⭐ Rate ${active?.facultyName || ''}`}>
        {active && (
          <form onSubmit={submit}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              {active.courseName} ({active.courseCode})
            </p>
            <div style={{ display: 'grid', gap: '16px', marginBottom: '18px' }}>
              {DIMENSIONS.map(d => (
                <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.9rem' }}>{d.label}</span>
                  <Stars value={ratings[d.key]} onChange={(n) => setRatings(r => ({ ...r, [d.key]: n }))} />
                </div>
              ))}
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">Comments (optional)</label>
              <textarea className="form-control" rows="3" value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Anything specific you'd like the department to know?" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Submit anonymously (your name won't be shown)
            </label>
            <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setActive(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Feedback'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

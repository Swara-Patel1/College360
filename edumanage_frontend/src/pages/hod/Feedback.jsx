import { useState, useEffect } from 'react';
import { API, SupaAPI } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

const DIMS = [
  { key: 'teaching', label: 'Teaching' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'communication', label: 'Communication' },
  { key: 'punctuality', label: 'Punctuality' },
];

const scoreColor = (v) => (v >= 4.2 ? 'var(--status-success, #00D4AA)' : v >= 3.4 ? 'var(--status-warning, #FF9F43)' : 'var(--status-danger, #FF6B6B)');

export default function HODFeedback() {
  const { user } = useAuthStore();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Scope to the HOD's own department when we can resolve it.
        let deptId = null;
        try {
          const prof = await API.get('faculty/my_profile');
          deptId = prof?.department_id || prof?.department?.department_id || null;
        } catch { /* fall back to all */ }
        const data = await SupaAPI.feedback.summary(deptId);
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const totalResponses = rows.reduce((a, r) => a + r.responses, 0);
  const avgOverall = rows.length ? (rows.reduce((a, r) => a + r.overall, 0) / rows.length).toFixed(2) : '—';

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Faculty Feedback</h1>
          <p>Aggregated, anonymous student ratings across your department.</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary"><div className="stat-icon">👨‍🏫</div><div className="stat-value">{rows.length}</div><div className="stat-label">Faculty Rated</div></div>
        <div className="stat-card info"><div className="stat-icon">🗳️</div><div className="stat-value">{totalResponses}</div><div className="stat-label">Total Responses</div></div>
        <div className="stat-card success"><div className="stat-icon">⭐</div><div className="stat-value">{avgOverall}</div><div className="stat-label">Avg Overall (/5)</div></div>
      </div>

      <div className="card col-12">
        <div className="card-header"><div className="card-title">📊 Ratings by Faculty</div></div>
        <div className="card-body" style={{ padding: 0 }}>
          {rows.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Faculty</th>
                    <th>Responses</th>
                    {DIMS.map(d => <th key={d.key}>{d.label}</th>)}
                    <th>Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.faculty_id}>
                      <td style={{ fontWeight: 600 }}>{r.faculty_name}</td>
                      <td>{r.responses}</td>
                      {DIMS.map(d => (
                        <td key={d.key} style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(r[d.key]).toFixed(1)}</td>
                      ))}
                      <td>
                        <span style={{ fontWeight: 700, color: scoreColor(r.overall) }}>{Number(r.overall).toFixed(2)}</span>
                        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(r.overall / 5) * 100}%`, background: scoreColor(r.overall) }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
              <div className="empty-state-icon">📊</div>
              <p>No feedback has been submitted yet.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

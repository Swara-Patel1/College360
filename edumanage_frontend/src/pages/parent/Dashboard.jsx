import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API, Utils } from '../../api/client.js';
import { useChild } from './useChild.js';

export default function ParentDashboard() {
  const { child, loading, error } = useChild();
  const [att, setAtt] = useState(null);
  const [grades, setGrades] = useState([]);
  const [fees, setFees] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!child?.id) return;
    let alive = true;
    (async () => {
      try {
        setDataLoading(true);
        const [a, g, f] = await Promise.all([
          API.get(`attendance/stats?student=${child.id}`).catch(() => null),
          API.get(`grades?student=${child.id}`).catch(() => []),
          API.get(`fees?student=${child.id}`).catch(() => []),
        ]);
        if (!alive) return;
        setAtt(a);
        setGrades(Array.isArray(g) ? g : []);
        setFees(Array.isArray(f) ? f : []);
      } finally {
        if (alive) setDataLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [child]);

  if (loading || dataLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;
  }
  if (error || !child) {
    return <div className="empty-state" style={{ padding: '60px', textAlign: 'center' }}><div className="empty-state-icon"><i className="bi bi-people"></i></div><h3>{error || 'No linked student found.'}</h3></div>;
  }

  const childName = `${child.user?.first_name || child.first_name || ''} ${child.user?.last_name || child.last_name || ''}`.trim();
  const avgPct = grades.length ? Math.round(grades.reduce((a, g) => a + (g.percentage || 0), 0) / grades.length) : 0;
  const backlogs = grades.filter(g => g.grade === 'F').length;
  const pendingFees = fees.filter(f => f.status !== 'paid').reduce((a, f) => a + parseFloat(f.amount || 0), 0);
  const attPct = att ? parseFloat(att.percentage) : 0;

  return (
    <>
      {/* Child header */}
      <div className="stat-card primary" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="user-avatar" style={{ width: '56px', height: '56px', fontSize: '1.2rem', background: Utils.getRandomColor(childName) }}>
          {Utils.getInitials(childName)}
        </div>
        <div>
          <div className="stat-value" style={{ fontSize: '1.4rem' }}>{childName}</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {child.department_name || '—'} · Semester {child.semester || child.current_semester?.number || '—'} · Enrollment {child.student_id || child.enrollment_no || '—'}
          </p>
          <span className="badge badge-info" style={{ marginTop: '6px', display: 'inline-block' }}><i className="bi bi-people"></i> Read-only parent view</span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div><div className="stat-value">{attPct}%</div><div className="stat-label">Attendance</div></div>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-pencil-square"></i></div><div className="stat-value">{avgPct}%</div><div className="stat-label">Avg Score</div></div>
        <div className={`stat-card ${backlogs ? 'danger' : 'success'}`}><div className="stat-icon"><i className="bi bi-graph-down-arrow"></i></div><div className="stat-value">{backlogs}</div><div className="stat-label">Backlogs</div></div>
        <div className={`stat-card ${pendingFees ? 'warning' : 'success'}`}><div className="stat-icon"><i className="bi bi-cash-coin"></i></div><div className="stat-value">{Utils.formatCurrency(pendingFees)}</div><div className="stat-label">Pending Fees</div></div>
      </div>

      <div className="dashboard-grid">
        {/* Recent grades */}
        <div className="card col-6">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title"><i className="bi bi-pencil-square"></i> Recent Grades</div>
            <Link to="/parent/grades" className="btn btn-ghost btn-sm">View all</Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {grades.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Course</th><th>Marks</th><th>Grade</th></tr></thead>
                  <tbody>
                    {grades.slice(0, 6).map((g, i) => (
                      <tr key={i}>
                        <td>{g.course_name || g.course_code || '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{g.marks_obtained} / {g.total_marks}</td>
                        <td><span className={Utils.getGradeBadgeClass(g.grade)}>{g.grade}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty-state" style={{ padding: '30px' }}><p>No grades recorded yet.</p></div>}
          </div>
        </div>

        {/* Fee status */}
        <div className="card col-6">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title"><i className="bi bi-cash-coin"></i> Fee Status</div>
            <Link to="/parent/fees" className="btn btn-ghost btn-sm">View all</Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {fees.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {fees.slice(0, 6).map((f, i) => (
                      <tr key={i}>
                        <td style={{ textTransform: 'capitalize' }}>{f.fee_type || 'Tuition'}</td>
                        <td>{Utils.formatCurrency(f.amount)}</td>
                        <td><span className={Utils.getStatusBadgeClass(f.status)}>{f.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty-state" style={{ padding: '30px' }}><p>No fee records found.</p></div>}
          </div>
        </div>
      </div>
    </>
  );
}

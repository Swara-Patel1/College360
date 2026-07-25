import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useChild } from './useChild.js';

export default function ParentAttendance() {
  const { child, loading } = useChild();
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!child?.id) return;
    (async () => {
      try {
        setBusy(true);
        const [s, r] = await Promise.all([
          API.get(`attendance/stats?student=${child.id}`).catch(() => null),
          API.get(`attendance?student=${child.id}`).catch(() => []),
        ]);
        setStats(s);
        setRecords(Array.isArray(r) ? r : []);
      } finally { setBusy(false); }
    })();
  }, [child]);

  if (loading || busy) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  return (
    <>
      <div className="page-header"><div className="page-header-left"><h1><i className="bi bi-check-circle-fill"></i> Attendance</h1><p>Read-only view of your child’s attendance.</p></div></div>
      {stats && (
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card success"><div className="stat-icon"><i className="bi bi-bar-chart"></i></div><div className="stat-value">{stats.percentage}%</div><div className="stat-label">Overall</div></div>
          <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div><div className="stat-value">{stats.present}</div><div className="stat-label">Present</div></div>
          <div className="stat-card danger"><div className="stat-icon"><i className="bi bi-x-circle"></i></div><div className="stat-value">{stats.absent}</div><div className="stat-label">Absent</div></div>
          <div className="stat-card warning"><div className="stat-icon"><i className="bi bi-alarm"></i></div><div className="stat-value">{stats.late}</div><div className="stat-label">Late</div></div>
        </div>
      )}
      <div className="card col-12">
        <div className="card-header"><div className="card-title">Recent Records</div></div>
        <div className="card-body" style={{ padding: 0 }}>
          {records.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Date</th><th>Course</th><th>Status</th></tr></thead>
                <tbody>
                  {records.slice(0, 40).map((r, i) => (
                    <tr key={i}>
                      <td>{Utils.formatDate(r.date)}</td>
                      <td>{r.course_name || r.course_code || '—'}</td>
                      <td><span className={Utils.getStatusBadgeClass(r.status)}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}><div className="empty-state-icon"><i className="bi bi-check-circle-fill"></i></div><p>No attendance records found.</p></div>}
        </div>
      </div>
    </>
  );
}

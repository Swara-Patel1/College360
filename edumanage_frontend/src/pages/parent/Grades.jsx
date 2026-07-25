import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useChild } from './useChild.js';

export default function ParentGrades() {
  const { child, loading } = useChild();
  const [grades, setGrades] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!child?.id) return;
    (async () => {
      try {
        setBusy(true);
        const g = await API.get(`grades?student=${child.id}`).catch(() => []);
        setGrades(Array.isArray(g) ? g : []);
      } finally { setBusy(false); }
    })();
  }, [child]);

  if (loading || busy) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  const avg = grades.length ? (grades.reduce((a, g) => a + (g.percentage || 0), 0) / grades.length).toFixed(1) : '—';

  return (
    <>
      <div className="page-header"><div className="page-header-left"><h1><i className="bi bi-pencil-square"></i> {child ? `${child.user?.first_name || ''}'s ` : ''}Grades</h1><p>Read-only view of semester marks. Class average: {avg}%.</p></div></div>
      <div className="card col-12">
        <div className="card-body" style={{ padding: 0 }}>
          {grades.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Course Code</th><th>Course</th><th>Marks</th><th>Percentage</th><th>Grade</th></tr></thead>
                <tbody>
                  {grades.map((g, i) => (
                    <tr key={i}>
                      <td><strong>{g.course_code}</strong></td>
                      <td>{g.course_name}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{g.marks_obtained} / {g.total_marks}</td>
                      <td>{g.percentage}%</td>
                      <td><span className={Utils.getGradeBadgeClass(g.grade)}>{g.grade}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}><div className="empty-state-icon"><i className="bi bi-pencil-square"></i></div><p>No grades recorded yet.</p></div>}
        </div>
      </div>
    </>
  );
}

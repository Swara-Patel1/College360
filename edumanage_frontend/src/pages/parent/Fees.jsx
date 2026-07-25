import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useChild } from './useChild.js';

export default function ParentFees() {
  const { child, loading } = useChild();
  const [fees, setFees] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!child?.id) return;
    (async () => {
      try {
        setBusy(true);
        const f = await API.get(`fees?student=${child.id}`).catch(() => []);
        setFees(Array.isArray(f) ? f : []);
      } finally { setBusy(false); }
    })();
  }, [child]);

  if (loading || busy) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  const paid = fees.filter(f => f.status === 'paid').reduce((a, f) => a + parseFloat(f.amount || 0), 0);
  const pending = fees.filter(f => f.status !== 'paid').reduce((a, f) => a + parseFloat(f.amount || 0), 0);

  return (
    <>
      <div className="page-header"><div className="page-header-left"><h1><i className="bi bi-cash-coin"></i> Fee Status</h1><p>Read-only view of your child’s fee records.</p></div></div>
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div><div className="stat-value">{Utils.formatCurrency(paid)}</div><div className="stat-label">Paid</div></div>
        <div className={`stat-card ${pending ? 'warning' : 'success'}`}><div className="stat-icon"><i className="bi bi-hourglass-split"></i></div><div className="stat-value">{Utils.formatCurrency(pending)}</div><div className="stat-label">Pending</div></div>
        <div className="stat-card info"><div className="stat-icon"><i className="bi bi-receipt"></i></div><div className="stat-value">{fees.length}</div><div className="stat-label">Records</div></div>
      </div>
      <div className="card col-12">
        <div className="card-body" style={{ padding: 0 }}>
          {fees.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Type</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead>
                <tbody>
                  {fees.map((f, i) => (
                    <tr key={i}>
                      <td style={{ textTransform: 'capitalize' }}>{f.fee_type || 'Tuition'}</td>
                      <td>{Utils.formatCurrency(f.amount)}</td>
                      <td>{Utils.formatDate(f.due_date)}</td>
                      <td><span className={Utils.getStatusBadgeClass(f.status)}>{f.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}><div className="empty-state-icon"><i className="bi bi-cash-coin"></i></div><p>No fee records found.</p></div>}
        </div>
      </div>
    </>
  );
}

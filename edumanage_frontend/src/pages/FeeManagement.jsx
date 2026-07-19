import { useState, useEffect } from 'react';
import { API, Utils } from '../api/client.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Toast } from '../store/useNotifStore.js';
import Modal from '../components/Modal.jsx';

export default function FeeManagement() {
  const { user } = useAuthStore();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const [isPayOpen, setIsPayOpen] = useState(false);
  const [paying, setPaying] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === 'admin';

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await API.get('admin/fees');
      setPayments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load fee records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  const handlePayClick = (p) => { setPaying(p); setIsPayOpen(true); };

  const handlePayConfirm = async () => {
    try {
      setSubmitting(true);
      await API.post(`fees/${paying.id}/mark-paid`, {});
      Toast.success('Payment marked as paid!');
      setIsPayOpen(false); setPaying(null); loadData();
    } catch (err) {
      console.error(err);
      Toast.error(err?.message || 'Failed to mark payment.');
    } finally { setSubmitting(false); }
  };

  const filtered = payments.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (p.student_name || '').toLowerCase().includes(q) ||
      (p.enrollment_no || '').toLowerCase().includes(q) ||
      (p.component_name || '').toLowerCase().includes(q);
    const matchesStatus = selectedStatus ? p.status === selectedStatus : true;
    return matchesSearch && matchesStatus;
  });

  const totalCollected = payments.filter(p => p.status === 'paid').reduce((a, c) => a + (c.amount_paid || c.amount || 0), 0);
  const totalPending = payments.filter(p => p.status !== 'paid').reduce((a, c) => a + (c.amount || 0), 0);
  const paidCount = payments.filter(p => p.status === 'paid').length;
  const pendingCount = payments.filter(p => p.status !== 'paid').length;

  if (loading && !payments.length) {
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
          <h1>💰 Fee Management</h1>
          <p>Track and manage student fee payments across the institution.</p>
        </div>
      </div>

      <div className="stats-mini">
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(0,212,170,0.2)' }}>✅</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#00D4AA' }}>{Utils.formatCurrency(totalCollected)}</div>
            <div className="stats-mini-lbl">Collected</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(255,159,67,0.2)' }}>⏳</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#FF9F43' }}>{Utils.formatCurrency(totalPending)}</div>
            <div className="stats-mini-lbl">Pending</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(108,99,255,0.2)' }}>🧾</div>
          <div>
            <div className="stats-mini-val" style={{ color: 'var(--primary)' }}>{paidCount}</div>
            <div className="stats-mini-lbl">Paid Records</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(255,107,107,0.2)' }}>🚨</div>
          <div>
            <div className="stats-mini-val" style={{ color: '#FF6B6B' }}>{pendingCount}</div>
            <div className="stats-mini-lbl">Pending Records</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="filters-bar" style={{ display: 'flex', gap: '10px', padding: '15px 20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <input
              type="text" className="form-input"
              placeholder="Search by student, enrollment no, fee type..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="form-input" style={{ flex: 1, minWidth: '150px' }} value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
            <option value="waived">Waived</option>
          </select>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {filtered.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Enrollment No.</th>
                  <th>Fee Component</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  {isAdmin && <th style={{ textAlign: 'center' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.student_name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.enrollment_no}</td>
                    <td>{p.component_name}</td>
                    <td>{Utils.formatCurrency(p.amount)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.due_date ? Utils.formatDate(p.due_date) : '—'}</td>
                    <td><span className={Utils.getStatusBadgeClass(p.status)}>{p.status?.toUpperCase()}</span></td>
                    {isAdmin && (
                      <td style={{ textAlign: 'center' }}>
                        {p.status !== 'paid' ? (
                          <button className="btn btn-ghost btn-sm" style={{ color: '#00D4AA' }} onClick={() => handlePayClick(p)}>✅ Mark Paid</button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">💰</div>
              <p>No fee records match the filters.</p>
            </div>
          )}
        </div>
      </div>

      {isPayOpen && paying && (
        <Modal onClose={() => setIsPayOpen(false)} title="✅ Mark Fee as Paid">
          <div style={{ padding: '10px 0' }}>
            <p>Mark <strong>{paying.component_name}</strong> ({Utils.formatCurrency(paying.amount)}) for <strong>{paying.student_name}</strong> as paid?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setIsPayOpen(false)} disabled={submitting}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePayConfirm} disabled={submitting}>{submitting ? '⏳ Saving...' : '✅ Confirm Payment'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

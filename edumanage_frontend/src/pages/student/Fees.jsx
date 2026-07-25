import { useState, useEffect } from 'react';
import { API, SupaAPI, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

const STATUS_BADGE = { paid: 'badge badge-success', pending: 'badge badge-warning', overdue: 'badge badge-danger', waived: 'badge badge-muted' };
const METHODS = [
  { value: 'card', label: 'Card', icon: <i className="bi bi-credit-card me-1" /> },
  { value: 'upi', label: 'UPI', icon: <i className="bi bi-qr-code me-1" /> },
  { value: 'netbanking', label: 'Net Banking', icon: <i className="bi bi-bank me-1" /> },
  { value: 'wallet', label: 'Wallet', icon: <i className="bi bi-wallet2 me-1" /> },
];

export default function Fees() {
  const { user } = useAuthStore();
  const [studentId, setStudentId] = useState(null);
  const [fees, setFees] = useState([]);
  const [history, setHistory] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);

  // Checkout state
  const [payFee, setPayFee] = useState(null);   // fee being paid
  const [order, setOrder] = useState(null);     // created gateway order
  const [method, setMethod] = useState('card');
  const [simulateFail, setSimulateFail] = useState(false);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const profile = await API.get('students/my_profile');
      const sid = profile?.id;
      setStudentId(sid);
      const [feeData, hist, config] = await Promise.all([
        API.get(`fees?student=${sid}`).catch(() => []),
        SupaAPI.payments.history(sid).catch(() => []),
        SupaAPI.payments.config().catch(() => null),
      ]);
      setFees(Array.isArray(feeData) ? feeData : []);
      setHistory(Array.isArray(hist) ? hist : []);
      setCfg(config);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load fees.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (user) load(); }, [user]);

  const pending = fees.filter(f => f.status === 'pending' || f.status === 'overdue');
  const totalDue = pending.reduce((s, f) => s + Number(f.amount || 0), 0);
  const totalPaid = fees.filter(f => f.status === 'paid').reduce((s, f) => s + Number(f.amount || 0), 0);

  // ── Checkout: create the gateway order, then open the checkout modal ──
  const openCheckout = async (fee) => {
    try {
      setProcessing(true);
      const feeId = fee.payment_id || fee.id;
      const ord = await SupaAPI.payments.createOrder(feeId);
      if (ord?.error) { Toast.error(ord.error); return; }
      setPayFee(fee);
      setOrder(ord);
      setMethod('card');
      setSimulateFail(false);
    } catch {
      Toast.error('Could not start payment.');
    } finally {
      setProcessing(false);
    }
  };

  const pay = async () => {
    if (!order) return;
    try {
      setProcessing(true);
      // In test mode we ask the backend to stand in for the hosted checkout widget;
      // a live integration would open Razorpay's SDK here and receive these values.
      const checkout = await SupaAPI.payments.mockCheckout(order.order_id, simulateFail ? 'failure' : 'success', method);
      const res = await SupaAPI.payments.verify({
        order_id: order.order_id,
        payment_id: checkout.payment_id,
        signature: checkout.signature,
        method,
      });
      if (res?.success) {
        Toast.success(`Payment successful — ${payFee.fee_type} fee paid`);
        closeCheckout();
        load();
      } else {
        Toast.error('Payment failed or was declined. Please try again.');
      }
    } catch {
      Toast.error('Payment could not be completed.');
    } finally {
      setProcessing(false);
    }
  };

  const closeCheckout = () => { setPayFee(null); setOrder(null); };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="stat-icon" style={{ background: 'rgba(108, 99, 255, 0.2)', color: '#6C63FF' }}>
            <i className="bi bi-credit-card"></i>
          </div>
          <div>
            <h1>Fee Payment</h1>
            <p>View your fee dues and pay securely online via the payment gateway.</p>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card danger"><div className="stat-icon"><i className="bi bi-hourglass-split"></i></div><div><div className="stat-value">{Utils.formatCurrency(totalDue)}</div><div className="stat-label">Total Due</div></div></div>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div><div><div className="stat-value">{Utils.formatCurrency(totalPaid)}</div><div className="stat-label">Total Paid</div></div></div>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-receipt"></i></div><div><div className="stat-value">{pending.length}</div><div className="stat-label">Pending Bills</div></div></div>
      </div>

      <div className="card col-12" style={{ marginBottom: '20px' }}>
        <div className="card-header"><div className="card-title"><i className="bi bi-receipt"></i> Fee Bills</div></div>
        <div className="card-body" style={{ padding: 0 }}>
          {fees.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Fee</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {fees.map(f => (
                    <tr key={f.payment_id || f.id}>
                      <td style={{ textTransform: 'capitalize' }}><strong>{(f.fee_type || 'tuition').replace('_', ' ')}</strong></td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{Utils.formatCurrency(f.amount)}</td>
                      <td>{Utils.formatDate(f.due_date)}</td>
                      <td><span className={STATUS_BADGE[f.status] || 'badge badge-muted'} style={{ textTransform: 'capitalize' }}>{f.status}</span></td>
                      <td>
                        {(f.status === 'pending' || f.status === 'overdue')
                          ? <button className="btn btn-primary btn-sm" disabled={processing} onClick={() => openCheckout(f)}><i className="bi bi-credit-card"></i> Pay Now</button>
                          : f.status === 'paid'
                            ? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Paid {f.payment_date ? `· ${Utils.formatDate(f.payment_date)}` : ''}</span>
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
              <div className="empty-state-icon"><i className="bi bi-receipt"></i></div><h3>No fee records</h3>
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="card col-12">
          <div className="card-header"><div className="card-title"><i className="bi bi-file-text"></i> Payment History</div></div>
          <div className="card-body" style={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Date</th><th>Fee</th><th>Amount</th><th>Method</th><th>Payment ID</th><th>Status</th></tr></thead>
                <tbody>
                  {history.map(t => (
                    <tr key={t.transaction_id}>
                      <td>{Utils.formatDate(t.paid_at || t.created_at)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{(t.fee_type || '').replace('_', ' ')}</td>
                      <td>{Utils.formatCurrency(t.amount)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{t.method || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{t.payment_id || '—'}</td>
                      <td><span className={t.status === 'paid' ? 'badge badge-success' : t.status === 'failed' ? 'badge badge-danger' : 'badge badge-muted'} style={{ textTransform: 'capitalize' }}>{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Razorpay-style checkout modal */}
      <Modal isOpen={!!order} onClose={closeCheckout} title={<><i className="bi bi-lock me-2"></i>Secure Checkout</>}>
        {order && payFee && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'linear-gradient(135deg,#6C63FF,#C084FC)', borderRadius: '12px', color: '#fff', marginBottom: '18px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{order.name}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>{order.description}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>{Utils.formatCurrency(order.amount)}</div>
                <div style={{ fontSize: '0.68rem', opacity: 0.9 }}>{cfg?.mode === 'live' ? 'Live' : 'TEST MODE'}</div>
              </div>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '14px', fontFamily: 'monospace' }}>
              Order: {order.order_id} · {order.key_id}
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Payment Method</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {METHODS.map(m => (
                  <button key={m.value} type="button" onClick={() => setMethod(m.value)}
                    className={`btn btn-sm ${method === m.value ? 'btn-primary' : 'btn-ghost'}`}>{m.icon} {m.label}</button>
                ))}
              </div>
            </div>

            {/* A mock card form (test mode only) */}
            <div style={{ display: 'grid', gap: '10px', marginBottom: '16px', opacity: method === 'card' ? 1 : 0.5, pointerEvents: method === 'card' ? 'auto' : 'none' }}>
              <input className="form-control" placeholder="Card number (4242 4242 4242 4242)" defaultValue="4242 4242 4242 4242" />
              <div style={{ display: 'flex', gap: '10px' }}>
                <input className="form-control" placeholder="MM/YY" defaultValue="12/29" />
                <input className="form-control" placeholder="CVV" defaultValue="123" />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={simulateFail} onChange={(e) => setSimulateFail(e.target.checked)} />
              Simulate a failed payment (to test the failure path)
            </label>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={closeCheckout} disabled={processing}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={pay} disabled={processing}>
                {processing ? 'Processing…' : `Pay ${Utils.formatCurrency(order.amount)}`}
              </button>
            </div>

            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
              <i className="bi bi-shield-lock"></i> Secured by {order.key_id?.startsWith('rzp') ? 'Razorpay' : 'the gateway'}. The signature is verified server-side.
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

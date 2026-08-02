import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';
import { sendFeeReminderEmail } from '../../course_utilities/mailer.js';

export default function HODFees() {
  const { user } = useAuthStore();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deptId, setDeptId] = useState('');

  // Email Modal State
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);

      // 1. Get HOD info safely
      let currentDeptId = '';
      try {
        const hodInfo = await API.get('hod/check');
        if (hodInfo && hodInfo.isHod) {
          currentDeptId = hodInfo.hod?.department_id || hodInfo.department_id || '';
          setDeptId(currentDeptId);
        }
      } catch (_) {}

      // 2. Fetch payments and students safely
      const [feeData, allStudents] = await Promise.all([
        API.get('fee_payments').catch(() => []),
        API.get('students').catch(() => [])
      ]);

      const studentMap = {};
      (allStudents || []).forEach(s => {
        if (s.id) studentMap[String(s.id)] = s;
        if (s.student_id) studentMap[String(s.student_id)] = s;
        if (s.user_id) studentMap[String(s.user_id)] = s;
      });

      const rawPayments = Array.isArray(feeData) ? feeData : [];

      // Filter strictly by HOD department and pending/partial/overdue status
      const deptPending = rawPayments.filter(p => {
        const st = studentMap[String(p.student_id)] || p.student || {};
        const sDept = st.department_id || st.department?.id || st.department || p.student?.department_id;
        const isDept = currentDeptId ? (sDept && String(sDept).toLowerCase() === String(currentDeptId).toLowerCase()) : true;
        const stStatus = String(p.status || '').toLowerCase();
        const isPending = stStatus !== 'paid';
        return isDept && isPending;
      });

      const formatted = deptPending.map(p => {
        const st = studentMap[String(p.student_id)] || p.student || {};
        const stName = (st.first_name || st.last_name) 
          ? `${st.first_name || ''} ${st.last_name || ''}`.trim() 
          : 'Student';
        return {
          ...p,
          student: {
            ...st,
            ...(p.student || {}),
            parent_email: st.parent_email || p.student?.parent_email || '',
            parent_phone: st.parent_phone || st.guardian_phone || p.student?.parent_phone || '',
            enrollment_no: st.enrollment_no || st.student_id || p.student?.enrollment_no || '',
            roll_number: st.roll_number || st.current_rollno || p.student?.roll_number || '',
          },
          fee_structures: {
            amount: p.fee_structures?.amount || p.amount || 0,
            component_name: p.fee_structures?.component_name || p.fee_type || 'Tuition Fee',
            due_date: p.fee_structures?.due_date || p.due_date || null
          }
        };
      });

      setPayments(formatted);
    } catch (e) {
      console.error('Error loading fees data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleOpenEmail = (paymentItem) => {
    const studentName = paymentItem.student 
      ? `${paymentItem.student.first_name || ''} ${paymentItem.student.last_name || ''}`.trim() 
      : 'Student';
    setSelectedPayment(paymentItem);
    setEmailSubject(`Urgent: Fee Payment Reminder for ${studentName}`);
    setEmailBody(
      `Dear Parent,\n\nThis is an official reminder that the fee payment of ₹${paymentItem.amount_paid === 0 ? paymentItem.fee_structures?.amount : (paymentItem.fee_structures?.amount - paymentItem.amount_paid)} for your child ${studentName} remains pending.\n\nDetails:\n- Fee Component: ${paymentItem.fee_structures?.component_name || 'Tuition Fee'}\n- Due Date: ${Utils.formatDate(paymentItem.fee_structures?.due_date)}\n- Payment Status: ${paymentItem.status}\n\nPlease settle this outstanding balance at your earliest convenience to avoid academic interruption.\n\nBest regards,\nAccounts & HOD Office`
    );
    setIsEmailOpen(true);
  };

  const [sendingEmail, setSendingEmail] = useState(false);

  const handleSendEmail = async (e) => {
    e.preventDefault();
    const recipientEmail = selectedPayment?.student?.parent_email || selectedPayment?.student?.user?.email || selectedPayment?.student_email;
    if (!recipientEmail || recipientEmail === '—') {
      Toast.error('Recipient email address is missing.');
      return;
    }

    const studentName = selectedPayment?.student 
      ? `${selectedPayment.student.first_name || ''} ${selectedPayment.student.last_name || ''}`.trim() 
      : 'Student';
    const amount = selectedPayment?.amount_paid === 0 
      ? selectedPayment?.fee_structures?.amount 
      : ((selectedPayment?.fee_structures?.amount || 0) - (selectedPayment?.amount_paid || 0));
    const dueDate = Utils.formatDate(selectedPayment?.fee_structures?.due_date);

    setSendingEmail(true);
    try {
      await sendFeeReminderEmail(
        recipientEmail,
        studentName,
        amount,
        dueDate,
        emailSubject,
        emailBody
      );
      Toast.success(`Email sent to ${recipientEmail}!`);
      setIsEmailOpen(false);
    } catch (err) {
      Toast.error(err?.message || 'Failed to send email. Check SMTP settings.');
    } finally {
      setSendingEmail(false);
    }
  };

  const totalPendingAmount = payments.reduce((sum, p) => {
    const total = p.fee_structures?.amount || 0;
    const paid = p.amount_paid || 0;
    return sum + (total - paid);
  }, 0);

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
          <h1><i className="bi bi-cash-coin"></i> Department Pending Fees</h1>
          <p>Track student pending fees and coordinate collections reminders with parents.</p>
        </div>
      </div>

      {/* Mini Stats */}
      <div className="stats-mini">
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(255,107,107,0.2)' }}><i className="bi bi-cash-coin"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: '#FF6B6B' }}>
              {Utils.formatCurrency(totalPendingAmount)}
            </div>
            <div className="stats-mini-lbl">Total Outstanding</div>
          </div>
        </div>
        <div className="stats-mini-card">
          <div className="stats-mini-icon" style={{ background: 'rgba(108,99,255,0.2)' }}><i className="bi bi-people"></i></div>
          <div>
            <div className="stats-mini-val" style={{ color: 'var(--primary)' }}>{payments.length}</div>
            <div className="stats-mini-lbl">Pending Defaulters</div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card">
        <div className="card-header" style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Fee Defaulter Directory</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {payments.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Fee Component</th>
                  <th>Total Due</th>
                  <th>Amount Paid</th>
                  <th>Remaining Outstanding</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const studentName = p.student 
                    ? `${p.student.first_name || ''} ${p.student.last_name || ''}`.trim() 
                    : 'Student';
                  const total = p.fee_structures?.amount || 0;
                  const paid = p.amount_paid || 0;
                  const outstanding = total - paid;
                  return (
                    <tr key={p.payment_id}>
                      <td style={{ fontWeight: 600 }}>{studentName}</td>
                      <td>{p.fee_structures?.component_name || '—'}</td>
                      <td>{Utils.formatCurrency(total)}</td>
                      <td>{Utils.formatCurrency(paid)}</td>
                      <td style={{ fontWeight: 700, color: '#FF6B6B' }}>
                        {Utils.formatCurrency(outstanding)}
                      </td>
                      <td>{Utils.formatDate(p.fee_structures?.due_date)}</td>
                      <td>
                        <span className={Utils.getStatusBadgeClass(p.status)}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          style={{ color: 'var(--primary)' }}
                          onClick={() => handleOpenEmail(p)}
                        >
                          <i className="bi bi-envelope"></i> Send Reminder
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty-state" style={{ padding: '40px' }}>
              <div className="empty-state-icon"><i className="bi bi-check-circle-fill"></i></div>
              <p>Great! All students in your department have fully settled their dues.</p>
            </div>
          )}
        </div>
      </div>

      {/* ======================== SEND EMAIL MODAL ======================== */}
      {isEmailOpen && selectedPayment && (
        <Modal isOpen={isEmailOpen} onClose={() => setIsEmailOpen(false)} title={<><i className="bi bi-envelope me-2"></i>Send Fee Reminder Notice</>}>
          <form onSubmit={handleSendEmail}>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Parent Email</label>
              <input type="text" className="form-input" disabled value={selectedPayment.student?.parent_email || '—'} />
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Subject</label>
              <input type="text" className="form-input" required value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Email Content</label>
              <textarea className="form-input" rows="6" required value={emailBody} onChange={e => setEmailBody(e.target.value)} />
            </div>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="submit" className="btn btn-primary" disabled={sendingEmail}>
                {sendingEmail ? (
                  <>
                    <div className="spinner"></div> Sending Email...
                  </>
                ) : (
                  <>
                    <i className="bi bi-send me-1"></i> Send Email
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

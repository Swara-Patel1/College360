import { useState, useEffect, useCallback } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

const STATUS_STYLES = {
  pending:  { bg: 'rgba(255,159,67,0.15)',  color: '#FF9F43', label: 'Pending',  icon: '⏳' },
  approved: { bg: 'rgba(0,212,170,0.15)',   color: '#00D4AA', label: 'Approved', icon: '✅' },
  rejected: { bg: 'rgba(255,107,107,0.15)', color: '#FF6B6B', label: 'Rejected', icon: '❌' },
};

const LEAVE_TYPE_LABELS = {
  casual: { label: 'Casual Leave',  icon: '🌴' },
  medical: { label: 'Medical Leave', icon: '🏥' },
  earned:  { label: 'Earned Leave',  icon: '⭐' },
  special: { label: 'Special Leave', icon: '✨' },
};

function getDays(from, to) {
  if (!from || !to) return 0;
  return Math.ceil((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1;
}

export default function HODLeaves() {
  const { user } = useAuthStore();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [toast, setToast] = useState(null);

  // Approve/Reject dialog
  const [actionModal, setActionModal] = useState(null); // { leave, action: 'approve'|'reject' }
  const [remarks, setRemarks] = useState('');
  const [processing, setProcessing] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const data = await API.get('hod/leaves');
      setLeaves(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load HOD leaves:', e);
      setLeaves([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadLeaves(); }, [user, loadLeaves]);

  const handleAction = async () => {
    if (!actionModal) return;
    const { leave, action } = actionModal;
    const leaveId = leave.leave_id || leave.id;
    setProcessing(true);
    try {
      await API.post(`hod/leaves/${leaveId}/${action}`, { remarks });
      const actionMsg = action === 'approve'
        ? 'Leave approved! Students have been notified about the lecture change. ✅'
        : 'Leave request rejected and faculty has been notified. ❌';
      showToast(actionMsg, action === 'approve' ? 'success' : 'info');
      setActionModal(null);
      setRemarks('');
      await loadLeaves();
    } catch (e) {
      showToast(e?.message || `Failed to ${action} leave.`, 'error');
    } finally { setProcessing(false); }
  };

  const filteredLeaves = activeTab === 'all' ? leaves : leaves.filter(l => l.status === activeTab);
  const tabCounts = {
    all: leaves.length,
    pending: leaves.filter(l => l.status === 'pending').length,
    approved: leaves.filter(l => l.status === 'approved').length,
    rejected: leaves.filter(l => l.status === 'rejected').length,
  };

  const getFacultyName = (leave) => {
    if (!leave.faculty) return 'Faculty';
    const f = leave.faculty;
    return `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.employee_id || 'Faculty';
  };

  return (
    <>
      {toast && (
        <div style={{
          position:'fixed',top:'24px',right:'24px',zIndex:9999,
          background: toast.type==='success' ? '#00D4AA' : toast.type==='info' ? '#54A0FF' : '#FF6B6B',
          color:'#fff',padding:'14px 22px',borderRadius:'12px',
          boxShadow:'0 8px 32px rgba(0,0,0,0.3)',fontWeight:600,maxWidth:'440px'
        }}>{toast.msg}</div>
      )}

      <div className="page-header">
        <div className="page-header-left">
          <h1>📋 Leave Approval Panel</h1>
          <p>Review and approve faculty leave requests for your department.</p>
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'16px',marginBottom:'24px'}}>
        {[
          { label:'Pending Review', val: tabCounts.pending, icon:'⏳', color:'#FF9F43' },
          { label:'Approved', val: tabCounts.approved, icon:'✅', color:'#00D4AA' },
          { label:'Rejected', val: tabCounts.rejected, icon:'❌', color:'#FF6B6B' },
          { label:'Total Requests', val: tabCounts.all, icon:'📊', color:'#54A0FF' },
        ].map(s => (
          <div key={s.label} style={{background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:'14px',padding:'18px'}}>
            <div style={{fontSize:'1.6rem',marginBottom:'6px'}}>{s.icon}</div>
            <div style={{fontSize:'1.8rem',fontWeight:800,color:s.color,lineHeight:1}}>{s.val}</div>
            <div style={{color:'var(--text-muted)',fontSize:'0.78rem',marginTop:'4px',fontWeight:600}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Notice about auto-notifications */}
      {tabCounts.pending > 0 && (
        <div style={{
          background:'rgba(84,160,255,0.1)',border:'1px solid rgba(84,160,255,0.3)',
          borderRadius:'12px',padding:'14px 18px',marginBottom:'20px',
          display:'flex',alignItems:'center',gap:'12px',color:'#54A0FF',fontSize:'0.87rem'
        }}>
          <span style={{fontSize:'1.2rem'}}>💡</span>
          <span><strong>Auto-Notification:</strong> When you approve a leave, students will automatically receive a notice about the lecture change, and a substitute faculty will be assigned from your department.</span>
        </div>
      )}

      {/* Tabs + List */}
      <div className="card">
        <div className="card-header" style={{borderBottom:'1px solid var(--border)',paddingBottom:0}}>
          <div style={{display:'flex',gap:0}}>
            {[['all','All'],['pending','Pending'],['approved','Approved'],['rejected','Rejected']].map(([key,label]) => (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                padding:'12px 20px',background:'none',border:'none',cursor:'pointer',
                fontWeight: activeTab===key ? 700 : 400,
                color: activeTab===key ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: activeTab===key ? '2px solid var(--primary)' : '2px solid transparent',
                fontSize:'0.9rem',transition:'all 0.2s',display:'flex',alignItems:'center',gap:'6px'
              }}>
                {label}
                {tabCounts[key] > 0 && (
                  <span style={{
                    background: activeTab===key ? (key==='pending' ? '#FF9F43' : 'var(--primary)') : 'var(--border)',
                    color: activeTab===key ? '#fff' : 'var(--text-muted)',
                    borderRadius:'10px',padding:'1px 7px',fontSize:'0.75rem',fontWeight:700
                  }}>{tabCounts[key]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body">
          {loading ? (
            <div style={{display:'flex',justifyContent:'center',padding:'48px'}}>
              <div className="loading-spinner" />
            </div>
          ) : filteredLeaves.length === 0 ? (
            <div className="empty-state" style={{padding:'60px 20px'}}>
              <div className="empty-state-icon">📋</div>
              <h3>No {activeTab==='all' ? '' : activeTab} leave requests</h3>
              <p>{activeTab==='pending' ? 'All leave requests have been reviewed.' : `No ${activeTab} leaves to display.`}</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              {filteredLeaves.map((leave) => {
                const st = STATUS_STYLES[leave.status] || STATUS_STYLES.pending;
                const lt = LEAVE_TYPE_LABELS[leave.leave_type] || { label: 'Leave', icon: '🏖️' };
                const days = getDays(leave.from_date, leave.to_date);
                const facultyName = getFacultyName(leave);

                return (
                  <div key={leave.leave_id || leave.id} style={{
                    background:'var(--surface)',border:'1px solid var(--border)',
                    borderLeft:`4px solid ${st.color}`,borderRadius:'14px',padding:'20px'
                  }}>
                    {/* Top row: faculty + badge */}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'14px',flexWrap:'wrap',gap:'10px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
                        <div style={{
                          width:'46px',height:'46px',borderRadius:'50%',
                          background:'linear-gradient(135deg,var(--primary),#C084FC)',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          color:'#fff',fontWeight:700,fontSize:'1rem',flexShrink:0
                        }}>
                          {facultyName.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'1.05rem'}}>{facultyName}</div>
                          <div style={{color:'var(--text-muted)',fontSize:'0.82rem',marginTop:'2px'}}>
                            {leave.faculty?.designation || leave.faculty?.employee_id || '—'}
                          </div>
                        </div>
                      </div>
                      <div style={{background:st.bg,color:st.color,borderRadius:'20px',padding:'5px 14px',fontSize:'0.82rem',fontWeight:700,whiteSpace:'nowrap'}}>
                        {st.icon} {st.label}
                      </div>
                    </div>

                    {/* Leave details */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'10px',marginBottom:'14px'}}>
                      <div style={{background:'var(--card-bg)',borderRadius:'10px',padding:'12px'}}>
                        <div style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',marginBottom:'4px'}}>Leave Type</div>
                        <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'0.95rem'}}>{lt.icon} {lt.label}</div>
                      </div>
                      <div style={{background:'var(--card-bg)',borderRadius:'10px',padding:'12px'}}>
                        <div style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',marginBottom:'4px'}}>Duration</div>
                        <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'0.95rem'}}>
                          {Utils.formatDate(leave.from_date)} → {Utils.formatDate(leave.to_date)}
                        </div>
                        <div style={{color:'var(--primary)',fontSize:'0.78rem',fontWeight:600,marginTop:'2px'}}>
                          {days} day{days!==1?'s':''}
                        </div>
                      </div>
                      <div style={{background:'var(--card-bg)',borderRadius:'10px',padding:'12px'}}>
                        <div style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',marginBottom:'4px'}}>Applied On</div>
                        <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'0.95rem'}}>
                          {Utils.formatDate(leave.applied_at || leave.created_at)}
                        </div>
                      </div>
                    </div>

                    {leave.reason && (
                      <div style={{
                        background:'rgba(108,99,255,0.06)',borderRadius:'10px',padding:'12px 14px',
                        marginBottom:'14px',color:'var(--text-secondary)',fontSize:'0.87rem',lineHeight:1.6
                      }}>
                        <span style={{fontWeight:700,color:'var(--text-primary)'}}>📝 Reason: </span>
                        {leave.reason}
                      </div>
                    )}

                    {leave.hod_remarks && (
                      <div style={{color:st.color,fontSize:'0.83rem',marginBottom:'12px',fontStyle:'italic'}}>
                        💬 Your Remarks: {leave.hod_remarks}
                      </div>
                    )}

                    {/* Action buttons (only for pending) */}
                    {leave.status === 'pending' && (
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginTop:'6px'}}>
                        <button
                          className="btn btn-success"
                          onClick={() => { setActionModal({ leave, action:'approve' }); setRemarks(''); }}
                          style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}
                        >
                          ✅ Approve Leave
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => { setActionModal({ leave, action:'reject' }); setRemarks(''); }}
                          style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}
                        >
                          ❌ Reject Leave
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Approve/Reject Dialog */}
      {actionModal && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',
          display:'flex',alignItems:'center',justifyContent:'center',
          zIndex:1000,backdropFilter:'blur(4px)',padding:'20px'
        }} onClick={e => { if(e.target===e.currentTarget && !processing){ setActionModal(null); setRemarks(''); } }}>
          <div style={{
            background:'var(--card-bg)',borderRadius:'20px',padding:'32px',
            width:'100%',maxWidth:'480px',border:'1px solid var(--border)',
            boxShadow:'0 24px 64px rgba(0,0,0,0.4)'
          }}>
            <div style={{textAlign:'center',marginBottom:'24px'}}>
              <div style={{fontSize:'3rem',marginBottom:'12px'}}>
                {actionModal.action === 'approve' ? '✅' : '❌'}
              </div>
              <h2 style={{margin:0,fontSize:'1.4rem'}}>
                {actionModal.action === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
              </h2>
              <p style={{color:'var(--text-muted)',fontSize:'0.9rem',marginTop:'8px'}}>
                {actionModal.action === 'approve'
                  ? `You are approving ${getFacultyName(actionModal.leave)}'s leave. Students will be auto-notified.`
                  : `You are rejecting ${getFacultyName(actionModal.leave)}'s leave request.`
                }
              </p>
            </div>

            {/* Leave summary */}
            <div style={{background:'var(--surface)',borderRadius:'12px',padding:'14px',marginBottom:'20px',border:'1px solid var(--border)'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',fontSize:'0.87rem'}}>
                <div><span style={{color:'var(--text-muted)'}}>Faculty: </span><strong>{getFacultyName(actionModal.leave)}</strong></div>
                <div><span style={{color:'var(--text-muted)'}}>Type: </span><strong>{(LEAVE_TYPE_LABELS[actionModal.leave.leave_type] || {}).label || 'Leave'}</strong></div>
                <div><span style={{color:'var(--text-muted)'}}>From: </span><strong>{Utils.formatDate(actionModal.leave.from_date)}</strong></div>
                <div><span style={{color:'var(--text-muted)'}}>To: </span><strong>{Utils.formatDate(actionModal.leave.to_date)}</strong></div>
              </div>
            </div>

            <div style={{marginBottom:'20px'}}>
              <label style={{display:'block',marginBottom:'6px',fontWeight:600,color:'var(--text-secondary)',fontSize:'0.87rem'}}>
                {actionModal.action === 'approve' ? 'Remarks (optional)' : 'Reason for Rejection (optional)'}
              </label>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
                className="form-control" rows={3}
                placeholder={actionModal.action === 'approve' ? 'Add any notes or instructions...' : 'Explain why you are rejecting this leave...'}
                style={{resize:'vertical'}} />
            </div>

            {actionModal.action === 'approve' && (
              <div style={{
                background:'rgba(0,212,170,0.08)',border:'1px solid rgba(0,212,170,0.3)',
                borderRadius:'10px',padding:'12px 14px',marginBottom:'16px',
                color:'#00D4AA',fontSize:'0.83rem',display:'flex',alignItems:'center',gap:'8px'
              }}>
                <span>🔔</span>
                <span>A notice will be automatically sent to students about the lecture change, and a substitute faculty will be assigned.</span>
              </div>
            )}

            <div style={{display:'flex',gap:'12px'}}>
              <button className="btn btn-secondary" style={{flex:1}} onClick={() => { setActionModal(null); setRemarks(''); }} disabled={processing}>
                Cancel
              </button>
              <button
                className={`btn ${actionModal.action==='approve' ? 'btn-success' : 'btn-danger'}`}
                style={{flex:2}}
                onClick={handleAction}
                disabled={processing}
              >
                {processing
                  ? '⏳ Processing...'
                  : actionModal.action === 'approve'
                    ? '✅ Confirm Approval'
                    : '❌ Confirm Rejection'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

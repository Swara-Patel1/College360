import { useState, useEffect, useCallback } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

const LEAVE_TYPES = [
  { value: 'casual', label: 'Casual Leave',  icon: '🌴', total: 12 },
  { value: 'medical', label: 'Medical Leave', icon: '🏥', total: 10 },
  { value: 'earned',  label: 'Earned Leave',  icon: '⭐', total: 15 },
  { value: 'special', label: 'Special Leave', icon: '✨', total: 5  },
];

const STATUS_STYLES = {
  pending:  { bg: 'rgba(255,159,67,0.15)',  color: '#FF9F43', label: 'Pending HOD Review', icon: '⏳' },
  approved: { bg: 'rgba(0,212,170,0.15)',   color: '#00D4AA', label: 'Approved',            icon: '✅' },
  rejected: { bg: 'rgba(255,107,107,0.15)', color: '#FF6B6B', label: 'Rejected',            icon: '❌' },
};

function getDays(from, to) {
  if (!from || !to) return 0;
  return Math.ceil((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1;
}

export default function FacultyLeaves() {
  const { user } = useAuthStore();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  const [form, setForm] = useState({ leaveType: 'casual', fromDate: '', toDate: '', reason: '' });
  const [formError, setFormError] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const data = await API.get('faculty/leave');
      setLeaves(Array.isArray(data) ? data : []);
    } catch { setLeaves([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadLeaves(); }, [user, loadLeaves]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.fromDate || !form.toDate) return setFormError('Please select both dates.');
    if (new Date(form.fromDate) > new Date(form.toDate)) return setFormError('From date cannot be after To date.');
    if (!form.reason.trim()) return setFormError('Please enter a reason for your leave.');
    setSubmitting(true);
    try {
      await API.post('faculty/leave', form);
      showToast('Leave request submitted! Awaiting HOD approval. 🎉');
      setShowForm(false);
      setForm({ leaveType: 'casual', fromDate: '', toDate: '', reason: '' });
      await loadLeaves();
    } catch (e) {
      setFormError(e?.message || e?.detail || 'Failed to submit. Please try again.');
    } finally { setSubmitting(false); }
  };

  const usedByType = {};
  leaves.filter(l => l.status === 'approved').forEach(l => {
    const t = l.leave_type || 'casual';
    usedByType[t] = (usedByType[t] || 0) + getDays(l.from_date, l.to_date);
  });

  const filteredLeaves = activeTab === 'all' ? leaves : leaves.filter(l => l.status === activeTab);
  const tabCounts = {
    all: leaves.length,
    pending: leaves.filter(l => l.status === 'pending').length,
    approved: leaves.filter(l => l.status === 'approved').length,
    rejected: leaves.filter(l => l.status === 'rejected').length,
  };

  return (
    <>
      {toast && (
        <div style={{
          position:'fixed',top:'24px',right:'24px',zIndex:9999,
          background: toast.type==='success' ? '#00D4AA' : '#FF6B6B',
          color:'#fff',padding:'14px 22px',borderRadius:'12px',
          boxShadow:'0 8px 32px rgba(0,0,0,0.3)',fontWeight:600,maxWidth:'380px'
        }}>{toast.msg}</div>
      )}

      <div className="page-header">
        <div className="page-header-left">
          <h1>🏖️ Leave Management</h1>
          <p>Apply for leave and track your approval status.</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setFormError(''); }}>
            + Apply for Leave
          </button>
        </div>
      </div>

      {/* Leave Balance Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:'16px', marginBottom:'24px' }}>
        {LEAVE_TYPES.map(lt => {
          const used = usedByType[lt.value] || 0;
          const remaining = Math.max(0, lt.total - used);
          const pct = Math.round((remaining / lt.total) * 100);
          const barColor = pct > 50 ? '#00D4AA' : pct > 20 ? '#FF9F43' : '#FF6B6B';
          return (
            <div key={lt.value} style={{
              background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:'16px',
              padding:'20px',position:'relative',overflow:'hidden'
            }}>
              <div style={{fontSize:'1.8rem',marginBottom:'8px'}}>{lt.icon}</div>
              <div style={{fontSize:'2rem',fontWeight:800,color:'var(--text-primary)',lineHeight:1}}>{remaining}</div>
              <div style={{color:'var(--text-muted)',fontSize:'0.78rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',marginTop:'4px'}}>{lt.label}</div>
              <div style={{color:'var(--text-muted)',fontSize:'0.75rem',marginTop:'3px'}}>{used} used / {lt.total} total</div>
              <div style={{position:'absolute',bottom:0,left:0,right:0,height:'4px',background:'var(--border)'}}>
                <div style={{width:`${pct}%`,height:'100%',background:barColor,transition:'width 0.5s ease'}} />
              </div>
            </div>
          );
        })}
      </div>

      {/* History Card with Tabs */}
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
                <span style={{
                  background: activeTab===key ? 'var(--primary)' : 'var(--border)',
                  color: activeTab===key ? '#fff' : 'var(--text-muted)',
                  borderRadius:'10px',padding:'1px 7px',fontSize:'0.75rem',fontWeight:700
                }}>{tabCounts[key]}</span>
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
              <div className="empty-state-icon">🏖️</div>
              <h3>No {activeTab==='all' ? '' : activeTab} leave requests</h3>
              <p>{activeTab==='all' ? 'Click "Apply for Leave" to get started.' : `No ${activeTab} requests to show.`}</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
              {filteredLeaves.map((leave) => {
                const st = STATUS_STYLES[leave.status] || STATUS_STYLES.pending;
                const lt = LEAVE_TYPES.find(l => l.value === leave.leave_type) || LEAVE_TYPES[0];
                const days = getDays(leave.from_date, leave.to_date);
                return (
                  <div key={leave.leave_id || leave.id || Math.random()} style={{
                    background:'var(--surface)',border:'1px solid var(--border)',
                    borderLeft:`4px solid ${st.color}`,borderRadius:'12px',
                    padding:'18px 20px',display:'grid',gridTemplateColumns:'1fr auto',
                    gap:'12px',alignItems:'start'
                  }}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px',flexWrap:'wrap'}}>
                        <span style={{fontSize:'1.2rem'}}>{lt.icon}</span>
                        <span style={{fontWeight:700,color:'var(--text-primary)',fontSize:'1rem'}}>{lt.label}</span>
                        <span style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>
                          {Utils.formatDate(leave.from_date)} → {Utils.formatDate(leave.to_date)}
                        </span>
                        <span style={{background:'rgba(108,99,255,0.1)',color:'var(--primary)',borderRadius:'6px',padding:'1px 8px',fontSize:'0.78rem',fontWeight:600}}>
                          {days} day{days!==1?'s':''}
                        </span>
                      </div>
                      {leave.reason && (
                        <p style={{color:'var(--text-muted)',fontSize:'0.87rem',margin:'4px 0 0 0',lineHeight:1.5}}>
                          📝 {leave.reason}
                        </p>
                      )}
                      {leave.hod_remarks && (
                        <p style={{color:st.color,fontSize:'0.82rem',marginTop:'6px',fontStyle:'italic'}}>
                          💬 HOD Remarks: {leave.hod_remarks}
                        </p>
                      )}
                      <div style={{color:'var(--text-muted)',fontSize:'0.78rem',marginTop:'8px'}}>
                        Applied on {Utils.formatDate(leave.applied_at || leave.created_at)}
                      </div>
                    </div>
                    <div style={{background:st.bg,color:st.color,borderRadius:'20px',padding:'5px 14px',fontSize:'0.82rem',fontWeight:700,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:'5px'}}>
                      {st.icon} {st.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Apply Leave Modal */}
      {showForm && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',
          display:'flex',alignItems:'center',justifyContent:'center',
          zIndex:1000,backdropFilter:'blur(4px)',padding:'20px'
        }} onClick={e => { if(e.target===e.currentTarget) setShowForm(false); }}>
          <div style={{
            background:'var(--card-bg)',borderRadius:'20px',padding:'32px',
            width:'100%',maxWidth:'540px',
            boxShadow:'0 24px 64px rgba(0,0,0,0.4)',border:'1px solid var(--border)'
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
              <h2 style={{margin:0,fontSize:'1.4rem'}}>🏖️ Apply for Leave</h2>
              <button onClick={() => setShowForm(false)} style={{
                background:'var(--surface)',border:'1px solid var(--border)',
                borderRadius:'50%',width:'36px',height:'36px',cursor:'pointer',
                color:'var(--text-primary)',fontSize:'1.2rem',display:'flex',alignItems:'center',justifyContent:'center'
              }}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:'18px'}}>
              <div>
                <label style={{display:'block',marginBottom:'8px',fontWeight:600,color:'var(--text-secondary)',fontSize:'0.87rem'}}>Leave Type</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                  {LEAVE_TYPES.map(lt => (
                    <button key={lt.value} type="button"
                      onClick={() => setForm(f => ({...f, leaveType:lt.value}))}
                      style={{
                        padding:'12px',borderRadius:'12px',cursor:'pointer',textAlign:'left',transition:'all 0.2s',
                        border:`2px solid ${form.leaveType===lt.value ? 'var(--primary)' : 'var(--border)'}`,
                        background: form.leaveType===lt.value ? 'rgba(108,99,255,0.1)' : 'var(--surface)',
                        color:'var(--text-primary)'
                      }}>
                      <div style={{fontSize:'1.2rem'}}>{lt.icon}</div>
                      <div style={{fontSize:'0.82rem',fontWeight:600,marginTop:'4px'}}>{lt.label}</div>
                      <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{lt.total} days/year</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>
                <div>
                  <label style={{display:'block',marginBottom:'6px',fontWeight:600,color:'var(--text-secondary)',fontSize:'0.87rem'}}>From Date</label>
                  <input type="date" value={form.fromDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setForm(f => ({...f, fromDate:e.target.value}))}
                    className="form-control" required />
                </div>
                <div>
                  <label style={{display:'block',marginBottom:'6px',fontWeight:600,color:'var(--text-secondary)',fontSize:'0.87rem'}}>To Date</label>
                  <input type="date" value={form.toDate}
                    min={form.fromDate || new Date().toISOString().split('T')[0]}
                    onChange={e => setForm(f => ({...f, toDate:e.target.value}))}
                    className="form-control" required />
                </div>
              </div>

              {form.fromDate && form.toDate && new Date(form.fromDate) <= new Date(form.toDate) && (
                <div style={{background:'rgba(108,99,255,0.08)',borderRadius:'10px',padding:'10px 16px',color:'var(--primary)',fontSize:'0.87rem',fontWeight:600,textAlign:'center'}}>
                  📅 Duration: {getDays(form.fromDate,form.toDate)} day{getDays(form.fromDate,form.toDate)!==1?'s':''}
                </div>
              )}

              <div>
                <label style={{display:'block',marginBottom:'6px',fontWeight:600,color:'var(--text-secondary)',fontSize:'0.87rem'}}>Reason</label>
                <textarea value={form.reason}
                  onChange={e => setForm(f => ({...f, reason:e.target.value}))}
                  className="form-control" rows={3}
                  placeholder="Please provide a reason for your leave request..."
                  required style={{resize:'vertical',minHeight:'80px'}} />
              </div>

              {formError && (
                <div style={{background:'rgba(255,107,107,0.1)',border:'1px solid #FF6B6B',color:'#FF6B6B',padding:'12px 16px',borderRadius:'10px',fontSize:'0.87rem'}}>
                  ⚠️ {formError}
                </div>
              )}

              <div style={{display:'flex',gap:'12px',marginTop:'4px'}}>
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary" style={{flex:1}} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{flex:2}} disabled={submitting}>
                  {submitting ? '⏳ Submitting...' : '📨 Submit Request to HOD'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

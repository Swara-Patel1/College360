import { useState, useEffect, useCallback } from 'react';
import { API, Utils, SupaAPI } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

const STATUS_STYLES = {
  pending:  { bg: 'rgba(255,159,67,0.15)',  color: '#FF9F43', label: 'Pending',  icon: '⏳' },
  accepted: { bg: 'rgba(0,212,170,0.15)',   color: '#00D4AA', label: 'Accepted', icon: '✅' },
  rejected: { bg: 'rgba(255,107,107,0.15)', color: '#FF6B6B', label: 'Rejected', icon: '❌' },
};

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function FacultyInterchange() {
  const { user } = useAuthStore();
  const [myProfile, setMyProfile] = useState(null);
  const [mySchedule, setMySchedule] = useState([]);
  const [allFaculty, setAllFaculty] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('incoming');
  const [toast, setToast] = useState(null);

  // New swap request modal
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [selectedMySlot, setSelectedMySlot] = useState(null);
  const [selectedTargetFaculty, setSelectedTargetFaculty] = useState(null);
  const [targetSchedule, setTargetSchedule] = useState([]);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [selectedTargetSlot, setSelectedTargetSlot] = useState(null);
  const [swapDate, setSwapDate] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Reject dialog
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const prof = await API.get('faculty/my_profile');
      setMyProfile(prof);

      const [scheduleData, facData, reqData] = await Promise.all([
        API.get('timetable'),
        API.get('faculty'),
        API.get('faculty/interchange'),
      ]);

      const mySlots = (scheduleData || []).filter(s => s.faculty_id === prof?.id || s.faculty_name?.toLowerCase().includes((prof?.user?.first_name || '').toLowerCase()));
      setMySchedule(mySlots);
      setAllFaculty((facData || []).filter(f => f.id !== prof?.id && f.department_id === prof?.department_id));
      setRequests(Array.isArray(reqData) ? reqData : []);
    } catch (e) {
      console.error('Interchange load error:', e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const loadTargetSchedule = async (facultyId) => {
    setLoadingTarget(true);
    try {
      const data = await API.get(`timetable?faculty=${facultyId}`);
      setTargetSchedule(data || []);
    } catch { setTargetSchedule([]); }
    finally { setLoadingTarget(false); }
  };

  const handleSelectTargetFaculty = (fac) => {
    setSelectedTargetFaculty(fac);
    setSelectedTargetSlot(null);
    loadTargetSchedule(fac.id);
  };

  const handleSendRequest = async () => {
    setModalError('');
    if (!selectedMySlot) return setModalError('Please select your lecture slot.');
    if (!selectedTargetFaculty) return setModalError('Please select a target faculty.');
    if (!selectedTargetSlot) return setModalError('Please select the target lecture slot.');
    if (!swapDate) return setModalError('Please specify the swap date.');
    if (!swapReason.trim()) return setModalError('Please enter a reason for the swap.');

    setSubmitting(true);
    try {
      await API.post('faculty/interchange', {
        requester_faculty_name: myProfile ? `${myProfile.user?.first_name || ''} ${myProfile.user?.last_name || ''}`.trim() : '',
        target_faculty_id: selectedTargetFaculty.id,
        target_faculty_name: `${selectedTargetFaculty.user?.first_name || ''} ${selectedTargetFaculty.user?.last_name || ''}`.trim() || selectedTargetFaculty.user?.email?.split('@')[0] || 'Faculty',
        requester_slot: {
          day: selectedMySlot.day,
          start_time: selectedMySlot.start_time,
          end_time: selectedMySlot.end_time,
          course_name: selectedMySlot.course_name,
          course_code: selectedMySlot.course_code,
          room: selectedMySlot.room,
          date: swapDate,
          timetable_id: selectedMySlot.timetable_id,
        },
        target_slot: {
          day: selectedTargetSlot.day,
          start_time: selectedTargetSlot.start_time,
          end_time: selectedTargetSlot.end_time,
          course_name: selectedTargetSlot.course_name,
          course_code: selectedTargetSlot.course_code,
          room: selectedTargetSlot.room,
          date: swapDate,
          timetable_id: selectedTargetSlot.timetable_id,
        },
        reason: swapReason,
      });
      showToast(`Swap request sent to ${selectedTargetFaculty.user?.first_name || 'Faculty'}! 🔄`);
      setShowModal(false);
      resetModal();
      await loadData();
      setActiveTab('sent');
    } catch (e) {
      setModalError(e?.message || e?.detail || 'Failed to send request.');
    } finally { setSubmitting(false); }
  };

  const resetModal = () => {
    setModalStep(1);
    setSelectedMySlot(null);
    setSelectedTargetFaculty(null);
    setTargetSchedule([]);
    setSelectedTargetSlot(null);
    setSwapDate('');
    setSwapReason('');
    setModalError('');
  };

  const handleAccept = async (req) => {
    try {
      await API.post(`faculty/interchange/${req.interchange_id}/accept`, {});
      showToast('Swap accepted! HOD and students have been notified. ✅');
      await loadData();
    } catch (e) {
      showToast(e?.message || 'Failed to accept.', 'error');
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await API.post(`faculty/interchange/${rejectModal.interchange_id}/reject`, { reason: rejectReason });
      showToast('Swap request rejected.');
      setRejectModal(null);
      setRejectReason('');
      await loadData();
    } catch (e) {
      showToast(e?.message || 'Failed to reject.', 'error');
    }
  };

  const myFacId = myProfile?.id;
  const incomingRequests = requests.filter(r => r.target_faculty_id === myFacId);
  const sentRequests = requests.filter(r => r.requester_faculty_id === myFacId);

  const tabCounts = {
    incoming: incomingRequests.length,
    sent: sentRequests.length,
  };

  const activeRequests = activeTab === 'incoming' ? incomingRequests : sentRequests;

  const SlotCard = ({ slot, selected, onClick, label }) => (
    <div onClick={onClick} style={{
      padding:'14px',borderRadius:'12px',cursor:'pointer',transition:'all 0.2s',
      border:`2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
      background: selected ? 'rgba(108,99,255,0.1)' : 'var(--surface)',
    }}>
      <div style={{fontSize:'0.78rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'4px'}}>{label || slot.day}</div>
      <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'0.95rem'}}>{slot.course_code} — {slot.course_name}</div>
      <div style={{color:'var(--text-muted)',fontSize:'0.82rem',marginTop:'4px'}}>
        🕐 {slot.start_time?.substring(0,5)} – {slot.end_time?.substring(0,5)}
        {slot.room && <span>  •  🚪 Room {slot.room}</span>}
      </div>
    </div>
  );

  const RequestCard = ({ req, isIncoming }) => {
    const st = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
    const mySlot = isIncoming ? req.target_slot : req.requester_slot;
    const theirSlot = isIncoming ? req.requester_slot : req.target_slot;
    const otherName = isIncoming ? req.requester_faculty_name : req.target_faculty_name;

    return (
      <div style={{
        background:'var(--surface)',border:'1px solid var(--border)',
        borderLeft:`4px solid ${st.color}`,borderRadius:'14px',padding:'20px'
      }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px',flexWrap:'wrap',gap:'10px'}}>
          <div>
            <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'1rem',marginBottom:'4px'}}>
              🔄 {isIncoming ? `${otherName} wants to swap with you` : `Request to ${otherName}`}
            </div>
            <div style={{color:'var(--text-muted)',fontSize:'0.82rem'}}>
              📅 Swap Date: {Utils.formatDate(mySlot?.date) || '—'}
            </div>
          </div>
          <div style={{background:st.bg,color:st.color,borderRadius:'20px',padding:'5px 14px',fontSize:'0.82rem',fontWeight:700,whiteSpace:'nowrap'}}>
            {st.icon} {st.label}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:'12px',alignItems:'center',marginBottom:'12px'}}>
          <div style={{background:'rgba(108,99,255,0.08)',borderRadius:'10px',padding:'12px'}}>
            <div style={{fontSize:'0.75rem',color:'var(--primary)',fontWeight:600,marginBottom:'4px',textTransform:'uppercase'}}>
              {isIncoming ? 'Their Lecture' : 'Your Lecture'}
            </div>
            <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'0.9rem'}}>{theirSlot?.course_code} — {theirSlot?.course_name}</div>
            <div style={{color:'var(--text-muted)',fontSize:'0.8rem',marginTop:'2px'}}>{theirSlot?.day} • {theirSlot?.start_time?.substring(0,5)}</div>
          </div>
          <div style={{fontSize:'1.4rem',textAlign:'center'}}>⇄</div>
          <div style={{background:'rgba(0,212,170,0.08)',borderRadius:'10px',padding:'12px'}}>
            <div style={{fontSize:'0.75rem',color:'#00D4AA',fontWeight:600,marginBottom:'4px',textTransform:'uppercase'}}>
              {isIncoming ? 'Your Lecture' : 'Their Lecture'}
            </div>
            <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'0.9rem'}}>{mySlot?.course_code} — {mySlot?.course_name}</div>
            <div style={{color:'var(--text-muted)',fontSize:'0.8rem',marginTop:'2px'}}>{mySlot?.day} • {mySlot?.start_time?.substring(0,5)}</div>
          </div>
        </div>

        {req.reason && (
          <p style={{color:'var(--text-muted)',fontSize:'0.85rem',marginBottom:'12px',background:'var(--card-bg)',padding:'10px 14px',borderRadius:'8px'}}>
            📝 Reason: {req.reason}
          </p>
        )}

        {isIncoming && req.status === 'pending' && (
          <div style={{display:'flex',gap:'10px',marginTop:'12px'}}>
            <button className="btn btn-success btn-sm" style={{flex:1}} onClick={() => handleAccept(req)}>
              ✅ Accept — Notify HOD & Students
            </button>
            <button className="btn btn-danger btn-sm" style={{flex:1}} onClick={() => { setRejectModal(req); setRejectReason(''); }}>
              ❌ Reject Request
            </button>
          </div>
        )}

        {req.status === 'rejected' && req.reject_reason && (
          <p style={{color:'#FF6B6B',fontSize:'0.82rem',fontStyle:'italic',marginTop:'8px'}}>Rejection reason: {req.reject_reason}</p>
        )}

        <div style={{color:'var(--text-muted)',fontSize:'0.75rem',marginTop:'10px'}}>
          Sent {Utils.formatDate(req.created_at)}
        </div>
      </div>
    );
  };

  return (
    <>
      {toast && (
        <div style={{
          position:'fixed',top:'24px',right:'24px',zIndex:9999,
          background: toast.type==='success' ? '#00D4AA' : '#FF6B6B',
          color:'#fff',padding:'14px 22px',borderRadius:'12px',
          boxShadow:'0 8px 32px rgba(0,0,0,0.3)',fontWeight:600,maxWidth:'400px'
        }}>{toast.msg}</div>
      )}

      <div className="page-header">
        <div className="page-header-left">
          <h1>🔄 Lecture Interchange</h1>
          <p>Request lecture swaps with colleagues — pending target faculty approval.</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => { setShowModal(true); resetModal(); }}>
            + New Swap Request
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'16px',marginBottom:'24px'}}>
        {[
          { label:'Pending Incoming', val: incomingRequests.filter(r=>r.status==='pending').length, icon:'📬', color:'#FF9F43' },
          { label:'Sent Requests', val: sentRequests.length, icon:'📤', color:'var(--primary)' },
          { label:'Accepted Swaps', val: requests.filter(r=>r.status==='accepted').length, icon:'✅', color:'#00D4AA' },
          { label:'Total Requests', val: requests.length, icon:'📊', color:'#54A0FF' },
        ].map(s => (
          <div key={s.label} style={{background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:'14px',padding:'18px'}}>
            <div style={{fontSize:'1.6rem',marginBottom:'6px'}}>{s.icon}</div>
            <div style={{fontSize:'1.8rem',fontWeight:800,color:s.color,lineHeight:1}}>{s.val}</div>
            <div style={{color:'var(--text-muted)',fontSize:'0.78rem',marginTop:'4px',fontWeight:600}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="card-header" style={{borderBottom:'1px solid var(--border)',paddingBottom:0}}>
          <div style={{display:'flex',gap:0}}>
            {[['incoming','Incoming Requests'],['sent','Sent Requests']].map(([key,label]) => (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                padding:'12px 22px',background:'none',border:'none',cursor:'pointer',
                fontWeight: activeTab===key ? 700 : 400,
                color: activeTab===key ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: activeTab===key ? '2px solid var(--primary)' : '2px solid transparent',
                fontSize:'0.9rem',transition:'all 0.2s',display:'flex',alignItems:'center',gap:'6px'
              }}>
                {label}
                {tabCounts[key] > 0 && (
                  <span style={{
                    background: activeTab===key ? 'var(--primary)' : 'var(--border)',
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
          ) : activeRequests.length === 0 ? (
            <div className="empty-state" style={{padding:'60px 20px'}}>
              <div className="empty-state-icon">🔄</div>
              <h3>No {activeTab} requests</h3>
              <p>{activeTab==='incoming' ? 'No one has sent you a swap request yet.' : 'Click "+ New Swap Request" to request a lecture interchange.'}</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              {activeRequests.map(req => (
                <RequestCard key={req.interchange_id} req={req} isIncoming={activeTab==='incoming'} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Swap Request Modal */}
      {showModal && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',
          display:'flex',alignItems:'center',justifyContent:'center',
          zIndex:1000,backdropFilter:'blur(4px)',padding:'16px'
        }} onClick={e => { if(e.target===e.currentTarget){ setShowModal(false); resetModal(); } }}>
          <div style={{
            background:'var(--card-bg)',borderRadius:'20px',width:'100%',maxWidth:'680px',
            maxHeight:'90vh',overflow:'auto',boxShadow:'0 24px 64px rgba(0,0,0,0.5)',
            border:'1px solid var(--border)'
          }}>
            {/* Modal Header */}
            <div style={{padding:'24px 28px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:'var(--card-bg)',zIndex:1}}>
              <div>
                <h2 style={{margin:0,fontSize:'1.3rem'}}>🔄 New Lecture Swap Request</h2>
                <div style={{display:'flex',gap:'8px',marginTop:'10px'}}>
                  {[1,2,3,4].map(s => (
                    <div key={s} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <div style={{
                        width:'26px',height:'26px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                        fontSize:'0.78rem',fontWeight:700,
                        background: modalStep>s ? '#00D4AA' : modalStep===s ? 'var(--primary)' : 'var(--border)',
                        color: modalStep>=s ? '#fff' : 'var(--text-muted)'
                      }}>{modalStep>s ? '✓' : s}</div>
                      {s<4 && <div style={{width:'20px',height:'2px',background: modalStep>s ? '#00D4AA' : 'var(--border)'}} />}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => { setShowModal(false); resetModal(); }} style={{
                background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'50%',
                width:'36px',height:'36px',cursor:'pointer',color:'var(--text-primary)',fontSize:'1.2rem',
                display:'flex',alignItems:'center',justifyContent:'center'
              }}>×</button>
            </div>

            <div style={{padding:'24px 28px'}}>
              {/* Step 1: Pick your slot */}
              {modalStep === 1 && (
                <div>
                  <h3 style={{margin:'0 0 16px 0',fontSize:'1.1rem'}}>Step 1: Select Your Lecture Slot</h3>
                  {mySchedule.length === 0 ? (
                    <div className="empty-state"><div className="empty-state-icon">📅</div><p>No timetable slots found for your profile.</p></div>
                  ) : (
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'10px'}}>
                      {mySchedule.map((slot, i) => (
                        <SlotCard key={i} slot={slot} selected={selectedMySlot===slot} onClick={() => setSelectedMySlot(slot)} label={`${slot.day} • ${slot.start_time?.substring(0,5)}`} />
                      ))}
                    </div>
                  )}
                  <div style={{display:'flex',justifyContent:'flex-end',marginTop:'20px'}}>
                    <button className="btn btn-primary" disabled={!selectedMySlot} onClick={() => setModalStep(2)}>
                      Next: Choose Faculty →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Pick target faculty */}
              {modalStep === 2 && (
                <div>
                  <h3 style={{margin:'0 0 16px 0',fontSize:'1.1rem'}}>Step 2: Select Faculty to Swap With (Same Department)</h3>
                  <div style={{background:'rgba(108,99,255,0.08)',border:'1px solid rgba(108,99,255,0.25)',borderRadius:'10px',padding:'10px 14px',marginBottom:'14px',fontSize:'0.84rem',color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:'8px'}}>
                    <span style={{fontSize:'1.1rem'}}>ℹ️</span>
                    <span>Only faculty from your department (<strong>{myProfile?.department_name || 'your department'}</strong>) can participate in lecture interchanges.</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'10px'}}>
                    {allFaculty.map(fac => {
                      const name = `${fac.user?.first_name || ''} ${fac.user?.last_name || ''}`.trim() || fac.user?.email?.split('@')[0] || 'Faculty';
                      const isSelected = selectedTargetFaculty?.id === fac.id;
                      return (
                        <div key={fac.id} onClick={() => handleSelectTargetFaculty(fac)} style={{
                          padding:'14px',borderRadius:'12px',cursor:'pointer',transition:'all 0.2s',
                          border:`2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                          background: isSelected ? 'rgba(108,99,255,0.1)' : 'var(--surface)',
                          display:'flex',alignItems:'center',gap:'12px'
                        }}>
                          <div style={{width:'40px',height:'40px',borderRadius:'50%',background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:'0.9rem',flexShrink:0}}>
                            {name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'0.9rem'}}>{name}</div>
                            <div style={{color:'var(--text-muted)',fontSize:'0.78rem'}}>{fac.department_name || '—'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:'20px'}}>
                    <button className="btn btn-secondary" onClick={() => setModalStep(1)}>← Back</button>
                    <button className="btn btn-primary" disabled={!selectedTargetFaculty} onClick={() => setModalStep(3)}>
                      Next: Choose Slot →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Pick target slot */}
              {modalStep === 3 && (
                <div>
                  <h3 style={{margin:'0 0 16px 0',fontSize:'1.1rem'}}>Step 3: Select Their Lecture Slot to Swap</h3>
                  {loadingTarget ? (
                    <div style={{display:'flex',justifyContent:'center',padding:'32px'}}>
                      <div className="loading-spinner" />
                    </div>
                  ) : targetSchedule.length === 0 ? (
                    <div className="empty-state"><div className="empty-state-icon">📅</div><p>No timetable found for this faculty.</p></div>
                  ) : (
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'10px'}}>
                      {targetSchedule.map((slot, i) => (
                        <SlotCard key={i} slot={slot} selected={selectedTargetSlot===slot} onClick={() => setSelectedTargetSlot(slot)} label={`${slot.day} • ${slot.start_time?.substring(0,5)}`} />
                      ))}
                    </div>
                  )}
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:'20px'}}>
                    <button className="btn btn-secondary" onClick={() => setModalStep(2)}>← Back</button>
                    <button className="btn btn-primary" disabled={!selectedTargetSlot} onClick={() => setModalStep(4)}>
                      Next: Review & Send →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Date + reason + send */}
              {modalStep === 4 && (
                <div>
                  <h3 style={{margin:'0 0 16px 0',fontSize:'1.1rem'}}>Step 4: Swap Details & Send</h3>

                  {/* Swap summary */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:'12px',alignItems:'center',marginBottom:'20px',background:'var(--surface)',padding:'16px',borderRadius:'12px',border:'1px solid var(--border)'}}>
                    <div>
                      <div style={{fontSize:'0.75rem',color:'var(--primary)',fontWeight:600,textTransform:'uppercase',marginBottom:'4px'}}>Your Lecture</div>
                      <div style={{fontWeight:700,fontSize:'0.9rem'}}>{selectedMySlot?.course_code} — {selectedMySlot?.course_name}</div>
                      <div style={{color:'var(--text-muted)',fontSize:'0.8rem'}}>{selectedMySlot?.day} • {selectedMySlot?.start_time?.substring(0,5)}</div>
                    </div>
                    <div style={{fontSize:'1.5rem',textAlign:'center'}}>⇄</div>
                    <div>
                      <div style={{fontSize:'0.75rem',color:'#00D4AA',fontWeight:600,textTransform:'uppercase',marginBottom:'4px'}}>{selectedTargetFaculty?.user?.first_name}'s Lecture</div>
                      <div style={{fontWeight:700,fontSize:'0.9rem'}}>{selectedTargetSlot?.course_code} — {selectedTargetSlot?.course_name}</div>
                      <div style={{color:'var(--text-muted)',fontSize:'0.8rem'}}>{selectedTargetSlot?.day} • {selectedTargetSlot?.start_time?.substring(0,5)}</div>
                    </div>
                  </div>

                  <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
                    <div>
                      <label style={{display:'block',marginBottom:'6px',fontWeight:600,color:'var(--text-secondary)',fontSize:'0.87rem'}}>Swap Date</label>
                      <input type="date" value={swapDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setSwapDate(e.target.value)}
                        className="form-control" required />
                    </div>
                    <div>
                      <label style={{display:'block',marginBottom:'6px',fontWeight:600,color:'var(--text-secondary)',fontSize:'0.87rem'}}>Reason for Swap</label>
                      <textarea value={swapReason} onChange={e => setSwapReason(e.target.value)}
                        className="form-control" rows={3}
                        placeholder="Explain why you need this lecture swap..."
                        style={{resize:'vertical',minHeight:'80px'}} />
                    </div>
                  </div>

                  {modalError && (
                    <div style={{background:'rgba(255,107,107,0.1)',border:'1px solid #FF6B6B',color:'#FF6B6B',padding:'12px 16px',borderRadius:'10px',fontSize:'0.87rem',marginTop:'16px'}}>
                      ⚠️ {modalError}
                    </div>
                  )}

                  <div style={{display:'flex',justifyContent:'space-between',marginTop:'20px',gap:'12px'}}>
                    <button className="btn btn-secondary" onClick={() => setModalStep(3)} disabled={submitting}>← Back</button>
                    <button className="btn btn-primary" onClick={handleSendRequest} disabled={submitting} style={{flex:1}}>
                      {submitting ? '⏳ Sending...' : '📨 Send Swap Request'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Dialog */}
      {rejectModal && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',
          display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100,padding:'20px'
        }}>
          <div style={{background:'var(--card-bg)',borderRadius:'16px',padding:'28px',width:'100%',maxWidth:'420px',border:'1px solid var(--border)'}}>
            <h3 style={{margin:'0 0 16px 0'}}>❌ Reject Swap Request</h3>
            <p style={{color:'var(--text-muted)',marginBottom:'16px',fontSize:'0.9rem'}}>
              You are rejecting the swap request from <strong>{rejectModal.requester_faculty_name}</strong>.
              They will be notified of the rejection.
            </p>
            <label style={{display:'block',marginBottom:'6px',fontWeight:600,color:'var(--text-secondary)',fontSize:'0.87rem'}}>
              Reason (optional)
            </label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              className="form-control" rows={3}
              placeholder="Reason for rejecting..."
              style={{resize:'vertical',marginBottom:'16px'}} />
            <div style={{display:'flex',gap:'10px'}}>
              <button className="btn btn-secondary" style={{flex:1}} onClick={() => { setRejectModal(null); setRejectReason(''); }}>
                Cancel
              </button>
              <button className="btn btn-danger" style={{flex:1}} onClick={handleReject}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

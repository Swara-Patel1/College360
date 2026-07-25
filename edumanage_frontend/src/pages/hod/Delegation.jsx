import { useState, useEffect, useMemo } from 'react';
import { API, SupaAPI, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export default function Delegation() {
  const { user } = useAuthStore();
  const [me, setMe] = useState(null);            // HOD's own faculty profile
  const [delegations, setDelegations] = useState([]);
  const [faculty, setFaculty] = useState([]);    // department faculty (candidates)
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    delegate_faculty_id: '', can_approve_leaves: true, can_manage_timetable: false,
    start_date: todayISO(), end_date: plusDays(7), reason: '',
  });

  const load = async () => {
    try {
      setLoading(true);
      const profile = await API.get('faculty/my_profile');
      setMe(profile);
      const deptId = profile?.department_id || profile?.department?.department_id;
      if (!deptId) { setLoading(false); return; }
      const [dels, facs] = await Promise.all([
        SupaAPI.delegation.byDepartment(deptId),
        API.get(`faculty?department_id=eq.${deptId}`),
      ]);
      setDelegations(Array.isArray(dels) ? dels : []);
      // Candidates = department faculty other than the HOD themselves.
      setFaculty((facs || []).filter(f => String(f.faculty_id || f.id) !== String(profile?.faculty_id || profile?.id)));
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load delegation data.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (user) load(); }, [user]);

  const active = useMemo(() => delegations.filter(d => d.is_effective), [delegations]);
  const past = useMemo(() => delegations.filter(d => !d.is_effective), [delegations]);

  const openCreate = () => {
    setForm({
      delegate_faculty_id: faculty[0]?.faculty_id || faculty[0]?.id || '',
      can_approve_leaves: true, can_manage_timetable: false,
      start_date: todayISO(), end_date: plusDays(7), reason: '',
    });
    setModalOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.delegate_faculty_id) { Toast.warning('Select a deputy faculty member.'); return; }
    if (!form.can_approve_leaves && !form.can_manage_timetable) { Toast.warning('Grant at least one duty.'); return; }
    if (form.end_date < form.start_date) { Toast.warning('End date must be after the start date.'); return; }
    try {
      setSaving(true);
      const res = await SupaAPI.delegation.create({
        ...form,
        department_id: me?.department_id || me?.department?.department_id,
        delegator_hod_id: me?.faculty_id || me?.id,
      });
      if (res?.error) { Toast.error(res.error); return; }
      Toast.success('Duties delegated.');
      setModalOpen(false);
      load();
    } catch { Toast.error('Failed to create delegation.'); }
    finally { setSaving(false); }
  };

  const revoke = async (d) => {
    if (!window.confirm(`Revoke ${d.delegate_name}'s delegated duties now?`)) return;
    try { await SupaAPI.delegation.revoke(d.id); Toast.success('Delegation revoked.'); load(); }
    catch { Toast.error('Failed to revoke.'); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Delete this delegation record for ${d.delegate_name}?`)) return;
    try { await SupaAPI.delegation.remove(d.id); setDelegations(p => p.filter(x => x.id !== d.id)); Toast.success('Deleted.'); }
    catch { Toast.error('Failed to delete.'); }
  };

  const scopeBadges = (d) => (
    <>
      {d.can_approve_leaves && <span className="badge badge-info" style={{ marginRight: 4 }}><i className="bi bi-clipboard"></i> Leave Approvals</span>}
      {d.can_manage_timetable && <span className="badge badge-info"><i className="bi bi-calendar-week"></i> Timetable</span>}
    </>
  );

  const Row = ({ d, activeRow }) => (
    <div style={{ padding: '16px 20px', border: '1px solid var(--border)', borderLeft: `4px solid ${activeRow ? '#00D4AA' : 'var(--border)'}`, borderRadius: '12px', background: 'var(--bg-secondary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontWeight: 700 }}>{d.delegate_name} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>· {(d.delegate_designation || 'faculty').replace('_', ' ')}</span></div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {Utils.formatDate(d.start_date)} → {Utils.formatDate(d.end_date)}
            {d.reason && <> · {d.reason}</>}
          </div>
          <div style={{ marginTop: '8px' }}>{scopeBadges(d)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <span className={`badge ${activeRow ? 'badge-success' : 'badge-muted'}`}>{activeRow ? '● Active' : (d.is_active ? 'Scheduled/Expired' : 'Revoked')}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {activeRow && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent, #FF6B6B)' }} onClick={() => revoke(d)}>Revoke</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => remove(d)}><i className="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1><i className="bi bi-people"></i> Delegate HOD Duties</h1>
          <p>Temporarily hand specific duties (leave approvals, timetable) to a deputy while you're away.</p>
        </div>
        <div className="page-header-right"><button className="btn btn-primary" onClick={openCreate}><i className="bi bi-plus-lg"></i> New Delegation</button></div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-circle-fill"></i></div><div className="stat-value">{active.length}</div><div className="stat-label">Active Delegations</div></div>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-people"></i></div><div className="stat-value">{faculty.length}</div><div className="stat-label">Eligible Deputies</div></div>
        <div className="stat-card"><div className="stat-icon"><i className="bi bi-folder"></i></div><div className="stat-value">{past.length}</div><div className="stat-label">Past / Revoked</div></div>
      </div>

      <div className="card col-12" style={{ marginBottom: '20px' }}>
        <div className="card-header"><div className="card-title"><i className="bi bi-circle-fill"></i> Active Delegations</div></div>
        <div className="card-body" style={{ display: 'grid', gap: '12px' }}>
          {active.length ? active.map(d => <Row key={d.id} d={d} activeRow />) : (
            <div className="empty-state" style={{ padding: '32px', textAlign: 'center' }}>
              <div className="empty-state-icon"><i className="bi bi-people"></i></div><h3>No active delegations</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Delegate your duties before going on leave so approvals aren't held up.</p>
            </div>
          )}
        </div>
      </div>

      {past.length > 0 && (
        <div className="card col-12">
          <div className="card-header"><div className="card-title"><i className="bi bi-folder"></i> Past &amp; Revoked</div></div>
          <div className="card-body" style={{ display: 'grid', gap: '12px' }}>
            {past.map(d => <Row key={d.id} d={d} activeRow={false} />)}
          </div>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={<><i className="bi bi-people me-2"></i>Delegate Duties</>}>
        <form onSubmit={save}>
          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label className="form-label">Deputy (department faculty) *</label>
            <select className="form-control" value={form.delegate_faculty_id} onChange={(e) => setForm({ ...form, delegate_faculty_id: e.target.value })} required>
              <option value="">Select faculty…</option>
              {faculty.map(f => (
                <option key={f.faculty_id || f.id} value={f.faculty_id || f.id}>
                  {f.first_name} {f.last_name}{f.designation ? ` (${String(f.designation).replace('_', ' ')})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label className="form-label">Duties to delegate *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.can_approve_leaves} onChange={(e) => setForm({ ...form, can_approve_leaves: e.target.checked })} />
                <i className="bi bi-clipboard"></i> Leave approvals — review &amp; approve/reject faculty leave
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.can_manage_timetable} onChange={(e) => setForm({ ...form, can_manage_timetable: e.target.checked })} />
                <i className="bi bi-calendar-week"></i> Timetable — add/edit timetable slots &amp; resolve clashes
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div className="form-group"><label className="form-label">From *</label><input type="date" className="form-control" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></div>
            <div className="form-group"><label className="form-label">Until *</label><input type="date" className="form-control" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required /></div>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">Reason (optional)</label>
            <input className="form-control" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. On conference leave" />
          </div>

          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Delegating…' : 'Delegate'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

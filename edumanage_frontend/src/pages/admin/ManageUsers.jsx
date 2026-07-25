import { useState, useEffect, useMemo } from 'react';
import { SupaAPI, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

const ROLE_BADGE = { admin: 'badge badge-danger', faculty: 'badge badge-info', student: 'badge badge-primary', parent: 'badge badge-warning' };
const ROLES = ['admin', 'faculty', 'student', 'parent'];

export default function ManageUsers() {
  const { user: me } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [pwUser, setPwUser] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await SupaAPI.users.all();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      Toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.is_active !== false).length,
    admins: users.filter(u => u.role === 'admin').length,
    students: users.filter(u => u.role === 'student').length,
  }), [users]);

  const filtered = useMemo(() => users.filter(u => {
    const q = search.trim().toLowerCase();
    const name = `${u.first_name || ''} ${u.last_name || ''} ${u.email || ''} ${u.username || ''}`.toLowerCase();
    const matchSearch = !q || name.includes(q);
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  }), [users, search, roleFilter]);

  const toggleActive = async (u) => {
    const next = u.is_active === false;
    try {
      await SupaAPI.users.setActive(u.id, next);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: next } : x));
      Toast.success(`${u.email} ${next ? 'activated' : 'deactivated'}.`);
    } catch { Toast.error('Failed to update status.'); }
  };

  const changeRole = async (u, role) => {
    try {
      await SupaAPI.users.setRole(u.id, role);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role, roles: role } : x));
      Toast.success(`Role updated to ${role}.`);
    } catch { Toast.error('Failed to change role.'); }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (newPw.trim().length < 4) { Toast.warning('Password must be at least 4 characters.'); return; }
    try {
      setSaving(true);
      await SupaAPI.users.resetPassword(pwUser.id, newPw.trim());
      Toast.success(`Password reset for ${pwUser.email}.`);
      setPwUser(null); setNewPw('');
    } catch { Toast.error('Failed to reset password.'); }
    finally { setSaving(false); }
  };

  const removeUser = async (u) => {
    if (u.id === String(me?.id)) { Toast.warning("You can't delete your own account."); return; }
    if (!window.confirm(`Delete ${u.email}? This removes their account and linked profile.`)) return;
    try {
      await SupaAPI.users.remove(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      Toast.success('User deleted.');
    } catch { Toast.error('Failed to delete user.'); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left"><h1><i className="bi bi-people"></i> User Accounts</h1><p>Master control for every account — roles, access, and passwords.</p></div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-people"></i></div><div className="stat-value">{counts.total}</div><div className="stat-label">Total Users</div></div>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div><div className="stat-value">{counts.active}</div><div className="stat-label">Active</div></div>
        <div className="stat-card danger"><div className="stat-icon"><i className="bi bi-shield-check"></i></div><div className="stat-value">{counts.admins}</div><div className="stat-label">Admins</div></div>
        <div className="stat-card info"><div className="stat-icon"><i className="bi bi-mortarboard"></i></div><div className="stat-value">{counts.students}</div><div className="stat-label">Students</div></div>
      </div>

      <div className="card col-12">
        <div className="card-body" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <input className="form-control" style={{ flex: '1 1 240px' }} placeholder="🔍 Search name, email or username…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-control" style={{ maxWidth: '180px' }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{filtered.length} shown</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(u => {
                const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || '—';
                const isMe = u.id === String(me?.id);
                return (
                  <tr key={u.id}>
                    <td style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="user-avatar" style={{ width: '34px', height: '34px', fontSize: '0.8rem', background: Utils.getRandomColor(name) }}>{Utils.getInitials(name)}</div>
                      <span style={{ fontWeight: 600 }}>{name}{isMe && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (you)</span>}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td>
                      <select className="form-control" style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto' }}
                        value={u.role} disabled={isMe} onChange={(e) => changeRole(u, e.target.value)}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td><span className={u.is_active === false ? 'badge badge-muted' : 'badge badge-success'}>{u.is_active === false ? 'Inactive' : 'Active'}</span></td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.last_login ? Utils.formatDate(u.last_login) : 'Never'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button className="btn btn-ghost btn-sm" title={u.is_active === false ? 'Activate' : 'Deactivate'} disabled={isMe} onClick={() => toggleActive(u)}>{u.is_active === false ? '🔓' : '🔒'}</button>
                        <button className="btn btn-ghost btn-sm" title="Reset password" onClick={() => { setPwUser(u); setNewPw(''); }}><i className="bi bi-key"></i></button>
                        <button className="btn btn-ghost btn-sm" title="Delete" style={{ color: 'var(--accent, #FF6B6B)' }} disabled={isMe} onClick={() => removeUser(u)}><i className="bi bi-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan="6"><div className="empty-state" style={{ padding: '40px' }}><p>No users match your filters.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={!!pwUser} onClose={() => setPwUser(null)} title="🔑 Reset Password">
        {pwUser && (
          <form onSubmit={submitReset}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Set a new password for <strong>{pwUser.email}</strong>. They can sign in with it immediately.
            </p>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">New password *</label>
              <input className="form-control" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 4 characters" autoFocus />
            </div>
            <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setPwUser(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Reset Password'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { API, SupaAPI, Utils } from '../../api/client.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

const emptyBook = () => ({
  isbn: '', barcode: '', title: '', author: '', publisher: '', edition: '',
  category: '', department_id: '', shelf: '', total_copies: 1, cover_url: '',
});

export default function LibraryManagement() {
  const [tab, setTab] = useState('catalog');
  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [bookModal, setBookModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyBook());
  const [saving, setSaving] = useState(false);

  const [issueFor, setIssueFor] = useState(null);   // book being issued
  const [issueStudent, setIssueStudent] = useState('');
  const [loanDays, setLoanDays] = useState(14);

  const load = async () => {
    try {
      setLoading(true);
      const [bk, ln, st, dp, stu] = await Promise.all([
        SupaAPI.library.books(),
        SupaAPI.library.loans(),
        SupaAPI.library.stats(),
        API.get('departments').catch(() => []),
        API.get('students?limit=500').catch(() => []),
      ]);
      setBooks(Array.isArray(bk) ? bk : []);
      setLoans(Array.isArray(ln) ? ln : []);
      setStats(st || null);
      setDepartments(Array.isArray(dp) ? dp : []);
      setStudents(Array.isArray(stu) ? stu : []);
    } catch (e) {
      Toast.error('Failed to load library data.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const refreshStats = async () => { try { setStats(await SupaAPI.library.stats()); } catch { /* ignore */ } };

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return books;
    return books.filter(b =>
      [b.title, b.author, b.isbn, b.barcode, b.category].some(v => (v || '').toLowerCase().includes(q)));
  }, [books, search]);

  const openAdd = () => { setEditing(null); setForm(emptyBook()); setBookModal(true); };
  const openEdit = (b) => {
    setEditing(b);
    setForm({
      isbn: b.isbn, barcode: b.barcode, title: b.title, author: b.author,
      publisher: b.publisher, edition: b.edition, category: b.category,
      department_id: b.department_id || '', shelf: b.shelf,
      total_copies: b.total_copies, cover_url: b.cover_url,
    });
    setBookModal(true);
  };

  const saveBook = async (ev) => {
    ev.preventDefault();
    if (!form.title.trim()) { Toast.warning('Title is required.'); return; }
    try {
      setSaving(true);
      if (editing) await SupaAPI.library.updateBook(editing.id, form);
      else await SupaAPI.library.addBook(form);
      Toast.success(`Book ${editing ? 'updated' : 'added'}.`);
      setBookModal(false);
      await load();
    } catch {
      Toast.error('Failed to save book.');
    } finally {
      setSaving(false);
    }
  };

  const removeBook = async (b) => {
    if (!window.confirm(`Delete "${b.title}" and its loan history?`)) return;
    try {
      await SupaAPI.library.removeBook(b.id);
      setBooks(prev => prev.filter(x => x.id !== b.id));
      refreshStats();
      Toast.success('Book removed.');
    } catch { Toast.error('Failed to delete.'); }
  };

  const openIssue = (b) => { setIssueFor(b); setIssueStudent(''); setLoanDays(14); };
  const submitIssue = async (ev) => {
    ev.preventDefault();
    if (!issueStudent) { Toast.warning('Pick a student.'); return; }
    try {
      const res = await SupaAPI.library.issue({ book_id: issueFor.id, student_id: issueStudent, loan_days: loanDays });
      if (res?.error) { Toast.error(res.error); return; }
      Toast.success('Book issued.');
      setIssueFor(null);
      await load();
      setTab('loans');
    } catch { Toast.error('Failed to issue book.'); }
  };

  const returnLoan = async (l) => {
    const paid = l.fine > 0
      ? window.confirm(`This loan has an overdue fine of ${Utils.formatCurrency(l.fine)}.\nOK = collected, Cancel = mark unpaid.`)
      : true;
    try {
      await SupaAPI.library.returnBook(l.id, paid);
      Toast.success('Book returned.');
      await load();
    } catch { Toast.error('Failed to return book.'); }
  };

  const collectFine = async (l) => {
    try { await SupaAPI.library.markFinePaid(l.id); Toast.success('Fine marked paid.'); await load(); }
    catch { Toast.error('Failed to update fine.'); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  const activeLoans = loans.filter(l => l.status === 'issued');
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-header">
        <div className="page-header-left"><h1><i className="bi bi-book"></i> Library Management</h1><p>Manage the book inventory, issue &amp; return, and track fines.</p></div>
        <div className="page-header-right"><button className="btn btn-primary" onClick={openAdd}><i className="bi bi-plus-lg"></i> Add Book</button></div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-journal-bookmark"></i></div><div className="stat-value">{stats?.total_titles ?? 0}</div><div className="stat-label">Titles</div></div>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div><div className="stat-value">{stats?.available_copies ?? 0}</div><div className="stat-label">Available Copies</div></div>
        <div className="stat-card warning"><div className="stat-icon"><i className="bi bi-box-arrow-up"></i></div><div className="stat-value">{stats?.active_loans ?? 0}</div><div className="stat-label">Issued</div></div>
        <div className="stat-card danger"><div className="stat-icon"><i className="bi bi-alarm"></i></div><div className="stat-value">{stats?.overdue ?? 0}</div><div className="stat-label">Overdue</div></div>
        <div className="stat-card"><div className="stat-icon"><i className="bi bi-cash-coin"></i></div><div className="stat-value">{Utils.formatCurrency(stats?.outstanding_fine ?? 0)}</div><div className="stat-label">Outstanding Fines</div></div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={`btn ${tab === 'catalog' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('catalog')}><i className="bi bi-book"></i> Catalog ({books.length})</button>
        <button className={`btn ${tab === 'loans' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('loans')}><i className="bi bi-arrow-repeat"></i> Loans ({activeLoans.length} active)</button>
      </div>

      {tab === 'catalog' && (
        <div className="card col-12">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div className="card-title"><i className="bi bi-book"></i> Book Inventory</div>
            <input className="form-control" style={{ maxWidth: '320px' }} placeholder="🔎 Search title, author, ISBN or barcode…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {filteredBooks.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Barcode / ISBN</th><th>Shelf</th><th>Copies</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredBooks.map(b => (
                      <tr key={b.id}>
                        <td><strong>{b.title}</strong>{b.edition && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> · {b.edition}</span>}</td>
                        <td>{b.author || '—'}</td>
                        <td>{b.category || '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem' }}>{b.barcode}<br /><span style={{ color: 'var(--text-muted)' }}>{b.isbn || '—'}</span></td>
                        <td>{b.shelf || '—'}</td>
                        <td>
                          <span className={`badge ${b.available_copies > 0 ? 'badge-success' : 'badge-danger'}`}>
                            {b.available_copies}/{b.total_copies}
                          </span>
                        </td>
                        <td style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-primary btn-sm" disabled={b.available_copies < 1} onClick={() => openIssue(b)}><i className="bi bi-box-arrow-up"></i> Issue</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}><i className="bi bi-pencil"></i></button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent, #FF6B6B)' }} onClick={() => removeBook(b)}><i className="bi bi-trash"></i></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
                <div className="empty-state-icon"><i className="bi bi-book"></i></div><h3>{search ? 'No books match your search' : 'No books in the catalog'}</h3>
                {!search && <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: '12px' }}>Add your first book</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'loans' && (
        <div className="card col-12">
          <div className="card-header"><div className="card-title"><i className="bi bi-arrow-repeat"></i> Issued Books &amp; Fines</div></div>
          <div className="card-body" style={{ padding: 0 }}>
            {loans.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Book</th><th>Student</th><th>Issued</th><th>Due</th><th>Status</th><th>Fine</th><th>Actions</th></tr></thead>
                  <tbody>
                    {loans.map(l => {
                      const overdue = l.status === 'issued' && l.due_date < todayISO;
                      return (
                        <tr key={l.id} style={overdue ? { background: 'rgba(255,107,107,0.08)' } : undefined}>
                          <td><strong>{l.book_title}</strong></td>
                          <td>{l.student_name}<br /><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{l.enrollment_no}</span></td>
                          <td>{Utils.formatDate(l.issued_at)}</td>
                          <td>{Utils.formatDate(l.due_date)}{overdue && <span className="badge badge-danger" style={{ marginLeft: 6 }}>{l.overdue_days}d late</span>}</td>
                          <td><span className={`badge ${l.status === 'returned' ? 'badge-success' : l.status === 'lost' ? 'badge-danger' : 'badge-warning'}`} style={{ textTransform: 'capitalize' }}>{l.status}</span></td>
                          <td>{l.fine > 0 ? <span style={{ color: l.fine_paid ? 'var(--text-muted)' : 'var(--accent, #FF6B6B)' }}>{Utils.formatCurrency(l.fine)}{l.fine_paid ? ' ✓' : ''}</span> : '—'}</td>
                          <td style={{ display: 'flex', gap: '6px' }}>
                            {l.status === 'issued' && <button className="btn btn-primary btn-sm" onClick={() => returnLoan(l)}><i className="bi bi-box-arrow-in-down"></i> Return</button>}
                            {l.fine > 0 && !l.fine_paid && <button className="btn btn-ghost btn-sm" onClick={() => collectFine(l)}><i className="bi bi-cash-coin"></i> Collect</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
                <div className="empty-state-icon"><i className="bi bi-arrow-repeat"></i></div><h3>No books issued yet</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Issue a book from the Catalog tab.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / edit book */}
      <Modal isOpen={bookModal} onClose={() => setBookModal(false)} title={editing ? '✏️ Edit Book' : '➕ Add Book'}>
        <form onSubmit={saveBook}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Title *</label>
            <input className="form-control" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group"><label className="form-label">Author</label><input className="form-control" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Publisher</label><input className="form-control" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">ISBN</label><input className="form-control" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Barcode</label><input className="form-control" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Auto-generated if blank" /></div>
            <div className="form-group"><label className="form-label">Category</label><input className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Algorithms" /></div>
            <div className="form-group"><label className="form-label">Edition</label><input className="form-control" value={form.edition} onChange={(e) => setForm({ ...form, edition: e.target.value })} placeholder="e.g. 3rd Ed." /></div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <select className="form-control" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">General</option>
                {departments.map(d => <option key={d.department_id || d.id} value={d.department_id || d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Shelf</label><input className="form-control" value={form.shelf} onChange={(e) => setForm({ ...form, shelf: e.target.value })} placeholder="e.g. A-12" /></div>
            <div className="form-group"><label className="form-label">Total Copies</label><input type="number" min="1" className="form-control" value={form.total_copies} onChange={(e) => setForm({ ...form, total_copies: e.target.value })} /></div>
          </div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setBookModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Book'}</button>
          </div>
        </form>
      </Modal>

      {/* Issue book */}
      <Modal isOpen={!!issueFor} onClose={() => setIssueFor(null)} title="📤 Issue Book">
        {issueFor && (
          <form onSubmit={submitIssue}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              <strong>{issueFor.title}</strong> — {issueFor.author || 'Unknown author'} ({issueFor.available_copies} available)
            </p>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Student *</label>
              <select className="form-control" value={issueStudent} onChange={(e) => setIssueStudent(e.target.value)} required>
                <option value="">Select student…</option>
                {students.map(s => (
                  <option key={s.student_id || s.id} value={s.student_id || s.id}>
                    {s.enrollment_no} — {s.first_name} {s.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Loan period (days)</label>
              <input type="number" min="1" className="form-control" value={loanDays} onChange={(e) => setLoanDays(e.target.value)} />
            </div>
            <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIssueFor(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Confirm Issue</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

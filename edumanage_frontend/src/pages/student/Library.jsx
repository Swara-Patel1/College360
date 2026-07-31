import { useState, useEffect, useMemo } from 'react';
import { SupaAPI, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

export default function Library() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('catalog');
  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);      // book_id / loan_id currently being borrowed / returned
  const [toast, setToast] = useState(null);    // { type: 'success' | 'error', text }

  const load = async () => {
    try {
      setLoading(true);
      const [bk, ln] = await Promise.all([
        SupaAPI.library.books(),
        SupaAPI.library.loansByStudent(user.id),
      ]);
      setBooks(Array.isArray(bk) ? bk : []);
      setLoans(Array.isArray(ln) ? ln : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (user) load(); }, [user]);

  // Auto-dismiss the toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return books;
    return books.filter(b =>
      [b.title, b.author, b.isbn, b.barcode, b.category].some(v => (v || '').toLowerCase().includes(q)));
  }, [books, search]);

  const activeLoans = loans.filter(l => l.status === 'issued');
  // Titles the student currently has out — used to disable the Borrow button
  const issuedTitles = useMemo(
    () => new Set(activeLoans.map(l => (l.title || '').toLowerCase())),
    [loans]
  );
  const outstanding = loans.filter(l => !l.fine_paid && l.fine > 0).reduce((s, l) => s + l.fine, 0);
  const todayISO = new Date().toISOString().slice(0, 10);

  const borrow = async (b) => {
    const bookId = b.book_id || b.id;
    try {
      setBusy(bookId);
      const res = await SupaAPI.library.issue({ book_id: bookId, student_id: user.id, loan_days: 14 });
      if (res && res.error) {
        setToast({ type: 'error', text: res.error });
      } else {
        setToast({ type: 'success', text: `"${b.title}" borrowed — due in 14 days.` });
        await load();
        setTab('mybooks');
      }
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', text: 'Could not borrow this book. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const returnLoan = async (l) => {
    const loanId = l.loan_id || l.id;
    try {
      setBusy(loanId);
      const res = await SupaAPI.library.returnBook(loanId, true);
      if (res && res.error) {
        setToast({ type: 'error', text: res.error });
      } else {
        setToast({ type: 'success', text: `Returned "${l.title}". Thank you!` });
        await load();
      }
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', text: 'Could not return this book. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          padding: '14px 20px', borderRadius: '10px', color: '#fff', fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', maxWidth: '360px',
          background: toast.type === 'success' ? '#2ecc71' : '#FF6B6B',
        }}>
          <i className={`bi ${toast.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} style={{ marginRight: 8 }} />
          {toast.text}
        </div>
      )}

      <div className="page-header">
        <div className="page-header-left">
          <div className="stat-icon" style={{ background: 'rgba(108, 99, 255, 0.2)', color: '#6C63FF' }}>
            <i className="bi bi-book"></i>
          </div>
          <div>
            <h1>Library</h1>
            <p>Browse the catalogue, borrow available books, and return them — all online.</p>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card primary"><div className="stat-icon"><i className="bi bi-journal-bookmark"></i></div><div><div className="stat-value">{books.length}</div><div className="stat-label">Titles in Catalogue</div></div></div>
        <div className="stat-card success"><div className="stat-icon"><i className="bi bi-check-circle-fill"></i></div><div><div className="stat-value">{books.reduce((s, b) => s + (b.available_copies || 0), 0)}</div><div className="stat-label">Available Copies</div></div></div>
        <div className="stat-card warning"><div className="stat-icon"><i className="bi bi-box-arrow-up"></i></div><div><div className="stat-value">{activeLoans.length}</div><div className="stat-label">Currently Borrowed</div></div></div>
        <div className="stat-card danger"><div className="stat-icon"><i className="bi bi-cash-coin"></i></div><div><div className="stat-value">{Utils.formatCurrency(outstanding)}</div><div className="stat-label">Fines Due</div></div></div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={`btn ${tab === 'catalog' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('catalog')}><i className="bi bi-search"></i> Catalogue</button>
        <button className={`btn ${tab === 'mybooks' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('mybooks')}><i className="bi bi-book"></i> My Books ({loans.length})</button>
      </div>

      {tab === 'catalog' && (
        <div className="card col-12">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div className="card-title"><i className="bi bi-book"></i> Book Catalogue</div>
            <input className="form-control" style={{ maxWidth: '320px' }} placeholder="Search by title, author, ISBN…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {filtered.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Availability</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                  <tbody>
                    {filtered.map(b => {
                      const alreadyOut = issuedTitles.has((b.title || '').toLowerCase());
                      const bookId = b.book_id || b.id;
                      const isBusy = busy === bookId;
                      return (
                        <tr key={b.id}>
                          <td><strong>{b.title}</strong>{b.edition && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> · {b.edition}</span>}</td>
                          <td>{b.author || '—'}</td>
                          <td>{b.category || '—'}</td>
                          <td>
                            {b.available_copies > 0
                              ? <span className="badge badge-success">{b.available_copies} AVAILABLE</span>
                              : <span className="badge badge-danger">OUT OF STOCK</span>}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {alreadyOut ? (
                              <span className="badge badge-info">Borrowed</span>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={b.available_copies < 1 || isBusy}
                                onClick={() => borrow(b)}
                              >
                                {isBusy ? <><span className="spinner-border spinner-border-sm" /> Borrowing…</> : <><i className="bi bi-box-arrow-down" /> Borrow</>}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
                <div className="empty-state-icon"><i className="bi bi-book"></i></div><h3>No books found</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Try a different search term.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'mybooks' && (
        <div className="card col-12">
          <div className="card-header"><div className="card-title"><i className="bi bi-book"></i> My Borrowing History</div></div>
          <div className="card-body" style={{ padding: 0 }}>
            {loans.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Book</th><th>Issued</th><th>Due</th><th>Status</th><th>Fine</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                  <tbody>
                    {loans.map(l => {
                      const overdue = l.status === 'issued' && l.due_date < todayISO;
                      const loanId = l.loan_id || l.id;
                      const isBusy = busy === loanId;
                      return (
                        <tr key={l.id} style={overdue ? { background: 'rgba(255,107,107,0.08)' } : undefined}>
                          <td><strong>{l.book_title || l.title}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{l.book_author || l.author}</span></td>
                          <td>{Utils.formatDate(l.issued_at)}</td>
                          <td>{Utils.formatDate(l.due_date)}{overdue && <span className="badge badge-danger" style={{ marginLeft: 6 }}>{l.overdue_days || ''} late</span>}</td>
                          <td><span className={`badge ${l.status === 'returned' ? 'badge-success' : l.status === 'lost' ? 'badge-danger' : 'badge-warning'}`} style={{ textTransform: 'capitalize' }}>{l.status}</span></td>
                          <td>{l.fine > 0 ? <span style={{ color: l.fine_paid ? 'var(--text-muted)' : 'var(--accent, #FF6B6B)' }}>{Utils.formatCurrency(l.fine)}{l.fine_paid ? ' (paid)' : ' due'}</span> : '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {l.status === 'issued' ? (
                              <button className="btn btn-ghost btn-sm" disabled={isBusy} onClick={() => returnLoan(l)}>
                                {isBusy ? <><span className="spinner-border spinner-border-sm" /> Returning…</> : <><i className="bi bi-box-arrow-up" /> Return</>}
                              </button>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
                <div className="empty-state-icon"><i className="bi bi-book"></i></div><h3>You haven't borrowed any books yet</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Head to the Catalogue tab and borrow a book to get started.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

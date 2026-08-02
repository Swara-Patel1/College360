import { useState } from 'react';

/**
 * DownloadDropdown.jsx
 * Reusable "Download Data ⌄" button with PDF / CSV / Excel options.
 */
export default function DownloadDropdown({ open: externalOpen, setOpen: externalSetOpen, onCSV, onExcel, onPDF, onSelect }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalSetOpen || setInternalOpen;

  const handleCSV = () => {
    setOpen(false);
    if (onCSV) onCSV();
    if (onSelect) onSelect('csv');
  };

  const handleExcel = () => {
    setOpen(false);
    if (onExcel) onExcel();
    if (onSelect) onSelect('excel');
  };

  const handlePDF = () => {
    setOpen(false);
    if (onPDF) onPDF();
    if (onSelect) onSelect('pdf');
  };
  const menuStyle = {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '6px', minWidth: '175px',
    boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: '2px',
  };

  const itemBase = {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '9px 14px', borderRadius: '8px', border: 'none',
    background: 'transparent', color: 'var(--text-primary)',
    cursor: 'pointer', fontSize: '0.9rem', width: '100%', textAlign: 'left',
  };

  const hover = (e) => (e.currentTarget.style.background = 'var(--surface-hover, rgba(108,99,255,0.08))');
  const unhover = (e) => (e.currentTarget.style.background = 'transparent');

  return (
    <div style={{ position: 'relative' }}>
      <button
        id="dl-dropdown-btn"
        className="btn btn-ghost"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <i className="bi bi-download"></i> Download Data{' '}
        <i className="bi bi-chevron-down" style={{ fontSize: '0.72rem' }}></i>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div style={menuStyle}>
            <button
              id="dl-pdf"
              style={itemBase}
              onMouseEnter={hover} onMouseLeave={unhover}
              onClick={handlePDF}
            >
              <i className="bi bi-file-earmark-pdf" style={{ color: '#EF4444', fontSize: '1.1rem' }}></i>
              Export as PDF
            </button>
            <button
              id="dl-csv"
              style={itemBase}
              onMouseEnter={hover} onMouseLeave={unhover}
              onClick={handleCSV}
            >
              <i className="bi bi-filetype-csv" style={{ color: '#10B981', fontSize: '1.1rem' }}></i>
              Export as CSV
            </button>
            <button
              id="dl-excel"
              style={itemBase}
              onMouseEnter={hover} onMouseLeave={unhover}
              onClick={handleExcel}
            >
              <i className="bi bi-file-earmark-excel" style={{ color: '#22C55E', fontSize: '1.1rem' }}></i>
              Export as Excel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

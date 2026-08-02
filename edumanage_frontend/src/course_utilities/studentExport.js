/**
 * studentExport.js — Student Data Export Utilities
 * =================================================
 * Centralised module for exporting the student list to PDF, CSV, and Excel.
 * Import the three functions below and call them with the rows to export.
 *
 * Usage:
 *   import { downloadStudentsCSV, downloadStudentsExcel, downloadStudentsPDF } from '../course_utilities/studentExport.js';
 *
 *   downloadStudentsCSV(filteredStudents);
 *   downloadStudentsExcel(filteredStudents);
 *   await downloadStudentsPDF(filteredStudents, Toast);
 */

// ─── Column definitions ───────────────────────────────────────────────────────

export const STUDENT_EXPORT_HEADERS = [
  '#', 'Full Name', 'Enrollment No.', 'Roll No.', 'Email',
  'Department', 'Semester', 'Year', 'Status', 'Date of Birth',
  'Address', 'Parent Email', 'Parent Phone', 'CGPA', 'Attendance %',
];

/**
 * Converts the student array into a 2D array of plain values for export.
 * @param {Object[]} students - Array of student objects from the API
 * @returns {Array[]} rows
 */
export function buildStudentRows(students) {
  return students.map((s, i) => [
    i + 1,
    `${s.first_name || ''} ${s.last_name || ''}`.trim(),
    s.enrollment_no || s.student_id || '—',
    s.roll_number   || '—',
    s.email         || '—',
    s.department_name || '—',
    s.semester       || '—',
    s.year_of_study  || '—',
    s.status         || '—',
    s.date_of_birth  || '—',
    s.address        || '—',
    s.parent_email   || '—',
    s.parent_phone   || s.guardian_phone || '—',
    s.cgpa              != null ? s.cgpa              : '—',
    s.attendance_percentage != null ? `${s.attendance_percentage}%` : '—',
  ]);
}

// ─── File name helper ─────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Trigger browser download ─────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Download student data as a UTF-8 CSV file.
 * @param {Object[]} students - Filtered student list
 * @param {Object}   Toast    - Toast notification object { success, error }
 */
export function downloadStudentsCSV(students, Toast) {
  const rows       = buildStudentRows(students);
  const csvContent = [STUDENT_EXPORT_HEADERS, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `students_${todayStr()}.csv`);
  Toast?.success('CSV downloaded!');
}

// ─── Excel (HTML-table format, opens natively in Excel) ──────────────────────

/**
 * Download student data as an .xls file (HTML-table, opens in Excel).
 * @param {Object[]} students - Filtered student list
 * @param {Object}   Toast    - Toast notification object { success, error }
 */
export function downloadStudentsExcel(students, Toast) {
  const rows = buildStudentRows(students);

  const thCells = STUDENT_EXPORT_HEADERS
    .map(h => `<th style="background:#6C63FF;color:#fff;padding:8px;border:1px solid #ccc;font-weight:bold">${h}</th>`)
    .join('');

  const bodyRows = rows
    .map((row, i) =>
      `<tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">`
      + row.map(v => `<td style="padding:6px 10px;border:1px solid #ddd">${v}</td>`).join('')
      + '</tr>',
    )
    .join('');

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"/></head>
  <body>
    <table>
      <thead><tr>${thCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, `students_${todayStr()}.xls`);
  Toast?.success('Excel file downloaded!');
}

// ─── PDF (jsPDF + autotable, loaded from CDN on first use) ───────────────────

/** Internal: lazily load a script from CDN. Cached on window so it only loads once. */
async function loadScript(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) { resolve(); return; }
    const s     = document.createElement('script');
    s.src       = url;
    s.onload    = resolve;
    s.onerror   = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(s);
  });
}

/**
 * Download student data as a landscape A4 PDF with a styled table.
 * Loads jsPDF + jspdf-autotable from CDN on first call (no npm install needed).
 *
 * @param {Object[]} students - Filtered student list
 * @param {Object}   Toast    - Toast notification object { success, error, info }
 */
export async function downloadStudentsPDF(students, Toast) {
  Toast?.info('Generating PDF…');

  try {
    // 1. Load jsPDF core
    if (!window.jspdf?.jsPDF) {
      await loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      );
    }

    // 2. Load autotable plugin
    if (!window.jspdf?.jsPDF?.API?.autoTable) {
      await loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
      );
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Title
    doc.setFontSize(16);
    doc.setTextColor(108, 99, 255);
    doc.text('College360 — Student Directory', 14, 14);

    // Sub-title / metadata
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Generated: ${new Date().toLocaleString()}  ·  Total: ${students.length} student${students.length !== 1 ? 's' : ''}`,
      14, 22,
    );

    // Table
    doc.autoTable({
      head:              [STUDENT_EXPORT_HEADERS],
      body:              buildStudentRows(students),
      startY:            26,
      styles:            { fontSize: 7.5, cellPadding: 2 },
      headStyles:        { fillColor: [108, 99, 255], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles:{ fillColor: [245, 245, 255] },
      margin:            { left: 10, right: 10 },
    });

    doc.save(`students_${todayStr()}.pdf`);
    Toast?.success('PDF downloaded!');
  } catch (err) {
    console.error('[studentExport] PDF generation failed:', err);
    Toast?.error('PDF generation failed. Check your internet connection.');
  }
}

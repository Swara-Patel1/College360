/**
 * dataExport.js — Universal Data Export Utilities for College360
 * ==============================================================
 * Single module that handles CSV, Excel, and PDF exports for every
 * major admin entity:
 *
 *   Faculty        → downloadFacultyCSV / Excel / PDF
 *   HOD            → downloadHODCSV / Excel / PDF
 *   Subjects       → downloadSubjectsCSV / Excel / PDF
 *   Departments    → downloadDepartmentsCSV / Excel / PDF
 *   Timetable      → downloadTimetableCSV / Excel / PDF
 *   Exam Schedule  → downloadExamsCSV / Excel / PDF
 *   Fees           → downloadFeesCSV / Excel / PDF
 *
 * Usage example:
 *   import { downloadFacultyCSV, downloadFacultyExcel, downloadFacultyPDF }
 *     from '../course_utilities/dataExport.js';
 *   downloadFacultyCSV(filteredFaculty, Toast);
 */

// ─── Shared low-level helpers ─────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSVBlob(headers, rows) {
  const content = [headers, ...rows]
    .map(row => row.map(v => `"${String(v ?? '—').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return new Blob([content], { type: 'text/csv;charset=utf-8;' });
}

function toExcelBlob(headers, rows, title = 'College360 Export') {
  const thCells = headers
    .map(h => `<th style="background:#6C63FF;color:#fff;padding:8px;border:1px solid #ccc;font-weight:bold">${h}</th>`)
    .join('');
  const bodyRows = rows
    .map((row, i) =>
      `<tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">` +
      row.map(v => `<td style="padding:6px 10px;border:1px solid #ddd">${v ?? '—'}</td>`).join('') +
      '</tr>',
    )
    .join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"/></head>
    <body><table><thead><tr>${thCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
  return new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
}

async function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = url; s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load: ${url}`));
    document.head.appendChild(s);
  });
}

async function generatePDF(title, subtitle, headers, rows, filename, Toast) {
  Toast?.info('Generating PDF…');
  try {
    if (!window.jspdf?.jsPDF) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    if (!window.jspdf?.jsPDF?.API?.autoTable) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(16); doc.setTextColor(108, 99, 255);
    doc.text(`College360 — ${title}`, 14, 14);
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}  ·  ${subtitle}`, 14, 22);
    doc.autoTable({
      head: [headers], body: rows, startY: 26,
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [108, 99, 255], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 255] },
      margin: { left: 10, right: 10 },
    });
    doc.save(`${filename}_${todayStr()}.pdf`);
    Toast?.success('PDF downloaded!');
  } catch (err) {
    console.error('[dataExport] PDF error:', err);
    Toast?.error('PDF generation failed. Check your internet connection.');
  }
}

// generic bundle for CSV + Excel
function makeDownloaders(getHeaders, getRows, name, title) {
  return {
    csv(data, Toast) {
      triggerDownload(toCSVBlob(getHeaders(), getRows(data)), `${name}_${todayStr()}.csv`);
      Toast?.success('CSV downloaded!');
    },
    excel(data, Toast) {
      triggerDownload(toExcelBlob(getHeaders(), getRows(data), title), `${name}_${todayStr()}.xls`);
      Toast?.success('Excel file downloaded!');
    },
    async pdf(data, Toast) {
      await generatePDF(title, `Total: ${data.length} record${data.length !== 1 ? 's' : ''}`,
        getHeaders(), getRows(data), name, Toast);
    },
  };
}

// ─── FACULTY ─────────────────────────────────────────────────────────────────

const FACULTY_HEADERS = [
  '#', 'Full Name', 'Employee ID', 'Email', 'Department', 'Designation',
  'Status', 'Phone', 'Date of Joining', 'Specialization',
];

function buildFacultyRows(data) {
  return data.map((f, i) => [
    i + 1,
    `${f.first_name || ''} ${f.last_name || ''}`.trim(),
    f.employee_id || f.faculty_id || '—',
    f.email || '—',
    f.department_name || f.department?.name || '—',
    f.designation || f.role || '—',
    f.status || '—',
    f.phone || f.contact || '—',
    f.date_of_joining || f.joining_date || '—',
    f.specialization || f.expertise || '—',
  ]);
}

const _fac = makeDownloaders(() => FACULTY_HEADERS, buildFacultyRows, 'faculty', 'Faculty Directory');
export const downloadFacultyCSV   = _fac.csv;
export const downloadFacultyExcel = _fac.excel;
export const downloadFacultyPDF   = _fac.pdf;

// ─── HOD ─────────────────────────────────────────────────────────────────────

const HOD_HEADERS = [
  '#', 'Full Name', 'Employee ID', 'Email', 'Department', 'Phone', 'Assigned Since',
];

function buildHODRows(data) {
  return data.map((h, i) => [
    i + 1,
    `${h.first_name || h.faculty?.first_name || ''} ${h.last_name || h.faculty?.last_name || ''}`.trim() || '—',
    h.employee_id || h.faculty?.employee_id || '—',
    h.email || h.faculty?.email || h.faculty?.user?.email || '—',
    h.department_name || h.department?.name || '—',
    h.phone || h.faculty?.phone || '—',
    h.assigned_since || h.created_at?.slice(0, 10) || '—',
  ]);
}

const _hod = makeDownloaders(() => HOD_HEADERS, buildHODRows, 'hod', 'HOD Directory');
export const downloadHODCSV   = _hod.csv;
export const downloadHODExcel = _hod.excel;
export const downloadHODPDF   = _hod.pdf;

// ─── SUBJECTS / COURSES ───────────────────────────────────────────────────────

const SUBJECTS_HEADERS = [
  '#', 'Course Name', 'Code', 'Department', 'Faculty', 'Credits',
  'Semester', 'Max Students', 'Status', 'Description',
];

function buildSubjectsRows(data) {
  return data.map((c, i) => [
    i + 1,
    c.name || '—',
    c.code || '—',
    c.department_name || c.department?.name || '—',
    c.faculty_name || (c.faculty ? `${c.faculty.first_name || ''} ${c.faculty.last_name || ''}`.trim() : '—'),
    c.credits || '—',
    c.semester || c.semester_number || '—',
    c.max_students || c.max_enrollment || '—',
    c.is_active != null ? (c.is_active ? 'Active' : 'Inactive') : '—',
    c.description || '—',
  ]);
}

const _sub = makeDownloaders(() => SUBJECTS_HEADERS, buildSubjectsRows, 'subjects', 'Subjects / Courses');
export const downloadSubjectsCSV   = _sub.csv;
export const downloadSubjectsExcel = _sub.excel;
export const downloadSubjectsPDF   = _sub.pdf;

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────

const DEPT_HEADERS = [
  '#', 'Department Name', 'Code', 'HOD Name', 'HOD Email',
  'Faculty Count', 'Student Count', 'Description',
];

function buildDeptRows(data) {
  return data.map((d, i) => [
    i + 1,
    d.name || '—',
    d.code || d.dept_code || '—',
    d.hod_name || (d.hod ? `${d.hod.first_name || ''} ${d.hod.last_name || ''}`.trim() : '—'),
    d.hod_email || d.hod?.email || '—',
    d.faculty_count ?? d.faculty?.length ?? '—',
    d.student_count ?? d.students?.length ?? '—',
    d.description || '—',
  ]);
}

const _dept = makeDownloaders(() => DEPT_HEADERS, buildDeptRows, 'departments', 'Departments');
export const downloadDepartmentsCSV   = _dept.csv;
export const downloadDepartmentsExcel = _dept.excel;
export const downloadDepartmentsPDF   = _dept.pdf;

// ─── TIMETABLE ────────────────────────────────────────────────────────────────

const TIMETABLE_HEADERS = [
  '#', 'Day', 'Start Time', 'End Time', 'Course', 'Course Code',
  'Faculty', 'Room / Venue', 'Semester', 'Section',
];

function buildTimetableRows(data) {
  return data.map((t, i) => [
    i + 1,
    (t._day || t.day_of_week || t.day || '—').toUpperCase(),
    t._start || t.start_time || '—',
    t._end   || t.end_time   || '—',
    t._courseName || t.course?.name || t.course_name || '—',
    t._courseCode || t.course?.code || t.course_code || '—',
    t._facultyName || (t.faculty ? `${t.faculty.first_name || ''} ${t.faculty.last_name || ''}`.trim() : '—'),
    t._room || t.room_no || t.room || '—',
    t._semester || t.semester || '—',
    t.section || t.section_name || '—',
  ]);
}

const _tt = makeDownloaders(() => TIMETABLE_HEADERS, buildTimetableRows, 'timetable', 'Timetable');
export const downloadTimetableCSV   = _tt.csv;
export const downloadTimetableExcel = _tt.excel;
export const downloadTimetablePDF   = _tt.pdf;

// ─── EXAM SCHEDULE ────────────────────────────────────────────────────────────

const EXAMS_HEADERS = [
  '#', 'Subject', 'Code', 'Type', 'Date', 'Start Time', 'End Time',
  'Venue / Room', 'Department', 'Semester', 'Total Marks',
];

function buildExamsRows(data) {
  return data.map((e, i) => [
    i + 1,
    e.subject_name || e.course_name || e.course?.name || '—',
    e.subject_code || e.course_code || e.course?.code || '—',
    e.exam_type || e.type || '—',
    e.date || e.exam_date || '—',
    e.start_time || '—',
    e.end_time   || '—',
    e.venue || e.room || e.hall || '—',
    e.department_name || e.department?.name || '—',
    e.semester || e.semester_number || '—',
    e.total_marks || e.max_marks || '—',
  ]);
}

const _ex = makeDownloaders(() => EXAMS_HEADERS, buildExamsRows, 'exam_schedule', 'Exam Schedule');
export const downloadExamsCSV   = _ex.csv;
export const downloadExamsExcel = _ex.excel;
export const downloadExamsPDF   = _ex.pdf;

// ─── FEES / PAYMENTS ─────────────────────────────────────────────────────────

const FEES_HEADERS = [
  '#', 'Student Name', 'Enrollment No.', 'Fee Component', 'Department',
  'Total Amount', 'Amount Paid', 'Outstanding', 'Due Date', 'Status',
  'Payment Date', 'Payment Method', 'Transaction ID',
];

function buildFeesRows(data) {
  return data.map((p, i) => {
    const total       = parseFloat(p.amount || p.fee_structures?.amount || 0);
    const paid        = parseFloat(p.amount_paid || 0);
    const outstanding = total - paid;
    return [
      i + 1,
      p.student_name || (p.student ? `${p.student.first_name || ''} ${p.student.last_name || ''}`.trim() : '—'),
      p.enrollment_no || p.student?.enrollment_no || '—',
      p.component_name || p.fee_type || p.fee_structures?.component_name || '—',
      p.department_name || p.student?.department_name || '—',
      total       > 0 ? `₹${total.toLocaleString()}`       : '—',
      paid        > 0 ? `₹${paid.toLocaleString()}`        : '₹0',
      outstanding > 0 ? `₹${outstanding.toLocaleString()}` : '₹0',
      p.due_date  || p.fee_structures?.due_date || '—',
      (p.status || '—').toUpperCase(),
      p.payment_date || '—',
      p.payment_method || '—',
      p.transaction_id || '—',
    ];
  });
}

const _fees = makeDownloaders(() => FEES_HEADERS, buildFeesRows, 'fees', 'Fee Management');
export const downloadFeesCSV   = _fees.csv;
export const downloadFeesExcel = _fees.excel;
export const downloadFeesPDF   = _fees.pdf;


import { useState, useEffect, useMemo } from 'react';
import { API, SupaAPI, Utils } from '../../api/client.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

const EXAM_TYPES = [
  { value: 'endsem', label: 'End-Semester' },
  { value: 'midterm', label: 'Mid-Term' },
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
  { value: 'practical', label: 'Practical' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'viva', label: 'Viva' },
];

const emptyForm = () => ({
  course_id: '', exam_type: 'endsem', date: '', start_time: '10:00', end_time: '13:00',
  room: '', building: 'Main Campus', max_marks: 100, seats_per_room: 30,
});

export default function ExamScheduling() {
  const [exams, setExams] = useState([]);
  const [courses, setCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedSem, setSelectedSem] = useState('all');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [isCustomRoom, setIsCustomRoom] = useState(false);
  const [saving, setSaving] = useState(false);

  const [seatPlan, setSeatPlan] = useState(null);
  const [seatLoading, setSeatLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [ex, cs, depts, tt] = await Promise.all([
        SupaAPI.exams.all(),
        API.get('subjects').catch(() => API.get('courses')).catch(() => []),
        API.get('departments').catch(() => []),
        API.get('timetable').catch(() => []),
      ]);
      const deptArr = Array.isArray(depts) ? depts : [];
      setExams(Array.isArray(ex) ? ex : []);
      setCourses(Array.isArray(cs) ? cs : []);
      setDepartments(deptArr);
      setTimetable(Array.isArray(tt) ? tt : (tt.results || []));

      // Default selected department to Computer Engineering
      const ceDept = deptArr.find(d => 
        (d.code || '').toUpperCase() === 'CE' || 
        (d.name || '').toLowerCase().includes('computer')
      );
      if (ceDept) {
        setSelectedDept(ceDept.department_id || ceDept.id);
      } else if (deptArr.length > 0) {
        setSelectedDept(deptArr[0].department_id || deptArr[0].id);
      }
    } catch (e) {
      Toast.error('Failed to load exam schedule.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const defaultDeptId = useMemo(() => {
    const ce = departments.find(d => 
      (d.code || '').toUpperCase() === 'CE' || 
      (d.name || '').toLowerCase().includes('computer')
    );
    return ce ? (ce.department_id || ce.id) : (departments[0]?.department_id || departments[0]?.id || '');
  }, [departments]);

  const filteredExams = useMemo(() => {
    return exams.filter(e => {
      let matchDept = selectedDept === 'all';
      if (!matchDept) {
        const targetDept = departments.find(d => String(d.department_id || d.id) === String(selectedDept));
        const targetName = (targetDept?.name || '').toLowerCase();
        const targetCode = (targetDept?.code || '').toLowerCase();

        const matchId = e.department_id && String(e.department_id) === String(selectedDept);
        const matchName = e.department_name && (
          e.department_name.toLowerCase() === selectedDept.toLowerCase() ||
          (targetName && e.department_name.toLowerCase() === targetName)
        );
        const matchCode = e.department_code && targetCode && e.department_code.toLowerCase() === targetCode;
        matchDept = matchId || matchName || matchCode;
      }
      const matchType = selectedType === 'all' || (e.exam_type && e.exam_type.toLowerCase() === selectedType.toLowerCase());

      let matchSem = selectedSem === 'all';
      if (!matchSem) {
        let eSem = e.semester || e.semester_id || '';
        if (!eSem && e.course_code) {
          const m = e.course_code.match(/\d/);
          if (m) eSem = m[0];
        }
        matchSem = String(eSem) === String(selectedSem);
      }

      return matchDept && matchType && matchSem;
    });
  }, [exams, selectedDept, selectedType, selectedSem, departments]);

  // Department-specific rooms & halls calculation for selected course
  const deptInfo = useMemo(() => {
    const selectedCourse = courses.find(c => String(c.subject_id || c.id) === String(form.course_id));
    let deptCode = '';
    let deptName = '';

    if (selectedCourse) {
      const dept = departments.find(d => String(d.department_id || d.id) === String(selectedCourse.department_id));
      if (dept) {
        deptCode = (dept.code || '').toUpperCase();
        deptName = dept.name || '';
      }
      if (!deptCode && selectedCourse.code) {
        const match = selectedCourse.code.match(/^([A-Za-z]+)/);
        if (match) deptCode = match[1].toUpperCase();
      }
    }

    const prefix = deptCode || 'CE';

    const deptClassrooms = [
      { value: `${prefix}-101`, label: `${prefix}-101` },
      { value: `${prefix}-102`, label: `${prefix}-102` },
      { value: `${prefix}-103`, label: `${prefix}-103` },
      { value: `${prefix}-104`, label: `${prefix}-104` },
      { value: `${prefix}-201`, label: `${prefix}-201` },
      { value: `${prefix}-202`, label: `${prefix}-202` },
      { value: `${prefix}-203`, label: `${prefix}-203` },
      { value: `${prefix}-204`, label: `${prefix}-204` },
    ];

    const deptHalls = [
      { value: `${prefix}-HAL1`, label: `${prefix}-HAL1` },
      { value: `${prefix}-HAL2`, label: `${prefix}-HAL2` },
      { value: `${prefix}-HAL3`, label: `${prefix}-HAL3` },
      { value: `${prefix}-HAL4`, label: `${prefix}-HAL4` },
      { value: `${prefix}-HAL5`, label: `${prefix}-HAL5` },
      { value: `${prefix}-HAL6`, label: `${prefix}-HAL6` },
      { value: `${prefix}-HAL7`, label: `${prefix}-HAL7` },
      { value: `${prefix}-LAB1`, label: `${prefix}-LAB1` },
      { value: `${prefix}-LAB2`, label: `${prefix}-LAB2` },
      { value: `${prefix}-AUDI1`, label: `${prefix}-AUDI1` },
    ];

    const commonHalls = [
      { value: 'Exam Hall A', label: 'Exam Hall A' },
      { value: 'Exam Hall B', label: 'Exam Hall B' },
      { value: 'Exam Hall C', label: 'Exam Hall C' },
      { value: 'Central Auditorium', label: 'Central Auditorium' },
    ];

    const ttRooms = timetable
      .filter(t => !deptCode || (t.course_code || '').toUpperCase().startsWith(deptCode))
      .map(t => t.room_no || t.room)
      .filter(Boolean)
      .map(r => ({ value: r, label: `${r}` }));

    const allValues = [
      ...deptClassrooms.map(r => r.value),
      ...deptHalls.map(r => r.value),
      ...commonHalls.map(r => r.value),
      ...ttRooms.map(r => r.value),
    ];

    return {
      prefix,
      deptName,
      deptClassrooms,
      deptHalls,
      commonHalls,
      ttRooms,
      allValues,
    };
  }, [form.course_id, courses, departments, timetable]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setIsCustomRoom(false);
    setFormOpen(true);
  };
  const openEdit = (e) => {
    setEditing(e);
    setForm({
      course_id: e.course_id, exam_type: e.exam_type, date: e.date,
      start_time: e.start_time, end_time: e.end_time, room: e.room,
      building: e.building, max_marks: e.max_marks, seats_per_room: e.seats_per_room,
    });
    setIsCustomRoom(false);
    setFormOpen(true);
  };

  const save = async (ev) => {
    ev.preventDefault();
    if (!form.course_id || !form.date) { Toast.warning('Course and date are required.'); return; }
    try {
      setSaving(true);
      if (editing) await SupaAPI.exams.update(editing.id, form);
      else await SupaAPI.exams.create(form);
      Toast.success(`Exam ${editing ? 'updated' : 'scheduled'}.`);
      setFormOpen(false);
      load();
    } catch {
      Toast.error('Failed to save exam.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e) => {
    if (!window.confirm(`Delete the ${e.exam_type} exam for ${e.course_code}?`)) return;
    try {
      await SupaAPI.exams.remove(e.id);
      setExams(prev => prev.filter(x => x.id !== e.id));
      Toast.success('Exam removed.');
    } catch { Toast.error('Failed to delete.'); }
  };

  const openSeatPlan = async (e) => {
    try {
      setSeatLoading(true);
      setSeatPlan({ loading: true, exam: e });
      const plan = await SupaAPI.exams.seatPlan(e.id);
      setSeatPlan(plan);
    } catch {
      Toast.error('Failed to build seat plan.');
      setSeatPlan(null);
    } finally {
      setSeatLoading(false);
    }
  };

  // Detect clashes: same room + date + overlapping time.
  const clashIds = new Set();
  for (let a = 0; a < filteredExams.length; a++) {
    for (let b = a + 1; b < filteredExams.length; b++) {
      const x = filteredExams[a], y = filteredExams[b];
      if (x.date === y.date && x.room && x.room === y.room &&
          x.start_time < y.end_time && y.start_time < x.end_time) {
        clashIds.add(x.id); clashIds.add(y.id);
      }
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left"><h1><i className="bi bi-calendar-week"></i> Examination Scheduling</h1><p>Create the exam timetable and generate seat plans.</p></div>
        <div className="page-header-right"><button className="btn btn-primary" onClick={openCreate}><i className="bi bi-plus-lg"></i> Schedule Exam</button></div>
      </div>

      {/* ── Sleek Filter Bar ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(26, 31, 55, 0.85) 0%, rgba(19, 23, 46, 0.85) 100%)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(108, 99, 255, 0.25)',
        borderRadius: '14px',
        padding: '12px 18px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6C63FF', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.5px' }}>
            <i className="bi bi-funnel-fill" style={{ fontSize: '1.05rem' }}></i>
            <span>FILTERS</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bi bi-building" style={{ color: 'var(--primary-light)' }}></i> Department:
            </span>
            <select
              className="form-control"
              style={{
                width: '240px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(108, 99, 255, 0.35)',
                borderRadius: '10px',
                color: 'var(--text-main)',
                fontWeight: 600,
                fontSize: '0.85rem',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              {departments.map(d => (
                <option key={d.department_id || d.id} value={d.department_id || d.id} style={{ background: '#1a1f37', color: '#fff' }}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bi bi-layers" style={{ color: 'var(--primary-light)' }}></i> Semester:
            </span>
            <select
              className="form-control"
              style={{
                width: '160px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(108, 99, 255, 0.35)',
                borderRadius: '10px',
                color: 'var(--text-main)',
                fontWeight: 600,
                fontSize: '0.85rem',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
            >
              <option value="all" style={{ background: '#1a1f37', color: '#fff' }}>All Semesters</option>
              <option value="1" style={{ background: '#1a1f37', color: '#fff' }}>Semester 1</option>
              <option value="2" style={{ background: '#1a1f37', color: '#fff' }}>Semester 2</option>
              <option value="3" style={{ background: '#1a1f37', color: '#fff' }}>Semester 3</option>
              <option value="4" style={{ background: '#1a1f37', color: '#fff' }}>Semester 4</option>
              <option value="5" style={{ background: '#1a1f37', color: '#fff' }}>Semester 5</option>
              <option value="6" style={{ background: '#1a1f37', color: '#fff' }}>Semester 6</option>
              <option value="7" style={{ background: '#1a1f37', color: '#fff' }}>Semester 7</option>
              <option value="8" style={{ background: '#1a1f37', color: '#fff' }}>Semester 8</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bi bi-journal-check" style={{ color: 'var(--primary-light)' }}></i> Exam Type:
            </span>
            <select
              className="form-control"
              style={{
                width: '180px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(108, 99, 255, 0.35)',
                borderRadius: '10px',
                color: 'var(--text-main)',
                fontWeight: 600,
                fontSize: '0.85rem',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="all" style={{ background: '#1a1f37', color: '#fff' }}>All Exam Types</option>
              <option value="endsem" style={{ background: '#1a1f37', color: '#fff' }}>End-Semester</option>
              <option value="midterm" style={{ background: '#1a1f37', color: '#fff' }}>Mid-Term</option>
              <option value="internal" style={{ background: '#1a1f37', color: '#fff' }}>Internal</option>
              <option value="external" style={{ background: '#1a1f37', color: '#fff' }}>External</option>
              <option value="practical" style={{ background: '#1a1f37', color: '#fff' }}>Practical</option>
              <option value="quiz" style={{ background: '#1a1f37', color: '#fff' }}>Quiz</option>
              <option value="viva" style={{ background: '#1a1f37', color: '#fff' }}>Viva</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="badge badge-info" style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '8px', background: 'rgba(108, 99, 255, 0.2)', border: '1px solid rgba(108, 99, 255, 0.4)', color: 'var(--primary-light)' }}>
            {filteredExams.length} {filteredExams.length === 1 ? 'Exam' : 'Exams'}
          </span>

          {(selectedDept !== defaultDeptId || selectedType !== 'all' || selectedSem !== 'all') && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ borderRadius: '8px', color: 'var(--primary-light)', borderColor: 'rgba(108, 99, 255, 0.4)', fontSize: '0.8rem' }}
              onClick={() => { if (defaultDeptId) setSelectedDept(defaultDeptId); setSelectedType('all'); setSelectedSem('all'); }}
            >
              <i className="bi bi-arrow-counterclockwise me-1"></i> Reset
            </button>
          )}
        </div>
      </div>

      {clashIds.size > 0 && (
        <div className="card col-12" style={{ marginBottom: '16px', borderLeft: '3px solid var(--accent, #FF6B6B)' }}>
          <div className="card-body" style={{ fontSize: '0.85rem' }}>
            <i className="bi bi-exclamation-triangle"></i> <strong>{clashIds.size} exam(s)</strong> share a room at overlapping times — highlighted below.
          </div>
        </div>
      )}

      <div className="card col-12">
        <div className="card-body" style={{ padding: 0 }}>
          {filteredExams.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '14px 16px' }}>Date</th>
                    <th style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '14px 16px' }}>Time</th>
                    <th style={{ verticalAlign: 'middle', padding: '14px 16px' }}>Course</th>
                    <th style={{ verticalAlign: 'middle', padding: '14px 16px' }}>Department</th>
                    <th style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '14px 16px' }}>Type</th>
                    <th style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '14px 16px' }}>Room</th>
                    <th style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '14px 16px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.map(e => (
                    <tr key={e.id} style={clashIds.has(e.id) ? { background: 'rgba(255,107,107,0.08)' } : undefined}>
                      <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '12px 16px' }}>{Utils.formatDate(e.date)}</td>
                      <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', padding: '12px 16px' }}>{e.start_time} – {e.end_time}</td>
                      <td style={{ verticalAlign: 'middle', padding: '12px 16px' }}>
                        <strong>{e.course_code}</strong> · {e.course_name}
                      </td>
                      <td style={{ verticalAlign: 'middle', padding: '12px 16px' }}>
                        <span className="badge badge-info" style={{ display: 'inline-block', padding: '5px 10px', fontSize: '0.75rem', lineHeight: '1.3', whiteSpace: 'nowrap' }}>
                          {e.department_name || 'General'}
                        </span>
                      </td>
                      <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', textTransform: 'capitalize', padding: '12px 16px' }}>
                        {e.exam_type}
                      </td>
                      <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '12px 16px' }}>
                        {e.room || '—'} {clashIds.has(e.id) && <span className="badge badge-danger" style={{ marginLeft: 6 }}>clash</span>}
                      </td>
                      <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openSeatPlan(e)}><i className="bi bi-grid-3x3-gap"></i> Seats</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}><i className="bi bi-pencil"></i></button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent, #FF6B6B)' }} onClick={() => remove(e)}><i className="bi bi-trash"></i></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
              <div className="empty-state-icon"><i className="bi bi-calendar-week"></i></div><h3>No exams scheduled</h3>
              <button className="btn btn-primary" onClick={openCreate} style={{ marginTop: '12px' }}>Schedule your first exam</button>
            </div>
          )}
        </div>
      </div>

      {/* Create / edit modal */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? <><i className="bi bi-pencil-square me-2"></i>Edit Exam</> : <><i className="bi bi-plus-circle me-2"></i>Schedule Exam</>}>
        <form onSubmit={save}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Course *</label>
            <select className="form-control" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })} required>
              <option value="">Select course…</option>
              {courses.map(c => <option key={c.subject_id || c.id} value={c.subject_id || c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group">
              <label className="form-label">Exam Type</label>
              <select className="form-control" value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })}>
                {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input type="date" className="form-control" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <input type="time" className="form-control" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">End Time</label>
              <input type="time" className="form-control" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Room / Hall</span>
                {deptInfo.prefix && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--primary-light)', fontWeight: 500 }}>
                    {deptInfo.prefix} Dept Classes & Halls
                  </span>
                )}
              </label>
              {isCustomRoom ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    className="form-control"
                    value={form.room}
                    onChange={(e) => setForm({ ...form, room: e.target.value })}
                    placeholder="Enter custom room name…"
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setIsCustomRoom(false); }}
                    title="Switch to dropdown list"
                  >
                    <i className="bi bi-list-task"></i>
                  </button>
                </div>
              ) : (
                <select
                  className="form-control"
                  value={form.room || ''}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsCustomRoom(true);
                      setForm({ ...form, room: '' });
                    } else {
                      setForm({ ...form, room: e.target.value });
                    }
                  }}
                  required
                >
                  <option value="">Select available class / hall…</option>
                  <optgroup label={`${deptInfo.prefix} Department Classrooms`}>
                    {deptInfo.deptClassrooms.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label={`${deptInfo.prefix} Department Exam Halls`}>
                    {deptInfo.deptHalls.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Central Exam Halls">
                    {deptInfo.commonHalls.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                  {deptInfo.ttRooms.length > 0 && (
                    <optgroup label="Timetable Assigned Classrooms">
                      {deptInfo.ttRooms.map((r, idx) => (
                        <option key={`tt_${idx}_${r.value}`} value={r.value}>{r.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {form.room && !deptInfo.allValues.includes(form.room) && (
                    <option value={form.room}>{form.room} (Assigned)</option>
                  )}
                  <option value="__custom__">➕ Enter Other / Custom Room…</option>
                </select>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Seats / Room</label>
              <input type="number" className="form-control" value={form.seats_per_room} onChange={(e) => setForm({ ...form, seats_per_room: e.target.value })} />
            </div>
          </div>
          <div className="modal-footer" style={{ padding: 0, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Schedule'}</button>
          </div>
        </form>
      </Modal>

      {/* Seat plan modal */}
      <Modal isOpen={!!seatPlan} onClose={() => setSeatPlan(null)} title={<><i className="bi bi-grid-3x3-gap me-2"></i>Seat Plan</>}>
        {seatLoading || seatPlan?.loading ? (
          <div style={{ textAlign: 'center', padding: '30px' }}><div className="loading-spinner" /></div>
        ) : seatPlan ? (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {seatPlan.exam?.course_code} · {Utils.formatDate(seatPlan.exam?.date)} · {seatPlan.total_students} students across {seatPlan.rooms} room(s)
            </p>
            {seatPlan.seats?.length ? (
              <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Seat</th><th>Room</th><th>Enrollment</th><th>Student</th></tr></thead>
                  <tbody>
                    {seatPlan.seats.map(s => (
                      <tr key={s.seat}>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>#{s.seat_in_room}</td>
                        <td>{s.room}</td>
                        <td>{s.enrollment_no}</td>
                        <td>{s.student_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p style={{ color: 'var(--text-muted)' }}>No enrolled students to seat.</p>}
          </>
        ) : null}
      </Modal>
    </>
  );
}

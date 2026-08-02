import { useState, useEffect, useMemo } from 'react';
import { API } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';
import DownloadDropdown from '../../components/DownloadDropdown.jsx';
import { downloadTimetableCSV, downloadTimetableExcel, downloadTimetablePDF } from '../../course_utilities/dataExport.js';

// ── Timetable helpers (shared by the grid and the clash detector) ──
const DAY_CANON = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };
const canonDay = (d) => DAY_CANON[(d || '').toLowerCase().slice(0, 3)] || (d || '').toLowerCase();

/** Normalise a raw timetable slot into a flat, predictable shape. */
const normalizeSlot = (r) => {
  let sem = r.semester || r.semester_id || r.course?.semester || r.course?.semester_id || '';
  if (!sem && (r.course_code || r.course?.code)) {
    const code = r.course_code || r.course?.code;
    const match = code.match(/\d/);
    if (match) sem = match[0];
  }
  return {
    ...r,
    _day: canonDay(r.day_of_week || r.day),
    _start: (r.start_time || '').slice(0, 5),
    _end: (r.end_time || '').slice(0, 5),
    _room: (r.room_no || r.room || '').trim(),
    _facultyId: r.faculty_id ? String(r.faculty_id) : '',
    _facultyName: r.faculty ? `${r.faculty.first_name || ''} ${r.faculty.last_name || ''}`.trim() : '',
    _courseCode: r.course?.code || r.course_code || '',
    _courseName: r.course?.name || r.course_name || '',
    _semester: String(sem),
  };
};

/** Two slots overlap in time if each starts before the other ends. */
const timeOverlaps = (a, b) => a._start && b._start && a._start < b._end && b._start < a._end;

/**
 * Detect room / faculty double-bookings across a set of slots.
 * Returns { conflicts: [{a, b, reasons}], slotIds: Set }.
 */
const detectConflicts = (slots) => {
  const conflicts = [];
  const slotIds = new Set();
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (a._day !== b._day || !a._day || !timeOverlaps(a, b)) continue;
      const reasons = [];
      const room = a._room.toUpperCase();
      if (room && room !== 'TBA' && room === b._room.toUpperCase()) reasons.push('room');
      if (a._facultyId && a._facultyId === b._facultyId) reasons.push('faculty');
      if (reasons.length) {
        conflicts.push({ a, b, reasons });
        slotIds.add(a.timetable_id); slotIds.add(b.timetable_id);
      }
    }
  }
  return { conflicts, slotIds };
};

export default function TimetableManagement() {
  const { user } = useAuthStore();
  const [timetable, setTimetable] = useState([]);   // normalized slots
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');
  const [selectedSemesterFilter, setSelectedSemesterFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [deptId, setDeptId] = useState('');
  const [dlOpen, setDlOpen] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [clashOpen, setClashOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('MON');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [roomNo, setRoomNo] = useState('');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayColors = {
    monday: '#6C63FF', tuesday: '#00D4AA', wednesday: '#FF9F43',
    thursday: '#54A0FF', friday: '#FF6B6B', saturday: '#C084FC'
  };
  const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const hexToRgb = (hex) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : '108,99,255';
  };

  const loadData = async () => {
    try {
      setLoading(true);
      let currentDeptId = '';
      try {
        const hodInfo = await API.get('hod/check');
        if (hodInfo && hodInfo.isHod) {
          currentDeptId = hodInfo.hod?.department_id || hodInfo.department_id || '';
          setDeptId(currentDeptId);
          setSelectedDeptFilter(String(currentDeptId));
        }
      } catch (_) {}

      const [scheduleData, facData, coursesData, sectionsData, deptsData] = await Promise.all([
        API.get('timetable').catch(() => []),
        API.get('faculty').catch(() => []),
        API.get('courses').catch(() => []),
        API.get('class_sections').catch(() => []),
        API.get('departments').catch(() => []),
      ]);

      const rawSchedule = Array.isArray(scheduleData) ? scheduleData : [];
      const validDepts = Array.isArray(deptsData) ? deptsData : [];

      setTimetable(rawSchedule.map(normalizeSlot));
      setFaculty(facData || []);
      setSubjects(coursesData || []);
      setSections(sectionsData || []);
      setDepartments(validDepts);

      if (!currentDeptId && validDepts.length > 0 && selectedDeptFilter === 'all') {
        const ceDept = validDepts.find(d => 
          (d.code || '').toUpperCase() === 'CE' || 
          (d.name || '').toLowerCase().includes('computer')
        );
        const defaultDept = ceDept ? (ceDept.department_id || ceDept.id) : (validDepts[0].department_id || validDepts[0].id);
        if (defaultDept) setSelectedDeptFilter(String(defaultDept));
      }
    } catch (e) {
      console.error('Error loading timetable:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  const filteredTimetable = useMemo(() => {
    const activeDeptId = (selectedDeptFilter && selectedDeptFilter !== 'all') ? selectedDeptFilter : (deptId || '');
    return timetable.filter(s => {
      let matchDept = !activeDeptId;
      if (!matchDept) {
        const dId = s.department_id || s.course?.department_id || s.faculty?.department_id;
        const targetDept = departments.find(d => String(d.department_id || d.id) === String(activeDeptId));
        const targetName = (targetDept?.name || '').toLowerCase();
        const targetCode = (targetDept?.code || '').toLowerCase();

        const matchId = dId && String(dId).toLowerCase() === String(activeDeptId).toLowerCase();
        const matchName = s.department_name && (
          s.department_name.toLowerCase() === activeDeptId.toLowerCase() ||
          (targetName && s.department_name.toLowerCase() === targetName)
        );
        const courseCode = (s.course_code || s.subject_code || s._courseCode || '').toLowerCase();
        const matchCode = targetCode && courseCode && (
          courseCode.startsWith(targetCode) || 
          (targetCode === 'ce' && courseCode.startsWith('ce')) ||
          (targetCode === 'cv' && (courseCode.startsWith('cv') || courseCode.startsWith('civil')))
        );
        matchDept = matchId || matchName || matchCode;
      }

      let matchSem = selectedSemesterFilter === 'all' || !selectedSemesterFilter;
      if (!matchSem) {
        matchSem = String(s._semester) === String(selectedSemesterFilter);
      }

      return matchDept && matchSem;
    });
  }, [timetable, deptId, selectedDeptFilter, selectedSemesterFilter, departments]);

  // Clash detection over the currently loaded timetable.
  const { conflicts, slotIds: conflictIds } = useMemo(() => detectConflicts(filteredTimetable), [filteredTimetable]);

  // Filter faculty and subjects for Add/Edit modal based on selected department filter
  const modalFaculty = useMemo(() => {
    if (!selectedDeptFilter || selectedDeptFilter === 'all') return faculty;
    return faculty.filter(f => !f.department_id || String(f.department_id) === String(selectedDeptFilter));
  }, [faculty, selectedDeptFilter]);

  const modalSubjects = useMemo(() => {
    if (!selectedDeptFilter || selectedDeptFilter === 'all') return subjects;
    return subjects.filter(c => !c.department_id || String(c.department_id) === String(selectedDeptFilter));
  }, [subjects, selectedDeptFilter]);

  // Live pre-save check: would the slot in the form clash with an existing one?
  const liveClash = useMemo(() => {
    if (!isOpen) return [];
    const facName = faculty.find(f => String(f.faculty_id || f.id) === String(selectedFaculty));
    const draft = normalizeSlot({
      timetable_id: selectedSlot?.timetable_id || '__draft__',
      day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, room_no: roomNo,
      faculty_id: selectedFaculty,
      faculty: facName ? { first_name: facName.first_name, last_name: facName.last_name } : null,
    });
    const others = timetable.filter(s => s.timetable_id !== selectedSlot?.timetable_id);
    return detectConflicts([draft, ...others]).conflicts.filter(c => c.a.timetable_id === '__draft__' || c.b.timetable_id === '__draft__');
  }, [isOpen, dayOfWeek, startTime, endTime, roomNo, selectedFaculty, timetable, selectedSlot, faculty]);

  const handleOpenAdd = () => {
    const defaultSubj = modalSubjects[0]?.subject_id || modalSubjects[0]?.id || subjects[0]?.subject_id || subjects[0]?.id || '';
    const defaultFac = modalFaculty[0]?.faculty_id || modalFaculty[0]?.id || faculty[0]?.faculty_id || faculty[0]?.id || '';
    setSelectedSlot(null);
    setSelectedSubject(defaultSubj);
    setSelectedFaculty(defaultFac);
    setSelectedSection(sections[0]?.section_id || sections[0]?.id || '');
    setDayOfWeek('MON'); setStartTime('09:00'); setEndTime('10:00'); setRoomNo('');
    setIsOpen(true);
  };

  const handleOpenEdit = (slot) => {
    setSelectedSlot(slot);
    setSelectedSubject(slot.subject_id || '');
    setSelectedFaculty(slot.faculty_id || '');
    setSelectedSection(slot.class_section_id || '');
    setDayOfWeek((slot.day_of_week || 'MON').slice(0, 3).toUpperCase());
    setStartTime(slot._start || '09:00');
    setEndTime(slot._end || '10:00');
    setRoomNo(slot._room || '');
    setIsOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFaculty || !selectedSubject || !roomNo) {
      Toast.warning('Please fill in subject, faculty and room.');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        class_section_id: selectedSection,
        subject_id: selectedSubject,
        faculty_id: selectedFaculty,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        room_no: roomNo,
        academic_year: '2025-26',
        is_active: true,
      };
      if (selectedSlot) {
        await API.patch(`timetable?timetable_id=eq.${selectedSlot.timetable_id}`, payload);
        Toast.success('Timetable slot updated.');
      } else {
        await API.post('timetable', payload);
        Toast.success('Timetable slot created.');
      }
      setIsOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to save timetable slot.');
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSlot) return;
    if (!window.confirm('Are you sure you want to delete this timetable slot?')) return;
    try {
      setLoading(true);
      await API.delete(`timetable?timetable_id=eq.${selectedSlot.timetable_id}`);
      Toast.success('Timetable slot deleted.');
      setIsOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to delete slot.');
      setLoading(false);
    }
  };

  // Group normalized slots by day for the grid.
  const byDay = {};
  days.forEach(d => byDay[d.toLowerCase()] = []);
  filteredTimetable.forEach(s => { if (byDay[s._day]) byDay[s._day].push(s); });

  const reasonLabel = (r) => (r === 'room' ? 'Room' : 'Faculty');

  if (loading && !timetable.length) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><div className="loading-spinner" /></div>;
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1><i className="bi bi-calendar-week"></i> Timetable Management</h1>
          <p>Schedule weekly subject lectures, assign classrooms, and organize faculty schedules.</p>
          <div className="today-badge"><i className="bi bi-star-fill"></i> Today is {todayName}</div>
        </div>
        <div className="page-header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <DownloadDropdown
            open={dlOpen} setOpen={setDlOpen}
            onCSV={() => { setDlOpen(false); downloadTimetableCSV(filteredTimetable, Toast); }}
            onExcel={() => { setDlOpen(false); downloadTimetableExcel(filteredTimetable, Toast); }}
            onPDF={async () => { setDlOpen(false); await downloadTimetablePDF(filteredTimetable, Toast); }}
          />
          <button
            className={`btn ${conflicts.length ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setClashOpen(true)}
            title="Detect room & faculty double-bookings"
          >
            {conflicts.length ? <><i className="bi bi-exclamation-octagon me-1"></i>{conflicts.length} Clash{conflicts.length > 1 ? 'es' : ''}</> : <><i className="bi bi-check-circle me-1"></i>No Clashes</>}
          </button>
          <button className="btn btn-primary" onClick={handleOpenAdd}><i className="bi bi-plus-lg"></i> Add Slot</button>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px',
        padding: '12px 18px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {/* Department Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(108, 99, 255, 0.15)',
              color: 'var(--primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.9rem'
            }}>
              <i className="bi bi-building"></i>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Department:</span>
            <select
              className="form-control"
              style={{
                minWidth: '220px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '0.875rem',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer'
              }}
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
            >
              {departments.map(d => (
                <option key={d.department_id || d.id} value={d.department_id || d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Semester Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(0, 212, 170, 0.15)',
              color: '#00D4AA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.9rem'
            }}>
              <i className="bi bi-layers"></i>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Semester:</span>
            <select
              className="form-control"
              style={{
                minWidth: '160px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '0.875rem',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer'
              }}
              value={selectedSemesterFilter}
              onChange={(e) => setSelectedSemesterFilter(e.target.value)}
            >
              <option value="all">All Semesters</option>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
              <option value="3">Semester 3</option>
              <option value="4">Semester 4</option>
              <option value="5">Semester 5</option>
              <option value="6">Semester 6</option>
              <option value="7">Semester 7</option>
              <option value="8">Semester 8</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="badge badge-info" style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '8px' }}>
            {filteredTimetable.length} {filteredTimetable.length === 1 ? 'Slot' : 'Slots'}
          </span>

          {selectedSemesterFilter !== 'all' && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ borderRadius: '8px', color: 'var(--primary-light)', borderColor: 'rgba(108, 99, 255, 0.4)', fontSize: '0.8rem' }}
              onClick={() => setSelectedSemesterFilter('all')}
            >
              <i className="bi bi-arrow-counterclockwise me-1"></i> Reset Semester
            </button>
          )}
        </div>
      </div>

      {/* Clash banner */}
      {conflicts.length > 0 && (
        <div className="card col-12" style={{ marginBottom: '16px', borderLeft: '4px solid #FF6B6B' }}>
          <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '0.88rem' }}>
            <span><i className="bi bi-exclamation-triangle"></i> <strong>{conflicts.length} scheduling conflict{conflicts.length > 1 ? 's' : ''}</strong> detected — clashing lectures are outlined in red on the grid.</span>
            <button className="btn btn-danger btn-sm" onClick={() => setClashOpen(true)}>Review conflicts →</button>
          </div>
        </div>
      )}

      <div className="card col-12">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="grid-wrapper">
            <div className="weekly-grid" id="weeklyGrid">
              <div className="wg-corner"></div>
              {days.map((d, idx) => {
                const key = d.toLowerCase();
                const isToday = d === todayName;
                return (
                  <div key={idx} className={`wg-header ${isToday ? 'is-today-col' : ''}`} style={{ color: dayColors[key] }}>
                    {isToday ? '⭐ ' : ''}{d.substring(0, 3).toUpperCase()}
                  </div>
                );
              })}

              {timeSlots.slice(0, -1).map((slotStart, timeIdx) => {
                const slotEnd = timeSlots[timeIdx + 1];
                return (
                  <span key={timeIdx} style={{ display: 'contents' }}>
                    <div className="wg-time">{slotStart}<br />{slotEnd}</div>
                    {days.map((d, dayIdx) => {
                      const dayKey = d.toLowerCase();
                      const color = dayColors[dayKey];
                      const rgb = hexToRgb(color);
                      const isToday = d === todayName;
                      const match = byDay[dayKey]?.find(s => s._start === slotStart);

                      if (match) {
                        const clash = conflictIds.has(match.timetable_id);
                        return (
                          <div key={dayIdx} className={`wg-cell filled ${isToday ? 'is-today-col' : ''}`} onClick={() => handleOpenEdit(match)} style={{ cursor: 'pointer' }}>
                            <div className="wg-cell-inner" style={{
                              background: clash ? 'rgba(255,107,107,0.16)' : `rgba(${rgb}, 0.18)`,
                              border: clash ? '2px solid #FF6B6B' : `1px solid rgba(${rgb}, 0.35)`,
                              boxShadow: clash ? '0 0 0 2px rgba(255,107,107,0.25)' : 'none',
                            }}>
                              {clash && <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#FF6B6B' }}><i className="bi bi-exclamation-octagon-fill"></i> CLASH</div>}
                              <div className="wg-code" style={{ color: clash ? '#FF6B6B' : color }}>{match._courseCode}</div>
                              <div className="wg-cname">{match._courseName}</div>
                              {match._room && <div className="wg-room"><i className="bi bi-geo-alt"></i> {match._room}</div>}
                              {match._facultyName && <div className="wg-faculty" style={{ fontSize: '0.75rem', marginTop: '2px', opacity: 0.8 }}><i className="bi bi-person-video3"></i> {match._facultyName}</div>}
                            </div>
                          </div>
                        );
                      }
                      return <div key={dayIdx} className={`wg-cell ${isToday ? 'is-today-col' : ''}`}></div>;
                    })}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Clash detection wizard ── */}
      <Modal isOpen={clashOpen} onClose={() => setClashOpen(false)} title={<><i className="bi bi-exclamation-octagon me-2"></i>Clash Detection</>}>
        {conflicts.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px', textAlign: 'center' }}>
            <div className="empty-state-icon"><i className="bi bi-check-circle-fill"></i></div>
            <h3>No conflicts found</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No two lectures share a room or faculty member at overlapping times.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              {conflicts.length} overlapping-schedule conflict{conflicts.length > 1 ? 's' : ''} found. Edit either lecture to resolve it.
            </p>
            <div style={{ display: 'grid', gap: '12px', maxHeight: '55vh', overflowY: 'auto' }}>
              {conflicts.map((c, i) => (
                <div key={i} style={{ border: '1px solid #FF6B6B', borderRadius: '10px', padding: '12px 14px', background: 'rgba(255,107,107,0.06)' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span className="badge badge-danger" style={{ textTransform: 'capitalize' }}>{c.a._day}</span>
                    <span className="badge badge-warning">{c.a._start}–{c.a._end} ∩ {c.b._start}–{c.b._end}</span>
                    {c.reasons.map(r => <span key={r} className="badge badge-danger">{reasonLabel(r)} conflict</span>)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '8px' }}>
                    {[c.a, c.b].map((s, k) => (
                      <span key={k} style={{ display: 'contents' }}>
                        {k === 1 && <span style={{ color: '#FF6B6B', fontWeight: 700 }}><i className="bi bi-arrow-left-right"></i></span>}
                        <button
                          onClick={() => { setClashOpen(false); handleOpenEdit(s); }}
                          style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer' }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{s._courseCode} · {s._courseName}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}><i className="bi bi-geo-alt"></i> {s._room || 'TBA'} · <i className="bi bi-person-video3"></i> {s._facultyName || '—'}</div>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* ── Add / edit slot modal ── */}
      {isOpen && (
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={selectedSlot ? <><i className="bi bi-pencil-square me-2"></i>Edit Timetable Slot</> : <><i className="bi bi-plus-circle me-2"></i>Add Timetable Slot</>}>
          <form onSubmit={handleSubmit}>
            {liveClash.length > 0 && (
              <div style={{ border: '1px solid #FF6B6B', background: 'rgba(255,107,107,0.08)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '0.82rem' }}>
                <i className="bi bi-exclamation-octagon-fill"></i> <strong>Clash warning:</strong> this slot overlaps with{' '}
                {liveClash.map((c, i) => {
                  const other = c.a.timetable_id === '__draft__' ? c.b : c.a;
                  return <span key={i}>{i > 0 && ', '}<strong>{other._courseCode}</strong> ({c.reasons.map(reasonLabel).join(' & ')})</span>;
                })}
                . You can still save, but please double-check.
              </div>
            )}
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Course Subject *</label>
              <select className="form-input" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                {subjects.map(s => <option key={s.subject_id || s.id} value={s.subject_id || s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Assign Faculty *</label>
                <select className="form-input" value={selectedFaculty} onChange={e => setSelectedFaculty(e.target.value)}>
                  {faculty.map(f => <option key={f.faculty_id || f.id} value={f.faculty_id || f.id}>{f.first_name} {f.last_name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Room Number *</label>
                <input type="text" className="form-input" required placeholder="e.g. CSE-102" value={roomNo} onChange={e => setRoomNo(e.target.value)} />
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Day of Week</label>
                <select className="form-input" value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
                  <option value="MON">Monday</option><option value="TUE">Tuesday</option>
                  <option value="WED">Wednesday</option><option value="THU">Thursday</option>
                  <option value="FRI">Friday</option><option value="SAT">Saturday</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Start Time</label>
                <input type="time" className="form-input" required value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">End Time</label>
                <input type="time" className="form-input" required value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {selectedSlot
                ? <button type="button" className="btn btn-ghost" style={{ color: '#FF6B6B' }} onClick={handleDelete}><i className="bi bi-trash"></i> Delete Slot</button>
                : <div></div>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>Save Slot</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

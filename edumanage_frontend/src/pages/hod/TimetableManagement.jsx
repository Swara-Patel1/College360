import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';
import Modal from '../../components/Modal.jsx';

export default function TimetableManagement() {
  const { user } = useAuthStore();
  const [timetable, setTimetable] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deptId, setDeptId] = useState('');

  // Add/Edit Modal State
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  
  // Form Fields
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('MON');
  const [startTime, setStartTime] = useState('09:00:00');
  const [endTime, setEndTime] = useState('10:00:00');
  const [roomNo, setRoomNo] = useState('');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayColors = {
    monday: '#6C63FF', tuesday: '#00D4AA', wednesday: '#FF9F43',
    thursday: '#54A0FF', friday: '#FF6B6B', saturday: '#C084FC'
  };

  const timeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00'
  ];

  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const hexToRgb = (hex) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : '108,99,255';
  };

  const loadData = async () => {
    try {
      setLoading(true);

      // 1. Get HOD info
      const hodInfo = await API.get('hod/check');
      let currentDeptId = '';
      if (hodInfo && hodInfo.isHod) {
        currentDeptId = hodInfo.hod.department_id;
        setDeptId(currentDeptId);
      }

      // 2. Fetch timetable slots, subjects, sections, faculty
      const [scheduleData, facData, coursesData, sectionsData] = await Promise.all([
        API.get('timetable'),
        API.get('faculty'),
        API.get('courses'),
        API.get(`class_sections?department_id=eq.${currentDeptId}`)
      ]);

      // Filter timetable slots by HOD department
      const deptSchedule = (scheduleData || []).filter(
        item => item.course?.department_id === currentDeptId
      );

      const deptFaculty = (facData || []).filter(f => f.department_id === currentDeptId);
      const deptSubjects = (coursesData || []).filter(c => c.department_id === currentDeptId);

      setTimetable(deptSchedule);
      setFaculty(deptFaculty);
      setSubjects(deptSubjects);
      setSections(sectionsData || []);
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load timetable data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleOpenAdd = () => {
    setSelectedSlot(null);
    setSelectedSubject(subjects[0]?.subject_id || subjects[0]?.id || '');
    setSelectedFaculty(faculty[0]?.faculty_id || faculty[0]?.id || '');
    setSelectedSection(sections[0]?.section_id || sections[0]?.id || '');
    setDayOfWeek('MON');
    setStartTime('09:00:00');
    setEndTime('10:00:00');
    setRoomNo('');
    setIsOpen(true);
  };

  const handleOpenEdit = (slot) => {
    setSelectedSlot(slot);
    setSelectedSubject(slot.subject_id || slot.id || '');
    setSelectedFaculty(slot.faculty_id || slot.id || '');
    setSelectedSection(slot.class_section_id || slot.id || '');
    setDayOfWeek(slot.day_of_week || 'MON');
    setStartTime(slot.start_time || '09:00:00');
    setEndTime(slot.end_time || '10:00:00');
    setRoomNo(slot.room_no || slot.room || '');
    setIsOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFaculty || !selectedSubject || !selectedSection || !roomNo) {
      Toast.warning('Please fill in all fields.');
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
        is_active: true
      };

      if (selectedSlot) {
        // Edit Slot
        await API.patch(`timetable?timetable_id=eq.${selectedSlot.timetable_id}`, payload);
        Toast.success('Timetable slot updated.');
      } else {
        // Add Slot
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

  // Group schedules by day lookup
  const byDay = {};
  days.forEach(d => byDay[d.toLowerCase()] = []);
  timetable.forEach(s => {
    const dayKey = s.day?.toLowerCase();
    if (byDay[dayKey]) byDay[dayKey].push(s);
  });

  if (loading && !timetable.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>🗓️ Timetable Management</h1>
          <p>Schedule weekly subject lectures, assign classrooms, and organize faculty schedules.</p>
          <div className="today-badge">⭐ Today is {todayName}</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            ➕ Edit Timetable
          </button>
        </div>
      </div>

      <div className="card col-12">
        <div className="card-body" style={{ padding: 0 }}>
          <div className="grid-wrapper">
            <div className="weekly-grid" id="weeklyGrid">
              
              {/* Corner item */}
              <div className="wg-corner"></div>
              
              {/* Days Headers */}
              {days.map((d, idx) => {
                const key = d.toLowerCase();
                const color = dayColors[key];
                const isToday = d === todayName;
                return (
                  <div 
                    key={idx} 
                    className={`wg-header ${isToday ? 'is-today-col' : ''}`} 
                    style={{ color }}
                  >
                    {isToday ? '⭐ ' : ''}{d.substring(0, 3).toUpperCase()}
                  </div>
                );
              })}

              {/* Time Slots & cells */}
              {timeSlots.slice(0, -1).map((slotStart, timeIdx) => {
                const slotEnd = timeSlots[timeIdx + 1];
                return (
                  <span key={timeIdx} style={{ display: 'contents' }}>
                    
                    {/* Time Label Column */}
                    <div className="wg-time">
                      {slotStart}
                      <br />
                      {slotEnd}
                    </div>

                    {/* Class Cells for each day */}
                    {days.map((d, dayIdx) => {
                      const dayKey = d.toLowerCase();
                      const color = dayColors[dayKey];
                      const rgb = hexToRgb(color);
                      const isToday = d === todayName;
                      const match = byDay[dayKey]?.find(s => s.start_time?.substring(0, 5) === slotStart);

                      if (match) {
                        return (
                          <div 
                            key={dayIdx} 
                            className={`wg-cell filled ${isToday ? 'is-today-col' : ''}`}
                            onClick={() => handleOpenEdit(match)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div 
                              className="wg-cell-inner"
                              style={{
                                background: `rgba(${rgb}, 0.18)`,
                                border: `1px solid rgba(${rgb}, 0.35)`
                              }}
                            >
                              <div className="wg-code" style={{ color }}>{match.course_code || ''}</div>
                              <div className="wg-cname">{match.course_name || ''}</div>
                              {match.room && <div className="wg-room">📍 Room {match.room}</div>}
                              {match.faculty_name && <div className="wg-faculty" style={{ fontSize: '0.75rem', marginTop: '2px', opacity: 0.8 }}>👨‍🏫 {match.faculty_name}</div>}
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <div 
                          key={dayIdx} 
                          className={`wg-cell ${isToday ? 'is-today-col' : ''}`}
                        ></div>
                      );
                    })}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ======================== ADD / EDIT SLOT MODAL ======================== */}
      {isOpen && (
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={selectedSlot ? '📝 Edit Timetable Slot' : '➕ Add Timetable Slot'}>
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label">Course Subject *</label>
              <select className="form-input" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                {subjects.map(s => (
                  <option key={s.subject_id || s.id} value={s.subject_id || s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Assign Faculty *</label>
                <select className="form-input" value={selectedFaculty} onChange={e => setSelectedFaculty(e.target.value)}>
                  {faculty.map(f => (
                    <option key={f.faculty_id || f.id} value={f.faculty_id || f.id}>{f.first_name} {f.last_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Class Section *</label>
                <select className="form-input" value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
                  {sections.map(sec => (
                    <option key={sec.section_id || sec.id} value={sec.section_id || sec.id}>Section {sec.section_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Day of Week</label>
                <select className="form-input" value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
                  <option value="MON">Monday</option>
                  <option value="TUE">Tuesday</option>
                  <option value="WED">Wednesday</option>
                  <option value="THU">Thursday</option>
                  <option value="FRI">Friday</option>
                  <option value="SAT">Saturday</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Room Number *</label>
                <input type="text" className="form-input" required placeholder="e.g. CSE-102" value={roomNo} onChange={e => setRoomNo(e.target.value)} />
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
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
              {selectedSlot ? (
                <button type="button" className="btn btn-ghost" style={{ color: '#FF6B6B' }} onClick={handleDelete}>
                  🗑️ Delete Slot
                </button>
              ) : (
                <div></div>
              )}
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

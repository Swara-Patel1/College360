import { useState, useEffect } from 'react';
import { API } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

export default function Timetable() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [timetable, setTimetable] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const loadTimetable = async () => {
    try {
      setLoading(true);
      const prof = await API.get('faculty/my_profile');
      setProfile(prof);
      if (!prof) return;

      const schedule = await API.get(`timetable?faculty=${prof.id}`);
      setTimetable(schedule || []);
    } catch (e) {
      console.error('Failed to load faculty timetable:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadTimetable();
  }, [user]);

  // Group schedules by day lookup
  const byDay = {};
  days.forEach(d => byDay[d.toLowerCase()] = []);
  timetable.forEach(s => {
    if (byDay[s.day]) byDay[s.day].push(s);
  });

  if (loading) {
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
          <h1>📅 Weekly Timetable</h1>
          <p>View your scheduled lectures, class timings, and assigned lecture halls.</p>
          <div className="today-badge" id="todayBadge">⭐ Today is {todayName}</div>
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
                      const key = d.toLowerCase();
                      const color = dayColors[key];
                      const rgb = hexToRgb(color);
                      const isToday = d === todayName;
                      const match = byDay[key]?.find(s => s.start_time?.substring(0, 5) === slotStart);

                      if (match) {
                        return (
                          <div key={dayIdx} className={`wg-cell filled ${isToday ? 'is-today-col' : ''}`}>
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
    </>
  );
}

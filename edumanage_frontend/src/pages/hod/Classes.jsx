import { useState, useEffect } from 'react';
import { API, Utils } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Toast } from '../../store/useNotifStore.js';

export default function HODClasses() {
  const { user } = useAuthStore();
  const [students, setStudents] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [selectedSemId, setSelectedSemId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('total'); // 'total' or 'spi'
  const [deptId, setDeptId] = useState('');

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

      // 2. Fetch semesters and students
      const [semsData, allStudents] = await Promise.all([
        API.get('semesters'),
        API.get('students')
      ]);

      const deptStudents = (allStudents || []).filter(s => s.department_id === currentDeptId);
      setSemesters(semsData || []);

      if (semsData && semsData.length > 0) {
        // Find active or first semester
        const activeSem = semsData.find(s => s.is_active) || semsData[0];
        setSelectedSemId(activeSem.semester_id);
        await loadClassRoster(activeSem.semester_id, deptStudents);
      } else {
        setStudents([]);
      }
    } catch (e) {
      console.error(e);
      Toast.error('Failed to load classes info.');
    } finally {
      setLoading(false);
    }
  };

  const loadClassRoster = async (semId, currentStudents) => {
    try {
      setLoading(true);
      // Fetch marks for this semester
      const query = `marks?select=*,student:students(*)&semester_id=eq.${semId}`;
      const marksData = await API.get(query);

      // Calculate stats per student
      const roster = currentStudents.filter(s => s.current_semester_id === semId).map(student => {
        const studentMarks = (marksData || []).filter(m => m.student_id === student.id);
        let totalMarks = 0;
        let marksCount = 0;
        let totalGradePoints = 0;

        studentMarks.forEach(m => {
          totalMarks += parseFloat(m.total_marks || 0);
          totalGradePoints += parseFloat(m.grade_points || 0);
          marksCount++;
        });

        const avgMarks = marksCount > 0 ? (totalMarks / marksCount) : 0;
        const spi = marksCount > 0 ? (totalGradePoints / marksCount) : 0.0;

        return {
          ...student,
          total_marks: Math.round(totalMarks),
          spi_avg: parseFloat(spi.toFixed(2)),
          marks_count: marksCount
        };
      });

      setStudents(roster);
    } catch (err) {
      console.error(err);
      Toast.error('Failed to fetch class rankings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleSemesterChange = async (semId) => {
    setSelectedSemId(semId);
    // Reload students for selected semester
    const allStudents = await API.get('students');
    const deptStudents = (allStudents || []).filter(s => s.department_id === deptId);
    await loadClassRoster(semId, deptStudents);
  };

  // Sorting
  const sortedStudents = [...students].sort((a, b) => {
    if (sortBy === 'spi') {
      return b.spi_avg - a.spi_avg;
    }
    return b.total_marks - a.total_marks;
  });

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>📊 Class Performance Rankings</h1>
          <p>Analyze and rank class performance by Total Marks or SPI Average.</p>
        </div>
      </div>

      {/* Roster Controls */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="filters-bar" style={{ display: 'flex', gap: '15px', padding: '15px 20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Select Semester:</span>
            <select 
              className="form-input" 
              style={{ width: '200px' }} 
              value={selectedSemId} 
              onChange={e => handleSemesterChange(e.target.value)}
            >
              {semesters.map(s => (
                <option key={s.semester_id} value={s.semester_id}>Semester {s.number} ({s.academic_year})</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Sort Rankings By:</span>
            <select 
              className="form-input" 
              style={{ width: '180px' }} 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="total">Total Marks</option>
              <option value="spi">SPI Average</option>
            </select>
          </div>
        </div>
      </div>

      {/* Class rankings roster */}
      <div className="card">
        <div className="card-header" style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Roster Performance Rankings</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {sortedStudents.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '80px', textAlign: 'center' }}>Rank</th>
                  <th>Student Name</th>
                  <th>Roll No.</th>
                  <th>Courses Evaluated</th>
                  <th>Total Marks</th>
                  <th>SPI Average</th>
                  <th>Academic Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.map((s, idx) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: idx === 0 ? '#FF9F43' : idx === 1 ? '#C084FC' : idx === 2 ? '#54A0FF' : 'var(--text-secondary)' }}>
                      🏆 {idx + 1}
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                    <td><strong>{s.roll_number || '—'}</strong></td>
                    <td>{s.marks_count} subject(s)</td>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{s.total_marks}</td>
                    <td style={{ fontWeight: 700, color: '#00D4AA' }}>{s.spi_avg.toFixed(2)}</td>
                    <td>
                      <span className={`badge badge-${s.spi_avg >= 7.5 ? 'success' : s.spi_avg >= 5.0 ? 'primary' : 'danger'}`}>
                        {s.spi_avg >= 7.5 ? 'EXCELLENT' : s.spi_avg >= 5.0 ? 'GOOD' : 'ALERT'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state" style={{ padding: '40px' }}>
              <div className="empty-state-icon">📊</div>
              <p>No students enrolled in the selected semester.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

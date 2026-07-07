import { useState, useEffect } from 'react';
import { API, SupaAPI } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

export default function Wellness() {
  const { user } = useAuthStore();
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sliders state
  const [mood, setMood] = useState(3);
  const [stress, setStress] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [sleep, setSleep] = useState(3);
  const [social, setSocial] = useState(3);
  const [notes, setNotes] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadySubmittedToday, setAlreadySubmittedToday] = useState(false);

  const statusConfig = {
    healthy:  { emoji: '😊', label: '💚 Healthy',  cls: 'status-badge-lg sb-healthy',  msg: "You're doing great! Keep up the positive momentum." },
    watch:    { emoji: '😐', label: '🌤️ Watch',    cls: 'status-badge-lg sb-watch',    msg: 'Slight dip noticed. Take some time for yourself this week.' },
    concern:  { emoji: '😟', label: '⚠️ Concern',  cls: 'status-badge-lg sb-concern',  msg: "We're concerned about you. Your faculty has been notified (anonymously)." },
    critical: { emoji: '😢', label: '🚨 Critical', cls: 'status-badge-lg sb-critical', msg: "Please reach out to your faculty or counselor immediately. You're not alone." },
  };

  const computeScore = (m, st, en, sl, so) => {
    const stressWell = 6 - st; // invert stress
    const avg = (m + stressWell + en + sl + so) / 5;
    return Math.round(((avg - 1) / 4) * 100);
  };

  const getStatus = (score) => {
    if (score >= 65) return 'healthy';
    if (score >= 50) return 'watch';
    if (score >= 35) return 'concern';
    return 'critical';
  };

  const loadWellnessData = async () => {
    try {
      const data = await SupaAPI.wellness.history(user.id, 12);
      const list = Array.isArray(data) ? data : (data?.results || []);
      setHistoryData(list);

      if (list.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        setAlreadySubmittedToday(list[0].assessment_date === todayStr);
      }
    } catch (e) {
      console.error('Failed to load wellness:', e);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;
    const init = async () => {
      setLoading(true);
      await loadWellnessData();
      if (isMounted) setLoading(false);
    };

    init();
    return () => { isMounted = false; };
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (alreadySubmittedToday) {
      alert('Already submitted today!');
      return;
    }

    const score = computeScore(mood, stress, energy, sleep, social);
    const status = getStatus(score);
    const today = new Date().toISOString().split('T')[0];

    try {
      setIsSubmitting(true);
      await SupaAPI.wellness.submit({
        student_id: user.id,
        student_name: `${user.first_name} ${user.last_name}`.trim(),
        mood_score: mood,
        stress_score: stress,
        energy_score: energy,
        sleep_score: sleep,
        social_score: social,
        sentiment_score: score,
        status,
        notes: notes.trim() || null,
        is_flagged: status === 'concern' || status === 'critical',
        assessment_date: today,
      });

      alert(`Check-in saved! Wellness score: ${score}/100`);
      
      if (status === 'concern' || status === 'critical') {
        alert('Your faculty has been notified (anonymously) to provide support.');
      }

      setAlreadySubmittedToday(true);
      setNotes('');
      await loadWellnessData();
    } catch (err) {
      if (err?.code === '23505') {
        alert('Already submitted today!');
        setAlreadySubmittedToday(true);
      } else {
        alert('Failed to save check-in: ' + (err.message || JSON.stringify(err)));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trend Chart Data Configuration
  const trendLabels = [...historyData].reverse().map(r => 
    new Date(r.assessment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  );
  
  const trendScores = [...historyData].reverse().map(r => r.sentiment_score);

  const chartData = {
    labels: trendLabels,
    datasets: [{
      label: 'Wellness Score',
      data: trendScores,
      borderColor: '#00D4AA',
      backgroundColor: 'rgba(0,212,170,0.08)',
      tension: 0.4,
      fill: true,
      pointBackgroundColor: trendScores.map(s => s >= 65 ? '#00D4AA' : s >= 50 ? '#FF9F43' : '#FF6B6B'),
      pointRadius: 5,
    }]
  };

  const chartOptions = {
    responsive: true,
    scales: {
      y: { 
        min: 0, 
        max: 100, 
        grid: { color: 'rgba(255,255,255,0.05)' }, 
        ticks: { color: '#888' } 
      },
      x: { 
        grid: { display: false }, 
        ticks: { color: '#888' } 
      }
    },
    plugins: {
      legend: { display: false }
    }
  };

  const latestAssessment = historyData[0] || null;
  const currentCfg = latestAssessment 
    ? (statusConfig[latestAssessment.status] || statusConfig.healthy)
    : null;

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
          <h1>💚 Wellness & Mentorship Tracker</h1>
          <p>Confidential daily check-ins to monitor stress levels and get mentorship advice.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Status display card */}
        <div className="card col-6">
          <div className="card-header">
            <div className="card-title">🌱 Current Status</div>
            <span id="streakInfo" style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              📅 {historyData.length} check-in{historyData.length !== 1 ? 's' : ''} completed
            </span>
          </div>
          <div className="card-body" style={{ display: 'flex', gap: '20px', alignItems: 'center', minHeight: '180px' }}>
            <div 
              id="moodEmoji" 
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
                flexShrink: 0,
                background: 'rgba(255,255,255,0.05)'
              }}
            >
              {currentCfg ? currentCfg.emoji : '📋'}
            </div>
            <div>
              <span className={currentCfg ? currentCfg.cls : 'status-badge-lg sb-healthy'} id="currentStatusBadge" style={{ display: 'inline-block', marginBottom: '8px' }}>
                {currentCfg ? currentCfg.label : 'NO DATA'}
              </span>
              <h3 id="wellnessTitle" style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', lineHeight: 1.4 }}>
                {currentCfg ? currentCfg.msg : 'No assessments yet. Submit your first check-in below!'}
              </h3>
              <p id="wellnessSub" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                {latestAssessment 
                  ? `Score: ${latestAssessment.sentiment_score}/100 — Last: ${new Date(latestAssessment.assessment_date).toLocaleDateString('en-IN')}`
                  : 'Submit your sliders values to generate a score.'}
              </p>
            </div>
          </div>
        </div>

        {/* Form check-in card */}
        <div className="card col-6">
          <div className="card-header">
            <div className="card-title">💚 Daily Wellness Check-in</div>
            <span id="assessLabel" style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {alreadySubmittedToday ? '(submitted today)' : '(pending today)'}
            </span>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
              {/* Mood Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Mood Indicator</label>
                  <span style={{ fontWeight: 600, color: 'var(--primary-light)' }}>
                    {['😢 Very Low', '😟 Low', '😐 Neutral', '🙂 Good', '😊 Excellent'][mood - 1]}
                  </span>
                </div>
                <input 
                  type="range" 
                  className="form-control" 
                  min="1" 
                  max="5" 
                  value={mood}
                  onChange={(e) => setMood(parseInt(e.target.value))}
                  disabled={alreadySubmittedToday}
                  style={{ width: '100%', height: '8px', cursor: alreadySubmittedToday ? 'not-allowed' : 'pointer' }}
                />
              </div>

              {/* Stress Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Stress Level</label>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                    {['💤 Minimal', '🟢 Low', '🟡 Moderate', '🟠 High', '🚨 Extreme'][stress - 1]}
                  </span>
                </div>
                <input 
                  type="range" 
                  className="form-control" 
                  min="1" 
                  max="5" 
                  value={stress}
                  onChange={(e) => setStress(parseInt(e.target.value))}
                  disabled={alreadySubmittedToday}
                  style={{ width: '100%', height: '8px', cursor: alreadySubmittedToday ? 'not-allowed' : 'pointer' }}
                />
              </div>

              {/* Energy Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Energy Levels</label>
                  <span style={{ fontWeight: 600, color: '#FFC107' }}>
                    {['🥱 Drained', '🥱 Low', '😐 Average', '⚡ Energetic', '🔥 Hyperactive'][energy - 1]}
                  </span>
                </div>
                <input 
                  type="range" 
                  className="form-control" 
                  min="1" 
                  max="5" 
                  value={energy}
                  onChange={(e) => setEnergy(parseInt(e.target.value))}
                  disabled={alreadySubmittedToday}
                  style={{ width: '100%', height: '8px', cursor: alreadySubmittedToday ? 'not-allowed' : 'pointer' }}
                />
              </div>

              {/* Sleep Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Sleep Quality</label>
                  <span style={{ fontWeight: 600, color: '#54A0FF' }}>
                    {['❌ Insomnia', '💤 Restless', '😐 Average', '🛌 Good Rest', '😴 Deep Sleep'][sleep - 1]}
                  </span>
                </div>
                <input 
                  type="range" 
                  className="form-control" 
                  min="1" 
                  max="5" 
                  value={sleep}
                  onChange={(e) => setSleep(parseInt(e.target.value))}
                  disabled={alreadySubmittedToday}
                  style={{ width: '100%', height: '8px', cursor: alreadySubmittedToday ? 'not-allowed' : 'pointer' }}
                />
              </div>

              {/* Social Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Social Balance</label>
                  <span style={{ fontWeight: 600, color: '#C084FC' }}>
                    {['🔒 Isolated', '🔒 Low contact', '😐 Balanced', '👥 Social', '🎉 Highly Active'][social - 1]}
                  </span>
                </div>
                <input 
                  type="range" 
                  className="form-control" 
                  min="1" 
                  max="5" 
                  value={social}
                  onChange={(e) => setSocial(parseInt(e.target.value))}
                  disabled={alreadySubmittedToday}
                  style={{ width: '100%', height: '8px', cursor: alreadySubmittedToday ? 'not-allowed' : 'pointer' }}
                />
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">Confidential Notes (Optional)</label>
                <textarea 
                  className="form-control" 
                  rows="2"
                  placeholder="How was your day? Anything you want to share with your mentor..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={alreadySubmittedToday}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary"
                id="submitBtn"
                disabled={alreadySubmittedToday || isSubmitting}
                style={{ width: '100%', marginTop: '8px' }}
              >
                {alreadySubmittedToday 
                  ? '✅ Already submitted today' 
                  : isSubmitting 
                    ? 'Submitting...' 
                    : '💚 Submit Check-in'}
              </button>
            </form>
          </div>
        </div>

        {/* Trend line Chart */}
        {historyData.length > 0 && (
          <div className="card col-7">
            <div className="card-header">
              <div className="card-title">📈 Wellness Score Trend</div>
            </div>
            <div className="card-body">
              <div className="chart-container" style={{ height: '260px', position: 'relative' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        )}

        {/* History log rows */}
        {historyData.length > 0 && (
          <div className="card col-5">
            <div className="card-header">
              <div className="card-title">📅 Check-in History Log</div>
            </div>
            <div className="card-body" id="historyLog" style={{ display: 'grid', gap: '10px', maxHeight: '280px', overflowY: 'auto', padding: '16px' }}>
              {historyData.map((r, i) => {
                const cfg = statusConfig[r.status] || statusConfig.healthy;
                return (
                  <div 
                    className="log-row" 
                    key={i} 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      gap: '12px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {new Date(r.assessment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      <div className="log-date" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {r.notes ? `📝 ${r.notes.substring(0, 60)}${r.notes.length > 60 ? '…' : ''}` : 'No note'}
                      </div>
                    </div>
                    <span className={`score-pill pill-${r.status}`} style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {r.sentiment_score}/100
                    </span>
                    <span style={{ fontSize: '1.25rem' }}>{cfg.emoji}</span>
                    <span className={`score-pill pill-${r.status}`} style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600 }}>
                      {r.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

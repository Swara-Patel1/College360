import { useState, useEffect } from 'react';
import { API, SupaAPI } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Placement() {
  const { user } = useAuthStore();
  const [scoreData, setScoreData] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchScoreAndCompanies = async () => {
    try {
      setLoading(true);
      const profile = await API.get('students/my_profile');
      console.log('Fetched student profile:', profile);
      if (!profile) return;
      
      const [scoreRows, companyRows] = await Promise.all([
        SupaAPI.placement.forStudent(profile.id),
        SupaAPI.companies.all()
      ]);
      console.log('Fetched scoreRows:', scoreRows);
      console.log('Fetched companyRows:', companyRows);
      
      const ps = Array.isArray(scoreRows) ? scoreRows[0] : (scoreRows?.results?.[0] || null);
      setScoreData(ps);
      const comps = Array.isArray(companyRows) ? companyRows : (companyRows?.results || []);
      setCompanies(comps);
      setFilteredCompanies(comps);
    } catch (e) {
      console.error('Failed to load placement predictor data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchScoreAndCompanies();
  }, [user]);

  // Apply local filtering to companies list
  useEffect(() => {
    if (!companies) return;
    const eligibleIds = scoreData?.eligible_company_ids || [];
    
    if (selectedFilter === 'eligible') {
      setFilteredCompanies(companies.filter(c => eligibleIds.includes(c.id)));
    } else if (selectedFilter === 'locked') {
      setFilteredCompanies(companies.filter(c => !eligibleIds.includes(c.id)));
    } else {
      setFilteredCompanies(companies);
    }
  }, [selectedFilter, companies, scoreData]);

  const getCategoryColor = (cat) => {
    return {
      high: '#00D4AA',
      medium: '#FF9F43',
      low: '#FF6B6B',
      critical: '#EE5A24',
      insufficient: '#A0A0C0'
    }[cat] || '#A0A0C0';
  };

  const getCategoryMessage = (cat, score) => {
    return {
      high: `Excellent! You're placement-ready with a score of ${Math.round(score)}/100. 🎉`,
      medium: `Good standing! Score ${Math.round(score)}/100 — a few improvements needed.`,
      low: `Score ${Math.round(score)}/100 — action required to improve eligibility.`,
      critical: `Critical: ${Math.round(score)}/100 — urgent intervention needed. Meet your HOD.`,
    }[cat] || 'Calculating...';
  };

  const score = scoreData?.total_score || 0;
  const category = scoreData?.category || 'insufficient';
  const color = getCategoryColor(category);
  const eligibleIds = scoreData?.eligible_company_ids || [];

  // Gauge Doughnut Chart Configuration
  const chartData = {
    datasets: [{
      data: [score, 100 - score],
      backgroundColor: [color, 'rgba(255,255,255,0.05)'],
      borderWidth: 0,
      circumference: 270,
      rotation: 225,
    }]
  };

  const chartOptions = {
    cutout: '78%',
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    },
    responsive: true,
    maintainAspectRatio: false
  };

  const sectorEmoji = {
    IT: '💻',
    Finance: '💰',
    Core: '⚙️',
    Marketing: '📣',
    Consulting: '📊'
  };

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
          <h1>🎯 Placement Eligibility Predictor</h1>
          <p>Real-time analytics and company matching dashboard.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Placement Score Gauge Card */}
        <div className={`score-hero hero-${category} card col-6`} style={{ position: 'relative' }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
            <span className={`score-badge badge-${category}`} id="scoreBadge" style={{ marginBottom: '16px' }}>
              {category.toUpperCase()}
            </span>
            <div style={{ width: '180px', height: '180px', position: 'relative', margin: '0 auto 16px auto' }}>
              <Doughnut data={chartData} options={chartOptions} />
              <div 
                id="scoreVal" 
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: '3rem',
                  fontWeight: 800,
                  color
                }}
              >
                {Math.round(score)}
              </div>
            </div>
            <h3 id="scoreTitle" style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', marginBottom: '8px' }}>
              {scoreData ? getCategoryMessage(category, score) : 'Not enough academic history yet.'}
            </h3>
            <p id="scoreComputedAt" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {scoreData 
                ? `Last computed: ${new Date(scoreData.computed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
                : 'Complete at least one semester to see your score.'}
            </p>
          </div>
        </div>

        {/* Factors Breakdown Card */}
        <div className="card col-6">
          <div className="card-header">
            <div className="card-title">📊 Placement Factors Breakdown</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {scoreData ? (
              <>
                {/* CPI Factor */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Academic Performance (CPI)</span>
                    <span id="fb-cpi">{scoreData.cpi?.toFixed(2)} CPI → {scoreData.cpi_score?.toFixed(1)} pts</span>
                  </div>
                  <div className="progress-bar-container" style={{ height: '8px' }}>
                    <div 
                      className="progress-bar-fill" 
                      id="fb-cpi-bar" 
                      style={{ 
                        width: `${Math.min(100, (scoreData.cpi_score / 40) * 100)}%`, 
                        background: 'var(--primary-light)' 
                      }}
                    ></div>
                  </div>
                </div>

                {/* Attendance Factor */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Class Attendance</span>
                    <span id="fb-att">{scoreData.attendance_pct?.toFixed(0)}% → {scoreData.attendance_score?.toFixed(1)} pts</span>
                  </div>
                  <div className="progress-bar-container" style={{ height: '8px' }}>
                    <div 
                      className="progress-bar-fill" 
                      id="fb-att-bar" 
                      style={{ 
                        width: `${Math.min(100, (scoreData.attendance_score / 20) * 100)}%`, 
                        background: '#00D4AA' 
                      }}
                    ></div>
                  </div>
                </div>

                {/* Backlog Factor */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Active Backlogs</span>
                    <span id="fb-back">{scoreData.active_backlogs} backlogs → {scoreData.backlog_score?.toFixed(1)} pts</span>
                  </div>
                  <div className="progress-bar-container" style={{ height: '8px' }}>
                    <div 
                      className="progress-bar-fill" 
                      id="fb-back-bar" 
                      style={{ 
                        width: `${Math.min(100, (scoreData.backlog_score / 25) * 100)}%`, 
                        background: '#FF6B6B' 
                      }}
                    ></div>
                  </div>
                </div>

                {/* Extra Factor */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>Extracurriculars & Skills</span>
                    <span id="fb-extra">{scoreData.extra_activities ? 'Activities ✓' : 'None'} → {scoreData.extra_score?.toFixed(1)} pts</span>
                  </div>
                  <div className="progress-bar-container" style={{ height: '8px' }}>
                    <div 
                      className="progress-bar-fill" 
                      id="fb-extra-bar" 
                      style={{ 
                        width: `${Math.min(100, (scoreData.extra_score / 15) * 100)}%`, 
                        background: '#FF9F43' 
                      }}
                    ></div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No breakdown factors available.
              </div>
            )}
          </div>
        </div>

        {/* Actionable Tips Card */}
        {scoreData?.improvement_tips?.length > 0 && (
          <div className="card col-12" id="tipsSection">
            <div className="card-header">
              <div className="card-title">💡 Practical Placement Tips</div>
            </div>
            <div className="card-body" id="tipsList" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
              {scoreData.improvement_tips.map((t, idx) => (
                <div className="tip-item" key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <span className="tip-icon" style={{ fontSize: '1.2rem' }}>
                    {['💡', '🎯', '📈', '⚠️', '🚀'][idx % 5]}
                  </span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Company Matches Card */}
        <div className="card col-12">
          <div className="card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
            <div className="card-title">🏢 Placement Company Eligibility Matches</div>
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <button 
                className={`btn ${selectedFilter === 'all' ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
                onClick={() => setSelectedFilter('all')}
              >
                All Companies
              </button>
              <button 
                className={`btn ${selectedFilter === 'eligible' ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
                onClick={() => setSelectedFilter('eligible')}
              >
                ✅ Eligible
              </button>
              <button 
                className={`btn ${selectedFilter === 'locked' ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
                onClick={() => setSelectedFilter('locked')}
              >
                🔒 Locked
              </button>
            </div>
          </div>

          <div className="card-body" id="companiesGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', padding: '20px' }}>
            {filteredCompanies.length ? (
              filteredCompanies.map((c, idx) => {
                const isEligible = eligibleIds.includes(c.id);
                return (
                  <div className={`company-card ${isEligible ? '' : 'locked'}`} key={idx}>
                    <div className="company-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div className="company-logo" style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                        {sectorEmoji[c.sector] || '🏢'}
                      </div>
                      <div>
                        <div className="company-name" style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{c.name}</div>
                        <div className="company-sector" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.sector || 'General'}</div>
                      </div>
                      <span className={`eligible-badge ${isEligible ? 'eligible-yes' : 'eligible-no'}`} style={{ marginLeft: 'auto', fontSize: '0.7rem', padding: '4px 8px', borderRadius: '6px', fontWeight: 600 }}>
                        {isEligible ? '✅ Eligible' : '🔒 Locked'}
                      </span>
                    </div>
                    <div className="company-meta" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <span className="meta-chip package-chip" style={{ background: 'rgba(0,212,170,0.15)', color: '#00D4AA', fontWeight: 700 }}>
                        ₹{c.package_lpa} LPA
                      </span>
                      <span className="meta-chip">Min CPI: {c.min_cpi}</span>
                      <span className="meta-chip">Backlogs: ≤{c.max_backlogs}</span>
                      <span className="meta-chip">Attend: ≥{c.min_attendance}%</span>
                    </div>
                    {c.roles && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        Roles: {c.roles}
                      </div>
                    )}
                    {c.bond_years && (
                      <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Bond: {c.bond_years} years
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty-state" style={{ padding: '40px', gridColumn: '1 / -1', textAlign: 'center' }}>
                <div className="empty-state-icon">🏢</div>
                <p>No companies match selected criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

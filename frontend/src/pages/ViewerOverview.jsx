import React from 'react'

export default function ViewerOverview({
  monthLabel,
  animatedMembers,
  regions,
  pieBackground,
  activeIdx,
  setActiveIdx,
  onPieMove,
  onPieLeave,
  tip,
  kpis,
  renderTrend,
}) {
  // Safely unwrap KPI values to avoid runtime errors when API hasn't provided them yet
  const avgSpend = (kpis && kpis.averageSpend != null) ? kpis.averageSpend : 0
  const avgSpendTrend = (kpis && kpis.averageTrend != null) ? kpis.averageTrend : 0
  const premiumMembers = (kpis && kpis.premiumMembers != null) ? kpis.premiumMembers : 0
  const premiumTrend = (kpis && kpis.premiumTrend != null) ? kpis.premiumTrend : 0
  const engagement = (kpis && kpis.engagement != null) ? kpis.engagement : 0
  const engagementTrend = (kpis && kpis.engagementTrend != null) ? kpis.engagementTrend : 0
  const tipValue = (tip && tip.value != null) ? tip.value : 0
  return (
    <div className="page-inner full">
      <div className="section-head">
        <div className="section-hero">
          <h1 className="hero-title">會員概況</h1>
          <p className="section-subtitle">{monthLabel}</p>
        </div>
      </div>
      <div className="two-col">
        <div className="stat-card card-hoverable">
          <div className="card-badge card-badge--month">{monthLabel}</div>
          <div className="avatar" aria-hidden>
            <svg viewBox="0 0 24 24" width="36" height="36">
              <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-3.866 0-7 3.134-7 7 0 .552.448 1 1 1h12c.552 0 1-.448 1-1 0-3.866-3.134-7-7-7z" />
            </svg>
          </div>
          <div className="stat-title">會員購買人數</div>
          <div className="stat-value">{(animatedMembers || 0).toLocaleString()}</div>
        </div>
        <div className="chart-card card-hoverable">
          <div className="card-badge card-badge--month">{monthLabel}</div>
          <div className="chart-title">來自哪裡</div>
          <div
            className="pie"
            aria-label="區域分布"
            role="img"
            style={{ background: pieBackground(activeIdx) }}
            onMouseMove={onPieMove}
            onMouseLeave={onPieLeave}
          />
          <ul className="legend">
            {regions.map((r, i) => (
              <li
                key={r.name}
                className={i === activeIdx ? 'active' : ''}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
              >
                <span className="dot" style={{ background: r.color }} /> {r.name} {r.pct}%
              </li>
            ))}
          </ul>
          {tip.show && (
            <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
              <div className="tooltip-row">
                <span className="tooltip-dot" style={{ background: tip.color }} />
                <span className="tooltip-label">{tip.label}</span>
              </div>
              <div className="tooltip-value">{(tipValue).toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi-card card-hoverable">
          <div className="card-badge card-badge--month">{monthLabel}</div>
          <div className="kpi-head">
            <div className="kpi-icon kpi-icon--blue" aria-hidden>
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d="M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1zm1 17.93V20h-2v-1.07A6.002 6.002 0 0 1 6 13h2a4 4 0 0 0 8 0c0-1.86-1.28-3.41-3-3.86V7h-2v2.06A4.002 4.002 0 0 0 8 13H6c0-2.97 2.16-5.43 5-5.91V6h2v1.09c2.84.48 5 2.94 5 5.91a6.002 6.002 0 0 1-5 5.93z" />
              </svg>
            </div>
            <div className="kpi-title">平均消費額</div>
          </div>
          <div className="kpi-main">
            <div className="kpi-value">${Number(avgSpend).toLocaleString()}</div>
            {renderTrend(avgSpendTrend)}
          </div>
        </div>

        <div className="kpi-card card-hoverable">
          <div className="card-badge card-badge--month">{monthLabel}</div>
          <div className="kpi-head">
            <div className="kpi-icon kpi-icon--green" aria-hidden>
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d="M15 14c2.761 0 5-2.239 5-5S17.761 4 15 4s-5 2.239-5 5 2.239 5 5 5zM6 22a7 7 0 0 1 14 0H6zM7 9h2V7h2V5H9V3H7v2H5v2h2v2z" />
              </svg>
            </div>
            <div className="kpi-title">高價值會員</div>
          </div>
          <div className="kpi-main">
            <div className="kpi-value">{Number(premiumMembers).toLocaleString()}</div>
            {renderTrend(premiumTrend)}
          </div>
        </div>

        <div className="kpi-card card-hoverable">
          <div className="card-badge card-badge--month">{monthLabel}</div>
          <div className="kpi-head">
            <div className="kpi-icon kpi-icon--orange" aria-hidden>
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
              </svg>
            </div>
            <div className="kpi-title">活躍率</div>
          </div>
          <div className="kpi-main">
            <div className="kpi-value">{Number(engagement)}%</div>
            {renderTrend(engagementTrend)}
          </div>
        </div>
      </div>
    </div>
  )
}

import React from 'react'

export default function ViewerInsights({
  monthLabel,
  realtime,
  chartGeom,
  formatMetricValue,
  formatTrend,
}) {
  const fmtDay = (s) => {
    if (!s) return ''
    try {
      if (typeof s !== 'string') s = String(s)
      // keep YYYY-MM as-is
      if (/^\d{4}-\d{2}$/.test(s)) return s
      const d = new Date(s)
      if (!isNaN(d)) return d.toISOString().slice(0, 10)
      // fallback: take date portion before space
      return s.split(' ')[0]
    } catch (e) {
      return s
    }
  }
  return (
    <div className="page-inner full realtime-layout">
      <section className="key-metrics key-metrics--inline">
        <div className="section-head section-head--tight">
          <div className="section-hero">
            <h2 className="hero-title">關鍵指標</h2>
            <p className="section-subtitle">{monthLabel}</p>
          </div>
        </div>
        <div className="key-metrics-grid">
          {realtime.keyMetrics.map((metric) => (
            <div key={metric.title} className="key-metric-card card-hoverable">
              <div className="card-badge card-badge--month">{monthLabel}</div>
              <div className="key-metric-header">
                <span>{metric.title}</span>
              </div>
              <div className="key-metric-value">{formatMetricValue(metric)}</div>
              <div className={`key-metric-trend ${metric.trend >= 0 ? 'up' : 'down'}`}>
                <span className={`triangle ${metric.trend >= 0 ? 'triangle-up' : 'triangle-down'}`} aria-hidden />
                {formatTrend(metric.trend)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="realtime-card">
        <div className="realtime-header">
          <div>
            <h2 className="realtime-title">本月銷售趨勢（示意）</h2>
            <p className="realtime-subtitle">顯示資料至 {fmtDay(realtime.updatedAt)}</p>
          </div>
          <div className="realtime-legend">
            <span className="legend-dot today" /> {fmtDay(realtime.compareDate)}
          </div>
        </div>
        <div className="realtime-body">
          <div className="chart-wrapper" role="img" aria-label="本月銷售趨勢 (示意)">
            <div className="chart-y-label">金額 (NT$)</div>
            <div className="chart-y-scale">
              {chartGeom.ticks.map((tick) => (
                <span
                  key={tick.value}
                  style={{ top: `${(tick.y / chartGeom.height) * 100}%` }}
                >
                  NT${tick.value.toLocaleString()}
                </span>
              ))}
            </div>
            <div className="chart-visual">
              <svg
                viewBox={`0 0 ${chartGeom.width} ${chartGeom.height}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="todayGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(244, 63, 94, 0.35)" />
                    <stop offset="100%" stopColor="rgba(244, 63, 94, 0)" />
                  </linearGradient>
                </defs>
                {chartGeom.ticks.map((tick) => (
                  <line
                    key={tick.value}
                    x1="0"
                    y1={tick.y}
                    x2={chartGeom.width}
                    y2={tick.y}
                    stroke="rgba(15, 23, 42, 0.15)"
                    strokeWidth="2.5"
                    strokeDasharray="0"
                    strokeOpacity="0.3"
                  />
                ))}
                {chartGeom.todayPath && (
                  <>
                    <polyline
                      fill="url(#todayGradient)"
                      stroke="#f43f5e"
                      strokeWidth="4"
                      strokeLinejoin="round"
                      points={chartGeom.todayPath}
                    />
                    {chartGeom.todayLast && (
                      <circle
                        cx={chartGeom.todayLast.x}
                        cy={chartGeom.todayLast.y}
                        r="6"
                        fill="#f43f5e"
                        stroke="#fff"
                        strokeWidth="3"
                      />
                    )}
                  </>
                )}
              </svg>
              <div
                className="chart-x-axis"
                style={{ position: 'relative', display: 'block', height: 28 }}
              >
                {Array.isArray(chartGeom.pointsArr) && chartGeom.pointsArr.length > 0 ? (
                  chartGeom.pointsArr.map((pt, i) => (
                    <span
                      key={`${chartGeom.labels[i] || i}-${i}`}
                      style={{
                        position: 'absolute',
                        left: `${(pt.x / chartGeom.width) * 100}%`,
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        fontSize: 10,
                        color: 'var(--muted)'
                      }}
                    >
                      {chartGeom.labels[i] || ''}
                    </span>
                  ))
                ) : (
                  chartGeom.labels.map((label) => (
                    <span key={label}>{label}</span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

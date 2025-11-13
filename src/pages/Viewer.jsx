import React, { useEffect, useMemo, useState } from 'react'

const buildRealtimeMock = (seed = 0) => {
  // TODO: 未來改成使用後端本月銷售資料
  const days = Array.from({ length: 30 }, (_, idx) => ({
    day: idx + 1,
    value: Math.round(2000 + Math.sin((idx + seed) / 3) * 1500 + idx * 180 + seed * 250),
  }))
  const baselineDays = days.map((d) => ({
    day: d.day,
    value: Math.max(500, Math.round(d.value * 0.72)),
  }))
  return {
    updatedAt: '2025-11-12 02:43:57',
    compareDate: '2025-11-11',
    days,
    baselineDays,
    keyMetrics: [
      { title: '本月銷售額', value: 6242912 + seed * 12000, trend: 15.65 + seed },
      { title: '本月訂單數', value: 5262 + seed * 80, trend: 12.36 + seed },
      { title: '本月退貨量', value: 132 + seed * 8, trend: -3.2 + seed * 0.4 },
      { title: '新顧客數', value: 820 + seed * 25, trend: 6.1 + seed * 0.6 },
    ],
  }
}

const MOCK_MONTHLY_DATA = [
  {
    month: '2024-07',
    label: '2024 / 07',
    totalMembers: 12345, // TODO: 改成後端實際的月度會員總數
    regions: [
      { name: '北部', pct: 45, color: '#60a5fa' }, // TODO: 依照月份置換真實區域占比
      { name: '中部', pct: 25, color: '#34d399' },
      { name: '南部', pct: 20, color: '#f59e0b' },
      { name: '東部', pct: 10, color: '#ef4444' },
    ],
    kpis: {
      averageSpend: 1280, // TODO: 平均消費金額
      averageTrend: 5.2,
      premiumMembers: 532,
      premiumTrend: 12.4,
      engagement: 68,
      engagementTrend: -1.3,
    },
    realtime: buildRealtimeMock(0),
  },
  {
    month: '2024-08',
    label: '2024 / 08',
    totalMembers: 12345,
    regions: [
      { name: '北部', pct: 45, color: '#60a5fa' },
      { name: '中部', pct: 25, color: '#34d399' },
      { name: '南部', pct: 20, color: '#f59e0b' },
      { name: '東部', pct: 10, color: '#ef4444' },
    ],
    kpis: {
      averageSpend: 1280,
      averageTrend: 5.2,
      premiumMembers: 532,
      premiumTrend: 12.4,
      engagement: 68,
      engagementTrend: -1.3,
    },
    realtime: buildRealtimeMock(1),
  },
  {
    month: '2024-09',
    label: '2024 / 09',
    totalMembers: 12345,
    regions: [
      { name: '北部', pct: 45, color: '#60a5fa' },
      { name: '中部', pct: 25, color: '#34d399' },
      { name: '南部', pct: 20, color: '#f59e0b' },
      { name: '東部', pct: 10, color: '#ef4444' },
    ],
    kpis: {
      averageSpend: 1280,
      averageTrend: 5.2,
      premiumMembers: 532,
      premiumTrend: 12.4,
      engagement: 68,
      engagementTrend: -1.3,
    },
    realtime: buildRealtimeMock(2),
  },
]

const TOTAL_PAGES = 2

export default function Viewer({ file, onReset }) {
  const [page, setPage] = useState(0)
  const [logoSrc, setLogoSrc] = useState('/aonix.png')
  const [monthIndex, setMonthIndex] = useState(0)
  const [tip, setTip] = useState({ show: false, x: 0, y: 0, label: '', value: 0, color: '#000' })
  const [activeIdx, setActiveIdx] = useState(null)
  const [animatedMembers, setAnimatedMembers] = useState(0)

  const currentMonth = MOCK_MONTHLY_DATA[monthIndex] || MOCK_MONTHLY_DATA[0]
  const { totalMembers, regions, kpis, realtime } = currentMonth
  // TODO: 之後改為後端資料庫產出的年月
  const monthLabel = currentMonth.label

  const cumulative = useMemo(
    () =>
      regions.reduce((acc, r, i) => {
        acc.push((acc[i - 1] || 0) + r.pct)
        return acc
      }, []),
    [regions]
  )

  const next = () => setPage((p) => Math.min(TOTAL_PAGES - 1, p + 1))
  const prev = () => setPage((p) => Math.max(0, p - 1))

  useEffect(() => {
    if (page !== 0) return
    let raf = 0
    let startTime = 0
    setAnimatedMembers(0)
    const from = 0
    const to = totalMembers
    const duration = 1000
    const step = (ts) => {
      if (!startTime) startTime = ts
      const t = Math.min(1, (ts - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const value = Math.round(from + (to - from) * eased)
      setAnimatedMembers(value)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [page, totalMembers])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(TOTAL_PAGES - 1, p + 1))
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    setTip((t) => ({ ...t, show: false }))
    setActiveIdx(null)
  }, [monthIndex])

  const hexToRgb = (hex) => {
    const h = hex.replace('#', '')
    const bigint = parseInt(h, 16)
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    }
  }

  const pieBackground = (active) => {
    let start = 0
    const parts = regions.map((r, i) => {
      const end = start + r.pct
      let color
      if (active == null) {
        color = r.color
      } else {
        const { r: rr, g, b } = hexToRgb(r.color)
        color = i === active ? `rgba(${rr}, ${g}, ${b}, 1)` : `rgba(${rr}, ${g}, ${b}, 0.35)`
      }
      const seg = `${color} ${start}% ${end}%`
      start = end
      return seg
    })
    return `conic-gradient(${parts.join(', ')})`
  }

  const onPieMove = (e) => {
    const pie = e.currentTarget
    const rect = pie.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const radius = Math.min(rect.width, rect.height) / 2
    const dist = Math.hypot(dx, dy)
    if (dist > radius) {
      setTip((t) => ({ ...t, show: false }))
      return
    }
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI
    deg = (deg + 90 + 360) % 360
    const pct = (deg / 360) * 100
    const idx = cumulative.findIndex((c) => pct <= c)
    const region = regions[idx] || regions[regions.length - 1]
    const count = Math.round(totalMembers * (region?.pct || 0) / 100)
    const cardRect = pie.parentElement.getBoundingClientRect()
    const x = e.clientX - cardRect.left
    const y = e.clientY - cardRect.top
    setTip({ show: true, x, y, label: region?.name || '', value: count, color: region?.color || '#000' })
    setActiveIdx(idx)
  }

  const onPieLeave = () => {
    setTip((t) => ({ ...t, show: false }))
    setActiveIdx(null)
  }

  const chartGeom = useMemo(() => {
    const width = 600
    const height = 220
    const days = realtime?.days ?? []
    const values = days.map((pt) => pt.value)
    const maxValue = Math.max(...values, 100000)

    const buildPoints = (series) => {
      if (!series.length) return { points: '', last: null }
      const step = series.length === 1 ? 0 : width / (series.length - 1)
      const coords = series.map((point, idx) => {
        const x = step * idx
        const y = height - (point.value / maxValue) * height
        return { x, y: Math.round(y) }
      })
      return {
        points: coords.map(({ x, y }) => `${x},${y}`).join(' '),
        last: coords[coords.length - 1],
      }
    }

    const today = buildPoints(days)

    const ticks = Array.from({ length: 10 }, (_, idx) => {
      const value = (idx + 1) * 10000
      const pct = value / maxValue
      return {
        value,
        y: Math.round(height - pct * height),
      }
    })

    return {
      width,
      height,
      todayPath: today.points,
      todayLast: today.last,
      labels: Array.from({ length: 30 }, (_, idx) => String(idx + 1).padStart(2, '0')),
      ticks,
    }
  }, [realtime])

  const renderTrend = (value) => {
    const positive = value >= 0
    return (
      <div className={`kpi-trend ${positive ? 'up' : 'down'}`}>
        <span className={`triangle ${positive ? 'triangle-up' : 'triangle-down'}`} aria-hidden />
        {Math.abs(value)}%
      </div>
    )
  }

  const formatMetricValue = (metric) => {
    const formatted = metric.value.toLocaleString()
    if (metric.title.includes('銷售') || metric.title.includes('金額')) {
      return `NT$${formatted}`
    }
    return formatted
  }

  const formatTrend = (value) => `${Math.abs(value).toFixed(2)}%`

  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <div className="brand-bar" aria-label="brand">
          <img
            src={logoSrc}
            alt="Aonix logo"
            onError={() => {
              if (logoSrc !== '/anoix.png') setLogoSrc('/anoix.png')
            }}
          />
        </div>
        <div className="viewer-sub">
          <span>第 {page + 1} / {TOTAL_PAGES} 頁</span>
          <span className="dot" aria-hidden />
          <div className="month-picker">
            <label htmlFor="month-select-header">月份</label>
            <select
              id="month-select-header"
              value={monthIndex}
              onChange={(e) => setMonthIndex(Number(e.target.value))}
            >
              {MOCK_MONTHLY_DATA.map((item, idx) => (
                <option key={item.month} value={idx}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="viewer-body">
        <div className="nav left">
          {page > 0 && (
            <button className="arrow-btn" aria-label="上一頁" onClick={prev}>
              &lt;
            </button>
          )}
        </div>

        <div className="page">
          {page === 0 ? (
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
                  <div className="chart-title">來自區域</div>
                  <div
                    className="pie"
                    aria-label="區域分佈"
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
                      <div className="tooltip-value">{tip.value.toLocaleString()}</div>
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
                    <div className="kpi-value">${kpis.averageSpend.toLocaleString()}</div>
                    {renderTrend(kpis.averageTrend)}
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
                    <div className="kpi-value">{kpis.premiumMembers.toLocaleString()}</div>
                    {renderTrend(kpis.premiumTrend)}
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
                    <div className="kpi-value">{kpis.engagement}%</div>
                    {renderTrend(kpis.engagementTrend)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
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
                        <span className="metric-hint"></span>
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

              {/* TODO: 之後如果有即時 API，這裡改成串接後端回傳的線圖資料 */}
              <section className="realtime-card">
                <div className="realtime-header">
                  <div>
                    <h2 className="realtime-title">本月銷售趨勢（示意）</h2>
                    <p className="realtime-subtitle">顯示資料至 {realtime.updatedAt}</p>
                  </div>
                  <div className="realtime-legend">
                    <span className="legend-dot today" /> {realtime.compareDate}
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
                            stroke="rgba(15, 23, 42, 0.12)"
                            strokeWidth="1"
                            strokeDasharray="6 6"
                          />
                        ))}
                        {chartGeom.todayPath && (
                          <>
                            <polyline
                              fill="url(#todayGradient)"
                              stroke="#f43f5e"
                              strokeWidth="3"
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
                                strokeWidth="2"
                              />
                            )}
                          </>
                        )}
                      </svg>
                      <div className="chart-x-axis">
                        {chartGeom.labels.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="nav right">
          {page < TOTAL_PAGES - 1 && (
            <button className="arrow-btn" aria-label="下一頁" onClick={next}>
              &gt;
            </button>
          )}
        </div>
      </main>

      <footer className="viewer-footer">
        <button className="btn" onClick={onReset}>返回重新上傳</button>
      </footer>
    </div>
  )
}

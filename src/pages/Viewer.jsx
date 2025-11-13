import React, { useEffect, useState } from 'react'

export default function Viewer({ file, onReset }) {
  const [page, setPage] = useState(0) // 0 or 1
  const [logoSrc, setLogoSrc] = useState('/aonix.png')

  const next = () => setPage(p => Math.min(1, p + 1))
  const prev = () => setPage(p => Math.max(0, p - 1))

  const totalMembers = 12345
  const regions = [
    { name: '北部', pct: 45, color: '#60a5fa' },
    { name: '中部', pct: 25, color: '#34d399' },
    { name: '南部', pct: 20, color: '#f59e0b' },
    { name: '東部', pct: 10, color: '#ef4444' },
  ]
  const cumulative = regions.reduce((acc, r, i) => {
    acc.push((acc[i-1] || 0) + r.pct)
    return acc
  }, [])

  const [tip, setTip] = useState({ show: false, x: 0, y: 0, label: '', value: 0, color: '#000' })
  const [activeIdx, setActiveIdx] = useState(null)
  const [animatedMembers, setAnimatedMembers] = useState(0)

  // Count-up animation for member total when on page 0
  useEffect(() => {
    if (page !== 0) return
    let raf = 0
    let startTime = 0
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
  }, [page])

  // Keyboard navigation for pages
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(1, p + 1))
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const hexToRgb = (hex) => {
    const h = hex.replace('#', '')
    const bigint = parseInt(h, 16)
    const r = (bigint >> 16) & 255
    const g = (bigint >> 8) & 255
    const b = bigint & 255
    return { r, g, b }
  }

  const pieBackground = (active) => {
    let start = 0
    const parts = regions.map((r, i) => {
      const end = start + r.pct
      let color
      if (active == null) {
        // 初始狀態：全部使用原色，不透明
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
    if (dist > radius) { setTip(t => ({ ...t, show: false })); return }
    // Convert to degrees where 0deg is at top and increases clockwise
    let deg = Math.atan2(dy, dx) * 180 / Math.PI
    deg = (deg + 90 + 360) % 360
    const pct = deg / 360 * 100
    const idx = cumulative.findIndex(c => pct <= c)
    const region = regions[idx] || regions[regions.length - 1]
    const count = Math.round(totalMembers * region.pct / 100)
    const cardRect = pie.parentElement.getBoundingClientRect()
    const x = e.clientX - cardRect.left
    const y = e.clientY - cardRect.top
    setTip({ show: true, x, y, label: region.name, value: count, color: region.color })
    setActiveIdx(idx)
  }
  const onPieLeave = () => { setTip(t => ({ ...t, show: false })); setActiveIdx(null) }

  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <div className="brand-bar" aria-label="brand">
          <img
            src={logoSrc}
            alt="Aonix logo"
            onError={() => { if (logoSrc !== '/anoix.png') setLogoSrc('/anoix.png') }}
          />
        </div>
        <div className="viewer-sub">
          <span>第 {page + 1} / 2 頁</span>
        </div>
      </header>

      <main className="viewer-body">
        {/* Left arrow: hidden on first page */}
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
                <h1 className="hero-title">會員概況</h1>
              </div>
              <div className="two-col">
                <div className="stat-card">
                  <div className="avatar" aria-hidden>
                    <svg viewBox="0 0 24 24" width="36" height="36">
                      <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-3.866 0-7 3.134-7 7 0 .552.448 1 1 1h12c.552 0 1-.448 1-1 0-3.866-3.134-7-7-7z"/>
                    </svg>
                  </div>
                  <div className="stat-title">會員人數</div>
                  <div className="stat-value">{(animatedMembers || 0).toLocaleString()}</div>
                </div>
                <div className="chart-card">
                  <div className="chart-title">來自區域</div>
                  <div
                    className="pie"
                    aria-label="來自區域圓餅圖"
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
                <div className="kpi-card">
                  <div className="kpi-head">
                    <div className="kpi-icon kpi-icon--blue" aria-hidden>
                      <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1zm1 17.93V20h-2v-1.07A6.002 6.002 0 0 1 6 13h2a4 4 0 0 0 8 0c0-1.86-1.28-3.41-3-3.86V7h-2v2.06A4.002 4.002 0 0 0 8 13H6c0-2.97 2.16-5.43 5-5.91V6h2v1.09c2.84.48 5 2.94 5 5.91a6.002 6.002 0 0 1-5 5.93z"/>
                      </svg>
                    </div>
                    <div className="kpi-title">平均消費金額</div>
                  </div>
                  <div className="kpi-main">
                    <div className="kpi-value">$1,280</div>
                    <div className="kpi-trend up"><span className="arrow">▲</span> 5.2%</div>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-head">
                    <div className="kpi-icon kpi-icon--green" aria-hidden>
                      <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M15 14c2.761 0 5-2.239 5-5S17.761 4 15 4s-5 2.239-5 5 2.239 5 5 5zM6 22a7 7 0 0 1 14 0H6zM7 9h2V7h2V5H9V3H7v2H5v2h2v2z"/>
                      </svg>
                    </div>
                    <div className="kpi-title">本月新增會員</div>
                  </div>
                  <div className="kpi-main">
                    <div className="kpi-value">532</div>
                    <div className="kpi-trend up"><span className="arrow">▲</span> 12.4%</div>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-head">
                    <div className="kpi-icon kpi-icon--orange" aria-hidden>
                      <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
                      </svg>
                    </div>
                    <div className="kpi-title">活躍率</div>
                  </div>
                  <div className="kpi-main">
                    <div className="kpi-value">68%</div>
                    <div className="kpi-trend down"><span className="arrow">▼</span> 1.3%</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="page-inner full">
              <div className="media" role="img" aria-label="頁面二圖片"></div>
              <p className="paragraph">這是一段示意文字，描述第二頁的內容重點。</p>
            </div>
          )}
        </div>

        {/* Right arrow: hidden on last page */}
        <div className="nav right">
          {page < 1 && (
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

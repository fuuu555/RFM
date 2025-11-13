import React, { useEffect, useMemo, useState } from 'react'

import ViewerOverview from './ViewerOverview'
import ViewerInsights from './ViewerInsights'

const buildRealtimeMock = (seed = 0) => {
  const days = Array.from({ length: 30 }, (_, idx) => ({
    day: idx + 1,
    value: Math.round(2000 + Math.sin((idx + seed) / 3) * 1500 + idx * 180 + seed * 250),
  }))

  return {
    updatedAt: '2025-11-12 02:43:57',
    compareDate: '2025-11-11',
    days,
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
            <ViewerOverview
              monthLabel={monthLabel}
              animatedMembers={animatedMembers}
              regions={regions}
              pieBackground={pieBackground}
              activeIdx={activeIdx}
              setActiveIdx={setActiveIdx}
              onPieMove={onPieMove}
              onPieLeave={onPieLeave}
              tip={tip}
              kpis={kpis}
              renderTrend={renderTrend}
            />
          ) : (
            <ViewerInsights
              monthLabel={monthLabel}
              realtime={realtime}
              chartGeom={chartGeom}
              formatMetricValue={formatMetricValue}
              formatTrend={formatTrend}
            />
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

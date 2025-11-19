import React, { useEffect, useMemo, useState } from 'react'

import ViewerOverview from './ViewerOverview'
import ViewerInsights from './ViewerInsights'
import ViewerModels from './ViewerModels'
import ViewerSegments from './ViewerSegments'
import ViewerOperational from './ViewerOperational'

// 開發用假資料（當 API 取得失敗或初始顯示用）
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
  // ... 省略 ...（其他月份資料保留 mock 即可）
]

const INITIAL_ANALYTICS = {
  refreshedAt: 'Loading...',
  stage3: {
    description: 'KMeans (k = 5)',
    silhouette: 0.0,
    clusters: [],
  },
  stage4: {
    metrics: {
        trainRows: 0, testRows: 0, silhouette: 0, avgBasket: 0, overallTrend: 0
    },
    segments: [],
  },
  stage5: {
    bestModel: 'Loading...',
    models: [],
  },
  stage6: {
    models: [],
  },
  // 【重要】新增 SHAP 圖像占位符
  shap_images: {
      summary: null,
      beeswarm: null
  }
}

const TOTAL_PAGES = 5
const API_BASE = 'http://localhost:8000' // API 端點

export default function Viewer({ file, onReset }) {
  const [page, setPage] = useState(0)
  const [logoSrc, setLogoSrc] = useState('/aonix.png')
  const [monthIndex, setMonthIndex] = useState(0)
  const [tip, setTip] = useState({ show: false, x: 0, y: 0, label: '', value: 0, color: '#000' })
  const [activeIdx, setActiveIdx] = useState(null)
  const [animatedMembers, setAnimatedMembers] = useState(0)
  

// 資料用的 State（初始為 Mock，API 取得後會覆寫）
  const [displayData, setDisplayData] = useState(MOCK_MONTHLY_DATA[0]) 
  const [analyticsData, setAnalyticsData] = useState(INITIAL_ANALYTICS)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/report/latest`)
        if (!res.ok) {
          console.warn("report/latest returned non-ok:", res.status)
          return
        }
        const data = await res.json()

        // Safe helpers
        const safeNum = (v) => (v === null || v === undefined ? null : Number(v))
        const safeStr = (v) => (v === null || v === undefined ? null : String(v))

        // Overview KPIs
        const overview = data.overview || {}
        const kpisFromOverview = overview.kpis || {}
        const kpis = {
          totalSales: safeNum(kpisFromOverview.totalSales),
          salesTrend: safeNum(kpisFromOverview.salesTrend),
          totalOrders: safeNum(kpisFromOverview.totalOrders),
          ordersTrend: safeNum(kpisFromOverview.ordersTrend),
          totalMembers: safeNum(kpisFromOverview.totalMembers),
          membersTrend: safeNum(kpisFromOverview.membersTrend),
          averageSpend: safeNum(kpisFromOverview.averageSpend),
          averageTrend: safeNum(kpisFromOverview.averageTrend),
          engagement: safeNum(kpisFromOverview.engagement),
          engagementTrend: safeNum(kpisFromOverview.engagementTrend),
          premiumMembers: safeNum(kpisFromOverview.premiumMembers),
          premiumTrend: safeNum(kpisFromOverview.premiumTrend)
        }

        // Stage4 metrics & segments
        const stage4 = data.stage4 || {}
        const stage4Metrics = stage4.metrics || { trainRows: null, testRows: null, silhouette: null, avgBasket: null, overallTrend: null }
        const safeStage4Metrics = {
          trainRows: safeNum(stage4Metrics.trainRows),
          testRows: safeNum(stage4Metrics.testRows),
          silhouette: safeNum(stage4Metrics.silhouette),
          avgBasket: safeNum(stage4Metrics.avgBasket),
          overallTrend: safeNum(stage4Metrics.overallTrend)
        }
        const stage4Segments = Array.isArray(stage4.segments) ? stage4.segments : []

        // Stage5 evaluation -> normalize to array of models (accuracy values only)
        const evals = data.evaluation || {}
        const stage5Eval = evals.stage5 || {}
        const models = []
        if (stage5Eval && typeof stage5Eval === 'object') {
          Object.entries(stage5Eval).forEach(([name, val]) => {
            if (val === null || val === undefined) {
              models.push({ name, accuracy: null, f1_weighted: null })
            } else if (typeof val === 'number') {
              models.push({ name, accuracy: Number(val), f1_weighted: null })
            } else if (typeof val === 'object') {
              models.push({
                name,
                accuracy: val.accuracy != null ? Number(val.accuracy) : null,
                f1_weighted: val.f1_weighted != null ? Number(val.f1_weighted) : null
              })
            } else {
              models.push({ name, accuracy: null, f1_weighted: null })
            }
          })
        }

        // Stage6 evaluation (similar format to stage5)
        const stage6Eval = evals.stage6 || {}
        const stage6Models = []
        if (stage6Eval && typeof stage6Eval === 'object') {
          Object.entries(stage6Eval).forEach(([name, val]) => {
            if (val === null || val === undefined) {
              stage6Models.push({ name, accuracy: null })
            } else if (typeof val === 'number') {
              stage6Models.push({ name, accuracy: Number(val) })
            } else if (typeof val === 'object') {
              stage6Models.push({
                name,
                accuracy: val.accuracy != null ? Number(val.accuracy) : null
              })
            } else {
              stage6Models.push({ name, accuracy: null })
            }
          })
        }

        // SHAP images (may be null)
        const shapImages = data.shap_images || { summary: null, beeswarm: null }

        setAnalyticsData((prev) => ({
          ...prev,
          refreshedAt: new Date().toISOString(),
          stage3: data.stage3 || prev.stage3,
          stage4: {
            metrics: safeStage4Metrics,
            segments: stage4Segments
          },
          stage5: {
            bestModel: null,
            models
          },
          stage6: {
            models: stage6Models
          },
          shap_images: shapImages
        }))
        
        // API データで displayData と kpis を更新
        if (overview && overview.kpis) {
          setDisplayData((prev) => ({
            ...prev,
            totalMembers: overview.kpis.totalMembers || prev.totalMembers,
            regions: overview.regions || prev.regions,
            kpis: {
              averageSpend: overview.kpis.averageSpend,
              averageTrend: overview.kpis.averageTrend,
              premiumMembers: overview.kpis.premiumMembers,
              premiumTrend: overview.kpis.premiumTrend || 0,
              engagement: overview.kpis.engagement,
              engagementTrend: overview.kpis.engagementTrend,
            },
            realtime: {
              updatedAt: overview.lastDate || prev.realtime.updatedAt,
              compareDate: prev.realtime.compareDate,
              days: overview.chart || prev.realtime.days,
              keyMetrics: [
                { title: '本月銷售額', value: overview.kpis.totalSales, trend: overview.kpis.salesTrend },
                { title: '本月訂單數', value: overview.kpis.totalOrders, trend: overview.kpis.ordersTrend },
                { title: '本月活躍會員', value: overview.kpis.totalMembers, trend: overview.kpis.membersTrend },
                { title: '高價值會員', value: overview.kpis.premiumMembers, trend: overview.kpis.premiumTrend || 0 },
              ],
            },
          }))
        }
      } catch (e) {
        console.error("Failed to fetch report:", e)
      }
    }
    fetchData()
  }, [])
  const { totalMembers, regions, kpis, realtime } = displayData
  const monthLabel = displayData.label

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

  // 【變更】呼叫 ViewerOperational 等元件時傳入 analyticsData
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
          ) : page === 1 ? (
            <ViewerInsights
              monthLabel={monthLabel}
              realtime={realtime}
              chartGeom={chartGeom}
              formatMetricValue={formatMetricValue}
              formatTrend={formatTrend}
            />
          ) : page === 2 ? (
            <ViewerModels analytics={analyticsData} />
          ) : page === 3 ? (
            <ViewerSegments analytics={analyticsData} monthLabel={monthLabel} />
          ) : (
            // 【変更】ViewerOperational に実データを渡す
            <ViewerOperational analytics={analyticsData} />
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
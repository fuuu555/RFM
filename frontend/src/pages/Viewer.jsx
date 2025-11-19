import React, { useEffect, useMemo, useState } from 'react'

import Spinner from '../shared/Spinner.jsx'
import ViewerOverview from './ViewerOverview'
import ViewerInsights from './ViewerInsights'
import ViewerModels from './ViewerModels'
import ViewerSegments from './ViewerSegments'
import ViewerOperational from './ViewerOperational'
import ViewerShap from './ViewerShap'

// 初期表示用の空データ（APIが返るまでのプレースホルダ）
const emptyRealtime = { updatedAt: '', compareDate: '', days: [], keyMetrics: [] }
const INITIAL_DISPLAY = {
  label: '',
  totalMembers: 0,
  regions: [],
  kpis: {},
  realtime: emptyRealtime,
}

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
      beeswarm: null,
      models: {}
  },
  // 【新增】SHAP 特徵重要度和值
  shap_importance: {},
  shap_values: {}
}

const TOTAL_PAGES = 6
const API_BASE = 'http://localhost:8000' // API 端點

export default function Viewer({ file, initialPeriods = null, onReset }) {
  const [page, setPage] = useState(0)
  const [logoSrc, setLogoSrc] = useState('/aonix.png')
  // replaced by selectedPeriodIdx
  const [tip, setTip] = useState({ show: false, x: 0, y: 0, label: '', value: 0, color: '#000' })
  const [activeIdx, setActiveIdx] = useState(null)
  const [animatedMembers, setAnimatedMembers] = useState(0)
  

  // 資料用的 State（初期は空データ、APIで上書き）
  const [displayData, setDisplayData] = useState(INITIAL_DISPLAY)
  const [analyticsData, setAnalyticsData] = useState(INITIAL_ANALYTICS)
  const [availablePeriods, setAvailablePeriods] = useState([])
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(0)
  const [periodMode, setPeriodMode] = useState('month') // 'month' or 'year'
  const [isFetching, setIsFetching] = useState(false)

  // フェッチ関数：periodを指定してレポートを取得し、状態を更新する
  const fetchReportForPeriod = async (period = null) => {
    try {
      setIsFetching(true)
      const url = period ? `${API_BASE}/report/latest?period=${encodeURIComponent(period)}` : `${API_BASE}/report/latest`
      const res = await fetch(url)
      if (!res.ok) {
        console.warn('report/latest returned non-ok:', res.status)
        return null
      }
      const data = await res.json()
      return data
    } catch (e) {
      console.error('Failed to fetch report:', e)
      return null
    }
    finally {
      // ★【修正】isFetching を false に設定 (finally ブロック内で実行)
      setIsFetching(false) 
    }
  }

  // If Upload provided initialPeriods, prefer those as initial selection immediately
  useEffect(() => {
    if (initialPeriods && Array.isArray(initialPeriods) && initialPeriods.length > 0) {
      setAvailablePeriods(initialPeriods)
      setSelectedPeriodIdx(0)
      // fetch report for the latest provided period right away
      (async () => {
        const p = periodMode === 'month' ? initialPeriods[0] : initialPeriods[0].slice(0, 4)
        try {
          const res = await fetch(`${API_BASE}/report/latest?period=${encodeURIComponent(p)}`)
          if (res.ok) {
            const data = await res.json()
            if (data) applyReportData(data)
          } else {
            console.warn('Preview report request failed', res.status)
          }
        } catch (e) {
          console.warn('Failed to fetch preview report for uploaded file', e)
        }
      })()
    }
  }, [initialPeriods])

  // レスポンスを解析して状態を更新するヘルパ（先に定義して useEffect から参照可能にする）
  function applyReportData(data) {
    const safeNum = (v) => (v === null || v === undefined ? null : Number(v))
    const overview = data.overview || {}
    const stage4 = data.stage4 || {}
    const stage4Metrics = stage4.metrics || { trainRows: null, testRows: null, silhouette: null, avgBasket: null, overallTrend: null }
    const safeStage4Metrics = {
      trainRows: safeNum(stage4Metrics.trainRows),
      testRows: safeNum(stage4Metrics.testRows),
      silhouette: safeNum(stage4Metrics.silhouette),
      avgBasket: safeNum(stage4Metrics.avgBasket),
      overallTrend: safeNum(stage4Metrics.overallTrend)
    }

    // SHAP data
    const shapImages = data.shap_images || { summary: null, beeswarm: null, models: {} }
    const shapImportance = data.shap_importance || {}
    const shapValues = data.shap_values || {}

    setAnalyticsData((prev) => ({
      ...prev,
      refreshedAt: new Date().toISOString(),
      stage3: data.stage3 || prev.stage3,
      stage4: {
        metrics: safeStage4Metrics,
        segments: Array.isArray(stage4.segments) ? stage4.segments : []
      },
      stage5: { bestModel: null, models: [] },
      stage6: { models: [] },
      shap_images: shapImages,
      shap_importance: shapImportance,
      shap_values: shapValues
    }))

    if (overview && overview.kpis) {
      setDisplayData((prev) => ({
        ...prev,
        label: overview._period || overview.lastDate || prev.label,
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
  }

  // 初回マウント時：まず available_periods を取得し、最新期間でデータを取得する
  useEffect(() => {
    let mounted = true
    const init = async () => {
      const base = await fetchReportForPeriod()
      if (!mounted) return
      const periods = (base && base.overview && Array.isArray(base.overview.available_periods)) ? base.overview.available_periods : []
      setAvailablePeriods(periods)
      if (periods.length > 0) {
        setSelectedPeriodIdx(0)
        const data = await fetchReportForPeriod(periods[0])
        if (!mounted) return
        if (data) applyReportData(data)
      } else if (base) {
        // 期間情報がなければそのまま全体レポートを適用
        applyReportData(base)
      }
    }
    init()
    return () => { mounted = false }
  }, [])

  // 選択期間が変更されたら再取得（modeに応じて月 or 年を選択）
  useEffect(() => {
    if (!availablePeriods || availablePeriods.length === 0) return
    const years = Array.from(new Set(availablePeriods.map((p) => p.slice(0, 4))))
    const target = periodMode === 'month' ? availablePeriods[selectedPeriodIdx] : years[selectedPeriodIdx]
    let mounted = true
    const doFetch = async () => {
      const data = await fetchReportForPeriod(target)
      if (!mounted) return
      if (data) applyReportData(data)
    }
    doFetch()
    return () => { mounted = false }
  }, [selectedPeriodIdx, availablePeriods, periodMode])

  
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
  }, [selectedPeriodIdx])

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
            <label htmlFor="month-select-header">期間</label>
            <div className="period-mode-toggle" style={{ display: 'inline-flex', gap: 8, marginRight: 8 }}>
              <button
                className={`mode-btn ${periodMode === 'month' ? 'active' : ''}`}
                onClick={() => { setPeriodMode('month'); setSelectedPeriodIdx(0) }}
                type="button"
              >月</button>
              <button
                className={`mode-btn ${periodMode === 'year' ? 'active' : ''}`}
                onClick={() => { setPeriodMode('year'); setSelectedPeriodIdx(0) }}
                type="button"
              >年</button>
            </div>
            <select
              id="month-select-header"
              value={selectedPeriodIdx}
              onChange={(e) => setSelectedPeriodIdx(Number(e.target.value))}
            >
              {availablePeriods && availablePeriods.length > 0 ? (
                periodMode === 'month' ? (
                  availablePeriods.map((p, idx) => (
                    <option key={p} value={idx}>{p.replace('-', ' / ')}</option>
                  ))
                ) : (
                  Array.from(new Set(availablePeriods.map((p) => p.slice(0, 4)))).map((y, idx) => (
                    <option key={y} value={idx}>{y}</option>
                  ))
                )
              ) : (
                <option value={0}>全期間</option>
              )}
            </select>
          </div>
        </div>
      </header>

      <main className="viewer-body">
        {/* ローディングオーバーレイの表示 */}
        {isFetching && (
          <div className="overlay" style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
            <div className="overlay-card" style={{ padding: '16px 30px' }}>
              <Spinner size={24} />
              <div className="overlay-text">正在取得分析數據...</div>
            </div>
          </div>
        )}
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
          ) : page === 4 ? (
            <ViewerOperational analytics={analyticsData} />
          ) : (
            <ViewerShap analytics={analyticsData} />
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
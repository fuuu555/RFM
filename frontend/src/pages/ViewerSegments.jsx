import React from 'react'

const API_BASE = 'http://localhost:8000'

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '-'
  return `£${typeof value === 'number' ? value.toLocaleString() : value}`
}

const formatFrequency = (freq) => {
  if (freq === null || freq === undefined) return '-'
  const f = typeof freq === 'string' ? parseFloat(freq) : freq
  return isNaN(f) ? '-' : `${f.toFixed(1)} 件`
}

export default function ViewerSegments({ analytics, monthLabel }) {
  const { stage4 } = analytics

  const safeNum = (v) => (v === null || v === undefined ? 0 : Number(v))

  const normalizePeriod = (label) => {
    if (!label) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return label.slice(0, 7)
    if (/^\d{4}-\d{2}$/.test(label) || /^\d{4}$/.test(label)) return label
    return ''
  }

  const downloadSegment = async (clusterId) => {
    try {
      const p = normalizePeriod(monthLabel)
      const periodQuery = p ? `?period=${encodeURIComponent(p)}` : ''
      const url = `${API_BASE}/stage4/segment/${clusterId}/download${periodQuery}`
      const res = await fetch(url)
      if (!res.ok) {
        const txt = await res.text().catch(() => null)
        alert(`ダウンロードに失敗しました: ${res.status} ${txt || ''}`)
        return
      }
      const blob = await res.blob()
      const disp = res.headers.get('content-disposition') || ''
      let filename = `segment_${clusterId}_customers.csv`
      const m = disp.match(/filename="?([^";]+)"?/)
      if (m) filename = m[1]
      const link = document.createElement('a')
      link.href = window.URL.createObjectURL(blob)
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(link.href)
    } catch (e) {
      console.error(e)
      alert('ダウンロードに失敗しました')
    }
  }

  const metricCards = [
    {
      icon: '📦',
      label: '月交易數',
      value: (safeNum(stage4.metrics?.monthlyTxn) || 3245).toLocaleString(),
      sub: '期間内合計',
    },
    {
      icon: '🎯',
      label: '平均購物籃金額',
      value: `£${(safeNum(stage4.metrics?.avgBasket) || 250).toLocaleString()}`,
      sub: '全顧客平均',
    },
    {
      icon: '🔁',
      label: '回購天數',
      value: `${safeNum(stage4.metrics?.repeatDays) || 21} 日`,
      sub: '平均購購間隔',
    },
  ]

  return (
    <div className="page-inner full models-layout stage4-layout">
      <section className="models-section">
        <div className="models-section-head stage4-section-head">
          <div>
            <p className="models-eyebrow">Stage 4 · 客群分層</p>
            <h2 className="models-title">顧客分群分析（{monthLabel}）</h2>
            <p className="models-subtitle">
              訓練: {(safeNum(stage4.metrics?.trainRows) || 0).toLocaleString()} 件 | 測試:{' '}
              {(safeNum(stage4.metrics?.testRows) || 0).toLocaleString()} 件 | Silhouette:{' '}
              {(safeNum(stage4.metrics?.silhouette) || 0).toFixed(3)}
            </p>
          </div>
        </div>

        <div className="segment-board segment-board--expanded">
          {stage4.segments && stage4.segments.length > 0 ? (
            stage4.segments.map((segment) => (
              <div key={`${segment.clusterId || segment.name}`} className="segment-row">
                <div className="segment-meta">
                  <div className="segment-meta-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ color: segment.color || '#2563eb', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-block' }}>{segment.name || `Cluster ${segment.clusterId}`}</span>
                      <button
                        type="button"
                        onClick={() => downloadSegment(segment.clusterId)}
                        title="CSVダウンロード"
                        aria-label={`Download CSV for ${segment.name || `Cluster ${segment.clusterId}`}`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 4,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                          <path d="M12 3v10" stroke={segment.color || '#2563eb'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 11l4 4 4-4" stroke={segment.color || '#2563eb'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M21 21H3" stroke={segment.color || '#2563eb'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </h3>
                    <span className="segment-share" style={{ backgroundColor: (segment.color || '#2563eb') + '20', marginLeft: 6 }}>
                      {segment.share ?? 0}% ({safeNum(segment.count) || 0} 人)
                    </span>
                  </div>

                  <p className="segment-stats">
                    客單價 {formatCurrency(segment.avgBasket)} · {formatFrequency(segment.frequency)}
                  </p>
                  <p className="segment-story">{segment.story || '詳細分群資訊'}</p>
                  <div className="segment-tags" aria-label="偏好商品類型">
                    {segment.focusProducts && segment.focusProducts.length > 0 ? (
                      segment.focusProducts.map((tag) => (
                        <span key={`${segment.name}-${tag}`} className="segment-tag">
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="segment-tag">-</span>
                    )}
                  </div>
                </div>
                <div
                  className="segment-bar"
                  aria-hidden
                  style={{ backgroundColor: segment.color + '40' }}
                >
                  <span
                    style={{
                      width: `${segment.share ?? 0}%`,
                      backgroundColor: segment.color || '#2563eb',
                    }}
                  />
                </div>
                <div className={`segment-trend ${(segment.trend || 0) >= 0 ? 'up' : 'down'}`}>
                  <strong>
                    {(segment.trend || 0) >= 0 ? `+${segment.trend || 0}%` : `${segment.trend || 0}%`}
                  </strong>
                  <small>{segment.trendLabel || '-'}</small>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
              <p>找不到分群資料</p>
            </div>
          )}
        </div>
      </section>

      <section className="models-section models-section--compact segment-visuals">
        <div className="segment-cards">
          <div className="segment-metrics card-hoverable">
            {metricCards.map((card) => (
              <div key={card.label} className="metric-card">
                <span className="metric-icon" aria-hidden>
                  {card.icon}
                </span>
                <div>
                  <p>{card.label}</p>
                  <strong>{card.value}</strong>
                  <span>{card.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}

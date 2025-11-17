import React from 'react'

const formatCurrency = (value) => `NT$${value.toLocaleString()}`

export default function ViewerSegments({ analytics, monthLabel }) {
  const { stage4 } = analytics

  const metricCards = [
    {
      icon: '📦',
      label: '月交易數',
      value: (stage4.metrics.monthlyTxn ?? 3245).toLocaleString(),
      sub: '近 30 日',
    },
    {
      icon: '🎯',
      label: 'Top Line 貢獻',
      value: stage4.metrics.toplineShare ?? '62%',
      sub: stage4.metrics.toplineNote ?? '主要來自「價值型會員」',
    },
    {
      icon: '🔁',
      label: '回購天數',
      value: `${stage4.metrics.repeatDays ?? 21} 天`,
      sub: '平均間隔',
    },
  ]

  return (
    <div className="page-inner full models-layout stage4-layout">
      <section className="models-section">
        <div className="models-section-head stage4-section-head">
          <div>
            <p className="models-eyebrow">Stage 4 · 客群分層</p>
            <h2 className="models-title">會員切片（{monthLabel}）</h2>
            <p className="models-subtitle">
              訓練 {stage4.metrics.trainRows.toLocaleString()} 筆 · 測試{' '}
              {stage4.metrics.testRows.toLocaleString()} 筆 · silhouette{' '}
              {stage4.metrics.silhouette.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="segment-board segment-board--expanded">
          {stage4.segments.map((segment) => (
            <div key={segment.name} className="segment-row">
              <div className="segment-meta">
                <div className="segment-meta-head">
                  <h3>{segment.name}</h3>
                  <span className="segment-share">{segment.share}%</span>
                </div>
                <p className="segment-stats">
                  客單 {formatCurrency(segment.avgBasket)} · {segment.frequency}
                </p>
                <p className="segment-story">{segment.story}</p>
                <div className="segment-tags" aria-label="偏好商品類型">
                  {segment.focusProducts.map((tag) => (
                    <span key={`${segment.name}-${tag}`} className="segment-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="segment-bar" aria-hidden>
                <span style={{ width: `${segment.share}%` }} />
              </div>
              <div className={`segment-trend ${segment.trend >= 0 ? 'up' : 'down'}`}>
                <strong>{segment.trend >= 0 ? `+${segment.trend}%` : `${segment.trend}%`}</strong>
                <small>{segment.trendLabel}</small>
              </div>
            </div>
          ))}
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

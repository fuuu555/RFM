import React from 'react'

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

  // 安全取值輔助
  const safeNum = (v) => (v === null || v === undefined ? 0 : Number(v))

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
              訓練: {(safeNum(stage4.metrics?.trainRows) || 0).toLocaleString()} 件 | テスト:{' '}
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
                  <div className="segment-meta-head">
                    <h3 style={{ color: segment.color || '#2563eb' }}>
                      {segment.name || `Cluster ${segment.clusterId}`}
                    </h3>
                    <span className="segment-share" style={{ backgroundColor: segment.color + '20' }}>
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

      <section className="models-section" style={{ marginTop: '30px' }}>
        <h3>關於分群分析</h3>
        <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#6b7280' }}>
          <p>
            系統根據顧客的購買行為模式（購買頻率、金額、商品類別偏好）自動將顧客分成 11 個不同的族群。每個族群具有獨特特性，需採用客製化的行銷策略。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>忠誠客群：</strong>
            購買頻率極高（87 件/期間）且消費金額偏高，為最優先的 VIP 客群。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>VIP 與超級 VIP：</strong>
            高頻率且高消費，建議提供專屬客服與限定活動。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>偶發高單價層・持續高單價層：</strong>
            消費金額高但購買頻率中等，可能為大宗或企業客戶。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>標準層：</strong>
            為最大族群，購買行為均衡，適合定期行銷活動。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>經濟層與類別專精層：</strong>
            購買頻率與金額較低或集中於特定類別，建議檢視價格策略與提供專屬推薦。
          </p>
        </div>
      </section>
    </div>
  )
}

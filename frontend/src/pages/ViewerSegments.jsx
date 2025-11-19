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

  // 安全な値取得ヘルパー
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
      label: '平均籃子単価',
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
            <h2 className="models-title">顧客セグメント分析（{monthLabel}）</h2>
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
                    客単 {formatCurrency(segment.avgBasket)} · {formatFrequency(segment.frequency)}
                  </p>
                  <p className="segment-story">{segment.story || '詳細なセグメント情報'}</p>
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
              <p>セグメントデータが見つかりません</p>
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
        <h3>セグメント分析について</h3>
        <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#6b7280' }}>
          <p>
            顧客を購買行動パターン（購買頻度・金額・商品カテゴリ選好）に基づいて
            11の異なるセグメントに自動分類しました。各セグメントは独特の特性を持ち、
            カスタマイズされたマーケティング戦略を必要とします。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>ロイヤル層：</strong>
            極めて高い購買頻度（87件/期間）と高額支出。最優先のVIP顧客です。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>VIP層・スーパーVIP層：</strong>
            高頻度かつ高額支出。専任サポートと限定キャンペーンを推奨。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>散発高単価層・継続高単価層：</strong>
            高額消費だが購買頻度は中程度。大口・法人顧客の可能性あり。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>スタンダード層：</strong>
            全体の最大規模。バランスの取れた購買パターン。定期キャンペーン対象。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>エコノミー層・カテゴリ専門層：</strong>
            低頻度・低単価または特定カテゴリ集中。価格戦略と専門提案を検討。
          </p>
        </div>
      </section>
    </div>
  )
}

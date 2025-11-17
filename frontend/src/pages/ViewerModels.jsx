import React, { useMemo } from 'react'

export default function ViewerModels({ analytics }) {
  const { stage3, refreshedAt } = analytics

  const maxShare = useMemo(
    () => Math.max(...stage3.clusters.map((cluster) => cluster.share)),
    [stage3.clusters]
  )

  const keywordCloud = useMemo(() => {
    const pairs = stage3.clusters.flatMap((cluster) =>
      cluster.keywords.map((keyword) => ({
        keyword,
        cluster: cluster.name,
      }))
    )
    return pairs.slice(0, 10)
  }, [stage3.clusters])

  return (
    <div className="page-inner full models-layout stage3-layout">
      <section className="models-section">
        <div className="models-section-head">
          <div>
            <p className="models-eyebrow">Stage 3 · 商品分群</p>
            <h2 className="models-title">商品分群結果（5 類）</h2>
          </div>
          <div className="models-pill">資料時間 {refreshedAt}</div>
        </div>
        <div className="models-grid">
          {stage3.clusters.map((cluster) => (
            <article key={cluster.id} className="models-card card-hoverable">
              <header className="models-card-head">
                <span className="badge">Cluster {cluster.id}</span>
                <h3>{cluster.name}</h3>
              </header>
              <div className="models-chip-row">
                {cluster.keywords.map((keyword) => (
                  <span key={`${cluster.id}-${keyword}`} className="chip">
                    {keyword}
                  </span>
                ))}
              </div>
              <div className="models-progress" role="img" aria-label="cluster share">
                <div
                  className="models-progress-bar"
                  style={{
                    width: `${(cluster.share / maxShare) * 100}%`,
                  }}
                />
              </div>
              <div className="models-meta-row">
                <span>Top SKU {cluster.topSkus}</span>
                <span>退貨率 {cluster.returnRate}%</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="models-section models-section--compact cluster-analytics">
        <div className="cluster-visuals">
          <div className="cluster-share card-hoverable">
            <div className="cluster-bars-head">
              <h3>比例 vs 平均單價</h3>
            </div>
            <div className="cluster-share-rows">
              <div className="cluster-share-row cluster-share-row--top">
                {stage3.clusters.slice(0, 3).map((cluster) => {
                  const angle = (cluster.share / 100) * 360
                  const ringStyle = {
                    background: `conic-gradient(#3b82f6 ${angle}deg, rgba(59, 130, 246, 0.15) ${angle}deg)`,
                  }
                  return (
                    <div key={cluster.id} className="cluster-share-card">
                      <div className="share-ring" style={ringStyle}>
                        <span>{cluster.share}%</span>
                      </div>
                      <div className="share-meta">
                        <strong>{cluster.name}</strong>
                        <p>Avg NT${cluster.avgPrice.toLocaleString()}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="cluster-share-row cluster-share-row--bottom">
                {stage3.clusters.slice(3).map((cluster) => {
                  const angle = (cluster.share / 100) * 360
                  const ringStyle = {
                    background: `conic-gradient(#3b82f6 ${angle}deg, rgba(59, 130, 246, 0.15) ${angle}deg)`,
                  }
                  return (
                    <div key={cluster.id} className="cluster-share-card">
                      <div className="share-ring" style={ringStyle}>
                        <span>{cluster.share}%</span>
                      </div>
                      <div className="share-meta">
                        <strong>{cluster.name}</strong>
                        <p>Avg NT${cluster.avgPrice.toLocaleString()}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="keyword-cloud card-hoverable">
            <div className="cluster-bars-head">
              <h3>熱門關鍵字</h3>
              <span>Top 10</span>
            </div>
            <ul>
              {keywordCloud.map((item) => (
                <li key={`${item.cluster}-${item.keyword}`}>
                  <strong>{item.keyword}</strong>
                  <span>{item.cluster}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

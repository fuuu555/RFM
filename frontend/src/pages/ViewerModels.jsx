import React, { useMemo, useState } from 'react'


export default function ViewerModels({ analytics }) {
  const { stage3, refreshedAt } = analytics

  const [tip, setTip] = useState({ show: false, x: 0, y: 0, label: '', value: 0, color: '#000' });
  const [activeIdx, setActiveIdx] = useState(null); // ホバー中のセグメントインデックス
  const maxShare = useMemo(
    () => Math.max(...stage3.clusters.map((cluster) => cluster.share)),
    [stage3.clusters]
  )


  // ★追加: マウスイベントハンドラ
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
        setTip(t => ({ ...t, show: false }));
        setActiveIdx(null);
        return;
    }

    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    deg = (deg + 90 + 360) % 360; // 0-360度（上から時計回り）

    const idx = pieSegments.segments.findIndex(s => deg >= s.startAngle && deg < s.endAngle);
    const cluster = pieSegments.segments[idx];
    
    if (cluster) {
        const cardRect = pie.parentElement.getBoundingClientRect();
        const x = e.clientX - cardRect.left;
        const y = e.clientY - cardRect.top;
        
        setTip({ 
            show: true, 
            x, 
            y, 
            label: cluster.name, 
            value: cluster.share, // パーセンテージを値として使用
            color: cluster.color 
        });
        setActiveIdx(idx);
    } else {
        setTip(t => ({ ...t, show: false }));
        setActiveIdx(null);
    }
  };

  const onPieLeave = () => {
    setTip(t => ({ ...t, show: false }));
    setActiveIdx(null);
  };
  const keywordCloud = useMemo(() => {
    const pairs = stage3.clusters.flatMap((cluster) =>
      cluster.keywords.map((keyword) => ({
        keyword,
        cluster: cluster.name,
      }))
    )
    return pairs.slice(0, 10)
  }, [stage3.clusters])
  // frontend/src/pages/ViewerModels.jsx の useMemo ブロックの下あたりに追加

  // ★追加★ 円グラフのセグメントと背景スタイルを計算するヘルパー
  const pieSegments = useMemo(() => {
    let start = 0
    // 5つのクラスターに割り当てる固定色
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#a855f7'] 
    
    const segments = stage3.clusters.map((cluster, i) => {
      const angle = (cluster.share / 100) * 360
      const end = start + angle
      const color = colors[i % colors.length]
      
      const segmentStyle = `${color} ${start}deg ${end}deg`
      // 角度情報も保持しておく（ツールチップ判定で使用）
      const seg = {
        ...cluster,
        color,
        startAngle: start,
        endAngle: end,
        styleSegment: segmentStyle
      }
      start = end
      return seg
    })
    
    const backgroundStyle = `conic-gradient(${segments.map(s => s.styleSegment).join(', ')})`
    
    return { segments, backgroundStyle }
  }, [stage3.clusters])

  return (
    <div className="page-inner full models-layout stage3-layout">
      <section className="models-section">
        <div className="models-section-head">
          <div>
            <p className="models-eyebrow">Stage 3 · 商品分群</p>
            <h2 className="models-title">商品分群結果（{stage3.clusters.length} 類）</h2>
          </div>
        </div>
        <div className="models-grid">
          {stage3.clusters.map((cluster) => (
            <article key={cluster.id} className="models-card card-hoverable">
              <header className="models-card-head" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <div>
                  <span className="badge">Cluster {cluster.id}</span>
                  <h3 style={{marginTop: 4}}>{cluster.name}</h3>
                </div>
                <div>
                  <a
                    className="download-link"
                    href={`/stage3/cluster/${cluster.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="下載此群組的所有商品為CSV格式"
                    style={{textDecoration: 'none', color: 'inherit'}}
                  >
                    {/* simple download icon */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M21 21H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </a>
                </div>
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
          {/* 【修正】円グラフコンポーネントに置き換え */}
          <div className="segment-pie card-hoverable" style={{ position: 'relative' }}>
            <div className="cluster-bars-head">
              <h3>商品分群規模分佈</h3>
              <p className="models-subtitle">（總共 {stage3.clusters.length} 群）</p>
              <p style={{ marginTop: 6, fontSize: '0.85em', color: 'var(--muted)' }}>註：此比例代表屬於該叢集的產品數量比率（與Top SKU數量或銷售額比例不同）。</p>
            </div>
            
            {/* 円グラフ本体: SVG でセグメントを個別に描画してホバーで拡大 */}
            <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
              <svg
                width="160"
                height="160"
                viewBox="0 0 160 160"
                role="img"
                aria-label="商品分群比率円グラフ"
                style={{ overflow: 'visible' }}
              >
                {pieSegments.segments.map((s, i) => {
                  const cx = 80
                  const cy = 80
                  const outerR = 80
                  const innerR = 56 // matches CSS inset

                  const start = s.startAngle
                  const end = s.endAngle
                  const largeArc = end - start > 180 ? 1 : 0

                  const polarToCartesian = (cX, cY, r, angleDeg) => {
                    const rad = ((angleDeg - 90) * Math.PI) / 180.0
                    return {
                      x: cX + r * Math.cos(rad),
                      y: cY + r * Math.sin(rad),
                    }
                  }

                  const outerStart = polarToCartesian(cx, cy, outerR, start)
                  const outerEnd = polarToCartesian(cx, cy, outerR, end)
                  const innerStart = polarToCartesian(cx, cy, innerR, start)
                  const innerEnd = polarToCartesian(cx, cy, innerR, end)

                  const d = [
                    `M ${cx} ${cy}`,
                    `L ${outerStart.x} ${outerStart.y}`,
                    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
                    `L ${innerEnd.x} ${innerEnd.y}`,
                    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
                    'Z',
                  ].join(' ')

                  // explode effect: when active, translate outward along bisector
                  const mid = (start + end) / 2
                  const midRad = ((mid - 90) * Math.PI) / 180.0
                  const offset = i === activeIdx ? 8 : 0
                  const tx = Math.cos(midRad) * offset
                  const ty = Math.sin(midRad) * offset

                  return (
                    <path
                      key={s.id}
                      d={d}
                      fill={s.color}
                      stroke="#fff"
                      strokeWidth="0.5"
                      transform={`translate(${tx}, ${ty})`}
                      onMouseEnter={(e) => {
                        const cardRect = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect()
                        const x = e.clientX - cardRect.left
                        const y = e.clientY - cardRect.top
                        setTip({ show: true, x, y, label: s.name, value: s.share, color: s.color })
                        setActiveIdx(i)
                      }}
                      onMouseMove={(e) => {
                        const cardRect = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect()
                        const x = e.clientX - cardRect.left
                        const y = e.clientY - cardRect.top
                        setTip((t) => ({ ...t, x, y }))
                      }}
                      onMouseLeave={() => {
                        setTip((t) => ({ ...t, show: false }))
                        setActiveIdx(null)
                      }}
                      style={{ transition: 'transform .15s ease' }}
                    />
                  )
                })}
              </svg>

              {/* ツールチップ */}
              {tip.show && (
                <div
                  className="pie-tooltip"
                  style={{
                    position: 'absolute',
                    left: tip.x + 8,
                    top: tip.y + 8,
                    background: '#fff',
                    padding: '6px 8px',
                    borderRadius: 6,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{tip.label}</div>
                  <div style={{ fontSize: '0.85em' }}>{tip.value}%</div>
                </div>
              )}
            </div>

            {/* 凡例と詳細リスト */}
            <ul className="segment-pie-legend">
              {pieSegments.segments.map((cluster, i) => (
                <li key={cluster.id} className={i === activeIdx ? 'legend-active' : ''}>
                  <div className="legend-name">
                    <span className="legend-color" style={{ backgroundColor: cluster.color }} />
                    {cluster.name}
                  </div>
                  <div className="legend-stats">
                    <strong>{cluster.share}%</strong> 
                    <small>| Avg Price: £{cluster.avgPrice.toLocaleString()}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {/* --- ここから右側のパネル --- */}
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

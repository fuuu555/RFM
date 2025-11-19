import React, { useState } from 'react'

// APIのベースURL (backend/server.py と合わせる)
const API_BASE = 'http://localhost:8000'

export default function ViewerOperational({ analytics }) {
  const shapImages = analytics?.shap_images
  const [selectedModel, setSelectedModel] = useState('summary')

  // モデルリスト取得
  const modelList = shapImages?.models ? Object.keys(shapImages.models) : []

  return (
    <div className="page-inner full models-layout">
      <section className="models-section">
        <div className="models-section-head">
          <div>
            <p className="models-eyebrow">Stage 7 · Model Explainability</p>
            <h2 className="models-title">顧客分類AIモデルの判断根拠 (SHAP値分析)</h2>
            <p className="models-subtitle">
              どの顧客属性（購買頻度、単価、カテゴリ選好）がクラスタリングに最も影響したかを可視化
            </p>
          </div>
        </div>

        {shapImages && (shapImages.summary || shapImages.beeswarm || modelList.length > 0) ? (
          <div>
            {/* デフォルト表示 */}
            {(shapImages.summary || shapImages.beeswarm) && selectedModel === 'summary' && (
              <div className="two-col">
                {/* バープロット（特徴量重要度） */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h3 style={{ margin: 0 }}>全体的な特徴量の重要度（棒グラフ）</h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    モデルが顧客を分類する際に、どの項目（特徴量）を重視したかを示します。
                    値が大きいほど、その特徴がクラスタリング判定に重要です。
                  </p>
                  <div
                    className="media"
                    style={{
                      background: 'white',
                      border: 'none',
                      boxShadow: 'none',
                      minHeight: '400px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {shapImages.summary ? (
                      <img
                        src={`${API_BASE}${shapImages.summary}`}
                        alt="SHAP Summary Bar Plot"
                        style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                      />
                    ) : (
                      <p style={{ color: '#9ca3af' }}>棒グラフが見つかりません</p>
                    )}
                  </div>
                </div>

                {/* ビースウォームプロット（詳細分析） */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h3 style={{ margin: 0 }}>特徴量の分布と影響方向（ビースウォーム）</h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    各顧客サンプルの特徴量が、モデルの予測スコアにプラス（右）またはマイナス（左）の方向で
                    どの程度影響したかを表示。色は特徴量の値の大小を示します。
                  </p>
                  <div
                    className="media"
                    style={{
                      background: 'white',
                      border: 'none',
                      boxShadow: 'none',
                      minHeight: '400px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {shapImages.beeswarm ? (
                      <img
                        src={`${API_BASE}${shapImages.beeswarm}`}
                        alt="SHAP Beeswarm Plot"
                        style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                      />
                    ) : (
                      <p style={{ color: '#9ca3af' }}>ビースウォームが見つかりません</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* モデルごとの分析 */}
            {modelList.length > 0 && (
              <div style={{ marginTop: '30px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ marginBottom: '10px' }}>使用したモデル別の詳細分析</h3>
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {modelList.map((model) => (
                      <button
                        key={model}
                        onClick={() => setSelectedModel(model)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: selectedModel === model ? '2px solid #2563eb' : '1px solid #e5e7eb',
                          background:
                            selectedModel === model ? '#f0f9ff' : 'white',
                          color: selectedModel === model ? '#2563eb' : '#6b7280',
                          cursor: 'pointer',
                          fontWeight: selectedModel === model ? '600' : '400',
                        }}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                </div>

                {modelList.includes(selectedModel) && shapImages.models[selectedModel] && (
                  <div className="two-col">
                    {/* バープロット */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h4 style={{ margin: 0 }}>{selectedModel} - 特徴量重要度</h4>
                      <div
                        className="media"
                        style={{
                          background: 'white',
                          border: 'none',
                          boxShadow: 'none',
                          minHeight: '400px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {shapImages.models[selectedModel].bar ? (
                          <img
                            src={`${API_BASE}${shapImages.models[selectedModel].bar}`}
                            alt={`${selectedModel} Bar Plot`}
                            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                          />
                        ) : (
                          <p style={{ color: '#9ca3af' }}>バープロットが見つかりません</p>
                        )}
                      </div>
                    </div>

                    {/* プロット */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h4 style={{ margin: 0 }}>{selectedModel} - 詳細分析</h4>
                      <div
                        className="media"
                        style={{
                          background: 'white',
                          border: 'none',
                          boxShadow: 'none',
                          minHeight: '400px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {shapImages.models[selectedModel].plot ? (
                          <img
                            src={`${API_BASE}${shapImages.models[selectedModel].plot}`}
                            alt={`${selectedModel} Detailed Plot`}
                            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                          />
                        ) : (
                          <p style={{ color: '#9ca3af' }}>詳細プロットが見つかりません</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="placeholder-card">
            <p>SHAP分析データがまだありません。アップロードしたCSVに対してStage 7を実行してください。</p>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px' }}>
              パイプライン実行: <code>python -m data_layer.pipeline</code>
            </p>
          </div>
        )}
      </section>

      <section className="models-section" style={{ marginTop: '30px' }}>
        <h3>SHAP値分析について</h3>
        <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#6b7280' }}>
          <p>
            <strong>SHAP（SHapley Additive exPlanations）</strong>
            は、機械学習モデルの予測を解釈するための方法です。本分析では、ランダムフォレスト・勾配ブースティング・投票分類器が、
            顧客をどのような属性に基づいてクラスタリングしたかを可視化しています。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>棒グラフ（Feature Importance）：</strong>
            各特徴量の平均的な重要度を表示。値が大きいほど、モデルの判定に重要です。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>ビースウォーム（Beeswarm Plot）：</strong>
            個々の顧客サンプルがモデル予測にどう影響したかを表示。プロットの位置（左右）と色（特徴値の大小）から、
            その特徴がどの方向でクラスタリングに寄与したかが分かります。
          </p>
        </div>
      </section>
    </div>
  )
}
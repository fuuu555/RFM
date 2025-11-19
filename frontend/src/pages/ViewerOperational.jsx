import React, { useState } from 'react'

// API 基礎 URL（與 backend/server.py 一致）
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
            <h2 className="models-title">顧客分類AI模型的判斷依據 (SHAP值分析)</h2>
            <p className="models-subtitle">
              可視化哪些顧客屬性（購買頻率、客單價、類別偏好）對分群影響最大
            </p>
          </div>
        </div>

        {shapImages && (shapImages.summary || shapImages.beeswarm || modelList.length > 0) ? (
          <div>
            {/* 預設顯示 */}
            {(shapImages.summary || shapImages.beeswarm) && selectedModel === 'summary' && (
              <div className="two-col">
                {/* バープロット（特徴量重要度） */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h3 style={{ margin: 0 }}>整體特徵重要度（長條圖）</h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    顯示模型在分類顧客時，哪些特徵被視為較重要。數值越大表示該特徵對分群判定的影響越大。
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
                      <p style={{ color: '#9ca3af' }}>找不到長條圖</p>
                    )}
                  </div>
                </div>

                {/* ビースウォームプロット（詳細分析） */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h3 style={{ margin: 0 }}>特徵分佈與影響方向（Beeswarm）</h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    顯示各顧客樣本的特徵如何朝正向（右）或負向（左）影響模型預測；顏色代表該特徵數值的高低。
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
                      <p style={{ color: '#9ca3af' }}>找不到 Beeswarm 圖</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* モデルごとの分析 */}
            {modelList.length > 0 && (
              <div style={{ marginTop: '30px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ marginBottom: '10px' }}>各模型的詳細分析</h3>
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
                    {/* 長條圖 */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h4 style={{ margin: 0 }}>{selectedModel} - 特徵重要度</h4>
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
                          <p style={{ color: '#9ca3af' }}>找不到長條圖</p>
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
                          <p style={{ color: '#9ca3af' }}>找不到詳細圖表</p>
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
            <p>尚無 SHAP 分析資料。請對上傳的 CSV 執行 Stage 7。</p>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px' }}>
              パイプライン実行: <code>python -m data_layer.pipeline</code>
            </p>
          </div>
        )}
      </section>

      <section className="models-section" style={{ marginTop: '30px' }}>
        <h3>關於 SHAP 值分析</h3>
        <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#6b7280' }}>
          <p>
            <strong>SHAP（SHapley Additive exPlanations）</strong>
            是一種解釋機器學習模型預測的方法。本分析展示了隨機森林、梯度提升與投票分類器等模型，
            對顧客分群判定時，哪些屬性影響最大。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>長條圖（Feature Importance）：</strong>
            顯示各特徵的平均重要度，數值越大表示該特徵對模型判定越重要。
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>Beeswarm（分佈圖）：</strong>
            顯示個別顧客樣本的特徵如何影響模型預測；位置（左右）與顏色（特徵數值高低）可幫助判讀影響方向與強度。
          </p>
        </div>
      </section>
    </div>
  )
}
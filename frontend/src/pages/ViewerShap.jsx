import React, { useMemo, useState } from 'react'

// API base (match backend/server.py)
const API_BASE = (() => {
  const base = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000'
  return base.endsWith('/') ? base.slice(0, -1) : base
})()

export default function ViewerShap({ analytics }) {
  const { shap_importance = {}, shap_values = {}, shap_images = {} } = analytics

  const [selectedModel, setSelectedModel] = useState('Random Forest')
  const [expandedFeature, setExpandedFeature] = useState(null)

  // Get all available models from shap_importance
  const availableModels = useMemo(
    () => Object.keys(shap_importance || {}).filter(m => shap_importance[m]?.length > 0),
    [shap_importance]
  )

  // Get current model's importance data
  const currentModelImportance = useMemo(
    () => shap_importance[selectedModel] || [],
    [shap_importance, selectedModel]
  )

  // Get current model's SHAP values (per-sample data)
  const currentModelValues = useMemo(
    () => shap_values[selectedModel] || [],
    [shap_values, selectedModel]
  )

  // Get model images
  const modelImages = useMemo(
    () => shap_images?.models?.[selectedModel] || { bar: null, plot: null },
    [shap_images, selectedModel]
  )

  const getImageSrc = (p) => {
    if (!p) return null
    if (p.startsWith('http://') || p.startsWith('https://')) return p
    // assume path like '/artifacts/xxx.png'
    return `${API_BASE}${p}`
  }

  // Normalize importance scores (0-100 scale)
  const normalizedImportance = useMemo(() => {
    if (!currentModelImportance || currentModelImportance.length === 0) return []
    const maxImportance = Math.max(...currentModelImportance.map(d => d.importance))
    return currentModelImportance.map(d => ({
      ...d,
      normalizedScore: (d.importance / maxImportance) * 100
    }))
  }, [currentModelImportance])

  return (
    <div className="page-inner full shap-layout">
      {/* Header */}
      <section className="shap-section shap-header">
        <div className="shap-section-head">
          <div>
            <p className="shap-eyebrow">Stage 7 · Model Explainability</p>
            <h2 className="shap-title">SHAP Feature Importance Analysis</h2>
            <p className="shap-subtitle">
              Understand which features drive model predictions. Higher importance = stronger influence on model decisions.
            </p>
          </div>
          <div className="shap-pill">AI-Powered Interpretability</div>
        </div>

        {/* Model Selector */}
        <div className="shap-model-selector">
          {availableModels.map(model => (
            <button
              key={model}
              className={`model-btn ${selectedModel === model ? 'model-btn--active' : ''}`}
              onClick={() => setSelectedModel(model)}
            >
              {model}
            </button>
          ))}
        </div>
      </section>

      {/* Main Content: Two-column layout */}
      <section className="shap-content">
        {/* Left: Feature Importance Bar Chart */}
        <div className="shap-importance-panel">
          <h3 className="panel-title">Feature Importance Ranking</h3>
          <div className="importance-list">
            {normalizedImportance.length > 0 ? (
              normalizedImportance.map((item, idx) => (
                <div
                  key={`${item.feature}-${idx}`}
                  className={`importance-item ${expandedFeature === item.feature ? 'importance-item--expanded' : ''}`}
                  onClick={() => setExpandedFeature(expandedFeature === item.feature ? null : item.feature)}
                >
                  <div className="importance-row">
                    <div className="importance-label">
                      <span className="feature-rank">#{idx + 1}</span>
                      <span className="feature-name">{item.feature}</span>
                    </div>
                    <div className="importance-bar-wrapper">
                      <div
                        className="importance-bar"
                        style={{
                          width: `${item.normalizedScore}%`,
                          backgroundColor: getFeatureColor(item.feature, idx)
                        }}
                      />
                    </div>
                    <div className="importance-value">
                      {item.importance.toFixed(4)}
                    </div>
                  </div>
                  
                  {/* Expanded details */}
                  {expandedFeature === item.feature && (
                    <div className="importance-details">
                      <p>
                        This feature contributes <strong>{item.importance.toFixed(4)}</strong> units
                        of importance to the {selectedModel} model's predictions.
                      </p>
                      <p>
                        Relative strength: <strong>{Math.round(item.normalizedScore)}%</strong> of top feature
                      </p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No SHAP importance data available for {selectedModel}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: SHAP Visualizations + Sample Data */}
        <div className="shap-visual-panel">
          {/* SHAP Images */}
          {(modelImages.bar || modelImages.plot) && (
            <div className="shap-images-container">
              <h3 className="panel-title">Visual Analysis</h3>
              
              {modelImages.bar && (
                <div className="shap-image-wrapper">
                  <img
                    src={getImageSrc(modelImages.bar)}
                    alt={`${selectedModel} SHAP Bar Plot`}
                    className="shap-image"
                  />
                  <p className="image-caption">Importance Bar Plot</p>
                </div>
              )}
              
              {modelImages.plot && (
                <div className="shap-image-wrapper">
                  <img
                    src={getImageSrc(modelImages.plot)}
                    alt={`${selectedModel} SHAP Beeswarm Plot`}
                    className="shap-image"
                  />
                  <p className="image-caption">Feature Impact Distribution</p>
                </div>
              )}
            </div>
          )}

          {/* Sample SHAP Values Table */}
          {currentModelValues.length > 0 && (
            <div className="shap-values-container">
              <h3 className="panel-title">Sample Predictions</h3>
              <div className="shap-table-wrapper">
                <table className="shap-values-table">
                  <thead>
                    <tr>
                      <th>Index</th>
                      {Object.keys(currentModelValues[0])
                        .filter(k => k !== 'index')
                        .slice(0, 7)
                        .map(col => (
                          <th key={col}>{col}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentModelValues.slice(0, 10).map((row, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        {Object.entries(row)
                          .filter(([k]) => k !== 'index')
                          .slice(0, 7)
                          .map(([col, val]) => (
                            <td key={`${idx}-${col}`}>
                              {typeof val === 'number' ? val.toFixed(3) : val}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="table-note">Showing first 10 of {currentModelValues.length} samples</p>
            </div>
          )}
        </div>
      </section>

      {/* Insights Section */}
      <section className="shap-insights">
        <h3>Key Insights</h3>
        <div className="insights-grid">
            <div className="insight-card">
              <div className="insight-icon">📊</div>
              <h4>Top Driver</h4>
              <p>
                {normalizedImportance.length > 0
                  ? `"${normalizedImportance[0].feature}" is the strongest predictor`
                  : 'N/A'}
              </p>
            </div>
            <div className="insight-card">
              <div className="insight-icon">🎯</div>
              <h4>Feature Count</h4>
              <p>
                {normalizedImportance.length} features analyzed
              </p>
            </div>
            <div className="insight-card">
              <div className="insight-icon">⚖️</div>
              <h4>Balance</h4>
              <p>
                {(() => {
                  if (normalizedImportance.length < 2) return 'N/A'
                  const top = normalizedImportance[0].importance || 0
                  const last = normalizedImportance[normalizedImportance.length - 1].importance || 0
                  if (last === 0) return 'N/A'
                  const ratio = top / last
                  return `${ratio.toFixed(1)}x more important than least important`
                })()}
              </p>
            </div>
        </div>
      </section>
    </div>
  )
}

// Helper function to assign colors to features
function getFeatureColor(feature, index) {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#a855f7', // purple
    '#ec4899', // pink
    '#14b8a6', // teal
  ]
  return colors[index % colors.length]
}


import React, { useEffect, useRef, useState } from 'react'
import Spinner from '../shared/Spinner.jsx'

const API_BASE_URL = (() => {
  const base = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000'
  return base.endsWith('/') ? base.slice(0, -1) : base
})()

const MAX_UPLOAD_MB = Number(import.meta.env?.VITE_MAX_UPLOAD_MB) || 100
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

const PIPELINE_STEPS = [
  { label: 'Stage 1 - 清理資料', eta: 5 },
  { label: 'Stage 2 - 退款沖銷', eta: 8 },
  { label: 'Stage 3 - 產品分群', eta: 12 },
  { label: 'Stage 4 - 客群分層', eta: 15 },
  { label: 'Stage 5 - 分類模型', eta: 18 },
  { label: 'Stage 6 - 測試預測', eta: 10 },
  { label: 'Stage 7 - 報告與 SHAP', eta: 12 },
]
const TOTAL_ESTIMATED_SEC = PIPELINE_STEPS.reduce((sum, step) => sum + step.eta, 0)

const parseErrorMessage = async (response) => {
  if (response?.status === 413) {
    return `檔案超過 ${MAX_UPLOAD_MB}MB 限制，請調整後再試`
  }

  const fallback = '上傳失敗，請稍後再試'
  try {
    const text = await response.text()
    if (!text) return fallback
    try {
      const data = JSON.parse(text)
      return data?.detail || data?.message || fallback
    } catch {
      return text
    }
  } catch {
    return fallback
  }
}

const POLL_INTERVAL_MS = 3000

export default function Upload({ onComplete, onSkip }) {
  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [logoSrc, setLogoSrc] = useState('/aonix.png')
  const [error, setError] = useState('')
  const [activeStageIdx, setActiveStageIdx] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [pipelineStatus, setPipelineStatus] = useState(null)
  const [showLogs, setShowLogs] = useState(false)
  const [pipelineLogs, setPipelineLogs] = useState('')

  useEffect(() => {
    if (!loading) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      // stop pipeline polling when not loading
      setPipelineStatus(null)
      setPipelineLogs('')
      return
    }

    const startedAt = Date.now()
    timerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      setElapsedSec(seconds)

      let cumulative = 0
      let idx = PIPELINE_STEPS.length - 1
      for (let i = 0; i < PIPELINE_STEPS.length; i += 1) {
        cumulative += PIPELINE_STEPS[i].eta
        if (seconds < cumulative) {
          idx = i
          break
        }
      }
      setActiveStageIdx(idx)
    }, 500)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [loading])

  // Helper: derive stage index from pipelineStatus.current_stage like 'Stage 3' -> index 2
  const getIndexFromStatus = (statusObj) => {
    if (!statusObj || !statusObj.current_stage) return null
    const cs = String(statusObj.current_stage)
    for (let i = 0; i < PIPELINE_STEPS.length; i += 1) {
      const stepPrefix = `Stage ${i + 1}`
      if (cs.startsWith(stepPrefix) || (statusObj.message && statusObj.message.startsWith(stepPrefix))) {
        return i
      }
    }
    return null
  }


  // Poll pipeline status while loading to update overlay
  useEffect(() => {
    if (!loading) return
    let mounted = true
    let pollId = null
    const doPoll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/pipeline/status`)
        if (!res.ok) return
        const d = await res.json()
        if (!mounted) return
        setPipelineStatus(d)
        // fetch logs lazily if requested
        if (showLogs) {
          try {
            const r2 = await fetch(`${API_BASE_URL}/artifacts/pipeline_logs.txt`)
            if (r2.ok) {
              const text = await r2.text()
              // keep last ~2000 chars to avoid huge payloads
              setPipelineLogs(text.slice(-2000))
            }
          } catch (e) {
            // ignore
          }
        }
        if (d && (d.status === 'done' || d.status === 'failed')) {
          // stop polling once finished
          return
        }
      } catch (e) {
        // ignore network errors
      }
      pollId = setTimeout(doPoll, POLL_INTERVAL_MS)
    }
    doPoll()
    return () => {
      mounted = false
      if (pollId) clearTimeout(pollId)
    }
  }, [loading, showLogs])

  const openPicker = () => inputRef.current?.click()

  const uploadToServer = async (file) => {
    const formData = new FormData()
    formData.append('file', file)

    let response
    try {
      response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      })
    } catch (networkError) {
      console.error('Network error during upload', networkError)
      throw new Error('無法連線到後端服務，請確認伺服器是否啟動')
    }

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response))
    }

    return response.json()
  }

  const onChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`檔案不可超過 ${MAX_UPLOAD_MB}MB，請調整後再試`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setLoading(true)
    setError('')
    setActiveStageIdx(0)
    setElapsedSec(0)

    try {
      const response = await uploadToServer(file)
      // If backend returned preview periods, keep them
      const preview_periods = response?.preview_periods || []

      // Wait for pipeline completion by polling `/pipeline/status`.
      // No timeout: for large files we wait until pipeline reports 'done' or 'failed'.
      const waitForPipeline = async () => {
        while (true) {
          try {
            const r = await fetch(`${API_BASE_URL}/pipeline/status`)
            if (r.ok) {
              const d = await r.json()
              const s = d && d.status ? d.status : null
              if (s === 'done') {
                return { ok: true }
              }
              if (s === 'failed') {
                return { ok: false, message: d.message || 'Pipeline failed' }
              }
            }
          } catch (err) {
            // ignore network or parse errors and retry
            console.warn('pipeline status poll error', err)
          }
          // wait then retry indefinitely (no timeout)
          await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS))
        }
      }

      const pipelineResult = await waitForPipeline()
      if (!pipelineResult.ok) {
        // pipeline failed: surface the error but still navigate so user can inspect partial outputs
        console.error('Pipeline failed:', pipelineResult.message)
        setError(`解析が失敗しました: ${pipelineResult.message}`)
      }

      // Pipeline finished (success or failure) — navigate to Viewer
      onComplete?.({ file, preview_periods })
    } catch (err) {
      console.error('Upload failed', err)
      setError(err?.message || '上傳失敗，請稍後再試')
    } finally {
      setLoading(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  return (
    <div className="center-wrap">
      <div className="brand-bar brand-spacing" aria-label="brand">
        <img
          src={logoSrc}
          alt="Aonix logo"
          onError={() => {
            if (logoSrc !== '/anoix.png') setLogoSrc('/anoix.png')
          }}
        />
      </div>
      <div className="card upload-card" onClick={openPicker} role="button" tabIndex={0}
           onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}>
        <div className="plus-icon" aria-hidden>+</div>
        <div className="title">匯入檔案</div>
        <div className="hint">點擊或拖曳檔案到此處（單檔上限 {MAX_UPLOAD_MB}MB）</div>
        <input
          ref={inputRef}
          className="hidden-input"
          type="file"
          onChange={onChange}
        />
      </div>
      <button
        type="button"
        className="link-btn"
        onClick={() => onSkip?.()}
        disabled={loading}
      >
        先跳過，直接前往第 1 頁
      </button>
      {error && (
        <div className="error-text" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="overlay" role="alert" aria-live="assertive">
          <div className="overlay-card overlay-card--progress">
            <div className="overlay-header">
              <Spinner size={32} />
              <div className="overlay-text">
                <div>上傳檔案中，並自動執行 Stage 1-6</div>
                <div className="overlay-subtext">
                  {(() => {
                    // estimate remaining time using pipeline percent when available
                    const serverRem = pipelineStatus && pipelineStatus.estimated_remaining_sec != null ? Number(pipelineStatus.estimated_remaining_sec) : null
                    const pct = pipelineStatus && pipelineStatus.percent != null ? Number(pipelineStatus.percent) : null
                    if (serverRem != null) {
                      return `推定剩餘 ${serverRem} 秒 (${pct != null ? pct + '%' : ''})`
                    }
                    if (pct != null && pct > 0 && pct < 100 && elapsedSec > 0) {
                      const rem = Math.max(0, Math.round((elapsedSec * (100 - pct)) / pct))
                      return `推定剩餘 ${rem} 秒 (${pct}% 完成)`
                    }
                    return `預估剩餘 ${Math.max(0, TOTAL_ESTIMATED_SEC - elapsedSec)} 秒`
                  })()}
                </div>
                {pipelineStatus && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 13 }}>{pipelineStatus.current_stage || pipelineStatus.message}</div>
                    <div style={{ height: 8, background: '#eee', borderRadius: 4, marginTop: 6 }}>
                      <div style={{ width: `${pipelineStatus.percent || 0}%`, height: '100%', background: '#60a5fa', borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 12, marginTop: 6 }}>{pipelineStatus.percent != null ? `${pipelineStatus.percent}%` : ''}</div>
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="link-btn" onClick={() => setShowLogs((s) => !s)} style={{ padding: '4px 8px' }}>
                    {showLogs ? '關閉實行記錄' : '顯示實行記錄'}
                  </button>
                </div>
                {showLogs && (
                  <pre
                    style={{
                      maxHeight: 180,
                      overflow: 'auto',
                      fontSize: 12,
                      marginTop: 8,
                      background: '#111',
                      color: '#eee',
                      padding: 8,
                      borderRadius: 6,
                      maxWidth: '80vw',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {pipelineLogs || 'ログはまだ生成されていません'}
                  </pre>
                )}
              </div>
            </div>
            <ul className="stage-list">
              {PIPELINE_STEPS.map((step, index) => {
                let state = 'pending'
                // prefer pipelineStatus mapping when available
                const mappedIdx = getIndexFromStatus(pipelineStatus)
                let useIdx = mappedIdx != null ? mappedIdx : activeStageIdx
                // clamp to valid range
                if (useIdx == null) useIdx = 0
                if (useIdx >= PIPELINE_STEPS.length) useIdx = PIPELINE_STEPS.length - 1
                if (index < useIdx) state = 'done'
                else if (index === useIdx) state = 'active'
                return (
                  <li key={step.label} className={`stage-item stage-item--${state}`}>
                    <span className="stage-dot" aria-hidden />
                    <div>
                      <div className="stage-title">{step.label}</div>
                      <div className="stage-eta">約 {step.eta} 秒</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

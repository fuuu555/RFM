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

export default function Upload({ onComplete }) {
  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [logoSrc, setLogoSrc] = useState('/aonix.png')
  const [error, setError] = useState('')
  const [activeStageIdx, setActiveStageIdx] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (!loading) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
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
      const pipelineResults = response?.pipeline_results ?? []
      const failedStage = pipelineResults.find((stage) => stage.status !== 'ok')

      if (failedStage) {
        const detail =
          failedStage.error ||
          failedStage.stderr?.trim() ||
          '請檢查後端日誌以取得更多資訊'
        setError(`【${failedStage.stage}】執行失敗：${detail}`)
        return
      }

      // 標示所有 stage 已完成並給使用者一個視覺緩衝
      setActiveStageIdx(PIPELINE_STEPS.length)
      setElapsedSec(TOTAL_ESTIMATED_SEC)
      await new Promise((resolve) => setTimeout(resolve, 300))

      onComplete?.(file)
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
                  預估剩餘 {Math.max(0, TOTAL_ESTIMATED_SEC - elapsedSec)} 秒
                </div>
              </div>
            </div>
            <ul className="stage-list">
              {PIPELINE_STEPS.map((step, index) => {
                let state = 'pending'
                if (index < activeStageIdx) state = 'done'
                else if (index === activeStageIdx) state = 'active'
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

import React, { useState } from 'react'
import Upload from './pages/Upload.jsx'
import Viewer from './pages/Viewer.jsx'

export default function App() {
  const [step, setStep] = useState('upload') // 'upload' | 'viewer'
  const [file, setFile] = useState(null)
  const [initialPeriods, setInitialPeriods] = useState(null)

  const handleUploaded = (payload) => {
    // payload may be either a File or an object { file, preview_periods }
    if (payload && payload.preview_periods) {
      setFile(payload.file || null)
      setInitialPeriods(payload.preview_periods)
    } else {
      setFile(payload)
      setInitialPeriods(null)
    }
    setStep('viewer')
  }

  const handleSkip = () => {
    setFile(null)
    setInitialPeriods(null)
    setStep('viewer')
  }

  const containerClass = step === 'viewer' ? 'app-container app-container--fullscreen' : 'app-container'

  return (
    <div className={containerClass}>
      {step === 'upload' && <Upload onComplete={handleUploaded} onSkip={handleSkip} />}
      {step === 'viewer' && (
        <Viewer
          file={file}
          initialPeriods={initialPeriods}
          onReset={() => { setFile(null); setInitialPeriods(null); setStep('upload') }}
        />
      )}
    </div>
  )
}

import React, { useState } from 'react'
import Upload from './pages/Upload.jsx'
import Viewer from './pages/Viewer.jsx'

export default function App() {
  const [step, setStep] = useState('upload') // 'upload' | 'viewer'
  const [file, setFile] = useState(null)

  const handleUploaded = (selectedFile) => {
    setFile(selectedFile)
    setStep('viewer')
  }

  const handleSkip = () => {
    setFile(null)
    setStep('viewer')
  }

  const containerClass = step === 'viewer' ? 'app-container app-container--fullscreen' : 'app-container'

  return (
    <div className={containerClass}>
      {step === 'upload' && <Upload onComplete={handleUploaded} onSkip={handleSkip} />}
      {step === 'viewer' && (
        <Viewer file={file} onReset={() => { setFile(null); setStep('upload') }} />
      )}
    </div>
  )
}

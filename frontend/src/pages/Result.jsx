import React from 'react'

export default function Result({ file, onReset }) {
  return (
    <div className="center-wrap">
      <div className="card result-card">
        <div className="title">上傳完成</div>
        {file ? (
          <div className="file-info">
            <div className="file-name">{file.name}</div>
            <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
          </div>
        ) : (
          <div className="file-info">未偵測到檔案</div>
        )}
        <button className="btn" onClick={onReset}>返回重新上傳</button>
      </div>
    </div>
  )
}


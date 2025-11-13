# 全自動 Stage 1–6 客戶分析流程

這個專案是一個簡單的全端展示：React / Vite 前端提供拖拉式上傳與視覺化 Viewer，FastAPI 後端在檔案寫入後會同步觸發資料科學流程（Stage 1–6）。使用者在上傳視窗就能看到 pipeline 的進度指示，待所有階段完成才會進入結果頁面。

## 功能重點

- **單一上傳入口**：將 `data.csv` 傳到後端後，會自動覆蓋 `data_layer/uploads/data.csv`。
- **自動 Stage 1–6**：`backend/server.py` 會呼叫 `data_layer/pipeline.py`，依序執行 Stage 1（pandas 清洗）到 Stage 6（模型評估）。每個 stage 的 stdout/stderr、回傳碼與秒數都會記錄在 `pipeline_results` 中。
- **前端進度提示**：`src/pages/Upload.jsx` 會在上傳時顯示預估秒數與六個步驟的 loading 條，Pipeline 完成前不會跳頁。
- **視覺化 Viewer**：上傳完成後可在全螢幕頁面看到示意 KPI、圓餅圖、導航等 UI。

## 目錄結構

```
backend/             FastAPI 伺服器 (upload API + pipeline 觸發)
data_layer/          Stage 1–6 腳本與 pipeline helper
public/              前端靜態資源 (logo 等)
src/                 React/Vite 前端
```

## 需求

- Node.js 18+
- Python 3.10+（建議 3.11）
- 推薦使用虛擬環境 (`python -m venv .venv`)

## 後端啟動（FastAPI + Pipeline）

```bash
# 建立並啟動虛擬環境 (Windows PowerShell 範例)
python -m venv .venv
.venv\Scripts\Activate.ps1

# 安裝所需套件
pip install fastapi uvicorn pandas numpy scikit-learn joblib nltk

# 第一次執行 Stage 3 會需要 NLTK 資料，可先預載
python - <<'PY'
import nltk
for pkg in ("punkt", "averaged_perceptron_tagger"):
    try:
        nltk.data.find(f"tokenizers/{pkg}" if pkg == "punkt" else f"taggers/{pkg}")
    except LookupError:
        nltk.download(pkg)
PY

# 啟動 API（預設 http://127.0.0.1:8000）
uvicorn backend.server:app --reload --port 8000
```

啟動後，任何對 `POST /upload` 的請求都會：

1. 把檔案寫入 `data_layer/uploads/data.csv`
2. 依序執行 Stage 1–6
3. 回傳每個 stage 的狀態與執行秒數 (`pipeline_results`)，前端會用來決定是否顯示錯誤。

如需單獨從命令列執行 pipeline，也可在專案根目錄執行：

```bash
python - <<'PY'
from data_layer.pipeline import run_all_stages
print(run_all_stages(stop_on_error=False))
PY
```

## 前端啟動（Vite + React）

```bash
# 安裝依賴（於專案根目錄）
npm install

# 開發伺服器（http://localhost:5173）
npm run dev

# 建置 + 預覽
npm run build
npm run preview
```

前端會透過 `VITE_API_BASE_URL`（預設 `http://localhost:8000`）呼叫後端。上傳成功且六個 stage 全數通過後才會進入 Viewer 頁面。

## 常見問題

- **Stage 3 Unicode 錯誤**：已改成純 ASCII 輸出。如果仍遇到 `cp950` 相關訊息，請確認終端機編碼或使用 `chcp 65001`。
- **NLTK 缺資料**：如 Stage 3 log 提示找不到 tokenizer/tagger，請重新執行上方的 NLTK 安裝指令或在 `.venv` 內手動 `nltk.download(...)`。
- **Pipeline 長時間未完成**：檢查 `artifacts/` 內是否已有前一次產生的檔案，必要時刪除重新跑；或在終端查看 `pipeline_results` 每個 stage 的 stderr。

## 授權

此專案僅用於示範用途，未設定特定授權條款。若需用於正式專案，請自行補全授權與資料來源聲明。

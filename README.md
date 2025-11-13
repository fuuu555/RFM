# React 單頁應用（上傳 → 正式頁）

白到灰漸層、圓角卡片、陰影與柔和動畫（Notion × Framer 感）。

**重點功能**
- 上傳頁：置中 Logo（深色處理）＋「插入文件」卡片
- 上傳後顯示轉圈圈，完成即進入正式頁（全螢幕）
- 正式頁第 1 頁：
  - 置中大標題「會員概況」
  - 左：會員人數（置中大字、上方人像 icon）
  - 右：圓餅圖「來自區域」（北/中/南/東），滑鼠 hover 顯示地區與人數
  - 下方：KPI 三小卡（平均消費金額 / 本月新增會員 / 活躍率）
- 正式頁第 2 頁：保留示意內容，可自由擴充
- 左右箭頭切換頁面；第 1 頁不顯示「<」，第 2 頁不顯示「>」

**開發方式**
- 安裝
  - `npm install`
- 本地啟動
  - `npm run dev`（預設 http://localhost:5173）
- 打包預覽
  - `npm run build` 然後 `npm run preview`

**專案結構**
- `index.html`：入口（`#root`）
- `src/main.jsx`：React 掛載
- `src/App.jsx`：步驟切換（upload/viewer）
- `src/pages/Upload.jsx`：上傳頁（Logo + 插入文件卡 + 載入覆蓋）
- `src/pages/Viewer.jsx`：正式頁（兩頁、圓餅圖、KPI、標題、箭頭切換）
- `src/shared/Spinner.jsx`：轉圈圈元件
- `src/styles.css`：全域樣式與元件樣式
- `public/aonix.png`（或 `public/anoix.png`）：Logo 檔案（靜態資源）

**Logo 放置**
- 將 Logo 置於 `public/aonix.png`
- 若檔名誤為 `anoix.png` 也可，自動 fallback 會處理
- 上傳頁與正式頁都會顯示並套用深色濾鏡

**圓餅圖提示（Hover）**
- 以 CSS `conic-gradient` 繪製，並用滑鼠角度計算所在區塊
- 顯示「地區名稱 + 人數」（以總會員數乘比例計算）
- 修改數據：在 `src/pages/Viewer.jsx` 調整下列變數
  - `totalMembers`：總會員數（預設 12345）
  - `regions`：各區比例與顏色（北 45、中 25、南 20、東 10）

**可自訂項目**
- 會員人數動畫：可將數字 0 → 目標值的滾動動畫加入 `Viewer.jsx`
- 顏色與漸層：調整 `src/styles.css` 中變數與相關類別
- 路由化：若需網址路徑可加 `react-router`（目前以狀態管理切頁）

**注意**
- 請使用 Vite 開發伺服器瀏覽（不要直接開啟 `index.html` 檔）。

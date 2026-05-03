# XMeet AI Web Extension

Chrome 與 Microsoft Edge 瀏覽器擴充功能，讓您在任何會議平台上快速存取 XMeet AI 功能。

## 功能概覽

| 功能 | 說明 |
|------|------|
| **快速存取** | 點擊工具列圖示，立即開啟最近會議、啟動錄音或上傳音檔 |
| **會議偵測** | 自動偵測 Teams / Zoom / Google Meet / Webex |
| **浮動標記** | 會議進行中顯示紫色懸浮按鈕，一鍵跳至錄音頁 |
| **錄音徽章** | 工具列圖示顯示紅點，即時反映目前錄音狀態 |
| **Microsoft 登入** | 使用 `chrome.identity` 完成 OAuth2 授權，Token 安全儲存於 `chrome.storage.local` |

## 支援平台

| 會議平台 | 偵測條件 |
|---------|---------|
| Microsoft Teams (Web) | `[data-tid="calling-screen"]` DOM 元素 |
| Zoom (Web) | `/wc/` 路徑 |
| Google Meet | URL 路徑長度 > 5 |
| Webex | `[data-test="meeting-widget"]` DOM 元素 |

## 本地開發

```bash
cd extension

# 1. 安裝依賴
npm install

# 2. 建立 .env（複製 .env.example 後填入）
cp .env.example .env
# 編輯 BACKEND_URL 與 AZURE_CLIENT_ID

# 3. 開發模式（監聽變更）
npm run dev

# 4. 正式建置
npm run build

# 5. 打包 .zip（上架用）
npm run pack
```

建置完成後，`dist/` 即為可載入的擴充功能目錄。

## 安裝擴充功能（開發版）

### Chrome
1. 前往 `chrome://extensions/`
2. 開啟右上角「**開發人員模式**」
3. 點選「**載入未封裝項目**」
4. 選擇 `dist/` 目錄

### Edge
1. 前往 `edge://extensions/`
2. 開啟左下角「**開發人員模式**」
3. 點選「**載入未封裝**」
4. 選擇 `dist/` 目錄

## 環境變數

| 變數 | 說明 |
|------|------|
| `BACKEND_URL` | XMeet AI 後端 API URL（例：`https://api.xmeetai.com`）|
| `AZURE_CLIENT_ID` | Microsoft Entra App Client ID（同前端 `REACT_APP_AZURE_CLIENT_ID`）|

## 架構說明

```
extension/
  manifest.json           Manifest V3（Chrome / Edge 相容）
  src/
    popup/                工具列彈出視窗（HTML + TS + CSS，無框架）
    background/           Service Worker（認證、API、徽章更新）
    content/              注入各會議平台的腳本 + 浮動標記
    shared/               Auth helper、API client、TypeScript 型別
  scripts/
    generate-icons.cjs    純 JS PNG 圖示產生器（無原生依賴）
  icons/                  npm run icons 自動產生
  dist/                   webpack 建置輸出
```

## 認證流程

```
使用者點選「使用 Microsoft 帳號登入」
  → chrome.identity.launchWebAuthFlow（Microsoft OAuth2）
  → 取得授權碼
  → POST /api/auth/microsoft/callback（XMeet AI 後端交換 JWT）
  → 儲存至 chrome.storage.local
  → Popup 顯示已登入狀態
```

## 上架至商店

```bash
npm run pack
# 產生 xmeet-ai-extension.zip，直接上傳至：
# - Chrome Web Store Developer Dashboard
# - Microsoft Edge Add-ons (Partner Center)
```

上架前確認清單：
- [ ] `manifest.json` 版本號已更新
- [ ] `.env` 指向正式後端
- [ ] 所有圖示存在於 `dist/icons/`
- [ ] Service Worker 無 console 錯誤

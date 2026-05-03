# CLAUDE.md — XMeet AI

## 專案概述

XMeet AI 是一套基於 **Azure 雲端原生技術**的企業級 AI 會議記錄 SaaS 平台，
以 [Read AI](https://www.read.ai) 為主要競品參考，核心差異在於：
- 全台語 / 客語支援（nan-TW、hak-TW）
- 完整 Azure 原生堆疊（便於台灣企業合規與資料主權）
- 自訂術語辭典透過 Azure Speech PhraseListGrammar 直接注入識別引擎

---

## 系統架構

```
前端 (React 18 + TypeScript + Tailwind)
  └─ Azure Static Web Apps (Standard)

後端 (FastAPI 0.115 + Python 3.11 + Docker)
  └─ Azure Container Apps
       ├─ PostgreSQL (SQLAlchemy 2.0)
       ├─ Azure Blob Storage (音檔, GRS)
       ├─ Azure Web PubSub (即時字幕 WebSocket)
       ├─ Azure AI Speech (轉錄 + 說話者分離)
       ├─ Azure OpenAI GPT-4.1 (雙輪摘要)
       ├─ Azure Key Vault (Managed Identity)
       └─ Azure Communication Services (Email 通知)
```

### 即時字幕流程

1. 前端取得 `GET /api/speech-token` → Azure Speech SDK 初始化
2. 前端取得 `GET /api/ws/token` → Web PubSub Client URL
3. 前端透過 WebSocket 連至 PubSub Hub (`speech_hub`)
4. PubSub 將音訊事件轉發 `ConversationTranscriber`
5. 識別結果 push 回 PubSub → 前端 `type:transcript` 訊息

### 音檔批次上傳流程

```
POST /api/meetings/{id}/upload
  → 上傳至 Azure Blob Storage
  → 觸發 Azure Speech Batch Transcription API (非同步)
  → 前端輪詢 GET .../transcription-status
```

---

## 目前實作狀態（2026-04）

### 已完成
| 檔案 | 說明 |
|------|------|
| `backend/main.py` | FastAPI app，CORS、rate limiting、lifespan |
| `backend/blueprints/calendar_bp.py` | **Outlook 行事曆**（Microsoft Graph API，含 token refresh）|
| `backend/shared/email.py` | Azure ACS Email 邀請通知 |
| `frontend/src/App.tsx` | 路由、MSAL Provider、AuthGate |
| `frontend/src/types/index.ts` | 完整 TypeScript 型別定義 |
| `frontend/src/components/CalendarPanel.tsx` | Outlook 行事曆面板 UI |
| `frontend/src/components/layout/TopBar.tsx` | 頂部導覽列 |
| `frontend/src/pages/SettingsPage.tsx` | 設定頁（行事曆 / 術語辭典 / 摘要範本） |
| `frontend/src/pages/SharedMeetingPage.tsx` | 分享連結公開檢視頁 |

### 待實作（依優先順序）
1. **認證 blueprints**：`auth_microsoft.py`、`auth_google.py`、`auth_github.py`、`auth_apple.py`、`auth_dev.py`
2. **核心業務 blueprints**：`meetings.py`、`speech.py`、`summarize.py`、`terminology.py`、`templates.py`、`upload.py`、`share.py`、`health.py`
3. **後端 shared**：`config.py`、`database.py`（SQLAlchemy models）、`auth.py`（JWT）、`access.py`、`responses.py`
4. **前端頁面**：`DashboardPage.tsx`、`RecordingPage.tsx`、`UploadPage.tsx`、`MeetingDetailPage.tsx`
5. **前端元件**：`RecordingPanel.tsx`、`AudioUploadPanel.tsx`、`TranscriptView.tsx`、`SummaryPanel.tsx`、`OAuthButtons.tsx`、`ShareMeetingModal.tsx`、`SummaryTemplateModal.tsx`、`TermDictionaryModal.tsx`
6. **前端 hooks / services / contexts**

---

## 競品深度分析：Read AI

資料來源：`xmeet/Read_AI_功能與技能完整清單.docx` + 36 張 Read AI 產品實際截圖（2026-04-30）

### Read AI 完整功能地圖（含 UI 截圖觀察）

#### 1. 核心報告系統
- **報告頁面**：可依來源、時間、類型、文件夾、共有者篩選；支援資料夾分類管理
- **智能資料夾**（系統預設）：計劃會議、銷售電話、銷售策略、狀態更新、合作伙伴對齊會議
- **上傳文件**：每月 300 分鐘配額，支援直接上傳音視頻；企業方案 US$29.75/月

#### 2. 日曆與智能排程
- **即將到來 / 日程安排** 雙分頁
- 每個行程有「讓 Read 加入？」開關（逐一控制）
- **智能排程器**（Smart Scheduler）：
  - 預設會議連結（15/30/60/90 分鐘 × Microsoft Teams）
  - 日曆來源：Outlook Calendar
  - 預設會議平台：Microsoft Teams
  - 自訂 URL 支援

#### 3. 個人分析（為你 / For You）
- **主題（Themes）**：AI 彙整近期會議主要議題
- **行動事項（Action Items）**：跨會議的未完成事項匯總
- **相關的內容**：近期時間內未相關過的同主題會議
- **關鍵問題**：AI 偵測的待解決問題

#### 4. 會議政策分析（Meeting Policy）— 4 個維度
| 分頁 | 說明 |
|------|------|
| **Read 分數** | 自身分數 vs Read 平均值，可切換顯示 |
| **情緒** | 情緒指數（帶顏色的長條圖） |
| **參與度** | 互動頻率分析 |
| **遵行率** | 會議流程遵循率 |

所有分頁共用相同圖表組合：
- 星期幾分布（柱狀圖）
- 一天時間段分布
- 會議規模（一對一 / 2-3 人 / 4+ 人 圓餅圖）
- 會議時長（< 30 / 30-60 / > 60 分鐘 橫條圖）

#### 5. 輔導功能（Coaching）
- **講話節奏**：WPM 數值 + 範圍條（說話/傾聽 216 wpm）
- **包容性**：非獨特性用語、每次會議
- **影響力**：臉部（攝影機使用率）、魅力
- **問題**：每次會議提問數
- 下方附近期會議列表 + 各場 WPM 數據

#### 6. AI 推薦（Recommendations）
- 建議將某位出席者改為「Optional」
- 附理由：近 3 次會議中攝影機關閉 X 次 / 語音情緒偏負面
- 對每人可操作：**接受 / 忽視**

#### 7. 工作區概覽（Workspace Overview）
- **時間管理費**：區分「規定作業」vs「會議時長」
- **會議管理費**：Read 評分 / 情緒 / 參與度 三指標
- **會議安排工具**：系統/用戶角色、時間段視覺化熱圖（週一至日 × 早上到晚上）
- **參考**：已參加 / 平均時長 / 多語言支援

#### 8. 集成（Integrations）
**行事曆/會議平台：**
- Google Calendar ✓（已連接 `guesslee@gmail.com`）
- Google Meet ✓
- Outlook Calendar ✓（但顯示「智能調度器已停用」提示）
- Zoom Calendar（可連接）

**應用程式：**
- Read AI Web Extension（Chrome/Edge）
- Read AI for Android
- Read AI for iPhone

**生產力（截圖顯示有更多選項未展開）**

#### 9. 帳戶設定（16 個分頁）
| 設定頁 | 重點功能 |
|--------|---------|
| 個人資料 | 姓名、職稱、業務角色、部門、主要電子郵件、語言偏好（繁中）、日期格式 |
| 集成 | 各平台連線管理 |
| 會議記錄 | 自動加入開關、日曆同步、通知方式（Teams/Email）、遇到條件（Read 創建/所有行程） |
| 報告內容 | 自動摘要錄音、轉錄、輸出語言（中文）、音視頻錄製 |
| 報告共享 | 內部/外部參與者預設存取權、一鍵共享、Pre-Reads 報告類型 |
| 通知 | 每日摘要、Readouts、每週回顧、推薦、電子郵件偏好 |
| 搜索副駕駛 | 搜尋記憶開關 |
| 智能調度器 | 日曆來源、預設平台、自訂 URL、時間約束、最小緩衝 |
| 文件夾 | 自定義文件夾 + 系統文件夾管理 |
| 聯繫人與群組 | Google/Microsoft 聯絡人同步、群組管理 |
| 自定義詞匯 | 自訂詞彙（0 個，可新增） |
| 高級 | 瀏覽器擴充（Edge/Chrome）、刪除帳號 |

#### 10. 工作區管理（企業版）
- **成員（Teams）**：建立/管理群組（無個人設定）
- **人員（People）**：成員列表、工作角色、最近活動
- **設置（Settings）**：登錄方式、會議自動加入、Read 助理、會議安排、報告與共享、集成、自定義詞匯、智能調度器、高級
- **權限（Permissions）**：會議報告訪問、匯總指標和趨勢、高級權限

---

### XMeet AI vs Read AI 功能對照

| Read AI 功能 | XMeet AI 對應 | 狀態 |
|-------------|--------------|------|
| 報告列表 + 資料夾 | DashboardPage + 會議列表 | 待實作 |
| 即時逐字稿 | Azure Speech ConversationTranscriber | 待實作 |
| 說話者分離 | Azure Speech diarization | 待實作 |
| 會議摘要 | GPT-4 雙輪生成 | 待實作 |
| 行動項目追蹤 | `ActionItem[]` 型別已定義 | 待實作 |
| 報告分享 + 存取控制 | `shares` 資料表 + token | 待實作 |
| 日曆行程 + 逐一開關 | CalendarPanel（Outlook）| UI 完成，錄音待串 |
| 智能排程器 | — | 未規劃 |
| 為你（個人化儀表板） | — | 未規劃 |
| 會議政策分析 | — | 未規劃 |
| 輔導（說話節奏/包容性） | — | 未規劃 |
| AI 出席推薦 | — | 未規劃 |
| Search Copilot | — | 未規劃 |
| Readouts（Email/訊息摘要） | — | 未規劃 |
| 工作區概覽 | — | 未規劃 |
| 自定義詞匯（前端設定） | TermDictionaryModal | UI 框架存在 |
| 音檔上傳轉錄 | Blob + Batch Transcription | 待實作 |
| 集成頁（Google/Outlook/Zoom） | 僅 Outlook | 部分完成 |
| 企業工作區管理 | — | 未規劃 |
| **台語 / 客語** | Azure Speech nan-TW / hak-TW | **獨有功能，待實作** |
| **術語辭典注入 Speech 引擎** | PhraseListGrammar | **獨有功能，待實作** |
| **7 種會議模式** | MeetingMode 型別已定義 | **獨有功能，待實作** |

> **行事曆整合僅支援 Microsoft Outlook。** Google Calendar 整合已從規劃中移除，UI 中不顯示 Google 行事曆選項。
>
> **計費觀察**：Read AI 企業方案 US$29.75/月，每月 300 分鐘上傳配額。XMeet AI 採 Azure 原生，成本結構完全不同。

---

## Read AI 功能實作狀態（已完成）

| 功能 | 檔案 | 說明 |
|------|------|------|
| **智能資料夾** | `Meeting.folder` 欄位、`DashboardPage` 橫向 chips、`MeetingDetailPage` 下拉選取 | 7 種資料夾：計劃會議 / 客戶會議 / 銷售討論 / 狀態更新 / 腦力激盪 / 其他；可從會議詳情頁指派 |
| **會議政策分析** | `backend/blueprints/analytics.py` `GET /api/analytics/meeting-policy` `frontend/src/pages/AnalyticsPage.tsx` | 4 分頁（Read 分數 / 情緒 / 參與度 / 遵行率）+ 週幾/時間段/規模/時長圖表；無外部圖表庫 |
| **為你（個人化）** | `GET /api/analytics/for-you` `frontend/src/pages/ForYouPage.tsx` | 主題 / 行動事項 / 相關內容 / 關鍵問題 4 卡片 |
| **說話輔導** | `GET /api/analytics/coaching` `frontend/src/pages/CoachingPage.tsx` | 平均 WPM + 進度條（建議範圍 130-180）+ 說話比例 + 提問數 |
| **導覽整合** | `MobileBottomNav` 底部「分析」tab、`TopBar` 用戶選單加入「為你 / 會議分析 / 說話輔導」 | — |

---

## 資料庫 Schema

SQLAlchemy `Base.metadata.create_all()` 自動建立，8 張資料表：

| 資料表 | 說明 |
|--------|------|
| `users` | OAuth 使用者，`provider` 記錄登入平台 |
| `meetings` | 會議主記錄：`status / mode / language / share_token` |
| `transcripts` | 逐字稿片段：`speaker / offset / confidence` |
| `summaries` | AI 摘要：JSON 欄位存 `action_items / key_decisions` |
| `terminology` | 術語辭典：`terms` 為 JSON 陣列 |
| `templates` | 摘要範本：`system_prompt_override` 自訂 GPT 指令 |
| `shares` | 協作分享：`permission: view/edit`、`member_email` |
| `calendar_tokens` | OAuth 行事曆 Token（加密存儲） |

---

## 前端路由結構

```
/                      → DashboardPage（會議列表）
/record                → RecordingPage（即時錄音）
/upload                → UploadPage（音檔上傳）
/meeting/:id           → MeetingDetailPage（會議詳情）
/settings              → SettingsPage
/auth/callback         → DashboardPage（OAuth 回調）
/shared/:token         → SharedMeetingPage（公開分享，無需登入）
```

---

## 後端 API 端點清單

### 認證
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/auth/microsoft/callback` | Microsoft OAuth 回調 |
| GET | `/api/auth/google/callback` | Google OAuth 回調 |
| GET | `/api/auth/github/callback` | GitHub OAuth 回調 |
| POST | `/api/auth/dev/login` | 開發環境快速登入 |

### 行事曆（已實作）
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/calendar/connections` | 查詢行事曆連線狀態 |
| GET | `/api/calendar/events` | 取得指定日期事件 |
| POST | `/api/auth/calendar/microsoft` | 儲存 Microsoft 行事曆 Token |

### 會議
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/meetings` | 列出使用者會議 |
| POST | `/api/meetings` | 建立新會議 |
| GET | `/api/meetings/{id}` | 取得會議詳情 |
| DELETE | `/api/meetings/{id}` | 刪除會議 |
| DELETE | `/api/meetings/batch` | 批次刪除 |
| POST | `/api/meetings/{id}/upload` | 上傳音檔 |
| GET | `/api/meetings/{id}/transcription-status` | 批次轉錄狀態 |
| POST | `/api/summarize` | GPT-4 產生摘要 |

### 即時語音
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/speech-token` | 取得 Azure Speech 短效 Token |
| GET | `/api/ws/token` | 取得 Web PubSub Client URL |

### 其他
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/health` | 健康檢查 |
| CRUD | `/api/terminology` | 術語辭典管理 |
| CRUD | `/api/templates` | 摘要範本管理 |
| CRUD | `/api/share` | 協作分享管理 |

---

## 技術慣例

### 後端
- Python 3.11，FastAPI，每個功能模組拆成 `blueprints/` 下的獨立 `router`
- 從 `shared/config.py` 讀取環境變數；使用 Lazy-init pattern 避免啟動時連線失敗
- `shared/database.py` 定義所有 SQLAlchemy models 與 `get_session()`
- `shared/auth.py` 提供 `get_current_user` FastAPI Depends 依賴
- Rate limiting 用 slowapi，各端點獨立設定
- 回應統一走 `shared/responses.py` 格式

### 前端
- TypeScript strict mode，所有型別集中定義於 `src/types/index.ts`
- Tailwind CSS utility-first，色系以 `stone-` 為主（不用 `gray-`）
- Lucide React 作為圖示庫（`strokeWidth={1.75}` 為標準設定）
- `@azure/msal-react` 處理 Microsoft OAuth，`useAuth()` hook 取得 user 狀態
- API 呼叫封裝於 `src/services/`，不在元件內直接 fetch
- Context 放於 `src/contexts/`（`AuthContext` 已存在）

### 命名
- 後端：snake_case（Python 慣例）
- 前端：camelCase（變數/函式）、PascalCase（元件/型別）
- 資料庫欄位：snake_case
- API 路徑：`/api/kebab-case`

---

## 環境變數

### 前端 (`frontend/.env`)
```
REACT_APP_AZURE_CLIENT_ID=      # Microsoft Entra App Client ID
REACT_APP_AZURE_TENANT_ID=common
REACT_APP_GOOGLE_CLIENT_ID=     # Google OAuth（登入用，非行事曆）
REACT_APP_GITHUB_CLIENT_ID=
REACT_APP_BACKEND_URL=          # 後端 API URL
```

### 後端
```
AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_KEY / AZURE_OPENAI_DEPLOYMENT=gpt-4
SPEECH_KEY / SPEECH_REGION=eastasia
PG_HOST / PG_PORT / PG_DATABASE=lisbot / PG_USER / PG_PASSWORD / PG_SSL=require
AZURE_STORAGE_CONNECTION_STRING / STORAGE_CONTAINER=audio-recordings
WEB_PUBSUB_ENDPOINT / WEB_PUBSUB_KEY / WEB_PUBSUB_HUB=speech_hub
JWT_SECRET                       # 生產環境必須 ≥ 32 字元
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
FRONTEND_URL / ALLOWED_ORIGINS   # CORS 白名單
ACS_CONNECTION_STRING / ACS_SENDER_EMAIL
ENVIRONMENT=development|production
```

---

## 本地開發

```bash
# 後端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 前端（另開終端機）
cd frontend
npm ci
REACT_APP_BACKEND_URL=http://localhost:8000 npm start
```

> `package.json` 裡的 `"proxy": "http://localhost:7071"` 是 Azure Functions 遺留設定，
> 本地開發請用 `.env` 的 `REACT_APP_BACKEND_URL`。

---

## 部署

| 對象 | 觸發 | 方式 |
|------|------|------|
| 後端 | push → main (`backend/**`) | Docker build → ACR → Azure Container Apps |
| 前端 | push/PR → main (`frontend/**`) | `npm run build` → Azure Static Web Apps |

Terraform 基礎建設：`infrastructure/main.tf`（azurerm ~4.0，需 ≥ 1.5）

---

## 安全注意事項

- `JWT_SECRET` 生產環境 < 32 字元時後端啟動即拋 `RuntimeError`
- 所有 API 金鑰透過 **Azure Key Vault + Managed Identity** 注入，不寫入程式碼
- Blob Storage SAS Token 有效期 12 小時，container 為 `private`
- 行事曆 OAuth token 加密存入 `calendar_tokens` 資料表，其他 OAuth token 不落地
- CORS origins 由 `ALLOWED_ORIGINS` 環境變數控制（逗號分隔）

---

## 支援語言

| 代碼 | 語言 |
|------|------|
| `zh-TW` | 繁體中文（台灣） |
| `nan-TW` | 台語（閩南語）— Azure Speech 自訂模型 |
| `hak-TW` | 客語 — Azure Speech 自訂模型 |
| `en-US` | 英文 |
| `ja-JP` | 日文 |
| `zh-CN` | 簡體中文 |
| `auto` | 自動偵測 |

---

## 會議模式（7 種）

`meeting` / `interview` / `brainstorm` / `lecture` / `standup` / `review` / `client`

對應 7 種內建摘要範本（詳見 `src/types/index.ts` `BUILTIN_TEMPLATES`），
支援 `system_prompt_override` 完整覆寫 GPT System Prompt。

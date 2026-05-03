# XMeet AI

<p align="center">
  <img src="xmeet-ai-logo.svg" alt="XMeet AI Logo" width="120" />
</p>

<p align="center">
  <strong>企業級 AI 會議智慧記錄平台</strong><br/>
  即時字幕 · 說話者分離 · AI 雙輪摘要 · 台語／客語支援 · 行事曆整合 · 瀏覽器擴充功能
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white&style=flat-square"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white&style=flat-square"/>
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white&style=flat-square"/>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white&style=flat-square"/>
  <img alt="Azure" src="https://img.shields.io/badge/Azure-Native-0078D4?logo=microsoftazure&logoColor=white&style=flat-square"/>
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white&style=flat-square"/>
</p>

---

## 目錄

- [關於 XMeet AI](#關於-xmeet-ai)
- [功能總覽](#功能總覽)
- [技術棧](#技術棧)
- [系統架構](#系統架構)
- [資料庫 Schema](#資料庫-schema)
- [目錄結構](#目錄結構)
- [快速開始（本地 Docker）](#快速開始本地-docker)
- [本地開發（無 Docker）](#本地開發無-docker)
- [環境變數](#環境變數)
- [部署至 Azure](#部署至-azure)
- [瀏覽器擴充功能](#瀏覽器擴充功能)
- [安全注意事項](#安全注意事項)
- [支援語言](#支援語言)
- [會議模式](#會議模式)

---

## 關於 XMeet AI

XMeet AI 是基於 **Azure 雲端原生技術**打造的企業級 AI 會議記錄 SaaS 平台。

核心特色：
- **全台語 / 客語支援**（`nan-TW`、`hak-TW`）— 台灣本土語言語音識別
- **術語辭典直接注入 Speech 引擎**（Azure Speech `PhraseListGrammar`）— 識別率顯著提升
- **7 種會議模式** — 不同場景自動套用對應摘要策略
- **完整 Azure 原生堆疊** — 符合台灣企業合規與資料主權需求
- **Chrome / Edge 瀏覽器擴充功能** — 在 Teams、Zoom、Meet 中一鍵啟動

---

## 功能總覽

### 核心錄音與轉錄

| 功能 | 說明 |
|------|------|
| 🎙️ **即時字幕** | Azure Speech `ConversationTranscriber`，低延遲 WebSocket 推播 |
| 👥 **說話者分離** | 自動識別並標記不同說話者（diarization） |
| 📁 **音檔批次上傳** | 支援 MP3 / WAV / MP4 / M4A / OGG / FLAC，最大 200 MB，非同步轉錄 |
| 🗣️ **台語 / 客語** | `nan-TW`、`hak-TW` 語音識別，自動以繁中輸出 |
| 📚 **術語辭典強化** | 自訂術語透過 `PhraseListGrammar` 注入 Speech 引擎 |

### AI 智慧分析

| 功能 | 說明 |
|------|------|
| 📋 **雙輪摘要** | GPT-4.1 第一輪生成 Markdown 摘要，第二輪結構化 JSON（Action Items / Key Decisions） |
| 📝 **多種摘要範本** | 7 種內建範本 + 無限自訂，支援完整覆寫 GPT System Prompt |
| 🎯 **為你（For You）** | 跨會議彙整：主題 / 行動事項 / 相關內容 / 關鍵問題 |
| 🗺️ **會議政策分析** | Read 分數 / 情緒 / 參與度 / 遵行率 — 四維度圖表分析 |
| 🎤 **說話輔導** | WPM 語速分析、說話比例、提問數統計 |
| 💡 **AI 出席推薦** | 根據參與度自動建議調整出席人員 |
| 📊 **工作區概覽** | 時間管理成本、會議效率熱圖、跨組織指標 |

### 協作與整合

| 功能 | 說明 |
|------|------|
| 📅 **Outlook 行事曆** | Microsoft Graph API，從行程直接啟動錄音 |
| 👤 **多平台 OAuth** | Microsoft / Google / GitHub 三平台登入 |
| 🔗 **會議分享** | 檢視 / 編輯權限，Email 邀請通知 |
| 🏷️ **智能資料夾** | 7 種資料夾分類（計劃會議 / 客戶會議 / 銷售討論等） |
| 🔎 **Search Copilot** | 跨會議 AI 搜尋（規劃中） |
| 🌐 **瀏覽器擴充** | Chrome / Edge Manifest V3，偵測會議狀態，浮動錄製按鈕 |

---

## 技術棧

| 層次 | 技術 |
|------|------|
| **前端** | React 18 + TypeScript 5 + Tailwind CSS + Lucide Icons |
| **後端** | FastAPI 0.115 + Python 3.11 + SQLAlchemy 2.0 |
| **即時通訊** | Azure Web PubSub（WebSocket Hub：`speech_hub`） |
| **AI 語音** | Azure AI Speech — ConversationTranscriber + Batch Transcription |
| **AI 摘要** | Azure OpenAI GPT-4.1 |
| **資料庫** | PostgreSQL 16 |
| **檔案儲存** | Azure Blob Storage（GRS） |
| **身份驗證** | JWT (HS256) + Azure MSAL + OAuth 2.0 PKCE |
| **密鑰管理** | Azure Key Vault + Managed Identity |
| **速率限制** | slowapi（各端點獨立設定） |
| **Email 通知** | Azure Communication Services Email |
| **瀏覽器擴充** | Manifest V3 + TypeScript + webpack 5 |
| **基礎建設** | Terraform ≥ 1.5（azurerm ~4.0） |
| **容器** | Docker + Docker Compose |
| **CI/CD** | GitHub Actions → ACR → Azure Container Apps / Static Web Apps |

---

## 系統架構

```
使用者瀏覽器（React 18 + TypeScript + Tailwind）
  │
  ├─ Azure Static Web Apps（前端部署）
  │
  └─ Azure Container Apps（FastAPI 後端）
       │
       ├─ PostgreSQL 16（SQLAlchemy 2.0）
       ├─ Azure Blob Storage（音檔 GRS）
       ├─ Azure Web PubSub（即時字幕 WebSocket）
       ├─ Azure AI Speech（轉錄 + 說話者分離）
       ├─ Azure OpenAI GPT-4.1（雙輪摘要）
       ├─ Azure Key Vault（Managed Identity）
       └─ Azure Communication Services（Email 通知）
```

### 即時字幕流程

```
1. 前端 GET /api/speech-token  → Azure Speech SDK 初始化
2. 前端 GET /api/ws/token      → Web PubSub Client URL
3. 前端透過 WebSocket 連至 PubSub Hub (speech_hub)
4. PubSub 將音訊事件轉發 ConversationTranscriber
5. 識別結果 push 回 PubSub → 前端接收 type:transcript 訊息
```

### 音檔批次上傳流程

```
POST /api/meetings/{id}/upload
  → 上傳至 Azure Blob Storage
  → 觸發 Azure Speech Batch Transcription API（非同步）
  → 前端輪詢 GET .../transcription-status
```

---

## 資料庫 Schema

PostgreSQL，共 8 張資料表，由 SQLAlchemy `Base.metadata.create_all()` 自動建立：

| 資料表 | 說明 |
|--------|------|
| `users` | OAuth 使用者，`provider` 欄位記錄登入平台 |
| `meetings` | 會議主記錄：`status` / `mode` / `language` / `share_token` / `folder` |
| `transcripts` | 逐字稿片段：`speaker` / `offset` / `confidence` |
| `summaries` | AI 摘要：JSON 欄位存 `action_items` / `key_decisions` |
| `terminology` | 術語辭典：`terms` 為 JSON 陣列 |
| `templates` | 摘要範本：`system_prompt_override` 自訂 GPT 指令 |
| `shares` | 協作分享：`permission: view/edit`、`member_email` |
| `calendar_tokens` | OAuth 行事曆 Token（加密存儲） |

---

## 目錄結構

```
xmeet-ai/
├── backend/                          # FastAPI 後端
│   ├── blueprints/                   # API Router 模組
│   │   ├── auth_microsoft.py         # Microsoft OAuth 回調
│   │   ├── auth_google.py            # Google OAuth 回調
│   │   ├── auth_github.py            # GitHub OAuth 回調
│   │   ├── auth_apple.py             # Apple Sign In
│   │   ├── auth_dev.py               # 開發環境快速登入
│   │   ├── meetings.py               # 會議 CRUD + 批次刪除
│   │   ├── speech.py                 # Azure Speech Token 端點
│   │   ├── summarize.py              # GPT-4 雙輪摘要
│   │   ├── terminology.py            # 術語辭典 CRUD
│   │   ├── templates.py              # 摘要範本 CRUD
│   │   ├── upload.py                 # 音檔上傳 + Batch Transcription
│   │   ├── share.py                  # 協作分享 + Email 邀請
│   │   ├── calendar_bp.py            # Outlook 行事曆（Microsoft Graph）
│   │   ├── analytics.py              # 會議政策分析 / For You
│   │   ├── coaching.py               # 說話輔導分析
│   │   ├── recommendations.py        # AI 出席推薦
│   │   ├── copilot.py                # Search Copilot
│   │   ├── billing.py                # 計費與配額
│   │   ├── users.py                  # 使用者設定
│   │   ├── for_you.py                # 個人化儀表板
│   │   ├── storage_auth.py           # Blob Storage SAS Token
│   │   └── health.py                 # 健康檢查
│   ├── shared/
│   │   ├── config.py                 # 環境變數 + Lazy-init 服務客戶端
│   │   ├── database.py               # SQLAlchemy models + get_session()
│   │   ├── auth.py                   # JWT 簽發與 get_current_user Depends
│   │   ├── access.py                 # 存取控制輔助函式
│   │   ├── email.py                  # Azure ACS Email 邀請
│   │   ├── limiter.py                # slowapi Rate Limiter 實例
│   │   └── responses.py              # 統一回應格式
│   ├── main.py                       # FastAPI app 入口（CORS / lifespan）
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                         # React 18 前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx     # 會議列表（搜尋 / 資料夾篩選 / 批次刪除）
│   │   │   ├── RecordingPage.tsx     # 即時錄音
│   │   │   ├── UploadPage.tsx        # 音檔上傳
│   │   │   ├── MeetingDetailPage.tsx # 會議詳情（逐字稿 / 摘要 / 分享）
│   │   │   ├── CalendarPage.tsx      # Outlook 行事曆
│   │   │   ├── ForYouPage.tsx        # 個人化：主題 / 行動 / 相關內容
│   │   │   ├── AnalyticsPage.tsx     # 會議政策分析（4 分頁圖表）
│   │   │   ├── CoachingPage.tsx      # 說話輔導（WPM / 說話比例 / 提問數）
│   │   │   ├── RecommendationsPage.tsx  # AI 出席推薦
│   │   │   ├── WorkspacePage.tsx     # 工作區概覽
│   │   │   ├── WorkspaceAdminPage.tsx   # 工作區管理（成員 / 人員 / 設定）
│   │   │   ├── BillingPage.tsx       # 計費與配額
│   │   │   ├── SettingsPage.tsx      # 個人設定（16 分頁）
│   │   │   └── SharedMeetingPage.tsx # 分享連結公開檢視（無需登入）
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx      # 側邊欄 + 頂部導覽
│   │   │   │   ├── TopBar.tsx        # 頂部列：搜尋 / 通知 / 用戶選單
│   │   │   │   └── MobileBottomNav.tsx
│   │   │   ├── RecordingPanel.tsx
│   │   │   ├── AudioUploadPanel.tsx
│   │   │   ├── TranscriptView.tsx
│   │   │   ├── SummaryPanel.tsx
│   │   │   ├── CalendarPanel.tsx
│   │   │   ├── OAuthButtons.tsx
│   │   │   ├── ShareMeetingModal.tsx
│   │   │   ├── SummaryTemplateModal.tsx
│   │   │   ├── TermDictionaryModal.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   ├── hooks/
│   │   │   ├── useAudioRecorder.ts
│   │   │   ├── useMeetings.ts
│   │   │   ├── useMeetingDetail.ts
│   │   │   └── useWebSocket.ts
│   │   ├── services/                 # API 呼叫封裝
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx
│   │   └── types/
│   │       └── index.ts              # 全域 TypeScript 型別定義
│   ├── public/
│   │   └── staticwebapp.config.json  # Azure Static Web Apps 路由規則
│   └── package.json
│
├── extension/                        # Chrome / Edge 瀏覽器擴充功能
│   ├── src/
│   │   ├── background/background.ts  # Service Worker：OAuth / 徽章更新
│   │   ├── content/content.ts        # Content Script：會議偵測 + 浮動按鈕
│   │   ├── popup/                    # 彈出視窗：登入 / 會議列表
│   │   └── shared/                   # 共用：型別 / auth / api
│   ├── manifest.json                 # Manifest V3
│   ├── webpack.config.cjs
│   ├── tsconfig.json
│   └── package.json
│
├── infrastructure/                   # Terraform IaC
│   ├── main.tf                       # azurerm ~4.0
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
│
├── docs/
│   ├── 操作手冊.md
│   ├── azure-部署手冊.md
│   └── oauth-setup.md
│
├── docker-compose.yml                # 本地 Docker 開發環境
├── .env.example                      # 環境變數範例
└── .github/
    └── workflows/
        ├── backend-deploy.yml        # 後端 CI/CD
        └── frontend-deploy.yml       # 前端 CI/CD
```

---

## 快速開始（本地 Docker）

最快的方式：只需 Docker，無需安裝 Python / Node.js。

```bash
# 1. Clone 專案
git clone https://github.com/guessleej/xmeet-ai.git
cd xmeet-ai

# 2. 複製環境變數範例
cp .env.example .env
# 編輯 .env，至少填入 JWT_SECRET（任意 32 字元以上字串）
# Azure 服務金鑰留空時系統會優雅降級（可先跳過）

# 3. 啟動所有服務
docker compose up -d

# 4. 開啟瀏覽器
# 前端：http://localhost
# 後端 API：http://localhost:18000
# API 文件：http://localhost:18000/docs
```

### 服務埠口對照

| 服務 | 容器內 | 主機映射 |
|------|--------|---------|
| PostgreSQL | 5432 | 15432 |
| FastAPI 後端 | 8000 | 18000 |
| React 前端（nginx） | 80 | 80 |

### 常用指令

```bash
# 查看日誌
docker compose logs -f backend
docker compose logs -f frontend

# 重建特定服務
docker compose build backend
docker compose up -d backend

# 停止所有服務
docker compose down

# 清除資料庫 volume（重置資料）
docker compose down -v
```

---

## 本地開發（無 Docker）

### 前置需求

- Python 3.11+
- Node.js 20+
- PostgreSQL 16+

### 後端

```bash
cd backend

# 建立虛擬環境
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 安裝依賴
pip install -r requirements.txt

# 設定環境變數
export JWT_SECRET="dev-secret-key-at-least-32-chars"
export PG_HOST=localhost
export PG_DATABASE=xmeet
export PG_USER=your_user
export PG_PASSWORD=your_password
export PG_SSL=disable
export ENVIRONMENT=development

# 啟動開發伺服器
uvicorn main:app --reload --port 8000
```

API 文件：http://localhost:8000/docs

### 前端

```bash
cd frontend

npm ci

# 設定後端 URL
echo "REACT_APP_BACKEND_URL=http://localhost:8000" > .env

npm start   # http://localhost:3000
```

### 瀏覽器擴充功能

```bash
cd extension

npm ci
npm run build   # 輸出至 extension/dist/

# Chrome/Edge：
# 1. 開啟 chrome://extensions  /  edge://extensions
# 2. 啟用「開發人員模式」
# 3. 點擊「載入未封裝項目」→ 選擇 extension/dist/ 資料夾
```

---

## 環境變數

完整範例請參考根目錄 [`.env.example`](.env.example)。

### 前端（`frontend/.env`）

| 變數 | 必填 | 說明 |
|------|------|------|
| `REACT_APP_AZURE_CLIENT_ID` | ✓ | Microsoft Entra App Client ID |
| `REACT_APP_AZURE_TENANT_ID` | | Tenant ID，多租戶填 `common` |
| `REACT_APP_GOOGLE_CLIENT_ID` | | Google OAuth 2.0 Client ID |
| `REACT_APP_GITHUB_CLIENT_ID` | | GitHub OAuth App Client ID |
| `REACT_APP_BACKEND_URL` | ✓ | 後端 API 基底 URL |

### 後端

| 變數 | 必填 | 說明 |
|------|------|------|
| `JWT_SECRET` | ✓ | JWT 簽章密鑰（生產環境 ≥ 32 字元） |
| `PG_HOST` | ✓ | PostgreSQL 主機 |
| `PG_DATABASE` | ✓ | 資料庫名稱（預設 `xmeet`） |
| `PG_USER` | ✓ | 資料庫使用者 |
| `PG_PASSWORD` | ✓ | 資料庫密碼 |
| `PG_SSL` | | SSL 模式（`require` / `disable`） |
| `AZURE_OPENAI_ENDPOINT` | | Azure OpenAI 端點 URL |
| `AZURE_OPENAI_KEY` | | Azure OpenAI API 金鑰 |
| `AZURE_OPENAI_DEPLOYMENT` | | 模型部署名稱（預設 `gpt-4`） |
| `SPEECH_KEY` | | Azure AI Speech 金鑰 |
| `SPEECH_REGION` | | Speech 區域（預設 `eastasia`） |
| `AZURE_STORAGE_CONNECTION_STRING` | | Blob Storage 連線字串 |
| `STORAGE_CONTAINER` | | 音檔容器名稱（預設 `audio-recordings`） |
| `WEB_PUBSUB_ENDPOINT` | | Azure Web PubSub 端點 |
| `WEB_PUBSUB_KEY` | | Azure Web PubSub 金鑰 |
| `WEB_PUBSUB_HUB` | | Hub 名稱（預設 `speech_hub`） |
| `MICROSOFT_CLIENT_ID` | | Microsoft OAuth Client ID |
| `MICROSOFT_CLIENT_SECRET` | | Microsoft OAuth Client Secret |
| `GOOGLE_CLIENT_ID` | | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | | Google OAuth Client Secret |
| `GITHUB_CLIENT_ID` | | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | | GitHub OAuth Client Secret |
| `FRONTEND_URL` | | 前端 URL（CORS 白名單） |
| `ALLOWED_ORIGINS` | | CORS Origins（逗號分隔） |
| `ACS_CONNECTION_STRING` | | Azure Communication Services 連線字串 |
| `ACS_SENDER_EMAIL` | | Email 寄件者地址 |
| `ENVIRONMENT` | | `development` / `production` |

> **提示**：Azure 服務金鑰（Speech、OpenAI、PubSub 等）留空時，相關功能會優雅降級並回傳 mock 資料，適合前端開發初期使用。

---

## 部署至 Azure

### 快速部署（GitHub Actions）

1. Fork 此 Repository
2. 在 GitHub → Settings → Secrets 設定以下 Secrets：

| Secret | 說明 |
|--------|------|
| `AZURE_CREDENTIALS` | `az ad sp create-for-rbac` 輸出的 JSON |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Static Web Apps 部署 Token |
| `REACT_APP_AZURE_CLIENT_ID` | 前端 Microsoft Client ID |
| `REACT_APP_BACKEND_URL` | 後端 Container Apps URL |

3. Push 至 `main` 分支，GitHub Actions 自動觸發部署

### Terraform 基礎建設

```bash
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
# 填入 subscription_id 等參數

terraform init
terraform plan
terraform apply
```

詳細步驟請參考 [`docs/azure-部署手冊.md`](docs/azure-部署手冊.md)。

---

## 瀏覽器擴充功能

XMeet AI Web Extension 支援 **Chrome** 與 **Edge**（Manifest V3）。

### 功能
- 自動偵測 Microsoft Teams、Zoom、Google Meet、Webex 會議
- 偵測到會議時顯示浮動錄製按鈕
- 彈出視窗快速存取：近期會議列表、一鍵錄製 / 上傳
- 工作台徽章即時顯示進行中會議數
- Microsoft OAuth 單一登入（與主應用共享 Token）

### 建置與安裝

```bash
cd extension
npm ci

# 開發模式（監聽檔案變更）
npm run dev

# 生產建置
npm run build
```

建置完成後，在 Chrome / Edge 擴充功能頁面載入 `extension/dist/` 資料夾。

---

## 安全注意事項

- 生產環境 `JWT_SECRET` 必須 ≥ 32 字元，否則後端啟動時會直接拋出 `RuntimeError`
- 所有 API 金鑰透過 **Azure Key Vault + Managed Identity** 注入，不寫入程式碼或環境變數
- Azure Blob Storage 使用 **SAS Token**（12 小時有效期）授權，Container 存取類型為 `private`
- 行事曆 OAuth token 加密存入 `calendar_tokens` 資料表；其他 OAuth token 不落地
- CORS Origins 由 `ALLOWED_ORIGINS` 環境變數控制（逗號分隔）
- Rate Limiting 由 slowapi 各端點獨立設定

---

## 支援語言

| 代碼 | 語言 |
|------|------|
| `zh-TW` | 繁體中文（台灣）|
| `nan-TW` | 台語（閩南語）— Azure Speech 自訂模型 |
| `hak-TW` | 客語 — Azure Speech 自訂模型 |
| `en-US` | 英文 |
| `ja-JP` | 日文 |
| `zh-CN` | 簡體中文 |
| `auto` | 自動偵測 |

---

## 會議模式

共 7 種模式，對應不同的 GPT 摘要策略（`BUILTIN_TEMPLATES` 定義於 `src/types/index.ts`）：

| 模式 | 說明 |
|------|------|
| `meeting` | 一般會議 — 決策事項 + 行動項目 |
| `interview` | 面試 — 候選人評估 + 關鍵問答 |
| `brainstorm` | 腦力激盪 — 創意整理 + 可行性評估 |
| `lecture` | 課堂 / 演講 — 重點筆記 + 學習目標 |
| `standup` | 站立會議 — 昨日 / 今日 / 阻礙事項 |
| `review` | 評審 / 回顧 — 優缺點分析 + 改進建議 |
| `client` | 客戶會議 — 需求確認 + 後續跟進 |

所有模式均支援 `system_prompt_override` 完整覆寫 GPT System Prompt。

---

<p align="center">
  <a href="../../issues">回報問題</a> ·
  <a href="docs/操作手冊.md">操作手冊</a> ·
  <a href="docs/azure-部署手冊.md">Azure 部署手冊</a>
</p>

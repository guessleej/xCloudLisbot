# xCloudLisbot — AI 會議智慧記錄系統

> **即時語音轉錄 · 說話者分離 · AI 智慧摘要 · 多平台 OAuth 登入**

基於 Azure OpenAI + Azure AI Speech 的企業級會議記錄 SaaS，支援 Microsoft / Google / GitHub / Apple 四平台 OAuth 登入，透過 Web Audio API 即時擷取音訊、進行說話者分離，並使用 GPT-4 自動產生結構化會議摘要與待辦事項。

---

## 技術棧

| 層次 | 技術 |
|------|------|
| 前端 | React 18 + TypeScript + Tailwind CSS + MSAL.js |
| 後端 | Azure Functions v4 (Python 3.11) |
| AI 語音 | Azure AI Speech — Conversation Transcription (Diarization) |
| AI 摘要 | Azure OpenAI GPT-4 Turbo |
| 即時通訊 | Azure Web PubSub (WebSocket) |
| 資料庫 | Azure Cosmos DB (NoSQL) |
| 檔案儲存 | Azure Blob Storage |
| 身份驗證 | JWT + MSAL / OAuth 2.0 |
| 基礎建設 | Terraform (IaC) |
| CI/CD | GitHub Actions |

---

## 系統架構圖

```mermaid
graph TB
    subgraph Client["🖥️ 前端 (React + TypeScript)"]
        A[Web Audio API<br/>16kHz PCM]
        B[WebSocket Client<br/>Azure Web PubSub]
        C[OAuth Buttons<br/>MSAL / Google / GitHub / Apple]
        D[Transcript View<br/>即時顯示逐字稿]
        E[Summary Panel<br/>AI 摘要結果]
    end

    subgraph Gateway["🛡️ Azure API Management / Front Door (WAF)"]
        F[Rate Limiting<br/>DDoS Protection]
    end

    subgraph Backend["⚙️ Azure Functions (Python 3.11)"]
        G[Auth Handler<br/>JWT 驗證]
        H[Speech Processor<br/>WebSocket 接收音訊]
        I[Summarize API<br/>GPT-4 摘要生成]
        J[Meeting CRUD<br/>會議管理]
    end

    subgraph AzureAI["🤖 Azure AI Services"]
        K[Azure AI Speech<br/>ConversationTranscriber<br/>說話者分離]
        L[Azure OpenAI<br/>GPT-4 Turbo<br/>摘要 + 待辦事項]
    end

    subgraph Storage["💾 資料儲存"]
        M[Azure Cosmos DB<br/>會議中繼資料<br/>逐字稿]
        N[Azure Blob Storage<br/>原始音訊檔案]
        O[Azure Key Vault<br/>機密管理]
        P[Redis Cache<br/>Session / Token]
    end

    subgraph Auth["🔐 OAuth 提供者"]
        Q[Microsoft Entra ID]
        R[Google OAuth 2.0]
        S[GitHub OAuth App]
        T[Apple Sign In]
    end

    A -->|PCM Binary| B
    B -->|WebSocket| Gateway
    C -->|OAuth Flow| Auth
    Gateway --> Backend
    G --> P
    H --> K
    K -->|逐字稿 JSON| H
    H -->|Web PubSub| B
    I --> L
    L -->|摘要 Markdown| I
    J --> M
    H --> N
    Backend --> O
    D -.->|即時更新| B
    E -.->|呼叫 API| I
```

---

## 資料庫與資料流架構圖

```mermaid
flowchart LR
    subgraph Input["📥 輸入層"]
        MIC[麥克風輸入<br/>getUserMedia]
        OAUTH[OAuth Token]
    end

    subgraph Processing["⚙️ 處理層"]
        WA[Web Audio API<br/>Float32→Int16 PCM]
        WS[WebSocket<br/>二進位串流]
        ASR[Azure Speech SDK<br/>ConversationTranscriber]
        GPT[Azure OpenAI<br/>GPT-4 Turbo]
    end

    subgraph DataStore["💾 Cosmos DB 資料結構"]
        subgraph Collections
            U[users<br/>id, email, provider<br/>name, avatar, createdAt]
            M[meetings<br/>id, userId, title<br/>startTime, endTime<br/>status, audioUrl]
            TR[transcripts<br/>meetingId, speaker<br/>text, offset, duration<br/>confidence]
            SU[summaries<br/>meetingId, markdown<br/>actionItems, decisions<br/>nextTopics]
        end
    end

    subgraph Output["📤 輸出層"]
        RT[即時逐字稿<br/>Web PubSub]
        SM[會議摘要<br/>Markdown]
        AI[Action Items<br/>JSON]
        EX[匯出<br/>PDF / Markdown]
    end

    MIC --> WA
    WA --> WS
    WS --> ASR
    OAUTH --> U
    ASR -->|speaker + text| TR
    TR --> GPT
    GPT --> SU
    M --> TR
    M --> SU
    ASR -->|即時推送| RT
    SU --> SM
    SU --> AI
    SM --> EX
```

---

## 使用者操作流程圖

```mermaid
sequenceDiagram
    actor User as 使用者
    participant FE as 前端 React App
    participant OAuth as OAuth 提供者
    participant API as Azure Functions
    participant Speech as Azure AI Speech
    participant GPT as Azure OpenAI
    participant DB as Cosmos DB
    participant WPS as Azure Web PubSub

    Note over User,WPS: 🔐 登入流程
    User->>FE: 點擊「Microsoft / Google / GitHub / Apple 登入」
    FE->>OAuth: Redirect to OAuth Authorization URL
    OAuth->>User: 顯示授權頁面
    User->>OAuth: 同意授權
    OAuth->>FE: 回傳 Authorization Code
    FE->>API: POST /auth/callback/{provider}
    API->>OAuth: 交換 Access Token
    API->>DB: 建立/更新 user 記錄
    API->>FE: 回傳 JWT Token
    FE->>FE: 儲存 JWT (sessionStorage)

    Note over User,WPS: 🎙️ 會議錄音流程
    User->>FE: 輸入會議標題，點擊「開始錄音」
    FE->>API: POST /api/meetings (建立會議記錄)
    API->>DB: 寫入 meeting 文件
    FE->>FE: getUserMedia() 取得麥克風權限
    FE->>WPS: WebSocket 連線 (帶 JWT)
    FE->>Speech: 串流 PCM 音訊 (16kHz, 16bit, Mono)

    loop 即時轉錄
        Speech->>API: 觸發 transcription event
        API->>DB: 寫入 transcript 文件
        API->>WPS: 推送逐字稿到前端
        WPS->>FE: 即時顯示「Speaker X: 文字內容」
    end

    Note over User,WPS: 📋 摘要生成流程
    User->>FE: 點擊「停止錄音」
    FE->>WPS: 關閉 WebSocket
    FE->>API: POST /api/summarize
    API->>DB: 讀取所有 transcripts
    API->>GPT: 呼叫 GPT-4 生成摘要 + Action Items
    GPT->>API: 回傳 Markdown 摘要 + JSON 待辦事項
    API->>DB: 寫入 summary 文件
    API->>FE: 回傳結構化摘要
    FE->>User: 顯示摘要、決議事項、待辦清單
    User->>FE: 點擊「匯出」下載 PDF / Markdown
```

---

## 專案結構

```
xCloudLisbot/
├── README.md
├── .gitignore
├── .env.example
│
├── frontend/                        # React 18 + TypeScript
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.tsx                # 入口點
│       ├── App.tsx                  # 主應用程式 + MSAL Provider
│       ├── App.css
│       ├── types/
│       │   └── index.ts             # TypeScript 型別定義
│       ├── hooks/
│       │   └── useAudioRecorder.ts  # Web Audio API Hook
│       ├── contexts/
│       │   └── AuthContext.tsx      # 全域身份驗證 Context
│       └── components/
│           ├── OAuthButtons.tsx     # 四平台登入按鈕
│           ├── RecordingPanel.tsx   # 錄音控制面板
│           ├── TranscriptView.tsx   # 即時逐字稿顯示
│           └── SummaryPanel.tsx     # 摘要結果展示
│
├── backend/                         # Azure Functions v4 (Python)
│   ├── requirements.txt
│   ├── host.json
│   ├── local.settings.json.example
│   └── function_app.py              # 所有 Functions 主檔
│
├── infrastructure/                  # Terraform IaC
│   ├── main.tf                      # 所有 Azure 資源定義
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
│
├── .github/
│   └── workflows/
│       ├── frontend-deploy.yml      # 部署前端至 Azure Static Web Apps
│       └── backend-deploy.yml       # 部署後端至 Azure Functions
│
└── docs/
    └── oauth-setup.md               # OAuth 應用程式設定指南
```

---

## 快速開始

### 前置需求

- Node.js 18+
- Python 3.11+
- Azure CLI (`az login`)
- Terraform >= 1.5
- Azure Functions Core Tools v4

### 1. 部署基礎建設

```bash
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
# 填入你的 Azure Subscription ID 與 OpenAI 設定
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

### 2. 設定 OAuth 應用程式

請參閱 [docs/oauth-setup.md](docs/oauth-setup.md)，依序完成四個平台的應用程式註冊。

### 3. 啟動後端

```bash
cd backend
cp local.settings.json.example local.settings.json
# 填入 Terraform output 的各項 Key
pip install -r requirements.txt
func start
```

### 4. 啟動前端

```bash
cd frontend
cp .env.example .env
# 填入後端 URL 與 OAuth Client IDs
npm install
npm start
```

---

## 環境變數說明

| 變數名稱 | 說明 |
|---------|------|
| `REACT_APP_AZURE_CLIENT_ID` | Microsoft Entra ID App Client ID |
| `REACT_APP_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `REACT_APP_GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `REACT_APP_BACKEND_URL` | Azure Functions 後端 URL |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI 服務端點 |
| `AZURE_OPENAI_KEY` | Azure OpenAI API Key |
| `SPEECH_KEY` | Azure AI Speech Service Key |
| `SPEECH_REGION` | Azure AI Speech 區域 (e.g. `eastasia`) |
| `COSMOS_ENDPOINT` | Cosmos DB 端點 |
| `COSMOS_KEY` | Cosmos DB Primary Key |
| `JWT_SECRET` | JWT 簽名密鑰 (建議 32 字元以上) |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_KEY_ID` | Apple Sign In Key ID |
| `APPLE_PRIVATE_KEY` | Apple .p8 私鑰內容 |

---

## 部署架構（Azure 資源清單）

| 資源 | SKU | 用途 |
|------|-----|------|
| Azure Static Web Apps | Standard | 前端托管 |
| Azure Functions (Linux) | EP2 Elastic Premium | 後端 API |
| Azure OpenAI | GPT-4 Turbo | AI 摘要生成 |
| Azure AI Speech | Standard | 語音轉文字 + 說話者分離 |
| Azure Web PubSub | Standard (1 unit) | 即時 WebSocket |
| Azure Cosmos DB | Serverless | 中繼資料儲存 |
| Azure Blob Storage | LRS | 音訊檔案儲存 |
| Azure Key Vault | Standard | 機密管理 |
| Azure API Management | Developer | API 閘道 |

> **預估月費用**：約 USD $150–300（視使用量而定），OpenAI 用量另計。

---

## License

MIT © 2024 xCloudLisbot Contributors

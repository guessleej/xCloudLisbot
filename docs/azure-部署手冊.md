<style>
body, * { font-family: "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif !important; }
</style>

# XMeet AI Azure 部署手冊

**版本：v2.0　　最後更新：2025-03**

---

## 目錄

1. [前置需求](#1-前置需求)
2. [Azure 資源架構](#2-azure-資源架構)
3. [步驟一：Terraform 部署基礎建設](#3-步驟一terraform-部署基礎建設)
4. [步驟二：OAuth 應用程式設定](#4-步驟二oauth-應用程式設定)
5. [步驟三：行事曆 OAuth 設定](#5-步驟三行事曆-oauth-設定)
6. [步驟四：後端部署](#6-步驟四後端部署)
7. [步驟五：前端部署](#7-步驟五前端部署)
8. [步驟六：Web PubSub Event Handler 設定](#8-步驟六web-pubsub-event-handler-設定)
9. [步驟七：Cosmos DB 容器驗證](#9-步驟七cosmos-db-容器驗證)
10. [步驟八：CI/CD 設定（GitHub Actions）](#10-步驟八cicd-設定github-actions)
11. [驗證與健康檢查](#11-驗證與健康檢查)
12. [監控與維運](#12-監控與維運)
13. [常見部署問題](#13-常見部署問題)
14. [費用估算](#14-費用估算)
15. [資源清理](#15-資源清理)

---

## 1. 前置需求

### 1.1 本機工具安裝

```bash
# 確認 Node.js 版本（需 20+）
node --version  # v20.x.x

# 確認 Python 版本（需 3.11）
python3 --version  # Python 3.11.x

# 安裝 Azure CLI
brew install azure-cli  # macOS
# 或 https://learn.microsoft.com/cli/azure/install-azure-cli

# 安裝 Azure Functions Core Tools v4
npm install -g azure-functions-core-tools@4

# 安裝 Terraform
brew install terraform  # macOS
# 或 https://developer.hashicorp.com/terraform/install

# 登入 Azure
az login
az account show  # 確認正確的 Subscription
```

### 1.2 Azure 訂閱需求

- **Azure 訂閱**：需有付費訂閱（部分服務不支援免費層）
- **Azure OpenAI 存取**：需申請 Azure OpenAI 服務存取（https://aka.ms/oai/access）
- **Azure AI Speech**：標準 S0 方案支援說話者分離功能

### 1.3 複製專案

```bash
git clone https://github.com/guessleej/XMeet AI.git
cd XMeet AI
```

---

## 2. Azure 資源架構

### 部署完成後的資源清單

| 資源名稱 | 類型 | SKU | 用途 |
|---------|------|-----|------|
| `rg-lisbot-{suffix}` | Resource Group | — | 所有資源容器 |
| `func-lisbot-{suffix}` | Azure Functions | EP2 Elastic Premium | 後端 API (Python 3.11) |
| `swa-lisbot-{suffix}` | Static Web Apps | Standard | 前端 React 應用 |
| `openai-lisbot-{suffix}` | Azure OpenAI | S0 | GPT-4 摘要生成 |
| `speech-lisbot-{suffix}` | Azure AI Speech | S0 | 語音轉錄 + 說話者分離 |
| `pubsub-lisbot-{suffix}` | Azure Web PubSub | Standard S1 | 即時 WebSocket |
| `cosmos-lisbot-{suffix}` | Cosmos DB | Serverless | 8 個 Container 資料儲存 |
| `st{suffix}` | Storage Account | Standard LRS | 音檔儲存 |
| `kv-lisbot-{suffix}` | Key Vault | Standard | 機密管理 |
| `apim-lisbot-{suffix}` | API Management | Developer | API 閘道（選用） |

### 網路資料流

```
使用者瀏覽器
    │
    ├── HTTPS ──→ Azure Static Web Apps (前端)
    │
    └── HTTPS ──→ Azure Functions (後端 API)
                      │
                      ├── Azure Web PubSub (WebSocket)
                      │       └── 前端 WebSocket 連線
                      │
                      ├── Azure OpenAI (GPT-4)
                      ├── Azure AI Speech (轉錄)
                      ├── Azure Cosmos DB (資料)
                      └── Azure Blob Storage (音檔)
```

---

## 3. 步驟一：Terraform 部署基礎建設

### 3.1 設定 Terraform 變數

```bash
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
```

編輯 `terraform.tfvars`：

```hcl
# Azure 訂閱 ID（az account show --query id -o tsv）
subscription_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 部署區域（建議 eastasia 或 japaneast，語音服務需支援台語）
location = "eastasia"

# Azure OpenAI 部署區域（需支援 GPT-4，建議 eastus 或 swedencentral）
openai_location = "eastus"

# 資源命名後綴（3-6 個英數字，確保全球唯一）
suffix = "lisbot001"

# 環境標籤
environment = "production"
```

### 3.2 執行 Terraform

```bash
# 初始化 Terraform（下載 Provider）
terraform init

# 預覽將建立的資源
terraform plan -out=tfplan

# 確認無誤後執行部署（約需 15-25 分鐘）
terraform apply tfplan
```

### 3.3 儲存 Terraform Output

```bash
# 將 output 儲存至檔案備用
terraform output -json > terraform_output.json

# 重要 output 預覽
terraform output backend_url        # Azure Functions URL
terraform output frontend_token     # Static Web Apps 部署 Token
terraform output cosmos_endpoint    # Cosmos DB 端點
terraform output speech_key         # Speech Service Key
terraform output openai_endpoint    # OpenAI 端點
terraform output pubsub_endpoint    # Web PubSub 端點
terraform output storage_connection # Storage 連線字串
```

---

## 4. 步驟二：OAuth 應用程式設定

### 4.1 Microsoft Entra ID（必要）

1. 前往 [Azure Portal](https://portal.azure.com) → **Azure Active Directory** → **應用程式註冊**
2. 點擊「**新增註冊**」
3. 填寫：
   - **名稱**：`XMeet AI`
   - **支援的帳戶類型**：任何組織目錄中的帳戶及個人 Microsoft 帳戶
   - **重新導向 URI**：`https://{your-functions-url}/api/auth/callback/microsoft`（暫時可留空）
4. 建立後記錄：
   - `應用程式 (用戶端) 識別碼` → `REACT_APP_AZURE_CLIENT_ID`
   - `目錄 (租用戶) 識別碼` → `REACT_APP_AZURE_TENANT_ID`
5. 前往「**憑證與秘密**」→「**新增用戶端密碼**」
   - 記錄密碼值 → `MICROSOFT_CLIENT_SECRET`
6. 前往「**API 權限**」→ 新增：
   - `User.Read`（登入用）
   - `Calendars.Read`（行事曆用）

### 4.2 Google OAuth（必要）

1. 前往 [Google Cloud Console](https://console.cloud.google.com)
2. 建立新專案或選擇現有專案
3. **API 和服務** → **OAuth 同意畫面**
   - 選「外部」
   - 填入應用程式名稱、支援 Email
   - **範圍**：新增 `email`、`profile`、`openid`、`calendar.readonly`
4. **憑證** → **建立憑證** → **OAuth 用戶端 ID**
   - 應用程式類型：**Web 應用程式**
   - 已授權的重新導向 URI：
     - `https://{functions-url}/api/auth/callback/google`
     - `https://{functions-url}/api/auth/callback/calendar/google`
5. 記錄 `用戶端 ID` 和 `用戶端密鑰`

### 4.3 GitHub OAuth（選用）

1. GitHub → Settings → Developer settings → **OAuth Apps** → **New OAuth App**
2. 填寫：
   - Application name：`XMeet AI`
   - Homepage URL：前端網址
   - Authorization callback URL：`https://{functions-url}/api/auth/callback/github`
3. 記錄 `Client ID` 和 `Client Secret`

### 4.4 Apple Sign In（選用）

1. 前往 [Apple Developer Portal](https://developer.apple.com)
2. **Certificates, IDs & Profiles** → **Identifiers** → 建立 Services ID
3. 啟用 Sign In with Apple，設定 Return URLs：
   - `https://{functions-url}/api/auth/callback/apple`
4. 建立 Private Key（下載 .p8 檔案）
5. 記錄 Team ID、Key ID、Service ID（Client ID）

---

## 5. 步驟三：行事曆 OAuth 設定

### 5.1 Microsoft Calendar 追加設定

在 4.1 建立的 Entra ID App 中：

1. **API 權限** → **新增權限** → **Microsoft Graph**
2. 新增委派權限：
   - `Calendars.Read`
   - `User.Read`
3. 點擊「**為 {組織} 授與管理員同意**」

### 5.2 Google Calendar 追加設定

在 4.2 的 OAuth 同意畫面中確認已新增範圍：
- `https://www.googleapis.com/auth/calendar.readonly`

並在重新導向 URI 確認已加入：
- `https://{functions-url}/api/auth/callback/calendar/google`

---

## 6. 步驟四：後端部署

### 6.1 設定 local.settings.json

```bash
cd backend
cp local.settings.json.example local.settings.json
```

填入所有環境變數（參考下方完整範本）：

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "<terraform output: storage_connection>",
    "FUNCTIONS_WORKER_RUNTIME": "python",

    "AZURE_OPENAI_ENDPOINT": "<terraform output: openai_endpoint>",
    "AZURE_OPENAI_KEY": "<terraform output: openai_key>",
    "AZURE_OPENAI_DEPLOYMENT": "gpt-4",

    "SPEECH_KEY": "<terraform output: speech_key>",
    "SPEECH_REGION": "eastasia",

    "COSMOS_ENDPOINT": "<terraform output: cosmos_endpoint>",
    "COSMOS_KEY": "<terraform output: cosmos_key>",
    "COSMOS_DATABASE": "lisbot",

    "AZURE_STORAGE_CONNECTION_STRING": "<terraform output: storage_connection>",
    "STORAGE_CONTAINER": "audio-recordings",

    "WEB_PUBSUB_ENDPOINT": "<terraform output: pubsub_endpoint>",
    "WEB_PUBSUB_KEY": "<terraform output: pubsub_key>",
    "WEB_PUBSUB_HUB": "speech_hub",

    "JWT_SECRET": "<隨機 32 字元以上字串>",

    "MICROSOFT_CLIENT_ID": "<Entra ID App Client ID>",
    "MICROSOFT_CLIENT_SECRET": "<Entra ID App Client Secret>",
    "MICROSOFT_TENANT_ID": "common",

    "GOOGLE_CLIENT_ID": "<Google OAuth Client ID>",
    "GOOGLE_CLIENT_SECRET": "<Google OAuth Client Secret>",

    "GITHUB_CLIENT_ID": "<GitHub OAuth Client ID>",
    "GITHUB_CLIENT_SECRET": "<GitHub OAuth Client Secret>",

    "APPLE_TEAM_ID": "<Apple Team ID>",
    "APPLE_KEY_ID": "<Apple Key ID>",
    "APPLE_CLIENT_ID": "<Apple Service ID>",
    "APPLE_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",

    "FRONTEND_URL": "<Static Web Apps URL>",
    "ALLOWED_ORIGINS": "<Static Web Apps URL>,http://localhost:3000"
  }
}
```

### 6.2 本機測試後端

```bash
cd backend
pip install -r requirements.txt
func start
```

驗證：
```bash
curl http://localhost:7071/api/health
# 期望：{"status": "healthy", ...}
```

### 6.3 部署至 Azure Functions

```bash
# 部署（使用 Terraform 建立的 Function App 名稱）
FUNC_APP_NAME=$(terraform -chdir=../infrastructure output -raw function_app_name)
func azure functionapp publish $FUNC_APP_NAME --python

# 驗證遠端部署
curl https://${FUNC_APP_NAME}.azurewebsites.net/api/health
```

### 6.4 設定 Function App 環境變數

透過 Azure CLI 批次設定（避免手動逐一設定）：

```bash
az functionapp config appsettings set \
  --name $FUNC_APP_NAME \
  --resource-group rg-lisbot-{suffix} \
  --settings \
  "AZURE_OPENAI_ENDPOINT=..." \
  "AZURE_OPENAI_KEY=..." \
  "SPEECH_KEY=..." \
  "SPEECH_REGION=eastasia" \
  "COSMOS_ENDPOINT=..." \
  "COSMOS_KEY=..." \
  "COSMOS_DATABASE=lisbot" \
  "AZURE_STORAGE_CONNECTION_STRING=..." \
  "STORAGE_CONTAINER=audio-recordings" \
  "WEB_PUBSUB_ENDPOINT=..." \
  "WEB_PUBSUB_KEY=..." \
  "WEB_PUBSUB_HUB=speech_hub" \
  "JWT_SECRET=..." \
  "MICROSOFT_CLIENT_ID=..." \
  "MICROSOFT_CLIENT_SECRET=..." \
  "GOOGLE_CLIENT_ID=..." \
  "GOOGLE_CLIENT_SECRET=..." \
  "GITHUB_CLIENT_ID=..." \
  "GITHUB_CLIENT_SECRET=..." \
  "FRONTEND_URL=..." \
  "ALLOWED_ORIGINS=..."
```

---

## 7. 步驟五：前端部署

### 7.1 設定前端環境變數

```bash
cd frontend
cp .env.example .env
```

填入 `.env`：

```env
REACT_APP_AZURE_CLIENT_ID=<Entra ID App Client ID>
REACT_APP_AZURE_TENANT_ID=common
REACT_APP_GOOGLE_CLIENT_ID=<Google OAuth Client ID>
REACT_APP_GITHUB_CLIENT_ID=<GitHub OAuth Client ID>
REACT_APP_BACKEND_URL=https://<function-app-name>.azurewebsites.net
```

### 7.2 本機測試前端

```bash
npm install
npm start
# 瀏覽器開啟 http://localhost:5173
```

### 7.3 部署至 Azure Static Web Apps

**方法 A：使用 Azure CLI**

```bash
# 建置
npm run build

# 部署（需 Static Web Apps CLI）
npm install -g @azure/static-web-apps-cli
SWA_TOKEN=$(terraform -chdir=../infrastructure output -raw frontend_deployment_token)
swa deploy ./build --deployment-token $SWA_TOKEN
```

**方法 B：透過 GitHub Actions（推薦）**

設定 GitHub Secrets 後，推送到 `main` 分支自動部署（見 [步驟八](#10-步驟八cicd-設定github-actions)）。

---

## 8. 步驟六：Web PubSub Event Handler 設定

這是**即時錄音功能的關鍵設定**，必須完成才能讓語音即時轉錄正常運作。

### 8.1 設定 Event Handler

```bash
PUBSUB_NAME=$(terraform -chdir=../infrastructure output -raw pubsub_name)
RG_NAME="rg-lisbot-{suffix}"
FUNC_URL="https://<function-app-name>.azurewebsites.net"

az webpubsub hub update \
  --name $PUBSUB_NAME \
  --resource-group $RG_NAME \
  --hub-name speech_hub \
  --event-handler \
    url-template="${FUNC_URL}/ws/speech" \
    user-event-pattern="*" \
    system-event="connect" \
    system-event="connected" \
    system-event="disconnected"
```

### 8.2 驗證 Event Handler

1. 前往 Azure Portal → Web PubSub 資源 → **Hub 設定**
2. 確認 `speech_hub` 下有 Event Handler URL
3. URL 應為：`https://{functions-url}/ws/speech`

### 8.3 設定 CORS（Web PubSub）

```bash
az webpubsub cors add \
  --name $PUBSUB_NAME \
  --resource-group $RG_NAME \
  --allowed-origins "https://{your-frontend-url}" "http://localhost:5173"
```

---

## 9. 步驟七：Cosmos DB 容器驗證

Terraform 已自動建立所有容器，執行以下驗證確認：

```bash
COSMOS_ACCOUNT=$(terraform -chdir=../infrastructure output -raw cosmos_account_name)
RG_NAME="rg-lisbot-{suffix}"

# 列出所有容器
az cosmosdb sql container list \
  --account-name $COSMOS_ACCOUNT \
  --resource-group $RG_NAME \
  --database-name lisbot \
  --query "[].{name:name, partitionKey:resource.partitionKey.paths[0]}" \
  -o table
```

**期望輸出：**

```
Name             PartitionKey
---------------  ------------
users            /id
meetings         /id
transcripts      /meetingId
summaries        /meetingId
terminology      /id
templates        /userId
shares           /id
calendar_tokens  /id
```

若有容器缺失，手動建立：

```bash
az cosmosdb sql container create \
  --account-name $COSMOS_ACCOUNT \
  --resource-group $RG_NAME \
  --database-name lisbot \
  --name <container-name> \
  --partition-key-path <partition-key>
```

---

## 10. 步驟八：CI/CD 設定（GitHub Actions）

### 10.1 設定 GitHub Secrets

前往 GitHub 專案 → **Settings** → **Secrets and variables** → **Actions**，新增：

| Secret 名稱 | 值 | 來源 |
|------------|-----|------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | SWA 部署 Token | `terraform output frontend_deployment_token` |
| `AZURE_CREDENTIALS` | Service Principal JSON | 見下方說明 |
| `AZURE_FUNCTION_APP_NAME` | Function App 名稱 | `terraform output function_app_name` |
| `REACT_APP_AZURE_CLIENT_ID` | Entra ID App ID | 步驟 4.1 |
| `REACT_APP_GOOGLE_CLIENT_ID` | Google Client ID | 步驟 4.2 |
| `REACT_APP_GITHUB_CLIENT_ID` | GitHub Client ID | 步驟 4.3 |
| `REACT_APP_BACKEND_URL` | Functions URL | `terraform output backend_url` |

### 10.2 建立 Azure Service Principal

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
az ad sp create-for-rbac \
  --name "XMeet AI-GH-Actions" \
  --role contributor \
  --scopes /subscriptions/$SUBSCRIPTION_ID/resourceGroups/rg-lisbot-{suffix} \
  --sdk-auth
```

將輸出的 JSON 整個貼入 `AZURE_CREDENTIALS` Secret。

### 10.3 GitHub Actions Workflow 說明

**前端部署（`.github/workflows/frontend-deploy.yml`）**：
- 觸發：`main` 分支 push，`frontend/**` 路徑有變更
- 步驟：安裝 → 建置 → 部署至 Static Web Apps

**後端部署（`.github/workflows/backend-deploy.yml`）**：
- 觸發：`main` 分支 push，`backend/**` 路徑有變更
- 步驟：設定 Python 3.11 → 安裝相依 → 部署至 Azure Functions

---

## 11. 驗證與健康檢查

### 11.1 後端健康檢查

```bash
FUNC_URL="https://<function-app-name>.azurewebsites.net"

# 基本健康檢查
curl -X GET "${FUNC_URL}/api/health"
# 期望：{"status": "healthy", "version": "1.0.0", ...}

# 驗證 CORS
curl -X OPTIONS "${FUNC_URL}/api/health" \
  -H "Origin: https://your-frontend.azurestaticapps.net" \
  -v 2>&1 | grep "Access-Control"
# 期望出現 Access-Control-Allow-Origin header
```

### 11.2 端對端測試清單

| 測試項目 | 步驟 | 期望結果 |
|---------|------|---------|
| ✅ 健康檢查 | `GET /api/health` | `{"status":"healthy"}` |
| ✅ Microsoft 登入 | 點擊登入按鈕 | 成功取得 JWT Token |
| ✅ Google 登入 | 點擊登入按鈕 | 成功取得 JWT Token |
| ✅ 建立會議 | `POST /api/meetings` | 回傳含 `id` 的會議物件 |
| ✅ 取得 WS Token | `GET /api/ws/token` | 回傳 Web PubSub URL |
| ✅ WebSocket 連線 | RecordingPanel 開始錄音 | WebSocket 連線成功，開始顯示字幕 |
| ✅ 摘要生成 | `POST /api/summarize` | 回傳 Markdown 摘要 |
| ✅ 術語辭典 | CRUD 操作 | 各操作正常 |
| ✅ 摘要範本 | CRUD 操作 | 各操作正常 |
| ✅ 音檔上傳 | 上傳 WAV 檔 | 批次轉錄啟動，輪詢成功 |
| ✅ 分享會議 | `POST /api/meetings/{id}/share` | 分享記錄建立 |
| ✅ 行事曆連線 | 連結 Google Calendar | 顯示今日行程 |

### 11.3 WebSocket 即時錄音測試

```bash
# 測試 WS Token 取得
curl -X GET "${FUNC_URL}/api/ws/token" \
  -H "Authorization: Bearer <your-jwt-token>"
# 期望：{"url": "wss://pubsub-lisbot-xxx.webpubsub.azure.com/...", "userId": "..."}
```

---

## 12. 監控與維運

### 12.1 Azure Monitor 警示

```bash
# 建立 Function App 錯誤率警示（>5% 5 分鐘內）
az monitor metrics alert create \
  --name "lisbot-function-errors" \
  --resource-group $RG_NAME \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG_NAME/providers/Microsoft.Web/sites/$FUNC_APP_NAME" \
  --condition "avg Http5xx > 10" \
  --window-size 5m \
  --evaluation-frequency 1m \
  --action-group <action-group-id>
```

### 12.2 重要監控指標

| 指標 | 位置 | 警戒值 |
|------|------|--------|
| Function 執行失敗率 | Azure Functions → 監視 | > 5% |
| Cosmos DB RU 消耗 | Cosmos DB → 計量 | > 80% 限制 |
| Speech API 延遲 | Application Insights | P95 > 3s |
| Blob Storage 使用量 | Storage → 計量 | > 80% 容量 |
| Web PubSub 連線數 | Web PubSub → 計量 | 接近方案上限 |

### 12.3 日誌查詢（Application Insights）

```kql
// 查詢最近 24 小時 API 錯誤
requests
| where timestamp > ago(24h)
| where resultCode >= 400
| summarize count() by name, resultCode
| order by count_ desc

// 查詢摘要生成時間分佈
requests
| where name contains "summarize"
| where timestamp > ago(7d)
| summarize percentiles(duration, 50, 95, 99) by bin(timestamp, 1h)
```

### 12.4 Cosmos DB 備份驗證

Terraform 設定了 7 天連續備份，定期驗證：
```bash
az cosmosdb restorable-database-account list \
  --account-name $COSMOS_ACCOUNT \
  --resource-group $RG_NAME
```

---

## 13. 常見部署問題

### 問題 1：Terraform apply 失敗 — Azure OpenAI 配額不足

**錯誤訊息**：`QuotaExceeded: Operation could not be completed as it results in exceeding approved Total Cognitive Services quota`

**解決方案**：
1. 前往 Azure Portal → 訂閱 → 使用量 + 配額
2. 申請增加 Azure OpenAI 配額
3. 或改用其他支援 GPT-4 的區域（如 swedencentral）

### 問題 2：Function App 部署成功但 API 回傳 500

**診斷步驟**：
```bash
# 查看 Function App 即時日誌
az functionapp log tail \
  --name $FUNC_APP_NAME \
  --resource-group $RG_NAME
```

常見原因：
- 環境變數未設定（`KeyError` in Python）
- Cosmos DB 連線字串錯誤
- Python 套件未安裝完成

### 問題 3：WebSocket 連線失敗

**症狀**：點擊「開始錄音」後無法取得 WS Token 或 WebSocket 無法連線

**檢查項目**：
1. 確認 `GET /api/ws/token` 回傳正常
2. 確認 Web PubSub Event Handler 已設定（步驟六）
3. 確認 Web PubSub CORS 已允許前端網域
4. 確認 `WEB_PUBSUB_KEY` 環境變數正確

### 問題 4：Google Calendar 連結後無法顯示行程

**症狀**：連結成功但行事曆事件清單為空

**檢查項目**：
1. 確認 Google OAuth 範圍包含 `calendar.readonly`
2. 確認 `api/auth/callback/calendar/google` 在 Google Cloud Console 的重新導向 URI 中
3. 確認 `GOOGLE_CLIENT_SECRET` 設定正確

### 問題 5：音檔上傳失敗

**症狀**：上傳後 Blob Storage 找不到檔案，或批次轉錄提交失敗

**檢查項目**：
1. 確認 `AZURE_STORAGE_CONNECTION_STRING` 設定正確
2. 確認 Blob Container `audio-recordings` 存在
3. 確認 Speech Service Key 有批次轉錄權限（需 S0 以上方案）
4. 檢查 Function App 的儲存體帳戶存取權限

### 問題 6：Cosmos DB 讀取/寫入失敗

**症狀**：API 回傳 `CosmosResourceNotFoundError` 或連線逾時

**解決方案**：
```bash
# 驗證 Cosmos DB 連線
az cosmosdb check-name-exists --name $COSMOS_ACCOUNT

# 確認防火牆設定（本機開發時需允許本機 IP）
az cosmosdb update \
  --name $COSMOS_ACCOUNT \
  --resource-group $RG_NAME \
  --ip-range-filter "你的IP"
```

---

## 14. 費用估算

### 14.1 基礎費用（月）

| 服務 | 方案 | 預估月費 |
|------|------|---------|
| Azure Functions EP2 | Elastic Premium | ~USD $120 |
| Azure OpenAI GPT-4 | 依用量 | ~USD $50–200 |
| Azure AI Speech | S0 Standard | ~USD $20–50 |
| Azure Web PubSub | Standard S1 | ~USD $10 |
| Cosmos DB Serverless | 依用量 | ~USD $5–30 |
| Blob Storage | Standard LRS | ~USD $2–10 |
| Static Web Apps | Standard | ~USD $9 |
| Key Vault | Standard | ~USD $1 |
| **合計** | | **~USD $217–430** |

### 14.2 OpenAI 用量估算

| 使用場景 | Token 估計 | 費用（GPT-4 Turbo） |
|---------|-----------|-------------------|
| 1 小時會議（~15,000 字逐字稿） | ~20,000 tokens | ~USD $0.40 |
| 每日 10 場會議 | ~200,000 tokens | ~USD $4.00 |
| 每月 200 場會議 | ~4,000,000 tokens | ~USD $80.00 |

### 14.3 節省費用建議

1. **開發環境**：使用 Azure Functions Consumption Plan（按用量計費）
2. **GPT 模型**：測試時可使用 GPT-3.5-Turbo（費用約為 GPT-4 的 1/20）
3. **Cosmos DB**：輕量使用選擇 Serverless（沒有最低費用）
4. **Storage**：定期清理超過 30 天的音檔（可設定 Lifecycle Policy）

---

## 15. 資源清理

⚠️ **警告：以下操作將永久刪除所有資料，請謹慎執行！**

### 完整清理（刪除所有 Azure 資源）

```bash
cd infrastructure

# 先確認要刪除的資源
terraform plan -destroy

# 執行刪除（需輸入 yes 確認）
terraform destroy
```

### 部分清理（保留資料，僅關閉計費資源）

```bash
# 停止 Function App（停止計費但保留資源）
az functionapp stop \
  --name $FUNC_APP_NAME \
  --resource-group $RG_NAME

# 降低 Cosmos DB 至最低配置
# （Serverless 模式無最低費用，可直接保留）
```

---

## 附錄：環境變數速查表

| 變數名稱 | 取得方式 |
|---------|---------|
| `AZURE_OPENAI_ENDPOINT` | `terraform output openai_endpoint` |
| `AZURE_OPENAI_KEY` | `terraform output openai_key` |
| `SPEECH_KEY` | `terraform output speech_key` |
| `SPEECH_REGION` | 部署時指定的 `location` 值 |
| `COSMOS_ENDPOINT` | `terraform output cosmos_endpoint` |
| `COSMOS_KEY` | `terraform output cosmos_key` |
| `AZURE_STORAGE_CONNECTION_STRING` | `terraform output storage_connection` |
| `WEB_PUBSUB_ENDPOINT` | `terraform output pubsub_endpoint` |
| `WEB_PUBSUB_KEY` | `terraform output pubsub_key` |
| `JWT_SECRET` | `openssl rand -hex 32`（自行生成） |
| `FRONTEND_URL` | `terraform output frontend_url` |

---

*字型設定：本手冊建議以微軟正黑體（Microsoft JhengHei）閱讀以獲得最佳體驗。*

*如有部署問題，請至 [GitHub Issues](https://github.com/guessleej/XMeet AI/issues) 回報。*

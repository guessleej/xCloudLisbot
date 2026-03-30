# OAuth 應用程式設定指南

本文件說明如何在四個平台完成 OAuth 應用程式註冊，取得 Client ID / Client Secret。

---

## 1. Microsoft Entra ID（原 Azure AD）

### 步驟
1. 前往 [Azure Portal](https://portal.azure.com)
2. 搜尋 **Microsoft Entra ID** → **App registrations** → **New registration**
3. 填寫：
   - **Name**: xCloudLisbot
   - **Supported account types**: Accounts in any organizational directory AND personal Microsoft accounts
   - **Redirect URI**: `https://func-lisbot-xxxxx.azurewebsites.net/api/auth/callback/microsoft`
4. 點擊 **Register**
5. 複製 **Application (client) ID** → 填入 `MICROSOFT_CLIENT_ID`
6. **Certificates & secrets** → **New client secret** → 複製 Value → 填入 `MICROSOFT_CLIENT_SECRET`
7. **API permissions** → Add → Microsoft Graph → **User.Read** (Delegated)

### 前端設定
```env
REACT_APP_AZURE_CLIENT_ID=<Application client ID>
REACT_APP_AZURE_TENANT_ID=common
```

---

## 2. Google OAuth 2.0

### 步驟
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立或選擇專案
3. **APIs & Services** → **OAuth consent screen** → External → 填寫 App name
4. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
5. Application type: **Web application**
6. **Authorized JavaScript origins**: `https://your-static-app.azurestaticapps.net`
7. **Authorized redirect URIs**: `https://func-lisbot-xxxxx.azurewebsites.net/api/auth/callback/google`
8. 複製 **Client ID** → `GOOGLE_CLIENT_ID`，**Client Secret** → `GOOGLE_CLIENT_SECRET`
9. **APIs & Services** → **Library** → 啟用 **People API**

---

## 3. GitHub OAuth App

### 步驟
1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
2. 填寫：
   - **Application name**: xCloudLisbot
   - **Homepage URL**: `https://your-static-app.azurestaticapps.net`
   - **Authorization callback URL**: `https://func-lisbot-xxxxx.azurewebsites.net/api/auth/callback/github`
3. **Register application**
4. 複製 **Client ID** → `GITHUB_CLIENT_ID`
5. **Generate a new client secret** → 複製 → `GITHUB_CLIENT_SECRET`

### 注意事項
- GitHub 部分使用者的 email 設為私人，後端會呼叫 `/user/emails` API 補齊
- 若需要 GitHub 組織資訊，需加入 `read:org` scope

---

## 4. Apple Sign In

> ⚠️ 需要付費 Apple Developer 帳號（USD $99/年）

### 步驟一：建立 App ID
1. 前往 [Apple Developer](https://developer.apple.com/) → **Certificates, IDs & Profiles**
2. **Identifiers** → **+** → **App IDs** → App
3. Description: xCloudLisbot
4. Bundle ID: `com.yourcompany.xcloudlisbot`（Explicit）
5. 勾選 **Sign In with Apple** capability → Continue → Register

### 步驟二：建立 Services ID
1. **Identifiers** → **+** → **Services IDs**
2. Description: xCloudLisbot Web
3. Identifier: `com.yourcompany.xcloudlisbot.web`（這是 `APPLE_CLIENT_ID`）
4. 勾選 **Sign In with Apple** → Configure
5. **Domains**: `func-lisbot-xxxxx.azurewebsites.net`
6. **Return URLs**: `https://func-lisbot-xxxxx.azurewebsites.net/api/auth/callback/apple`

### 步驟三：建立私鑰
1. **Keys** → **+** → 勾選 **Sign In with Apple** → Configure → 選擇 App ID
2. Register → 下載 `.p8` 檔案（**只能下載一次！**）
3. 記下 **Key ID** → `APPLE_KEY_ID`

### 步驟四：取得 Team ID
- 右上角帳號名稱旁的 10 碼英數字串 → `APPLE_TEAM_ID`

### 環境變數
```env
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
APPLE_CLIENT_ID=com.yourcompany.xcloudlisbot.web
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
...p8 file content...
-----END PRIVATE KEY-----
```

---

## GitHub Actions Secrets 設定

在 GitHub repo → **Settings** → **Secrets and variables** → **Actions** 新增以下 Secrets：

| Secret 名稱 | 來源 |
|------------|------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | `terraform output -raw frontend_deployment_token` |
| `AZURE_CREDENTIALS` | `az ad sp create-for-rbac --sdk-auth` JSON |
| `AZURE_FUNCTION_APP_NAME` | `terraform output` 中的 Function App 名稱 |
| `REACT_APP_AZURE_CLIENT_ID` | Microsoft App Client ID |
| `REACT_APP_GOOGLE_CLIENT_ID` | Google Client ID |
| `REACT_APP_GITHUB_CLIENT_ID` | GitHub Client ID |
| `REACT_APP_BACKEND_URL` | `terraform output -raw backend_url` |

---

## Azure Service Principal（CI/CD 用）

```bash
az ad sp create-for-rbac \
  --name "xcloudlisbot-github-actions" \
  --role contributor \
  --scopes /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/rg-lisbot-prod \
  --sdk-auth
```

將輸出的 JSON 整個貼入 `AZURE_CREDENTIALS` Secret。

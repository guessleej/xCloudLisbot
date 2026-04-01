terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  required_version = ">= 1.5"
}

provider "azurerm" {
  subscription_id                = var.subscription_id
  resource_provider_registrations = "none"
  features {
    key_vault { purge_soft_delete_on_destroy = true }
  }
}

# ==================== 隨機後綴 ====================
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

locals {
  suffix = random_string.suffix.result
  tags = {
    Environment = var.environment
    Project     = "xCloudLisbot"
    ManagedBy   = "Terraform"
  }
}

# ==================== 資源群組 ====================
resource "azurerm_resource_group" "main" {
  name     = "rg-lisbot-${var.environment}"
  location = var.location
  tags     = local.tags
}

# ==================== 前端 — Azure Static Web Apps ====================
resource "azurerm_static_web_app" "frontend" {
  name                = "stapp-lisbot-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = "East Asia"
  sku_tier            = "Standard"
  sku_size            = "Standard"
  tags                = local.tags
}

# ==================== 後端 — Azure Functions ====================
resource "azurerm_storage_account" "functions" {
  name                     = "stfunclisbot${local.suffix}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
  tags                     = local.tags
}

resource "azurerm_storage_account" "content" {
  name                     = "stcontlisbot${local.suffix}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  min_tls_version          = "TLS1_2"
  tags                     = local.tags
}

resource "azurerm_storage_container" "audio" {
  name                  = "audio-recordings"
  storage_account_name  = azurerm_storage_account.content.name
  container_access_type = "private"
}

resource "azurerm_service_plan" "backend" {
  name                = "asp-lisbot-backend"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "B1"
  tags                = local.tags
}

resource "azurerm_linux_function_app" "backend" {
  name                          = "func-lisbot-${local.suffix}"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  service_plan_id               = azurerm_service_plan.backend.id
  storage_account_name       = azurerm_storage_account.functions.name
  storage_account_access_key = azurerm_storage_account.functions.primary_access_key
  tags                       = local.tags

  identity { type = "SystemAssigned" }

  site_config {
    application_stack { python_version = "3.11" }
    cors {
      allowed_origins     = ["https://${azurerm_static_web_app.frontend.default_host_name}"]
      support_credentials = true
    }
    websockets_enabled = true
  }

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME"    = "python"
    "AzureWebJobsFeatureFlags"    = "EnableWorkerIndexing"
    "AZURE_OPENAI_ENDPOINT"       = azurerm_cognitive_account.openai.endpoint
    "AZURE_OPENAI_KEY"         = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.openai_key.id})"
    "AZURE_OPENAI_DEPLOYMENT"  = var.openai_model
    "SPEECH_KEY"               = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.speech_key.id})"
    "SPEECH_REGION"            = azurerm_resource_group.main.location
    "COSMOS_ENDPOINT"          = azurerm_cosmosdb_account.db.endpoint
    "COSMOS_KEY"               = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.cosmos_key.id})"
    "COSMOS_DATABASE"          = "lisbot"
    "STORAGE_ACCOUNT"          = azurerm_storage_account.content.name
    "STORAGE_CONTAINER"        = azurerm_storage_container.audio.name
    "WEB_PUBSUB_ENDPOINT"      = "https://${azurerm_web_pubsub.hub.hostname}"
    "WEB_PUBSUB_KEY"           = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.pubsub_key.id})"
    "WEB_PUBSUB_HUB"           = "speech_hub"
    "JWT_SECRET"               = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.jwt_secret.id})"
    "MICROSOFT_CLIENT_ID"      = var.microsoft_client_id
    "MICROSOFT_CLIENT_SECRET"  = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.ms_secret.id})"
    "GOOGLE_CLIENT_ID"         = var.google_client_id
    "GOOGLE_CLIENT_SECRET"     = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.google_secret.id})"
    "GITHUB_CLIENT_ID"         = var.github_client_id
    "GITHUB_CLIENT_SECRET"     = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.github_secret.id})"
    "APPLE_TEAM_ID"            = var.apple_team_id
    "APPLE_KEY_ID"             = var.apple_key_id
    "APPLE_CLIENT_ID"          = var.apple_client_id
    "APPLE_PRIVATE_KEY"        = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.apple_key.id})"
    "FRONTEND_URL"             = "https://${azurerm_static_web_app.frontend.default_host_name}"
    "ALLOWED_ORIGINS"          = "https://${azurerm_static_web_app.frontend.default_host_name}"
    "ENVIRONMENT"              = var.environment
    "AZURE_STORAGE_CONNECTION_STRING" = azurerm_storage_account.content.primary_connection_string
  }

  # Note: Key Vault access policy is created after this resource
  # since it requires the Function App's managed identity principal_id.
  # Key Vault references will resolve after the access policy is applied.
}

# ==================== Azure OpenAI ====================
resource "azurerm_cognitive_account" "openai" {
  name                = "oai-lisbot-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = "Sweden Central"
  kind                = "OpenAI"
  sku_name            = "S0"
  tags                = local.tags
}

resource "azurerm_cognitive_deployment" "gpt4" {
  name                 = var.openai_model
  cognitive_account_id = azurerm_cognitive_account.openai.id
  model {
    format  = "OpenAI"
    name    = "gpt-4.1"
    version = "2025-04-14"
  }
  sku {
    name     = "Standard"
    capacity = 10
  }
}

# ==================== Azure AI Speech ====================
resource "azurerm_cognitive_account" "speech" {
  name                = "speech-lisbot-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  kind                = "SpeechServices"
  sku_name            = "S0"
  tags                = local.tags
}

# ==================== Azure Web PubSub ====================
resource "azurerm_web_pubsub" "hub" {
  name                = "wps-lisbot-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard_S1"
  capacity            = 1
  tags                = local.tags
}

resource "azurerm_web_pubsub_hub" "speech" {
  name          = "speech_hub"
  web_pubsub_id = azurerm_web_pubsub.hub.id

  event_handler {
    url_template       = "https://${azurerm_linux_function_app.backend.default_hostname}/ws/speech"
    user_event_pattern = "*"
    system_events      = ["connect", "disconnected"]
  }

  anonymous_connections_enabled = false
}

# ==================== Azure Cosmos DB ====================
resource "azurerm_cosmosdb_account" "db" {
  name                = "cosmosdb-lisbot-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = "Japan East"
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
  tags                = local.tags

  consistency_policy {
    consistency_level = "Session"
  }
  geo_location {
    location          = "Japan East"
    failover_priority = 0
    zone_redundant    = false
  }
  capabilities { name = "EnableServerless" }
}

resource "azurerm_cosmosdb_sql_database" "lisbot" {
  name                = "lisbot"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.db.name
}

resource "azurerm_cosmosdb_sql_container" "users" {
  name                = "users"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.db.name
  database_name       = azurerm_cosmosdb_sql_database.lisbot.name
  partition_key_paths = ["/id"]
}

resource "azurerm_cosmosdb_sql_container" "meetings" {
  name                = "meetings"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.db.name
  database_name       = azurerm_cosmosdb_sql_database.lisbot.name
  partition_key_paths = ["/id"]

  indexing_policy {
    indexing_mode = "consistent"
    included_path { path = "/userId/?" }
    included_path { path = "/startTime/?" }
    excluded_path { path = "/*" }
  }
}

resource "azurerm_cosmosdb_sql_container" "transcripts" {
  name                = "transcripts"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.db.name
  database_name       = azurerm_cosmosdb_sql_database.lisbot.name
  partition_key_paths = ["/meetingId"]

  default_ttl = 7776000 # 90 天後自動刪除

  indexing_policy {
    indexing_mode = "consistent"
    included_path { path = "/meetingId/?" }
    excluded_path { path = "/*" }
  }
}

resource "azurerm_cosmosdb_sql_container" "summaries" {
  name                = "summaries"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.db.name
  database_name       = azurerm_cosmosdb_sql_database.lisbot.name
  partition_key_paths = ["/meetingId"]
}

resource "azurerm_cosmosdb_sql_container" "terminology" {
  name                = "terminology"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.db.name
  database_name       = azurerm_cosmosdb_sql_database.lisbot.name
  partition_key_paths = ["/id"]

  indexing_policy {
    indexing_mode = "consistent"
    included_path { path = "/userId/?" }
    included_path { path = "/createdAt/?" }
    excluded_path { path = "/*" }
  }
}

resource "azurerm_cosmosdb_sql_container" "templates" {
  name                = "templates"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.db.name
  database_name       = azurerm_cosmosdb_sql_database.lisbot.name
  partition_key_paths = ["/userId"]

  indexing_policy {
    indexing_mode = "consistent"
    included_path { path = "/userId/?" }
    included_path { path = "/createdAt/?" }
    excluded_path { path = "/*" }
  }
}

resource "azurerm_cosmosdb_sql_container" "shares" {
  name                = "shares"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.db.name
  database_name       = azurerm_cosmosdb_sql_database.lisbot.name
  partition_key_paths = ["/id"]

  indexing_policy {
    indexing_mode = "consistent"
    included_path { path = "/meetingId/?" }
    included_path { path = "/memberEmail/?" }
    excluded_path { path = "/*" }
  }
}

resource "azurerm_cosmosdb_sql_container" "calendar_tokens" {
  name                = "calendar_tokens"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.db.name
  database_name       = azurerm_cosmosdb_sql_database.lisbot.name
  partition_key_paths = ["/id"]
}

# ==================== Azure Key Vault ====================
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                = "kv-lisbot-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"
  tags                = local.tags

  purge_protection_enabled   = true
  soft_delete_retention_days = 7
}

# Terraform 執行者的存取政策
resource "azurerm_key_vault_access_policy" "deployer" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = data.azurerm_client_config.current.object_id
  secret_permissions = ["Get", "List", "Set", "Delete", "Purge"]
}

# Functions Managed Identity 的存取政策
resource "azurerm_key_vault_access_policy" "functions" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_linux_function_app.backend.identity[0].principal_id
  secret_permissions = ["Get", "List"]
  depends_on   = [azurerm_linux_function_app.backend]
}

# Key Vault Secrets
resource "azurerm_key_vault_secret" "openai_key" {
  name         = "openai-key"
  value        = azurerm_cognitive_account.openai.primary_access_key
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "speech_key" {
  name         = "speech-key"
  value        = azurerm_cognitive_account.speech.primary_access_key
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "cosmos_key" {
  name         = "cosmos-key"
  value        = azurerm_cosmosdb_account.db.primary_key
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "pubsub_key" {
  name         = "webpubsub-key"
  value        = azurerm_web_pubsub.hub.primary_access_key
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "jwt_secret" {
  name         = "jwt-secret"
  value        = var.jwt_secret
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "ms_secret" {
  name         = "microsoft-client-secret"
  value        = var.microsoft_client_secret
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "google_secret" {
  name         = "google-client-secret"
  value        = var.google_client_secret
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "github_secret" {
  name         = "github-client-secret"
  value        = var.github_client_secret
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "apple_key" {
  name         = "apple-private-key"
  value        = var.apple_private_key
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

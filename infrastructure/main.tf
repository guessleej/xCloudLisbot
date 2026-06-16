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
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
  features {
    key_vault { purge_soft_delete_on_destroy = true }
  }
}

# ── Random suffix ────────────────────────────────────────────────
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "random_password" "pg" {
  length  = 32
  special = true
}

locals {
  suffix       = random_string.suffix.result
  pg_pass      = var.pg_password != "" ? var.pg_password : random_password.pg.result
  frontend_url = "https://ashy-ocean-07e9d6000.7.azurestaticapps.net"
  tags = {
    Environment = var.environment
    Project     = "XMeet AI"
    ManagedBy   = "Terraform"
  }
}

# ════════════════════════════════════════════════════════════════
# 資源群組
# ════════════════════════════════════════════════════════════════
resource "azurerm_resource_group" "main" {
  name     = "rg-xmeet-${var.environment}"
  location = var.location
  tags     = local.tags
}

# ════════════════════════════════════════════════════════════════
# Azure Container Registry (ACR)
# ════════════════════════════════════════════════════════════════
resource "azurerm_container_registry" "acr" {
  name                = "crxmeet${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = true
  tags                = local.tags
}

# ════════════════════════════════════════════════════════════════
# PostgreSQL Flexible Server
# ════════════════════════════════════════════════════════════════
resource "azurerm_postgresql_flexible_server" "pg" {
  name                   = "pg-xmeet-${local.suffix}"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  administrator_login    = "xmeetadmin"
  administrator_password = local.pg_pass
  storage_mb             = 32768
  sku_name               = "B_Standard_B1ms"
  backup_retention_days  = 7
  tags                   = local.tags
}

resource "azurerm_postgresql_flexible_server_database" "xmeet" {
  name      = "xmeet"
  server_id = azurerm_postgresql_flexible_server.pg.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "azure" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.pg.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# ════════════════════════════════════════════════════════════════
# Azure Blob Storage (音檔)
# ════════════════════════════════════════════════════════════════
resource "azurerm_storage_account" "audio" {
  name                     = "stxmeet${local.suffix}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  min_tls_version          = "TLS1_2"
  tags                     = local.tags
}

resource "azurerm_storage_container" "audio" {
  name                  = "audio-recordings"
  storage_account_id    = azurerm_storage_account.audio.id
  container_access_type = "private"
}

# ════════════════════════════════════════════════════════════════
# Azure AI Speech
# ════════════════════════════════════════════════════════════════
resource "azurerm_cognitive_account" "speech" {
  name                = "speech-xmeet-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  kind                = "SpeechServices"
  sku_name            = "S0"
  tags                = local.tags
}

# ════════════════════════════════════════════════════════════════
# Azure OpenAI
# ════════════════════════════════════════════════════════════════
resource "azurerm_cognitive_account" "openai" {
  name                = "oai-xmeet-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = "eastus"
  kind                = "OpenAI"
  sku_name            = "S0"
  tags                = local.tags
}

resource "azurerm_cognitive_deployment" "gpt4" {
  name                 = var.openai_model
  cognitive_account_id = azurerm_cognitive_account.openai.id
  model {
    format  = "OpenAI"
    name    = "gpt-4"
    version = "turbo-2024-04-09"
  }
  sku {
    name     = "Standard"
    capacity = 10
  }
}

# ════════════════════════════════════════════════════════════════
# Azure Web PubSub (即時字幕)
# ════════════════════════════════════════════════════════════════
resource "azurerm_web_pubsub" "pubsub" {
  name                = "wps-xmeet-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard_S1"
  capacity            = 1
  tags                = local.tags
}

resource "azurerm_web_pubsub_hub" "speech" {
  name          = "speech_hub"
  web_pubsub_id = azurerm_web_pubsub.pubsub.id
  event_handler {
    url_template       = "https://${azurerm_container_app.backend.ingress[0].fqdn}/api/ws/events"
    user_event_pattern = "*"
    system_events      = ["connect", "disconnected"]
  }
  anonymous_connections_enabled = false
}

# ════════════════════════════════════════════════════════════════
# Azure Communication Services (Email)
# ════════════════════════════════════════════════════════════════
resource "azurerm_communication_service" "acs" {
  name                = "acs-xmeet-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  data_location       = "Asia Pacific"
  tags                = local.tags
}

resource "azurerm_email_communication_service" "email" {
  name                = "email-xmeet-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  data_location       = "Asia Pacific"
  tags                = local.tags
}

# ════════════════════════════════════════════════════════════════
# Azure Key Vault
# ════════════════════════════════════════════════════════════════
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "kv" {
  name                     = "kv-xmeet-${local.suffix}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  tenant_id                = data.azurerm_client_config.current.tenant_id
  sku_name                 = "standard"
  purge_protection_enabled = false
  tags                     = local.tags

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id
    secret_permissions = ["Get", "List", "Set", "Delete", "Purge"]
  }
}

resource "azurerm_key_vault_secret" "jwt_secret"         { name = "jwt-secret";              value = var.jwt_secret;                                          key_vault_id = azurerm_key_vault.kv.id }
resource "azurerm_key_vault_secret" "pg_password"        { name = "pg-password";              value = local.pg_pass;                                           key_vault_id = azurerm_key_vault.kv.id }
resource "azurerm_key_vault_secret" "ms_client_secret"   { name = "microsoft-client-secret";  value = var.microsoft_client_secret;                             key_vault_id = azurerm_key_vault.kv.id }
resource "azurerm_key_vault_secret" "speech_key"         { name = "speech-key";               value = azurerm_cognitive_account.speech.primary_access_key;     key_vault_id = azurerm_key_vault.kv.id }
resource "azurerm_key_vault_secret" "openai_key"         { name = "openai-key";               value = azurerm_cognitive_account.openai.primary_access_key;     key_vault_id = azurerm_key_vault.kv.id }
resource "azurerm_key_vault_secret" "storage_connection" { name = "storage-connection";       value = azurerm_storage_account.audio.primary_connection_string; key_vault_id = azurerm_key_vault.kv.id }
resource "azurerm_key_vault_secret" "pubsub_key"         { name = "pubsub-key";               value = azurerm_web_pubsub.pubsub.primary_access_key;            key_vault_id = azurerm_key_vault.kv.id }

# ════════════════════════════════════════════════════════════════
# Container Apps Environment
# ════════════════════════════════════════════════════════════════
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "log-xmeet-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_container_app_environment" "env" {
  name                       = "cae-xmeet-${var.environment}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  tags                       = local.tags
}

# ════════════════════════════════════════════════════════════════
# Container App — Backend (FastAPI)
# ════════════════════════════════════════════════════════════════
resource "azurerm_container_app" "backend" {
  name                         = "ca-lisbot-backend"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = local.tags

  registry {
    server               = azurerm_container_registry.acr.login_server
    username             = azurerm_container_registry.acr.admin_username
    password_secret_name = "acr-password"
  }

  secret { name = "acr-password";        value = azurerm_container_registry.acr.admin_password }
  secret { name = "jwt-secret";          value = var.jwt_secret }
  secret { name = "pg-password";         value = local.pg_pass }
  secret { name = "ms-client-secret";    value = var.microsoft_client_secret }
  secret { name = "speech-key";          value = azurerm_cognitive_account.speech.primary_access_key }
  secret { name = "openai-key";          value = azurerm_cognitive_account.openai.primary_access_key }
  secret { name = "storage-connection";  value = azurerm_storage_account.audio.primary_connection_string }
  secret { name = "pubsub-key";          value = azurerm_web_pubsub.pubsub.primary_access_key }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "backend"
      image  = var.backend_image != "" ? var.backend_image : "${azurerm_container_registry.acr.login_server}/xmeet-backend:latest"
      cpu    = 0.5
      memory = "1Gi"

      # 明文環境變數
      env { name = "ENVIRONMENT";           value = "production" }
      env { name = "FRONTEND_URL";          value = local.frontend_url }
      env { name = "ALLOWED_ORIGINS";       value = local.frontend_url }
      env { name = "MICROSOFT_CLIENT_ID";   value = var.microsoft_client_id }
      env { name = "MICROSOFT_TENANT_ID";   value = var.microsoft_tenant_id }
      env { name = "GITHUB_CLIENT_ID";      value = var.github_client_id }
      env { name = "GOOGLE_CLIENT_ID";      value = var.google_client_id }
      env { name = "PG_HOST";               value = azurerm_postgresql_flexible_server.pg.fqdn }
      env { name = "PG_PORT";               value = "5432" }
      env { name = "PG_DATABASE";           value = "xmeet" }
      env { name = "PG_USER";               value = "xmeetadmin" }
      env { name = "PG_SSL";                value = "require" }
      env { name = "SPEECH_REGION";         value = var.location }
      env { name = "WEB_PUBSUB_ENDPOINT";   value = azurerm_web_pubsub.pubsub.hostname }
      env { name = "WEB_PUBSUB_HUB";        value = "speech_hub" }
      env { name = "AZURE_OPENAI_ENDPOINT"; value = azurerm_cognitive_account.openai.endpoint }
      env { name = "AZURE_OPENAI_DEPLOYMENT"; value = var.openai_model }
      env { name = "STORAGE_CONTAINER";     value = "audio-recordings" }

      # 機密環境變數 — 參照上方 secret 區塊
      env { name = "JWT_SECRET";                    secret_name = "jwt-secret" }
      env { name = "PG_PASSWORD";                   secret_name = "pg-password" }
      env { name = "MICROSOFT_CLIENT_SECRET";       secret_name = "ms-client-secret" }
      env { name = "SPEECH_KEY";                    secret_name = "speech-key" }
      env { name = "AZURE_OPENAI_KEY";              secret_name = "openai-key" }
      env { name = "AZURE_STORAGE_CONNECTION_STRING"; secret_name = "storage-connection" }
      env { name = "WEB_PUBSUB_KEY";                secret_name = "pubsub-key" }
    }

    http_scale_rule {
      name                = "http-rule"
      concurrent_requests = "50"
    }
  }

  ingress {
    external_enabled = true
    target_port      = 8000
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

output "backend_url" {
  description = "Container Apps backend URL — 填入 frontend/.env 的 REACT_APP_BACKEND_URL"
  value       = "https://${azurerm_container_app.backend.ingress[0].fqdn}"
}

output "acr_login_server" {
  description = "ACR 登入位址 — GitHub Actions 推送 Docker image 用"
  value       = azurerm_container_registry.acr.login_server
}

output "acr_username" {
  value     = azurerm_container_registry.acr.admin_username
  sensitive = true
}

output "acr_password" {
  value     = azurerm_container_registry.acr.admin_password
  sensitive = true
}

output "pg_fqdn" {
  description = "PostgreSQL 主機名稱"
  value       = azurerm_postgresql_flexible_server.pg.fqdn
}

output "pg_password" {
  description = "PostgreSQL 密碼（隨機產生或你指定的）"
  value       = local.pg_pass
  sensitive   = true
}

output "speech_key" {
  value     = azurerm_cognitive_account.speech.primary_access_key
  sensitive = true
}

output "openai_endpoint" {
  value = azurerm_cognitive_account.openai.endpoint
}

output "openai_key" {
  value     = azurerm_cognitive_account.openai.primary_access_key
  sensitive = true
}

output "pubsub_endpoint" {
  value = azurerm_web_pubsub.pubsub.hostname
}

output "pubsub_key" {
  value     = azurerm_web_pubsub.pubsub.primary_access_key
  sensitive = true
}

output "storage_connection_string" {
  value     = azurerm_storage_account.audio.primary_connection_string
  sensitive = true
}

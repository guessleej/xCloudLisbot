output "frontend_url" {
  description = "前端 Static Web App URL"
  value       = "https://${azurerm_static_web_app.frontend.default_host_name}"
}

output "backend_url" {
  description = "後端 Azure Functions URL"
  value       = "https://${azurerm_linux_function_app.backend.default_hostname}"
}

output "frontend_deployment_token" {
  description = "GitHub Actions 部署前端用的 Token（存入 GitHub Secrets）"
  value       = azurerm_static_web_app.frontend.api_key
  sensitive   = true
}

output "speech_region" {
  value = azurerm_cognitive_account.speech.location
}

output "cosmos_endpoint" {
  value = azurerm_cosmosdb_account.db.endpoint
}

output "web_pubsub_endpoint" {
  value     = "https://${azurerm_web_pubsub.hub.hostname}"
  sensitive = true
}

output "key_vault_name" {
  value = azurerm_key_vault.main.name
}

output "resource_group" {
  value = azurerm_resource_group.main.name
}

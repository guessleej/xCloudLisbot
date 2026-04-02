variable "subscription_id" {
  description = "Azure Subscription ID"
  type        = string
}

variable "location" {
  description = "Azure 資源部署區域"
  type        = string
  default     = "East Asia"
}

variable "environment" {
  description = "環境名稱 (prod / staging / dev)"
  type        = string
  default     = "prod"
}

variable "openai_model" {
  description = "Azure OpenAI 部署模型名稱"
  type        = string
  default     = "gpt-4"
}

variable "jwt_secret" {
  description = "JWT 簽名密鑰（至少 32 字元）"
  type        = string
  sensitive   = true
}

variable "microsoft_client_id" {
  description = "Microsoft Entra ID App Client ID"
  type        = string
  sensitive   = true
  default     = "PLACEHOLDER"
}

variable "microsoft_client_secret" {
  description = "Microsoft Entra ID App Client Secret"
  type        = string
  sensitive   = true
  default     = "PLACEHOLDER"
}

variable "google_client_id" {
  type      = string
  sensitive = true
  default   = "PLACEHOLDER"
}

variable "google_client_secret" {
  type      = string
  sensitive = true
  default   = "PLACEHOLDER"
}

variable "github_client_id" {
  type      = string
  sensitive = true
  default   = "PLACEHOLDER"
}

variable "github_client_secret" {
  type      = string
  sensitive = true
  default   = "PLACEHOLDER"
}

variable "apple_team_id" {
  type      = string
  sensitive = true
  default   = "PLACEHOLDER"
}

variable "apple_key_id" {
  type      = string
  sensitive = true
  default   = "PLACEHOLDER"
}

variable "apple_client_id" {
  type      = string
  sensitive = true
  default   = "PLACEHOLDER"
}

variable "apple_private_key" {
  type      = string
  sensitive = true
  default   = "PLACEHOLDER"
}

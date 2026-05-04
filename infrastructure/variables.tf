variable "subscription_id" {
  description = "Azure Subscription ID"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastasia"
}

variable "environment" {
  description = "prod | staging | dev"
  type        = string
  default     = "prod"
}

variable "jwt_secret" {
  description = "JWT signing secret (>= 32 chars)"
  type        = string
  sensitive   = true
}

variable "calendar_token_encryption_key" {
  description = "Fernet key for encrypting calendar tokens"
  type        = string
  sensitive   = true
}

# ── Microsoft OAuth ──────────────────────────────────────────────
variable "microsoft_client_id" {
  type      = string
  sensitive = true
}

variable "microsoft_client_secret" {
  type      = string
  sensitive = true
}

variable "microsoft_tenant_id" {
  type    = string
  default = "5b465551-393e-4821-a2b0-5547f20ab78f"
}

# ── GitHub OAuth ─────────────────────────────────────────────────
variable "github_client_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "github_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

# ── Google OAuth ─────────────────────────────────────────────────
variable "google_client_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

# ── Azure OpenAI ─────────────────────────────────────────────────
variable "openai_model" {
  type    = string
  default = "gpt-4"
}

# ── PostgreSQL ───────────────────────────────────────────────────
variable "pg_password" {
  description = "PostgreSQL admin password"
  type        = string
  sensitive   = true
}

# ── Container Apps ───────────────────────────────────────────────
variable "backend_image" {
  description = "Docker image for backend (leave empty to use placeholder)"
  type        = string
  default     = ""
}

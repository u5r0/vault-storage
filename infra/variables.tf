variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus"
}

variable "allowed_origin" {
  description = "CORS origin for the SPA (Cloudflare Pages URL)"
  type        = string
}

variable "app_url" {
  description = "Public URL of the SPA (used in email links)"
  type        = string
}

variable "ghcr_username" {
  description = "GitHub username or org for ghcr.io image pulls"
  type        = string
}

variable "ghcr_token" {
  description = "GitHub PAT with read:packages scope (for Container App to pull images)"
  type        = string
  sensitive   = true
}

variable "r2_account_id" {
  description = "Cloudflare account ID for R2"
  type        = string
}

variable "r2_bucket_name" {
  description = "R2 bucket name"
  type        = string
  default     = "vault"
}

variable "r2_access_key_id" {
  description = "R2 API token access key ID"
  type        = string
  sensitive   = true
}

variable "r2_secret_access_key" {
  description = "R2 API token secret access key"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Secret for signing JWTs"
  type        = string
  sensitive   = true
}

variable "auth_secret" {
  description = "Secret for magic link tokens"
  type        = string
  sensitive   = true
}

variable "smtp_url" {
  description = "SMTP connection URL (e.g. smtp://resend:<key>@smtp.resend.com:587)"
  type        = string
  sensitive   = true
}

variable "email_from" {
  description = "From address for transactional emails"
  type        = string
  default     = "noreply@vault.app"
}

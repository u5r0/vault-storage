variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus"
}

variable "allowed_origin" {
  description = "CORS origin for R2 bucket (must match Worker hostname for presigned upload/download)"
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

variable "smtp_host" {
  description = "SMTP server host (e.g. smtp.resend.com)"
  type        = string
}

variable "smtp_port" {
  description = "SMTP server port (e.g. 587 for STARTTLS)"
  type        = string
  default     = "587"
}

variable "smtp_secure" {
  description = "Use SSL/TLS (true for port 465, false for STARTTLS on port 587)"
  type        = bool
  default     = false
}

variable "smtp_user" {
  description = "SMTP authentication username"
  type        = string
  sensitive   = true
}

variable "smtp_pass" {
  description = "SMTP authentication password"
  type        = string
  sensitive   = true
}

variable "email_from" {
  description = "From address for transactional emails"
  type        = string
  default     = "noreply@vault.app"
}

# ─── Cloudflare ───────────────────────────────────────────────────────────────

variable "cloudflare_account_id" {
  description = "Cloudflare account ID (Dashboard → top-right → Account ID)"
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with R2:Edit + Workers Scripts:Edit + Workers Routes:Edit permissions"
  type        = string
  sensitive   = true
}

variable "worker_hostname" {
  description = "Hostname for the Cloudflare Worker (e.g. vault.example.com)"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the worker hostname"
  type        = string
  default = "value"
}

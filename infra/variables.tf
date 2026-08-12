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

variable "email_from" {
  description = "From address for transactional emails"
  type        = string
  default     = "noreply@layoutengine.dev"
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

# variable "cloudflare_zone_id" {
#   description = "Cloudflare zone ID for the worker hostname"
#   type        = string
#   default = "value"
# }

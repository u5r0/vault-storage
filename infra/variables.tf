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
  description = "Cloudflare API token with R2:Edit + Pages:Edit permissions"
  type        = string
  sensitive   = true
}

variable "pages_project_name" {
  description = "Cloudflare Pages project name"
  type        = string
  default     = "vault"
}

# ─── Infisical ────────────────────────────────────────────────────────────────
# Two separate machine identities:
#   1. Terraform identity  — Universal Auth; reads secrets during terraform apply.
#      client_id + client_secret are passed as TF_VAR_* GitHub Actions secrets.
#   2. Container App identity — Azure Auth (managed identity, zero creds in env).
#      Only the non-secret identity ID is needed here so the Container App env
#      block can reference it.

variable "infisical_client_id" {
  description = "Infisical machine identity client ID for Terraform (Universal Auth)"
  type        = string
  sensitive   = true
}

variable "infisical_client_secret" {
  description = "Infisical machine identity client secret for Terraform (Universal Auth)"
  type        = string
  sensitive   = true
}

variable "infisical_project_id" {
  description = "Infisical project (workspace) ID"
  type        = string
}

variable "infisical_env" {
  description = "Infisical environment slug (e.g. prod, staging, dev)"
  type        = string
  default     = "prod"
}

variable "infisical_identity_id" {
  description = "Infisical machine identity ID used by the Container App at runtime (Azure Auth)"
  type        = string
}

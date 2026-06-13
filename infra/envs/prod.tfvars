location       = "eastus"
allowed_origin = "https://vault.pages.dev"
app_url        = "https://vault.pages.dev"
ghcr_username  = "REPLACE_WITH_GITHUB_USERNAME"
r2_account_id  = "REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID"
r2_bucket_name = "vault"
email_from     = "noreply@vault.app"

# Secrets — pass via environment variables or -var flags, never commit:
#   TF_VAR_ghcr_token
#   TF_VAR_r2_access_key_id
#   TF_VAR_r2_secret_access_key
#   TF_VAR_jwt_secret
#   TF_VAR_auth_secret
#   TF_VAR_smtp_url

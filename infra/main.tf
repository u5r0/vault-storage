data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "main" {
  name     = "vault-prod-rg"
  location = var.location
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# ─── Cosmos DB (provisioned, free tier) ───────────────────────────────────────

resource "azurerm_cosmosdb_account" "main" {
  name                = "vault-prod-cosmos-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
  free_tier_enabled   = true

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }
}

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = "vault"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
}

resource "azurerm_cosmosdb_sql_container" "entries" {
  name                = "vault_entries"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/ownerId"]

  indexing_policy {
    indexing_mode = "consistent"

    included_path {
      path = "/*"
    }

    excluded_path {
      path = "/tags/?"
    }

    excluded_path {
      path = "/metadata/*"
    }

    excluded_path {
      path = "/blobName/?"
    }

    excluded_path {
      path = "/_etag/?"
    }
  }
}

# ─── Infisical secrets ────────────────────────────────────────────────────────
# Pull application runtime secrets from Infisical at terraform apply time.
# The server re-fetches them at cold-start via the Container App's managed
# identity (Infisical Azure Auth), so no plaintext secrets live in env vars.
#
# Two Infisical machine identities are in play:
#   1. Terraform identity (Universal Auth, credentials below) — used here to
#      read secrets during `terraform apply` and write Container App secret blocks.
#   2. Container App runtime identity (Azure Auth, zero creds in env) — used by
#      the Node server at startup via DefaultAzureCredential + Infisical SDK.

data "infisical_secrets" "app" {
  workspace_id = var.infisical_project_id
  env_slug     = var.infisical_env
  folder_path  = "/"
}

# ─── Log Analytics ────────────────────────────────────────────────────────────

resource "azurerm_log_analytics_workspace" "main" {
  name                = "vault-prod-logs-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

# ─── Container Apps ───────────────────────────────────────────────────────────

resource "azurerm_container_app_environment" "main" {
  name                       = "vault-prod-cae"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
}

resource "azurerm_container_app" "api" {
  name                         = "vault-api"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"

  identity {
    type = "SystemAssigned"
  }

  registry {
    server               = "ghcr.io"
    username             = var.ghcr_username
    password_secret_name = "ghcr-token"
  }

  secret {
    name  = "ghcr-token"
    value = var.ghcr_token
  }

  secret {
    name  = "jwt-secret"
    value = var.jwt_secret
  }

  secret {
    name  = "auth-secret"
    value = var.auth_secret
  }

  secret {
    name  = "smtp-user"
    value = var.smtp_user
  }

  secret {
    name  = "smtp-pass"
    value = var.smtp_pass
  }

  secret {
    name  = "r2-access-key-id"
    value = var.r2_access_key_id
  }

  secret {
    name  = "r2-secret-access-key"
    value = var.r2_secret_access_key
  }

  template {
    min_replicas = 0
    max_replicas = 3

    container {
      name   = "api"
      image  = "ghcr.io/${var.ghcr_username}/vault-api:latest"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "PORT"
        value = "3001"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "COSMOS_DB_ENDPOINT"
        value = azurerm_cosmosdb_account.main.endpoint
      }

      # No COSMOS_DB_KEY — managed identity handles auth

      env {
        name  = "BLOB_PROVIDER"
        value = "r2"
      }

      env {
        name  = "R2_ACCOUNT_ID"
        value = var.r2_account_id
      }

      env {
        name  = "R2_BUCKET_NAME"
        value = var.r2_bucket_name
      }

      env {
        name        = "R2_ACCESS_KEY_ID"
        secret_name = "r2-access-key-id"
      }

      env {
        name        = "R2_SECRET_ACCESS_KEY"
        secret_name = "r2-secret-access-key"
      }

      env {
        name  = "ALLOWED_ORIGIN"
        value = var.allowed_origin
      }

      env {
        name  = "APP_URL"
        value = var.app_url
      }

      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }

      env {
        name        = "AUTH_SECRET"
        secret_name = "auth-secret"
      }

      env {
        name  = "SMTP_HOST"
        value = data.infisical_secrets.app.secrets["SMTP_HOST"].value
      }

      env {
        name  = "SMTP_PORT"
        value = data.infisical_secrets.app.secrets["SMTP_PORT"].value
      }

      env {
        name  = "SMTP_SECURE"
        value = data.infisical_secrets.app.secrets["SMTP_SECURE"].value
      }

      env {
        name        = "SMTP_USER"
        secret_name = "smtp-user"
      }

      env {
        name        = "SMTP_PASS"
        secret_name = "smtp-pass"
      }

      env {
        name  = "EMAIL_FROM"
        value = var.email_from
      }

      # ── Probes ────────────────────────────────────────────────
      # startup_probe gates liveness and readiness until the container is
      # ready — important with min_replicas = 0 (scale-to-zero) because a
      # cold start must complete Cosmos DB initialisation (30 s retry loop
      # + managed-identity role propagation) before traffic is admitted.
      #
      # Checks every 10 s for up to 120 s (12 × 10) before the replica is
      # considered failed, giving the 30 s Cosmos retry loop plenty of room.

      startup_probe {
        transport        = "HTTP"
        path             = "/api/health"
        port             = 3001
        interval_seconds = 10
        timeout          = 5
        failure_count_threshold = 12
      }

      readiness_probe {
        transport        = "HTTP"
        path             = "/api/health"
        port             = 3001
        interval_seconds = 10
        timeout          = 5
        failure_count_threshold = 3
        success_count_threshold = 1
      }

      liveness_probe {
        transport        = "HTTP"
        path             = "/api/health"
        port             = 3001
        interval_seconds = 30
        timeout          = 5
        failure_count_threshold = 3
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3001
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

# ─── Role assignments (managed identity → Cosmos DB) ─────────────────────────

resource "azurerm_cosmosdb_sql_role_definition" "data_contributor" {
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  name                = "Vault API Data Contributor"
  type                = "CustomRole"
  assignable_scopes   = [azurerm_cosmosdb_account.main.id]

  permissions {
    data_actions = [
      "Microsoft.DocumentDB/databaseAccounts/readMetadata",
      "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/*",
      "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/items/*",
    ]
  }
}

resource "azurerm_cosmosdb_sql_role_assignment" "api" {
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  role_definition_id  = azurerm_cosmosdb_sql_role_definition.data_contributor.id
  principal_id        = azurerm_container_app.api.identity[0].principal_id
  scope               = azurerm_cosmosdb_account.main.id
}

# ─── Cloudflare R2 ────────────────────────────────────────────────────────────

resource "cloudflare_r2_bucket" "vault" {
  account_id = var.cloudflare_account_id
  name       = var.r2_bucket_name
}

# CORS policy: allows the SPA to PUT blobs directly (presigned upload) and
# GET blobs directly (presigned download). Only the production Pages origin
# is allowed — adjust allowed_origins if a custom domain is added.
resource "cloudflare_r2_bucket_cors" "vault" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.vault.name

  rules = [
    {
      allowed = {
        methods = ["GET", "PUT", "HEAD"]
        origins = [var.allowed_origin]
        headers = ["Content-Type", "x-ms-blob-type"]
      }
      max_age_seconds = 3600
    }
  ]
}

# ─── Cloudflare Pages ─────────────────────────────────────────────────────────

# The Pages project is provisioning-only. The actual deployment (build +
# upload) is handled by `wrangler pages deploy` in deploy.yml, not Terraform.
# Terraform ensures the project exists before the first CI deploy runs.
resource "cloudflare_pages_project" "vault" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = "main"

  # Disable Cloudflare's git integration — GitHub Actions (deploy.yml) owns
  # deployment via Direct Upload. Connecting both would double-deploy.
  deployment_configs = {
    production = {
      environment_variables = {
        VITE_API_URL = "https://${azurerm_container_app.api.ingress[0].fqdn}"
      }
    }
    preview = {
      environment_variables = {}
    }
  }
}

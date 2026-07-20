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

# File & folder documents. Hierarchical partition key [/ownerId, /parentId, /id]
# (ADR 0028 §3.1): a folder listing is a single-partition query and a known
# (owner, parent, id) is a 1-RU point read.
resource "azurerm_cosmosdb_sql_container" "entries" {
  name                  = "vault_entries"
  resource_group_name   = azurerm_resource_group.main.name
  account_name          = azurerm_cosmosdb_account.main.name
  database_name         = azurerm_cosmosdb_sql_database.main.name
  partition_key_kind    = "MultiHash"
  partition_key_paths   = ["/ownerId", "/parentId", "/id"]
  partition_key_version = 2

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

# Pointer records { id, ownerId, parentId } keyed by /id. Lets id-only
# operations resolve an entry's hierarchical key with a single point read
# instead of a cross-partition scan (ADR 0028 Gap 2).
resource "azurerm_cosmosdb_sql_container" "lookup" {
  name                = "vault_lookup"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/id"]
}

# User / refresh_token / spent_token documents, keyed by /id. Split out of the
# entries container because they have no ownerId/parentId (ADR 0028 §3.1,
# superseding the single-container design of ADR 0007).
resource "azurerm_cosmosdb_sql_container" "auth" {
  name                = "vault_auth"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/id"]

  # Cosmos honours a per-document `ttl` (seconds) only when the container has
  # default TTL enabled (-1 = on, no container-wide expiry). spent_token docs
  # set ttl:900 to self-expire; without this the field is inert.
  default_ttl = -1
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
        value = var.smtp_host
      }

      env {
        name  = "SMTP_PORT"
        value = var.smtp_port
      }

      env {
        name  = "SMTP_SECURE"
        value = tostring(var.smtp_secure)
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
  #
  # NOTE: Cloudflare Terraform provider v5 renamed `environment_variables` →
  # `env_vars` and changed the value shape to { value, type } objects.
  # Using the old `environment_variables` key is silently ignored — env vars
  # would never be set.  Use `env_vars` with type = "plain_text".
  deployment_configs = {
    production = {
      env_vars = {
        VITE_API_URL = {
          value = "https://${azurerm_container_app.api.ingress[0].fqdn}"
          type  = "plain_text"
        }
      }
    }
    preview = {
      env_vars = {}
    }
  }
}

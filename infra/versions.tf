terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    infisical = {
      source  = "infisical/infisical"
      version = "~> 0.15"
    }
  }

  backend "azurerm" {
    resource_group_name  = "vault-tfstate-rg"
    storage_account_name = "REPLACE_AFTER_BOOTSTRAP"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
  }
}

provider "azurerm" {
  features {}
}

# Cloudflare provider — authenticated via CLOUDFLARE_API_TOKEN env var.
# Set TF_VAR_cloudflare_api_token or export CLOUDFLARE_API_TOKEN before running.
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Infisical provider — authenticated via a machine identity using Universal Auth.
# The client_id and client_secret belong to a Terraform-only machine identity
# in Infisical (separate from the Container App's runtime identity).
# Set TF_VAR_infisical_client_id and TF_VAR_infisical_client_secret as GitHub
# Actions secrets (or export them locally from infra/envs/.env.local).
provider "infisical" {
  host          = "https://app.infisical.com"
  client_id     = var.infisical_client_id
  client_secret = var.infisical_client_secret
}

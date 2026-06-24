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

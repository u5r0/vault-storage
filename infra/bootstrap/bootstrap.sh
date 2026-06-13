#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# One-time setup: create the Azure Storage Account used as Terraform's state
# backend. Run this once before `terraform init`.
#
# Usage:
#   az login
#   bash infra/bootstrap/bootstrap.sh
#
# After running, update infra/versions.tf with the printed storage_account_name.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RG="vault-tfstate-rg"
LOCATION="eastus"
SA="vaulttfstate$(openssl rand -hex 4)"
CONTAINER="tfstate"

echo "Creating resource group: $RG"
az group create --name "$RG" --location "$LOCATION" --output none

echo "Creating storage account: $SA"
az storage account create \
  --name "$SA" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --allow-blob-public-access false \
  --output none

echo "Creating blob container: $CONTAINER"
az storage container create \
  --name "$CONTAINER" \
  --account-name "$SA" \
  --output none

echo ""
echo "✅ Terraform state backend ready."
echo ""
echo "Update infra/versions.tf:"
echo "  storage_account_name = \"$SA\""
echo ""
echo "Then run:"
echo "  cd infra"
echo "  terraform init"
echo "  terraform plan -var-file=envs/prod.tfvars"

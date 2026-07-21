# Deployment Guide

Production stack: **Cloudflare Pages** (SPA) + **Cloudflare R2** (blob storage) + **Azure Container Apps** (API) + **Azure Cosmos DB** (database).

Everything runs on always-free tiers at low traffic — see [ADR 0020](../build-reasoning/adr-vault-storage/0020-deployment-strategy.md) for the full cost breakdown and rationale.

---

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (`az`)
- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.9
- [Docker](https://docs.docker.com/get-docker/)
- A Cloudflare account (free)
- A GitHub account with access to the repo

---

## First-time setup

### 1. Bootstrap the Terraform state backend

This creates an Azure Storage Account to hold Terraform state. Run once.

```bash
az login
bash infra/bootstrap/bootstrap.sh
```

The script prints a `storage_account_name`. Open `infra/versions.tf` and replace `REPLACE_AFTER_BOOTSTRAP` with that value.

### 2. Fill in `infra/envs/prod.tfvars`

Open `infra/envs/prod.tfvars` and set:

```hcl
allowed_origin        = "https://<your-pages-subdomain>.pages.dev"
app_url               = "https://<your-pages-subdomain>.pages.dev"
ghcr_username         = "<your-github-username>"
r2_account_id         = "<cloudflare-account-id>"
cloudflare_account_id = "<cloudflare-account-id>"   # Dashboard → top-right → Account ID
```

Secrets are passed via environment variables for local runs, and via GitHub Secrets for CI/CD:

**Local runs:** Create `infra/envs/.env.local` (gitignored) with:

```bash
TF_VAR_ghcr_token="<github-pat-with-read:packages>"
TF_VAR_r2_access_key_id="<r2-access-key-id>"
TF_VAR_r2_secret_access_key="<r2-secret-access-key>"
TF_VAR_jwt_secret="$(openssl rand -hex 32)"
TF_VAR_auth_secret="$(openssl rand -hex 32)"
TF_VAR_smtp_url="smtp://resend:<resend-api-key>@smtp.resend.com:587"
TF_VAR_cloudflare_api_token="<cloudflare-api-token>"
```

**CI/CD:** Add these as GitHub Secrets (Settings → Secrets and variables → Actions):
- `TF_VAR_ghcr_token`
- `TF_VAR_r2_access_key_id`
- `TF_VAR_r2_secret_access_key`
- `TF_VAR_jwt_secret`
- `TF_VAR_auth_secret`
- `TF_VAR_smtp_url`
- `TF_VAR_cloudflare_api_token`

The Cloudflare API token needs two permissions: **R2:Edit** (to create the bucket and set CORS) and **Pages:Edit** (to create the Pages project). Create it at Cloudflare Dashboard → My Profile → API Tokens.

The R2 Access Key ID and Secret (for `TF_VAR_r2_access_key_id` / `TF_VAR_r2_secret_access_key`) are a separate S3-compatible credential — create them at Cloudflare Dashboard → R2 → Manage R2 API Tokens.

### 3. Provision all infrastructure (initial setup)

```bash
cd infra
terraform init
set -a
source envs/.env.local  # Load secrets for terraform
set +a
terraform plan -var-file=envs/prod.tfvars
terraform apply -var-file=envs/prod.tfvars
```

A single `terraform apply` creates everything:
- **Azure:** Cosmos DB account + database + container, Key Vault, Log Analytics workspace, Container App environment, Container App (with system-assigned managed identity + Cosmos role assignment)
- **Cloudflare:** R2 bucket (`vault`) + CORS policy, Pages project (`vault-storage`)

Note the outputs — you'll need `api_url` and `pages_url` for the next step.

### 3b. Optional: Run terraform via CI/CD

After initial setup, infrastructure changes can be applied via GitHub Actions:

1. Go to Actions → Deploy workflow
2. Click "Run workflow"
3. Check "Run terraform apply (infrastructure changes)"
4. Click "Run workflow"

This applies terraform using GitHub Secrets and automatically updates the `VITE_API_URL` GitHub variable.

### 4. Configure GitHub repository secrets for the deploy pipeline

The `deploy.yml` workflow needs these (Settings → Secrets and variables → Actions):

**Secrets (for deploy-api and deploy-web jobs):**

| Secret | How to get it |
|--------|---------------|
| `AZURE_CLIENT_ID` | Service principal client ID (see below) |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
| `CLOUDFLARE_API_TOKEN` | Same token used for Terraform (R2:Edit + Pages:Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → top-right → Account ID |

**Secrets (for optional terraform job):**

| Secret | Value |
|--------|-------|
| `TF_VAR_ghcr_token` | GitHub PAT with read:packages scope |
| `TF_VAR_r2_access_key_id` | R2 API token access key |
| `TF_VAR_r2_secret_access_key` | R2 API token secret |
| `TF_VAR_jwt_secret` | Random secret for JWT signing |
| `TF_VAR_auth_secret` | Random secret for magic link tokens |
| `TF_VAR_smtp_url` | SMTP connection URL (e.g., smtp://resend:...) |
| `TF_VAR_cloudflare_api_token` | Cloudflare API token (R2:Edit + Pages:Edit) |

**Variables:**

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://<api_url from terraform output>` (set automatically by terraform job, or manually after initial setup) |

To create a service principal with Container App access (using OIDC):

1. Go to [Azure Portal → App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click "New registration"
3. Name: `vault-storage-deploy`
4. Supported account types: "Accounts in this organizational directory only"
5. Register (leave Redirect URI blank — not needed for OIDC)
6. Copy the **Application (client) ID** → this is `AZURE_CLIENT_ID`
7. Copy the **Directory (tenant) ID** → this is `AZURE_TENANT_ID`
8. Go to "Certificates & secrets" → "Federated credentials" → "Add credential"
9. Fill in:
   - **Federated credential scenario:** "GitHub Actions deploying Azure resources"
   - **GitHub organization:** your GitHub username/org
   - **Repository:** your repo name
   - **Entity type:** "Branch"
   - **Branch:** `main`
   - **Name:** `github-deploy`
   - **Audience:** `api://AzureADTokenExchange`
10. Add
11. Go to your resource group `vault-prod-rg` → "Access control (IAM)"
12. Add role assignment → "Contributor" → search for `vault-storage-deploy` → assign

Note: No `AZURE_CLIENT_SECRET` is needed — the workflow uses OpenID Connect (OIDC) which is more secure.

### 5. Push to main

CI runs tests. On success, `deploy.yml` triggers automatically and fans out to two jobs:

- **`deploy-api`** — builds the Docker image from `apps/server/Dockerfile`, pushes to `ghcr.io/<your-username>/vault-api`, and updates the Container App.
- **`deploy-web`** — builds the SPA (`pnpm --filter @vault/web build`) and deploys `apps/web/dist` to Cloudflare Pages (`wrangler pages deploy`).

A newer push to `main` cancels an in-flight deploy (workflow `concurrency` guard).

---

## Routine deployments

After first-time setup, deploying is just pushing to `main`. The pipeline handles the rest.

To deploy manually (e.g. from a branch):

```bash
# Build and push
IMAGE="ghcr.io/<your-username>/vault-api"
SHA=$(git rev-parse --short HEAD)

docker build -f apps/server/Dockerfile -t "$IMAGE:$SHA" .
docker push "$IMAGE:$SHA"

# Update Container App
az containerapp update \
  --name vault-api \
  --resource-group vault-prod-rg \
  --image "$IMAGE:$SHA"
```

---

## Rollback

**API** — reactivate a previous revision:

```bash
az containerapp revision list \
  --name vault-api \
  --resource-group vault-prod-rg \
  --output table

az containerapp ingress traffic set \
  --name vault-api \
  --resource-group vault-prod-rg \
  --revision-weight <previous-revision-name>=100
```

**SPA** — one-click rollback in Cloudflare Pages dashboard, or redeploy a previous commit.

---

## Environment variable reference

| Variable | Local dev | CI | Production |
|----------|-----------|----|------------|
| `PORT` | `3001` | `3001` | `3001` |
| `NODE_ENV` | — | — | `production` |
| `BLOB_PROVIDER` | `azure` | `azure` | `r2` |
| `AZURE_STORAGE_CONNECTION_STRING` | Azurite | Azurite | unset |
| `R2_ACCOUNT_ID` | — | — | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | — | — | R2 API token |
| `R2_SECRET_ACCESS_KEY` | — | — | R2 API secret |
| `R2_BUCKET_NAME` | — | — | `vault` |
| `R2_ENDPOINT` | `http://localhost:9000` (RustFS) | `http://localhost:9000` | unset |
| `COSMOS_DB_ENDPOINT` | `https://localhost:8081` | `https://localhost:8081` | real endpoint |
| `COSMOS_DB_KEY` | emulator key (auto-injected) | emulator key (auto-injected) | unset → managed identity |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | `http://localhost:3000` | Pages URL |
| `APP_URL` | `http://localhost:3000` | `http://localhost:3000` | Pages URL |
| `JWT_SECRET` | `.env` | random | Container App secret |
| `AUTH_SECRET` | `.env` | random | Container App secret |
| `SMTP_URL` | `smtp://localhost:1025` | Mailpit | Resend SMTP |
| `VITE_API_URL` | unset (Vite proxy) | — | Container App URL |

---

## Infrastructure changes

To update infrastructure after provisioning, you have two options:

**Option 1: Run via CI/CD (recommended)**
1. Go to Actions → Deploy workflow
2. Click "Run workflow"
3. Check "Run terraform apply (infrastructure changes)"
4. Click "Run workflow"

**Option 2: Run locally**
```bash
cd infra
set -a
source envs/.env.local  # Load secrets
set +a
terraform plan -var-file=envs/prod.tfvars
terraform apply -var-file=envs/prod.tfvars
```

Terraform tracks state in the Azure Storage Account created by `bootstrap.sh`.

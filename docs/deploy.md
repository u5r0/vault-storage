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

### 2. Configure Cloudflare R2

1. [Cloudflare Dashboard → R2](https://dash.cloudflare.com) → Create bucket named `vault`
2. R2 → Manage R2 API Tokens → Create API token
   - Permissions: Object Read & Write
   - Scope: bucket `vault` only
   - Copy the **Access Key ID** and **Secret Access Key**
3. Set CORS on the bucket (Settings → CORS policy):

```json
[
  {
    "AllowedOrigins": ["https://vault.pages.dev"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace `https://vault.pages.dev` with your actual Pages URL once you know it.

### 3. Fill in `infra/envs/prod.tfvars`

Open `infra/envs/prod.tfvars` and set:

```hcl
allowed_origin = "https://<your-pages-subdomain>.pages.dev"
app_url        = "https://<your-pages-subdomain>.pages.dev"
ghcr_username  = "<your-github-username>"
r2_account_id  = "<cloudflare-account-id>"   # Dashboard → top-right → Account ID
```

Secrets are passed via environment variables — never committed:

```bash
export TF_VAR_ghcr_token="<github-pat-with-read:packages>"
export TF_VAR_r2_access_key_id="<r2-access-key-id>"
export TF_VAR_r2_secret_access_key="<r2-secret-access-key>"
export TF_VAR_jwt_secret="$(openssl rand -hex 32)"
export TF_VAR_auth_secret="$(openssl rand -hex 32)"
export TF_VAR_smtp_url="smtp://resend:<resend-api-key>@smtp.resend.com:587"
```

### 4. Provision Azure infrastructure

```bash
cd infra
terraform init
terraform plan -var-file=envs/prod.tfvars
terraform apply -var-file=envs/prod.tfvars
```

Terraform creates: Cosmos DB account + database + container, Key Vault, Log Analytics workspace, Container App environment, Container App with system-assigned managed identity, and the Cosmos role assignment for that identity.

Note the `api_url` output — you'll need it for the next step.

### 5. Deploy the SPA to Cloudflare Pages

1. [Cloudflare Dashboard → Pages](https://dash.cloudflare.com) → Create project → Connect to GitHub
2. Configure the build:

| Setting | Value |
|---------|-------|
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @vault/web build` |
| Build output directory | `apps/web/dist` |
| Root directory | `/` |

3. Add environment variable:

| Name | Value |
|------|-------|
| `VITE_API_URL` | `https://<api_url from terraform output>` |

4. Deploy — Cloudflare will auto-deploy on every push to `main` from this point.

### 6. Configure GitHub repository secrets for the deploy pipeline

The `deploy.yml` workflow needs these secrets (Settings → Secrets → Actions):

| Secret | How to get it |
|--------|---------------|
| `AZURE_CLIENT_ID` | Service principal or OIDC app registration client ID |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |

To create a service principal with Container App access:

```bash
az ad sp create-for-rbac \
  --name "vault-github-deploy" \
  --role "Contributor" \
  --scopes "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/vault-prod-rg" \
  --output json
```

Use the returned `appId` as `AZURE_CLIENT_ID`, `tenant` as `AZURE_TENANT_ID`.

### 7. Push to main

CI runs tests. On success, `deploy.yml` triggers automatically:
- Builds the Docker image from `apps/server/Dockerfile`
- Pushes to `ghcr.io/<your-username>/vault-api`
- Updates the Container App to the new image

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

To update infrastructure after provisioning:

```bash
cd infra
terraform plan -var-file=envs/prod.tfvars
terraform apply -var-file=envs/prod.tfvars
```

Terraform tracks state in the Azure Storage Account created by `bootstrap.sh`.

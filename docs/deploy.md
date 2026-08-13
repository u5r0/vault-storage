# Deployment Guide

Production stack: **Cloudflare Worker** (SPA) + **Cloudflare R2** (blob storage) + **Azure Container Apps** (API) + **Azure Cosmos DB** (database).

Everything runs on always-free tiers at low traffic — see [ADR 0010](adr/0010-deployment-strategy.md) for the full cost breakdown and rationale.

---

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (`az`)
- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.9
- [Docker](https://docs.docker.com/get-docker/)
- A Cloudflare account (free)
- A GitHub account with access to the repo
- An [Infisical](https://infisical.com) account (free tier)

---

## Secrets strategy (Infisical)

Runtime secrets (JWT signing, the Resend API key, R2 API keys) are fetched during deployment by the `Infisical/secrets-action` GitHub Action using **GitHub OIDC authentication** and injected as Container App environment variables. No secrets are baked into the Docker image, and no Infisical CLI runs inside the container.

| Secret | Managed by |
|--------|-----------|
| `JWT_SECRET` | Infisical (project / env `prod`) |
| `AUTH_SECRET` | Infisical |
| `RESEND_API_KEY` | Infisical |
| `R2_ACCESS_KEY_ID` | Infisical |
| `R2_SECRET_ACCESS_KEY` | Infisical |
| `ghcr_token` | GitHub Secrets → Terraform (Container App image pull) |
| `cloudflare_api_token` | GitHub Secrets → Terraform (Cloudflare provider) |
| `INFISICAL_MACHINE_IDENTITY_ID` | GitHub Secrets → deploy workflow (Infisical OIDC auth) |

See `.github/workflows/deploy.yml` for the secret injection step (`Infisical/secrets-action` → `az containerapp update --set-env-vars`).

---

## First-time setup

### 1. Bootstrap the Terraform state backend

This creates an Azure Storage Account to hold Terraform state. Run once.

```bash
az login
bash infra/bootstrap/bootstrap.sh
```

The script prints a `storage_account_name`. Open `infra/versions.tf` and replace it with that value.

### 2. Fill in `infra/envs/prod.tfvars`

Create `infra/envs/prod.tfvars` (copy `infra/envs/.env.example` if you have an older checkout) and set the following values. Resource group and Container App names are defined in `infra/main.tf` — adjust them there if needed.

```hcl
# Required — fill these in
worker_hostname       = "<your-worker-subdomain>"
allowed_origin        = "https://<your-worker-subdomain>.workers.dev"
app_url               = "https://<your-worker-subdomain>.workers.dev"
ghcr_username         = "<your-github-username>"
cloudflare_account_id = "<cloudflare-account-id>"
r2_account_id         = "<cloudflare-account-id>"
r2_bucket_name        = "vault-bucket"
email_from            = "<your-domain-verified-in-resend>"
max_upload_mb         = 500
```

> `allowed_origin` may be a comma-separated list of origins (e.g. the workers.dev URL plus a custom domain) — the server accepts them all for CORS. `RESEND_API_KEY` is **not** a Terraform variable — it's an Infisical secret (step 4). `email_from` must be a domain you've verified in Resend.

### 3. Set up Infisical project and machine identity (GitHub OIDC)

First, create a project in your Infisical workspace and note its **project slug** (Project Settings → General).

Then create a machine identity for GitHub OIDC auth. See [Infisical docs: GitHub OIDC auth](https://infisical.com/docs/documentation/platform/identities/oidc-auth/github) for full details.

1. In Infisical dashboard → **Organization Settings** → **Access Control** → **Machine Identities** → **Create**
2. Give it a name (e.g. `github-deploy`) and a role
3. Edit the identity's **Authentication** section: remove Universal Auth, add **OIDC Auth**
4. Configure:
   - **OIDC Discovery URL**: `https://token.actions.githubusercontent.com`
   - **Issuer**: `https://token.actions.githubusercontent.com`
   - **Subject**: `repo:<owner>/<repo>:ref:refs/heads/main`
   - **Audiences**: `https://github.com/<owner>`
5. Add the identity to your Infisical project with a project role
6. Note the **Identity ID** — this is `INFISICAL_MACHINE_IDENTITY_ID` (the UUID in the URL or identity details)

### 4. Populate Infisical secrets for `prod`

In your Infisical project, environment `prod`, add:

```bash
infisical secrets set JWT_SECRET="$(openssl rand -hex 32)"
infisical secrets set AUTH_SECRET="$(openssl rand -hex 32)"
infisical secrets set RESEND_API_KEY="<resend-api-key>"
infisical secrets set R2_ACCESS_KEY_ID="<r2-access-key-id>"
infisical secrets set R2_SECRET_ACCESS_KEY="<r2-secret-access-key>"
```

### 5. Provision infrastructure (initial setup)

```bash
cd infra
terraform init
terraform plan -var-file=envs/prod.tfvars \
  -var="ghcr_token=<github-pat-read:packages>" \
  -var="cloudflare_api_token=<cloudflare-api-token>"
terraform apply -var-file=envs/prod.tfvars \
  -var="ghcr_token=<github-pat-read:packages>" \
  -var="cloudflare_api_token=<cloudflare-api-token>"
```

A single `terraform apply` creates:
- **Azure:** Cosmos DB account + database + 3 containers, Log Analytics workspace, Container App environment, Container App (system-assigned managed identity + Cosmos role assignment)
- **Cloudflare:** R2 bucket + CORS policy

### 6. Configure GitHub repository secrets

Before setting secrets, update the Infisical references in the repo:

- **`.infisical.json`**: Replace `workspaceId` with your own Infisical workspace ID.
- **`.github/workflows/deploy.yml`**: Replace `project-slug` (in the `Infisical/secrets-action` step) with your Infisical project slug from step 3.

The `deploy.yml` workflow needs these (Settings → Secrets and variables → Actions):

**Secrets:**

| Secret | How to get it |
|--------|---------------|
| `AZURE_CLIENT_ID` | App registration client ID (OIDC federated, see step 7) |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → API Tokens: `R2:Edit` + `Workers Scripts:Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → Account ID |
| `ghcr_token` | GitHub PAT with `read:packages` scope |
| `cloudflare_api_token` | Same Cloudflare API token |
| `INFISICAL_MACHINE_IDENTITY_ID` | From Infisical dashboard → Machine Identities |

### 7. Create the Azure App Registration (OIDC federation for GitHub Actions)

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

Note: No `AZURE_CLIENT_SECRET` is needed — OIDC is more secure.

### 8. Push to main

CI runs tests. On success, `deploy.yml` triggers:

- **`terraform`** (optional, `workflow_dispatch` only) — applies infrastructure changes
- **`deploy-api`** — builds Docker image from `apps/server/Dockerfile`, pushes to `ghcr.io/<username>/vault-api`, fetches secrets from Infisical via GitHub OIDC, updates Container App with new image and secrets
- **`deploy-web`** — builds SPA and deploys to Cloudflare Worker

A newer push to `main` cancels an in-flight deploy (workflow `concurrency` guard).

---

## Routine deployments

After first-time setup, deploying is pushing to `main`. The pipeline handles the rest.

To deploy manually (e.g. from a branch):

```bash
IMAGE="ghcr.io/<your-username>/vault-api"
SHA=$(git rev-parse --short HEAD)

docker build -f apps/server/Dockerfile -t "$IMAGE:$SHA" .
docker push "$IMAGE:$SHA"

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

**SPA** — one-click rollback in Cloudflare Workers dashboard, or redeploy a previous commit.

---

## Environment variable reference

### Server (`apps/server/.env`)

| Variable | Local dev | Production | Source in prod |
|----------|-----------|------------|----------------|
| `PORT` | `3001` | `3001` | Container App env |
| `NODE_ENV` | — | `production` | Container App env |
| `BLOB_PROVIDER` | `azure` | `r2` | Container App env |
| `R2_ACCOUNT_ID` | — | Cloudflare account ID | Container App env |
| `R2_ACCESS_KEY_ID` | — | R2 API token | **Infisical** |
| `R2_SECRET_ACCESS_KEY` | — | R2 API secret | **Infisical** |
| `R2_BUCKET_NAME` | — | `vault-bucket` | Container App env |
| `AZURE_STORAGE_CONNECTION_STRING` | Azurite | unset | — |
| `COSMOS_DB_ENDPOINT` | `https://localhost:8081` | Cosmos account endpoint | Container App env |
| `COSMOS_DB_KEY` | emulator key (auto) | unset → managed identity | — |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | Worker hostname | Container App env |
| `APP_URL` | `http://localhost:3000` | Worker hostname | Container App env |
| `JWT_SECRET` | `.env` | Random hex | **Infisical** |
| `AUTH_SECRET` | `.env` | Random hex | **Infisical** |
| `RESEND_API_KEY` | unset (capture) | Resend API key | **Infisical** |
| `MAX_UPLOAD_MB` | `500` | `500` | Container App env (tfvar `max_upload_mb`) |
| `EMAIL_FROM` | `noreply@vault.app` | Resend-verified domain | Container App env |

### Client (`apps/web/.env`)

| Variable | Local dev | Production |
|----------|-----------|------------|
| `VITE_API_URL` | `http://localhost:3001` (optional — Vite proxies `/api`) | unset — same-origin, resolved dynamically by deploy workflow |

The client learns the upload limit from `GET /api/config` (returns `maxUploadMb`); there is no build-time `VITE_MAX_UPLOAD_MB`. Each account can set a lower per-account limit (never higher than the server default) via Settings → Files, backed by `GET`/`PATCH /api/settings`. Public endpoints: `/api/health` (status, uptime, timestamp, version) and `/api/config` (app config).

---

## Infrastructure changes

To update infrastructure after provisioning:

**Option 1: Run via CI/CD (recommended)**
1. Go to Actions → Deploy workflow
2. Click "Run workflow"
3. Check "Run terraform apply (infrastructure changes)"
4. Click "Run workflow"

**Option 2: Run locally**
```bash
cd infra
terraform plan -var-file=envs/prod.tfvars \
  -var="ghcr_token=<token>" \
  -var="cloudflare_api_token=<token>"
terraform apply -var-file=envs/prod.tfvars \
  -var="ghcr_token=<token>" \
  -var="cloudflare_api_token=<token>"
```

Terraform tracks state in the Azure Storage Account created by `bootstrap.sh`.

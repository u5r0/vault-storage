# Deployment Guide

Production stack: **Cloudflare Pages** (SPA) + **Cloudflare R2** (blob storage) + **Azure Container Apps** (API) + **Azure Cosmos DB** (database) + **Infisical** (secret management).

All services run on always-free tiers at low traffic — see [ADR 0020](../build-reasoning/adr-vault-storage/0020-deployment-strategy.md) for cost breakdown and [ADR 0027](../build-reasoning/adr-vault-storage/0027-secret-management-with-infisical-and-zod-validation.md) for the secret management design.

---

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (`az`)
- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.9
- [Docker](https://docs.docker.com/get-docker/)
- A Cloudflare account (free)
- An [Infisical](https://infisical.com) account (free)
- A GitHub account with access to the repo

---

## First-time setup

### 1. Bootstrap the Terraform state backend

Creates the Azure Storage Account that holds Terraform state. Run once.

```bash
az login
bash infra/bootstrap/bootstrap.sh
```

The script prints a `storage_account_name`. Open `infra/versions.tf` and replace `REPLACE_AFTER_BOOTSTRAP` with that value.

### 2. Set up Infisical

#### 2a. Create the project and populate secrets

1. Sign up at [app.infisical.com](https://app.infisical.com) (free tier).
2. Create a new project — note the **Project ID** (shown in project settings).
3. Create environments: `dev`, `staging`, `prod`.
4. Add the following secrets to the `prod` environment:

   | Secret key | Description |
   |---|---|
   | `JWT_SECRET` | `openssl rand -hex 32` |
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `SMTP_HOST` | e.g. `smtp.resend.com` |
   | `SMTP_PORT` | e.g. `587` |
   | `SMTP_SECURE` | `false` for STARTTLS |
   | `SMTP_USER` | e.g. `resend` |
   | `SMTP_PASS` | Resend SMTP key |
   | `R2_ACCESS_KEY_ID` | R2 API token access key |
   | `R2_SECRET_ACCESS_KEY` | R2 API token secret key |

#### 2b. Create the Terraform machine identity (Universal Auth)

This identity is used only by Terraform during `terraform apply` to read secrets from Infisical.

1. In Infisical: **Access Control → Machine Identities → Create identity**
2. Name: `vault-terraform`
3. Auth method: **Universal Auth**
4. Copy the **Client ID** and **Client Secret** — these become `TF_VAR_infisical_client_id` and `TF_VAR_infisical_client_secret`.
5. Grant this identity read access to the `prod` environment of your project.

#### 2c. Create the Container App runtime machine identity (Azure Auth)

This identity is used by the Node server at startup. It authenticates via the Container App's **system-assigned managed identity** — no credentials in env vars.

1. In Infisical: **Access Control → Machine Identities → Create identity**
2. Name: `vault-api-runtime`
3. Auth method: **Azure Auth**
4. You'll configure the Azure tenant ID and MI object ID in step 4 below, after Terraform provisions the Container App.
5. Note the **Identity ID** shown after creation — this becomes `INFISICAL_IDENTITY_ID`.
6. Grant this identity read access to the `prod` environment of your project.

### 3. Fill in `infra/envs/prod.tfvars`

```hcl
allowed_origin        = "https://<your-pages-subdomain>.pages.dev"
app_url               = "https://<your-pages-subdomain>.pages.dev"
ghcr_username         = "<your-github-username>"
r2_account_id         = "<cloudflare-account-id>"
r2_bucket_name        = "vault"
cloudflare_account_id = "<cloudflare-account-id>"
pages_project_name    = "vault-storage"
infisical_project_id  = "<infisical-project-id>"
infisical_identity_id = "<vault-api-runtime identity ID from step 2c>"
# infisical_env       = "prod"   # default; override for staging
```

Secrets are passed via environment variables, never committed.

**For local runs**, create `infra/envs/.env.local` (gitignored):

```bash
TF_VAR_ghcr_token="<github-pat-read:packages>"
TF_VAR_cloudflare_api_token="<cloudflare-token-R2+Pages:Edit>"
TF_VAR_infisical_client_id="<vault-terraform client ID>"
TF_VAR_infisical_client_secret="<vault-terraform client secret>"
# project_id and identity_id are non-sensitive — can go in prod.tfvars directly
```

### 4. Provision all infrastructure

```bash
cd infra
terraform init
source envs/.env.local
terraform plan  -var-file=envs/prod.tfvars
terraform apply -var-file=envs/prod.tfvars
```

A single `terraform apply` creates:
- **Azure:** Cosmos DB account + database + container, Log Analytics workspace, Container App environment, Container App (system-assigned managed identity + Cosmos role assignment)
- **Cloudflare:** R2 bucket + CORS policy, Pages project
- **Secret blocks** in the Container App sourced from Infisical (via the Terraform machine identity)

Note the outputs — you'll need `api_url` for the next step.

#### 4a. Complete the Azure Auth configuration in Infisical

After `terraform apply`, the Container App's managed identity object ID is available:

```bash
cd infra && terraform output managed_identity_principal_id
az account show --query tenantId -o tsv
```

Back in Infisical, open the `vault-api-runtime` machine identity → Azure Auth:
- **Tenant ID:** paste the tenant ID from above
- **Allowed Service Principal IDs (object IDs):** paste the principal ID from above
- **Allowed resource / audience:** `https://management.azure.com/`

Save. The Container App can now authenticate to Infisical via its managed identity.

### 5. Configure GitHub repository secrets

Go to **Settings → Secrets and variables → Actions**.

**Secrets (always required):**

| Secret | Description |
|---|---|
| `AZURE_CLIENT_ID` | Service principal client ID (OIDC, see below) |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
| `CLOUDFLARE_API_TOKEN` | Same token as Terraform (R2:Edit + Pages:Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Account ID |
| `TF_VAR_ghcr_token` | GitHub PAT with `read:packages` scope |
| `TF_VAR_cloudflare_api_token` | Same as `CLOUDFLARE_API_TOKEN` |
| `TF_VAR_infisical_client_id` | Infisical `vault-terraform` client ID |
| `TF_VAR_infisical_client_secret` | Infisical `vault-terraform` client secret |

**Variables (non-sensitive):**

| Variable | Description |
|---|---|
| `VITE_API_URL` | `https://<api_url from terraform output>` (set automatically by the terraform job, or manually after first apply) |
| `INFISICAL_PROJECT_ID` | Infisical project ID |
| `INFISICAL_IDENTITY_ID` | Infisical `vault-api-runtime` identity ID |

To create the service principal for GitHub Actions OIDC:

1. Azure Portal → App Registrations → New registration → `vault-storage-deploy`
2. Copy **Application (client) ID** → `AZURE_CLIENT_ID`
3. Copy **Directory (tenant) ID** → `AZURE_TENANT_ID`
4. Certificates & secrets → Federated credentials → Add:
   - Scenario: GitHub Actions deploying Azure resources
   - Org/repo: your repo; Entity: Branch `main`
5. Resource group `vault-prod-rg` → IAM → Add role assignment → Contributor → `vault-storage-deploy`

### 6. Push to main

CI runs tests. On success, `deploy.yml` fans out to two jobs:

- **`deploy-api`** — builds Docker image, pushes to `ghcr.io`, updates Container App.
- **`deploy-web`** — builds SPA (`VITE_API_URL` from GitHub variable), deploys to Cloudflare Pages.

To apply infrastructure changes via CI:
1. Actions → Deploy → Run workflow → check "Run terraform apply"

---

## Secret rotation

Edit the secret value in **Infisical UI**, then restart the Container App revision to pick it up:

```bash
az containerapp revision restart \
  --name vault-api \
  --resource-group vault-prod-rg \
  --revision $(az containerapp revision list \
    --name vault-api --resource-group vault-prod-rg \
    --query "[0].name" -o tsv)
```

No `terraform apply` needed. Secrets are fetched fresh on each cold start.

---

## Routine deployments

Deploying is just pushing to `main`. The pipeline handles the rest.

Manual deploy from a branch:

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
  --name vault-api --resource-group vault-prod-rg --output table

az containerapp ingress traffic set \
  --name vault-api --resource-group vault-prod-rg \
  --revision-weight <previous-revision-name>=100
```

**SPA** — one-click rollback in Cloudflare Pages dashboard, or redeploy a previous commit.

---

## Environment variable reference

| Variable | Local dev | CI | Production |
|---|---|---|---|
| `PORT` | `3001` | `3001` | `3001` |
| `NODE_ENV` | — | — | `production` |
| `BLOB_PROVIDER` | `azure` | `azure` | `r2` |
| `AZURE_STORAGE_CONNECTION_STRING` | Azurite | Azurite | unset |
| `R2_ACCOUNT_ID` | — | — | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | — | — | from Infisical |
| `R2_SECRET_ACCESS_KEY` | — | — | from Infisical |
| `R2_BUCKET_NAME` | — | — | `vault` |
| `R2_ENDPOINT` | `http://localhost:9000` (RustFS) | `http://localhost:9000` | unset |
| `COSMOS_DB_ENDPOINT` | `https://localhost:8081` | `https://localhost:8081` | real endpoint |
| `COSMOS_DB_KEY` | emulator key (auto-injected) | emulator key (auto-injected) | unset → managed identity |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | `http://localhost:3000` | Pages URL |
| `APP_URL` | `http://localhost:3000` | `http://localhost:3000` | Pages URL |
| `JWT_SECRET` | `.env` | random | from Infisical |
| `AUTH_SECRET` | `.env` | random | from Infisical |
| `SMTP_HOST` | `localhost` | Mailpit | from Infisical |
| `SMTP_PORT` | `1025` | `1025` | from Infisical |
| `SMTP_USER` | unset | unset | from Infisical |
| `SMTP_PASS` | unset | unset | from Infisical |
| `MAX_UPLOAD_MB` | `400` | — | `400` |
| `INFISICAL_IDENTITY_ID` | unset (local path) | unset | Container App env |
| `INFISICAL_PROJECT_ID` | unset (local path) | unset | Container App env |
| `INFISICAL_ENV` | unset (local path) | unset | `prod` |
| `VITE_API_URL` | unset (Vite proxy) | — | Container App URL |

---

## Local development paths

**Default (fastest onboarding):** `.env` file

```bash
cp .env.example .env   # fill in secrets
pnpm --filter @vault/server dev
```

`INFISICAL_IDENTITY_ID` is unset → `hydrateFromInfisical()` skips → secrets come from `.env`.

**Optional A — Infisical CLI injection:**

```bash
# One-time: brew install infisical  (or see infisical.com/docs/cli)
infisical login
infisical run --env=dev -- pnpm --filter @vault/server dev
```

**Optional B — full Azure Auth path locally (exercises production code):**

```bash
az login
# .env contains only the three INFISICAL_* identifiers (no secret values)
pnpm --filter @vault/server dev
```

`DefaultAzureCredential` resolves to your `az login` session, mints an AAD token, and the server fetches secrets from Infisical just as it does in production.

---

## Infrastructure changes

**Via CI (recommended):**
1. Actions → Deploy → Run workflow → check "Run terraform apply (infrastructure changes)"

**Locally:**
```bash
cd infra
source envs/.env.local
terraform plan  -var-file=envs/prod.tfvars
terraform apply -var-file=envs/prod.tfvars
```

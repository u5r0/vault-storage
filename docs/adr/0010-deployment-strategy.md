# ADR 0010: Deployment Strategy

**Status:** Accepted — current state as of 2026-07-20
**Supersedes:** ADR 0020 / ADR 0026 in `build-reasoning` (those are the design record; this is the local ops reference)
**Related:** ADR 0009 (blob storage multi-provider), `docs/deploy.md` (operator runbook)

---

## Context

The application is deployed across three services:

| Layer | Service | Why |
|-------|---------|-----|
| API | Azure Container Apps | Same cloud as Cosmos DB → managed identity auth. Scale-to-zero. |
| Database | Azure Cosmos DB (free tier) | 1,000 RU/s + 25 GB always free. |
| Blob storage | Cloudflare R2 | Free tier (10 GB, zero egress). S3-compatible. |
| SPA | Cloudflare Pages | Free, global CDN. |
| Container registry | ghcr.io | Free for public repos; built-in to GitHub Actions. |
| SMTP | Resend | 3k emails/month free. |

All services stay within always-free or no-cost tiers at low traffic. Total: **$0/month**.

Infrastructure is provisioned by Terraform in `infra/`. Application deployments are driven by `.github/workflows/deploy.yml` via GitHub Actions.

---

## Current Infrastructure State

### Terraform

- **State backend:** Azure Storage Account (`vault-tfstate-rg`). The `storage_account_name` placeholder (`REPLACE_AFTER_BOOTSTRAP`) in `infra/versions.tf` must be filled in after running `infra/bootstrap/bootstrap.sh` once.
- **Cloudflare provider:** `cloudflare/cloudflare ~> 5.0`. Version 5 is a ground-up rewrite. Key API change: `cloudflare_pages_project.deployment_configs` uses `env_vars` (not `environment_variables`) and each entry is an object `{ value, type }`. Using the old key is silently ignored — `VITE_API_URL` would never be set in Pages.
- **Azure provider:** `hashicorp/azurerm ~> 4.0`.
- **Resources provisioned:** Cosmos DB account + database + container (`vault_entries`, partition key `/ownerId`), Key Vault (provisioned but unused — see §Not Yet Implemented), Log Analytics, Container App environment, Container App (system-assigned managed identity + Cosmos role assignment), Cloudflare R2 bucket + CORS policy, Cloudflare Pages project.

### GitHub Actions

`.github/workflows/deploy.yml` fans out two jobs on every CI success on `main`:

- **`deploy-api`** — builds Docker image, pushes to `ghcr.io/u5r0/vault-api`, runs `az containerapp update`.
- **`deploy-web`** — builds SPA (`pnpm --filter @vault/web build`), deploys `apps/web/dist` via `cloudflare/wrangler-action@v4 pages deploy`.

Both jobs are gated on `github.event.workflow_run.conclusion == 'success'` (CI on `main`). A concurrency guard cancels in-flight deploys on newer pushes.

### GitHub Actions — required secrets and variables

Before the first deploy, these must be set in **Settings → Secrets and variables → Actions**:

**Secrets:**

| Secret | How to get |
|--------|-----------|
| `AZURE_CLIENT_ID` | App registration client ID (OIDC federated credential, branch `main`) |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens: **R2:Edit + Pages:Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → top-right Account ID (`8076f1c1560b58efe3e3c26bf268a55c`) |
| `TF_VAR_ghcr_token` | GitHub PAT with `read:packages` scope (Container App image pull) |
| `TF_VAR_r2_access_key_id` | R2 API token access key |
| `TF_VAR_r2_secret_access_key` | R2 API token secret |
| `TF_VAR_jwt_secret` | `openssl rand -hex 32` |
| `TF_VAR_auth_secret` | `openssl rand -hex 32` |
| `TF_VAR_smtp_user` | Resend SMTP username (`resend`) |
| `TF_VAR_smtp_pass` | Resend API key |
| `TF_VAR_cloudflare_api_token` | Same Cloudflare token used for deploy (R2:Edit + Pages:Edit) |

**Variables (non-secret):**

| Variable | Value | Set by |
|----------|-------|--------|
| `VITE_API_URL` | `https://<container-app-fqdn>` | Terraform job auto-sets via `gh variable set`; or set manually after first `terraform apply` |

> **Note on the Terraform `smtp_url` mismatch:** The `deploy.yml` terraform job previously passed `TF_VAR_smtp_url` but `infra/variables.tf` declares discrete `smtp_host / smtp_port / smtp_secure / smtp_user / smtp_pass` — there is no `smtp_url` variable. Pass `TF_VAR_smtp_user` and `TF_VAR_smtp_pass` instead (already corrected in the current `deploy.yml`).

---

## Known Bugs Fixed (as of 2026-07-20)

| Bug | Location | Fix |
|-----|----------|-----|
| `ghcr.io` rejects uppercase chars in image names | `deploy.yml` `deploy-api` job | Downcase owner: `OWNER=$(echo "${{ github.repository_owner }}" \| tr '[:upper:]' '[:lower:]')` |
| `gh variable set VITE_API_URL` fails — missing `GH_TOKEN` and `variables: write` permission | `deploy.yml` terraform job | Added `variables: write` to top-level `permissions`; added `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` to the step |
| `cloudflare_pages_project` env vars never applied (v5 API change) | `infra/main.tf` | Replaced `environment_variables = { KEY = "val" }` with `env_vars = { KEY = { value = "val", type = "plain_text" } }` |
| `deploy.yml` uses `checkout@v4` / `azure/login@v2` while all other workflows use v6/v3 | `deploy.yml` | Updated to `checkout@v6`, `azure/login@v3` for consistency |

---

## Not Yet Implemented / Open Issues

### Key Vault (F-KV from ADR 0026)
`azurerm_key_vault.main` is provisioned in Terraform but holds zero secrets and nothing references it. Two options:
- **Option A (recommended):** Remove it. Secrets live as Container App secret blocks (current state).
- **Option B:** Migrate to Infisical Azure Auth via managed identity (ADR 0027 design, not yet implemented).

ADR 0027 proposes Infisical as the secrets manager. Until that is implemented, secrets continue to be passed via `TF_VAR_*` GitHub Actions secrets and stored as Container App secrets.

### `infra/versions.tf` placeholder
`storage_account_name = "REPLACE_AFTER_BOOTSTRAP"` must be replaced with the output of `bash infra/bootstrap/bootstrap.sh` before `terraform init` will succeed. This is a first-time setup step — see `docs/deploy.md`.

### `infra/main.tf` — `random_string.suffix` instability
`random_string.suffix` regenerates on `destroy` + `apply`, producing new globally-unique Cosmos DB and Key Vault names. Cosmos DB enforces a 7-day name-reuse window after deletion. Mitigate by adding a `name_suffix` tfvar (e.g., `"abc123"`) and replacing `random_string.suffix.result` with it.

### Recursive folder delete (F-DEL from ADR 0026)
`FilesService.delete()` only removes one level of children. Nested folders leave orphaned Cosmos documents and blobs. Fix before any production data exists.

### Distributed rate limiting (F-RLSCALE from ADR 0026 / ADR 0028)
`RateLimiterMemory` is in-process. With `max_replicas = 3` users can exceed their limit by up to 3×. At `min_replicas = 0` (scale-to-zero) the app is typically single-instance at low traffic — acceptable for now, but must be addressed before real multi-user load (ADR 0028 recommends Upstash Redis).

---

## ADR 0027 / ADR 0028 — Should You Implement Before Deploying?

### ADR 0027 — Secret Management (Infisical + Zod)

**Recommendation: defer.** The current `TF_VAR_*` → Container App secret approach is functional and will get you deployed today. ADR 0027 is a security improvement (secrets not in `process.env` at runtime) but it is not a blocker. The Zod config validation piece (Phase 1 of ADR 0027) is lower-risk and can be done independently — it only adds startup-time validation, no infra changes. **Deploy first, then implement ADR 0027 Phase 1 (Zod) as the first post-launch PR.**

### ADR 0028 — System Design Bottlenecks (HPK, Search, Redis)

**Recommendation: implement HPK before deploying.** ADR 0028 §3.1 flags the Cosmos hierarchical partition key (HPK) as a blocking prerequisite for production launch. Changing `partition_key_paths` on a Cosmos container with existing documents requires a full data migration. The container is empty now — the change is a one-line Terraform edit + `terraform apply`. Once real user data exists, this change costs days of migration work. All other bottlenecks (MiniSearch, Upstash Redis) are optional and can ship post-launch.

**Summary:**
- HPK change (`partition_key_version = 2`, three-level paths): **do before first deploy** (5-minute Terraform change).
- Zod config validation: safe to do anytime, low risk, do it as first post-launch PR.
- Infisical secrets: defer until the app is live and running.
- MiniSearch / Upstash Redis: defer until post-launch.

---

## Deployment Checklist (First Deploy)

```
[ ] 1. az login — verify subscription is active (free tier, trial ended is OK for ACA + Cosmos)
[ ] 2. bash infra/bootstrap/bootstrap.sh — creates Terraform state backend
[ ] 3. Update infra/versions.tf storage_account_name with printed value
[ ] 4. Fill remaining infra/envs/prod.tfvars entries (all non-sensitive values already set)
[ ] 5. Apply HPK change to infra/main.tf (ADR 0028 §3.1) — partition_key_version = 2, paths = ["/ownerId", "/parentId", "/id"]
[ ] 6. Run: cd infra && terraform init && terraform plan -var-file=envs/prod.tfvars (+ TF_VAR_* exports)
[ ] 7. Run: terraform apply -var-file=envs/prod.tfvars
[ ] 8. Note api_url output → set VITE_API_URL GitHub variable (or let the deploy.yml terraform job do it)
[ ] 9. Add all GitHub Actions secrets listed above
[ ] 10. Create Azure App Registration + federated OIDC credential for branch main
[ ] 11. Grant the App Registration Contributor on resource group vault-prod-rg
[ ] 12. Push to main — CI runs, deploy.yml triggers
[ ] 13. Verify Container App health: az containerapp revision list --name vault-api --resource-group vault-prod-rg
[ ] 14. Verify Pages: https://vault-storage.pages.dev
```

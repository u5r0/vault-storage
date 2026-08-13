# ADR 0010: Deployment Strategy & Current State

**Status:** In progress — status snapshot as of 2026-07-20
**Supersedes:** ADR 0020 / ADR 0026 in `build-reasoning` (those are the design record; this is the working ops + handoff reference)
**Amends:** ADR 0006 (single-collection model — now a three-container model, see §Data Model Change)
**Related:** ADR 0009 (blob storage multi-provider), ADR 0027 (secrets — deferred), ADR 0028 (system-design bottlenecks — partially implemented)

---

## Context

The application is deployed across these services, all within always-free / no-cost tiers:

| Layer | Service | Why |
|-------|---------|-----|
| API | Azure Container Apps | Same cloud as Cosmos DB → managed identity auth. Scale-to-zero. |
| Database | Azure Cosmos DB (free tier) | 1,000 RU/s + 25 GB always free. |
| Blob storage | Cloudflare R2 | Free tier (10 GB, zero egress). S3-compatible. |
| SPA | Cloudflare Worker | Free, global CDN. **Frontend deploys here, NOT Vercel.** |
| Container registry | ghcr.io | Free; built into GitHub Actions. |
| SMTP | Resend | 3k emails/month free. |

Infrastructure is provisioned by Terraform in `infra/`. Deployments run via `.github/workflows/deploy.yml` (triggered on CI success on `main`).

---

## What Has Been Done (this work stream)

Four commits on branch `vault-deployment-strategy`:

| Commit | Summary |
|--------|---------|
| `92b2504` | **infra:** `cloudflare_workers_site` → provider v5 `env_vars = { KEY = { value, type } }` (old `environment_variables` key was silently ignored — `VITE_API_URL` never reached Worker). **Pushed.** |
| `0a174e2` | **deploy fixes:** `smtp_url` → `smtp_user`/`smtp_pass` (no `smtp_url` var exists — apply failed); added `variables: write` + `GH_TOKEN` to the "Set GitHub Variable" step; `cd infra` in that step (working dir did not persist across steps); downcase `github.repository_owner` before ghcr tag/push; removed unused `azurerm_key_vault` + `azurerm_client_config` (closes ADR 0026 F-KV / ADR 0027 removal). |
| `50f818a` | **search (ADR 0028 Phase 2, server side):** `@vault/sdk` `normalizeSearchText()` — NFKD + strip all combining marks (`\p{M}`) unifies Arabic alef forms, tashkeel, tatweel, and Latin diacritics; server persists `nameNormalized` on all four write paths; search matches it, with a backfill-safe fallback for pre-existing docs. |
| `c9dec16` | **data layer (ADR 0028 Phase 1, app + infra only):** hierarchical partition key + container split. See below. |

### Data Model Change (amends ADR 0006 / 0007)

The single `vault_entries` container (partition key `/ownerId`) is replaced by **three** containers:

| Container | Partition key | Holds |
|-----------|---------------|-------|
| `vault_entries` | `[/ownerId, /parentId, /id]` (MultiHash, v2 — HPK) | files & folders |
| `vault_lookup` | `/id` | pointer records `{ id, ownerId, parentId }` so id-only ops resolve the HPK with one point read instead of a cross-partition scan (Gap 2) |
| `vault_auth` | `/id` (+ `default_ttl = -1`) | user / refresh_token / spent_token — split out because they have no `ownerId`/`parentId` |

- App wiring: `db.ts` exposes all three; `lib/entry-lookup.ts` centralises HPK + pointer maintenance; `files.ts` maintains pointers and uses keyed point reads; `move` is delete+create across partitions (HPK contains `parentId`, which Cosmos cannot mutate in place); `delete` walks the subtree selecting key fields; `auth.ts`/`lib/auth.ts` use the auth container with explicit `/id` keys.
- Local/CI emulator: `docker-compose.yml` now runs the **real** Azure Cosmos DB Linux emulator (`vnext-latest`), which enforces HPK semantics (Cosmium, the previous emulator, ignored partition keys).
- Also fixed latent bug: `spent_token` docs set `ttl: 900` but no container had default TTL enabled, so they never expired — the `vault_auth` container now enables it.

---

## What Is Missing / NOT Done (handoff)

> **The app is NOT yet deployable as-is** because commit `c9dec16` (HPK) broke the test suite, and `deploy.yml` is gated on CI passing. Either finish the test rewrite below or move `c9dec16` off the deploy branch before deploying.

### CRITICAL — Phase 1 (HPK) verification & test rewrite
1. **Unit-test mocks are stale.** `apps/server/src/services/files.test.ts` and `auth.test.ts` mock `../db` as `{ db }` only — they don't provide the new `entries`/`lookup`/`authContainer` exports, and ~40 expectations assert the old call patterns (e.g. `db.item(id).read()` for download, single-container user queries).
2. **Fixtures target the wrong container.** `apps/server/src/__setup__/fixtures.ts` (`clearUsers`, `clearRefreshTokens`, `clearFileEntries`) query the entries container for user/token docs that now live in `vault_auth`, and use unkeyed `db.item(id).delete()` which fails on the HPK container.
3. **Not verified against a real emulator.** The HPK behaviour (point reads, cross-partition move, subtree delete) has **not** been run against the Azure Cosmos emulator — this could not be done in the authoring VM (emulator needs ~60s startup + TLS). **Must be verified in CI or locally before merge.**

### Phase 2 (search) — client side NOT done
- Server-side normalization is done and committed. The client-side MiniSearch index is **not** implemented. Decision on record: **hybrid** (bounded local MiniSearch index over loaded entries + server fallback so cross-folder results are never missed). Requires a bounded "list all my entries" fetch path — not yet built.

### Phase 3 (ADR 0028 §3.3) — Upstash Redis distributed rate limiting — NOT started
- `RateLimiterMemory` is still in-process; with `max_replicas > 1` users can exceed limits N×. Needs Upstash Redis `UploadQuotaStore`, removal of the in-RAM upload endpoint, and a local `serverless-redis-http` shim in docker-compose/CI.

### Phase 4 (ADR 0027) — Infisical + Zod config — NOT started
- Secrets still flow via `TF_VAR_*` GitHub Actions secrets → Container App secret blocks. ADR 0027 Phase 1 (Zod config validation) is low-risk and independent; the Infisical managed-identity fetch is the larger piece.

### Phase 5 — test rewrite + Playwright in CI + Docker layer caching — NOT started

### Pre-existing setup gaps (not caused by this work)
- `infra/versions.tf`: `storage_account_name = "REPLACE_AFTER_BOOTSTRAP"` must be filled from `bash infra/bootstrap/bootstrap.sh` before `terraform init`.
- `infra/main.tf`: `random_string.suffix` regenerates on destroy+apply → new Cosmos account name; Cosmos enforces a 7-day name-reuse window. Consider a fixed `name_suffix` tfvar before the first real apply.

---

## GitHub Actions — required secrets & variables

Set in **Settings → Secrets and variables → Actions** before the first deploy.

**Secrets:**

| Secret | How to get |
|--------|-----------|
| `AZURE_CLIENT_ID` | App registration client ID (OIDC federated credential, branch `main`) |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → API Tokens: **R2:Edit + Workers Scripts:Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → Account ID |
| `TF_VAR_ghcr_token` | GitHub PAT, `read:packages` (Container App image pull) |
| `TF_VAR_r2_access_key_id` / `TF_VAR_r2_secret_access_key` | R2 API token |
| `TF_VAR_jwt_secret` / `TF_VAR_auth_secret` | `openssl rand -hex 32` each |
| `RESEND_API_KEY` | Resend API key (Infisical secret, not a Terraform var) |
| `MAX_UPLOAD_MB` | `500` (Terraform var `max_upload_mb` — Container App env, not a secret) |
| `TF_VAR_cloudflare_api_token` | Same Cloudflare token (R2:Edit + Workers Scripts:Edit) |

**Variables (non-secret):** `VITE_API_URL` = `https://<container-app-fqdn>` — the deploy.yml terraform job auto-sets this via `gh variable set`, or set manually after the first `terraform apply`.

---

## Deploy vs 0027/0028 — recommendation (updated)

- **Deploy blockers (config)**: fixed and verified (commits `92b2504`, `0a174e2`) — safe to ship.
- **Search normalization (Phase 2 server)**: fixed and unit-tested (`50f818a`) — safe to ship.
- **HPK / container split (Phase 1)**: correct-by-design but **unverified and test-breaking**. It is a *scale* optimization, **not** a launch blocker — the app functioned on the single-container model. Recommendation: **verify HPK on its own branch against the emulator in CI, then merge.** Do not block the initial deploy on it.
- **ADR 0027 (Infisical)**: defer; do Zod config validation as an early post-launch PR.
- **ADR 0028 Phases 3–5 (Redis, tests, CI)**: post-launch.

---

## First-Deploy Checklist

```
[ ] 1. Decide HPK sequencing: verify c9dec16 against emulator, OR deploy without it first
[ ] 2. az login — verify subscription active (free tier; trial-ended is OK for ACA + Cosmos)
[ ] 3. bash infra/bootstrap/bootstrap.sh — create Terraform state backend
[ ] 4. Update infra/versions.tf storage_account_name with printed value
[ ] 5. Fill remaining infra/envs/prod.tfvars entries
[ ] 6. cd infra && terraform init && terraform plan -var-file=envs/prod.tfvars (+ TF_VAR_* exports)
[ ] 7. terraform apply -var-file=envs/prod.tfvars
[ ] 8. Add all GitHub Actions secrets above; create Azure App Registration + federated OIDC cred (branch main); grant it Contributor on vault-prod-rg
[ ] 9. Push to main — CI runs, deploy.yml triggers both deploy-api and deploy-web
[ ] 10. Verify API: az containerapp revision list --name vault-api --resource-group vault-prod-rg
[ ] 11. Verify SPA: https://vault-storage.workers.dev
```

import { DefaultAzureCredential } from "@azure/identity"
import { InfisicalSDK } from "@infisical/sdk"

/**
 * Fetch application secrets from Infisical using the Container App's
 * system-assigned managed identity (Infisical Azure Auth).
 *
 * The @infisical/sdk v5 AuthClient does not expose an azureAuth helper,
 * so we perform the Azure Auth exchange manually:
 *   1. Obtain an AAD JWT from Azure IMDS via DefaultAzureCredential.
 *      (Same credential chain used by cosmos-credentials.ts — no creds in env.)
 *   2. POST the token to the Infisical Azure Auth login endpoint to receive
 *      a short-lived Infisical access token.
 *   3. Set the token on the SDK client via client.auth().accessToken(token).
 *   4. Fetch all secrets and hydrate process.env.
 *
 * No-op when INFISICAL_IDENTITY_ID is not set (local dev — secrets come from
 * .env via dotenv/config, or from `infisical run`).
 *
 * Must be called before loadConfig() in index.ts.
 */
export async function hydrateFromInfisical(): Promise<void> {
  const identityId = process.env.INFISICAL_IDENTITY_ID
  const projectId  = process.env.INFISICAL_PROJECT_ID
  const env        = process.env.INFISICAL_ENV

  if (!identityId || !projectId || !env) {
    // Local dev path: process.env already populated from .env or `infisical run`
    return
  }

  const siteUrl = process.env.INFISICAL_SITE_URL ?? "https://us.infisical.com"
  console.log("[infisical] Fetching secrets via Azure managed identity…")

  // Step 1: obtain an AAD token from the Container App's managed identity.
  // DefaultAzureCredential resolves to the system-assigned MI in production,
  // and to `az login` credentials for local Option-B testing.
  const credential = new DefaultAzureCredential()
  const aadToken = await credential.getToken("https://management.azure.com/.default")
  if (!aadToken) {
    throw new Error(
      "[infisical] Failed to obtain AAD token from managed identity. " +
      "Ensure the Container App has a system-assigned identity configured " +
      "in Infisical's Azure Auth settings.",
    )
  }

  // Step 2: exchange the AAD token for an Infisical access token via the
  // Azure Auth login endpoint. The SDK v5 does not expose azureAuth natively,
  // so we call the REST API directly and then set the token on the client.
  const loginRes = await fetch(`${siteUrl}/api/v1/auth/azure-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identityId, jwt: aadToken.token }),
  })

  if (!loginRes.ok) {
    const body = await loginRes.text().catch(() => "")
    throw new Error(
      `[infisical] Azure Auth login failed (${loginRes.status}): ${body}. ` +
      "Check that the machine identity's Azure Auth is configured with the " +
      "correct tenant ID and managed-identity object ID.",
    )
  }

  const { accessToken } = (await loginRes.json()) as { accessToken: string }

  // Step 3: authenticate the SDK client with the short-lived token.
  const client = new InfisicalSDK({ siteUrl })
  client.auth().accessToken(accessToken)

  // Step 4: fetch all secrets and hydrate process.env.
  // Infrastructure-level env vars (PORT, NODE_ENV, COSMOS_DB_ENDPOINT, etc.)
  // set by the Container App template take priority — only missing keys filled.
  const { secrets } = await client.secrets().listSecrets({
    projectId,
    environment: env,
    secretPath: "/",
  })

  let hydrated = 0
  for (const s of secrets) {
    if (process.env[s.secretKey] === undefined) {
      process.env[s.secretKey] = s.secretValue
      hydrated++
    }
  }

  console.log(`[infisical] Hydrated ${hydrated} secrets (project=${projectId}, env=${env})`)
}

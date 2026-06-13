import { BlobServiceClient } from "@azure/storage-blob"
import {
  S3Client,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3"
import { getProvider } from "./blob-provider"

/**
 * Configure CORS on the local blob backend so the browser can PUT
 * directly to presigned URLs (ADR 0023). Only runs against local
 * emulators (Azurite, RustFS) — production storage CORS is managed
 * out-of-band (Azure Portal / Cloudflare dashboard) and the server
 * credentials may not have permission to set it anyway.
 *
 * Best-effort: a failure here logs a warning but does not abort
 * server startup. The server-proxied `POST /api/files/upload` keeps
 * working regardless.
 */
export async function ensureCorsForBrowserUploads(): Promise<void> {
  const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "http://localhost:3000"
  const provider = getProvider()

  try {
    if (provider === "azure") {
      await configureAzuriteCors(allowedOrigin)
    } else {
      await configureLocalR2Cors(allowedOrigin)
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(
      `[server] Could not configure CORS on the blob backend (${reason}). ` +
        `Browser-direct uploads may fail with CORS errors until CORS is ` +
        `configured manually on the bucket / storage account.`,
    )
  }
}

async function configureAzuriteCors(origin: string): Promise<void> {
  // Only act on local Azurite. Production Azure CORS is set via the
  // management plane — the data-plane key may not authorize it, and
  // overwriting prod CORS from app boot would be hostile.
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING ?? ""
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME ?? ""
  const isLocalAzurite =
    cs.includes("127.0.0.1") ||
    cs.includes("localhost") ||
    cs.includes("devstoreaccount1") ||
    accountName === "devstoreaccount1"
  if (!isLocalAzurite || !cs) return

  const service = BlobServiceClient.fromConnectionString(cs)
  await service.setProperties({
    cors: [
      {
        allowedOrigins: origin,
        allowedMethods: "PUT,GET,HEAD,OPTIONS",
        // Azure Put Blob requires `x-ms-blob-type`. The rest covers
        // anything fetch / XHR may add automatically.
        allowedHeaders:
          "x-ms-blob-type,x-ms-version,x-ms-date,Content-Type,Content-Length,Authorization,Accept,Origin",
        exposedHeaders: "*",
        maxAgeInSeconds: 3600,
      },
    ],
  })
  console.log(`[server] Configured CORS on Azurite for origin: ${origin}`)
}

async function configureLocalR2Cors(origin: string): Promise<void> {
  // Production R2 is configured via Cloudflare dashboard / wrangler.
  // Only run when an endpoint override is set (i.e. RustFS / MinIO).
  const endpoint = process.env.R2_ENDPOINT
  if (!endpoint) return

  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })

  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: process.env.R2_BUCKET_NAME ?? "vault",
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedMethods: ["PUT", "GET", "HEAD"],
              AllowedOrigins: [origin],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    )
    console.log(`[server] Configured CORS on local R2 (${endpoint}) for origin: ${origin}`)
  } finally {
    client.destroy()
  }
}

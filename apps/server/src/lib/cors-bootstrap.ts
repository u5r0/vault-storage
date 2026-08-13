import { BlobServiceClient } from "@azure/storage-blob"
import {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3"
import { getProvider } from "./blob-provider.js"
import { getServerConfig } from "./env.js"

export async function ensureCorsForBrowserUploads(): Promise<void> {
  // Local blob backends (Azurite / RustFS) only need one origin; the first
  // configured one is fine for dev.
  const allowedOrigin = getServerConfig().ALLOWED_ORIGIN[0] ?? "http://localhost:3000"
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
  const cs = getServerConfig().AZURE_STORAGE_CONNECTION_STRING
  const accountName = getServerConfig().AZURE_STORAGE_ACCOUNT_NAME
  
  // Return early if connection string is not set
  if (!cs) return
  
  const isLocalAzurite =
    cs.includes("127.0.0.1") ||
    cs.includes("localhost") ||
    cs.includes("devstoreaccount1") ||
    accountName === "devstoreaccount1"
  
  if (!isLocalAzurite) return

  const service = BlobServiceClient.fromConnectionString(cs)
  await service.setProperties({
    cors: [
      {
        allowedOrigins: origin,
        allowedMethods: "PUT,GET,HEAD,OPTIONS",
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
  const endpoint = getServerConfig().R2_ENDPOINT
  if (!endpoint) return

  const accessKeyId = getServerConfig().R2_ACCESS_KEY_ID
  const secretAccessKey = getServerConfig().R2_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })

  const bucket = getServerConfig().R2_BUCKET_NAME

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
    console.log(`[server] Created R2 bucket "${bucket}" on ${endpoint}`)
  } catch (err: any) {
    const reason = err?.code === "BucketAlreadyExists" || err?.code === "BucketAlreadyOwnedByYou"
    if (!reason) {
      client.destroy()
      throw err
    }
  }

  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
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

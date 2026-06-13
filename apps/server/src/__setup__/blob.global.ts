import type { TestProject } from "vitest/node"
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"

/**
 * Provision the active blob backend for the integration suite. The
 * provider is selected by `BLOB_PROVIDER` (default `azure`). The
 * controllers tests don't change — they go through `getBlobStore()`
 * which dispatches to whichever provider is active.
 *
 * Run against R2:
 *   BLOB_PROVIDER=r2 pnpm test:integration
 *
 * Adding a new provider:
 *   1. Add a `case` in the switch that prepares its backend (bucket /
 *      container / namespace) and returns the env vars the server needs.
 *   2. Make sure docker-compose has the backend running locally.
 *   No changes needed in `blob.env.ts` — it just spreads whatever env
 *   the global setup provides onto `process.env`.
 */

type BlobEnv = Record<string, string>

const AZURITE_ACCOUNT = "devstoreaccount1"
// Well-known dev key shipped with Azurite. Not a secret.
const AZURITE_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="
const AZURITE_PORT = 10000

const RUSTFS_ENDPOINT = "http://127.0.0.1:9000"
const RUSTFS_ACCESS_KEY = "rustfsadmin"
const RUSTFS_SECRET_KEY = "rustfsadmin"

export default async function setup(project: TestProject) {
  const provider = process.env.BLOB_PROVIDER ?? "azure"
  switch (provider) {
    case "azure":
      return setupAzure(project)
    case "r2":
      return setupR2(project)
    default:
      throw new Error(
        `Unsupported BLOB_PROVIDER: "${provider}". ` +
          `Add a case in __setup__/blob.global.ts.`,
      )
  }
}

async function setupAzure(project: TestProject): Promise<() => Promise<void>> {
  const container = `vault-test-${Date.now()}`
  const env: BlobEnv = {
    BLOB_PROVIDER: "azure",
    AZURE_STORAGE_CONNECTION_STRING:
      `DefaultEndpointsProtocol=http;` +
      `AccountName=${AZURITE_ACCOUNT};` +
      `AccountKey=${AZURITE_KEY};` +
      `BlobEndpoint=http://127.0.0.1:${AZURITE_PORT}/${AZURITE_ACCOUNT};`,
    AZURE_STORAGE_CONTAINER_NAME: container,
  }
  project.provide("blobEnv", env)
  return async () => {
    /* docker-compose manages Azurite lifecycle */
  }
}

async function setupR2(project: TestProject): Promise<() => Promise<void>> {
  const bucket = `vault-r2-test-${Date.now()}`
  const admin = new S3Client({
    region: "auto",
    endpoint: RUSTFS_ENDPOINT,
    credentials: {
      accessKeyId: RUSTFS_ACCESS_KEY,
      secretAccessKey: RUSTFS_SECRET_KEY,
    },
    forcePathStyle: true,
  })
  await admin.send(new CreateBucketCommand({ Bucket: bucket }))
  console.log(
    `[setup/blob] created R2 test bucket "${bucket}" on ${RUSTFS_ENDPOINT}`,
  )

  const env: BlobEnv = {
    BLOB_PROVIDER: "r2",
    R2_ENDPOINT: RUSTFS_ENDPOINT,
    R2_ACCESS_KEY_ID: RUSTFS_ACCESS_KEY,
    R2_SECRET_ACCESS_KEY: RUSTFS_SECRET_KEY,
    R2_BUCKET_NAME: bucket,
    R2_ACCOUNT_ID: "rustfs-local",
  }
  project.provide("blobEnv", env)

  return async () => {
    await emptyAndDropBucket(admin, bucket)
      .then(() => console.log(`[setup/blob] dropped R2 test bucket "${bucket}"`))
      .catch(() => {
        /* best-effort */
      })
    admin.destroy()
  }
}

async function emptyAndDropBucket(admin: S3Client, bucket: string): Promise<void> {
  let token: string | undefined
  do {
    const res = await admin.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) {
        await admin.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  await admin.send(new DeleteBucketCommand({ Bucket: bucket }))
}

declare module "vitest" {
  export interface ProvidedContext {
    blobEnv: BlobEnv
  }
}

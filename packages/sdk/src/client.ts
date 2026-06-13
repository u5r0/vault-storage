import { CookieJar } from "tough-cookie";
import type {
  AckResult,
  AuthResult,
  CreateFolderInput,
  CreateFolderResult,
  DeleteInput,
  DeleteResult,
  DownloadUrlResult,
  ListFilesInput,
  ListFilesResult,
  LoginInput,
  MoveInput,
  MoveResult,
  QuickLinksResult,
  RegisterInput,
  RenameInput,
  RenameResult,
  ResendVerificationInput,
  SearchFilesInput,
  SearchFilesResult,
  UploadCompleteInput,
  UploadCompleteResult,
  UploadResult,
  UploadUrlInput,
  UploadUrlResult,
  VaultEntry,
  VaultStore,
} from "./schemas";

const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Default retry configuration for transient 429 responses. The server
 * sets `Retry-After` (seconds) on every rate-limit rejection — see
 * apps/server/src/middleware/rate-limit.ts. The client honors that
 * header up to `maxRetries` times before surfacing the failure.
 */
const DEFAULT_MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 30_000;

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.ceil(seconds * 1000));
  }
  // HTTP allows an HTTP-date too; we don't expect the server to send one
  // but parsing it cheaply lets us be tolerant.
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.min(MAX_RETRY_DELAY_MS, date - Date.now()));
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Vault API client — works in both browser and Node.js environments.
 *
 * In the browser, the native cookie jar is used via `credentials: "include"`.
 * In Node.js, `tough-cookie`'s CookieJar captures `Set-Cookie` headers and
 * replays them on subsequent requests, since Node's `fetch` does not persist
 * cookies between calls.
 */
export class VaultClient implements VaultStore {
  /** Cookie jar used in Node.js only. */
  private cookieJar: CookieJar = new CookieJar();
  /** Max number of retries on 429 with `Retry-After`. Override for tests. */
  public maxRetries = DEFAULT_MAX_RETRIES;

  constructor(private baseUrl: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const init: RequestInit = { ...options };

    if (isBrowser) {
      init.credentials = "include";
    } else {
      const cookieHeader = await this.cookieJar.getCookieString(url);
      const headers = new Headers(options?.headers);
      if (cookieHeader) headers.set("Cookie", cookieHeader);
      init.headers = headers;
    }

    let response: Response;
    let attempt = 0;
    while (true) {
      response = await fetch(url, init);

      if (!isBrowser) {
        // getSetCookie() returns each Set-Cookie header separately, avoiding the
        // comma-collapsing issue of Headers.get("set-cookie") which breaks on
        // values containing commas (e.g. Expires dates).
        const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
        for (const cookie of setCookieHeaders) {
          await this.cookieJar.setCookie(cookie, url);
        }
      }

      // Honor Retry-After on 429s up to `maxRetries`. Retrying inside the
      // SDK means callers (the SPA, the seed, anything else) get correct
      // backoff for free — no per-call retry plumbing needed.
      if (response.status === 429 && attempt < this.maxRetries) {
        const delayMs = parseRetryAfterMs(response.headers.get("Retry-After"));
        if (delayMs !== null) {
          attempt++;
          await sleep(delayMs);
          continue;
        }
      }
      break;
    }

    if (!response.ok) {
      const error = (await response
        .json()
        .catch(() => ({ error: response.statusText }))) as { error?: string };
      throw new Error(error.error ?? `Request failed: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /* ======================== Auth API ======================== */

  async register(input: RegisterInput): Promise<AckResult> {
    return this.request<AckResult>("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async resendVerification(input: ResendVerificationInput): Promise<AckResult> {
    return this.request<AckResult>("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async verify(token: string): Promise<AuthResult> {
    return this.request<AuthResult>(`/api/auth/verify?token=${encodeURIComponent(token)}`);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    return this.request<AuthResult>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async logout(): Promise<void> {
    await this.request<void>("/api/auth/logout", { method: "POST" });
  }

  async me(): Promise<AuthResult> {
    return this.request<AuthResult>("/api/auth/me");
  }

  /* ======================== Files API ======================== */

  async listFiles(input: Partial<ListFilesInput> = {}): Promise<ListFilesResult> {
    const params = new URLSearchParams();
    if (input.entityId) params.set("entityId", input.entityId);
    if (input.cursor) params.set("cursor", input.cursor);
    if (input.pageSize !== undefined) params.set("pageSize", String(input.pageSize));
    const qs = params.toString();
    return this.request<ListFilesResult>(`/api/files${qs ? `?${qs}` : ""}`);
  }

  async searchFiles(
    input: SearchFilesInput,
    init: { signal?: AbortSignal } = {},
  ): Promise<SearchFilesResult> {
    const params = new URLSearchParams();
    params.set("q", input.q);
    if (input.type) params.set("type", input.type);
    if (input.cursor) params.set("cursor", input.cursor);
    if (input.pageSize !== undefined) params.set("pageSize", String(input.pageSize));
    return this.request<SearchFilesResult>(`/api/files/search?${params.toString()}`, {
      signal: init.signal,
    });
  }

  async createFolder(input: CreateFolderInput): Promise<CreateFolderResult> {
    return this.request<CreateFolderResult>("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async uploadFiles(input: { parentId?: string; files: File[] }): Promise<UploadResult> {
    const formData = new FormData();
    if (input.parentId) formData.append("parentId", input.parentId);
    input.files.forEach((file) => formData.append("files", file));
    return this.request<UploadResult>("/api/files/upload", {
      method: "POST",
      body: formData,
    });
  }

  /**
   * Browser-direct upload: per file, mint a presigned PUT URL, push bytes
   * directly to the object store, then ask the server to record the entry.
   * Bytes never cross the API server, which matters for zero-egress
   * providers like R2.
   *
   * Same return shape as `uploadFiles` so callers can swap paths.
   */
  async uploadFilesDirect(input: { parentId?: string; files: File[] }): Promise<UploadResult> {
    const uploaded: VaultEntry[] = [];
    for (const file of input.files) {
      const ticket = await this.createUploadUrl({
        parentId: input.parentId,
        name: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });

      // PUT goes to the object store, NOT the API. Cookies / API auth
      // headers must not leak — fetch directly with no credentials.
      // `requiredHeaders` carries provider-specific extras (e.g. Azure
      // needs `x-ms-blob-type: BlockBlob`).
      const putRes = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          ...ticket.requiredHeaders,
        },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(
          `Direct upload PUT failed for ${file.name}: ${putRes.status} ${putRes.statusText}`,
        );
      }

      const completed = await this.completeUpload({
        blobName: ticket.blobName,
        parentId: input.parentId,
        name: file.name,
        contentType: file.type || undefined,
      });
      uploaded.push(completed.entry);
    }
    return { uploaded };
  }

  async createUploadUrl(input: UploadUrlInput): Promise<UploadUrlResult> {
    return this.request<UploadUrlResult>("/api/files/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async completeUpload(input: UploadCompleteInput): Promise<UploadCompleteResult> {
    return this.request<UploadCompleteResult>("/api/files/upload-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  getDownloadUrl(id: string): string {
    return `${this.baseUrl}/api/files/download?id=${encodeURIComponent(id)}`;
  }

  /**
   * Mint a short-lived presigned GET URL for browser-direct download.
   * Useful for large files where streaming through the API would cost
   * egress (R2) or saturate the server (Azure / proxy).
   */
  async createDownloadUrl(id: string): Promise<DownloadUrlResult> {
    return this.request<DownloadUrlResult>(
      `/api/files/download-url?id=${encodeURIComponent(id)}`,
    );
  }

  async renameFile(input: RenameInput): Promise<RenameResult> {
    return this.request<RenameResult>("/api/files/rename", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async moveFile(input: MoveInput): Promise<MoveResult> {
    return this.request<MoveResult>("/api/files/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async deleteFile(input: DeleteInput): Promise<DeleteResult> {
    return this.request<DeleteResult>("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async getQuickLinks(): Promise<QuickLinksResult> {
    return this.request<QuickLinksResult>("/api/files/quick-links");
  }
}

/** Create a Vault client. Works in both browser and Node.js. */
export function createVaultClient(baseUrl: string): VaultClient {
  return new VaultClient(baseUrl);
}

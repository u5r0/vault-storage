import { CookieJar } from "tough-cookie";
import type {
  AuthResult,
  CreateFolderInput,
  CreateFolderResult,
  DeleteInput,
  DeleteResult,
  ListFilesInput,
  ListFilesResult,
  LoginInput,
  MoveInput,
  MoveResult,
  QuickLinksResult,
  RegisterInput,
  RenameInput,
  RenameResult,
  UploadResult,
  VaultStore,
} from "./schemas";

const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

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

    const response = await fetch(url, init);

    if (!isBrowser) {
      // getSetCookie() returns each Set-Cookie header separately, avoiding the
      // comma-collapsing issue of Headers.get("set-cookie") which breaks on
      // values containing commas (e.g. Expires dates).
      const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
      for (const cookie of setCookieHeaders) {
        await this.cookieJar.setCookie(cookie, url);
      }
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

  async register(input: RegisterInput): Promise<AuthResult> {
    return this.request<AuthResult>("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
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
    const entityId = input.entityId ?? "";
    const params = entityId ? `?entityId=${encodeURIComponent(entityId)}` : "";
    return this.request<ListFilesResult>(`/api/files${params}`);
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

  getDownloadUrl(id: string): string {
    return `${this.baseUrl}/api/files/download?id=${encodeURIComponent(id)}`;
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

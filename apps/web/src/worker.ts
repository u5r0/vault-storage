/// <reference types="@cloudflare/workers-types" />
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../worker-configuration.d.ts" />

function proxyError(message: string, detail?: unknown): Response {
  console.error("[proxy]", message, detail ?? "")
  return new Response(JSON.stringify({ error: message, detail: String(detail ?? "") }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  })
}

async function handleApiProxy(request: Request, env: Env): Promise<Response> {
  const base = env.VITE_API_URL

  if (!base || !/^https?:\/\//.test(base)) {
    return proxyError("API base URL is not configured", base)
  }

  const url = new URL(request.url)
  const target = `${base}${url.pathname}${url.search}`

  let targetUrl: URL
  try {
    targetUrl = new URL(target)
  } catch {
    return proxyError("Invalid upstream URL", target)
  }

  const headers = new Headers(request.headers)
  headers.set("Host", targetUrl.host)

  try {
    const body =
      request.method !== "GET" && request.method !== "HEAD" ? await request.text() : undefined
    return await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    })
  } catch (err) {
    const cause = (err as { cause?: unknown } | null)?.cause ?? err
    return proxyError("Upstream request failed", {
      message: err instanceof Error ? err.message : String(err),
      cause,
    })
  }
}

async function handleAsset(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request)
  if (asset.status !== 404) {
    return asset
  }

  const html = await env.ASSETS.fetch('/index.html')
  return html
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      return handleApiProxy(request, env)
    }

    return handleAsset(request, env)
  },
}

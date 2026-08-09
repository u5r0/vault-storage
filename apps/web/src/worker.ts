/// <reference types="@cloudflare/workers-types" />
/// <reference path="../worker-configuration.d.ts" />

async function handleApiProxy(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const target = `${env.VITE_API_URL}${url.pathname}${url.search}`

  const headers = new Headers(request.headers)
  headers.set('Host', new URL(target).host)

  return fetch(target, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
    redirect: 'manual',
  })
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

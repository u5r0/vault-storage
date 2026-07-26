/// <reference types="@cloudflare/workers-types" />
/// <reference path="../worker-configuration.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function handleApiProxy(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const target = `${env.VITE_API_URL}${url.pathname}${url.search}`

  const headers = new Headers(request.headers)
  headers.set('Host', new URL(target).host)

  const res = await fetch(target, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
    redirect: 'manual',
  })

  const responseHeaders = new Headers(res.headers)
  responseHeaders.set('Access-Control-Allow-Origin', '*')

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
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

export const onRequestGet = async ({ params, env }) => {
  try {
    const key = Array.isArray(params.key) ? params.key.join('/') : params.key
    if (!key) return new Response('Not Found', { status: 404 })
    const obj = await env.R2_BUCKET.get(key)
    if (!obj) return new Response('Not Found', { status: 404 })
    const headers = new Headers()
    const md = obj.httpMetadata || {}
    if (md.contentType) headers.set('content-type', md.contentType)
    if (md.contentDisposition) headers.set('content-disposition', md.contentDisposition)
    return new Response(obj.body, { headers })
  } catch (e) { return new Response('Server error', { status: 500 }) }
}



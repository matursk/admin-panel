export const onRequestPost = async ({ request, env }) => {
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return new Response(JSON.stringify({ error: 'Missing file' }), { status: 400, headers: { 'content-type': 'application/json' } })
    }

    const timestamp = Date.now()
    const rnd = Math.random().toString(36).slice(2, 8)
    const original = String(file.name || 'image')
    const safeName = original.replace(/[^a-zA-Z0-9_.-]+/g, '_')
    const key = `lections/${timestamp}_${rnd}_${safeName}`

    const body = await file.arrayBuffer()
    await env.R2_BUCKET.put(key, body, {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
        contentDisposition: `inline; filename="${safeName}"`,
      },
    })

    // Hardcoded public base URL for R2 assets (custom domain)
    const BASE = 'https://images.matur.sk'
    const base = BASE.replace(/\/$/, '')
    const url = `${base}/${key}`

    return new Response(JSON.stringify({ key, url }), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}



// Living Silk — product image resolver.
// Given a Shopify product URL it returns the product's image URLs as JSON with
// permissive CORS, so the static GitHub Pages app can texture any saree from a
// pasted link without hitting browser cross-origin limits. Not an open proxy:
// requests are restricted to nalli.com and *.myshopify.com.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': '*',
  'cache-control': 'public, max-age=600',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const target = new URL(req.url).searchParams.get('url');
    if (!target) return json({ error: 'missing ?url=' }, 400);

    let p;
    try { p = new URL(target); } catch { return json({ error: 'invalid url' }, 400); }

    const host = p.hostname.replace(/^www\./, '');
    const allowed = host === 'nalli.com' || host.endsWith('.myshopify.com') || host === 'cdn.shopify.com';
    if (!allowed) return json({ error: 'host not allowed', host }, 403);

    // already a direct image
    if (/\.(jpe?g|png|webp|avif)$/i.test(p.pathname)) {
      return json({ title: 'Image', images: [target] });
    }

    const jsonUrl = `${p.origin}${p.pathname.replace(/\/$/, '')}.json`;
    let r;
    try {
      r = await fetch(jsonUrl, { headers: { 'user-agent': 'living-silk-resolver' } });
    } catch (e) {
      return json({ error: 'upstream fetch failed', detail: String(e) }, 502);
    }
    if (!r.ok) return json({ error: 'product not found', status: r.status }, 502);

    let data;
    try { data = await r.json(); } catch { return json({ error: 'product json parse failed' }, 502); }

    const prod = data.product || data;
    const images = (prod.images || []).map((i) => (typeof i === 'string' ? i : i.src)).filter(Boolean);
    if (!images.length) return json({ error: 'no images on product' }, 404);

    return json({ title: prod.title || 'Saree', handle: prod.handle || null, images });
  },
};

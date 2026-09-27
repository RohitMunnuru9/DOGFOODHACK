const apiOrigin = process.env.DOGFOOD_API_ORIGIN || 'http://127.0.0.1:8000';

export async function proxyApi(request, context) {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD' && request.headers.has('cookie') && !request.headers.has('authorization')) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin && new URL(origin).host !== host) {
      return Response.json({error: 'Cross-origin write refused'}, {status: 403});
    }
  }

  const {path} = await context.params;
  const target = `${apiOrigin}/api/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`;
  const headers = new Headers(request.headers);
  for (const name of ['host','origin','content-length','connection','accept-encoding']) headers.delete(name);

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('transfer-encoding');
    responseHeaders.delete('connection');
    return new Response(upstream.body, {status: upstream.status, headers: responseHeaders});
  } catch {
    return Response.json({error: 'The local event service is unavailable.'}, {status: 503});
  }
}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
    }
    if (req.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: CORS });
    }

    try {
        const { searchParams } = new URL(req.url);
        const raw = searchParams.get('url') || '';
        if (!raw) {
            return new Response('Missing url', { status: 400, headers: CORS });
        }

        let target: URL;
        try {
            target = new URL(raw);
        } catch {
            return new Response('Invalid url', { status: 400, headers: CORS });
        }

        if (target.protocol !== 'http:' && target.protocol !== 'https:') {
            return new Response('Unsupported protocol', { status: 400, headers: CORS });
        }

        const upstream = await fetch(target.toString(), {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Sello-Image-Proxy/1.0',
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
        });

        if (!upstream.ok) {
            return new Response(`Upstream error ${upstream.status}`, {
                status: 502,
                headers: CORS,
            });
        }

        const contentType = upstream.headers.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('image/')) {
            return new Response('Upstream is not an image', {
                status: 415,
                headers: CORS,
            });
        }

        const body = await upstream.arrayBuffer();
        return new Response(body, {
            status: 200,
            headers: {
                ...CORS,
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error: any) {
        return new Response(error?.message || 'Proxy error', {
            status: 500,
            headers: CORS,
        });
    }
};


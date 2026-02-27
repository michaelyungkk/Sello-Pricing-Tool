import bcrypt from 'bcryptjs';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

export default async (req: Request) => {
    if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST')
        return new Response(
            JSON.stringify({ valid: false, error: 'Method not allowed' }),
            { status: 405, headers: CORS }
        );
    try {
        const { password } = await req.json();
        if (!password)
            return new Response(
                JSON.stringify({ valid: false, error: 'Password required' }),
                { status: 400, headers: CORS }
            );
        const hash = process.env.ADMIN_PASSWORD_HASH;
        if (!hash) throw new Error('ADMIN_PASSWORD_HASH not set');
        const valid = await bcrypt.compare(password, hash);
        return new Response(
            JSON.stringify({ valid }),
            { status: valid ? 200 : 401, headers: CORS }
        );
    } catch (error: any) {
        return new Response(
            JSON.stringify({ valid: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};

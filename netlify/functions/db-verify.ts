
import { neon } from '@netlify/neon';
import bcrypt from 'bcryptjs';

/**
 * Netlify Function: db-verify
 * Simple credential verification for entering Admin Mode.
 * Does not perform any database operations.
 */
export default async (req: Request) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ valid: false, error: 'Method Not Allowed' }), {
            status: 405,
            headers: corsHeaders
        });
    }

    try {
        const body = await req.json();
        const { password } = body;

        if (!password) {
            return new Response(JSON.stringify({ valid: false, error: 'Password required' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        const adminHash = process.env.ADMIN_PASSWORD_HASH;
        if (!adminHash) {
            throw new Error('ADMIN_PASSWORD_HASH not configured on server');
        }

        const isValid = await bcrypt.compare(password, adminHash);

        if (!isValid) {
            return new Response(JSON.stringify({ valid: false, error: 'Invalid credentials' }), {
                status: 401,
                headers: corsHeaders
            });
        }

        return new Response(JSON.stringify({ valid: true }), {
            status: 200,
            headers: corsHeaders
        });

    } catch (error: any) {
        console.error('db-verify error:', error);
        return new Response(JSON.stringify({
            valid: false,
            error: error.message || 'Internal Server Error'
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
};

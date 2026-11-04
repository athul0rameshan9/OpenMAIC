import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getOAuthClient, storeTokens } from '@/lib/home-agent/google-auth';
import { createClient } from '@supabase/supabase-js';

/** Verify the signed state parameter and extract userId */
function verifySignedState(state: string): string | null {
  const parts = state.split(':');
  if (parts.length !== 3) return null;
  const [userId, nonce, signature] = parts;
  const payload = `${userId}:${nonce}`;
  const key = process.env.TOKEN_ENCRYPTION_KEY || 'fallback-key';
  const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
  // Constant-time comparison
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return null;
  }
  return userId;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Derive the public origin from proxy headers.
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0] || 'https';
  const origin = `${proto}://${host}`;

  if (error) {
    return NextResponse.redirect(new URL('/?calendar_error=' + encodeURIComponent(error), origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/?calendar_error=missing_params', origin));
  }

  // Verify CSRF-signed state
  const userId = verifySignedState(state);
  if (!userId) {
    return NextResponse.redirect(new URL('/?calendar_error=invalid_state', origin));
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token || !tokens.access_token) {
      console.error('OAuth callback: missing tokens', { hasRefresh: !!tokens.refresh_token, hasAccess: !!tokens.access_token });
      return NextResponse.redirect(new URL('/?calendar_error=no_tokens', origin));
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('OAuth callback: missing Supabase config', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
      return NextResponse.redirect(new URL('/?calendar_error=config_error', origin));
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('OAuth callback: storing tokens for userId:', userId);
    await storeTokens(userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expiry_date || Date.now() + 3600000),
      scopes: tokens.scope?.split(' ') || [],
    }, supabase);
    console.log('OAuth callback: tokens stored successfully');

    return NextResponse.redirect(new URL('/?calendar_connected=true', origin));
  } catch (err) {
    console.error('OAuth callback error:', err);
    const message = err instanceof Error ? err.message : 'exchange_failed';
    return NextResponse.redirect(new URL(`/?calendar_error=${encodeURIComponent(message)}`, origin));
  }
}

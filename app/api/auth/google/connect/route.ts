import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getOAuthClient } from '@/lib/home-agent/google-auth';
import { cookies } from 'next/headers';
import { getUserId } from '@/lib/home-agent/user-identity';
import { nanoid } from 'nanoid';

const COOKIE_NAME = 'home_agent_user';

/** Create a signed state parameter to prevent CSRF */
function createSignedState(userId: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${userId}:${nonce}`;
  const key = process.env.TOKEN_ENCRYPTION_KEY || 'fallback-key';
  const signature = crypto.createHmac('sha256', key).update(payload).digest('hex');
  return `${payload}:${signature}`;
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  let userId = getUserId(cookieStore);
  
  // Auto-create user identity if cookie is missing
  if (!userId) {
    userId = nanoid();
    cookieStore.set(COOKIE_NAME, userId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const oauth2Client = getOAuthClient();
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  const state = createSignedState(userId);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state,
    prompt: 'consent',
  });

  return NextResponse.redirect(authUrl);
}

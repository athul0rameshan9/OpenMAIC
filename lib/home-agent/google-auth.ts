import { OAuth2Client } from 'google-auth-library';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from './token-encryption';
import type { OAuthTokens, EncryptedTokens } from './types';

export function getOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth environment variables are not configured');
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export async function getValidAccessToken(
  userId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from('user_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) return null;

  const tokens: EncryptedTokens = {
    encryptedAccessToken: data.encrypted_access_token,
    encryptedRefreshToken: data.encrypted_refresh_token,
    tokenExpiry: data.token_expiry,
    scopes: data.scopes,
  };

  const expiresAt = new Date(tokens.tokenExpiry);

  if (expiresAt > new Date()) {
    return decrypt(tokens.encryptedAccessToken);
  }

  // Token expired, refresh it
  const refreshToken = decrypt(tokens.encryptedRefreshToken);
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    return null;
  }

  const newTokens: OAuthTokens = {
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token ?? refreshToken,
    expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000),
    scopes: tokens.scopes,
  };

  await storeTokens(userId, newTokens, supabase);

  return newTokens.accessToken;
}

export async function storeTokens(
  userId: string,
  tokens: OAuthTokens,
  supabase: SupabaseClient
): Promise<void> {
  const encryptedAccessToken = encrypt(tokens.accessToken);
  const encryptedRefreshToken = encrypt(tokens.refreshToken);

  const { error } = await supabase.from('user_oauth_tokens').upsert(
    {
      user_id: userId,
      provider: 'google_calendar',
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expiry: tokens.expiresAt.toISOString(),
      scopes: tokens.scopes,
    },
    { onConflict: 'user_id,provider' }
  );

  if (error) {
    throw new Error(`Failed to store tokens: ${error.message}`);
  }
}

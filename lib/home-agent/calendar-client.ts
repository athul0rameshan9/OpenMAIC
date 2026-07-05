import { calendar } from '@googleapis/calendar';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOAuthClient, getValidAccessToken } from './google-auth';

export async function getCalendarClient(userId: string, supabase: SupabaseClient) {
  const accessToken = await getValidAccessToken(userId, supabase);

  if (!accessToken) {
    return null;
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return calendar({ version: 'v3', auth: oauth2Client as any });
}

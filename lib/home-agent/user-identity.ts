import { nanoid } from 'nanoid';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserIdentity } from './types';

const COOKIE_NAME = 'home_agent_user';

export function getUserId(cookies: ReadonlyRequestCookies): string | null {
  return cookies.get(COOKIE_NAME)?.value ?? null;
}

export async function getOrCreateUser(
  cookies: ReadonlyRequestCookies,
  supabase: SupabaseClient
): Promise<UserIdentity> {
  const existingId = getUserId(cookies);

  if (existingId) {
    const { data } = await supabase
      .from('user_identities')
      .select('*')
      .eq('browser_uuid', existingId)
      .single();

    if (data) {
      return {
        id: data.id,
        browserUuid: data.browser_uuid,
        displayName: data.display_name,
        createdAt: data.created_at,
      };
    }
  }

  const browserUuid = existingId ?? nanoid();

  const { data, error } = await supabase
    .from('user_identities')
    .insert({ browser_uuid: browserUuid })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create user identity: ${error?.message}`);
  }

  return {
    id: data.id,
    browserUuid: data.browser_uuid,
    displayName: data.display_name,
    createdAt: data.created_at,
  };
}

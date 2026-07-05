import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserId } from '@/lib/home-agent/user-identity';
import { getCalendarClient } from '@/lib/home-agent/calendar-client';
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

const COOKIE_NAME = 'home_agent_user';

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const cal = await getCalendarClient(userId, supabase);
  if (!cal) {
    return NextResponse.json({ error: 'Calendar not connected' }, { status: 400 });
  }

  const searchParams = req.nextUrl.searchParams;
  const timeMin = searchParams.get('timeMin') || new Date().toISOString();
  const timeMax = searchParams.get('timeMax') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const response = await cal.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    return NextResponse.json({ events: response.data.items || [] });
  } catch (err) {
    console.error('Calendar events fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

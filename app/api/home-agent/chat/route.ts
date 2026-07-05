import { NextRequest } from 'next/server';
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getUserId } from '@/lib/home-agent/user-identity';
import { resolveModel } from '@/lib/server/resolve-model';
import { buildSystemPrompt } from '@/lib/home-agent/system-prompt';
import { createCalendarTools } from '@/lib/home-agent/tools/calendar-tools';
import { createCourseTools } from '@/lib/home-agent/tools/course-tools';
import { getValidAccessToken } from '@/lib/home-agent/google-auth';
import { nanoid } from 'nanoid';

export const maxDuration = 60;

const COOKIE_NAME = 'home_agent_user';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  let userId = getUserId(cookieStore);

  // Auto-create user identity if cookie is missing
  if (!userId) {
    userId = nanoid();
    cookieStore.set(COOKIE_NAME, userId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  const body = await req.json();
  const { messages } = body as { messages: UIMessage[] };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Resolve model using same pattern as student-assistant
  const { model } = await resolveModel({
    modelString: req.headers.get('x-model') || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stage: 'home-agent' as any,
    apiKey: req.headers.get('x-api-key') || undefined,
    baseUrl: req.headers.get('x-base-url') || undefined,
    providerType: req.headers.get('x-provider-type') || undefined,
  });

  // Check calendar connection
  const hasCalendar = !!(await getValidAccessToken(userId, supabase));

  // Get available courses
  const { data: courses } = await supabase
    .from('classrooms')
    .select('name')
    .limit(10);

  const systemPrompt = buildSystemPrompt({
    courses: courses?.map(c => c.name) || [],
    hasCalendar,
    currentDate: new Date().toISOString(),
  });

  // Build tools
  const tools = {
    ...createCourseTools(supabase),
    ...(hasCalendar ? createCalendarTools(userId, supabase) : {}),
  };

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}

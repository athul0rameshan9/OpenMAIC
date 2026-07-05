/**
 * Student Assistant — Chat Streaming Endpoint
 *
 * SSE streaming chat with tool-calling support for textbook search and web search.
 */

import { type NextRequest } from 'next/server';
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';

import { resolveModel } from '@/lib/server/resolve-model';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { buildSystemPrompt } from '@/lib/student-assistant/context-builder';
import { createStudentAssistantTools } from '@/lib/student-assistant/tools';
import type { AssistantMode } from '@/lib/student-assistant/types';

const logger = createLogger('API/student-assistant/chat');

export const maxDuration = 60;

const VALID_MODES: AssistantMode[] = ['qa', 'research', 'study', 'quiz'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // The DefaultChatTransport sends UIMessage[] (with `parts`) plus extra body fields
    const messages: UIMessage[] = body.messages;
    const mode: AssistantMode = body.mode;
    const courseId: string | undefined = body.courseId;
    const textbookId: string | undefined = body.textbookId;
    const activeSlideContent: string | undefined = body.activeSlideContent;
    const model: string | undefined = body.model;
    const apiKey: string | undefined = body.apiKey;
    const baseUrl: string | undefined = body.baseUrl;
    const providerType: string | undefined = body.providerType;

    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return apiError('INVALID_REQUEST', 400, 'messages array is required and must not be empty');
    }

    if (!mode || !VALID_MODES.includes(mode)) {
      return apiError('INVALID_REQUEST', 400, `mode must be one of: ${VALID_MODES.join(', ')}`);
    }

    // Validate message roles
    for (const msg of messages) {
      if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
        return apiError('INVALID_REQUEST', 400, 'Each message must have a valid role');
      }
    }

    // Resolve model
    const resolved = await resolveModel({
      modelString: model,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stage: 'student-assistant' as any,
      apiKey,
      baseUrl,
      providerType,
    });

    // Build system prompt
    const system = buildSystemPrompt({
      mode,
      courseId,
      textbookId,
      activeSlideContent,
    });

    // Create tools
    const tools = createStudentAssistantTools({ textbookId });

    // Convert UIMessages to model messages for streamText
    const modelMessages = await convertToModelMessages(messages);

    logger.info(
      `Chat request: mode=${mode}, model=${resolved.modelString}, messages=${messages.length}`,
    );

    // Stream with tools
    const result = streamText({
      model: resolved.model,
      system,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    logger.error('Student assistant chat failed:', err);

    if (err.message?.includes('No model could be resolved')) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No model configured', err.message);
    }

    return apiError('INTERNAL_ERROR', 500, 'Chat failed', err.message);
  }
}

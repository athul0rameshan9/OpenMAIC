/**
 * Student Assistant — Research Endpoint
 *
 * Searches both vector DB and web, then synthesizes results with an LLM.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';

import { resolveModel } from '@/lib/server/resolve-model';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { searchTextbook } from '@/lib/student-assistant/tools/search-textbook';
import { executeWebSearch } from '@/lib/student-assistant/tools/web-search';
import type { StudentAssistantResearchRequest, Citation } from '@/lib/student-assistant/types';

const logger = createLogger('API/student-assistant/research');

export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as StudentAssistantResearchRequest;

    // Validate
    if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
      return apiError('INVALID_REQUEST', 400, 'query is required and must be a non-empty string');
    }

    const query = body.query.trim();

    // Resolve model
    const resolved = await resolveModel({
      modelString: body.model,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stage: 'student-assistant' as any,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      providerType: body.providerType,
    });

    logger.info(`Research request: "${query.slice(0, 80)}", model=${resolved.modelString}`);

    // Search both sources in parallel
    const [textbookResult, webResult] = await Promise.allSettled([
      body.textbookId
        ? searchTextbook({ query, textbookId: body.textbookId, topK: 5 })
        : Promise.resolve(null),
      executeWebSearch({
        query,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        providerId: body.webSearchProvider as any,
        apiKey: body.webSearchApiKey,
      }),
    ]);

    // Collect context
    const contextParts: string[] = [];
    const citations: Citation[] = [];

    if (textbookResult.status === 'fulfilled' && textbookResult.value) {
      contextParts.push('## Textbook Results\n' + textbookResult.value.context);
      citations.push(...textbookResult.value.citations);
    } else if (textbookResult.status === 'rejected') {
      logger.warn('Textbook search failed:', textbookResult.reason);
    }

    if (webResult.status === 'fulfilled' && webResult.value) {
      contextParts.push('## Web Results\n' + webResult.value.formattedContext);
    } else if (webResult.status === 'rejected') {
      logger.warn('Web search failed:', webResult.reason);
    }

    const combinedContext = contextParts.join('\n\n');

    // Synthesize with LLM
    const { text } = await generateText({
      model: resolved.model,
      system: `You are a research assistant. Synthesize the provided sources into a clear, comprehensive answer. Cite sources using [1], [2], etc. notation. Be thorough but concise.`,
      prompt: `Research query: "${query}"\n\nSources:\n${combinedContext}\n\nProvide a synthesized answer with citations.`,
    });

    return apiSuccess({
      query,
      synthesis: text,
      citations: citations.map((c) => ({
        text: c.text.slice(0, 300),
        headings: c.headings,
        pageNumbers: c.pageNumbers,
        score: c.score,
        sourceFile: c.sourceFile,
      })),
      webSources:
        webResult.status === 'fulfilled' && webResult.value
          ? webResult.value.sources
          : [],
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    logger.error('Research request failed:', err);

    if (err.message?.includes('No model could be resolved')) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No model configured', err.message);
    }

    return apiError('INTERNAL_ERROR', 500, 'Research failed', err.message);
  }
}

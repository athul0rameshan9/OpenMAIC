/**
 * Student Assistant — Web Search Tool
 *
 * Wraps the existing web search infrastructure for use as an AI SDK tool.
 */

import { searchWeb } from '@/lib/web-search';
import { formatSearchResultsAsContext } from '@/lib/web-search';
import { createLogger } from '@/lib/logger';
import type { WebSearchProviderId } from '@/lib/web-search/types';

const logger = createLogger('student-assistant/web-search');

export interface WebSearchToolParams {
  query: string;
  providerId?: WebSearchProviderId;
  apiKey?: string;
  maxResults?: number;
}

export interface WebSearchToolResult {
  formattedContext: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
}

export async function executeWebSearch(params: WebSearchToolParams): Promise<WebSearchToolResult> {
  const {
    query,
    providerId = (process.env.DEFAULT_WEB_SEARCH_PROVIDER as WebSearchProviderId) || 'tavily',
    apiKey = process.env.WEB_SEARCH_API_KEY,
    maxResults = 5,
  } = params;

  logger.info(`Web search: "${query.slice(0, 80)}" via ${providerId}`);

  const result = await searchWeb({
    providerId,
    query,
    apiKey,
    maxResults,
  });

  const formattedContext = formatSearchResultsAsContext(result);

  const sources = result.sources.map((s) => ({
    title: s.title,
    url: s.url,
    snippet: s.content.slice(0, 300),
  }));

  return { formattedContext, sources };
}

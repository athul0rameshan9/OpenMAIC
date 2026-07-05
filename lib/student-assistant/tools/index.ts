/**
 * Student Assistant — Tool Definitions
 *
 * Exports AI SDK tool definitions for use with streamText.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { searchTextbook } from './search-textbook';
import { executeWebSearch } from './web-search';

export function createStudentAssistantTools(params: {
  textbookId?: string;
  webSearchProvider?: string;
  webSearchApiKey?: string;
}) {
  const { textbookId, webSearchProvider, webSearchApiKey } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  if (textbookId) {
    const tbId = textbookId;
    tools.search_textbook = tool({
      description:
        'Search the student\'s textbook for relevant passages. Use this when the student asks about course material or you need to find specific information from their textbook.',
      inputSchema: z.object({
        query: z.string().describe('The search query to find relevant textbook passages'),
        topK: z.number().optional().describe('Number of results to return (default 5, max 20)'),
      }),
      execute: async (args: { query: string; topK?: number }) => {
        const result = await searchTextbook({ query: args.query, textbookId: tbId, topK: args.topK });
        return {
          context: result.context,
          citationCount: result.citations.length,
          citations: result.citations.map((c) => ({
            headings: c.headings,
            pageNumbers: c.pageNumbers,
            score: c.score,
            excerpt: c.text.slice(0, 200),
          })),
        };
      },
    });
  }

  tools.web_search = tool({
    description:
      'Search the web for current information. Use this when the question requires up-to-date information not found in the textbook, or when no textbook is available.',
    inputSchema: z.object({
      query: z.string().describe('The search query'),
      maxResults: z.number().optional().describe('Maximum number of results (default 5)'),
    }),
    execute: async (args: { query: string; maxResults?: number }) => {
      const result = await executeWebSearch({
        query: args.query,
        providerId: webSearchProvider as never,
        apiKey: webSearchApiKey,
        maxResults: args.maxResults,
      });
      return {
        context: result.formattedContext,
        sources: result.sources,
      };
    },
  });

  return tools;
}

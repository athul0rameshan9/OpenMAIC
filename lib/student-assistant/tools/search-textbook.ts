/**
 * Student Assistant — Textbook Search Tool
 *
 * Searches the Qdrant vector database for relevant textbook passages.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { createLogger } from '@/lib/logger';
import type { Citation } from '../types';

const logger = createLogger('student-assistant/search-textbook');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedPipeline: any = null;

async function getEmbeddingPipeline() {
  if (!embedPipeline) {
    const { pipeline } = await import('@huggingface/transformers');
    embedPipeline = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', {
      dtype: 'fp32',
    });
  }
  return embedPipeline;
}

async function embedQuery(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const prefixed = `Represent this sentence for searching relevant passages: ${text}`;
  const output = await pipe(prefixed, { pooling: 'cls', normalize: true });
  return Array.from(output.data as Float32Array);
}

function getQdrantClient(): QdrantClient {
  const url = process.env.QDRANT_CLOUD_URL;
  const apiKey = process.env.QDRANT_CLOUD_API_KEY;

  if (!url || !apiKey) {
    throw new Error('Missing QDRANT_CLOUD_URL or QDRANT_CLOUD_API_KEY environment variables');
  }

  return new QdrantClient({ url, apiKey });
}

export interface SearchTextbookParams {
  query: string;
  textbookId: string;
  topK?: number;
}

export interface SearchTextbookResult {
  citations: Citation[];
  context: string;
}

export async function searchTextbook(params: SearchTextbookParams): Promise<SearchTextbookResult> {
  const { query, textbookId, topK = 5 } = params;
  const limit = Math.min(Math.max(topK, 1), 20);

  logger.info(`Searching textbook ${textbookId} for: "${query.slice(0, 80)}"`);

  const vector = await embedQuery(query.trim());
  const qdrant = getQdrantClient();

  const results = await qdrant.search('textbook_chunks', {
    vector,
    limit,
    filter: {
      must: [{ key: 'textbook_id', match: { value: textbookId } }],
    },
    with_payload: true,
  });

  const citations: Citation[] = results.map((point) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = point.payload as Record<string, any>;
    return {
      text: payload.text ?? '',
      headings: payload.headings ?? [],
      pageNumbers: payload.page_numbers ?? [],
      score: point.score,
      sourceFile: payload.source_pdf ?? '',
    };
  });

  const context = citations
    .map((c, i) => {
      const heading = c.headings.length > 0 ? c.headings.join(' > ') : 'Untitled section';
      const pages = c.pageNumbers.length > 0 ? ` (p. ${c.pageNumbers.join(', ')})` : '';
      return `[${i + 1}] ${heading}${pages}:\n${c.text}`;
    })
    .join('\n\n');

  return { citations, context };
}

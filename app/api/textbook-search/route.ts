import { type NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';

import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import type { TextbookChunk } from '@/lib/types/textbook';

const logger = createLogger('API/textbook-search');

// Lazy-loaded embedding pipeline
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { textbook_id, query, top_k } = body;

    if (!textbook_id || !query) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'textbook_id and query are required',
      );
    }

    if (typeof query !== 'string' || query.trim().length === 0) {
      return apiError('INVALID_REQUEST', 400, 'query must be a non-empty string');
    }

    const limit = Math.min(Math.max(Number(top_k) || 5, 1), 20);

    // Embed the query
    const vector = await embedQuery(query.trim());

    // Search Qdrant
    const qdrant = getQdrantClient();
    const results = await qdrant.search('textbook_chunks', {
      vector,
      limit,
      filter: {
        must: [{ key: 'textbook_id', match: { value: textbook_id } }],
      },
      with_payload: true,
    });

    const chunks: TextbookChunk[] = results.map((point) => {
      const payload = point.payload as Record<string, any>;
      return {
        text: payload.text ?? '',
        headings: payload.headings ?? [],
        page_numbers: payload.page_numbers ?? [],
        content_type: payload.content_type ?? 'text',
        has_formula: payload.has_formula ?? false,
        has_table: payload.has_table ?? false,
        has_figure: payload.has_figure ?? false,
        image_urls: payload.image_urls ?? [],
        source_pdf: payload.source_pdf ?? '',
        chunk_index: payload.chunk_index ?? 0,
        score: point.score,
      };
    });

    return apiSuccess({ chunks, textbook_id, query });
  } catch (err) {
    logger.error('Textbook search failed:', err);
    return apiError('INTERNAL_ERROR', 500, 'Search failed', String(err));
  }
}

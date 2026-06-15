import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveApiKey, resolveBaseUrl } from '@/lib/server/provider-config';
import { PROVIDERS } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';

const log = createLogger('ListModels');

/**
 * Fetches available models from an OpenAI-compatible /v1/models endpoint.
 * Useful for local providers (LM Studio, Ollama, Lemonade) where models
 * are dynamically loaded and not known ahead of time.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { providerId, apiKey: clientApiKey, baseUrl: clientBaseUrl } = body;

    if (!providerId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'providerId is required');
    }

    // Resolve credentials (server-managed takes precedence)
    const apiKey = resolveApiKey(providerId, clientApiKey);
    const provider = PROVIDERS[providerId as ProviderId];
    const baseUrl =
      resolveBaseUrl(providerId, clientBaseUrl) || clientBaseUrl || provider?.defaultBaseUrl;

    if (!baseUrl) {
      return apiError('INVALID_REQUEST', 400, 'No base URL configured for this provider');
    }

    // Validate the base URL is a valid URL
    let modelsUrl: string;
    try {
      const url = new URL(baseUrl);
      // Strip trailing /v1 or /v1/ to normalize, then append /v1/models
      const basePath = url.pathname.replace(/\/v1\/?$/, '');
      url.pathname = basePath + '/v1/models';
      modelsUrl = url.toString();
    } catch {
      return apiError('INVALID_URL', 400, 'Invalid base URL');
    }

    // Fetch models from the provider
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(modelsUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        return apiError('INTERNAL_ERROR', 504, 'Request timed out connecting to the provider');
      }
      return apiError(
        'INTERNAL_ERROR',
        502,
        'Cannot connect to provider. Make sure the server is running.',
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      log.error(`Failed to fetch models from ${modelsUrl}: ${response.status} ${errorText}`);
      return apiError(
        'UPSTREAM_ERROR',
        response.status,
        `Provider returned ${response.status}: ${errorText || response.statusText}`,
      );
    }

    const data = await response.json();

    // OpenAI-compatible format: { data: [{ id: "model-name", ... }] }
    const models: Array<{ id: string; name: string }> = [];
    if (data?.data && Array.isArray(data.data)) {
      for (const model of data.data) {
        if (model.id) {
          models.push({
            id: model.id,
            name: model.id,
          });
        }
      }
    }

    // Sort models alphabetically
    models.sort((a, b) => a.id.localeCompare(b.id));

    return apiSuccess({ models });
  } catch (error) {
    log.error('Error listing models:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

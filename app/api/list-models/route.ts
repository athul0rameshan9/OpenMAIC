import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isServerConfiguredProvider,
  resolveApiKey,
  resolveBaseUrl,
} from '@/lib/server/provider-config';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
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

    // Managed providers are admin-owned: ignore any client-sent key/baseUrl.
    const isManaged = isServerConfiguredProvider('providers', providerId);
    const provider = PROVIDERS[providerId as ProviderId];
    const safeClientApiKey = isManaged ? undefined : clientApiKey;
    const safeClientBaseUrl = isManaged ? undefined : clientBaseUrl;

    const apiKey = resolveApiKey(providerId, safeClientApiKey);
    const baseUrl = resolveBaseUrl(providerId, safeClientBaseUrl) || provider?.defaultBaseUrl;

    if (!baseUrl) {
      return apiError('INVALID_REQUEST', 400, 'No base URL configured for this provider');
    }

    // SSRF validation runs unconditionally (not gated on NODE_ENV) — this is the
    // more secure default for a route that fetches user-influenced URLs. For local
    // providers like LM Studio at localhost:1234, set ALLOW_LOCAL_NETWORKS=true.
    const ssrfError = await validateUrlForSSRF(baseUrl);
    if (ssrfError) {
      return apiError('INVALID_URL', 403, ssrfError);
    }

    // Validate the base URL and build models endpoint
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

    // Use redirect: 'manual' and re-validate each redirect hop to prevent
    // redirect-based SSRF bypass (mirrors app/api/proxy-media/route.ts).
    const MAX_REDIRECTS = 5;
    let currentUrl = modelsUrl;
    let response: Response;
    try {
      for (let hop = 0; ; hop++) {
        response = await fetch(currentUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
          redirect: 'manual',
        });
        if (response.status < 300 || response.status >= 400) break; // not a redirect
        const location = response.headers.get('location');
        if (!location) {
          clearTimeout(timeout);
          return apiError('UPSTREAM_ERROR', 502, 'Redirect response without Location header');
        }
        if (hop >= MAX_REDIRECTS) {
          clearTimeout(timeout);
          return apiError('TOO_MANY_REDIRECTS', 502, 'Too many redirects');
        }
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch {
          clearTimeout(timeout);
          return apiError('INVALID_URL', 502, 'Invalid redirect Location');
        }
        // Re-validate each redirect hop to prevent redirect-to-internal SSRF
        const hopError = await validateUrlForSSRF(nextUrl);
        if (hopError) {
          clearTimeout(timeout);
          return apiError('INVALID_URL', 403, hopError);
        }
        currentUrl = nextUrl;
      }
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

    if (!response!.ok) {
      const errorText = await response!.text().catch(() => '');
      log.error(`Failed to fetch models from ${currentUrl}: ${response!.status} ${errorText}`);
      return apiError('UPSTREAM_ERROR', response!.status, 'Failed to fetch models from provider');
    }

    const data = await response!.json();

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

    return apiSuccess({ models, effectiveBaseUrl: baseUrl });
  } catch (error) {
    log.error('Error listing models:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

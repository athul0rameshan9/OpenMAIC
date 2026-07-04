/**
 * TTS (Text-to-Speech) Provider Implementation
 *
 * Factory pattern for routing TTS requests to appropriate provider implementations.
 *
 * Currently Supported Providers:
 * - Azure TTS: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech
 * - Browser Native: Web Speech API (client-side only)
 *
 * Custom providers using the OpenAI-compatible API format are also supported.
 */

import type { TTSModelConfig } from './types';
import { isCustomTTSProvider } from './types';
import { TTS_PROVIDERS } from './constants';

/**
 * Result of TTS generation
 */
export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
}

/**
 * Thrown when a TTS provider returns a rate-limit / concurrency-quota error.
 * Allows downstream consumers to distinguish rate-limit errors from other TTS failures.
 *
 * TODO: The API route currently catches all errors uniformly as GENERATION_FAILED.
 * This class enables future retry/backoff logic without changing the throw sites.
 */
export class TTSRateLimitError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = 'TTSRateLimitError';
  }
}

/**
 * Map an upstream HTTP 429 to a typed {@link TTSRateLimitError} so the API route
 * can surface it as 429 instead of a generic 500. Call right after an
 * `!response.ok` check, before building the provider-specific error message.
 */
export function throwIfTtsRateLimited(provider: string, status: number): void {
  if (status === 429) {
    throw new TTSRateLimitError(provider, `${provider} TTS rate limit exceeded (HTTP 429)`);
  }
}

/**
 * Generate speech using specified TTS provider
 */
export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const provider = TTS_PROVIDERS[config.providerId as keyof typeof TTS_PROVIDERS];

  // Validate API key if required (only for built-in providers with known config)
  if (provider?.requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for TTS provider: ${config.providerId}`);
  }

  switch (config.providerId) {
    case 'azure-tts':
      return await generateAzureTTS(config, text);

    case 'browser-native-tts':
      throw new Error(
        'Browser Native TTS must be handled client-side using Web Speech API. This provider cannot be used on the server.',
      );

    default:
      if (isCustomTTSProvider(config.providerId)) {
        return await generateOpenAICompatibleTTS(config, text);
      }
      throw new Error(`Unsupported TTS provider: ${config.providerId}`);
  }
}

/**
 * OpenAI-compatible TTS implementation (used for custom providers)
 */
async function generateOpenAICompatibleTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl;
  if (!baseUrl) {
    throw new Error('Base URL is required for custom TTS provider');
  }

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: config.modelId || 'tts-1',
      input: text,
      voice: config.voice,
      speed: config.speed || 1.0,
    }),
  });

  if (!response.ok) {
    throwIfTtsRateLimited('Custom', response.status);
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`TTS API error: ${error.error?.message || response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || '';
  const format = getAudioResponseFormat(contentType);
  return {
    audio: new Uint8Array(arrayBuffer),
    format,
  };
}

/**
 * Azure TTS implementation (direct API call with SSML)
 */
async function generateAzureTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['azure-tts'].defaultBaseUrl;

  // Build SSML
  const rate = config.speed ? `${((config.speed - 1) * 100).toFixed(0)}%` : '0%';
  const ssml = `
    <speak version='1.0' xml:lang='zh-CN'>
      <voice xml:lang='zh-CN' name='${config.voice}'>
        <prosody rate='${rate}'>${escapeXml(text)}</prosody>
      </voice>
    </speak>
  `.trim();

  const response = await fetch(`${baseUrl}/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.apiKey!,
      'Content-Type': 'application/ssml+xml; charset=utf-8',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    },
    body: ssml,
  });

  if (!response.ok) {
    throwIfTtsRateLimited('Azure', response.status);
    throw new Error(`Azure TTS API error: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'mp3',
  };
}

/**
 * Get current TTS configuration from settings store
 * Note: This function should only be called in browser context
 */
export async function getCurrentTTSConfig(): Promise<TTSModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentTTSConfig() can only be called in browser context');
  }

  // Lazy import to avoid circular dependency
  const { useSettingsStore } = await import('@/lib/store/settings');
  const { ttsProviderId, ttsVoice, ttsSpeed, ttsProvidersConfig } = useSettingsStore.getState();

  const providerConfig = ttsProvidersConfig?.[ttsProviderId];

  return {
    providerId: ttsProviderId,
    modelId:
      providerConfig?.modelId ||
      TTS_PROVIDERS[ttsProviderId as keyof typeof TTS_PROVIDERS]?.defaultModelId ||
      '',
    apiKey: providerConfig?.apiKey,
    baseUrl: providerConfig?.baseUrl || providerConfig?.customDefaultBaseUrl,
    voice: ttsVoice,
    speed: ttsSpeed,
  };
}

// Re-export from constants for convenience
export { getAllTTSProviders, getTTSProvider, getTTSVoices } from './constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape XML special characters for SSML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getAudioResponseFormat(contentType: string): string {
  if (contentType.includes('audio/wav') || contentType.includes('audio/x-wav')) return 'wav';
  if (contentType.includes('audio/mpeg') || contentType.includes('audio/mp3')) return 'mp3';
  if (contentType.includes('audio/flac')) return 'flac';
  if (contentType.includes('audio/ogg')) return 'ogg';
  if (contentType.includes('audio/webm')) return 'webm';
  return 'mp3';
}

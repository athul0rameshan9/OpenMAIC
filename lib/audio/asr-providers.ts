/**
 * ASR (Automatic Speech Recognition) Provider Implementation
 *
 * Factory pattern for routing ASR requests to appropriate provider implementations.
 *
 * Currently Supported Providers:
 * - Azure STT (https://learn.microsoft.com/azure/ai-services/speech-service/fast-transcription-create)
 * - Browser Native: Web Speech API (client-side only)
 *
 * Custom providers use an OpenAI-compatible transcription endpoint.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import type { ASRModelConfig } from './types';
import { isCustomASRProvider } from './types';
import { ASR_PROVIDERS } from './constants';

/**
 * Result of ASR transcription
 */
export interface ASRTranscriptionResult {
  text: string;
}

/**
 * Transcribe audio using specified ASR provider
 */
export async function transcribeAudio(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  const provider = ASR_PROVIDERS[config.providerId as keyof typeof ASR_PROVIDERS];

  // Validate API key if required (only for built-in providers with known config)
  if (provider?.requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for ASR provider: ${config.providerId}`);
  }

  switch (config.providerId) {
    case 'browser-native':
      throw new Error('Browser Native ASR must be handled client-side using useBrowserASR hook');

    case 'azure-asr':
      return await transcribeAzureASR(config, audioBuffer);

    default:
      if (isCustomASRProvider(config.providerId)) {
        return await transcribeOpenAICompatibleASR(config, audioBuffer);
      }
      throw new Error(`Unsupported ASR provider: ${config.providerId}`);
  }
}

/**
 * OpenAI-compatible ASR implementation (used for custom providers)
 * Uses Vercel AI SDK's transcribe function.
 */
async function transcribeOpenAICompatibleASR(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  const openai = createOpenAI({
    apiKey: config.apiKey!,
    baseURL: config.baseUrl,
  });

  // Convert to Buffer or Uint8Array (which is required by the AI SDK)
  let audioData: Buffer | Uint8Array;
  if (audioBuffer instanceof Buffer) {
    audioData = audioBuffer;
  } else if (audioBuffer instanceof Blob) {
    const arrayBuffer = await audioBuffer.arrayBuffer();
    audioData = new Uint8Array(arrayBuffer);
  } else {
    throw new Error('Invalid audio buffer type');
  }

  try {
    const result = await transcribe({
      model: openai.transcription(config.modelId || 'whisper-1'),
      audio: audioData,
      providerOptions: {
        openai: {
          language: config.language === 'auto' ? undefined : config.language,
        },
      },
    });

    return { text: result.text || '' };
  } catch (error: unknown) {
    // Short/silent audio may cause the SDK to throw — treat as empty transcription
    const errMsg = error instanceof Error ? error.message : '';
    if (errMsg.includes('empty') || errMsg.includes('too short')) {
      return { text: '' };
    }
    throw error;
  }
}

/**
 * Azure STT implementation (Fast Transcription REST API)
 * https://learn.microsoft.com/azure/ai-services/speech-service/fast-transcription-create
 */
async function transcribeAzureASR(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  const rawBaseUrl = config.baseUrl || ASR_PROVIDERS['azure-asr'].defaultBaseUrl!;

  if (!rawBaseUrl || rawBaseUrl.includes('{region}')) {
    throw new Error('Azure STT base URL must include a real region');
  }

  let endpoint = rawBaseUrl.replace(/\/+$/, '');
  if (/\.stt\.speech\.microsoft\.com$/i.test(endpoint)) {
    endpoint = endpoint.replace(/\.stt\.speech\.microsoft\.com$/i, '.api.cognitive.microsoft.com');
  }
  if (!/\/speechtotext\/transcriptions:transcribe/i.test(endpoint)) {
    endpoint = `${endpoint}/speechtotext/transcriptions:transcribe`;
  }
  const url = new URL(endpoint);
  if (!url.searchParams.get('api-version')) {
    url.searchParams.set('api-version', '2025-10-15');
  }

  let audioBlob: Blob;
  if (audioBuffer instanceof Blob) {
    audioBlob = audioBuffer;
  } else {
    audioBlob = new Blob([audioBuffer as unknown as BlobPart], { type: 'audio/webm' });
  }

  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const localeMap: Record<string, string> = {
    en: 'en-US',
    zh: 'zh-CN',
    ja: 'ja-JP',
    ko: 'ko-KR',
    de: 'de-DE',
    fr: 'fr-FR',
    es: 'es-ES',
    it: 'it-IT',
    pt: 'pt-BR',
    ru: 'ru-RU',
    ar: 'ar-SA',
    hi: 'hi-IN',
  };

  if (config.language && config.language !== 'auto') {
    const locale = localeMap[config.language] || config.language;
    formData.append('definition', JSON.stringify({ locales: [locale] }));
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': config.apiKey! },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Azure STT error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    combinedPhrases?: Array<{ text?: string }>;
    phrases?: Array<{ text?: string }>;
  };

  const combinedText = data.combinedPhrases
    ?.map((p) => p.text || '')
    .filter(Boolean)
    .join(' ');
  const phraseText = data.phrases
    ?.map((p) => p.text || '')
    .filter(Boolean)
    .join(' ');

  return { text: combinedText || phraseText || '' };
}

/**
 * Get current ASR configuration from settings store
 * Note: This function should only be called in browser context
 */
export async function getCurrentASRConfig(): Promise<ASRModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentASRConfig() can only be called in browser context');
  }

  // Lazy import to avoid circular dependency
  const { useSettingsStore } = await import('@/lib/store/settings');
  const { asrProviderId, asrLanguage, asrProvidersConfig } = useSettingsStore.getState();

  const providerConfig = asrProvidersConfig?.[asrProviderId];

  return {
    providerId: asrProviderId,
    modelId:
      providerConfig?.modelId ||
      ASR_PROVIDERS[asrProviderId as keyof typeof ASR_PROVIDERS]?.defaultModelId ||
      '',
    apiKey: providerConfig?.apiKey,
    baseUrl: providerConfig?.baseUrl || providerConfig?.customDefaultBaseUrl,
    language: asrLanguage,
  };
}

// Re-export from constants for convenience
export { getAllASRProviders, getASRProvider, getASRSupportedLanguages } from './constants';

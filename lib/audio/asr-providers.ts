/**
 * ASR (Automatic Speech Recognition) Provider Implementation
 *
 * Factory pattern for routing ASR requests to appropriate provider implementations.
 *
 * Currently Supported Providers:
 * - Groq Whisper (https://console.groq.com/docs/speech-to-text)
 * - Browser Native: Web Speech API (client-side only)
 *
 * Custom providers use an OpenAI-compatible transcription endpoint.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import type { ASRModelConfig } from './types';
import { isCustomASRProvider } from './types';
import { ASR_PROVIDERS } from './constants';
import { getAudioUploadFilename } from './upload-filename';

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

    case 'groq-asr':
      return await transcribeGroqASR(config, audioBuffer);

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

/** Groq's OpenAI-compatible multipart transcription endpoint. */
async function transcribeGroqASR(
  config: ASRModelConfig,
  audioBuffer: Buffer | Blob,
): Promise<ASRTranscriptionResult> {
  const provider = ASR_PROVIDERS['groq-asr'];
  const model = config.modelId || provider.defaultModelId;
  if (!provider.models.some((candidate) => candidate.id === model)) {
    throw new Error(`Unsupported Groq transcription model: ${model}`);
  }

  // The API route supplies a File, retaining the recorder's real container type.
  const audio =
    audioBuffer instanceof Blob
      ? audioBuffer
      : new Blob([new Uint8Array(audioBuffer)], {
          type: audioBuffer.subarray(0, 4).toString() === 'RIFF' ? 'audio/wav' : 'audio/webm',
        });
  if (audio.size === 0) throw new Error('Audio file is empty');
  if (audio.size > 25 * 1024 * 1024) throw new Error('Groq audio uploads must be 25 MB or smaller');

  const formData = new FormData();
  formData.append('file', audio, getAudioUploadFilename(audio));
  formData.append('model', model);
  formData.append('response_format', 'json');
  formData.append('temperature', '0');
  if (config.language && config.language !== 'auto') {
    formData.append('language', config.language.split(/[-_]/)[0].toLowerCase());
  }

  const baseUrl = (config.baseUrl || provider.defaultBaseUrl!).replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) {
    // Do not attach request objects/headers to errors: they contain the API key.
    const error = await response.json().catch(() => null);
    throw new Error(
      `Groq STT error (${response.status}): ${error?.error?.message || response.statusText}`,
    );
  }
  const data = await response.json();
  if (typeof data.text !== 'string') throw new Error('Groq STT returned an invalid transcription');
  return { text: data.text.trim() };
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

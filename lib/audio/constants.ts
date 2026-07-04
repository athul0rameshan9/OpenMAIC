/**
 * Audio Provider Constants
 *
 * Registry of all TTS and ASR providers with their metadata.
 * This file is client-safe and can be imported in both client and server components.
 */

import type {
  BuiltInTTSProviderId,
  TTSProviderId,
  TTSProviderConfig,
  TTSVoiceInfo,
  BuiltInASRProviderId,
  ASRProviderId,
  ASRProviderConfig,
} from './types';

/**
 * Default supported languages for custom OpenAI-compatible ASR providers.
 * A practical subset of commonly used languages + auto-detect.
 */
export const CUSTOM_ASR_DEFAULT_LANGUAGES = [
  'auto',
  'zh',
  'en',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'ru',
  'ar',
  'pt',
  'it',
  'hi',
];

/**
 * TTS Provider Registry
 */
export const TTS_PROVIDERS: Record<BuiltInTTSProviderId, TTSProviderConfig> = {
  'azure-tts': {
    id: 'azure-tts',
    name: 'Azure TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://{region}.tts.speech.microsoft.com',
    icon: '/logos/azure.svg',
    models: [],
    defaultModelId: '',
    voices: [
      { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (女)', language: 'zh-CN', gender: 'female' },
      { id: 'zh-CN-YunxiNeural', name: '云希 (男)', language: 'zh-CN', gender: 'male' },
      { id: 'zh-CN-XiaoyiNeural', name: '晓伊 (女)', language: 'zh-CN', gender: 'female' },
      { id: 'zh-CN-YunjianNeural', name: '云健 (男)', language: 'zh-CN', gender: 'male' },
      { id: 'en-US-JennyNeural', name: 'Jenny', language: 'en-US', gender: 'female' },
      { id: 'en-US-GuyNeural', name: 'Guy', language: 'en-US', gender: 'male' },
    ],
    supportedFormats: ['mp3', 'wav', 'ogg'],
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
  },

  'browser-native-tts': {
    id: 'browser-native-tts',
    name: 'Browser Native (Web Speech API)',
    requiresApiKey: false,
    icon: '/logos/browser.svg',
    models: [],
    defaultModelId: '',
    voices: [
      { id: 'default', name: 'Default', language: 'zh-CN', gender: 'neutral' },
    ],
    supportedFormats: ['browser'],
    speedRange: { min: 0.1, max: 10.0, default: 1.0 },
  },
};

/**
 * ASR Provider Registry
 */
export const ASR_PROVIDERS: Record<BuiltInASRProviderId, ASRProviderConfig> = {
  'azure-asr': {
    id: 'azure-asr',
    name: 'Azure STT',
    requiresApiKey: true,
    defaultBaseUrl: 'https://{region}.api.cognitive.microsoft.com',
    icon: '/logos/azure.svg',
    models: [],
    defaultModelId: '',
    supportedLanguages: [
      'auto',
      'en',
      'zh',
      'ja',
      'ko',
      'de',
      'fr',
      'es',
      'it',
      'pt',
      'ru',
      'ar',
      'hi',
    ],
    supportedFormats: ['wav', 'ogg', 'webm', 'mp3', 'flac', 'm4a'],
  },

  'browser-native': {
    id: 'browser-native',
    name: 'Browser Native ASR (Web Speech API)',
    requiresApiKey: false,
    icon: '/logos/browser.svg',
    models: [],
    defaultModelId: '',
    supportedLanguages: [
      // Chinese variants
      'zh-CN', // Mandarin (Simplified, China)
      'zh-TW', // Mandarin (Traditional, Taiwan)
      'zh-HK', // Cantonese (Hong Kong)
      'yue-Hant-HK', // Cantonese (Traditional)
      // English variants
      'en-US', // English (United States)
      'en-GB', // English (United Kingdom)
      'en-AU', // English (Australia)
      'en-CA', // English (Canada)
      'en-IN', // English (India)
      'en-NZ', // English (New Zealand)
      'en-ZA', // English (South Africa)
      // Japanese & Korean
      'ja-JP', // Japanese (Japan)
      'ko-KR', // Korean (South Korea)
      // European languages
      'de-DE', // German (Germany)
      'fr-FR', // French (France)
      'es-ES', // Spanish (Spain)
      'es-MX', // Spanish (Mexico)
      'es-AR', // Spanish (Argentina)
      'es-CO', // Spanish (Colombia)
      'it-IT', // Italian (Italy)
      'pt-BR', // Portuguese (Brazil)
      'pt-PT', // Portuguese (Portugal)
      'ru-RU', // Russian (Russia)
      'nl-NL', // Dutch (Netherlands)
      'pl-PL', // Polish (Poland)
      'cs-CZ', // Czech (Czech Republic)
      'da-DK', // Danish (Denmark)
      'fi-FI', // Finnish (Finland)
      'sv-SE', // Swedish (Sweden)
      'no-NO', // Norwegian (Norway)
      'tr-TR', // Turkish (Turkey)
      'el-GR', // Greek (Greece)
      'hu-HU', // Hungarian (Hungary)
      'ro-RO', // Romanian (Romania)
      'sk-SK', // Slovak (Slovakia)
      'bg-BG', // Bulgarian (Bulgaria)
      'hr-HR', // Croatian (Croatia)
      'ca-ES', // Catalan (Spain)
      // Middle East & Asia
      'ar-SA', // Arabic (Saudi Arabia)
      'ar-EG', // Arabic (Egypt)
      'he-IL', // Hebrew (Israel)
      'hi-IN', // Hindi (India)
      'th-TH', // Thai (Thailand)
      'vi-VN', // Vietnamese (Vietnam)
      'id-ID', // Indonesian (Indonesia)
      'ms-MY', // Malay (Malaysia)
      'fil-PH', // Filipino (Philippines)
      // Other
      'af-ZA', // Afrikaans (South Africa)
      'uk-UA', // Ukrainian (Ukraine)
    ],
    supportedFormats: ['webm'],
  },
};

/**
 * Default voice for each TTS provider.
 */
export const DEFAULT_TTS_VOICES: Record<BuiltInTTSProviderId, string> = {
  'azure-tts': 'en-US-JennyNeural',
  'browser-native-tts': 'default',
};

export const DEFAULT_TTS_MODELS: Record<BuiltInTTSProviderId, string> = {
  'azure-tts': '',
  'browser-native-tts': '',
};

/**
 * Get all available TTS providers (built-in + custom)
 */
export function getAllTTSProviders(
  customProviders?: Record<string, TTSProviderConfig>,
): TTSProviderConfig[] {
  const builtIn = Object.values(TTS_PROVIDERS);
  const custom = customProviders ? Object.values(customProviders) : [];
  return [...builtIn, ...custom];
}

/**
 * Get TTS provider by ID (checks built-in first, then custom)
 */
export function getTTSProvider(
  providerId: TTSProviderId,
  customProviders?: Record<string, TTSProviderConfig>,
): TTSProviderConfig | undefined {
  if (providerId in TTS_PROVIDERS) {
    return TTS_PROVIDERS[providerId as BuiltInTTSProviderId];
  }
  return customProviders?.[providerId];
}

/**
 * Get voices for a specific TTS provider
 */
export function getTTSVoices(
  providerId: TTSProviderId,
  customProviders?: Record<string, TTSProviderConfig>,
): TTSVoiceInfo[] {
  return getTTSProvider(providerId, customProviders)?.voices || [];
}

/**
 * Get all available ASR providers (built-in + custom)
 */
export function getAllASRProviders(
  customProviders?: Record<string, ASRProviderConfig>,
): ASRProviderConfig[] {
  const builtIn = Object.values(ASR_PROVIDERS);
  const custom = customProviders ? Object.values(customProviders) : [];
  return [...builtIn, ...custom];
}

/**
 * Get ASR provider by ID (checks built-in first, then custom)
 */
export function getASRProvider(
  providerId: ASRProviderId,
  customProviders?: Record<string, ASRProviderConfig>,
): ASRProviderConfig | undefined {
  if (providerId in ASR_PROVIDERS) {
    return ASR_PROVIDERS[providerId as BuiltInASRProviderId];
  }
  return customProviders?.[providerId];
}

/**
 * Get supported languages for a specific ASR provider
 */
export function getASRSupportedLanguages(
  providerId: ASRProviderId,
  customProviders?: Record<string, ASRProviderConfig>,
): string[] {
  return getASRProvider(providerId, customProviders)?.supportedLanguages || [];
}

/**
 * Tests for the unified TTS provider-enablement model (#665).
 *
 * Covers the three layered concerns the model collapses:
 *  - availability (configured) — incl. dropping the registry defaultBaseUrl
 *    so a keyless local provider (Lemonade) is NOT force-shown;
 *  - per-provider user `enabled` flag being honored;
 *  - server/admin force-off taking precedence over the user toggle;
 *  - browser-native being opt-in (default OFF) and a first-class provider.
 */
import { describe, it, expect } from 'vitest';
import {
  isTTSProviderConfigured,
  isTTSProviderEnabled,
  listEnabledTTSProviderIds,
  hasAnyEnabledTTSProvider,
  type TTSEnablementConfig,
} from '@/lib/audio/provider-enablement';

describe('isTTSProviderConfigured', () => {
  it('key-requiring provider needs an API key', () => {
    expect(isTTSProviderConfigured('azure-tts', {})).toBe(false);
    expect(isTTSProviderConfigured('azure-tts', { apiKey: '  ' })).toBe(false);
    expect(isTTSProviderConfigured('azure-tts', { apiKey: 'sk-x' })).toBe(true);
    expect(isTTSProviderConfigured('azure-tts', { isServerConfigured: true })).toBe(true);
  });

  it('browser-native is always configured (runs in-browser)', () => {
    expect(isTTSProviderConfigured('browser-native-tts', undefined)).toBe(true);
    expect(isTTSProviderConfigured('browser-native-tts', {})).toBe(true);
  });

  it('custom provider is configured once it has a credential path or voices', () => {
    expect(isTTSProviderConfigured('custom-tts-foo', {})).toBe(false);
    expect(isTTSProviderConfigured('custom-tts-foo', { apiKey: 'k' })).toBe(true);
    expect(
      isTTSProviderConfigured('custom-tts-foo', { customVoices: [{ id: 'v', name: 'V' }] }),
    ).toBe(true);
  });
});

describe('isTTSProviderEnabled', () => {
  it('honors the per-provider enabled flag (default on)', () => {
    expect(isTTSProviderEnabled('azure-tts', { apiKey: 'k' })).toBe(true);
    expect(isTTSProviderEnabled('azure-tts', { apiKey: 'k', enabled: true })).toBe(true);
    expect(isTTSProviderEnabled('azure-tts', { apiKey: 'k', enabled: false })).toBe(false);
  });

  it('server-disable overrides the user toggle (server precedence)', () => {
    expect(
      isTTSProviderEnabled('azure-tts', { apiKey: 'k', enabled: true, serverDisabled: true }),
    ).toBe(false);
  });

  it('an unconfigured provider is never enabled', () => {
    expect(isTTSProviderEnabled('azure-tts', { enabled: true })).toBe(false);
  });

  it('browser-native is opt-in: default OFF, on only when explicitly enabled', () => {
    expect(isTTSProviderEnabled('browser-native-tts', { enabled: false })).toBe(false);
    expect(isTTSProviderEnabled('browser-native-tts', { enabled: true })).toBe(true);
    // Server can force it off even when the user enabled it.
    expect(
      isTTSProviderEnabled('browser-native-tts', { enabled: true, serverDisabled: true }),
    ).toBe(false);
  });
});

describe('listEnabledTTSProviderIds / hasAnyEnabledTTSProvider', () => {
  const config: Record<string, TTSEnablementConfig> = {
    'azure-tts': { apiKey: 'k', enabled: true },
    'browser-native-tts': { enabled: false }, // opt-in, off
    'custom-tts-foo': { customVoices: [{ id: 'v', name: 'V' }] },
  };

  it('lists only enabled providers in canonical registry order', () => {
    expect(listEnabledTTSProviderIds(config)).toEqual(['azure-tts', 'custom-tts-foo']);
  });

  it('hasAny reflects emptiness', () => {
    expect(hasAnyEnabledTTSProvider(config)).toBe(true);
    expect(hasAnyEnabledTTSProvider({ 'browser-native-tts': { enabled: false } })).toBe(false);
    expect(hasAnyEnabledTTSProvider({ 'browser-native-tts': { enabled: true } })).toBe(true);
  });
});

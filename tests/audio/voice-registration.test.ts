import { describe, it, expect } from 'vitest';
import {
  getVoiceRegistrationAdapter,
  supportsVoiceRegistration,
} from '@/lib/audio/voice-registration';

describe('voice-registration provider dispatch', () => {
  it('returns undefined for providers without an adapter', () => {
    expect(getVoiceRegistrationAdapter('azure-tts')).toBeUndefined();
    expect(supportsVoiceRegistration('azure-tts')).toBe(false);
  });

  it('returns undefined for browser-native-tts', () => {
    expect(getVoiceRegistrationAdapter('browser-native-tts')).toBeUndefined();
    expect(supportsVoiceRegistration('browser-native-tts')).toBe(false);
  });
});

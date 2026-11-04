import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@/lib/types/stage';
import type { AudioPlayer } from '@/lib/utils/audio-player';
import type { ActionEngine } from '@/lib/action/engine';

const mocks = vi.hoisted(() => ({
  settings: {
    ttsEnabled: true,
    ttsProviderId: 'groq-tts',
    ttsProvidersConfig: { 'browser-native-tts': { enabled: true, serverDisabled: false } },
  },
}));
vi.mock('@/lib/store/settings', () => ({ useSettingsStore: { getState: () => mocks.settings } }));
vi.mock('@/lib/action/engine', () => ({ ActionEngine: class {} }));
vi.mock('@/lib/store/canvas', () => ({ useCanvasStore: {} }));
import { PlaybackEngine } from '@/lib/playback/engine';

const speak = vi.fn();
let engine: PlaybackEngine;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.settings.ttsEnabled = true;
  mocks.settings.ttsProvidersConfig['browser-native-tts'] = {
    enabled: true,
    serverDisabled: false,
  };
  vi.stubGlobal('window', {
    speechSynthesis: {
      speak,
      cancel: vi.fn(),
      getVoices: () => [{ voiceURI: 'browser', lang: 'en-US' }],
    },
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  );
});
afterEach(() => {
  engine?.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function start(play: () => Promise<boolean>) {
  const scene = {
    id: 'scene',
    actions: [
      {
        id: 'a',
        type: 'speech',
        text: 'Hello classroom',
        audioId: 'tts_a',
        audioUrl: 'https://audio.wav',
      },
    ],
  } as Scene;
  engine = new PlaybackEngine(
    [scene],
    { clearEffects: vi.fn() } as unknown as ActionEngine,
    { play, onEnded: vi.fn(), stop: vi.fn() } as unknown as AudioPlayer,
  );
  engine.start();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
describe('browser narration fallback', () => {
  it.each(['missing', 'failed'])(
    'speaks when saved audio is %s and browser speech is enabled, even with Groq selected',
    async (outcome) => {
      await start(() =>
        outcome === 'missing' ? Promise.resolve(false) : Promise.reject(new Error('Audio failed')),
      );
      expect(speak).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['global', 'browser', 'admin'])(
    'does not synthesize when %s settings disable speech',
    async (disabled) => {
      if (disabled === 'global') mocks.settings.ttsEnabled = false;
      if (disabled === 'browser')
        mocks.settings.ttsProvidersConfig['browser-native-tts'].enabled = false;
      if (disabled === 'admin')
        mocks.settings.ttsProvidersConfig['browser-native-tts'].serverDisabled = true;
      await start(() => Promise.resolve(false));
      expect(speak).not.toHaveBeenCalled();
    },
  );
  it('does not synthesize when saved audio plays successfully', async () => {
    await start(() => Promise.resolve(true));
    expect(speak).not.toHaveBeenCalled();
  });
});

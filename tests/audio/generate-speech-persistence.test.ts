import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ put: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/utils/database', () => ({ db: { audioFiles: { put: mocks.put } } }));
vi.mock('@/lib/store/stage', () => ({
  useStageStore: { getState: () => ({ stage: { id: 'class' } }) },
}));
vi.mock('@/lib/store/settings', () => ({
  useSettingsStore: {
    getState: () => ({
      ttsProviderId: 'groq-tts',
      ttsVoice: 'troy',
      ttsSpeed: 1,
      ttsProvidersConfig: { 'groq-tts': { isServerConfigured: true } },
    }),
  },
}));
vi.mock('@/lib/audio/agent-voice', () => ({
  pickNarratorAgent: () => undefined,
  resolveAgentVoiceOptions: async () => undefined,
}));
vi.mock('@/lib/orchestration/registry/store', () => ({
  useAgentRegistry: { getState: () => ({ listAgents: () => [] }) },
}));
vi.mock('@/lib/media/media-orchestrator', () => ({ generateMediaForOutlines: vi.fn() }));
vi.mock('@/lib/utils/model-config', () => ({ getCurrentModelConfig: vi.fn() }));
vi.mock('@/lib/edit/regen-lock', () => ({ isSceneEditLocked: vi.fn() }));

import { generateAndStoreTTS } from '@/lib/hooks/use-scene-generator';
const payload = {
  success: true,
  base64: 'AQI=',
  format: 'wav',
  audioUrl: 'https://storage/audio.wav',
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify(payload)));
  mocks.put.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('browser generation durability', () => {
  it('sends the classroom ID and returns the durable audio reference', async () => {
    await expect(generateAndStoreTTS('tts_a', 'Hello')).resolves.toBe(payload.audioUrl);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      classroomId: 'class',
      audioId: 'tts_a',
    });
    expect(mocks.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tts_a', blob: expect.any(Blob) }),
    );
  });
  it('retains durable playback when the browser cache is unavailable', async () => {
    mocks.put.mockRejectedValue(new Error('QuotaExceededError'));
    await expect(generateAndStoreTTS('tts_a', 'Hello')).resolves.toBe(payload.audioUrl);
  });
  it('rejects a browser-only success without a durable URL', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ ...payload, audioUrl: undefined })),
    );
    await expect(generateAndStoreTTS('tts_a', 'Hello')).rejects.toThrow();
    expect(mocks.put).not.toHaveBeenCalled();
  });
});

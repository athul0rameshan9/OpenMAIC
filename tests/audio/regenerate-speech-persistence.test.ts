import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  persist: vi.fn(),
  getState: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/hooks/use-scene-generator', () => ({ generateAndStoreTTS: mocks.generate }));
vi.mock('@/lib/utils/classroom-persistence', () => ({ persistClassroomToServer: mocks.persist }));
vi.mock('@/lib/store/stage', () => ({ useStageStore: { getState: mocks.getState } }));
vi.mock('@/lib/store/settings', () => ({
  useSettingsStore: { getState: () => ({ ttsEnabled: true, ttsProviderId: 'groq-tts' }) },
}));
vi.mock('@/lib/utils/database', () => ({ db: {} }));
import { regenerateSpeechAudio } from '@/lib/audio/regenerate-speech-tts';

let state: {
  stage: Stage;
  scenes: Scene[];
  updateScene: typeof mocks.update;
  saveToStorage: typeof mocks.save;
};
beforeEach(() => {
  vi.resetAllMocks();
  state = {
    stage: { id: 'class' } as Stage,
    scenes: [
      { id: 'scene', order: 1, actions: [{ id: 'a', type: 'speech', text: 'Hello' }] } as Scene,
    ],
    updateScene: mocks.update,
    saveToStorage: mocks.save,
  };
  mocks.getState.mockImplementation(() => state);
  mocks.update.mockImplementation((id, updates) => {
    state.scenes = state.scenes.map((scene) =>
      scene.id === id ? { ...scene, ...updates } : scene,
    );
  });
  mocks.generate.mockResolvedValue('https://storage/new.wav');
  mocks.save.mockResolvedValue(true);
  mocks.persist.mockResolvedValue(undefined);
});
describe('regenerated speech durability', () => {
  it('stamps and persists the returned durable URL, not just the browser audio key', async () => {
    await expect(regenerateSpeechAudio(1, { id: 'a', text: 'Hello' }, 'English')).resolves.toBe(
      'tts_s1_a',
    );
    expect(mocks.generate).toHaveBeenCalledWith('tts_s1_a', 'Hello', 'English', undefined, 'class');
    expect(state.scenes[0].actions![0]).toMatchObject({
      audioId: 'tts_s1_a',
      audioUrl: 'https://storage/new.wav',
    });
    expect(mocks.save).toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledWith(state.stage, state.scenes);
  });
  it('does not attach a late generation result after the speech text changes', async () => {
    mocks.generate.mockImplementation(async () => {
      state.scenes[0] = {
        ...state.scenes[0],
        actions: [{ id: 'a', type: 'speech', text: 'Edited' }],
      };
      return 'https://storage/obsolete.wav';
    });
    await expect(regenerateSpeechAudio(1, { id: 'a', text: 'Hello' })).rejects.toThrow(
      'Speech changed',
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('surfaces remote save failure while retaining the URL for a retry', async () => {
    mocks.persist.mockRejectedValue(new Error('Server save unavailable'));
    await expect(regenerateSpeechAudio(1, { id: 'a', text: 'Hello' })).rejects.toThrow(
      'Server save unavailable',
    );
    expect(state.scenes[0].actions![0]).toMatchObject({ audioUrl: 'https://storage/new.wav' });
  });
});

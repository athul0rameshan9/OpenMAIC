import { describe, expect, it } from 'vitest';
import { mergeSpeechAudioRefs } from '@/lib/audio/speech-audio-refs';
import type { Scene } from '@/lib/types/stage';

function scene(actions: unknown[], extras = {}): Scene {
  return { id: 'scene', title: 'Local title', actions, ...extras } as Scene;
}

describe('merging repaired speech audio', () => {
  it('fills missing refs for the same scene, action and exact text while keeping edits', () => {
    const local = [scene([{ id: 'a', type: 'speech', text: 'Hello', audioId: 'old' }])];
    const remote = [
      scene(
        [
          {
            id: 'a',
            type: 'speech',
            text: 'Hello',
            audioId: 'new',
            audioUrl: 'https://audio/new.wav',
          },
        ],
        { title: 'Remote title' },
      ),
    ];
    const merged = mergeSpeechAudioRefs(local, remote);
    expect(merged[0].title).toBe('Local title');
    expect(merged[0].actions![0]).toMatchObject({
      audioId: 'new',
      audioUrl: 'https://audio/new.wav',
    });
    expect(local[0].actions![0]).not.toHaveProperty('audioUrl');
  });

  it('never reattaches old audio to edited text or resurrects deleted actions', () => {
    const local = [scene([{ id: 'a', type: 'speech', text: 'Edited' }])];
    const remote = [
      scene([
        { id: 'a', type: 'speech', text: 'Original', audioUrl: 'https://old.wav' },
        { id: 'deleted', type: 'speech', text: 'Removed', audioUrl: 'https://removed.wav' },
      ]),
    ];
    expect(mergeSpeechAudioRefs(local, remote)).toBe(local);
  });

  it('preserves existing local audio and ignores other scene IDs', () => {
    const local = [
      scene([{ id: 'a', type: 'speech', text: 'Hello', audioUrl: 'https://local.wav' }]),
    ];
    const remote = [
      scene([{ id: 'a', type: 'speech', text: 'Hello', audioUrl: 'https://remote.wav' }]),
    ];
    expect(mergeSpeechAudioRefs(local, remote)).toBe(local);
    expect(
      mergeSpeechAudioRefs(
        [scene([{ id: 'a', type: 'speech', text: 'Hello' }])],
        [scene(remote[0].actions ?? [], { id: 'other' })],
      )[0].actions![0],
    ).not.toHaveProperty('audioUrl');
  });
});

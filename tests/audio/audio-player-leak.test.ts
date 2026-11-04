import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the IndexedDB layer so importing AudioPlayer doesn't pull in Dexie.
const getMock = vi.fn();
vi.mock('@/lib/utils/database', () => ({
  db: { audioFiles: { get: getMock } },
}));

/** Stub URL.createObjectURL/revokeObjectURL while keeping `new URL(...)` working. */
function stubObjectUrl() {
  const createObjectURL = vi.fn(() => 'blob:fake-url');
  const revokeObjectURL = vi.fn();
  class URLStub extends URL {}
  Object.assign(URLStub, { createObjectURL, revokeObjectURL });
  vi.stubGlobal('URL', URLStub);
  return { createObjectURL, revokeObjectURL };
}

function stubAudio(play: () => Promise<void>) {
  class AudioStub {
    play = play;
    addEventListener = vi.fn();
    pause = vi.fn();
    volume = 1;
    defaultPlaybackRate = 1;
    playbackRate = 1;
    src = '';
    currentTime = 0;
  }
  vi.stubGlobal('Audio', AudioStub);
}

describe('AudioPlayer blob URL lifecycle', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    getMock.mockReset();
    getMock.mockResolvedValue({ blob: new Blob(['audio']) });
  });

  it('revokes the blob URL when play() rejects (no leak)', async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrl();
    stubAudio(() => Promise.reject(new Error('NotAllowedError')));

    const { AudioPlayer } = await import('@/lib/utils/audio-player');

    await expect(new AudioPlayer().play('audio-1')).rejects.toThrow();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('does not revoke during a successful play() (revocation is deferred to "ended")', async () => {
    const { revokeObjectURL } = stubObjectUrl();
    stubAudio(() => Promise.resolve());

    const { AudioPlayer } = await import('@/lib/utils/audio-player');

    await expect(new AudioPlayer().play('audio-1')).resolves.toBe(true);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('falls back to a cached blob when the durable URL cannot play', async () => {
    const { createObjectURL } = stubObjectUrl();
    const play = vi.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce(undefined);
    stubAudio(play);
    const { AudioPlayer } = await import('@/lib/utils/audio-player');
    await expect(new AudioPlayer().play('audio-1', 'https://missing.wav')).resolves.toBe(true);
    expect(getMock).toHaveBeenCalledWith('audio-1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('returns false when both the durable URL and cache are unavailable', async () => {
    stubObjectUrl();
    stubAudio(() => Promise.reject(new Error('404')));
    getMock.mockResolvedValue(undefined);
    const { AudioPlayer } = await import('@/lib/utils/audio-player');
    await expect(new AudioPlayer().play('audio-1', 'https://missing.wav')).resolves.toBe(false);
  });

  it('releases a cached blob URL when playback is stopped', async () => {
    const { revokeObjectURL } = stubObjectUrl();
    stubAudio(() => Promise.resolve());
    const { AudioPlayer } = await import('@/lib/utils/audio-player');
    const player = new AudioPlayer();
    await player.play('audio-1');
    player.stop();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('does not start cached fallback after stop interrupts a remote load', async () => {
    stubObjectUrl();
    let reject!: (reason: Error) => void;
    stubAudio(
      () =>
        new Promise<void>((_resolve, rejectPlay) => {
          reject = rejectPlay;
        }),
    );
    const { AudioPlayer } = await import('@/lib/utils/audio-player');
    const player = new AudioPlayer();
    const pending = player.play('audio-1', 'https://slow.wav');
    player.stop();
    reject(new Error('Interrupted'));
    // A cancelled request counts as handled, so the engine won't speak its old text either.
    await expect(pending).resolves.toBe(true);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('handles a cancelled cache lookup rejection without triggering obsolete browser speech', async () => {
    stubObjectUrl();
    let reject!: (reason: Error) => void;
    getMock.mockReturnValue(
      new Promise((_resolve, rejectLookup) => {
        reject = rejectLookup;
      }),
    );
    const { AudioPlayer } = await import('@/lib/utils/audio-player');
    const player = new AudioPlayer();
    const pending = player.play('old-audio');
    player.stop();
    reject(new Error('IndexedDB unavailable'));
    await expect(pending).resolves.toBe(true);
  });
});

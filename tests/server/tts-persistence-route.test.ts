import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generate: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/audio/tts-providers', () => ({
  generateTTS: mocks.generate,
  TTSRateLimitError: class extends Error {},
}));
vi.mock('@/lib/server/classroom-storage', () => ({
  uploadClassroomMedia: mocks.upload,
  isValidClassroomId: (id: string) => /^[a-zA-Z0-9_-]+$/.test(id),
}));
vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: () => true,
  isServerTTSProviderDisabled: () => false,
  resolveTTSApiKey: () => 'mock-key',
  resolveTTSBaseUrl: () => undefined,
  resolveTTSModel: () => 'mock-model',
}));
import { POST } from '@/app/api/generate/tts/route';

function request(overrides = {}) {
  return new NextRequest('http://localhost/api/generate/tts', {
    method: 'POST',
    body: JSON.stringify({
      text: 'Hello',
      audioId: 'tts_a',
      classroomId: 'class1',
      ttsProviderId: 'groq-tts',
      ttsVoice: 'troy',
      ...overrides,
    }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.generate.mockResolvedValue({ audio: new Uint8Array([1, 2]).buffer, format: 'wav' });
  mocks.upload.mockResolvedValue('https://storage/audio.wav');
});
describe('durable classroom speech generation', () => {
  it('returns the uploaded versioned audio URL on success', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      audioUrl: 'https://storage/audio.wav',
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      'class1',
      expect.stringMatching(/^audio\/tts_a_[a-f0-9]{16}\.wav$/),
      expect.any(Buffer),
      'audio/wav',
    );
  });
  it('does not claim success if storage fails', async () => {
    mocks.upload.mockRejectedValue(new Error('Storage unavailable'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, error: 'Storage unavailable' });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it.each([{ classroomId: '../bad' }, { audioId: '../bad' }, { classroomId: 42 }])(
    'validates storage paths before paid synthesis: %j',
    async (overrides) => {
      expect((await POST(request(overrides))).status).toBe(400);
      expect(mocks.generate).not.toHaveBeenCalled();
    },
  );
  it('uses different file paths for different generated audio so concurrent edits cannot overwrite each other', async () => {
    await POST(request());
    mocks.generate.mockResolvedValueOnce({ audio: new Uint8Array([3, 4]).buffer, format: 'wav' });
    await POST(request({ text: 'Changed line' }));
    expect(mocks.upload.mock.calls[0][1]).not.toBe(mocks.upload.mock.calls[1][1]);
  });
});

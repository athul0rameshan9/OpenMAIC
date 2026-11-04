import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transcribe: vi.fn(),
  resolveKey: vi.fn(() => 'server-groq-key'),
  resolveUrl: vi.fn(() => undefined),
  managed: vi.fn(() => true),
}));

vi.mock('@/lib/audio/asr-providers', () => ({ transcribeAudio: mocks.transcribe }));
vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: mocks.managed,
  resolveASRApiKey: mocks.resolveKey,
  resolveASRBaseUrl: mocks.resolveUrl,
}));

import { POST } from '@/app/api/transcription/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transcribe.mockResolvedValue({ text: 'Hello classroom.' });
});
afterEach(() => vi.unstubAllGlobals());

describe('transcription API', () => {
  it('defaults to Groq and uses only server-managed credentials and endpoint', async () => {
    const form = new FormData();
    form.append('audio', new Blob(['audio'], { type: 'audio/wav' }), 'sample.wav');
    form.append('apiKey', 'untrusted-client-key');
    form.append('baseUrl', 'https://untrusted.example');
    const response = await POST(
      new NextRequest('http://localhost/api/transcription', {
        method: 'POST',
        body: form,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, text: 'Hello classroom.' });
    expect(mocks.managed).toHaveBeenCalledWith('asr', 'groq-asr');
    expect(mocks.resolveKey).toHaveBeenCalledWith('groq-asr', undefined);
    expect(mocks.resolveUrl).toHaveBeenCalledWith('groq-asr', undefined);
    const [config, audio] = mocks.transcribe.mock.calls[0];
    expect(config).toMatchObject({
      providerId: 'groq-asr',
      apiKey: 'server-groq-key',
      language: 'auto',
    });
    expect(audio.name).toBe('sample.wav');
    expect(audio.type).toBe('audio/wav');
  });

  it.each([undefined, 'not-an-audio-file'])(
    'rejects missing or non-file audio (%s)',
    async (audio) => {
      const form = new FormData();
      if (audio) form.append('audio', audio);
      const response = await POST(
        new NextRequest('http://localhost/api/transcription', {
          method: 'POST',
          body: form,
        }),
      );
      expect(response.status).toBe(400);
      expect(mocks.transcribe).not.toHaveBeenCalled();
    },
  );
});

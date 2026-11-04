import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transcribeAudio } from '@/lib/audio/asr-providers';

const mockFetch = vi.fn();
const config = { providerId: 'groq-asr' as const, apiKey: 'test-groq-key' };

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('Groq speech recognition', () => {
  it.each([
    ['audio/wav', 'wav'],
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/mp4', 'm4a'],
    ['audio/ogg', 'ogg'],
  ])(
    'uploads %s with the correct container and automatic language detection',
    async (mime, ext) => {
      mockFetch.mockResolvedValue(Response.json({ text: '  Hello classroom.  ' }));
      const audio = new Blob(['audio-fixture'], { type: mime });
      await expect(transcribeAudio({ ...config, language: 'auto' }, audio)).resolves.toEqual({
        text: 'Hello classroom.',
      });

      const [url, request] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
      expect(request.headers).toEqual({ Authorization: 'Bearer test-groq-key' });
      const form = request.body as FormData;
      expect(form.get('model')).toBe('whisper-large-v3-turbo');
      expect(form.get('response_format')).toBe('json');
      expect(form.get('temperature')).toBe('0');
      expect(form.has('language')).toBe(false);
      const file = form.get('file') as File;
      expect(file.name).toBe(`recording.${ext}`);
      expect(file.type).toBe(mime);
      expect(await file.text()).toBe('audio-fixture');
    },
  );

  it('supports the accuracy model, ISO language codes, and configured endpoints', async () => {
    mockFetch.mockResolvedValue(Response.json({ text: 'Hello.' }));
    await transcribeAudio(
      {
        ...config,
        modelId: 'whisper-large-v3',
        baseUrl: 'https://groq-proxy.example/v1/',
        language: 'en-US',
      },
      new Blob(['audio']),
    );
    const [url, request] = mockFetch.mock.calls[0];
    expect(url).toBe('https://groq-proxy.example/v1/audio/transcriptions');
    expect(request.body.get('language')).toBe('en');
    expect(request.body.get('model')).toBe('whisper-large-v3');
  });

  it('keeps the extension on files whose MIME type is unavailable', async () => {
    mockFetch.mockResolvedValue(Response.json({ text: '' }));
    await transcribeAudio(config, new File(['audio'], 'sample.FLAC'));
    expect(mockFetch.mock.calls[0][1].body.get('file').name).toBe('recording.flac');
  });

  it('rejects missing credentials, empty/oversized audio, and unsupported models before upload', async () => {
    await expect(transcribeAudio({ providerId: 'groq-asr' }, new Blob(['x']))).rejects.toThrow(
      'API key required',
    );
    await expect(transcribeAudio(config, new Blob())).rejects.toThrow('empty');
    await expect(
      transcribeAudio(config, new Blob([new Uint8Array(25 * 1024 * 1024 + 1)])),
    ).rejects.toThrow('25 MB');
    await expect(
      transcribeAudio({ ...config, modelId: 'whisper-1' }, new Blob(['x'])),
    ).rejects.toThrow('Unsupported Groq transcription model');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([401, 429, 503])(
    'surfaces upstream HTTP %i without including credentials',
    async (status) => {
      mockFetch.mockResolvedValue(
        Response.json({ error: { message: 'Request rejected' } }, { status }),
      );
      await expect(transcribeAudio(config, new Blob(['audio']))).rejects.toThrow(
        `Groq STT error (${status}): Request rejected`,
      );
    },
  );

  it('rejects malformed success responses', async () => {
    mockFetch.mockResolvedValue(Response.json({ unexpected: 'value' }));
    await expect(transcribeAudio(config, new Blob(['audio']))).rejects.toThrow(
      'invalid transcription',
    );
  });
});

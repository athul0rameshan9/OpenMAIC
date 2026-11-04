import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTTS, TTSRateLimitError } from '@/lib/audio/tts-providers';
import { splitLongSpeechText } from '@/lib/audio/tts-utils';
import { concatenateWavAudio } from '@/lib/audio/wav-concat';

function wav(samples: number[], streaming = false, sampleRate = 24000): Buffer {
  // Include a LIST metadata chunk, as Groq's streaming WAV responses do.
  const output = Buffer.alloc(56 + samples.length * 2);
  output.write('RIFF', 0);
  output.writeUInt32LE(streaming ? 0xffffffff : output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('LIST', 36);
  output.writeUInt32LE(4, 40);
  output.write('INFO', 44);
  output.write('data', 48);
  output.writeUInt32LE(streaming ? 0xffffffff : samples.length * 2, 52);
  samples.forEach((sample, index) => output.writeInt16LE(sample, 56 + index * 2));
  return output;
}

const mockFetch = vi.fn();
const config = { providerId: 'groq-tts' as const, apiKey: 'test-groq-key', voice: 'troy' };
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('Groq voice generation', () => {
  it('uses Orpheus and WAV without unsupported speed fields and fixes streaming WAV headers', async () => {
    mockFetch.mockResolvedValue(new Response(new Uint8Array(wav([100, -100], true))));
    const result = await generateTTS({ ...config, speed: 1.5 }, 'Welcome to class.');
    const [url, request] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/speech');
    expect(JSON.parse(request.body)).toEqual({
      model: 'canopylabs/orpheus-v1-english',
      input: 'Welcome to class.',
      voice: 'troy',
      response_format: 'wav',
    });
    expect(result.format).toBe('wav');
    const output = Buffer.from(result.audio);
    expect(output.readUInt32LE(4)).toBe(output.length - 8);
    expect(output.readUInt32LE(40)).toBe(4);
    expect(output.readInt16LE(44)).toBe(100);
    expect(output.readInt16LE(46)).toBe(-100);
  });

  it('splits long narration and joins the samples into one valid WAV', async () => {
    const text = 'The classroom is ready for another lesson about science and discovery. '
      .repeat(5)
      .trim();
    mockFetch.mockImplementation(async () => new Response(new Uint8Array(wav([100, 200], true))));
    const result = await generateTTS(config, text);
    const inputs = mockFetch.mock.calls.map(([, req]) => JSON.parse(req.body).input as string);
    expect(inputs.length).toBeGreaterThan(1);
    expect(inputs.every((input) => input.length <= 200)).toBe(true);
    expect(inputs.join(' ')).toBe(text);
    const output = Buffer.from(result.audio);
    expect(output.length).toBe(44 + inputs.length * 4);
    expect(output.readUInt32LE(40)).toBe(inputs.length * 4);
  });

  it('surfaces terms requirements and preserves typed rate limits', async () => {
    mockFetch.mockResolvedValueOnce(
      Response.json({ error: { code: 'model_terms_required' } }, { status: 400 }),
    );
    await expect(generateTTS(config, 'Hello.')).rejects.toThrow('Accept the Orpheus model terms');
    mockFetch.mockResolvedValueOnce(Response.json({}, { status: 429 }));
    await expect(generateTTS(config, 'Hello.')).rejects.toBeInstanceOf(TTSRateLimitError);
  });

  it('rejects invalid models, voices, and empty text before sending requests', async () => {
    await expect(generateTTS({ ...config, modelId: 'tts-1' }, 'Hello')).rejects.toThrow(
      'Unsupported Groq speech model',
    );
    await expect(generateTTS({ ...config, voice: 'en-US-JennyNeural' }, 'Hello')).rejects.toThrow(
      'Unsupported Groq voice',
    );
    await expect(generateTTS(config, ' ')).rejects.toThrow('empty');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('WAV joining', () => {
  it('rejects malformed/truncated WAV responses and mismatched sample rates', () => {
    expect(() => concatenateWavAudio([new Uint8Array([1, 2])])).toThrow('invalid WAV');
    const truncated = wav([1]);
    truncated.writeUInt32LE(100, 52);
    expect(() => concatenateWavAudio([truncated])).toThrow('truncated WAV');
    expect(() => concatenateWavAudio([wav([1]), wav([2], false, 16000)])).toThrow(
      'incompatible WAV',
    );
  });
});

describe('Groq narration splitting', () => {
  it('preserves words and stays within the API limit', () => {
    const text = 'We will explore the planets in our solar system. '.repeat(20).trim();
    const chunks = splitLongSpeechText(text, 200);
    expect(chunks.every((chunk) => chunk.length <= 200)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
  });

  it('handles unbroken tokens and emoji without broken surrogate pairs', () => {
    const text = 'x'.repeat(199) + '😀' + 'y'.repeat(200);
    const chunks = splitLongSpeechText(text, 200);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((chunk) => chunk.length <= 200 && chunk.isWellFormed())).toBe(true);
  });
});

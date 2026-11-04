/** Join complete PCM WAV responses by rebuilding their container, not appending headers. */
export function concatenateWavAudio(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 0) throw new Error('No WAV audio to combine');
  const decoded = parts.map((part) => {
    const bytes = Buffer.from(part);
    if (
      bytes.length < 12 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      throw new Error('Groq TTS returned invalid WAV audio');
    }
    let format: Buffer | undefined;
    const samples: Buffer[] = [];
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const id = bytes.toString('ascii', offset, offset + 4);
      const declaredSize = bytes.readUInt32LE(offset + 4);
      const start = offset + 8;
      // Groq streams WAV with unknown RIFF/data lengths (0xffffffff).
      const size =
        id === 'data' && declaredSize === 0xffffffff ? bytes.length - start : declaredSize;
      if (start + size > bytes.length) throw new Error('Groq TTS returned truncated WAV audio');
      if (id === 'fmt ') format = bytes.subarray(start, start + size);
      if (id === 'data') samples.push(bytes.subarray(start, start + size));
      offset = start + size + (size % 2);
    }
    if (!format || format.length < 16 || format.readUInt16LE(0) !== 1 || samples.length === 0) {
      throw new Error('Groq TTS must return PCM WAV audio');
    }
    return { format, samples: Buffer.concat(samples) };
  });
  const format = decoded[0].format;
  if (decoded.some((part) => !part.format.equals(format))) {
    throw new Error('Groq TTS returned incompatible WAV formats');
  }
  const samples = Buffer.concat(decoded.map((part) => part.samples));
  const dataOffset = 20 + format.length + (format.length % 2);
  const output = Buffer.alloc(dataOffset + 8 + samples.length + (samples.length % 2));
  output.write('RIFF', 0);
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(format.length, 16);
  format.copy(output, 20);
  output.write('data', dataOffset);
  output.writeUInt32LE(samples.length, dataOffset + 4);
  samples.copy(output, dataOffset + 8);
  return output;
}

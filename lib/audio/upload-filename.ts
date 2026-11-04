/** Keep browser recording filenames consistent with their actual audio container. */
export function getAudioUploadFilename(audio: Blob): string {
  const mime = audio.type.split(';')[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/webm': 'webm',
    'video/webm': 'webm',
    'audio/ogg': 'ogg',
    'application/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
  };
  const extension = extensions[mime];
  if (extension) return `recording.${extension}`;
  if (audio instanceof File && /\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|wav|webm)$/i.test(audio.name)) {
    return `recording.${audio.name.split('.').pop()!.toLowerCase()}`;
  }
  return 'recording.webm';
}

/**
 * Shared TTS utilities used by both client-side and server-side generation.
 */

import type { TTSProviderId } from './types';
import type { Action, SpeechAction } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';

const log = createLogger('TTS');

/** Provider-specific max text length limits. */
export const TTS_MAX_TEXT_LENGTH: Partial<Record<TTSProviderId, number>> = { 'groq-tts': 200 };

/**
 * Split long text into chunks that respect sentence boundaries.
 * Tries sentence boundaries first, then word boundaries, and finally
 * hard-splits long tokens without breaking Unicode surrogate pairs.
 */
export function splitLongSpeechText(text: string, maxLength: number): string[] {
  if (!Number.isInteger(maxLength) || maxLength < 2)
    throw new Error('Text limit must be at least 2');
  const normalized = text.trim();
  if (!normalized || normalized.length <= maxLength) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxLength) {
    const prefix = remaining.slice(0, maxLength);
    // Prefer complete sentences, then words, then a hard boundary for long tokens.
    const sentenceEnds = [...prefix.matchAll(/[。！？!?；;:\n]|\.(?=\s)/gu)];
    const sentenceEnd = sentenceEnds.at(-1)?.index;
    const wordEnd = prefix.lastIndexOf(' ');
    let end =
      sentenceEnd !== undefined && sentenceEnd >= maxLength / 2
        ? sentenceEnd + 1
        : wordEnd > 0
          ? wordEnd
          : maxLength;
    // Never split a surrogate pair (e.g. an emoji) between requests.
    const lastCodeUnit = remaining.charCodeAt(end - 1);
    if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end--;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Split long speech actions into multiple shorter actions so each stays
 * within the TTS provider's text length limit. Each sub-action gets its
 * own independent audio file — no byte concatenation needed.
 */
export function splitLongSpeechActions(actions: Action[], providerId: TTSProviderId): Action[] {
  const maxLength = TTS_MAX_TEXT_LENGTH[providerId];
  if (!maxLength) return actions;

  let didSplit = false;
  const nextActions: Action[] = actions.flatMap((action) => {
    if (action.type !== 'speech' || !action.text || action.text.length <= maxLength)
      return [action];

    const chunks = splitLongSpeechText(action.text, maxLength);
    if (chunks.length <= 1) return [action];
    didSplit = true;
    const { audioId: _audioId, ...baseAction } = action as SpeechAction;

    log.info(
      `Split speech for ${providerId}: action=${action.id}, len=${action.text.length}, chunks=${chunks.length}`,
    );
    return chunks.map((chunk, i) => ({
      ...baseAction,
      id: `${action.id}_tts_${i + 1}`,
      text: chunk,
    }));
  });
  return didSplit ? nextActions : actions;
}

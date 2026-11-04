/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and returns base64-encoded audio.
 * Called by the client in parallel for each speech action after a scene is generated.
 *
 * POST /api/generate/tts
 */

import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { generateTTS, TTSRateLimitError } from '@/lib/audio/tts-providers';
import {
  isServerConfiguredProvider,
  isServerTTSProviderDisabled,
  resolveTTSApiKey,
  resolveTTSBaseUrl,
  resolveTTSModel,
} from '@/lib/server/provider-config';
import type { TTSProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { uploadClassroomMedia, isValidClassroomId } from '@/lib/server/classroom-storage';

const log = createLogger('TTS API');

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let ttsProviderId: string | undefined;
  let ttsVoice: string | undefined;
  let audioId: string | undefined;
  try {
    const body = await req.json();
    const { text, ttsModelId, ttsSpeed, ttsApiKey, ttsBaseUrl, ttsProviderOptions, classroomId } =
      body as {
        text: string;
        audioId: string;
        ttsProviderId: TTSProviderId;
        ttsModelId?: string;
        ttsVoice: string;
        ttsSpeed?: number;
        ttsApiKey?: string;
        ttsBaseUrl?: string;
        ttsProviderOptions?: Record<string, unknown>;
        classroomId?: string;
      };
    ttsProviderId = body.ttsProviderId;
    ttsVoice = body.ttsVoice;
    audioId = body.audioId;

    // Validate required fields
    if (!text || !audioId || !ttsProviderId || !ttsVoice) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: text, audioId, ttsProviderId, ttsVoice',
      );
    }

    if (
      (classroomId !== undefined &&
        (typeof classroomId !== 'string' || !isValidClassroomId(classroomId))) ||
      typeof audioId !== 'string' ||
      !/^[a-zA-Z0-9_-]+$/.test(audioId)
    ) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroomId or audioId');
    }

    // Reject browser-native TTS — must be handled client-side
    if (ttsProviderId === 'browser-native-tts') {
      return apiError('INVALID_REQUEST', 400, 'browser-native-tts must be handled client-side');
    }

    // Enforce server precedence: a force-disabled provider is off for everyone,
    // regardless of any client key/selection (#665).
    if (isServerTTSProviderDisabled(ttsProviderId)) {
      return apiError('PROVIDER_DISABLED', 403, 'This TTS provider is disabled by the server');
    }

    // Managed providers are admin-owned: ignore any client-sent key/baseUrl.
    const managed = isServerConfiguredProvider('tts', ttsProviderId);
    const clientBaseUrl = managed ? undefined : ttsBaseUrl || undefined;
    if (clientBaseUrl) {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = resolveTTSApiKey(ttsProviderId, managed ? undefined : ttsApiKey || undefined);
    const baseUrl = resolveTTSBaseUrl(ttsProviderId, clientBaseUrl);

    // Build TTS config (managed providers may pin the model server-side)
    const config = {
      providerId: ttsProviderId as TTSProviderId,
      modelId: resolveTTSModel(ttsProviderId, ttsModelId),
      voice: ttsVoice,
      speed: ttsSpeed ?? 1.0,
      apiKey,
      baseUrl,
      providerOptions: ttsProviderOptions,
    };

    log.info(
      `Generating TTS: provider=${ttsProviderId}, model=${config.modelId || 'default'}, voice=${ttsVoice}, ` +
        `audioId=${audioId}, textLen=${text.length}`,
    );

    // Generate audio
    const { audio, format } = await generateTTS(config, text);

    // Convert to base64
    const base64 = Buffer.from(audio).toString('base64');

    // Persist to Supabase Storage when generating for a classroom, so narration
    // is playable from any browser — the client's IndexedDB cache is per-device.
    // Both ids become storage path segments, so gate on the same charset check.
    let audioUrl: string | undefined;
    if (classroomId) {
      // Keep regenerated files immutable: a late request for an older edit
      // must never overwrite the file referenced by a newer speech action.
      const audioVersion = createHash('sha256')
        .update(Buffer.from(audio))
        .digest('hex')
        .slice(0, 16);
      const publicUrl = await uploadClassroomMedia(
        classroomId,
        `audio/${audioId}_${audioVersion}.${format}`,
        Buffer.from(audio),
        format === 'mp3' ? 'audio/mpeg' : `audio/${format}`,
      );
      audioUrl = publicUrl;
    }

    return apiSuccess({ audioId, base64, format, audioUrl });
  } catch (error) {
    log.error(
      `TTS generation failed [provider=${ttsProviderId ?? 'unknown'}, voice=${ttsVoice ?? 'unknown'}, audioId=${audioId ?? 'unknown'}]:`,
      error,
    );
    if (error instanceof TTSRateLimitError) {
      return apiError('RATE_LIMITED', 429, error.message);
    }
    return apiError(
      'GENERATION_FAILED',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}

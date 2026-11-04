/**
 * Per-speech managed-TTS helpers for the timeline editor.
 *
 * Audio is keyed and produced exactly like the generation pipeline: the cache
 * key is `tts_s<sceneOrder>_<actionId>` (see use-scene-generator /
 * classroom-media-generation) and synthesis delegates to `generateAndStoreTTS`,
 * so the request/store contract and key scheme stay single-sourced.
 */
import { db } from '@/lib/utils/database';
import { useSettingsStore } from '@/lib/store/settings';
import { generateAndStoreTTS } from '@/lib/hooks/use-scene-generator';
import { useStageStore } from '@/lib/store/stage';
import { persistClassroomToServer } from '@/lib/utils/classroom-persistence';

/** Canonical audio cache key — matches the generation pipeline. */
export function speechAudioId(sceneOrder: number, actionId: string): string {
  return `tts_s${sceneOrder}_${actionId}`;
}

/**
 * The audio key for a speech action: its stamped `audioId` (set by the pipeline
 * or a prior regen) if present, else the canonical derived key. Single source
 * of truth for "what blob belongs to this speech line".
 */
export function resolveSpeechAudioId(
  sceneOrder: number,
  action: { id?: string; audioId?: string },
): string {
  return action.audioId || speechAudioId(sceneOrder, action.id ?? '');
}

/** Managed (server) TTS is on — browser-native TTS has no cached file to manage. */
export function isManagedTtsActive(): boolean {
  const s = useSettingsStore.getState();
  return s.ttsEnabled && s.ttsProviderId !== 'browser-native-tts';
}

/** True if an audio blob is cached under this exact audioId. */
export async function audioExists(audioId: string): Promise<boolean> {
  return !!(await db.audioFiles.get(audioId));
}

/** Existence for many audioIds in one IndexedDB round-trip. */
export async function audioExistsBulk(audioIds: string[]): Promise<Set<string>> {
  if (audioIds.length === 0) return new Set();
  const recs = await db.audioFiles.bulkGet(audioIds);
  const have = new Set<string>();
  recs.forEach((r, i) => {
    if (r) have.add(audioIds[i]);
  });
  return have;
}

/** Object URL for the audio cached under this exact audioId (caller revokes). */
export async function audioObjectUrl(audioId: string): Promise<string | null> {
  const rec = await db.audioFiles.get(audioId);
  return rec ? URL.createObjectURL(rec.blob) : null;
}

/**
 * Discard the cached audio for a speech line (both its stamped audioId, if any,
 * and the canonical derived key). Called when the user edits a line's text: the
 * cache key is derived from sceneOrder+actionId (not the text), so without this
 * the stale blob would keep replaying for the new wording. After this the line
 * reads as "not voiced" and must be regenerated.
 */
export async function discardSpeechAudio(
  sceneOrder: number,
  action: { id?: string; audioId?: string },
): Promise<void> {
  if (!action.id) return;
  const ids = new Set([speechAudioId(sceneOrder, action.id)]);
  if (action.audioId) ids.add(action.audioId);
  await db.audioFiles.bulkDelete([...ids]);
}

/**
 * (Re)generate TTS for one speech line and cache it under the canonical key.
 * Returns the audioId on success, or null when TTS isn't applicable. Throws if
 * synthesis fails. Delegates to the pipeline's `generateAndStoreTTS`.
 */
export async function regenerateSpeechAudio(
  sceneOrder: number,
  action: { id?: string; text?: string },
  language?: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!isManagedTtsActive()) return null;
  const text = action.text?.trim();
  if (!text || !action.id) return null;
  const initial = useStageStore.getState();
  const classroomId = initial.stage?.id;
  const sceneId = initial.scenes.find(
    (scene) => scene.order === sceneOrder && scene.actions?.some((a) => a.id === action.id),
  )?.id;
  if (!classroomId || !sceneId) throw new Error('Speech classroom is no longer available');
  const audioId = speechAudioId(sceneOrder, action.id);
  const audioUrl = await generateAndStoreTTS(audioId, text, language, signal, classroomId);
  if (!audioUrl) return null;
  const current = useStageStore.getState();
  const scene = current.scenes.find((s) => s.id === sceneId);
  const speech = scene?.actions?.find((a) => a.id === action.id && a.type === 'speech');
  if (
    current.stage?.id !== classroomId ||
    !scene ||
    speech?.type !== 'speech' ||
    speech.text !== action.text
  ) {
    throw new Error('Speech changed while audio was being generated; please regenerate it');
  }
  current.updateScene(sceneId, {
    actions: (scene.actions ?? []).map((a) => (a === speech ? { ...a, audioId, audioUrl } : a)),
  });
  await useStageStore.getState().saveToStorage();
  const latest = useStageStore.getState();
  if (latest.stage?.id === classroomId) await persistClassroomToServer(latest.stage, latest.scenes);
  return audioId;
}

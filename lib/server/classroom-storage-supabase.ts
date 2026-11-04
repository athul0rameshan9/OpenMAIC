/**
 * Supabase-backed classroom storage.
 *
 * Drop-in replacement for filesystem-based classroom-storage.ts.
 * Stores classroom JSON in a Postgres table and media/audio in Supabase Storage.
 *
 * Required setup:
 * 1. Create table:
 *    CREATE TABLE classrooms (
 *      id TEXT PRIMARY KEY,
 *      stage JSONB NOT NULL,
 *      scenes JSONB NOT NULL,
 *      created_at TIMESTAMPTZ DEFAULT now()
 *    );
 *
 * 2. Create storage bucket:
 *    INSERT INTO storage.buckets (id, name, public)
 *    VALUES ('classroom-media', 'classroom-media', true);
 *
 * 3. Set env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';
import { supabase } from '@/lib/supabase/client';
import { mergeSpeechAudioRefs } from '@/lib/audio/speech-audio-refs';

const STORAGE_BUCKET = 'classroom-media';

// --- Kept for backward compat with job store (still filesystem) ---
import { promises as fs } from 'fs';
import path from 'path';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

export async function ensureClassroomsDir() {
  await fs.mkdir(CLASSROOMS_DIR, { recursive: true });
}

export async function ensureClassroomJobsDir() {
  await fs.mkdir(CLASSROOM_JOBS_DIR, { recursive: true });
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}
// --- End backward compat ---

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Read classroom data from Supabase.
 */
export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const { data, error } = await supabase
    .from('classrooms')
    .select('id, stage, scenes, created_at')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Row not found
      return null;
    }
    throw new Error(`Supabase read failed: ${error.message}`);
  }

  return {
    id: data.id,
    stage: data.stage as Stage,
    scenes: data.scenes as Scene[],
    createdAt: data.created_at,
  };
}

/**
 * Persist classroom data to Supabase (upsert).
 */
export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  // A browser may hold an older copy without the audio URLs added by a repair
  // or another browser. Preserve those refs for unchanged speech. Compare the
  // server-controlled stage timestamp on update so concurrent writes cannot
  // silently lose refs. The predicate stays small even for very large lessons.
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await readClassroom(data.id);
    const scenes = existing ? mergeSpeechAudioRefs(data.scenes, existing.scenes) : data.scenes;
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const stage = {
      ...data.stage,
      updatedAt: Math.max(Date.now(), (existing?.stage.updatedAt ?? 0) + 1),
    };
    if (existing) {
      let query = supabase.from('classrooms').update({ stage, scenes }).eq('id', data.id);
      query =
        existing.stage.updatedAt == null
          ? query.is('stage->>updatedAt', null)
          : query.eq('stage->>updatedAt', String(existing.stage.updatedAt));
      const { data: updated, error } = await query.select('id');
      if (error) throw new Error(`Supabase persist failed: ${error.message}`);
      if (!updated?.length) continue;
    } else {
      const { error } = await supabase.from('classrooms').insert({
        id: data.id,
        stage,
        scenes,
        created_at: createdAt,
      });
      if (error?.code === '23505') continue;
      if (error) throw new Error(`Supabase persist failed: ${error.message}`);
    }
    return { ...data, stage, scenes, createdAt, url: `${baseUrl}/classroom/${data.id}` };
  }
  throw new Error('Classroom changed during save; please retry');
}

/**
 * Upload a media/audio file to Supabase Storage.
 * Returns the public URL.
 */
export async function uploadClassroomMedia(
  classroomId: string,
  subPath: string, // e.g. "audio/tts_s0_a1.mp3" or "media/img_1.png"
  fileBuffer: Buffer,
  contentType: string,
): Promise<string> {
  const storagePath = `${classroomId}/${subPath}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, fileBuffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  return urlData.publicUrl;
}

/**
 * Get public URL for a classroom media file.
 */
export function getClassroomMediaUrl(classroomId: string, subPath: string): string {
  const storagePath = `${classroomId}/${subPath}`;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Download media file from Supabase Storage.
 */
export async function downloadClassroomMedia(
  classroomId: string,
  subPath: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const storagePath = `${classroomId}/${subPath}`;

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);

  if (error) {
    if (error.message.includes('not found') || error.message.includes('Object not found')) {
      return null;
    }
    throw new Error(`Supabase storage download failed: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: data.type || 'application/octet-stream',
  };
}

/**
 * List all classrooms (most recent first).
 */
export async function listClassrooms(limit = 50): Promise<PersistedClassroomData[]> {
  const { data, error } = await supabase
    .from('classrooms')
    .select('id, stage, scenes, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Supabase list failed: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    stage: row.stage as Stage,
    scenes: row.scenes as Scene[],
    createdAt: row.created_at,
  }));
}

/**
 * Delete a classroom and its media from Supabase.
 */
export async function deleteClassroom(id: string): Promise<void> {
  // Delete media files from storage — enumerate known subdirectories
  for (const subDir of ['audio', 'media']) {
    const { data: subFiles } = await supabase.storage.from(STORAGE_BUCKET).list(`${id}/${subDir}`);

    if (subFiles && subFiles.length > 0) {
      const paths = subFiles
        .filter((f) => f.name) // skip any folder markers
        .map((f) => `${id}/${subDir}/${f.name}`);
      if (paths.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(paths);
      }
    }
  }

  // Delete the database row
  const { error } = await supabase.from('classrooms').delete().eq('id', id);

  if (error) {
    throw new Error(`Supabase delete failed: ${error.message}`);
  }
}

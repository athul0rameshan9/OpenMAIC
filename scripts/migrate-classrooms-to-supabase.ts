/**
 * Migration script: Migrate existing filesystem classrooms to Supabase.
 *
 * Reads all classrooms from data/classrooms/*.json and uploads them
 * to Supabase Postgres + Storage.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate-classrooms-to-supabase.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
const STORAGE_BUCKET = 'classroom-media';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function uploadDirectory(classroomId: string, subDir: string, storageId?: string) {
  const dirPath = path.join(CLASSROOMS_DIR, classroomId, subDir);
  const targetId = storageId || classroomId;
  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch {
    return 0; // Directory doesn't exist
  }

  let uploaded = 0;
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) continue;

    const buffer = await fs.readFile(filePath);
    const storagePath = `${targetId}/${subDir}/${file}`;

    const ext = path.extname(file).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.aac': 'audio/aac',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (error) {
      console.error(`  Failed to upload ${storagePath}: ${error.message}`);
    } else {
      uploaded++;
    }
  }
  return uploaded;
}

async function main() {
  console.log('Starting classroom migration to Supabase...');
  console.log(`Source: ${CLASSROOMS_DIR}`);

  let entries: string[];
  try {
    entries = await fs.readdir(CLASSROOMS_DIR);
  } catch {
    console.log('No data/classrooms/ directory found. Nothing to migrate.');
    return;
  }

  const jsonFiles = entries.filter((f) => f.endsWith('.json'));
  console.log(`Found ${jsonFiles.length} classroom(s) to migrate.\n`);

  let migrated = 0;
  let failed = 0;

  for (const file of jsonFiles) {
    const filePath = path.join(CLASSROOMS_DIR, file);
    const classroomId = path.basename(file, '.json');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Use the ID from inside the JSON (canonical), falling back to filename
      const id = data.id || classroomId;

      // Upsert to Postgres
      const { error } = await supabase.from('classrooms').upsert(
        {
          id,
          stage: data.stage,
          scenes: data.scenes,
          created_at: data.createdAt || new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

      if (error) {
        console.error(`✗ ${classroomId}: DB upsert failed — ${error.message}`);
        failed++;
        continue;
      }

      // Upload audio and media files using canonical ID for storage path
      const audioCount = await uploadDirectory(classroomId, 'audio', id);
      const mediaCount = await uploadDirectory(classroomId, 'media', id);

      console.log(`✓ ${classroomId}: migrated (${audioCount} audio, ${mediaCount} media files)`);
      migrated++;
    } catch (err) {
      console.error(`✗ ${classroomId}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nMigration complete: ${migrated} succeeded, ${failed} failed.`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

# Plan: Store Classrooms in Supabase

Migrate classroom persistence from local filesystem (`data/classrooms/`) to Supabase (Postgres + Storage).

---

## Overview

| Component | Current (filesystem) | Target (Supabase) |
|-----------|---------------------|-------------------|
| Classroom JSON (stage + scenes) | `data/classrooms/<id>.json` | Postgres `classrooms` table (JSONB) |
| Audio files (TTS) | `data/classrooms/<id>/audio/` | Supabase Storage bucket `classroom-media` |
| Media files (images/video) | `data/classrooms/<id>/media/` | Supabase Storage bucket `classroom-media` |
| Serving media | `/api/classroom-media/<id>/<path>` proxy | Direct Supabase public URLs |

---

## Tasks

### Task 1: Create Supabase Database Table

**File:** None (Supabase SQL Editor)

Run this migration in Supabase:

```sql
CREATE TABLE classrooms (
  id TEXT PRIMARY KEY,
  stage JSONB NOT NULL,
  scenes JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_classrooms_created_at ON classrooms(created_at DESC);
```

**Acceptance:** Table exists and is queryable via Supabase client.

---

### Task 2: Create Supabase Storage Bucket

**File:** None (Supabase Dashboard or SQL)

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('classroom-media', 'classroom-media', true);

-- Allow public read access
CREATE POLICY "Public read classroom media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'classroom-media');

-- Allow service role to upload
CREATE POLICY "Service role upload classroom media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'classroom-media');

CREATE POLICY "Service role delete classroom media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'classroom-media');
```

**Acceptance:** Bucket exists, public URLs work, service role can upload.

---

### Task 3: Set Environment Variables

**File:** `.env.local`

Ensure these are set:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
```

**Acceptance:** `lib/supabase/client.ts` initializes without error.

---

### Task 4: Create Supabase Storage Module

**File:** `lib/server/classroom-storage-supabase.ts` ✅ (already created)

This module provides:
- `readClassroom(id)` — reads from Postgres
- `persistClassroom(data, baseUrl)` — upserts to Postgres
- `uploadClassroomMedia(classroomId, subPath, buffer, contentType)` — uploads to Storage
- `getClassroomMediaUrl(classroomId, subPath)` — returns public URL
- `downloadClassroomMedia(classroomId, subPath)` — downloads from Storage
- `listClassrooms(limit)` — lists all classrooms
- `deleteClassroom(id)` — deletes classroom + media

**Acceptance:** Module exports same interface as `classroom-storage.ts`.

---

### Task 5: Swap Classroom Storage Import

**File:** `lib/server/classroom-storage.ts`

Replace the file contents with a re-export:

```ts
export * from './classroom-storage-supabase';
```

This ensures all existing imports (`app/api/classroom/route.ts`, `lib/server/classroom-generation.ts`, etc.) automatically use Supabase without any changes.

**Acceptance:** `POST /api/classroom` and `GET /api/classroom?id=...` work against Supabase.

---

### Task 6: Update Media Generation to Use Supabase Storage

**File:** `lib/server/classroom-media-generation.ts`

Replace filesystem writes with `uploadClassroomMedia`:

| Line | Current Code | New Code |
|------|-------------|----------|
| ~75 | `const mediaDir = path.join(CLASSROOMS_DIR, classroomId, 'media')` | Remove |
| ~125 | `await fs.writeFile(path.join(mediaDir, filename), buf)` | `const url = await uploadClassroomMedia(classroomId, \`media/${filename}\`, buf, contentType)` |
| ~158 | `await fs.writeFile(path.join(mediaDir, filename), buf)` | `const url = await uploadClassroomMedia(classroomId, \`media/${filename}\`, buf, contentType)` |
| ~221 | `const audioDir = path.join(CLASSROOMS_DIR, classroomId, 'audio')` | Remove |
| ~279 | `await fs.writeFile(path.join(audioDir, filename), result.audio)` | `const url = await uploadClassroomMedia(classroomId, \`audio/${filename}\`, result.audio, 'audio/mpeg')` |

Also update the URL construction — instead of `/api/classroom-media/<id>/audio/<file>`, use the public URL returned by `uploadClassroomMedia`.

**Acceptance:** Generated audio/images are stored in Supabase Storage and URLs point to Supabase.

---

### Task 7: Update Media Serving Route (Optional — can deprecate)

**File:** `app/api/classroom-media/[classroomId]/[...path]/route.ts`

Two options:
1. **Redirect:** Change it to redirect to Supabase public URL (backward compat)
2. **Remove:** If all URLs now point directly to Supabase Storage, this route is unused

Recommended: Keep as a redirect fallback:

```ts
export async function GET(_req, { params }) {
  const { classroomId, path: pathSegments } = await params;
  const subPath = pathSegments.join('/');
  const url = getClassroomMediaUrl(classroomId, subPath);
  return NextResponse.redirect(url, 302);
}
```

**Acceptance:** Old `/api/classroom-media/` URLs still resolve.

---

### Task 8: Update Classroom Page Loading

**File:** `app/classroom/[id]/page.tsx`

The classroom page currently tries to load from IndexedDB first, then falls back to `/api/classroom?id=...`. Since the API route now reads from Supabase (via Task 5), **no change is needed** — the page will automatically get data from Supabase through the existing API fallback.

**Acceptance:** Opening `/classroom/<id>` loads data from Supabase.

---

### Task 9: Migrate Existing Filesystem Data (Optional)

**File:** Create `scripts/migrate-classrooms-to-supabase.ts`

Script to read all existing `data/classrooms/*.json` files and upload them to Supabase:

```ts
// Pseudocode
for each file in data/classrooms/*.json:
  const data = JSON.parse(file)
  await supabase.from('classrooms').upsert(data)
  
  // Upload associated media
  for each file in data/classrooms/<id>/audio/*:
    await supabase.storage.from('classroom-media').upload(...)
  for each file in data/classrooms/<id>/media/*:
    await supabase.storage.from('classroom-media').upload(...)
```

**Acceptance:** All existing classrooms accessible via Supabase.

---

### Task 10: Add List/Delete API Endpoints (Optional Enhancement)

**File:** `app/api/classroom/route.ts`

Add handlers:
- `GET /api/classroom` (no `id` param) → calls `listClassrooms()` to list all
- `DELETE /api/classroom?id=...` → calls `deleteClassroom(id)`

**Acceptance:** Can list and delete classrooms via API.

---

## Execution Order

```
Task 1 (DB table)
Task 2 (Storage bucket)       ── can run in parallel
Task 3 (Env vars)

Task 4 (Supabase module)      ── already done ✅

Task 5 (Swap import)          ── enables classroom JSON storage
Task 6 (Media generation)     ── enables audio/image storage
Task 7 (Media route update)   ── backward compat

Task 8 (Verify page loading)  ── just testing
Task 9 (Migration script)     ── only if existing data
Task 10 (List/Delete APIs)    ── optional enhancement
```

---

## Files Modified

| File | Change |
|------|--------|
| `lib/server/classroom-storage-supabase.ts` | NEW — Supabase storage implementation |
| `lib/server/classroom-storage.ts` | Replace with re-export |
| `lib/server/classroom-media-generation.ts` | Replace `fs.writeFile` with `uploadClassroomMedia` |
| `app/api/classroom-media/[classroomId]/[...path]/route.ts` | Redirect to Supabase URLs |
| `scripts/migrate-classrooms-to-supabase.ts` | NEW — migration script (optional) |
| `.env.local` | Add Supabase credentials |

---

## Verification

After all tasks:

```bash
# Save a classroom
curl -X POST http://localhost:3000/api/classroom \
  -H "Content-Type: application/json" \
  -d '{"stage":{"id":"test-1","name":"Test"},"scenes":[{"type":"slide","order":0,"content":{"type":"slide","canvas":{"id":"s1","elements":[]}}}]}'

# Load it back
curl http://localhost:3000/api/classroom?id=test-1

# Open in browser
open http://localhost:3000/classroom/test-1

# Verify in Supabase dashboard: table has row, storage has files
```

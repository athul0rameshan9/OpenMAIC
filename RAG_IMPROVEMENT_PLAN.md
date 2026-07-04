# RAG Improvement Plan: Full-Chapter Content for Course Generation

## Problem

Currently, when a user selects a textbook and types a prompt, the system:
1. Embeds the query and performs semantic search in Qdrant
2. Retrieves only **top-5 chunks** (~2,500 tokens)
3. Concatenates them into `ragContext`
4. Passes that to the LLM to generate an entire multi-slide course

This is bad architecture because:
- **Each textbook only contains one chapter** — there's no need for semantic search
- 5 small chunks cannot represent a full chapter's content
- Lost logical flow and narrative structure
- Missing prerequisite concepts
- Incomplete topic coverage
- No awareness of what comes before/after in the chapter

## Solution

Since each textbook = 1 chapter, **skip semantic search for generation entirely**. Fetch the full `content.md` (already stored in Supabase Storage by the ingestion pipeline) and pass it as `pdfText` to the existing generation API.

## Why This Works

Everything needed already exists:
- The ingestion pipeline saves `processed/{textbook_id}/content.md` (full chapter markdown) to Supabase Storage
- The generation API already handles `pdfText` (full document content) with a 50K char limit
- The `pdfText` path is what PDF upload uses — it's proven and works

The only missing piece: the textbook flow currently does **semantic search → 5 chunks → `ragContext`**, when it should just **fetch stored markdown → pass as `pdfText`**.

## Implementation Steps

### Step 1: New API Endpoint — `/api/textbook-content`

Create `app/api/textbook-content/route.ts` (~30 lines):
- Accept `textbook_id` in the request body
- Query `textbook_processed` table to get `markdown_storage_path`
- Download `content.md` from Supabase Storage
- Return the full markdown text

### Step 2: Update Frontend Generation Flow

Modify `handleGenerateFromTextbook` in `app/page.tsx`:
- Call `/api/textbook-content` to fetch the full chapter text
- Store it as `pdfText` in the session state (instead of `ragContext`)
- The generation preview page already sends `pdfText` to the outlines API

### Step 3: No Changes to Generation API

`app/api/generate/scene-outlines-stream/route.ts` already handles:
```typescript
if (ragContext && textbookTitle) {
  effectivePdfContent = `[Relevant excerpts from textbook "${textbookTitle}"]\n\n${ragContext}`;
} else if (pdfText) {
  effectivePdfContent = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
}
```
By passing `pdfText` instead of `ragContext`, the existing code path handles it automatically.

### Step 4: Keep Semantic Search for Browsing (Optional)

The textbook search/chunk preview UI can remain for exploration and browsing purposes. It's just no longer used as the source for course generation.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `app/api/textbook-content/route.ts` | CREATE | New endpoint to fetch full markdown from Supabase Storage |
| `app/page.tsx` | MODIFY | Change `handleGenerateFromTextbook` to fetch full content |
| `lib/hooks/use-textbook-search.ts` | NO CHANGE | Keep for browsing/preview UX |
| `app/api/generate/scene-outlines-stream/route.ts` | NO CHANGE | Already handles `pdfText` |
| `lib/constants/generation.ts` | NO CHANGE | Existing 50K char limit applies |

## Existing Infrastructure Leveraged

| Component | Already Exists | Role |
|-----------|---------------|------|
| `processed/{textbook_id}/content.md` | ✅ Supabase Storage | Full chapter markdown |
| `textbook_processed` table | ✅ PostgreSQL | Maps textbook_id → storage path |
| `pdfText` field in session state | ✅ Frontend | Carries full document to generation |
| `MAX_PDF_CONTENT_CHARS = 50000` | ✅ Constants | Truncation for context limits |
| Generation API `pdfText` handling | ✅ Backend | Injects into prompt template |

## Token Budget

- `MAX_PDF_CONTENT_CHARS = 50000` ≈ ~12,500 tokens
- Sufficient for most single chapters (~25-30 pages of text)
- Can be made model-aware later (larger limit for 128K context models)

## Verification Checklist

- [ ] Generate from a textbook → confirm outlines API receives full chapter content (not 5 chunks)
- [ ] Compare output quality: should cover full topic breadth
- [ ] Existing PDF upload flow remains unchanged
- [ ] Test with a large chapter to verify truncation works correctly
- [ ] Semantic search UI still works for browsing

## Future Enhancements (If Needed)

If chapters are too large for the context window:
1. **Adaptive token budget** — set `MAX_PDF_CONTENT_CHARS` based on model's context size
2. **Section-level retrieval** — use the textbook's heading structure to pick relevant sections
3. **Map-reduce** — summarize sections first, then generate from summaries + full key sections

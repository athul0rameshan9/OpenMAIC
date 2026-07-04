# RAG Pipeline Enhancement — Integration Plan

## Problem Summary

The current pipeline retrieves only 5 small chunks (~512 tokens each, ~2,500 tokens total) from an entire textbook to generate multi-slide courses. This causes:
- Lost logical flow and narrative structure
- Missing prerequisite concepts
- Incomplete topic coverage
- No awareness of surrounding content

## Current Architecture (as-is)

```
User query → BGE embedding → Qdrant top-5 → ragContext string → LLM outline generation
```

**Key observation:** The Qdrant payload *already* stores rich structural metadata per chunk:
- `headings[]` — full heading hierarchy (e.g., `["Chapter 3", "3.1 Ionic Bonds"]`)
- `chunk_index` — sequential position in the textbook
- `page_numbers[]` — PDF page spans
- `content_type` — text/table/formula/picture/mixed

This metadata is returned from search but **only `text` is used** in the generation prompt.

---

## Phase 1: Quick Wins (1–2 weeks)

### Goal: 3–5× more context with zero schema changes

#### 1.1 Contextual Window Expansion

**What:** After retrieving top-5 chunks, also fetch their neighbors (±2 chunks by `chunk_index`) to reconstruct local flow.

**File: `/app/api/textbook-search/route.ts`**

Add a second Qdrant query after the initial search:

```typescript
// After initial search, expand context with neighboring chunks
const seedIndices = results.map(r => (r.payload as any).chunk_index as number);
const expandedIndices = new Set<number>();
for (const idx of seedIndices) {
  for (let offset = -2; offset <= 2; offset++) {
    expandedIndices.add(idx + offset);
  }
}
// Remove already-fetched indices
for (const idx of seedIndices) expandedIndices.delete(idx);

// Fetch neighbors via scroll/filter (not vector search)
const neighbors = await qdrant.scroll('textbook_chunks', {
  filter: {
    must: [
      { key: 'textbook_id', match: { value: textbook_id } },
      { key: 'chunk_index', match: { any: [...expandedIndices].filter(i => i >= 0) } },
    ],
  },
  limit: expandedIndices.size,
  with_payload: true,
});
```

**API response change:** Return both `chunks` (ranked) and `expandedChunks` (neighbors, sorted by `chunk_index`).

#### 1.2 Structured ragContext Assembly

**What:** Instead of naively concatenating chunks, build a structured document with headings and ordering.

**File: `/app/page.tsx`** (around line 431) and **new file: `/lib/generation/rag-context-builder.ts`**

```typescript
// lib/generation/rag-context-builder.ts
export function buildStructuredRagContext(
  chunks: TextbookChunk[],
  expandedChunks: TextbookChunk[],
  options: { maxTokens?: number } = {}
): string {
  const maxTokens = options.maxTokens ?? 8000;

  // Merge and deduplicate by chunk_index
  const allChunks = deduplicateByIndex([...chunks, ...expandedChunks]);

  // Sort by chunk_index for narrative flow
  allChunks.sort((a, b) => a.chunk_index - b.chunk_index);

  // Group by top-level heading
  const sections = groupByHeading(allChunks);

  // Build structured output
  const lines: string[] = [];
  lines.push('## Document Structure\n');

  for (const [heading, sectionChunks] of sections) {
    lines.push(`### ${heading}\n`);
    for (const chunk of sectionChunks) {
      if (chunk.has_formula) lines.push('[Contains formulas]');
      if (chunk.has_table) lines.push('[Contains table]');
      lines.push(chunk.text);
      lines.push('');
    }
  }

  // Truncate to token budget
  return truncateToTokenBudget(lines.join('\n'), maxTokens);
}
```

#### 1.3 Include Heading Hierarchy in Prompt

**What:** Inject the textbook's table of contents (from heading metadata) as a structural overview.

**File: `/app/api/generate/scene-outlines-stream/route.ts`** (around line 374–375)

Change from:
```typescript
effectivePdfContent = `[Relevant excerpts from textbook "${textbookTitle}"]\n\n${ragContext}`;
```

To:
```typescript
effectivePdfContent = `[Structured content from textbook "${textbookTitle}"]

## Table of Contents (nearby sections)
${tocFromChunks}

## Detailed Content
${ragContext}`;
```

The `tocFromChunks` is built from the `headings[]` field of all retrieved chunks, showing the user where in the textbook these excerpts come from.

#### 1.4 Multi-Query Retrieval

**What:** For multi-slide courses, generate sub-queries per likely subtopic to improve recall.

**File: New `/app/api/textbook-search/route.ts` enhancement**

Before embedding, ask the LLM (or use rule-based decomposition) to split the user's query into 2–3 sub-queries:
- Original query (main topic)
- Prerequisites query (e.g., "prerequisites for [topic]")
- Applications query (e.g., "examples and applications of [topic]")

Search each sub-query with top-3, merge results, then apply the contextual window expansion.

### Phase 1 Changes Summary

| Component | File | Change |
|-----------|------|--------|
| Search API | `app/api/textbook-search/route.ts` | Add neighbor expansion, return `expandedChunks` |
| Context builder | `lib/generation/rag-context-builder.ts` | **New file** — structured assembly |
| Type definitions | `lib/types/textbook.ts` | Add `TextbookSearchResultExpanded` type |
| Homepage | `app/page.tsx` | Use structured builder for `ragContext` |
| Outline API | `app/api/generate/scene-outlines-stream/route.ts` | Include TOC header |
| Search hook | `lib/hooks/use-textbook-search.ts` | Pass expanded chunks |

---

## Phase 2: Structural Retrieval (3–4 weeks)

### Goal: Preserve pedagogical structure via enriched ingestion

#### 2.1 Enriched Chunk Metadata (Ingestion Pipeline)

**What:** During chunking, extract and store additional structural metadata.

**Python pipeline changes** (Celery worker, `pipeline_stages.py`):

New fields to add to Qdrant payload:

| Field | Type | Description |
|-------|------|-------------|
| `section_id` | string | Unique ID for the textbook section (e.g., `"ch3_s1"`) |
| `section_title` | string | Full section title |
| `section_summary` | string | 1-sentence LLM-generated summary of the section |
| `learning_objectives` | string[] | Extracted learning objectives (if present) |
| `prerequisites` | string[] | Referenced prior sections |
| `depth_level` | int | Heading depth (1=chapter, 2=section, 3=subsection) |
| `total_chunks_in_section` | int | How many chunks this section contains |
| `position_in_section` | int | This chunk's position within its section |

**Implementation:** After Docling parsing, traverse the heading hierarchy to assign section IDs. Use an LLM call (cheap model, batch) to generate 1-sentence section summaries.

#### 2.2 New Qdrant Collection: `textbook_sections`

**What:** A separate collection storing section-level embeddings for coarse retrieval.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Deterministic from `textbook_id + section_id` |
| `vector` | float[384] | Embedding of section title + summary + objectives |
| `textbook_id` | string | Parent textbook |
| `section_id` | string | Section identifier |
| `section_title` | string | Full heading |
| `section_summary` | string | LLM-generated summary |
| `learning_objectives` | string[] | Extracted objectives |
| `chunk_indices` | int[] | All chunk_indices belonging to this section |
| `depth_level` | int | Heading depth |
| `parent_section_id` | string | Parent section (for hierarchy) |
| `child_section_ids` | string[] | Child sections |

#### 2.3 Two-Stage Retrieval

**What:** First retrieve relevant *sections*, then retrieve chunks within those sections.

**New file: `/app/api/textbook-search-v2/route.ts`**

```
Step 1: Embed query → search textbook_sections (top-3 sections)
Step 2: For each section, retrieve ALL chunks (via chunk_indices filter)
Step 3: Score and rank chunks, apply token budget
Step 4: Return structured result with section hierarchy
```

This ensures:
- Complete coverage of relevant sections (not just isolated chunks)
- Preserved internal ordering within sections
- Awareness of section boundaries for slide design

#### 2.4 PostgreSQL Schema Addition

**New table: `textbook_sections`**

```sql
CREATE TABLE textbook_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_id UUID NOT NULL REFERENCES textbooks(textbook_id),
  section_id VARCHAR(100) NOT NULL,
  section_title VARCHAR(500) NOT NULL,
  section_summary TEXT,
  learning_objectives TEXT[],
  depth_level INTEGER NOT NULL DEFAULT 1,
  parent_section_id VARCHAR(100),
  chunk_start_index INTEGER NOT NULL,
  chunk_end_index INTEGER NOT NULL,
  page_start INTEGER,
  page_end INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(textbook_id, section_id)
);
```

This allows the app to quickly look up section metadata without hitting Qdrant.

#### 2.5 Adaptive Token Budget

**What:** Dynamically allocate context window based on the model's capacity and course length.

**File: `/lib/generation/rag-context-builder.ts`** enhancement:

```typescript
export function computeTokenBudget(
  modelContextWindow: number,  // e.g., 128k, 32k, 8k
  numSlides: number,           // estimated from query complexity
  promptOverhead: number = 4000,
): number {
  // Reserve space for: system prompt + user prompt + output
  const outputReserve = Math.min(numSlides * 2000, modelContextWindow * 0.4);
  const available = modelContextWindow - promptOverhead - outputReserve;
  return Math.max(4000, Math.floor(available * 0.7)); // 70% of remaining for RAG
}
```

#### 2.6 Enhanced Prompt Template

**File: `/lib/prompts/templates/requirements-to-outlines/user.md`**

Add a new section between "PDF Content Summary" and "Available Images":

```markdown
### Document Structure

The following content is organized by textbook sections, preserving the author's pedagogical flow.
Each section includes its learning objectives and position in the textbook structure.

**Sections covered (in order):**
{{sectionOutline}}

**Detailed content by section:**
{{structuredContent}}

**Prerequisites mentioned:**
{{prerequisites}}
```

### Phase 2 Changes Summary

| Component | File | Change |
|-----------|------|--------|
| Ingestion pipeline | Python celery worker | Extract section metadata, generate summaries |
| Qdrant | New collection `textbook_sections` | Section-level embeddings |
| PostgreSQL | New table `textbook_sections` | Section metadata storage |
| Search API v2 | `app/api/textbook-search-v2/route.ts` | **New** — two-stage retrieval |
| Context builder | `lib/generation/rag-context-builder.ts` | Adaptive budget, section-aware assembly |
| Prompt template | `lib/prompts/templates/requirements-to-outlines/user.md` | Structured content sections |
| Types | `lib/types/textbook.ts` | Add `TextbookSection` type |
| DATABASE.md | Update documentation | New table + collection |

---

## Phase 3: Agentic Course Design (6–8 weeks)

### Goal: Multi-step reasoning for pedagogically optimal course generation

#### 3.1 Course Planning Agent

**What:** An agentic pre-processing step that plans the course structure before generating content.

**New file: `/lib/generation/course-planner.ts`**

The planner operates in multiple LLM calls:

```
Step 1: SCOPE — Given user query + section summaries, decide which sections to cover
Step 2: SEQUENCE — Order selected sections pedagogically (prerequisites first)
Step 3: DEPTH — Allocate slides per section based on complexity and importance
Step 4: RETRIEVE — Fetch full content for selected sections within token budget
Step 5: GENERATE — Pass the curated, structured context to outline generation
```

Each step uses a focused prompt and can use a cheaper/faster model (e.g., GPT-4o-mini for planning, full model for generation).

#### 3.2 Prerequisite Graph

**What:** Build a directed graph of concept dependencies extracted from the textbook.

**New Qdrant collection: `textbook_concepts`**

| Field | Type | Description |
|-------|------|-------------|
| `concept_id` | string | Normalized concept name |
| `textbook_id` | string | Source textbook |
| `section_ids` | string[] | Sections where this concept is explained |
| `depends_on` | string[] | Prerequisite concept_ids |
| `difficulty_level` | int | 1-5 difficulty rating |

**Implementation:** During ingestion, use an LLM to extract key concepts and their dependencies from each section. Store as a graph in PostgreSQL (adjacency list) with embeddings in Qdrant for semantic concept matching.

**Usage:** When generating a course on topic X:
1. Find X's concept node
2. Traverse `depends_on` edges to find prerequisite concepts
3. Include brief explanations of prerequisites in the course context
4. Optionally generate a "review" slide for critical prerequisites

#### 3.3 Iterative Refinement Loop

**What:** After generating initial outlines, validate coverage against the retrieved sections and iterate.

**New file: `/lib/generation/outline-validator.ts`**

```typescript
export async function validateOutlineCoverage(
  outlines: SceneOutline[],
  retrievedSections: TextbookSection[],
  requirements: UserRequirements,
  aiCall: AICallFn,
): Promise<{ gaps: string[]; suggestions: string[] }> {
  // Ask LLM: "Given these outlines and these source sections,
  // are there any critical gaps in coverage?"
  // Return suggestions for additional slides or content adjustments
}
```

This feeds back into the generation loop — if gaps are found, additional retrieval + generation occurs.

#### 3.4 Cross-Textbook Retrieval

**What:** When a single textbook doesn't fully cover a topic, pull from other textbooks in the same course.

**Changes to search API:**
- If `ragConfidence` (average similarity score) is below threshold, expand search to other textbooks in the same course
- Present merged results with source attribution

#### 3.5 Streaming Architecture for Long Courses

**What:** For chapter-length generation (10+ slides), use a streaming pipeline that generates slides incrementally with context carryover.

Instead of:
```
All context → Generate all outlines at once → Generate all slides
```

Do:
```
Section 1 context → Outline slides 1-3 → Generate slides 1-3
Section 2 context + slides 1-3 summary → Outline slides 4-6 → Generate slides 4-6
...
```

This enables:
- Handling textbooks larger than any model's context window
- Progressive delivery to the user
- Each slide group has focused, relevant context

### Phase 3 Changes Summary

| Component | File | Change |
|-----------|------|--------|
| Course planner | `lib/generation/course-planner.ts` | **New** — multi-step planning agent |
| Concept graph | Python pipeline + new Qdrant collection | Extract concept dependencies |
| PostgreSQL | New table `textbook_concepts` | Concept graph storage |
| Outline validator | `lib/generation/outline-validator.ts` | **New** — coverage validation |
| Search API | `app/api/textbook-search/route.ts` | Cross-textbook fallback |
| Pipeline runner | `lib/generation/pipeline-runner.ts` | Streaming chunked generation |
| Prompt templates | `lib/prompts/templates/` | Planning prompts, validation prompts |

---

## Migration Strategy

### Backward Compatibility

All phases are **additive** — existing functionality continues to work:
- Phase 1: Same API contract, just richer `ragContext` content
- Phase 2: New `/api/textbook-search-v2` endpoint; old endpoint remains
- Phase 3: New pipeline option, existing `runGenerationPipeline` untouched

### Feature Flags

```typescript
// lib/config/rag-config.ts
export const RAG_CONFIG = {
  // Phase 1
  enableNeighborExpansion: true,
  neighborRadius: 2,            // ±N chunks
  enableMultiQuery: false,      // enable after testing

  // Phase 2
  enableSectionRetrieval: false,  // flip when textbook_sections populated
  adaptiveTokenBudget: true,

  // Phase 3
  enableCoursePlanner: false,
  enablePrerequisiteGraph: false,
  enableIterativeRefinement: false,
};
```

### Data Migration

Phase 2 requires re-processing existing textbooks to generate section metadata. Plan:
1. Add a migration script (`scripts/backfill-sections.ts`)
2. Process textbooks in background (same Celery queue)
3. New textbooks get enriched metadata automatically
4. Old textbooks work with Phase 1 logic until reprocessed

---

## Estimated Impact

| Phase | Context Used | Coverage | Effort |
|-------|-------------|----------|--------|
| Current | ~2,500 tokens (5 chunks) | Partial | — |
| Phase 1 | ~8,000–12,000 tokens (25 chunks) | Good | Low |
| Phase 2 | ~15,000–30,000 tokens (full sections) | Very Good | Medium |
| Phase 3 | Adaptive (up to model limit) | Excellent | High |

---

## Immediate Next Steps

1. **Create `/lib/generation/rag-context-builder.ts`** with Phase 1 logic
2. **Modify `/app/api/textbook-search/route.ts`** to add neighbor expansion
3. **Update `/lib/types/textbook.ts`** with expanded search result type
4. **Test** with an existing textbook to measure quality improvement
5. **Iterate** on token budget and neighbor radius based on results

# Student AI Assistant — Implementation Plan

## Overview

A sidebar AI assistant for students that leverages the existing Qdrant vector DB, RAG pipeline, and multi-provider AI infrastructure to provide contextual tutoring, Q&A, and study material generation.

---

## Architecture Summary (Current State)

| Layer | Technology | Status |
|-------|-----------|--------|
| Vector DB | Qdrant Cloud (`textbook_chunks`, 384-dim BGE embeddings) | ✅ Live |
| Embeddings | `BAAI/bge-small-en-v1.5` via `@huggingface/transformers` | ✅ Live |
| RAG Search | `/api/textbook-search` (cosine similarity, top-5) | ✅ Live |
| AI Providers | 15+ providers via Vercel AI SDK v6 | ✅ Live |
| Agent Framework | `@earendil-works/pi-agent-core` + LangGraph | ✅ Live |
| Streaming | SSE + partial-json parsing | ✅ Live |
| Web Search | Tavily, Brave, Baidu, Bocha, MiniMax | ✅ Live |
| PDF Parsing | MinerU / unpdf (input only) | ✅ Live |
| PPTX Export | pptxgenjs | ✅ Live |
| PDF Generation | — | ❌ Missing |
| Student Q&A Agent | — | ❌ Missing |

---

## Proposed Features

### 1. Contextual Q&A from Vector DB
- Student asks a question → embed query → Qdrant similarity search → inject RAG context → LLM generates answer
- Cite source chunks (page numbers, headings) in responses
- Support follow-up questions with conversation history

### 2. Subject & Topic Understanding
- Detect the current course/textbook context automatically
- Maintain a running topic model from conversation + active slide content
- Provide scaffolded explanations (ELI5 → detailed → expert modes)

### 3. PDF Study Material Generation
- Generate study guides, summaries, formula sheets, flashcard PDFs
- Use `@react-pdf/renderer` or Puppeteer (HTML→PDF) for server-side generation
- Include LaTeX math rendering, diagrams, and structured layouts

### 4. Research Mode
- Web search integration (reuse existing 5 providers)
- Multi-source synthesis: vector DB + web + active slide context
- Return cited, structured research summaries

### 5. Quiz & Practice
- Generate practice questions from textbook content
- Grade student answers with explanations
- Adapt difficulty based on performance

---

## Implementation Plan

### Phase 1: Core Agent Backend

#### 1.1 API Route — `/api/student-assistant/chat`
```
app/api/student-assistant/
├── chat/route.ts          # SSE streaming endpoint
├── generate-pdf/route.ts  # PDF generation endpoint
└── research/route.ts      # Research + web search endpoint
```

**Chat route responsibilities:**
- Accept messages + courseId + active scene context
- Embed user query via BGE → Qdrant search (existing `textbook-search` logic)
- Build system prompt with RAG context, topic context, conversation history
- Stream response via Vercel AI SDK (`streamText`)
- Support tool calls: `search_textbook`, `web_search`, `generate_quiz`, `explain_concept`

#### 1.2 Agent Tools (via pi-agent-core or Vercel AI tool calling)

| Tool | Purpose |
|------|---------|
| `search_textbook` | Query Qdrant for relevant chunks (reuse existing embedding logic) |
| `web_search` | Call existing web search providers for supplementary info |
| `generate_quiz` | Create practice questions from context |
| `explain_concept` | Break down a concept with analogies and examples |
| `generate_study_pdf` | Trigger PDF generation pipeline |
| `get_slide_context` | Read current active slide/scene content |
| `summarize_topic` | Generate a concise topic summary |

#### 1.3 Prompt Template — `lib/prompts/templates/student-assistant/`
```
lib/prompts/templates/student-assistant/
├── system.md     # Core persona + capabilities
├── user.md       # User message template with context injection
└── tools.md      # Tool descriptions and usage guidelines
```

**System prompt structure:**
- Persona: Patient, knowledgeable tutor
- Context injection: `{{snippet:rag-context}}`, `{{snippet:active-slide}}`, `{{snippet:course-info}}`
- Output guidelines: Cite sources, use LaTeX for math, structured explanations
- Tool use policy: When to search vs. answer from memory

---

### Phase 2: PDF Generation

#### 2.1 Dependencies
```json
{
  "@react-pdf/renderer": "^4.x",
  "katex": "already installed",
  "html-to-image": "for diagram snapshots"
}
```

#### 2.2 PDF Templates — `lib/pdf/templates/`
```
lib/pdf/templates/
├── study-guide.tsx      # Multi-section study guide layout
├── formula-sheet.tsx    # Compact formula reference
├── flashcards.tsx       # Printable flashcard grid
├── summary.tsx          # Topic summary with key points
└── shared/
    ├── header.tsx       # Course info header
    ├── math-block.tsx   # LaTeX rendering for PDF
    └── citation.tsx     # Source citation formatting
```

#### 2.3 Generation Flow
```
Student requests PDF
  → Agent determines content (from conversation / RAG context)
  → Content structured as JSON (sections, formulas, key points)
  → React-PDF renders to buffer
  → Return download URL (Supabase storage or ephemeral)
```

---

### Phase 3: Sidebar UI

#### 3.1 Component Structure — `components/student-assistant/`
```
components/student-assistant/
├── student-assistant-panel.tsx    # Main sidebar panel container
├── chat-interface.tsx             # Message list + input
├── message-bubble.tsx             # Student/AI message rendering
├── context-indicator.tsx          # Shows active course/topic
├── tool-result-card.tsx           # Renders tool call results (citations, quiz)
├── pdf-download-card.tsx          # PDF generation status + download
├── mode-selector.tsx              # Q&A / Research / Study / Quiz modes
├── source-citation.tsx            # Inline citation with page/heading ref
├── quiz-interaction.tsx           # Interactive quiz question/answer
└── hooks/
    ├── use-student-chat.ts        # Chat state management + streaming
    ├── use-active-context.ts      # Derive topic from active scene
    └── use-study-history.ts       # Track topics studied (Dexie)
```

#### 3.2 Integration Points
- Sidebar toggle in the main layout (`app/layout.tsx` or `components/stage.tsx`)
- Context from active scene/slide (subscribe to Zustand store)
- Course selection awareness (reuse `use-courses` hook)
- Shared chat session persistence (Dexie, same pattern as agent editor)

#### 3.3 State Management
```typescript
// lib/store/student-assistant-store.ts
interface StudentAssistantState {
  isOpen: boolean
  mode: 'qa' | 'research' | 'study' | 'quiz'
  activeSessionId: string | null
  sessions: ChatSession[]
  activeCourseId: string | null
  topicContext: string | null
}
```

---

### Phase 4: Context & Intelligence

#### 4.1 Topic Detection
- Parse active slide content → extract key concepts
- Maintain sliding window of recent conversation topics
- Use lightweight classifier to route queries (textbook-answerable vs. needs web search)

#### 4.2 Adaptive Responses
- Track question difficulty and student understanding signals
- Adjust explanation depth (ELI5 → standard → detailed)
- Suggest related topics after answering

#### 4.3 Session Memory
- Per-course conversation history (Dexie/IndexedDB)
- Topic mastery tracking (which concepts asked about, correctness on quizzes)
- Study session summaries for continuity

---

## File Changes Required

### New Files
| Path | Purpose |
|------|---------|
| `app/api/student-assistant/chat/route.ts` | Main chat SSE endpoint |
| `app/api/student-assistant/generate-pdf/route.ts` | PDF generation endpoint |
| `app/api/student-assistant/research/route.ts` | Research aggregation endpoint |
| `lib/student-assistant/agent.ts` | Agent construction + tool registration |
| `lib/student-assistant/tools/` | Tool implementations |
| `lib/student-assistant/context-builder.ts` | RAG + scene context assembly |
| `lib/student-assistant/types.ts` | Shared types |
| `lib/pdf/templates/` | React-PDF templates |
| `lib/pdf/generator.ts` | PDF render orchestrator |
| `lib/prompts/templates/student-assistant/` | Prompt templates |
| `components/student-assistant/` | All UI components |
| `lib/store/student-assistant-store.ts` | Zustand store |
| `lib/hooks/use-student-assistant.ts` | Top-level hook |

### Modified Files
| Path | Change |
|------|--------|
| `app/layout.tsx` or `components/stage.tsx` | Add sidebar mount point |
| `package.json` | Add `@react-pdf/renderer` dependency |
| `lib/ai/providers.ts` | No change needed (reuse existing) |
| `lib/web-search/index.ts` | No change needed (reuse existing) |

---

## Technical Decisions

### Agent Framework Choice
**Recommendation: Vercel AI SDK `streamText` + tool calling** (not pi-agent-core)

Rationale:
- pi-agent-core is used for the editor agent (slide-editing focus, heavy tool protocol)
- Student assistant needs simpler tool calling + fast streaming
- Vercel AI SDK v6 natively supports tool calls, structured output, streaming
- Lighter weight, fewer abstractions for a Q&A use case
- Consistent with the chat API pattern already in the codebase

### PDF Generation Choice
**Recommendation: `@react-pdf/renderer`**

Rationale:
- Server-side rendering (no browser needed)
- React component model (familiar, composable)
- Good math/text layout support
- No Puppeteer dependency (heavy, needs Chrome)
- Works in serverless/Edge with some config

### Vector Search Enhancement
**Reuse existing Qdrant setup** with improvements:
- Expand context window (±2 neighbor chunks, per RAG_INTEGRATION_PLAN Phase 1)
- Add metadata filtering by `course_id` for scoped searches
- Consider hybrid search (keyword + semantic) for factual queries

### Storage for Generated PDFs
**Supabase Storage** — new bucket `student-materials`
- Ephemeral (auto-delete after 24h) for on-demand generations
- Persistent for saved study guides

---

## Milestones

| # | Milestone | Scope | Est. Effort |
|---|-----------|-------|-------------|
| 1 | Basic Q&A agent | Chat route + RAG search + streaming UI | Core |
| 2 | Sidebar panel | Component shell + mode selector + context display | Core |
| 3 | Tool calling | search_textbook + web_search + explain_concept | Core |
| 4 | PDF generation | React-PDF templates + generation route + download | Medium |
| 5 | Quiz mode | Question generation + interactive grading | Medium |
| 6 | Research mode | Multi-source aggregation + citation | Medium |
| 7 | Adaptive intelligence | Topic tracking + difficulty adjustment | Polish |
| 8 | Session persistence | Dexie storage + cross-session continuity | Polish |

---

## Open Questions

1. **Sidebar placement**: Right panel (alongside existing chat) or replace it contextually?
2. **Auth scope**: Should the assistant require access code / login, or work anonymously?
3. **Rate limiting**: Per-student quotas on AI calls and PDF generation?
4. **Offline support**: Cache common answers/study materials for offline access?
5. **Multi-language**: Should responses match the UI language or textbook language?
6. **Voice interaction**: Add STT input (existing `use-browser-asr`) for hands-free Q&A?

---

## Dependencies to Install

```bash
pnpm add @react-pdf/renderer
# Optional for richer PDF:
pnpm add svg-to-pdfkit
```

All other dependencies (Qdrant, AI SDK, web search, embeddings) are already installed.

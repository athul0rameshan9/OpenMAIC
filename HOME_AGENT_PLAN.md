# Home Page Chat Agent + Google Calendar Integration Plan

## Impact Analysis: Will This Break Anything?

### ✅ SAFE — No Breaking Changes

| Area | Why It's Safe |
|------|---------------|
| **Multiple `useChat` hooks** | Each `useChat` instance from `@ai-sdk/react` is fully independent — own state, own transport. The existing student assistant's `useChat` won't be affected. |
| **API routes** | New `/api/home-agent/*` namespace has zero collision with existing routes (`/api/student-assistant/`, `/api/chat/`, `/api/courses/`) |
| **Docker** | Only port 3000 is allocated; no additional services needed |
| **Zustand stores** | Each store uses its own `persist` key in localStorage. New store just needs a unique key (e.g., `'home-agent-storage'`) |
| **Vercel deployment** | `vercel.json` allows 300s max duration for all `/api/**` routes — sufficient for streaming chat + calendar calls |
| **Existing student assistant** | Lives only inside `components/stage.tsx` (classroom view). It never renders on the home page. Completely isolated. |
| **Existing classroom chat** | Uses a custom agent loop (`runAgentLoop` + `StreamBuffer`), not `useChat`. Separate system entirely. |

### ⚠️ NEEDS CARE — Not Breaking But Requires Attention

| Area | Issue | Mitigation |
|------|-------|------------|
| **Middleware (OAuth callback)** | Google OAuth redirects back to our app without the `openmaic_access` cookie → 401 | Whitelist `/api/auth/google/callback` in `middleware.ts` |
| **Home page layout** | Uses inline styles + `v1-*` classes, not standard Tailwind layout. Adding a chat panel needs careful positioning | Use floating overlay pattern (not sidebar) to avoid layout refactor |
| **z-index layering** | Student assistant panel uses `z-50`. If both could theoretically render on same page | Use `z-40` for home agent (it only shows on home page where student assistant doesn't render) |
| **Dark mode** | Home page hardcodes `background: '#ffffff'` inline — a Tailwind `bg-background` widget would mismatch in dark mode | Match the inline style approach for the chat panel, or use CSS variables |
| **No per-user auth** | App uses site-wide access code only. Google OAuth needs per-user token storage | Introduce a lightweight user identity (browser-generated UUID persisted in localStorage + Supabase) |
| **Vercel stateless functions** | Serverless functions are stateless | Direct Google Calendar REST API calls via `@googleapis/calendar` — each request makes simple HTTP calls, no persistent connections needed |
| **Zod 4 compatibility** | Project uses Zod 4.3.5; `googleapis` package should work fine but verify | Test in dev before deploying |
| **Bundle size** | `googleapis` package is large (~1.5MB) | Use `@googleapis/calendar` (tree-shakeable single-service package) instead |
| **`GOOGLE_API_KEY` confusion** | Already exists for Gemini LLM | Name calendar vars `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` to disambiguate |

### ✅ Design Decisions (Resolved)

| Area | Approach |
|------|----------|
| Google Calendar integration | Direct REST API via `@googleapis/calendar` — simple HTTP calls per request, works perfectly in serverless, supports recurring events/RRULE, batch operations, and all Calendar API features |
| Per-user token storage | Lightweight user identity: generate UUID on first visit, store in localStorage + cookie, link to Supabase `user_identities` table |

---

## Recommended Architecture (Vercel-Compatible)

```
┌─────────────────────────────────────────────────────┐
│ Frontend (Home Page)                                 │
│  ┌────────────┐  ┌──────────────────────────────┐   │
│  │ Chat Agent │  │ Calendar Widget (week view)   │   │
│  │ (floating) │  │                              │   │
│  └─────┬──────┘  └──────────┬───────────────────┘   │
│        │                    │                        │
└────────┼────────────────────┼────────────────────────┘
         │ SSE stream         │ REST
         ▼                    ▼
┌─────────────────────────────────────────────────────┐
│ API Routes (Next.js Serverless)                      │
│                                                      │
│  /api/home-agent/chat     → streamText + tools       │
│  /api/home-agent/events   → fetch calendar events    │
│  /api/auth/google/connect → initiate OAuth flow      │
│  /api/auth/google/callback→ store tokens             │
│                                                      │
│  Tools (called by LLM):                              │
│   • query_courses → Supabase courses table           │
│   • search_content → Qdrant RAG                      │
│   • calendar_list_events → Google Calendar REST API  │
│   • calendar_create_event → Google Calendar REST API │
│   •   (supports RRULE for recurring timetables)      │
│   • calendar_get_freebusy → Google Calendar REST API │
│   • calendar_search_events → Google Calendar REST API│
│   • calendar_update_event → Google Calendar REST API │
│   • calendar_delete_event → Google Calendar REST API │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌──────────────┐     ┌──────────────────┐
│   Supabase   │     │ Google Calendar  │
│ • courses    │     │ API (REST)       │
│ • user_tokens│     │ via OAuth2       │
│ • chat_hist  │     │                  │
└──────────────┘     └──────────────────┘
```

---

## Implementation Tasks (Ordered)

### Phase 0: Prerequisites & Setup

| # | Task | Details | Dependencies |
|---|------|---------|--------------|
| 0.1 | **Create Google Cloud OAuth credentials** | Go to Google Cloud Console → Create project → Enable Calendar API → Create OAuth 2.0 Web credentials → Add `http://localhost:3000/api/auth/google/callback` as redirect URI | None |
| 0.2 | **Add environment variables** | Add to `.env.local`: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `ENCRYPTION_KEY` (for token encryption) | 0.1 |
| 0.3 | **Install dependencies** | `pnpm add @googleapis/calendar google-auth-library @schedule-x/react @schedule-x/theme-default date-fns` | None |
| 0.4 | **Create Supabase tables** | `user_identities` (id, browser_uuid, created_at) + `user_oauth_tokens` (id, user_id, provider, encrypted_refresh_token, encrypted_access_token, expires_at, scopes, created_at) | None |

### Phase 1: User Identity & OAuth (Backend)

| # | Task | Details | Dependencies |
|---|------|---------|--------------|
| 1.1 | **Create user identity utility** | `lib/home-agent/user-identity.ts` — generates/reads a UUID from cookies, creates matching Supabase row on first visit | 0.4 |
| 1.2 | **Create token encryption utility** | `lib/home-agent/token-encryption.ts` — AES-256-GCM encrypt/decrypt for OAuth tokens using `ENCRYPTION_KEY` env var | 0.2 |
| 1.3 | **Create OAuth initiation route** | `app/api/auth/google/connect/route.ts` — generates OAuth URL with state parameter (user_id), redirects to Google | 0.1, 1.1 |
| 1.4 | **Create OAuth callback route** | `app/api/auth/google/callback/route.ts` — exchanges code for tokens, encrypts & stores in Supabase, redirects back to home page | 1.2, 1.3 |
| 1.5 | **Whitelist OAuth route in middleware** | Add `/api/auth/` to the bypass list in `middleware.ts` | 1.4 |
| 1.6 | **Create token refresh utility** | `lib/home-agent/google-auth.ts` — gets valid access token (refreshes if expired), used by calendar tools | 1.2 |

### Phase 2: Google Calendar Tools (Backend)

| # | Task | Details | Dependencies |
|---|------|---------|--------------|
| 2.1 | **Create calendar client factory** | `lib/home-agent/calendar-client.ts` — creates authenticated `@googleapis/calendar` client from stored tokens | 1.6 |
| 2.2 | **Create calendar tools for AI SDK** | `lib/home-agent/tools/calendar-tools.ts` — define Vercel AI SDK `tool()` definitions: `calendar_list_events`, `calendar_create_event` (with RRULE support for recurring timetables), `calendar_get_freebusy`, `calendar_search_events`, `calendar_update_event`, `calendar_delete_event`. Supports: periodic schedules, multi-month timetables, recurring study sessions via RFC 5545 recurrence rules | 2.1 |
| 2.3 | **Create course tools** | `lib/home-agent/tools/course-tools.ts` — `query_courses` (fetches from Supabase), `search_course_content` (Qdrant RAG search) | None |
| 2.4 | **Create calendar events API route** | `app/api/home-agent/events/route.ts` — direct event fetch for the calendar widget (not through LLM) | 2.1 |

### Phase 3: Chat Agent (Backend)

| # | Task | Details | Dependencies |
|---|------|---------|--------------|
| 3.1 | **Create system prompt builder** | `lib/home-agent/system-prompt.ts` — builds prompt with: agent persona, active course list, calendar context, current date/time, instructions for study planning | 2.3 |
| 3.2 | **Create chat API route** | `app/api/home-agent/chat/route.ts` — SSE endpoint using `streamText` with all tools (calendar + courses), model resolved via existing `resolveModel` | 2.2, 2.3, 3.1 |
| 3.3 | **Create Zustand store** | `lib/store/home-agent.ts` — persist key `'home-agent-storage'`, stores: chat sessions, calendar connection status, selected course filter | None |

### Phase 4: Frontend — Chat Panel

| # | Task | Details | Dependencies |
|---|------|---------|--------------|
| 4.1 | **Create chat panel component** | `components/home-agent/home-agent-chat.tsx` — floating panel (bottom-right), expandable/collapsible, uses `useChat` pointed at `/api/home-agent/chat` | 3.2, 3.3 |
| 4.2 | **Create message components** | `components/home-agent/message-bubble.tsx` — renders user/AI messages, tool call results (event cards, course chips) | 4.1 |
| 4.3 | **Create Google Calendar connect button** | `components/home-agent/google-calendar-connect.tsx` — shows connect/disconnect status, initiates OAuth flow | 1.3 |
| 4.4 | **Create suggested prompts** | `components/home-agent/suggested-prompts.tsx` — contextual suggestions: "Plan study for [course]", "What's on my calendar today?", "Help me with [course topic]" | 4.1 |
| 4.5 | **Create event card component** | `components/home-agent/study-event-card.tsx` — rendered in chat when calendar events are shown/created | 4.2 |
| 4.6 | **Integrate chat panel into home page** | Modify `app/page.tsx` — add `<HomeAgentChat />` as a floating overlay (z-40, bottom-right) | 4.1 |

### Phase 5: Frontend — Calendar Widget

| # | Task | Details | Dependencies |
|---|------|---------|--------------|
| 5.1 | **Create calendar widget** | `components/home-agent/calendar-widget.tsx` — week view using `@schedule-x/react`, fetches events from `/api/home-agent/events`, color-coded by course | 2.4, 0.3 |
| 5.2 | **Create calendar toggle/tab on home page** | Add a "My Schedule" tab or section on the home page that shows the calendar widget when Google Calendar is connected | 5.1 |
| 5.3 | **Integrate calendar into home page** | Modify `app/page.tsx` — add calendar widget (likely as a new tab alongside "Classroom" and "Free Prompt" in the left panel, or as a section in the right content area) | 5.1, 5.2 |

### Phase 6: Polish & Safety

| # | Task | Details | Dependencies |
|---|------|---------|--------------|
| 6.1 | **Add confirmation for destructive actions** | When LLM wants to create/update/delete events, render a confirmation card in chat before executing | 4.5 |
| 6.2 | **Add error handling** | Token expiry toast, Google API errors, rate limit handling, graceful degradation when calendar not connected | All |
| 6.3 | **Add i18n translations** | Add keys to translation files for all new UI text | All |
| 6.4 | **Mobile responsive layout** | Ensure chat panel and calendar work on mobile (full-screen overlay on small screens) | 4.6, 5.3 |
| 6.5 | **Write tests** | Unit tests for tools, integration test for OAuth flow, component tests for chat panel | All |

---

## File Structure (New Files Only)

```
lib/home-agent/
├── user-identity.ts              # Browser UUID generation & cookie management
├── token-encryption.ts           # AES-256-GCM encrypt/decrypt for tokens
├── google-auth.ts                # OAuth token refresh & client creation
├── calendar-client.ts            # Google Calendar API client factory
├── system-prompt.ts              # System prompt builder with course context
├── types.ts                      # Types for home agent
└── tools/
    ├── calendar-tools.ts         # AI SDK tool() definitions for calendar
    └── course-tools.ts           # AI SDK tool() definitions for courses

app/api/home-agent/
├── chat/route.ts                 # SSE streaming chat endpoint
└── events/route.ts               # Direct event fetch for widget

app/api/auth/google/
├── connect/route.ts              # Initiates OAuth flow
└── callback/route.ts             # OAuth callback handler

components/home-agent/
├── home-agent-chat.tsx           # Main floating chat panel
├── message-bubble.tsx            # Chat message rendering
├── google-calendar-connect.tsx   # OAuth connect/disconnect UI
├── suggested-prompts.tsx         # Contextual prompt suggestions
├── study-event-card.tsx          # Calendar event card in chat
└── calendar-widget.tsx           # Week view calendar component

lib/store/home-agent.ts           # Zustand store (persist: 'home-agent-storage')
```

---

## Environment Variables (New)

```bash
# Google Calendar OAuth (NOT the same as GOOGLE_API_KEY for Gemini)
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Encryption key for storing OAuth tokens (generate with: openssl rand -hex 32)
TOKEN_ENCRYPTION_KEY=

# Optional: override model for home agent (falls back to DEFAULT_MODEL)
HOME_AGENT_MODEL=
```

---

## Supabase Schema (New Tables)

```sql
-- Lightweight user identity (since app has no user accounts)
CREATE TABLE user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_uuid TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Google OAuth tokens per user (encrypted at rest)
CREATE TABLE user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_identities(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google_calendar',
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Optional: server-side chat history
CREATE TABLE home_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_identities(id) ON DELETE CASCADE,
  title TEXT,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_agent_sessions ENABLE ROW LEVEL SECURITY;
```

---

## Middleware Change (Single Edit)

In `middleware.ts`, add to the early-return whitelist:
```typescript
if (pathname.startsWith('/api/access-code/') || pathname === '/api/health'
    || pathname.startsWith('/api/auth/')) {
  return NextResponse.next();
}
```

---

## Google Calendar API Capabilities (Direct REST)

The `@googleapis/calendar` package provides full access to all Calendar features:

| Feature | How |
|---------|-----|
| **Single event** | `events.insert()` with start/end datetime |
| **Recurring timetable** | `events.insert()` with `recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=24']` |
| **2-month study plan** | Single API call with RRULE `UNTIL` or `COUNT` parameter |
| **Periodic without specific dates** | LLM checks freebusy → picks slots → creates recurring event |
| **Check availability** | `freebusy.query()` across date range |
| **Batch creation** | Multiple `events.insert()` calls (~600/min rate limit) |
| **Color-coded by course** | `colorId` field on events (12 colors available) |
| **Update/reschedule** | `events.update()` or `events.patch()` |
| **Delete single or series** | `events.delete()` with optional `sendUpdates` |

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Calendar API approach | Direct `@googleapis/calendar` REST calls | Simple HTTP calls per request. Supports all features: recurring events, RRULE, batch ops, freebusy, colors. Works perfectly in serverless |
| User identity | Browser UUID in cookie + Supabase `user_identities` table | No full auth system exists; this is the lightest-weight user identification that supports OAuth token storage |
| Chat panel placement | Floating bottom-right overlay (z-40) | Avoids layout changes to existing home page; non-intrusive; similar to Intercom/Drift pattern |
| Calendar widget placement | New "My Schedule" tab in left sidebar (alongside Classroom/Free Prompt) | Reuses existing tab pattern; doesn't require home page layout restructuring |
| Model selection | Same model as configured in settings (via `resolveModel`) | No extra configuration needed; user's preferred model powers the agent |
| LLM tool confirmation | Required for create/update/delete; not for read operations | Prevents unintended calendar modifications |

---

## Risk Assessment Summary

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| OAuth token expiry in test mode | High | Medium | Document: must publish OAuth app for production. Add auto-refresh logic |
| Home page layout breakage | Low | High | Floating overlay only, no changes to existing DOM structure |
| Student assistant conflict | None | N/A | Completely separate: different component tree, different store, different API route |
| Bundle size increase | Medium | Low | Use `@googleapis/calendar` (single service) not full `googleapis` |
| Google API rate limits | Low | Medium | Cache events for widget (5min TTL), batch operations |
| Vercel cold starts | Medium | Low | Calendar API calls are fast (~200ms); acceptable latency |

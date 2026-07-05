/**
 * Student Assistant Store
 * Manages sidebar state, sessions, and active context
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssistantMode, ChatSession, StudentMessage } from '@/lib/student-assistant/types';
import { nanoid } from 'nanoid';

export interface StudentAssistantState {
  isOpen: boolean;
  mode: AssistantMode;
  activeSessionId: string | null;
  sessions: ChatSession[];
  activeCourseId: string | null;
  activeTextbookId: string | null;
  topicContext: string | null;
  isStreaming: boolean;
}

export interface StudentAssistantActions {
  toggle: () => void;
  open: () => void;
  close: () => void;
  setMode: (mode: AssistantMode) => void;
  setCourseContext: (courseId: string | null, textbookId?: string | null) => void;
  setTopicContext: (topic: string | null) => void;

  // Session management
  createSession: (mode?: AssistantMode) => string;
  deleteSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;

  // Messages
  addMessage: (sessionId: string, message: Omit<StudentMessage, 'id' | 'timestamp'>) => void;
  updateLastAssistantMessage: (sessionId: string, content: string) => void;
  setStreaming: (streaming: boolean) => void;

  // Active session helper
  getActiveSession: () => ChatSession | null;
}

export const useStudentAssistantStore = create<StudentAssistantState & StudentAssistantActions>()(
  persist(
    (set, get) => ({
      // State
      isOpen: false,
      mode: 'qa',
      activeSessionId: null,
      sessions: [],
      activeCourseId: null,
      activeTextbookId: null,
      topicContext: null,
      isStreaming: false,

      // Actions
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setMode: (mode) => set({ mode }),
      setCourseContext: (courseId, textbookId) =>
        set({ activeCourseId: courseId, activeTextbookId: textbookId ?? null }),
      setTopicContext: (topic) => set({ topicContext: topic }),

      createSession: (mode) => {
        const id = nanoid();
        const session: ChatSession = {
          id,
          courseId: get().activeCourseId,
          title: 'New Chat',
          messages: [],
          mode: mode ?? get().mode,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionId: id,
        }));
        return id;
      },

      deleteSession: (sessionId) =>
        set((s) => {
          const filtered = s.sessions.filter((sess) => sess.id !== sessionId);
          let nextActiveId = s.activeSessionId;
          if (s.activeSessionId === sessionId) {
            const deletedIndex = s.sessions.findIndex((sess) => sess.id === sessionId);
            nextActiveId = filtered[Math.min(deletedIndex, filtered.length - 1)]?.id ?? null;
          }
          return { sessions: filtered, activeSessionId: nextActiveId };
        }),

      setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

      addMessage: (sessionId, message) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: [
                    ...sess.messages,
                    { ...message, id: nanoid(), timestamp: Date.now() },
                  ],
                  updatedAt: Date.now(),
                  // Auto-title from first user message
                  title:
                    sess.messages.length === 0 && message.role === 'user'
                      ? message.content.slice(0, 50)
                      : sess.title,
                }
              : sess,
          ),
        })),

      updateLastAssistantMessage: (sessionId, content) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess;
            const messages = [...sess.messages];
            const lastIdx = messages.length - 1;
            if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
              messages[lastIdx] = { ...messages[lastIdx], content };
            }
            return { ...sess, messages, updatedAt: Date.now() };
          }),
        })),

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      getActiveSession: () => {
        const { activeSessionId, sessions } = get();
        return sessions.find((s) => s.id === activeSessionId) ?? null;
      },
    }),
    {
      name: 'student-assistant-storage',
      partialize: (state) => ({
        sessions: state.sessions.slice(0, 50), // Keep last 50 sessions
        activeCourseId: state.activeCourseId,
        activeTextbookId: state.activeTextbookId,
        mode: state.mode,
      }),
    },
  ),
);

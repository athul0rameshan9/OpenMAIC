'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useStudentAssistantStore } from '@/lib/store/student-assistant';
import { useSettingsStore } from '@/lib/store/settings';
import { useStageStore } from '@/lib/store/stage';
import { extractSlideContent } from '@/lib/student-assistant/extract-slide-content';

/**
 * Extract text content from UIMessage parts.
 */
function getMessageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('');
}

export function useStudentAssistant() {
  const mode = useStudentAssistantStore((s) => s.mode);
  const activeCourseId = useStudentAssistantStore((s) => s.activeCourseId);
  const activeTextbookId = useStudentAssistantStore((s) => s.activeTextbookId);
  const activeSessionId = useStudentAssistantStore((s) => s.activeSessionId);
  const createSession = useStudentAssistantStore((s) => s.createSession);
  const addMessage = useStudentAssistantStore((s) => s.addMessage);
  const setStreaming = useStudentAssistantStore((s) => s.setStreaming);

  const [error, setError] = useState<Error | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const providerId = useSettingsStore((s) => s.providerId);
  const modelId = useSettingsStore((s) => s.modelId);
  const providersConfig = useSettingsStore((s) => s.providersConfig);

  const provider = providersConfig[providerId];
  const model = `${providerId}/${modelId}`;
  const apiKey = provider?.apiKey ?? '';
  const baseUrl = provider?.baseUrl ?? '';

  const currentScene = useStageStore((s) => {
    if (!s.currentSceneId) return null;
    return s.scenes.find((sc) => sc.id === s.currentSceneId) ?? null;
  });
  const sceneIndex = useStageStore((s) => {
    if (!s.currentSceneId) return -1;
    return s.scenes.findIndex((sc) => sc.id === s.currentSceneId);
  });

  const activeSlideContent = useMemo(() => {
    if (!currentScene) return undefined;
    return extractSlideContent(currentScene, sceneIndex);
  }, [currentScene, sceneIndex]);

  const sessionRef = useRef(activeSessionId);
  const prevSessionRef = useRef(activeSessionId);
  useEffect(() => {
    sessionRef.current = activeSessionId;
  }, [activeSessionId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/student-assistant/chat',
        body: {
          mode,
          courseId: activeCourseId,
          textbookId: activeTextbookId,
          activeSlideContent,
          model,
          apiKey,
          baseUrl,
          providerType: provider?.type,
        },
      }),
    [mode, activeCourseId, activeTextbookId, activeSlideContent, model, apiKey, baseUrl, provider?.type],
  );

  const { messages, sendMessage, stop, status, setMessages } = useChat({
    transport,
    onError: (err) => {
      setError(err);
      setStreaming(false);
    },
    onFinish: ({ message }) => {
      const sid = sessionRef.current;
      if (sid) {
        const text = getMessageText(message.parts as Array<{ type: string; text?: string }>);
        addMessage(sid, { role: 'assistant', content: text });
      }
      setStreaming(false);
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    if (activeSessionId !== prevSessionRef.current) {
      prevSessionRef.current = activeSessionId;
      setMessages([]);
    }
  }, [activeSessionId, setMessages]);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      let sid = sessionRef.current;
      if (!sid) {
        sid = createSession(mode);
      }

      addMessage(sid, { role: 'user', content: text });
      setStreaming(true);
      await sendMessage({ text });
    },
    [createSession, mode, addMessage, setStreaming, sendMessage],
  );

  return {
    messages,
    handleSubmit,
    isLoading,
    stop,
    setMessages,
    getMessageText,
    error,
    clearError,
  };
}

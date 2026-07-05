'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Send, Square, Loader2, Sparkles, BookOpen, Search, HelpCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './message-bubble';
import { useStudentAssistant } from '@/lib/hooks/use-student-assistant';
import { useStudentAssistantStore } from '@/lib/store/student-assistant';
import type { StudentMessage } from '@/lib/student-assistant/types';

const SUGGESTIONS = {
  qa: ['Explain this concept', 'What does this mean?', 'Give me an example'],
  research: ['Research this topic', 'Compare these concepts', 'Find recent developments'],
  study: ['Summarize this chapter', 'Create flashcards', 'Key formulas to remember'],
  quiz: ['Quiz me on this topic', 'Give me practice questions', 'Test my understanding'],
};

const EMPTY_STATE_CONFIG: Record<string, { icon: typeof Sparkles; title: string }> = {
  qa: { icon: Sparkles, title: 'Ask me anything' },
  research: { icon: Search, title: "Let's research together" },
  study: { icon: BookOpen, title: 'Ready to study' },
  quiz: { icon: HelpCircle, title: 'Test your knowledge' },
};

export function ChatInterface() {
  const { messages, handleSubmit, isLoading, stop, getMessageText, error, clearError } = useStudentAssistant();
  const activeSession = useStudentAssistantStore((s) => {
    const session = s.sessions.find((sess) => sess.id === s.activeSessionId);
    return session ?? null;
  });
  const mode = useStudentAssistantStore((s) => s.mode);

  const [input, setInput] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = el.scrollHeight > 100 ? 'auto' : 'hidden';
  }, [input]);

  const displayMessages: StudentMessage[] = useMemo(() => {
    if (activeSession && activeSession.messages.length > 0 && messages.length === 0) {
      return activeSession.messages;
    }
    // When streaming, convert UIMessage parts to StudentMessage format
    return messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant' | 'system',
      content: getMessageText(m.parts as Array<{ type: string; text?: string }>),
      timestamp: 0,
    }));
  }, [activeSession, messages, getMessageText]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    const lastMessage = displayMessages[displayMessages.length - 1];
    if (isNearBottom || lastMessage?.role === 'user') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeSession?.messages, isLoading, displayMessages]);

  const onSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    clearError();
    handleSubmit(input);
    setInput('');
  }, [input, isLoading, handleSubmit]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    handleSubmit(suggestion);
  }, [handleSubmit]);

  const emptyState = EMPTY_STATE_CONFIG[mode] ?? EMPTY_STATE_CONFIG.qa;
  const EmptyIcon = emptyState.icon;
  const hasMessages = displayMessages.length > 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          /* Empty state */
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <EmptyIcon className="size-6 text-primary" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-medium text-foreground">{emptyState.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask questions about your course, get explanations, or test your knowledge.
              </p>
            </div>
            {/* Quick suggestions */}
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {SUGGESTIONS[mode].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages list */
          <div className="flex flex-col gap-3 px-4 py-3">
            {displayMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span className="text-xs">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-background/80 backdrop-blur-sm p-3">
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive mb-2">
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="flex-1">{error.message || 'Something went wrong'}</span>
            <button onClick={clearError} className="shrink-0 underline hover:no-underline">Dismiss</button>
          </div>
        )}
        <form onSubmit={onSubmit}>
          <div className="flex items-end gap-2 rounded-lg border border-input bg-background p-1 focus-within:ring-1 focus-within:ring-ring">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Ask a question..."
              rows={1}
              disabled={isLoading}
              className={cn(
                'flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none',
                'placeholder:text-muted-foreground',
                'max-h-[100px] min-h-[32px]',
                'disabled:opacity-50',
              )}
            />
            {isLoading ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={stop}
                className="shrink-0"
                aria-label="Stop generating"
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-xs"
                disabled={!input.trim()}
                className="shrink-0"
                aria-label="Send message"
              >
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
        </form>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/60">
          Responses may be inaccurate. Verify important information.
        </p>
      </div>
    </div>
  );
}

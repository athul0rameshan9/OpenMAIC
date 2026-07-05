'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X, Plus, Trash2, MessageSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useStudentAssistantStore } from '@/lib/store/student-assistant';
import { ModeSelector } from './mode-selector';
import { ChatInterface } from './chat-interface';

export function StudentAssistantPanel() {
  const isOpen = useStudentAssistantStore((s) => s.isOpen);
  const close = useStudentAssistantStore((s) => s.close);
  const sessions = useStudentAssistantStore((s) => s.sessions);
  const activeSessionId = useStudentAssistantStore((s) => s.activeSessionId);
  const createSession = useStudentAssistantStore((s) => s.createSession);
  const setActiveSession = useStudentAssistantStore((s) => s.setActiveSession);
  const deleteSession = useStudentAssistantStore((s) => s.deleteSession);
  const mode = useStudentAssistantStore((s) => s.mode);

  const panelRef = useRef<HTMLDivElement>(null);

  const handleNewChat = () => {
    createSession(mode);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          ref={panelRef}
          tabIndex={-1}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'fixed right-0 top-0 z-50 flex h-full w-full sm:w-[420px] max-w-full flex-col',
            'border-l border-border bg-background shadow-2xl',
          )}
        >
          {/* Header */}
          <div className="flex flex-col gap-3 border-b border-border px-4 pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Study Assistant</h2>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleNewChat}
                  title="New chat"
                  aria-label="New chat"
                >
                  <Plus className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={close} title="Close" aria-label="Close assistant">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <ModeSelector />
          </div>

          {/* Session tabs (show when multiple sessions) */}
          {sessions.length > 1 && (
            <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 scrollbar-none">
              {sessions.slice(0, 10).map((session) => (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveSession(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveSession(session.id);
                    }
                  }}
                  className={cn(
                    'group flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors cursor-pointer',
                    session.id === activeSessionId
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span className="max-w-[100px] truncate">
                    {session.title || 'New Chat'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Chat */}
          <ChatInterface />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

'use client';

import { cn } from '@/lib/utils';
import { useStudentAssistantStore } from '@/lib/store/student-assistant';
import { MessageCircle, Search, BookOpen, HelpCircle } from 'lucide-react';
import type { AssistantMode } from '@/lib/student-assistant/types';

const modes: { id: AssistantMode; label: string; icon: typeof MessageCircle }[] = [
  { id: 'qa', label: 'Q&A', icon: MessageCircle },
  { id: 'research', label: 'Research', icon: Search },
  { id: 'study', label: 'Study', icon: BookOpen },
  { id: 'quiz', label: 'Quiz', icon: HelpCircle },
];

export function ModeSelector() {
  const mode = useStudentAssistantStore((s) => s.mode);
  const setMode = useStudentAssistantStore((s) => s.setMode);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const currentIndex = modes.findIndex((m) => m.id === mode);
    const nextIndex =
      e.key === 'ArrowRight'
        ? (currentIndex + 1) % modes.length
        : (currentIndex - 1 + modes.length) % modes.length;
    setMode(modes[nextIndex].id);
    const tabs = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[nextIndex]?.focus();
  };

  return (
    <div role="tablist" onKeyDown={handleKeyDown} className="flex gap-1 rounded-lg bg-muted p-1">
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={mode === id}
          onClick={() => setMode(id)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
            mode === id
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

'use client';

import type { UIMessage } from 'ai';
import { cn } from '@/lib/utils';
import { User, Bot } from 'lucide-react';
import { StudyEventCard } from './study-event-card';

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  // Extract text from parts
  const textContent = message.parts
    ?.filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('') || '';

  // Extract tool invocations from parts
  const toolParts = message.parts?.filter((p) => p.type === 'tool-invocation') || [];

  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        isUser ? 'bg-gray-200 dark:bg-gray-700' : 'bg-blue-100 dark:bg-blue-900'
      )}>
        {isUser ? (
          <User className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        )}
      </div>
      <div className={cn(
        'max-w-[80%] rounded-xl px-3 py-2 text-sm',
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
      )}>
        {textContent && <p className="whitespace-pre-wrap">{textContent}</p>}
        
        {/* Render tool invocation results */}
        {toolParts.map((part, i) => {
          const invocation = part as unknown as { type: 'tool-invocation'; toolInvocation: { state: string; toolName: string; result?: unknown } };
          const { toolInvocation } = invocation;
          if (toolInvocation.state === 'result') {
            const result = toolInvocation.result as Record<string, unknown>;
            if (toolInvocation.toolName.startsWith('calendar_') && result.events) {
              return (
                <div key={i} className="mt-2 space-y-1">
                  {(result.events as Array<Record<string, unknown>>).slice(0, 5).map((event, j) => (
                    <StudyEventCard key={j} event={event} />
                  ))}
                </div>
              );
            }
            if (toolInvocation.toolName === 'calendar_create_event' && result.success) {
              return (
                <div key={i} className="mt-2">
                  <StudyEventCard event={result.event as Record<string, unknown>} created />
                </div>
              );
            }
          }
          return null;
        })}
      </div>
    </div>
  );
}

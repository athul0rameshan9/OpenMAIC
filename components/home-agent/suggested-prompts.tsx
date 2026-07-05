'use client';

import { Sparkles, Calendar, BookOpen, Clock } from 'lucide-react';

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

const suggestions = [
  {
    icon: Calendar,
    text: "What's on my calendar today?",
    color: 'text-blue-500',
  },
  {
    icon: BookOpen,
    text: 'Help me plan a study schedule',
    color: 'text-purple-500',
  },
  {
    icon: Clock,
    text: 'Find free time for studying this week',
    color: 'text-green-500',
  },
  {
    icon: Sparkles,
    text: 'Suggest topics to review',
    color: 'text-amber-500',
  },
];

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="space-y-3 py-4">
      <div className="text-center">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          How can I help you study?
        </h4>
        <p className="mt-1 text-xs text-gray-500">
          I can help plan schedules, manage your calendar, and find course content.
        </p>
      </div>
      <div className="grid gap-2">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onSelect(suggestion.text)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <suggestion.icon className={`h-4 w-4 ${suggestion.color}`} />
            {suggestion.text}
          </button>
        ))}
      </div>
    </div>
  );
}

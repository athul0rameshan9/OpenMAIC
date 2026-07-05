'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useHomeAgentStore } from '@/lib/store/home-agent';
import { cn } from '@/lib/utils';

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
}

const COLORS: Record<string, string> = {
  '1': 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200',
  '2': 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200',
  '3': 'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200',
  '4': 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200',
  '5': 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200',
  '6': 'bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-200',
  '7': 'bg-cyan-200 text-cyan-800 dark:bg-cyan-800 dark:text-cyan-200',
  '8': 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  '9': 'bg-indigo-200 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-200',
  '10': 'bg-pink-200 text-pink-800 dark:bg-pink-800 dark:text-pink-200',
  '11': 'bg-teal-200 text-teal-800 dark:bg-teal-800 dark:text-teal-200',
  default: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

export function CalendarWidget() {
  const { calendarConnected } = useHomeAgentStore();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.setDate(diff));
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!calendarConnected) return;

    const fetchEvents = async () => {
      setLoading(true);
      const timeMin = weekStart.toISOString();
      const timeMax = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      try {
        const res = await fetch(`/api/home-agent/events?timeMin=${timeMin}&timeMax=${timeMax}`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch (err) {
        console.error('Failed to fetch events:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [weekStart, calendarConnected]);

  const navigateWeek = (direction: number) => {
    setWeekStart(new Date(weekStart.getTime() + direction * 7 * 24 * 60 * 60 * 1000));
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date;
  });

  if (!calendarConnected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
        <Calendar className="mb-3 h-10 w-10 text-gray-400" />
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Connect Google Calendar</h3>
        <p className="mt-1 text-xs text-gray-500">
          Link your calendar to see your schedule and plan study sessions.
        </p>
        <a
          href="/api/auth/google/connect"
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Connect Calendar
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <button onClick={() => navigateWeek(-1)} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button onClick={() => navigateWeek(1)} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 divide-x divide-gray-100 dark:divide-gray-800">
        {days.map((day, i) => {
          const isToday = day.toDateString() === new Date().toDateString();
          const dayEvents = events.filter((e) => {
            const eventDate = new Date(e.start.dateTime || e.start.date || '');
            return eventDate.toDateString() === day.toDateString();
          });

          return (
            <div key={i} className="min-h-[100px] p-1">
              <div className={cn(
                'mb-1 text-center text-xs',
                isToday ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-gray-500'
              )}>
                <div>{day.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                <div className={cn(
                  'mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday && 'bg-blue-600 text-white'
                )}>
                  {day.getDate()}
                </div>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className={cn(
                      'truncate rounded px-1 py-0.5 text-[10px] leading-tight',
                      COLORS[event.colorId || 'default'] || COLORS.default
                    )}
                    title={event.summary}
                  >
                    {event.summary}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-center text-[10px] text-gray-400">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

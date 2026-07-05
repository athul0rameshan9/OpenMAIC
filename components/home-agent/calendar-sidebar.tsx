'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, Clock, Loader2 } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { useHomeAgentStore } from '@/lib/store/home-agent';
import { cn } from '@/lib/utils';

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
}

const EVENT_COLORS: Record<string, string> = {
  '1': 'bg-blue-500',
  '2': 'bg-green-500',
  '3': 'bg-purple-500',
  '4': 'bg-red-500',
  '5': 'bg-yellow-500',
  '6': 'bg-orange-500',
  '7': 'bg-cyan-500',
  '8': 'bg-gray-500',
  '9': 'bg-indigo-500',
  '10': 'bg-pink-500',
  '11': 'bg-teal-500',
  default: 'bg-blue-500',
};

export function CalendarSidebar() {
  const { calendarConnected } = useHomeAgentStore();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [monthEvents, setMonthEvents] = useState<CalendarEvent[]>([]);
  const [dayEvents, setDayEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Fetch events for the entire visible month
  const fetchMonthEvents = useCallback(async (month: Date) => {
    if (!calendarConnected) return;

    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

    try {
      const res = await fetch(
        `/api/home-agent/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}`,
      );
      if (res.ok) {
        const data = await res.json();
        setMonthEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch month events:', err);
    }
  }, [calendarConnected]);

  // Fetch month events when month changes or calendar connects
  useEffect(() => {
    fetchMonthEvents(currentMonth);
  }, [currentMonth, fetchMonthEvents]);

  // Filter events for the selected date
  useEffect(() => {
    if (!selectedDate) {
      setDayEvents([]);
      return;
    }

    setLoading(true);
    const selected = selectedDate.toDateString();
    const filtered = monthEvents.filter((e) => {
      const eventDate = new Date(e.start.dateTime || e.start.date || '');
      return eventDate.toDateString() === selected;
    });
    setDayEvents(filtered);
    setLoading(false);
  }, [selectedDate, monthEvents]);

  // Get dates that have events (for dot indicators)
  const eventDates = monthEvents.reduce<Date[]>((acc, event) => {
    const date = new Date(event.start.dateTime || event.start.date || '');
    if (!acc.some((d) => d.toDateString() === date.toDateString())) {
      acc.push(date);
    }
    return acc;
  }, []);

  const formatEventTime = (event: CalendarEvent) => {
    const start = event.start.dateTime;
    if (!start) return 'All day';
    return new Date(start).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (!calendarConnected) {
    return (
      <aside
        className="flex flex-col shrink-0 border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
        style={{ width: '300px' }}
      >
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <CalendarIcon className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Connect Google Calendar
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
            Link your calendar to see your schedule and plan study sessions.
          </p>
          <a
            href="/api/auth/google/connect"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Connect Calendar
          </a>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex flex-col shrink-0 border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      style={{ width: '300px', overflow: 'hidden' }}
    >
      {/* Calendar header */}
      <div className="shrink-0 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Calendar</h2>
      </div>

      {/* Monthly calendar */}
      <div className="shrink-0 flex justify-center border-b border-gray-100 dark:border-gray-800">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => date && setSelectedDate(date)}
          onMonthChange={setCurrentMonth}
          modifiers={{ hasEvent: eventDates }}
          modifiersClassNames={{
            hasEvent: 'relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-violet-500',
          }}
          className="p-2"
        />
      </div>

      {/* Selected date events */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {selectedDate.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : dayEvents.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CalendarIcon className="mb-2 h-8 w-8 text-gray-200 dark:text-gray-700" />
            <p className="text-xs text-gray-400 dark:text-gray-500">No events for this day</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dayEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-gray-50/50 p-2.5 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50 dark:hover:bg-gray-800"
              >
                {/* Color indicator */}
                <div
                  className={cn(
                    'mt-1 h-2 w-2 shrink-0 rounded-full',
                    EVENT_COLORS[event.colorId || 'default'] || EVENT_COLORS.default,
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
                    {event.summary}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    {formatEventTime(event)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

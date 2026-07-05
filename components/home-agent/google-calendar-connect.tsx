'use client';

import { Calendar, Check } from 'lucide-react';
import { useHomeAgentStore } from '@/lib/store/home-agent';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export function GoogleCalendarConnect() {
  const { calendarConnected, setCalendarConnected } = useHomeAgentStore();

  useEffect(() => {
    // Check URL params for calendar connection status
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_connected') === 'true') {
      setCalendarConnected(true);
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('calendar_connected');
      window.history.replaceState({}, '', url.toString());
    }
    const error = params.get('calendar_error');
    if (error) {
      console.error('Calendar connection failed:', error);
      setCalendarConnected(false);
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('calendar_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [setCalendarConnected]);

  const handleConnect = () => {
    window.location.href = '/api/auth/google/connect';
  };

  return (
    <button
      onClick={calendarConnected ? undefined : handleConnect}
      className={cn(
        'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors',
        calendarConnected
          ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
      )}
      title={calendarConnected ? 'Google Calendar connected' : 'Connect Google Calendar'}
    >
      {calendarConnected ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Calendar className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

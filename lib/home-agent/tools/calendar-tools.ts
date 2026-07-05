import { tool } from 'ai';
import { z } from 'zod';
import { getCalendarClient } from '@/lib/home-agent/calendar-client';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createCalendarTools(userId: string, supabase: SupabaseClient) {
  return {
    calendar_list_events: tool({
      description: 'List upcoming events from the user\'s Google Calendar within a date range',
      inputSchema: z.object({
        timeMin: z.string().describe('Start of time range (ISO 8601 datetime)'),
        timeMax: z.string().describe('End of time range (ISO 8601 datetime)'),
        maxResults: z.number().optional().describe('Maximum number of events to return (default 20)'),
      }),
      execute: async (args: { timeMin: string; timeMax: string; maxResults?: number }) => {
        const { timeMin, timeMax, maxResults } = args;
        const cal = await getCalendarClient(userId, supabase);
        if (!cal) return { error: 'Calendar not connected. Please connect Google Calendar first.' };
        
        const response = await cal.events.list({
          calendarId: 'primary',
          timeMin,
          timeMax,
          maxResults: maxResults || 20,
          singleEvents: true,
          orderBy: 'startTime',
        });

        return { events: response.data.items || [] };
      },
    }),

    calendar_create_event: tool({
      description: 'Create a new event on the user\'s Google Calendar. Supports recurring events via RRULE.',
      inputSchema: z.object({
        summary: z.string().describe('Event title'),
        description: z.string().optional().describe('Event description'),
        startDateTime: z.string().describe('Start time (ISO 8601)'),
        endDateTime: z.string().describe('End time (ISO 8601)'),
        timeZone: z.string().optional().describe('Timezone (e.g. America/New_York)'),
        recurrence: z.array(z.string()).optional().describe('RRULE strings for recurring events, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=12"]'),
        colorId: z.string().optional().describe('Color ID (1-11) for the event'),
      }),
      execute: async (args: { summary: string; description?: string; startDateTime: string; endDateTime: string; timeZone?: string; recurrence?: string[]; colorId?: string }) => {
        const { summary, description, startDateTime, endDateTime, timeZone, recurrence, colorId } = args;
        const cal = await getCalendarClient(userId, supabase);
        if (!cal) return { error: 'Calendar not connected.' };

        const event: Record<string, unknown> = {
          summary,
          description,
          start: { dateTime: startDateTime, timeZone: timeZone || 'UTC' },
          end: { dateTime: endDateTime, timeZone: timeZone || 'UTC' },
        };
        if (recurrence) event.recurrence = recurrence;
        if (colorId) event.colorId = colorId;

        const response = await cal.events.insert({
          calendarId: 'primary',
          requestBody: event,
        });

        return { 
          success: true, 
          event: { id: response.data.id, summary: response.data.summary, htmlLink: response.data.htmlLink }
        };
      },
    }),

    calendar_get_freebusy: tool({
      description: 'Check free/busy times for a date range to find available slots for study sessions',
      inputSchema: z.object({
        timeMin: z.string().describe('Start of time range (ISO 8601)'),
        timeMax: z.string().describe('End of time range (ISO 8601)'),
      }),
      execute: async (args: { timeMin: string; timeMax: string }) => {
        const { timeMin, timeMax } = args;
        const cal = await getCalendarClient(userId, supabase);
        if (!cal) return { error: 'Calendar not connected.' };

        const response = await cal.freebusy.query({
          requestBody: {
            timeMin,
            timeMax,
            items: [{ id: 'primary' }],
          },
        });

        const busy = response.data.calendars?.primary?.busy || [];
        return { busySlots: busy, timeMin, timeMax };
      },
    }),

    calendar_update_event: tool({
      description: 'Update an existing calendar event',
      inputSchema: z.object({
        eventId: z.string().describe('The event ID to update'),
        summary: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        startDateTime: z.string().optional().describe('New start time (ISO 8601)'),
        endDateTime: z.string().optional().describe('New end time (ISO 8601)'),
        timeZone: z.string().optional().describe('Timezone'),
      }),
      execute: async (args: { eventId: string; summary?: string; description?: string; startDateTime?: string; endDateTime?: string; timeZone?: string }) => {
        const { eventId, summary, description, startDateTime, endDateTime, timeZone } = args;
        const cal = await getCalendarClient(userId, supabase);
        if (!cal) return { error: 'Calendar not connected.' };

        const patch: Record<string, unknown> = {};
        if (summary) patch.summary = summary;
        if (description) patch.description = description;
        if (startDateTime) patch.start = { dateTime: startDateTime, timeZone: timeZone || 'UTC' };
        if (endDateTime) patch.end = { dateTime: endDateTime, timeZone: timeZone || 'UTC' };

        const response = await cal.events.patch({
          calendarId: 'primary',
          eventId,
          requestBody: patch,
        });

        return { success: true, event: { id: response.data.id, summary: response.data.summary } };
      },
    }),

    calendar_delete_event: tool({
      description: 'Delete a calendar event',
      inputSchema: z.object({
        eventId: z.string().describe('The event ID to delete'),
      }),
      execute: async (args: { eventId: string }) => {
        const { eventId } = args;
        const cal = await getCalendarClient(userId, supabase);
        if (!cal) return { error: 'Calendar not connected.' };

        await cal.events.delete({ calendarId: 'primary', eventId });
        return { success: true, deleted: eventId };
      },
    }),

    calendar_search_events: tool({
      description: 'Search for events by keyword in the calendar',
      inputSchema: z.object({
        query: z.string().describe('Search term to find in event titles/descriptions'),
        timeMin: z.string().optional().describe('Optional start of search range (ISO 8601)'),
        timeMax: z.string().optional().describe('Optional end of search range (ISO 8601)'),
      }),
      execute: async (args: { query: string; timeMin?: string; timeMax?: string }) => {
        const { query, timeMin, timeMax } = args;
        const cal = await getCalendarClient(userId, supabase);
        if (!cal) return { error: 'Calendar not connected.' };

        const params: Record<string, unknown> = {
          calendarId: 'primary',
          q: query,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 10,
        };
        if (timeMin) params.timeMin = timeMin;
        if (timeMax) params.timeMax = timeMax;

        const response = await cal.events.list(params as any);
        return { events: response.data.items || [] };
      },
    }),
  };
}

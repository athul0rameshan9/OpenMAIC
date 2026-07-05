import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createCourseTools(supabase: SupabaseClient) {
  return {
    query_courses: tool({
      description: 'Get the list of available courses/classrooms that the user has access to',
      inputSchema: z.object({
        search: z.string().optional().describe('Optional search term to filter courses by name'),
      }),
      execute: async (args: { search?: string }) => {
        const { search } = args;
        let query = supabase.from('classrooms').select('id, name, description, created_at');
        
        if (search) {
          query = query.ilike('name', `%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(20);

        if (error) {
          return { error: 'Failed to fetch courses: ' + error.message };
        }

        return { courses: data || [] };
      },
    }),

    search_course_content: tool({
      description: 'Search for specific content within course materials using semantic search',
      inputSchema: z.object({
        query: z.string().describe('The search query to find relevant course content'),
        courseId: z.string().optional().describe('Optional course ID to limit search to a specific course'),
      }),
      execute: async (args: { query: string; courseId?: string }) => {
        const { query, courseId } = args;
        // Use the existing textbook search endpoint pattern
        try {
          const params = new URLSearchParams({ q: query });
          if (courseId) params.set('courseId', courseId);
          
          // Call internal API for search (reuses existing RAG infrastructure)
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const response = await fetch(`${baseUrl}/api/textbook-search?${params}`);
          
          if (!response.ok) {
            return { error: 'Search failed', results: [] };
          }

          const data = await response.json();
          return { results: data.results || [] };
        } catch (err) {
          return { error: 'Search unavailable', results: [] };
        }
      },
    }),
  };
}

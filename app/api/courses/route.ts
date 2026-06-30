import { NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase/client';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API/courses');

export async function GET(): Promise<NextResponse> {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('status', 'active')
      .order('course_name');

    if (error) {
      logger.error('Failed to fetch courses:', error.message);
      return apiError('INTERNAL_ERROR', 500, 'Failed to fetch courses', error.message);
    }

    return apiSuccess({ courses: data ?? [] });
  } catch (err) {
    logger.error('Unexpected error:', err);
    return apiError('INTERNAL_ERROR', 500, 'Internal server error');
  }
}

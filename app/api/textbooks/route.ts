import { type NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase/client';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API/textbooks');

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const courseId = req.nextUrl.searchParams.get('course_id');

    if (!courseId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'course_id is required');
    }

    // Fetch textbooks with first image as thumbnail
    const { data: textbooks, error } = await supabase
      .from('textbooks')
      .select('*')
      .eq('course_id', courseId)
      .order('title');

    if (error) {
      logger.error('Failed to fetch textbooks:', error.message);
      return apiError('INTERNAL_ERROR', 500, 'Failed to fetch textbooks', error.message);
    }

    // Fetch thumbnails (first image for each textbook)
    const textbookIds = (textbooks ?? []).map((t) => t.textbook_id);
    let thumbnailMap: Record<string, string> = {};

    if (textbookIds.length > 0) {
      const { data: images, error: imgError } = await supabase
        .from('textbook_images')
        .select('textbook_id, image_url')
        .in('textbook_id', textbookIds)
        .eq('image_index', 0);

      if (imgError) {
        logger.error('Failed to fetch thumbnails:', imgError.message);
      } else if (images) {
        thumbnailMap = Object.fromEntries(
          images.map((img) => [img.textbook_id, img.image_url]),
        );
      }
    }

    const result = (textbooks ?? []).map((t) => ({
      ...t,
      thumbnail_url: thumbnailMap[t.textbook_id] ?? null,
    }));

    return apiSuccess({ textbooks: result });
  } catch (err) {
    logger.error('Unexpected error:', err);
    return apiError('INTERNAL_ERROR', 500, 'Internal server error');
  }
}

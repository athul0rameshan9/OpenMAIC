import { NextRequest, NextResponse } from 'next/server';
import { isValidClassroomId, getClassroomMediaUrl } from '@/lib/server/classroom-storage';

/**
 * Backward-compatible media route that redirects to Supabase Storage public URLs.
 * Media is now served directly from Supabase Storage; this route handles old URLs.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  const { classroomId, path: pathSegments } = await params;

  // Validate classroomId
  if (!isValidClassroomId(classroomId)) {
    return NextResponse.json({ error: 'Invalid classroom ID' }, { status: 400 });
  }

  // Validate path segments — no traversal
  const joined = pathSegments.join('/');
  if (joined.includes('..') || pathSegments.some((s) => s.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Only allow media/ and audio/ subdirectories
  const subDir = pathSegments[0];
  if (subDir !== 'media' && subDir !== 'audio') {
    return NextResponse.json({ error: 'Invalid path' }, { status: 404 });
  }

  const url = getClassroomMediaUrl(classroomId, joined);
  return NextResponse.redirect(url, 302);
}

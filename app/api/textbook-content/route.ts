import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.textbook_id !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid textbook_id' },
      { status: 400 },
    );
  }

  const { data: record, error: queryError } = await supabase
    .from('textbook_processed')
    .select('markdown_storage_path')
    .eq('textbook_id', body.textbook_id)
    .single();

  if (queryError || !record) {
    return NextResponse.json(
      { success: false, error: 'Textbook not found' },
      { status: 404 },
    );
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('textbooks')
    .download(record.markdown_storage_path);

  if (downloadError || !fileData) {
    return NextResponse.json(
      { success: false, error: 'Failed to download markdown file' },
      { status: 500 },
    );
  }

  const content = await fileData.text();

  return NextResponse.json({ success: true, content });
}

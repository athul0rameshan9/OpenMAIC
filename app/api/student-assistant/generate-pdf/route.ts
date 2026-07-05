import { NextRequest } from 'next/server';
import { generateStudyPDF } from '@/lib/pdf/generator';
import type { PDFGenerationRequest } from '@/lib/student-assistant/types';

const VALID_TYPES = ['study-guide', 'formula-sheet', 'flashcards', 'summary'] as const;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PDFGenerationRequest;

    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid type. Must be one of: study-guide, formula-sheet, flashcards, summary' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!body.topic || typeof body.topic !== 'string' || body.topic.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Topic is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!body.content || typeof body.content !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Content is required and must be a JSON string' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate that content is valid JSON
    try {
      JSON.parse(body.content);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Content must be a valid JSON string' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const buffer = await generateStudyPDF({
      type: body.type,
      topic: body.topic.trim(),
      content: body.content,
    });

    const filename = `${body.type}-${body.topic.trim().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.pdf`;
    const uint8 = new Uint8Array(buffer);

    return new Response(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': uint8.length.toString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF generation failed';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

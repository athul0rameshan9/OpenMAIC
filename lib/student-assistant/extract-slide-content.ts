import type { Scene } from '@/lib/types/stage';
import { isSlideContent, isQuizContent } from '@/lib/types/stage';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export function extractSlideContent(scene: Scene, slideIndex: number): string {
  const parts: string[] = [];

  parts.push(`## Slide ${slideIndex + 1}: ${scene.title}`);

  const { content } = scene;

  if (isSlideContent(content)) {
    const elements = content.canvas.elements;

    for (const el of elements) {
      if (el.type === 'text' && 'content' in el) {
        const text = stripHtml(el.content as string);
        if (text) parts.push(text);
      } else if (el.type === 'table' && 'data' in el) {
        const rows = (el.data as Array<Array<{ text: string }>>);
        const tableLines = rows.map((row) =>
          '| ' + row.map((cell) => cell.text.replace(/\|/g, '\\|')).join(' | ') + ' |',
        );
        if (tableLines.length > 0) {
          const headerSep = '| ' + rows[0].map(() => '---').join(' | ') + ' |';
          tableLines.splice(1, 0, headerSep);
          parts.push(tableLines.join('\n'));
        }
      } else if (el.type === 'latex' && 'latex' in el) {
        parts.push(`$$${(el as { latex: string }).latex}$$`);
      } else if (el.type === 'chart' && 'chartType' in el) {
        parts.push(`[Chart: ${(el as { chartType: string }).chartType}]`);
      }
    }
  } else if (isQuizContent(content)) {
    for (const q of content.questions) {
      parts.push(`**Q:** ${q.question}`);
      if (q.options) {
        for (const opt of q.options) {
          parts.push(`  ${opt.value}. ${opt.label}`);
        }
      }
    }
  }

  return parts.join('\n\n');
}

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { StudyGuideTemplate } from './templates/study-guide';
import { FormulaSheetTemplate } from './templates/formula-sheet';
import { SummaryTemplate } from './templates/summary';

interface StudyGuideContent {
  sections: Array<{ heading: string; content: string }>;
}

interface FormulaSheetContent {
  formulas: Array<{ name: string; formula: string; description: string }>;
}

interface SummaryContent {
  overview: string;
  keyPoints: string[];
  details: string;
}

interface GeneratePDFParams {
  type: 'study-guide' | 'formula-sheet' | 'flashcards' | 'summary';
  topic: string;
  content: string;
}

export async function generateStudyPDF(params: GeneratePDFParams): Promise<Buffer> {
  const { type, topic, content } = params;
  const parsedContent = JSON.parse(content);

  const generatedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let document: React.ReactElement;

  switch (type) {
    case 'study-guide': {
      const { sections } = parsedContent as StudyGuideContent;
      document = React.createElement(StudyGuideTemplate, {
        title: topic,
        sections,
        generatedAt,
      });
      break;
    }
    case 'formula-sheet': {
      const { formulas } = parsedContent as FormulaSheetContent;
      document = React.createElement(FormulaSheetTemplate, {
        title: topic,
        formulas,
      });
      break;
    }
    case 'summary': {
      const { overview, keyPoints, details } = parsedContent as SummaryContent;
      document = React.createElement(SummaryTemplate, {
        title: topic,
        overview,
        keyPoints,
        details,
      });
      break;
    }
    case 'flashcards': {
      // Flashcards rendered as a study guide with Q&A sections
      const sections = (parsedContent.cards || []).map(
        (card: { question: string; answer: string }, i: number) => ({
          heading: `Card ${i + 1}: ${card.question}`,
          content: card.answer,
        })
      );
      document = React.createElement(StudyGuideTemplate, {
        title: `${topic} - Flashcards`,
        sections,
        generatedAt,
      });
      break;
    }
    default:
      throw new Error(`Unsupported PDF type: ${type}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(document as any);
  return Buffer.from(buffer);
}

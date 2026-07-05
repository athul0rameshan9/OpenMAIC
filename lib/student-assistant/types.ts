/**
 * Student Assistant — Shared Types
 */

export type AssistantMode = 'qa' | 'research' | 'study' | 'quiz';

export interface StudentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** Tool calls made during this message */
  toolCalls?: ToolCallResult[];
  /** Source citations from RAG */
  citations?: Citation[];
}

export interface Citation {
  text: string;
  headings: string[];
  pageNumbers: number[];
  score: number;
  sourceFile: string;
}

export interface ToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface ChatSession {
  id: string;
  courseId: string | null;
  title: string;
  messages: StudentMessage[];
  mode: AssistantMode;
  createdAt: number;
  updatedAt: number;
}

export interface StudentAssistantChatRequest {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  courseId?: string;
  textbookId?: string;
  activeSlideContent?: string;
  mode: AssistantMode;
  /** Provider/model string e.g. "openai/gpt-4o-mini" */
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
}

export interface StudentAssistantResearchRequest {
  query: string;
  courseId?: string;
  textbookId?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  webSearchProvider?: string;
  webSearchApiKey?: string;
}

export interface PDFGenerationRequest {
  type: 'study-guide' | 'formula-sheet' | 'flashcards' | 'summary';
  topic: string;
  content: string;
  courseId?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Course {
  course_id: string;
  course_name: string;
  description: string | null;
  status: 'active' | 'archived';
  created_at: string;
}

export interface Textbook {
  textbook_id: string;
  course_id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string;
  uploaded_at: string;
  processing_status: 'not_started' | 'queued' | 'processing' | 'completed' | 'failed';
  visibility_status: 'private' | 'live';
  thumbnail_url: string | null;
}

export interface TextbookChunk {
  text: string;
  headings: string[];
  page_numbers: number[];
  content_type: 'text' | 'table' | 'formula' | 'picture' | 'mixed';
  has_formula: boolean;
  has_table: boolean;
  has_figure: boolean;
  image_urls: string[];
  source_pdf: string;
  chunk_index: number;
  score: number;
}

export interface TextbookSearchResult {
  chunks: TextbookChunk[];
  textbook_id: string;
  query: string;
}

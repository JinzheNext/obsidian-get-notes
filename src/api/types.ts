export interface GetListResponse {
  data?: unknown;
}

export interface GetNoteSummary {
  note_id?: string | number;
  id?: string | number;
  prime_id?: string | number;
  title?: string;
  name?: string;
  topic_name?: string;
  note_type?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  content?: string;
}

export interface GetNoteDetail {
  note_id?: string | number;
  title?: string;
  note_type?: string;
  source?: string;
  entry_type?: string;
  created_at?: string;
  updated_at?: string;
  content?: string;
  ref_content?: string;
  children_count?: number;
  tags?: Array<{ name?: string }>;
  topics?: Array<{ name?: string; topic_id?: string; id?: string }>;
  attachments?: Array<{ type?: string; title?: string; url?: string }>;
  audio?: {
    original?: string;
    play_url?: string;
  };
}

export interface RawNoteRecord {
  summary: GetNoteSummary;
  detailPayload: unknown;
  detail: GetNoteDetail | null;
  original: unknown;
}

export interface SnippetFilters {
  language?: string;
  difficulty?: number;
}

export interface SnippetRef {
  snippet_id: string;
}

/**
 * SnippetRepo port — slice 13.3 surface.
 * Only id-lookup and random-pick are needed by CreateRoom.
 */
export interface SnippetRepo {
  getById(snippetId: string): Promise<SnippetRef | null>;
  random(filters: SnippetFilters): Promise<SnippetRef | null>;
}

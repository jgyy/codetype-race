export interface SnippetFilters {
    language?: string;
    difficulty?: number;
}

export interface SnippetRef {
    snippet_id: string;
}

export interface SnippetMeta extends SnippetRef {
    language: string;
    length: number;
}

export interface SnippetRepo {
    getById(snippetId: string): Promise<SnippetRef | null>;
    getMetaById(snippetId: string): Promise<SnippetMeta | null>;
    random(filters: SnippetFilters): Promise<SnippetRef | null>;
}

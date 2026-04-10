/**
 * Filesystem MCP Server - Types
 */

export interface TruncatedResult {
  content: string;
  truncated: boolean;
  totalSize?: number;
  nextCursor?: string;
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export interface GrepResult {
  pattern: string;
  matches: GrepMatch[];
  matchCount: number;
  truncated: boolean;
}

// Shared types for the AI Agent Knowledge Base.
// Imported from server and client via the @kb/shared path alias.

export interface Workspace {
  id: string;            // slug, e.g. "ai-agents"
  name: string;          // display name
  description: string;
  created_at: string;
  updated_at: string;
}

// First-class Domain entity, scoped to a workspace.
// `id` is the slug stored on `nodes.domain`. The seven seed domains
// (concepts, architectures, tools, workflows, papers, people, models)
// are conventions — any string is valid as long as a row exists in the
// `domains` table for the same workspace.
export interface Domain {
  id: string;            // slug, FK target of nodes.domain
  label: string;         // human-readable display name
  description: string;
  color: string | null;  // hex like "#6D28D9"; null → client uses hashed fallback
  position: number;      // sort order on Home grid (lower = first)
  created_at: string;
  updated_at: string;
}

export interface DomainWithCount extends Domain {
  node_count: number;
}

// Reading list — a curated, ordered selection of nodes that may span domains.
// Items have a `position` for stable ordering and an optional editorial `note`
// that appears above the node body in the article view (e.g. "skip the math
// section, read for intuition only").
export interface ReadingList {
  id: string;
  title: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReadingListItem {
  node_id: string;
  position: number;
  note: string;
}

export interface ReadingListWithItems extends ReadingList {
  items: ReadingListItem[];
}

export interface ReadingListSummary extends ReadingList {
  item_count: number;
}

export interface Node {
  id: string;
  title: string;
  body: string;
  domain: string;
  tags: string[];
  metadata: Record<string, unknown>;
  embedding: number[] | null;
  search_vector?: string;
  created_at: string;
  updated_at: string;
}

export interface Edge {
  from: string;
  to: string;
  relation: string;
  weight: number;
  metadata: Record<string, unknown>;
  created_at?: string;
}

export interface NodeVersion {
  id: number;
  node_id: string;
  version: number;
  title: string;
  body: string;
  tags: string[];
  metadata: Record<string, unknown>;
  changed_by: string;
  change_summary: string;
  created_at: string;
}

export interface NodeVersionSummary {
  id: number;
  node_id: string;
  version: number;
  title: string;
  tags: string[];
  changed_by: string;
  change_summary: string;
  created_at: string;
}

export interface Comment {
  id: number;
  node_id: string;
  parent_id: number | null;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CommentTreeNode extends Comment {
  replies: CommentTreeNode[];
}

export type RendererType = 'vega-lite' | 'table' | 'markdown' | 'graph' | 'html';

export interface Widget {
  id: string;
  title: string;
  description: string;
  renderer: RendererType;
  renderer_options: Record<string, unknown>;
  data: unknown;
  data_schema?: Record<string, unknown>;
  source_script: string;
  source_url?: string;
  created_by: string;
  last_run_at: string;
  created_at: string;
  updated_at: string;
}

// Convenience aliases for renderer_options shapes — purely advisory; the
// `renderer_options` field on Widget stays as a free-form Record so agents can
// extend without breaking the type.
export interface VegaLiteOptions {
  spec?: Record<string, unknown>;
}
export interface TableOptions {
  columns?: string[];
  labels?: Record<string, string>;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}
export interface MarkdownOptions {
  template?: string;
}
export interface GraphOptions {
  layout?: 'force' | 'radial' | 'hierarchy';
  colorBy?: 'domain' | 'relation' | 'custom';
}
export interface HtmlOptions {
  sandbox?: string;
}

// Shape required by the graph renderer's `data` field.
export interface GraphData {
  nodes: Array<{ id: string; label: string; domain?: string; [key: string]: unknown }>;
  edges: Array<{ from: string; to: string; relation?: string; weight?: number }>;
}

export interface QueryInput {
  domain?: string;
  tags?: string[];
  relation?: { from?: string; to?: string; type?: string };
  text?: string;
  limit?: number;
  depth?: number;
}

export interface QueryResult {
  nodes: Node[];
  edges: Edge[];
  total: number;
}

export interface RunRequest {
  lang: 'js' | 'python';
  code: string;
}

export interface RunResponse {
  result: unknown;
  logs: string[];
  widgets: string[];
  error?: string;
}

export interface ApiEnvelope<T> {
  data: T;
  error?: string;
}

export interface AutocompleteResult {
  id: string;
  title: string;
  domain: string;
}

export interface GraphExport {
  nodes: Node[];
  edges: Edge[];
}

import type {
  AutocompleteResult,
  Comment,
  CommentTreeNode,
  Domain,
  DomainWithCount,
  Edge,
  GraphExport,
  Node,
  NodeVersion,
  NodeVersionSummary,
  QueryInput,
  QueryResult,
  RendererType,
  RunRequest,
  RunResponse,
  Widget,
  Workspace,
} from '@kb/shared';

const BASE = '/api/v1';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(json.error || `request failed: ${res.status}`);
  return json.data as T;
}

export interface NodeWithEdges extends Node {
  edges: { outgoing: Edge[]; incoming: Edge[] };
}

// ---------------------------------------------------------------------------
// workspaces
// ---------------------------------------------------------------------------

export const listWorkspaces = () => req<Workspace[]>('/workspaces');
export const getWorkspace = (id: string) => req<Workspace>(`/workspaces/${id}`);
export const createWorkspace = (body: { id: string; name: string; description?: string }) =>
  req<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(body) });
export const updateWorkspace = (id: string, body: { name?: string; description?: string }) =>
  req<Workspace>(`/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteWorkspace = (id: string) =>
  req<{ deleted: true }>(`/workspaces/${id}`, { method: 'DELETE' });

// Helper — prefix a path with the workspace scope.
const wsPath = (ws: string, suffix: string) => `/workspaces/${ws}${suffix}`;

// ---------------------------------------------------------------------------
// nodes
// ---------------------------------------------------------------------------

export const listNodes = (
  ws: string,
  params: { domain?: string; tags?: string[]; q?: string } = {},
) => {
  const qs = new URLSearchParams();
  if (params.domain) qs.set('domain', params.domain);
  if (params.tags?.length) qs.set('tags', params.tags.join(','));
  if (params.q) qs.set('q', params.q);
  const s = qs.toString();
  return req<Node[]>(wsPath(ws, `/nodes${s ? `?${s}` : ''}`));
};
export const getNode = (ws: string, id: string) => req<NodeWithEdges>(wsPath(ws, `/nodes/${id}`));
export const createNode = (
  ws: string,
  body: Partial<Node> & { id: string; title: string; domain: string },
) => req<Node>(wsPath(ws, '/nodes'), { method: 'POST', body: JSON.stringify(body) });
export const updateNode = (
  ws: string,
  id: string,
  body: Partial<Node> & { changed_by?: string; change_summary?: string },
) => req<Node>(wsPath(ws, `/nodes/${id}`), { method: 'PUT', body: JSON.stringify(body) });
export const deleteNode = (ws: string, id: string) =>
  req<{ deleted: true }>(wsPath(ws, `/nodes/${id}`), { method: 'DELETE' });
export const autocompleteNodes = (ws: string, q: string) =>
  req<AutocompleteResult[]>(wsPath(ws, `/nodes/autocomplete?q=${encodeURIComponent(q)}`));

// ---------------------------------------------------------------------------
// edges
// ---------------------------------------------------------------------------

export const listEdges = (
  ws: string,
  filter: { from?: string; to?: string; relation?: string } = {},
) => {
  const qs = new URLSearchParams();
  if (filter.from) qs.set('from', filter.from);
  if (filter.to) qs.set('to', filter.to);
  if (filter.relation) qs.set('relation', filter.relation);
  const s = qs.toString();
  return req<Edge[]>(wsPath(ws, `/edges${s ? `?${s}` : ''}`));
};
export const createEdge = (
  ws: string,
  e: { from: string; to: string; relation: string; weight?: number },
) => req<Edge>(wsPath(ws, '/edges'), { method: 'POST', body: JSON.stringify(e) });
export const deleteEdge = (ws: string, e: { from: string; to: string; relation: string }) =>
  req<{ deleted: true }>(wsPath(ws, '/edges'), { method: 'DELETE', body: JSON.stringify(e) });

// ---------------------------------------------------------------------------
// query + scripts
// ---------------------------------------------------------------------------

export const runQuery = (ws: string, q: QueryInput) =>
  req<QueryResult>(wsPath(ws, '/query'), { method: 'POST', body: JSON.stringify(q) });
export const runScript = (ws: string, r: RunRequest) =>
  req<RunResponse>(wsPath(ws, '/run'), { method: 'POST', body: JSON.stringify(r) });

// ---------------------------------------------------------------------------
// versions
// ---------------------------------------------------------------------------

export const listVersions = (ws: string, nodeId: string) =>
  req<NodeVersionSummary[]>(wsPath(ws, `/nodes/${nodeId}/versions`));
export const getVersion = (ws: string, nodeId: string, version: number) =>
  req<NodeVersion>(wsPath(ws, `/nodes/${nodeId}/versions/${version}`));
export const restoreVersion = (ws: string, nodeId: string, version: number, changed_by?: string) =>
  req<Node>(wsPath(ws, `/nodes/${nodeId}/versions/${version}/restore`), {
    method: 'POST',
    body: JSON.stringify({ changed_by }),
  });

// ---------------------------------------------------------------------------
// comments
// ---------------------------------------------------------------------------

export const listComments = (ws: string, nodeId: string) =>
  req<CommentTreeNode[]>(wsPath(ws, `/nodes/${nodeId}/comments`));
export const createComment = (
  ws: string,
  nodeId: string,
  body: { author?: string; body: string; parent_id?: number | null },
) =>
  req<Comment>(wsPath(ws, `/nodes/${nodeId}/comments`), {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateComment = (ws: string, id: number, body: string) =>
  req<Comment>(wsPath(ws, `/comments/${id}`), { method: 'PUT', body: JSON.stringify({ body }) });
export const deleteComment = (ws: string, id: number) =>
  req<{ deleted: true }>(wsPath(ws, `/comments/${id}`), { method: 'DELETE' });

// ---------------------------------------------------------------------------
// graph
// ---------------------------------------------------------------------------

export const getGraph = (ws: string) => req<GraphExport>(wsPath(ws, '/graph'));
export const getDomainGraph = (ws: string, domain: string) =>
  req<GraphExport>(wsPath(ws, `/graph/domain/${domain}`));

// ---------------------------------------------------------------------------
// domains
// ---------------------------------------------------------------------------

export const listDomains = (ws: string) => req<DomainWithCount[]>(wsPath(ws, '/domains'));
export const getDomain = (ws: string, id: string) => req<Domain>(wsPath(ws, `/domains/${id}`));
export const createDomain = (
  ws: string,
  body: { id: string; label?: string; description?: string; color?: string | null; position?: number },
) => req<Domain>(wsPath(ws, '/domains'), { method: 'POST', body: JSON.stringify(body) });
export const updateDomain = (
  ws: string,
  id: string,
  body: { label?: string; description?: string; color?: string | null; position?: number },
) => req<Domain>(wsPath(ws, `/domains/${id}`), { method: 'PUT', body: JSON.stringify(body) });
export const deleteDomain = (ws: string, id: string, move_to?: string) =>
  req<{ deleted: true }>(wsPath(ws, `/domains/${id}`), {
    method: 'DELETE',
    body: JSON.stringify(move_to ? { move_to } : {}),
  });

// ---------------------------------------------------------------------------
// widgets
// ---------------------------------------------------------------------------

export const listWidgets = (ws: string, filter: { renderer?: RendererType; q?: string } = {}) => {
  const qs = new URLSearchParams();
  if (filter.renderer) qs.set('renderer', filter.renderer);
  if (filter.q) qs.set('q', filter.q);
  const s = qs.toString();
  return req<Widget[]>(wsPath(ws, `/widgets${s ? `?${s}` : ''}`));
};
export const getWidget = (ws: string, id: string) =>
  req<Widget>(wsPath(ws, `/widgets/${id}`));
export const upsertWidget = (
  ws: string,
  w: {
    id: string;
    title: string;
    description?: string;
    renderer: RendererType;
    renderer_options?: Record<string, unknown>;
    data: unknown;
    source_url?: string;
    source_script?: string;
    created_by?: string;
  },
) => req<Widget>(wsPath(ws, '/widgets'), { method: 'POST', body: JSON.stringify(w) });
export const runWidget = (ws: string, id: string) =>
  req<{ run: RunResponse; widget: Widget }>(wsPath(ws, `/widgets/${id}/run`), { method: 'POST' });
export const deleteWidget = (ws: string, id: string) =>
  req<{ deleted: true }>(wsPath(ws, `/widgets/${id}`), { method: 'DELETE' });

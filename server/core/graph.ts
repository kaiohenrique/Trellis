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
  ReadingList,
  ReadingListItem,
  ReadingListSummary,
  ReadingListWithItems,
  RendererType,
  Widget,
  Workspace,
} from '@kb/shared';
import type pg from 'pg';
import { query, withClient, withTransaction } from '../db/client.js';

// ---------------------------------------------------------------------------
// row mappers
// ---------------------------------------------------------------------------

type NodeRow = Omit<Node, 'embedding' | 'metadata'> & {
  embedding: string | number[] | null;
  metadata: Record<string, unknown>;
  search_vector?: string;
};

function rowToNode(row: NodeRow): Node {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    domain: row.domain,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    embedding: Array.isArray(row.embedding) ? row.embedding : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at as unknown as string).toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at as unknown as string).toISOString(),
  };
}

function rowToEdge(row: Record<string, unknown>): Edge {
  return {
    from: String(row.from_id),
    to: String(row.to_id),
    relation: String(row.relation),
    weight: Number(row.weight),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at ? new Date(row.created_at as string).toISOString() : undefined,
  };
}

function rowToVersion(row: Record<string, unknown>): NodeVersion {
  return {
    id: Number(row.id),
    node_id: String(row.node_id),
    version: Number(row.version),
    title: String(row.title),
    body: String(row.body ?? ''),
    tags: (row.tags as string[]) ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    changed_by: String(row.changed_by ?? 'unknown'),
    change_summary: String(row.change_summary ?? ''),
    created_at: new Date(row.created_at as string).toISOString(),
  };
}

function rowToVersionSummary(row: Record<string, unknown>): NodeVersionSummary {
  return {
    id: Number(row.id),
    node_id: String(row.node_id),
    version: Number(row.version),
    title: String(row.title),
    tags: (row.tags as string[]) ?? [],
    changed_by: String(row.changed_by ?? 'unknown'),
    change_summary: String(row.change_summary ?? ''),
    created_at: new Date(row.created_at as string).toISOString(),
  };
}

function rowToComment(row: Record<string, unknown>): Comment {
  return {
    id: Number(row.id),
    node_id: String(row.node_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    author: String(row.author ?? 'anonymous'),
    body: String(row.body ?? ''),
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

function rowToWidget(row: Record<string, unknown>): Widget {
  const widget: Widget = {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    renderer: row.renderer as RendererType,
    renderer_options: (row.renderer_options as Record<string, unknown>) ?? {},
    data: row.data,
    source_script: String(row.source_script ?? ''),
    created_by: String(row.created_by ?? 'agent'),
    last_run_at: new Date(row.last_run_at as string).toISOString(),
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
  if (row.data_schema != null) widget.data_schema = row.data_schema as Record<string, unknown>;
  if (row.source_url != null) widget.source_url = String(row.source_url);
  return widget;
}

function rowToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

function rowToDomain(row: Record<string, unknown>): Domain {
  return {
    id: String(row.id),
    label: String(row.label),
    description: String(row.description ?? ''),
    color: row.color == null ? null : String(row.color),
    position: Number(row.position ?? 100),
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

const NODE_COLS = `id, title, body, domain, tags, metadata, embedding, created_at, updated_at`;
const WIDGET_COLS = `id, title, description, renderer, renderer_options, data, data_schema,
                     source_script, source_url, created_by, last_run_at, created_at, updated_at`;

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export interface WorkspaceWriteInput {
  id: string;
  name: string;
  description?: string;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const result = await query(
    `SELECT id, name, description, created_at, updated_at FROM workspaces ORDER BY name`,
  );
  return result.rows.map(rowToWorkspace);
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const result = await query(
    `SELECT id, name, description, created_at, updated_at FROM workspaces WHERE id = $1`,
    [id],
  );
  if (result.rowCount === 0) return null;
  return rowToWorkspace(result.rows[0]);
}

export async function createWorkspace(input: WorkspaceWriteInput): Promise<Workspace> {
  const result = await query(
    `INSERT INTO workspaces (id, name, description) VALUES ($1, $2, $3)
     RETURNING id, name, description, created_at, updated_at`,
    [input.id, input.name, input.description ?? ''],
  );
  return rowToWorkspace(result.rows[0]);
}

export async function upsertWorkspace(input: WorkspaceWriteInput): Promise<Workspace> {
  const result = await query(
    `INSERT INTO workspaces (id, name, description) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
     RETURNING id, name, description, created_at, updated_at`,
    [input.id, input.name, input.description ?? ''],
  );
  return rowToWorkspace(result.rows[0]);
}

export async function updateWorkspace(
  id: string,
  patch: { name?: string; description?: string },
): Promise<Workspace | null> {
  const existing = await getWorkspace(id);
  if (!existing) return null;
  const result = await query(
    `UPDATE workspaces SET name = $2, description = $3 WHERE id = $1
     RETURNING id, name, description, created_at, updated_at`,
    [id, patch.name ?? existing.name, patch.description ?? existing.description],
  );
  return rowToWorkspace(result.rows[0]);
}

export async function deleteWorkspace(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM workspaces WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

const DOMAIN_COLS = `id, label, description, color, position, created_at, updated_at`;

export interface DomainWriteInput {
  id: string;
  label?: string;
  description?: string;
  color?: string | null;
  position?: number;
}

// Humanize a slug: "code-review" -> "Code review", "react_pattern" -> "React pattern".
function humanize(slug: string): string {
  const spaced = slug.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export async function listDomains(workspaceId: string): Promise<DomainWithCount[]> {
  const sql = `
    SELECT d.${DOMAIN_COLS.split(', ').join(', d.')},
           COALESCE(c.cnt, 0)::int AS node_count
    FROM domains d
    LEFT JOIN (
      SELECT domain, COUNT(*)::int AS cnt
      FROM nodes
      WHERE workspace_id = $1
      GROUP BY domain
    ) c ON c.domain = d.id
    WHERE d.workspace_id = $1
    ORDER BY d.position ASC, d.label ASC
  `;
  const result = await query(sql, [workspaceId]);
  return result.rows.map((r) => ({
    ...rowToDomain(r),
    node_count: Number(r.node_count ?? 0),
  }));
}

export async function getDomain(workspaceId: string, id: string): Promise<Domain | null> {
  const sql = `SELECT ${DOMAIN_COLS} FROM domains WHERE workspace_id = $1 AND id = $2`;
  const result = await query(sql, [workspaceId, id]);
  if (result.rowCount === 0) return null;
  return rowToDomain(result.rows[0]);
}

export async function upsertDomain(workspaceId: string, input: DomainWriteInput): Promise<Domain> {
  const label = input.label && input.label.trim().length > 0 ? input.label : humanize(input.id);
  const sql = `
    INSERT INTO domains (workspace_id, id, label, description, color, position)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (workspace_id, id) DO UPDATE SET
      label       = EXCLUDED.label,
      description = EXCLUDED.description,
      color       = EXCLUDED.color,
      position    = EXCLUDED.position
    RETURNING ${DOMAIN_COLS}
  `;
  const result = await query(sql, [
    workspaceId,
    input.id,
    label,
    input.description ?? '',
    input.color ?? null,
    input.position ?? 100,
  ]);
  return rowToDomain(result.rows[0]);
}

export interface DeleteDomainOptions {
  // If provided, reassigns every node currently in this domain to `moveTo`
  // (which must exist) before deleting. If omitted and the domain still has
  // nodes, the FK rejects the delete and we return 'has_nodes'.
  moveTo?: string;
}

export type DeleteDomainResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'has_nodes'; node_count: number }
  | { ok: false; reason: 'move_target_missing' };

export async function deleteDomain(
  workspaceId: string,
  id: string,
  options: DeleteDomainOptions = {},
): Promise<DeleteDomainResult> {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT 1 FROM domains WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    );
    if (existing.rowCount === 0) return { ok: false, reason: 'not_found' };

    if (options.moveTo) {
      const target = await client.query(
        `SELECT 1 FROM domains WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, options.moveTo],
      );
      if (target.rowCount === 0) return { ok: false, reason: 'move_target_missing' };
      await client.query(
        `UPDATE nodes SET domain = $3 WHERE workspace_id = $1 AND domain = $2`,
        [workspaceId, id, options.moveTo],
      );
    } else {
      const count = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM nodes WHERE workspace_id = $1 AND domain = $2`,
        [workspaceId, id],
      );
      const n = Number(count.rows[0]?.cnt ?? 0);
      if (n > 0) return { ok: false, reason: 'has_nodes', node_count: n };
    }

    await client.query(`DELETE FROM domains WHERE workspace_id = $1 AND id = $2`, [workspaceId, id]);
    return { ok: true };
  });
}

// Auto-create a domain row when a node is being written into a domain that
// doesn't exist yet. Idempotent — ON CONFLICT DO NOTHING. Called inside the
// node write transaction so the FK from nodes -> domains is always satisfied.
async function ensureDomain(
  client: pg.PoolClient,
  workspaceId: string,
  domainId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO domains (workspace_id, id, label)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, id) DO NOTHING`,
    [workspaceId, domainId, humanize(domainId)],
  );
}

// ---------------------------------------------------------------------------
// Node CRUD
// ---------------------------------------------------------------------------

export interface NodeWriteInput {
  id: string;
  title: string;
  body?: string;
  domain: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface NodeUpdateOptions {
  changed_by?: string;
  change_summary?: string;
}

export async function getNode(workspaceId: string, id: string): Promise<Node | null> {
  const result = await query<NodeRow>(
    `SELECT ${NODE_COLS} FROM nodes WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  if (result.rowCount === 0) return null;
  return rowToNode(result.rows[0]);
}

export interface ListNodesFilter {
  domain?: string;
  tags?: string[];
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listNodes(workspaceId: string, filter: ListNodesFilter = {}): Promise<Node[]> {
  const conditions: string[] = ['workspace_id = $1'];
  const params: unknown[] = [workspaceId];

  if (filter.domain) {
    params.push(filter.domain);
    conditions.push(`domain = $${params.length}`);
  }
  if (filter.tags && filter.tags.length > 0) {
    params.push(filter.tags);
    conditions.push(`tags && $${params.length}::text[]`);
  }

  let orderBy = `updated_at DESC`;
  if (filter.q && filter.q.trim().length > 0) {
    params.push(toTsQuery(filter.q));
    conditions.push(`search_vector @@ to_tsquery('english', $${params.length})`);
    params.push(toTsQuery(filter.q));
    orderBy = `ts_rank(search_vector, to_tsquery('english', $${params.length})) DESC`;
  }

  const limit = Math.max(1, Math.min(filter.limit ?? 100, 500));
  const offset = Math.max(0, filter.offset ?? 0);

  const sql = `SELECT ${NODE_COLS} FROM nodes WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
  const result = await query<NodeRow>(sql, params);
  return result.rows.map(rowToNode);
}

export async function searchNodes(workspaceId: string, q: string, limit = 25): Promise<Node[]> {
  if (!q || !q.trim()) return [];
  const tsQ = toTsQuery(q);
  const sql = `
    SELECT ${NODE_COLS}, ts_rank(search_vector, to_tsquery('english', $2)) AS rank
    FROM nodes
    WHERE workspace_id = $1 AND search_vector @@ to_tsquery('english', $2)
    ORDER BY rank DESC
    LIMIT $3
  `;
  const result = await query<NodeRow>(sql, [workspaceId, tsQ, limit]);
  return result.rows.map(rowToNode);
}

export async function autocompleteNodes(workspaceId: string, q: string, limit = 10): Promise<AutocompleteResult[]> {
  if (!q || !q.trim()) {
    const result = await query<AutocompleteResult>(
      `SELECT id, title, domain FROM nodes WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT $2`,
      [workspaceId, limit],
    );
    return result.rows;
  }
  const sql = `
    SELECT id, title, domain
    FROM nodes
    WHERE workspace_id = $1 AND (id ILIKE $2 OR title ILIKE $2)
    ORDER BY
      CASE WHEN id ILIKE $3 THEN 0 WHEN title ILIKE $3 THEN 1 ELSE 2 END,
      title
    LIMIT $4
  `;
  const result = await query<AutocompleteResult>(sql, [workspaceId, `%${q}%`, `${q}%`, limit]);
  return result.rows;
}

export async function createNode(
  workspaceId: string,
  input: NodeWriteInput,
  options: NodeUpdateOptions = {},
): Promise<Node> {
  return withTransaction(async (client) => {
    await client.query(`SELECT set_config('kb.changed_by', $1, true)`, [options.changed_by ?? 'unknown']);
    await client.query(`SELECT set_config('kb.change_summary', $1, true)`, [options.change_summary ?? 'initial']);
    // Auto-create the domain row if it doesn't exist yet — the FK requires one.
    await ensureDomain(client, workspaceId, input.domain);
    const sql = `
      INSERT INTO nodes (workspace_id, id, title, body, domain, tags, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${NODE_COLS}
    `;
    const result = await client.query<NodeRow>(sql, [
      workspaceId,
      input.id,
      input.title,
      input.body ?? '',
      input.domain,
      input.tags ?? [],
      input.metadata ?? {},
    ]);
    return rowToNode(result.rows[0]);
  });
}

export async function upsertNode(
  workspaceId: string,
  input: NodeWriteInput,
  options: NodeUpdateOptions = {},
): Promise<Node> {
  return withTransaction(async (client) => {
    await client.query(`SELECT set_config('kb.changed_by', $1, true)`, [options.changed_by ?? 'unknown']);
    await client.query(`SELECT set_config('kb.change_summary', $1, true)`, [options.change_summary ?? '']);
    await ensureDomain(client, workspaceId, input.domain);
    const sql = `
      INSERT INTO nodes (workspace_id, id, title, body, domain, tags, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (workspace_id, id) DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        domain = EXCLUDED.domain,
        tags = EXCLUDED.tags,
        metadata = EXCLUDED.metadata
      RETURNING ${NODE_COLS}
    `;
    const result = await client.query<NodeRow>(sql, [
      workspaceId,
      input.id,
      input.title,
      input.body ?? '',
      input.domain,
      input.tags ?? [],
      input.metadata ?? {},
    ]);
    return rowToNode(result.rows[0]);
  });
}

export async function updateNode(
  workspaceId: string,
  id: string,
  patch: Partial<Omit<NodeWriteInput, 'id'>>,
  options: NodeUpdateOptions = {},
): Promise<Node | null> {
  return withTransaction(async (client) => {
    const existing = await client.query<NodeRow>(
      `SELECT ${NODE_COLS} FROM nodes WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    );
    if (existing.rowCount === 0) return null;
    const cur = existing.rows[0];

    await client.query(`SELECT set_config('kb.changed_by', $1, true)`, [options.changed_by ?? 'unknown']);
    await client.query(`SELECT set_config('kb.change_summary', $1, true)`, [options.change_summary ?? '']);

    const newDomain = patch.domain ?? cur.domain;
    if (newDomain !== cur.domain) await ensureDomain(client, workspaceId, newDomain);

    const sql = `
      UPDATE nodes SET
        title = $3,
        body = $4,
        domain = $5,
        tags = $6,
        metadata = $7
      WHERE workspace_id = $1 AND id = $2
      RETURNING ${NODE_COLS}
    `;
    const result = await client.query<NodeRow>(sql, [
      workspaceId,
      id,
      patch.title ?? cur.title,
      patch.body ?? cur.body,
      newDomain,
      patch.tags ?? cur.tags,
      patch.metadata ?? cur.metadata,
    ]);
    return rowToNode(result.rows[0]);
  });
}

export async function deleteNode(workspaceId: string, id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM nodes WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export interface EdgeFilter {
  from?: string;
  to?: string;
  relation?: string;
}

export interface EdgeWriteInput {
  from: string;
  to: string;
  relation: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export async function listEdges(workspaceId: string, filter: EdgeFilter = {}): Promise<Edge[]> {
  const conditions: string[] = ['workspace_id = $1'];
  const params: unknown[] = [workspaceId];

  if (filter.from) {
    params.push(filter.from);
    conditions.push(`from_id = $${params.length}`);
  }
  if (filter.to) {
    params.push(filter.to);
    conditions.push(`to_id = $${params.length}`);
  }
  if (filter.relation) {
    params.push(filter.relation);
    conditions.push(`relation = $${params.length}`);
  }

  const sql = `SELECT from_id, to_id, relation, weight, metadata, created_at FROM edges WHERE ${conditions.join(' AND ')} ORDER BY weight DESC, relation`;
  const result = await query(sql, params);
  return result.rows.map(rowToEdge);
}

export async function createEdge(workspaceId: string, input: EdgeWriteInput): Promise<Edge> {
  const sql = `
    INSERT INTO edges (workspace_id, from_id, to_id, relation, weight, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (workspace_id, from_id, to_id, relation) DO UPDATE SET
      weight = EXCLUDED.weight,
      metadata = EXCLUDED.metadata
    RETURNING from_id, to_id, relation, weight, metadata, created_at
  `;
  const result = await query(sql, [
    workspaceId,
    input.from,
    input.to,
    input.relation,
    input.weight ?? 1,
    input.metadata ?? {},
  ]);
  return rowToEdge(result.rows[0]);
}

export async function deleteEdge(
  workspaceId: string,
  from: string,
  to: string,
  relation: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM edges WHERE workspace_id = $1 AND from_id = $2 AND to_id = $3 AND relation = $4`,
    [workspaceId, from, to, relation],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Graph traversal
// ---------------------------------------------------------------------------

export async function neighbors(workspaceId: string, id: string, depth = 1): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const d = Math.max(1, Math.min(depth, 5));

  const traversalSql = `
    WITH RECURSIVE traversal AS (
      SELECT from_id, to_id, relation, weight, metadata, created_at, 1 AS depth
        FROM edges WHERE workspace_id = $1 AND from_id = $2
      UNION ALL
      SELECT from_id, to_id, relation, weight, metadata, created_at, 1 AS depth
        FROM edges WHERE workspace_id = $1 AND to_id = $2
      UNION ALL
      SELECT e.from_id, e.to_id, e.relation, e.weight, e.metadata, e.created_at, t.depth + 1
      FROM edges e JOIN traversal t ON (e.from_id = t.to_id OR e.to_id = t.from_id)
      WHERE e.workspace_id = $1 AND t.depth < $3
    )
    SELECT DISTINCT from_id, to_id, relation, weight, metadata, created_at FROM traversal
  `;
  const edgeResult = await query(traversalSql, [workspaceId, id, d]);
  const edges = edgeResult.rows.map(rowToEdge);

  const ids = new Set<string>([id]);
  for (const e of edges) {
    ids.add(e.from);
    ids.add(e.to);
  }
  if (ids.size === 0) return { nodes: [], edges: [] };

  const nodeResult = await query<NodeRow>(
    `SELECT ${NODE_COLS} FROM nodes WHERE workspace_id = $1 AND id = ANY($2::text[])`,
    [workspaceId, Array.from(ids)],
  );
  return { nodes: nodeResult.rows.map(rowToNode), edges };
}

export async function backlinks(workspaceId: string, id: string): Promise<Node[]> {
  const sql = `
    SELECT ${NODE_COLS.split(', ').map((c) => `n.${c}`).join(', ')}
    FROM edges e JOIN nodes n ON n.workspace_id = e.workspace_id AND n.id = e.from_id
    WHERE e.workspace_id = $1 AND e.to_id = $2
  `;
  const result = await query<NodeRow>(sql, [workspaceId, id]);
  return result.rows.map(rowToNode);
}

// ---------------------------------------------------------------------------
// Graph export
// ---------------------------------------------------------------------------

export async function exportGraph(workspaceId: string, domain?: string): Promise<GraphExport> {
  const nodeParams: unknown[] = [workspaceId];
  let nodeSql = `SELECT ${NODE_COLS} FROM nodes WHERE workspace_id = $1`;
  if (domain) {
    nodeParams.push(domain);
    nodeSql += ` AND domain = $2`;
  }
  const nodeResult = await query<NodeRow>(nodeSql, nodeParams);
  const nodes = nodeResult.rows.map(rowToNode);

  let edgeSql = `SELECT from_id, to_id, relation, weight, metadata, created_at FROM edges WHERE workspace_id = $1`;
  const edgeParams: unknown[] = [workspaceId];
  if (domain) {
    edgeSql = `
      SELECT e.from_id, e.to_id, e.relation, e.weight, e.metadata, e.created_at
      FROM edges e
      JOIN nodes nf ON nf.workspace_id = e.workspace_id AND nf.id = e.from_id
      JOIN nodes nt ON nt.workspace_id = e.workspace_id AND nt.id = e.to_id
      WHERE e.workspace_id = $1 AND (nf.domain = $2 OR nt.domain = $2)
    `;
    edgeParams.push(domain);
  }
  const edgeResult = await query(edgeSql, edgeParams);
  return { nodes, edges: edgeResult.rows.map(rowToEdge) };
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function listVersions(workspaceId: string, nodeId: string): Promise<NodeVersionSummary[]> {
  const sql = `
    SELECT id, node_id, version, title, tags, changed_by, change_summary, created_at
    FROM node_versions
    WHERE workspace_id = $1 AND node_id = $2
    ORDER BY version DESC
  `;
  const result = await query(sql, [workspaceId, nodeId]);
  return result.rows.map(rowToVersionSummary);
}

export async function getVersion(
  workspaceId: string,
  nodeId: string,
  version: number,
): Promise<NodeVersion | null> {
  const sql = `
    SELECT id, node_id, version, title, body, tags, metadata, changed_by, change_summary, created_at
    FROM node_versions
    WHERE workspace_id = $1 AND node_id = $2 AND version = $3
  `;
  const result = await query(sql, [workspaceId, nodeId, version]);
  if (result.rowCount === 0) return null;
  return rowToVersion(result.rows[0]);
}

export async function restoreVersion(
  workspaceId: string,
  nodeId: string,
  version: number,
  changedBy = 'unknown',
): Promise<Node | null> {
  const v = await getVersion(workspaceId, nodeId, version);
  if (!v) return null;
  return updateNode(
    workspaceId,
    nodeId,
    { title: v.title, body: v.body, tags: v.tags, metadata: v.metadata },
    { changed_by: changedBy, change_summary: `restored to v${version}` },
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function listComments(workspaceId: string, nodeId: string): Promise<CommentTreeNode[]> {
  const sql = `
    SELECT id, node_id, parent_id, author, body, created_at, updated_at
    FROM comments WHERE workspace_id = $1 AND node_id = $2
    ORDER BY created_at ASC
  `;
  const result = await query(sql, [workspaceId, nodeId]);
  const all = result.rows.map(rowToComment);
  return buildCommentTree(all);
}

function buildCommentTree(flat: Comment[]): CommentTreeNode[] {
  const byId = new Map<number, CommentTreeNode>();
  for (const c of flat) byId.set(c.id, { ...c, replies: [] });
  const roots: CommentTreeNode[] = [];
  for (const c of flat) {
    const node = byId.get(c.id)!;
    if (c.parent_id == null) roots.push(node);
    else {
      const parent = byId.get(c.parent_id);
      if (parent) parent.replies.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

export interface CommentWriteInput {
  node_id: string;
  parent_id?: number | null;
  author?: string;
  body: string;
}

export async function createComment(workspaceId: string, input: CommentWriteInput): Promise<Comment> {
  const sql = `
    INSERT INTO comments (workspace_id, node_id, parent_id, author, body)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, node_id, parent_id, author, body, created_at, updated_at
  `;
  const result = await query(sql, [
    workspaceId,
    input.node_id,
    input.parent_id ?? null,
    input.author ?? 'anonymous',
    input.body,
  ]);
  return rowToComment(result.rows[0]);
}

export async function updateComment(workspaceId: string, id: number, body: string): Promise<Comment | null> {
  const sql = `
    UPDATE comments SET body = $3 WHERE workspace_id = $1 AND id = $2
    RETURNING id, node_id, parent_id, author, body, created_at, updated_at
  `;
  const result = await query(sql, [workspaceId, id, body]);
  if (result.rowCount === 0) return null;
  return rowToComment(result.rows[0]);
}

export async function deleteComment(workspaceId: string, id: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM comments WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

export interface WidgetWriteInput {
  id: string;
  title: string;
  description?: string;
  renderer: RendererType;
  renderer_options?: Record<string, unknown>;
  data: unknown;
  data_schema?: Record<string, unknown>;
  source_script?: string;
  source_url?: string;
  created_by?: string;
}

export interface WidgetFilter {
  renderer?: RendererType;
  q?: string;
}

export async function listWidgets(workspaceId: string, filter: WidgetFilter = {}): Promise<Widget[]> {
  const conditions: string[] = ['workspace_id = $1'];
  const params: unknown[] = [workspaceId];

  if (filter.renderer) {
    params.push(filter.renderer);
    conditions.push(`renderer = $${params.length}`);
  }
  if (filter.q) {
    params.push(`%${filter.q}%`);
    conditions.push(`title ILIKE $${params.length}`);
  }

  const sql = `SELECT ${WIDGET_COLS} FROM widgets WHERE ${conditions.join(' AND ')} ORDER BY last_run_at DESC`;
  const result = await query(sql, params);
  return result.rows.map(rowToWidget);
}

export async function getWidget(workspaceId: string, id: string): Promise<Widget | null> {
  const sql = `SELECT ${WIDGET_COLS} FROM widgets WHERE workspace_id = $1 AND id = $2`;
  const result = await query(sql, [workspaceId, id]);
  if (result.rowCount === 0) return null;
  return rowToWidget(result.rows[0]);
}

export async function upsertWidget(workspaceId: string, input: WidgetWriteInput): Promise<Widget> {
  const sql = `
    INSERT INTO widgets (workspace_id, id, title, description, renderer, renderer_options, data,
                         data_schema, source_script, source_url, created_by, last_run_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
    ON CONFLICT (workspace_id, id) DO UPDATE SET
      title            = EXCLUDED.title,
      description      = EXCLUDED.description,
      renderer         = EXCLUDED.renderer,
      renderer_options = EXCLUDED.renderer_options,
      data             = EXCLUDED.data,
      data_schema      = EXCLUDED.data_schema,
      source_script    = COALESCE(NULLIF(EXCLUDED.source_script, ''), widgets.source_script),
      source_url       = EXCLUDED.source_url,
      created_by       = EXCLUDED.created_by,
      last_run_at      = now()
    RETURNING ${WIDGET_COLS}
  `;
  const result = await query(sql, [
    workspaceId,
    input.id,
    input.title,
    input.description ?? '',
    input.renderer,
    JSON.stringify(input.renderer_options ?? {}),
    JSON.stringify(input.data ?? null),
    input.data_schema ? JSON.stringify(input.data_schema) : null,
    input.source_script ?? '',
    input.source_url ?? null,
    input.created_by ?? 'agent',
  ]);
  return rowToWidget(result.rows[0]);
}

export async function refreshWidgetData(
  workspaceId: string,
  id: string,
  data: unknown,
): Promise<Widget | null> {
  const sql = `
    UPDATE widgets SET data = $3, last_run_at = now()
    WHERE workspace_id = $1 AND id = $2
    RETURNING ${WIDGET_COLS}
  `;
  const result = await query(sql, [workspaceId, id, JSON.stringify(data ?? null)]);
  if (result.rowCount === 0) return null;
  return rowToWidget(result.rows[0]);
}

export async function deleteWidget(workspaceId: string, id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM widgets WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Bulk loaders (used by query engine)
// ---------------------------------------------------------------------------

export async function getNodesByIds(workspaceId: string, ids: string[]): Promise<Node[]> {
  if (ids.length === 0) return [];
  const sql = `SELECT ${NODE_COLS} FROM nodes WHERE workspace_id = $1 AND id = ANY($2::text[])`;
  const result = await query<NodeRow>(sql, [workspaceId, ids]);
  return result.rows.map(rowToNode);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toTsQuery(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t}:*`);
  if (tokens.length === 0) return 'a:*';
  return tokens.join(' & ');
}

// ---------------------------------------------------------------------------
// Reading lists — curated, ordered selections that may span domains.
// ---------------------------------------------------------------------------

const READING_LIST_COLS = `id, title, description, created_by, created_at, updated_at`;

function rowToReadingList(row: Record<string, unknown>): ReadingList {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    created_by: String(row.created_by ?? 'unknown'),
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

export interface ReadingListWriteInput {
  id: string;
  title: string;
  description?: string;
  created_by?: string;
}

export async function listReadingLists(workspaceId: string): Promise<ReadingListSummary[]> {
  const sql = `
    SELECT l.${READING_LIST_COLS.split(', ').join(', l.')},
           COALESCE(c.cnt, 0)::int AS item_count
    FROM reading_lists l
    LEFT JOIN (
      SELECT reading_list_id, COUNT(*)::int AS cnt
      FROM reading_list_items
      WHERE workspace_id = $1
      GROUP BY reading_list_id
    ) c ON c.reading_list_id = l.id
    WHERE l.workspace_id = $1
    ORDER BY l.updated_at DESC
  `;
  const result = await query(sql, [workspaceId]);
  return result.rows.map((r) => ({
    ...rowToReadingList(r),
    item_count: Number(r.item_count ?? 0),
  }));
}

export async function getReadingList(
  workspaceId: string,
  id: string,
): Promise<ReadingListWithItems | null> {
  const result = await query(
    `SELECT ${READING_LIST_COLS} FROM reading_lists WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  if (result.rowCount === 0) return null;
  const list = rowToReadingList(result.rows[0]);
  const itemsRes = await query(
    `SELECT node_id, position, note FROM reading_list_items
     WHERE workspace_id = $1 AND reading_list_id = $2
     ORDER BY position ASC`,
    [workspaceId, id],
  );
  const items: ReadingListItem[] = itemsRes.rows.map((r) => ({
    node_id: String(r.node_id),
    position: Number(r.position),
    note: String(r.note ?? ''),
  }));
  return { ...list, items };
}

export async function upsertReadingList(
  workspaceId: string,
  input: ReadingListWriteInput,
): Promise<ReadingList> {
  const sql = `
    INSERT INTO reading_lists (workspace_id, id, title, description, created_by)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (workspace_id, id) DO UPDATE SET
      title       = EXCLUDED.title,
      description = EXCLUDED.description,
      created_by  = EXCLUDED.created_by
    RETURNING ${READING_LIST_COLS}
  `;
  const result = await query(sql, [
    workspaceId,
    input.id,
    input.title,
    input.description ?? '',
    input.created_by ?? 'unknown',
  ]);
  return rowToReadingList(result.rows[0]);
}

export async function deleteReadingList(workspaceId: string, id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM reading_lists WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface ReadingListItemInput {
  node_id: string;
  position?: number;
  note?: string;
}

// Add or update an item. If `position` omitted, appends at the end.
export async function addReadingListItem(
  workspaceId: string,
  listId: string,
  input: ReadingListItemInput,
): Promise<ReadingListItem> {
  return withTransaction(async (client) => {
    let position = input.position;
    if (position === undefined) {
      const maxRes = await client.query<{ m: string | null }>(
        `SELECT MAX(position) AS m FROM reading_list_items
         WHERE workspace_id = $1 AND reading_list_id = $2`,
        [workspaceId, listId],
      );
      position = (Number(maxRes.rows[0]?.m ?? 0) || 0) + 10;
    }
    const sql = `
      INSERT INTO reading_list_items (workspace_id, reading_list_id, node_id, position, note)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (workspace_id, reading_list_id, node_id) DO UPDATE SET
        position = EXCLUDED.position,
        note     = EXCLUDED.note
      RETURNING node_id, position, note
    `;
    const result = await client.query(sql, [
      workspaceId,
      listId,
      input.node_id,
      position,
      input.note ?? '',
    ]);
    return {
      node_id: String(result.rows[0].node_id),
      position: Number(result.rows[0].position),
      note: String(result.rows[0].note ?? ''),
    };
  });
}

export async function removeReadingListItem(
  workspaceId: string,
  listId: string,
  nodeId: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM reading_list_items
     WHERE workspace_id = $1 AND reading_list_id = $2 AND node_id = $3`,
    [workspaceId, listId, nodeId],
  );
  return (result.rowCount ?? 0) > 0;
}

// Bulk reorder: takes the new ordered list of node ids and rewrites positions
// in 10-step increments (10, 20, 30…). Nodes not in the array are left alone.
export async function reorderReadingList(
  workspaceId: string,
  listId: string,
  orderedNodeIds: string[],
): Promise<void> {
  await withTransaction(async (client) => {
    for (let i = 0; i < orderedNodeIds.length; i++) {
      await client.query(
        `UPDATE reading_list_items SET position = $4
         WHERE workspace_id = $1 AND reading_list_id = $2 AND node_id = $3`,
        [workspaceId, listId, orderedNodeIds[i], (i + 1) * 10],
      );
    }
  });
}

export { withClient };

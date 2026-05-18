import type { Edge, Node, QueryInput, QueryResult } from '@kb/shared';
import {
  exportGraph,
  getNodesByIds,
  listEdges,
  listNodes,
  neighbors,
} from './graph.js';

// Executes a structured graph query against a single workspace.
export async function runQuery(workspaceId: string, q: QueryInput): Promise<QueryResult> {
  const limit = q.limit && q.limit > 0 ? Math.min(q.limit, 500) : 100;

  let seed = await listNodes(workspaceId, {
    domain: q.domain,
    tags: q.tags,
    q: q.text,
    limit: limit * 2,
  });

  if (q.relation && (q.relation.from || q.relation.to || q.relation.type)) {
    const edges = await listEdges(workspaceId, {
      from: q.relation.from,
      to: q.relation.to,
      relation: q.relation.type,
    });
    const allowed = new Set<string>();
    for (const e of edges) {
      allowed.add(e.from);
      allowed.add(e.to);
    }
    seed = seed.filter((n) => allowed.has(n.id));
    if (seed.length === 0 && (q.relation.from || q.relation.to)) {
      const endpointIds = new Set<string>();
      for (const e of edges) {
        endpointIds.add(e.from);
        endpointIds.add(e.to);
      }
      seed = await getNodesByIds(workspaceId, Array.from(endpointIds));
    }
  }

  let nodes: Node[] = seed;
  let edges: Edge[] = [];
  if (q.depth && q.depth > 0 && seed.length > 0) {
    const seenNodeIds = new Set<string>(seed.map((n) => n.id));
    const seenEdgeKeys = new Set<string>();
    for (const n of seed) {
      const { nodes: ns, edges: es } = await neighbors(workspaceId, n.id, q.depth);
      for (const m of ns) {
        if (!seenNodeIds.has(m.id)) {
          seenNodeIds.add(m.id);
          nodes.push(m);
        }
      }
      for (const e of es) {
        const k = `${e.from}::${e.relation}::${e.to}`;
        if (!seenEdgeKeys.has(k)) {
          seenEdgeKeys.add(k);
          edges.push(e);
        }
      }
    }
  } else {
    const ids = new Set(seed.map((n) => n.id));
    if (ids.size > 0) {
      const allEdges = await listEdges(workspaceId);
      edges = allEdges.filter((e) => ids.has(e.from) && ids.has(e.to));
    }
  }

  nodes = nodes.slice(0, limit);
  const finalIds = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => finalIds.has(e.from) && finalIds.has(e.to));

  return { nodes, edges, total: nodes.length };
}

export async function fullGraph(workspaceId: string): Promise<QueryResult> {
  const g = await exportGraph(workspaceId);
  return { ...g, total: g.nodes.length };
}

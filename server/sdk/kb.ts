import type {
  Edge,
  Node,
  QueryInput,
  QueryResult,
  RendererType,
  Widget,
} from '@kb/shared';
import {
  createEdge,
  deleteEdge,
  deleteNode,
  exportGraph,
  getNode,
  getWidget as getWidgetDb,
  listEdges,
  listNodes,
  listWidgets as listWidgetsDb,
  neighbors,
  refreshWidgetData,
  searchNodes,
  upsertNode,
  upsertWidget,
} from '../core/graph.js';
import { runQuery } from '../core/query.js';

export interface SdkContext {
  workspaceId: string;
  logs: string[];
  widgetIds: Set<string>;
  source_script: string;
}

export interface WidgetCreateOptions {
  renderer: RendererType;
  renderer_options?: Record<string, unknown>;
  data: unknown;
  description?: string;
  data_schema?: Record<string, unknown>;
  source_url?: string;
  created_by?: string;
}

// Build a fresh kb SDK object scoped to one workspace + one sandbox execution.
// Scripts running in workspace A have no access to workspace B — no method
// exposes a workspace-switching parameter.
export function buildKbSdk(ctx: SdkContext) {
  const ws = ctx.workspaceId;

  const log = (...args: unknown[]): void => {
    const parts = args.map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    });
    ctx.logs.push(parts.join(' '));
  };

  async function get(id: string): Promise<Node | null> {
    return getNode(ws, id);
  }

  async function list(filter?: { domain?: string; tags?: string[] }): Promise<Node[]> {
    return listNodes(ws, filter ?? {});
  }

  async function search(q: string): Promise<Node[]> {
    return searchNodes(ws, q);
  }

  async function query(q: QueryInput): Promise<QueryResult> {
    return runQuery(ws, q);
  }

  async function edges(filter: { from?: string; to?: string; relation?: string }): Promise<Edge[]> {
    return listEdges(ws, filter);
  }

  async function neighborhood(id: string, depth?: number): Promise<{ nodes: Node[]; edges: Edge[] }> {
    return neighbors(ws, id, depth ?? 1);
  }

  async function save(node: Partial<Node> & { id: string; title: string; domain?: string }): Promise<Node> {
    return upsertNode(
      ws,
      {
        id: node.id,
        title: node.title,
        body: node.body ?? '',
        domain: node.domain ?? 'concepts',
        tags: node.tags ?? [],
        metadata: node.metadata ?? {},
      },
      { changed_by: 'agent', change_summary: 'saved via kb.save' },
    );
  }

  async function link(from: string, to: string, relation: string, weight?: number): Promise<Edge> {
    return createEdge(ws, { from, to, relation, weight });
  }

  async function unlink(from: string, to: string, relation: string): Promise<void> {
    await deleteEdge(ws, from, to, relation);
  }

  async function del(id: string): Promise<void> {
    await deleteNode(ws, id);
  }

  async function widget(
    id: string,
    title: string,
    options: WidgetCreateOptions,
  ): Promise<Widget> {
    const w = await upsertWidget(ws, {
      id,
      title,
      description: options.description,
      renderer: options.renderer,
      renderer_options: options.renderer_options ?? {},
      data: options.data,
      data_schema: options.data_schema,
      source_script: ctx.source_script,
      source_url: options.source_url,
      created_by: options.created_by ?? 'agent',
    });
    ctx.widgetIds.add(id);
    return w;
  }

  async function widgetRefreshData(id: string, data: unknown): Promise<Widget> {
    const w = await refreshWidgetData(ws, id, data);
    if (!w) throw new Error(`widget not found: ${id}`);
    ctx.widgetIds.add(id);
    return w;
  }

  async function getWidget(id: string): Promise<Widget | null> {
    return getWidgetDb(ws, id);
  }

  async function listWidgets(filter?: { renderer?: RendererType }): Promise<Widget[]> {
    return listWidgetsDb(ws, filter ?? {});
  }

  async function graph(): Promise<Awaited<ReturnType<typeof exportGraph>>> {
    return exportGraph(ws);
  }

  return {
    workspace: ws,
    get,
    list,
    search,
    query,
    edges,
    neighbors: neighborhood,
    save,
    link,
    unlink,
    delete: del,
    widget,
    widgetRefreshData,
    getWidget,
    listWidgets,
    graph,
    log,
  };
}

export type KbSdk = ReturnType<typeof buildKbSdk>;

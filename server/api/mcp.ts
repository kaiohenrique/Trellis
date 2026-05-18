import { Router, type Request, type Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  createEdge,
  createWorkspace,
  exportGraph,
  getDomain,
  getNode,
  getWidget,
  getWorkspace,
  listDomains,
  listNodes,
  listWidgets,
  listWorkspaces,
  neighbors,
  refreshWidgetData,
  searchNodes,
  upsertDomain,
  upsertNode,
  upsertWidget,
} from '../core/graph.js';
import { runQuery } from '../core/query.js';
import { runScript } from '../core/sandbox.js';
import type { RendererType } from '@kb/shared';

const wsField = { workspace_id: { type: 'string', description: 'Workspace id to scope this call' } };

const TOOLS = [
  // ----- Workspace management -----
  {
    name: 'kb_workspace_list',
    description: 'List all workspaces',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kb_workspace_get',
    description: 'Get a workspace by id',
    inputSchema: {
      type: 'object',
      properties: { workspace_id: { type: 'string' } },
      required: ['workspace_id'],
    },
  },
  {
    name: 'kb_workspace_create',
    description: 'Create a new workspace',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Slug, e.g. "ai-research"' },
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['id', 'name'],
    },
  },

  // ----- Node + edge + script tools (workspace-scoped) -----
  {
    name: 'kb_get',
    description: 'Get a knowledge base node by id within a workspace',
    inputSchema: {
      type: 'object',
      properties: { ...wsField, id: { type: 'string' } },
      required: ['workspace_id', 'id'],
    },
  },
  {
    name: 'kb_list',
    description: 'List nodes filtered by domain and tags',
    inputSchema: {
      type: 'object',
      properties: {
        ...wsField,
        domain: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'kb_search',
    description: 'Full-text search across nodes within a workspace',
    inputSchema: {
      type: 'object',
      properties: { ...wsField, query: { type: 'string' } },
      required: ['workspace_id', 'query'],
    },
  },
  {
    name: 'kb_query',
    description: 'Structured graph query within a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        ...wsField,
        domain: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        relation: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' }, type: { type: 'string' } },
        },
        text: { type: 'string' },
        limit: { type: 'number' },
        depth: { type: 'number' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'kb_save',
    description: 'Create or update a node within a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        ...wsField,
        id: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        domain: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        metadata: { type: 'object' },
      },
      required: ['workspace_id', 'id', 'title', 'domain'],
    },
  },
  {
    name: 'kb_link',
    description: 'Create an edge between two nodes in the same workspace',
    inputSchema: {
      type: 'object',
      properties: {
        ...wsField,
        from: { type: 'string' },
        to: { type: 'string' },
        relation: { type: 'string' },
        weight: { type: 'number' },
      },
      required: ['workspace_id', 'from', 'to', 'relation'],
    },
  },
  {
    name: 'kb_run',
    description: 'Execute a JS or Python script in the workspace sandbox',
    inputSchema: {
      type: 'object',
      properties: {
        ...wsField,
        lang: { type: 'string', enum: ['js', 'python'] },
        code: { type: 'string' },
      },
      required: ['workspace_id', 'lang', 'code'],
    },
  },
  {
    name: 'kb_neighbors',
    description: 'Get a node and its neighborhood at a given depth',
    inputSchema: {
      type: 'object',
      properties: { ...wsField, id: { type: 'string' }, depth: { type: 'number' } },
      required: ['workspace_id', 'id'],
    },
  },
  {
    name: 'kb_graph',
    description: 'Export the full graph or a domain subgraph for a workspace',
    inputSchema: {
      type: 'object',
      properties: { ...wsField, domain: { type: 'string' } },
      required: ['workspace_id'],
    },
  },

  // ----- Widgets (workspace-scoped, renderer model) -----
  {
    name: 'kb_widget_list',
    description: 'List widgets, optionally filtered by renderer or title query',
    inputSchema: {
      type: 'object',
      properties: {
        ...wsField,
        renderer: { type: 'string', enum: ['vega-lite', 'table', 'markdown', 'graph', 'html'] },
        q: { type: 'string' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'kb_widget_get',
    description: 'Get a widget by id within a workspace',
    inputSchema: {
      type: 'object',
      properties: { ...wsField, id: { type: 'string' } },
      required: ['workspace_id', 'id'],
    },
  },
  {
    name: 'kb_widget_save',
    description: 'Create or fully replace a widget. data is the raw payload; renderer + renderer_options describe how to display it.',
    inputSchema: {
      type: 'object',
      properties: {
        ...wsField,
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        renderer: { type: 'string', enum: ['vega-lite', 'table', 'markdown', 'graph', 'html'] },
        renderer_options: { type: 'object' },
        data: {},
        data_schema: { type: 'object' },
        source_url: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['workspace_id', 'id', 'title', 'renderer', 'data'],
    },
  },
  {
    name: 'kb_widget_refresh_data',
    description: 'Partial update: refresh only the data field of an existing widget, keeping renderer config unchanged.',
    inputSchema: {
      type: 'object',
      properties: { ...wsField, id: { type: 'string' }, data: {} },
      required: ['workspace_id', 'id', 'data'],
    },
  },

  // ----- Domains -----
  {
    name: 'kb_domain_list',
    description: 'List the domain registry for a workspace, with node counts.',
    inputSchema: {
      type: 'object',
      properties: { ...wsField },
      required: ['workspace_id'],
    },
  },
  {
    name: 'kb_domain_get',
    description: 'Get a single domain entity',
    inputSchema: {
      type: 'object',
      properties: { ...wsField, id: { type: 'string' } },
      required: ['workspace_id', 'id'],
    },
  },
  {
    name: 'kb_domain_save',
    description: 'Create or update a domain (label, description, color, position). Note: domains are auto-created on node insert; use this only to set nicer metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        ...wsField,
        id: { type: 'string', description: 'Slug, e.g. "books"' },
        label: { type: 'string' },
        description: { type: 'string' },
        color: { type: 'string', description: 'Hex color like #6D28D9, or null to clear' },
        position: { type: 'number', description: 'Sort order on the Home grid (lower first)' },
      },
      required: ['workspace_id', 'id'],
    },
  },
];

async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  const ws = args.workspace_id as string;
  switch (name) {
    case 'kb_workspace_list':
      return listWorkspaces();
    case 'kb_workspace_get':
      return getWorkspace(ws);
    case 'kb_workspace_create':
      return createWorkspace({
        id: args.id as string,
        name: args.name as string,
        description: args.description as string | undefined,
      });

    case 'kb_get':
      return getNode(ws, args.id as string);
    case 'kb_list':
      return listNodes(ws, { domain: args.domain as string, tags: args.tags as string[] });
    case 'kb_search':
      return searchNodes(ws, args.query as string);
    case 'kb_query':
      return runQuery(ws, args as Parameters<typeof runQuery>[1]);
    case 'kb_save':
      return upsertNode(
        ws,
        {
          id: args.id as string,
          title: args.title as string,
          body: (args.body as string) ?? '',
          domain: args.domain as string,
          tags: (args.tags as string[]) ?? [],
          metadata: (args.metadata as Record<string, unknown>) ?? {},
        },
        { changed_by: 'mcp', change_summary: 'saved via mcp' },
      );
    case 'kb_link':
      return createEdge(ws, {
        from: args.from as string,
        to: args.to as string,
        relation: args.relation as string,
        weight: args.weight as number,
      });
    case 'kb_run':
      return runScript(ws, args.lang as 'js' | 'python', args.code as string);
    case 'kb_neighbors':
      return neighbors(ws, args.id as string, (args.depth as number) ?? 1);
    case 'kb_graph':
      return exportGraph(ws, args.domain as string | undefined);
    case 'kb_widget_list':
      return listWidgets(ws, {
        renderer: args.renderer as RendererType | undefined,
        q: args.q as string | undefined,
      });
    case 'kb_widget_get':
      return getWidget(ws, args.id as string);
    case 'kb_widget_save':
      return upsertWidget(ws, {
        id: args.id as string,
        title: args.title as string,
        description: args.description as string | undefined,
        renderer: args.renderer as RendererType,
        renderer_options: (args.renderer_options as Record<string, unknown> | undefined) ?? {},
        data: args.data,
        data_schema: args.data_schema as Record<string, unknown> | undefined,
        source_url: args.source_url as string | undefined,
        created_by: (args.created_by as string | undefined) ?? 'mcp',
      });
    case 'kb_widget_refresh_data': {
      const w = await refreshWidgetData(ws, args.id as string, args.data);
      if (!w) throw new Error(`widget not found: ${args.id}`);
      return w;
    }
    case 'kb_domain_list':
      return listDomains(ws);
    case 'kb_domain_get':
      return getDomain(ws, args.id as string);
    case 'kb_domain_save':
      return upsertDomain(ws, {
        id: args.id as string,
        label: args.label as string | undefined,
        description: args.description as string | undefined,
        color: args.color as string | null | undefined,
        position: args.position as number | undefined,
      });
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function buildServer(): Server {
  const server = new Server(
    { name: 'trellis', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      const result = await dispatch(name, (args ?? {}) as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: (err as Error).message }],
      };
    }
  });

  return server;
}

export function mcpRouter(): Router {
  const router = Router();
  const sessions = new Map<string, SSEServerTransport>();

  router.get('/', async (_req: Request, res: Response) => {
    const transport = new SSEServerTransport('/mcp/messages', res);
    sessions.set(transport.sessionId, transport);
    res.on('close', () => sessions.delete(transport.sessionId));
    const server = buildServer();
    await server.connect(transport);
  });

  router.post('/messages', async (req: Request, res: Response) => {
    const sessionId = (req.query.sessionId as string) || '';
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  return router;
}

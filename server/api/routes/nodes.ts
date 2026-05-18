import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  autocompleteNodes,
  createNode,
  deleteNode,
  getNode,
  listEdges,
  listNodes,
  updateNode,
} from '../../core/graph.js';

export const nodesRouter = Router({ mergeParams: true });

const NodeBody = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_\-]+$/i, 'id must be a slug'),
  title: z.string().min(1),
  body: z.string().optional().default(''),
  domain: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  metadata: z.record(z.unknown()).optional().default({}),
  changed_by: z.string().optional(),
  change_summary: z.string().optional(),
});

const NodeUpdateBody = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  domain: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  changed_by: z.string().optional(),
  change_summary: z.string().optional(),
});

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

// /autocomplete must come before /:id so it isn't shadowed.
nodesRouter.get('/autocomplete', async (req: Request, res: Response) => {
  const q = (req.query.q as string) ?? '';
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const results = await autocompleteNodes(ws(req), q, limit);
  res.json({ data: results });
});

nodesRouter.get('/', async (req: Request, res: Response) => {
  const domain = (req.query.domain as string) || undefined;
  const tagsParam = (req.query.tags as string) || '';
  const tags = tagsParam ? tagsParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const q = (req.query.q as string) || undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const offset = req.query.offset ? Number(req.query.offset) : 0;
  const nodes = await listNodes(ws(req), { domain, tags, q, limit, offset });
  res.json({ data: nodes });
});

nodesRouter.get('/:id', async (req: Request, res: Response) => {
  const node = await getNode(ws(req), req.params.id);
  if (!node) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  const [outgoing, incoming] = await Promise.all([
    listEdges(ws(req), { from: req.params.id }),
    listEdges(ws(req), { to: req.params.id }),
  ]);
  res.json({ data: { ...node, edges: { outgoing, incoming } } });
});

nodesRouter.post('/', async (req: Request, res: Response) => {
  const parsed = NodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const { changed_by, change_summary, ...node } = parsed.data;
  try {
    const created = await createNode(ws(req), node, { changed_by, change_summary });
    res.status(201).json({ data: created });
  } catch (err) {
    res.status(400).json({ data: null, error: (err as Error).message });
  }
});

nodesRouter.put('/:id', async (req: Request, res: Response) => {
  const parsed = NodeUpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const { changed_by, change_summary, ...patch } = parsed.data;
  const updated = await updateNode(ws(req), req.params.id, patch, { changed_by, change_summary });
  if (!updated) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: updated });
});

nodesRouter.delete('/:id', async (req: Request, res: Response) => {
  const ok = await deleteNode(ws(req), req.params.id);
  if (!ok) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: { deleted: true } });
});

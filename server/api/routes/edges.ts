import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createEdge, deleteEdge, listEdges } from '../../core/graph.js';

export const edgesRouter = Router({ mergeParams: true });

const EdgeBody = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relation: z.string().min(1),
  weight: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const EdgeDeleteBody = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relation: z.string().min(1),
});

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

edgesRouter.get('/', async (req: Request, res: Response) => {
  const edges = await listEdges(ws(req), {
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
    relation: (req.query.relation as string) || undefined,
  });
  res.json({ data: edges });
});

edgesRouter.post('/', async (req: Request, res: Response) => {
  const parsed = EdgeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  try {
    const created = await createEdge(ws(req), parsed.data);
    res.status(201).json({ data: created });
  } catch (err) {
    res.status(400).json({ data: null, error: (err as Error).message });
  }
});

edgesRouter.delete('/', async (req: Request, res: Response) => {
  const parsed = EdgeDeleteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const ok = await deleteEdge(ws(req), parsed.data.from, parsed.data.to, parsed.data.relation);
  if (!ok) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: { deleted: true } });
});

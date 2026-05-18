import { Router, type Request, type Response } from 'express';
import { exportGraph } from '../../core/graph.js';

export const graphRouter = Router({ mergeParams: true });

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

graphRouter.get('/', async (req: Request, res: Response) => {
  const g = await exportGraph(ws(req));
  res.json({ data: g });
});

graphRouter.get('/domain/:domain', async (req: Request, res: Response) => {
  const g = await exportGraph(ws(req), req.params.domain);
  res.json({ data: g });
});

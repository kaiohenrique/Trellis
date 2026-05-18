import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { runQuery } from '../../core/query.js';

export const queryRouter = Router({ mergeParams: true });

const QueryBody = z.object({
  domain: z.string().optional(),
  tags: z.array(z.string()).optional(),
  relation: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      type: z.string().optional(),
    })
    .optional(),
  text: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
  depth: z.number().int().min(0).max(5).optional(),
});

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

queryRouter.post('/', async (req: Request, res: Response) => {
  const parsed = QueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const result = await runQuery(ws(req), parsed.data);
  res.json({ data: result });
});

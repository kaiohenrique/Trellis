import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { runScript } from '../../core/sandbox.js';

export const scriptsRouter = Router({ mergeParams: true });

const RunBody = z.object({
  lang: z.enum(['js', 'python']),
  code: z.string().min(1),
});

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

scriptsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = RunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const result = await runScript(ws(req), parsed.data.lang, parsed.data.code);
  res.json({ data: result });
});

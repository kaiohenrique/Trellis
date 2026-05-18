import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getVersion, listVersions, restoreVersion } from '../../core/graph.js';

export const versionsRouter = Router({ mergeParams: true });

const RestoreBody = z.object({ changed_by: z.string().optional() });

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

versionsRouter.get('/', async (req: Request, res: Response) => {
  const versions = await listVersions(ws(req), req.params.id);
  res.json({ data: versions });
});

versionsRouter.get('/:version', async (req: Request, res: Response) => {
  const v = Number(req.params.version);
  if (!Number.isFinite(v) || v <= 0) {
    res.status(400).json({ data: null, error: 'invalid version' });
    return;
  }
  const version = await getVersion(ws(req), req.params.id, v);
  if (!version) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: version });
});

versionsRouter.post('/:version/restore', async (req: Request, res: Response) => {
  const v = Number(req.params.version);
  if (!Number.isFinite(v) || v <= 0) {
    res.status(400).json({ data: null, error: 'invalid version' });
    return;
  }
  const parsed = RestoreBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const restored = await restoreVersion(ws(req), req.params.id, v, parsed.data.changed_by);
  if (!restored) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: restored });
});

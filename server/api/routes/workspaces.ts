import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
} from '../../core/graph.js';

export const workspacesRouter = Router();

const WorkspaceBody = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_\-]+$/i, 'id must be a slug'),
  name: z.string().min(1),
  description: z.string().optional(),
});

const WorkspaceUpdate = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

workspacesRouter.get('/', async (_req, res) => {
  const wss = await listWorkspaces();
  res.json({ data: wss });
});

workspacesRouter.post('/', async (req, res) => {
  const parsed = WorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  try {
    const created = await createWorkspace(parsed.data);
    res.status(201).json({ data: created });
  } catch (err) {
    res.status(400).json({ data: null, error: (err as Error).message });
  }
});

workspacesRouter.get('/:workspaceId', async (req, res) => {
  const ws = await getWorkspace(req.params.workspaceId);
  if (!ws) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: ws });
});

workspacesRouter.put('/:workspaceId', async (req, res) => {
  const parsed = WorkspaceUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const updated = await updateWorkspace(req.params.workspaceId, parsed.data);
  if (!updated) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: updated });
});

workspacesRouter.delete('/:workspaceId', async (req, res) => {
  const ok = await deleteWorkspace(req.params.workspaceId);
  if (!ok) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: { deleted: true } });
});

// Middleware: applied at the workspace-scoped sub-router. Loads the workspace
// from req.params.workspaceId and 404s if missing. Stashes it on req for handlers.
export async function resolveWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.workspaceId;
  if (!id) {
    res.status(400).json({ data: null, error: 'workspaceId is required' });
    return;
  }
  const ws = await getWorkspace(id);
  if (!ws) {
    res.status(404).json({ data: null, error: 'workspace not found' });
    return;
  }
  (req as Request & { workspace?: typeof ws; workspaceId?: string }).workspace = ws;
  (req as Request & { workspaceId?: string }).workspaceId = ws.id;
  next();
}

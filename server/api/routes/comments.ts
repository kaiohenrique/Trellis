import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createComment, deleteComment, listComments, updateComment } from '../../core/graph.js';

export const commentsRouter = Router({ mergeParams: true });
export const commentMutateRouter = Router({ mergeParams: true });

const CreateCommentBody = z.object({
  author: z.string().optional(),
  body: z.string().min(1),
  parent_id: z.number().int().positive().nullable().optional(),
});

const UpdateCommentBody = z.object({
  body: z.string().min(1),
});

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

commentsRouter.get('/', async (req: Request, res: Response) => {
  const tree = await listComments(ws(req), req.params.id);
  res.json({ data: tree });
});

commentsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = CreateCommentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const created = await createComment(ws(req), {
    node_id: req.params.id,
    author: parsed.data.author,
    body: parsed.data.body,
    parent_id: parsed.data.parent_id ?? null,
  });
  res.status(201).json({ data: created });
});

commentMutateRouter.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const parsed = UpdateCommentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const updated = await updateComment(ws(req), id, parsed.data.body);
  if (!updated) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: updated });
});

commentMutateRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = await deleteComment(ws(req), id);
  if (!ok) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: { deleted: true } });
});

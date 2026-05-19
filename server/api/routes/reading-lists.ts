import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  addReadingListItem,
  deleteReadingList,
  getReadingList,
  listReadingLists,
  removeReadingListItem,
  reorderReadingList,
  upsertReadingList,
} from '../../core/graph.js';

export const readingListsRouter = Router({ mergeParams: true });

const ListBody = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_\-]+$/i, 'id must be a slug'),
  title: z.string().min(1),
  description: z.string().optional(),
  created_by: z.string().optional(),
});

const ListUpdate = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  created_by: z.string().optional(),
});

const ItemBody = z.object({
  node_id: z.string().min(1),
  position: z.number().int().min(0).max(99999).optional(),
  note: z.string().optional(),
});

const OrderBody = z.object({
  order: z.array(z.string().min(1)).min(1),
});

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

readingListsRouter.get('/', async (req, res) => {
  const lists = await listReadingLists(ws(req));
  res.json({ data: lists });
});

readingListsRouter.post('/', async (req, res) => {
  const parsed = ListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const created = await upsertReadingList(ws(req), parsed.data);
  res.status(201).json({ data: created });
});

readingListsRouter.get('/:id', async (req, res) => {
  const list = await getReadingList(ws(req), req.params.id);
  if (!list) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: list });
});

readingListsRouter.put('/:id', async (req, res) => {
  const parsed = ListUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const existing = await getReadingList(ws(req), req.params.id);
  if (!existing) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  const updated = await upsertReadingList(ws(req), {
    id: req.params.id,
    title: parsed.data.title ?? existing.title,
    description: parsed.data.description ?? existing.description,
    created_by: parsed.data.created_by ?? existing.created_by,
  });
  res.json({ data: updated });
});

readingListsRouter.delete('/:id', async (req, res) => {
  const ok = await deleteReadingList(ws(req), req.params.id);
  if (!ok) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: { deleted: true } });
});

// Items
readingListsRouter.post('/:id/items', async (req, res) => {
  const parsed = ItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  try {
    const item = await addReadingListItem(ws(req), req.params.id, parsed.data);
    res.status(201).json({ data: item });
  } catch (err) {
    // FK violation if node_id doesn't exist
    res.status(400).json({ data: null, error: (err as Error).message });
  }
});

readingListsRouter.delete('/:id/items/:nodeId', async (req, res) => {
  const ok = await removeReadingListItem(ws(req), req.params.id, req.params.nodeId);
  if (!ok) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: { deleted: true } });
});

readingListsRouter.put('/:id/order', async (req, res) => {
  const parsed = OrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  await reorderReadingList(ws(req), req.params.id, parsed.data.order);
  const updated = await getReadingList(ws(req), req.params.id);
  res.json({ data: updated });
});

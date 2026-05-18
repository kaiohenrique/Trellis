import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { deleteDomain, getDomain, listDomains, upsertDomain } from '../../core/graph.js';

export const domainsRouter = Router({ mergeParams: true });

const DomainBody = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_\-]+$/i, 'id must be a slug'),
  label: z.string().optional(),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be hex like #RRGGBB').nullable().optional(),
  position: z.number().int().min(0).max(9999).optional(),
});

const DomainUpdate = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  position: z.number().int().min(0).max(9999).optional(),
});

const DeleteBody = z.object({
  move_to: z.string().min(1).optional(),
});

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

// GET — list with node counts
domainsRouter.get('/', async (req, res) => {
  const list = await listDomains(ws(req));
  res.json({ data: list });
});

// GET — single
domainsRouter.get('/:id', async (req, res) => {
  const d = await getDomain(ws(req), req.params.id);
  if (!d) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: d });
});

// POST — create (will overwrite if id collides; upserts)
domainsRouter.post('/', async (req, res) => {
  const parsed = DomainBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const created = await upsertDomain(ws(req), parsed.data);
  res.status(201).json({ data: created });
});

// PUT — update existing
domainsRouter.put('/:id', async (req, res) => {
  const parsed = DomainUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const existing = await getDomain(ws(req), req.params.id);
  if (!existing) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  const updated = await upsertDomain(ws(req), {
    id: req.params.id,
    label: parsed.data.label ?? existing.label,
    description: parsed.data.description ?? existing.description,
    color: parsed.data.color === undefined ? existing.color : parsed.data.color,
    position: parsed.data.position ?? existing.position,
  });
  res.json({ data: updated });
});

// DELETE — accepts { move_to } in the body to reassign nodes before delete.
// Without move_to, returns 409 if the domain still has nodes.
domainsRouter.delete('/:id', async (req, res) => {
  const parsed = DeleteBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  const result = await deleteDomain(ws(req), req.params.id, { moveTo: parsed.data.move_to });
  if (result.ok) {
    res.json({ data: { deleted: true } });
    return;
  }
  if (result.reason === 'not_found') {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  if (result.reason === 'move_target_missing') {
    res.status(400).json({ data: null, error: 'move_to domain does not exist' });
    return;
  }
  // has_nodes
  res.status(409).json({
    data: { node_count: result.node_count },
    error: `cannot delete: ${result.node_count} node(s) still use this domain. Pass { "move_to": "<other-domain>" } to reassign them.`,
  });
});

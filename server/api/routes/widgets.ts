import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { RendererType } from '@kb/shared';
import { deleteWidget, getWidget, listWidgets, upsertWidget } from '../../core/graph.js';
import { runScript } from '../../core/sandbox.js';

export const widgetsRouter = Router({ mergeParams: true });

const RENDERERS = ['vega-lite', 'table', 'markdown', 'graph', 'html'] as const;

const WidgetBody = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_\-]+$/i),
  title: z.string().min(1),
  description: z.string().optional(),
  renderer: z.enum(RENDERERS),
  renderer_options: z.record(z.unknown()).optional(),
  data: z.unknown(),
  data_schema: z.record(z.unknown()).optional(),
  source_script: z.string().optional(),
  source_url: z.string().url().optional(),
  created_by: z.string().optional(),
});

function ws(req: Request): string {
  return (req as Request & { workspaceId: string }).workspaceId;
}

widgetsRouter.get('/', async (req: Request, res: Response) => {
  const renderer = (req.query.renderer as RendererType) || undefined;
  if (renderer && !RENDERERS.includes(renderer)) {
    res.status(400).json({ data: null, error: 'invalid renderer' });
    return;
  }
  const q = (req.query.q as string) || undefined;
  const widgets = await listWidgets(ws(req), { renderer, q });
  res.json({ data: widgets });
});

widgetsRouter.get('/:id', async (req: Request, res: Response) => {
  const w = await getWidget(ws(req), req.params.id);
  if (!w) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: w });
});

widgetsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = WidgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  if (!('data' in (req.body ?? {}))) {
    res.status(400).json({ data: null, error: 'data is required' });
    return;
  }
  const created = await upsertWidget(ws(req), { ...parsed.data, data: parsed.data.data });
  res.status(201).json({ data: created });
});

widgetsRouter.put('/:id', async (req: Request, res: Response) => {
  const parsed = WidgetBody.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ data: null, error: parsed.error.message });
    return;
  }
  if (!('data' in (req.body ?? {}))) {
    res.status(400).json({ data: null, error: 'data is required' });
    return;
  }
  const updated = await upsertWidget(ws(req), { ...parsed.data, data: parsed.data.data });
  res.json({ data: updated });
});

widgetsRouter.post('/:id/run', async (req: Request, res: Response) => {
  const w = await getWidget(ws(req), req.params.id);
  if (!w) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  if (!w.source_script || !w.source_script.trim()) {
    res.status(400).json({ data: null, error: 'widget has no source_script to re-run' });
    return;
  }
  const runResult = await runScript(ws(req), 'js', w.source_script);
  if (runResult.error) {
    res.status(500).json({ data: { run: runResult, widget: w }, error: runResult.error });
    return;
  }
  const updated = await getWidget(ws(req), req.params.id);
  res.json({ data: { run: runResult, widget: updated ?? w } });
});

widgetsRouter.delete('/:id', async (req: Request, res: Response) => {
  const ok = await deleteWidget(ws(req), req.params.id);
  if (!ok) {
    res.status(404).json({ data: null, error: 'not found' });
    return;
  }
  res.json({ data: { deleted: true } });
});

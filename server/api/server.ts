import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from '../db/migrate.js';
import { commentMutateRouter, commentsRouter } from './routes/comments.js';
import { edgesRouter } from './routes/edges.js';
import { graphRouter } from './routes/graph.js';
import { nodesRouter } from './routes/nodes.js';
import { queryRouter } from './routes/query.js';
import { scriptsRouter } from './routes/scripts.js';
import { versionsRouter } from './routes/versions.js';
import { widgetsRouter } from './routes/widgets.js';
import { resolveWorkspace, workspacesRouter } from './routes/workspaces.js';
import { mcpRouter } from './mcp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.KB_PORT ?? 3000);
const AUTH_TOKEN = process.env.KB_AUTH_TOKEN || '';
const MCP_ENABLED = process.env.KB_MCP_ENABLED !== 'false';
const NODE_ENV = process.env.NODE_ENV ?? 'development';

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_TOKEN) return next();
  const header = req.headers.authorization || '';
  if (header === `Bearer ${AUTH_TOKEN}`) return next();
  res.status(401).json({ data: null, error: 'unauthorized' });
}

export async function buildApp(): Promise<express.Application> {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  const api = express.Router();
  api.use(authMiddleware);

  // Workspace CRUD lives at the API root.
  api.use('/workspaces', workspacesRouter);

  // Everything else is mounted under a workspace.
  const wsRouter = express.Router({ mergeParams: true });
  wsRouter.use(resolveWorkspace);
  wsRouter.use('/nodes', nodesRouter);
  wsRouter.use('/nodes/:id/versions', versionsRouter);
  wsRouter.use('/nodes/:id/comments', commentsRouter);
  wsRouter.use('/comments', commentMutateRouter);
  wsRouter.use('/edges', edgesRouter);
  wsRouter.use('/query', queryRouter);
  wsRouter.use('/run', scriptsRouter);
  wsRouter.use('/graph', graphRouter);
  wsRouter.use('/widgets', widgetsRouter);
  api.use('/workspaces/:workspaceId', wsRouter);

  app.use('/api/v1', api);

  if (MCP_ENABLED) app.use('/mcp', mcpRouter());

  if (NODE_ENV === 'production') {
    const clientDist = resolve(__dirname, '../../../client/dist');
    if (existsSync(clientDist)) {
      app.use(express.static(clientDist));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(join(clientDist, 'index.html'));
      });
    }
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] unhandled error', err);
    res.status(500).json({ data: null, error: err.message });
  });

  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  (async () => {
    await migrate();
    const app = await buildApp();
    app.listen(PORT, () => {
      console.log(`[trellis] api listening on http://localhost:${PORT}`);
      if (MCP_ENABLED) console.log(`[trellis] mcp sse at http://localhost:${PORT}/mcp`);
    });
  })().catch((err) => {
    console.error('[trellis] startup failed', err);
    process.exit(1);
  });
}

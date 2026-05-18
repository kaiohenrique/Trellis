# Trellis — developer notes for Claude Code

Conventions for working *on* this codebase (not for users of the trellis-kb plugin).

## Project shape

Monorepo with three npm workspaces:

- `shared/` — TypeScript types only. `@kb/shared` path alias. Both server and client import from
  here. Never put logic here.
- `server/` — Node + Express + pg + MCP. Runs via tsx (no compile step in production).
- `client/` — Vite + React 18 + TypeScript. React Query for server state. No Redux/Zustand.

## Hard rules

- **One file talks to the DB**: `server/core/graph.ts` is the only file that imports
  `server/db/client.ts`. Routes and the MCP server call graph functions — never `pool.query`
  directly.
- **Every graph function takes `workspaceId` as the first arg.** No "current workspace" state on
  the server. Every SQL has `WHERE workspace_id = $1`.
- **No ORM.** Write SQL through `pg`. Recursive CTEs for graph traversal.
- **No bundler for the server.** `tsx` runs the TypeScript directly in dev and prod. Don't add a
  compile-to-JS step.
- **Domain auto-create**: inserting a node into a non-existent domain auto-creates the domain row
  in the same transaction. Don't validate domain existence at API level.
- **Widgets**: `data` is free-form; `renderer` + `renderer_options` describe display. They're
  independent — re-running the source script changes `data` and `last_run_at` only.

## What not to do

- Don't bypass `core/graph.ts` from routes.
- Don't validate `domain` against a fixed list — anything is valid.
- Don't change npm package names (`@kb/shared`, `@kb/server`, `@kb/client`). They're internal.
- Don't store version diffs — keep full snapshots in `node_versions` and diff on the client.
- Don't put shared types in `server/` or `client/` — only in `shared/`.

## Running locally

```bash
docker compose up -d     # postgres on :5432
npm install
npm run migrate          # idempotent — also runs on server startup
npm run seed             # 20 nodes + 21 edges + 5 widgets in ai-agents workspace
npm run dev              # api :3000, vite :5173
```

## MCP for in-repo Claude Code sessions

The repo root has a `.mcp.json` that registers the local Trellis MCP server. When you open this
repo in Claude Code, you get the `trellis` server for free — no `claude mcp add` needed. The seed
data is the default playground.

## Tests

```bash
npm test -w server        # unit only (vitest)
KB_DATABASE_URL=… npm test -w server   # includes integration tests
```

Unit tests cover `core/wiki.ts` and `core/graph.ts:toTsQuery`. Integration tests need a Postgres.

## Migrations

`server/db/migrate.ts` runs on server startup and is idempotent. For a fresh DB it applies
`schema.sql` in full. For an existing DB it detects schema version by checking for tables/columns
and runs incremental migrations (widget redesign, workspace introduction, domain entity). Adding a
new migration: write the SQL inline as a constant and add a detection branch in `migrate()`.

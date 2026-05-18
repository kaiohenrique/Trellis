# Trellis

A structured, queryable knowledge base focused on AI agents. Concepts, frameworks, research, tools,
workflows, people, papers — stored as a graph, exposed over REST + MCP, with a Notion-shaped wiki UI.

The name: a trellis is a lattice structure that supports climbing plants. Same idea here — a scaffold
on which knowledge grows and connects.

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────┐     ┌──────────────┐
│  React SPA  │ ◄──►│  Express  ─ /api/v1 ─ routes/  ◄────────►│   Postgres   │
│  (Vite)     │     │             /mcp     ─ MCP SSE           │  + pgvector  │
└─────────────┘     │             core/    ─ graph, query,     │              │
                    │                        sandbox, wiki     └──────────────┘
       MCP clients  │             sdk/     ─ kb SDK
   (Claude, etc.) ─►│
                    └──────────────────────────────────────────┘
```

- **Storage** — single Postgres database. `nodes` + `edges` with `tsvector` FTS and a placeholder
  `vector(1536)` column for future embeddings. Recursive CTEs do graph traversal.
- **Core** — graph engine, query language, JS/Python script sandbox, wiki helpers.
- **Interface** — REST (`/api/v1`), MCP (`/mcp`), and the React wiki UI.

## Prerequisites

- Node 20+
- Docker (for Postgres with pgvector)
- Python 3 (optional — only if you want to run Python agent scripts)

## Quick start

```bash
cp .env.example .env             # KB_DATABASE_URL defaults to the docker compose service
docker compose up -d             # start postgres on :5432
npm install                      # install all workspaces
npm run migrate                  # create schema
npm run seed                     # load 20+ seed nodes, edges, and 3 widgets
npm run dev                      # api on :3000, vite on :5173
```

Then open <http://localhost:5173>.

## REST API

Base path: `/api/v1`. All responses follow `{ data: T, error?: string }`.

### Nodes

| Method | Path | Notes |
|--------|------|-------|
| `GET`    | `/nodes`                    | Filters: `domain`, `tags` (csv), `q`, `limit`, `offset` |
| `GET`    | `/nodes/:id`                | Includes `edges: { outgoing, incoming }` |
| `POST`   | `/nodes`                    | `{ id, title, domain, body?, tags?, metadata?, changed_by?, change_summary? }` |
| `PUT`    | `/nodes/:id`                | Same fields — automatically snapshots a new version |
| `DELETE` | `/nodes/:id`                | Cascades to edges, versions, comments |
| `GET`    | `/nodes/autocomplete?q=…`   | Prefix match, returns `{ id, title, domain }[]` |

### Edges

| Method | Path | Body |
|--------|------|------|
| `GET`    | `/edges?from=…&to=…&relation=…` | — |
| `POST`   | `/edges`                        | `{ from, to, relation, weight?, metadata? }` |
| `DELETE` | `/edges`                        | `{ from, to, relation }` |

### Query, scripts, versions, comments, widgets, graph

| Method | Path | Description |
|--------|------|-------------|
| `POST`   | `/query`                                  | Structured query — see below |
| `POST`   | `/run`                                    | `{ lang: "js" | "python", code }` |
| `GET`    | `/nodes/:id/versions`                     | List version summaries |
| `GET`    | `/nodes/:id/versions/:v`                  | Full snapshot |
| `POST`   | `/nodes/:id/versions/:v/restore`          | Restore to a past version |
| `GET`    | `/nodes/:id/comments`                     | Tree of threaded comments |
| `POST`   | `/nodes/:id/comments`                     | `{ author?, body, parent_id? }` |
| `PUT`    | `/comments/:id`                           | `{ body }` |
| `DELETE` | `/comments/:id`                           | — |
| `GET`    | `/widgets[?type=…&q=…]`                   | List widgets |
| `GET`    | `/widgets/:id`                            | Full spec |
| `POST`   | `/widgets`                                | Create/upsert |
| `PUT`    | `/widgets/:id`                            | Replace |
| `DELETE` | `/widgets/:id`                            | — |
| `GET`    | `/graph`                                  | Full graph export |
| `GET`    | `/graph/domain/:domain`                   | Domain subgraph |

### Query language

`POST /query` accepts a JSON object. All fields are optional and AND-combined.

```json
{
  "domain": "architectures",
  "tags": ["multi-agent"],
  "relation": { "from": "react-pattern", "type": "extends" },
  "text": "planning",
  "limit": 25,
  "depth": 2
}
```

`depth > 0` triggers graph expansion from the matched seed nodes.

## Agent scripts

Submit JS to `POST /api/v1/run` and the sandbox runs it in `vm.runInNewContext` with the `kb` SDK
injected. Default timeout 10s (`KB_SCRIPT_TIMEOUT`).

```bash
curl -s localhost:3000/api/v1/run -H 'content-type: application/json' -d '{
  "lang": "js",
  "code": "const tools = await kb.list({ domain: \"tools\" }); kb.log(\"found\", tools.length); result = tools.map(t => t.id);"
}' | jq
```

Two more useful examples:

```js
// Build a widget — node count per domain — and persist it
const all = await kb.list();
const counts = {};
for (const n of all) counts[n.domain] = (counts[n.domain] || 0) + 1;
const values = Object.entries(counts).map(([domain, count]) => ({ domain, count }));
await kb.widgetChart('coverage', 'Coverage', {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  data: { values },
  mark: 'bar',
  encoding: { x: { field: 'domain' }, y: { field: 'count' } }
});
```

```js
// Find orphan nodes (no outgoing edges) in the "tools" domain
const tools = await kb.list({ domain: 'tools' });
const orphans = [];
for (const t of tools) {
  const out = await kb.edges({ from: t.id });
  if (out.length === 0) orphans.push(t.id);
}
result = orphans;
```

Python is supported via subprocess — the wrapper provides a thin `kb` object that calls back to the
local API. Set `KB_API_BASE` if the API is not at `http://127.0.0.1:3000/api/v1`.

## MCP

The server exposes a Model Context Protocol endpoint at `/mcp` over SSE. Sample Claude Desktop config:

```json
{
  "mcpServers": {
    "trellis": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Exposed tools: `kb_get`, `kb_list`, `kb_search`, `kb_query`, `kb_save`, `kb_link`, `kb_run`,
`kb_neighbors`, `kb_graph`, `kb_widget_list`, `kb_widget_get`, `kb_widget_chart`, `kb_widget_table`,
`kb_widget_markdown`, `kb_widget_graph`.

## Database

- Single Postgres database with `vector`, `pg_trgm`, and `uuid-ossp` extensions.
- `nodes` carries a `vector(1536)` placeholder column and a `tsvector` generated column for FTS.
- `edges` is a triple: `(from_id, to_id, relation)` with a weight in [0,1] and free-form metadata.
- Every insert/update to `nodes` triggers a snapshot into `node_versions` — full body, not a diff.
- `comments` are threaded (`parent_id`) and store markdown.
- `widgets` store reproducible agent outputs (chart / table / markdown / graph).

Run migrations with `npm run migrate`. The migrator is one-shot — it applies `db/schema.sql` if the
`nodes` table is absent. Add `db/002_*.sql` and extend `migrate.ts` as the schema evolves.

## Make targets

```
make install   # npm install
make db-up     # docker compose up -d
make db-down   # docker compose down
make migrate   # apply schema
make seed      # load seed data + widgets
make dev       # run both server and client in dev mode
make build     # build everything
make start     # production server (serves built client from /)
make test      # vitest
```

## Project layout

```
kb/
├── shared/                # @kb/shared — types only
├── server/
│   ├── core/              # graph, query, sandbox, wiki
│   ├── db/                # pg client, migrate, schema.sql
│   ├── api/routes/        # nodes, edges, query, scripts, versions, comments, widgets, graph
│   ├── api/mcp.ts         # MCP SSE server
│   ├── sdk/kb.ts          # SDK injected into agent scripts
│   ├── seed/seed.ts       # seed data
│   └── tests/             # vitest
└── client/                # Vite + React SPA
    └── src/
        ├── pages/         # Home, NodePage, HistoryPage, DiffPage, GraphView, Manage
        ├── components/    # MarkdownRenderer, WikiEditor, CommentThread, GraphCanvas, ...
        └── hooks/         # React Query hooks
```

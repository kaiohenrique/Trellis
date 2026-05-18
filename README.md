# Trellis

> A structured, queryable knowledge base focused on AI agents — concepts, frameworks, research, tools, workflows, people, papers. Stored as a graph, exposed over REST + MCP, with a Notion-shaped wiki UI and scriptable widgets.

The name: a *trellis* is a lattice structure that supports climbing plants. Same idea here — a scaffold on which knowledge grows and connects.

<p align="center">
  <a href="https://github.com/kaiohenrique/Trellis/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/kaiohenrique/Trellis/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/kaiohenrique/Trellis/actions/workflows/docker.yml"><img alt="Docker" src="https://github.com/kaiohenrique/Trellis/actions/workflows/docker.yml/badge.svg"></a>
  <a href="https://github.com/kaiohenrique/Trellis/pkgs/container/trellis"><img alt="ghcr.io" src="https://img.shields.io/badge/ghcr.io-trellis-blue?logo=docker"></a>
</p>

---

## Screenshots

| Home | Page (with mermaid + backlinks) |
| :--: | :--: |
| ![home](docs/screenshots/home.png) | ![node](docs/screenshots/node-page.png) |

| Graph | All pages |
| :--: | :--: |
| ![graph](docs/screenshots/graph-view.png) | ![manage](docs/screenshots/manage.png) |

| Widgets index | Vega-Lite chart widget |
| :--: | :--: |
| ![widgets](docs/screenshots/widgets.png) | ![widget](docs/screenshots/widget-chart.png) |

---

## What's in it

- **Graph backend** — PostgreSQL with `pgvector` (placeholder for future embeddings), `tsvector` full-text search, recursive-CTE graph traversal. No ORM.
- **Workspaces** — full isolation between workspaces; every node, edge, widget, comment, and version is scoped. No cross-workspace queries.
- **REST API** — every resource mounted under `/api/v1/workspaces/:ws/…`.
- **MCP server** — Model Context Protocol over SSE at `/mcp`, so any MCP-aware agent (Claude Code, Claude Desktop, etc.) can read and write the graph.
- **Script sandbox** — `POST /run` executes JS in a `vm` sandbox with a workspace-scoped `kb` SDK injected, plus `fetch` for third-party APIs. Python supported via subprocess.
- **Widgets** — persistent, renderable outputs from agent scripts. Renderer + data are independent: `vega-lite` (charts), `table`, `markdown` (with templates), `graph` (arbitrary node/edge graphs), and `html` (sandboxed iframe escape hatch).
- **Wiki UI** — Notion-shaped React SPA. Sidebar nav, search, mermaid + wikilink-aware markdown, in-place CodeMirror editor with `[[`-autocomplete, threaded comments, version history with side-by-side diff, force-directed graph view.
- **Versioning** — every save snapshots into `node_versions`. Diff and restore from the UI.

---

## Quick start

### Option A — Docker only (recommended)

You need [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
git clone https://github.com/kaiohenrique/Trellis.git
cd Trellis
cp .env.example .env
docker compose up -d                     # start Postgres
docker run --rm --network host \
  --env-file .env \
  ghcr.io/kaiohenrique/trellis:latest \
  npm run seed -w server                  # seed the AI Agents workspace
docker run -d --name trellis --network host \
  --env-file .env \
  ghcr.io/kaiohenrique/trellis:latest
```

Open <http://localhost:3000>.

### Option B — Source + Docker Postgres (for development)

You need Node 20+ and Docker.

```bash
git clone https://github.com/kaiohenrique/Trellis.git
cd Trellis
cp .env.example .env
docker compose up -d         # only postgres
npm install
npm run migrate              # create schema + ai-agents workspace
npm run seed                 # load 20 seed nodes + 5 widgets
npm run dev                  # api on :3000, vite on :5173
```

Open <http://localhost:5173>.

### Option C — Fully manual

You need Node 20+ and a reachable PostgreSQL 14+ with the `vector` and `pg_trgm` extensions.

```bash
git clone https://github.com/kaiohenrique/Trellis.git
cd Trellis
cp .env.example .env
# Point KB_DATABASE_URL at your own Postgres
psql "$KB_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
npm install
npm run migrate
npm run seed
npm run dev
```

---

## Pre-built image (GitHub Container Registry)

Every push to `main` publishes a multi-arch image to ghcr.io:

```bash
docker pull ghcr.io/kaiohenrique/trellis:latest
```

Tags available:

| Tag | When |
|---|---|
| `latest` | Tip of `main` |
| `main` | Same as `latest` |
| `sha-<short>` | Every build |
| `vX.Y.Z` / `vX.Y` | Git tags matching `v*` |

Architectures: `linux/amd64`, `linux/arm64`.

### Run the image standalone

The image needs a reachable Postgres. Example with the bundled `docker-compose.yml`:

```bash
docker compose up -d                              # postgres only
docker run --rm \
  -e KB_DATABASE_URL=postgres://kb:kb@host.docker.internal:5432/kb \
  ghcr.io/kaiohenrique/trellis:latest \
  npm run migrate -w server                       # one-shot migrate
docker run -d --name trellis -p 3000:3000 \
  -e KB_DATABASE_URL=postgres://kb:kb@host.docker.internal:5432/kb \
  ghcr.io/kaiohenrique/trellis:latest
```

`http://localhost:3000` serves both the API and the built React app (in `NODE_ENV=production`, Express serves `client/dist` at `/`).

---

## Configuration

All config via environment variables. See [`.env.example`](.env.example).

| Variable | Default | Notes |
|---|---|---|
| `KB_DATABASE_URL` | — | **Required.** `postgres://user:pass@host:port/db` |
| `KB_PORT` | `3000` | HTTP port the server listens on |
| `KB_SCRIPT_TIMEOUT` | `10000` | JS/Python sandbox timeout in ms |
| `KB_MCP_ENABLED` | `true` | Set `false` to disable `/mcp` |
| `KB_AUTH_TOKEN` | — | If set, all API + MCP routes require `Authorization: Bearer <token>` |
| `NODE_ENV` | `development` | Set to `production` so Express serves `client/dist` |

---

## REST API

Base path: `/api/v1`. Every response follows `{ data: T, error?: string }`.

### Workspaces

| Method | Path | Body |
|---|---|---|
| `GET` | `/workspaces` | — |
| `POST` | `/workspaces` | `{ id, name, description? }` |
| `GET` | `/workspaces/:ws` | — |
| `PUT` | `/workspaces/:ws` | `{ name?, description? }` |
| `DELETE` | `/workspaces/:ws` | Cascades to **all** data in that workspace |

### Workspace-scoped resources

All paths below are mounted under `/api/v1/workspaces/:ws/`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/nodes` | Filters: `domain`, `tags` (csv), `q`, `limit`, `offset` |
| `GET` | `/nodes/:id` | Includes `{ edges: { outgoing, incoming } }` |
| `POST` | `/nodes` | `{ id, title, domain, body?, tags?, metadata?, changed_by?, change_summary? }` |
| `PUT` | `/nodes/:id` | Same; auto-snapshots a new version |
| `DELETE` | `/nodes/:id` | Cascades to edges/versions/comments |
| `GET` | `/nodes/autocomplete?q=…` | Prefix match, returns `{ id, title, domain }[]` |
| `GET` | `/nodes/:id/versions` | Newest first, no body |
| `GET` | `/nodes/:id/versions/:v` | Full snapshot |
| `POST` | `/nodes/:id/versions/:v/restore` | Restore to past version |
| `GET` | `/nodes/:id/comments` | Tree of threaded comments |
| `POST` | `/nodes/:id/comments` | `{ author?, body, parent_id? }` |
| `PUT` | `/comments/:id` | `{ body }` |
| `DELETE` | `/comments/:id` | — |
| `GET` | `/edges?from=&to=&relation=` | All filters optional |
| `POST` | `/edges` | `{ from, to, relation, weight?, metadata? }` |
| `DELETE` | `/edges` | `{ from, to, relation }` |
| `POST` | `/query` | Structured graph query (see below) |
| `POST` | `/run` | `{ lang: "js" \| "python", code }` |
| `GET` | `/graph` | Full export |
| `GET` | `/graph/domain/:domain` | Domain subgraph |
| `GET` | `/widgets[?renderer=&q=]` | List |
| `GET` | `/widgets/:id` | Full spec |
| `POST` | `/widgets` | Create/replace |
| `PUT` | `/widgets/:id` | Replace |
| `POST` | `/widgets/:id/run` | Re-execute the widget's source script |
| `DELETE` | `/widgets/:id` | — |

### Query language

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

All fields optional, AND-combined. `depth > 0` triggers graph expansion from matched seed nodes.

---

## Agent scripts

Submit JS to `POST /api/v1/workspaces/:ws/run` and the sandbox runs it in `vm.runInNewContext` with a workspace-scoped `kb` SDK injected. `fetch`, `URL`, `Headers`, `AbortController` are available. Default timeout 10s (`KB_SCRIPT_TIMEOUT`).

```bash
curl -s localhost:3000/api/v1/workspaces/ai-agents/run \
  -H 'content-type: application/json' \
  -d '{
    "lang": "js",
    "code": "const tools = await kb.list({ domain: \"tools\" }); kb.log(\"found\", tools.length); result = tools.map(t => t.id);"
  }' | jq
```

### Scripted widgets

A widget is a named, persistent renderable output. `data` is the raw payload; `renderer` + `renderer_options` describe how to display it. Re-running the source script updates `data` and `last_run_at` without touching the spec.

**Chart from a third-party API** (GitHub PRs):

```js
const res = await fetch('https://api.github.com/repos/langchain-ai/langchain/pulls?state=open&per_page=100');
const prs = await res.json();
const byUser = {};
for (const pr of prs) byUser[pr.user.login] = (byUser[pr.user.login] || 0) + 1;
const rows = Object.entries(byUser).map(([user, count]) => ({ user, count }));

await kb.widget('langchain-prs-by-user', 'LangChain open PRs by contributor', {
  renderer: 'vega-lite',
  renderer_options: {
    spec: {
      mark: 'bar',
      encoding: {
        x: { field: 'count', type: 'quantitative' },
        y: { field: 'user', type: 'nominal', sort: '-x' }
      }
    }
  },
  data: rows,
  source_url: 'https://api.github.com/repos/langchain-ai/langchain/pulls',
  description: 'Number of open PRs per contributor'
});
result = rows.length + ' contributors';
```

**Templated markdown card**:

```js
const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current_weather=true');
const weather = await res.json();
await kb.widget('paris-weather', 'Paris weather', {
  renderer: 'markdown',
  renderer_options: {
    template: '## {{location}}\n**{{temp}}°C** · {{wind}} km/h\n\n*Updated {{updated}}*'
  },
  data: {
    location: 'Paris, France',
    temp: weather.current_weather.temperature,
    wind: weather.current_weather.windspeed,
    updated: new Date().toISOString(),
  }
});
```

**Refresh from outside**: `POST /api/v1/workspaces/:ws/widgets/:id/run` re-executes the stored `source_script`. Useful for cron-style refresh.

---

## Use it from Claude Code

There are three install paths, in increasing order of "Claude Code does it automatically".

### 1. Bare MCP — manual

The server exposes an MCP endpoint at `/mcp` (SSE transport). Register it once and Claude Code (or
any MCP-aware client) discovers the tools.

```bash
claude mcp add --transport sse trellis http://localhost:3000/mcp
```

Or via `.mcp.json` checked into your project root:

```json
{
  "mcpServers": {
    "trellis": {
      "type": "sse",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

This gives Claude Code access to the tools but it'll only use them when you ask. No automatic
memory behavior.

### 2. Plugin — automatic behavior (recommended)

Trellis ships with a **Claude Code plugin** that wires up:

- The MCP server registration (you don't need step 1)
- A `trellis-memory` skill that auto-activates on agent-related conversations
- Slash commands: `/kb-search`, `/kb-remember`, `/kb-link`, `/kb-domains`, `/kb-context`
- A Stop hook that nudges the model to checkpoint generalizable knowledge before ending the turn

Install:

```bash
# Inside a Claude Code session
/plugin marketplace add kaiohenrique/Trellis
/plugin install trellis-kb@trellis
```

After install, any conversation about AI agents will:

- Search the KB before answering
- Reference existing nodes with `[[wikilinks]]`
- Save new generalizable learnings as nodes with typed edges
- Skip ephemeral content (debugging, project-specific stuff)

The plugin lives in [`.claude-plugin/`](.claude-plugin) — open it to read the skill instructions
and slash commands. Configure via env vars:

| Env var | Default | What it does |
|---|---|---|
| `TRELLIS_URL` | `http://localhost:3000/mcp` | Where the plugin's MCP client connects |
| `TRELLIS_WORKSPACE` | `ai-agents` | Default workspace for skill + commands |

### 3. Project-local override

If you want different KB behavior per project (e.g. different default workspace, or different
trigger rules), drop a project-level `CLAUDE.md` and a project-level `.mcp.json` in the project
root. They override the plugin defaults in that project only.

### Tools exposed

| Tool | What it does |
|---|---|
| `kb_workspace_list` / `kb_workspace_get` / `kb_workspace_create` | Workspace registry |
| `kb_domain_list` / `kb_domain_get` / `kb_domain_save` | Domain entity registry |
| `kb_get`, `kb_list`, `kb_search`, `kb_query` | Read nodes |
| `kb_save`, `kb_link` | Write nodes + edges |
| `kb_run` | Execute a JS/Python script in the workspace sandbox |
| `kb_neighbors`, `kb_graph` | Graph traversal |
| `kb_widget_list` / `kb_widget_get` / `kb_widget_save` / `kb_widget_refresh_data` | Widgets |

Every data tool requires `workspace_id` — there is no "current workspace" session state on the
server. The plugin's skill and slash commands inject the default from `TRELLIS_WORKSPACE`.

### Auth

If `KB_AUTH_TOKEN` is set on the server, supply it in the MCP client config:

```json
{
  "mcpServers": {
    "trellis": {
      "type": "sse",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

---

## Architecture

```
┌──────────────────┐                      ┌─────────────────────────────────────┐
│  Claude Code     │  ── MCP / SSE ──►   │  Express                            │
│  (or any MCP     │                      │  ├── /api/v1/workspaces/:ws/…       │
│   client)        │                      │  │     • nodes / edges / versions  │
└──────────────────┘                      │  │     • comments / widgets        │
                                          │  │     • query / run / graph       │
┌──────────────────┐    HTTP/REST         │  ├── /api/v1/workspaces            │
│  React SPA       │  ───────────────►    │  └── /mcp  (SSE)                   │
│  (Vite, on :5173 │                      │                                     │
│   in dev)        │                      │  core/                              │
└──────────────────┘                      │   ├── graph.ts   ── only file that │
                                          │   ├── query.ts      touches db/    │
                                          │   ├── sandbox.ts                   │
                                          │   └── wiki.ts                      │
                                          │  sdk/kb.ts ── injected into scripts│
                                          └──────────┬──────────────────────────┘
                                                     │
                                              pg + recursive CTEs
                                                     ▼
                                          ┌─────────────────────────────────────┐
                                          │  PostgreSQL                         │
                                          │   workspaces                        │
                                          │   nodes  (workspace_id, id) PK      │
                                          │   edges  (FK to nodes, scoped)      │
                                          │   node_versions / comments          │
                                          │   widgets                           │
                                          │   pgvector(1536) placeholder        │
                                          │   tsvector + GIN index              │
                                          └─────────────────────────────────────┘
```

### Project layout

```
trellis/
├── shared/           # @kb/shared — TypeScript types only
├── server/
│   ├── core/         # graph, query, sandbox, wiki helpers
│   ├── db/           # pg client, migrate, schema.sql
│   ├── api/          # Express routes + MCP server
│   ├── sdk/kb.ts     # SDK injected into agent scripts
│   ├── seed/seed.ts  # 20 nodes + 21 edges + 5 widgets across all renderers
│   └── tests/        # vitest
└── client/
    └── src/
        ├── pages/    # Home, NodePage, HistoryPage, DiffPage, GraphView, Manage, Widgets
        ├── components/  # MarkdownRenderer, WikiEditor, GraphCanvas, Sidebar, …
        ├── hooks/    # React Query hooks
        └── context/  # WorkspaceContext
```

---

## Development

```bash
make install    # npm install
make db-up      # docker compose up -d postgres
make migrate    # apply schema
make seed       # load seed data
make dev        # run server + client concurrently
make build      # build everything
make test       # vitest
```

Tests:

```bash
npm test -w server                              # unit tests only (no DB needed)
KB_DATABASE_URL=… npm test -w server            # also runs integration tests
```

---

## CI / CD

Two GitHub Actions workflows in [`.github/workflows`](.github/workflows):

- **[`ci.yml`](.github/workflows/ci.yml)** — typechecks server + client, runs `vitest`, builds the client. Runs on every push and PR to `main`.
- **[`docker.yml`](.github/workflows/docker.yml)** — builds and pushes a multi-arch image to `ghcr.io/<owner>/trellis` on every push to `main` and on `v*` tags. Uses the built-in `GITHUB_TOKEN`, includes [build provenance attestation](https://github.com/actions/attest-build-provenance) for supply-chain integrity.

Cutting a release:

```bash
git tag v0.2.0
git push origin v0.2.0
# triggers docker.yml — image published as ghcr.io/kaiohenrique/trellis:0.2.0
```

---

## License

MIT.

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withClient } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function tableExists(name: string): Promise<boolean> {
  const result = await withClient((client) =>
    client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [name],
    ),
  );
  return (result.rowCount ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await withClient((client) =>
    client.query(
      `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column],
    ),
  );
  return (result.rowCount ?? 0) > 0;
}

// Drop-and-recreate of the widgets table for the renderer-model redesign.
// Only used by databases that already have the old widgets schema (type/spec).
const WIDGETS_REDESIGN_SQL = `
  DROP TABLE IF EXISTS widgets CASCADE;
  CREATE TABLE widgets (
    id               text PRIMARY KEY,
    title            text NOT NULL,
    description      text NOT NULL DEFAULT '',
    renderer         text NOT NULL
                     CHECK (renderer IN ('vega-lite','table','markdown','graph','html')),
    renderer_options jsonb NOT NULL DEFAULT '{}',
    data             jsonb NOT NULL DEFAULT 'null',
    data_schema      jsonb,
    source_script    text NOT NULL DEFAULT '',
    source_url       text,
    created_by       text NOT NULL DEFAULT 'agent',
    last_run_at      timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX widgets_renderer_idx ON widgets (renderer);
  CREATE INDEX widgets_last_run_idx ON widgets (last_run_at DESC);
  CREATE TRIGGER widgets_updated_at
    BEFORE UPDATE ON widgets
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
`;

// Workspace migration — adds the workspaces table and a workspace_id column
// to every existing table, backfilling all rows into a default 'ai-agents' workspace.
const WORKSPACE_MIGRATION_SQL = `
  -- 1. workspaces table + default workspace
  CREATE TABLE workspaces (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    description text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE TRIGGER workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  INSERT INTO workspaces (id, name, description)
    VALUES ('ai-agents', 'AI Agents', 'Concepts, tools and research about AI agents');

  -- 2. Add workspace_id columns + backfill (no constraint changes yet).
  ALTER TABLE nodes         ADD COLUMN workspace_id text;
  ALTER TABLE edges         ADD COLUMN workspace_id text;
  ALTER TABLE node_versions ADD COLUMN workspace_id text;
  ALTER TABLE comments      ADD COLUMN workspace_id text;
  ALTER TABLE widgets       ADD COLUMN workspace_id text;
  UPDATE nodes         SET workspace_id = 'ai-agents';
  UPDATE edges         SET workspace_id = 'ai-agents';
  UPDATE node_versions SET workspace_id = 'ai-agents';
  UPDATE comments      SET workspace_id = 'ai-agents';
  UPDATE widgets       SET workspace_id = 'ai-agents';
  ALTER TABLE nodes         ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE edges         ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE node_versions ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE comments      ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE widgets       ALTER COLUMN workspace_id SET NOT NULL;

  -- 3. Drop dependent FKs on edges/node_versions/comments BEFORE touching nodes_pkey.
  ALTER TABLE edges         DROP CONSTRAINT IF EXISTS edges_from_id_fkey;
  ALTER TABLE edges         DROP CONSTRAINT IF EXISTS edges_to_id_fkey;
  ALTER TABLE node_versions DROP CONSTRAINT IF EXISTS node_versions_node_id_fkey;
  ALTER TABLE comments      DROP CONSTRAINT IF EXISTS comments_node_id_fkey;

  -- 4. Re-key nodes on (workspace_id, id).
  ALTER TABLE nodes DROP CONSTRAINT nodes_pkey;
  ALTER TABLE nodes ADD PRIMARY KEY (workspace_id, id);
  ALTER TABLE nodes ADD CONSTRAINT nodes_ws_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  DROP INDEX IF EXISTS nodes_domain_idx;
  CREATE INDEX nodes_ws_domain_idx ON nodes (workspace_id, domain);

  -- 5. Re-key edges and re-add scoped FKs into nodes.
  ALTER TABLE edges DROP CONSTRAINT edges_pkey;
  ALTER TABLE edges ADD PRIMARY KEY (workspace_id, from_id, to_id, relation);
  ALTER TABLE edges ADD CONSTRAINT edges_ws_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  ALTER TABLE edges ADD CONSTRAINT edges_from_fkey
    FOREIGN KEY (workspace_id, from_id) REFERENCES nodes(workspace_id, id) ON DELETE CASCADE;
  ALTER TABLE edges ADD CONSTRAINT edges_to_fkey
    FOREIGN KEY (workspace_id, to_id) REFERENCES nodes(workspace_id, id) ON DELETE CASCADE;
  DROP INDEX IF EXISTS edges_from_idx;
  DROP INDEX IF EXISTS edges_to_idx;
  DROP INDEX IF EXISTS edges_relation_idx;
  CREATE INDEX edges_ws_from_idx     ON edges (workspace_id, from_id);
  CREATE INDEX edges_ws_to_idx       ON edges (workspace_id, to_id);
  CREATE INDEX edges_ws_relation_idx ON edges (workspace_id, relation);

  -- 6. node_versions
  ALTER TABLE node_versions ADD CONSTRAINT node_versions_ws_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  ALTER TABLE node_versions ADD CONSTRAINT node_versions_node_fkey
    FOREIGN KEY (workspace_id, node_id) REFERENCES nodes(workspace_id, id) ON DELETE CASCADE;
  ALTER TABLE node_versions DROP CONSTRAINT IF EXISTS node_versions_node_id_version_key;
  ALTER TABLE node_versions ADD CONSTRAINT node_versions_unique
    UNIQUE (workspace_id, node_id, version);
  DROP INDEX IF EXISTS node_versions_node_idx;
  CREATE INDEX node_versions_ws_node_idx ON node_versions (workspace_id, node_id, version DESC);

  -- 7. comments
  ALTER TABLE comments ADD CONSTRAINT comments_ws_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  ALTER TABLE comments ADD CONSTRAINT comments_node_fkey
    FOREIGN KEY (workspace_id, node_id) REFERENCES nodes(workspace_id, id) ON DELETE CASCADE;
  DROP INDEX IF EXISTS comments_node_idx;
  CREATE INDEX comments_ws_node_idx ON comments (workspace_id, node_id, created_at);

  -- 8. widgets
  ALTER TABLE widgets DROP CONSTRAINT widgets_pkey;
  ALTER TABLE widgets ADD PRIMARY KEY (workspace_id, id);
  ALTER TABLE widgets ADD CONSTRAINT widgets_ws_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  DROP INDEX IF EXISTS widgets_renderer_idx;
  DROP INDEX IF EXISTS widgets_last_run_idx;
  CREATE INDEX widgets_ws_renderer_idx ON widgets (workspace_id, renderer);
  CREATE INDEX widgets_ws_last_run_idx ON widgets (workspace_id, last_run_at DESC);

  -- 9. Update the version-snapshot trigger to include workspace_id.
  CREATE OR REPLACE FUNCTION snapshot_node_version()
  RETURNS TRIGGER LANGUAGE plpgsql AS $func$
  DECLARE
    next_ver integer;
  BEGIN
    SELECT coalesce(max(version), 0) + 1
      INTO next_ver
      FROM node_versions
      WHERE workspace_id = NEW.workspace_id AND node_id = NEW.id;
    INSERT INTO node_versions (workspace_id, node_id, version, title, body, tags, metadata, changed_by, change_summary)
      VALUES (
        NEW.workspace_id,
        NEW.id,
        next_ver,
        NEW.title,
        NEW.body,
        NEW.tags,
        NEW.metadata,
        coalesce(current_setting('kb.changed_by', true), 'unknown'),
        coalesce(current_setting('kb.change_summary', true), '')
      );
    RETURN NEW;
  END;
  $func$;
`;

// Domain entity migration. Creates the domains table, seeds it with one row
// per distinct (workspace_id, domain) seen in nodes, then adds the FK.
//
// For the seven well-known seed domains we set sensible labels and colors so
// the UI keeps looking the same after the migration. Anything else gets a
// humanized label and null color (the client hashes a color).
const DOMAINS_MIGRATION_SQL = `
  CREATE TABLE domains (
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    id           text NOT NULL,
    label        text NOT NULL,
    description  text NOT NULL DEFAULT '',
    color        text,
    position     integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
  );
  CREATE INDEX domains_ws_position_idx ON domains (workspace_id, position, label);
  CREATE TRIGGER domains_updated_at
    BEFORE UPDATE ON domains
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

  -- Backfill: one row per distinct (workspace_id, domain) in nodes.
  INSERT INTO domains (workspace_id, id, label, color, position)
  SELECT DISTINCT
    n.workspace_id,
    n.domain,
    -- humanize: "code-review" -> "Code review"; well-known stay capitalized below
    initcap(replace(n.domain, '-', ' ')),
    NULL,
    100
  FROM nodes n
  ON CONFLICT (workspace_id, id) DO NOTHING;

  -- Polish the seven seed domains with labels + accent colors matching the
  -- previous hardcoded badges, in their conventional display order.
  UPDATE domains SET label = 'Concepts',      color = '#6D28D9', position = 10 WHERE id = 'concepts';
  UPDATE domains SET label = 'Architectures', color = '#1D4ED8', position = 20 WHERE id = 'architectures';
  UPDATE domains SET label = 'Tools',         color = '#15803D', position = 30 WHERE id = 'tools';
  UPDATE domains SET label = 'Workflows',     color = '#B45309', position = 40 WHERE id = 'workflows';
  UPDATE domains SET label = 'Papers',        color = '#BE185D', position = 50 WHERE id = 'papers';
  UPDATE domains SET label = 'People',        color = '#B91C1C', position = 60 WHERE id = 'people';
  UPDATE domains SET label = 'Models',        color = '#0E7490', position = 70 WHERE id = 'models';

  -- Now that every nodes.domain has a matching row, enforce the FK.
  ALTER TABLE nodes
    ADD CONSTRAINT nodes_domain_fkey
    FOREIGN KEY (workspace_id, domain)
    REFERENCES domains (workspace_id, id)
    ON DELETE RESTRICT;
`;

export async function migrate(): Promise<void> {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');

  const hasNodes = await tableExists('nodes');
  if (!hasNodes) {
    console.log('[migrate] applying schema.sql...');
    await withClient(async (client) => {
      await client.query(schema);
    });
    console.log('[migrate] done');
    return;
  }

  // Widget redesign migration: old schema has `type`/`spec` columns, new has `renderer`.
  const hasWidgets = await tableExists('widgets');
  const hasNewWidgets = hasWidgets && (await columnExists('widgets', 'renderer'));
  if (hasWidgets && !hasNewWidgets) {
    console.log('[migrate] redesigning widgets table (renderer model)...');
    await withClient(async (client) => {
      await client.query(WIDGETS_REDESIGN_SQL);
    });
    console.log('[migrate] widgets redesigned');
  }

  // Workspace migration: backfill existing rows into 'ai-agents'.
  const hasWorkspaces = await tableExists('workspaces');
  if (!hasWorkspaces) {
    console.log('[migrate] adding workspaces table and backfilling rows...');
    await withClient(async (client) => {
      await client.query(WORKSPACE_MIGRATION_SQL);
    });
    console.log('[migrate] workspace migration done');
    return;
  }

  // Domains migration: promote nodes.domain to a real entity.
  const hasDomains = await tableExists('domains');
  if (!hasDomains) {
    console.log('[migrate] adding domains table and backfilling rows...');
    await withClient(async (client) => {
      await client.query(DOMAINS_MIGRATION_SQL);
    });
    console.log('[migrate] domains migration done');
    return;
  }

  console.log('[migrate] schema already present — skipping');
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[migrate] failed', err);
      process.exit(1);
    });
}

-- AI Agent Knowledge Base — full schema.
-- Run once on a fresh database. Idempotent: uses IF NOT EXISTS where possible.
-- Every resource is scoped to a workspace.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Immutable wrapper so we can use to_tsvector inside a STORED generated column.
CREATE OR REPLACE FUNCTION kb_search_text(title text, body text, tags text[])
RETURNS tsvector LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('english'::regconfig,
    coalesce(title, '') || ' ' ||
    coalesce(body, '') || ' ' ||
    coalesce(array_to_string(tags, ' '), '')
  )
$$;

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- workspaces — isolation boundary. Every other table FKs to this.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS workspaces_updated_at ON workspaces;
CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- domains — managed list of node categories per workspace.
-- Stored as a real entity so the UI can display labels, colors, descriptions.
-- nodes.domain references domains.id via a composite FK (workspace_id, id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id           text NOT NULL,                       -- slug, e.g. "books"
  label        text NOT NULL,                       -- "Books"
  description  text NOT NULL DEFAULT '',
  color        text,                                -- hex; null = client hashes
  position     integer NOT NULL DEFAULT 100,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS domains_ws_position_idx ON domains (workspace_id, position, label);

DROP TRIGGER IF EXISTS domains_updated_at ON domains;
CREATE TRIGGER domains_updated_at
  BEFORE UPDATE ON domains
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- nodes — primary content. id is unique within a workspace.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nodes (
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id            text NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  domain        text NOT NULL,
  tags          text[] NOT NULL DEFAULT '{}',
  metadata      jsonb NOT NULL DEFAULT '{}',
  embedding     vector(1536),
  search_vector tsvector GENERATED ALWAYS AS (kb_search_text(title, body, tags)) STORED,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, domain) REFERENCES domains (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS nodes_ws_domain_idx ON nodes (workspace_id, domain);
CREATE INDEX IF NOT EXISTS nodes_tags_idx      ON nodes USING GIN (tags);
CREATE INDEX IF NOT EXISTS nodes_search_idx    ON nodes USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS nodes_title_trgm    ON nodes USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS nodes_embedding_idx ON nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- edges — scoped to workspace; both endpoints must live in the same workspace.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edges (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_id      text NOT NULL,
  to_id        text NOT NULL,
  relation     text NOT NULL,
  weight       numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, from_id, to_id, relation),
  FOREIGN KEY (workspace_id, from_id) REFERENCES nodes (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, to_id)   REFERENCES nodes (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS edges_ws_from_idx     ON edges (workspace_id, from_id);
CREATE INDEX IF NOT EXISTS edges_ws_to_idx       ON edges (workspace_id, to_id);
CREATE INDEX IF NOT EXISTS edges_ws_relation_idx ON edges (workspace_id, relation);

-- ---------------------------------------------------------------------------
-- node_versions — full snapshot on every save.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS node_versions (
  id             bigserial PRIMARY KEY,
  workspace_id   text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id        text NOT NULL,
  version        integer NOT NULL,
  title          text NOT NULL,
  body           text NOT NULL,
  tags           text[] NOT NULL DEFAULT '{}',
  metadata       jsonb NOT NULL DEFAULT '{}',
  changed_by     text NOT NULL DEFAULT 'unknown',
  change_summary text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, node_id, version),
  FOREIGN KEY (workspace_id, node_id) REFERENCES nodes (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS node_versions_ws_node_idx ON node_versions (workspace_id, node_id, version DESC);

-- ---------------------------------------------------------------------------
-- comments — threaded, markdown body; scoped to workspace.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id           bigserial PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id      text NOT NULL,
  parent_id    bigint REFERENCES comments(id) ON DELETE CASCADE,
  author       text NOT NULL DEFAULT 'anonymous',
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, node_id) REFERENCES nodes (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS comments_ws_node_idx ON comments (workspace_id, node_id, created_at);
CREATE INDEX IF NOT EXISTS comments_parent_idx  ON comments (parent_id);

-- ---------------------------------------------------------------------------
-- widgets — persistent renderable outputs (renderer + renderer_options + data model).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS widgets (
  workspace_id     text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id               text NOT NULL,
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
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS widgets_ws_renderer_idx ON widgets (workspace_id, renderer);
CREATE INDEX IF NOT EXISTS widgets_ws_last_run_idx ON widgets (workspace_id, last_run_at DESC);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS nodes_updated_at ON nodes;
CREATE TRIGGER nodes_updated_at
  BEFORE UPDATE ON nodes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS comments_updated_at ON comments;
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS widgets_updated_at ON widgets;
CREATE TRIGGER widgets_updated_at
  BEFORE UPDATE ON widgets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Auto-snapshot a node into node_versions on every insert/update.
-- Pulls changed_by/change_summary from session GUCs set by graph.ts.
CREATE OR REPLACE FUNCTION snapshot_node_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
$$;

DROP TRIGGER IF EXISTS nodes_version_snapshot ON nodes;
CREATE TRIGGER nodes_version_snapshot
  AFTER INSERT OR UPDATE ON nodes
  FOR EACH ROW EXECUTE FUNCTION snapshot_node_version();

# Trellis-aware Claude Code

When this plugin is installed, you have access to a Trellis MCP server (`trellis`) and a set of
slash commands to manage a knowledge graph of AI-agent notes. The `trellis-memory` skill is the
detailed playbook — read it via the Skill tool when relevant.

## TL;DR

- Default workspace: `ai-agents` (override with `TRELLIS_WORKSPACE`).
- Before answering anything about agents/frameworks/papers/patterns, search the graph first
  (`kb_search`) and reference existing nodes with `[[wikilinks]]`.
- After learning something generalizable, save it (`kb_save`) and link it (`kb_link`).
- Skip ephemeral content — debugging sessions, one-off Q&A, project-specific facts.

## Workspace selection

If the user hasn't pinned a workspace and the conversation could fit multiple, call
`kb_workspace_list` first and either pick the obvious one or ask. Don't write to a workspace you
chose at random.

## MCP availability

If the MCP server isn't reachable, surface the error clearly and tell the user to start Trellis:

```bash
docker compose up -d   # postgres
npm run dev            # api on :3000, vite on :5173
```

Don't pretend the KB exists when it doesn't.

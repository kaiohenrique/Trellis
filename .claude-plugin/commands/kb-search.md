---
description: Search the Trellis knowledge graph and summarize top results.
argument-hint: <query>
---

Search the Trellis knowledge base for nodes matching: **$ARGUMENTS**

Steps:

1. Call `kb_search({ workspace_id: "${TRELLIS_WORKSPACE:-ai-agents}", query: "$ARGUMENTS" })`.
2. If no results, also try `kb_query` with the same text plus `{ depth: 1 }` so neighbors of partial
   matches surface too.
3. For each of the top 5 hits, output a one-line summary:
   - `[[node-id]]` — first sentence of the body, then the domain in parens.
4. If a single result is clearly the best match, offer to open it (paste the URL
   `/workspaces/<ws>/wiki/<id>`).
5. If nothing matched, suggest two or three search terms that might work better — don't fabricate
   nodes that don't exist.

Do not save anything to the KB from this command — search-only.

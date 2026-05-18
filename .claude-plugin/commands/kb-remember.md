---
description: Save the most recent learning from this session to Trellis as a new node.
---

Review the last several turns of this conversation. Identify the **single most generalizable** fact,
concept, technique, paper, person, or workflow that came up — something useful to anyone working on
agents, not specific to this user's current task.

If nothing is worth saving (debugging session, trivial Q&A, anything already in the KB), say so
plainly and stop. **Do not fabricate.**

If there is something worth saving:

1. Call `kb_search({ workspace_id: "${TRELLIS_WORKSPACE:-ai-agents}", query: "<topic>" })` first to
   check it doesn't already exist. If a near-match exists, update it via `kb_save` instead of
   creating a duplicate.
2. Decide on a slug `id`, `title`, `domain`, `tags`, and `body`. The body should be 100–500 words of
   markdown with `[[wikilinks]]` to at least 2 existing related nodes (find them first via
   `kb_search`).
3. Call `kb_save({ workspace_id, id, title, body, domain, tags })`.
4. For every wikilink in the body, also call `kb_link` with a typed relation (`extends`, `implements`,
   `uses`, `contradicts`, `described-by`, `authored-by`, `see-also`, `contrasts`). The wikilink in
   prose plus the typed edge gives the graph both narrative and structure.
5. Report back: "Saved `[[id]]` in `<domain>` with N outgoing edges." and the URL
   `/workspaces/<ws>/wiki/<id>`.

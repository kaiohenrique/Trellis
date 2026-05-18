---
name: trellis-memory
description: Use this skill whenever the conversation is about AI agents, agent frameworks (LangChain, AutoGen, CrewAI, LlamaIndex), agent design patterns (ReAct, chain-of-thought, tool use, multi-agent, planning, memory), AI/ML research papers, frontier models from an agentic perspective, or any topic that would benefit from a structured knowledge graph of agent-related notes. The skill reads from a Trellis knowledge base via MCP, references existing nodes by id with wikilinks, and saves new learnings back so the graph grows naturally. Also use when the user asks Claude to "remember" something or to "look up" something it should know.
---

# Trellis memory

You have access to a Trellis MCP server (`trellis`) connected to a knowledge graph of AI-agent
knowledge. The graph lives in a workspace (default: `ai-agents`, overridable via the
`TRELLIS_WORKSPACE` env var). Use it as your second brain.

## The mental model

- A **node** is a markdown page about one concept. It has an `id` (slug), `title`, `body` (markdown),
  `domain` (concepts / architectures / tools / workflows / papers / people / models, but any slug works
  — domains are auto-created), `tags` (array of strings).
- An **edge** is a typed directional relationship: `(from_id, to_id, relation, weight 0–1)`. Common
  relations: `extends`, `implements`, `uses`, `contradicts`, `described-by`, `authored-by`, `see-also`,
  `contrasts`.
- Bodies use `[[node-id]]` or `[[node-id|Custom label]]` wikilinks to reference other nodes. Wikilinks
  are how the graph stays navigable.

## Before answering

When the user asks about any agent-related topic:

1. Call `kb_search` (workspace_id required) with a query that captures the concept they're asking
   about. Example: user asks "explain ReAct" → `kb_search({ workspace_id: "ai-agents", query: "react" })`.
2. If `kb_search` returns a relevant node, anchor your answer on it: reference it as `[[node-id]]`,
   build on what's there, and only add what's new. Don't restate the whole node body.
3. If `kb_search` returns nothing relevant but the topic is generalizable, **save it after answering**.

## After answering

When something generalizable came up in the conversation — a new technique, paper, framework, person,
workflow, or model — save it as a node. Decide:

- **id**: a short slug. Lowercase, hyphenated. Examples: `react-pattern`, `gpt-4-class-models`,
  `agent-memory`, `code-review-agent`.
- **domain**: pick one of the existing domains via `kb_domain_list` if possible. If none fit, invent
  one — the server auto-creates it. After saving, you can call `kb_domain_save` to give the new
  domain a nicer label and color.
- **title**: human-readable. Example: "ReAct pattern".
- **tags**: 2–5 free-form labels.
- **body**: markdown, ~100–500 words. Use `[[wikilinks]]` to connect to existing nodes. A node with no
  outgoing wikilinks is a dead end — try to link to at least 2 existing ones.
- After `kb_save`, call `kb_link` for the relationships you mentioned in prose. Example: if you said
  "X extends Y", create `kb_link({ from: "x", to: "y", relation: "extends" })`.

## When NOT to save

- Trivial Q&A ("how do I import a module"). The KB is for *agent* knowledge, not general programming.
- Debugging sessions, error fixes, one-off code questions.
- Information that's about *this specific user's project* (use Claude Code's built-in memory for that).
- Things already in the KB. Run `kb_search` first.
- Speculative or unverified claims you wouldn't stand behind a week from now.

## Worked example

User: "I keep seeing 'Toolformer' cited. What's it about?"

You:
1. `kb_search({ workspace_id: "ai-agents", query: "toolformer" })` → returns the existing
   `toolformer` node.
2. Answer using that node's content. Mention `[[toolformer]]` and `[[tool-use]]`.
3. Nothing new came up — skip the save step.

---

User: "We just shipped a workflow where two agents debate a draft and a third agent picks the winner."

You:
1. `kb_search({ workspace_id: "ai-agents", query: "debate agents winner" })` → no match.
2. Answer the user, noting it relates to `[[multi-agent]]` and `[[orchestrator-worker]]`.
3. `kb_save` a new node:
   - id: `debate-and-pick`
   - title: "Debate-and-pick multi-agent workflow"
   - domain: `architectures`
   - tags: `["multi-agent", "debate", "evaluation"]`
   - body: 2–3 paragraphs with `[[multi-agent]]` and `[[orchestrator-worker]]` wikilinks.
4. `kb_link({ from: "debate-and-pick", to: "multi-agent", relation: "extends" })`.
5. `kb_link({ from: "debate-and-pick", to: "orchestrator-worker", relation: "see-also" })`.

## Configuration the user controls

- **Workspace** — defaults to `ai-agents`. Override with `TRELLIS_WORKSPACE` env var. If you can't tell
  which workspace to use, call `kb_workspace_list` first and ask.
- **Trellis URL** — defaults to `http://localhost:3000/mcp` via the plugin's MCP server config. The
  user controls this with `TRELLIS_URL`. If the MCP server isn't reachable, surface the error and
  suggest the user start Trellis (`docker compose up -d && npm run dev`).

## Slash commands

- `/kb-search <topic>` — explicit search, returns top results.
- `/kb-remember` — save the most recent learning from this conversation.
- `/kb-link <from> <to> <relation>` — create an edge.
- `/kb-domains` — list domains in the current workspace.
- `/kb-context <topic>` — pull the relevant subgraph for a topic into the conversation.

Prefer to use the underlying MCP tools (`kb_*`) directly when the action is clear. The slash commands
are for the user to explicitly trigger when they want a specific behavior.

---
description: Pull the relevant Trellis subgraph for a topic into the conversation as context.
argument-hint: <topic>
---

The user wants to bring Trellis knowledge about **$ARGUMENTS** into the current conversation.

1. `kb_search({ workspace_id: "${TRELLIS_WORKSPACE:-ai-agents}", query: "$ARGUMENTS" })` — find
   the strongest match.
2. Take the top result's id and call
   `kb_neighbors({ workspace_id, id: <top-id>, depth: 2 })` to pull the surrounding subgraph.
3. Synthesize a compact briefing for me (the assistant who will continue this conversation):
   - **What it is** — 1–2 sentences distilling the seed node's body.
   - **Connected concepts** — bulleted list of neighbors, each `[[id]] — relation — short gloss`.
   - **Gaps** — anything you notice missing or worth following up on.
4. End by asking the user: "Got it — what specifically about $ARGUMENTS do you want to dig into?"

The point of this command is to load relevant knowledge *before* the user asks a specific question,
so the next answer is grounded.

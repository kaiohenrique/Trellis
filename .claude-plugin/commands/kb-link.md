---
description: Create a typed edge between two existing Trellis nodes.
argument-hint: <from-id> <to-id> <relation>
---

Create an edge in the Trellis graph: **$ARGUMENTS**

Parse the arguments as `<from-id> <to-id> <relation>`. If `<relation>` is missing, ask the user to
pick from the standard list: `extends`, `implements`, `uses`, `contradicts`, `described-by`,
`authored-by`, `see-also`, `contrasts`.

1. Verify both nodes exist via `kb_get` for each. If either is missing, report which one and stop.
2. Call `kb_link({ workspace_id: "${TRELLIS_WORKSPACE:-ai-agents}", from, to, relation, weight: 1 })`.
3. Confirm: `Linked [[from]] —{relation}→ [[to]]`.

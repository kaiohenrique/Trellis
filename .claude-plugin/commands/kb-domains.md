---
description: List domains in the Trellis workspace with node counts.
---

Call `kb_domain_list({ workspace_id: "${TRELLIS_WORKSPACE:-ai-agents}" })` and render the result as
a compact list:

```
<id> (<node_count>) — <label> · <description>
```

If there are domains with `node_count: 0`, flag them at the bottom as "unused" so the user knows
they could be cleaned up. Don't delete anything yourself.

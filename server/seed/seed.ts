import 'dotenv/config';
import { pool } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { createEdge, upsertDomain, upsertNode, upsertWidget, upsertWorkspace } from '../core/graph.js';

const WS = 'ai-agents';

const DEFAULT_DOMAINS: Array<{ id: string; label: string; color: string; position: number }> = [
  { id: 'concepts',      label: 'Concepts',      color: '#6D28D9', position: 10 },
  { id: 'architectures', label: 'Architectures', color: '#1D4ED8', position: 20 },
  { id: 'tools',         label: 'Tools',         color: '#15803D', position: 30 },
  { id: 'workflows',     label: 'Workflows',     color: '#B45309', position: 40 },
  { id: 'papers',        label: 'Papers',        color: '#BE185D', position: 50 },
  { id: 'people',        label: 'People',        color: '#B91C1C', position: 60 },
  { id: 'models',        label: 'Models',        color: '#0E7490', position: 70 },
];

interface SeedNode {
  id: string;
  title: string;
  domain: string;
  tags: string[];
  body: string;
}

const NODES: SeedNode[] = [
  // ----- concepts -----
  {
    id: 'react-pattern',
    title: 'ReAct pattern',
    domain: 'concepts',
    tags: ['reasoning', 'acting', 'prompting'],
    body: `**ReAct** ("Reason + Act") interleaves [[chain-of-thought|chain-of-thought reasoning]] with concrete [[tool-use|tool calls]] inside a single LLM loop. The model emits a short *thought* explaining what to do next, then an *action* invoking a tool, then observes the *result* and continues.

The pattern was introduced in [[react-paper|Yao et al., 2022]] and is now baked into nearly every agent framework: [[langchain]] popularized it for the broader community, and most modern systems include ReAct-style scratchpads even if they no longer expose the verbatim trace.

\`\`\`mermaid
flowchart LR
  Q[Question] --> T1[Thought]
  T1 --> A1[Action: call tool]
  A1 --> O1[Observation]
  O1 --> T2[Thought]
  T2 --> A2[Action: respond]
\`\`\`

### Why it works
Forcing the model to externalize reasoning before each action tends to reduce single-shot hallucinations and gives downstream systems an audit trail. The cost is more tokens per step — see [[planning]] for variants that pre-commit to a plan instead.`,
  },
  {
    id: 'chain-of-thought',
    title: 'Chain-of-thought prompting',
    domain: 'concepts',
    tags: ['prompting', 'reasoning'],
    body: `**Chain-of-thought (CoT)** prompting asks the model to produce intermediate reasoning steps before its final answer. Adding even a simple "let's think step by step" prefix can dramatically improve performance on multi-step problems.

CoT is the reasoning half of [[react-pattern|ReAct]]; without it, agents tend to jump straight to actions and miss obvious decomposition opportunities. See also [[planning]] for full plans-before-acting.`,
  },
  {
    id: 'tool-use',
    title: 'Tool use',
    domain: 'concepts',
    tags: ['tools', 'function-calling'],
    body: `**Tool use** is an agent's ability to invoke external functions — search, calculators, code execution, APIs — and incorporate the results into its reasoning. Modern LLMs expose this via *function calling* APIs.

Tool use is the acting half of [[react-pattern|ReAct]] and underpins almost every practical agent pattern, from [[single-agent|single-agent loops]] to [[multi-agent|multi-agent systems]]. The [[toolformer|Toolformer paper]] showed that models can learn to call tools via self-supervision.`,
  },
  {
    id: 'agent-memory',
    title: 'Agent memory types',
    domain: 'concepts',
    tags: ['memory', 'context'],
    body: `Agent **memory** typically falls into three buckets:

1. **Working memory** — the current context window. Cheap, fast, ephemeral.
2. **Episodic memory** — past conversations or task traces, usually stored in a vector DB and retrieved via similarity.
3. **Semantic memory** — extracted facts written to durable storage (e.g. this knowledge base).

The right mix depends on the agent's job. A [[code-review-agent|code review agent]] mostly needs working memory plus a project index; a [[research-agent|research agent]] benefits from episodic recall across sessions.`,
  },
  {
    id: 'planning',
    title: 'Planning in agents',
    domain: 'concepts',
    tags: ['planning', 'decomposition'],
    body: `**Planning** is the act of producing a multi-step strategy before executing any of it. It contrasts with the reactive style of [[react-pattern|ReAct]], which decides one step at a time.

Common variants:
- **Plan-and-execute**: write a plan up front, then execute steps sequentially.
- **Tree-of-thoughts**: explore multiple branches and prune.
- **Hierarchical planning**: high-level plan delegated to sub-agents (see [[orchestrator-worker]]).

Planning trades upfront cost (more tokens, more latency) for better long-horizon behavior.`,
  },

  // ----- architectures -----
  {
    id: 'single-agent',
    title: 'Single-agent loop',
    domain: 'architectures',
    tags: ['loop', 'basic'],
    body: `The simplest agent shape: one LLM in a loop that interleaves [[tool-use|tool calls]] with model turns until a stopping condition is met.

\`\`\`mermaid
flowchart TD
  Start --> Think
  Think --> Decide{Done?}
  Decide -- no --> Tool[Call tool]
  Tool --> Observe
  Observe --> Think
  Decide -- yes --> End
\`\`\`

Most production agents start here. [[multi-agent|Multi-agent]] systems and [[orchestrator-worker|orchestrator-worker]] setups are layers on top of this primitive.`,
  },
  {
    id: 'multi-agent',
    title: 'Multi-agent systems',
    domain: 'architectures',
    tags: ['coordination', 'parallelism'],
    body: `**Multi-agent systems** decompose work across several specialized agents that communicate. Coordination strategies range from peer-to-peer message passing to explicit hierarchies — see [[orchestrator-worker]] for the most common production pattern.

[[autogen|AutoGen]] is the canonical framework here, with [[crewai|CrewAI]] focusing on role-based teams.`,
  },
  {
    id: 'orchestrator-worker',
    title: 'Orchestrator-worker pattern',
    domain: 'architectures',
    tags: ['delegation', 'hierarchy'],
    body: `An **orchestrator** agent plans the task and dispatches sub-problems to **worker** agents (or sub-routines). Workers report back and the orchestrator decides the next step.

This pattern keeps complexity manageable as task scope grows. It pairs naturally with [[planning|explicit planning]] and is implemented in [[langchain]] as "Plan and Execute" agents and in [[autogen]] as GroupChat patterns.`,
  },
  {
    id: 'hitl',
    title: 'Human-in-the-loop',
    domain: 'architectures',
    tags: ['human', 'oversight'],
    body: `**Human-in-the-loop (HITL)** architectures pause for human approval at risky steps. Critical for agents that take real-world actions (sending emails, executing trades, modifying production systems).

Implementations range from blocking on every tool call to lightweight "interrupt-on-anomaly" patterns where the agent escalates only when uncertainty crosses a threshold.`,
  },

  // ----- tools -----
  {
    id: 'langchain',
    title: 'LangChain',
    domain: 'tools',
    tags: ['framework', 'python'],
    body: `**LangChain** is the most widely used Python (and JavaScript) framework for building LLM applications. It provides composable primitives for prompts, tools, chains, agents, and memory.

LangChain pioneered the practical implementation of [[react-pattern|ReAct]] in production. Its agent abstractions cover [[single-agent|single-agent loops]], [[orchestrator-worker|orchestrator-worker]] patterns, and more.`,
  },
  {
    id: 'autogen',
    title: 'AutoGen',
    domain: 'tools',
    tags: ['framework', 'multi-agent', 'microsoft'],
    body: `**AutoGen** (Microsoft Research) is a framework focused on [[multi-agent]] conversations. Agents can be specialized by system prompt and tools, and orchestrated via a GroupChat manager that decides who speaks next.`,
  },
  {
    id: 'crewai',
    title: 'CrewAI',
    domain: 'tools',
    tags: ['framework', 'roles', 'python'],
    body: `**CrewAI** structures [[multi-agent]] systems around explicit *roles* and *tasks*. Each agent has a role description and a set of tools; the crew runs through tasks sequentially or hierarchically.`,
  },
  {
    id: 'llamaindex',
    title: 'LlamaIndex',
    domain: 'tools',
    tags: ['rag', 'retrieval', 'python'],
    body: `**LlamaIndex** focuses on retrieval-augmented generation: ingesting documents into vector stores, building hybrid indexes, and routing queries to the right sub-index. It complements [[langchain]] rather than replacing it.`,
  },

  // ----- papers -----
  {
    id: 'react-paper',
    title: 'ReAct: Synergizing Reasoning and Acting in LLMs',
    domain: 'papers',
    tags: ['reasoning', 'acting', 'foundational'],
    body: `Yao et al., ICLR 2023. Introduced the [[react-pattern|ReAct]] interleaved reasoning-and-acting prompting style. Showed substantial improvements on HotpotQA and FEVER (knowledge-intensive QA), and on ALFWorld and WebShop (interactive decision-making).

Cited as the foundation for nearly every modern tool-using agent framework.`,
  },
  {
    id: 'toolformer',
    title: 'Toolformer',
    domain: 'papers',
    tags: ['tool-use', 'self-supervised'],
    body: `Schick et al., 2023. Showed that LLMs can learn to invoke tools by *self-supervision*: the model annotates its training data with tool calls when they improve next-token prediction.

A foundational result for [[tool-use|tool use]] as a learned capability rather than a purely prompted one.`,
  },

  // ----- people -----
  {
    id: 'yao-shunyu',
    title: 'Shunyu Yao',
    domain: 'people',
    tags: ['researcher', 'princeton'],
    body: `Shunyu Yao is a researcher whose work has shaped the modern agent landscape. First author on [[react-paper|ReAct]] and Tree of Thoughts. Now at OpenAI.`,
  },

  // ----- workflows -----
  {
    id: 'code-review-agent',
    title: 'Automated code review agent',
    domain: 'workflows',
    tags: ['coding', 'review'],
    body: `An agent that reviews pull requests: fetches the diff, runs static analysis tools, queries a code index for related symbols, and produces a structured review.

Usually built as a [[single-agent]] loop with [[react-pattern|ReAct]]-style reasoning, augmented with [[agent-memory|episodic memory]] of past reviews so feedback stays consistent across PRs.`,
  },
  {
    id: 'research-agent',
    title: 'Deep research agent',
    domain: 'workflows',
    tags: ['research', 'web-search'],
    body: `A long-running agent that iteratively searches the web, reads, and synthesizes a written report. Typically uses [[orchestrator-worker]] architecture: one planner agent decomposes the question into sub-queries, workers search and summarize in parallel, the orchestrator assembles the final report.`,
  },

  // ----- models -----
  {
    id: 'claude-opus-4',
    title: 'Claude Opus 4',
    domain: 'models',
    tags: ['anthropic', 'frontier'],
    body: `Anthropic's frontier model family. Strong agentic performance: long context, reliable tool use, and well-calibrated refusals. Pairs well with [[react-pattern]] style loops and [[multi-agent]] orchestration.`,
  },
  {
    id: 'gpt-4-class',
    title: 'GPT-4 class models',
    domain: 'models',
    tags: ['openai', 'frontier'],
    body: `OpenAI's GPT-4 family (and the o1/o3 reasoning variants) are the most widely used frontier models for agentic workloads. Native function calling makes [[tool-use]] particularly ergonomic.`,
  },
];

const EDGES: Array<[string, string, string, number?]> = [
  ['react-pattern', 'chain-of-thought', 'extends', 0.9],
  ['react-pattern', 'tool-use', 'uses', 0.9],
  ['react-pattern', 'react-paper', 'described-by', 1.0],
  ['react-paper', 'yao-shunyu', 'authored-by', 1.0],
  ['toolformer', 'tool-use', 'about', 0.9],
  ['langchain', 'react-pattern', 'implements', 0.9],
  ['langchain', 'tool-use', 'implements', 0.8],
  ['langchain', 'orchestrator-worker', 'implements', 0.7],
  ['autogen', 'multi-agent', 'implements', 0.95],
  ['crewai', 'multi-agent', 'implements', 0.9],
  ['llamaindex', 'agent-memory', 'supports', 0.7],
  ['orchestrator-worker', 'multi-agent', 'extends', 0.8],
  ['hitl', 'single-agent', 'extends', 0.5],
  ['multi-agent', 'single-agent', 'extends', 0.5],
  ['planning', 'react-pattern', 'contrasts', 0.6],
  ['code-review-agent', 'single-agent', 'uses', 0.8],
  ['code-review-agent', 'react-pattern', 'uses', 0.7],
  ['research-agent', 'orchestrator-worker', 'uses', 0.9],
  ['research-agent', 'agent-memory', 'uses', 0.7],
  ['claude-opus-4', 'react-pattern', 'good-for', 0.8],
  ['gpt-4-class', 'tool-use', 'good-for', 0.9],
];

// Source-script templates that the widget will re-run on refresh. Kept as
// JS strings so `POST /widgets/:id/run` can re-execute them via the sandbox.
const SCRIPT_DOMAIN_COVERAGE = `
const all = await kb.list();
const counts = {};
for (const n of all) counts[n.domain] = (counts[n.domain] || 0) + 1;
const rows = Object.entries(counts).map(([domain, count]) => ({ domain, count }));
await kb.widget('domain-coverage-chart', 'Node count per domain', {
  renderer: 'vega-lite',
  renderer_options: {
    spec: {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      mark: { type: 'bar', cornerRadiusEnd: 3 },
      encoding: {
        x: { field: 'domain', type: 'nominal', sort: '-y' },
        y: { field: 'count', type: 'quantitative' },
        color: { field: 'domain', type: 'nominal', legend: null }
      }
    }
  },
  data: rows,
  description: 'Knowledge base coverage by domain'
});
result = rows;
`.trim();

const SCRIPT_TOOL_CONNECTIVITY = `
const tools = await kb.list({ domain: 'tools' });
const rows = [];
for (const t of tools) {
  const out = await kb.edges({ from: t.id });
  const inc = await kb.edges({ to: t.id });
  rows.push({ tool: t.title, outgoing: out.length, incoming: inc.length, tags: t.tags.join(', ') });
}
await kb.widget('tools-connectivity', 'Tool node connectivity', {
  renderer: 'table',
  renderer_options: {
    columns: ['tool', 'outgoing', 'incoming', 'tags'],
    labels: { tool: 'Tool', outgoing: 'Out', incoming: 'In', tags: 'Tags' },
    sortBy: 'incoming', sortDir: 'desc'
  },
  data: rows,
  description: 'Outgoing and incoming edge counts for all tool-domain nodes'
});
result = rows;
`.trim();

const SCRIPT_REACT_CLUSTER = `
const cluster = ['react-pattern', 'chain-of-thought', 'tool-use', 'react-paper', 'yao-shunyu', 'langchain'];
const nodes = [];
for (const id of cluster) {
  const n = await kb.get(id);
  if (n) nodes.push({ id: n.id, label: n.title, domain: n.domain });
}
const idSet = new Set(cluster);
const all = await kb.edges({});
const edges = all
  .filter(e => idSet.has(e.from) && idSet.has(e.to))
  .map(e => ({ from: e.from, to: e.to, relation: e.relation, weight: e.weight }));
await kb.widget('react-cluster-graph', 'ReAct concept cluster', {
  renderer: 'graph',
  renderer_options: { layout: 'force', colorBy: 'domain' },
  data: { nodes, edges },
  description: 'The cluster of nodes around the ReAct pattern'
});
result = { nodes: nodes.length, edges: edges.length };
`.trim();

const SCRIPT_KB_PRIMER = `
const total = (await kb.list()).length;
const counts = {};
for (const n of await kb.list()) counts[n.domain] = (counts[n.domain] || 0) + 1;
await kb.widget('kb-primer', 'KB primer', {
  renderer: 'markdown',
  renderer_options: {
    template: '# {{title}}\\n\\n*Last refreshed {{updated}}*\\n\\nThis knowledge base currently tracks **{{total}}** nodes across domains:\\n\\n{{#each domains}}- **{{domain}}** — {{count}} nodes\\n{{/each}}\\n\\nUse the [graph view](/graph) to explore relationships.'
  },
  data: {
    title: 'AI Agent Knowledge Base',
    total,
    updated: new Date().toISOString().slice(0, 10),
    domains: Object.entries(counts).map(([domain, count]) => ({ domain, count }))
  },
  description: 'Auto-generated primer page summarising the KB'
});
result = total;
`.trim();

async function seedWidgets(): Promise<void> {
  // 1. vega-lite — node count per domain (data + spec stored separately)
  const counts = new Map<string, number>();
  for (const n of NODES) counts.set(n.domain, (counts.get(n.domain) ?? 0) + 1);
  const chartData = Array.from(counts.entries()).map(([domain, count]) => ({ domain, count }));
  await upsertWidget(WS, {
    id: 'domain-coverage-chart',
    title: 'Node count per domain',
    description: 'Knowledge base coverage by domain',
    renderer: 'vega-lite',
    renderer_options: {
      spec: {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        mark: { type: 'bar', cornerRadiusEnd: 3 },
        encoding: {
          x: { field: 'domain', type: 'nominal', sort: '-y' },
          y: { field: 'count', type: 'quantitative' },
          color: { field: 'domain', type: 'nominal', legend: null },
        },
      },
    },
    data: chartData,
    source_script: SCRIPT_DOMAIN_COVERAGE,
    created_by: 'seed',
  });

  // 2. table — tool framework comparison
  await upsertWidget(WS, {
    id: 'tool-comparison',
    title: 'Agent framework comparison',
    description: 'Side-by-side comparison of major agent frameworks',
    renderer: 'table',
    renderer_options: {
      columns: ['Framework', 'Language', 'Strength', 'Best for'],
      labels: { Framework: 'Framework', Language: 'Lang', Strength: 'Strength', 'Best for': 'Best for' },
    },
    data: [
      { Framework: 'LangChain', Language: 'Python/JS', Strength: 'Ecosystem', 'Best for': 'General agents' },
      { Framework: 'AutoGen', Language: 'Python', Strength: 'Multi-agent', 'Best for': 'Team simulations' },
      { Framework: 'CrewAI', Language: 'Python', Strength: 'Roles', 'Best for': 'Role-based teams' },
      { Framework: 'LlamaIndex', Language: 'Python', Strength: 'RAG', 'Best for': 'Knowledge agents' },
    ],
    source_script: SCRIPT_TOOL_CONNECTIVITY,
    created_by: 'seed',
  });

  // 3. graph — ReAct cluster (arbitrary node/edge graph, not necessarily KB nodes)
  const cluster = ['react-pattern', 'chain-of-thought', 'tool-use', 'react-paper', 'yao-shunyu', 'langchain'];
  const ids = new Set(cluster);
  const graphData = {
    nodes: NODES.filter((n) => ids.has(n.id)).map((n) => ({
      id: n.id,
      label: n.title,
      domain: n.domain,
    })),
    edges: EDGES.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([a, b, rel, w]) => ({
      from: a,
      to: b,
      relation: rel,
      weight: w ?? 1,
    })),
  };
  await upsertWidget(WS, {
    id: 'react-cluster-graph',
    title: 'ReAct concept cluster',
    description: 'The cluster of nodes around the ReAct pattern',
    renderer: 'graph',
    renderer_options: { layout: 'force', colorBy: 'domain' },
    data: graphData,
    source_script: SCRIPT_REACT_CLUSTER,
    created_by: 'seed',
  });

  // 4. markdown — templated primer page
  const domainCounts = Object.fromEntries(counts);
  await upsertWidget(WS, {
    id: 'kb-primer',
    title: 'KB primer',
    description: 'Auto-generated primer page summarising the KB',
    renderer: 'markdown',
    renderer_options: {
      template:
        '# {{title}}\n\n*Last refreshed {{updated}}*\n\n' +
        'This knowledge base currently tracks **{{total}}** nodes across domains:\n\n' +
        '{{#each domains}}- **{{domain}}** — {{count}} nodes\n{{/each}}\n\n' +
        'Use the [graph view](/graph) to explore relationships.',
    },
    data: {
      title: 'AI Agent Knowledge Base',
      total: NODES.length,
      updated: new Date().toISOString().slice(0, 10),
      domains: Object.entries(domainCounts).map(([domain, count]) => ({ domain, count })),
    },
    source_script: SCRIPT_KB_PRIMER,
    created_by: 'seed',
  });

  // 5. html — escape hatch example using inline D3 from CDN
  const htmlPayload = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, sans-serif; margin: 0; padding: 12px; background: #fff; }
  .bubble { fill-opacity: 0.7; stroke: #fff; stroke-width: 1.5; }
  .label { font-size: 11px; fill: #1f2937; pointer-events: none; }
</style>
</head><body>
<svg id="chart" width="100%" height="360"></svg>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"><\/script>
<script>
const data = ${JSON.stringify(chartData)};
const colors = { concepts:'#8b5cf6', architectures:'#3b82f6', tools:'#22c55e', workflows:'#eab308',
                 papers:'#ec4899', people:'#ef4444', models:'#06b6d4' };
const svg = d3.select('#chart');
const W = svg.node().clientWidth || 600, H = 360;
const sim = d3.forceSimulation(data)
  .force('charge', d3.forceManyBody().strength(20))
  .force('center', d3.forceCenter(W/2, H/2))
  .force('collide', d3.forceCollide().radius(d => 8 + d.count * 6));
const g = svg.selectAll('g').data(data).join('g');
g.append('circle').attr('class','bubble')
  .attr('r', d => 8 + d.count * 6)
  .attr('fill', d => colors[d.domain] || '#94a3b8');
g.append('text').attr('class','label').attr('text-anchor','middle').attr('dy', 4)
  .text(d => d.domain + ' (' + d.count + ')');
sim.on('tick', () => g.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')'));
<\/script>
</body></html>`;
  await upsertWidget(WS, {
    id: 'domain-bubbles',
    title: 'Domain bubble map',
    description: 'Custom D3 bubble chart, one bubble per domain (HTML escape hatch)',
    renderer: 'html',
    renderer_options: { sandbox: 'allow-scripts' },
    data: htmlPayload,
    source_script: '// generated at seed time — see seed/seed.ts',
    created_by: 'seed',
  });
}

async function seed(): Promise<void> {
  await migrate();

  console.log('[seed] upserting workspaces...');
  await upsertWorkspace({
    id: WS,
    name: 'AI Agents',
    description: 'Concepts, tools and research about AI agents',
  });
  await upsertWorkspace({
    id: 'sandbox',
    name: 'Sandbox',
    description: 'Scratch space for testing',
  });

  console.log(`[seed] upserting ${DEFAULT_DOMAINS.length} default domains into ${WS}...`);
  for (const d of DEFAULT_DOMAINS) {
    await upsertDomain(WS, d);
  }

  console.log(`[seed] upserting ${NODES.length} nodes into ${WS}...`);
  for (const n of NODES) {
    await upsertNode(
      WS,
      { id: n.id, title: n.title, domain: n.domain, tags: n.tags, body: n.body },
      { changed_by: 'seed', change_summary: 'initial seed' },
    );
  }

  console.log(`[seed] upserting ${EDGES.length} edges into ${WS}...`);
  for (const [from, to, relation, weight] of EDGES) {
    await createEdge(WS, { from, to, relation, weight: weight ?? 1 });
  }

  console.log('[seed] seeding widgets...');
  await seedWidgets();

  console.log('[seed] done');
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[seed] failed', err);
      process.exit(1);
    });
}

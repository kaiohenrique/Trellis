// Tiny Handlebars-style template engine for markdown widgets.
// Supports:
//   {{key}}              — dotted lookup (e.g. {{foo.bar}})
//   {{#each items}}…{{/each}}  — iteration; inside the block, {{this}} and {{key}} both resolve against the current item
//
// Intentionally minimal. If a widget needs more, the agent can either
// render the markdown directly (no template) or use the html renderer.

interface Block {
  kind: 'text' | 'var' | 'each' | 'end';
  raw: string;
  name?: string;
  body?: Block[];
}

const TAG = /\{\{\s*([#/]?\s*[\w.]+)\s*\}\}/g;

function lookup(data: unknown, path: string): unknown {
  if (path === 'this' || path === '.') return data;
  if (data == null || typeof data !== 'object') return undefined;
  let cur: unknown = data;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function tokenize(tpl: string): Block[] {
  const out: Block[] = [];
  let last = 0;
  for (const m of tpl.matchAll(TAG)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: 'text', raw: tpl.slice(last, start) });
    const inner = m[1].replace(/\s+/g, '');
    if (inner.startsWith('#each')) {
      out.push({ kind: 'each', raw: m[0], name: inner.slice('#each'.length) });
    } else if (inner.startsWith('/each')) {
      out.push({ kind: 'end', raw: m[0] });
    } else if (inner.startsWith('#') || inner.startsWith('/')) {
      out.push({ kind: 'text', raw: m[0] }); // unsupported helper, emit literally
    } else {
      out.push({ kind: 'var', raw: m[0], name: inner });
    }
    last = start + m[0].length;
  }
  if (last < tpl.length) out.push({ kind: 'text', raw: tpl.slice(last) });
  return out;
}

function parse(blocks: Block[], i: number): { node: Block[]; next: number } {
  const out: Block[] = [];
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.kind === 'end') return { node: out, next: i + 1 };
    if (b.kind === 'each') {
      const { node, next } = parse(blocks, i + 1);
      out.push({ ...b, body: node });
      i = next;
      continue;
    }
    out.push(b);
    i += 1;
  }
  return { node: out, next: i };
}

function emit(blocks: Block[], data: unknown): string {
  let out = '';
  for (const b of blocks) {
    if (b.kind === 'text') {
      out += b.raw;
    } else if (b.kind === 'var') {
      const v = lookup(data, b.name ?? '');
      out += v == null ? '' : String(v);
    } else if (b.kind === 'each') {
      const list = lookup(data, b.name ?? '');
      if (Array.isArray(list)) {
        for (const item of list) out += emit(b.body ?? [], item);
      }
    }
  }
  return out;
}

export function renderTemplate(template: string, data: unknown): string {
  const tokens = tokenize(template);
  const { node } = parse(tokens, 0);
  return emit(node, data);
}

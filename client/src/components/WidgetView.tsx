import { useEffect, useMemo, useRef } from 'react';
import embed from 'vega-embed';
import type {
  GraphData,
  GraphOptions,
  HtmlOptions,
  MarkdownOptions,
  TableOptions,
  VegaLiteOptions,
  Widget,
} from '@kb/shared';
import { GraphCanvas } from './GraphCanvas';
import { MarkdownRenderer } from './MarkdownRenderer';
import { renderTemplate } from '../lib/template';

interface Props {
  widget: Widget;
}

export function WidgetView({ widget }: Props) {
  switch (widget.renderer) {
    case 'vega-lite':
      return <VegaLiteRenderer widget={widget} />;
    case 'table':
      return <TableRenderer widget={widget} />;
    case 'markdown':
      return <MarkdownWidgetRenderer widget={widget} />;
    case 'graph':
      return <GraphRenderer widget={widget} />;
    case 'html':
      return <HtmlRenderer widget={widget} />;
    default:
      return <pre>Unknown renderer: {String(widget.renderer)}</pre>;
  }
}

// ---------- vega-lite ----------
// Merge user spec with { data: { values: widget.data } } at render time.
// Never blindly overwrite — if the spec already declares `data`, leave it alone.
function VegaLiteRenderer({ widget }: { widget: Widget }) {
  const ref = useRef<HTMLDivElement>(null);
  const opts = (widget.renderer_options ?? {}) as VegaLiteOptions;

  useEffect(() => {
    if (!ref.current) return;
    let result: { finalize: () => void } | undefined;
    const baseSpec = (opts.spec ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...baseSpec };
    if (!('data' in merged) || merged.data == null) {
      merged.data = { values: widget.data };
    }
    embed(ref.current, merged as object, { actions: false, renderer: 'svg' })
      .then((r) => {
        result = r;
      })
      .catch((e) => {
        if (ref.current) {
          ref.current.innerHTML = `<pre style="color:var(--danger)">vega error: ${e.message}</pre>`;
        }
      });
    return () => result?.finalize();
  }, [widget, opts.spec]);

  return <div ref={ref} />;
}

// ---------- table ----------
function TableRenderer({ widget }: { widget: Widget }) {
  const opts = (widget.renderer_options ?? {}) as TableOptions;
  const rows = (Array.isArray(widget.data) ? widget.data : []) as Record<string, unknown>[];

  const columns = useMemo(() => {
    if (opts.columns && opts.columns.length > 0) return opts.columns;
    if (rows.length === 0) return [];
    return Object.keys(rows[0]);
  }, [opts.columns, rows]);

  const sorted = useMemo(() => {
    if (!opts.sortBy) return rows;
    const dir = opts.sortDir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = a[opts.sortBy as string];
      const bv = b[opts.sortBy as string];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, opts.sortBy, opts.sortDir]);

  if (rows.length === 0) return <div className="empty">No rows.</div>;

  const labelFor = (col: string) => opts.labels?.[col] ?? col;

  return (
    <table className="manage-table">
      <thead>
        <tr>{columns.map((c) => <th key={c}>{labelFor(c)}</th>)}</tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => <td key={c}>{format(row[c])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function format(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ---------- markdown ----------
function MarkdownWidgetRenderer({ widget }: { widget: Widget }) {
  const opts = (widget.renderer_options ?? {}) as MarkdownOptions;
  const body = opts.template
    ? renderTemplate(opts.template, widget.data)
    : typeof widget.data === 'string'
      ? widget.data
      : JSON.stringify(widget.data, null, 2);
  return <MarkdownRenderer body={body} />;
}

// ---------- graph ----------
// data is an arbitrary { nodes, edges } — NOT necessarily KB nodes.
function GraphRenderer({ widget }: { widget: Widget }) {
  const opts = (widget.renderer_options ?? {}) as GraphOptions;
  const data = (widget.data ?? { nodes: [], edges: [] }) as GraphData;

  const nodes = data.nodes.map((n) => ({
    id: n.id,
    title: n.label ?? n.id,
    domain: n.domain ?? 'default',
  }));
  const edges = data.edges.map((e) => ({
    from: e.from,
    to: e.to,
    relation: e.relation ?? '',
    weight: e.weight ?? 1,
    metadata: {},
  }));
  void opts; // layout/colorBy reserved for future GraphCanvas extensions
  return <GraphCanvas nodes={nodes} edges={edges} height={400} />;
}

// ---------- html ----------
// Renders user HTML inside a sandboxed iframe. Never allow same-origin + scripts together.
function HtmlRenderer({ widget }: { widget: Widget }) {
  const opts = (widget.renderer_options ?? {}) as HtmlOptions;
  let sandbox = opts.sandbox ?? 'allow-scripts';
  if (/\ballow-same-origin\b/.test(sandbox) && /\ballow-scripts\b/.test(sandbox)) {
    // Drop allow-same-origin — combining the two effectively disables the sandbox.
    sandbox = sandbox.replace(/\s*allow-same-origin\b/, '').trim() || 'allow-scripts';
  }
  const srcDoc = typeof widget.data === 'string' ? widget.data : '';
  return (
    <iframe
      srcDoc={srcDoc}
      sandbox={sandbox}
      style={{ width: '100%', minHeight: 400, border: 'none', background: 'white' }}
      title={widget.title}
    />
  );
}

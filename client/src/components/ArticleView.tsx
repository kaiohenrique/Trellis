import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Edge, Node } from '@kb/shared';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useInViewport } from '../hooks/useInViewport';

interface Props {
  // Ordered nodes that make up the article body.
  nodes: Node[];
  // Edges originating in workspace (used to render "Connects to:" per section).
  edges: Edge[];
  // Map of node_id -> title, used to resolve edge target ids to human titles.
  // Pass everything you have; missing ids fall back to the id itself.
  titles: Map<string, string>;
  // Optional total count of nodes the page wanted to show, so if it exceeds the
  // server cap (500), we can surface "showing X of Y" honestly.
  totalAvailable?: number;
  // Render slot for the page-specific header (h1, description, badges).
  header: ReactNode;
  // Optional per-section editorial note rendered above the markdown body.
  // Used by reading lists to show "why this is in the list".
  noteFor?: (nodeId: string) => string | undefined;
  // Workspace id for Edit / edge navigation links.
  ws: string;
}

export function ArticleView({ nodes, edges, titles, totalAvailable, header, noteFor, ws }: Props) {
  // Group outgoing edges by source node, once per render. Avoids the N+1 fetch
  // pattern that used to cost one /edges request per section.
  const edgesByFrom = useMemo(() => {
    const m = new Map<string, Edge[]>();
    for (const e of edges) {
      const list = m.get(e.from) ?? [];
      list.push(e);
      m.set(e.from, list);
    }
    return m;
  }, [edges]);

  const inPageNodes = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const clipped = totalAvailable !== undefined && totalAvailable > nodes.length;

  return (
    <div className="article-layout">
      <article className="article-main">
        {header}

        {clipped && (
          <div className="article-clip-notice">
            Showing the first <strong>{nodes.length}</strong> of <strong>{totalAvailable}</strong>{' '}
            pages. The server caps a single article at 500 sections —
            consider splitting this domain or curating a reading list.
          </div>
        )}

        {nodes.length === 0 ? (
          <div className="empty" style={{ marginTop: 32 }}>No sections.</div>
        ) : (
          <div className="article-body">
            {nodes.map((n, idx) => (
              <ArticleSection
                key={n.id}
                node={n}
                outgoing={edgesByFrom.get(n.id) ?? []}
                titles={titles}
                inPageNodes={inPageNodes}
                note={noteFor?.(n.id)}
                ws={ws}
                // Render the first ~3 sections eagerly so the user sees real
                // content immediately. Anything below stays lazy until 500px
                // away from the viewport.
                eager={idx < 3}
              />
            ))}
          </div>
        )}
      </article>

      {nodes.length > 0 && (
        <aside className="article-toc">
          <ArticleToc nodes={nodes} />
        </aside>
      )}
    </div>
  );
}

// -- Section: lazy-rendered when far from viewport --------------------------
//
// Off-screen sections render a placeholder with estimated height (derived from
// body length so the page total height is roughly right, avoiding scroll jumps).
// Once within 500px of the viewport, the full content materializes and stays.

function estimateHeight(body: string): number {
  // ~80 chars per line, ~24px line height, +120px header/edges chrome.
  const lines = Math.max(4, Math.ceil(body.length / 80));
  return Math.min(1800, 24 * lines + 120);
}

function ArticleSection({
  node,
  outgoing,
  titles,
  inPageNodes,
  note,
  ws,
  eager,
}: {
  node: Node;
  outgoing: Edge[];
  titles: Map<string, string>;
  inPageNodes: Set<string>;
  note?: string;
  ws: string;
  eager?: boolean;
}) {
  const [setRef, visibleFromObserver] = useInViewport<HTMLElement>({ rootMargin: '500px 0px' });
  const visible = eager || visibleFromObserver;

  return (
    <section className="article-section" id={`node-${node.id}`} ref={setRef}>
      <div className="article-section-header">
        <h2>
          <a href={`#node-${node.id}`} className="anchor-link" aria-label="anchor">
            <span className="anchor-glyph">§</span>
          </a>
          {node.title}
        </h2>
        <div className="article-section-actions">
          {node.tags.slice(0, 4).map((t) => (
            <span key={t} className="tag-pill">{t}</span>
          ))}
          <Link to={`/workspaces/${ws}/wiki/${node.id}`} className="ghost-link">Edit</Link>
        </div>
      </div>

      {note && <blockquote className="article-section-note">{note}</blockquote>}

      {visible ? (
        <MarkdownRenderer body={node.body} inPageNodes={inPageNodes} />
      ) : (
        <div className="article-section-placeholder" style={{ minHeight: estimateHeight(node.body) }} />
      )}

      {outgoing.length > 0 && (
        <div className="article-section-edges">
          <span className="article-edges-label">Connects to:</span>
          {outgoing.map((e) => (
            <ArticleEdgeLink
              key={`${e.to}-${e.relation}`}
              edge={e}
              titles={titles}
              inPageNodes={inPageNodes}
              ws={ws}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ArticleEdgeLink({
  edge,
  titles,
  inPageNodes,
  ws,
}: {
  edge: Edge;
  titles: Map<string, string>;
  inPageNodes: Set<string>;
  ws: string;
}) {
  const label = titles.get(edge.to) ?? edge.to;
  if (inPageNodes.has(edge.to)) {
    return (
      <a href={`#node-${edge.to}`} className="article-edge-link">
        <span className="article-edge-relation">{edge.relation}</span>
        <span>{label}</span>
      </a>
    );
  }
  return (
    <Link to={`/workspaces/${ws}/wiki/${edge.to}`} className="article-edge-link">
      <span className="article-edge-relation">{edge.relation}</span>
      <span>{label}</span>
    </Link>
  );
}

// -- TOC: scroll-spy + fuzzy filter ---------------------------------------

function ArticleToc({ nodes }: { nodes: Node[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const obsRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sections = nodes
      .map((n) => document.getElementById(`node-${n.id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id.replace(/^node-/, ''));
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    sections.forEach((s) => obs.observe(s));
    obsRef.current = obs;
    return () => obs.disconnect();
  }, [nodes]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
  }, [filter, nodes]);

  return (
    <div className="article-toc-inner">
      <div className="article-toc-title">On this page</div>
      <input
        className="article-toc-search"
        type="text"
        value={filter}
        placeholder={`Filter ${nodes.length} sections…`}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="article-toc-list">
        {filtered.map((n) => (
          <li key={n.id}>
            <a
              href={`#node-${n.id}`}
              className={activeId === n.id ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(`node-${n.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {n.title}
            </a>
          </li>
        ))}
        {filtered.length === 0 && (
          <li style={{ color: 'var(--text-subtle)', fontSize: 12, padding: '4px 0' }}>
            No matches.
          </li>
        )}
      </ul>
    </div>
  );
}

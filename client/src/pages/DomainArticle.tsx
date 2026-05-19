import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Node } from '@kb/shared';
import { getDomain, listEdges, listNodes } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { DomainBadge } from '../components/DomainBadge';
import { domainBadgeColors } from '../lib/domain-color';

export function DomainArticle() {
  const ws = useWorkspaceId();
  const { id } = useParams();
  const domainId = id ?? '';

  const { data: domain, error: domainErr } = useQuery({
    queryKey: ['domain', ws, domainId],
    queryFn: () => getDomain(ws, domainId),
    enabled: !!domainId,
  });

  const { data: nodes, isLoading: nodesLoading } = useQuery({
    queryKey: ['nodes', ws, { domain: domainId, limit: 500 }],
    queryFn: () => listNodes(ws, { domain: domainId }),
    enabled: !!domainId,
  });

  // Sort nodes alphabetically by title. Stable, predictable; user can pick a
  // node id explicitly via TOC. Future: a `position` per node for manual order.
  const sortedNodes = useMemo(() => {
    return (nodes ?? []).slice().sort((a, b) => a.title.localeCompare(b.title));
  }, [nodes]);

  // Set of ids currently in the article — passed to MarkdownRenderer so
  // wikilinks pointing at these targets scroll instead of navigating.
  const inPageNodes = useMemo(
    () => new Set(sortedNodes.map((n) => n.id)),
    [sortedNodes],
  );

  if (domainErr) {
    return (
      <div className="container">
        <div className="card">
          <p>Domain not found.</p>
          <Link to={`/workspaces/${ws}`}>← Back home</Link>
        </div>
      </div>
    );
  }

  if (!domain || nodesLoading) {
    return <div className="container"><div className="empty">Loading…</div></div>;
  }

  const { fg } = domainBadgeColors(domain.color, domain.id);

  return (
    <div className="container wide article-layout">
      <article className="article-main">
        <header
          className="article-header"
          style={{ borderLeft: `4px solid ${fg}`, paddingLeft: 16 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <DomainBadge domain={domain.id} />
            <span style={{ color: 'var(--text-subtle)', fontSize: 13 }}>
              {sortedNodes.length} {sortedNodes.length === 1 ? 'section' : 'sections'}
            </span>
          </div>
          <h1 className="page-title">{domain.label}</h1>
          {domain.description && (
            <p className="page-subtitle">{domain.description}</p>
          )}
        </header>

        {sortedNodes.length === 0 ? (
          <div className="empty" style={{ marginTop: 32 }}>
            No pages in this domain yet.{' '}
            <Link to={`/workspaces/${ws}/manage?domain=${domain.id}`}>Add one</Link>.
          </div>
        ) : (
          <div className="article-body">
            {sortedNodes.map((n) => (
              <ArticleSection key={n.id} node={n} inPageNodes={inPageNodes} ws={ws} />
            ))}
          </div>
        )}
      </article>

      {sortedNodes.length > 0 && (
        <aside className="article-toc">
          <ArticleToc nodes={sortedNodes} />
        </aside>
      )}
    </div>
  );
}

// One section per node. The h2 is anchored via id so wikilink scrolls land here.
function ArticleSection({
  node,
  inPageNodes,
  ws,
}: {
  node: Node;
  inPageNodes: Set<string>;
  ws: string;
}) {
  const { data: outgoing } = useQuery({
    queryKey: ['edges-out', ws, node.id],
    queryFn: () => listEdges(ws, { from: node.id }),
  });

  return (
    <section className="article-section" id={`node-${node.id}`}>
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
          <Link to={`/workspaces/${ws}/wiki/${node.id}`} className="ghost-link">
            Edit
          </Link>
        </div>
      </div>

      <MarkdownRenderer body={node.body} inPageNodes={inPageNodes} />

      {outgoing && outgoing.length > 0 && (
        <div className="article-section-edges">
          <span className="article-edges-label">Connects to:</span>
          {outgoing.map((e) => (
            <ArticleEdgeLink key={`${e.to}-${e.relation}`} edge={e} inPageNodes={inPageNodes} ws={ws} />
          ))}
        </div>
      )}
    </section>
  );
}

function ArticleEdgeLink({
  edge,
  inPageNodes,
  ws,
}: {
  edge: { to: string; relation: string };
  inPageNodes: Set<string>;
  ws: string;
}) {
  if (inPageNodes.has(edge.to)) {
    return (
      <a href={`#node-${edge.to}`} className="article-edge-link">
        <span className="article-edge-relation">{edge.relation}</span>
        <span>{edge.to}</span>
      </a>
    );
  }
  return (
    <Link to={`/workspaces/${ws}/wiki/${edge.to}`} className="article-edge-link">
      <span className="article-edge-relation">{edge.relation}</span>
      <span>{edge.to}</span>
    </Link>
  );
}

// Sticky TOC on the right. Uses IntersectionObserver for scroll-spy.
function ArticleToc({ nodes }: { nodes: Node[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Pick the topmost section whose anchor sits above the viewport midpoint.
    const sections = nodes
      .map((n) => document.getElementById(`node-${n.id}`))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // Find the entry closest to the top that's currently intersecting.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = visible[0].target.id.replace(/^node-/, '');
          setActiveId(id);
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );

    sections.forEach((s) => obs.observe(s));
    observerRef.current = obs;
    return () => obs.disconnect();
  }, [nodes]);

  return (
    <div className="article-toc-inner">
      <div className="article-toc-title">On this page</div>
      <ul className="article-toc-list">
        {nodes.map((n) => (
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
      </ul>
    </div>
  );
}

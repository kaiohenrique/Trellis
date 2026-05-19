import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDomain, listEdges, listNodes } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';
import { DomainBadge } from '../components/DomainBadge';
import { ArticleView } from '../components/ArticleView';
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

  // Fetch up to the server cap. Article also receives the *total available*
  // count via a separate cheap count query so we can show "showing X of Y"
  // when clipped. (For now we just compare with what we got back; the API
  // doesn't return a total separately, so the notice fires when we hit 500.)
  const { data: nodes, isLoading: nodesLoading } = useQuery({
    queryKey: ['nodes', ws, { domain: domainId, limit: 500 }],
    queryFn: () => listNodes(ws, { domain: domainId, tags: undefined, q: undefined }, 500),
    enabled: !!domainId,
  });

  // One listEdges call for the whole workspace, partitioned client-side.
  // Replaces N+1 (was one query per section).
  const { data: edges } = useQuery({
    queryKey: ['edges', ws, 'all'],
    queryFn: () => listEdges(ws),
  });

  // Title map for resolving outgoing edge target ids — pulled once for the
  // whole workspace so cross-domain edges still show readable labels.
  const { data: allNodes } = useQuery({
    queryKey: ['nodes', ws, { all: true }],
    queryFn: () => listNodes(ws, {}, 500),
  });
  const titles = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of allNodes ?? []) m.set(n.id, n.title);
    return m;
  }, [allNodes]);

  const sortedNodes = useMemo(
    () => (nodes ?? []).slice().sort((a, b) => a.title.localeCompare(b.title)),
    [nodes],
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
    <div className="container wide">
      <ArticleView
        nodes={sortedNodes}
        edges={edges ?? []}
        titles={titles}
        totalAvailable={sortedNodes.length === 500 ? 500 : undefined}
        ws={ws}
        header={
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
            {domain.description && <p className="page-subtitle">{domain.description}</p>}
          </header>
        }
      />
    </div>
  );
}

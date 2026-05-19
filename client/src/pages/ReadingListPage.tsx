import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Node } from '@kb/shared';
import { listEdges, listNodes } from '../api';
import { useReadingList } from '../hooks/useReadingLists';
import { useWorkspaceId } from '../context/WorkspaceContext';
import { ArticleView } from '../components/ArticleView';

export function ReadingListPage() {
  const ws = useWorkspaceId();
  const { id } = useParams();
  const { data: list, isLoading, error } = useReadingList(id);

  // Full node payload for the workspace so we can build the article body in the
  // order the list specifies. Workspaces with thousands of nodes will want a
  // bulk-by-ids endpoint instead; today's cap of 500 is fine.
  const { data: allNodes } = useQuery({
    queryKey: ['nodes', ws, { all: true }],
    queryFn: () => listNodes(ws, {}, 500),
  });

  const { data: edges } = useQuery({
    queryKey: ['edges', ws, 'all'],
    queryFn: () => listEdges(ws),
  });

  // Build the ordered nodes + a note lookup. Items missing a node (deleted
  // mid-list) are silently skipped.
  const { ordered, noteByNode } = useMemo(() => {
    const byId = new Map<string, Node>();
    for (const n of allNodes ?? []) byId.set(n.id, n);
    const ord: Node[] = [];
    const notes = new Map<string, string>();
    for (const it of list?.items ?? []) {
      const n = byId.get(it.node_id);
      if (n) {
        ord.push(n);
        if (it.note) notes.set(it.node_id, it.note);
      }
    }
    return { ordered: ord, noteByNode: notes };
  }, [allNodes, list]);

  const titles = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of allNodes ?? []) m.set(n.id, n.title);
    return m;
  }, [allNodes]);

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <p>Reading list not found.</p>
          <Link to={`/workspaces/${ws}/reading-lists`}>← All reading lists</Link>
        </div>
      </div>
    );
  }
  if (!list || isLoading) {
    return <div className="container"><div className="empty">Loading…</div></div>;
  }

  return (
    <div className="container wide">
      <ArticleView
        nodes={ordered}
        edges={edges ?? []}
        titles={titles}
        ws={ws}
        noteFor={(id) => noteByNode.get(id)}
        header={
          <header className="article-header" style={{ borderLeft: '4px solid var(--accent)', paddingLeft: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="tag-pill">reading list</span>
              <span style={{ color: 'var(--text-subtle)', fontSize: 13 }}>
                {ordered.length} {ordered.length === 1 ? 'section' : 'sections'}
              </span>
              <span style={{ flex: 1 }} />
              <Link
                to={`/workspaces/${ws}/reading-lists`}
                style={{ fontSize: 12, color: 'var(--text-muted)', border: 'none' }}
              >
                All lists →
              </Link>
            </div>
            <h1 className="page-title">{list.title}</h1>
            {list.description && <p className="page-subtitle">{list.description}</p>}
          </header>
        }
      />
    </div>
  );
}

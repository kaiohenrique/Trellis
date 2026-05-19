import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addReadingListItem, deleteNode, listEdges, listNodes, updateNode } from '../api';
import { useReadingLists } from '../hooks/useReadingLists';
import { useNode } from '../hooks/useNode';
import { useWorkspaceId } from '../context/WorkspaceContext';
import { DomainBadge } from '../components/DomainBadge';
import { EdgePill } from '../components/EdgePill';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { WikiEditor } from '../components/WikiEditor';
import { NodeCard } from '../components/NodeCard';
import { GraphCanvas } from '../components/GraphCanvas';
import { CommentThread } from '../components/CommentThread';

export function NodePage() {
  const ws = useWorkspaceId();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: node, isLoading, error } = useNode(id);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className="container"><div className="empty">Loading…</div></div>;
  if (error) {
    return (
      <div className="container">
        <div className="card">
          <p>Node not found.</p>
          <Link to={`/workspaces/${ws}`}>← Back home</Link>
        </div>
      </div>
    );
  }
  if (!node) return null;

  const goDelete = async () => {
    if (!confirm(`Delete node "${node.title}"?`)) return;
    await deleteNode(ws, node.id);
    qc.invalidateQueries({ queryKey: ['nodes', ws] });
    navigate(`/workspaces/${ws}`);
  };

  return (
    <div className="container wide" style={{ paddingTop: 16 }}>
      <div className="node-page">
        <div className="main">
          <h1>{node.title}</h1>
          <div className="header-meta">
            <DomainBadge domain={node.domain} />
            {node.tags.map((t) => (
              <span key={t} className="tag-pill">{t}</span>
            ))}
            <span style={{ color: 'var(--text-subtle)', fontSize: 12, marginLeft: 'auto' }}>
              updated {new Date(node.updated_at).toLocaleDateString()}
            </span>
          </div>
          {!editing ? (
            <>
              <div className="actions">
                <button onClick={() => setEditing(true)}>Edit</button>
                <Link to={`/workspaces/${ws}/wiki/${node.id}/history`}>
                  <button>History</button>
                </Link>
                <Link to={`/workspaces/${ws}/domain/${node.domain}#node-${node.id}`}>
                  <button>Read in article</button>
                </Link>
                <AddToListButton nodeId={node.id} />
                <div style={{ flex: 1 }} />
                <button onClick={goDelete} className="danger">Delete</button>
              </div>
              <MarkdownRenderer body={node.body} />
              <OutgoingEdges edges={node.edges.outgoing} />
              <Backlinks nodeId={node.id} />
              <CommentThread nodeId={node.id} />
            </>
          ) : (
            <EditMode node={node} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
          )}
        </div>
        <aside className="sidebar-right">
          <RelatedSidebar nodeId={node.id} />
        </aside>
      </div>
    </div>
  );
}

function EditMode({
  node,
  onCancel,
  onSaved,
}: {
  node: { id: string; title: string; body: string; domain: string; tags: string[] };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const ws = useWorkspaceId();
  const [body, setBody] = useState(node.body);
  const [title, setTitle] = useState(node.title);
  const [tagsStr, setTagsStr] = useState(node.tags.join(', '));
  const [author, setAuthor] = useState(localStorage.getItem('kb.author') ?? '');
  const [summary, setSummary] = useState('');
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () =>
      updateNode(ws, node.id, {
        title,
        body,
        tags: tagsStr.split(',').map((s) => s.trim()).filter(Boolean),
        changed_by: author.trim() || 'unknown',
        change_summary: summary,
      }),
    onSuccess: () => {
      if (author.trim()) localStorage.setItem('kb.author', author.trim());
      qc.invalidateQueries({ queryKey: ['node', ws, node.id] });
      qc.invalidateQueries({ queryKey: ['versions', ws, node.id] });
      onSaved();
    },
  });

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ fontSize: 18, fontWeight: 600 }}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <input
          type="text"
          value={tagsStr}
          placeholder="tags (comma-separated)"
          onChange={(e) => setTagsStr(e.target.value)}
        />
      </div>
      <div className="split">
        <WikiEditor initialValue={body} onChange={setBody} />
        <div className="preview-pane">
          <MarkdownRenderer body={body} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          type="text"
          value={author}
          placeholder="Your name"
          onChange={(e) => setAuthor(e.target.value)}
          style={{ maxWidth: 200 }}
        />
        <input
          type="text"
          value={summary}
          placeholder="What changed?"
          onChange={(e) => setSummary(e.target.value)}
        />
        <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function OutgoingEdges({ edges }: { edges: { from: string; to: string; relation: string }[] }) {
  const ws = useWorkspaceId();
  const targetIds = useMemo(() => Array.from(new Set(edges.map((e) => e.to))), [edges]);
  const { data: targets } = useQuery({
    queryKey: ['nodes-by-ids', ws, targetIds],
    queryFn: async () => {
      if (targetIds.length === 0) return [];
      const all = await listNodes(ws);
      const map = new Map(all.map((n) => [n.id, n]));
      return targetIds.map((id) => map.get(id)).filter(Boolean) as { id: string; title: string }[];
    },
    enabled: targetIds.length > 0,
  });
  if (edges.length === 0) return null;
  const byRelation = new Map<string, typeof edges>();
  for (const e of edges) {
    const arr = byRelation.get(e.relation) ?? [];
    arr.push(e);
    byRelation.set(e.relation, arr);
  }
  return (
    <div style={{ marginTop: 32 }}>
      <div className="section-title">Outgoing</div>
      {Array.from(byRelation.entries()).map(([rel, es]) => (
        <div key={rel} style={{ marginBottom: 8 }}>
          {es.map((e) => {
            const t = targets?.find((x) => x.id === e.to);
            return <EdgePill key={e.to + rel} to={e.to} label={t?.title ?? e.to} relation={rel} />;
          })}
        </div>
      ))}
    </div>
  );
}

function Backlinks({ nodeId }: { nodeId: string }) {
  const ws = useWorkspaceId();
  const { data: incoming } = useQuery({
    queryKey: ['edges-incoming', ws, nodeId],
    queryFn: () => listEdges(ws, { to: nodeId }),
  });
  const sourceIds = useMemo(() => Array.from(new Set((incoming ?? []).map((e) => e.from))), [incoming]);
  const { data: sources } = useQuery({
    queryKey: ['nodes-by-ids', ws, sourceIds],
    queryFn: async () => {
      if (sourceIds.length === 0) return [];
      const all = await listNodes(ws);
      return all.filter((n) => sourceIds.includes(n.id));
    },
    enabled: sourceIds.length > 0,
  });
  if (!incoming || incoming.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-title">What links here</div>
      {(incoming ?? []).map((e) => {
        const src = sources?.find((s) => s.id === e.from);
        return <EdgePill key={e.from + e.relation} to={e.from} label={src?.title ?? e.from} relation={e.relation} />;
      })}
    </div>
  );
}

function RelatedSidebar({ nodeId }: { nodeId: string }) {
  const ws = useWorkspaceId();
  const { data: neighborhood } = useQuery({
    queryKey: ['neighbors', ws, nodeId],
    queryFn: async () => {
      const [out, inc] = await Promise.all([listEdges(ws, { from: nodeId }), listEdges(ws, { to: nodeId })]);
      const ids = new Set<string>();
      for (const e of out) ids.add(e.to);
      for (const e of inc) ids.add(e.from);
      ids.delete(nodeId);
      if (ids.size === 0) return { related: [], graph: { nodes: [], edges: [] } };
      const all = await listNodes(ws);
      const related = all.filter((n) => ids.has(n.id));
      const graphNodes = [...related, all.find((n) => n.id === nodeId)!].filter(Boolean);
      const graphEdges = [...out, ...inc];
      return { related, graph: { nodes: graphNodes, edges: graphEdges } };
    },
  });

  return (
    <>
      <div>
        <div className="section-title">Related</div>
        {neighborhood?.related.length ? (
          neighborhood.related.map((n) => <NodeCard key={n.id} node={n} />)
        ) : (
          <div className="empty">No connections yet</div>
        )}
      </div>
      {neighborhood?.graph.nodes && neighborhood.graph.nodes.length > 0 && (
        <div>
          <div className="section-title">Neighborhood</div>
          <GraphCanvas
            nodes={neighborhood.graph.nodes}
            edges={neighborhood.graph.edges}
            height={240}
            mini
          />
        </div>
      )}
    </>
  );
}

// Inline dropdown to add the current node to one of the workspace's reading
// lists. Stays unobtrusive: a button that reveals a small menu on click.
function AddToListButton({ nodeId }: { nodeId: string }) {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const { data: lists } = useReadingLists();
  const [open, setOpen] = useState(false);
  const add = useMutation({
    mutationFn: (listId: string) => addReadingListItem(ws, listId, { node_id: nodeId }),
    onSuccess: (_, listId) => {
      qc.invalidateQueries({ queryKey: ['reading-list', ws, listId] });
      qc.invalidateQueries({ queryKey: ['reading-lists', ws] });
      setOpen(false);
    },
  });

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)}>+ Add to list</button>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 4px)', left: 0 }}>
          {(lists ?? []).length === 0 && (
            <div style={{ padding: 10, color: 'var(--text-muted)', fontSize: 12 }}>
              No reading lists yet.{' '}
              <Link to={`/workspaces/${ws}/reading-lists`}>Create one →</Link>
            </div>
          )}
          {(lists ?? []).map((l) => (
            <button
              key={l.id}
              className="menu-item"
              onClick={() => add.mutate(l.id)}
              disabled={add.isPending}
              style={{ width: '100%', textAlign: 'left' }}
            >
              <span style={{ flex: 1 }}>{l.title}</span>
              <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{l.item_count}</span>
            </button>
          ))}
          <div className="menu-divider" />
          <Link to={`/workspaces/${ws}/reading-lists`} className="menu-item" onClick={() => setOpen(false)}>
            <span style={{ color: 'var(--text-muted)' }}>Manage lists…</span>
          </Link>
        </div>
      )}
    </div>
  );
}

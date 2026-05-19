import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ReadingListSummary, ReadingListWithItems } from '@kb/shared';
import {
  addReadingListItem,
  createReadingList,
  deleteReadingList,
  listNodes,
  removeReadingListItem,
  reorderReadingList,
  updateReadingList,
} from '../api';
import { useReadingLists, useReadingList } from '../hooks/useReadingLists';
import { useWorkspaceId } from '../context/WorkspaceContext';
import { DomainBadge } from '../components/DomainBadge';
import { useQuery } from '@tanstack/react-query';

// /workspaces/:ws/reading-lists  -> index of all lists
// /workspaces/:ws/reading-lists/:id/edit -> per-list manager (items, order)
export function ReadingListsAdmin() {
  return <ReadingListsIndex />;
}

function ReadingListsIndex() {
  const ws = useWorkspaceId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: lists, isLoading } = useReadingLists();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ id: '', title: '', description: '' });

  const create = useMutation({
    mutationFn: () =>
      createReadingList(ws, {
        id: form.id,
        title: form.title,
        description: form.description,
        created_by: localStorage.getItem('kb.author') ?? 'unknown',
      }),
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['reading-lists', ws] });
      navigate(`/workspaces/${ws}/reading-lists/${l.id}/edit`);
    },
  });

  return (
    <div className="container wide">
      <h1 className="page-title">Reading lists</h1>
      <p className="page-subtitle">
        Curated, ordered selections of pages that may span any domain. Useful when a single domain
        article is too long, or when you want to define a specific learning path.
      </p>

      <div style={{ marginBottom: 16 }}>
        <button className="accent" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? 'Cancel' : '+ New reading list'}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 8 }}>
            <input
              placeholder="id (slug)"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase() })}
            />
            <input
              placeholder="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <textarea
            placeholder="description (optional)"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ marginTop: 8 }}
          />
          <div style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => create.mutate()} disabled={!form.id || !form.title || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="empty">Loading…</div>}
      {lists && lists.length === 0 && <div className="empty">No reading lists yet.</div>}

      <div className="home-grid">
        {lists?.map((l) => <ReadingListCard key={l.id} list={l} />)}
      </div>
    </div>
  );
}

function ReadingListCard({ list }: { list: ReadingListSummary }) {
  const ws = useWorkspaceId();
  return (
    <Link to={`/workspaces/${ws}/reading-lists/${list.id}`} className="home-domain-card">
      <h3 style={{ textTransform: 'none' }}>{list.title}</h3>
      <div className="count" style={{ marginBottom: 4 }}>
        Read · {list.item_count} {list.item_count === 1 ? 'section' : 'sections'}
      </div>
      {list.description && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {list.description}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 8 }}>
        by {list.created_by}
      </div>
    </Link>
  );
}

export function ReadingListEdit() {
  const ws = useWorkspaceId();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: list, isLoading } = useReadingList(id);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['reading-list', ws, id] });
  const invalidateAll = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ['reading-lists', ws] });
  };

  if (!id) return null;
  if (isLoading) return <div className="container"><div className="empty">Loading…</div></div>;
  if (!list) return <div className="container">Not found.</div>;

  return (
    <div className="container wide">
      <p style={{ marginBottom: 8 }}>
        <Link to={`/workspaces/${ws}/reading-lists`}>← All reading lists</Link>
        {' · '}
        <Link to={`/workspaces/${ws}/reading-lists/${list.id}`}>View article →</Link>
      </p>
      <h1 className="page-title">Edit · {list.title}</h1>
      <p className="page-subtitle">{list.description || 'No description.'}</p>

      <Metadata list={list} onSaved={invalidateAll} onDeleted={() => {
        invalidateAll();
        navigate(`/workspaces/${ws}/reading-lists`);
      }} />

      <h2 style={{ marginTop: 32, marginBottom: 12, fontSize: 18 }}>Items</h2>
      <Items list={list} onChange={invalidate} />

      <h2 style={{ marginTop: 32, marginBottom: 12, fontSize: 18 }}>Add a page</h2>
      <AddItemForm listId={list.id} existingNodeIds={new Set(list.items.map((i) => i.node_id))} onAdded={invalidate} />
    </div>
  );
}

function Metadata({
  list,
  onSaved,
  onDeleted,
}: {
  list: ReadingListWithItems;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const ws = useWorkspaceId();
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description);

  const save = useMutation({
    mutationFn: () => updateReadingList(ws, list.id, { title, description }),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationFn: () => deleteReadingList(ws, list.id),
    onSuccess: onDeleted,
  });

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title" style={{ fontSize: 15, fontWeight: 600 }} />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="description"
        style={{ marginTop: 8 }}
      />
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Delete reading list "${list.title}"?`)) remove.mutate();
          }}
        >
          Delete list
        </button>
      </div>
    </div>
  );
}

function Items({ list, onChange }: { list: ReadingListWithItems; onChange: () => void }) {
  const ws = useWorkspaceId();
  const { data: allNodes } = useQuery({
    queryKey: ['nodes', ws, { all: true }],
    queryFn: () => listNodes(ws, {}, 500),
  });
  const titleOf = (id: string) => allNodes?.find((n) => n.id === id)?.title ?? id;
  const domainOf = (id: string) => allNodes?.find((n) => n.id === id)?.domain ?? '';

  const reorder = useMutation({
    mutationFn: (order: string[]) => reorderReadingList(ws, list.id, order),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: (nodeId: string) => removeReadingListItem(ws, list.id, nodeId),
    onSuccess: onChange,
  });

  const move = (idx: number, delta: number) => {
    const next = list.items.map((i) => i.node_id);
    const j = idx + delta;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    reorder.mutate(next);
  };

  if (list.items.length === 0) {
    return <div className="empty">No items yet. Add one below.</div>;
  }

  return (
    <table className="manage-table">
      <thead>
        <tr>
          <th style={{ width: 40 }}>#</th>
          <th>Title</th>
          <th style={{ width: 110 }}>Domain</th>
          <th>Note</th>
          <th style={{ width: 140 }}></th>
        </tr>
      </thead>
      <tbody>
        {list.items.map((it, i) => (
          <tr key={it.node_id}>
            <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{i + 1}</td>
            <td>
              <Link to={`/workspaces/${ws}/wiki/${it.node_id}`}>{titleOf(it.node_id)}</Link>
            </td>
            <td>{domainOf(it.node_id) && <DomainBadge domain={domainOf(it.node_id)} />}</td>
            <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{it.note || '—'}</td>
            <td>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending}>↑</button>
                <button onClick={() => move(i, +1)} disabled={i === list.items.length - 1 || reorder.isPending}>↓</button>
                <button className="danger" onClick={() => remove.mutate(it.node_id)} disabled={remove.isPending}>×</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AddItemForm({
  listId,
  existingNodeIds,
  onAdded,
}: {
  listId: string;
  existingNodeIds: Set<string>;
  onAdded: () => void;
}) {
  const ws = useWorkspaceId();
  const [nodeId, setNodeId] = useState('');
  const [note, setNote] = useState('');
  const { data: allNodes } = useQuery({
    queryKey: ['nodes', ws, { all: true }],
    queryFn: () => listNodes(ws, {}, 500),
  });
  const add = useMutation({
    mutationFn: () => addReadingListItem(ws, listId, { node_id: nodeId, note }),
    onSuccess: () => {
      setNodeId('');
      setNote('');
      onAdded();
    },
  });

  return (
    <div className="card">
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 100px', gap: 8 }}>
        <input
          list="all-nodes-datalist"
          placeholder="page id (slug)"
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value.toLowerCase())}
        />
        <datalist id="all-nodes-datalist">
          {(allNodes ?? [])
            .filter((n) => !existingNodeIds.has(n.id))
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.title} ({n.domain})
              </option>
            ))}
        </datalist>
        <input
          placeholder="editorial note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => add.mutate()}
          disabled={!nodeId || add.isPending || existingNodeIds.has(nodeId)}
        >
          {add.isPending ? '…' : 'Add'}
        </button>
      </div>
      {existingNodeIds.has(nodeId) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          Already in this list.
        </div>
      )}
    </div>
  );
}

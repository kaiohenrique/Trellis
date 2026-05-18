import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useNodes } from '../hooks/useNodes';
import { DomainBadge } from '../components/DomainBadge';
import { createNode, getGraph } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function Manage() {
  const ws = useWorkspaceId();
  const [params] = useSearchParams();
  const domain = params.get('domain') || undefined;
  const { data: nodes, refetch } = useNodes(domain ? { domain } : {});
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ id: '', title: '', domain: domain ?? 'concepts', tags: '' });

  const submit = async () => {
    if (!form.id || !form.title) return;
    const created = await createNode(ws, {
      id: form.id,
      title: form.title,
      domain: form.domain,
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      body: '',
    });
    setShowCreate(false);
    refetch();
    navigate(`/workspaces/${ws}/wiki/${created.id}`);
  };

  const exportJson = async () => {
    const graph = await getGraph(ws);
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ws}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sorted = useMemo(() => (nodes ?? []).slice().sort((a, b) => a.title.localeCompare(b.title)), [nodes]);

  return (
    <div className="container wide">
      <h1 className="page-title">All pages{domain && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {domain}</span>}</h1>
      <p className="page-subtitle">Every page in this workspace, sorted alphabetically.</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button className="accent" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? 'Cancel' : '+ New page'}
        </button>
        <button className="outline" onClick={exportJson}>Export JSON</button>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-muted)', alignSelf: 'center', fontSize: 13 }}>{sorted.length} pages</span>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 2fr', gap: 8 }}>
            <input
              placeholder="id (slug)"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
            />
            <input
              placeholder="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>
              <option value="concepts">concepts</option>
              <option value="architectures">architectures</option>
              <option value="tools">tools</option>
              <option value="workflows">workflows</option>
              <option value="papers">papers</option>
              <option value="people">people</option>
              <option value="models">models</option>
            </select>
            <input
              placeholder="tags (comma-separated)"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="primary" onClick={submit}>Create</button>
          </div>
        </div>
      )}

      <table className="manage-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Domain</th>
            <th>Tags</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((n) => (
            <tr key={n.id}>
              <td><Link to={`/workspaces/${ws}/wiki/${n.id}`}>{n.id}</Link></td>
              <td>{n.title}</td>
              <td><DomainBadge domain={n.domain} /></td>
              <td>{n.tags.map((t) => <span key={t} className="tag-pill">{t}</span>)}</td>
              <td>{new Date(n.updated_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

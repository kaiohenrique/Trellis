import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createWorkspace, listWorkspaces } from '../api';

const STORAGE_KEY = 'kb_workspace';

export function lastUsedWorkspace(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function rememberWorkspace(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

interface Props {
  mode?: 'picker' | 'manage';
}

// Shown on first load when no workspace is selected (`mode=picker`), and also as the
// /workspaces page for browsing + creating workspaces (`mode=manage`).
export function WorkspacePicker({ mode = 'picker' }: Props) {
  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', description: '' });

  const create = useMutation({
    mutationFn: () =>
      createWorkspace({ id: form.id, name: form.name, description: form.description }),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      rememberWorkspace(ws.id);
      navigate(`/workspaces/${ws.id}`);
    },
  });

  const choose = (id: string) => {
    rememberWorkspace(id);
    navigate(`/workspaces/${id}`);
  };

  return (
    <div className="container">
      <h1>{mode === 'manage' ? 'Workspaces' : 'Pick a workspace'}</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        Workspaces are fully isolated. Nodes, edges, widgets, and scripts in one workspace cannot
        see anything in another.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <button className="primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'New workspace'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 8 }}>
            <input
              placeholder="id (slug)"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value.replace(/[^a-z0-9_-]/gi, '') })}
            />
            <input
              placeholder="display name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
            <button
              className="primary"
              onClick={() => create.mutate()}
              disabled={!form.id || !form.name || create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
          {create.error && (
            <div style={{ color: 'var(--danger)', marginTop: 8 }}>
              {(create.error as Error).message}
            </div>
          )}
        </div>
      )}

      {isLoading && <div className="empty">Loading…</div>}
      {workspaces && workspaces.length === 0 && (
        <div className="empty">No workspaces yet — create one above.</div>
      )}

      <div className="home-grid">
        {workspaces?.map((ws) => (
          <div key={ws.id} className="home-domain-card" style={{ cursor: 'pointer' }} onClick={() => choose(ws.id)}>
            <h3 style={{ textTransform: 'none' }}>{ws.name}</h3>
            <div className="count" style={{ marginBottom: 4 }}>
              <code>{ws.id}</code>
            </div>
            {ws.description && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ws.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

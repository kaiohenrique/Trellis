import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { DomainWithCount } from '@kb/shared';
import { createDomain, deleteDomain, listDomains, updateDomain } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';
import { domainBadgeColors } from '../lib/domain-color';

export function DomainsAdmin() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const { data: domains, isLoading } = useQuery({
    queryKey: ['domains', ws],
    queryFn: () => listDomains(ws),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['domains', ws] });
    qc.invalidateQueries({ queryKey: ['nodes', ws] });
  };

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ id: '', label: '', description: '', color: '' });

  const create = useMutation({
    mutationFn: () =>
      createDomain(ws, {
        id: form.id,
        label: form.label || undefined,
        description: form.description || undefined,
        color: form.color || null,
      }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setForm({ id: '', label: '', description: '', color: '' });
    },
  });

  return (
    <div className="container wide">
      <p style={{ marginBottom: 8 }}>
        <Link to={`/workspaces/${ws}/manage`}>← Back to pages</Link>
      </p>
      <h1 className="page-title">Domains</h1>
      <p className="page-subtitle">
        Pick a label, color, and sort order for each category. Agents can also create
        domains by saving a node — those start with default values and you can tidy them up here.
      </p>

      <div style={{ marginBottom: 16 }}>
        <button className="accent" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? 'Cancel' : '+ New domain'}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px', gap: 8 }}>
            <input
              placeholder="slug"
              value={form.id}
              onChange={(e) =>
                setForm({ ...form, id: e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase() })
              }
            />
            <input
              placeholder="label (e.g. Books)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            <input
              type="color"
              value={form.color || '#888888'}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              style={{ padding: 0, height: 36 }}
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
              disabled={!form.id || create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="empty">Loading…</div>}
      {domains && domains.length === 0 && <div className="empty">No domains yet.</div>}

      <table className="manage-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}></th>
            <th>Slug</th>
            <th>Label</th>
            <th>Description</th>
            <th style={{ width: 80 }}>Pages</th>
            <th style={{ width: 70 }}>Order</th>
            <th style={{ width: 180 }}></th>
          </tr>
        </thead>
        <tbody>
          {domains?.map((d) => <DomainRow key={d.id} ws={ws} d={d} onChange={invalidate} allDomains={domains} />)}
        </tbody>
      </table>
    </div>
  );
}

function DomainRow({
  ws,
  d,
  allDomains,
  onChange,
}: {
  ws: string;
  d: DomainWithCount;
  allDomains: DomainWithCount[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label);
  const [description, setDescription] = useState(d.description);
  const [color, setColor] = useState(d.color ?? '#888888');
  const [position, setPosition] = useState(d.position);

  const update = useMutation({
    mutationFn: () => updateDomain(ws, d.id, { label, description, color, position }),
    onSuccess: () => { onChange(); setEditing(false); },
  });

  const remove = useMutation({
    mutationFn: async () => {
      try {
        return await deleteDomain(ws, d.id);
      } catch (e) {
        const msg = (e as Error).message;
        // If the API rejected with has_nodes, ask user where to move them.
        if (msg.includes('node(s) still use')) {
          const others = allDomains.filter((x) => x.id !== d.id);
          if (others.length === 0) throw new Error('No other domain to move to. Delete the pages first.');
          const target = prompt(
            `${d.node_count} pages still in "${d.label}". Move them to which domain?\n\nOptions: ${others.map((o) => o.id).join(', ')}`,
          );
          if (!target) throw new Error('Cancelled');
          return await deleteDomain(ws, d.id, target.trim());
        }
        throw e;
      }
    },
    onSuccess: onChange,
    onError: (e) => alert((e as Error).message),
  });

  const { fg, bg } = domainBadgeColors(color, d.id);

  return (
    <tr>
      <td>
        {editing ? (
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ padding: 0, width: 32, height: 28 }}
          />
        ) : (
          <span
            aria-label={`color ${fg}`}
            style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: fg }}
          />
        )}
      </td>
      <td><code style={{ fontSize: 12 }}>{d.id}</code></td>
      <td>
        {editing ? (
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        ) : (
          <span className="domain-badge" style={{ background: bg, color: fg }}>{d.label}</span>
        )}
      </td>
      <td>
        {editing ? (
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{d.description || '—'}</span>
        )}
      </td>
      <td style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{d.node_count}</td>
      <td>
        {editing ? (
          <input
            type="number"
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            style={{ width: 60 }}
          />
        ) : (
          <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{d.position}</span>
        )}
      </td>
      <td>
        {editing ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="primary" onClick={() => update.mutate()} disabled={update.isPending}>
              {update.isPending ? '…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setEditing(true)}>Edit</button>
            <button
              className="danger"
              onClick={() => {
                if (d.node_count === 0 && !confirm(`Delete domain "${d.label}"?`)) return;
                remove.mutate();
              }}
              disabled={remove.isPending}
            >
              {remove.isPending ? '…' : 'Delete'}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

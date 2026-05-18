import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { NodeVersionSummary } from '@kb/shared';
import { restoreVersion } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';

interface Props {
  nodeId: string;
  versions: NodeVersionSummary[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function VersionList({ nodeId, versions }: Props) {
  const ws = useWorkspaceId();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const navigate = useNavigate();

  const toggle = (v: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(v)) next.delete(v);
      else {
        if (next.size >= 2) next.delete(Array.from(next)[0]);
        next.add(v);
      }
      return next;
    });
  };

  const compare = () => {
    const [a, b] = Array.from(selected).sort((x, y) => x - y);
    navigate(`/workspaces/${ws}/wiki/${nodeId}/history/${a}/${b}`);
  };

  const restore = async (v: number) => {
    if (!confirm(`Restore node to version ${v}?`)) return;
    await restoreVersion(ws, nodeId, v, localStorage.getItem('kb.author') ?? 'unknown');
    navigate(`/workspaces/${ws}/wiki/${nodeId}`);
  };

  return (
    <div>
      {selected.size === 2 && (
        <div style={{ marginBottom: 12 }}>
          <button className="primary" onClick={compare}>
            Compare versions {Array.from(selected).sort((a, b) => a - b).join(' ↔ ')}
          </button>
        </div>
      )}
      <ul className="history-list">
        {versions.map((v) => (
          <li key={v.id}>
            <input
              type="checkbox"
              checked={selected.has(v.version)}
              onChange={() => toggle(v.version)}
            />
            <span className="version-num">v{v.version}</span>
            <div className="summary">
              <strong>{v.changed_by}</strong>
              {v.change_summary && ` — ${v.change_summary}`}
              <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{fmtDate(v.created_at)}</div>
            </div>
            <Link to={`/workspaces/${ws}/wiki/${nodeId}/history/${Math.max(1, v.version - 1)}/${v.version}`}>
              <button>View diff</button>
            </Link>
            <button onClick={() => restore(v.version)}>Restore</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

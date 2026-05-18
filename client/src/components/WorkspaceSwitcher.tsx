import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { listWorkspaces } from '../api';
import { rememberWorkspace } from '../pages/WorkspacePicker';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function WorkspaceSwitcher() {
  const current = useWorkspaceId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const switchTo = (id: string) => {
    rememberWorkspace(id);
    qc.invalidateQueries(); // invalidate everything so workspace-scoped caches refetch
    navigate(`/workspaces/${id}`);
    setOpen(false);
  };

  const currentWs = workspaces?.find((w) => w.id === current);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>workspace</span>
        <span style={{ fontWeight: 600 }}>{currentWs?.name ?? current}</span>
        <span style={{ color: 'var(--text-subtle)' }}>▾</span>
      </button>
      {open && (
        <div
          className="autocomplete"
          style={{ top: '100%', left: 0, marginTop: 4, minWidth: 240 }}
        >
          {workspaces?.map((w) => (
            <div
              key={w.id}
              className={`item ${w.id === current ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                switchTo(w.id);
              }}
            >
              <span style={{ flex: 1 }}>
                <strong>{w.name}</strong>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.id}</div>
              </span>
            </div>
          ))}
          <div className="item" style={{ borderTop: '1px solid var(--border)' }}>
            <Link to="/workspaces" onClick={() => setOpen(false)} style={{ flex: 1 }}>
              Manage workspaces…
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

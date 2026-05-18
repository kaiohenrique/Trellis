import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { autocompleteNodes, listWorkspaces } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';
import { rememberWorkspace } from '../pages/WorkspacePicker';
import type { AutocompleteResult } from '@kb/shared';
import { DomainBadge } from './DomainBadge';

// Brand mark — a small lattice/trellis pattern.
const TrellisMark = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3 3v10M8 3v10M13 3v10M3 6h10M3 10h10" />
  </svg>
);

// Tiny inline icon helpers — no extra deps, matches the muted aesthetic.
const Icon = {
  home: () => (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 7L8 2.5l5.5 4.5v6.5h-4v-4h-3v4h-4V7z" strokeLinejoin="round" />
    </svg>
  ),
  graph: () => (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="4" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="8" cy="12" r="2" />
      <path d="M5.5 5L10 11M4 6v4M12 6v4" />
    </svg>
  ),
  widget: () => (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  manage: () => (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
    </svg>
  ),
  workspaces: () => (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6h12" />
    </svg>
  ),
  search: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" strokeLinecap="round" />
    </svg>
  ),
};

function wsInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

interface SidebarProps {
  variant?: 'workspace' | 'top';
}

export function Sidebar({ variant = 'workspace' }: SidebarProps) {
  if (variant === 'top') return <TopSidebar />;
  return <WorkspaceSidebar />;
}

// Sidebar used on /workspaces and the picker — minimal, no workspace context.
function TopSidebar() {
  const location = useLocation();
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link to="/" className="sidebar-brand">
          <TrellisMark />
          Trellis
        </Link>
      </div>
      <nav className="sidebar-nav">
        <div className="sidebar-section">All</div>
        <Link
          to="/workspaces"
          className={`nav-item ${location.pathname.startsWith('/workspaces') ? 'active' : ''}`}
        >
          <Icon.workspaces />
          <span>Workspaces</span>
        </Link>
      </nav>
      <div className="sidebar-footer">Trellis — AI agent KB</div>
    </aside>
  );
}

function WorkspaceSidebar() {
  const ws = useWorkspaceId();
  const location = useLocation();

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });
  const current = workspaces?.find((w) => w.id === ws);

  const links = [
    { to: `/workspaces/${ws}`,         icon: <Icon.home />,    label: 'Home',    exact: true },
    { to: `/workspaces/${ws}/graph`,   icon: <Icon.graph />,   label: 'Graph' },
    { to: `/workspaces/${ws}/widgets`, icon: <Icon.widget />,  label: 'Widgets' },
    { to: `/workspaces/${ws}/manage`,  icon: <Icon.manage />,  label: 'All pages' },
  ];

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link to="/" className="sidebar-brand">
          <TrellisMark />
          Trellis
        </Link>
        <WorkspaceMenu current={current?.name ?? ws} currentId={ws} all={workspaces ?? []} />
      </div>

      <SidebarSearch />

      <nav className="sidebar-nav">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`nav-item ${isActive(l.to, l.exact) ? 'active' : ''}`}
          >
            {l.icon}
            <span>{l.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-section">Recently edited</div>
      <RecentNodes />

      <div className="sidebar-footer">
        <Link to="/workspaces" style={{ border: 'none', color: 'inherit' }}>
          Manage workspaces…
        </Link>
      </div>
    </aside>
  );
}

function WorkspaceMenu({
  current,
  currentId,
  all,
}: {
  current: string;
  currentId: string;
  all: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const switchTo = (id: string) => {
    rememberWorkspace(id);
    qc.invalidateQueries();
    navigate(`/workspaces/${id}`);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="sidebar-ws" onClick={() => setOpen((o) => !o)}>
        <span className="ws-emoji">{wsInitials(current)}</span>
        <span className="ws-name">{current}</span>
        <span className="ws-chevron">⌄</span>
      </button>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 2px)', left: 0, right: 0 }}>
          {all.map((w) => (
            <button
              key={w.id}
              className={`menu-item ${w.id === currentId ? 'active' : ''}`}
              onClick={() => switchTo(w.id)}
            >
              <span className="ws-emoji">{wsInitials(w.name)}</span>
              <span style={{ flex: 1 }}>
                {w.name}
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{w.id}</div>
              </span>
              {w.id === currentId && <span style={{ color: 'var(--accent)' }}>✓</span>}
            </button>
          ))}
          <div className="menu-divider" />
          <Link
            to="/workspaces"
            className="menu-item"
            style={{ color: 'var(--text-muted)', borderBottom: 'none' }}
            onClick={() => setOpen(false)}
          >
            <span>Manage workspaces…</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function SidebarSearch() {
  const ws = useWorkspaceId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AutocompleteResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      autocompleteNodes(ws, q).then((r) => {
        setResults(r);
        setActive(0);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [q, ws]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const choose = (id: string) => {
    setQ('');
    setOpen(false);
    setResults([]);
    navigate(`/workspaces/${ws}/wiki/${id}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      choose(results[active].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="sidebar-search" ref={containerRef}>
      <span className="search-icon"><Icon.search /></span>
      <input
        type="text"
        value={q}
        placeholder="Search…"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {open && results.length > 0 && (
        <div className="autocomplete" style={{ top: 'calc(100% + 4px)', left: 0, right: 0 }}>
          {results.map((r, i) => (
            <div
              key={r.id}
              className={`item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r.id);
              }}
            >
              <DomainBadge domain={r.domain} />
              <span>{r.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentNodes() {
  const ws = useWorkspaceId();
  const { data } = useQuery({
    queryKey: ['recent-nodes', ws],
    queryFn: async () => {
      const all = await fetch(`/api/v1/workspaces/${ws}/nodes?limit=8`).then((r) => r.json());
      return all.data as { id: string; title: string; domain: string }[];
    },
  });
  if (!data || data.length === 0) return null;
  return (
    <nav className="sidebar-nav">
      {data.slice(0, 6).map((n) => (
        <Link key={n.id} to={`/workspaces/${ws}/wiki/${n.id}`} className="nav-item">
          <span className="nav-icon" style={{ fontSize: 13 }}>·</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {n.title}
          </span>
        </Link>
      ))}
    </nav>
  );
}

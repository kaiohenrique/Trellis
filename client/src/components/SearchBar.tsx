import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { autocompleteNodes } from '../api';
import type { AutocompleteResult } from '@kb/shared';
import { DomainBadge } from './DomainBadge';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function SearchBar() {
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
    <div className="search-bar" ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={q}
        placeholder="Search this workspace..."
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {open && results.length > 0 && (
        <div className="autocomplete" style={{ top: '100%', right: 0 }}>
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

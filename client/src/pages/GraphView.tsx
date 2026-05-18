import { useMemo, useState } from 'react';
import { useGraph } from '../hooks/useGraph';
import { GraphCanvas } from '../components/GraphCanvas';
import { useDomains } from '../hooks/useDomains';
import { hashedColor } from '../lib/domain-color';

export function GraphView() {
  const { data, isLoading } = useGraph();
  const { data: domains } = useDomains();
  const [enabledDomains, setEnabledDomains] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of domains ?? []) if (d.color) m.set(d.id, d.color);
    return m;
  }, [domains]);
  const domainColor = (id: string) => colorMap.get(id) ?? hashedColor(id);

  const allDomains = useMemo(() => {
    const set = new Set<string>();
    for (const n of data?.nodes ?? []) set.add(n.domain);
    return Array.from(set).sort();
  }, [data]);

  const isDomainEnabled = (d: string) => enabledDomains.size === 0 || enabledDomains.has(d);

  const visibleNodes = useMemo(() => (data?.nodes ?? []).filter((n) => isDomainEnabled(n.domain)), [data, enabledDomains]);
  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    return (data?.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [data, visibleNodes]);

  const highlight = useMemo(() => {
    if (!search.trim()) return undefined;
    const term = search.toLowerCase();
    return new Set(
      visibleNodes
        .filter((n) => n.title.toLowerCase().includes(term) || n.id.toLowerCase().includes(term))
        .map((n) => n.id),
    );
  }, [search, visibleNodes]);

  const toggleDomain = (d: string) => {
    setEnabledDomains((s) => {
      const next = new Set(s);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  return (
    <div className="container full">
      <h1 className="page-title">Graph</h1>
      <p className="page-subtitle">Force-directed view of every page and edge in this workspace.</p>
      {isLoading && <div className="empty">Loading…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
        <aside>
          <div className="section-title">Search</div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Highlight nodes…"
          />
          <div className="section-title">Domains</div>
          {allDomains.map((d) => (
            <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={enabledDomains.size === 0 || enabledDomains.has(d)}
                onChange={() => toggleDomain(d)}
                style={{ width: 'auto' }}
              />
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: domainColor(d),
                }}
              />
              {d}
            </label>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            {visibleNodes.length} nodes · {visibleEdges.length} edges
          </div>
        </aside>
        <div>
          {data && (
            <GraphCanvas
              nodes={visibleNodes}
              edges={visibleEdges}
              highlight={highlight}
              height={600}
            />
          )}
        </div>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useNodes } from '../hooks/useNodes';
import { useDomains } from '../hooks/useDomains';
import { NodeCard } from '../components/NodeCard';
import { useWorkspaceId } from '../context/WorkspaceContext';
import { domainBadgeColors } from '../lib/domain-color';

export function Home() {
  const ws = useWorkspaceId();
  const { data: nodes } = useNodes();
  const { data: domains } = useDomains();

  const recent = (nodes ?? []).slice(0, 8);

  return (
    <div className="container">
      <h1 className="page-title">AI Agent Knowledge Base</h1>
      <p className="page-subtitle">
        A graph of concepts, architectures, tools, workflows, papers, and people for building agents.
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div className="section-title">Domains</div>
        <Link
          to={`/workspaces/${ws}/manage/domains`}
          style={{ fontSize: 12, color: 'var(--text-muted)', border: 'none' }}
        >
          Manage domains →
        </Link>
      </div>
      <div className="home-grid">
        {(domains ?? []).map((d) => {
          const { fg } = domainBadgeColors(d.color, d.id);
          return (
            <Link
              key={d.id}
              to={`/workspaces/${ws}/domain/${d.id}`}
              className="home-domain-card"
              style={{ borderLeft: `3px solid ${fg}` }}
            >
              <h3>{d.label}</h3>
              <div className="count">
                Read · {d.node_count} {d.node_count === 1 ? 'section' : 'sections'}
              </div>
              {d.description && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {d.description}
                </div>
              )}
            </Link>
          );
        })}
        {(!domains || domains.length === 0) && <div className="empty">No domains yet.</div>}
      </div>

      <div className="section-title">Recently updated</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {recent.map((n) => (
          <NodeCard key={n.id} node={n} />
        ))}
        {recent.length === 0 && <div className="empty">No pages yet — try running <code>npm run seed</code></div>}
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useNodes } from '../hooks/useNodes';
import { NodeCard } from '../components/NodeCard';
import { useWorkspaceId } from '../context/WorkspaceContext';

const DOMAINS = ['concepts', 'architectures', 'tools', 'workflows', 'papers', 'people', 'models'];

export function Home() {
  const ws = useWorkspaceId();
  const { data: nodes } = useNodes();

  const byDomain = new Map<string, number>();
  for (const n of nodes ?? []) byDomain.set(n.domain, (byDomain.get(n.domain) ?? 0) + 1);

  const recent = (nodes ?? []).slice(0, 8);

  return (
    <div className="container">
      <h1 className="page-title">AI Agent Knowledge Base</h1>
      <p className="page-subtitle">
        A graph of concepts, architectures, tools, workflows, papers, and people for building agents.
      </p>

      <div className="section-title">Domains</div>
      <div className="home-grid">
        {DOMAINS.map((d) => (
          <Link key={d} to={`/workspaces/${ws}/manage?domain=${d}`} className="home-domain-card">
            <h3>{d}</h3>
            <div className="count">{byDomain.get(d) ?? 0} pages</div>
          </Link>
        ))}
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

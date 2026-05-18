import { Link } from 'react-router-dom';
import type { Node } from '@kb/shared';
import { DomainBadge } from './DomainBadge';
import { useWorkspaceId } from '../context/WorkspaceContext';

interface Props {
  node: Pick<Node, 'id' | 'title' | 'domain' | 'tags'> & { body?: string };
}

export function NodeCard({ node }: Props) {
  const ws = useWorkspaceId();
  return (
    <Link className="node-card" to={`/workspaces/${ws}/wiki/${node.id}`}>
      <h4>{node.title}</h4>
      <div className="meta">
        <DomainBadge domain={node.domain} />
        {node.tags.slice(0, 3).map((t) => (
          <span key={t} className="tag-pill">{t}</span>
        ))}
      </div>
    </Link>
  );
}

import { Link } from 'react-router-dom';
import { useWorkspaceId } from '../context/WorkspaceContext';

interface Props {
  to: string;
  label: string;
  relation: string;
}

export function EdgePill({ to, label, relation }: Props) {
  const ws = useWorkspaceId();
  return (
    <Link className="edge-pill" to={`/workspaces/${ws}/wiki/${to}`}>
      <span className="relation">{relation}</span>
      <span>{label}</span>
    </Link>
  );
}

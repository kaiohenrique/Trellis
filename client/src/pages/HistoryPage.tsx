import { Link, useParams } from 'react-router-dom';
import { useVersions } from '../hooks/useVersions';
import { VersionList } from '../components/VersionList';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function HistoryPage() {
  const ws = useWorkspaceId();
  const { id } = useParams();
  const { data: versions, isLoading } = useVersions(id);
  if (!id) return null;

  return (
    <div className="container">
      <p style={{ marginBottom: 8 }}>
        <Link to={`/workspaces/${ws}/wiki/${id}`}>← Back to page</Link>
      </p>
      <h1 className="page-title">Version history</h1>
      <p className="page-subtitle">Every save creates a snapshot. Compare any two or restore.</p>
      {isLoading && <div className="empty">Loading…</div>}
      {versions && versions.length === 0 && <div className="empty">No versions yet.</div>}
      {versions && versions.length > 0 && <VersionList nodeId={id} versions={versions} />}
    </div>
  );
}

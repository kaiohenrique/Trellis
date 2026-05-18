import { Link, useParams } from 'react-router-dom';
import { useVersion } from '../hooks/useVersions';
import { DiffViewer } from '../components/DiffViewer';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function DiffPage() {
  const ws = useWorkspaceId();
  const { id, v1, v2 } = useParams();
  const a = Number(v1);
  const b = Number(v2);
  const left = useVersion(id, a);
  const right = useVersion(id, b);

  if (!id) return null;

  if (left.isLoading || right.isLoading) {
    return <div className="container"><div className="empty">Loading…</div></div>;
  }
  if (!left.data || !right.data) {
    return <div className="container">Version not found.</div>;
  }

  return (
    <div className="container wide">
      <p style={{ marginBottom: 8 }}>
        <Link to={`/workspaces/${ws}/wiki/${id}/history`}>← Back to history</Link>
      </p>
      <h1 className="page-title">
        v{left.data.version} ↔ v{right.data.version}
      </h1>
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, color: 'var(--text-muted)', fontSize: 13 }}>
        <div>
          <strong>v{left.data.version}</strong> · {left.data.changed_by} ·{' '}
          {new Date(left.data.created_at).toLocaleString()}
          {left.data.change_summary && <> — {left.data.change_summary}</>}
        </div>
        <div>
          <strong>v{right.data.version}</strong> · {right.data.changed_by} ·{' '}
          {new Date(right.data.created_at).toLocaleString()}
          {right.data.change_summary && <> — {right.data.change_summary}</>}
        </div>
      </div>
      <DiffViewer
        left={left.data.body}
        right={right.data.body}
        leftLabel={`v${left.data.version} (${left.data.changed_by})`}
        rightLabel={`v${right.data.version} (${right.data.changed_by})`}
      />
    </div>
  );
}

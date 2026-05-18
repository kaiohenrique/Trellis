import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getWidget, listWidgets, runWidget } from '../api';
import { WidgetView } from '../components/WidgetView';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function WidgetsList() {
  const ws = useWorkspaceId();
  const { data: widgets } = useQuery({
    queryKey: ['widgets', ws],
    queryFn: () => listWidgets(ws),
  });
  return (
    <div className="container wide">
      <h1 className="page-title">Widgets</h1>
      <p className="page-subtitle">
        Persistent renderable outputs produced by agent scripts. Create them via
        {' '}<code>kb.widget(…)</code> and refresh via the "Re-run" button.
      </p>
      <div className="home-grid">
        {widgets?.map((w) => (
          <Link key={w.id} to={`/workspaces/${ws}/widgets/${w.id}`} className="home-domain-card">
            <h3 style={{ textTransform: 'none' }}>{w.title}</h3>
            <div className="count" style={{ marginBottom: 4 }}>
              <span className="tag-pill">{w.renderer}</span> · by {w.created_by}
            </div>
            {w.description && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{w.description}</div>
            )}
          </Link>
        ))}
        {widgets?.length === 0 && <div className="empty">No widgets yet.</div>}
      </div>
    </div>
  );
}

export function WidgetPage() {
  const ws = useWorkspaceId();
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: widget, isLoading } = useQuery({
    queryKey: ['widget', ws, id],
    queryFn: () => getWidget(ws, id as string),
    enabled: !!id,
  });
  const [runError, setRunError] = useState<string | null>(null);

  const refresh = useMutation({
    mutationFn: () => runWidget(ws, id as string),
    onSuccess: (r) => {
      setRunError(r.run.error ?? null);
      qc.invalidateQueries({ queryKey: ['widget', ws, id] });
      qc.invalidateQueries({ queryKey: ['widgets', ws] });
    },
    onError: (e) => setRunError((e as Error).message),
  });

  if (isLoading) return <div className="container"><div className="empty">Loading…</div></div>;
  if (!widget) return <div className="container">Widget not found.</div>;

  return (
    <div className="container">
      <p><Link to={`/workspaces/${ws}/widgets`}>← All widgets</Link></p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0 }}>{widget.title}</h2>
        <div style={{ flex: 1 }} />
        <button
          className="primary"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || !widget.source_script?.trim()}
          title={widget.source_script ? 'Re-execute the source script' : 'No source script attached'}
        >
          {refresh.isPending ? 'Running…' : 'Re-run script'}
        </button>
      </div>
      <div style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 16, fontSize: 13 }}>
        <span className="tag-pill">{widget.renderer}</span>
        {' · '}by {widget.created_by}
        {' · '}last run {new Date(widget.last_run_at).toLocaleString()}
        {widget.source_url && (
          <>
            {' · '}<a href={widget.source_url} target="_blank" rel="noopener noreferrer">source</a>
          </>
        )}
      </div>
      {widget.description && (
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{widget.description}</p>
      )}
      {runError && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 16, color: 'var(--danger)' }}>
          Run failed: {runError}
        </div>
      )}
      <div className="card">
        <WidgetView widget={widget} />
      </div>
      {widget.source_script && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Source script</summary>
          <pre className="markdown" style={{ marginTop: 8 }}>
            <code>{widget.source_script}</code>
          </pre>
        </details>
      )}
    </div>
  );
}

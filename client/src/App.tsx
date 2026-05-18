import { useEffect } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Home } from './pages/Home';
import { NodePage } from './pages/NodePage';
import { HistoryPage } from './pages/HistoryPage';
import { DiffPage } from './pages/DiffPage';
import { GraphView } from './pages/GraphView';
import { Manage } from './pages/Manage';
import { WidgetPage, WidgetsList } from './pages/Widgets';
import { lastUsedWorkspace, rememberWorkspace, WorkspacePicker } from './pages/WorkspacePicker';
import { Sidebar } from './components/Sidebar';
import { WorkspaceContext } from './context/WorkspaceContext';
import { getWorkspace, listWorkspaces } from './api';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/workspaces" element={<TopShell><WorkspacePicker mode="manage" /></TopShell>} />
      <Route path="/workspaces/:workspaceId/*" element={<WorkspaceShell />}>
        <Route index element={<Home />} />
        <Route path="wiki/:id" element={<NodePage />} />
        <Route path="wiki/:id/history" element={<HistoryPage />} />
        <Route path="wiki/:id/history/:v1/:v2" element={<DiffPage />} />
        <Route path="graph" element={<GraphView />} />
        <Route path="widgets" element={<WidgetsList />} />
        <Route path="widgets/:id" element={<WidgetPage />} />
        <Route path="manage" element={<Manage />} />
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

// Shell for workspace-management screens (no workspace context).
function TopShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar variant="top" />
      <main className="shell-content">{children}</main>
    </div>
  );
}

// Resolves the workspace from the URL, verifies it exists, provides context.
function WorkspaceShell() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const ws = workspaceId ?? '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['workspace', ws],
    queryFn: () => getWorkspace(ws),
    enabled: !!ws,
    retry: false,
  });

  useEffect(() => {
    if (data?.id) rememberWorkspace(data.id);
  }, [data]);

  if (!workspaceId) return <RootRedirect />;
  if (isLoading) {
    return (
      <div className="app">
        <main className="shell-content shell-content--full">
          <div className="container"><div className="empty">Loading workspace…</div></div>
        </main>
      </div>
    );
  }
  if (error) {
    return (
      <div className="app">
        <main className="shell-content shell-content--full">
          <div className="container">
            <div className="card">
              <p>Workspace <code>{workspaceId}</code> not found.</p>
              <button onClick={() => navigate('/workspaces')} className="primary">
                Choose a workspace
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ id: ws }}>
      <div className="app">
        <Sidebar variant="workspace" />
        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}

function RootRedirect() {
  const remembered = lastUsedWorkspace();
  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });

  if (isLoading) {
    return (
      <div className="app">
        <main className="shell-content shell-content--full">
          <div className="container"><div className="empty">Loading…</div></div>
        </main>
      </div>
    );
  }

  if (remembered && workspaces?.some((w) => w.id === remembered)) {
    return <Navigate to={`/workspaces/${remembered}`} replace />;
  }
  if (workspaces && workspaces.length === 1) {
    return <Navigate to={`/workspaces/${workspaces[0].id}`} replace />;
  }
  return <TopShell><WorkspacePicker mode="picker" /></TopShell>;
}

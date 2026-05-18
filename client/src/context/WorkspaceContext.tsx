import { createContext, useContext } from 'react';

// The current workspace is identified by its id. Pages and hooks read from this
// context rather than passing the id through props. Wrapped at the route level
// in App.tsx so every workspace-scoped page sees the right id.
export interface WorkspaceCtx {
  id: string;
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function useWorkspaceId(): string {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaceId must be used inside a WorkspaceContext.Provider');
  return ctx.id;
}

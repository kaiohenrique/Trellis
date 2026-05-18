import { useQuery } from '@tanstack/react-query';
import { listNodes } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function useNodes(filter: { domain?: string; tags?: string[]; q?: string } = {}) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: ['nodes', ws, filter],
    queryFn: () => listNodes(ws, filter),
  });
}

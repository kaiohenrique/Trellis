import { useQuery } from '@tanstack/react-query';
import { getDomainGraph, getGraph } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function useGraph(domain?: string) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: ['graph', ws, domain ?? 'all'],
    queryFn: () => (domain ? getDomainGraph(ws, domain) : getGraph(ws)),
  });
}

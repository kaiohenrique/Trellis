import { useQuery } from '@tanstack/react-query';
import { getNode } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function useNode(id: string | undefined) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: ['node', ws, id],
    queryFn: () => getNode(ws, id as string),
    enabled: !!id,
  });
}

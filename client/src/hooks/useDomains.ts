import { useQuery } from '@tanstack/react-query';
import { listDomains } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function useDomains() {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: ['domains', ws],
    queryFn: () => listDomains(ws),
  });
}

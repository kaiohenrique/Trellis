import { useQuery } from '@tanstack/react-query';
import { getVersion, listVersions } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function useVersions(nodeId: string | undefined) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: ['versions', ws, nodeId],
    queryFn: () => listVersions(ws, nodeId as string),
    enabled: !!nodeId,
  });
}

export function useVersion(nodeId: string | undefined, version: number | undefined) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: ['version', ws, nodeId, version],
    queryFn: () => getVersion(ws, nodeId as string, version as number),
    enabled: !!nodeId && !!version,
  });
}

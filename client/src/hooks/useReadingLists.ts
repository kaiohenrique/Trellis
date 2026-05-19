import { useQuery } from '@tanstack/react-query';
import { getReadingList, listReadingLists } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function useReadingLists() {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: ['reading-lists', ws],
    queryFn: () => listReadingLists(ws),
  });
}

export function useReadingList(id: string | undefined) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: ['reading-list', ws, id],
    queryFn: () => getReadingList(ws, id as string),
    enabled: !!id,
  });
}

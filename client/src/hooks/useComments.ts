import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createComment, deleteComment, listComments, updateComment } from '../api';
import { useWorkspaceId } from '../context/WorkspaceContext';

export function useComments(nodeId: string | undefined) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: ['comments', ws, nodeId],
    queryFn: () => listComments(ws, nodeId as string),
    enabled: !!nodeId,
  });
}

export function useCommentMutations(nodeId: string) {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['comments', ws, nodeId] });
  return {
    create: useMutation({
      mutationFn: (body: { author?: string; body: string; parent_id?: number | null }) =>
        createComment(ws, nodeId, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: string }) => updateComment(ws, id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => deleteComment(ws, id),
      onSuccess: invalidate,
    }),
  };
}

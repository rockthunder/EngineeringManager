import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';

/** Admin data: loaded once, refreshed after every change. */
export function useAdmin<T>(path: string) {
  return useQuery({ queryKey: ['admin', path], queryFn: () => api<T>(`/api/admin/${path}`), staleTime: 5_000 });
}

/**
 * A change to configuration. Everything that depends on it (grids, views) is recomputed on read,
 * so after a success we invalidate every cached query and each screen refetches.
 */
export function useChange<TBody, TResult = unknown>(method: 'POST' | 'PUT', path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api<TResult>(`/api/admin/${path}`, { method, body: JSON.stringify(body) }),
    onSuccess: async () => {
      await qc.invalidateQueries();
    },
  });
}

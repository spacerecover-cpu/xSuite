import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';

/**
 * Batch-resolve profile display names for a set of user ids (created_by /
 * updated_by columns reference auth.users, so PostgREST cannot embed the
 * profile — every surface needs this manual lookup).
 */
export function useProfileNames(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((v): v is string => !!v))].sort();

  const query = useQuery({
    queryKey: ['profiles', 'names', unique.join(',')],
    enabled: unique.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', unique);
      if (error) throw error;
      return new Map<string, string | null>((data ?? []).map((p) => [p.id, p.full_name]));
    },
  });

  const nameOf = (id: string | null | undefined): string | null =>
    id ? query.data?.get(id) ?? null : null;

  return { ...query, nameOf };
}

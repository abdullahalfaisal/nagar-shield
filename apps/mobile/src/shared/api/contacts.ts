import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { EmergencyContact } from '@nagar-shield/shared';
import { supabase } from '@/shared/api/supabase';

/**
 * The user's emergency contacts, ordered by `sort_order`.
 *
 * RLS scopes the read to the signed-in user, so no owner filter is needed
 * in the query — adding one would be belt-and-braces but the server is the
 * authority.
 */
export async function fetchContacts(): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    isPrimary: row.is_primary,
    groupName: row.group_name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }));
}

export function useContacts(): UseQueryResult<EmergencyContact[], Error> {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: fetchContacts,
    // A failed query (no backend configured yet) resolves to an empty list
    // at the screen level rather than crashing the app.
    retry: 1,
  });
}

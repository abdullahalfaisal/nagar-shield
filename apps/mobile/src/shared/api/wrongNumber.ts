import { useMutation } from '@tanstack/react-query';
import { AppError } from '@nagar-shield/shared';
import { supabase } from '@/shared/api/supabase';
import { fromSupabaseError } from '@/shared/api/errors';

/**
 * The wrong-number report write path.
 *
 * The row points at the curated **slug** of the station or hotline — not a
 * uuid — because the curated dataset is refreshed quarterly and a uuid would
 * break the reference on the next refresh.
 */
export type WrongNumberEntryType = 'station' | 'hotline';

export async function reportWrongNumber(input: {
  entryType: WrongNumberEntryType;
  entryId: string;
  reason: string;
}): Promise<void> {
  const reason = input.reason.trim();

  if (reason.length === 0) {
    throw new AppError('VALIDATION_FAILED', { field: 'reason' });
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const reporterId = sessionData.session?.user.id;

  // The column is NOT NULL and the RLS policy scopes the insert to
  // `reporter_id = auth.uid()`, so an anonymous report cannot be filed.
  if (!reporterId) {
    throw new AppError('AUTH_REQUIRED');
  }

  const { error } = await supabase.from('wrong_number_reports').insert({
    reporter_id: reporterId,
    entry_type: input.entryType,
    entry_id: input.entryId,
    reason,
  });

  if (error) throw fromSupabaseError(error);
}

export function useReportWrongNumber() {
  return useMutation({
    mutationFn: reportWrongNumber,
  });
}

import { useMutation } from '@tanstack/react-query'
import { AppError, wrongNumberReportSchema } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'

/**
 * The wrong-number report write path.
 *
 * The row points at the curated **slug** of the station or hotline — not a
 * uuid — because the curated dataset is refreshed quarterly and a uuid would
 * break the reference on the next refresh.
 *
 * **The reporter is optional.** FR-SEEK-6 says *any user* may report a wrong
 * number, and the report sheet is reachable from the More Help sheet, so a
 * signed-out visitor must still be able to file one. The row is written with
 * `reporter_id = null` in that case and the curator triages it without an
 * identity. The database enforces this too — migration 031 makes the column
 * nullable and the insert policy accepts a null reporter.
 */
export type WrongNumberEntryType = 'station' | 'hotline'

export async function reportWrongNumber(input: {
  entryType: WrongNumberEntryType
  entryId: string
  reason: string
  /** The citizen's free text. Optional — stored as `null` when absent. */
  details?: string
}): Promise<void> {
  const parsed = wrongNumberReportSchema.safeParse(input)

  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', { field: 'reason' })
  }

  const { data: sessionData } = await supabase.auth.getSession()
  // The column is nullable — a signed-out reporter files the row with no
  // identity attached. The RLS policy accepts either the caller's own id or
  // a null reporter, and never a reporter id belonging to somebody else.
  const reporterId = sessionData.session?.user.id ?? null

  const { error } = await supabase.from('wrong_number_reports').insert({
    reporter_id: reporterId,
    entry_type: parsed.data.entryType,
    entry_id: parsed.data.entryId,
    // The reason and the free text are **two** fields, not one string. The
    // curator's read path needs to tell a fixed enum value from a citizen's
    // own words; concatenating them here would make the two inseparable.
    reason: parsed.data.reason,
    details: parsed.data.details ?? null,
  })

  if (error) throw fromSupabaseError(error)
}

export function useReportWrongNumber() {
  return useMutation({
    mutationFn: reportWrongNumber,
  })
}

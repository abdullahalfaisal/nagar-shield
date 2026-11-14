import { AppError } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'

/**
 * The `location_shares` write path.
 *
 * A **single-table CRUD with owner RLS**. There is no Edge Function and no
 * service-role key on this path: the row is written with the user's own JWT,
 * and the INSERT policy's `WITH CHECK (sender_id = auth.uid())` is what
 * authorises it. The client sends the signed-in user's id as `sender_id` —
 * the column has **no** database default, so the client must supply it — and
 * the `WITH CHECK` is what refuses a forged one.
 *
 * What a row records
 * ------------------
 * The row is an **audit of what the sender did**, not a receipt:
 *
 *   * `sender_id` — who sent it (the signed-in user);
 *   * `recipient_contact_id` — which of the sender's own contacts it went
 *     to, or `null` for an OS share-sheet recipient, who may not have an
 *     account at all;
 *   * `lat` / `lng` — the position, or **both null** for a
 *     "share without location" row. A zeroed position would read as a real
 *     point in the Gulf of Guinea, so the pair is all-or-nothing;
 *   * `accuracy_m` — the fix accuracy, or `null` for a manual coordinate
 *     entry and for a degraded fix. A fabricated accuracy is worse than none;
 *   * `mode` — always `'snapshot'`. The column is the Phase-2 streaming
 *     hook; the database's one-value CHECK enforces it;
 *   * `share_channel` — **which channel was used**, never a delivery
 *     status. `os_share_sheet` means "the sheet was fired", nothing more
 *     (ADR-005).
 */

/** The channel a snapshot went out over. */
export type LocationShareChannel = 'app' | 'os_share_sheet'

/**
 * The position of a snapshot.
 *
 * `null` lat **and** lng means the snapshot carried no location — the
 * "share without location" path. The two are never one-and-not-the-other:
 * the database refuses a half-written pair.
 */
export interface SharePosition {
  lat: number | null
  lng: number | null
  /** The fix accuracy in metres, or `null` when there is no honest accuracy. */
  accuracyM: number | null
}

/** A row that has been written. */
export interface LocationShareRow {
  id: string
  recipientContactId: string | null
  lat: number | null
  lng: number | null
  accuracyM: number | null
  mode: 'snapshot'
  shareChannel: LocationShareChannel
  sharedAt: string
}

function toRow(row: Record<string, unknown>): LocationShareRow {
  return {
    id: row.id as string,
    recipientContactId: (row.recipient_contact_id as string | null) ?? null,
    lat: (row.lat as number | null) ?? null,
    lng: (row.lng as number | null) ?? null,
    accuracyM: (row.accuracy_m as number | null) ?? null,
    mode: 'snapshot',
    shareChannel: row.share_channel as LocationShareChannel,
    sharedAt: row.shared_at as string,
  }
}

/**
 * Writes one `location_shares` row.
 *
 * The row is written **per recipient**: an app-user recipient gets a row
 * with `share_channel = 'app'` and their contact id; an OS share-sheet
 * recipient gets a row with `share_channel = 'os_share_sheet'` and **no**
 * contact id, because the sheet may have gone to an app the user picked
 * that has nothing to do with the contact list.
 *
 * The position may be **null on both axes** — that is the "share without
 * location" row. A coordinate of `0` is a real coordinate and is written as
 * `0`, never as `null`.
 */
export async function writeLocationShare(input: {
  /** The recipient's contact id, or `null` for an OS share-sheet recipient. */
  recipientContactId: string | null
  /** The position, or a null position for a share without a location. */
  position: SharePosition
  /** Which channel was used. */
  channel: LocationShareChannel
}): Promise<LocationShareRow> {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id

  // The INSERT policy's `WITH CHECK` scopes the row to `auth.uid()`, and
  // `sender_id` is NOT NULL, so an anonymous write cannot land. The check
  // here turns that into a typed error rather than a raw database one.
  if (!userId) {
    throw new AppError('AUTH_REQUIRED')
  }

  // A half-written pair is refused by the database's CHECK, but the client
  // refuses it first — with a clear error rather than a constraint name.
  const hasLat = input.position.lat !== null
  const hasLng = input.position.lng !== null

  if (hasLat !== hasLng) {
    throw new AppError('VALIDATION_FAILED', { field: 'lat' })
  }

  const { data, error } = await supabase
    .from('location_shares')
    .insert({
      // The sender is the signed-in user. The column has no database
      // default, so it is sent — and the INSERT policy's
      // `WITH CHECK (sender_id = auth.uid())` refuses a forged one, so
      // sending it is safe.
      sender_id: userId,
      recipient_contact_id: input.recipientContactId,
      lat: input.position.lat,
      lng: input.position.lng,
      accuracy_m: input.position.accuracyM,
      mode: 'snapshot',
      share_channel: input.channel,
    })
    .select('*')
    .single()

  if (error) throw fromSupabaseError(error)

  return toRow(data as Record<string, unknown>)
}

/**
 * Writes one row per app-user recipient.
 *
 * The rows are written **independently**: one recipient's write failing
 * does not stop the others. A partial fan-out is reported honestly — the
 * caller learns which recipients were recorded and which were not — and no
 * receipt is ever fabricated for anyone.
 *
 * The returned failures carry the recipient's **contact id**, never a phone
 * number. A phone number is PII and does not belong in an error the user
 * might read aloud.
 */
export async function writeLocationSharesForAppRecipients(input: {
  /** The recipient contact ids, one row each. */
  recipientContactIds: string[]
  /** The position, shared by every recipient. */
  position: SharePosition
}): Promise<{ written: LocationShareRow[]; failed: { contactId: string; error: AppError }[] }> {
  const written: LocationShareRow[] = []
  const failed: { contactId: string; error: AppError }[] = []

  for (const contactId of input.recipientContactIds) {
    try {
      const row = await writeLocationShare({
        recipientContactId: contactId,
        position: input.position,
        channel: 'app',
      })
      written.push(row)
    } catch (error) {
      failed.push({
        contactId,
        error: error instanceof AppError ? error : new AppError('INTERNAL'),
      })
    }
  }

  return { written, failed }
}

/**
 * Resolves which of the caller's own contacts are Nagar Shield users.
 *
 * The lookup is a **boolean per contact**, not a profile read: the database
 * returns the matching **contact ids** and nothing else — no phone, no name,
 * no email, no user id. `public.profiles` stays owner-scoped; nothing is
 * loosened to make this work.
 *
 * **A failure is not a failure to route.** The edge-case table says a failed
 * lookup falls back to the OS share sheet — the safe direction, because the
 * OS path claims nothing and works with no network. So this function
 * returns an empty set on error rather than throwing: an empty set means
 * "no confirmed app users", and every recipient goes down the OS path.
 */
export async function resolveAppUserContactIds(contactIds: string[]): Promise<string[]> {
  if (contactIds.length === 0) return []

  try {
    const { data, error } = await supabase.rpc('resolve_app_contacts', {
      p_contact_ids: contactIds,
    })

    if (error) return []

    return (data ?? []) as string[]
  } catch {
    return []
  }
}

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { AppError, emergencyContactSchema, type EmergencyContact } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import type { Database } from '@/shared/api/database.types'
import { fromSupabaseError } from '@/shared/api/errors'

/**
 * The user's emergency contacts — the whole CRUD surface.
 *
 * Owner-scoped through RLS
 * ------------------------
 * `public.contacts` carries four owner-scoped policies: SELECT, INSERT,
 * UPDATE and DELETE, each scoped to `user_id = auth.uid()`, and the two
 * write policies additionally call `assert_account_not_disabled()` so a
 * disabled account cannot change its list.
 *
 * There is **no** service-role path here and no RPC. RLS is the
 * authorisation mechanism, so the client never sends a `user_id` it trusts:
 * the INSERT's `WITH CHECK` refuses a forged one, and the UPDATE's `USING`
 * clause refuses to touch a row that is not the caller's.
 *
 * The stable order
 * ----------------
 * Every read is ordered `is_primary DESC, sort_order ASC, created_at ASC`.
 * That ordering is a **contract**, not a convenience: unit 003's Personal
 * Emergency picker relies on `is_primary` and `sort_order` meaning the same
 * thing here as they do there, so the order must be identical on every
 * surface that lists contacts.
 *
 * `sort_order` is densified on insert (max + 1) and re-densified after a
 * delete, so a removed row never leaves a gap that reshuffles the list.
 */

/** The query key. Invalidated after every write. */
export const CONTACTS_QUERY_KEY = ['contacts'] as const

function toContact(row: Record<string, unknown>): EmergencyContact {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    phone: row.phone as string,
    isPrimary: row.is_primary as boolean,
    groupName: row.group_name as EmergencyContact['groupName'],
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
  }
}

/**
 * Reads the signed-in user's contacts.
 *
 * No owner filter is applied: RLS scopes the read to the caller, so an
 * explicit filter would be belt-and-braces the server already provides.
 */
export async function fetchContacts(): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw fromSupabaseError(error)

  return (data ?? []).map((row) => toContact(row as Record<string, unknown>))
}

export function useContacts(): UseQueryResult<EmergencyContact[], Error> {
  return useQuery({
    queryKey: CONTACTS_QUERY_KEY,
    queryFn: fetchContacts,
    // A failed query (no backend configured yet) resolves to an empty list
    // at the screen level rather than crashing the app.
    retry: 1,
  })
}

/**
 * The next `sort_order` for a new row.
 *
 * `max + 1` rather than `count`: a list with a gap in it still appends at the
 * end, and the delete path re-densifies afterwards anyway.
 */
async function nextSortOrder(): Promise<number> {
  const { data, error } = await supabase
    .from('contacts')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)

  if (error) throw fromSupabaseError(error)

  const highest = (data ?? [])[0] as { sort_order?: number } | undefined
  return (highest?.sort_order ?? -1) + 1
}

/**
 * Which form fields fail the shared contact schema.
 *
 * The editor shows a message under **each** failing field, so it needs every
 * failure, not just the first one the schema reports.
 */
export function failingContactFields(input: { name: string; phone: string }): {
  name: boolean
  phone: boolean
} {
  const parsed = emergencyContactSchema.safeParse({
    name: input.name,
    phone: input.phone,
    isPrimary: false,
    groupName: 'other',
    sortOrder: 0,
  })
  const paths = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path[0])

  return { name: paths.includes('name'), phone: paths.includes('phone') }
}

/**
 * Creates a contact.
 *
 * The input is validated with the **shared** schema, so the phone is
 * normalised to E.164 on the way in and the same rule applies here, in the
 * onboarding wizard and in the Contacts screen. The database's CHECK is the
 * second line of defence, not the first.
 *
 * There is **no cap** on how many contacts a user may have (A-4). The
 * prototype's "5 saved" copy is static prototype content and is never
 * rendered as a live count.
 */
export async function createContact(
  input: Partial<EmergencyContact> & { name: string; phone: string },
): Promise<EmergencyContact> {
  const parsed = emergencyContactSchema.safeParse({
    name: input.name,
    phone: input.phone,
    isPrimary: input.isPrimary ?? false,
    groupName: input.groupName ?? 'other',
    sortOrder: input.sortOrder ?? 0,
  })

  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', { field: 'phone' })
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id

  // `contacts.user_id` is NOT NULL, and the INSERT policy's `WITH CHECK`
  // scopes it to `auth.uid()`. The column carries a database default of
  // `auth.uid()` — so the owner is set **by the database**, and the client
  // does not name it. The check here is only that there is a session at all:
  // an anonymous insert would fail on the NOT NULL constraint, and a typed
  // error is a better answer than a raw database one.
  if (!userId) {
    throw new AppError('AUTH_REQUIRED')
  }

  const sortOrder = await nextSortOrder()

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      name: parsed.data.name,
      phone: parsed.data.phone,
      is_primary: parsed.data.isPrimary,
      group_name: parsed.data.groupName,
      sort_order: sortOrder,
    })
    .select('*')
    .single()

  if (error) throw fromSupabaseError(error)

  return toContact(data as Record<string, unknown>)
}

/**
 * Updates a contact.
 *
 * Only the fields the owner owns are sent. `user_id` is **not** among them:
 * the row's owner is fixed at creation, and an UPDATE that carried a
 * different `user_id` would be refused by the policy's `WITH CHECK` anyway.
 */
export async function updateContact(
  id: string,
  changes: Partial<Pick<EmergencyContact, 'name' | 'phone' | 'isPrimary' | 'groupName'>>,
): Promise<EmergencyContact> {
  const patch: Database['public']['Tables']['contacts']['Update'] = {}

  if (changes.name !== undefined || changes.phone !== undefined) {
    const current = await fetchContact(id)

    // The row may have been deleted between the read and the write. The
    // UPDATE's `USING` clause would refuse it anyway; this makes the refusal
    // explicit instead of silently patching a null.
    if (!current) {
      throw new AppError('NOT_FOUND')
    }

    const parsed = emergencyContactSchema.safeParse({
      name: changes.name ?? current.name,
      phone: changes.phone ?? current.phone,
      isPrimary: changes.isPrimary ?? current.isPrimary,
      groupName: changes.groupName ?? current.groupName,
      sortOrder: current.sortOrder,
    })

    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', { field: 'phone' })
    }

    patch.name = parsed.data.name
    patch.phone = parsed.data.phone
  }

  if (changes.isPrimary !== undefined) patch.is_primary = changes.isPrimary
  if (changes.groupName !== undefined) patch.group_name = changes.groupName

  const { data, error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw fromSupabaseError(error)

  return toContact(data as Record<string, unknown>)
}

/** Reads one contact. Returns `null` when it is not the caller's. */
export async function fetchContact(id: string): Promise<EmergencyContact | null> {
  const { data, error } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle()

  if (error) throw fromSupabaseError(error)
  if (!data) return null

  return toContact(data as Record<string, unknown>)
}

/**
 * Reads one contact for the editor.
 *
 * The editor needs the row it is about to change before it can show it — an
 * edit form that opened blank would overwrite the contact with whatever the
 * user happened to type. The query is keyed on the id, so two editors open
 * side by side do not share a cache entry.
 */
export function useContact(id: string | undefined): UseQueryResult<EmergencyContact | null, Error> {
  return useQuery({
    queryKey: [...CONTACTS_QUERY_KEY, id],
    queryFn: () => (id ? fetchContact(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  })
}

/**
 * Deletes a contact.
 *
 * The delete is allowed even when the row was the only primary: the list is
 * left valid with zero primaries, and the screen offers to designate one.
 * The app never blocks a delete because of the primary flag, and it never
 * auto-promotes a contact on the user's behalf.
 */
export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id)

  if (error) throw fromSupabaseError(error)

  // The row is already gone, so a failure to tidy the numbering must not turn a
  // successful delete into an error: the gap is harmless and the next delete
  // closes it. (Callers refresh the list in a `finally`, so it reflects the
  // delete either way.)
  try {
    await densifySortOrder()
  } catch {
    // Non-fatal, see above.
  }
}

/**
 * Re-densifies `sort_order` so the list has no gaps.
 *
 * The rows are renumbered `0, 1, 2, …` in their current order. A deleted
 * row in the middle would otherwise leave a gap, and the next insert would
 * land after it — the list would look right, but the numbers would not.
 */
export async function densifySortOrder(): Promise<void> {
  const contacts = await fetchContacts()

  for (const [index, contact] of contacts.entries()) {
    if (contact.sortOrder === index) continue

    const { error } = await supabase
      .from('contacts')
      .update({ sort_order: index })
      .eq('id', contact.id)

    if (error) throw fromSupabaseError(error)
  }
}

/**
 * Moves a contact to a new position in the list.
 *
 * The reorder is expressed as a **list**, not as an index: the caller hands
 * over the ids in their new order, and every row's `sort_order` is rewritten
 * to match. A partial update would leave two rows claiming the same slot.
 */
export async function reorderContacts(orderedIds: string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await supabase.from('contacts').update({ sort_order: index }).eq('id', id)

    if (error) throw fromSupabaseError(error)
  }
}

/**
 * Makes a contact the primary one.
 *
 * Exactly one primary is kept per action. The new primary is set **first**
 * and the others are cleared afterwards, in a single statement: a failure
 * between the two leaves two primaries (the picker dials the first in list
 * order), never none, which is the state an emergency cannot afford. The old
 * order — clear each other primary, then set this one — left zero primaries
 * if the last write failed, and needed a read plus one write per primary.
 *
 * The promotion is deliberately a **separate** operation from the ordinary
 * update. A caller that writes `is_primary: true` through `updateContact`
 * and then calls this would open a window in which two primaries exist.
 */
export async function makePrimary(id: string): Promise<void> {
  const promote = await supabase.from('contacts').update({ is_primary: true }).eq('id', id)

  if (promote.error) throw fromSupabaseError(promote.error)

  const clear = await supabase
    .from('contacts')
    .update({ is_primary: false })
    .neq('id', id)
    .eq('is_primary', true)

  if (clear.error) throw fromSupabaseError(clear.error)
}

/**
 * Clears a contact's primary flag.
 *
 * This is the **demotion**, and it is the mirror of `makePrimary`: it clears
 * this row's own flag and touches nothing else. The list is then left with
 * no primary at all — the app never auto-promotes someone else on the user's
 * behalf without an explicit choice.
 *
 * Clearing an already-non-primary row is a no-op, not an error: the caller
 * cannot always know whether the row was primary a moment ago.
 */
export async function clearPrimary(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').update({ is_primary: false }).eq('id', id)

  if (error) throw fromSupabaseError(error)
}

/**
 * Invalidates the contacts cache.
 *
 * Every write path calls this, so the list on screen always reflects the
 * database — the client is never the authority on what is stored.
 */
export function useInvalidateContacts(): () => Promise<void> {
  const queryClient = useQueryClient()

  return async () => {
    await queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEY })
  }
}

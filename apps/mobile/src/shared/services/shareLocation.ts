import type { EmergencyContact } from '@nagar-shield/shared'
import { writeLocationShare, type SharePosition } from '@/shared/api/locationShares'
import { fireOsShare, type OsShareOutcome } from '@/shared/services/osShare'
import { fireSmsShare } from '@/shared/services/smsShare'
import {
  buildPayloadWithoutLocation,
  buildSnapshotPayload,
  type SnapshotPayload,
  type SnapshotLabels,
} from '@/shared/services/snapshotPayload'
import { recordShareIntent } from '@/shared/services/shareTelemetry'

/**
 * The Location Sharing fan-out.
 *
 * One confirm tap, N recipients, **one** snapshot, **one** message.
 *
 * The rules this implements
 * -----------------------
 *
 * **Nothing is sent by the app.** The phone's message composer opens with every
 * recipient and the snapshot already in it, and the user taps Send. The user can
 * instead choose the OS share sheet (WhatsApp, Messenger, …), which also opens
 * once, and it is the fallback where the device has no message app. Either way
 * the app hands the text over and stops: it cannot send an SMS silently, and
 * there is no push channel to a recipient's app yet, so an in-app row would
 * reach nobody and is not written as a "share".
 *
 * **One fix for the whole fan-out.** The position is captured **once**
 * before the fan-out and the same payload goes to every recipient.
 *
 * **Deselection wins.** The per-contact checkboxes are authoritative at
 * confirm time: a contact the user unchecked is not in the message.
 *
 * **No duplicates.** The recipient list is de-duplicated by contact id, so a
 * contact that is both checked manually and reached by the toggle is in the
 * message once.
 *
 * **Nothing is claimed.** The summary says **shared** / **sent** and never
 * delivered, read, or seen, because the app cannot know any of those
 * (ADR-005). A closed composer is reported as not sent.
 */

/** One recipient's outcome. */
export type RecipientOutcome =
  /** The composer or sheet was presented. Whether it was sent is not the app's to know. */
  | { contactId: string; channel: 'os_share_sheet'; status: 'shared' }
  /** The user closed it without sending. Nothing was sent. */
  | { contactId: string; channel: 'os_share_sheet'; status: 'dismissed' }
  /** The OS could not present it. Nothing was sent. */
  | { contactId: string; channel: 'os_share_sheet'; status: 'failed' }

/** The fan-out's result. */
export interface ShareResult {
  /** One entry per recipient, in the order they were processed. */
  outcomes: RecipientOutcome[]
  /** How many recipients were handed a snapshot. */
  shared: { os_share_sheet: number }
  /** How many could not be, because the OS could not present anything. */
  failed: { os_share_sheet: number }
  /**
   * What happened to the share as a whole. It is here because a share through
   * other apps can have no recipient of ours (the user picks the person inside
   * the app), so the counts above cannot tell a closed sheet from a sent one.
   * `nothing` — there was nobody to send to and nothing was opened.
   */
  status: 'shared' | 'dismissed' | 'failed' | 'nothing'
  /** The elapsed milliseconds from the confirm tap to the intent firing. */
  elapsedMs: number
}

/** The input to the fan-out. */
export interface ShareLocationInput {
  /** The recipients, already filtered to the user's explicit selection. */
  recipients: EmergencyContact[]
  /**
   * The position, or `null` for a "share without location" share.
   *
   * A `null` position is the degraded path: the snapshot carries the
   * timestamp and a note that the location is unavailable, and the audit
   * row writes a **null** position rather than a zeroed one.
   */
  position: SharePosition | null
  /** The note that says the location is unavailable. */
  withoutLocationNote: string
  /** The epoch millisecond of the user's confirm tap. */
  startedAt: number
  /** The active locale, for the human-readable timestamp. */
  locale?: string
  /** The words of the message the contact receives, in the app's language. */
  labels?: SnapshotLabels
  /**
   * How the text leaves the app. `message` (the default) opens the phone's message
   * composer with every recipient filled in; `apps` opens the OS share sheet, so
   * the user can pick WhatsApp, Messenger or any other app and the person
   * inside it.
   */
  via?: 'message' | 'apps'
}

/**
 * The recipients the "share with all" toggle selects.
 *
 * **Primaries only** — never "every contact". The prototype's sub-line said
 * "all your emergency contacts", which would be a lie; the build says
 * primary contacts.
 *
 * The list is in `sort_order`, and a contact that the user has explicitly
 * **unchecked** is removed even though it is a primary: deselection wins.
 */
export function selectPrimaryRecipients(
  contacts: EmergencyContact[],
  deselectedIds: string[] = [],
): EmergencyContact[] {
  const deselected = new Set(deselectedIds)

  return contacts
    .filter((contact) => contact.isPrimary && !deselected.has(contact.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * The recipients of an explicit per-contact selection.
 *
 * The checkboxes are authoritative: the contact's own order is kept, and a
 * contact that is not checked receives nothing.
 */
export function selectExplicitRecipients(
  contacts: EmergencyContact[],
  selectedIds: string[],
): EmergencyContact[] {
  const selected = new Set(selectedIds)

  return contacts.filter((contact) => selected.has(contact.id))
}

/**
 * Runs the fan-out.
 *
 * The share is **never blocked** by anything: a failed lookup, a failed
 * write, a dismissed sheet — every one of them produces a reported outcome
 * rather than an exception that stops the share.
 */
export async function shareLocation(input: ShareLocationInput): Promise<ShareResult> {
  // De-duplicate by contact id.
  const seen = new Set<string>()
  const recipients = input.recipients.filter((contact) => {
    if (seen.has(contact.id)) return false
    seen.add(contact.id)
    return true
  })

  // The share sheet needs no recipient of ours: the user picks the app and the
  // person inside it. The message composer does need numbers.
  if (recipients.length === 0 && input.via !== 'apps') {
    // Nothing to share with. Nothing is opened or written, but the caller still
    // gets a result, and the clock is closed honestly.
    const elapsedMs = Math.max(0, Math.round(Date.now() - input.startedAt))
    return {
      outcomes: [],
      shared: { os_share_sheet: 0 },
      failed: { os_share_sheet: 0 },
      status: 'nothing',
      elapsedMs,
    }
  }

  // The payload is built **once** for the whole fan-out.
  const payload: SnapshotPayload = input.position
    ? buildSnapshotPayload({
        lat: input.position.lat as number,
        lng: input.position.lng as number,
        accuracyM: input.position.accuracyM,
        capturedAt: new Date().toISOString(),
        locale: input.locale,
        labels: input.labels,
      })
    : buildPayloadWithoutLocation({
        capturedAt: new Date().toISOString(),
        locale: input.locale,
        labels: input.labels,
        note: input.withoutLocationNote,
      })

  // One message to everybody. The share sheet opens instead when the user chose
  // "other apps", or when the device has no message app.
  let handoff: OsShareOutcome =
    input.via === 'apps'
      ? { status: 'unavailable' }
      : await fireSmsShare(
          recipients.map((contact) => contact.phone),
          payload.message,
        )
  if (handoff.status === 'unavailable') {
    handoff = await fireOsShare(payload.message)
  }

  const status = handoff.status === 'unavailable' ? 'failed' : handoff.status
  const outcomes: RecipientOutcome[] = recipients.map((contact) => ({
    contactId: contact.id,
    channel: 'os_share_sheet',
    status,
  }))

  // The audit position: a null position for a share without a location.
  const auditPosition: SharePosition = input.position ?? { lat: null, lng: null, accuracyM: null }

  // A record is kept only for a message that was actually opened for sending, one
  // per recipient. It is best-effort: a failed record must not turn a handed-over
  // snapshot into a "not sent".
  if (status === 'shared') {
    for (const contact of recipients) {
      try {
        await writeLocationShare({
          recipientContactId: contact.id,
          position: auditPosition,
          channel: 'os_share_sheet',
        })
      } catch {
        // Best-effort, see above.
      }
    }
  }

  // The SLA clock closes when the hand-over happened. The metric measures
  // **our** work only — never carrier delivery, never recipient open time.
  const finishedAt = Date.now()
  const elapsedMs = Math.max(0, Math.round(finishedAt - input.startedAt))

  await recordShareIntent({
    startedAt: input.startedAt,
    finishedAt,
    channel: 'os_share_sheet',
    recipientCount: outcomes.length,
  })

  return {
    outcomes,
    shared: { os_share_sheet: countStatus(outcomes, 'shared') },
    failed: { os_share_sheet: countStatus(outcomes, 'failed') },
    status,
    elapsedMs,
  }
}

/** Counts the outcomes with a given status. */
function countStatus(outcomes: RecipientOutcome[], status: 'shared' | 'failed'): number {
  return outcomes.filter((outcome) => outcome.status === status).length
}

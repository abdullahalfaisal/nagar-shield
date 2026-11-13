import type { EmergencyContact } from '@nagar-shield/shared';
import {
  resolveAppUserContactIds,
  writeLocationShare,
  type SharePosition,
} from '@/shared/api/locationShares';
import { fireOsShare } from '@/shared/services/osShare';
import {
  buildPayloadWithoutLocation,
  buildSnapshotPayload,
  type ShareChannel,
  type SnapshotPayload,
} from '@/shared/services/snapshotPayload';
import { recordShareIntent } from '@/shared/services/shareTelemetry';

/**
 * The Location Sharing fan-out.
 *
 * One confirm tap, N recipients, **one** snapshot.
 *
 * The rules this implements
 * -----------------------
 *
 * **One fix for the whole fan-out.** The position is captured **once**
 * before the fan-out and the same payload is handed to every recipient.
 * Re-taking the fix per recipient would inflate the SLA and could produce
 * inconsistent coordinates inside a single share.
 *
 * **Routing is per recipient, not per batch.** Each recipient is classified
 * independently: an app user gets a `location_shares` row with
 * `share_channel = 'app'`; everyone else gets the OS share sheet, fired
 * **once**. A recipient who is both a primary and an app user gets exactly
 * one row and no OS share.
 *
 * **Deselection wins.** The per-contact checkboxes are authoritative at
 * confirm time. The fan-out is a **default selector**, not an override of
 * the user's explicit choice: a contact the user unchecked receives
 * nothing — no audit row, no OS share.
 *
 * **No duplicates.** The recipient list is de-duplicated by contact id
 * before anything is sent, so a contact that is both checked manually and
 * reached by the toggle still receives exactly one snapshot.
 *
 * **Nothing is claimed.** The summary says **shared** / **sent** and
 * reports the per-channel counts. It never says delivered, read, or seen,
 * because the app cannot know any of those (ADR-005).
 */

/** One recipient's outcome. */
export type RecipientOutcome =
  /** The snapshot was handed to the in-app path and the row was written. */
  | { contactId: string; channel: 'app'; status: 'shared' }
  /** The sheet was presented. Whether it was sent is not the app's to know. */
  | { contactId: string; channel: 'os_share_sheet'; status: 'shared' }
  /** The user dismissed the sheet. Nothing was sent. */
  | { contactId: string; channel: 'os_share_sheet'; status: 'dismissed' }
  /** The OS could not present the sheet. Nothing was sent. */
  | { contactId: string; channel: 'os_share_sheet'; status: 'failed' }
  /** The in-app row could not be saved. The snapshot was not recorded. */
  | { contactId: string; channel: 'app'; status: 'failed' };

/** The fan-out's result. */
export interface ShareResult {
  /** One entry per recipient, in the order they were processed. */
  outcomes: RecipientOutcome[];
  /** How many recipients received a snapshot, by channel. */
  shared: { app: number; os_share_sheet: number };
  /** How many recipients did not, by channel. */
  failed: { app: number; os_share_sheet: number };
  /** The elapsed milliseconds from the confirm tap to the intent firing. */
  elapsedMs: number;
}

/** The input to the fan-out. */
export interface ShareLocationInput {
  /** The recipients, already filtered to the user's explicit selection. */
  recipients: EmergencyContact[];
  /**
   * The position, or `null` for a "share without location" share.
   *
   * A `null` position is the degraded path: the snapshot carries the
   * timestamp and a note that the location is unavailable, and the audit
   * row writes a **null** position rather than a zeroed one.
   */
  position: SharePosition | null;
  /** The note that says the location is unavailable. */
  withoutLocationNote: string;
  /** The epoch millisecond of the user's confirm tap. */
  startedAt: number;
  /** The active locale, for the human-readable timestamp. */
  locale?: string;
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
  const deselected = new Set(deselectedIds);

  return contacts
    .filter((contact) => contact.isPrimary && !deselected.has(contact.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
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
  const selected = new Set(selectedIds);

  return contacts.filter((contact) => selected.has(contact.id));
}

/**
 * Runs the fan-out.
 *
 * The share is **never blocked** by anything: a failed lookup, a failed
 * write, a dismissed sheet — every one of them produces a reported outcome
 * rather than an exception that stops the share.
 */
export async function shareLocation(input: ShareLocationInput): Promise<ShareResult> {
  // De-duplicate by contact id. A contact that is both checked manually and
  // reached by the toggle must receive exactly one snapshot.
  const seen = new Set<string>();
  const recipients = input.recipients.filter((contact) => {
    if (seen.has(contact.id)) return false;
    seen.add(contact.id);
    return true;
  });

  const outcomes: RecipientOutcome[] = [];

  if (recipients.length === 0) {
    // Nothing to share with. No row is written and no sheet is fired, but
    // the caller still gets a result — the screen says there is nobody to
    // share with, and the clock is closed honestly.
    const elapsedMs = Math.max(0, Math.round(Date.now() - input.startedAt));
    return {
      outcomes,
      shared: { app: 0, os_share_sheet: 0 },
      failed: { app: 0, os_share_sheet: 0 },
      elapsedMs,
    };
  }

  // The payload is built **once** for the whole fan-out.
  const payload: SnapshotPayload = input.position
    ? buildSnapshotPayload({
        lat: input.position.lat as number,
        lng: input.position.lng as number,
        accuracyM: input.position.accuracyM,
        capturedAt: new Date().toISOString(),
        locale: input.locale,
      })
    : buildPayloadWithoutLocation({
        capturedAt: new Date().toISOString(),
        locale: input.locale,
        note: input.withoutLocationNote,
      });

  // The audit position: a null position for a share without a location.
  const auditPosition: SharePosition = input.position ?? { lat: null, lng: null, accuracyM: null };

  // Which recipients are app users. A failed lookup answers "none
  // confirmed", and every recipient then goes down the OS path — the
  // direction that claims nothing and needs no network.
  const appContactIds = new Set(
    await resolveAppUserContactIds(recipients.map((contact) => contact.id)),
  );

  for (const contact of recipients) {
    const isAppUser = appContactIds.has(contact.id);

    if (isAppUser) {
      try {
        await writeLocationShare({
          recipientContactId: contact.id,
          position: auditPosition,
          channel: 'app',
        });
        outcomes.push({ contactId: contact.id, channel: 'app', status: 'shared' });
      } catch {
        // The in-app record could not be saved. The snapshot was **not**
        // recorded — and no receipt is fabricated for this recipient.
        outcomes.push({ contactId: contact.id, channel: 'app', status: 'failed' });
      }
      continue;
    }

    // The OS share path. The sheet is fired **once** per non-app recipient.
    const outcome = await fireOsShare(payload.message);

    if (outcome.status === 'dismissed') {
      outcomes.push({ contactId: contact.id, channel: 'os_share_sheet', status: 'dismissed' });
    } else if (outcome.status === 'unavailable') {
      outcomes.push({ contactId: contact.id, channel: 'os_share_sheet', status: 'failed' });
    } else {
      outcomes.push({ contactId: contact.id, channel: 'os_share_sheet', status: 'shared' });
    }

    // The audit row for an OS share-sheet recipient carries **no** contact
    // id: the sheet may have gone to an app the user picked that has
    // nothing to do with the contact list.
    try {
      await writeLocationShare({
        recipientContactId: null,
        position: auditPosition,
        channel: 'os_share_sheet',
      });
    } catch {
      // The audit row is best-effort. The share itself already happened, and
      // a failed record must not turn a sent snapshot into a "not sent".
    }
  }

  // The SLA clock closes when the last intent fired. The metric measures
  // **our** work only — never carrier delivery, never recipient open time.
  const finishedAt = Date.now();
  const elapsedMs = Math.max(0, Math.round(finishedAt - input.startedAt));

  await recordShareIntent({
    startedAt: input.startedAt,
    finishedAt,
    channel: dominantChannel(outcomes),
    recipientCount: outcomes.length,
  });

  return {
    outcomes,
    shared: {
      app: countStatus(outcomes, 'app', 'shared'),
      os_share_sheet: countStatus(outcomes, 'os_share_sheet', 'shared'),
    },
    failed: {
      app: countStatus(outcomes, 'app', 'failed'),
      os_share_sheet: countStatus(outcomes, 'os_share_sheet', 'failed'),
    },
    elapsedMs,
  };
}

/**
 * The channel the share is reported under.
 *
 * A fan-out that mixed both channels is reported as `app` when at least one
 * recipient went down the in-app path — the channel label on the metric is
 * the **first** thing the share did, not a claim about the others.
 */
function dominantChannel(outcomes: RecipientOutcome[]): ShareChannel {
  return outcomes.some((outcome) => outcome.channel === 'app') ? 'app' : 'os_share_sheet';
}

/** Counts the outcomes with a given channel and status. */
function countStatus(
  outcomes: RecipientOutcome[],
  channel: 'app' | 'os_share_sheet',
  status: 'shared' | 'failed',
): number {
  return outcomes.filter(
    (outcome) => outcome.channel === channel && outcome.status === status,
  ).length;
}

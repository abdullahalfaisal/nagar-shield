import type { EmergencyContact } from '@nagar-shield/shared'

/**
 * The Location Sharing checkboxes, derived from who will actually receive the
 * share.
 *
 * With "share with all primaries" on, the primaries receive the share unless
 * the user has unticked one, so they must *show* as ticked. Reading only the
 * explicit selection left every box empty on open and made the first tap look
 * like it did nothing.
 */
export type Selection = Record<string, boolean>

/** Whether this contact's box is ticked, that is, whether they will receive the share. */
export function isRecipientChecked(
  contact: Pick<EmergencyContact, 'id' | 'isPrimary'>,
  shareWithAll: boolean,
  selected: Selection,
): boolean {
  return shareWithAll
    ? contact.isPrimary && selected[contact.id] !== false
    : Boolean(selected[contact.id])
}

/**
 * The state after a tap on one contact's box.
 *
 * A non-primary cannot be added to a primaries-only share, so ticking one turns
 * the toggle off and carries the current recipients over; the tap then adds the
 * person instead of silently doing nothing.
 */
export function toggleRecipient(
  contact: Pick<EmergencyContact, 'id' | 'isPrimary'>,
  contacts: Array<Pick<EmergencyContact, 'id' | 'isPrimary'>>,
  shareWithAll: boolean,
  selected: Selection,
): { shareWithAll: boolean; selected: Selection } {
  const checked = isRecipientChecked(contact, shareWithAll, selected)

  if (shareWithAll && !contact.isPrimary) {
    return {
      shareWithAll: false,
      selected: { ...explicitSelection(contacts, true, selected), [contact.id]: true },
    }
  }

  return { shareWithAll, selected: { ...selected, [contact.id]: !checked } }
}

/**
 * The selection to start from when the toggle changes: turning it off keeps
 * the current recipients ticked; turning it on starts again from all primaries.
 */
export function selectionForToggle(
  contacts: Array<Pick<EmergencyContact, 'id' | 'isPrimary'>>,
  turnOn: boolean,
  shareWithAll: boolean,
  selected: Selection,
): Selection {
  return turnOn ? {} : explicitSelection(contacts, shareWithAll, selected)
}

function explicitSelection(
  contacts: Array<Pick<EmergencyContact, 'id' | 'isPrimary'>>,
  shareWithAll: boolean,
  selected: Selection,
): Selection {
  const next: Selection = {}
  for (const contact of contacts) {
    if (isRecipientChecked(contact, shareWithAll, selected)) next[contact.id] = true
  }
  return next
}

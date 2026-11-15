import { isRecipientChecked, selectionForToggle, toggleRecipient } from './recipientSelection'

const contacts = [
  { id: 'a', isPrimary: true },
  { id: 'b', isPrimary: true },
  { id: 'c', isPrimary: false },
]

describe('recipientSelection', () => {
  it('ticks the primaries when share-with-all is on and nothing was touched', () => {
    expect(contacts.map((c) => isRecipientChecked(c, true, {}))).toEqual([true, true, false])
  })

  it('shows an unticked primary as unchecked', () => {
    expect(isRecipientChecked(contacts[0]!, true, { a: false })).toBe(false)
  })

  it('reads only the explicit selection when share-with-all is off', () => {
    expect(contacts.map((c) => isRecipientChecked(c, false, { c: true }))).toEqual([
      false,
      false,
      true,
    ])
  })

  it('the first tap on a ticked primary unticks it', () => {
    const next = toggleRecipient(contacts[0]!, contacts, true, {})
    expect(next).toEqual({ shareWithAll: true, selected: { a: false } })
    expect(isRecipientChecked(contacts[0]!, next.shareWithAll, next.selected)).toBe(false)
  })

  it('ticking a non-primary turns the toggle off and keeps the primaries', () => {
    const next = toggleRecipient(contacts[2]!, contacts, true, { b: false })
    expect(next.shareWithAll).toBe(false)
    expect(next.selected).toEqual({ a: true, c: true })
  })

  it('turning the toggle off keeps recipients, turning it on resets', () => {
    expect(selectionForToggle(contacts, false, true, { a: false })).toEqual({ b: true })
    expect(selectionForToggle(contacts, true, false, { c: true })).toEqual({})
  })
})

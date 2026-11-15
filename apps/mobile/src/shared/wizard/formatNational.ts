/**
 * Formats `+8801712345678` as `01712-345678` — the prototype's slot format.
 *
 * The national number has ten digits after `880` (`1712345678`); the local
 * form puts a `0` in front and splits after the operator code, so the first
 * block is `0` plus the **first four** digits. A number that is not ten
 * digits long is returned as it came in rather than guessed at.
 */
export function formatNational(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^880/, '')
  if (digits.length !== 10) return phone
  return `0${digits.slice(0, 4)}-${digits.slice(4)}`
}

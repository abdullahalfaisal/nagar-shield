import { bn } from './bn';
import { en } from './en';

/**
 * The thana-line fallback banner copy is a **contract**.
 *
 * Story `003-help-seek / 006-thana-line-fallback`:
 *
 *   > "**Exact banner copy is a contract.** English: `"Couldn't find a thana
 *   > near you — calling 999 instead."` Bangla: `১০ কিমি-র মধ্যে কোনো থানা না
 *   > পেলে ৯৯৯-এ রাউট করা হবে।`"
 *
 * The banner is what tells a citizen *why* `999` is the number on their
 * screen. A reworded banner is not a cosmetic change — it is a change to what
 * the app tells a frightened person about where their call is going. So the
 * copy is pinned here, character for character.
 *
 * The Bangla sentence is the mandated equivalent, and it renders as the
 * banner's **body** — the sentence that says what happens. The title is the
 * short headline above it. Together the surface says the mandated sentence.
 */
describe('the thana-line fallback banner', () => {
  it('shows the mandated English sentence', () => {
    expect(en.help.thanaFallbackTitle).toBe(
      "Couldn't find a thana near you — calling 999 instead.",
    );
  });

  it('shows the mandated Bangla sentence', () => {
    expect(bn.help.thanaFallback).toBe('১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।');
  });

  it('names the 999 target in both languages', () => {
    // The banner explains the fallback, so it has to name the number the
    // dialer is about to receive.
    expect(en.help.thanaFallbackTitle).toContain('999');
    expect(bn.help.thanaFallback).toContain('৯৯৯');
  });

  it('offers the number for manual dialling', () => {
    // FR-PERMS-2: the degraded surface shows the manual-dial guidance too.
    expect(en.help.thanaManual).toContain('999');
    expect(bn.help.thanaManual).toContain('৯৯৯');
  });
});

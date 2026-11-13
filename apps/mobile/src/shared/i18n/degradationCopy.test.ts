import { bn } from './bn';
import { en } from './en';

/**
 * The degraded-mode copy audit.
 *
 * Story `003-help-seek / 004-graceful-degradation`:
 *
 *   > "Given any degraded state, When the user inspects the screen, Then no
 *   > copy claims that Nagar Shield dispatched, routed, notified, or
 *   > contacted anyone"
 *
 *   > "Given the device has no signal, When the user completes a help action,
 *   > Then the app shows the manual-dial guidance and **never** states that a
 *   > call was placed, connected, or delivered"
 *
 * The app hands a number to the OS dialler and the user presses call. It
 * never learns what happened next, and C-1 forbids asking. So any copy that
 * claims a call was placed, connected, or delivered is a **false claim** — the
 * most damaging kind of bug in a safety app, because the citizen believes
 * help is coming when it may not be.
 *
 * This test walks the **actual bundles**, not a list of strings typed here,
 * so a new copy that claims a dispatch fails the build.
 */

/**
 * The phrases the story forbids, in the forms a UI might use.
 *
 * The distinction that matters: a copy may describe **which number will be
 * used** — story `006-thana-line-fallback` mandates the exact banner
 * "Couldn't find a thana near you — calling 999 instead." — because that is a
 * product fact about the routing target. What it must never do is claim that
 * a call **happened**: placed, connected, delivered. And it must never claim
 * that a human or an authority was **reached**.
 */
const FORBIDDEN_CLAIMS: RegExp[] = [
  /call (was |has been |is )?(placed|connected|delivered)/i,
  /(successfully )?(placed|connected|delivered) (the |your )?call/i,
  /your call (was |has been )?(placed|connected|delivered|failed)/i,
  /we (have )?(called|dialled|dialed|contacted|notified|dispatched|routed)/i,
  /help (is |has been )?(on the way|coming|dispatched|sent)/i,
  /(police|ambulance|fire|medical|authority|authorities) (have |has |was |were )?(been )?(notified|contacted|dispatched|alerted|informed)/i,
  /no (signal|service).{0,40}(call failed|could not connect)/i,
];

/** The keys the degraded-mode surfaces use. */
const DEGRADATION_KEYS = [
  'manualDialTitle',
  'manualDialBody',
  'manualDialLabel',
  'batterySaverWarning',
  'offlineNotice',
  'detectionUnavailable',
] as const;

/** Every string in a bundle, flattened. */
function allStrings(value: unknown, path: string[] = []): Array<{ path: string; text: string }> {
  if (typeof value === 'string') return [{ path: path.join('.'), text: value }];
  if (typeof value !== 'object' || value === null) return [];

  return Object.entries(value).flatMap(([key, nested]) =>
    allStrings(nested, [...path, key]),
  );
}

describe.each([
  ['en', en],
  ['bn', bn],
])('the %s bundle', (_language, bundle) => {
  it('claims no call, dispatch, or notification', () => {
    const offenders = allStrings(bundle).filter((entry) =>
      FORBIDDEN_CLAIMS.some((pattern) => pattern.test(entry.text)),
    );

    expect(offenders).toEqual([]);
  });

  it('carries every degraded-mode string', () => {
    const degradation = (bundle as Record<string, Record<string, string> | undefined>)
      .degradation;

    expect(degradation).toBeDefined();
    for (const key of DEGRADATION_KEYS) {
      expect(typeof degradation?.[key]).toBe('string');
      expect(degradation?.[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('the degraded-mode copy', () => {
  it('says the dialler may be suppressed, never that it was', () => {
    // The app cannot know what the OEM dialler did after the intent fired.
    // "May be suppressed" is true; "was suppressed" would be a guess.
    expect(en.degradation.batterySaverWarning).toMatch(/may/i);
    expect(en.degradation.batterySaverWarning).not.toMatch(/\bwas suppressed\b/i);
  });

  it('says the dialler may be suppressed in Bangla too', () => {
    // "পারে" is the permissive form — "may". The Bangla copy carries the
    // same claim strength as the English, not a stronger one.
    expect(bn.degradation.batterySaverWarning).toContain('পারে');
  });

  it('never says a call failed', () => {
    // The offline notice says what to do, not what went wrong. "The call
    // failed" would be a claim about a call the app never made.
    expect(en.degradation.offlineNotice).not.toMatch(/fail/i);
    expect(bn.degradation.offlineNotice).not.toMatch(/ব্যর্থ/i);
  });

  it('ships the static copy for the unavailable detection', () => {
    // FR-PERMS-3: the absence of the detection must be visible, not a
    // silent no-op.
    expect(en.degradation.detectionUnavailable.length).toBeGreaterThan(0);
    expect(bn.degradation.detectionUnavailable.length).toBeGreaterThan(0);
  });
});

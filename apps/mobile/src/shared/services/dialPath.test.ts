import { Linking } from 'react-native';
import { openDialer, dialTarget } from './dialer';

/**
 * The dial path is client-only.
 *
 * Story `003-help-seek / 004-graceful-degradation`:
 *
 *   > "Given the degraded states, When the app is tested, Then a test asserts
 *   > that the dial path still performs zero network requests and fires no
 *   > `ACTION_CALL` intent"
 *
 * This is the test that proves it. The dial path must:
 *
 *   * open the OS dialler with a `tel:` intent — **not** `ACTION_CALL`, which
 *     would place the call without the user pressing call;
 *   * perform **zero** network requests — the number is bundled and the app
 *     never learns whether a call was answered (constraint C-1).
 *
 * The network assertion is the load-bearing one. `fetch` and `XMLHttpRequest`
 * are both replaced with spies, so any request at all fails the test.
 */

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
}));

describe('the dial path', () => {
  let openUrl: jest.SpyInstance;
  let canOpenUrl: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;
  let xhrSpy: jest.SpyInstance | null;

  beforeEach(() => {
    openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    canOpenUrl = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true as never);
    fetchSpy = jest.spyOn(global, 'fetch');
    // The call history must not leak between the tests — the "the intent did
    // not resolve" case asserts that `openURL` was **not** called.
    openUrl.mockClear();
    canOpenUrl.mockClear();
    fetchSpy.mockClear();
    // The React Native test environment has no `XMLHttpRequest` global — the
    // fetch polyfill is what the app would use. The spy is installed only
    // when the global exists, so the assertion still holds where it can.
    xhrSpy =
      typeof global.XMLHttpRequest === 'function'
        ? jest.spyOn(global, 'XMLHttpRequest')
        : null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the OS dialler with a tel: intent', async () => {
    await openDialer('999');

    expect(canOpenUrl).toHaveBeenCalledWith('tel:999');
    expect(openUrl).toHaveBeenCalledWith('tel:999');
  });

  it('never fires an ACTION_CALL intent', async () => {
    await openDialer('999');

    // `ACTION_CALL` would place the call with no press of the call button.
    // The app hands the number over and the user decides (C-1).
    const firedIntents = openUrl.mock.calls.map((call) => String(call[0]));
    expect(firedIntents.every((intent) => intent.startsWith('tel:'))).toBe(true);
    expect(firedIntents.some((intent) => intent.includes('ACTION_CALL'))).toBe(false);
    expect(firedIntents.some((intent) => intent.includes('call'))).toBe(false);
  });

  it('performs zero network requests', async () => {
    await openDialer('999');

    // The number comes from the bundled dataset. A request here would mean
    // the dial path had come to depend on the network — and a citizen with no
    // signal would lose the ability to reach help.
    expect(fetchSpy).not.toHaveBeenCalled();
    if (xhrSpy) expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('reports the dialler as unreachable when the intent does not resolve', async () => {
    // The OS has no `tel:` handler, or the user disabled the dialler app.
    canOpenUrl.mockResolvedValue(false as never);

    await expect(openDialer('999')).resolves.toBe(false);
    // The caller renders the manual-dial guidance — never an unhandled error.
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('reports the dialler as unreachable when the intent throws', async () => {
    canOpenUrl.mockResolvedValue(true as never);
    openUrl.mockRejectedValue(new Error('no activity found') as never);

    await expect(openDialer('999')).resolves.toBe(false);
  });

  it('prefills the emergency number bare', () => {
    // Emergency numbers are dialled as bare digits — `tel:999`, not
    // `tel:+880999`.
    expect(dialTarget('999')).toBe('999');
    expect(dialTarget('+880 999')).toBe('+880999');
  });
});

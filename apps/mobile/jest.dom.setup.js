/**
 * The globals jsdom does not provide.
 *
 * A test that opts into the jsdom environment with the
 * `@jest-environment jsdom` docblock gets a browser-shaped global — which has
 * a `document`, and does **not** have `TextEncoder` or `crypto.subtle`. The
 * capture path uses both (`packages/shared/src/storage/index.ts` derives the
 * author's storage token with `crypto.subtle.digest` over a
 * `TextEncoder`-encoded id), so a jsdom test that touches it fails with
 * *"TextEncoder is not defined"*.
 *
 * Node ships both. They are copied in here — **not** polyfilled — so a jsdom
 * test has the same primitives the node-environment tests have, and no test
 * can accidentally depend on one environment's behaviour.
 *
 * The copy is guarded: if the environment already provides one, the existing
 * one wins. A polyfill that silently replaced a real implementation would let
 * a test pass against a stub.
 */

const { TextDecoder, TextEncoder } = require('node:util');
const { webcrypto } = require('node:crypto');

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

if (typeof global.crypto === 'undefined') {
  global.crypto = webcrypto;
} else if (typeof global.crypto.subtle === 'undefined') {
  // jsdom ships a `crypto` object, but it has no `subtle`.
  Object.defineProperty(global.crypto, 'subtle', {
    value: webcrypto.subtle,
    configurable: true,
    writable: true,
  });
}

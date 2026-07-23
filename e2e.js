/* LabToolkit end-to-end encryption core.
 *
 * Everything a user saves is encrypted here, in the browser, before it is sent anywhere.
 * The server only ever stores ciphertext, so the operator (and Supabase) cannot read it.
 *
 * Envelope scheme:
 *   - A random 256-bit *data key* (DEK) encrypts the user's recipes/protocols/files.
 *   - The DEK is itself wrapped by a *key-encryption key* (KEK) derived from the user's
 *     passphrase via PBKDF2, and separately by a random *recovery key*.
 *   - Only the two wrapped copies of the DEK are stored server-side. Changing the
 *     passphrase re-wraps the DEK (cheap) instead of re-encrypting all data.
 *
 * Runs under WebCrypto in the browser and node:crypto.webcrypto under Node (for tests).
 */
(function (factory) {
  const cryptoObj = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
    ? globalThis.crypto
    : require('crypto').webcrypto;
  const api = factory(cryptoObj);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LabToolkitCrypto = api;
})(function (cryptoObj) {
  const subtle = cryptoObj.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const PBKDF2_ITERATIONS = 210000;   // OWASP-recommended floor for PBKDF2-SHA256

  const toB64 = (bytes) => (typeof Buffer !== 'undefined')
    ? Buffer.from(bytes).toString('base64')
    : btoa(String.fromCharCode(...bytes));
  const fromB64 = (str) => (typeof Buffer !== 'undefined')
    ? new Uint8Array(Buffer.from(str, 'base64'))
    : Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

  const randomBytes = (n) => cryptoObj.getRandomValues(new Uint8Array(n));
  const randomSalt = () => toB64(randomBytes(16));

  /* ---- low-level AES-GCM over raw bytes ---- */

  async function encryptBytes(key, bytes) {
    const iv = randomBytes(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { v: 1, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
  }
  async function decryptBytes(key, blob) {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
    return new Uint8Array(pt);
  }

  /* ---- JSON helpers (recipes / protocols) ---- */

  const encryptJSON = (key, obj) => encryptBytes(key, enc.encode(JSON.stringify(obj)));
  const decryptJSON = async (key, blob) => JSON.parse(dec.decode(await decryptBytes(key, blob)));

  /* ---- key derivation and the envelope ---- */

  async function deriveKEK(passphrase, saltB64) {
    const base = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: fromB64(saltB64), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']);
  }

  // A random data key. Extractable so it can be wrapped, but it only ever lives in memory.
  const generateDataKey = () => subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

  async function wrapDataKey(dataKey, wrappingKey) {
    const raw = new Uint8Array(await subtle.exportKey('raw', dataKey));
    return encryptBytes(wrappingKey, raw);
  }
  async function unwrapDataKey(blob, wrappingKey) {
    const raw = await decryptBytes(wrappingKey, blob);
    return subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  /* ---- human-readable recovery key (Crockford base32, grouped) ---- */

  function generateRecoveryKey() {
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const bytes = randomBytes(20);
    let bits = 0, value = 0, out = '';
    for (const b of bytes) {
      value = (value << 8) | b; bits += 8;
      while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    return out.match(/.{1,4}/g).join('-');   // e.g. W72K-3F9Q-...
  }
  const normalizeRecoveryKey = (s) => String(s).toUpperCase().replace(/[^0-9A-Z]/g, '');

  /* ---- one-call setup for a brand-new account ---- */

  async function createEnvelope(passphrase) {
    const dataKey = await generateDataKey();
    const recoveryKey = generateRecoveryKey();

    const passSalt = randomSalt();
    const recSalt = randomSalt();
    const passKEK = await deriveKEK(passphrase, passSalt);
    const recKEK = await deriveKEK(normalizeRecoveryKey(recoveryKey), recSalt);

    return {
      dataKey,                       // keep in memory for this session
      recoveryKey,                   // show once, tell the user to save it
      stored: {                      // safe to persist server-side
        v: 1,
        passSalt, recSalt,
        wrappedByPass: await wrapDataKey(dataKey, passKEK),
        wrappedByRecovery: await wrapDataKey(dataKey, recKEK),
      },
    };
  }

  async function unlockWithPassphrase(passphrase, stored) {
    const kek = await deriveKEK(passphrase, stored.passSalt);
    return unwrapDataKey(stored.wrappedByPass, kek);
  }
  async function unlockWithRecoveryKey(recoveryKey, stored) {
    const kek = await deriveKEK(normalizeRecoveryKey(recoveryKey), stored.recSalt);
    return unwrapDataKey(stored.wrappedByRecovery, kek);
  }

  return {
    encryptJSON, decryptJSON, encryptBytes, decryptBytes,
    deriveKEK, generateDataKey, wrapDataKey, unwrapDataKey,
    generateRecoveryKey, normalizeRecoveryKey,
    createEnvelope, unlockWithPassphrase, unlockWithRecoveryKey,
    _internal: { toB64, fromB64, randomSalt, PBKDF2_ITERATIONS },
  };
});

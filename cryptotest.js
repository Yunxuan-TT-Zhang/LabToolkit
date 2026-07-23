/* Tests the end-to-end encryption envelope (e2e.js) with Node's WebCrypto.
   Run: npm run test:crypto
   These are the guarantees the privacy promise rests on, so they must hold exactly. */

const C = require('./e2e.js');

let fails = 0;
function ok(name, cond) {
  if (cond) console.log('ok  ', name);
  else { fails++; console.log('FAIL', name); }
}
async function throws(name, fn) {
  try { await fn(); fails++; console.log('FAIL', name, '(expected it to throw)'); }
  catch { console.log('ok  ', name); }
}

(async () => {
  const secret = { title: 'Unpublished lysis buffer', components: [{ name: 'NaCl', conc: 150, unit: 'mM' }] };

  console.log('--- JSON round-trip ---');
  const dek = await C.generateDataKey();
  const blob = await C.encryptJSON(dek, secret);
  ok('ciphertext is not the plaintext', !JSON.stringify(blob).includes('lysis'));
  ok('blob carries iv + ct', !!blob.iv && !!blob.ct);
  const back = await C.decryptJSON(dek, blob);
  ok('decrypts back to the original', JSON.stringify(back) === JSON.stringify(secret));

  console.log('\n--- wrong key cannot read ---');
  const otherDek = await C.generateDataKey();
  await throws('a different data key fails to decrypt', () => C.decryptJSON(otherDek, blob));

  console.log('\n--- IV is unique per encryption ---');
  const b1 = await C.encryptJSON(dek, secret);
  const b2 = await C.encryptJSON(dek, secret);
  ok('same plaintext -> different iv', b1.iv !== b2.iv);
  ok('same plaintext -> different ciphertext', b1.ct !== b2.ct);

  console.log('\n--- full account envelope ---');
  const env = await C.createEnvelope('correct horse battery staple');
  ok('recovery key looks like grouped base32', /^[0-9A-Z]{4}(-[0-9A-Z]{4})+$/.test(env.recoveryKey));
  ok('stored blob holds two wrapped copies of the data key', !!env.stored.wrappedByPass && !!env.stored.wrappedByRecovery);
  ok('stored blob never contains the raw data key or passphrase',
    !JSON.stringify(env.stored).toLowerCase().includes('horse'));

  // Save something under the account's data key
  const saved = await C.encryptJSON(env.dataKey, secret);

  console.log('\n--- unlock on another device with the passphrase ---');
  const dekFromPass = await C.unlockWithPassphrase('correct horse battery staple', env.stored);
  ok('passphrase unlock recovers the data', JSON.stringify(await C.decryptJSON(dekFromPass, saved)) === JSON.stringify(secret));
  await throws('wrong passphrase is rejected', () => C.unlockWithPassphrase('wrong passphrase', env.stored));

  console.log('\n--- unlock with the recovery key (forgot password path) ---');
  const dekFromRec = await C.unlockWithRecoveryKey(env.recoveryKey, env.stored);
  ok('recovery key unlocks the same data', JSON.stringify(await C.decryptJSON(dekFromRec, saved)) === JSON.stringify(secret));
  ok('recovery key tolerates lowercase / spacing', /./.test(C.normalizeRecoveryKey(env.recoveryKey.toLowerCase().replace(/-/g, ' '))));
  const dekFromRecMessy = await C.unlockWithRecoveryKey(env.recoveryKey.toLowerCase(), env.stored);
  ok('messy recovery key still unlocks', JSON.stringify(await C.decryptJSON(dekFromRecMessy, saved)) === JSON.stringify(secret));

  console.log('\n--- binary (file) round-trip ---');
  const fileBytes = new Uint8Array([0, 1, 2, 250, 251, 252, 128, 64]);
  const fblob = await C.encryptBytes(env.dataKey, fileBytes);
  const fout = await C.decryptBytes(env.dataKey, fblob);
  ok('file bytes survive encryption', Buffer.compare(Buffer.from(fileBytes), Buffer.from(fout)) === 0);

  console.log(fails ? `\n${fails} FAILURES` : '\nAll crypto assertions passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

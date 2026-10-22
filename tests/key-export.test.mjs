import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';

globalThis.window = { crypto: webcrypto, atob, btoa };
const { encryptMegolmKeyFile, decryptMegolmKeyFile } = await import(
  '../src/util/cryptE2ERoomKeys.js'
);
const plaintext = JSON.stringify([{ room_id: '!room:test', session_key: 'Ключ 🔑' }]);

test('Megolm key export round-trips UTF-8 and writes unsigned big-endian KDF rounds', async () => {
  const file = await encryptMegolmKeyFile(plaintext, 'пароль', { kdf_rounds: 1234 });
  assert.equal(await decryptMegolmKeyFile(file, 'пароль'), plaintext);
  const encoded = new TextDecoder().decode(file).split('\n').slice(1, -1).join('');
  const bytes = Buffer.from(encoded, 'base64');
  assert.equal(bytes[0], 1);
  assert.equal(bytes.readUInt32BE(33), 1234);
  assert.ok(bytes[25] < 128, 'The Android-compatible IV counter bit stays clear');
});
test('wrong key-export password fails authentication', async () => {
  const file = await encryptMegolmKeyFile(plaintext, 'right', { kdf_rounds: 10 });
  await assert.rejects(decryptMegolmKeyFile(file, 'wrong'), /hmac mismatch/);
});
test('tampering with exported keys fails authentication', async () => {
  const file = await encryptMegolmKeyFile(plaintext, 'right', { kdf_rounds: 10 });
  const lines = new TextDecoder().decode(file).trim().split('\n');
  const bytes = Buffer.from(lines.slice(1, -1).join(''), 'base64');
  bytes[38] = (bytes[38] + 1) % 256;
  const damaged = new TextEncoder().encode(
    [lines[0], bytes.toString('base64'), lines.at(-1)].join('\n')
  );
  await assert.rejects(decryptMegolmKeyFile(damaged, 'right'), /hmac mismatch/);
});
test('malformed key exports fail clearly', async () => {
  for (const text of [
    '',
    'wrong header\n',
    '-----BEGIN MEGOLM SESSION DATA-----\nAQ==\n-----END MEGOLM SESSION DATA-----',
  ]) {
    await assert.rejects(decryptMegolmKeyFile(new TextEncoder().encode(text), 'right'));
  }
});

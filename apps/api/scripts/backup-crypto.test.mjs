import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptBackupFile, decryptBackupFile } from './backup-crypto.mjs';

const passphrase = 'test-only-backup-passphrase-2026';

async function withTempDirectory(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'adverse-backup-crypto-'));
  try { await fn(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('backup encryption round-trips a multi-chunk archive using authenticated AES-256-GCM', async () => {
  await withTempDirectory(async directory => {
    const source = join(directory, 'source.archive.gz');
    const encrypted = join(directory, 'backup.archive.gz.enc');
    const restored = join(directory, 'restored.archive.gz');
    const original = Buffer.alloc(2 * 1024 * 1024 + 137);
    for (let index = 0; index < original.length; index += 1) original[index] = index % 251;
    await writeFile(source, original);

    const encryptedResult = await encryptBackupFile(source, encrypted, passphrase);
    assert.equal(encryptedResult.algorithm, 'AES-256-GCM');
    assert.equal(encryptedResult.authenticated, true);
    assert.ok((await readFile(encrypted)).length > original.length);

    const restoredResult = await decryptBackupFile(encrypted, restored, passphrase);
    assert.equal(restoredResult.authenticated, true);
    assert.deepEqual(await readFile(restored), original);
  });
});

test('backup decryption rejects an incorrect passphrase and leaves no plaintext output', async () => {
  await withTempDirectory(async directory => {
    const source = join(directory, 'source.archive.gz');
    const encrypted = join(directory, 'backup.archive.gz.enc');
    const restored = join(directory, 'restored.archive.gz');
    await writeFile(source, Buffer.from('database backup fixture'));
    await encryptBackupFile(source, encrypted, passphrase);

    await assert.rejects(
      decryptBackupFile(encrypted, restored, 'incorrect-backup-passphrase-2026'),
      /authentication failed/i,
    );
    await assert.rejects(access(restored), { code: 'ENOENT' });
  });
});

test('backup decryption rejects modified ciphertext and leaves no plaintext output', async () => {
  await withTempDirectory(async directory => {
    const source = join(directory, 'source.archive.gz');
    const encrypted = join(directory, 'backup.archive.gz.enc');
    const restored = join(directory, 'restored.archive.gz');
    await writeFile(source, Buffer.from('integrity matters for recovery archives'));
    await encryptBackupFile(source, encrypted, passphrase);

    const bytes = await readFile(encrypted);
    bytes[bytes.length - 1] ^= 0x01;
    await writeFile(encrypted, bytes);

    await assert.rejects(decryptBackupFile(encrypted, restored, passphrase), /authentication failed/i);
    await assert.rejects(access(restored), { code: 'ENOENT' });
  });
});

test('backup encryption refuses to overwrite an existing destination', async () => {
  await withTempDirectory(async directory => {
    const source = join(directory, 'source.archive.gz');
    const encrypted = join(directory, 'backup.archive.gz.enc');
    await writeFile(source, Buffer.from('fixture'));
    await writeFile(encrypted, 'keep this file');
    await assert.rejects(encryptBackupFile(source, encrypted, passphrase), /refusing to overwrite/i);
    assert.equal(await readFile(encrypted, 'utf8'), 'keep this file');
  });
});

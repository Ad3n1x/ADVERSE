import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const scrypt = promisify(scryptCallback);
const MAGIC = Buffer.from('ADVBKP01', 'ascii');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AUTHENTICATED_HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;
const HEADER_BYTES = AUTHENTICATED_HEADER_BYTES + TAG_BYTES;

function requiredPassphrase(value = process.env.BACKUP_ENCRYPTION_PASSPHRASE) {
  if (typeof value !== 'string' || value.length < 20) {
    throw new Error('BACKUP_ENCRYPTION_PASSPHRASE must contain at least 20 characters.');
  }
  return value;
}

async function assertInputAndOutput(inputPath, outputPath) {
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  if (input === output) throw new Error('Input and output paths must be different.');
  const info = await stat(input);
  if (!info.isFile()) throw new Error('Input must be a regular file.');
  await mkdir(dirname(output), { recursive: true });
  try {
    await access(output);
    throw new Error('Output already exists; refusing to overwrite it.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return { input, output };
}

function temporaryPath(output, suffix) {
  return resolve(dirname(output), `.${basename(output)}.${process.pid}.${randomBytes(8).toString('hex')}.${suffix}`);
}

async function removeIfPresent(path) {
  if (!path) return;
  await unlink(path).catch(error => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

/**
 * Stream an archive through authenticated AES-256-GCM.
 * The header (format, salt, nonce) is authenticated as additional data.
 * Plaintext is never published to the destination until authentication passes.
 */
export async function encryptBackupFile(inputPath, outputPath, passphrase) {
  const secret = requiredPassphrase(passphrase);
  const { input, output } = await assertInputAndOutput(inputPath, outputPath);
  const encryptedTemp = temporaryPath(output, 'ciphertext');
  const finalTemp = temporaryPath(output, 'partial');
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const aad = Buffer.concat([MAGIC, salt, iv]);
  const key = await scrypt(secret, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad);
    await pipeline(
      createReadStream(input),
      cipher,
      createWriteStream(encryptedTemp, { flags: 'wx', mode: 0o600 }),
    );

    const header = Buffer.concat([aad, cipher.getAuthTag()]);
    const outputStream = createWriteStream(finalTemp, { flags: 'wx', mode: 0o600 });
    if (!outputStream.write(header)) await once(outputStream, 'drain');
    await pipeline(createReadStream(encryptedTemp), outputStream);
    await rename(finalTemp, output);
    return { output, algorithm: 'AES-256-GCM', authenticated: true };
  } finally {
    key.fill(0);
    await removeIfPresent(encryptedTemp);
    await removeIfPresent(finalTemp);
  }
}

export async function decryptBackupFile(inputPath, outputPath, passphrase) {
  const secret = requiredPassphrase(passphrase);
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  if (input === output) throw new Error('Input and output paths must be different.');
  const info = await stat(input);
  if (!info.isFile() || info.size <= HEADER_BYTES) throw new Error('Encrypted backup is missing or incomplete.');
  await mkdir(dirname(output), { recursive: true });
  try {
    await access(output);
    throw new Error('Output already exists; refusing to overwrite it.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const handle = await open(input, 'r');
  const header = Buffer.alloc(HEADER_BYTES);
  let bytesRead;
  try {
    ({ bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0));
  } finally {
    await handle.close();
  }
  if (bytesRead !== HEADER_BYTES || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Encrypted backup format is invalid or unsupported.');
  }

  const saltStart = MAGIC.length;
  const ivStart = saltStart + SALT_BYTES;
  const tagStart = ivStart + IV_BYTES;
  const salt = header.subarray(saltStart, ivStart);
  const iv = header.subarray(ivStart, tagStart);
  const tag = header.subarray(tagStart, HEADER_BYTES);
  const aad = header.subarray(0, AUTHENTICATED_HEADER_BYTES);
  const key = await scrypt(secret, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const finalTemp = temporaryPath(output, 'partial');

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(input, { start: HEADER_BYTES }),
      decipher,
      createWriteStream(finalTemp, { flags: 'wx', mode: 0o600 }),
    );
    await rename(finalTemp, output);
    return { output, algorithm: 'AES-256-GCM', authenticated: true };
  } catch {
    throw new Error('Backup authentication failed: the passphrase is incorrect or the archive was altered.');
  } finally {
    key.fill(0);
    await removeIfPresent(finalTemp);
  }
}

async function main(args) {
  const [operation, inputPath, outputPath, ...extra] = args;
  if (!['encrypt', 'decrypt'].includes(operation) || !inputPath || !outputPath || extra.length) {
    throw new Error('Usage: node backup-crypto.mjs <encrypt|decrypt> <input-file> <output-file>');
  }
  const result = operation === 'encrypt'
    ? await encryptBackupFile(inputPath, outputPath)
    : await decryptBackupFile(inputPath, outputPath);
  process.stdout.write(`${operation === 'encrypt' ? 'Encrypted' : 'Authenticated decryption'} backup created: ${result.output} (${result.algorithm})\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`Backup operation failed: ${String(error?.message || 'unknown error')}\n`);
    process.exitCode = 1;
  });
}

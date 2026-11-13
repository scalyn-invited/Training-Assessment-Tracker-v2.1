import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { privatePath } from '../../database/src/config.js';
import { requireCondition } from './errors.js';
const scrypt = promisify(scryptCallback);
export const digest = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
export function validatePassword(password: string) {
  requireCondition(
    password.length >= 15 && Buffer.byteLength(password, 'utf8') <= 72,
    422,
    'password_length',
    'Use at least 15 characters and no more than 72 UTF-8 bytes.',
  );
}
export async function passwordHash(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return 'scrypt:' + salt + ':' + key.toString('hex');
}
export async function passwordMatches(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, expected] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !expected || expected.length !== 128) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export async function encryptionKey(): Promise<Buffer> {
  if (process.env.APP_ENCRYPTION_KEY) {
    if (!/^[a-fA-F0-9]{64}$/.test(process.env.APP_ENCRYPTION_KEY))
      throw new Error('APP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
    const key = Buffer.from(process.env.APP_ENCRYPTION_KEY, 'hex');
    if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes encoded as hex');
    return key;
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('APP_ENCRYPTION_KEY required in production');
  const directory = privatePath();
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'encryption.key');
  try {
    await writeFile(file, randomBytes(32), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const key = await readFile(file);
  if (key.length !== 32) throw new Error('Invalid local encryption key');
  return key;
}
export function encrypt(value: string, key: Buffer): string {
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    nonce.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    ciphertext.toString('hex'),
  ].join('.');
}
export function decrypt(value: string, key: Buffer): string {
  const [nonce, tag, ciphertext] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

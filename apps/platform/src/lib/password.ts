import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * Node's built-in scrypt, not bcrypt/argon2. It's an OWASP-endorsed
 * password-hashing KDF and needs no added dependency (bcrypt needs a
 * package; argon2 usually needs a native binding that's awkward in
 * serverless) — a real primitive, not a homemade one, without adding a
 * dependency to a project that otherwise stays deliberately dependency-light.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;

  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(keyHex, 'hex');

  // timingSafeEqual throws if lengths differ, rather than returning false —
  // guard that explicitly so a malformed stored hash can't crash the login
  // request instead of just failing it.
  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}

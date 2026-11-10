import { randomBytes } from 'node:crypto';

export function generateApiKey(): string {
  return `pk_${randomBytes(24).toString('hex')}`;
}
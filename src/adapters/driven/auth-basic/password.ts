import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 32;
const COST = 16384;

function derive(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LEN, { N: cost }, (e, key) => (e ? reject(e) : resolve(key))),
  );
}

/** `scrypt$<cost>$<salt hex>$<hash hex>`: salted, slow, self-describing. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return `scrypt$${COST}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !cost || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await derive(password, Buffer.from(salt, 'hex'), Number(cost));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

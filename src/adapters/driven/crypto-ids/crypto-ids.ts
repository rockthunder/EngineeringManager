import { randomBytes, randomUUID } from 'node:crypto';
import type { IdGenerator } from '../../../application/ports/ids';

export const cryptoIds: IdGenerator = {
  id: () => randomUUID(),
  token: () => randomBytes(24).toString('base64url'),
};

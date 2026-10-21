import type { AuthProvider, AuthUser } from '../../../application/ports/auth';
import { hashPassword, verifyPassword } from './password';

export interface UserRecord {
  readonly id: number;
  readonly username: string;
  readonly passwordHash: string;
}

export interface UserLookup {
  findByUsername(username: string): Promise<UserRecord | null>;
  upsert(username: string, passwordHash: string): Promise<void>;
}

/** Username + hashed password, behind the AuthProvider port. */
export class BasicAuthProvider implements AuthProvider {
  constructor(private readonly users: UserLookup) {}

  async authenticate(username: string, password: string): Promise<AuthUser | null> {
    const user = await this.users.findByUsername(username);
    // Always do a verification so a wrong username costs the same as a wrong password.
    const ok = await verifyPassword(password, user?.passwordHash ?? 'scrypt$16384$00$00');
    return user && ok ? { id: user.id, username: user.username, role: 'admin' } : null;
  }

  async changePassword(username: string, current: string, next: string): Promise<boolean> {
    if (!(await this.authenticate(username, current))) return false;
    await this.users.upsert(username, await hashPassword(next));
    return true;
  }
}

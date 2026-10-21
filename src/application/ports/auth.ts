import type { Instant } from '../../domain/time/day';

export interface AuthUser {
  readonly id: number;
  readonly username: string;
  readonly role: 'admin';
}

/** Checks credentials. Basic auth in v1; an Auth0/OIDC adapter can implement the same port later. */
export interface AuthProvider {
  authenticate(username: string, password: string): Promise<AuthUser | null>;
  /** True if the current password was right and the new one was stored. */
  changePassword(username: string, current: string, next: string): Promise<boolean>;
}

export interface SessionStore {
  /** Returns the opaque token to hand to the browser. */
  create(userId: number, expiresAt: Instant): Promise<string>;
  /** The user for a live token, or null if unknown or expired at `now`. */
  find(token: string, now: Instant): Promise<AuthUser | null>;
  delete(token: string): Promise<void>;
}

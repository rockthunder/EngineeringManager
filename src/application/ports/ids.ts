/** Randomness for identifiers and unguessable links, injected so use cases stay deterministic in tests. */
export interface IdGenerator {
  /** A new unique id. */
  id(): string;
  /** An unguessable URL-safe token. */
  token(): string;
}

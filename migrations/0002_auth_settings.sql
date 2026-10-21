-- Basic-auth users (hashed passwords), server-side sessions, and app settings.
CREATE TABLE users (
  id            serial PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin'))
);

-- Only a SHA-256 of the session token is stored; the token itself lives in the cookie.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

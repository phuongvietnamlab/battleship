-- WebAuthn/Passkey credential storage (Phase 8: AUTHM-09)
-- Each user can have multiple passkey credentials (multi-device support).
-- Credential ID is the base64url-encoded ID returned by the authenticator.

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,                          -- base64url credential ID from authenticator
  user_id INTEGER NOT NULL REFERENCES users(id),
  public_key BYTEA NOT NULL,                    -- COSE public key (from registration)
  counter BIGINT NOT NULL DEFAULT 0,            -- signature counter for replay protection
  transports TEXT[] DEFAULT '{}',               -- e.g. ['internal','hybrid','usb']
  device_name TEXT,                             -- optional friendly name (e.g. "iPhone", "Windows Hello")
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id
  ON webauthn_credentials(user_id);

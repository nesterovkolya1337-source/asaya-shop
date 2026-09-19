-- Independent of deferred PDP 031 and image pipeline 032.
ALTER TABLE staff_credentials ADD COLUMN name text NOT NULL DEFAULT '';
ALTER TABLE staff_credentials ADD COLUMN staff_role text NOT NULL DEFAULT 'administrator' CHECK(staff_role IN ('owner','administrator','manager'));
ALTER TABLE staff_credentials ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','disabled'));
ALTER TABLE staff_credentials ADD COLUMN temporary_expires_at timestamptz;
ALTER TABLE staff_credentials ADD COLUMN last_login_at timestamptz;
ALTER TABLE staff_credentials ADD COLUMN deleted_at timestamptz;
UPDATE staff_credentials SET staff_role='owner' WHERE lower(email)='asayacosmetics@yandex.ru';
CREATE UNIQUE INDEX staff_owner_unique ON staff_credentials(staff_role) WHERE staff_role='owner';
CREATE TABLE staff_activation_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES staff_credentials(user_id),
 stage text NOT NULL CHECK(stage IN ('password','totp')), expires_at timestamptz NOT NULL,
 totp_encrypted text, revoked_at timestamptz
);
CREATE TABLE staff_recovery_codes (
 user_id uuid NOT NULL REFERENCES staff_credentials(user_id), code_hash text NOT NULL,
 used_at timestamptz, PRIMARY KEY(user_id,code_hash)
);
